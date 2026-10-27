import { PERFORMANCE } from "./config.js?v=20261027-01";
import { evaluateMissionAlternative } from "./unified-optimization.js?v=20261027-01";
import { buildMissionProfile, profilePositionAtDistance, sampleMissionDistance } from "./mission-profile.js?v=20261027-01";
import { retimeSimBriefPlan } from "./simbrief.js?v=20261027-01";
import { bearingDeg } from "./engine.js?v=20261027-01";
import { sampleGfs, gfsSampleStatus } from "./weather/open-meteo.js?v=20261027-01";

const atmosphereMissingReason = (snapshot, point, sample) => sample
  ? "ATMOSPHERIC_FIELDS_MISSING" : gfsSampleStatus(snapshot, point, sample);

function phasePoint(model, phase, altitudeFt) {
  const sections = model.profile.segments.filter((part) => part.phase === phase);
  const part = sections.find((s) => altitudeFt >= Math.min(s.startAltitudeFt, s.endAltitudeFt)
    && altitudeFt <= Math.max(s.startAltitudeFt, s.endAltitudeFt));
  if (!part) return null;
  const ratio = part.endAltitudeFt === part.startAltitudeFt ? .5
    : (altitudeFt - part.startAltitudeFt) / (part.endAltitudeFt - part.startAltitudeFt);
  const distanceNm = part.startNm + (part.endNm - part.startNm) * ratio;
  return { ...profilePositionAtDistance(model, distanceNm), distanceNm, altitudeFt,
    timestampMs: model.startMs + (part.startSec + (part.endSec - part.startSec) * ratio) * 1000 };
}

/** Samples the shared forecast at the existing solver's actual phase times. */
export function temporalPerformancePlan(plan, model, snapshot) {
  const heights = [...new Set([model.candidate.altitudeFt, ...model.profile.segments
    .filter((part) => part.phase !== "CRUISE").map((part) => (part.startAltitudeFt + part.endAltitudeFt) / 2)])].sort((a, b) => a - b);
  const missing = [];
  const waypoints = plan.waypoints.map((fix, index) => {
    const located = model.waypoints.find((p) => p.located && p.ident === fix.ident
      && Math.abs(p.lat - fix.lat) < 1e-5 && Math.abs(p.lon - fix.lon) < 1e-5);
    const distanceNm = located?.distanceNm ?? fix.distanceNm * model.distanceReference.scale;
    const predicted = sampleMissionDistance(model, distanceNm);
    const levels = heights.map((altitudeFt) => {
      const vertical = index === 0 ? phasePoint(model, "CLIMB", altitudeFt)
        : index === plan.waypoints.length - 1 ? phasePoint(model, "DESCENT", altitudeFt) : null;
      const point = vertical || { lat: fix.lat, lon: fix.lon, altitudeFt, timestampMs: predicted?.timestampMs ?? null };
      const wx = sampleGfs(snapshot.gfs, point);
      const required = vertical || altitudeFt === model.candidate.altitudeFt;
      if (!wx || ![wx.oatC, wx.windDir, wx.windSpd].every(Number.isFinite)) {
        if (required) missing.push({ ident: fix.ident, altitudeFt, timestampMs: point.timestampMs,
          reason: atmosphereMissingReason(snapshot.gfs, point, wx) });
        return null;
      }
      const distance = vertical?.distanceNm ?? distanceNm;
      const route = model.waypoints.filter(p => p.located && p.coordinatesValid);
      const upper = Math.max(1, route.findIndex(p => p.distanceNm >= distance));
      const courseDeg = route.length > 1 ? bearingDeg(route[upper - 1], route[upper]) : null;
      return { altitudeFt, windDir: wx.windDir, windSpd: wx.windSpd, oatC: wx.oatC, courseDeg };
    }).filter(Boolean);
    return { ...fix, windLevels: levels, windDir: NaN, windSpd: NaN, oatC: NaN };
  });
  return { plan: { ...plan, waypoints }, missing };
}

/** A comparison only: never mutates the ranking, original OFP, or applied state.
 * The same production evaluator, fuel solver and score reference are reused. */
export function evaluateDepartureScenario({ mission, input, candidate, offsetHours, settings = PERFORMANCE.missionTime }) {
  const unavailable = (reason, extra = {}) => ({ available: false, reason, offsetHours,
    startMs: Number.isFinite(input.plan.scheduledOffMs) ? input.plan.scheduledOffMs + offsetHours * 3600_000 : null, ...extra });
  if (![0, 1, 2, 3].includes(offsetHours)) return unavailable("INVALID_TIME_OFFSET");
  if (!Number.isFinite(input.plan.scheduledOffMs)) return unavailable("MISSING_FLIGHT_TIME");
  const snapshot = mission.weatherSnapshot;
  if (snapshot?.gfs?.status !== "available") return unavailable("PROVIDER_UNAVAILABLE");
  if (!Array.isArray(input.plan.meteorology?.advisorySources) && input.plan.meteorology?.enrouteBulletins?.length)
    return unavailable("OFP_ADVISORY_VALIDITY_UNKNOWN");
  const startMs = input.plan.scheduledOffMs + offsetHours * 3600_000;
  const choice = { altitudeFt: candidate.altitudeFt, mode: candidate.mode,
    mapInHg: candidate.powerSetting?.mapInHg, rpm: candidate.powerSetting?.rpm };
  let previous = candidate;
  for (let iteration = 1; iteration <= settings.maxIterations; iteration++) {
    const plan = retimeSimBriefPlan(input.plan, startMs, startMs + previous.result.tripTimeHr * 3600_000);
    const model = buildMissionProfile(plan, previous);
    if (!model.valid) return unavailable(model.reason, { iterations: iteration });
    const atmosphere = temporalPerformancePlan(plan, model, snapshot);
    if (atmosphere.missing.length) return unavailable(atmosphere.missing[0].reason,
      { diagnostics: atmosphere.missing, iterations: iteration });
    const next = evaluateMissionAlternative(mission, { ...input, plan }, choice,
      { performancePlan: atmosphere.plan, weatherSnapshot: snapshot });
    const trajectoryMissing = next.result.trajectory.samples.map((point) => ({ point, sample: sampleGfs(snapshot.gfs, point) }))
      .filter(({ sample }) => !sample || ![sample.oatC, sample.windDir, sample.windSpd].every(Number.isFinite));
    if (trajectoryMissing.length) return unavailable(atmosphereMissingReason(snapshot.gfs, trajectoryMissing[0].point, trajectoryMissing[0].sample), { iterations: iteration });
    const nextModel = buildMissionProfile(plan, next);
    if (!nextModel.valid) return unavailable(nextModel.reason, { iterations: iteration });
    const checkpoints = [...new Set([...model.nodes, ...nextModel.nodes].map((point) => point.distanceNm))];
    const sampleDeltas = checkpoints.map((distance) => Math.abs(sampleMissionDistance(model, distance).elapsedSec
      - sampleMissionDistance(nextModel, distance).elapsedSec));
    const deltas = ["climb", "cruise", "descent"].map((phase) => Math.abs(next.result[phase].timeHr - previous.result[phase].timeHr) * 3600);
    const deltaSeconds = Math.max(...deltas, ...sampleDeltas, Math.abs(next.result.tripTimeHr - previous.result.tripTimeHr) * 3600);
    const fuelDeltaGal = Math.abs(next.result.tripFuelGal - previous.result.tripFuelGal);
    if (deltaSeconds <= settings.timeToleranceSec && fuelDeltaGal <= settings.fuelToleranceGal) {
      return { available: true, offsetHours, candidate: next, plan, startMs, converged: true,
        iterations: iteration, deltaSeconds, fuelDeltaGal, forecast: snapshot.gfs,
        performancePlan: atmosphere.plan, source: "SHARED_FORECAST" };
    }
    previous = next;
  }
  return unavailable("TIME_SOLVER_NOT_CONVERGED", { converged: false, iterations: settings.maxIterations });
}
