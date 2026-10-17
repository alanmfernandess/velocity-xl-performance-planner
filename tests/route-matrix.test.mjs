import test from "node:test";
import assert from "node:assert/strict";
import { buildRouteMatrix, legWindComponent } from "../js/route-matrix.js";

const points = Array.from({ length: 20 }, (_, index) => ({
  ident: index === 0 ? "ORIG" : index === 19 ? "DEST" : `W${index}`,
  lat: 0,
  lon: index * 0.1,
  moraFt: 20000,
  windLevels: [
    { altitudeFt: 20000, windDir: 270, windSpd: 10, oatC: -25 },
    { altitudeFt: 24000, windDir: 90, windSpd: 20, oatC: -33 },
  ],
}));
const plan = {
  origin: { icao: "ORIG", lat: 0, lon: 0 },
  destination: { icao: "DEST", lat: 0, lon: 1.9 },
  distanceNm: 114,
  waypoints: points,
};
const result = (altitudeFt) => ({
  altitudeFt,
  fl: altitudeFt / 100,
  climb: { distanceNm: 15 },
  descent: { distanceNm: 15 },
  icing: { segments: points.slice(0, -1).map((from, index) => ({
    from: from.ident,
    to: points[index + 1].ident,
    riskScore: index,
    evidenceAvailable: index % 2 === 0,
  })) },
});

test("20 waypoints stay as 19 selectable legs with their own MORA and icing evidence", () => {
  const matrix = buildRouteMatrix(plan, [result(20000), result(22000), result(24000)]);
  assert.equal(matrix.length, 19);
  assert.equal(matrix[8].from.ident, "W8");
  assert.equal(matrix[8].to.ident, "W9");
  assert.equal(matrix[8].levels[1].icingScore, 8);
  assert.equal(matrix[9].levels[1].icingScore, null);
  assert.equal(matrix[8].levels[1].terrainStatus, "viable");
  assert.equal(matrix[8].levels[0].terrainStatus, "marginal");
});

test("wind component changes sign with the OFP level and missing wind stays missing", () => {
  const leg = { from: points[8], to: points[9] };
  assert.ok(legWindComponent(leg, 20000) > 9);
  assert.ok(legWindComponent(leg, 24000) < -19);
  assert.equal(legWindComponent({ from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 1 } }, 22000), null);
});

test("the matrix does not show a cruise MORA margin during pure climb or descent", () => {
  const matrix = buildRouteMatrix(plan, [result(22000)]);
  assert.equal(matrix[0].levels[0].phase, "climb");
  assert.equal(matrix[0].levels[0].marginFt, null);
  assert.equal(matrix[9].levels[0].phase, "cruise");
  assert.equal(matrix.at(-1).levels[0].phase, "descent");
  assert.equal(matrix.at(-1).levels[0].marginFt, null);
});
