import { AIRCRAFT, ALTITUDES_FT, PERFORMANCE } from "./config.js?v=20261025-01";

export const TRACKER_VERSION = 1;
export const TRACKER_STORAGE_KEY = "velocityxl.virtualFlightTracker.v1";
const FACTORS = [1, 2, 4, 8];
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function phaseSections(result, phase) {
  const data = result[phase];
  if (!data || !finite(data.timeHr) || !finite(data.distanceNm) || !finite(data.fuelGal)) return [];
  if (Array.isArray(data.sections) && data.sections.length) return data.sections;
  if (data.timeHr <= 0 && data.distanceNm <= 0) return [];
  return [{ timeHr: data.timeHr, distanceNm: data.distanceNm, fuelGal: data.fuelGal,
    startAltitudeFt: phase === "cruise" ? result.altitudeFt : data.startAltitudeFt,
    endAltitudeFt: phase === "cruise" ? result.altitudeFt : data.endAltitudeFt }];
}

/** A compact, cumulative copy of the existing performance result. No new rates are invented. */
export function buildVirtualFlightProfile(plan, result, fuelOnboardGal) {
  const totalNm = Number(plan?.distanceNm);
  const startFuelGal = fuelOnboardGal - PERFORMANCE.taxiFuelGal;
  const invalid = (reason) => ({ valid: false, reason, segments: [], totalNm, startFuelGal });
  if (!finite(totalNm) || totalNm <= 0 || !finite(startFuelGal) || startFuelGal < 0
    || fuelOnboardGal > AIRCRAFT.usableFuelGal || !result) return invalid("PROFILE_INPUT_INVALID");
  const phases = ["climb", "cruise", "descent"];
  const phaseNm = phases.reduce((sum, phase) => sum + (Number(result[phase]?.distanceNm) || 0), 0);
  if (result.climb.distanceNm + result.descent.distanceNm > totalNm + .1) return invalid("PROFILE_PHASE_OVERLAP");
  if (Math.abs(phaseNm - totalNm) > Math.max(.5, totalNm * .005)) return invalid("PROFILE_DISTANCE_MISMATCH");
  const segments = [];
  let elapsedSec = 0, distanceNm = 0, usedFuelGal = 0;
  for (const phase of phases) {
    for (const part of phaseSections(result, phase)) {
      const durationSec = Number(part.timeHr) * 3600;
      const sectionNm = Number(part.distanceNm), sectionFuelGal = Number(part.fuelGal);
      if (![durationSec, sectionNm, sectionFuelGal].every(finite)
        || durationSec < 0 || sectionNm < 0 || sectionFuelGal < 0) return invalid("PROFILE_SECTION_INVALID");
      if (durationSec === 0 && sectionNm === 0) continue;
      if (durationSec <= 0 || sectionNm <= 0) return invalid("PROFILE_SECTION_INVALID");
      const startAltitudeFt = finite(part.startAltitudeFt) ? part.startAltitudeFt : result.altitudeFt;
      const endAltitudeFt = finite(part.endAltitudeFt) ? part.endAltitudeFt : result.altitudeFt;
      segments.push({ phase: phase.toUpperCase(), startSec: elapsedSec, endSec: elapsedSec + durationSec,
        startNm: distanceNm, endNm: distanceNm + sectionNm,
        startUsedGal: usedFuelGal, endUsedGal: usedFuelGal + sectionFuelGal,
        startAltitudeFt, endAltitudeFt,
        gsKt: sectionNm / durationSec * 3600, fuelFlowGph: sectionFuelGal / durationSec * 3600 });
      elapsedSec += durationSec; distanceNm += sectionNm; usedFuelGal += sectionFuelGal;
    }
  }
  if (segments.some((part, index) => index && Math.abs(part.startAltitudeFt - segments[index - 1].endAltitudeFt) > 1))
    return invalid("PROFILE_ALTITUDE_DISCONTINUITY");
  if (!segments.length || Math.abs(distanceNm - totalNm) > Math.max(.5, totalNm * .005)
    || Math.abs(usedFuelGal - result.tripFuelGal) > .05
    || Math.abs(elapsedSec - result.tripTimeHr * 3600) > 2) return invalid("PROFILE_INTEGRATION_MISMATCH");
  const climb = segments.filter((item) => item.phase === "CLIMB").at(-1);
  const cruise = segments.filter((item) => item.phase === "CRUISE").at(-1);
  const tocSec = climb?.endSec ?? 0;
  const tocNm = climb?.endNm ?? 0;
  const todSec = cruise?.endSec ?? tocSec;
  const todNm = cruise?.endNm ?? tocNm;
  return { valid: true, version: TRACKER_VERSION, segments, totalSec: elapsedSec, totalNm,
    totalFuelGal: usedFuelGal, startFuelGal, tocSec, tocNm, todSec, todNm,
    originElevationFt: Number(plan.origin?.elevationFt) || 0,
    destinationElevationFt: Number(plan.destination?.elevationFt) || 0 };
}

export function sampleVirtualProfile(profile, elapsedSec) {
  if (!profile?.valid || !profile.segments?.length) return null;
  const time = clamp(Number(elapsedSec) || 0, 0, profile.totalSec);
  const segment = profile.segments.find((item) => time < item.endSec - 1e-8) || profile.segments.at(-1);
  const fraction = clamp((time - segment.startSec) / (segment.endSec - segment.startSec), 0, 1);
  return { phase: segment.phase, elapsedSec: time,
    distanceNm: segment.startNm + (segment.endNm - segment.startNm) * fraction,
    fuelUsedGal: segment.startUsedGal + (segment.endUsedGal - segment.startUsedGal) * fraction,
    altitudeFt: segment.startAltitudeFt + (segment.endAltitudeFt - segment.startAltitudeFt) * fraction,
    gsKt: segment.gsKt, fuelFlowGph: segment.fuelFlowGph };
}

export function virtualTimeAtDistance(profile, distanceNm) {
  if (!profile?.valid || !finite(distanceNm) || distanceNm < 0 || distanceNm > profile.totalNm + .01) return null;
  const distance = clamp(distanceNm, 0, profile.totalNm);
  const segment = profile.segments.find((item) => distance < item.endNm - 1e-8) || profile.segments.at(-1);
  const fraction = clamp((distance - segment.startNm) / (segment.endNm - segment.startNm), 0, 1);
  return segment.startSec + (segment.endSec - segment.startSec) * fraction;
}

export function modelTocTod(profile) {
  if (!profile?.valid) return { toc: null, tod: null, reason: profile?.reason || "PROFILE_UNKNOWN" };
  return { toc: { source: "MODEL", distanceNm: profile.tocNm, timeSec: profile.tocSec },
    tod: profile.todNm > profile.tocNm ? { source: "MODEL", distanceNm: profile.todNm, timeSec: profile.todSec } : null,
    reason: profile.todNm > profile.tocNm ? null : "NO_CRUISE_SEGMENT" };
}

export function newVirtualFlightSession(missionKey, config, profile) {
  if (!missionKey || !profile?.valid) throw new RangeError("TRACKER_MISSION_OR_PROFILE_INVALID");
  return { version: TRACKER_VERSION, missionKey, status: "NOT_STARTED", config, profile,
    accumulatedSec: 0, anchorWallMs: null, factor: 1, startedWallMs: null,
    recoveredAttention: false, checkpoints: [], confirmedPhase: null,
    anchor: { simSec: 0, modelSec: 0, distanceNm: 0, fuelGal: profile.startFuelGal,
      fuelSource: "PROJECTED", observedAltitudeFt: null }, limitations: [] };
}

export function virtualElapsedSeconds(session, nowMs) {
  if (!session) return 0;
  const base = Math.max(0, Number(session.accumulatedSec) || 0);
  if (session.status !== "RUNNING" || !finite(nowMs) || !finite(session.anchorWallMs)) return base;
  return base + Math.max(0, nowMs - session.anchorWallMs) / 1000 * session.factor;
}

function folded(session, nowMs) {
  return { ...session, accumulatedSec: virtualElapsedSeconds(session, nowMs), anchorWallMs: nowMs };
}

export function startVirtualFlight(session, nowMs) {
  if (session?.status !== "NOT_STARTED" || !finite(nowMs)) throw new RangeError("TRACKER_START_INVALID");
  return { ...session, status: "RUNNING", startedWallMs: nowMs, anchorWallMs: nowMs,
    recoveredAttention: false };
}

export function pauseVirtualFlight(session, nowMs) {
  if (session?.status !== "RUNNING" || !finite(nowMs)) throw new RangeError("TRACKER_PAUSE_INVALID");
  return { ...folded(session, nowMs), status: "PAUSED" };
}

export function resumeVirtualFlight(session, nowMs) {
  if (session?.status !== "PAUSED" || !finite(nowMs)) throw new RangeError("TRACKER_RESUME_INVALID");
  return { ...session, status: "RUNNING", anchorWallMs: nowMs, recoveredAttention: false };
}

export function finishVirtualFlight(session, nowMs) {
  if (!session || !["RUNNING", "PAUSED"].includes(session.status) || !finite(nowMs)) throw new RangeError("TRACKER_FINISH_INVALID");
  return { ...folded(session, nowMs), status: "FINISHED", recoveredAttention: false };
}

export function setVirtualTimeFactor(session, factor, nowMs) {
  if (!session || !FACTORS.includes(factor) || session.status === "FINISHED" || !finite(nowMs)) throw new RangeError("TRACKER_FACTOR_INVALID");
  return { ...folded(session, nowMs), factor };
}

export function correctVirtualElapsed(session, elapsedSec, nowMs) {
  if (!session || !["RUNNING", "PAUSED"].includes(session.status) || !finite(elapsedSec)
    || elapsedSec < 0 || !finite(nowMs)) throw new RangeError("TRACKER_TIME_INVALID");
  let anchor = session.anchor;
  if (session.checkpoints?.length) {
    const previousElapsed = virtualElapsedSeconds(session, nowMs);
    const modelSec = clamp(anchor.modelSec + Math.max(0, previousElapsed - anchor.simSec), 0, session.profile.totalSec);
    const before = sampleVirtualProfile(session.profile, anchor.modelSec);
    const current = sampleVirtualProfile(session.profile, modelSec);
    anchor = { ...anchor, simSec: elapsedSec, modelSec,
      distanceNm: clamp(anchor.distanceNm + current.distanceNm - before.distanceNm, 0, session.profile.totalNm),
      fuelGal: Math.max(0, anchor.fuelGal - current.fuelUsedGal + before.fuelUsedGal),
      fuelSource: previousElapsed === anchor.simSec ? anchor.fuelSource : "PROJECTED" };
  } else if (elapsedSec < anchor.simSec) anchor = { ...anchor, simSec: elapsedSec };
  return { ...session, accumulatedSec: elapsedSec, anchorWallMs: nowMs, anchor,
    recoveredAttention: false, limitations: [...new Set([...(session.limitations || []), "PILOT_TIME_CORRECTION"])] };
}

export function recoverVirtualFlight(raw, missionKey, nowMs) {
  if (!raw || raw.version !== TRACKER_VERSION || raw.missionKey !== missionKey
    || !raw.profile?.valid || !["NOT_STARTED", "RUNNING", "PAUSED", "FINISHED"].includes(raw.status)
    || !FACTORS.includes(raw.factor) || !finite(raw.accumulatedSec) || raw.accumulatedSec < 0
    || !raw.anchor || !finite(raw.anchor.fuelGal) || !finite(raw.anchor.distanceNm)
    || !finite(raw.anchor.simSec) || !finite(raw.anchor.modelSec)
    || !finite(raw.profile.totalNm) || raw.profile.totalNm <= 0
    || !finite(raw.profile.totalSec) || raw.profile.totalSec <= 0
    || !Array.isArray(raw.profile.segments) || raw.profile.segments.length === 0
    || !Array.isArray(raw.checkpoints) || !Array.isArray(raw.limitations)
    || !ALTITUDES_FT.includes(raw.config?.altitudeFt)
    || !finite(raw.config?.fuelOnboardGal) || raw.config.fuelOnboardGal < 0
    || raw.config.fuelOnboardGal > AIRCRAFT.usableFuelGal
    || raw.profile.segments.some((item) => !finite(item.startSec) || !finite(item.endSec)
      || !finite(item.startNm) || !finite(item.endNm) || !finite(item.startUsedGal)
      || !finite(item.endUsedGal) || item.endSec <= item.startSec || item.endNm <= item.startNm)
    || Math.abs(raw.profile.segments[0].startSec) > .01
    || Math.abs(raw.profile.segments[0].startNm) > .01
    || raw.profile.segments.some((item, index) => index && (
      Math.abs(item.startSec - raw.profile.segments[index - 1].endSec) > .01
      || Math.abs(item.startNm - raw.profile.segments[index - 1].endNm) > .01
      || Math.abs(item.startUsedGal - raw.profile.segments[index - 1].endUsedGal) > .01))
    || Math.abs(raw.profile.segments.at(-1).endSec - raw.profile.totalSec) > .01
    || Math.abs(raw.profile.segments.at(-1).endNm - raw.profile.totalNm) > .01
    || raw.anchor.distanceNm < 0 || raw.anchor.distanceNm > raw.profile.totalNm
    || raw.anchor.modelSec < 0 || raw.anchor.modelSec > raw.profile.totalSec) return null;
  if (raw.status === "RUNNING" && (!finite(raw.anchorWallMs) || raw.anchorWallMs > nowMs + 1000)) {
    return { ...raw, status: "PAUSED", recoveredAttention: true,
      limitations: [...new Set([...(raw.limitations || []), "CLOCK_ANCHOR_INCONSISTENT"])] };
  }
  return { ...raw, recoveredAttention: raw.status === "RUNNING" || Boolean(raw.recoveredAttention) };
}

function routeLeg(plan, distanceNm) {
  const total = Number(plan.distanceNm) || 0;
  const points = [{ ident: plan.origin?.icao || "ORIG", distanceNm: 0 },
    ...(plan.waypoints || []).filter((fix) => finite(fix.distanceNm) && fix.distanceNm >= 0 && fix.distanceNm <= total),
    { ident: plan.destination?.icao || "DEST", distanceNm: total }];
  const ordered = points.reduce((list, fix) => {
    if (!list.length || fix.distanceNm >= list.at(-1).distanceNm) list.push(fix);
    return list;
  }, []);
  let nextIndex = ordered.findIndex((fix) => fix.distanceNm > distanceNm + 1e-6);
  if (nextIndex < 0) nextIndex = ordered.length - 1;
  const previous = ordered[Math.max(0, nextIndex - 1)];
  const next = ordered[nextIndex];
  return { previous: previous?.ident || "—", next: next?.ident || "—",
    nextDistanceNm: next?.distanceNm ?? total, distanceToNextNm: Math.max(0, (next?.distanceNm ?? total) - distanceNm) };
}

export function projectVirtualFlight(session, plan, nowMs) {
  if (!session?.profile?.valid || !plan || session.status === "NOT_STARTED") return null;
  const profile = session.profile;
  const elapsedSec = virtualElapsedSeconds(session, nowMs);
  const anchor = session.anchor;
  const atAnchor = sampleVirtualProfile(profile, anchor.modelSec);
  const modelSec = clamp(anchor.modelSec + Math.max(0, elapsedSec - anchor.simSec), 0, profile.totalSec);
  const sample = sampleVirtualProfile(profile, modelSec);
  const distanceNm = clamp(anchor.distanceNm + sample.distanceNm - atAnchor.distanceNm, 0, profile.totalNm);
  const fuelGal = clamp(anchor.fuelGal - (sample.fuelUsedGal - atAnchor.fuelUsedGal), 0, AIRCRAFT.usableFuelGal);
  const modelTargetNm = atAnchor.distanceNm + (profile.totalNm - anchor.distanceNm);
  const endModelSec = virtualTimeAtDistance(profile, modelTargetNm);
  const remainingSec = endModelSec === null ? null : Math.max(0, endModelSec - modelSec);
  const endSample = endModelSec === null ? null : sampleVirtualProfile(profile, endModelSec);
  const destinationFuelGal = endSample ? Math.max(0, fuelGal - (endSample.fuelUsedGal - sample.fuelUsedGal)) : null;
  const leg = routeLeg(plan, distanceNm);
  const nextModelNm = atAnchor.distanceNm + (leg.nextDistanceNm - anchor.distanceNm);
  const nextSec = virtualTimeAtDistance(profile, nextModelNm);
  const phase = sample.phase;
  const atDestination = distanceNm >= profile.totalNm - .01;
  return { status: session.status, elapsedSec, modelSec, distanceNm,
    percent: profile.totalNm ? clamp(distanceNm / profile.totalNm * 100, 0, 100) : 0,
    remainingDistanceNm: Math.max(0, profile.totalNm - distanceNm),
    fuelGal, destinationFuelGal, remainingTripFuelGal: destinationFuelGal === null ? null : fuelGal - destinationFuelGal,
    remainingSec, etaWallMs: session.status !== "RUNNING" || remainingSec === null || !finite(nowMs)
      ? null : nowMs + remainingSec / session.factor * 1000,
    phase, phaseSource: session.confirmedPhase === phase ? "PILOT_CONFIRMED" : "PROJECTED",
    altitudeFt: sample.altitudeFt, gsKt: sample.gsKt, fuelFlowGph: sample.fuelFlowGph,
    previousFix: leg.previous, nextFix: leg.next, distanceToNextNm: leg.distanceToNextNm,
    secondsToNext: nextSec === null ? null : Math.max(0, nextSec - modelSec),
    fuelSource: anchor.fuelSource === "PILOT_CONFIRMED" && elapsedSec === anchor.simSec ? "PILOT_CONFIRMED" : "PROJECTED",
    lastConfirmedFuelGal: anchor.fuelSource === "PILOT_CONFIRMED" ? anchor.fuelGal : null,
    lastSyncAgeSec: Math.max(0, elapsedSec - anchor.simSec),
    atDestination, profileExhausted: !atDestination && modelSec >= profile.totalSec - .001,
    limitations: [...(session.limitations || []), ...(endModelSec === null ? ["PROFILE_AFTER_PHASE_CORRECTION_UNKNOWN"] : [])] };
}

export function confirmVirtualCheckpoint(session, plan, input, nowMs, nextProfile = session?.profile) {
  if (!session || !["RUNNING", "PAUSED"].includes(session.status) || !nextProfile?.valid)
    throw new RangeError("TRACKER_CHECKPOINT_INVALID");
  const before = projectVirtualFlight(session, plan, nowMs);
  const fix = plan.waypoints?.[input.waypointIndex];
  const distanceNm = input.distanceNm != null ? Number(input.distanceNm) : input.waypointIndex == null ? before.distanceNm : Number(fix?.distanceNm);
  if (!finite(distanceNm) || distanceNm < 0 || distanceNm > nextProfile.totalNm) throw new RangeError("TRACKER_FIX_INVALID");
  const observedFuelGal = input.fuelGal == null ? null : Number(input.fuelGal);
  if (observedFuelGal !== null && (!finite(observedFuelGal) || observedFuelGal < 0
    || observedFuelGal > AIRCRAFT.usableFuelGal)) throw new RangeError("TRACKER_FUEL_INVALID");
  const observedAltitudeFt = input.altitudeFt == null ? null : Number(input.altitudeFt);
  if (observedAltitudeFt !== null && !ALTITUDES_FT.includes(observedAltitudeFt)) throw new RangeError("TRACKER_FL_INVALID");
  const phase = input.phase || null;
  if (phase && !["CLIMB", "CRUISE", "DESCENT"].includes(phase)) throw new RangeError("TRACKER_PHASE_INVALID");
  if (phase === "DESCENT" && (before.phase === "CLIMB" || distanceNm < nextProfile.tocNm) && !input.allowEarlyDescent)
    throw new RangeError("TRACKER_EARLY_DESCENT_CONFIRMATION_REQUIRED");
  const elapsedSec = virtualElapsedSeconds(session, nowMs);
  let modelSec = virtualTimeAtDistance(nextProfile, distanceNm);
  if (phase === "CRUISE") modelSec = Math.max(modelSec, nextProfile.tocSec);
  if (phase === "DESCENT") modelSec = Math.max(modelSec, nextProfile.todSec);
  if (phase === "CLIMB") modelSec = Math.min(modelSec, Math.max(0, nextProfile.tocSec - .001));
  if (observedAltitudeFt !== null && Math.abs(sampleVirtualProfile(nextProfile, modelSec).altitudeFt - observedAltitudeFt) > 500)
    throw new RangeError("TRACKER_FL_PROFILE_UNAVAILABLE");
  const oldAtFix = sampleVirtualProfile(session.profile, virtualTimeAtDistance(session.profile, distanceNm));
  const oldAtCurrent = sampleVirtualProfile(session.profile, virtualTimeAtDistance(session.profile, before.distanceNm));
  const estimatedFuelGal = before.fuelGal - Math.max(0, oldAtFix.fuelUsedGal - oldAtCurrent.fuelUsedGal);
  const fuelGal = observedFuelGal === null ? Math.max(0, estimatedFuelGal) : observedFuelGal;
  const direction = distanceNm < before.distanceNm - .1 ? "BACKWARD"
    : distanceNm > before.distanceNm + .1 ? "FORWARD" : "ON_TRACK";
  const checkpoint = { kind: phase ? phase === "CRUISE" ? "TOP_OF_CLIMB" : phase === "DESCENT"
    ? "TOP_OF_DESCENT" : "PHASE_CORRECTION" : "WAYPOINT", waypointIndex: input.waypointIndex ?? null,
    ident: fix?.ident || before.nextFix, distanceNm, simSec: elapsedSec, wallMs: nowMs,
    fuelGal: observedFuelGal, altitudeFt: observedAltitudeFt, phase,
    direction, source: "PILOT_CONFIRMED" };
  const limitations = [...new Set([...(session.limitations || []).filter((item) => item !== "MANUAL_UPDATE_UNMODELED"),
    ...(phase && Math.abs(distanceNm - (phase === "CRUISE" ? nextProfile.tocNm : phase === "DESCENT" ? nextProfile.todNm : nextProfile.tocNm)) > 1
      ? ["PHASE_TIMING_DIFFERS_FROM_MODEL"] : []),
    ...(observedAltitudeFt !== null && observedAltitudeFt !== session.config.altitudeFt
      ? ["FL_CHANGED_PROSPECTIVE_MODEL"] : [])])];
  return { ...folded(session, nowMs), profile: nextProfile,
    config: observedAltitudeFt === null ? session.config : { ...session.config, altitudeFt: observedAltitudeFt },
    recoveredAttention: false, confirmedPhase: phase || session.confirmedPhase,
    anchor: { simSec: elapsedSec, modelSec, distanceNm, fuelGal,
      fuelSource: observedFuelGal === null ? "PROJECTED" : "PILOT_CONFIRMED", observedAltitudeFt },
    checkpoints: [...session.checkpoints, checkpoint].slice(-100), limitations };
}

export function remainingExposure(exposure, distanceNm, timeAligned, kind = "ICE") {
  if (!timeAligned || !exposure || exposure.confidence === "limited"
    || exposure.confidence === "unknown") return { status: "UNKNOWN", score: null, source: "UNKNOWN" };
  const remaining = (exposure.segments || []).filter((item) => item.endNm > distanceNm);
  if (!remaining.length || remaining.some((item) => !item.evidenceAvailable
    || item.totalSamples != null && item.coveredSamples !== item.totalSamples))
    return { status: "UNKNOWN", score: null, source: "UNKNOWN" };
  const score = Math.max(...remaining.map((item) => item.riskScore || 0));
  if (kind === "ICE" && score >= 100)
    return { status: "RESTRICTION", score, source: "PLANNED" };
  return { status: "PROJECTED", score, source: "PLANNED" };
}
