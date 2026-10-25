import { greatCircleNm } from "./engine.js?v=20261025-01";
import { PERFORMANCE } from "./config.js?v=20261025-01";

function routePoints(plan) {
  const raw = [plan.origin, ...(plan.waypoints || []), plan.destination]
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
  const points = [];
  let distanceNm = 0;
  raw.forEach((point) => {
    if (points.length) distanceNm += greatCircleNm(points.at(-1), point);
    if (!points.length || distanceNm > points.at(-1).distanceNm + 0.01) points.push({ ...point, distanceNm });
  });
  return points;
}

function positionAt(points, fraction) {
  if (!points.length) return { lat: null, lon: null, ident: "—" };
  if (points.length === 1) return points[0];
  const target = Math.max(0, Math.min(1, fraction)) * points.at(-1).distanceNm;
  const upper = points.findIndex((point) => point.distanceNm >= target);
  const to = points[Math.max(1, upper)], from = points[Math.max(0, points.indexOf(to) - 1)];
  const w = to.distanceNm === from.distanceNm ? 0 : (target - from.distanceNm) / (to.distanceNm - from.distanceNm);
  return { lat: from.lat + (to.lat - from.lat) * w, lon: from.lon + (to.lon - from.lon) * w,
    from: from.ident || from.icao, to: to.ident || to.icao };
}

/** @typedef {{lat:number|null,lon:number|null,altitudeFt:number,timestampMs:number|null,phase:string,distanceNm:number,minutes:number}} TrajectorySample */

/**
 * Samples the exact distance/time balance returned by the performance model.
 * Missing OFP time remains null, so time-specific external weather cannot be
 * misapplied to an arbitrary assumed departure.
 */
export function buildTrajectory(plan, result, alternateLeg = null) {
  const route = routePoints(plan), distanceNm = Math.max(0, Number(plan.distanceNm) || 0);
  const startMs = Number.isFinite(plan.scheduledOffMs) ? plan.scheduledOffMs : null;
  const originFt = Number.isFinite(plan.origin?.elevationFt) ? plan.origin.elevationFt : 0;
  const destinationFt = Number.isFinite(plan.destination?.elevationFt) ? plan.destination.elevationFt : 0;
  const phases = [
    { phase: "climb", distanceNm: result.climb.distanceNm, hours: result.climb.timeHr,
      altitude: (f) => originFt + (result.altitudeFt - originFt) * f },
    { phase: "cruise", distanceNm: result.cruise.distanceNm, hours: result.cruise.timeHr, altitude: () => result.altitudeFt },
    { phase: "descent", distanceNm: result.descent.distanceNm, hours: result.descent.timeHr,
      altitude: (f) => result.altitudeFt + (destinationFt - result.altitudeFt) * f },
  ];
  const samples = [];
  let precedingNm = 0, precedingHr = 0;
  for (const item of phases) {
    const count = Math.max(2, Math.ceil(Math.max(item.distanceNm / PERFORMANCE.trajectoryV2.maxCruiseSampleNm,
      item.hours * 60 / PERFORMANCE.trajectoryV2.maxSampleMinutes,
      item.phase === "cruise" ? 0 : Math.abs(result.altitudeFt - (item.phase === "climb" ? originFt : destinationFt)) / PERFORMANCE.trajectoryV2.maxVerticalSampleFt)));
    for (let i = 0; i < count; i += 1) {
      const fraction = (i + 0.5) / count;
      const traversedNm = precedingNm + item.distanceNm * fraction;
      const position = positionAt(route, distanceNm ? traversedNm / distanceNm : 0);
      samples.push({ ...position, altitudeFt: item.altitude(fraction),
        timestampMs: startMs === null ? null : startMs + (precedingHr + item.hours * fraction) * 3600_000,
        phase: item.phase, distanceNm: traversedNm, minutes: item.hours * 60 / count });
    }
    precedingNm += item.distanceNm;
    precedingHr += item.hours;
  }
  const endMs = startMs === null ? null : startMs + precedingHr * 3600_000;
  const alternate = plan.alternates?.[0];
  const alternateSamples = [];
  if (alternateLeg && alternate && Number.isFinite(plan.destination?.lat) && Number.isFinite(plan.destination?.lon)
    && Number.isFinite(alternate.lat) && Number.isFinite(alternate.lon) && alternateLeg.distanceNm > 0) {
    const count = Math.max(4, Math.ceil(Math.max(alternateLeg.distanceNm / PERFORMANCE.trajectoryV2.alternateSampleNm,
      alternateLeg.timeHr * 60 / PERFORMANCE.trajectoryV2.maxSampleMinutes)));
    const alternateFt = Number.isFinite(alternate.elevationFt) ? alternate.elevationFt : 0;
    // The alternate leg uses the diversion distance/time; its intermediate
    // altitude is a conservative screening estimate, not a filed procedure.
    const enrouteFt = Math.min(result.altitudeFt, Math.max(destinationFt, alternateFt)
      + Math.min(PERFORMANCE.trajectoryV2.alternateClimbCapFt, alternateLeg.distanceNm * 50));
    for (let i = 0; i < count; i += 1) {
      const fraction = (i + .5) / count;
      const altitudeFt = fraction < .25 ? destinationFt + (enrouteFt - destinationFt) * fraction / .25
        : fraction > .75 ? enrouteFt + (alternateFt - enrouteFt) * (fraction - .75) / .25 : enrouteFt;
      alternateSamples.push({ lat: plan.destination.lat + (alternate.lat - plan.destination.lat) * fraction,
        lon: plan.destination.lon + (alternate.lon - plan.destination.lon) * fraction,
        altitudeFt, timestampMs: endMs === null ? null : endMs + alternateLeg.timeHr * fraction * 3600_000,
        phase: "alternate", from: plan.destination.icao, to: alternate.icao,
        distanceNm: distanceNm + alternateLeg.distanceNm * fraction,
        minutes: alternateLeg.timeHr * 60 / count });
    }
  }
  return { samples, alternateSamples, route, startMs, endMs,
    distanceNm: precedingNm, timeHr: precedingHr, tocNm: result.climb.distanceNm,
    todNm: result.climb.distanceNm + result.cruise.distanceNm };
}
