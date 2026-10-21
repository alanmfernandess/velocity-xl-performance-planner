import test from "node:test";
import assert from "node:assert/strict";
import { assessFeasibility, calculateAlternateDiversion, calculateAtAltitude, calculateEtpPnr, calculateFinancialImpact, calculateGlideCorridor, calculateIcingRisk, calculateMissionScore, calculateOxygenPlan, calculateRemainingFlightAssessment, calculateStepClimbs, calculateTurbulenceRisk, calculateWeightBalance, densityAltitudeFt, deriveCalibration, icingDisplayTone, icingWeatherEvidence, isaTemperatureC, oxygenSystemWeightLb, powerAtAltitude, randomizeWeightBalance, scaleWeightBalanceToPayload, turbulenceWeatherEvidence, weatherAtAltitude, weightBalancePayloadLb, windComponentKt } from "../js/engine.js";
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



test("reported enroute moisture weighs duration without masking the affected FL", () => {
  const plan = {
    distanceNm: 60,
    waypoints: [
      { ident: "A", lat: 0, lon: 0, distanceNm: 0, oatC: -7, windLevels: [] },
      { ident: "B", lat: 0, lon: 1, distanceNm: 60, oatC: -7, windLevels: [] },
    ],
    meteorology: { enrouteText: "BKN030 -RA" },
  };
  const result = { altitudeFt: 14000, climb: { timeHr: 0, distanceNm: 0 }, descent: { timeHr: 0, distanceNm: 0 } };
  const slow = calculateIcingRisk({ plan, result: { ...result, gsKt: 50 } });
  const fast = calculateIcingRisk({ plan, result: { ...result, gsKt: 300 } });
  assert.ok(slow.riskScore > fast.riskScore);
  assert.ok(slow.exposureMinutes > fast.exposureMinutes);
  assert.equal(slow.confidence, "weather");
});



test("terminal cloud bases use airport elevation before comparing with flight altitude", () => {
  const plan = {
    distanceNm: 40,
    origin: { elevationFt: 5000 }, destination: { elevationFt: 5000 },
    waypoints: [
      { ident: "A", lat: 0, lon: 0, distanceNm: 0, oatC: -5, windLevels: [{ altitudeFt: 5000, oatC: -5 }, { altitudeFt: 10000, oatC: -10 }] },
      { ident: "B", lat: 0, lon: 0.5, distanceNm: 40, oatC: -5, windLevels: [{ altitudeFt: 5000, oatC: -5 }, { altitudeFt: 10000, oatC: -10 }] },
    ],
    meteorology: { originText: "METAR AAAA 171200Z BKN020 M05/M10 Q1018", destinationText: "", enrouteText: "" },
  };
  const icing = calculateIcingRisk({ plan, result: {
    altitudeFt: 6000, gsKt: 180, climb: { timeHr: 0.2, distanceNm: 10 }, descent: { timeHr: 0, distanceNm: 0 },
  } });
  assert.equal(icing.riskScore, 0);
  assert.equal(icing.confidence, "estimated");
});



test("ETP equalizes continue and return times and PNR respects route bounds", () => {
  const navigation = calculateEtpPnr({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.ok(Math.abs(navigation.etp.returnTimeHr - navigation.etp.continueTimeHr) < 0.001);
  assert.ok(navigation.legCount > 1);
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
  const calibration = deriveCalibration({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelRemainingGal: 60, altitudeFt: 18000, observedTasKt: 245, observedFuelFlowGph: 17.5, positionFix: DEMO_PLAN.waypoints[2] });
  assert.ok(calibration.tasFactor >= 0.85 && calibration.tasFactor <= 1.15);
  assert.ok(calibration.fuelFlowFactor >= 0.75 && calibration.fuelFlowFactor <= 1.3);
  const calibrated = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 60, reserveMinutes: 45, calibration });
  assert.ok(Math.abs(calibrated.fuelFlowGph - 17.5) < 0.01);
});



test("alternate and diversion advisor computes both legs and landing fuel", () => {
  const advice = calculateAlternateDiversion({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45, waypointIndex: 2 });
  assert.equal(advice.alternate.icao, "SBRJ");
  assert.ok(advice.destination.distanceNm > 0);
  assert.ok(advice.destination.fuelGal > 0);
  assert.ok(advice.destination.fuelGal > PERFORMANCE.diversion.missedApproachFuelGal + PERFORMANCE.diversion.approachFuelGal);
  assert.ok(advice.diversion.distanceNm > 0);
  assert.ok(Number.isFinite(advice.diversion.landingFuelGal));
});



test("remaining-route fuel status uses reported fuel without changing the planned mission", () => {
  const base = { plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 };
  const plannedFuel = calculateAtAltitude({ ...base, altitudeFt: 18000 }).fuelRequiredGal;
  const assess = (fuelRemainingGal, distanceNm = 100) => calculateRemainingFlightAssessment({ ...base,
    manual: { active: true, distanceNm, fuelRemainingGal, altitudeFt: 18000 } });
  assert.equal(assess(10).status, "not-viable");
  assert.equal(assess(24).status, "marginal");
  assert.equal(assess(30).status, "viable");
  assert.ok(assess(30, 150).requiredFuelGal < assess(30, 100).requiredFuelGal);
  assert.ok(assess(30).alternateFuelGal > 0);
  assert.equal(calculateAtAltitude({ ...base, altitudeFt: 18000 }).fuelRequiredGal, plannedFuel);
  assert.equal(calculateRemainingFlightAssessment({ ...base, manual: { active: false } }), null);
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



test("random load leaves the current stations untouched if none can be safe", () => {
  const load = { pilot: 1000, copilot: 0, rearLeft: 0, rearCenter: 0, rearRight: 0, baggage: 0 };
  assert.equal(randomizeWeightBalance({ weightBalance: load, fuelOnboardGal: 87, oxygenWeightLb: 28, maxAttempts: 20 }), null);
  assert.deepEqual(load, { pilot: 1000, copilot: 0, rearLeft: 0, rearCenter: 0, rearRight: 0, baggage: 0 });
  assert.equal(randomizeWeightBalance({ weightBalance: { pilot: 0 }, fuelOnboardGal: 77 }), null);
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



test("RIDE summarizes route exposure, flight phases, terminals, and tropopause", () => {
  const waypoint = (ident, lon, distanceNm, stage) => ({
    ident, lat: 0, lon, distanceNm, altitudeFt: 18000, stage, tropopauseFt: 19000,
    windLevels: [
      { altitudeFt: 16000, windDir: 190, windSpd: 18 },
      { altitudeFt: 20000, windDir: 260, windSpd: 52 },
    ],
  });
  const plan = {
    ...DEMO_PLAN,
    distanceNm: 120,
    scheduledOffMs: Date.parse("2026-10-17T12:00:00Z"),
    scheduledOnMs: Date.parse("2026-10-17T13:00:00Z"),
    waypoints: [waypoint("DEP", 0, 0, "CLB"), waypoint("A", .17, 10, "CRZ"), waypoint("B", 1.83, 110, "CRZ"), waypoint("ARR", 2, 120, "DSC")],
    meteorology: {
      origin: { taf: "TAF DEP 171100Z 1712/1812 18008KT CAVOK" },
      destination: { taf: "TAF ARR 171100Z 1712/1812 22012G28KT 9999 SCT030" },
      enrouteText: "",
    },
  };
  const result = calculateAtAltitude({ plan, altitudeFt: 18000, mode: "NORMAL", payloadLb: 300, fuelOnboardGal: 77, reserveMinutes: 45 });
  const ride = calculateTurbulenceRisk({ plan, result });
  assert.equal(ride.segments.length, 3);
  assert.deepEqual(ride.segments.map((segment) => segment.phase), ["climb", "cruise", "descent"]);
  assert.ok(ride.exposureMinutes > 0);
  assert.ok(ride.phaseExposureMinutes.cruise > 0);
  assert.equal(ride.tropopauseFt, 19000);
  assert.ok(ride.destination.riskScore >= 40);
  assert.ok(ride.coverage > 0);
});



test("RIDE reports missing OFP evidence instead of treating missing winds as calm", () => {
  const plan = {
    source: "SIMBRIEF", plannedAltitudeFt: 19000, meteorology: { enrouteText: "" },
    waypoints: [
      { ident: "A", lat: 0, lon: 0, windDir: Number.NaN, windSpd: Number.NaN, windLevels: [], shear: Number.NaN },
      { ident: "B", lat: 0, lon: 1, windDir: Number.NaN, windSpd: Number.NaN, windLevels: [], shear: Number.NaN },
    ],
  };
  const risk = calculateTurbulenceRisk({ plan, result: { altitudeFt: 16000 } });
  assert.equal(risk.status, "unknown");
  assert.equal(risk.riskScore, null);
  assert.equal(risk.confidence, "limited");
});



test("terrain data does not influence score or status", () => {
  const result = {
    feasibility: { reasons: [], fuelMarginGal: 10, status: "viable" },
    weightBalance: { status: "viable" },
    icing: { status: "watch", riskScore: 35, confidence: "weather" },
    turbulence: { status: "light", riskScore: 40, blocking: false, confidence: "weather" },
    oxygen: { status: "compliant" },
    terrain: { status: "viable" },
  };
  const selected = calculateMissionScore({ result });
  const changed = calculateMissionScore({ result: { ...result, terrain: { status: "not-viable", marginFt: -100 } } });
  assert.equal(selected.score, changed.score);
  assert.equal(selected.status, changed.status);
});



test("financial efficiency adds a bounded soft mission-score penalty", () => {
  const financial = calculateFinancialImpact({ currentCost: 125, minimumViableCost: 100 });
  assert.equal(financial.assessed, true);
  assert.equal(financial.efficiencyScore, 80);
  assert.equal(financial.penalty, 10);
  const result = {
    feasibility: { reasons: [], fuelMarginGal: 12, status: "viable" },
    weightBalance: { status: "viable" },
    icing: { status: "low", riskScore: 0, confidence: "weather" },
    turbulence: { status: "smooth", riskScore: 0, blocking: false, confidence: "weather" },
    oxygen: { status: "compliant" },
    terrain: { status: "viable" },
  };
  const score = calculateMissionScore({ result, confidence: { score: 100 }, financial });
  assert.equal(score.score, 90);
  assert.equal(score.status, "viable");
  assert.equal(score.reasons.find((reason) => reason.code === "financial")?.blocking, false);
  assert.equal(calculateFinancialImpact({ currentCost: null, minimumViableCost: 100 }).penalty, 0);
});
