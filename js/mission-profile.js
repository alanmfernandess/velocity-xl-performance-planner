import { buildVirtualFlightProfile, sampleVirtualProfile, virtualTimeAtDistance } from "./virtual-flight.js?v=20261025-01";
import { greatCircleNm } from "./engine.js?v=20261025-01";
import { sampleGfs, gfsSampleStatus } from "./weather/open-meteo.js?v=20261025-01";

const finite = Number.isFinite;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const validCoordinates = (point) => finite(point?.lat) && finite(point?.lon)
  && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
const sameAirport = (fix, airport) => fix?.ident === airport?.icao
  || validCoordinates(fix) && validCoordinates(airport) && greatCircleNm(fix, airport) < .1;

/** No equal spacing: use OFP cumulative distances, or the complete coordinate path. */
export function resolveProfileWaypoints(plan, totalNm) {
  const raw = plan.ofpWaypoints ?? plan.waypoints ?? [];
  const points = raw.map((point, index) => ({ ...point, id: `ofp-fix-${index}`, order: index,
    ident: typeof point.ident === "string" && point.ident.trim() ? point.ident.trim() : null, kind: "fix" }));
  if (!sameAirport(points[0], plan.origin)) points.unshift({ ...plan.origin, ident: plan.origin?.icao || null,
    id: "ofp-origin", distanceNm: 0, kind: "origin" });
  else points[0].kind = "origin";
  if (!sameAirport(points.at(-1), plan.destination)) points.push({ ...plan.destination,
    ident: plan.destination?.icao || null, id: "ofp-destination", distanceNm: totalNm, kind: "destination" });
  else points.at(-1).kind = "destination";
  const diagnostics = [];
  if (raw.length < 2) diagnostics.push(raw.length ? "NAVLOG_SINGLE_FIX" : "NAVLOG_EMPTY");
  // Only a real destination navlog record supplies a second cumulative-distance reference.
  const destination = points.at(-1);
  const reference = destination.id !== "ofp-destination" && finite(destination.distanceNm) && destination.distanceNm > 0
    ? destination.distanceNm : totalNm;
  let previous = -Infinity;
  const inconsistent = points.some((point) => {
    if (!finite(point.distanceNm) || point.id === "ofp-destination") return false;
    const invalid = point.distanceNm < 0 || point.distanceNm < previous - .01 || point.distanceNm > reference + 1;
    previous = point.distanceNm; return invalid;
  });
  const allCoordinates = points.every(validCoordinates);
  const geometric = [0];
  if (allCoordinates) for (let i = 1; i < points.length; i++) geometric.push(geometric.at(-1) + greatCircleNm(points[i - 1], points[i]));
  const geometricTotal = geometric.at(-1);
  const useGeometry = inconsistent && allCoordinates && geometricTotal > 0;
  if (inconsistent) diagnostics.push("OFP_DISTANCES_INCONSISTENT");
  if (useGeometry) diagnostics.push("GEOMETRIC_DISTANCE_RECONCILED");
  const factor = finite(reference) && reference > 0 ? totalNm / reference : 1;
  if (!inconsistent && Math.abs(factor - 1) > .001) diagnostics.push("OFP_DISTANCE_RESCALED");
  const waypoints = points.map((point, index) => {
    let distanceNm = null, distanceSource = "UNKNOWN";
    if (index === 0 && point.kind === "origin") { distanceNm = 0; distanceSource = "AIRPORT"; }
    else if (index === points.length - 1 && point.kind === "destination") { distanceNm = totalNm; distanceSource = "AIRPORT"; }
    else if (useGeometry) {
      distanceNm = geometric[index] / geometricTotal * totalNm; distanceSource = "GEOMETRIC_RECONCILED";
    } else if (!finite(point.distanceNm) && allCoordinates && geometricTotal > 0) {
      let before = index - 1, after = index + 1;
      while (before > 0 && !finite(points[before].distanceNm)) before--;
      while (after < points.length - 1 && !finite(points[after].distanceNm)) after++;
      const startNm = before === 0 ? 0 : points[before].distanceNm * factor;
      const endNm = after === points.length - 1 ? totalNm : points[after].distanceNm * factor;
      const span = geometric[after] - geometric[before];
      if (span > 0 && finite(startNm) && finite(endNm)) {
        distanceNm = startNm + (endNm - startNm) * (geometric[index] - geometric[before]) / span;
        distanceSource = "GEOMETRIC_BETWEEN_OFP_ANCHORS";
      }
    } else if (!inconsistent && finite(point.distanceNm) && point.distanceNm >= 0 && point.distanceNm <= reference + .01) {
      distanceNm = clamp(point.distanceNm * factor, 0, totalNm); distanceSource = factor === 1 ? "OFP_CUMULATIVE" : "OFP_RESCALED";
    }
    return { ...point, order: index, distanceNm, distanceSource, located: finite(distanceNm), coordinatesValid: validCoordinates(point) };
  });
  if (waypoints.some((point) => !point.located)) diagnostics.push("WAYPOINT_POSITION_UNKNOWN");
  if (waypoints.some((point) => point.distanceSource === "GEOMETRIC_BETWEEN_OFP_ANCHORS"))
    diagnostics.push("WAYPOINT_GEOMETRY_BETWEEN_OFP_ANCHORS");
  return { waypoints, diagnostics, distanceReference: { ofpNm: reference, trajectoryNm: totalNm,
    scale: factor, method: useGeometry ? "GEOMETRIC_RECONCILED" : inconsistent ? "UNRESOLVED" : "OFP_CUMULATIVE" } };
}

export function profilePositionAtDistance(model, distanceNm) {
  const route = model?.trajectory?.route || [];
  if (route.length < 2 || !route.every(validCoordinates) || !(route.at(-1).distanceNm > 0)) return { lat: null, lon: null };
  const target = clamp(distanceNm / model.totalNm, 0, 1) * route.at(-1).distanceNm;
  const index = Math.max(1, route.findIndex((point) => point.distanceNm >= target));
  const a = route[index - 1], b = route[index];
  const ratio = b.distanceNm > a.distanceNm ? (target - a.distanceNm) / (b.distanceNm - a.distanceNm) : 0;
  return { lat: a.lat + (b.lat - a.lat) * ratio, lon: a.lon + (b.lon - a.lon) * ratio };
}

export function sampleMissionTime(model, elapsedSec) {
  if (!model?.valid || !finite(elapsedSec)) return null;
  const sample = sampleVirtualProfile(model.profile, elapsedSec);
  return { ...sample, fuelRemainingGal: model.profile.startFuelGal - sample.fuelUsedGal,
    timestampMs: finite(model.startMs) ? model.startMs + sample.elapsedSec * 1000 : null };
}

export function sampleMissionDistance(model, distanceNm) {
  if (!model?.valid || !finite(distanceNm)) return null;
  const time = virtualTimeAtDistance(model.profile, clamp(distanceNm, 0, model.totalNm));
  return finite(time) ? sampleMissionTime(model, time) : null;
}

/** Adapts existing integration results; no aerodynamic or fuel rate is computed here. */
export function buildMissionProfile(plan, candidate) {
  const invalid = (reason) => ({ valid: false, reason, waypoints: [], nodes: [], totalNm: 0 });
  if (!plan || !candidate?.result?.trajectory) return invalid("NO_TRAJECTORY");
  const trajectory = candidate.result.trajectory;
  if (trajectory.route?.length < 2 || !trajectory.route?.every(validCoordinates)) return invalid("ROUTE_COORDINATES_INVALID");
  const profile = buildVirtualFlightProfile(plan, candidate.result, candidate.recommendedFuelGal);
  if (!profile.valid) return invalid(profile.reason);
  if (finite(plan.origin?.elevationFt) && Math.abs(profile.segments[0].startAltitudeFt - plan.origin.elevationFt) > 1
    || finite(plan.destination?.elevationFt) && Math.abs(profile.segments.at(-1).endAltitudeFt - plan.destination.elevationFt) > 1)
    return invalid("AIRPORT_ALTITUDE_PROFILE_MISMATCH");
  if (!finite(trajectory.distanceNm) || Math.abs(trajectory.distanceNm - profile.totalNm) > .5)
    return invalid("TRAJECTORY_DISTANCE_MISMATCH");
  if (Math.abs(trajectory.tocNm - profile.tocNm) > .1 || Math.abs(trajectory.todNm - profile.todNm) > .1)
    return invalid("TRAJECTORY_PHASE_MISMATCH");
  const resolved = resolveProfileWaypoints(plan, profile.totalNm);
  if (profile.todNm <= profile.tocNm + .01) resolved.diagnostics.push("NO_CRUISE_SEGMENT");
  const model = { valid: true, profile, trajectory, totalNm: profile.totalNm, totalSec: profile.totalSec,
    startMs: finite(plan.scheduledOffMs) ? plan.scheduledOffMs : null, ...resolved,
    status: candidate.status, candidate, plan };
  const distances = [...new Set([0, profile.totalNm, profile.tocNm, profile.todNm,
    ...profile.segments.flatMap((part) => [part.startNm, part.endNm]),
    ...trajectory.samples.map((point) => point.distanceNm)].filter(finite))].sort((a, b) => a - b);
  model.nodes = distances.filter((d, i) => !i || d - distances[i - 1] > 1e-7).map((distance) => sampleMissionDistance(model, distance));
  model.waypoints = model.waypoints.map((point) => ({ ...point, predicted: point.located ? sampleMissionDistance(model, point.distanceNm) : null }));
  const heights = [...model.nodes.map((point) => point.altitudeFt), plan.origin?.elevationFt, plan.destination?.elevationFt].filter(finite);
  const low = Math.min(...heights), high = Math.max(...heights);
  model.minFt = Math.floor(low / 1000) * 1000;
  model.maxFt = Math.max(model.minFt + 1000, Math.ceil(high / 1000) * 1000);
  return model;
}

export function searchProfileWaypoints(model, query = "") {
  const clean = query.trim().toLocaleUpperCase();
  return (model?.waypoints || []).filter((point) => !clean || (point.ident || "").toLocaleUpperCase().includes(clean));
}

/** Screen space grouping only; the complete navlog remains in the model. */
export function clusterProfileWaypoints(waypoints, totalNm, width, selectedId = null) {
  if (!(totalNm > 0) || !(width > 0)) return [];
  const located = waypoints.filter((point) => point.located);
  const threshold = located.length <= 12 ? 0 : located.length <= 30 && width / located.length >= 20 ? 0 : 24;
  const groups = [];
  for (const point of located) {
    const x = point.distanceNm / totalNm * width;
    const special = point.kind !== "fix" || point.id === selectedId;
    const previous = groups.at(-1);
    if (threshold && previous && !special && !previous.special && x - previous.firstX < threshold) {
      previous.points.push(point); previous.lastX = x;
      previous.x = previous.points.reduce((sum, p) => sum + p.distanceNm / totalNm * width, 0) / previous.points.length;
    } else groups.push({ x, firstX: x, lastX: x, points: [point], special });
  }
  return groups;
}

/** Shape-preserving Hermite. Segments exceeding 20 ft of visual deviation use
 * their exact linear controls, so drawing can never replace numerical altitude. */
export function smoothProfileGeometry(model, { left = 0, right = 1000, top = 24, bottom = 240 } = {}) {
  if (!model?.valid || model.nodes.length < 2 || !(right > left) || !(bottom > top)) return null;
  const nodes = model.nodes;
  const secants = nodes.slice(1).map((point, i) => (point.altitudeFt - nodes[i].altitudeFt) / (point.distanceNm - nodes[i].distanceNm));
  const slopes = nodes.map((_, i) => {
    if (!i) return secants[0];
    if (i === nodes.length - 1) return secants.at(-1);
    if (secants[i - 1] * secants[i] <= 0) return 0;
    return 2 / (1 / secants[i - 1] + 1 / secants[i]);
  });
  const x = (d) => left + clamp(d / model.totalNm, 0, 1) * (right - left);
  const y = (h) => bottom - (h - model.minFt) / (model.maxFt - model.minFt) * (bottom - top);
  const segments = nodes.slice(1).map((b, i) => {
    const a = nodes[i], dx = b.distanceNm - a.distanceNm, dh = b.altitudeFt - a.altitudeFt;
    let m1 = slopes[i], m2 = slopes[i + 1];
    if (!dh) { m1 = 0; m2 = 0; }
    else {
      const alpha = m1 / secants[i], beta = m2 / secants[i], size = alpha * alpha + beta * beta;
      if (size > 9) { const factor = 3 / Math.sqrt(size); m1 *= factor; m2 *= factor; }
    }
    let c1 = a.altitudeFt + dx * m1 / 3, c2 = b.altitudeFt - dx * m2 / 3;
    const at = (t) => (1 - t) ** 3 * a.altitudeFt + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * b.altitudeFt;
    const conservative = [.125, .25, .5, .75, .875].some((t) => Math.abs(at(t) - (a.altitudeFt + dh * t)) > 20)
      || Math.min(c1, c2) < Math.min(a.altitudeFt, b.altitudeFt) || Math.max(c1, c2) > Math.max(a.altitudeFt, b.altitudeFt);
    if (conservative) { c1 = a.altitudeFt + dh / 3; c2 = a.altitudeFt + 2 * dh / 3; }
    return { a, b, c1, c2, conservative, command: `C${x(a.distanceNm + dx / 3)},${y(c1)} ${x(a.distanceNm + dx * 2 / 3)},${y(c2)} ${x(b.distanceNm)},${y(b.altitudeFt)}` };
  });
  const path = `M${x(nodes[0].distanceNm)},${y(nodes[0].altitudeFt)} ${segments.map((part) => part.command).join(" ")}`;
  return { path, area: `${path} L${right},${bottom} L${left},${bottom} Z`, segments, x, y, left, right, top, bottom };
}

export function profileWeatherLayers(model, snapshot) {
  if (!model?.valid) return { METEO: [], ICE: [], RIDE: [], FUEL: [] };
  const samples = model.trajectory.samples;
  const meteo = samples.map((point, index) => {
    const wx = sampleGfs(snapshot?.gfs, point);
    const status = gfsSampleStatus(snapshot?.gfs, point, wx);
    const atmosphereKnown = wx && [wx.oatC, wx.windDir, wx.windSpd].every(finite);
    return { startNm: index ? (samples[index - 1].distanceNm + point.distanceNm) / 2 : 0,
      endNm: index < samples.length - 1 ? (point.distanceNm + samples[index + 1].distanceNm) / 2 : model.totalNm,
      known: status === "COVERED" && Boolean(atmosphereKnown),
      value: wx && !atmosphereKnown ? "ATMOSPHERIC_FIELDS_MISSING" : status, source: wx ? "OPEN_METEO" : "UNAVAILABLE",
      timestampMs: point.timestampMs, altitudeFt: point.altitudeFt, phase: point.phase };
  });
  const exposure = (data) => data?.profileSamples ? data.profileSamples.map((point, index, points) => ({ ...point,
    startNm: index ? (points[index - 1].distanceNm + point.distanceNm) / 2 : 0,
    endNm: index < points.length - 1 ? (point.distanceNm + points[index + 1].distanceNm) / 2 : model.totalNm,
    known: Boolean(point.evidenceAvailable), value: point.riskScore, source: "EXISTING_TRAJECTORY_ASSESSMENT" }))
    : (data?.segments || []).filter((s) => finite(s.startNm) && finite(s.endNm)).map((s) => ({ ...s,
    startNm: clamp(s.startNm, 0, model.totalNm), endNm: clamp(s.endNm, 0, model.totalNm),
    known: Boolean(s.evidenceAvailable) && (s.totalSamples == null ? data.compatibility !== "UNKNOWN" : s.coveredSamples === s.totalSamples),
    value: s.riskScore, source: "EXISTING_EXPOSURE" }));
  return { METEO: meteo, ICE: exposure(model.candidate.result.icing), RIDE: exposure(model.candidate.result.turbulence),
    FUEL: model.profile.segments.map((s) => ({ startNm: s.startNm, endNm: s.endNm, known: true,
      value: s.fuelFlowGph, usedGal: s.endUsedGal - s.startUsedGal, source: "PERFORMANCE" })) };
}
