import { greatCircleNm } from "./engine.js?v=20261013-28";

const number = (value, fallback = 0) => {
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

function bulletinText(...values) {
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
  return [...new Set(output.map((value) => value.trim()).filter(Boolean))].join(" ");
}

function parseWindLevels(fix) {
  return arrayOf(fix.wind_data?.level || fix.wind_data || fix.wind)
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
  };
  const destination = {
    icao: first(data.destination?.icao_code, data.destination?.icao, "DEST"),
    name: first(data.destination?.name, "Destino"),
    lat: number(first(data.destination?.pos_lat, data.destination?.latitude)),
    lon: number(first(data.destination?.pos_long, data.destination?.longitude)),
  };
  const plannedAltitudeFt = number(first(data.general?.initial_altitude, data.general?.cruise_altitude), 18000);
  const originWeatherText = weatherText(data.weather?.orig_metar, data.weather?.orig_taf, data.origin?.metar, data.origin?.taf, data.origin?.weather);
  const destinationWeatherText = weatherText(data.weather?.dest_metar, data.weather?.dest_taf, data.destination?.metar, data.destination?.taf, data.destination?.weather);
  const enrouteWeatherText = bulletinText(data.weather?.enroute, data.weather?.sigmet, data.weather?.sigmets, data.weather?.airmet, data.weather?.airmets, data.sigmets, data.airmets);
  const rawFixes = arrayOf(data.navlog);
  let cumulativeNm = 0;
  const waypoints = rawFixes.map((fix, index) => {
    const windLevels = parseWindLevels(fix);
    const weather = windForAltitude(fix, plannedAltitudeFt, windLevels);
    const waypoint = {
      ident: first(fix.ident, `WPT${index + 1}`),
      lat: number(first(fix.pos_lat, fix.latitude), NaN),
      lon: number(first(fix.pos_long, fix.longitude), NaN),
      distanceNm: number(first(fix.cum_distance, fix.distance), cumulativeNm),
      windDir: number(first(weather.windDir, weather.wind_dir, fix.wind_dir), 0),
      windSpd: number(first(weather.windSpd, weather.wind_spd, fix.wind_spd), 0),
      oatC: number(first(weather.oatC, weather.oat, fix.oat), NaN),
      shear: number(fix.shear, NaN),
      altitudeFt: number(first(fix.altitude_feet, fix.altitude), NaN),
      stage: first(fix.stage, ""),
      windLevels,
      weatherText: bulletinText(fix.weather, fix.wx, fix.conditions, fix.sigmet, fix.airmet),
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
    meteorology: {
      originText: originWeatherText,
      destinationText: destinationWeatherText,
      enrouteText: enrouteWeatherText,
    },
    waypoints,
  };
}

export async function fetchLatestOFP(identifier, type = "userid") {
  const clean = identifier.trim();
  if (!clean) throw new Error("Informe seu Pilot ID ou Navigraph Alias.");
  const parameter = type === "username" ? "username" : "userid";
  const endpoint = `https://www.simbrief.com/api/xml.fetcher.php?${parameter}=${encodeURIComponent(clean)}&json=v2`;
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
