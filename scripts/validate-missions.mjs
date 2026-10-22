import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { AIRCRAFT } from "../js/config.js";
import { optimizeMission } from "../js/unified-optimization.js";
import { PRESSURE_LEVELS, parseGfsResponse, representativePoints } from "../js/weather/open-meteo.js";
import { parseAwcSnapshot } from "../js/weather/awc.js";
import { createWeatherSnapshot } from "../js/weather/fusion.js";

const start = Date.parse("2026-10-21T12:00:00Z");
const load = { pilot: 190, copilot: 170, rearLeft: 55, rearCenter: 50, rearRight: 55, baggage: 0 };
const oxygen = { bottleModel: "SK-12-24", bottles: 3, seats: [true, true, true, true, true] };
const coordinates = (distanceNm) => Array.from({ length: 7 }, (_, index) => ({ lat: 0, lon: distanceNm / 60 * index / 6,
  distanceNm: distanceNm * index / 6, ident: `W${index}` }));
function makePlan({ distanceNm = 350, windDir = 270, windSpd = 20, bulletin = null, alternateNm = 35 } = {}) {
  const points = coordinates(distanceNm);
  const waypoints = points.map((point) => ({ ...point, altitudeFt: 18000, windLevels: [10000, 18000, 25000]
    .map((altitudeFt) => ({ altitudeFt, windDir, windSpd, oatC: 15 - altitudeFt * .00198 })) }));
  const alternates = alternateNm === null ? [] : [{ icao: "ALTN", lat: 0, lon: points.at(-1).lon + alternateNm / 60, distanceNm: alternateNm }];
  return { source: "SIMBRIEF", generatedAtMs: start - 3600_000, scheduledOffMs: start,
    scheduledOnMs: start + distanceNm / 195 * 3600_000, origin: { icao: "ORIG", lat: 0, lon: 0, elevationFt: 100 },
    destination: { icao: "DEST", lat: 0, lon: points.at(-1).lon, elevationFt: 100 },
    alternates, alternate: alternates[0]?.icao || "—", waypoints, distanceNm, plannedAltitudeFt: 18000,
    meteorology: bulletin ? { enrouteText: bulletin, enrouteAdvisories: [{ text: bulletin,
      legCoverage: waypoints.slice(1).map((_, index) => index === 2 || index === 3 ? 1 : 0) }] } : {} };
}
function makeGfs(plan, { windDir = 270, windSpd = 20, cloudLayer = null, turbulence = false } = {}) {
  const times = Array.from({ length: 11 }, (_, index) => `2026-10-21T${String(index + 11).padStart(2, "0")}:00`);
  const hourlyUnits = { time: "iso8601", cape: "J/kg", freezing_level_height: "m", precipitation: "mm", cloud_cover: "%" };
  const hourly = { time: times, cape: times.map(() => turbulence ? 700 : 0), freezing_level_height: times.map(() => 3200),
    precipitation: times.map(() => 0), cloud_cover: times.map(() => cloudLayer ? 65 : 0) };
  for (const level of PRESSURE_LEVELS) {
    const metres = 44330 * (1 - (level / 1013.25) ** .1903);
    const feet = metres * 3.280839895;
    const cloudy = cloudLayer && feet >= cloudLayer[0] && feet <= cloudLayer[1];
    const fields = { temperature: [15 - feet * .00198, "°C"], relative_humidity: [cloudy ? 95 : 25, "%"],
      cloud_cover: [cloudy ? 90 : 0, "%"], wind_speed: [windSpd + (turbulence && feet > 17000 ? 15 : 0), "kn"],
      wind_direction: [windDir + (turbulence && feet > 17000 ? 35 : 0), "°"], vertical_velocity: [turbulence ? -.5 : 0, "m/s"],
      geopotential_height: [metres, "m"] };
    for (const [field, [value, unit]] of Object.entries(fields)) {
      const name = `${field}_${level}hPa`; hourlyUnits[name] = unit; hourly[name] = times.map(() => value);
    }
  }
  const raw = representativePoints(plan).map((point) => ({ latitude: point.lat, longitude: point.lon, hourly_units: hourlyUnits, hourly }));
  return { status: "available", model: "gfs_global", fetchedAtMs: start, locations: parseGfsResponse(raw, raw.length) };
}
function makeAwc(plan, hazard = null, baseFt = 0, topFt = 30000) {
  const sigmets = hazard ? [{ hazard, base: baseFt, top: topFt,
    validTimeFrom: (start - 3600_000) / 1000, validTimeTo: (start + 9 * 3600_000) / 1000,
    rawSigmet: `SEV ${hazard} FL${String(Math.round(baseFt / 100)).padStart(3, "0")}/${Math.round(topFt / 100)}`,
    coords: [{ lat: -1, lon: -1 }, { lat: -1, lon: plan.destination.lon + 1 },
      { lat: 1, lon: plan.destination.lon + 1 }, { lat: 1, lon: -1 }] }] : [];
  return parseAwcSnapshot({ generatedAt: new Date(start).toISOString(), sigmets, pireps: [] }, start + 60_000);
}
const cases = [
  { name: "short-clear", plan: makePlan({ distanceNm: 220 }), weather: {} },
  { name: "long-headwind", plan: makePlan({ distanceNm: 900, windDir: 90, windSpd: 50 }), weather: { windDir: 90, windSpd: 50 } },
  { name: "long-tailwind", plan: makePlan({ distanceNm: 900, windDir: 270, windSpd: 50 }), weather: { windDir: 270, windSpd: 50 } },
  { name: "midlevel-icing", plan: makePlan(), weather: { cloudLayer: [13000, 19000] } },
  { name: "climb-icing-sigmet", plan: makePlan(), weather: { hazard: "ICE", baseFt: 5000, topFt: 12000 } },
  { name: "moderate-ride", plan: makePlan({ bulletin: "MOD TURB FL140/180" }), weather: { turbulence: true } },
  { name: "severe-ride-sigmet", plan: makePlan(), weather: { hazard: "TURB", baseFt: 19000, topFt: 23000 } },
  { name: "weather-insufficient", plan: makePlan(), weather: { noGfs: true, noAwc: true } },
  { name: "fuel-capacity", plan: makePlan({ distanceNm: 1650 }), weather: {} },
  { name: "weight-incompatible", plan: makePlan(), weather: {}, payloadLb: 1400, load: { ...load, baggage: 880 } },
  { name: "alternate-inadequate", plan: makePlan({ alternateNm: 800 }), weather: {} },
];
const results = cases.map((scenario) => {
  const { plan, weather } = scenario;
  const weatherSnapshot = createWeatherSnapshot(plan, {
    gfs: weather.noGfs ? null : makeGfs(plan, weather),
    awc: weather.noAwc ? null : makeAwc(plan, weather.hazard, weather.baseFt, weather.topFt),
  });
  const mission = optimizeMission({ plan, weatherSnapshot, mode: "NORMAL", payloadLb: scenario.payloadLb ?? 520,
    fuelOnboardGal: 77, reserveMinutes: 45, weightBalance: scenario.load || load, oxygen });
  const candidate = mission.selected || mission.diagnostic;
  return { scenario: scenario.name, preset: mission.mode, candidates: mission.candidates.length,
    excluded: mission.incompatible.map((item) => ({ fl: item.altitudeFt / 100, reasons: item.physicalBlockers })),
    weatherMode: weatherSnapshot.status, selectedFl: mission.status === "unknown" ? null : mission.selected ? mission.selected.altitudeFt / 100 : null,
    exploratoryFl: mission.status === "unknown" ? mission.selected?.altitudeFt / 100 ?? null : null,
    viability: mission.viabilityStatus, status: mission.status,
    eteMinutes: Math.round(candidate.result.tripTimeHr * 60), fuelGal: Number(candidate.result.fuelRequiredGal.toFixed(2)),
    power: { mapInHg: candidate.result.power.availableMapInHg, rpm: candidate.result.power.rpm },
    ice: { status: candidate.result.icing.compatibility, index: candidate.result.icing.riskScore },
    ride: { status: candidate.result.turbulence.status, index: candidate.result.turbulence.riskScore },
    score: candidate.score.partial ? null : candidate.score.score,
    reasons: mission.reasons, limitations: mission.limitations };
});
const byName = (name) => results.find((item) => item.scenario === name);
assert.ok(byName("long-headwind").eteMinutes > byName("long-tailwind").eteMinutes);
assert.equal(byName("climb-icing-sigmet").selectedFl, null);
assert.ok(byName("severe-ride-sigmet").excluded.some((item) => item.reasons.includes("RIDE")));
assert.equal(byName("weather-insufficient").status, "unknown");
assert.equal(byName("weather-insufficient").selectedFl, null);
assert.equal(byName("weight-incompatible").selectedFl, null);
assert.ok(results.every((item) => item.viability !== "MARGINAL" || item.status === "marginal"));
assert.ok(results.every((item) => item.candidates === 9 && item.fuelGal >= 0 && item.power.rpm <= AIRCRAFT.maxRpm));
await writeFile(new URL("../review/engine-v2-scenarios.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(),
  fixture: "Deterministic synthetic weather and OFP data, illustrative and never used in production", results }, null, 2)}\n`);
console.log(`${results.length} mission scenarios validated; ${results.filter((item) => item.selectedFl === null).length} without a recommendation`);
