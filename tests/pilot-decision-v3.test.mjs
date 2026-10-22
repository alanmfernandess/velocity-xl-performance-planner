import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, ALTITUDES_FT, DEMO_PLAN, PERFORMANCE } from '../js/config.js';
import { evaluateMissionAlternative, optimizeMission } from '../js/unified-optimization.js';
import { calibrationForMode } from '../js/engine.js';
import { PRESSURE_LEVELS, parseGfsResponse, representativePoints } from '../js/weather/open-meteo.js';
import { createWeatherSnapshot } from '../js/weather/fusion.js';

// Deterministic, complete clear-weather fixture. These are illustrative model inputs.
const times = Array.from({ length: 48 }, (_, i) => `2026-10-${i < 24 ? '21' : '22'}T${String(i % 24).padStart(2, '0')}:00`);
const units = { time: 'iso8601', cape: 'J/kg', freezing_level_height: 'm', precipitation: 'mm', cloud_cover: '%' };
const hourly = { time: times, cape: times.map(() => 0), freezing_level_height: times.map(() => 3000), precipitation: times.map(() => 0), cloud_cover: times.map(() => 0) };
for (const level of PRESSURE_LEVELS) {
  const metres = 44330 * (1 - (level / 1013.25) ** .1903);
  for (const [field, value, unit] of [
    ['temperature', 15 - .0065 * metres, '°C'], ['relative_humidity', 25, '%'],
    ['cloud_cover', 0, '%'], ['wind_speed', 20, 'kn'], ['wind_direction', 240, '°'],
    ['vertical_velocity', 0, 'm/s'], ['geopotential_height', metres, 'm'],
  ]) {
    const key = `${field}_${level}hPa`;
    units[key] = unit;
    hourly[key] = times.map(() => value);
  }
}
const plan = { ...DEMO_PLAN, ofpId: 'V3-CLEAR', scheduledOffMs: Date.parse('2026-10-21T12:00:00Z'), scheduledOnMs: Date.parse('2026-10-21T14:00:00Z') };
const points = representativePoints(plan);
const locations = parseGfsResponse(points.map(point => ({ latitude: point.lat, longitude: point.lon, hourly_units: units, hourly })), points.length);
const weatherSnapshot = createWeatherSnapshot(plan, { gfs: { status: 'available', locations } });
const base = { plan, mode: 'NORMAL', payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45,
  weightBalance: { pilot: 190, copilot: 170, rearLeft: 55, rearCenter: 50, rearRight: 55, baggage: 0 },
  oxygen: { bottleModel: 'SK-12-24', bottles: 2, seats: [true, true, true, true, true] },
  calibration: { tasFactor: 1, fuelFlowFactor: 1, reference: null }, powerSetting: { type: 'AUTO' },
  weatherSnapshot, pricePerLiter: 5, currency: 'BRL' };
const mission = optimizeMission(base);

for (const mode of ['ECON', 'NORMAL', 'FAST']) {
  test(`${mode} has nine separately calculated levels`, () => {
    const candidates = mission.candidates.filter(candidate => candidate.mode === mode);
    assert.deepEqual(candidates.map(candidate => candidate.altitudeFt), ALTITUDES_FT);
    assert.ok(candidates.every(candidate => candidate.result.power.rpm === PERFORMANCE.modes[mode].rpm));
    assert.ok(candidates.every(candidate => candidate.result.trajectory && candidate.etpPnr && candidate.glide && candidate.alternate));
  });
}

test('rank is deterministic and safety precedes score', () => {
  const again = optimizeMission(base);
  assert.deepEqual(again.ranked.map(candidate => `${candidate.altitudeFt}:${candidate.mode}`), mission.ranked.map(candidate => `${candidate.altitudeFt}:${candidate.mode}`));
  assert.equal(mission.candidates.length, 27);
  assert.ok(mission.ranked.every((candidate, i, ranked) => i === 0 || candidate.score.score <= ranked[i - 1].score.score || candidate.status !== ranked[i - 1].status));
});

test('Top 3 is three distinct eligible FLs with correct automatic winner', () => {
  assert.equal(mission.topLevels.length, 3);
  assert.equal(new Set(mission.topLevels.map(candidate => candidate.altitudeFt)).size, 3);
  assert.ok(mission.topLevels.every(candidate => candidate.status === 'viable' && candidate.eligibility.status === 'ELIGIBLE'));
  assert.strictEqual(mission.automaticRecommendation, mission.selected);
  assert.strictEqual(mission.topLevels[0], mission.selected);
});

test('each preset at one FL has its own power, TAS, fuel, score and trajectory', () => {
  const candidates = ['ECON', 'NORMAL', 'FAST'].map(mode => mission.candidates.find(candidate => candidate.altitudeFt === 18000 && candidate.mode === mode));
  assert.equal(new Set(candidates.map(candidate => candidate.result.power.rpm)).size, 3);
  assert.equal(new Set(candidates.map(candidate => candidate.result.tasKt)).size, 3);
  assert.equal(new Set(candidates.map(candidate => candidate.result.tripFuelGal)).size, 3);
  assert.ok(candidates.every(candidate => candidate.result.missionScore === candidate.score));
  assert.equal(new Set(candidates.map(candidate => candidate.result.icing)).size, 3);
  assert.equal(new Set(candidates.map(candidate => candidate.result.turbulence)).size, 3);
  assert.ok(candidates.every(candidate => Math.abs(candidate.result.trajectory.timeHr - candidate.result.tripTimeHr) < 1e-6));
});

test('pilot preset analysis reuses only the matching fully evaluated candidate', () => {
  const input = { ...base, mode: 'FAST' };
  const choice = evaluateMissionAlternative(mission, input, { altitudeFt: 18000, mode: 'FAST' });
  assert.strictEqual(choice, mission.candidates.find(candidate => candidate.altitudeFt === 18000 && candidate.mode === 'FAST'));
  assert.strictEqual(mission.automaticRecommendation, mission.topLevels[0]);
  assert.equal(mission.mode, 'NORMAL');
  assert.equal(input.mode, 'FAST');
});

test('manual MAP/RPM recomputes performance, trajectory and score without changing the snapshot', () => {
  const before = mission.automaticRecommendation;
  const automatic = mission.candidates.find(candidate => candidate.altitudeFt === 18000 && candidate.mode === 'NORMAL');
  const manual = evaluateMissionAlternative(mission, base, { altitudeFt: 18000, mode: 'MANUAL', mapInHg: 25.5, rpm: 2475 });
  assert.equal(manual.mode, 'MANUAL');
  assert.notStrictEqual(manual.result, automatic.result);
  assert.notEqual(manual.result.tasKt, automatic.result.tasKt);
  assert.notEqual(manual.result.fuelFlowGph, automatic.result.fuelFlowGph);
  assert.ok(manual.result.trajectory && manual.score && manual.etpPnr && manual.alternate);
  assert.strictEqual(mission.automaticRecommendation, before);
  assert.equal(mission.candidates.length, 27);
});

test('manual MAP/RPM rejects readings outside the model limits', () => {
  assert.throws(() => evaluateMissionAlternative(mission, base, { altitudeFt: 18000, mode: 'MANUAL', mapInHg: 99, rpm: 2475 }), /INVALID_MANUAL_POWER/);
  assert.throws(() => evaluateMissionAlternative(mission, base, { altitudeFt: 18000, mode: 'MANUAL', mapInHg: 25, rpm: 100 }), /INVALID_MANUAL_POWER/);
  assert.throws(() => evaluateMissionAlternative(mission, base, { altitudeFt: 9000, mode: 'NORMAL' }), /INVALID_SCENARIO_ALTITUDE/);
});

test('K1/K2 apply only around the measured cruise regime', () => {
  const reference = { mode: 'NORMAL', altitudeFt: 18000, mapInHg: PERFORMANCE.modes.NORMAL.mapInHg, rpm: PERFORMANCE.modes.NORMAL.rpm };
  const calibrated = optimizeMission({ ...base, calibration: { tasFactor: .92, fuelFlowFactor: 1.08, reference } });
  const normal = calibrated.candidates.find(candidate => candidate.altitudeFt === 18000 && candidate.mode === 'NORMAL');
  const econ = calibrated.candidates.find(candidate => candidate.altitudeFt === 18000 && candidate.mode === 'ECON');
  assert.equal(normal.result.cruise.calibrationApplicable, true);
  assert.equal(econ.result.cruise.calibrationApplicable, false);
  assert.equal(calibrationForMode({ tasFactor: .92, fuelFlowFactor: 1.08, reference: { ...reference, legacy: true } }, 'NORMAL', 18000).applicable, false);
});

test('missing weather cannot create trophies or a confirmed recommendation', () => {
  const unknown = optimizeMission({ ...base, weatherSnapshot: createWeatherSnapshot(plan) });
  assert.equal(unknown.selected, null);
  assert.equal(unknown.topLevels.length, 0);
  assert.equal(unknown.status, 'unknown');
  assert.ok(unknown.candidates.every(candidate => candidate.status === 'unknown' || candidate.status === 'not-viable'));
  assert.ok(unknown.candidates.filter(candidate => candidate.status === 'unknown').every(candidate => candidate.eligibility.status === 'UNKNOWN'));
});

test('fuel capacity, W&B and oxygen blockers cannot enter Top 3', () => {
  const heavy = optimizeMission({ ...base, payloadLb: 1500, weightBalance: { ...base.weightBalance, baggage: 980 } });
  assert.equal(heavy.topLevels.length, 0);
  assert.equal(heavy.selected, null);
  assert.ok(heavy.candidates.every(candidate => candidate.physicalBlockers.length > 0));
  const noOxygen = optimizeMission({ ...base, oxygen: { ...base.oxygen, bottles: 0 } });
  assert.ok(noOxygen.candidates.filter(candidate => candidate.physicalBlockers.includes('OXYGEN')).every(candidate => candidate.status === 'not-viable'));
  assert.ok(mission.candidates.every(candidate => candidate.recommendedFuelGal <= AIRCRAFT.usableFuelGal));
});


test('fewer than three eligible levels are shown without invented trophies', () => {
  const limited = optimizeMission({ ...base, oxygen: { ...base.oxygen, bottles: 0 } });
  assert.ok(limited.topLevels.length < 3);
  assert.equal(new Set(limited.topLevels.map(candidate => candidate.altitudeFt)).size, limited.topLevels.length);
  assert.ok(limited.topLevels.every(candidate => candidate.status === 'viable'));
});

test('another OFP produces a different weather identity', () => {
  const otherPlan = { ...plan, ofpId: 'V3-OTHER' };
  const other = optimizeMission({ ...base, plan: otherPlan, weatherSnapshot: createWeatherSnapshot(otherPlan, { gfs: { status: 'available', locations } }) });
  assert.notEqual(other.ofpId, mission.ofpId);
  assert.notEqual(other.plan.ofpId, mission.plan.ofpId);
});
