import test from "node:test";
import assert from "node:assert/strict";
import { buildRouteGeometry, completeRouteFixes, layoutRouteLabels, pointAlongPolyline, unwrapRouteLongitudes } from "../js/route-map.js";

const plan = {
  origin: { icao: "SBJR", lat: -22.91, lon: -43.16 },
  destination: { icao: "SBSP", lat: -23.63, lon: -46.66 },
  distanceNm: 198,
  waypoints: [
    { ident: "2302S04322W", lat: -23.03, lon: -43.37, distanceNm: 0 },
    { ident: "TOC", lat: -23.15, lon: -44.0, distanceNm: 45 },
    { ident: "NAXOP", lat: -23.24, lon: -44.25, distanceNm: 52 },
    { ident: "IBDAL", lat: -23.35, lon: -45.1, distanceNm: 113 },
    { ident: "MANLO", lat: -23.42, lon: -45.45, distanceNm: 123 },
    { ident: "TOD", lat: -23.51, lon: -46.0, distanceNm: 161 },
    { ident: "SP033", lat: -23.56, lon: -46.25, distanceNm: 167 },
    { ident: "ESUNI", lat: -23.59, lon: -46.45, distanceNm: 181 },
    { ident: "SBSP", lat: -23.63, lon: -46.66, distanceNm: 198 },
  ],
};

test("route map preserves every OFP waypoint and adds a missing origin", () => {
  const fixes = completeRouteFixes(plan);
  assert.deepEqual(fixes.map((fix) => fix.ident), ["SBJR", "2302S04322W", "TOC", "NAXOP", "IBDAL", "MANLO", "TOD", "SP033", "ESUNI", "SBSP"]);
  const geometry = buildRouteGeometry(plan);
  assert.equal(geometry.points.length, fixes.length);
  assert.equal((geometry.path.match(/[ML]/g) || []).length, fixes.length);
});

test("route map keeps OFP TOC and TOD available for dedicated markers", () => {
  const geometry = buildRouteGeometry(plan);
  assert.ok(geometry.points.some((point) => point.ident === "TOC"));
  assert.ok(geometry.points.some((point) => point.ident === "TOD"));
  const labels = layoutRouteLabels(geometry.points, geometry.width, geometry.height);
  assert.equal(labels.length, geometry.points.length);
  assert.ok(labels.every((label) => Number.isFinite(label.labelX) && Number.isFinite(label.labelY)));
});

test("route interpolation follows the complete polyline", () => {
  const geometry = buildRouteGeometry(plan);
  const halfway = pointAlongPolyline(geometry.points, .5);
  assert.ok(halfway.x >= 0 && halfway.x <= geometry.width);
  assert.ok(halfway.y >= 0 && halfway.y <= geometry.height);
});

test("routes crossing the date line are unwrapped without spanning the globe", () => {
  const fixes = unwrapRouteLongitudes([
    { ident: "A", lat: 40, lon: 179 },
    { ident: "B", lat: 41, lon: -179 },
    { ident: "C", lat: 42, lon: -176 },
  ]);
  assert.deepEqual(fixes.map((fix) => fix.mapLon), [179, 181, 184]);
});
