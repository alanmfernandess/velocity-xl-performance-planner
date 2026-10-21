import { AIRCRAFT, ALTITUDES_FT, PERFORMANCE } from "./config.js?v=20261021-unified";
import {
  assessFeasibility, calculateAlternateDiversion, calculateAtAltitude,
  calculateEtpPnr, calculateFinancialImpact, calculateGlideCorridor,
  calculateIcingRisk, calculateMissionScore, calculateOxygenPlan,
  calculateTurbulenceRisk, calculateWeightBalance, clamp, oxygenSystemWeightLb,
} from "./engine.js?v=20261021-unified";

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

function evaluateCandidate(input, altitudeFt) {
  const { plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration, powerSetting, oxygen, weightBalance } = input;
  const oxygenWeightLb = oxygenSystemWeightLb(oxygen);
  const parameters = { plan, altitudeFt, mode, payloadLb, oxygenWeightLb, reserveMinutes, calibration, powerSetting };
  // Solve fuel and weight together. Occupants and baggage stay exactly as entered.
  let recommendedFuelGal = clamp(fuelOnboardGal, 0, AIRCRAFT.usableFuelGal);
  let rawFuelGal = recommendedFuelGal;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const result = calculateAtAltitude({ ...parameters, fuelOnboardGal: recommendedFuelGal });
    const alternate = calculateAlternateDiversion({ ...parameters, fuelOnboardGal: recommendedFuelGal, result });
    const alternateShortfall = alternate.destination
      ? Math.max(0, PERFORMANCE.diversion.marginalFuelMarginGal - alternate.destination.marginGal) : 0;
    rawFuelGal = Math.ceil((result.fuelRequiredGal + PERFORMANCE.optimization.targetFuelMarginGal + alternateShortfall) * 2) / 2;
    const next = clamp(rawFuelGal, 0, AIRCRAFT.usableFuelGal);
    if (Math.abs(next - recommendedFuelGal) < .01) break;
    recommendedFuelGal = next;
  }
  const result = calculateAtAltitude({ ...parameters, fuelOnboardGal: recommendedFuelGal });
  result.feasibility = assessFeasibility(result, { plan, fuelOnboardGal: recommendedFuelGal });
  result.icing = calculateIcingRisk({ plan, result });
  result.turbulence = calculateTurbulenceRisk({ plan, result });
  result.oxygen = calculateOxygenPlan({ result, oxygen });
  result.weightBalance = calculateWeightBalance({
    weightBalance, fuelOnboardGal: recommendedFuelGal,
    landingFuelGal: Math.max(0, recommendedFuelGal - PERFORMANCE.taxiFuelGal - result.tripFuelGal),
    oxygenWeightLb,
  });
  const alternate = calculateAlternateDiversion({ ...parameters, fuelOnboardGal: recommendedFuelGal, result });
  const etpPnr = calculateEtpPnr({ ...parameters, fuelOnboardGal: recommendedFuelGal, result });
  const glide = calculateGlideCorridor({ plan, result });
  const physicalBlockers = [];
  if (rawFuelGal > AIRCRAFT.usableFuelGal) physicalBlockers.push("FUEL_CAPACITY");
  if (result.feasibility.status === "unavailable") physicalBlockers.push(...result.feasibility.reasons);
  if (result.weightBalance.status === "unavailable") physicalBlockers.push(result.weightBalance.primaryReason || "WEIGHT_BALANCE");
  if (result.oxygen.status === "insufficient") physicalBlockers.push("OXYGEN");
  if (result.icing.status === "avoid") physicalBlockers.push("ICE");
  if (result.turbulence.blocking) physicalBlockers.push("RIDE");
  if (alternate.destination?.status === "unavailable") physicalBlockers.push("ALTERNATE");
  const unknown = result.icing.confidence === "limited"
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
  return { altitudeFt, mode, result, recommendedFuelGal, rawFuelGal, alternate, etpPnr, glide,
    cost, physicalBlockers: [...new Set(physicalBlockers)], unknown, limitations };
}

/**
 * One evaluated candidate set and one selected mission. The returned proposal is
 * immutable application data; the UI must ask before applying its fuel/FL.
 */
export function optimizeMission(input) {
  if (!input?.plan || !PERFORMANCE.modes[input.mode]) return null;
  const candidates = ALTITUDES_FT.map((altitudeFt) => evaluateCandidate(input, altitudeFt));
  const priced = candidates.filter((candidate) => !candidate.physicalBlockers.length && Number.isFinite(candidate.cost));
  const minimumViableCost = priced.length ? Math.min(...priced.map((candidate) => candidate.cost)) : null;
  const physicallyAvailable = candidates.filter((candidate) => !candidate.physicalBlockers.length);
  const minimumFuel = Math.min(...(physicallyAvailable.length ? physicallyAvailable : candidates).map((candidate) => candidate.result.fuelRequiredGal));
  for (const candidate of candidates) {
    const financial = calculateFinancialImpact({ currentCost: candidate.cost, minimumViableCost });
    const efficiencyPenalty = minimumFuel > 0
      ? clamp(Math.round((candidate.result.fuelRequiredGal / minimumFuel - 1) * 20), 0, 8) : 0;
    const score = calculateMissionScore({ result: candidate.result, alternateAdvice: candidate.alternate, financial, efficiencyPenalty });
    candidate.financial = { ...financial, cost: candidate.cost, currency: input.currency || "BRL", pricePerLiter: Number(input.pricePerLiter) || null };
    candidate.status = candidate.physicalBlockers.length ? "not-viable" : candidate.unknown ? "unknown" : score.status;
    candidate.score = { ...score, status: candidate.status };
    candidate.result.missionScore = candidate.score;
  }
  const preference = { ...PREFERENCE[input.mode] };
  if (input.ridePreference === "comfort") { preference.comfort += .15; preference.time -= .10; preference.fuel -= .05; }
  if (input.ridePreference === "maximum") { preference.comfort += .30; preference.time -= .20; preference.fuel -= .10; }
  const fuels = candidates.map((item) => item.result.fuelRequiredGal);
  const times = candidates.map((item) => item.result.tripTimeHr);
  const ranges = candidates.map((item) => item.result.maxRangeNm);
  const rides = candidates.map((item) => item.result.turbulence.riskScore ?? 100);
  for (const candidate of candidates) {
    candidate.preferenceScore =
      preference.fuel * norm(fuels, candidate.result.fuelRequiredGal, true)
      + preference.time * norm(times, candidate.result.tripTimeHr, true)
      + preference.range * norm(ranges, candidate.result.maxRangeNm)
      + preference.comfort * norm(rides, candidate.result.turbulence.riskScore ?? 100, true);
  }
  const ranked = [...candidates].sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || (b.score.score + b.preferenceScore * 15) - (a.score.score + a.preferenceScore * 15)
    || a.altitudeFt - b.altitudeFt);
  const selected = ranked[0];
  const viableForAdvisory = candidates.filter((candidate) => !candidate.physicalBlockers.length);
  const pool = viableForAdvisory.length ? viableForAdvisory : candidates;
  const comfort = [...pool].sort((a, b) => (a.result.turbulence.riskScore ?? 100) - (b.result.turbulence.riskScore ?? 100))[0];
  const ice = [...pool].sort((a, b) => a.result.icing.riskScore - b.result.icing.riskScore)[0];
  const reasons = [
    ...(selected.physicalBlockers.map((code) => ({ code, type: "constraint" }))),
    ...selected.score.reasons.slice(0, 3).map(({ code, impact }) => ({ code, impact, type: "score" })),
    ...(selected.status === "unknown" ? [{ code: "WEATHER_EVIDENCE", type: "limitation" }] : []),
  ];
  const currentWeightBalance = calculateWeightBalance({
    weightBalance: input.weightBalance,
    fuelOnboardGal: input.fuelOnboardGal,
    landingFuelGal: Math.max(0, input.fuelOnboardGal - PERFORMANCE.taxiFuelGal - selected.result.tripFuelGal),
    oxygenWeightLb: oxygenSystemWeightLb(input.oxygen),
  });
  return {
    plan: input.plan, mode: input.mode, selected, candidates, ranked,
    recommendedAltitudeFt: selected.altitudeFt, recommendedFuelGal: selected.recommendedFuelGal,
    status: selected.status, missionScore: selected.score, reasons,
    comfortAltitudeFt: comfort.altitudeFt, iceAltitudeFt: ice.altitudeFt,
    powerProfile: { climb: selected.result.climb, cruise: selected.result.cruise, descent: selected.result.descent },
    alternate: selected.alternate, etpPnr: selected.etpPnr, glide: selected.glide,
    weightBalance: selected.result.weightBalance, currentWeightBalance, oxygen: selected.result.oxygen,
    financial: selected.financial, limitations: selected.limitations,
    changes: { fuelDeltaGal: selected.recommendedFuelGal - input.fuelOnboardGal, altitudeChanged: selected.altitudeFt !== input.selectedAltitudeFt },
  };
}
