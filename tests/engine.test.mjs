import test from "node:test";
import assert from "node:assert/strict";
import { calculateAtAltitude, calculatePlan, isaTemperatureC, weatherAtAltitude, windComponentKt } from "../js/engine.js";
import { DEMO_PLAN } from "../js/config.js";

test("ISA temperature follows standard lapse rate", () => {
  assert.equal(isaTemperatureC(0), 15);
  assert.ok(Math.abs(isaTemperatureC(10000) + 4.812) < 0.01);
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

test("plan evaluates FL100 through FL250 and selects winners", () => {
  const analysis = calculatePlan({ plan: DEMO_PLAN, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45 });
  assert.equal(analysis.results.length, 9);
  assert.equal(analysis.results[0].altitudeFt, 10000);
  assert.equal(analysis.results.at(-1).altitudeFt, 25000);
  assert.ok(analysis.winners.overall.score >= 0);
});
