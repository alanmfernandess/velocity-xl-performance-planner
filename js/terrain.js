import { PERFORMANCE } from "./config.js?v=20261016-01";

const radians = (degrees) => degrees * Math.PI / 180;
const distanceNm = (a, b) => {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const validPoint = (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon);
const validMora = (value) => value !== null && value !== undefined && String(value).trim() !== ""
  && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 60000;

export function routeTerrainLegs(plan) {
  if (!validPoint(plan?.origin) || !validPoint(plan?.destination)) return [];
  const points = [{ ...plan.origin, ident: plan.origin.icao, moraFt: NaN }];
  for (const fix of plan.waypoints || []) {
    if (!validPoint(fix)) continue;
    if (distanceNm(points.at(-1), fix) < 0.2) continue;
    points.push(fix);
  }
  if (distanceNm(points.at(-1), plan.destination) >= 0.2) {
    points.push({ ...plan.destination, ident: plan.destination.icao, moraFt: NaN });
  }
  if (points.length < 2) return [];
  const rawLengths = points.slice(1).map((point, index) => distanceNm(points[index], point));
  const geometryNm = rawLengths.reduce((sum, length) => sum + length, 0);
  const routeNm = Number(plan.distanceNm) > 0 ? Number(plan.distanceNm) : geometryNm;
  if (!(geometryNm > 0) || !(routeNm > 0)) return [];
  let startNm = 0;
  return rawLengths.map((length, index) => {
    const endNm = index === rawLengths.length - 1 ? routeNm : startNm + length / geometryNm * routeNm;
    const to = points[index + 1];
    const leg = {
      index,
      from: points[index],
      to,
      startNm,
      endNm,
      moraFt: validMora(to.moraFt) ? Number(to.moraFt) : NaN,
    };
    startNm = endNm;
    return leg;
  });
}

export function terrainMinimumForLeg(leg, manualMora = {}) {
  if (Number.isFinite(leg.moraFt)) return { feet: leg.moraFt, source: "SIMBRIEF" };
  const override = manualMora[leg.index];
  const feet = Number(override?.feet);
  if (validMora(feet) && feet > 0 && String(override?.source || "").trim()) {
    return { feet, source: "MANUAL" };
  }
  return { feet: NaN, source: "MISSING" };
}

export function assessTerrain(plan, result, manualMora = {}) {
  const legs = routeTerrainLegs(plan);
  const tocNm = Math.max(0, Number(result?.climb?.distanceNm) || 0);
  const todNm = Math.max(tocNm, (Number(plan?.distanceNm) || 0) - (Number(result?.descent?.distanceNm) || 0));
  const active = legs.filter((leg) => Math.min(leg.endNm, todNm) - Math.max(leg.startNm, tocNm) > 0.1);
  const assessed = active.map((leg) => {
    const minimum = terrainMinimumForLeg(leg, manualMora);
    return { ...leg, ...minimum, marginFt: Number.isFinite(minimum.feet) ? result.altitudeFt - minimum.feet : NaN };
  });
  const missing = assessed.filter((leg) => !Number.isFinite(leg.feet));
  const known = assessed.filter((leg) => Number.isFinite(leg.feet));
  const critical = known.length ? known.reduce((worst, leg) => leg.marginFt < worst.marginFt ? leg : worst) : null;
  const status = critical?.marginFt < 0 ? "unavailable"
    : !assessed.length || missing.length ? "unknown"
      : critical.marginFt < PERFORMANCE.terrain.marginalBufferFt ? "marginal" : "viable";
  return {
    status,
    legs: assessed,
    critical,
    missingCount: missing.length,
    assessedCount: assessed.length,
    marginFt: critical?.marginFt ?? NaN,
    tocNm,
    todNm,
    bufferFt: PERFORMANCE.terrain.marginalBufferFt,
  };
}

export function sampleRoute(plan, count = PERFORMANCE.terrain.profileSamples) {
  const legs = routeTerrainLegs(plan);
  if (!legs.length) return [];
  const total = legs.at(-1).endNm;
  const samples = [];
  const sampleCount = Math.max(2, Math.floor(count));
  for (let index = 0; index < sampleCount; index += 1) {
    const positionNm = total * index / (sampleCount - 1);
    const leg = legs.find((item) => positionNm <= item.endNm) || legs.at(-1);
    const fraction = Math.max(0, Math.min(1, (positionNm - leg.startNm) / (leg.endNm - leg.startNm)));
    const longitudeDelta = ((leg.to.lon - leg.from.lon + 540) % 360) - 180;
    const longitude = leg.from.lon + longitudeDelta * fraction;
    samples.push({
      distanceNm: positionNm,
      lat: leg.from.lat + (leg.to.lat - leg.from.lat) * fraction,
      lon: ((longitude + 540) % 360) - 180,
    });
  }
  return samples;
}

export async function fetchElevationProfile(plan, fetcher = fetch) {
  const samples = sampleRoute(plan);
  if (!samples.length) throw new Error("Rota sem coordenadas suficientes para o relevo.");
  const params = new URLSearchParams({
    latitude: samples.map((point) => point.lat.toFixed(5)).join(","),
    longitude: samples.map((point) => point.lon.toFixed(5)).join(","),
  });
  const response = await fetcher(`https://api.open-meteo.com/v1/elevation?${params}`);
  if (!response.ok) throw new Error(`Serviço de elevação indisponível (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data.elevation) || data.elevation.length !== samples.length) throw new Error("Resposta de elevação incompleta.");
  return samples.map((point, index) => ({ ...point, elevationFt: Number(data.elevation[index]) * 3.28084 }));
}
