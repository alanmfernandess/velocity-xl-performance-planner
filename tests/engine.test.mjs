import test from "node:test";
import assert from "node:assert/strict";
import { calculateAtAltitude, calculateEtpPnr, calculatePlan, calculateStepClimbs, densityAltitudeFt, deriveCalibration, isaTemperatureC, powerAtAltitude, weatherAtAltitude, windComponentKt } from "../js/engine.js";
import { DEMO_PLAN } from "../js/config.js";

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
});

test("simple calibration derives bounded TAS and fuel-flow factors", () => {
  const calibration = deriveCalibration({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelRemainingGal: 60, altitudeFt: 18000, observedTasKt: 245, observedFuelFlowGph: 17.5 });
  assert.ok(calibration.tasFactor >= 0.85 && calibration.tasFactor <= 1.15);
  assert.ok(calibration.fuelFlowFactor >= 0.75 && calibration.fuelFlowFactor <= 1.3);
  const calibrated = calculateAtAltitude({ plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 60, reserveMinutes: 45, calibration: { NORMAL: calibration } });
  assert.ok(Math.abs(calibrated.fuelFlowGph - 17.5) < 0.01);
});
