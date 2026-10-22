import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEMO_PLAN, PERFORMANCE } from "../js/config.js";
import { calculateAtAltitude, calculateEtpPnr } from "../js/engine.js";
import { optimizeMission } from "../js/unified-optimization.js";
import { buildTrajectory } from "../js/trajectory.js";
import { buildGfsUrl, fetchGfsSnapshot, parseGfsResponse, representativePoints, sampleGfs } from "../js/weather/open-meteo.js";
import { awcEvidenceAt, normalizeSigmet, parseAwcSnapshot } from "../js/weather/awc.js";
import { createWeatherSnapshot } from "../js/weather/fusion.js";

const gfsRaw = JSON.parse(await readFile(new URL("./fixtures/open-meteo-gfs-2026-10-21.json", import.meta.url)));
const start = Date.parse("2026-10-21T00:00:00Z");
const plan = { ...DEMO_PLAN, scheduledOffMs: start, scheduledOnMs: start + 2 * 3600_000 };
const input = { plan, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45,
  weightBalance: { pilot: 190, copilot: 170, rearLeft: 55, rearCenter: 50, rearRight: 55, baggage: 0 },
  oxygen: { bottleModel: "SK-12-24", bottles: 2, seats: [true, true, true, true, true] } };

test("real GFS response shape preserves units, pressure height and missing coverage", () => {
  const locations = parseGfsResponse(gfsRaw, 2);
  const snapshot = { status: "available", locations };
  const actual = sampleGfs(snapshot, { lat: 40, lon: -74, altitudeFt: 18000, timestampMs: locations[0].times[2] });
  assert.ok(actual.oatC < 0 && actual.oatC > -40);
  assert.ok(actual.windSpd > 0);
  assert.equal(actual.source, "OPEN_METEO");
  assert.equal(sampleGfs(snapshot, { lat: 40, lon: -74, altitudeFt: 60000, timestampMs: locations[0].times[2] }), null);
  assert.equal(sampleGfs(snapshot, { lat: 40, lon: -74, altitudeFt: 18000, timestampMs: locations[0].times[0] - 3600_000 }), null);
  assert.throws(() => parseGfsResponse([{ ...gfsRaw[0], hourly_units: { ...gfsRaw[0].hourly_units, geopotential_height_500hPa: "ft" } }], 1), /unit/);
});

test("GFS queries locations together and never one request per FL", () => {
  const points = representativePoints(plan);
  const url = buildGfsUrl(points);
  assert.ok(points.length >= 2 && points.length <= 16);
  assert.equal(new URL(url).searchParams.get("latitude")?.split(",").length, points.length);
  assert.match(url, /geopotential_height_400hPa/);
  const withAlternate = representativePoints({ ...plan, alternates: [{ icao: "ALTN", lat: -22.8, lon: -42.2 }] });
  assert.ok(withAlternate.some((point) => Math.abs(point.lon + 42.2) < .001));
  assert.ok(withAlternate.length <= 16);
});

test("GFS deduplicates simultaneous requests and retries a rate limit", async () => {
  const samplePlan = { origin: { lat: 42, lon: -74 }, destination: { lat: 42.2, lon: -73.8 }, waypoints: [] };
  let requests = 0;
  const fetcher = async () => {
    requests += 1;
    if (requests === 1) return { ok: false, status: 429 };
    return { ok: true, json: async () => gfsRaw.map((location, index) => ({ ...location,
      latitude: index ? 42.2 : 42, longitude: index ? -73.8 : -74 })) };
  };
  const [a, b] = await Promise.all([fetchGfsSnapshot(samplePlan, { fetcher }), fetchGfsSnapshot(samplePlan, { fetcher })]);
  assert.strictEqual(a, b);
  assert.equal(a.locations.length, 2);
  assert.equal(requests, 2);
  await fetchGfsSnapshot(samplePlan, { fetcher });
  assert.equal(requests, 2);
});

test("AWC official SIGMET applies only inside polygon, valid interval and altitude", () => {
  const raw = { generatedAt: new Date(start).toISOString(), sigmets: [{ hazard: "ICE", base: 5000, top: 12000,
    validTimeFrom: (start - 3600_000) / 1000, validTimeTo: (start + 3 * 3600_000) / 1000,
    coords: [{ lat: -24, lon: -47 }, { lat: -24, lon: -42 }, { lat: -22, lon: -42 }, { lat: -22, lon: -47 }] }], pireps: [] };
  const snapshot = parseAwcSnapshot(raw, start + 60_000);
  const inside = { lat: -23.5, lon: -46, altitudeFt: 9000, timestampMs: start };
  assert.equal(awcEvidenceAt(snapshot, inside).length, 1);
  assert.equal(awcEvidenceAt(snapshot, { ...inside, altitudeFt: 18000 }).length, 0);
  assert.equal(awcEvidenceAt(snapshot, { ...inside, lon: -60 }).length, 0);
  assert.equal(awcEvidenceAt(snapshot, { ...inside, timestampMs: start + 5 * 3600_000 }).length, 0);
  assert.equal(parseAwcSnapshot(raw, start + 3 * 3600_000).status, "stale");
  assert.equal(normalizeSigmet({ validTimeFrom: "bad", validTimeTo: "bad" }), null);
});

test("4D profile conserves phase distance and time and uses destination elevation", () => {
  const elevated = { ...plan, destination: { ...plan.destination, elevationFt: 3000 } };
  const result = calculateAtAltitude({ plan: elevated, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520,
    fuelOnboardGal: 77, reserveMinutes: 45 });
  const trajectory = buildTrajectory(elevated, result);
  assert.ok(Math.abs(trajectory.distanceNm - elevated.distanceNm) < 1e-6);
  assert.ok(Math.abs(trajectory.timeHr - result.tripTimeHr) < 1e-6);
  assert.ok(result.descent.timeHr < calculateAtAltitude({ plan, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520,
    fuelOnboardGal: 77, reserveMinutes: 45 }).descent.timeHr);
  assert.ok(trajectory.samples.some((sample) => sample.phase === "climb" && sample.altitudeFt < 12000));
  assert.ok(trajectory.samples.some((sample) => sample.phase === "descent" && sample.altitudeFt > 3000));
  assert.ok(Math.abs((trajectory.endMs - trajectory.startMs) - result.tripTimeHr * 3600_000) < 1);
  assert.ok(Math.abs(result.climb.fuelGal + result.cruise.fuelGal + result.descent.fuelGal - result.tripFuelGal) < 1e-9);
  assert.ok(Math.abs(result.cruise.sections.reduce((sum, section) => sum + section.distanceNm, 0) - result.cruise.distanceNm) < 1e-6);
  assert.ok(Math.abs(result.cruise.sections.reduce((sum, section) => sum + section.fuelGal, 0) - result.cruise.fuelGal) < 1e-9);
  assert.ok(result.cruise.sections.every((section, index, sections) => index === 0 || section.startFuelGal < sections[index - 1].startFuelGal));
});

test("an icing layer crossed during climb blocks every higher FL and returns no solution", () => {
  const raw = { generatedAt: new Date(start).toISOString(), sigmets: [{ hazard: "ICE", base: 5000, top: 12000,
    validTimeFrom: (start - 3600_000) / 1000, validTimeTo: (start + 3 * 3600_000) / 1000,
    coords: [{ lat: -24, lon: -47 }, { lat: -24, lon: -42 }, { lat: -22, lon: -42 }, { lat: -22, lon: -47 }] }], pireps: [] };
  const weatherSnapshot = createWeatherSnapshot(plan, { awc: parseAwcSnapshot(raw, start + 60_000) });
  const mission = optimizeMission({ ...input, weatherSnapshot });
  assert.equal(mission.selected, null);
  assert.equal(mission.viabilityStatus, "NO_FEASIBLE_SOLUTION");
  assert.equal(mission.candidates.length, 9);
  assert.ok(mission.candidates.every((candidate) => candidate.physicalBlockers.includes("ICE")));
  assert.ok(mission.candidates.find((candidate) => candidate.altitudeFt === 22000).result.icing.climbExposureMinutes > 0);
});

test("an AWC icing SIGMET confined to the alternate corridor blocks the proposal", () => {
  const alternatePlan = { ...plan, alternate: "ALTN", alternates: [{ icao: "ALTN", lat: -22.8, lon: -42.2 }] };
  const raw = { generatedAt: new Date(start).toISOString(), sigmets: [{ hazard: "ICE", base: 0, top: 5000,
    validTimeFrom: (start - 3600_000) / 1000, validTimeTo: (start + 5 * 3600_000) / 1000,
    coords: [{ lat: -23.2, lon: -42.8 }, { lat: -23.2, lon: -42 }, { lat: -22.4, lon: -42 }, { lat: -22.4, lon: -42.8 }] }], pireps: [] };
  const mission = optimizeMission({ ...input, plan: alternatePlan,
    weatherSnapshot: createWeatherSnapshot(alternatePlan, { awc: parseAwcSnapshot(raw, start + 60_000) }) });
  assert.equal(mission.selected, null);
  assert.ok(mission.candidates.every((candidate) => candidate.physicalBlockers.includes("ICE")));
  assert.ok(mission.diagnostic.result.trajectory.alternateSamples.length > 0);
  assert.equal(mission.diagnostic.result.icing.alternate.status, "avoid");
});

test("a SIGMET with missing vertical limits is uncertain instead of blocking every FL", () => {
  const raw = { generatedAt: new Date(start).toISOString(), sigmets: [{ hazard: "ICE",
    validTimeFrom: (start - 3600_000) / 1000, validTimeTo: (start + 3 * 3600_000) / 1000,
    coords: [{ lat: -24, lon: -47 }, { lat: -24, lon: -42 }, { lat: -22, lon: -42 }, { lat: -22, lon: -47 }] }], pireps: [] };
  const mission = optimizeMission({ ...input, weatherSnapshot: createWeatherSnapshot(plan, { awc: parseAwcSnapshot(raw, start + 60_000) }) });
  const candidate = mission.candidates.find((item) => item.altitudeFt === 18000);
  assert.ok(!candidate.physicalBlockers.includes("ICE"));
  assert.equal(candidate.result.icing.compatibility, "UNKNOWN");
  assert.ok(candidate.result.icing.limitations.includes("ICE_SIGMET_VERTICAL_LIMIT_UNKNOWN"));
});

test("Mission Score weights total 100 and constraints cannot be compensated by FAST", () => {
  assert.equal(Object.values(PERFORMANCE.missionScoreV2.weights).reduce((a, b) => a + b), 100);
  const heavy = optimizeMission({ ...input, mode: "FAST", payloadLb: 1500,
    weightBalance: { ...input.weightBalance, baggage: 980 } });
  assert.equal(heavy.selected, null);
  assert.equal(heavy.viabilityStatus, "NO_FEASIBLE_SOLUTION");
  assert.ok(heavy.diagnostic.score.score >= 0);
});

test("PNR distinguishes beyond destination from a nonexistent return point", () => {
  const base = { plan, altitudeFt: 18000, mode: "NORMAL", payloadLb: 520, reserveMinutes: 45 };
  const abundant = calculateEtpPnr({ ...base, fuelOnboardGal: 77 }).pnr;
  assert.equal(abundant.status, "BEYOND_DESTINATION");
  assert.ok(abundant.rawDistanceNm > plan.distanceNm);
  const insufficient = calculateEtpPnr({ ...base, fuelOnboardGal: 1 }).pnr;
  assert.equal(insufficient.status, "UNAVAILABLE");
  assert.equal(insufficient.distanceNm, null);
});
