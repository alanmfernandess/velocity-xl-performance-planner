import test from "node:test";
import assert from "node:assert/strict";
import { optimizeMission } from "../js/unified-optimization.js";
import { parseSimBrief, retimeSimBriefPlan } from "../js/simbrief.js";
import { buildTrajectory } from "../js/trajectory.js";
import { buildMissionProfile, sampleMissionDistance, sampleMissionTime, resolveProfileWaypoints,
  searchProfileWaypoints, clusterProfileWaypoints, smoothProfileGeometry, profileWeatherLayers } from "../js/mission-profile.js";
import { buildMissionEvents, missionAdvisor } from "../js/mission-events.js";
import { evaluateDepartureScenario } from "../js/mission-time.js";
import { profileFixture } from "./fixtures/mission-profile.mjs";

const fixture = profileFixture();
const mission = optimizeMission(fixture.input);
const candidate = mission.candidates.find((c) => c.altitudeFt === 18000 && c.mode === "NORMAL");
const model = buildMissionProfile(fixture.plan, candidate);
const close = (a, b, delta = 1e-7) => assert.ok(Math.abs(a - b) <= delta, `${a} != ${b}`);

test("profile starts and ends at real airport elevations and preserves TOC/TOD", () => {
  assert.equal(model.valid, true);
  close(model.nodes[0].altitudeFt, fixture.plan.origin.elevationFt);
  close(model.nodes.at(-1).altitudeFt, fixture.plan.destination.elevationFt);
  for (const distance of [model.profile.tocNm, model.profile.todNm]) close(sampleMissionDistance(model, distance).altitudeFt, candidate.altitudeFt);
  close(model.profile.tocNm, candidate.result.trajectory.tocNm);
  close(model.profile.todNm, candidate.result.trajectory.todNm);
  assert.ok(model.minFt <= fixture.plan.destination.elevationFt && model.maxFt >= candidate.altitudeFt);
});

test("distance/time inverse follows individual integration sections and is monotonic", () => {
  let lastTime = -1, lastUsed = -1, lastRemaining = Infinity;
  for (let i = 0; i <= 300; i++) {
    const distance = model.totalNm * i / 300;
    const point = sampleMissionDistance(model, distance);
    close(sampleMissionTime(model, point.elapsedSec).distanceNm, distance);
    assert.ok(point.elapsedSec >= lastTime && point.fuelUsedGal >= lastUsed && point.fuelRemainingGal <= lastRemaining);
    lastTime = point.elapsedSec; lastUsed = point.fuelUsedGal; lastRemaining = point.fuelRemainingGal;
  }
  const midpoint = sampleMissionDistance(model, model.totalNm / 2);
  assert.ok(Math.abs(midpoint.elapsedSec - model.totalSec / 2) > 10, "must not use proportional trip time");
});

test("fuel totals and every phase transition are continuous", () => {
  const end = sampleMissionDistance(model, model.totalNm);
  close(end.fuelUsedGal, candidate.result.tripFuelGal);
  close(end.fuelRemainingGal, candidate.recommendedFuelGal - 2.2 - candidate.result.tripFuelGal);
  for (const segment of model.profile.segments.slice(0, -1)) {
    const before = sampleMissionTime(model, segment.endSec - .00001), after = sampleMissionTime(model, segment.endSec + .00001);
    close(before.fuelUsedGal, after.fuelUsedGal, .00001);
    close(before.distanceNm, after.distanceNm, .00001);
    close(before.altitudeFt, after.altitudeFt, .01);
  }
});

test("queries clamp bounds and reject nonfinite values", () => {
  close(sampleMissionDistance(model, -5).distanceNm, 0);
  close(sampleMissionDistance(model, model.totalNm * 2).distanceNm, model.totalNm);
  assert.equal(sampleMissionDistance(model, NaN), null);
  assert.equal(sampleMissionTime(model, Infinity), null);
  assert.equal(buildMissionProfile(null, candidate).valid, false);
});

test("missing UTC gives relative duration and fuel without inventing ETA", () => {
  const noTime = buildMissionProfile({ ...fixture.plan, scheduledOffMs: NaN }, candidate);
  assert.equal(sampleMissionDistance(noTime, 100).timestampMs, null);
  assert.ok(sampleMissionDistance(noTime, 100).elapsedSec > 0);
});

test("a profile with overlapping phases is explicitly unavailable", () => {
  const short = buildMissionProfile({ ...fixture.plan, distanceNm: 1 }, candidate);
  assert.equal(short.valid, false);
  assert.equal(short.reason, "PROFILE_PHASE_OVERLAP");
});

test("zero cruise preserves coincident phase limits without fictitious distance", () => {
  const r = structuredClone(candidate.result);
  r.cruise = { ...r.cruise, distanceNm: 0, timeHr: 0, fuelGal: 0, sections: [] };
  r.tripFuelGal = r.climb.fuelGal + r.descent.fuelGal;
  r.tripTimeHr = r.climb.timeHr + r.descent.timeHr;
  const plan = { ...fixture.plan, distanceNm: r.climb.distanceNm + r.descent.distanceNm };
  r.trajectory = buildTrajectory(plan, r);
  const noCruise = buildMissionProfile(plan, { ...candidate, result: r });
  assert.equal(noCruise.valid, true);
  close(noCruise.profile.tocNm, noCruise.profile.todNm);
  assert.ok(!buildMissionEvents(noCruise, {}).some((e) => e.type === "TOD"));
});

test("Hermite geometry crosses every engine node with no overshoot or fake negative altitudes", () => {
  const geometry = smoothProfileGeometry(model, { left: 10, right: 200, top: 40, bottom: 220 });
  assert.ok(!/NaN|Infinity/.test(geometry.path));
  for (const segment of geometry.segments) {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, { a, b, c1, c2 } = segment;
      const altitude = (1 - t) ** 3 * a.altitudeFt + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * b.altitudeFt;
      assert.ok(altitude >= Math.min(a.altitudeFt, b.altitudeFt) - 1e-6);
      assert.ok(altitude <= Math.max(a.altitudeFt, b.altitudeFt) + 1e-6);
      assert.ok(Math.abs(altitude - (a.altitudeFt + (b.altitudeFt - a.altitudeFt) * t)) < 21);
      assert.ok(geometry.y(altitude) >= 40 - 1e-6 && geometry.y(altitude) <= 220 + 1e-6);
      if (t === 0) close(altitude, a.altitudeFt);
      if (t === 1) close(altitude, b.altitudeFt);
      if (a.altitudeFt === b.altitudeFt) close(altitude, a.altitudeFt);
    }
  }
  assert.ok(geometry.area.startsWith(geometry.path));
});

for (const count of [0, 1, 8, 48, 84, 150]) test(`${count} OFP waypoints preserve order, search, selection and pixel grouping`, () => {
  const { plan } = profileFixture(count);
  const profile = buildMissionProfile(plan, candidate);
  assert.equal(profile.waypoints.filter((p) => p.id.startsWith("ofp-fix-")).length, count);
  assert.equal(profile.waypoints[0].ident, plan.origin.icao);
  assert.equal(profile.waypoints.at(-1).ident, plan.destination.icao);
  const located = profile.waypoints.filter((p) => p.located);
  assert.ok(located.every((p, i) => !i || p.distanceNm >= located[i - 1].distanceNm));
  for (const point of located) close(point.predicted.elapsedSec, sampleMissionDistance(profile, point.distanceNm).elapsedSec);
  const mobile = clusterProfileWaypoints(profile.waypoints, profile.totalNm, 180);
  const desktop = clusterProfileWaypoints(profile.waypoints, profile.totalNm, 1000);
  assert.equal(mobile.flatMap((g) => g.points).length, located.length);
  if (count > 30) { assert.ok(mobile.length < count); assert.ok(desktop.length > mobile.length); }
  if (count > 8) assert.equal(searchProfileWaypoints(profile, "fix010")[0].ident, "FIX010");
});

test("duplicate fixes remain distinct and a selected fix is never hidden in a cluster", () => {
  const p = structuredClone(fixture.plan);
  p.ofpWaypoints.splice(3, 0, { ...p.ofpWaypoints[2] });
  const points = resolveProfileWaypoints(p, model.totalNm).waypoints;
  assert.equal(points.length, 9);
  assert.notEqual(points[2].id, points[3].id);
  const clusters = clusterProfileWaypoints(points, model.totalNm, 100, points[3].id);
  assert.equal(clusters.find((g) => g.points.some((point) => point.id === points[3].id)).points.length, 1);
});

test("missing coordinates are retained; reliable cumulative distance may still be used", () => {
  const raw = structuredClone(fixture.raw); delete raw.navlog[2].pos_lat; delete raw.navlog[2].pos_long;
  const p = parseSimBrief(raw);
  assert.equal(p.ofpWaypoints.length, 8);
  assert.equal(p.waypoints.length, 7);
  const point = buildMissionProfile(p, candidate).waypoints[2];
  assert.equal(point.coordinatesValid, false); assert.equal(point.located, true);
  delete raw.navlog[2].cum_distance;
  const unresolved = buildMissionProfile(parseSimBrief(raw), candidate).waypoints[2];
  assert.equal(unresolved.predicted, null);
});

test("nonmonotonic distances use a complete coordinate path or remain unlocated", () => {
  const p = structuredClone(fixture.plan); p.ofpWaypoints[3].distanceNm = 1;
  const resolved = resolveProfileWaypoints(p, 246);
  assert.equal(resolved.distanceReference.method, "GEOMETRIC_RECONCILED");
  p.ofpWaypoints[3].lat = NaN;
  const unresolved = resolveProfileWaypoints(p, 246);
  assert.equal(unresolved.distanceReference.method, "UNRESOLVED");
  assert.ok(unresolved.waypoints.slice(1, -1).every((point) => !point.located));
});

test("a different OFP distance reference is scaled explicitly", () => {
  const p = structuredClone(fixture.plan); p.ofpWaypoints.forEach((point) => { point.distanceNm *= 2; });
  const result = resolveProfileWaypoints(p, 246);
  close(result.distanceReference.scale, .5);
  assert.ok(result.diagnostics.includes("OFP_DISTANCE_RESCALED"));
  close(result.waypoints.at(-1).distanceNm, 246);
});

test("layers and events reference existing scores and exact trajectory timestamps", () => {
  const layers = profileWeatherLayers(model, fixture.snapshot);
  assert.ok(layers.METEO.some((s) => s.known));
  const events = buildMissionEvents(model, layers);
  for (const event of events) {
    close(event.utcMs, sampleMissionDistance(model, event.distanceNm).timestampMs, .01);
    close(event.altitudeFt, sampleMissionDistance(model, event.distanceNm).altitudeFt);
  }
  assert.ok(events.every((e, i) => !i || e.distanceNm >= events[i - 1].distanceNm));
  assert.equal(events.find((e) => e.type === "ARRIVAL").reference, fixture.plan.destination.icao);
  assert.ok(!events.some((e) => e.type === "ICE_ENTRY"));
});

test("unknown weather stays unknown and produces no fabricated safe bands", () => {
  const f = profileFixture(8, { missingMoisture: true });
  const m = optimizeMission(f.input), c = m.candidates[0], profile = buildMissionProfile(f.plan, c);
  assert.equal(c.eligibility.status, "UNKNOWN");
  const layers = profileWeatherLayers(profile, f.snapshot);
  assert.ok(layers.METEO.every((span) => !span.known));
  assert.equal(missionAdvisor(c, m).priority, 2);
});

for (const offsetHours of [0, 1, 2, 3]) test(`departure +${offsetHours}h reuses forecast with valid UTC and production evaluator`, () => {
  const scenario = evaluateDepartureScenario({ mission, input: fixture.input, candidate, offsetHours });
  assert.equal(scenario.available, true, scenario.reason);
  assert.equal(scenario.startMs, fixture.plan.scheduledOffMs + offsetHours * 3600_000);
  assert.strictEqual(scenario.forecast, fixture.snapshot.gfs);
  assert.ok(scenario.converged && scenario.iterations <= 8);
  assert.equal(new Date(scenario.startMs).getUTCDate(), offsetHours ? 22 : 21);
  assert.notEqual(scenario.candidate.result.gsKt, candidate.result.gsKt);
});

test("time scenarios do not mutate original ranking, score, OFP or weather snapshot", () => {
  const before = JSON.stringify({ plan: fixture.plan, ranked: mission.ranked, weather: fixture.snapshot });
  evaluateDepartureScenario({ mission, input: fixture.input, candidate, offsetHours: 2 });
  assert.equal(JSON.stringify({ plan: fixture.plan, ranked: mission.ranked, weather: fixture.snapshot }), before);
  assert.equal(mission.candidates.length, 27);
});

test("expired forecast and missing UTC cannot yield a confirmed scenario", () => {
  const expired = { ...fixture.input, plan: { ...fixture.plan, scheduledOffMs: Date.parse("2026-10-30T12:00Z") } };
  const result = evaluateDepartureScenario({ mission, input: expired, candidate, offsetHours: 1 });
  assert.equal(result.available, false); assert.equal(result.reason, "OUTSIDE_FORECAST_WINDOW");
  const missing = evaluateDepartureScenario({ mission, input: { ...fixture.input, plan: { ...fixture.plan, scheduledOffMs: NaN } }, candidate, offsetHours: 1 });
  assert.equal(missing.available, false); assert.equal(missing.reason, "MISSING_FLIGHT_TIME");
});

test("a nonconvergent solve is not presented as a valid comparison", () => {
  const scenario = evaluateDepartureScenario({ mission, input: fixture.input, candidate, offsetHours: 1,
    settings: { maxIterations: 1, timeToleranceSec: 0, fuelToleranceGal: 0 } });
  assert.equal(scenario.available, false); assert.equal(scenario.reason, "TIME_SOLVER_NOT_CONVERGED");
});

test("an advisory outside the original flight can enter the shifted scenario", () => {
  const source = { start: "2026-10-22T02:00Z", end: "2026-10-22T05:00Z", text: "TEST ADVISORY" };
  const plan = { ...fixture.plan, meteorology: { ...fixture.plan.meteorology, advisorySources: [source] } };
  const shifted = retimeSimBriefPlan(plan, Date.parse("2026-10-22T02:30Z"), Date.parse("2026-10-22T04:00Z"));
  assert.equal(shifted.meteorology.enrouteBulletins[0], "TEST ADVISORY");
  assert.equal(plan.meteorology.enrouteBulletins.length, 0);
});

test("physical constraints precede missing evidence and high scores in Advisor", () => {
  const blocked = { ...candidate, physicalBlockers: ["OXYGEN"], eligibility: { status: "INCOMPATIBLE" }, score: { ...candidate.score, score: 100 } };
  assert.equal(missionAdvisor(blocked, mission).priority, 1);
  assert.equal(missionAdvisor(blocked, mission).code, "OXYGEN");
});

test("partial coordinate interpolation stays between trusted OFP distance anchors", () => {
  const plan = structuredClone(fixture.plan);
  plan.ofpWaypoints[1].distanceNm = 1;
  plan.ofpWaypoints[2].distanceNm = NaN;
  plan.ofpWaypoints[3].distanceNm = 3;
  const resolved = resolveProfileWaypoints(plan, model.totalNm);
  assert.ok(resolved.waypoints[2].distanceNm >= 1 && resolved.waypoints[2].distanceNm <= 3);
  assert.equal(resolved.waypoints[2].distanceSource, "GEOMETRIC_BETWEEN_OFP_ANCHORS");
});

test("invalid coordinates and airport/profile mismatches remain unavailable", () => {
  const invalid = structuredClone(candidate); invalid.result.trajectory.route[1].lat = 91;
  assert.equal(buildMissionProfile(fixture.plan, invalid).reason, "ROUTE_COORDINATES_INVALID");
  const belowSea = { ...fixture.plan, origin: { ...fixture.plan.origin, elevationFt: -500 } };
  assert.equal(buildMissionProfile(belowSea, candidate).reason, "AIRPORT_ALTITUDE_PROFILE_MISMATCH");
  assert.equal(buildMissionProfile({ ...fixture.plan, distanceNm: 0 }, candidate).valid, false);
});

test("missing identifiers are not replaced by invented navigation fixes", () => {
  const raw = structuredClone(fixture.raw); delete raw.navlog[2].ident;
  const parsed = parseSimBrief(raw), p = buildMissionProfile(parsed, candidate);
  assert.equal(p.waypoints[2].ident, null);
  assert.equal(p.waypoints.length, 8);
});

test("missing wind is diagnosed as missing atmosphere rather than COVERED", () => {
  const snapshot = structuredClone(fixture.snapshot);
  for (const location of snapshot.gfs.locations) for (const key of Object.keys(location.hourly))
    if (key.startsWith("wind_speed_")) location.hourly[key] = location.times.map(() => null);
  const scenario = evaluateDepartureScenario({ mission: { ...mission, weatherSnapshot: snapshot }, input: fixture.input, candidate, offsetHours: 1 });
  assert.equal(scenario.available, false);
  assert.equal(scenario.reason, "ATMOSPHERIC_FIELDS_MISSING");
});

test("spatial/vertical forecast gaps and a stale AWC do not manufacture weather events", () => {
  const snapshot = structuredClone(fixture.snapshot);
  snapshot.gfs.locations.forEach((point) => { point.lat = 50; point.lon = 90; });
  const scenario = evaluateDepartureScenario({ mission: { ...mission, weatherSnapshot: snapshot }, input: fixture.input, candidate, offsetHours: 1 });
  assert.equal(scenario.available, false); assert.equal(scenario.reason, "OUTSIDE_SPATIAL_COVERAGE");
  const vertical = structuredClone(fixture.snapshot);
  for (const location of vertical.gfs.locations) for (const key of Object.keys(location.hourly))
    if (key.startsWith("geopotential_height_")) location.hourly[key] = location.times.map((_, i) => 100 + i);
  const noHeight = evaluateDepartureScenario({ mission: { ...mission, weatherSnapshot: vertical }, input: fixture.input, candidate, offsetHours: 1 });
  assert.equal(noHeight.available, false); assert.equal(noHeight.reason, "OUTSIDE_VERTICAL_COVERAGE");
  const stale = { ...fixture.snapshot, awc: { status: "stale", sigmets: [], pireps: [] } };
  const layers = profileWeatherLayers(model, stale);
  assert.ok(!buildMissionEvents(model, layers).some((e) => e.type === "ICE_ENTRY"));
});

test("positive assessed samples survive partial segment coverage without a new risk score", () => {
  const copied = structuredClone(candidate);
  const originalScore = copied.result.icing.riskScore;
  copied.result.icing.profileSamples.forEach((sample, index) => {
    sample.evidenceAvailable = index === 3; sample.riskScore = index === 3 ? 70 : 0;
  });
  const profile = buildMissionProfile(fixture.plan, copied), layers = profileWeatherLayers(profile, fixture.snapshot);
  assert.equal(layers.ICE.filter((point) => point.known).length, 1);
  assert.ok(buildMissionEvents(profile, layers).some((event) => event.type === "ICE_ENTRY"));
  assert.equal(copied.result.icing.riskScore, originalScore);
});

test("a temporal comparison with incomplete moisture cannot promote UNKNOWN", () => {
  const f = profileFixture(8, { missingMoisture: true }), m = optimizeMission(f.input);
  const original = m.candidates.find((c) => c.altitudeFt === 18000 && c.mode === "NORMAL");
  const scenario = evaluateDepartureScenario({ mission: m, input: f.input, candidate: original, offsetHours: 1 });
  assert.equal(scenario.available, true);
  assert.equal(scenario.candidate.eligibility.status, "UNKNOWN");
  assert.equal(scenario.candidate.score.partial, true);
});
