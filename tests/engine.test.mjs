import test from "node:test";
import assert from "node:assert/strict";
import { assessFeasibility, calculateAlternateDiversion, calculateAtAltitude, calculateDebrief, calculateEtpPnr, calculateGlideCorridor, calculateLoadOptimization, calculateMissionOptimization, calculateMissionRecovery, calculateMissionScore, calculateModeLoadOptimization, calculateOxygenPlan, calculatePerformanceConfidence, calculatePlan, calculateStepClimbs, calculateTurbulenceRisk, calculateWeightBalance, compareScenarios, densityAltitudeFt, deriveCalibration, icingDisplayTone, icingWeatherEvidence, isaTemperatureC, missionOptimizationFailureReason, oxygenSystemWeightLb, powerAtAltitude, scaleWeightBalanceToPayload, turbulenceWeatherEvidence, weatherAtAltitude, weightBalancePayloadLb, windComponentKt } from "../js/engine.js";
import { ALTITUDES_FT, DEMO_PLAN, PERFORMANCE, WEIGHT_BALANCE } from "../js/config.js";

const FULL_OXYGEN = { bottleModel: "SK-12-24", bottles: 2, seats: [true, true, true, true, true] };
const FIVE_SEAT_LOAD = { pilot: 190, copilot: 170, rearLeft: 55, rearCenter: 50, rearRight: 55, baggage: 0 };

test("ISA temperature follows standard lapse rate", () => {
  assert.equal(isaTemperatureC(0), 15);
  assert.ok(Math.abs(isaTemperatureC(10000) + 4.812) < 0.01);
});

test("density altitude rises when OAT is above ISA", () => {
  assert.equal(densityAltitudeFt(18000, isaTemperatureC(18000)), 18000);
  assert.equal(densityAltitudeFt(18000, isaTemperatureC(18000) + 10), 19200);
});

test("turbo maintains target MAP to critical density altitude then rolls off", () => {
  const belowCritical = powerAtAltitude({ altitudeFt: 18000, oatC: isaTemperatureC(18000), mapInHg: 29.6, rpm: 2700 });
  const aboveCritical = powerAtAltitude({ altitudeFt: 25000, oatC: isaTemperatureC(25000), mapInHg: 29.6, rpm: 2700 });
  const economyAboveCritical = powerAtAltitude({ altitudeFt: 25000, oatC: isaTemperatureC(25000), mapInHg: 20, rpm: 2300 });
  assert.equal(belowCritical.availableMapInHg, 29.6);
  assert.equal(belowCritical.estimatedHp, 400);
  assert.equal(belowCritical.turboLimited, false);
  assert.ok(aboveCritical.availableMapInHg < 29.6);
  assert.equal(aboveCritical.turboLimited, true);
  assert.equal(economyAboveCritical.availableMapInHg, 20);
  assert.equal(economyAboveCritical.turboLimited, false);
});

test("tailwind component is positive and headwind negative", () => {
  assert.ok(windComponentKt(90, 270, 20) > 19.9);
  assert.ok(windComponentKt(90, 90, 20) < -19.9);
});

test("interpolates SimBrief wind and temperature levels", () => {
  const weather = weatherAtAltitude({ windLevels: [
    { altitudeFt: 18000, windDir: 350, windSpd: 20, oatC: -20 },
    { altitudeFt: 24000, windDir: 10, windSpd: 32, oatC: -32 },
  ] }, 21000);
  assert.ok(weather.windDir < 1 || weather.windDir > 359);
  assert.equal(weather.windSpd, 26);
  assert.equal(weather.oatC, -26);
});

test("performance result includes all major phases and fuel", () => {
  const result = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.ok(result.tasKt > 200);
  assert.ok(result.tripFuelGal > 0);
  assert.ok(result.climb.timeHr > 0);
  assert.ok(result.descent.timeHr > 0);
  assert.ok(result.fuelRequiredGal > result.tripFuelGal);
});

test("manual MAP and RPM refine TAS and fuel flow", () => {
  const common = { plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 };
  const lowPower = calculateAtAltitude({ ...common, powerSetting: { type: "MANUAL", mapInHg: 20, rpm: 2300 } });
  const highPower = calculateAtAltitude({ ...common, powerSetting: { type: "MANUAL", mapInHg: 28, rpm: 2500 } });
  assert.ok(highPower.tasKt > lowPower.tasKt);
  assert.ok(highPower.fuelFlowGph > lowPower.fuelFlowGph);
  assert.equal(highPower.power.source, "MANUAL");
});

test("plan evaluates FL100 through FL250 and selects winners", () => {
  const analysis = calculatePlan({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.equal(analysis.results.length, 9);
  assert.equal(analysis.results[0].altitudeFt, 10000);
  assert.equal(analysis.results.at(-1).altitudeFt, 25000);
  assert.ok(analysis.winners.overall.score >= 0);
  assert.equal(analysis.feasibility.availableCount, 9);
  assert.ok(analysis.results.every((result) => result.feasibility.status === "viable"));
});

test("icing evidence recognizes freezing precipitation, cloud, and clear weather", () => {
  assert.equal(icingWeatherEvidence("SPECI SBSP 121200Z FZRA BKN008").freezingPrecipitation, true);
  assert.equal(icingWeatherEvidence("TAF SBGL OVC020 -RA").visibleMoisture, true);
  assert.equal(icingWeatherEvidence("METAR SBRJ CAVOK").clear, true);
});

test("icing percentage colors use coherent low, marginal, and high bands", () => {
  assert.equal(icingDisplayTone(19), "low");
  assert.equal(icingDisplayTone(25), "marginal");
  assert.equal(icingDisplayTone(44), "marginal");
  assert.equal(icingDisplayTone(45), "high");
  assert.equal(icingDisplayTone(8, "avoid"), "high");
});

test("icing-aware scoring can change level when route moisture is reported", () => {
  const plan = { ...DEMO_PLAN, meteorology: { originText: "", destinationText: "", enrouteText: "BKN030 -RA" } };
  const analysis = calculatePlan({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, oxygen: FULL_OXYGEN });
  assert.equal(analysis.winners.performance.fl, 140);
  assert.notEqual(analysis.winners.overall.fl, analysis.winners.performance.fl);
  assert.equal(analysis.icing.cost.changedAltitude, true);
  assert.equal(analysis.icing.confidence, "weather");
});

test("explicit enroute icing leaves no acceptable cruise profile", () => {
  const plan = { ...DEMO_PLAN, meteorology: { originText: "", destinationText: "", enrouteText: "MOD ICE" } };
  const analysis = calculatePlan({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.equal(analysis.icing.hasAcceptableProfile, false);
  assert.equal(analysis.icing.acceptableCount, 0);
  assert.ok(analysis.results.every((result) => result.icing.status === "avoid"));
});

test("an OFP icing altitude band blocks the band and levels that require crossing it", () => {
  const plan = { ...DEMO_PLAN, meteorology: { originText: "", destinationText: "", enrouteText: "MOD ICE FL120/180" } };
  const analysis = calculatePlan({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.equal(analysis.winners.overall.fl, 100);
  assert.equal(analysis.results.find((result) => result.fl === 100).icing.status, "low");
  assert.equal(analysis.results.find((result) => result.fl === 140).icing.status, "avoid");
  assert.equal(analysis.results.find((result) => result.fl === 240).icing.status, "avoid");
});

test("missing OFP temperature data is not treated as an icing forecast", () => {
  const waypoints = DEMO_PLAN.waypoints.map(({ windLevels, oatC, ...waypoint }) => ({ ...waypoint, windLevels: [] }));
  const plan = { ...DEMO_PLAN, waypoints, meteorology: { originText: "", destinationText: "", enrouteText: "" } };
  const analysis = calculatePlan({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.ok(analysis.results.every((result) => result.icing.status === "low"));
  assert.equal(analysis.icing.confidence, "limited");
  assert.equal(analysis.winners.overall.altitudeFt, analysis.winners.performance.altitudeFt);
});

test("terminal cloud reports are limited to climb and descent instead of the cruise route", () => {
  const plan = {
    ...DEMO_PLAN,
    meteorology: {
      originText: "METAR SBSP 121200Z 12008KT 9999 BKN020 15/10 Q1018",
      destinationText: "METAR SBGL 121200Z 09006KT 9999 SCT025 18/12 Q1016",
      enrouteText: "",
    },
  };
  const analysis = calculatePlan({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.ok(analysis.results.every((result) => result.icing.status !== "avoid"));
  assert.ok(analysis.results.every((result) => result.icing.confidence === "estimated"));
  assert.ok(analysis.results.some((result) => result.icing.transitionRiskMinutes > 0));
  assert.equal(analysis.feasibility.availableCount, 9);
});

test("unavailable cruise levels are excluded from recommendations", () => {
  const analysis = calculatePlan({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 33, reserveMinutes: 45 });
  assert.ok(analysis.feasibility.availableCount > 0);
  assert.ok(analysis.feasibility.availableCount < analysis.results.length);
  assert.notEqual(analysis.winners.overall.feasibility.status, "unavailable");
  assert.ok(analysis.results.some((result) => result.feasibility.primaryReason === "FUEL"));
});

test("overweight configuration makes every cruise level unavailable", () => {
  const analysis = calculatePlan({ plan: DEMO_PLAN, mode: "FAST", payloadLb: 900, fuelOnboardGal: 87, reserveMinutes: 45 });
  assert.equal(analysis.feasibility.availableCount, 0);
  assert.ok(analysis.results.every((result) => result.feasibility.status === "unavailable"));
  assert.ok(analysis.results.every((result) => result.feasibility.reasons.includes("WEIGHT")));
});

test("route too short for climb and descent disables incompatible levels", () => {
  const shortPlan = { ...DEMO_PLAN, distanceNm: 30 };
  const analysis = calculatePlan({ plan: shortPlan, mode: "NORMAL", payloadLb: 300, fuelOnboardGal: 50, reserveMinutes: 45 });
  assert.ok(analysis.results.some((result) => result.feasibility.reasons.includes("PROFILE")));
});

test("ETP equalizes continue and return times and PNR respects route bounds", () => {
  const navigation = calculateEtpPnr({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const returnTime = navigation.etp.distanceNm / navigation.returnGsKt;
  const continueTime = (DEMO_PLAN.distanceNm - navigation.etp.distanceNm) / navigation.outboundGsKt;
  assert.ok(Math.abs(returnTime - continueTime) < 0.001);
  assert.ok(navigation.pnr.distanceNm >= 0 && navigation.pnr.distanceNm <= DEMO_PLAN.distanceNm);
});

test("step climb advisor schedules higher levels on a long route", () => {
  const waypoints = Array.from({ length: 9 }, (_, index) => ({
    ...DEMO_PLAN.waypoints[Math.min(index, DEMO_PLAN.waypoints.length - 1)],
    ident: `W${index}`,
    lat: -23 + index * 0.1,
    lon: -46 + index * 0.5,
    distanceNm: index * 150,
  }));
  const plan = { ...DEMO_PLAN, distanceNm: 1200, waypoints };
  const steps = calculateStepClimbs({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 87, reserveMinutes: 45, initialAltitudeFt: 16000 });
  assert.ok(steps.steps.length > 0);
  assert.ok(steps.steps.every((step) => step.altitudeFt > step.fromAltitudeFt && step.savingGal > 0));
  assert.ok(steps.comparison.stepped);
  assert.ok(steps.comparison.fuelSavingGal >= PERFORMANCE.stepClimb.minimumFuelSavingGal);
  assert.ok(Math.abs(steps.comparison.baseline.fuelGal - steps.comparison.stepped.fuelGal - steps.comparison.fuelSavingGal) < 1e-9);
  assert.ok(Math.abs((steps.comparison.stepped.timeHr - steps.comparison.baseline.timeHr) * 60 - steps.comparison.timeDeltaMin) < 1e-9);
  const blocked = calculateStepClimbs({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 87, reserveMinutes: 45, initialAltitudeFt: 16000, availableAltitudesFt: [16000] });
  assert.equal(blocked.steps.length, 0);
  assert.equal(blocked.comparison.reason, "level-unavailable");
});

test("step climb comparison keeps a no-step flight at its current level", () => {
  const plan = calculateStepClimbs({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, initialAltitudeFt: 10000 });
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.comparison.stepped, null);
  assert.equal(plan.comparison.fuelSavingGal, 0);
  assert.ok(plan.comparison.baseline.fuelGal > 0);
  assert.equal(plan.comparison.reason, "no-beneficial-step");
});

test("manual step climb comparison starts from the reported fuel and position", () => {
  const plan = calculateStepClimbs({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, initialAltitudeFt: 10000, manual: { distanceNm: 100, fuelRemainingGal: 40, altitudeFt: 10000 } });
  assert.equal(plan.startDistanceNm, 100);
  assert.equal(plan.startFuelGal, 40);
  assert.ok(plan.comparison.baseline.fuelGal > 0);
  assert.ok(plan.comparison.baseline.fuelGal < 40);
  const empty = calculateStepClimbs({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, initialAltitudeFt: 10000, manual: { distanceNm: 100, fuelRemainingGal: 0, altitudeFt: 10000 } });
  assert.equal(empty.startFuelGal, 0);
});

test("simple calibration derives bounded TAS and fuel-flow factors", () => {
  const calibration = deriveCalibration({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelRemainingGal: 60, altitudeFt: 18000, observedTasKt: 245, observedFuelFlowGph: 17.5 });
  assert.ok(calibration.tasFactor >= 0.85 && calibration.tasFactor <= 1.15);
  assert.ok(calibration.fuelFlowFactor >= 0.75 && calibration.fuelFlowFactor <= 1.3);
  const calibrated = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 60, reserveMinutes: 45, calibration: { NORMAL: calibration } });
  assert.ok(Math.abs(calibrated.fuelFlowGph - 17.5) < 0.01);
});

test("alternate and diversion advisor computes both legs and landing fuel", () => {
  const advice = calculateAlternateDiversion({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, waypointIndex: 2 });
  assert.equal(advice.alternate.icao, "SBRJ");
  assert.ok(advice.destination.distanceNm > 0);
  assert.ok(advice.destination.fuelGal > 0);
  assert.ok(advice.diversion.distanceNm > 0);
  assert.ok(Number.isFinite(advice.diversion.landingFuelGal));
});

test("scenario comparison returns operational deltas", () => {
  const comparison = compareScenarios({
    plan: DEMO_PLAN,
    scenarioA: { altitudeFt: 14000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 },
    scenarioB: { altitudeFt: 18000, mode: "ECON", payloadLb: 420, fuelOnboardGal: 60, reserveMinutes: 45 },
  });
  assert.equal(comparison.a.fl, 140);
  assert.equal(comparison.b.fl, 180);
  assert.ok(Number.isFinite(comparison.delta.fuelGal));
  assert.ok(Number.isFinite(comparison.delta.timeHr));
});

test("load optimizer respects useful load, fuel capacity, and required fuel", () => {
  const optimizer = calculateLoadOptimization({ plan: DEMO_PLAN, altitudeFt: 14000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, oxygen: FULL_OXYGEN });
  assert.ok(optimizer.recommendedFuelGal > 0 && optimizer.recommendedFuelGal <= 87);
  assert.ok(optimizer.maxFuelByWeightGal <= 87);
  assert.ok(optimizer.optimizedWeightLb <= 2920.01);
  assert.equal(optimizer.feasible, true);
  const applied = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 14000, mode: "NORMAL", payloadLb: optimizer.recommendedPayloadLb, fuelOnboardGal: optimizer.recommendedFuelGal, reserveMinutes: 45 });
  assert.equal(assessFeasibility(applied, { plan: DEMO_PLAN, fuelOnboardGal: optimizer.recommendedFuelGal }).status, "viable");
});

test("load optimizer computes payload reduction when fuel and load cannot coexist", () => {
  const optimizer = calculateLoadOptimization({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "FAST", payloadLb: 1100, fuelOnboardGal: 87, reserveMinutes: 60, oxygen: FULL_OXYGEN });
  assert.equal(optimizer.feasible, true);
  assert.ok(optimizer.payloadReductionLb > 0);
  assert.ok(optimizer.recommendedPayloadLb < 1100);
  assert.ok(optimizer.optimizedWeightLb <= 2920.01);
  const applied = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "FAST", payloadLb: optimizer.recommendedPayloadLb, fuelOnboardGal: optimizer.recommendedFuelGal, reserveMinutes: 60 });
  assert.equal(assessFeasibility(applied, { plan: DEMO_PLAN, fuelOnboardGal: optimizer.recommendedFuelGal }).status, "viable");
});

test("load optimizer rejects a route that exceeds usable fuel", () => {
  const plan = { ...DEMO_PLAN, distanceNm: 3000 };
  const optimizer = calculateLoadOptimization({ plan, altitudeFt: 18000, mode: "FAST", payloadLb: 200, fuelOnboardGal: 87, reserveMinutes: 60 });
  assert.equal(optimizer.feasible, false);
  assert.ok(optimizer.rawRecommendedFuelGal > 87);
});

test("mode load optimizer recovers a viable preset configuration from an unavailable load", () => {
  const optimizer = calculateModeLoadOptimization({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 1100, fuelOnboardGal: 20, reserveMinutes: 60 });
  assert.equal(optimizer.feasible, true);
  assert.equal(optimizer.mode, "NORMAL");
  assert.ok(ALTITUDES_FT.includes(optimizer.recommendedAltitudeFt));
  assert.ok(optimizer.recommendedPayloadLb < 1100);
  assert.equal(optimizer.result.feasibility.status, "viable");
});

test("mode load optimizer uses the selected automatic preset", () => {
  const optimizer = calculateModeLoadOptimization({ plan: DEMO_PLAN, mode: "ECON", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.equal(optimizer.feasible, true);
  assert.equal(optimizer.result.power.source, "AUTO");
  assert.equal(optimizer.result.power.rpm, PERFORMANCE.modes.ECON.rpm);
});

test("mode load optimizer disables apply only when every level is impossible", () => {
  const optimizer = calculateModeLoadOptimization({ plan: { ...DEMO_PLAN, distanceNm: 3000 }, mode: "FAST", payloadLb: 1100, fuelOnboardGal: 10, reserveMinutes: 60 });
  assert.equal(optimizer.feasible, false);
  assert.equal(optimizer.recommendedPayloadLb, 0);
});

test("mission optimizer removes baggage before changing occupants", () => {
  const loaded = { ...FIVE_SEAT_LOAD, baggage: 580 };
  const optimizer = calculateMissionOptimization({
    plan: DEMO_PLAN,
    mode: "NORMAL",
    payloadLb: weightBalancePayloadLb(loaded),
    fuelOnboardGal: 87,
    reserveMinutes: 45,
    weightBalance: loaded,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, true);
  for (const key of ["pilot", "copilot", "rearLeft", "rearCenter", "rearRight"]) assert.equal(optimizer.weightBalance[key], loaded[key]);
  assert.ok(optimizer.weightBalance.baggage < loaded.baggage);
  assert.equal(optimizer.result.feasibility.status, "viable");
  assert.equal(optimizer.result.weightBalance.status, "viable");
  assert.equal(optimizer.result.power.source, "AUTO");
  assert.equal(optimizer.result.power.rpm, PERFORMANCE.modes[optimizer.mode].rpm);
  assert.equal(optimizer.achievedStatus, "viable");
});

test("mission optimizer can reduce payload and select a compatible preset", () => {
  const overweight = { pilot: 190, copilot: 170, rearLeft: 170, rearCenter: 170, rearRight: 162, baggage: 0 };
  const optimizer = calculateMissionOptimization({
    plan: DEMO_PLAN,
    mode: "FAST",
    payloadLb: weightBalancePayloadLb(overweight),
    fuelOnboardGal: 77,
    reserveMinutes: 45,
    weightBalance: overweight,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, true);
  assert.equal(optimizer.achievedStatus, "viable");
  assert.equal(optimizer.mode, "ECON");
  assert.ok(optimizer.recommendedPayloadLb < weightBalancePayloadLb(overweight));
  assert.equal(optimizer.weightBalance.pilot, overweight.pilot);
  assert.equal(optimizer.result.feasibility.status, "viable");
  assert.equal(optimizer.result.weightBalance.status, "viable");
});

test("mission optimizer proactively improves an already viable manual setup", () => {
  const optimizer = calculateMissionOptimization({
    plan: DEMO_PLAN,
    mode: "NORMAL",
    payloadLb: weightBalancePayloadLb(FIVE_SEAT_LOAD),
    fuelOnboardGal: 77,
    reserveMinutes: 45,
    weightBalance: FIVE_SEAT_LOAD,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, true);
  assert.equal(optimizer.achievedStatus, "viable");
  assert.equal(optimizer.mode, "NORMAL");
  assert.equal(optimizer.recommendedPayloadLb, weightBalancePayloadLb(FIVE_SEAT_LOAD));
  assert.ok(optimizer.recommendedFuelGal < 77);
  assert.ok(Number.isFinite(optimizer.missionOptimizationScore));
  assert.ok(optimizer.changes.fuelDeltaGal < 0);
  assert.equal(optimizer.changes.payloadDeltaLb, 0);
  assert.equal(optimizer.alternateAdvice.destination.status, "viable");
  assert.ok(optimizer.alternateAdvice.destination.marginGal >= PERFORMANCE.diversion.marginalFuelMarginGal);
});

test("mission optimizer can raise fuel when the pilot manual value is too low", () => {
  const optimizer = calculateMissionOptimization({
    plan: DEMO_PLAN,
    mode: "NORMAL",
    payloadLb: weightBalancePayloadLb(FIVE_SEAT_LOAD),
    fuelOnboardGal: 20,
    reserveMinutes: 45,
    weightBalance: FIVE_SEAT_LOAD,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, true);
  assert.equal(optimizer.achievedStatus, "viable");
  assert.ok(optimizer.recommendedFuelGal > 20);
  assert.ok(optimizer.changes.fuelDeltaGal > 0);
  assert.equal(optimizer.alternateAdvice.destination.status, "viable");
});

test("mission optimizer does not invent an alternate requirement when the OFP has none", () => {
  const optimizer = calculateMissionOptimization({
    plan: { ...DEMO_PLAN, alternate: null, alternates: [] },
    mode: "NORMAL",
    payloadLb: weightBalancePayloadLb(FIVE_SEAT_LOAD),
    fuelOnboardGal: 77,
    reserveMinutes: 45,
    weightBalance: FIVE_SEAT_LOAD,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, true);
  assert.equal(optimizer.alternateRequired, false);
});

test("mission optimizer reports the alternate shortfall when tank capacity cannot cover it", () => {
  const optimizer = calculateMissionOptimization({
    plan: { ...DEMO_PLAN, alternate: "FAR", alternates: [{ icao: "FAR", distanceNm: 1500 }] },
    mode: "NORMAL",
    payloadLb: weightBalancePayloadLb(FIVE_SEAT_LOAD),
    fuelOnboardGal: 77,
    reserveMinutes: 45,
    weightBalance: FIVE_SEAT_LOAD,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, false);
  assert.equal(optimizer.alternateRequired, true);
  assert.ok(optimizer.alternateShortfallGal > 0);
  assert.ok(optimizer.rawRecommendedFuelGal > 87);
});

test("mission optimizer installs oxygen when the safe profile requires it", () => {
  const plan = { ...DEMO_PLAN, meteorology: { ...DEMO_PLAN.meteorology, enrouteText: "SEV TURB FL100/140" } };
  const optimizer = calculateMissionOptimization({
    plan,
    mode: "NORMAL",
    payloadLb: weightBalancePayloadLb(FIVE_SEAT_LOAD),
    fuelOnboardGal: 77,
    reserveMinutes: 45,
    weightBalance: FIVE_SEAT_LOAD,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, true);
  assert.ok(optimizer.recommendedAltitudeFt >= 16000);
  assert.ok(optimizer.recommendedBottleCount > 0);
  assert.equal(optimizer.result.oxygen.status, "compliant");
});

test("mission optimizer reports no solution only after testing every preset down to pilot-only load", () => {
  const optimizer = calculateMissionOptimization({
    plan: { ...DEMO_PLAN, distanceNm: 3000 },
    mode: "FAST",
    payloadLb: weightBalancePayloadLb(FIVE_SEAT_LOAD),
    fuelOnboardGal: 10,
    reserveMinutes: 60,
    weightBalance: FIVE_SEAT_LOAD,
    oxygen: { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] },
  });
  assert.equal(optimizer.feasible, false);
  assert.equal(optimizer.achievedStatus, "unavailable");
  assert.equal(optimizer.recommendedPayloadLb, FIVE_SEAT_LOAD.pilot);
  assert.equal(optimizer.weightBalance.pilot, FIVE_SEAT_LOAD.pilot);
});

test("mission optimization identifies an aft-CG dead end and revalidates the last feasible load", () => {
  const oxygen = { bottleModel: "SK-12-24", bottles: 0, seats: [true, true, true, true, true] };
  const previous = {
    plan: DEMO_PLAN,
    mode: "NORMAL",
    fuelOnboardGal: 77,
    oxygen,
    weightBalance: FIVE_SEAT_LOAD,
  };
  const badLoad = { pilot: 190, copilot: 0, rearLeft: 0, rearCenter: 0, rearRight: 0, baggage: 60 };
  const current = {
    plan: DEMO_PLAN,
    mode: "ECON",
    payloadLb: weightBalancePayloadLb(badLoad),
    fuelOnboardGal: 47,
    reserveMinutes: 45,
    weightBalance: badLoad,
    oxygen: { ...oxygen, seats: [true, false, false, false, false] },
  };
  const failed = calculateMissionOptimization(current);
  assert.equal(failed.feasible, false);
  assert.equal(missionOptimizationFailureReason(failed), "CG_AFT");
  const recovered = calculateMissionRecovery(current, previous);
  assert.equal(recovered.feasible, true);
  assert.equal(recovered.result.weightBalance.status, "viable");
  assert.deepEqual(current.weightBalance, badLoad);
  assert.equal(calculateMissionRecovery({ ...current, plan: { ...DEMO_PLAN } }, previous), null);
});

test("engine-out glide corridor uses 12.15 to 1 at 90 KIAS", () => {
  const result = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const glide = calculateGlideCorridor({ plan: DEMO_PLAN, result });
  assert.equal(glide.ratio, 12.15);
  assert.equal(glide.bestGlideKias, 90);
  assert.ok(Math.abs(glide.cruiseRangeNm - 35.99) < 0.1);
  assert.ok(glide.samples.length >= 2);
  assert.equal(glide.samples.length, DEMO_PLAN.waypoints.length);
  glide.samples.forEach((sample,index)=>{
    assert.equal(sample.ident,DEMO_PLAN.waypoints[index].ident);
    assert.ok(Math.abs(sample.forwardRangeNm+sample.reverseRangeNm-2*sample.stillAirRangeNm)<1e-8);
    assert.ok(sample.glideMinutes>=0);
  });
});

test("oxygen planner applies international crew and passenger thresholds", () => {
  const fl140 = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 14000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const fl160 = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 16000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const at140 = calculateOxygenPlan({ result: fl140, oxygen: { ...FULL_OXYGEN, bottles: 0 } });
  const at160 = calculateOxygenPlan({ result: fl160, oxygen: { ...FULL_OXYGEN, bottles: 0 } });
  assert.equal(at140.maximumUsers, 2);
  assert.equal(at160.maximumUsers, 5);
  assert.equal(at160.status, "insufficient");
  assert.ok(at160.recommendedBottles >= 2);
});

test("oxygen bottle weight is included in takeoff weight", () => {
  const oxygenWeightLb = oxygenSystemWeightLb(FULL_OXYGEN);
  const result = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, oxygenWeightLb, reserveMinutes: 45 });
  assert.equal(oxygenWeightLb, 28);
  assert.equal(result.takeoffWeightLb, 1900 + 520 + 77 * 6 + 28);
});

test("weight and balance uses the five-seat Black Square layout", () => {
  const result = calculateWeightBalance({ weightBalance: FIVE_SEAT_LOAD, fuelOnboardGal: 77, landingFuelGal: 40, oxygenWeightLb: 28 });
  assert.equal(result.payloadLb, 520);
  assert.equal(result.takeoff.weightLb, 1900 + 520 + 77 * 6 + 28);
  assert.equal(result.status, "viable");
  assert.ok(result.takeoff.cgIn >= 127 && result.takeoff.cgIn <= 134);
  assert.ok(result.landing.cgIn >= 127 && result.landing.cgIn <= 134);
});

test("all three rear passengers share the manual rear bench arm", () => {
  for (const key of ["rearLeft", "rearCenter", "rearRight"]) {
    assert.equal(WEIGHT_BALANCE.armsIn[key], 124);
  }
  const left = calculateWeightBalance({ weightBalance: { rearLeft: 180 }, fuelOnboardGal: 40 });
  const center = calculateWeightBalance({ weightBalance: { rearCenter: 180 }, fuelOnboardGal: 40 });
  const right = calculateWeightBalance({ weightBalance: { rearRight: 180 }, fuelOnboardGal: 40 });
  assert.equal(left.takeoff.cgIn, center.takeoff.cgIn);
  assert.equal(center.takeoff.cgIn, right.takeoff.cgIn);
});

test("fuel burn trajectory preserves header fuel and updates CG", () => {
  const result = calculateWeightBalance({ weightBalance: FIVE_SEAT_LOAD, fuelOnboardGal: 77, landingFuelGal: 18 });
  assert.equal(result.trajectory.length, 13);
  assert.equal(result.takeoff.stations.find((station) => station.key === "headerFuel").weightLb, 24);
  assert.equal(result.takeoff.stations.find((station) => station.key === "mainFuel").weightLb, 73 * 6);
  assert.notEqual(result.takeoff.cgIn, result.landing.cgIn);
});

test("forward CG and gross weight violations are explicit", () => {
  const result = calculateWeightBalance({ weightBalance: { pilot: 1000 }, fuelOnboardGal: 77, landingFuelGal: 30, oxygenWeightLb: 28 });
  assert.equal(result.status, "unavailable");
  assert.ok(result.reasons.includes("WEIGHT"));
  assert.ok(result.reasons.includes("CG_FORWARD"));
});

test("weight and balance violations disable every affected cruise option", () => {
  const weightBalance = { pilot: 1000, copilot: 0, rearLeft: 0, rearCenter: 0, rearRight: 0, baggage: 0 };
  const analysis = calculatePlan({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 1000, fuelOnboardGal: 77, reserveMinutes: 45, weightBalance });
  assert.equal(analysis.weightBalance.acceptableCount, 0);
  assert.ok(analysis.results.every((result) => result.weightBalance.status === "unavailable"));
});

test("payload optimization scales stations and returns a viable CG", () => {
  const overloaded = { pilot: 190, copilot: 170, rearLeft: 250, rearCenter: 250, rearRight: 250, baggage: 190 };
  const scaled = scaleWeightBalanceToPayload(overloaded, 780);
  assert.ok(Math.abs(weightBalancePayloadLb(scaled) - 780) < 0.001);
  assert.equal(scaled.pilot, overloaded.pilot);
  assert.equal(scaled.baggage, 0);
  const optimizer = calculateModeLoadOptimization({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: weightBalancePayloadLb(overloaded), fuelOnboardGal: 87, reserveMinutes: 45, weightBalance: overloaded });
  assert.equal(optimizer.feasible, true);
  assert.equal(optimizer.result.weightBalance.status, "viable");
  assert.equal(weightBalancePayloadLb(optimizer.weightBalance), optimizer.recommendedPayloadLb);
});

test("turbulence optimizer combines explicit reports and wind shear", () => {
  assert.ok(turbulenceWeatherEvidence("AIRMET TANGO MOD TURB FL160/220").score >= 55);
  const result = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const risk = calculateTurbulenceRisk({ plan: { ...DEMO_PLAN, meteorology: { enrouteText: "MOD TURB FL160/220" } }, result });
  assert.equal(risk.status, "moderate");
  assert.equal(risk.confidence, "weather");
});

test("short navlog legs do not amplify small wind changes into severe turbulence", () => {
  const waypoints = [
    { ident: "A", lat: 0, lon: 0, distanceNm: 0, windDir: 260, windSpd: 20, oatC: -20, windLevels: [] },
    { ident: "B", lat: 0, lon: .1, distanceNm: 6, windDir: 262, windSpd: 22, oatC: -20, windLevels: [] },
    { ident: "C", lat: 0, lon: 1.9, distanceNm: 114, windDir: 264, windSpd: 24, oatC: -20, windLevels: [] },
    { ident: "D", lat: 0, lon: 2, distanceNm: 120, windDir: 266, windSpd: 26, oatC: -20, windLevels: [] },
  ];
  const plan = { ...DEMO_PLAN, distanceNm: 120, waypoints, meteorology: { originText: "", destinationText: "", enrouteText: "" } };
  const result = calculateAtAltitude({ plan, altitudeFt: 18000, mode: "NORMAL", payloadLb: 300, fuelOnboardGal: 60, reserveMinutes: 45 });
  const risk = calculateTurbulenceRisk({ plan, result });
  assert.notEqual(risk.status, "severe");
  assert.equal(risk.confidence, "estimated");
});

test("SimBrief shear is preferred over inferred wind gradients", () => {
  const result = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const withShear = (shear) => calculateTurbulenceRisk({
    plan: {
      ...DEMO_PLAN,
      meteorology: { originText: "", destinationText: "", enrouteText: "" },
      waypoints: DEMO_PLAN.waypoints.map((waypoint) => ({ ...waypoint, shear })),
    },
    result,
  });
  assert.notEqual(withShear(2).status, "severe");
  assert.equal(withShear(6).status, "moderate");
  assert.equal(withShear(11).status, "severe");
  assert.equal(withShear(2).confidence, "simbrief");
});

test("SimBrief shear only applies near the navlog altitude", () => {
  const plan = {
    ...DEMO_PLAN,
    plannedAltitudeFt: 19000,
    meteorology: { originText: "", destinationText: "", enrouteText: "" },
    waypoints: DEMO_PLAN.waypoints.map((waypoint) => ({
      ...waypoint,
      altitudeFt: 19000,
      stage: "CRZ",
      shear: 13,
    })),
  };
  const atPlannedLevel = calculateAtAltitude({ plan, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const awayFromPlannedLevel = calculateAtAltitude({ plan, altitudeFt: 10000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const plannedRisk = calculateTurbulenceRisk({ plan, result: atPlannedLevel });
  const otherRisk = calculateTurbulenceRisk({ plan, result: awayFromPlannedLevel });
  assert.equal(plannedRisk.status, "severe");
  assert.equal(plannedRisk.blocking, true);
  assert.notEqual(otherRisk.status, "severe");
  assert.equal(otherRisk.blocking, false);
});

test("unbounded turbulence advisory warns without blocking every flight level", () => {
  const plan = {
    ...DEMO_PLAN,
    meteorology: { originText: "", destinationText: "", enrouteText: "SEV TURB" },
    waypoints: DEMO_PLAN.waypoints.map((waypoint) => ({ ...waypoint, shear: Number.NaN })),
  };
  const analysis = calculatePlan({ plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.ok(analysis.results.every((result) => result.turbulence.status === "moderate"));
  assert.ok(analysis.results.every((result) => result.turbulence.blocking === false));
  assert.equal(analysis.turbulence.acceptableCount, analysis.results.length);
});

test("performance confidence narrows with calibrated debrief history", () => {
  const result = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  const baseline = calculatePerformanceConfidence({ plan: DEMO_PLAN, result, mode: "NORMAL" });
  const learned = calculatePerformanceConfidence({ plan: DEMO_PLAN, result, mode: "NORMAL", calibration: { NORMAL: { tasFactor: 1.02, fuelFlowFactor: .98 } }, debriefs: Array.from({ length: 5 }, () => ({ mode: "NORMAL" })) });
  assert.ok(learned.score > baseline.score);
  assert.ok(learned.fuel.high - learned.fuel.low < baseline.fuel.high - baseline.fuel.low);
});

test("debrief updates calibration and mission score blocks mandatory hazards", () => {
  const analysis = calculatePlan({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, oxygen: { ...FULL_OXYGEN, bottles: 0 } });
  const result = analysis.results.find((item) => item.altitudeFt === 18000);
  const debrief = calculateDebrief({ result, actualTimeMinutes: result.tripTimeHr * 60 * 1.08, actualFuelGal: result.tripFuelGal * 1.1 });
  assert.ok(debrief.accuracyScore < 100);
  assert.ok(debrief.calibration.tasFactor < 1);
  assert.ok(debrief.calibration.fuelFlowFactor > 1);
  const score = calculateMissionScore({ result, confidence: result.confidence });
  assert.ok(score.score < 40);
  assert.equal(score.status, "not-viable");
  assert.equal(score.blocked, true);
  assert.ok(score.reasons.some((reason) => reason.code === "oxygen" && reason.blocking));
});

test("mission score uses one ascending 0-100 viability scale", () => {
  const analysis = calculatePlan({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: weightBalancePayloadLb(FIVE_SEAT_LOAD), fuelOnboardGal: 77, reserveMinutes: 45, oxygen: FULL_OXYGEN, weightBalance: FIVE_SEAT_LOAD });
  const result = analysis.results.find((item) => item.altitudeFt === 10000);
  const score = calculateMissionScore({ result, confidence: result.confidence });
  assert.ok(score.score >= 0 && score.score <= 100);
  assert.equal(score.status, score.score < 40 ? "not-viable" : score.score < 80 ? "marginal" : "viable");
  assert.ok(["not-viable", "marginal", "viable"].includes(score.status));
});
