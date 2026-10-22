import { fetchGfsSnapshot, sampleGfs } from "../js/weather/open-meteo.js";
import { AWC_SNAPSHOT_URL } from "../js/weather/awc.js";
import { fetchLatestOFP } from "../js/simbrief.js";

const result = {};
try {
  const plan = { origin: { lat: 40, lon: -74 }, destination: { lat: 41, lon: -73 }, waypoints: [] };
  const gfs = await fetchGfsSnapshot(plan);
  const hours = gfs.locations?.[0]?.times || [];
  const position = { lat: 40, lon: -74, altitudeFt: 18000,
    timestampMs: hours.reduce((best, time) => Math.abs(time - Date.now()) < Math.abs(best - Date.now()) ? time : best, hours[0]) };
  const sample = sampleGfs(gfs, position);
  result.OPEN_METEO = sample ? { status: "VERIFIED", locations: gfs.locations.length,
    validAt: new Date(sample.validAtMs).toISOString(), altitudeFt: position.altitudeFt } : { status: "NOT_VERIFIED", reason: "NO_4D_COVERAGE" };
} catch (error) { result.OPEN_METEO = { status: "NOT_VERIFIED", reason: error.message }; }
try {
  const response = await fetch("https://aviationweather.gov/api/data/sigmet?format=json", {
    headers: { "User-Agent": "VelocityXLPlanner/2.0 (noncommercial simulator)", Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const data = response.ok ? await response.json() : null;
  result.AWC_UPSTREAM = Array.isArray(data) ? { status: "VERIFIED", sigmets: data.length }
    : { status: "NOT_VERIFIED", reason: `HTTP_${response.status}` };
} catch (error) { result.AWC_UPSTREAM = { status: "NOT_VERIFIED", reason: error.message }; }
try {
  const response = await fetch(AWC_SNAPSHOT_URL, { signal: AbortSignal.timeout(10000) });
  const snapshot = response.ok ? await response.json() : null;
  result.AWC_PUBLISHED = snapshot?.generatedAt ? { status: "VERIFIED", generatedAt: snapshot.generatedAt }
    : { status: "NOT_VERIFIED", reason: `HTTP_${response.status}` };
} catch (error) { result.AWC_PUBLISHED = { status: "NOT_VERIFIED", reason: error.message }; }
if (process.env.SIMBRIEF_PILOT_ID) {
  try {
    const plan = await fetchLatestOFP(process.env.SIMBRIEF_PILOT_ID);
    result.SIMBRIEF = { status: "VERIFIED", waypoints: plan.waypoints.length,
      hasUtcSchedule: Number.isFinite(plan.scheduledOffMs), hasWindLevels: plan.waypoints.some((fix) => fix.windLevels.length > 0) };
  } catch (error) { result.SIMBRIEF = { status: "NOT_VERIFIED", reason: error.message }; }
} else result.SIMBRIEF = { status: "NOT_VERIFIED", reason: "Pilot ID not provided; no automatic polling" };
console.log(JSON.stringify(result, null, 2));
