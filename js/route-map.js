const radians = (degrees) => degrees * Math.PI / 180;

function greatCircleNm(from, to) {
  const lat1 = radians(Number(from.lat));
  const lat2 = radians(Number(to.lat));
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(Number(to.lon) - Number(from.lon));
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

const validPoint = (point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon));
const normalizedIdent = (point) => String(point?.ident || point?.icao || "").trim().toUpperCase();

function sameRoutePoint(left, right) {
  if (!validPoint(left) || !validPoint(right)) return false;
  if (normalizedIdent(left) && normalizedIdent(left) === normalizedIdent(right)) return true;
  return greatCircleNm(left, right) < 0.25;
}

export function completeRouteFixes(plan) {
  const fixes = (plan?.waypoints || [])
    .filter(validPoint)
    .map((fix, index) => ({ ...fix, ident: normalizedIdent(fix) || `WPT${index + 1}`, source: "ofp" }));
  const origin = validPoint(plan?.origin)
    ? { ...plan.origin, ident: String(plan.origin.icao || plan.origin.ident || "ORIG").toUpperCase(), distanceNm: 0, source: "endpoint" }
    : null;
  const destination = validPoint(plan?.destination)
    ? { ...plan.destination, ident: String(plan.destination.icao || plan.destination.ident || "DEST").toUpperCase(), distanceNm: Number(plan.distanceNm) || 0, source: "endpoint" }
    : null;

  if (origin && (!fixes.length || !sameRoutePoint(origin, fixes[0]))) fixes.unshift(origin);
  if (destination && (!fixes.length || !sameRoutePoint(destination, fixes.at(-1)))) fixes.push(destination);
  return fixes;
}

export function unwrapRouteLongitudes(fixes) {
  let previous;
  return fixes.map((fix) => {
    let lon = Number(fix.lon);
    if (Number.isFinite(previous)) {
      while (lon - previous > 180) lon -= 360;
      while (lon - previous < -180) lon += 360;
    }
    previous = lon;
    return { ...fix, mapLon: lon };
  });
}

export function pointAlongPolyline(points, fraction) {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
  let target = Math.max(0, Math.min(1, Number(fraction) || 0)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index]) {
      const ratio = lengths[index] ? target / lengths[index] : 0;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    target -= lengths[index];
  }
  return points.at(-1);
}

function overlaps(left, right, spacing = 3) {
  return !(left.x2 + spacing < right.x1 || right.x2 + spacing < left.x1 || left.y2 + spacing < right.y1 || right.y2 + spacing < left.y1);
}

export function layoutRouteLabels(markers, width, height) {
  const placed = [];
  const candidates = [
    { dx: 0, dy: -18, anchor: "middle" }, { dx: 0, dy: 25, anchor: "middle" },
    { dx: 13, dy: -7, anchor: "start" }, { dx: -13, dy: -7, anchor: "end" },
    { dx: 13, dy: 18, anchor: "start" }, { dx: -13, dy: 18, anchor: "end" },
    { dx: 0, dy: -34, anchor: "middle" }, { dx: 0, dy: 41, anchor: "middle" },
    { dx: 22, dy: -23, anchor: "start" }, { dx: -22, dy: 30, anchor: "end" },
  ];
  return markers.map((marker, index) => {
    const labelWidth = Math.min(104, Math.max(32, marker.ident.length * 6.2 + 8));
    const labelHeight = 14;
    let selected;
    for (const candidate of candidates) {
      const x = marker.x + candidate.dx;
      const y = marker.y + candidate.dy;
      const x1 = candidate.anchor === "middle" ? x - labelWidth / 2 : candidate.anchor === "end" ? x - labelWidth : x;
      const box = { x1, y1: y - 10, x2: x1 + labelWidth, y2: y + 4 };
      const inside = box.x1 >= 2 && box.x2 <= width - 2 && box.y1 >= 2 && box.y2 <= height - 2;
      if (inside && placed.every((other) => !overlaps(box, other))) {
        selected = { ...candidate, x, y, box };
        break;
      }
    }
    if (!selected) {
      const dy = index % 2 ? 25 + (index % 4) * 12 : -18 - (index % 4) * 12;
      const y = Math.max(12, Math.min(height - 6, marker.y + dy));
      const x = Math.max(labelWidth / 2 + 2, Math.min(width - labelWidth / 2 - 2, marker.x));
      selected = { dx: x - marker.x, dy: y - marker.y, anchor: "middle", x, y, box: { x1: x - labelWidth / 2, y1: y - 10, x2: x + labelWidth / 2, y2: y + 4 } };
    }
    placed.push(selected.box);
    return { ...marker, labelX: selected.x, labelY: selected.y, labelAnchor: selected.anchor };
  });
}

export function buildRouteGeometry(plan, { width = 860, height = 360, padX = 54, padY = 54 } = {}) {
  const fixes = unwrapRouteLongitudes(completeRouteFixes(plan));
  if (!fixes.length) return { width, height, fixes: [], points: [], path: "" };
  const lats = fixes.map((fix) => Number(fix.lat));
  const lons = fixes.map((fix) => fix.mapLon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 1;
  const lonSpan = maxLon - minLon || 1;
  const project = (fix) => ({
    x: padX + ((fix.mapLon - minLon) / lonSpan) * (width - padX * 2),
    y: height - padY - ((Number(fix.lat) - minLat) / latSpan) * (height - padY * 2),
  });
  const points = fixes.map((fix) => ({ ...project(fix), ...fix }));
  return {
    width,
    height,
    fixes,
    points,
    path: points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" "),
  };
}
