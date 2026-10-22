// AWC prohibits browser CORS. The frontend reads a public JSON snapshot
// published by the repository workflow; it never calls AWC from the browser.
export const AWC_SNAPSHOT_URL = "https://raw.githubusercontent.com/alanmfernandess/velocity-xl-performance-planner/weather-snapshots/awc/latest.json";
const finite = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const timestamp = (value) => Number.isFinite(Number(value)) ? Number(value) * 1000 : Date.parse(value);

export function normalizeSigmet(raw) {
  const polygon = Array.isArray(raw?.coords) ? raw.coords.map((p) => ({ lat: finite(p.lat), lon: finite(p.lon) }))
    .filter((p) => p.lat !== null && p.lon !== null) : [];
  const validFromMs = timestamp(raw?.validTimeFrom);
  const validToMs = timestamp(raw?.validTimeTo);
  if (!Number.isFinite(validFromMs) || !Number.isFinite(validToMs) || validToMs <= validFromMs) return null;
  const hazard = String(raw?.hazard || "").toUpperCase();
  const text = String(raw?.rawSigmet || "");
  const baseFt = finite(raw?.base), topFt = finite(raw?.top);
  const phenomenon = /ICE|ICING|FZRA/.test(hazard + " " + text) ? "ICE"
    : /TURB|SEV TURB/.test(hazard + " " + text) ? "TURBULENCE"
      : /TS|CB|CONV/.test(hazard + " " + text) ? "CONVECTION" : "OTHER";
  return { id: String(raw?.id || `${raw?.firId || "AWC"}:${raw?.seriesId || ""}:${validFromMs}`),
    source: "AWC", kind: "SIGMET", phenomenon, hazard, text,
    intensity: /SEV|SEVERE/.test(text) ? "SEVERE" : /MOD|MODERATE/.test(text) ? "MODERATE" : "UNSPECIFIED",
    validFromMs, validToMs, baseFt, topFt, verticalKnown: baseFt !== null || topFt !== null, polygon };
}

export function normalizePirep(raw) {
  const lat = finite(raw?.lat), lon = finite(raw?.lon);
  const observedAtMs = timestamp(raw?.obsTime || raw?.reportTime);
  if (lat === null || lon === null || !Number.isFinite(observedAtMs)) return null;
  const text = String(raw?.rawOb || raw?.rawPirep || "");
  const phenomenon = /\/IC\b|ICING/i.test(text) ? "ICE" : /\/TB\b|TURB/i.test(text) ? "TURBULENCE" : "OTHER";
  const altitudeFt = finite(raw?.fltlvl);
  return { id: `${lat}:${lon}:${observedAtMs}`, source: "AWC", kind: "PIREP", phenomenon, text,
    lat, lon, altitudeFt: altitudeFt !== null && altitudeFt < 1000 ? altitudeFt * 100 : altitudeFt,
    observedAtMs, intensity: /SEV|HVY/i.test(text) ? "SEVERE" : /MOD/i.test(text) ? "MODERATE" : "UNSPECIFIED" };
}

export function parseAwcSnapshot(raw, nowMs = Date.now()) {
  const generatedAtMs = Date.parse(raw?.generatedAt);
  if (!Number.isFinite(generatedAtMs) || generatedAtMs > nowMs + 5 * 60_000) throw new Error("Invalid AWC snapshot timestamp");
  const ageMs = nowMs - generatedAtMs;
  return { provider: "AWC", status: ageMs <= 90 * 60_000 ? "available" : "stale",
    generatedAtMs, ageMs,
    sigmets: (Array.isArray(raw.sigmets) ? raw.sigmets : []).map(normalizeSigmet).filter(Boolean),
    pireps: (Array.isArray(raw.pireps) ? raw.pireps : []).map(normalizePirep).filter(Boolean) };
}

export async function fetchAwcSnapshot({ fetcher = fetch, signal, nowMs = Date.now(), url = AWC_SNAPSHOT_URL } = {}) {
  try {
    const response = await fetcher(url, { signal, cache: "no-cache" });
    if (!response.ok) return { provider: "AWC", status: "unavailable", reason: `HTTP_${response.status}`, sigmets: [], pireps: [] };
    return parseAwcSnapshot(await response.json(), nowMs);
  } catch (error) {
    if (signal?.aborted) throw error;
    return { provider: "AWC", status: "unavailable", reason: error.message, sigmets: [], pireps: [] };
  }
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.lat > point.lat) !== (b.lat > point.lat)
      && point.lon < (b.lon - a.lon) * (point.lat - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

/** Filter official evidence at the actual 4D trajectory sample. */
export function awcEvidenceAt(snapshot, point) {
  if (snapshot?.status !== "available") return [];
  const { lat, lon, altitudeFt, timestampMs } = point;
  const sigmets = snapshot.sigmets.filter((item) => timestampMs >= item.validFromMs && timestampMs <= item.validToMs
    && (item.baseFt === null || altitudeFt >= item.baseFt) && (item.topFt === null || altitudeFt <= item.topFt)
    && item.polygon.length >= 3 && pointInPolygon({ lat, lon }, item.polygon));
  const pireps = snapshot.pireps.filter((item) => Math.abs(timestampMs - item.observedAtMs) <= 2 * 60 * 60_000
    && Math.hypot((item.lat - lat) * 60, (item.lon - lon) * 60 * Math.cos(lat * Math.PI / 180)) <= 35
    && (item.altitudeFt === null || Math.abs(item.altitudeFt - altitudeFt) <= 3000));
  return [...sigmets, ...pireps];
}
