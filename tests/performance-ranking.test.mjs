import test from "node:test";
import assert from "node:assert/strict";
import { rankMetricLevels } from "../js/performance-ranking.js";

const levels = [
  { altitudeFt: 10000, value: 138.1, available: true },
  { altitudeFt: 12000, value: 137.7, available: true },
  { altitudeFt: 14000, value: 137.4, available: true },
  { altitudeFt: 16000, value: 130.0, available: false },
];

test("fuel ranking sorts available levels first and never recommends an unavailable minimum", () => {
  const ranking = rankMetricLevels(levels, "fuel");
  assert.deepEqual(ranking.map(({ altitudeFt, rank }) => [altitudeFt, rank]), [
    [14000, 1], [12000, 2], [10000, 3], [16000, null],
  ]);
});

test("time ranks low values and efficiency ranks high values", () => {
  assert.deepEqual(rankMetricLevels(levels, "time").map(({ altitudeFt }) => altitudeFt), [14000, 12000, 10000, 16000]);
  assert.deepEqual(rankMetricLevels(levels, "efficiency").map(({ altitudeFt }) => altitudeFt), [10000, 12000, 14000, 16000]);
});

test("equal values break ties by flight level", () => {
  const ranking = rankMetricLevels([
    { altitudeFt: 16000, value: 42, available: true },
    { altitudeFt: 14000, value: 42, available: true },
  ], "fuel");
  assert.deepEqual(ranking.map(({ altitudeFt }) => altitudeFt), [14000, 16000]);
});
