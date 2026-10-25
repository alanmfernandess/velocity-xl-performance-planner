import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT, OXYGEN_CYLINDERS, WEIGHT_BALANCE } from "./config.js?v=20261024-02";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const toRad = (deg) => (deg * Math.PI) / 180;
export const toDeg = (rad) => (rad * 180) / Math.PI;

export function icingDisplayTone(riskScore, status = "low") {
  const score = clamp(Math.round(Number(riskScore) || 0), 0, 100);
  if (status === "avoid" || score >= 45) return "high";
  if (score >= 25) return "marginal";
  return "low";
}

export function isaTemperatureC(altitudeFt) {
  return 15 - 1.9812 * (altitudeFt / 1000);
}

export function densityAltitudeFt(altitudeFt, oatC) {
  return altitudeFt + 120 * (oatC - isaTemperatureC(altitudeFt));
}

export function bearingDeg(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function greatCircleNm(a, b) {
  const earthNm = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthNm * Math.asin(Math.sqrt(h));
}

export function windComponentKt(trackDeg, windFromDeg, windSpeedKt) {
  return -windSpeedKt * Math.cos(toRad(windFromDeg - trackDeg));
}

function interpolateDirectionDeg(fromDeg, toDegValue, ratio) {
  const delta = ((toDegValue - fromDeg + 540) % 360) - 180;
  return (fromDeg + delta * ratio + 360) % 360;
}

export function weatherAtAltitude(fix, altitudeFt) {
  const levels = Array.isArray(fix.windLevels)
    ? fix.windLevels.filter((level) => Number.isFinite(level.altitudeFt)).sort((a, b) => a.altitudeFt - b.altitudeFt)
    : [];

  if (!levels.length) {
    return {
      windDir: Number.isFinite(Number(fix.windDir)) ? Number(fix.windDir) : 0,
      windSpd: Number.isFinite(Number(fix.windSpd)) ? Number(fix.windSpd) : 0,
      oatC: Number.isFinite(Number(fix.oatC)) ? Number(fix.oatC) : isaTemperatureC(altitudeFt),
    };
  }

  const upperIndex = levels.findIndex((level) => level.altitudeFt >= altitudeFt);
  const lower = upperIndex <= 0 ? levels[0] : levels[upperIndex - 1];
  const upper = upperIndex === -1 ? levels.at(-1) : levels[upperIndex];
  const span = upper.altitudeFt - lower.altitudeFt;
  const ratio = span > 0 ? clamp((altitudeFt - lower.altitudeFt) / span, 0, 1) : 0;
  const lowerDir = Number.isFinite(lower.windDir) ? lower.windDir : 0;
  const upperDir = Number.isFinite(upper.windDir) ? upper.windDir : lowerDir;
  const lowerSpd = Number.isFinite(lower.windSpd) ? lower.windSpd : 0;
  const upperSpd = Number.isFinite(upper.windSpd) ? upper.windSpd : lowerSpd;
  const lowerOat = Number.isFinite(lower.oatC) ? lower.oatC : isaTemperatureC(lower.altitudeFt);
  const upperOat = Number.isFinite(upper.oatC) ? upper.oatC : isaTemperatureC(upper.altitudeFt);
  return {
    ...(Number.isFinite(lower.courseDeg) && Number.isFinite(upper.courseDeg)
      ? { courseDeg: interpolateDirectionDeg(lower.courseDeg, upper.courseDeg, ratio) } : {}),
    windDir: interpolateDirectionDeg(lowerDir, upperDir, ratio),
    windSpd: lowerSpd + (upperSpd - lowerSpd) * ratio,
    oatC: lowerOat + (upperOat - lowerOat) * ratio,
  };
}

/** Exact horizontal wind triangle for a maintained track (meteorological FROM).
 * No numerical GS floor may turn an impossible crosswind into a valid flight. */
export function solveWindTriangle(tasKt, courseDeg, windDir, windSpd) {
  if (![tasKt,courseDeg,windDir,windSpd].every(Number.isFinite) || tasKt <= 0 || windSpd < 0) throw new RangeError("WIND_FIELDS_INVALID");
  const relative = toRad(windDir-courseDeg);
  const longitudinalKt = -windSpd*Math.cos(relative), crosswindKt = -windSpd*Math.sin(relative);
  if (Math.abs(crosswindKt) >= tasKt) throw new RangeError("CROSSWIND_EXCEEDS_TAS");
  const gsKt = Math.sqrt(tasKt*tasKt-crosswindKt*crosswindKt)+longitudinalKt;
  if (gsKt <= 0) throw new RangeError("NO_FORWARD_GROUNDSPEED");
  return { gsKt, longitudinalKt, crosswindKt, driftDeg: toDeg(Math.asin(-crosswindKt/tasKt)) };
}

export function averageRouteWeather(plan, altitudeFt) {
  const fixes = plan.waypoints?.filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) || [];
  if (fixes.length < 2) {
    return { componentKt: 0, windSpeedKt: 0, windDir: 0, oatC: isaTemperatureC(altitudeFt), isaDeviationC: 0, samples: [] };
  }

  let distance = 0;
  let weightedComponent = 0;
  let weightedSpeed = 0;
  let weightedOat = 0;
  let vectorX = 0;
  let vectorY = 0;
  const samples = [];

  for (let index = 0; index < fixes.length - 1; index += 1) {
    const from = fixes[index];
    const to = fixes[index + 1];
    const segmentNm = greatCircleNm(from, to);
    const track = bearingDeg(from, to);
    const weather = weatherAtAltitude(from, altitudeFt);
    const windDir = weather.windDir;
    const windSpd = weather.windSpd;
    const oat = weather.oatC;
    const component = windComponentKt(track, windDir, windSpd);
    distance += segmentNm;
    weightedComponent += component * segmentNm;
    weightedSpeed += windSpd * segmentNm;
    weightedOat += oat * segmentNm;
    vectorX += Math.sin(toRad(windDir)) * windSpd * segmentNm;
    vectorY += Math.cos(toRad(windDir)) * windSpd * segmentNm;
    samples.push({ ident: from.ident, progress: index / (fixes.length - 1), component, windDir, windSpd });
  }

  const divisor = distance || 1;
  const oatC = weightedOat / divisor;
  const windDir = (toDeg(Math.atan2(vectorX, vectorY)) + 360) % 360;
  return {
    componentKt: weightedComponent / divisor,
    windSpeedKt: weightedSpeed / divisor,
    windDir,
    oatC,
    isaDeviationC: oatC - isaTemperatureC(altitudeFt),
    samples,
  };
}

export function icingWeatherEvidence(text = "") {
  const source = String(text).toUpperCase();
  const noIcing = /\b(?:NO|NIL)\s+(?:ICE|ICING)\b/.test(source);
  const explicitIcing = !noIcing && /\b(?:SEV(?:ERE)?|MOD(?:ERATE)?|LGT|LIGHT)?\s*(?:ICE|ICING)\b/.test(source);
  const icingBandsFt = [];
  const bandPatterns = [
    /(?:ICE|ICING)[^\n]{0,400}?\bFL(\d{2,3})\s*(?:\/|-|TO)\s*(?:FL)?(\d{2,3})\b/g,
    /\bFL(\d{2,3})\s*(?:\/|-|TO)\s*(?:FL)?(\d{2,3})[^\n]{0,400}?(?:ICE|ICING)\b/g,
  ];
  bandPatterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      const firstFt = Number(match[1]) * 100;
      const secondFt = Number(match[2]) * 100;
      icingBandsFt.push({ baseFt: Math.min(firstFt, secondFt), topFt: Math.max(firstFt, secondFt) });
    }
  });
  const freezingPrecipitation = /\b(?:FZRA|FZDZ|FZFG|PL)\b/.test(source);
  const precipitation = /(?:^|\s)(?:[-+]?RA|[-+]?DZ|[-+]?SN|SHRA|SHSN|SG)(?:\s|$)/.test(source);
  const cloudLayers = [...source.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g)].map((match) => ({
    coverage: match[1],
    baseFt: Number(match[2]) * 100,
  }));
  const cloudLayer = cloudLayers.length > 0;
  const clear = /\b(?:CAVOK|SKC|CLR|NSC)\b/.test(source) && !precipitation;
  return {
    noIcing,
    explicitIcing,
    icingBandsFt,
    freezingPrecipitation,
    visibleMoisture: freezingPrecipitation || precipitation || cloudLayer,
    precipitation,
    cloudLayers,
    clear,
    available: noIcing || explicitIcing || freezingPrecipitation || precipitation || cloudLayer || clear,
  };
}

function evidenceAtAltitude(evidence, altitudeFt) {
  const explicitIcing = evidence.explicitIcing && (
    !evidence.icingBandsFt.length
    || evidence.icingBandsFt.some((band) => altitudeFt >= band.baseFt && altitudeFt <= band.topFt)
  );
  const available = evidence.noIcing || explicitIcing || evidence.freezingPrecipitation
    || evidence.precipitation || evidence.cloudLayers.length > 0 || evidence.clear;
  return { ...evidence, explicitIcing, available };
}

function icingTemperatureFactor(oatC) {
  if (!Number.isFinite(oatC) || oatC > PERFORMANCE.icing.warmBoundaryC || oatC <= PERFORMANCE.icing.coldBoundaryC) return 0;
  if (oatC > 2) return (PERFORMANCE.icing.warmBoundaryC - oatC) / 3 * 0.35;
  if (oatC >= -10) return 1;
  if (oatC >= -20) return 1 - (Math.abs(oatC + 10) / 10) * 0.2;
  if (oatC >= -30) return 0.8 - (Math.abs(oatC + 20) / 10) * 0.45;
  return 0.35 - (Math.abs(oatC + 30) / 10) * 0.25;
}

function moistureFactor(evidence, altitudeFt = null, terminal = false, airportElevationFt = 0) {
  if (evidence.noIcing) return 0;
  if (evidence.explicitIcing || evidence.freezingPrecipitation) return 1;
  if (evidence.precipitation) {
    if (!terminal) return PERFORMANCE.icing.visibleMoistureFactor;
    if (!Number.isFinite(altitudeFt) || altitudeFt <= airportElevationFt + PERFORMANCE.icing.terminalPrecipitationTopAglFt) return PERFORMANCE.icing.terminalCloudFactor;
  }
  if (evidence.cloudLayers.length) {
    const insideEstimatedLayer = !terminal || !Number.isFinite(altitudeFt) || evidence.cloudLayers.some((layer) => (
      altitudeFt >= airportElevationFt + layer.baseFt
      && altitudeFt <= airportElevationFt + layer.baseFt + (layer.coverage === "VV" ? PERFORMANCE.icing.terminalVerticalVisibilityDepthFt : PERFORMANCE.icing.terminalCloudDepthFt)
    ));
    if (insideEstimatedLayer) return terminal ? PERFORMANCE.icing.terminalCloudFactor : PERFORMANCE.icing.visibleMoistureFactor;
    if (terminal) return 0;
  }
  if (terminal && evidence.precipitation) return 0;
  if (evidence.clear) return PERFORMANCE.icing.clearWeatherFactor;
  return PERFORMANCE.icing.unknownMoistureFactor;
}

function metarTemperatureC(text = "") {
  const match = String(text).toUpperCase().match(/(?:^|\s)(M?\d{2})\/(?:M?\d{2}|XX)(?:\s|$)/);
  if (!match) return NaN;
  return Number(match[1].replace("M", "-"));
}

function aviationTimestamp(day, hour, minute, referenceMs) {
  if (!Number.isFinite(referenceMs)) return NaN;
  const reference = new Date(referenceMs);
  const candidates = [-1, 0, 1].map((monthOffset) => Date.UTC(
    reference.getUTCFullYear(), reference.getUTCMonth() + monthOffset, day, hour, minute,
  ));
  return candidates.sort((a, b) => Math.abs(a - referenceMs) - Math.abs(b - referenceMs))[0];
}

function forecastRange(token, referenceMs) {
  const match = String(token).match(/(\d{2})(\d{2})\/(\d{2})(\d{2})/);
  if (!match) return { start: NaN, end: NaN };
  const start = aviationTimestamp(Number(match[1]), Number(match[2]), 0, referenceMs);
  let end = aviationTimestamp(Number(match[3]), Number(match[4]), 0, start);
  if (end <= start) end = aviationTimestamp(Number(match[3]), Number(match[4]), 0, start + 20 * 86400000);
  return { start, end };
}

function reportTimestamp(text, referenceMs) {
  const match = String(text).toUpperCase().match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
  return match ? aviationTimestamp(Number(match[1]), Number(match[2]), Number(match[3]), referenceMs) : NaN;
}

function tafSourcesAtTime(taf = "", timestampMs = NaN) {
  const source = String(taf).toUpperCase().replace(/\s+/g, " ").trim();
  if (!source) return { sources: [], valid: false };
  const validityToken = source.match(/\b\d{4}\/\d{4}\b/)?.[0];
  const validity = forecastRange(validityToken, timestampMs);
  const valid = !Number.isFinite(timestampMs) || !Number.isFinite(validity.start)
    || timestampMs >= validity.start && timestampMs <= validity.end;
  if (!valid) return { sources: [], valid: false };
  const marker = /\b(FM\d{6}|BECMG\s+\d{4}\/\d{4}|TEMPO\s+\d{4}\/\d{4}|PROB(?:30|40)(?:\s+TEMPO)?\s+\d{4}\/\d{4})\b/g;
  const matches = [...source.matchAll(marker)];
  const baseEnd = matches[0]?.index ?? source.length;
  const sources = [{ text: source.slice(0, baseEnd), weight: 1, kind: "prevailing" }];
  let latestPrevailing = null;
  matches.forEach((match, index) => {
    const token = match[1];
    const text = source.slice(match.index, matches[index + 1]?.index ?? source.length);
    if (token.startsWith("FM")) {
      const start = aviationTimestamp(Number(token.slice(2, 4)), Number(token.slice(4, 6)), Number(token.slice(6, 8)), timestampMs);
      if (!Number.isFinite(timestampMs) || timestampMs >= start) latestPrevailing = { text, weight: 1, kind: "prevailing" };
      return;
    }
    if (token.startsWith("BECMG")) {
      const range = forecastRange(token, timestampMs);
      if (!Number.isFinite(timestampMs) || timestampMs >= range.end) latestPrevailing = { text, weight: 1, kind: "prevailing" };
      else if (timestampMs >= range.start) sources.push({ text, weight: 0.75, kind: "becoming" });
      return;
    }
    const range = forecastRange(token, timestampMs);
    if (Number.isFinite(timestampMs) && (timestampMs < range.start || timestampMs > range.end)) return;
    const probability = token.match(/PROB(30|40)/)?.[1];
    sources.push({ text, weight: probability ? Number(probability) / 100 : 0.65, kind: probability ? `prob${probability}` : "temporary" });
  });
  if (latestPrevailing) sources[0] = latestPrevailing;
  return { sources, valid: true };
}

export function terminalWeatherAtTime(plan, terminal, timestampMs) {
  const raw = plan.meteorology?.[terminal] || {};
  if (!raw.metar && !raw.taf) {
    const fallback = terminal === "origin" ? plan.meteorology?.originText
      : terminal === "destination" ? plan.meteorology?.destinationText : "";
    return { sources: fallback ? [{ text: fallback, weight: 1, kind: "legacy" }] : [], tafValid: false, metarAgeMinutes: NaN };
  }
  const sources = [];
  const metarTime = reportTimestamp(raw.metar, timestampMs);
  const metarAgeMinutes = Number.isFinite(metarTime) && Number.isFinite(timestampMs) ? Math.abs(timestampMs - metarTime) / 60000 : NaN;
  if (raw.metar && (!Number.isFinite(metarAgeMinutes) || metarAgeMinutes <= PERFORMANCE.icing.metarMaximumAgeMin)) {
    sources.push({ text: raw.metar, weight: 1, kind: "metar" });
  }
  const taf = tafSourcesAtTime(raw.taf, timestampMs);
  sources.push(...taf.sources);
  return { sources, tafValid: taf.valid, metarAgeMinutes };
}

export function calculateIcingRisk({ plan, result }) {
  const fixes = plan.waypoints?.filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) || [];
  const enrouteText = plan.meteorology?.enrouteText || "";
  const advisories = (plan.meteorology?.enrouteAdvisories?.length
    ? plan.meteorology.enrouteAdvisories
    : enrouteText ? [{ text: enrouteText }] : []).map((advisory) => ({
    evidence: icingWeatherEvidence(advisory.text),
    legCoverage: advisory.legCoverage,
  }));
  const routeDistanceNm = Math.max(1, Number(fixes.at(-1)?.distanceNm) || Number(plan.distanceNm) || 1);
  const planDistanceNm = Math.max(1, Number(plan.distanceNm) || routeDistanceNm);
  const advisorySourcesAtLeg = (index) => advisories.map((advisory) => ({
    evidence: advisory.evidence,
    coverage: Array.isArray(advisory.legCoverage) ? Number(advisory.legCoverage[index]) || 0 : 1,
  })).filter((source) => source.coverage > 0);
  const legAtDistance = (distanceNm) => {
    const targetNm = clamp(distanceNm / planDistanceNm, 0, 1) * routeDistanceNm;
    const endIndex = fixes.findIndex((fix, index) => index > 0 && fix.distanceNm >= targetNm);
    return endIndex < 0 ? Math.max(0, fixes.length - 2) : endIndex - 1;
  };
  let cruiseMaximumRisk = 0;
  let temperatureExposureMinutes = 0;
  let cruiseExposureMinutes = 0;
  let observedTemperatureSamples = 0;
  let confirmedEvidenceSamples = 0;
  let estimatedEvidenceSamples = 0;
  let hardHazard = false;
  const segments = [];

  for (let index = 0; index < fixes.length - 1; index += 1) {
    const from = fixes[index];
    const to = fixes[index + 1];
    const segmentNm = greatCircleNm(from, to);
    const segmentMinutes = segmentNm / Math.max(1, result.gsKt) * 60;
    const weather = weatherAtAltitude(from, result.altitudeFt);
    const hasTemperature = Number.isFinite(from.oatC) || (from.windLevels || []).some((level) => Number.isFinite(level.oatC));
    if (hasTemperature) observedTemperatureSamples += 1;
    const temperatureFactor = hasTemperature
      ? icingTemperatureFactor(weather.oatC)
      : 0;
    let risk = 0;
    let riskMinutes = 0;
    let segmentHardHazard = false;
    let evidenceAvailable = false;
    const sources = advisorySourcesAtLeg(index);
    if (from.weatherText) sources.push({ evidence: icingWeatherEvidence(from.weatherText), coverage: 1 });
    sources.forEach((source) => {
      const evidence = evidenceAtAltitude(source.evidence, result.altitudeFt);
      if (!evidence.available) return;
      evidenceAvailable = true;
      confirmedEvidenceSamples += 1;
      const sourceRisk = (hasTemperature ? temperatureFactor : evidence.explicitIcing || evidence.freezingPrecipitation ? 1 : 0)
        * moistureFactor(evidence, result.altitudeFt, false);
      risk = Math.max(risk, sourceRisk);
      riskMinutes = Math.max(riskMinutes, segmentMinutes * source.coverage * sourceRisk);
      segmentHardHazard ||= evidence.explicitIcing || evidence.freezingPrecipitation;
    });
    cruiseMaximumRisk = Math.max(cruiseMaximumRisk, risk);
    if (temperatureFactor >= 0.3) temperatureExposureMinutes += segmentMinutes;
    cruiseExposureMinutes += riskMinutes;
    hardHazard ||= segmentHardHazard;
    segments.push({
      from: from.ident,
      to: to.ident,
      startNm: Number(from.distanceNm) || 0,
      endNm: Number(to.distanceNm) || Math.min(plan.distanceNm, (Number(from.distanceNm) || 0) + segmentNm),
      oatC: weather.oatC,
      riskScore: Math.round(risk * 100),
      minutes: segmentMinutes,
      temperatureRelevant: temperatureFactor >= 0.3,
      evidenceAvailable,
      status: segmentHardHazard ? "avoid" : risk * 100 >= PERFORMANCE.icing.cautionScore ? "caution" : risk * 100 >= PERFORMANCE.icing.watchScore ? "watch" : "low",
    });
  }

  const transitionExposure = (fix, durationHr, terminal, timestampMs, airportElevationFt, distanceAtFraction, includeAdvisories = true) => {
    if (!fix || durationHr <= 0) return { minutes: 0, maximumRisk: 0, temperatureMinutes: 0, confirmedSamples: 0, estimatedSamples: 0 };
    const terminalWeather = terminalWeatherAtTime(plan, terminal, timestampMs);
    const terminalSources = terminalWeather.sources.map((source) => ({
      evidence: icingWeatherEvidence(`${fix.weatherText || ""} ${source.text || ""}`),
      coverage: source.weight,
      terminal: true,
      kind: source.kind,
    }));
    const hasTemperature = Number.isFinite(fix.oatC) || (fix.windLevels || []).some((level) => Number.isFinite(level.oatC));
    const hasVerticalTemperatureProfile = (fix.windLevels || []).filter((level) => Number.isFinite(level.altitudeFt) && Number.isFinite(level.oatC)).length >= 2;
    const surfaceTemperatureC = metarTemperatureC(plan.meteorology?.[terminal]?.metar
      || terminalWeather.sources.map((source) => source.text).join(" "));
    const cruiseTemperatureC = weatherAtAltitude(fix, result.altitudeFt).oatC;
    let weighted = 0;
    let transitionMaximumRisk = 0;
    let transitionTemperatureMinutes = 0;
    let transitionConfirmed = false;
    let transitionEstimated = false;
    let transitionHardHazard = false;
    const altitudeSpanFt = Math.max(0, result.altitudeFt - airportElevationFt);
    const samples = Math.max(10, Math.ceil(altitudeSpanFt / PERFORMANCE.icing.transitionSampleStepFt));
    for (let index = 1; index <= samples; index += 1) {
      const fraction = index / samples;
      const altitudeFt = airportElevationFt + altitudeSpanFt * fraction;
      const estimatedTemperatureC = hasVerticalTemperatureProfile
        ? weatherAtAltitude(fix, altitudeFt).oatC
        : Number.isFinite(surfaceTemperatureC) && Number.isFinite(cruiseTemperatureC)
        ? surfaceTemperatureC + (cruiseTemperatureC - surfaceTemperatureC) * fraction
        : weatherAtAltitude(fix, altitudeFt).oatC;
      const temperatureFactor = hasTemperature || Number.isFinite(surfaceTemperatureC) ? icingTemperatureFactor(estimatedTemperatureC) : 0;
      let risk = 0;
      const leg = legAtDistance(distanceAtFraction(fraction));
      const sources = [...terminalSources,
        ...(includeAdvisories ? advisorySourcesAtLeg(leg).map((source) => ({ ...source, terminal: false })) : [])];
      sources.forEach((source) => {
        const evidence = evidenceAtAltitude(source.evidence, altitudeFt);
        if (!evidence.available) return;
        if (source.terminal) {
          if (evidence.explicitIcing || evidence.freezingPrecipitation || evidence.noIcing) transitionConfirmed = true;
          else transitionEstimated = true;
        } else transitionConfirmed = true;
        const sourceRisk = (hasTemperature || Number.isFinite(surfaceTemperatureC) ? temperatureFactor
          : evidence.explicitIcing || evidence.freezingPrecipitation ? 1 : 0)
          * moistureFactor(evidence, altitudeFt, source.terminal, source.terminal ? airportElevationFt : 0);
        risk = Math.max(risk, sourceRisk * source.coverage);
        transitionHardHazard ||= (evidence.explicitIcing || evidence.freezingPrecipitation) && source.coverage >= PERFORMANCE.icing.hardHazardProbability;
      });
      transitionMaximumRisk = Math.max(transitionMaximumRisk, risk);
      if (temperatureFactor >= 0.3) transitionTemperatureMinutes += durationHr * 60 / samples;
      weighted += risk;
    }
    return {
      minutes: durationHr * 60 * weighted / samples,
      maximumRisk: transitionMaximumRisk,
      temperatureMinutes: transitionTemperatureMinutes,
      confirmedSamples: transitionConfirmed ? 1 : 0,
      estimatedSamples: transitionEstimated ? 1 : 0,
      hardHazard: transitionHardHazard,
      weather: terminalWeather,
    };
  };
  const climbTransition = transitionExposure(fixes[0], result.climb.timeHr, "origin", plan.scheduledOffMs, plan.origin?.elevationFt || 0,
    (fraction) => (Number(result.climb.distanceNm) || 0) * fraction);
  const descentTransition = transitionExposure(fixes.at(-1), result.descent.timeHr, "destination", plan.scheduledOnMs, plan.destination?.elevationFt || 0,
    (fraction) => planDistanceNm - (Number(result.descent.distanceNm) || 0) * fraction);
  const alternateFix = plan.alternateWaypoints?.at(-1) || (plan.alternates?.[0] ? {
    ident: plan.alternates[0].icao, lat: plan.alternates[0].lat, lon: plan.alternates[0].lon,
    windLevels: fixes.at(-1)?.windLevels || [], oatC: fixes.at(-1)?.oatC,
  } : null);
  const alternateEtaMs = Number.isFinite(plan.scheduledOnMs) ? plan.scheduledOnMs + PERFORMANCE.icing.alternateEtaOffsetMin * 60000 : NaN;
  const alternateTransition = transitionExposure(alternateFix, Math.max(0.08, result.descent.timeHr * 0.45), "alternate", alternateEtaMs, 0, () => planDistanceNm, false);
  hardHazard ||= climbTransition.hardHazard || descentTransition.hardHazard;
  const alternateHardHazard = Boolean(alternateTransition.hardHazard);
  const transitionRiskMinutes = climbTransition.minutes + descentTransition.minutes;
  temperatureExposureMinutes += climbTransition.temperatureMinutes + descentTransition.temperatureMinutes;
  confirmedEvidenceSamples += climbTransition.confirmedSamples + descentTransition.confirmedSamples;
  estimatedEvidenceSamples += climbTransition.estimatedSamples + descentTransition.estimatedSamples;
  const exposureMinutes = cruiseExposureMinutes + transitionRiskMinutes;
  const cruiseDurationWeight = PERFORMANCE.icing.cruiseMinimumPeakWeight
    + (1 - PERFORMANCE.icing.cruiseMinimumPeakWeight) * (1 - Math.exp(-cruiseExposureMinutes / PERFORMANCE.icing.cruiseExposureTimeScaleMin));
  const rawRiskScore = Math.round(Math.max(
    climbTransition.maximumRisk * 100,
    descentTransition.maximumRisk * 100,
    cruiseMaximumRisk * 100 * cruiseDurationWeight,
  ));
  const status = hardHazard || alternateHardHazard
    ? "avoid"
    : rawRiskScore >= PERFORMANCE.icing.cautionScore
      ? "caution"
      : rawRiskScore >= PERFORMANCE.icing.watchScore
        ? "watch"
        : "low";
  const penalty = status === "avoid"
    ? 100
    : status === "caution"
      ? Math.min(40, PERFORMANCE.icing.cautionBasePenalty + exposureMinutes / 4)
      : status === "watch"
        ? Math.min(14, PERFORMANCE.icing.watchBasePenalty + exposureMinutes / 15)
        : 0;
  return {
    status,
    riskScore: status === "avoid" ? 100 : rawRiskScore,
    penalty,
    exposureMinutes,
    climbExposureMinutes: climbTransition.minutes,
    cruiseExposureMinutes,
    descentExposureMinutes: descentTransition.minutes,
    temperatureExposureMinutes,
    transitionRiskMinutes,
    confidence: confirmedEvidenceSamples > 0 ? "weather" : estimatedEvidenceSamples > 0 ? "estimated" : "limited",
    temperatureCoverage: fixes.length > 1 ? observedTemperatureSamples / (fixes.length - 1) : 0,
    evidenceCoverage: fixes.length > 1 ? segments.filter((segment) => segment.evidenceAvailable).length / (fixes.length - 1) : 0,
    combinedCoverage: fixes.length > 1 ? segments.filter((segment) => segment.evidenceAvailable && Number.isFinite(segment.oatC)).length / (fixes.length - 1) : 0,
    originWeather: climbTransition.weather,
    destination: {
      status: descentTransition.hardHazard ? "avoid" : descentTransition.maximumRisk * 100 >= PERFORMANCE.icing.cautionScore ? "caution" : descentTransition.maximumRisk * 100 >= PERFORMANCE.icing.watchScore ? "watch" : "low",
      riskScore: Math.round(descentTransition.maximumRisk * 100),
      exposureMinutes: descentTransition.minutes,
      weather: descentTransition.weather,
    },
    alternate: alternateFix ? {
      ident: plan.alternates?.[0]?.icao || plan.alternate || alternateFix.ident || "—",
      status: alternateHardHazard ? "avoid" : alternateTransition.maximumRisk * 100 >= PERFORMANCE.icing.cautionScore ? "caution" : alternateTransition.maximumRisk * 100 >= PERFORMANCE.icing.watchScore ? "watch" : "low",
      riskScore: Math.round(alternateTransition.maximumRisk * 100),
      exposureMinutes: alternateTransition.minutes,
      weather: alternateTransition.weather,
    } : null,
    segments,
  };
}

function vectorWindDifferenceKt(first, second) {
  const firstX = Math.sin(toRad(first.windDir || 0)) * (first.windSpd || 0);
  const firstY = Math.cos(toRad(first.windDir || 0)) * (first.windSpd || 0);
  const secondX = Math.sin(toRad(second.windDir || 0)) * (second.windSpd || 0);
  const secondY = Math.cos(toRad(second.windDir || 0)) * (second.windSpd || 0);
  return Math.hypot(secondX - firstX, secondY - firstY);
}

export function turbulenceWeatherEvidence(text = "") {
  const source = String(text).toUpperCase();
  const noTurbulence = /\b(?:NO|NIL)\s+(?:TURB|TURBULENCE|CAT)\b/.test(source);
  const hazardPattern = /\b(?:EXTRM|EXTREME|SEV(?:ERE)?|MOD(?:ERATE)?|LGT|LIGHT)(?:\s*[-\/]\s*(?:EXTRM|EXTREME|SEV(?:ERE)?|MOD(?:ERATE)?))?\s+(?:TURB(?:ULENCE)?|CAT|CHOP)\b/g;
  const bandPattern = /\bFL(\d{2,3})\s*(?:\/|-|TO)\s*(?:FL)?(\d{2,3})\b/g;
  const hazards = [...source.matchAll(hazardPattern)];
  const usedBandPositions = new Set();
  const advisories = hazards.map((hazard, index) => {
    const nextHazard = hazards[index + 1]?.index ?? source.length;
    const afterStart = hazard.index + hazard[0].length;
    const after = source.slice(afterStart, Math.min(nextHazard, afterStart + 100)).split(/[.;\n]/, 1)[0];
    const afterBands = [...after.matchAll(bandPattern)].map((match) => ({ match, position: afterStart + match.index }));
    const previousHazardEnd = index ? hazards[index - 1].index + hazards[index - 1][0].length : 0;
    const beforeStart = Math.max(previousHazardEnd, hazard.index - 70);
    const before = source.slice(beforeStart, hazard.index).split(/[.;\n]/).at(-1);
    const offset = hazard.index - before.length;
    const beforeBand = [...before.matchAll(bandPattern)].map((match) => ({ match, position: offset + match.index }))
      .filter(({ position }) => !usedBandPositions.has(position)).at(-1);
    const unusedAfter = afterBands.filter(({ position }) => !usedBandPositions.has(position));
    const beforeDistance = beforeBand ? hazard.index - (beforeBand.position + beforeBand.match[0].length) : Infinity;
    const afterDistance = unusedAfter.length ? unusedAfter[0].position - afterStart : Infinity;
    const matches = beforeBand && beforeDistance <= afterDistance ? [beforeBand] : unusedAfter;
    const bands = matches.map(({ match, position }) => {
      usedBandPositions.add(position);
      const firstFt = Number(match[1]) * 100;
      const secondFt = Number(match[2]) * 100;
      return { baseFt: Math.min(firstFt, secondFt), topFt: Math.max(firstFt, secondFt) };
    });
    const phrase = hazard[0];
    const score = /\b(?:EXTRM|EXTREME)\b/.test(phrase) ? 100
      : /\b(?:MOD|MODERATE)\s*[-\/]\s*(?:SEV|SEVERE)\b/.test(phrase) ? 82
        : /\b(?:SEV|SEVERE)\b/.test(phrase) ? 90
          : /\b(?:LGT|LIGHT)\s*[-\/]\s*(?:MOD|MODERATE)\b/.test(phrase) ? 45
            : /\b(?:MOD|MODERATE)\b/.test(phrase) ? 60 : 30;
    return { score, bands };
  });
  const unbounded = advisories.some((advisory) => !advisory.bands.length)
    || (!advisories.some((advisory) => advisory.bands.length)
      && /\b(?:AIRMET\s+TANGO|CONVECTIVE\s+SIGMET|TSRA|TS|CB|LLWS|WIND\s*SHEAR|WS\d{3})\b/.test(source));
  return {
    available: noTurbulence || advisories.length > 0 || unbounded,
    noTurbulence,
    score: Math.max(0, ...advisories.map((advisory) => advisory.score)),
    bands: advisories.flatMap((advisory) => advisory.bands),
    advisories,
    unbounded,
  };
}

function rideWindAtAltitude(fix, altitudeFt, plannedAltitudeFt) {
  const levels = (fix?.windLevels || []).filter((level) => Number.isFinite(level.altitudeFt)
    && Number.isFinite(level.windDir) && Number.isFinite(level.windSpd)).sort((a, b) => a.altitudeFt - b.altitudeFt);
  if (levels.length) {
    return levels.length >= 2 && altitudeFt >= levels[0].altitudeFt && altitudeFt <= levels.at(-1).altitudeFt
      ? { weather: weatherAtAltitude({ ...fix, windLevels: levels }, altitudeFt), levels }
      : null;
  }
  const referenceAltitudeFt = Number.isFinite(fix?.altitudeFt) ? fix.altitudeFt : plannedAltitudeFt;
  if (Number.isFinite(referenceAltitudeFt)
    && Math.abs(altitudeFt - referenceAltitudeFt) <= PERFORMANCE.turbulence.simbriefShearApplicabilityFt
    && Number.isFinite(fix?.windDir) && Number.isFinite(fix?.windSpd)) {
    return { weather: { windDir: fix.windDir, windSpd: fix.windSpd }, levels: [] };
  }
  return null;
}

export function calculateTurbulenceRisk({ plan, result }) {
  const fixes = plan.waypoints?.filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) || [];
  const advisories = (plan.meteorology?.enrouteAdvisories?.length
    ? plan.meteorology.enrouteAdvisories
    : plan.meteorology?.enrouteText ? [{ text: plan.meteorology.enrouteText }] : []).map((advisory) => ({
    evidence: turbulenceWeatherEvidence(advisory.text),
    legCoverage: advisory.legCoverage,
  }));
  const advisorySourcesAtLeg = (index) => advisories.map((advisory) => ({
    evidence: advisory.evidence,
    coverage: Array.isArray(advisory.legCoverage) ? Number(advisory.legCoverage[index]) || 0 : 1,
  })).filter((source) => source.coverage > 0);
  const routeDistanceNm = Math.max(1, Number(plan.distanceNm) || Number(fixes.at(-1)?.distanceNm) || 1);
  const statusForScore = (score, available = true, unresolved = false) => !available || unresolved ? "unknown"
    : score >= PERFORMANCE.turbulence.severeScore ? "severe"
      : score >= PERFORMANCE.turbulence.moderateScore ? "moderate"
        : score >= PERFORMANCE.turbulence.lightScore ? "light" : "smooth";
  const terminalRisk = (terminal, timestampMs, fix, durationHr) => {
    const weather = terminalWeatherAtTime(plan, terminal, timestampMs);
    let score = 0;
    let explicit = false;
    let estimated = false;
    weather.sources.forEach((source) => {
      const text = String(source.text || "").toUpperCase();
      const weight = Number(source.weight) || 1;
      const evidence = turbulenceWeatherEvidence(text);
      const evidenceScore = Math.max(0, ...evidence.advisories.map((advisory) => advisory.score));
      const gust = text.match(/\b(?:\d{3}|VRB)(\d{2,3})G(\d{2,3})KT\b/);
      const gustSpread = gust ? Math.max(0, Number(gust[2]) - Number(gust[1])) : 0;
      const gustScore = gust ? Math.min(58, PERFORMANCE.turbulence.terminalGustBaseScore + gustSpread * 1.6) : 0;
      const shearScore = /\b(?:LLWS|WIND\s*SHEAR|WS\d{3})\b/.test(text) ? PERFORMANCE.turbulence.terminalWindShearScore : 0;
      const convectiveScore = /\b(?:TSRA|TS|CB)\b/.test(text) ? PERFORMANCE.turbulence.terminalConvectiveScore : 0;
      const sourceScore = Math.max(evidenceScore, gustScore, shearScore, convectiveScore) * weight;
      score = Math.max(score, sourceScore);
      explicit ||= evidenceScore > 0 || shearScore > 0 || convectiveScore > 0;
      estimated ||= gustScore > 0;
    });
    const navlogShear = Number(fix?.shear);
    const navlogAltitudeFt = Number.isFinite(fix?.altitudeFt) ? fix.altitudeFt : plan.plannedAltitudeFt;
    const navlogShearApplicable = Number.isFinite(navlogShear)
      && Number.isFinite(navlogAltitudeFt)
      && Math.abs(result.altitudeFt - navlogAltitudeFt) <= PERFORMANCE.turbulence.simbriefShearApplicabilityFt;
    if (navlogShearApplicable) {
      score = Math.max(score, navlogShear <= 3 ? navlogShear / 3 * 18
        : navlogShear <= 5 ? 18 + (navlogShear - 3) / 2 * 27
          : navlogShear <= 10 ? 45 + (navlogShear - 5) / 5 * 30 : Math.min(100, 75 + (navlogShear - 10) * 5));
      estimated = true;
    }
    const available = weather.sources.length > 0 || navlogShearApplicable;
    const rounded = available ? Math.round(score) : null;
    return {
      riskScore: rounded,
      status: statusForScore(rounded || 0, available),
      blocking: available && rounded >= PERFORMANCE.turbulence.severeScore,
      exposureMinutes: available && rounded >= PERFORMANCE.turbulence.lightScore ? Math.max(0, durationHr * 60) : 0,
      confidence: explicit ? "weather" : estimated ? "simbrief" : available ? "weather" : "limited",
      weather,
    };
  };
  let maximumScore = 0;
  let maximumVerticalShear = 0;
  let maximumHorizontalShear = 0;
  let evidenceSamples = 0;
  let simbriefShearSamples = 0;
  let estimatedSamples = 0;
  let unboundedAdvisory = false;
  let blocking = false;
  let exposureMinutes = 0;
  const phaseExposureMinutes = { climb: 0, cruise: 0, descent: 0 };
  let tropopauseSamples = 0;
  let weightedTropopauseFt = 0;
  const segments = [];
  for (let index = 0; index < Math.max(1, fixes.length - 1); index += 1) {
    const from = fixes[index] || plan.origin;
    const to = fixes[index + 1] || plan.destination;
    const localBulletins = from?.weatherBulletins?.length ? from.weatherBulletins : [from?.weatherText || ""];
    const sources = [...advisorySourcesAtLeg(index), ...localBulletins.map((text) => ({ evidence: turbulenceWeatherEvidence(text), coverage: 1 }))];
    const evidences = sources.map((source) => source.evidence);
    const applicableAdvisories = evidences.flatMap((evidence) => evidence.advisories)
      .filter((advisory) => advisory.bands.some((band) => result.altitudeFt >= band.baseFt && result.altitudeFt <= band.topFt));
    if (applicableAdvisories.length) evidenceSamples += 1;
    const segmentUnbounded = evidences.some((evidence) => evidence.unbounded);
    unboundedAdvisory ||= segmentUnbounded;
    let verticalShear = 0;
    const fromWind = rideWindAtAltitude(from, result.altitudeFt, plan.plannedAltitudeFt);
    const toWind = rideWindAtAltitude(to, result.altitudeFt, plan.plannedAltitudeFt);
    const levels = fromWind?.levels || [];
    for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
      const lower = levels[levelIndex];
      const upper = levels[levelIndex + 1];
      if (result.altitudeFt < lower.altitudeFt || result.altitudeFt > upper.altitudeFt) continue;
      const separationThousands = Math.max(0.1, (upper.altitudeFt - lower.altitudeFt) / 1000);
      verticalShear = Math.max(verticalShear, vectorWindDifferenceKt(lower, upper) / separationThousands);
    }
    const segmentNm = from && to && [from.lat, from.lon, to.lat, to.lon].every(Number.isFinite) ? greatCircleNm(from, to) : 0;
    const windChangeKt = segmentNm > 0 && fromWind && toWind
      ? vectorWindDifferenceKt(fromWind.weather, toWind.weather) : 0;
    const referenceAltitudeFt = Number.isFinite(from?.altitudeFt) ? from.altitudeFt : plan.plannedAltitudeFt;
    const nearSimbriefLevel = Number.isFinite(referenceAltitudeFt)
      && Math.abs(result.altitudeFt - referenceAltitudeFt) <= PERFORMANCE.turbulence.simbriefShearApplicabilityFt;
    const horizontalShear = segmentNm > 0 && fromWind && toWind
      ? windChangeKt / Math.max(75, segmentNm) * 150
      : 0;
    maximumVerticalShear = Math.max(maximumVerticalShear, verticalShear);
    maximumHorizontalShear = Math.max(maximumHorizontalShear, horizontalShear);
    const shearRatio = Math.max(
      verticalShear / PERFORMANCE.turbulence.moderateVerticalShearKtPer1000Ft,
      horizontalShear / PERFORMANCE.turbulence.moderateHorizontalShearKtPer150Nm,
    );
    const inferredScore = Math.min(40, shearRatio >= 1 ? 40 : shearRatio >= 0.55 ? 24 : 8 * shearRatio);
    if ((fromWind?.levels.length || 0) >= 2 || (segmentNm > 0 && fromWind && toWind)) estimatedSamples += 1;
    const simbriefShear = from?.shear;
    const simbriefShearApplicable = Number.isFinite(simbriefShear)
      && nearSimbriefLevel
      && (!from?.stage || String(from.stage).toUpperCase() === "CRZ");
    const simbriefShearScore = simbriefShearApplicable
      ? simbriefShear <= 3
        ? simbriefShear / 3 * 18
        : simbriefShear <= 5
          ? 18 + (simbriefShear - 3) / 2 * 27
          : simbriefShear <= 10
            ? 45 + (simbriefShear - 5) / 5 * 30
            : Math.min(100, 75 + (simbriefShear - 10) * 5)
      : 0;
    if (simbriefShearApplicable) simbriefShearSamples += 1;
    const advisoryScore = Math.max(0, ...applicableAdvisories.map((advisory) => advisory.score));
    const tropopauseFt = Number(from?.tropopauseFt);
    const tropopauseDistanceFt = Number.isFinite(tropopauseFt) ? Math.abs(tropopauseFt - result.altitudeFt) : null;
    const tropopauseScore = Number.isFinite(tropopauseDistanceFt)
      && tropopauseDistanceFt <= PERFORMANCE.turbulence.tropopauseProximityFt
      && (fromWind?.weather.windSpd || 0) >= PERFORMANCE.turbulence.tropopauseWindThresholdKt
      ? PERFORMANCE.turbulence.tropopauseProximityScore * (1 - tropopauseDistanceFt / PERFORMANCE.turbulence.tropopauseProximityFt) : 0;
    if (Number.isFinite(tropopauseFt)) {
      tropopauseSamples += 1;
      weightedTropopauseFt += tropopauseFt;
    }
    const segmentBlocking = advisoryScore >= PERFORMANCE.turbulence.severeScore
      || simbriefShearScore >= PERFORMANCE.turbulence.severeScore;
    blocking ||= segmentBlocking;
    const hasSourceData = applicableAdvisories.length > 0 || simbriefShearApplicable
      || (fromWind?.levels.length || 0) >= 2 || (segmentNm > 0 && fromWind && toWind);
    const riskScore = hasSourceData ? Math.round(Math.max(advisoryScore, simbriefShearScore, inferredScore, tropopauseScore)) : null;
    if (riskScore !== null) maximumScore = Math.max(maximumScore, riskScore);
    const startNm = Number(from?.distanceNm) || 0;
    const endNm = Number(to?.distanceNm) || Math.min(routeDistanceNm, startNm + segmentNm);
    const midpointNm = (startNm + endNm) / 2;
    const phase = midpointNm <= (Number(result.climb?.distanceNm) || 0) ? "climb"
      : midpointNm >= routeDistanceNm - (Number(result.descent?.distanceNm) || 0) ? "descent" : "cruise";
    const minutes = segmentNm / Math.max(1, Number(result.gsKt) || 1) * 60;
    const segmentExposureMinutes = riskScore !== null && riskScore >= PERFORMANCE.turbulence.lightScore ? minutes : 0;
    exposureMinutes += segmentExposureMinutes;
    phaseExposureMinutes[phase] += segmentExposureMinutes;
    segments.push({
      from: from?.ident || from?.icao || "—",
      to: to?.ident || to?.icao || "—",
      riskScore,
      verticalShear,
      horizontalShear,
      simbriefShear: simbriefShearApplicable ? simbriefShear : null,
      windSpeedKt: fromWind?.weather.windSpd ?? null,
      windDirectionDeg: fromWind?.weather.windDir ?? null,
      startNm,
      endNm,
      minutes,
      exposureMinutes: segmentExposureMinutes,
      phase,
      tropopauseFt: Number.isFinite(tropopauseFt) ? tropopauseFt : null,
      tropopauseDistanceFt,
      evidenceAvailable: hasSourceData,
      status: statusForScore(riskScore || 0, hasSourceData, segmentUnbounded && !segmentBlocking),
      blocking: segmentBlocking,
    });
  }
  const origin = terminalRisk("origin", plan.scheduledOffMs, fixes[0], result.climb?.timeHr || 0);
  const destination = terminalRisk("destination", plan.scheduledOnMs, fixes.at(-1), result.descent?.timeHr || 0);
  const alternateFix = plan.alternateWaypoints?.at(-1);
  const alternate = alternateFix || plan.alternates?.[0] ? terminalRisk(
    "alternate",
    Number.isFinite(plan.scheduledOnMs) ? plan.scheduledOnMs + PERFORMANCE.turbulence.alternateEtaOffsetMin * 60000 : NaN,
    alternateFix,
    Math.max(0.08, (result.descent?.timeHr || 0) * 0.45),
  ) : null;
  if (alternate) alternate.ident = plan.alternates?.[0]?.icao || plan.alternate || alternateFix?.ident || "—";
  const terminalScores = [origin, destination, alternate].filter(Boolean).map((item) => item.riskScore).filter(Number.isFinite);
  if (terminalScores.length) maximumScore = Math.max(maximumScore, ...terminalScores);
  blocking ||= origin.blocking || destination.blocking || Boolean(alternate?.blocking);
  phaseExposureMinutes.climb = Math.max(phaseExposureMinutes.climb, origin.exposureMinutes);
  phaseExposureMinutes.descent = Math.max(phaseExposureMinutes.descent, destination.exposureMinutes);
  exposureMinutes = phaseExposureMinutes.climb + phaseExposureMinutes.cruise + phaseExposureMinutes.descent;
  const hasSourceData = evidenceSamples > 0 || simbriefShearSamples > 0 || estimatedSamples > 0 || terminalScores.length > 0;
  // An altitude-unbounded hazard cannot be cleared by a lower wind-shear estimate.
  const unresolvedAdvisory = unboundedAdvisory && !blocking;
  const status = statusForScore(maximumScore, hasSourceData, unresolvedAdvisory);
  const penalty = status === "severe"
    ? PERFORMANCE.turbulence.severePenalty
    : status === "moderate"
      ? PERFORMANCE.turbulence.moderatePenalty
      : status === "light" ? PERFORMANCE.turbulence.lightPenalty : 0;
  return {
    status,
    riskScore: hasSourceData && !unresolvedAdvisory ? maximumScore : null,
    penalty,
    blocking,
    confidence: unresolvedAdvisory ? "limited" : evidenceSamples || [origin, destination, alternate].some((item) => item?.confidence === "weather") ? "weather" : simbriefShearSamples ? "simbrief" : estimatedSamples ? "estimated" : "limited",
    unboundedAdvisory,
    maximumVerticalShear,
    maximumHorizontalShear,
    exposureMinutes,
    phaseExposureMinutes,
    coverage: segments.length ? segments.filter((segment) => segment.evidenceAvailable).length / segments.length : 0,
    tropopauseFt: tropopauseSamples ? weightedTropopauseFt / tropopauseSamples : null,
    origin,
    destination,
    alternate,
    segments,
  };
}

function interpolateFlowRate(table, altitudeFt) {
  if (altitudeFt <= table[0][0]) return table[0][1];
  const upperIndex = table.findIndex(([altitude]) => altitude >= altitudeFt);
  if (upperIndex < 0) return table.at(-1)[1];
  const lower = table[Math.max(0, upperIndex - 1)];
  const upper = table[upperIndex];
  const ratio = upper[0] === lower[0] ? 0 : (altitudeFt - lower[0]) / (upper[0] - lower[0]);
  return lower[1] + (upper[1] - lower[1]) * ratio;
}

export function oxygenSystemWeightLb(oxygen = {}) {
  const cylinder = OXYGEN_CYLINDERS[oxygen.bottleModel] || OXYGEN_CYLINDERS["SK-12-24"];
  return Math.max(0, Math.round(Number(oxygen.bottles) || 0)) * cylinder.fullWeightLb;
}

const WEIGHT_BALANCE_KEYS = ["pilot", "copilot", "rearLeft", "rearCenter", "rearRight", "baggage"];

export function normalizeWeightBalance(weightBalance = {}) {
  return Object.fromEntries(WEIGHT_BALANCE_KEYS.map((key) => [key, Math.max(0, Number(weightBalance[key]) || 0)]));
}

export function weightBalancePayloadLb(weightBalance = {}) {
  return Object.values(normalizeWeightBalance(weightBalance)).reduce((sum, value) => sum + value, 0);
}

export function scaleWeightBalanceToPayload(weightBalance = {}, targetPayloadLb = 0) {
  const normalized = normalizeWeightBalance(weightBalance);
  const currentPayloadLb = weightBalancePayloadLb(normalized);
  const target = Math.max(0, Number(targetPayloadLb) || 0);
  if (currentPayloadLb <= 0) return { ...normalized, pilot: target };
  if (target >= currentPayloadLb) return { ...normalized, baggage: normalized.baggage + target - currentPayloadLb };
  const reduced = { ...normalized };
  let remainingReductionLb = currentPayloadLb - target;
  for (const key of ["baggage", "rearCenter", "rearRight", "rearLeft", "copilot", "pilot"]) {
    const reductionLb = Math.min(reduced[key], remainingReductionLb);
    reduced[key] -= reductionLb;
    remainingReductionLb -= reductionLb;
    if (remainingReductionLb <= 0) break;
  }
  return reduced;
}

export function calculateWeightBalance({ weightBalance = {}, fuelOnboardGal = 0, landingFuelGal = fuelOnboardGal, oxygenWeightLb = 0 }) {
  const loads = normalizeWeightBalance(weightBalance);
  const envelope = WEIGHT_BALANCE.envelope;
  const buildPoint = (name, fuelGal) => {
    const totalFuelGal = clamp(Number(fuelGal) || 0, 0, AIRCRAFT.usableFuelGal);
    const headerFuelGal = Math.min(WEIGHT_BALANCE.headerFuelGal, totalFuelGal);
    const mainFuelGal = Math.max(0, totalFuelGal - headerFuelGal);
    const stations = [
      { key: "empty", weightLb: AIRCRAFT.emptyWeightLb, armIn: WEIGHT_BALANCE.emptyArmIn },
      ...WEIGHT_BALANCE_KEYS.map((key) => ({ key, weightLb: loads[key], armIn: WEIGHT_BALANCE.armsIn[key] })),
      { key: "oxygen", weightLb: Math.max(0, Number(oxygenWeightLb) || 0), armIn: WEIGHT_BALANCE.armsIn.oxygen },
      { key: "headerFuel", weightLb: headerFuelGal * AIRCRAFT.fuelDensityLbGal, armIn: WEIGHT_BALANCE.armsIn.headerFuel },
      { key: "mainFuel", weightLb: mainFuelGal * AIRCRAFT.fuelDensityLbGal, armIn: WEIGHT_BALANCE.armsIn.mainFuel },
    ].map((station) => ({ ...station, momentInLb: station.weightLb * station.armIn }));
    const weightLb = stations.reduce((sum, station) => sum + station.weightLb, 0);
    const momentInLb = stations.reduce((sum, station) => sum + station.momentInLb, 0);
    const cgIn = momentInLb / Math.max(1, weightLb);
    return {
      name,
      fuelGal: totalFuelGal,
      stations,
      weightLb,
      momentInLb,
      cgIn,
      forwardMarginIn: cgIn - envelope.forwardCgIn,
      aftMarginIn: envelope.aftCgIn - cgIn,
      weightMarginLb: envelope.maximumWeightLb - weightLb,
      withinCg: cgIn >= envelope.forwardCgIn && cgIn <= envelope.aftCgIn,
      withinWeight: weightLb <= envelope.maximumWeightLb,
    };
  };
  const zeroFuel = buildPoint("zeroFuel", 0);
  const takeoff = buildPoint("takeoff", fuelOnboardGal);
  const landing = buildPoint("landing", landingFuelGal);
  const hardReasons = [];
  if (!takeoff.withinWeight) hardReasons.push("WEIGHT");
  for (const point of [takeoff, landing]) {
    if (point.cgIn < envelope.forwardCgIn) hardReasons.push("CG_FORWARD");
    if (point.cgIn > envelope.aftCgIn) hardReasons.push("CG_AFT");
  }
  const minimumCgMarginIn = Math.min(takeoff.forwardMarginIn, takeoff.aftMarginIn, landing.forwardMarginIn, landing.aftMarginIn);
  const marginal = !hardReasons.length && (minimumCgMarginIn < envelope.marginalCgIn || takeoff.weightMarginLb < envelope.marginalWeightLb);
  const trajectory = Array.from({ length: 13 }, (_, index) => {
    const fraction = index / 12;
    return buildPoint("trajectory", Number(fuelOnboardGal) + (Number(landingFuelGal) - Number(fuelOnboardGal)) * fraction);
  });
  return {
    status: hardReasons.length ? "unavailable" : marginal ? "marginal" : "viable",
    primaryReason: hardReasons[0] || (marginal ? "MARGIN" : "OK"),
    reasons: [...new Set(hardReasons)],
    payloadLb: weightBalancePayloadLb(loads),
    oxygenWeightLb,
    zeroFuel,
    takeoff,
    landing,
    trajectory,
    envelope,
    minimumCgMarginIn,
    cgTravelIn: landing.cgIn - takeoff.cgIn,
    penalty: hardReasons.length ? 100 : marginal ? 12 : 0,
  };
}

// Use the same station arms and envelope as the rest of the planner. CG is a
// weighted average within each fuel-tank segment, so checking both ends of
// each segment covers every intermediate fuel quantity as well.
export function randomizeWeightBalance({ weightBalance = {}, fuelOnboardGal = 0, oxygenWeightLb = 0, random = Math.random, maxAttempts = 1000 } = {}) {
  const current = normalizeWeightBalance(weightBalance);
  if (current.pilot <= 0) return null;
  const seats = ["copilot", "rearLeft", "rearCenter", "rearRight"];
  const fuelGal = clamp(Number(fuelOnboardGal) || 0, 0, AIRCRAFT.usableFuelGal);
  const checkpoints = [...new Set([0, Math.min(WEIGHT_BALANCE.headerFuelGal, fuelGal), fuelGal])];
  const envelope = WEIGHT_BALANCE.envelope;
  const draw = () => clamp(Number(random()) || 0, 0, 0.999999999);
  const drawInt = (minimum, maximum) => minimum + Math.floor(draw() * (maximum - minimum + 1));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const shuffledSeats = [...seats];
    for (let index = shuffledSeats.length - 1; index > 0; index -= 1) {
      const swapIndex = drawInt(0, index);
      [shuffledSeats[index], shuffledSeats[swapIndex]] = [shuffledSeats[swapIndex], shuffledSeats[index]];
    }
    const passengerCount = drawInt(1, seats.length);
    const candidate = { ...current, copilot: 0, rearLeft: 0, rearCenter: 0, rearRight: 0, baggage: drawInt(1, 16) * 5 };
    shuffledSeats.slice(0, passengerCount).forEach((key) => { candidate[key] = drawInt(24, 44) * 5; });
    if (WEIGHT_BALANCE_KEYS.every((key) => candidate[key] === current[key])) continue;
    const valid = checkpoints.every((checkpointFuelGal) => {
      const point = calculateWeightBalance({ weightBalance: candidate, fuelOnboardGal: checkpointFuelGal, landingFuelGal: checkpointFuelGal, oxygenWeightLb }).takeoff;
      return point.forwardMarginIn >= envelope.marginalCgIn
        && point.aftMarginIn >= envelope.marginalCgIn
        && point.weightMarginLb >= envelope.marginalWeightLb;
    });
    if (valid) return candidate;
  }
  return null;
}

export function calculateOxygenPlan({ result, oxygen = {} }) {
  const cylinder = OXYGEN_CYLINDERS[oxygen.bottleModel] || OXYGEN_CYLINDERS["SK-12-24"];
  const bottles = clamp(Math.round(Number(oxygen.bottles) || 0), 0, PERFORMANCE.oxygen.maxBottles);
  const seats = Array.from({ length: AIRCRAFT.seats }, (_, index) => index === 0 || oxygen.seats?.[index] !== false);
  const occupiedCrew = seats.slice(0, AIRCRAFT.crewSeats).filter(Boolean).length;
  const occupiedPassengers = seats.slice(AIRCRAFT.crewSeats).filter(Boolean).length;
  const samples = [];
  const appendPhase = (phase, durationHr, altitudeAtFraction) => {
    const count = 24;
    for (let index = 0; index < count; index += 1) {
      const fraction = (index + 0.5) / count;
      samples.push({ phase, minutes: durationHr * 60 / count, altitudeFt: altitudeAtFraction(fraction) });
    }
  };
  appendPhase("climb", result.climb.timeHr, (fraction) => result.altitudeFt * fraction);
  appendPhase("cruise", result.cruiseTimeHr, () => result.altitudeFt);
  appendPhase("descent", result.descent.timeHr, (fraction) => result.altitudeFt * (1 - fraction));
  const lowerBandMinutes = samples.filter((sample) => sample.altitudeFt > PERFORMANCE.oxygen.crewThresholdFt && sample.altitudeFt <= PERFORMANCE.oxygen.crewImmediateFt).reduce((sum, sample) => sum + sample.minutes, 0);
  let requiredLiters = 0;
  let requiredMinutes = 0;
  let maximumUsers = 0;
  let maskRequired = false;
  for (const sample of samples) {
    let users = 0;
    if (sample.altitudeFt > PERFORMANCE.oxygen.occupantsThresholdFt) users = occupiedCrew + occupiedPassengers;
    else if (sample.altitudeFt > PERFORMANCE.oxygen.crewImmediateFt) users = occupiedCrew;
    else if (sample.altitudeFt > PERFORMANCE.oxygen.crewThresholdFt && lowerBandMinutes > 30) users = occupiedCrew;
    if (!users) continue;
    const usesMask = sample.altitudeFt > PERFORMANCE.oxygen.maskThresholdFt;
    const flow = interpolateFlowRate(usesMask ? PERFORMANCE.oxygen.maskFlow : PERFORMANCE.oxygen.cannulaFlow, sample.altitudeFt);
    requiredLiters += users * flow * sample.minutes;
    requiredMinutes += sample.minutes;
    maximumUsers = Math.max(maximumUsers, users);
    maskRequired ||= usesMask;
  }
  if (maximumUsers) {
    const reserveFlow = interpolateFlowRate(maskRequired ? PERFORMANCE.oxygen.maskFlow : PERFORMANCE.oxygen.cannulaFlow, result.altitudeFt);
    requiredLiters += maximumUsers * reserveFlow * PERFORMANCE.oxygen.reserveMinutes;
  }
  const installedLiters = bottles * cylinder.capacityLiters * PERFORMANCE.oxygen.usableCapacityFraction;
  const installedOutlets = bottles * cylinder.outlets;
  const capacityRatio = requiredLiters > 0 ? installedLiters / requiredLiters : Infinity;
  const bottlesForMargin = (model) => Math.max(
    Math.ceil(requiredLiters * PERFORMANCE.oxygen.marginalCapacityRatio / (model.capacityLiters * PERFORMANCE.oxygen.usableCapacityFraction)),
    Math.ceil(maximumUsers / model.outlets),
  );
  let recommendedCylinder = cylinder;
  let recommendedBottles = requiredLiters > 0 ? bottlesForMargin(cylinder) : 0;
  if (recommendedBottles > PERFORMANCE.oxygen.maxBottles) {
    const alternatives = Object.values(OXYGEN_CYLINDERS)
      .map((model) => ({ model, count: bottlesForMargin(model) }))
      .filter(({ count }) => count <= PERFORMANCE.oxygen.maxBottles)
      .sort((a, b) => a.count * a.model.fullWeightLb - b.count * b.model.fullWeightLb || a.count - b.count);
    recommendedCylinder = alternatives[0]?.model || null;
    recommendedBottles = alternatives[0]?.count ?? null;
  }
  const capacityOkay = installedLiters >= requiredLiters;
  const outletsOkay = installedOutlets >= maximumUsers;
  const status = requiredLiters <= 0
    ? "not-required"
    : !capacityOkay || !outletsOkay
      ? "insufficient"
      : capacityRatio < PERFORMANCE.oxygen.marginalCapacityRatio ? "marginal" : "compliant";
  const cruiseUsers = result.altitudeFt > PERFORMANCE.oxygen.occupantsThresholdFt
    ? occupiedCrew + occupiedPassengers
    : result.altitudeFt > PERFORMANCE.oxygen.crewImmediateFt
      ? occupiedCrew
      : result.altitudeFt > PERFORMANCE.oxygen.crewThresholdFt && lowerBandMinutes > 30 ? occupiedCrew : 0;
  const cruiseFlow = cruiseUsers ? interpolateFlowRate(maskRequired ? PERFORMANCE.oxygen.maskFlow : PERFORMANCE.oxygen.cannulaFlow, result.altitudeFt) * cruiseUsers : 0;
  return {
    status,
    requiredLiters,
    installedLiters,
    capacityRatio,
    capacityOkay,
    outletsOkay,
    installedOutlets,
    maximumUsers,
    occupiedCrew,
    occupiedPassengers,
    requiredMinutes,
    lowerBandMinutes,
    maskRequired,
    bottles,
    bottleModel: cylinder.label,
    bottleWeightLb: oxygenSystemWeightLb({ ...oxygen, bottles }),
    recommendedBottles,
    recommendedBottleModel: recommendedCylinder?.label ?? null,
    recommendedWeightLb: recommendedCylinder ? recommendedBottles * recommendedCylinder.fullWeightLb : null,
    enduranceMinutes: cruiseFlow > 0 ? installedLiters / cruiseFlow : Infinity,
    penalty: status === "insufficient" ? 100 : status === "marginal" ? 12 : 0,
  };
}

export function calculateFinancialImpact({ currentCost, minimumViableCost }) {
  const current = Number(currentCost);
  const minimum = Number(minimumViableCost);
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(minimum) || minimum <= 0) {
    return { assessed: false, efficiencyScore: null, premiumPercent: null, penalty: 0 };
  }
  const premiumPercent = Math.max(0, (current / minimum - 1) * 100);
  const { tolerancePercent, fullPenaltyPercent, maximumMissionPenalty } = PERFORMANCE.financial;
  const penalty = premiumPercent <= tolerancePercent
    ? 0
    : clamp(Math.round((premiumPercent - tolerancePercent) / (fullPenaltyPercent - tolerancePercent) * maximumMissionPenalty), 0, maximumMissionPenalty);
  return {
    assessed: true,
    efficiencyScore: clamp(Math.round(minimum / current * 100), 0, 100),
    premiumPercent,
    penalty,
  };
}

export function calculateMissionScore({ result, alternateAdvice = null, financial = null, efficiencyPenalty = 0 }) {
  const reasons = [];
  const addReason = (code, impact, blocking = false, detail = null) => {
    if (impact <= 0) return;
    const existing = reasons.find((reason) => reason.code === code);
    if (existing) {
      existing.impact = Math.max(existing.impact, Math.round(impact));
      existing.blocking ||= blocking;
      existing.detail ||= detail;
      return;
    }
    reasons.push({ code, impact: Math.round(impact), blocking, detail });
  };

  const feasibilityReasons = result.feasibility.reasons || [];
  const fuelMarginGal = result.feasibility.fuelMarginGal;
  if (feasibilityReasons.includes("FUEL") || fuelMarginGal < 0) {
    addReason("fuel", 48 + Math.min(12, Math.abs(fuelMarginGal) * 1.5), true, fuelMarginGal);
  } else {
    const target = PERFORMANCE.optimization.targetFuelMarginGal;
    addReason("fuel", clamp((target - fuelMarginGal) / target, 0, 1) * PERFORMANCE.missionRisk.fuelMarginWeight, false, fuelMarginGal);
  }
  if (feasibilityReasons.includes("ALTITUDE") || feasibilityReasons.includes("PROFILE")) {
    addReason("flight-profile", 48, true, result.feasibility.profileMarginNm);
  } else if (feasibilityReasons.includes("PROFILE_MARGIN")) {
    addReason("flight-profile", PERFORMANCE.missionRisk.feasibilityMarginal, false, result.feasibility.profileMarginNm);
  }

  const weightBalanceUnavailable = result.weightBalance?.status === "unavailable";
  if (feasibilityReasons.includes("WEIGHT") || weightBalanceUnavailable) {
    addReason("weight-balance", 52, true, result.weightBalance?.primaryReason || "WEIGHT");
  } else if (feasibilityReasons.includes("WEIGHT_MARGIN") || result.weightBalance?.status === "marginal") {
    addReason("weight-balance", PERFORMANCE.missionRisk.weightBalanceMarginal, false, result.weightBalance?.primaryReason || "MARGIN");
  }

  const icingBlocking = result.icing.status === "avoid";
  addReason("icing", icingBlocking ? 52 : result.icing.riskScore * PERFORMANCE.missionRisk.icingWeight, icingBlocking, result.icing.riskScore);
  if (result.turbulence.riskScore !== null) {
    addReason("turbulence", result.turbulence.riskScore * PERFORMANCE.missionRisk.turbulenceWeight, Boolean(result.turbulence.blocking), result.turbulence.riskScore);
  }

  if (result.oxygen.status === "insufficient") {
    addReason("oxygen", 48, true, result.oxygen.requiredLiters);
  } else if (result.oxygen.status === "marginal") {
    addReason("oxygen", PERFORMANCE.missionRisk.oxygenMarginal, false, result.oxygen.requiredLiters);
  }

  const alternateStatus = alternateAdvice?.destination?.status;
  if (alternateStatus === "unavailable" || alternateStatus === "unknown") {
    addReason("alternate", PERFORMANCE.missionRisk.alternateUnavailable, false, alternateAdvice?.destination?.marginGal ?? alternateStatus);
  } else if (alternateStatus === "marginal") {
    addReason("alternate", PERFORMANCE.missionRisk.alternateMarginal, false, alternateAdvice.destination.marginGal);
  }
  if (financial?.assessed && financial.penalty > 0) {
    addReason("financial", financial.penalty, false, financial);
  }
  addReason("efficiency", clamp(efficiencyPenalty, 0, 8), false, result.specificRangeNmGal);

  reasons.sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.impact - a.impact);
  const penalty = reasons.reduce((sum, reason) => sum + reason.impact, 0);
  const blocked = reasons.some((reason) => reason.blocking);
  let score = clamp(Math.round(100 - penalty), 0, 100);
  if (blocked) score = Math.min(score, 39);
  const operationallyMarginal = result.feasibility.status === "marginal"
    || result.weightBalance?.status === "marginal"
    || result.oxygen.status === "marginal"
    || result.icing.status === "caution"
    || ["moderate", "severe"].includes(result.turbulence.status)
    || alternateStatus === "marginal";
  const weatherUnknown = result.icing?.confidence === "limited"
    || ["limited", "unknown"].includes(result.turbulence?.confidence);
  const status = blocked ? "not-viable" : weatherUnknown ? "unknown"
    : score < PERFORMANCE.missionRisk.viableScoreMin || operationallyMarginal ? "marginal" : "viable";
  return { score, status, blocked, penalty: 100 - score, reasons };
}

export function powerAtAltitude({ altitudeFt, oatC, mapInHg, rpm, source = "AUTO" }) {
  const densityAltitude = densityAltitudeFt(altitudeFt, oatC);
  const aboveCriticalFt = Math.max(0, densityAltitude - AIRCRAFT.criticalAltitudeFt);
  const maximumAvailableMapInHg = clamp(
    AIRCRAFT.normalManifoldInHg - aboveCriticalFt / 1000 * PERFORMANCE.powerModel.mapLossInHgPer1000FtAboveCritical,
    PERFORMANCE.powerModel.minimumMapInHg,
    AIRCRAFT.normalManifoldInHg,
  );
  const availableMapInHg = Math.min(mapInHg, maximumAvailableMapInHg);
  const estimatedHp = clamp(
    PERFORMANCE.powerModel.ratedHp * (availableMapInHg / AIRCRAFT.normalManifoldInHg) * (rpm / AIRCRAFT.maxRpm),
    0,
    PERFORMANCE.powerModel.ratedHp,
  );
  return {
    source,
    targetMapInHg: mapInHg,
    availableMapInHg,
    maximumAvailableMapInHg,
    rpm,
    estimatedHp,
    percentPower: estimatedHp / PERFORMANCE.powerModel.ratedHp * 100,
    densityAltitudeFt: densityAltitude,
    criticalAltitudeFt: AIRCRAFT.criticalAltitudeFt,
    turboLimited: availableMapInHg < mapInHg - 0.05,
  };
}

function modePowerSetting(mode, powerSetting = {}) {
  const modeData = PERFORMANCE.modes[mode];
  if (powerSetting.type === "MANUAL") {
    return {
      source: "MANUAL",
      mapInHg: clamp(Number(powerSetting.mapInHg) || modeData.mapInHg, PERFORMANCE.powerModel.minimumMapInHg, AIRCRAFT.maxManifoldInHg),
      rpm: clamp(Number(powerSetting.rpm) || modeData.rpm, PERFORMANCE.powerModel.minimumRpm, AIRCRAFT.maxRpm),
    };
  }
  return { source: "AUTO", mapInHg: modeData.mapInHg, rpm: modeData.rpm };
}

function climbProfile(altitudeFt, weightLb, weather, phaseName = "climb", startAltitudeFt = 0, plan = null) {
  const setting = PERFORMANCE.powerModel.phases[phaseName];
  const fromFt = Math.max(0, Math.min(startAltitudeFt, altitudeFt));
  const climbFt = Math.max(0, altitudeFt - fromFt);
  const sections = Math.max(1, Math.ceil(climbFt / 1000));
  let timeHr = 0, distanceNm = 0, fuelGal = 0, power = null, lastRate = 0;
  const profileSections = [];
  const departureFix = plan?.waypoints?.[0] || plan?.origin;
  const track = plan?.origin && plan?.destination ? bearingDeg(plan.origin, plan.destination) : null;
  for (let index = 0; index < sections; index += 1) {
    const sectionFt = climbFt / sections;
    const midFt = fromFt + (index + .5) * sectionFt;
    const localWeather = departureFix ? weatherAtAltitude(departureFix, midFt) : weather;
    const temperatureC = Number.isFinite(localWeather.oatC) ? localWeather.oatC : isaTemperatureC(midFt);
    power = powerAtAltitude({ altitudeFt: midFt, oatC: temperatureC, mapInHg: setting.mapInHg, rpm: setting.rpm, source: setting.throttle });
    const referencePower = PERFORMANCE.powerModel.ratedHp * (setting.mapInHg / AIRCRAFT.normalManifoldInHg) * (setting.rpm / AIRCRAFT.maxRpm);
    const powerRatio = clamp(power.estimatedHp / referencePower, .55, 1);
    const baseRate = PERFORMANCE.climbRate.seaLevelFpm -
      (PERFORMANCE.climbRate.seaLevelFpm - PERFORMANCE.climbRate.ceilingFpm) * midFt / AIRCRAFT.serviceCeilingFt;
    const currentWeightLb = weightLb - fuelGal * AIRCRAFT.fuelDensityLbGal;
    const weightFactor = 1 - ((currentWeightLb - PERFORMANCE.referenceWeightLb) / 100) * PERFORMANCE.climbWeightFactorPer100Lb;
    lastRate = Math.max(550, baseRate * weightFactor * (.72 + .28 * powerRatio));
    const sectionHr = sectionFt / lastRate / 60;
    const windKt = track === null ? 0 : windComponentKt(track, localWeather.windDir, localWeather.windSpd);
    const sectionDistanceNm = sectionHr * (plan?.vectorWind ? solveWindTriangle(PERFORMANCE.climbSpeedKt, localWeather.courseDeg ?? track, localWeather.windDir, localWeather.windSpd).gsKt : Math.max(90, PERFORMANCE.climbSpeedKt + windKt));
    const sectionFuelGal = sectionHr * setting.fuelFlowGph * powerRatio;
    profileSections.push({ timeHr: sectionHr, distanceNm: sectionDistanceNm, fuelGal: sectionFuelGal,
      startAltitudeFt: fromFt + index * sectionFt, endAltitudeFt: fromFt + (index + 1) * sectionFt });
    timeHr += sectionHr;
    distanceNm += sectionDistanceNm;
    fuelGal += sectionFuelGal;
  }
  power ||= powerAtAltitude({ altitudeFt: fromFt, oatC: weather.oatC, mapInHg: setting.mapInHg, rpm: setting.rpm, source: setting.throttle });
  return { rateFpm: climbFt / Math.max(1e-9, timeHr * 60), timeHr, distanceNm,
    fuelGal, fuelFlowGph: timeHr ? fuelGal / timeHr : setting.fuelFlowGph, power,
    startAltitudeFt: fromFt, endAltitudeFt: altitudeFt, finalRateFpm: lastRate, sections: profileSections };
}

export function calibrationForMode(calibration, mode, altitudeFt, powerSetting = {}) {
  // A G3X cruise observation applies only near its measured power regime.
  const values = calibration?.[mode] || calibration || {};
  const reference = values.reference;
  const selected = modePowerSetting(mode, powerSetting);
  const applicable = !reference || (!reference.legacy &&
    reference.mode === mode
    && Math.abs(reference.altitudeFt - altitudeFt) <= PERFORMANCE.calibrationLimits.altitudeToleranceFt
    && Math.abs(reference.mapInHg - selected.mapInHg) <= PERFORMANCE.calibrationLimits.mapToleranceInHg
    && Math.abs(reference.rpm - selected.rpm) <= PERFORMANCE.calibrationLimits.rpmTolerance
  );
  return {
    tasFactor: applicable ? clamp(Number(values.tasFactor) || 1, ...PERFORMANCE.calibrationLimits.tasFactor) : 1,
    fuelFlowFactor: applicable ? clamp(Number(values.fuelFlowFactor) || 1, ...PERFORMANCE.calibrationLimits.fuelFlowFactor) : 1,
    applicable,
    reference: reference || null,
  };
}

export function cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, calibration = {}, powerSetting = {} }) {
  const modeData = PERFORMANCE.modes[mode];
  const factors = calibrationForMode(calibration, mode, altitudeFt, powerSetting);
  const weightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
  const weather = averageRouteWeather(plan, altitudeFt);
  const selectedPower = modePowerSetting(mode, powerSetting);
  const power = powerAtAltitude({ altitudeFt, oatC: weather.oatC, mapInHg: selectedPower.mapInHg, rpm: selectedPower.rpm, source: selectedPower.source });
  const referenceHp = PERFORMANCE.powerModel.ratedHp * (modeData.mapInHg / AIRCRAFT.normalManifoldInHg) * (modeData.rpm / AIRCRAFT.maxRpm);
  const powerRatio = clamp(power.estimatedHp / referenceHp, 0.45, 1.5);
  const weightPenalty = ((weightLb - PERFORMANCE.referenceWeightLb) / 100) * PERFORMANCE.weightTasPenaltyKtPer100Lb;
  const altitudeGain = ((altitudeFt - 10000) / 1000) * PERFORMANCE.altitudeTasGainKtPer1000Ft;
  const baseTasKt = modeData.tasAt10kKt + altitudeGain - weightPenalty + weather.isaDeviationC * PERFORMANCE.isaTasGainKtPerC;
  const tasKt = baseTasKt * powerRatio ** PERFORMANCE.powerModel.tasPowerExponent * factors.tasFactor;
  const fuelFlowGph = modeData.fuelFlowGph * powerRatio ** PERFORMANCE.powerModel.fuelPowerExponent * factors.fuelFlowFactor;
  return {
    altitudeFt,
    weightLb,
    weather,
    tasKt,
    gsKt: clamp(tasKt + weather.componentKt, 110, 360),
    returnGsKt: clamp(tasKt - weather.componentKt, 110, 360),
    fuelFlowGph,
    factors,
    power,
    powerRatio,
  };
}

function descentProfile(altitudeFt, weather, destinationAltitudeFt = 0, plan = null) {
  const descentFt = Math.max(0, altitudeFt - Math.max(0, destinationAltitudeFt));
  const sections = Math.max(1, Math.ceil(descentFt / 1000));
  const setting = PERFORMANCE.powerModel.phases.descent;
  const referencePower = PERFORMANCE.powerModel.ratedHp
    * (setting.mapInHg / AIRCRAFT.normalManifoldInHg) * (setting.rpm / AIRCRAFT.maxRpm);
  const destinationFix = plan?.waypoints?.at(-1) || plan?.destination;
  const track = plan?.origin && plan?.destination ? bearingDeg(plan.origin, plan.destination) : null;
  let timeHr = 0, distanceNm = 0, fuelGal = 0, power = null;
  const profileSections = [];
  for (let index = 0; index < sections; index += 1) {
    const midFt = altitudeFt - (index + .5) * descentFt / sections;
    const localWeather = destinationFix ? weatherAtAltitude(destinationFix, midFt) : weather;
    power = powerAtAltitude({ altitudeFt: midFt, oatC: localWeather.oatC, mapInHg: setting.mapInHg, rpm: setting.rpm, source: setting.throttle });
    const sectionHr = (descentFt / sections) / PERFORMANCE.descentRateFpm / 60;
    const windKt = track === null ? 0 : windComponentKt(track, localWeather.windDir, localWeather.windSpd);
    const sectionDistanceNm = sectionHr * (plan?.vectorWind ? solveWindTriangle(PERFORMANCE.descentSpeedKt, localWeather.courseDeg ?? track, localWeather.windDir, localWeather.windSpd).gsKt : Math.max(90, PERFORMANCE.descentSpeedKt + windKt));
    const sectionFuelGal = sectionHr * setting.fuelFlowGph
      * clamp(power.estimatedHp / referencePower, .5, 1.2) ** PERFORMANCE.powerModel.fuelPowerExponent;
    profileSections.push({ timeHr: sectionHr, distanceNm: sectionDistanceNm, fuelGal: sectionFuelGal,
      startAltitudeFt: altitudeFt - index * descentFt / sections,
      endAltitudeFt: altitudeFt - (index + 1) * descentFt / sections });
    timeHr += sectionHr;
    distanceNm += sectionDistanceNm;
    fuelGal += sectionFuelGal;
  }
  power ||= powerAtAltitude({ altitudeFt, oatC: weather.oatC, mapInHg: setting.mapInHg, rpm: setting.rpm, source: setting.throttle });
  return { timeHr, distanceNm, fuelGal, fuelFlowGph: timeHr ? fuelGal / timeHr : setting.fuelFlowGph,
    rateFpm: PERFORMANCE.descentRateFpm, power, startAltitudeFt: altitudeFt, endAltitudeFt: destinationAltitudeFt,
    sections: profileSections };
}

function integrateCruise({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, calibration, powerSetting,
  startNm, endNm, climbFuelGal, fallbackGsKt }) {
  const fixes = (plan.waypoints || []).filter((fix) =>
    Number.isFinite(fix.distanceNm) && Number.isFinite(fix.lat) && Number.isFinite(fix.lon));
  let timeHr = 0, fuelGal = 0, coveredNm = 0;
  const sections = [];
  const addSection = (distanceNm, from, to) => {
    const remainingFuelGal = Math.max(0, fuelOnboardGal - PERFORMANCE.taxiFuelGal - climbFuelGal - fuelGal);
    const snapshot = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal: remainingFuelGal,
      oxygenWeightLb, calibration, powerSetting });
    const weather = from && to ? weatherAtAltitude(from, altitudeFt) : null;
    const componentKt = weather ? windComponentKt(bearingDeg(from, to), weather.windDir, weather.windSpd) : snapshot.weather.componentKt;
    const gsKt = plan.vectorWind && weather ? solveWindTriangle(snapshot.tasKt, bearingDeg(from,to), weather.windDir, weather.windSpd).gsKt : Math.max(90, snapshot.tasKt + componentKt);
    const durationHr = distanceNm / gsKt;
    const consumedGal = durationHr * snapshot.fuelFlowGph;
    sections.push({ distanceNm, timeHr: durationHr, fuelGal: consumedGal, tasKt: snapshot.tasKt, gsKt,
      fuelFlowGph: snapshot.fuelFlowGph, startFuelGal: remainingFuelGal, componentKt });
    timeHr += durationHr;
    fuelGal += consumedGal;
    coveredNm += distanceNm;
  };
  for (let index = 0; index < fixes.length - 1; index += 1) {
    const from = fixes[index], to = fixes[index + 1];
    const segmentNm = Math.max(0, Math.min(endNm, to.distanceNm) - Math.max(startNm, from.distanceNm));
    if (!segmentNm) continue;
    addSection(segmentNm, from, to);
  }
  const totalNm = Math.max(0, endNm - startNm);
  if (totalNm > coveredNm) addSection(totalNm - coveredNm, null, null);
  return { timeHr, fuelGal, sections, distanceNm: totalNm, gsKt: timeHr ? totalNm / timeHr : fallbackGsKt,
    fuelFlowGph: timeHr ? fuelGal / timeHr : 0 };
}

export function calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {} }) {
  const takeoffWeightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
  const cruise = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, calibration, powerSetting });
  const { weather, tasKt, gsKt: meanGsKt, fuelFlowGph } = cruise;
  const climb = climbProfile(altitudeFt, takeoffWeightLb, weather, "climb", plan.origin?.elevationFt || 0, plan);
  const descent = descentProfile(altitudeFt, weather, plan.destination?.elevationFt || 0, plan);
  const cruiseDistanceNm = Math.max(0, plan.distanceNm - climb.distanceNm - descent.distanceNm);
  const cruiseIntegrated = integrateCruise({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb,
    calibration, powerSetting, startNm: climb.distanceNm,
    endNm: Math.max(climb.distanceNm, plan.distanceNm - descent.distanceNm),
    climbFuelGal: climb.fuelGal, fallbackGsKt: meanGsKt });
  const cruiseTimeHr = cruiseIntegrated.timeHr;
  const gsKt = cruiseIntegrated.gsKt;
  const cruiseFuelGal = cruiseIntegrated.fuelGal;
  const calibratedCruiseFlowGph = cruiseTimeHr ? cruiseIntegrated.fuelFlowGph : fuelFlowGph;
  const tripFuelGal = climb.fuelGal + cruiseFuelGal + descent.fuelGal;
  const tripTimeHr = climb.timeHr + cruiseTimeHr + descent.timeHr;
  const reserveFuelGal = (reserveMinutes / 60) * PERFORMANCE.modes.ECON.fuelFlowGph;
  const contingencyFuelGal = tripFuelGal * (PERFORMANCE.contingencyPercent / 100);
  const fuelRequiredGal = tripFuelGal + reserveFuelGal + contingencyFuelGal + PERFORMANCE.taxiFuelGal;
  const specificRangeNmGal = cruiseFuelGal > 0 ? cruiseDistanceNm / cruiseFuelGal : gsKt / calibratedCruiseFlowGph;
  const usableForCruise = Math.max(0, AIRCRAFT.usableFuelGal - reserveFuelGal - PERFORMANCE.taxiFuelGal - climb.fuelGal - descent.fuelGal);
  const maxRangeNm = usableForCruise * specificRangeNmGal + climb.distanceNm + descent.distanceNm;
  const enduranceHr = AIRCRAFT.usableFuelGal / calibratedCruiseFlowGph;

  return {
    altitudeFt,
    fl: Math.round(altitudeFt / 100),
    tasKt,
    gsKt,
    fuelFlowGph: calibratedCruiseFlowGph,
    power: cruise.power,
    weather,
    climb,
    cruise: { timeHr: cruiseTimeHr, distanceNm: cruiseDistanceNm, fuelGal: cruiseFuelGal, fuelFlowGph: calibratedCruiseFlowGph, power: cruise.power, tasKt, gsKt,
      sections: cruiseIntegrated.sections,
      calibrationApplicable: cruise.factors.applicable },
    descent,
    cruiseDistanceNm,
    cruiseTimeHr,
    cruiseFuelGal,
    tripFuelGal,
    tripTimeHr,
    reserveFuelGal,
    contingencyFuelGal,
    fuelRequiredGal,
    fuelRemainingGal: fuelOnboardGal - fuelRequiredGal,
    specificRangeNmGal,
    maxRangeNm,
    enduranceHr,
    takeoffWeightLb,
    oxygenWeightLb,
    overweight: takeoffWeightLb > AIRCRAFT.maxGrossWeightLb,
  };
}

export function assessFeasibility(result, { plan, fuelOnboardGal }) {
  const fuelMarginGal = fuelOnboardGal - result.fuelRequiredGal;
  const weightMarginLb = AIRCRAFT.maxGrossWeightLb - result.takeoffWeightLb;
  const profileMarginNm = plan.distanceNm - result.climb.distanceNm - result.descent.distanceNm;
  const altitudeMarginFt = AIRCRAFT.serviceCeilingFt - result.altitudeFt;
  const hardReasons = [];
  const marginalReasons = [];

  if (weightMarginLb < 0) hardReasons.push("WEIGHT");
  if (fuelMarginGal < 0) hardReasons.push("FUEL");
  if (altitudeMarginFt < 0) hardReasons.push("ALTITUDE");
  if (result.altitudeFt < Math.max(plan.origin?.elevationFt || 0, plan.destination?.elevationFt || 0)) hardReasons.push("AIRPORT_ABOVE_FL");
  if (profileMarginNm < PERFORMANCE.viability.minimumCruiseSegmentNm) hardReasons.push("PROFILE");

  if (!hardReasons.length) {
    if (fuelMarginGal < PERFORMANCE.viability.minimumFuelMarginGal) marginalReasons.push("FUEL_MARGIN");
    if (weightMarginLb < PERFORMANCE.viability.minimumWeightMarginLb) marginalReasons.push("WEIGHT_MARGIN");
    if (profileMarginNm < PERFORMANCE.viability.marginalCruiseSegmentNm) marginalReasons.push("PROFILE_MARGIN");
  }

  return {
    status: hardReasons.length ? "unavailable" : marginalReasons.length ? "marginal" : "viable",
    primaryReason: hardReasons[0] || marginalReasons[0] || "OK",
    reasons: [...hardReasons, ...marginalReasons],
    fuelMarginGal,
    weightMarginLb,
    profileMarginNm,
    altitudeMarginFt,
  };
}

function tripFuelUsedToDistance(result, distanceNm) {
  let remainingDistanceNm = Math.max(0, distanceNm);
  let usedGal = 0;
  for (const phase of [result.climb, { distanceNm: result.cruiseDistanceNm, fuelGal: result.cruiseFuelGal }, result.descent]) {
    if (phase.distanceNm <= 0) continue;
    const coveredNm = Math.min(remainingDistanceNm, phase.distanceNm);
    usedGal += phase.fuelGal * coveredNm / phase.distanceNm;
    remainingDistanceNm -= coveredNm;
    if (remainingDistanceNm <= 0) break;
  }
  return usedGal;
}

function fuelUsedToDistance(result, distanceNm) {
  return PERFORMANCE.taxiFuelGal + tripFuelUsedToDistance(result, distanceNm);
}

function diversionLeg({ from, to, result, fallbackDistanceNm = NaN }) {
  const hasCoordinates = [from?.lat, from?.lon, to?.lat, to?.lon].every(Number.isFinite);
  const distanceNm = hasCoordinates ? greatCircleNm(from, to) : Number(fallbackDistanceNm);
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) return null;
  const trackDeg = hasCoordinates ? bearingDeg(from, to) : 0;
  const componentKt = hasCoordinates
    ? windComponentKt(trackDeg, result.weather.windDir, result.weather.windSpeedKt)
    : 0;
  const gsKt = clamp(result.tasKt + componentKt, 90, 360);
  const timeHr = distanceNm / gsKt;
  return {
    distanceNm,
    trackDeg,
    componentKt,
    gsKt,
    timeHr,
    fuelGal: timeHr * result.fuelFlowGph + PERFORMANCE.diversion.approachFuelGal,
  };
}

export function calculateRemainingFlightAssessment({
  plan, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {}, manual,
  projectedRemainingTripFuelGal = null,
}) {
  if (!manual?.active) return null;
  const positionNm = Number(manual.distanceNm);
  const remainingFuelGal = Number(manual.fuelRemainingGal);
  if (!Number.isFinite(positionNm) || positionNm < 0 || positionNm > plan.distanceNm
    || !Number.isFinite(remainingFuelGal) || remainingFuelGal < 0 || !ALTITUDES_FT.includes(Number(manual.altitudeFt))) {
    return { status: "unknown" };
  }
  const result = calculateAtAltitude({ plan, altitudeFt: manual.altitudeFt, mode, payloadLb,
    fuelOnboardGal: remainingFuelGal, oxygenWeightLb, reserveMinutes, calibration, powerSetting });
  const remainingDistanceNm = Math.max(0, plan.distanceNm - positionNm);
  const remainingTripFuelGal = Number.isFinite(projectedRemainingTripFuelGal)
    ? Math.max(0, projectedRemainingTripFuelGal)
    : Math.max(0, result.tripFuelGal - tripFuelUsedToDistance(result, positionNm));
  const contingencyFuelGal = remainingTripFuelGal * PERFORMANCE.contingencyPercent / 100;
  const alternate = plan.alternates?.[0] || (plan.alternate ? { icao: plan.alternate } : null);
  const alternateLeg = alternate ? diversionLeg({ from: plan.destination, to: alternate, result, fallbackDistanceNm: alternate.distanceNm }) : null;
  if (alternate && !alternateLeg) return { status: "unknown", remainingDistanceNm, remainingFuelGal };
  const alternateFuelGal = alternateLeg ? PERFORMANCE.diversion.missedApproachFuelGal + alternateLeg.fuelGal : 0;
  const requiredFuelGal = remainingTripFuelGal + contingencyFuelGal + result.reserveFuelGal + alternateFuelGal;
  const marginGal = remainingFuelGal - requiredFuelGal;
  const status = marginGal < 0 ? "not-viable"
    : marginGal < PERFORMANCE.diversion.marginalFuelMarginGal ? "marginal" : "viable";
  return { status, remainingDistanceNm, remainingFuelGal, remainingTripFuelGal, reserveFuelGal: result.reserveFuelGal,
    contingencyFuelGal, alternateFuelGal, requiredFuelGal, marginGal };
}

export function calculateAlternateDiversion({
  plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {},
  waypointIndex = 0, manual = null, result: suppliedResult = null,
}) {
  const result = suppliedResult || calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, reserveMinutes, calibration, powerSetting });
  const alternate = plan.alternates?.[0] || (plan.alternate ? { icao: plan.alternate } : null);
  if (!alternate) return { available: false, ident: "—" };

  const destinationLeg = diversionLeg({
    from: plan.destination,
    to: alternate,
    result,
    fallbackDistanceNm: alternate.distanceNm,
  });
  const selectedIndex = clamp(Math.round(Number(waypointIndex) || 0), 0, Math.max(0, plan.waypoints.length - 1));
  const position = plan.waypoints[selectedIndex] || plan.origin;
  const routeDistanceNm = Number(position.distanceNm) || 0;
  const fuelAtPositionGal = manual?.active && Number(manual.waypointIndex) === selectedIndex
    ? Number(manual.fuelRemainingGal)
    : Math.max(0, fuelOnboardGal - fuelUsedToDistance(result, routeDistanceNm));
  const diversion = diversionLeg({ from: position, to: alternate, result });
  const fuelAtDestinationGal = Math.max(0, fuelOnboardGal - PERFORMANCE.taxiFuelGal - result.tripFuelGal);
  const alternateFuelGal = destinationLeg
    ? PERFORMANCE.diversion.missedApproachFuelGal + destinationLeg.fuelGal
    : NaN;
  const alternateLandingFuelGal = Number.isFinite(alternateFuelGal) ? fuelAtDestinationGal - alternateFuelGal : NaN;
  const alternateMarginGal = alternateLandingFuelGal - result.reserveFuelGal;
  const diversionLandingFuelGal = diversion ? fuelAtPositionGal - diversion.fuelGal : NaN;
  const diversionMarginGal = diversionLandingFuelGal - result.reserveFuelGal;
  const statusFor = (marginGal) => !Number.isFinite(marginGal)
    ? "unknown"
    : marginGal < 0
      ? "unavailable"
      : marginGal < PERFORMANCE.diversion.marginalFuelMarginGal
        ? "marginal"
        : "viable";

  return {
    available: Boolean(destinationLeg || diversion),
    alternate,
    position,
    fuelAtDestinationGal,
    destination: destinationLeg ? {
      ...destinationLeg,
      fuelGal: alternateFuelGal,
      landingFuelGal: alternateLandingFuelGal,
      marginGal: alternateMarginGal,
      status: statusFor(alternateMarginGal),
    } : null,
    diversion: diversion ? {
      ...diversion,
      fuelAtPositionGal,
      landingFuelGal: diversionLandingFuelGal,
      marginGal: diversionMarginGal,
      status: statusFor(diversionMarginGal),
    } : null,
  };
}

export function calculateGlideCorridor({ plan, result }) {
  const ratio = PERFORMANCE.glide.ratio;
  const bestGlideKias = PERFORMANCE.glide.bestGlideKias;
  const sinkFpm = bestGlideKias * PERFORMANCE.glide.feetPerNm / 60 / ratio;
  const altitudeAtDistance = (distanceNm) => {
    if (distanceNm <= result.climb.distanceNm) return result.altitudeFt * clamp(distanceNm / Math.max(1, result.climb.distanceNm), 0, 1);
    const descentStartNm = Math.max(result.climb.distanceNm, plan.distanceNm - result.descent.distanceNm);
    if (distanceNm >= descentStartNm) return result.altitudeFt * clamp((plan.distanceNm - distanceNm) / Math.max(1, result.descent.distanceNm), 0, 1);
    return result.altitudeFt;
  };
  const basePoints = (plan.waypoints || []).map((point) => ({ ...point, distanceNm: Number(point.distanceNm) }))
    .filter((point) => Number.isFinite(point.distanceNm));
  const points = basePoints.length >= 2 ? basePoints : [
    { ...plan.origin, ident: plan.origin.icao, distanceNm: 0 },
    { ...plan.destination, ident: plan.destination.icao, distanceNm: plan.distanceNm },
  ];
  const samples = points.map((point) => {
    const altitudeFt = altitudeAtDistance(point.distanceNm);
    const stillAirRangeNm = altitudeFt * ratio / PERFORMANCE.glide.feetPerNm;
    const glideMinutes = altitudeFt / sinkFpm;
    const windRatio = result.weather.componentKt / bestGlideKias;
    return {
      ...point,
      altitudeFt,
      stillAirRangeNm,
      forwardRangeNm: Math.max(0, stillAirRangeNm * (1 + windRatio)),
      reverseRangeNm: Math.max(0, stillAirRangeNm * (1 - windRatio)),
      glideMinutes,
    };
  });
  const cruiseRangeNm = result.altitudeFt * ratio / PERFORMANCE.glide.feetPerNm;
  return {
    ratio,
    bestGlideKias,
    sinkFpm,
    cruiseRangeNm,
    cruiseMinutes: result.altitudeFt / sinkFpm,
    forwardRangeNm: Math.max(0, cruiseRangeNm * (1 + result.weather.componentKt / bestGlideKias)),
    reverseRangeNm: Math.max(0, cruiseRangeNm * (1 - result.weather.componentKt / bestGlideKias)),
    samples,
  };
}

function nearestWaypoint(plan, distanceNm) {
  const points = plan.waypoints || [];
  if (!points.length) return { ident: "—", distanceNm };
  return points.reduce((best, point) => {
    const pointDistance = Number(point.distanceNm);
    if (!Number.isFinite(pointDistance)) return best;
    return Math.abs(pointDistance - distanceNm) < Math.abs((Number(best.distanceNm) || 0) - distanceNm) ? point : best;
  }, points[0]);
}

export function calculateEtpPnr({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {}, result: suppliedResult = null }) {
  const result = suppliedResult || calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, reserveMinutes, calibration, powerSetting });
  const points = (plan.waypoints || []).filter((fix) => Number.isFinite(fix.distanceNm) && Number.isFinite(fix.lat) && Number.isFinite(fix.lon));
  const legs = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index], to = points[index + 1];
    const start = clamp(from.distanceNm, 0, plan.distanceNm);
    const end = clamp(to.distanceNm, start, plan.distanceNm);
    if (end <= start) continue;
    const weather = weatherAtAltitude(from, altitudeFt);
    legs.push({ start, end, componentKt: windComponentKt(bearingDeg(from, to), weather.windDir, weather.windSpd) });
  }
  if (!legs.length) legs.push({ start: 0, end: plan.distanceNm, componentKt: result.weather.componentKt });
  const travelTime = (fromNm, toNm, returning = false) => {
    const lo = Math.min(fromNm, toNm), hi = Math.max(fromNm, toNm);
    let hours = 0, covered = 0;
    for (const leg of legs) {
      const distance = Math.max(0, Math.min(hi, leg.end) - Math.max(lo, leg.start));
      if (!distance) continue;
      hours += distance / Math.max(90, result.tasKt + (returning ? -leg.componentKt : leg.componentKt));
      covered += distance;
    }
    // Navlogs can omit terminal legs. Use the route mean only for that gap.
    if (covered < hi - lo) hours += (hi - lo - covered) / Math.max(90, result.tasKt + (returning ? -result.weather.componentKt : result.weather.componentKt));
    return hours;
  };
  const continuationTime = (distance) => travelTime(distance, plan.distanceNm);
  const returnTime = (distance) => travelTime(0, distance, true);
  let lo = 0, hi = plan.distanceNm;
  for (let iteration = 0; iteration < 35; iteration += 1) {
    const mid = (lo + hi) / 2;
    if (returnTime(mid) < continuationTime(mid)) lo = mid; else hi = mid;
  }
  const etpDistanceNm = (lo + hi) / 2;
  const fuelTo = (distance) => PERFORMANCE.taxiFuelGal + result.climb.fuelGal
    + Math.max(0, travelTime(result.climb.distanceNm, distance)) * result.fuelFlowGph;
  const remainingAfterReturn = (distance) => fuelOnboardGal - fuelTo(distance)
    - returnTime(distance) * result.fuelFlowGph - result.reserveFuelGal - result.descent.fuelGal;
  const pnrAtOrigin = remainingAfterReturn(0);
  const pnrBeyondDestination = remainingAfterReturn(plan.distanceNm) >= 0;
  lo = 0; hi = plan.distanceNm;
  if (pnrBeyondDestination) {
    lo = plan.distanceNm;
    hi = Math.max(2 * plan.distanceNm, 1);
    while (hi < 10000 && remainingAfterReturn(hi) >= 0) hi *= 2;
  }
  let pnrRawDistanceNm = null;
  if (pnrAtOrigin >= 0 && remainingAfterReturn(hi) < 0) {
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const mid = (lo + hi) / 2;
      if (remainingAfterReturn(mid) >= 0) lo = mid; else hi = mid;
    }
    pnrRawDistanceNm = (lo + hi) / 2;
  }
  const pnrDistanceNm = pnrRawDistanceNm === null ? null : Math.min(plan.distanceNm, pnrRawDistanceNm);
  const outboundGsKt = plan.distanceNm / Math.max(.01, travelTime(0, plan.distanceNm));
  const returnGsKt = plan.distanceNm / Math.max(.01, travelTime(0, plan.distanceNm, true));
  return {
    etp: {
      distanceNm: etpDistanceNm,
      fraction: clamp(etpDistanceNm / plan.distanceNm, 0, 1),
      elapsedHr: result.climb.timeHr + travelTime(result.climb.distanceNm, etpDistanceNm),
      returnTimeHr: returnTime(etpDistanceNm),
      continueTimeHr: continuationTime(etpDistanceNm),
      fuelRemainingGal: Math.max(0, fuelOnboardGal - fuelTo(etpDistanceNm)),
      waypoint: nearestWaypoint(plan, etpDistanceNm),
    },
    pnr: {
      distanceNm: pnrDistanceNm,
      rawDistanceNm: pnrRawDistanceNm,
      status: pnrRawDistanceNm === null ? "UNAVAILABLE" : pnrBeyondDestination ? "BEYOND_DESTINATION" : "WITHIN_ROUTE",
      fraction: pnrDistanceNm === null ? null : clamp(pnrDistanceNm / plan.distanceNm, 0, 1),
      elapsedHr: pnrDistanceNm === null ? null : result.climb.timeHr + travelTime(result.climb.distanceNm, pnrDistanceNm),
      fuelRemainingGal: pnrDistanceNm === null ? null : Math.max(0, fuelOnboardGal - fuelTo(pnrDistanceNm)),
      beyondDestination: pnrBeyondDestination,
      waypoint: pnrDistanceNm === null ? null : nearestWaypoint(plan, pnrDistanceNm),
    },
    outboundGsKt,
    returnGsKt,
    legCount: legs.length,
    limitation: legs.length < 2 ? "LIMITED_LEG_WEATHER" : null,
  };
}

export function calculateStepClimbs({
  plan, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {}, initialAltitudeFt,
  manual = null, availableAltitudesFt = null,
}) {
  const startDistanceNm = clamp(Number(manual?.distanceNm) || 0, 0, plan.distanceNm);
  const startFuelGal = clamp(manual?.fuelRemainingGal != null && Number.isFinite(Number(manual.fuelRemainingGal)) ? Number(manual.fuelRemainingGal) : fuelOnboardGal, 0, AIRCRAFT.usableFuelGal);
  const startingAltitudeFt = Number(manual?.altitudeFt) || initialAltitudeFt;
  let currentAltitudeFt = startingAltitudeFt;
  let currentFuelGal = startFuelGal;
  let currentDistanceNm = startDistanceNm;
  const startWeightLb = AIRCRAFT.emptyWeightLb + payloadLb + startFuelGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
  const candidates = (plan.waypoints || [])
    .map((point) => ({ ...point, distanceNm: Number(point.distanceNm) }))
    .filter((point) => Number.isFinite(point.distanceNm) && point.distanceNm > startDistanceNm + 5 && point.distanceNm < plan.distanceNm - 10)
    .sort((a, b) => a.distanceNm - b.distanceNm);
  const allowedAltitudes = Array.isArray(availableAltitudesFt) ? new Set(availableAltitudesFt) : null;
  let blockedByAvailability = false;
  const steps = [];

  for (const point of candidates) {
    if (point.distanceNm <= currentDistanceNm + 5) continue;
    const current = cruiseSnapshot({ plan, altitudeFt: currentAltitudeFt, mode, payloadLb, fuelOnboardGal: currentFuelGal, oxygenWeightLb, calibration, powerSetting });
    const segmentNm = point.distanceNm - currentDistanceNm;
    currentFuelGal = Math.max(0, currentFuelGal - segmentNm / current.gsKt * current.fuelFlowGph);
    currentDistanceNm = point.distanceNm;
    const weightLb = AIRCRAFT.emptyWeightLb + payloadLb + currentFuelGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
    const weightLossLb = startWeightLb - weightLb;
    const unlockedSteps = Math.floor(weightLossLb / PERFORMANCE.stepClimb.weightLossLbPerStep);
    const targetAltitudeFt = Math.min(AIRCRAFT.serviceCeilingFt, startingAltitudeFt + unlockedSteps * 2000);
    if (targetAltitudeFt < currentAltitudeFt + 2000 || plan.distanceNm - currentDistanceNm < PERFORMANCE.stepClimb.minimumRemainingNm) continue;

    const candidateAltitudeFt = Math.min(targetAltitudeFt, currentAltitudeFt + 2000);
    if (allowedAltitudes && !allowedAltitudes.has(candidateAltitudeFt)) { blockedByAvailability = true; continue; }
    const candidate = cruiseSnapshot({ plan, altitudeFt: candidateAltitudeFt, mode, payloadLb, fuelOnboardGal: currentFuelGal, oxygenWeightLb, calibration, powerSetting });
    const remainingNm = plan.distanceNm - currentDistanceNm;
    const deltaAltitudeFt = candidateAltitudeFt - currentAltitudeFt;
    const candidateWeather = averageRouteWeather(plan, candidateAltitudeFt);
    const stepClimb = climbProfile(candidateAltitudeFt, weightLb, candidateWeather, "enrouteClimb", currentAltitudeFt, plan);
    const stepTimeHr = stepClimb.timeHr;
    const stepDistanceNm = stepClimb.distanceNm;
    const stayFuelGal = remainingNm / current.gsKt * current.fuelFlowGph;
    const stepFuelGal = stepTimeHr * stepClimb.fuelFlowGph + Math.max(0, remainingNm - stepDistanceNm) / candidate.gsKt * candidate.fuelFlowGph;
    const savingGal = stayFuelGal - stepFuelGal;
    if (savingGal < PERFORMANCE.stepClimb.minimumFuelSavingGal) continue;

    steps.push({
      distanceNm: currentDistanceNm,
      waypoint: point.ident,
      fromAltitudeFt: currentAltitudeFt,
      altitudeFt: candidateAltitudeFt,
      fuelRemainingGal: currentFuelGal,
      savingGal,
      minutes: stepTimeHr * 60,
    });
    currentAltitudeFt = candidateAltitudeFt;
    currentFuelGal = Math.max(0, currentFuelGal - stepTimeHr * stepClimb.fuelFlowGph);
    currentDistanceNm = Math.min(plan.distanceNm, currentDistanceNm + stepDistanceNm);
    if (steps.length >= PERFORMANCE.stepClimb.maximumSteps) break;
  }

  // Compare only the remaining enroute segment; common climb, descent and reserve
  // are deliberately excluded from both profiles.
  const estimateProfile = (scheduledSteps) => {
    let distanceNm = startDistanceNm;
    let fuelGal = startFuelGal;
    let timeHr = 0;
    let altitudeFt = startingAltitudeFt;
    for (const point of [...scheduledSteps, { distanceNm: plan.distanceNm }]) {
      const cruiseNm = Math.max(0, point.distanceNm - distanceNm);
      if (cruiseNm > 0) {
        const cruise = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal: Math.max(0, fuelGal), oxygenWeightLb, calibration, powerSetting });
        const cruiseHr = cruiseNm / cruise.gsKt;
        fuelGal -= cruiseHr * cruise.fuelFlowGph;
        timeHr += cruiseHr;
        distanceNm += cruiseNm;
      }
      if (!point.altitudeFt) continue;
      const weightLb = AIRCRAFT.emptyWeightLb + payloadLb + Math.max(0, fuelGal) * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
      const climb = climbProfile(point.altitudeFt, weightLb, averageRouteWeather(plan, point.altitudeFt), "enrouteClimb", altitudeFt, plan);
      const climbHr = climb.timeHr;
      const climbNm = Math.min(Math.max(0, plan.distanceNm - distanceNm), climb.distanceNm);
      fuelGal -= climbHr * climb.fuelFlowGph;
      timeHr += climbHr;
      distanceNm += climbNm;
      altitudeFt = point.altitudeFt;
    }
    return { fuelGal: startFuelGal - fuelGal, timeHr, landingFuelGal: fuelGal };
  };
  const baseline = estimateProfile([]);
  const stepped = steps.length ? estimateProfile(steps) : null;
  const hasNetGain = stepped && baseline.fuelGal - stepped.fuelGal >= PERFORMANCE.stepClimb.minimumFuelSavingGal;
  const recommendedSteps = hasNetGain ? steps : [];

  return {
    startDistanceNm,
    startFuelGal,
    initialAltitudeFt: startingAltitudeFt,
    steps: recommendedSteps,
    next: recommendedSteps[0] || null,
    comparison: {
      baseline,
      stepped: hasNetGain ? stepped : null,
      fuelSavingGal: hasNetGain ? baseline.fuelGal - stepped.fuelGal : 0,
      timeDeltaMin: hasNetGain ? (stepped.timeHr - baseline.timeHr) * 60 : 0,
      reason: hasNetGain ? null : !candidates.length ? "no-waypoint" : steps.length ? "no-net-gain" : blockedByAvailability ? "level-unavailable" : "no-beneficial-step",
    },
  };
}

export function deriveCalibration({ plan, mode, payloadLb, fuelRemainingGal, oxygenWeightLb = 0, altitudeFt, observedTasKt, observedFuelFlowGph, positionFix = null, powerSetting = {} }) {
  if (!PERFORMANCE.modes[mode] || !Number.isFinite(altitudeFt) || !Number.isFinite(fuelRemainingGal)
    || fuelRemainingGal <= 0 || fuelRemainingGal > AIRCRAFT.usableFuelGal
    || !Number.isFinite(observedTasKt) || observedTasKt <= 0
    || !Number.isFinite(observedFuelFlowGph) || observedFuelFlowGph <= 0) {
    throw new RangeError("INVALID_CALIBRATION_INPUT");
  }
  if (!positionFix || !(Number.isFinite(positionFix.oatC)
    || positionFix.windLevels?.some((level) => Number.isFinite(level.oatC)))) {
    throw new RangeError("CALIBRATION_ATMOSPHERE_UNAVAILABLE");
  }
  const baseline = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal: fuelRemainingGal, oxygenWeightLb, calibration: {}, powerSetting });
  const localWeather = weatherAtAltitude(positionFix, altitudeFt);
  const localIsaDeviationC = localWeather.oatC - isaTemperatureC(altitudeFt);
  const localTasKt = baseline.tasKt + (localIsaDeviationC - baseline.weather.isaDeviationC) * PERFORMANCE.isaTasGainKtPerC;
  const tasFactor = observedTasKt / localTasKt;
  const fuelFlowFactor = observedFuelFlowGph / baseline.fuelFlowGph;
  if (tasFactor < PERFORMANCE.calibrationLimits.tasFactor[0] || tasFactor > PERFORMANCE.calibrationLimits.tasFactor[1]
    || fuelFlowFactor < PERFORMANCE.calibrationLimits.fuelFlowFactor[0] || fuelFlowFactor > PERFORMANCE.calibrationLimits.fuelFlowFactor[1]) {
    throw new RangeError("CALIBRATION_OUT_OF_RANGE");
  }
  const setting = modePowerSetting(mode, powerSetting);
  return {
    tasFactor,
    fuelFlowFactor,
    reference: { mode, altitudeFt, mapInHg: setting.mapInHg, rpm: setting.rpm,
      oatC: localWeather.oatC, weightLb: baseline.weightLb,
      observedAt: new Date().toISOString() },
  };
}

export function migrateCalibration(saved) {
  if (!saved || typeof saved !== "object") return { tasFactor: 1, fuelFlowFactor: 1, reference: null };
  const source = Number.isFinite(saved.tasFactor) && Number.isFinite(saved.fuelFlowFactor)
    ? saved : ["NORMAL", "ECON", "FAST"].map((mode) => saved[mode]).find((item) => item && Number.isFinite(item.tasFactor) && Number.isFinite(item.fuelFlowFactor));
  if (!source) return { tasFactor: 1, fuelFlowFactor: 1, reference: null };
  const mode = source.reference?.mode || ["NORMAL", "ECON", "FAST"].find((key) => saved[key] === source) || "NORMAL";
  return {
    tasFactor: clamp(source.tasFactor, ...PERFORMANCE.calibrationLimits.tasFactor),
    fuelFlowFactor: clamp(source.fuelFlowFactor, ...PERFORMANCE.calibrationLimits.fuelFlowFactor),
    reference: source.reference || { mode, altitudeFt: null, mapInHg: PERFORMANCE.modes[mode].mapInHg,
      rpm: PERFORMANCE.modes[mode].rpm, legacy: true },
  };
}

/** Physical vertical transition; coefficients and power/ROC models are shared
 * with the production engine. The caller supplies the actual local route and
 * sampled atmosphere. No extra step-climb fuel penalty is invented. */
export function calculateFlightTransition({ plan, fromAltitudeFt, toAltitudeFt, weightLb, initial = false }) {
  if (![fromAltitudeFt,toAltitudeFt,weightLb].every(Number.isFinite) || fromAltitudeFt < 0 || toAltitudeFt < 0
    || Math.max(fromAltitudeFt,toAltitudeFt) > AIRCRAFT.serviceCeilingFt || (weightLb > AIRCRAFT.maxGrossWeightLb || weightLb < AIRCRAFT.emptyWeightLb))
    throw new RangeError("TRANSITION_OUTSIDE_ENVELOPE");
  const weather = averageRouteWeather(plan, (fromAltitudeFt+toAltitudeFt)/2);
  if (toAltitudeFt > fromAltitudeFt) return climbProfile(toAltitudeFt, weightLb, weather, initial ? "climb" : "enrouteClimb", fromAltitudeFt, plan);
  if (toAltitudeFt < fromAltitudeFt) return descentProfile(fromAltitudeFt, weather, toAltitudeFt, plan);
  return { timeHr:0, distanceNm:0, fuelGal:0, sections:[], startAltitudeFt:fromAltitudeFt, endAltitudeFt:toAltitudeFt };
}
