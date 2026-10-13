import test from "node:test";
import assert from "node:assert/strict";
import { parseSimBrief } from "../js/simbrief.js";
import { calculatePlan } from "../js/engine.js";

test("parses SimBrief JSON v2 arrays and strings", () => {
  const result = parseSimBrief({
    fetch: { status: "Success" },
    params: { time_generated: "2026-10-12T18:30:00Z" },
    general: { initial_altitude: "22000", route_distance: "420", route: "DCT TEST DCT" },
    aircraft: { icao_code: "A388", name: "Airbus A380" },
    fuel: { plan_takeoff: "999999", reserve: "999999" },
    origin: { icao_code: "SBSP", name: "Congonhas", pos_lat: "-23.626", pos_long: "-46.657" },
    destination: { icao_code: "SBGL", name: "Galeão", pos_lat: "-22.810", pos_long: "-43.251" },
    weather: { orig_metar: "SBSP 121200Z BKN020", dest_taf: "TAF SBGL 121100Z OVC030", sigmets: ["MOD ICE FL120/180"] },
    alternate: [{ icao_code: "SBRJ", name: "Santos Dumont", pos_lat: "-22.9105", pos_long: "-43.1631", route_distance: "12" }],
    navlog: [
      { ident: "SBSP", pos_lat: "-23.626", pos_long: "-46.657", altitude_feet: "22000", wind_dir: "250", wind_spd: "20", oat: "-20", shear: "2", stage: "CLB", wind_data: [
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
  assert.equal(result.waypoints[0].shear, 2);
  assert.equal(result.waypoints[0].altitudeFt, 22000);
  assert.equal(result.waypoints[0].stage, "CLB");
  assert.match(result.meteorology.originText, /BKN020/);
  assert.match(result.meteorology.destinationText, /OVC030/);
  assert.match(result.meteorology.enrouteText, /MOD ICE/);
  assert.equal(Object.hasOwn(result, "aircraft"), false);
  assert.equal(Object.hasOwn(result, "fuel"), false);
  assert.match(result.generatedAt, /12\/10\/2026/);
});

test("ignores unstructured advisory objects instead of concatenating unrelated fields", () => {
  const result = parseSimBrief({
    fetch: { status: "Success" },
    general: { initial_altitude: "19000", route_distance: "1153" },
    origin: { icao_code: "YPPH", pos_lat: "-31.94", pos_long: "115.97" },
    destination: { icao_code: "YPAD", pos_lat: "-34.94", pos_long: "138.53" },
    weather: { sigmets: [{ severity: "SEV", phenomenon: "TURB", unrelated_level: "ALL" }] },
    navlog: [
      { ident: "YPPH", pos_lat: "-31.94", pos_long: "115.97", altitude_feet: "19000", shear: "12", stage: "CRZ" },
      { ident: "YPAD", pos_lat: "-34.94", pos_long: "138.53", altitude_feet: "19000", shear: "12", stage: "CRZ" },
    ],
  });
  assert.equal(result.meteorology.enrouteText, "");
  assert.equal(result.waypoints[0].altitudeFt, 19000);
  const analysis = calculatePlan({ plan: result, mode: "ECON", payloadLb: 300, fuelOnboardGal: 87, reserveMinutes: 45 });
  const blockedLevels = analysis.results.filter((item) => item.turbulence.blocking).map((item) => item.fl);
  assert.ok(blockedLevels.length > 0);
  assert.ok(blockedLevels.length < analysis.results.length);
  assert.ok(analysis.results.find((item) => item.fl === 100).turbulence.status !== "severe");
});
