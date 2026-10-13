import test from "node:test";
import assert from "node:assert/strict";
import { parseSimBrief } from "../js/simbrief.js";

test("parses SimBrief JSON v2 arrays and strings", () => {
  const result = parseSimBrief({
    fetch: { status: "Success" },
    params: { time_generated: "2026-10-12T18:30:00Z" },
    general: { initial_altitude: "22000", route_distance: "420", route: "DCT TEST DCT" },
    aircraft: { icao_code: "A388", name: "Airbus A380" },
    fuel: { plan_takeoff: "999999", reserve: "999999" },
    origin: { icao_code: "SBSP", name: "Congonhas", pos_lat: "-23.626", pos_long: "-46.657" },
    destination: { icao_code: "SBGL", name: "Galeão", pos_lat: "-22.810", pos_long: "-43.251" },
    alternate: [{ icao_code: "SBRJ", name: "Santos Dumont", pos_lat: "-22.9105", pos_long: "-43.1631", route_distance: "12" }],
    navlog: [
      { ident: "SBSP", pos_lat: "-23.626", pos_long: "-46.657", wind_dir: "250", wind_spd: "20", oat: "-20", wind_data: [
        { altitude: "18000", wind_dir: "240", wind_spd: "18", oat: "-19" },
        { altitude: "24000", wind_dir: "270", wind_spd: "30", oat: "-31" },
      ] },
      { ident: "SBGL", pos_lat: "-22.810", pos_long: "-43.251", wind_dir: "260", wind_spd: "25", oat: "-22" },
    ],
  });
  assert.equal(result.origin.icao, "SBSP");
  assert.equal(result.destination.icao, "SBGL");
  assert.equal(result.alternate, "SBRJ");
  assert.equal(result.alternates[0].icao, "SBRJ");
  assert.equal(result.alternates[0].distanceNm, 12);
  assert.ok(Number.isFinite(result.alternates[0].lat));
  assert.equal(result.plannedAltitudeFt, 22000);
  assert.equal(result.distanceNm, 420);
  assert.equal(result.waypoints.length, 2);
  assert.equal(result.waypoints[0].windLevels.length, 2);
  assert.equal(result.waypoints[0].windLevels[1].altitudeFt, 24000);
  assert.equal(Object.hasOwn(result, "aircraft"), false);
  assert.equal(Object.hasOwn(result, "fuel"), false);
  assert.match(result.generatedAt, /12\/10\/2026/);
});
