// Illustrative OFP and weather only. Never used by the production application.
import { parseSimBrief } from "../../js/simbrief.js";
import { PRESSURE_LEVELS, parseGfsResponse, representativePoints } from "../../js/weather/open-meteo.js";
import { createWeatherSnapshot } from "../../js/weather/fusion.js";

export function profileFixture(count = 8, { variableWind = true, hours = 72, missingMoisture = false } = {}) {
  const raw = { fetch: { status: "Success" }, params: { request_id: "ILLUSTRATIVE-PROFILE-TEST" },
    general: { initial_altitude: 18000, route_distance: 246, route: "ILLUSTRATIVE TEST ROUTE" },
    origin: { icao_code: "SBSP", pos_lat: -23.6261, pos_long: -46.6566, elevation: 2631 },
    destination: { icao_code: "SBGL", pos_lat: -22.8099, pos_long: -43.2506, elevation: 28 },
    alternate: { icao_code: "SBRJ", pos_lat: -22.9105, pos_long: -43.1631 },
    times: { sched_off: "2026-10-21T23:30:00Z", sched_on: "2026-10-22T01:30:00Z" },
    navlog: Array.from({ length: count }, (_, i) => {
      const f = count < 2 ? 0 : i / (count - 1);
      return { ident: i === 0 ? "SBSP" : i === count - 1 ? "SBGL" : `FIX${String(i).padStart(3, "0")}`,
        pos_lat: -23.6261 + .8162 * f, pos_long: -46.6566 + 3.406 * f, cum_distance: 246 * f,
        altitude_feet: 18000, time_total: `00:${String(i % 60).padStart(2, "0")}:00`,
        wind_data: [1000, 5000, 10000, 18000, 25000].map((altitude) => ({ altitude, wind_dir: 240, wind_spd: 15, oat: 15 - altitude / 1000 * 1.98 })) };
    }) };
  const plan = parseSimBrief(raw);
  const times = Array.from({ length: hours }, (_, i) => new Date(Date.parse("2026-10-21T00:00:00Z") + i * 3600_000).toISOString().slice(0, 16));
  const units = { time: "iso8601", cape: "J/kg", freezing_level_height: "m", precipitation: "mm", cloud_cover: "%" };
  const hourly = { time: times, cape: times.map(() => 0), freezing_level_height: times.map(() => 3000), precipitation: times.map(() => 0), cloud_cover: times.map(() => 0) };
  for (const pressure of PRESSURE_LEVELS) {
    const height = 44330 * (1 - (pressure / 1013.25) ** .1903);
    for (const [field, value, unit] of [["temperature", 15 - height * .0065, "°C"],
      ["relative_humidity", missingMoisture ? null : 25, "%"], ["cloud_cover", missingMoisture ? null : 0, "%"],
      ["wind_speed", 15, "kn"], ["wind_direction", 240, "°"], ["vertical_velocity", 0, "m/s"], ["geopotential_height", height, "m"]]) {
      units[`${field}_${pressure}hPa`] = unit;
      hourly[`${field}_${pressure}hPa`] = times.map((_, i) => field === "wind_speed" && variableWind ? 8 + i * .3 : value);
    }
  }
  const points = representativePoints(plan);
  const locations = parseGfsResponse(points.map((p) => ({ latitude: p.lat, longitude: p.lon, hourly_units: units, hourly })), points.length);
  const snapshot = createWeatherSnapshot(plan, { gfs: { status: "available", locations, model: "gfs_global" },
    awc: { status: "available", generatedAtMs: Date.parse("2026-10-21T23:00Z"), sigmets: [], pireps: [] } });
  const input = { plan, weatherSnapshot: snapshot, mode: "NORMAL", payloadLb: 520, fuelOnboardGal: 77, reserveMinutes: 45,
    oxygen: { bottleModel: "SK-12-24", bottles: 4, seats: [true, true, true, true, true] },
    weightBalance: { pilot: 190, copilot: 170, rearLeft: 55, rearCenter: 50, rearRight: 55, baggage: 0 },
    calibration: {}, powerSetting: { type: "AUTO" }, ridePreference: "standard" };
  return { raw, plan, snapshot, input, gfsResponse: points.map((p) => ({ latitude: p.lat, longitude: p.lon, hourly_units: units, hourly })) };
}
