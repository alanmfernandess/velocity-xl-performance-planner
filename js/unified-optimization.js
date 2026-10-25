import { AIRCRAFT, ALTITUDES_FT, PERFORMANCE } from "./config.js?v=20261025-01";
import {
  assessFeasibility, calculateAlternateDiversion, calculateAtAltitude,
  calculateEtpPnr, calculateFinancialImpact, calculateGlideCorridor,
  calculateOxygenPlan, calculateWeightBalance, clamp, oxygenSystemWeightLb,
} from "./engine.js?v=20261025-01";
import { buildTrajectory } from "./trajectory.js?v=20261025-01";
import { sampleGfs } from "./weather/open-meteo.js?v=20261025-01";
import { createWeatherSnapshot } from "./weather/fusion.js?v=20261025-01";
import { assessIceTrajectory, assessRideTrajectory } from "./weather/exposure.js?v=20261025-01";
import { scoreMissionV2 } from "./mission-score-v2.js?v=20261025-01";

const STATUS_RANK = { viable: 0, marginal: 1, unknown: 2, "not-viable": 3 };
const PRESETS = ["ECON", "NORMAL", "FAST"];
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

function evaluateCandidate(input, altitudeFt, weatherSnapshot, performancePlan, scenario = null) {
  const { plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration, powerSetting, oxygen, weightBalance } = input;
  const oxygenWeightLb = oxygenSystemWeightLb(oxygen);
  const parameters = { plan: performancePlan, altitudeFt, mode, payloadLb, oxygenWeightLb, reserveMinutes, calibration, powerSetting };
  // Solve fuel and weight together. Occupants and baggage stay exactly as entered.
  let recommendedFuelGal = clamp(fuelOnboardGal, 0, AIRCRAFT.usableFuelGal);
  let rawFuelGal = recommendedFuelGal;
  let converged = scenario?.fuelPolicy === "FIXED";
  for (let iteration = 0; !scenario?.fuelPolicy && iteration < 24; iteration += 1) {
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
  const unknownReasons = [
    ...(result.icing.compatibility === "UNKNOWN" ? ["ICE_COMPATIBILITY_UNKNOWN"] : []),
    ...(result.icing.confidence === "limited" ? ["ICE_EVIDENCE_LIMITED"] : []),
    ...(["limited", "unknown"].includes(result.turbulence.confidence) ? ["RIDE_EVIDENCE_LIMITED"] : []),
    ...(alternate.alternate && !alternate.destination ? ["ALTERNATE_DISTANCE_UNKNOWN"] : []),
    ...((result.icing.limitations || []).filter((code) => code === "ALTERNATE_ICE_NOT_ASSESSED" || code === "ICE_SIGMET_VERTICAL_LIMIT_UNKNOWN")),
  ];
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
  return { altitudeFt, mode, engineMode: mode, powerSetting, result, recommendedFuelGal, rawFuelGal, alternate, etpPnr, glide,
    cost, physicalBlockers: eligibility.blockers, unknown, unknownReasons: [...new Set(unknownReasons)], limitations, eligibility, converged };
}

function scoreCandidates(candidates, input, referenceCandidates = candidates) {
  const priced = referenceCandidates.filter((candidate) => !candidate.physicalBlockers.length && Number.isFinite(candidate.cost));
  const minimumViableCost = priced.length ? Math.min(...priced.map((candidate) => candidate.cost)) : null;
  const physicallyAvailable = referenceCandidates.filter((candidate) => !candidate.physicalBlockers.length);
  const basis = physicallyAvailable.length ? physicallyAvailable : referenceCandidates;
  const minimumFuel = Math.min(...basis.map((candidate) => candidate.result.fuelRequiredGal));
  for (const candidate of candidates) {
    const financial = calculateFinancialImpact({ currentCost: candidate.cost, minimumViableCost });
    const score = scoreMissionV2(candidate, { minimumFuelGal: minimumFuel, financial });
    candidate.financial = { ...financial, cost: candidate.cost, currency: input.currency || "BRL", pricePerLiter: Number(input.pricePerLiter) || null };
    candidate.status = candidate.physicalBlockers.length ? "not-viable" : candidate.unknown || score.status === "unknown" ? "unknown"
      : candidate.eligibility.status === "MARGINAL" || score.status === "marginal" ? "marginal" : "viable";
    if (candidate.status === "unknown") {
      candidate.eligibility.status = "UNKNOWN";
      if (score.partial) candidate.unknownReasons = [...new Set([...candidate.unknownReasons, "SCORE_DATA_INCOMPLETE"])];
    }
    if (candidate.status === "marginal") candidate.eligibility.status = "MARGINAL";
    candidate.score = { ...score, status: candidate.status };
    candidate.result.missionScore = candidate.score;
  }
}

function rankCandidates(candidates, preferenceMode, ridePreference) {
  const preference = { ...PREFERENCE[preferenceMode] };
  if (ridePreference === "comfort") { preference.comfort += .15; preference.time -= .10; preference.fuel -= .05; }
  if (ridePreference === "maximum") { preference.comfort += .30; preference.time -= .20; preference.fuel -= .10; }
  const assessed = candidates.filter((item) => item.status === "viable");
  const marginal = candidates.filter((item) => item.status === "marginal");
  const basis = assessed.length ? assessed : marginal.length ? marginal : candidates;
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
  return [...candidates].sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || (b.score.score - a.score.score)
    || (b.preferenceScore - a.preferenceScore)
    || a.altitudeFt - b.altitudeFt
    || PRESETS.indexOf(a.engineMode) - PRESETS.indexOf(b.engineMode));
}

const distinctLevels = (candidates, limit = 3) => {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.altitudeFt) || seen.size >= limit) return false;
    seen.add(candidate.altitudeFt);
    return true;
  });
};

function closestPreset(powerSetting) {
  return [...PRESETS].sort((a, b) => {
    const distance = (mode) => Math.abs(powerSetting.mapInHg - PERFORMANCE.modes[mode].mapInHg) / 1.5
      + Math.abs(powerSetting.rpm - PERFORMANCE.modes[mode].rpm) / 150;
    return distance(a) - distance(b) || PRESETS.indexOf(a) - PRESETS.indexOf(b);
  })[0];
}

/** Evaluate a pilot-selected scenario against the same weather and score basis. */
export function evaluateMissionAlternative(mission, input, { altitudeFt, mode, mapInHg, rpm }, scenario = null) {
  if (!mission?.plan || !ALTITUDES_FT.includes(altitudeFt)) throw new RangeError("INVALID_SCENARIO_ALTITUDE");
  if (mode !== "MANUAL" && !PRESETS.includes(mode)) throw new RangeError("INVALID_SCENARIO_MODE");
  let engineMode = mode, powerSetting = { type: "AUTO" };
  if (mode === "MANUAL") {
    if (!Number.isFinite(mapInHg) || mapInHg < PERFORMANCE.powerModel.minimumMapInHg || mapInHg > AIRCRAFT.maxManifoldInHg
      || !Number.isFinite(rpm) || rpm < PERFORMANCE.powerModel.minimumRpm || rpm > AIRCRAFT.maxRpm) throw new RangeError("INVALID_MANUAL_POWER");
    powerSetting = { type: "MANUAL", mapInHg, rpm };
    engineMode = closestPreset(powerSetting);
  } else {
    const cached = mission.candidates.find((candidate) => candidate.altitudeFt === altitudeFt && candidate.mode === mode);
    if (cached && !scenario) return cached;
  }
  const candidate = evaluateCandidate({ ...input, mode: engineMode, powerSetting }, altitudeFt,
    scenario?.weatherSnapshot || mission.weatherSnapshot, scenario?.performancePlan || mission.performancePlan || planWithForecast(input.plan, mission.weatherSnapshot), scenario);
  if (mode === "MANUAL") candidate.mode = "MANUAL";
  scoreCandidates([candidate], input, mission.candidates);
  return candidate;
}

/**
 * The 27 automatic combinations share one validated weather snapshot. The
 * recommendation stays separate from pilot analysis and applied configuration.
 */
export function optimizeMission(input) {
  if (!input?.plan || !PERFORMANCE.modes[input.mode]) return null;
  const weatherSnapshot = input.weatherSnapshot || createWeatherSnapshot(input.plan);
  const performancePlan = planWithForecast(input.plan, weatherSnapshot);
  const candidates = PRESETS.flatMap((mode) => ALTITUDES_FT.map((altitudeFt) =>
    evaluateCandidate({ ...input, mode, powerSetting: { type: "AUTO" } }, altitudeFt, weatherSnapshot, performancePlan)));
  scoreCandidates(candidates, input);
  const ranked = rankCandidates(candidates, input.mode, input.ridePreference);
  const acceptable = ranked.filter((candidate) => candidate.status === "viable" || candidate.status === "marginal");
  const selected = acceptable[0] || null;
  const diagnostic = selected || ranked[0];
  const viableForAdvisory = acceptable;
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
    version: "3.0", ofpId: weatherSnapshot.ofpKey, weatherSnapshot, performancePlan,
    diagnosticReasons: diagnostic.unknownReasons || [], weatherCoverage: { ice: diagnostic.result.icing.coverage, icePhases: diagnostic.result.icing.phaseCoverage, iceMissingReasons: diagnostic.result.icing.coverageReasons, alternate: diagnostic.result.icing.alternateCoverage, ride: diagnostic.result.turbulence.coverage, sources: weatherSnapshot.sources },
    plan: input.plan, mode: input.mode, selected, automaticRecommendation: selected, diagnostic, candidates, ranked,
    topLevels: distinctLevels(ranked.filter((candidate) => candidate.status === "viable")),
    marginalLevels: distinctLevels(ranked.filter((candidate) => candidate.status === "marginal"), ALTITUDES_FT.length),
    eligible: candidates.filter((candidate) => candidate.status === "viable"),
    unknown: candidates.filter((candidate) => candidate.eligibility.status === "UNKNOWN"),
    incompatible: candidates.filter((candidate) => candidate.eligibility.status === "INCOMPATIBLE"),
    recommendedAltitudeFt: selected?.altitudeFt ?? null, recommendedFuelGal: selected?.recommendedFuelGal ?? null,
    viabilityStatus: selected ? selected.eligibility.status : diagnostic.status === "unknown" ? "UNKNOWN" : "NO_FEASIBLE_SOLUTION",
    status: selected?.status || diagnostic.status, missionScore: diagnostic.score, reasons,
    comfortAltitudeFt: comfort.altitudeFt, iceAltitudeFt: ice.altitudeFt,
    powerProfile: { climb: diagnostic.result.climb, cruise: diagnostic.result.cruise, descent: diagnostic.result.descent },
    alternate: diagnostic.alternate, etpPnr: diagnostic.etpPnr, glide: diagnostic.glide,
    weightBalance: diagnostic.result.weightBalance, currentWeightBalance, oxygen: diagnostic.result.oxygen,
    financial: diagnostic.financial, limitations: diagnostic.limitations,
    changes: { fuelDeltaGal: selected ? selected.recommendedFuelGal - input.fuelOnboardGal : null,
      altitudeChanged: selected ? selected.altitudeFt !== input.selectedAltitudeFt : false },
  };
}
