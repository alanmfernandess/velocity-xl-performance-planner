import { AIRCRAFT, ALTITUDES_FT, PERFORMANCE } from "./config.js?v=20261021-unified";
import {
  assessFeasibility, calculateAlternateDiversion, calculateAtAltitude,
  calculateEtpPnr, calculateFinancialImpact, calculateGlideCorridor,
  calculateOxygenPlan, calculateWeightBalance, clamp, oxygenSystemWeightLb,
} from "./engine.js?v=20261021-unified";
import { buildTrajectory } from "./trajectory.js";
import { sampleGfs } from "./weather/open-meteo.js";
import { createWeatherSnapshot } from "./weather/fusion.js";
import { assessIceTrajectory, assessRideTrajectory } from "./weather/exposure.js";
import { scoreMissionV2 } from "./mission-score-v2.js";

const STATUS_RANK = { viable: 0, marginal: 1, unknown: 2, "not-viable": 3 };
const PREFERENCE = {
  ECON: { fuel: .55, time: .10, range: .20, comfort: .15 },
  NORMAL: { fuel: .30, time: .30, range: .15, comfort: .25 },
  FAST: { fuel: .10, time: .55, range: .10, comfort: .25 },
};
const norm = (values, value, inverse = false) => {
  const min = Math.min(...values), max = Math.max(...values);
  if (max - min < 1e-8) return 0;
  return inverse ? (max - value) / (max - min) : (value - min) / (max - min);
};

function planWithForecast(plan, weatherSnapshot) {
  if (weatherSnapshot?.gfs?.status !== "available" || !Number.isFinite(plan.scheduledOffMs)) return plan;
  const altitudes = [1000, 3000, 5000, 7000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 25000];
  const waypoints = plan.waypoints.map((fix) => {
    const spanMs = Number.isFinite(plan.scheduledOnMs) ? Math.max(1, plan.scheduledOnMs - plan.scheduledOffMs) : null;
    if (spanMs === null) return fix;
    const timestampMs = plan.scheduledOffMs + (fix.distanceNm / Math.max(1, plan.distanceNm)) * spanMs;
    const levels = altitudes.map((altitudeFt) => {
      const forecast = sampleGfs(weatherSnapshot.gfs, { lat: fix.lat, lon: fix.lon, altitudeFt, timestampMs });
      return forecast && Number.isFinite(forecast.windSpd) && Number.isFinite(forecast.oatC)
        ? { altitudeFt, windDir: forecast.windDir, windSpd: forecast.windSpd, oatC: forecast.oatC } : null;
    }).filter(Boolean);
    if (levels.length < 2) return fix;
    return { ...fix, windLevels: levels, windDir: levels.at(-1).windDir, windSpd: levels.at(-1).windSpd, oatC: levels.at(-1).oatC };
  });
  return { ...plan, waypoints };
}

function evaluateCandidate(input, altitudeFt, weatherSnapshot, performancePlan) {
  const { plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration, powerSetting, oxygen, weightBalance } = input;
  const oxygenWeightLb = oxygenSystemWeightLb(oxygen);
  const parameters = { plan: performancePlan, altitudeFt, mode, payloadLb, oxygenWeightLb, reserveMinutes, calibration, powerSetting };
  // Solve fuel and weight together. Occupants and baggage stay exactly as entered.
  let recommendedFuelGal = clamp(fuelOnboardGal, 0, AIRCRAFT.usableFuelGal);
  let rawFuelGal = recommendedFuelGal;
  let converged = false;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const result = calculateAtAltitude({ ...parameters, fuelOnboardGal: recommendedFuelGal });
    const alternate = calculateAlternateDiversion({ ...parameters, fuelOnboardGal: recommendedFuelGal, result });
    const alternateShortfall = alternate.destination
      ? Math.max(0, PERFORMANCE.diversion.marginalFuelMarginGal - alternate.destination.marginGal) : 0;
    rawFuelGal = Math.ceil((result.fuelRequiredGal + PERFORMANCE.optimization.targetFuelMarginGal + alternateShortfall) * 2) / 2;
    const next = clamp(rawFuelGal, 0, AIRCRAFT.usableFuelGal);
    // Half-gallon rounding can make adjacent estimates alternate. Keep the
    // conservative estimate once it already covers the recomputed target.
    if (Math.abs(next - recommendedFuelGal) < .01 || (iteration > 0 && next < recommendedFuelGal)) {
      converged = true;
      break;
    }
    recommendedFuelGal = next;
  }
  const result = calculateAtAltitude({ ...parameters, fuelOnboardGal: recommendedFuelGal });
  result.feasibility = assessFeasibility(result, { plan: performancePlan, fuelOnboardGal: recommendedFuelGal });
  const alternate = calculateAlternateDiversion({ ...parameters, fuelOnboardGal: recommendedFuelGal, result });
  result.trajectory = buildTrajectory(plan, result, alternate.destination);
  result.icing = assessIceTrajectory({ plan, result, trajectory: result.trajectory, weatherSnapshot });
  result.turbulence = assessRideTrajectory({ plan, result, trajectory: result.trajectory, weatherSnapshot });
  result.oxygen = calculateOxygenPlan({ result, oxygen });
  result.weightBalance = calculateWeightBalance({
    weightBalance, fuelOnboardGal: recommendedFuelGal,
    landingFuelGal: Math.max(0, recommendedFuelGal - PERFORMANCE.taxiFuelGal - result.tripFuelGal),
    oxygenWeightLb,
  });
  const etpPnr = calculateEtpPnr({ ...parameters, fuelOnboardGal: recommendedFuelGal, result });
  const glide = calculateGlideCorridor({ plan, result });
  const physicalBlockers = [];
  if (!converged) physicalBlockers.push("FUEL_SOLVER_DID_NOT_CONVERGE");
  if (rawFuelGal > AIRCRAFT.usableFuelGal) physicalBlockers.push("FUEL_CAPACITY");
  if (result.feasibility.status === "unavailable") physicalBlockers.push(...result.feasibility.reasons);
  if (result.weightBalance.status === "unavailable") physicalBlockers.push(result.weightBalance.primaryReason || "WEIGHT_BALANCE");
  if (result.oxygen.status === "insufficient") physicalBlockers.push("OXYGEN");
  if (result.icing.status === "avoid") physicalBlockers.push("ICE");
  if (result.turbulence.blocking) physicalBlockers.push("RIDE");
  if (alternate.destination?.status === "unavailable") physicalBlockers.push("ALTERNATE");
  const unknown = result.icing.compatibility === "UNKNOWN" || result.icing.confidence === "limited"
    || ["limited", "unknown"].includes(result.turbulence.confidence)
    || (alternate.alternate && !alternate.destination);
  const limitations = [
    "TERRAIN_NOT_ASSESSED",
    ...(!result.icing.confidence || result.icing.confidence === "limited" ? ["ICE_EVIDENCE_LIMITED"] : []),
    ...(["limited", "unknown"].includes(result.turbulence.confidence) ? ["RIDE_EVIDENCE_LIMITED"] : []),
    ...(alternate.alternate && !alternate.destination ? ["ALTERNATE_DISTANCE_UNKNOWN"] : []),
    ...(result.power.turboLimited ? ["TURBO_LIMITED"] : []),
    ...(calibration?.reference && !result.cruise.calibrationApplicable ? ["CALIBRATION_OUTSIDE_REFERENCE_REGIME"] : []),
  ];
  const price = Number(input.pricePerLiter);
  const cost = Number.isFinite(price) && price > 0
    ? (PERFORMANCE.taxiFuelGal + result.tripFuelGal) * PERFORMANCE.financial.litersPerGal * price : null;
  const eligibility = { status: physicalBlockers.length ? "INCOMPATIBLE" : unknown ? "UNKNOWN"
    : [result.feasibility.status, result.weightBalance.status, result.oxygen.status,
      result.icing.status, result.turbulence.status, alternate.destination?.status].some((status) =>
      ["marginal", "caution", "moderate"].includes(status)) ? "MARGINAL" : "ELIGIBLE",
    constraints: { fuel: result.feasibility, capacity: rawFuelGal <= AIRCRAFT.usableFuelGal,
      weightBalance: result.weightBalance.status, oxygen: result.oxygen.status,
      ice: result.icing.compatibility, ride: result.turbulence.status,
      alternate: alternate.destination?.status || "unknown", weather: weatherSnapshot.status },
    blockers: [...new Set(physicalBlockers)], limitations };
  return { altitudeFt, mode, result, recommendedFuelGal, rawFuelGal, alternate, etpPnr, glide,
    cost, physicalBlockers: eligibility.blockers, unknown, limitations, eligibility, converged };
}

/**
 * One evaluated candidate set and one selected mission. The returned proposal is
 * immutable application data; the UI must ask before applying its fuel/FL.
 */
export function optimizeMission(input) {
  if (!input?.plan || !PERFORMANCE.modes[input.mode]) return null;
  const weatherSnapshot = input.weatherSnapshot || createWeatherSnapshot(input.plan);
  const performancePlan = planWithForecast(input.plan, weatherSnapshot);
  const candidates = ALTITUDES_FT.map((altitudeFt) => evaluateCandidate(input, altitudeFt, weatherSnapshot, performancePlan));
  const priced = candidates.filter((candidate) => !candidate.physicalBlockers.length && Number.isFinite(candidate.cost));
  const minimumViableCost = priced.length ? Math.min(...priced.map((candidate) => candidate.cost)) : null;
  const physicallyAvailable = candidates.filter((candidate) => !candidate.physicalBlockers.length);
  const minimumFuel = Math.min(...(physicallyAvailable.length ? physicallyAvailable : candidates).map((candidate) => candidate.result.fuelRequiredGal));
  for (const candidate of candidates) {
    const financial = calculateFinancialImpact({ currentCost: candidate.cost, minimumViableCost });
    const score = scoreMissionV2(candidate, { minimumFuelGal: minimumFuel, financial });
    candidate.financial = { ...financial, cost: candidate.cost, currency: input.currency || "BRL", pricePerLiter: Number(input.pricePerLiter) || null };
    candidate.status = candidate.physicalBlockers.length ? "not-viable" : candidate.unknown ? "unknown"
      : candidate.eligibility.status === "MARGINAL" || score.status === "marginal" ? "marginal" : "viable";
    candidate.score = { ...score, status: candidate.status };
    candidate.result.missionScore = candidate.score;
  }
  const preference = { ...PREFERENCE[input.mode] };
  if (input.ridePreference === "comfort") { preference.comfort += .15; preference.time -= .10; preference.fuel -= .05; }
  if (input.ridePreference === "maximum") { preference.comfort += .30; preference.time -= .20; preference.fuel -= .10; }
  const preferencePool = candidates.filter((item) => item.eligibility.status === "ELIGIBLE");
  const comparison = preferencePool.length ? preferencePool : candidates.filter((item) => item.eligibility.status === "MARGINAL");
  const basis = comparison.length ? comparison : candidates;
  const fuels = basis.map((item) => item.result.fuelRequiredGal);
  const times = basis.map((item) => item.result.tripTimeHr);
  const ranges = basis.map((item) => item.result.maxRangeNm);
  const rides = basis.map((item) => item.result.turbulence.riskScore ?? 100);
  for (const candidate of candidates) {
    candidate.preferenceScore =
      preference.fuel * norm(fuels, candidate.result.fuelRequiredGal, true)
      + preference.time * norm(times, candidate.result.tripTimeHr, true)
      + preference.range * norm(ranges, candidate.result.maxRangeNm)
      + preference.comfort * norm(rides, candidate.result.turbulence.riskScore ?? 100, true);
  }
  const ranked = [...candidates].sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || (b.score.score - a.score.score)
    || (b.preferenceScore - a.preferenceScore)
    || a.altitudeFt - b.altitudeFt);
  const selected = ranked.find((candidate) => !candidate.physicalBlockers.length) || null;
  const diagnostic = selected || ranked[0];
  const viableForAdvisory = candidates.filter((candidate) => !candidate.physicalBlockers.length);
  const pool = viableForAdvisory.length ? viableForAdvisory : candidates;
  const comfort = [...pool].sort((a, b) => (a.result.turbulence.riskScore ?? 100) - (b.result.turbulence.riskScore ?? 100))[0];
  const ice = [...pool].sort((a, b) => a.result.icing.riskScore - b.result.icing.riskScore)[0];
  const reasons = [
    ...(diagnostic.physicalBlockers.map((code) => ({ code, type: "constraint" }))),
    ...diagnostic.score.reasons.slice(0, 3).map(({ code, impact }) => ({ code, impact, type: "score" })),
    ...(diagnostic.status === "unknown" ? [{ code: "WEATHER_EVIDENCE", type: "limitation" }] : []),
  ];
  const currentWeightBalance = calculateWeightBalance({
    weightBalance: input.weightBalance,
    fuelOnboardGal: input.fuelOnboardGal,
    landingFuelGal: Math.max(0, input.fuelOnboardGal - PERFORMANCE.taxiFuelGal - diagnostic.result.tripFuelGal),
    oxygenWeightLb: oxygenSystemWeightLb(input.oxygen),
  });
  return {
    version: "2.0", ofpId: weatherSnapshot.ofpKey, weatherSnapshot,
    plan: input.plan, mode: input.mode, selected, diagnostic, candidates, ranked,
    eligible: candidates.filter((candidate) => candidate.eligibility.status === "ELIGIBLE"),
    unknown: candidates.filter((candidate) => candidate.eligibility.status === "UNKNOWN"),
    incompatible: candidates.filter((candidate) => candidate.eligibility.status === "INCOMPATIBLE"),
    recommendedAltitudeFt: selected?.altitudeFt ?? null, recommendedFuelGal: selected?.recommendedFuelGal ?? null,
    viabilityStatus: selected ? selected.eligibility.status : "NO_FEASIBLE_SOLUTION",
    status: selected?.status || "not-viable", missionScore: diagnostic.score, reasons,
    comfortAltitudeFt: comfort.altitudeFt, iceAltitudeFt: ice.altitudeFt,
    powerProfile: { climb: diagnostic.result.climb, cruise: diagnostic.result.cruise, descent: diagnostic.result.descent },
    alternate: diagnostic.alternate, etpPnr: diagnostic.etpPnr, glide: diagnostic.glide,
    weightBalance: diagnostic.result.weightBalance, currentWeightBalance, oxygen: diagnostic.result.oxygen,
    financial: diagnostic.financial, limitations: diagnostic.limitations,
    changes: { fuelDeltaGal: selected ? selected.recommendedFuelGal - input.fuelOnboardGal : null,
      altitudeChanged: selected ? selected.altitudeFt !== input.selectedAltitudeFt : false },
  };
}
