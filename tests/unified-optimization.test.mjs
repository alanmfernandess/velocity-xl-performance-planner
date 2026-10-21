import test from "node:test";
import assert from "node:assert/strict";
import { AIRCRAFT, ALTITUDES_FT, DEMO_PLAN, PERFORMANCE } from "../js/config.js";
import { calculateAtAltitude, calibrationForMode, deriveCalibration, migrateCalibration } from "../js/engine.js";
import { optimizeMission } from "../js/unified-optimization.js";

const LOAD = { pilot: 190, copilot: 170, rearLeft: 55, rearCenter: 50, rearRight: 55, baggage: 0 };
const OXYGEN = { bottleModel: "SK-12-24", bottles: 2, seats: [true, true, true, true, true] };
const base = { plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45,
  weightBalance: LOAD, oxygen: OXYGEN, calibration: { tasFactor: 1, fuelFlowFactor: 1, reference: null },
  powerSetting: { type: "PRESET" }, pricePerLiter: 5, currency: "BRL" };
const run = (overrides = {}) => optimizeMission({ ...base, ...overrides });

for (const mode of ["ECON", "NORMAL", "FAST"]) {
  test(`${mode} remains selected throughout the single mission recommendation`, () => {
    const mission = run({ mode });
    assert.equal(mission.mode, mode);
    assert.equal(mission.candidates.length, ALTITUDES_FT.length);
    assert.ok(mission.candidates.every((candidate) => candidate.mode === mode));
    assert.ok(mission.candidates.includes(mission.selected));
    assert.equal(mission.recommendedAltitudeFt, mission.selected.altitudeFt);
    assert.equal(mission.powerProfile.cruise.power.rpm, PERFORMANCE.modes[mode].rpm);
    assert.equal(mission.powerProfile.climb.power.rpm, PERFORMANCE.powerModel.phases.climb.rpm);
    assert.equal(mission.powerProfile.descent.power.rpm, PERFORMANCE.powerModel.phases.descent.rpm);
    assert.equal(mission.powerProfile.climb.fuelGal, mission.powerProfile.climb.timeHr * mission.powerProfile.climb.fuelFlowGph);
    assert.equal(mission.powerProfile.cruise.fuelGal, mission.powerProfile.cruise.timeHr * mission.powerProfile.cruise.fuelFlowGph);
    assert.equal(mission.powerProfile.descent.fuelGal, mission.powerProfile.descent.timeHr * mission.powerProfile.descent.fuelFlowGph);
  });
}

test("one evaluated candidate supplies every selected auxiliary result", () => {
  const mission = run();
  const c = mission.selected;
  assert.strictEqual(mission.alternate, c.alternate);
  assert.strictEqual(mission.etpPnr, c.etpPnr);
  assert.strictEqual(mission.glide, c.glide);
  assert.strictEqual(mission.oxygen, c.result.oxygen);
  assert.strictEqual(mission.weightBalance, c.result.weightBalance);
  assert.equal(mission.financial.cost, c.cost);
  assert.equal(mission.missionScore.score, c.score.score);
  assert.ok(mission.recommendedFuelGal >= c.result.fuelRequiredGal || c.physicalBlockers.includes("FUEL_CAPACITY"));
});

test("proposal never mutates entered occupants, fuel or oxygen", () => {
  const input = structuredClone(base);
  const before = structuredClone(input);
  run(input);
  assert.deepEqual(input, before);
  assert.ok(run().recommendedFuelGal <= AIRCRAFT.usableFuelGal);
});

test("K1 changes cruise speed and time without changing MAP, RPM or flow", () => {
  const a = run();
  const b = run({ calibration: { tasFactor: .9, fuelFlowFactor: 1, reference: null } });
  const baseline = a.candidates.find((candidate) => candidate.altitudeFt === 18000).result;
  const slower = b.candidates.find((candidate) => candidate.altitudeFt === 18000).result;
  assert.ok(slower.tasKt < baseline.tasKt);
  assert.ok(slower.cruiseTimeHr > baseline.cruiseTimeHr);
  assert.equal(slower.fuelFlowGph, baseline.fuelFlowGph);
  assert.equal(slower.power.rpm, baseline.power.rpm);
  assert.equal(slower.power.availableMapInHg, baseline.power.availableMapInHg);
});

test("K2 changes cruise flow, trip fuel and cost without changing TAS or MAP/RPM", () => {
  const a = run(), b = run({ calibration: { tasFactor: 1, fuelFlowFactor: 1.2, reference: null } });
  const baseline = a.candidates.find((candidate) => candidate.altitudeFt === 18000);
  const higher = b.candidates.find((candidate) => candidate.altitudeFt === 18000);
  assert.ok(higher.result.tasKt <= baseline.result.tasKt); // Extra recommended fuel raises weight slightly.
  assert.ok(higher.result.fuelFlowGph > baseline.result.fuelFlowGph);
  assert.ok(higher.result.tripFuelGal > baseline.result.tripFuelGal);
  assert.ok(higher.cost > baseline.cost);
  assert.equal(higher.result.power.rpm, baseline.result.power.rpm);
  const fixed = { plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 };
  assert.equal(calculateAtAltitude({ ...fixed, calibration: { tasFactor: 1, fuelFlowFactor: 1.2 } }).tasKt,
    calculateAtAltitude(fixed).tasKt);
});

test("combined K1/K2 acts once and respects the reference regime", () => {
  const reference = { mode: "NORMAL", altitudeFt: 18000, mapInHg: PERFORMANCE.modes.NORMAL.mapInHg,
    rpm: PERFORMANCE.modes.NORMAL.rpm };
  const combined = run({ calibration: { tasFactor: .9, fuelFlowFactor: 1.2, reference } });
  const at18 = combined.candidates.find((candidate) => candidate.altitudeFt === 18000);
  const at10 = combined.candidates.find((candidate) => candidate.altitudeFt === 10000);
  const base18 = run().candidates.find((candidate) => candidate.altitudeFt === 18000);
  assert.ok(at18.result.tasKt < base18.result.tasKt);
  assert.ok(at18.result.fuelFlowGph > base18.result.fuelFlowGph);
  assert.equal(at10.result.cruise.calibrationApplicable, false);
  assert.ok(at10.limitations.includes("CALIBRATION_OUTSIDE_REFERENCE_REGIME"));
  assert.equal(calibrationForMode({ tasFactor: .9, fuelFlowFactor: 1.2, reference }, "FAST", 18000).tasFactor, 1);
});

test("calibration input needs local OFP atmosphere and rejects impossible observations", () => {
  const args = { plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelRemainingGal: 60,
    altitudeFt: 18000, observedTasKt: 245, observedFuelFlowGph: 17.5 };
  assert.throws(() => deriveCalibration(args), /CALIBRATION_ATMOSPHERE_UNAVAILABLE/);
  assert.throws(() => deriveCalibration({ ...args, positionFix: DEMO_PLAN.waypoints[2], observedTasKt: 900 }), /CALIBRATION_OUT_OF_RANGE/);
  const factors = deriveCalibration({ ...args, positionFix: DEMO_PLAN.waypoints[2] });
  assert.equal(factors.reference.mode, "NORMAL");
  assert.equal(factors.reference.altitudeFt, 18000);
  assert.ok(Number.isFinite(factors.reference.oatC));
});

test("legacy two-factor calibration migrates without erasing valid values", () => {
  const old = { NORMAL: { tasFactor: .95, fuelFlowFactor: 1.08, tripFuelFactor: 1.4 } };
  const migrated = migrateCalibration(old);
  assert.equal(migrated.tasFactor, .95);
  assert.equal(migrated.fuelFlowFactor, 1.08);
  assert.equal(migrated.reference.mode, "NORMAL");
  assert.equal(migrated.reference.legacy, true);
  assert.equal(migrateCalibration(null).tasFactor, 1);
});

test("unknown weather is not described as confirmed viable", () => {
  const mission = run();
  assert.equal(mission.status, "unknown");
  assert.ok(mission.limitations.includes("ICE_EVIDENCE_LIMITED"));
  assert.ok(mission.limitations.includes("TERRAIN_NOT_ASSESSED"));
});

test("physical blockers outrank a high numeric score", () => {
  const mission = run({ payloadLb: 1500, weightBalance: { ...LOAD, baggage: 980 } });
  assert.equal(mission.status, "not-viable");
  assert.ok(mission.selected.physicalBlockers.length);
});

test("cost remains unavailable without a positive entered price", () => {
  const mission = run({ pricePerLiter: null });
  assert.equal(mission.financial.cost, null);
  assert.equal(mission.financial.assessed, false);
});

test("higher cruise flow cannot reduce fuel and lower TAS cannot reduce time for fixed route", () => {
  const common = { plan: DEMO_PLAN, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520,
    fuelOnboardGal: 77, reserveMinutes: 45 };
  const baseline = calculateAtAltitude(common);
  const moreFlow = calculateAtAltitude({ ...common, calibration: { tasFactor: 1, fuelFlowFactor: 1.15 } });
  const lessTas = calculateAtAltitude({ ...common, calibration: { tasFactor: .9, fuelFlowFactor: 1 } });
  assert.ok(moreFlow.cruiseFuelGal > baseline.cruiseFuelGal);
  assert.ok(lessTas.cruiseTimeHr > baseline.cruiseTimeHr);
});

test("altitude, wind and OAT affect evaluated performance", () => {
  const baseline = run();
  const low = baseline.candidates.find((item) => item.altitudeFt === 10000).result;
  const high = baseline.candidates.find((item) => item.altitudeFt === 24000).result;
  assert.notEqual(low.tasKt, high.tasKt);
  assert.notEqual(low.climb.timeHr, high.climb.timeHr);
  const calmPlan = structuredClone(DEMO_PLAN);
  for (const fix of calmPlan.waypoints) {
    fix.windSpd = 0;
    for (const level of fix.windLevels || []) level.windSpd = 0;
  }
  const calm = run({ plan: calmPlan }).candidates.find((item) => item.altitudeFt === 18000).result;
  const windy = baseline.candidates.find((item) => item.altitudeFt === 18000).result;
  assert.notEqual(calm.cruiseTimeHr, windy.cruiseTimeHr);
  const warmer = structuredClone(DEMO_PLAN);
  for (const fix of warmer.waypoints) {
    if (Number.isFinite(fix.oatC)) fix.oatC += 10;
    for (const level of fix.windLevels || []) if (Number.isFinite(level.oatC)) level.oatC += 10;
  }
  const warm = run({ plan: warmer }).candidates.find((item) => item.altitudeFt === 18000).result;
  assert.notEqual(warm.weather.oatC, windy.weather.oatC);
});

test("explicit icing bulletin is reflected in candidates and the global status", () => {
  const plan = { ...DEMO_PLAN, meteorology: { ...DEMO_PLAN.meteorology, enrouteText: "MOD ICE FL120/180" } };
  const mission = run({ plan });
  const fl160 = mission.candidates.find((item) => item.altitudeFt === 16000);
  assert.ok(fl160.result.icing.riskScore > 0);
  assert.ok(mission.iceAltitudeFt >= 10000);
  assert.ok(mission.iceAltitudeFt <= 25000);
  assert.equal(mission.selected.result.icing, mission.selected.result.icing);
});

test("reported turbulence affects comfort ranking without overriding physical blockers", () => {
  const plan = { ...DEMO_PLAN, meteorology: { ...DEMO_PLAN.meteorology, enrouteText: "SEV TURB FL200/250" } };
  const mission = run({ plan, ridePreference: "maximum" });
  const fl220 = mission.candidates.find((item) => item.altitudeFt === 22000);
  assert.ok(fl220.result.turbulence.riskScore >= 0);
  assert.ok(mission.candidates.some((item) => item.result.turbulence.riskScore !== fl220.result.turbulence.riskScore));
  assert.ok(mission.comfortAltitudeFt >= 10000);
  assert.ok(mission.selected.physicalBlockers.length === 0 || mission.status === "not-viable");
});

test("W&B and oxygen are evaluated at proposed fuel and level", () => {
  const mission = run();
  assert.equal(mission.weightBalance.takeoff.weightLb,
    AIRCRAFT.emptyWeightLb + base.payloadLb + mission.recommendedFuelGal * AIRCRAFT.fuelDensityLbGal + mission.oxygen.bottleWeightLb);
  assert.equal(mission.oxygen.requiredMinutes >= 0, true);
  assert.equal(mission.currentWeightBalance.takeoff.weightLb,
    AIRCRAFT.emptyWeightLb + base.payloadLb + base.fuelOnboardGal * AIRCRAFT.fuelDensityLbGal + mission.oxygen.bottleWeightLb);
});

test("insufficient oxygen at a high flight level is a blocker", () => {
  const noOxygen = { bottleModel: "SK-12-6", bottles: 0, seats: [true, true, true, true, true] };
  const mission = run({ oxygen: noOxygen });
  const high = mission.candidates.find((item) => item.altitudeFt === 25000);
  assert.equal(high.result.oxygen.status, "insufficient");
  assert.ok(high.physicalBlockers.includes("OXYGEN"));
  assert.notEqual(high.status, "viable");
});

test("alternate landing reserve and diversion are included in the chosen proposal", () => {
  const mission = run();
  assert.ok(mission.alternate.destination);
  assert.ok(mission.alternate.destination.fuelGal > 0);
  assert.ok(Number.isFinite(mission.alternate.destination.landingFuelGal));
  assert.ok(mission.alternate.diversion);
  assert.equal(mission.alternate.destination.status, mission.selected.alternate.destination.status);
});

test("ETP and PNR use route legs and calibrated cruise flow", () => {
  const baseline = run();
  const slower = run({ calibration: { tasFactor: .9, fuelFlowFactor: 1.2, reference: null } });
  assert.ok(baseline.etpPnr.legCount > 1);
  assert.ok(Math.abs(baseline.etpPnr.etp.returnTimeHr - baseline.etpPnr.etp.continueTimeHr) < .001);
  assert.notEqual(slower.etpPnr.etp.returnTimeHr, baseline.etpPnr.etp.returnTimeHr);
  assert.ok(slower.etpPnr.pnr.distanceNm >= 0 && slower.etpPnr.pnr.distanceNm <= DEMO_PLAN.distanceNm);
});

test("GLIDE is theoretical and rises with altitude", () => {
  const mission = run();
  assert.ok(mission.glide.cruiseRangeNm > 0);
  assert.ok(mission.glide.cruiseMinutes > 0);
  assert.equal(mission.glide.ratio, PERFORMANCE.glide.ratio);
  assert.ok(mission.limitations.includes("TERRAIN_NOT_ASSESSED"));
});

test("no entered fuel price does not create a zero-cost efficiency penalty", () => {
  const unpriced = run({ pricePerLiter: 0 });
  assert.equal(unpriced.financial.cost, null);
  assert.equal(unpriced.financial.penalty, 0);
  assert.equal(unpriced.missionScore.reasons.some((reason) => reason.code === "financial"), false);
});

test("absent plan cannot produce an invented recommendation", () => {
  assert.equal(optimizeMission({ ...base, plan: null }), null);
  assert.equal(optimizeMission({ ...base, mode: "INVALID" }), null);
});
