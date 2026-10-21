import { greatCircleNm } from "./engine.js?v=20261021-unified";

const number = (value, fallback = 0) => {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

function arrayOf(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.fix)) return value.fix;
  if (value?.fix) return [value.fix];
  return [];
}

function weatherText(...values) {
  const output = [];
  const collect = (value) => {
    if (typeof value === "string" || typeof value === "number") output.push(String(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  values.forEach(collect);
  return [...new Set(output.map((value) => value.trim()).filter(Boolean))].join(" ");
}

function bulletinTexts(...values) {
  const output = [];
  const collect = (value) => {
    if (typeof value === "string" || typeof value === "number") output.push(String(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      ["rawText", "raw_text", "text", "message", "bulletin"].forEach((key) => {
        if (typeof value[key] === "string") output.push(value[key]);
      });
    }
  };
  values.forEach(collect);
  return [...new Set(output.map((value) => value.trim()).filter(Boolean))];
}

const bulletinText = (...values) => bulletinTexts(...values).join(" ");

function advisoryItems(value) {
  if (Array.isArray(value)) return value.flatMap(advisoryItems);
  return value == null ? [] : [value];
}

function advisoryPolygon(text) {
  const area = String(text).match(/\bWI\s+([\s\S]*?)(?=\s+(?:FL\d{2,3}|TOP|STNR|MOV|WKN|INTSF)\b|$)/i)?.[1];
  if (!area) return [];
  return [...area.matchAll(/\b([NS])(\d{2})(\d{2})\s+([EW])(\d{3})(\d{2})\b/gi)].map((match) => ({
    lat: (Number(match[2]) + Number(match[3]) / 60) * (match[1].toUpperCase() === "S" ? -1 : 1),
    lon: (Number(match[5]) + Number(match[6]) / 60) * (match[4].toUpperCase() === "W" ? -1 : 1),
  }));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.lat > point.lat) !== (b.lat > point.lat)
      && point.lon < (b.lon - a.lon) * (point.lat - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.lon - p.lon) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lon - p.lon);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if ([abC, abD, cdA, cdB].every((value) => Math.abs(value) < 1e-10)) {
    return Math.max(Math.min(a.lat, b.lat), Math.min(c.lat, d.lat)) <= Math.min(Math.max(a.lat, b.lat), Math.max(c.lat, d.lat))
      && Math.max(Math.min(a.lon, b.lon), Math.min(c.lon, d.lon)) <= Math.min(Math.max(a.lon, b.lon), Math.max(c.lon, d.lon));
  }
  return abC * abD <= 0 && cdA * cdB <= 0;
}

function advisoryApplies(advisory, route, flightStart, flightEnd) {
  const text = bulletinText(advisory);
  const start = Date.parse(advisory?.start);
  const end = Date.parse(advisory?.end);
  if (Number.isFinite(flightStart) && Number.isFinite(flightEnd)) {
    if (Number.isFinite(start) && flightEnd < start) return false;
    if (Number.isFinite(end) && flightStart > end) return false;
  }
  const polygon = advisoryPolygon(text);
  if (polygon.length < 3 || route.length < 2) return true;
  if (route.some((point) => pointInPolygon(point, polygon))) return true;
  return route.slice(1).some((point, index) => polygon.some((corner, edge) => (
    segmentsIntersect(route[index], point, corner, polygon[(edge + 1) % polygon.length])
  )));
}

function advisoryLegCoverage(advisory, route, flightStart, flightEnd) {
  const polygon = advisoryPolygon(bulletinText(advisory));
  const validFrom = Date.parse(advisory?.start);
  const validUntil = Date.parse(advisory?.end);
  const lengths = route.slice(1).map((point, index) => greatCircleNm(route[index], point));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let precedingLength = 0;
  return lengths.map((length, index) => {
    const from = route[index];
    const to = route[index + 1];
    const timed = Number.isFinite(flightStart) && Number.isFinite(flightEnd) && flightEnd > flightStart;
    const samples = Math.max(24, Math.ceil(length / 5));
    let overlapping = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const fraction = (sample + 0.5) / samples;
      const point = { lat: from.lat + (to.lat - from.lat) * fraction, lon: from.lon + (to.lon - from.lon) * fraction };
      if (polygon.length >= 3 && !pointInPolygon(point, polygon)) continue;
      const sampleTime = timed ? flightStart + ((precedingLength + length * fraction) / totalLength) * (flightEnd - flightStart) : NaN;
      if (Number.isFinite(sampleTime) && (Number.isFinite(validFrom) && sampleTime < validFrom
        || Number.isFinite(validUntil) && sampleTime > validUntil)) continue;
      overlapping += 1;
    }
    let coverage = overlapping / samples;
    if (!overlapping && polygon.length >= 3
      && polygon.some((corner, edge) => segmentsIntersect(from, to, corner, polygon[(edge + 1) % polygon.length]))) {
      const legStart = timed ? flightStart + (precedingLength / totalLength) * (flightEnd - flightStart) : NaN;
      const legEnd = timed ? flightStart + ((precedingLength + length) / totalLength) * (flightEnd - flightStart) : NaN;
      if ((!Number.isFinite(validFrom) || !timed || validFrom <= legStart)
        && (!Number.isFinite(validUntil) || !timed || validUntil >= legEnd)) coverage = 1 / samples;
    }
    precedingLength += length;
    return coverage;
  });
}

function parseWindLevels(fix) {
  const raw = fix.wind_data?.level || fix.wind_data || fix.wind;
  const levels = Array.isArray(raw) ? raw : raw && typeof raw === "object" && "altitude" in raw ? [raw] : arrayOf(raw);
  return levels
    .map((level) => ({
      altitudeFt: number(level.altitude, NaN),
      windDir: number(level.wind_dir, NaN),
      windSpd: number(level.wind_spd, NaN),
      oatC: number(level.oat, NaN),
    }))
    .filter((level) => Number.isFinite(level.altitudeFt))
    .sort((a, b) => a.altitudeFt - b.altitudeFt);
}

function windForAltitude(fix, altitudeFt, levels) {
  if (levels.length) {
    return levels.reduce((closest, level) => {
      const distance = Math.abs(level.altitudeFt - altitudeFt);
      return distance < closest.distance ? { level, distance } : closest;
    }, { level: levels[0], distance: Infinity }).level;
  }
  return fix;
}

export function parseSimBrief(data) {
  const status = data?.fetch?.status;
  if (status && !String(status).toLowerCase().includes("success")) throw new Error(String(status).replace(/^Error:\s*/i, ""));

  const origin = {
    icao: first(data.origin?.icao_code, data.origin?.icao, "ORIG"),
    name: first(data.origin?.name, "Origem"),
    lat: number(first(data.origin?.pos_lat, data.origin?.latitude)),
    lon: number(first(data.origin?.pos_long, data.origin?.longitude)),
    elevationFt: number(first(data.origin?.elevation, data.origin?.elevation_ft), 0),
  };
  const destination = {
    icao: first(data.destination?.icao_code, data.destination?.icao, "DEST"),
    name: first(data.destination?.name, "Destino"),
    lat: number(first(data.destination?.pos_lat, data.destination?.latitude)),
    lon: number(first(data.destination?.pos_long, data.destination?.longitude)),
    elevationFt: number(first(data.destination?.elevation, data.destination?.elevation_ft), 0),
  };
  const plannedAltitudeFt = number(first(data.general?.initial_altitude, data.general?.cruise_altitude), 18000);
  const originMetar = weatherText(data.weather?.orig_metar, data.origin?.metar);
  const originTaf = weatherText(data.weather?.orig_taf, data.origin?.taf);
  const destinationMetar = weatherText(data.weather?.dest_metar, data.destination?.metar);
  const destinationTaf = weatherText(data.weather?.dest_taf, data.destination?.taf);
  const alternateMetar = weatherText(data.weather?.altn_metar);
  const alternateTaf = weatherText(data.weather?.altn_taf);
  const originWeatherText = weatherText(originMetar, originTaf, data.origin?.weather);
  const destinationWeatherText = weatherText(destinationMetar, destinationTaf, data.destination?.weather);
  const rawFixes = arrayOf(data.navlog);
  const route = rawFixes.map((fix) => ({ lat: number(fix.pos_lat, NaN), lon: number(fix.pos_long, NaN) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (route.length < 2) route.push(origin, destination);
  const flightStart = Date.parse(first(data.times?.sched_off, data.times?.est_off));
  const flightEnd = Date.parse(first(data.times?.sched_on, data.times?.est_on));
  const advisoryMap = new Map();
  [data.weather?.enroute, data.weather?.sigmet, data.weather?.sigmets, data.sigmets,
    data.weather?.airmet, data.weather?.airmets, data.airmets].flatMap(advisoryItems)
    .filter((advisory) => advisoryApplies(advisory, route, flightStart, flightEnd))
    .forEach((advisory) => {
      const text = bulletinText(advisory);
      if (!text) return;
      const previous = advisoryMap.get(text);
      if (!previous || (!previous.start && !previous.end && (advisory?.start || advisory?.end))) advisoryMap.set(text, advisory);
    });
  const enrouteAdvisories = [...advisoryMap.entries()].map(([text, advisory]) => ({
    text,
    legCoverage: advisoryLegCoverage(advisory, route, flightStart, flightEnd),
  })).filter((advisory) => advisory.legCoverage.some((coverage) => coverage > 0));
  const enrouteBulletins = enrouteAdvisories.map((advisory) => advisory.text);
  const enrouteWeatherText = enrouteBulletins.join("\n");
  let cumulativeNm = 0;
  const waypoints = rawFixes.map((fix, index) => {
    const windLevels = parseWindLevels(fix);
    const weather = windForAltitude(fix, plannedAltitudeFt, windLevels);
    const waypoint = {
      ident: first(fix.ident, `WPT${index + 1}`),
      lat: number(first(fix.pos_lat, fix.latitude), NaN),
      lon: number(first(fix.pos_long, fix.longitude), NaN),
      distanceNm: number(first(fix.cum_distance, fix.distance), cumulativeNm),
      windDir: number(first(weather.windDir, weather.wind_dir, fix.wind_dir), NaN),
      windSpd: number(first(weather.windSpd, weather.wind_spd, fix.wind_spd), NaN),
      oatC: number(first(weather.oatC, weather.oat, fix.oat), NaN),
      shear: number(fix.shear, NaN),
      tropopauseFt: number(first(fix.tropopause_feet, fix.tropopause), NaN),
      altitudeFt: number(first(fix.altitude_feet, fix.altitude), NaN),
      // SimBrief navlog MORA applies to the leg ending at this fix.
      moraFt: number(fix.mora, NaN),
      stage: first(fix.stage, ""),
      windLevels,
      weatherText: bulletinText(fix.weather, fix.wx, fix.conditions, fix.sigmet, fix.airmet),
      weatherBulletins: bulletinTexts(fix.weather, fix.wx, fix.conditions, fix.sigmet, fix.airmet),
    };
    if (index > 0 && Number.isFinite(waypoint.lat) && Number.isFinite(waypoint.lon)) {
      const previous = rawFixes[index - 1];
      const prevPoint = { lat: number(previous.pos_lat, NaN), lon: number(previous.pos_long, NaN) };
      if (Number.isFinite(prevPoint.lat) && Number.isFinite(prevPoint.lon)) cumulativeNm += greatCircleNm(prevPoint, waypoint);
    }
    waypoint.distanceNm = number(first(fix.cum_distance, cumulativeNm), cumulativeNm);
    return waypoint;
  }).filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon));

  if (!waypoints.length) waypoints.push(
    { ident: origin.icao, lat: origin.lat, lon: origin.lon, distanceNm: 0, windDir: 0, windSpd: 0, oatC: NaN, windLevels: [] },
    { ident: destination.icao, lat: destination.lat, lon: destination.lon, distanceNm: 0, windDir: 0, windSpd: 0, oatC: NaN, windLevels: [] },
  );

  const distanceNm = number(first(data.general?.route_distance, data.general?.air_distance, cumulativeNm), cumulativeNm);
  const rawGenerated = first(data.params?.time_generated, data.times?.sched_out);
  const generatedDate = rawGenerated && Number.isNaN(Number(rawGenerated)) ? new Date(rawGenerated) : new Date(number(rawGenerated) * 1000);
  const rawAlternates = Array.isArray(data.alternate) ? data.alternate : data.alternate ? [data.alternate] : [];
  const alternates = rawAlternates.map((alternate) => ({
    icao: first(alternate?.icao_code, alternate?.icao, alternate?.ident, "—"),
    name: first(alternate?.name, alternate?.airport_name, ""),
    lat: number(first(alternate?.pos_lat, alternate?.latitude, alternate?.lat), NaN),
    lon: number(first(alternate?.pos_long, alternate?.longitude, alternate?.lon), NaN),
    distanceNm: number(first(alternate?.route_distance, alternate?.distance), NaN),
  }));
  const alternate = alternates[0];
  const rawAlternateFixes = arrayOf(data.alternate_navlog);
  let alternateCumulativeNm = 0;
  const alternateWaypoints = rawAlternateFixes.map((fix, index) => {
    const windLevels = parseWindLevels(fix);
    const weather = windForAltitude(fix, plannedAltitudeFt, windLevels);
    const point = {
      ident: first(fix.ident, `ALT${index + 1}`),
      lat: number(first(fix.pos_lat, fix.latitude), NaN),
      lon: number(first(fix.pos_long, fix.longitude), NaN),
      distanceNm: number(first(fix.cum_distance, fix.distance), alternateCumulativeNm),
      windDir: number(first(weather.windDir, weather.wind_dir, fix.wind_dir), NaN),
      windSpd: number(first(weather.windSpd, weather.wind_spd, fix.wind_spd), NaN),
      oatC: number(first(weather.oatC, weather.oat, fix.oat), NaN),
      tropopauseFt: number(first(fix.tropopause_feet, fix.tropopause), NaN),
      windLevels,
    };
    if (index > 0 && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
      const previous = rawAlternateFixes[index - 1];
      const previousPoint = { lat: number(previous.pos_lat, NaN), lon: number(previous.pos_long, NaN) };
      if (Number.isFinite(previousPoint.lat) && Number.isFinite(previousPoint.lon)) alternateCumulativeNm += greatCircleNm(previousPoint, point);
    }
    point.distanceNm = number(first(fix.cum_distance, alternateCumulativeNm), alternateCumulativeNm);
    return point;
  }).filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon));
  return {
    source: "SIMBRIEF",
    origin,
    destination,
    alternate: first(alternate?.icao, "—"),
    alternates,
    route: first(data.general?.route, data.atc?.route, waypoints.map((fix) => fix.ident).join(" ")),
    distanceNm,
    plannedAltitudeFt,
    generatedAt: rawGenerated && !Number.isNaN(generatedDate.getTime()) ? generatedDate.toLocaleString("pt-BR", { timeZone: "UTC", hour12: false }) + "Z" : "OFP mais recente",
    generatedAtMs: rawGenerated && !Number.isNaN(generatedDate.getTime()) ? generatedDate.getTime() : NaN,
    scheduledOffMs: flightStart,
    scheduledOnMs: flightEnd,
    meteorology: {
      originText: originWeatherText,
      destinationText: destinationWeatherText,
      origin: { metar: originMetar, taf: originTaf },
      destination: { metar: destinationMetar, taf: destinationTaf },
      alternate: { metar: alternateMetar, taf: alternateTaf },
      enrouteText: enrouteWeatherText,
      enrouteBulletins,
      enrouteAdvisories,
    },
    waypoints,
    alternateWaypoints,
  };
}

export async function fetchLatestOFP(identifier, type = "userid") {
  const clean = identifier.trim();
  if (!clean) throw new Error("Informe seu Pilot ID ou Navigraph Alias.");
  const parameter = type === "username" ? "username" : "userid";
  const endpoint = `https://www.simbrief.com/api/xml.fetcher.php?${parameter}=${encodeURIComponent(clean)}&json=v2&client=velocity-xl-performance-planner`;
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    let message = `SimBrief respondeu com erro ${response.status}`;
    try {
      const body = await response.json();
      message = body?.fetch?.status || message;
    } catch {}
    throw new Error(message.replace(/^Error:\s*/i, ""));
  }
  return parseSimBrief(await response.json());
}
