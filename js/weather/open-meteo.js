// Open-Meteo's public GFS forecast is a model estimate, never an observation.
// All heights below come from geopotential_height_*hPa (metres MSL), not a
// fixed pressure-to-altitude table. Missing variables stay null.
export const GFS_ENDPOINT = "https://api.open-meteo.com/v1/gfs";
export const PRESSURE_LEVELS = [1000, 925, 850, 775, 700, 625, 550, 500, 450, 400, 350, 300];
const PRESSURE_FIELDS = ["temperature", "relative_humidity", "cloud_cover", "wind_speed", "wind_direction", "vertical_velocity", "geopotential_height"];
const HOURLY = [...PRESSURE_LEVELS.flatMap((level) => PRESSURE_FIELDS.map((field) => `${field}_${level}hPa`)), "cape", "freezing_level_height", "precipitation", "cloud_cover"];
const TTL_MS = 60 * 60 * 1000;
const cache = new Map();
const pending = new Map();
const finite = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

const distanceNm = (a, b) => {
  const lat = (b.lat - a.lat) * Math.PI / 180, lon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(lon / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.sqrt(h));
};

/** @returns {{lat:number,lon:number}[]} Route locations at roughly 120 NM spacing, capped at sixteen. */
export function representativePoints(plan) {
  const alternate = plan?.alternates?.find((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
  const route = [plan?.origin, ...(plan?.waypoints || []), plan?.destination]
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
  if (!route.length) return [];
  if (route.length === 1) return [{ lat: Number(route[0].lat.toFixed(3)), lon: Number(route[0].lon.toFixed(3)) }];
  const cumulative = [0];
  for (let i = 1; i < route.length; i += 1) cumulative.push(cumulative.at(-1) + distanceNm(route[i - 1], route[i]));
  const total = cumulative.at(-1);
  const count = Math.min(alternate ? 15 : 16, Math.max(2, Math.ceil(total / 120) + 1));
  const points = Array.from({ length: count }, (_, index) => {
    const target = total * index / (count - 1);
    const upper = Math.max(1, cumulative.findIndex((value) => value >= target));
    const weight = cumulative[upper] === cumulative[upper - 1] ? 0 : (target - cumulative[upper - 1]) / (cumulative[upper] - cumulative[upper - 1]);
    return { lat: Number((route[upper - 1].lat + (route[upper].lat - route[upper - 1].lat) * weight).toFixed(3)),
      lon: Number((route[upper - 1].lon + (route[upper].lon - route[upper - 1].lon) * weight).toFixed(3)) };
  }).filter((point, index, items) => index === 0 || point.lat !== items[index - 1].lat || point.lon !== items[index - 1].lon);
  if (alternate) {
    const location = { lat: Number(alternate.lat.toFixed(3)), lon: Number(alternate.lon.toFixed(3)) };
    if (!points.some((point) => distanceNm(point, location) < 1)) points.push(location);
  }
  return points;
}

export function buildGfsUrl(points) {
  if (!points.length || points.length > 16 || points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) throw new Error("Invalid GFS locations");
  const url = new URL(GFS_ENDPOINT);
  url.searchParams.set("latitude", points.map((p) => p.lat).join(","));
  url.searchParams.set("longitude", points.map((p) => p.lon).join(","));
  url.searchParams.set("hourly", HOURLY.join(","));
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", "4");
  url.searchParams.set("models", "gfs_global");
  return url.toString();
}

function validateLocation(raw) {
  if (!raw || !Array.isArray(raw.hourly?.time) || raw.hourly.time.length < 2) throw new Error("Invalid GFS hourly response");
  const times = raw.hourly.time.map((time) => Date.parse(`${time.replace(/Z$/, "")}Z`));
  if (times.some((time) => !Number.isFinite(time))) throw new Error("Invalid GFS timestamps");
  const units = raw.hourly_units || {};
  for (const level of PRESSURE_LEVELS) {
    if (units[`geopotential_height_${level}hPa`] !== "m") throw new Error("Unexpected GFS geopotential height unit");
    if (units[`wind_speed_${level}hPa`] !== "kn") throw new Error("Unexpected GFS wind speed unit");
    if (units[`temperature_${level}hPa`] !== "°C") throw new Error("Unexpected GFS temperature unit");
  }
  const lat = finite(raw.latitude), lon = finite(raw.longitude);
  if (lat === null || lon === null) throw new Error("Invalid GFS coordinates");
  return { lat, lon, times, hourly: raw.hourly, model: "gfs_global", fetchedAtMs: Date.now() };
}

export function parseGfsResponse(raw, expectedCount) {
  const locations = Array.isArray(raw) ? raw : [raw];
  if (locations.length !== expectedCount) throw new Error("GFS location count mismatch");
  return locations.map(validateLocation);
}

async function fetchWithRetry(url, fetcher, signal) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("GFS timeout")), 12000);
    try {
      const response = await fetcher(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) {
        const error = new Error(`GFS HTTP ${response.status}`);
        error.retryable = false;
        throw error;
      }
      lastError = new Error(`GFS HTTP ${response.status}`);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error.retryable === false) throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
  }
  throw lastError;
}

/** One batched request is shared by every candidate FL. */
export async function fetchGfsSnapshot(plan, { fetcher = fetch, signal, nowMs = Date.now() } = {}) {
  const points = representativePoints(plan);
  if (!points.length) return { status: "unavailable", reason: "NO_ROUTE_COORDINATES", locations: [] };
  const url = buildGfsUrl(points);
  const saved = cache.get(url);
  if (saved && nowMs - saved.fetchedAtMs < TTL_MS) return saved;
  if (pending.has(url)) return pending.get(url);
  const task = (async () => {
    const locations = parseGfsResponse(await fetchWithRetry(url, fetcher, signal), points.length);
    const snapshot = { status: "available", provider: "OPEN_METEO", model: "gfs_global", fetchedAtMs: nowMs, locations };
    cache.set(url, snapshot);
    for (const [key, value] of cache) if (nowMs - value.fetchedAtMs >= TTL_MS) cache.delete(key);
    while (cache.size > 16) cache.delete(cache.keys().next().value);
    return snapshot;
  })().finally(() => pending.delete(url));
  pending.set(url, task);
  signal?.addEventListener("abort", () => pending.delete(url), { once: true });
  return task;
}

function between(a, b, weight) { return a === null || b === null ? null : a + (b - a) * weight; }
function vector(directionDeg, speedKt) {
  if (directionDeg === null || speedKt === null) return null;
  const radians = directionDeg * Math.PI / 180;
  return { u: -speedKt * Math.sin(radians), v: -speedKt * Math.cos(radians) };
}
function windFromVector(u, v) {
  if (u === null || v === null) return { windDir: null, windSpd: null };
  return { windDir: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360, windSpd: Math.hypot(u, v) };
}
function sampleHour(location, index, altitudeFt) {
  const levels = (location.pressureLevels || PRESSURE_LEVELS).map((level) => {
    const read = (field) => finite(location.hourly[`${field}_${level}hPa`]?.[index]);
    const wind = vector(read("wind_direction"), read("wind_speed"));
    return { altitudeFt: read("geopotential_height") === null ? null : read("geopotential_height") * 3.280839895,
      oatC: read("temperature"), humidity: read("relative_humidity"), cloudCover: read("cloud_cover"),
      verticalVelocity: read("vertical_velocity"), u: wind?.u ?? null, v: wind?.v ?? null };
  }).filter((level) => level.altitudeFt !== null).sort((a, b) => a.altitudeFt - b.altitudeFt);
  if (levels.length < 2 || altitudeFt < levels[0].altitudeFt || altitudeFt > levels.at(-1).altitudeFt) return null;
  const upper = levels.findIndex((level) => level.altitudeFt >= altitudeFt);
  const low = levels[Math.max(0, upper - 1)], high = levels[upper];
  const w = high === low ? 0 : (altitudeFt - low.altitudeFt) / (high.altitudeFt - low.altitudeFt);
  const wind = windFromVector(between(low.u, high.u, w), between(low.v, high.v, w));
  return { oatC: between(low.oatC, high.oatC, w), humidity: between(low.humidity, high.humidity, w),
    cloudCover: between(low.cloudCover, high.cloudCover, w), verticalVelocity: between(low.verticalVelocity, high.verticalVelocity, w),
    ...wind, cape: finite(location.hourly.cape?.[index]),
    freezingLevelFt: finite(location.hourly.freezing_level_height?.[index]) === null ? null : finite(location.hourly.freezing_level_height[index]) * 3.280839895,
    precipitationMm: finite(location.hourly.precipitation?.[index]), source: "OPEN_METEO", model: location.model,
    validAtMs: location.times[index], fetchedAtMs: location.fetchedAtMs, method: "pressure-height interpolation" };
}

function sampleTime(location, altitudeFt, timeMs) {
  if (!Number.isFinite(timeMs) || timeMs < location.times[0] || timeMs > location.times.at(-1)) return null;
  const after = location.times.findIndex((time) => time >= timeMs);
  const before = Math.max(0, after - 1);
  const a = sampleHour(location, before, altitudeFt), b = sampleHour(location, after, altitudeFt);
  if (!a || !b) return null;
  const w = after === before ? 0 : (timeMs - location.times[before]) / (location.times[after] - location.times[before]);
  const av = vector(a.windDir, a.windSpd), bv = vector(b.windDir, b.windSpd);
  return { ...a, oatC: between(a.oatC, b.oatC, w), humidity: between(a.humidity, b.humidity, w),
    cloudCover: between(a.cloudCover, b.cloudCover, w), verticalVelocity: between(a.verticalVelocity, b.verticalVelocity, w),
    cape: between(a.cape, b.cape, w), freezingLevelFt: between(a.freezingLevelFt, b.freezingLevelFt, w),
    precipitationMm: between(a.precipitationMm, b.precipitationMm, w),
    ...windFromVector(between(av?.u ?? null, bv?.u ?? null, w), between(av?.v ?? null, bv?.v ?? null, w)),
    validAtMs: timeMs, method: "pressure-height and time interpolation" };
}

/** Explain why a real GFS forecast cannot be applied at a 4D flight sample.
 * Availability of a downloaded snapshot is NOT evidence of route coverage.
 * Statuses describe data availability; they must never be used to assert safe weather.
 */
export function gfsSampleStatus(snapshot, point, alreadySampled = undefined) {
  if (snapshot?.status !== "available") return snapshot?.status === "stale" ? "PROVIDER_STALE" : "PROVIDER_UNAVAILABLE";
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return "INVALID_COORDINATES";
  if (!Number.isFinite(point?.timestampMs)) return "MISSING_FLIGHT_TIME";
  if (!Number.isFinite(point?.altitudeFt)) return "INVALID_ALTITUDE";
  const available = alreadySampled === undefined ? sampleGfs(snapshot, point) : alreadySampled;
  if (available) return available.humidity === null || available.cloudCover === null
    ? "MOISTURE_FIELDS_MISSING" : "COVERED";
  const nearby = (snapshot.locations || []).map((location) => ({
    location,
    distance: Math.hypot((location.lat - point.lat) * 60,
      (location.lon - point.lon) * 60 * Math.cos(point.lat * Math.PI / 180)),
  })).sort((a, b) => a.distance - b.distance);
  if (!nearby.length) return "NO_MODEL_LOCATIONS";
  if (nearby[0].distance > 100) return "OUTSIDE_SPATIAL_COVERAGE";
  const location = nearby[0].location;
  if (!location.times?.length) return "MISSING_FORECAST_TIMES";
  if (point.timestampMs < location.times[0] || point.timestampMs > location.times.at(-1)) return "OUTSIDE_FORECAST_WINDOW";
  const hour = Math.max(0, location.times.findIndex((time) => time >= point.timestampMs));
  const heights = (location.pressureLevels || PRESSURE_LEVELS).map((level) => finite(location.hourly?.[`geopotential_height_${level}hPa`]?.[hour]))
    .filter((height) => height !== null).map((height) => height * 3.280839895);
  if (heights.length < 2) return "HEIGHT_LEVELS_MISSING";
  if (point.altitudeFt < Math.min(...heights) || point.altitudeFt > Math.max(...heights)) return "OUTSIDE_VERTICAL_COVERAGE";
  return "MODEL_FIELDS_MISSING";
}

/** Atmospheric model value at a 4D position, or null outside its actual coverage. */
function sampleNativeGfs(snapshot, { lat, lon, altitudeFt, timestampMs }) {
  if (snapshot?.status !== "available" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const nearby = snapshot.locations.map((location) => ({ location,
    distance: Math.hypot((location.lat - lat) * 60, (location.lon - lon) * 60 * Math.cos(lat * Math.PI / 180)) }))
    .sort((a, b) => a.distance - b.distance).slice(0, 2);
  if (!nearby.length || nearby[0].distance > 100) return null;
  const a = sampleTime(nearby[0].location, altitudeFt, timestampMs);
  if (!a) return null;
  if (nearby.length < 2 || nearby[0].distance < 0.01 || nearby[1].distance > 100) return { ...a, coverage: "nearest", distanceNm: nearby[0].distance };
  const b = sampleTime(nearby[1].location, altitudeFt, timestampMs);
  if (!b) return { ...a, coverage: "nearest", distanceNm: nearby[0].distance };
  const w = nearby[0].distance / (nearby[0].distance + nearby[1].distance);
  const av = vector(a.windDir, a.windSpd), bv = vector(b.windDir, b.windSpd);
  return { ...a, oatC: between(a.oatC, b.oatC, w), humidity: between(a.humidity, b.humidity, w),
    cloudCover: between(a.cloudCover, b.cloudCover, w), verticalVelocity: between(a.verticalVelocity, b.verticalVelocity, w),
    cape: between(a.cape, b.cape, w), precipitationMm: between(a.precipitationMm, b.precipitationMm, w),
    freezingLevelFt: between(a.freezingLevelFt, b.freezingLevelFt, w),
    ...windFromVector(between(av?.u ?? null, bv?.u ?? null, w), between(av?.v ?? null, bv?.v ?? null, w)),
    coverage: "two-point spatial interpolation", distanceNm: nearby[0].distance };
}

/** Counterfactual vector additions apply coherently at the queried location.
 * Original snapshots and model fields are never overwritten. */
export function sampleGfs(snapshot, point) {
  const value = sampleNativeGfs(snapshot, point);
  if (!value || !snapshot.counterfactual) return value;
  const { windKt = 0, temperatureC = 0, legs = [] } = snapshot.counterfactual;
  const leg = (Number.isFinite(point.distanceNm) ? legs.find(l => point.distanceNm >= l.startNm && point.distanceNm <= l.endNm) : null) || [...legs].sort((a,b) => Math.hypot(a.lat-point.lat,a.lon-point.lon)-Math.hypot(b.lat-point.lat,b.lon-point.lon))[0];
  if (!leg) return null;
  const radians = leg.courseDeg * Math.PI / 180;
  const original = vector(value.windDir, value.windSpd);
  return { ...value, ...windFromVector(original.u - windKt * Math.sin(radians), original.v - windKt * Math.cos(radians)),
    oatC: value.oatC === null ? null : value.oatC + temperatureC, counterfactual: true };
}
