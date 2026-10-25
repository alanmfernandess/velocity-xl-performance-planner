import { sampleGfs, gfsSampleStatus } from "./open-meteo.js?v=20261024-03";
import { awcEvidenceAt } from "./awc.js?v=20261024-03";
import { weatherAtAltitude, isaTemperatureC } from "../engine.js?v=20261024-03";

const nearestFix = (plan, point) => (plan.waypoints || [])
  .filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon))
  .sort((a, b) => Math.hypot(a.lat - point.lat, a.lon - point.lon) - Math.hypot(b.lat - point.lat, b.lon - point.lon))[0];

/** A reproducible, immutable snapshot for all nine candidates. */
export function createWeatherSnapshot(plan, { gfs = null, awc = null, errors = [] } = {}) {
  const gfsReady = gfs?.status === "available", awcReady = awc?.status === "available";
  return { ofpKey: `${plan?.ofpId || "unknown"}:${plan?.generatedAtMs || "unknown"}:${plan?.origin?.icao}:${plan?.destination?.icao}`,
    status: gfsReady && awcReady ? "FULL_WEATHER" : gfsReady || awcReady ? "PARTIAL_WEATHER" : "SIMBRIEF_ONLY",
    sources: { SIMBRIEF: { status: "available", generatedAtMs: plan?.generatedAtMs ?? null },
      OPEN_METEO: { status: gfs?.status || "unavailable", fetchedAtMs: gfs?.fetchedAtMs ?? null, model: gfs?.model || null },
      AWC: { status: awc?.status || "unavailable", generatedAtMs: awc?.generatedAtMs ?? null } },
    gfs, awc, errors: [...errors] };
}

export function weatherAt(snapshot, plan, point) {
  const model = sampleGfs(snapshot?.gfs, point);
  const gfsStatus = gfsSampleStatus(snapshot?.gfs, point, model);
  const fix = nearestFix(plan, point);
  const ofp = fix ? weatherAtAltitude(fix, point.altitudeFt) : null;
  const hasOfpWind = fix && ((fix.windLevels || []).some((level) => Number.isFinite(level.windDir) && Number.isFinite(level.windSpd))
    || Number.isFinite(fix.windDir) && Number.isFinite(fix.windSpd));
  const hasOfpTemperature = fix && ((fix.windLevels || []).some((level) => Number.isFinite(level.oatC)) || Number.isFinite(fix.oatC));
  return {
    oatC: model?.oatC ?? (hasOfpTemperature ? ofp.oatC : null),
    windDir: model?.windDir ?? (hasOfpWind ? ofp.windDir : null),
    windSpd: model?.windSpd ?? (hasOfpWind ? ofp.windSpd : null),
    humidity: model?.humidity ?? null, cloudCover: model?.cloudCover ?? null,
    verticalVelocity: model?.verticalVelocity ?? null, cape: model?.cape ?? null,
    precipitationMm: model?.precipitationMm ?? null, freezingLevelFt: model?.freezingLevelFt ?? null,
    isaDeviationC: (model?.oatC ?? (hasOfpTemperature ? ofp.oatC : null)) === null ? null
      : (model?.oatC ?? ofp.oatC) - isaTemperatureC(point.altitudeFt),
    evidence: awcEvidenceAt(snapshot?.awc, point),
    provenance: { atmosphere: model ? "OPEN_METEO" : hasOfpWind || hasOfpTemperature ? "SIMBRIEF" : "UNAVAILABLE",
      model: model?.model || null, validAtMs: model?.validAtMs ?? null, method: model?.method || (fix ? "nearest OFP fix" : null),
      coverage: model?.coverage || null, gfsStatus, awc: snapshot?.awc?.status || "unavailable" },
  };
}
