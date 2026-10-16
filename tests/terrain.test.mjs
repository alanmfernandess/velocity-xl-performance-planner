import test from "node:test";
import assert from "node:assert/strict";
import { assessTerrain, fetchElevationProfile, routeTerrainLegs, sampleRoute } from "../js/terrain.js";

const plan = {
  origin: { icao: "ORIG", lat: 0, lon: 0 },
  destination: { icao: "DEST", lat: 0, lon: 1.5 },
  distanceNm: 100,
  waypoints: [
    { ident: "A", lat: 0, lon: 0.4, moraFt: 12000 },
    { ident: "B", lat: 0, lon: 1.0, moraFt: 18500 },
    { ident: "DEST", lat: 0, lon: 1.5, moraFt: 15000 },
  ],
};

const result = (altitudeFt) => ({ altitudeFt, climb: { distanceNm: 20 }, descent: { distanceNm: 20 } });

test("MORA is assigned to the leg ending at each SimBrief fix", () => {
  const legs = routeTerrainLegs(plan);
  assert.deepEqual(legs.map((leg) => leg.moraFt), [12000, 18500, 15000]);
  assert.equal(legs[0].from.ident, "ORIG");
  assert.equal(legs[1].to.ident, "B");
  assert.equal(legs.at(-1).endNm, 100);
});

test("changing FL changes terrain status and the critical margin", () => {
  assert.equal(assessTerrain(plan, result(18000)).status, "unavailable");
  assert.equal(assessTerrain(plan, result(20000)).status, "marginal");
  const high = assessTerrain(plan, result(22000));
  assert.equal(high.status, "viable");
  assert.equal(high.marginFt, 3500);
  assert.equal(high.critical.to.ident, "B");
});

test("missing MORA stays unassessed until a sourced manual minimum is entered", () => {
  const partial = structuredClone(plan);
  partial.waypoints[1].moraFt = NaN;
  assert.equal(assessTerrain(partial, result(22000)).status, "unknown");
  assert.equal(assessTerrain(partial, result(22000), { 1: { feet: 18500 } }).status, "unknown");
  const assessed = assessTerrain(partial, result(22000), { 1: { feet: 18500, source: "Chart AIP" } });
  assert.equal(assessed.status, "viable");
  assert.equal(assessed.critical.source, "MANUAL");
  partial.waypoints[1].moraFt = 0;
  assert.equal(assessTerrain(partial, result(22000)).status, "unknown");
});

test("route sampling follows the short crossing at the date line", () => {
  const crossing = { origin: { icao: "A", lat: 0, lon: 179 }, destination: { icao: "B", lat: 0, lon: -179 }, distanceNm: 120, waypoints: [] };
  const points = sampleRoute(crossing, 3);
  assert.equal(Math.abs(points[1].lon), 180);
});

test("sampled elevation is visual data and never fills a missing MORA", async () => {
  const points = sampleRoute(plan, 4);
  assert.equal(points.length, 4);
  const profile = await fetchElevationProfile(plan, async () => ({ ok: true, json: async () => ({ elevation: Array(80).fill(1000) }) }));
  assert.equal(profile.length, 80);
  assert.ok(Math.abs(profile[0].elevationFt - 3280.84) < 0.01);
  const partial = structuredClone(plan);
  partial.waypoints[1].moraFt = NaN;
  assert.equal(assessTerrain(partial, result(22000)).status, "unknown");
});
