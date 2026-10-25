import { PERFORMANCE } from "./config.js?v=20261024-03";
import { sampleMissionDistance } from "./mission-profile.js?v=20261024-03";

/** Events are references to existing model results, never invented risk zones. */
export function buildMissionEvents(model, layers) {
  if (!model?.valid) return [];
  const events = [];
  const add = (id, type, distanceNm, reference, state = "PLANNED", source = "PERFORMANCE") => {
    if (!Number.isFinite(distanceNm) || distanceNm < 0 || distanceNm > model.totalNm) return;
    const point = sampleMissionDistance(model, distanceNm);
    events.push({ id, type, distanceNm, utcMs: point.timestampMs, phase: point.phase,
      altitudeFt: point.altitudeFt, elapsedSec: point.elapsedSec, state, reference, source });
  };
  add("departure", "DEPARTURE", 0, model.plan.origin.icao);
  add("toc", "TOC", model.profile.tocNm, "result.trajectory.tocNm");
  if (model.profile.todNm > model.profile.tocNm + .01) add("tod", "TOD", model.profile.todNm, "result.trajectory.todNm");
  for (const fix of model.waypoints.filter((p) => p.kind === "fix" && p.located && p.ident))
    add(`waypoint:${fix.id}`, "WAYPOINT", fix.distanceNm, fix.ident, "PLANNED", "SIMBRIEF");
  for (const [layer, threshold] of [["ICE", PERFORMANCE.icing.watchScore], ["RIDE", PERFORMANCE.turbulence.moderateScore]]) {
    let active = null;
    const spans = (layers[layer] || []).filter((p) => p.known && p.value >= threshold).sort((a, b) => a.startNm - b.startNm);
    const groups = [];
    for (const span of spans) {
      if (active && span.startNm <= active.endNm + .1) active.endNm = Math.max(active.endNm, span.endNm);
      else { active = { ...span }; groups.push(active); }
    }
    groups.forEach((span, i) => {
      add(`${layer}:${i}:in`, `${layer}_ENTRY`, span.startNm, `${layer} · ${span.from || "—"} → ${span.to || "—"}`, "ATTENTION", "EXISTING_EXPOSURE");
      add(`${layer}:${i}:out`, `${layer}_EXIT`, span.endNm, layer, "PLANNED", "EXISTING_EXPOSURE");
    });
  }
  const navigation = model.candidate.etpPnr;
  add("etp", "ETP", navigation?.etp?.distanceNm, "result.etpPnr.etp");
  if (navigation?.pnr?.status === "WITHIN_ROUTE") add("pnr", "PNR", navigation.pnr.distanceNm, "result.etpPnr.pnr");
  const reserve = model.candidate.result.reserveFuelGal;
  const fuel = model.profile.startFuelGal;
  const crossing = model.profile.segments.find((s) => fuel - s.startUsedGal >= reserve && fuel - s.endUsedGal < reserve);
  if (crossing) {
    const ratio = (fuel - reserve - crossing.startUsedGal) / (crossing.endUsedGal - crossing.startUsedGal);
    add("reserve", "FUEL_RESERVE", crossing.startNm + ratio * (crossing.endNm - crossing.startNm),
      "result.reserveFuelGal", "RESTRICTION");
  }
  add("arrival", "ARRIVAL", model.totalNm, model.plan.destination.icao);
  return events.sort((a, b) => a.distanceNm - b.distanceNm || a.id.localeCompare(b.id));
}

export function missionAdvisor(candidate, mission) {
  if (!candidate) return { priority: 2, code: "NO_OFP", status: "unknown", source: "OFP", target: "mission:overview" };
  if (candidate.physicalBlockers?.length) return { priority: 1, code: candidate.physicalBlockers[0],
    status: "not-viable", source: "eligibility.blockers", target: "planning:config" };
  if (candidate.eligibility.status === "UNKNOWN" || candidate.score.partial) return { priority: 2,
    code: candidate.unknownReasons?.[0] || "WEATHER_EVIDENCE", status: "unknown", source: "eligibility", target: "route:ice" };
  if (candidate.status === "marginal") return { priority: 3,
    code: candidate.score.reasons[0]?.code || "MARGINAL", status: "marginal", source: "score.reasons", target: "mission:score" };
  const weather = candidate.score.reasons.find((reason) => ["icing", "turbulence"].includes(reason.code) && reason.impact >= 4);
  if (weather) return { priority: 4, code: weather.code, status: "marginal", source: "score.reasons", target: weather.code === "icing" ? "route:ice" : "route:ride" };
  const auto = mission?.automaticRecommendation;
  if (auto && auto !== candidate && ["viable", "marginal"].includes(auto.status)
    && auto.result.fuelRequiredGal < candidate.result.fuelRequiredGal - .5)
    return { priority: 5, code: "FUEL_OPPORTUNITY", status: "viable", source: "automaticRecommendation", reference: `FL${auto.altitudeFt / 100} · ${auto.mode}`, target: "planning:config" };
  return { priority: 5, code: "NO_BLOCKER", status: "viable", source: "eligibility", target: "mission:score" };
}
