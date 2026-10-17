import { bearingDeg, weatherAtAltitude, windComponentKt } from "./engine.js?v=20261017-07";
import { routeTerrainLegs, terrainMinimumForLeg } from "./terrain.js?v=20261016-01";
import { PERFORMANCE } from "./config.js?v=20261017-06";

const validWindLevels = (fix) => (fix?.windLevels || []).filter((level) => Number.isFinite(level.altitudeFt)
  && Number.isFinite(level.windDir) && Number.isFinite(level.windSpd));
const finiteWind = (fix) => validWindLevels(fix).length > 0
  || (Number.isFinite(fix?.windDir) && Number.isFinite(fix?.windSpd));

export function legWindComponent(leg, altitudeFt) {
  if (!leg || !Number.isFinite(leg.from?.lat) || !Number.isFinite(leg.from?.lon)
    || !Number.isFinite(leg.to?.lat) || !Number.isFinite(leg.to?.lon)) return null;
  const track = bearingDeg(leg.from, leg.to);
  const fix = finiteWind(leg.from) ? leg.from : finiteWind(leg.to) ? leg.to : null;
  if (!fix) return null;
  const weather = weatherAtAltitude({ ...fix, windLevels: validWindLevels(fix) }, altitudeFt);
  return windComponentKt(track, weather.windDir, weather.windSpd);
}

export function routeMatrixPhase(leg, result) {
  const toc = Math.max(0, Number(result.climb?.distanceNm) || 0);
  const tod = Math.max(toc, (Number(result.routeDistanceNm) || 0) - (Number(result.descent?.distanceNm) || 0));
  const cruiseStart = Math.max(leg.startNm, toc);
  const cruiseEnd = Math.min(leg.endNm, tod);
  if (cruiseEnd - cruiseStart > 0.1) {
    if (leg.startNm < toc && leg.endNm > tod) return "climb-cruise-descent";
    if (leg.startNm < toc) return "climb-cruise";
    if (leg.endNm > tod) return "cruise-descent";
    return "cruise";
  }
  if (leg.endNm <= toc) return "climb";
  if (leg.startNm >= tod) return "descent";
  return "transition";
}

export function buildRouteMatrix(plan, results, manualMora = {}) {
  const legs = routeTerrainLegs(plan);
  return legs.map((leg) => {
    const minimum = terrainMinimumForLeg(leg, manualMora);
    return {
      ...leg,
      moraFt: minimum.feet,
      moraSource: minimum.source,
      levels: results.map((result) => {
        const phase = routeMatrixPhase(leg, { ...result, routeDistanceNm: Number(plan.distanceNm) || leg.endNm });
        const inCruise = phase.includes("cruise");
        const marginFt = inCruise && Number.isFinite(minimum.feet) ? result.altitudeFt - minimum.feet : null;
        const terrainStatus = !inCruise ? "outside-cruise" : !Number.isFinite(minimum.feet) ? "unknown"
          : marginFt < 0 ? "unavailable" : marginFt < PERFORMANCE.terrain.marginalBufferFt ? "marginal" : "viable";
        const iceSegment = result.icing?.segments?.find((segment) => segment.from === leg.from.ident && segment.to === leg.to.ident);
        const icingScore = iceSegment?.evidenceAvailable ? iceSegment.riskScore : null;
        return {
          altitudeFt: result.altitudeFt,
          fl: result.fl,
          phase,
          marginFt,
          terrainStatus,
          windComponentKt: legWindComponent(leg, result.altitudeFt),
          icingScore,
        };
      }),
    };
  });
}
