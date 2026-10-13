import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT, OXYGEN_CYLINDERS, WEIGHT_BALANCE } from "./config.js?v=20261013-14";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const toRad = (deg) => (deg * Math.PI) / 180;
export const toDeg = (rad) => (rad * 180) / Math.PI;

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
    windDir: interpolateDirectionDeg(lowerDir, upperDir, ratio),
    windSpd: lowerSpd + (upperSpd - lowerSpd) * ratio,
    oatC: lowerOat + (upperOat - lowerOat) * ratio,
  };
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
    /(?:ICE|ICING)[^.\n]{0,50}?\bFL(\d{2,3})\s*(?:\/|-|TO)\s*(?:FL)?(\d{2,3})\b/g,
    /\bFL(\d{2,3})\s*(?:\/|-|TO)\s*(?:FL)?(\d{2,3})[^.\n]{0,50}?(?:ICE|ICING)\b/g,
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
  const cloudLayer = /\b(?:BKN|OVC|VV)\d{3}\b/.test(source);
  const clear = /\b(?:CAVOK|SKC|CLR|NSC)\b/.test(source) && !precipitation;
  return {
    explicitIcing,
    icingBandsFt,
    freezingPrecipitation,
    visibleMoisture: freezingPrecipitation || precipitation || cloudLayer,
    clear,
    available: Boolean(source.trim()),
  };
}

function evidenceAtAltitude(evidence, altitudeFt) {
  const explicitIcing = evidence.explicitIcing && (
    !evidence.icingBandsFt.length
    || evidence.icingBandsFt.some((band) => altitudeFt >= band.baseFt && altitudeFt <= band.topFt)
  );
  return { ...evidence, explicitIcing };
}

function icingTemperatureFactor(oatC) {
  if (!Number.isFinite(oatC) || oatC > PERFORMANCE.icing.warmBoundaryC || oatC <= PERFORMANCE.icing.coldBoundaryC) return 0;
  if (oatC > 2) return (PERFORMANCE.icing.warmBoundaryC - oatC) / 3 * 0.35;
  if (oatC >= -10) return 1;
  if (oatC >= -20) return 1 - (Math.abs(oatC + 10) / 10) * 0.2;
  if (oatC >= -30) return 0.8 - (Math.abs(oatC + 20) / 10) * 0.45;
  return 0.35 - (Math.abs(oatC + 30) / 10) * 0.25;
}

function moistureFactor(evidence) {
  if (evidence.explicitIcing || evidence.freezingPrecipitation) return 1;
  if (evidence.visibleMoisture) return PERFORMANCE.icing.visibleMoistureFactor;
  if (evidence.clear) return PERFORMANCE.icing.clearWeatherFactor;
  return PERFORMANCE.icing.unknownMoistureFactor;
}

export function calculateIcingRisk({ plan, result }) {
  const fixes = plan.waypoints?.filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) || [];
  const enrouteText = plan.meteorology?.enrouteText || "";
  const globalEvidence = icingWeatherEvidence(enrouteText);
  let maximumRisk = 0;
  let temperatureExposureMinutes = 0;
  let cruiseExposureMinutes = 0;
  let observedTemperatureSamples = 0;
  let evidenceSamples = globalEvidence.available ? 1 : 0;
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
    const terminalText = index === 0
      ? plan.meteorology?.originText || ""
      : index === fixes.length - 2
        ? plan.meteorology?.destinationText || ""
        : "";
    const evidence = evidenceAtAltitude(icingWeatherEvidence(`${enrouteText} ${from.weatherText || ""} ${terminalText}`), result.altitudeFt);
    if (evidence.available) evidenceSamples += 1;
    const temperatureFactor = hasTemperature
      ? icingTemperatureFactor(weather.oatC)
      : evidence.explicitIcing || evidence.freezingPrecipitation ? 1 : 0;
    const risk = temperatureFactor * moistureFactor(evidence);
    maximumRisk = Math.max(maximumRisk, risk);
    if (temperatureFactor >= 0.3) temperatureExposureMinutes += segmentMinutes;
    cruiseExposureMinutes += segmentMinutes * risk;
    const segmentHardHazard = evidence.explicitIcing || evidence.freezingPrecipitation;
    hardHazard ||= segmentHardHazard;
    segments.push({
      from: from.ident,
      to: to.ident,
      startNm: Number(from.distanceNm) || 0,
      endNm: Number(to.distanceNm) || Math.min(plan.distanceNm, (Number(from.distanceNm) || 0) + segmentNm),
      oatC: weather.oatC,
      riskScore: Math.round(risk * 100),
      status: segmentHardHazard ? "avoid" : risk * 100 >= PERFORMANCE.icing.cautionScore ? "caution" : risk * 100 >= PERFORMANCE.icing.watchScore ? "watch" : "low",
    });
  }

  const transitionExposure = (fix, durationHr, text) => {
    if (!fix || durationHr <= 0) return 0;
    const rawEvidence = icingWeatherEvidence(`${enrouteText} ${fix.weatherText || ""} ${text || ""}`);
    const hasTemperature = Number.isFinite(fix.oatC) || (fix.windLevels || []).some((level) => Number.isFinite(level.oatC));
    let weighted = 0;
    const samples = 10;
    for (let index = 1; index <= samples; index += 1) {
      const altitudeFt = result.altitudeFt * (index / samples);
      const evidence = evidenceAtAltitude(rawEvidence, altitudeFt);
      const temperatureFactor = hasTemperature
        ? icingTemperatureFactor(weatherAtAltitude(fix, altitudeFt).oatC)
        : evidence.explicitIcing || evidence.freezingPrecipitation ? 1 : 0;
      hardHazard ||= evidence.explicitIcing || evidence.freezingPrecipitation;
      weighted += temperatureFactor * moistureFactor(evidence);
    }
    return durationHr * 60 * weighted / samples;
  };
  const transitionRiskMinutes = transitionExposure(fixes[0], result.climb.timeHr, plan.meteorology?.originText)
    + transitionExposure(fixes.at(-1), result.descent.timeHr, plan.meteorology?.destinationText);
  const exposureMinutes = cruiseExposureMinutes + transitionRiskMinutes;
  const rawRiskScore = Math.round(maximumRisk * 100);
  const status = hardHazard
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
    temperatureExposureMinutes,
    transitionRiskMinutes,
    confidence: evidenceSamples > 1 ? "weather" : "limited",
    temperatureCoverage: fixes.length > 1 ? observedTemperatureSamples / (fixes.length - 1) : 0,
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
  const bands = [];
  const patterns = [
    /(?:TURB(?:ULENCE)?|CAT)[^.\n]{0,50}?\bFL(\d{2,3})\s*(?:\/|-|TO)\s*(?:FL)?(\d{2,3})\b/g,
    /\bFL(\d{2,3})\s*(?:\/|-|TO)\s*(?:FL)?(\d{2,3})[^.\n]{0,50}?(?:TURB(?:ULENCE)?|CAT)\b/g,
  ];
  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      const firstFt = Number(match[1]) * 100;
      const secondFt = Number(match[2]) * 100;
      bands.push({ baseFt: Math.min(firstFt, secondFt), topFt: Math.max(firstFt, secondFt) });
    }
  });
  let score = 0;
  if (!noTurbulence) {
    if (/\b(?:EXTRM|EXTREME)\s+(?:TURB|TURBULENCE|CAT)\b/.test(source)) score = 100;
    else if (/\b(?:SEV|SEVERE)(?:\s*[-\/]\s*EXTREME)?\s+(?:TURB|TURBULENCE|CAT)\b/.test(source)) score = 90;
    else if (/\b(?:MOD|MODERATE)\s*[-\/]\s*(?:SEV|SEVERE)\s+(?:TURB|TURBULENCE|CAT)\b/.test(source)) score = 82;
    else if (/\b(?:MOD|MODERATE)\s+(?:TURB|TURBULENCE|CAT|CHOP)\b/.test(source)) score = 60;
    else if (/\b(?:LGT|LIGHT)\s*[-\/]\s*(?:MOD|MODERATE)\s+(?:TURB|TURBULENCE|CAT|CHOP)\b/.test(source)) score = 45;
    else if (/\b(?:LGT|LIGHT)\s+(?:TURB|TURBULENCE|CAT|CHOP)\b/.test(source)) score = 30;
  }
  if (/\bAIRMET\s+TANGO\b/.test(source)) score = Math.max(score, 55);
  if (/\b(?:CONVECTIVE\s+SIGMET|SIGMET[^.\n]{0,40}(?:TURB|CAT)|TSRA|TS|CB)\b/.test(source)) score = Math.max(score, 85);
  if (/\b(?:LLWS|WIND\s*SHEAR|WS\d{3})\b/.test(source)) score = Math.max(score, 60);
  return { available: Boolean(source.trim()), noTurbulence, score, bands };
}

function turbulenceEvidenceAtAltitude(evidence, altitudeFt) {
  if (!evidence.bands.length || evidence.bands.some((band) => altitudeFt >= band.baseFt && altitudeFt <= band.topFt)) return evidence;
  return { ...evidence, score: 0 };
}

export function calculateTurbulenceRisk({ plan, result }) {
  const fixes = plan.waypoints?.filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) || [];
  const globalText = plan.meteorology?.enrouteText || "";
  let maximumScore = 0;
  let maximumVerticalShear = 0;
  let maximumHorizontalShear = 0;
  let evidenceSamples = 0;
  const segments = [];
  for (let index = 0; index < Math.max(1, fixes.length - 1); index += 1) {
    const from = fixes[index] || plan.origin;
    const to = fixes[index + 1] || plan.destination;
    const terminalText = index === 0 ? plan.meteorology?.originText || "" : index === fixes.length - 2 ? plan.meteorology?.destinationText || "" : "";
    const evidence = turbulenceEvidenceAtAltitude(turbulenceWeatherEvidence(`${globalText} ${from?.weatherText || ""} ${terminalText}`), result.altitudeFt);
    if (evidence.available) evidenceSamples += 1;
    let verticalShear = 0;
    const levels = (from?.windLevels || []).filter((level) => Number.isFinite(level.altitudeFt)).sort((a, b) => a.altitudeFt - b.altitudeFt);
    for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
      const lower = levels[levelIndex];
      const upper = levels[levelIndex + 1];
      if (result.altitudeFt < lower.altitudeFt - 3000 || result.altitudeFt > upper.altitudeFt + 3000) continue;
      const separationThousands = Math.max(0.1, (upper.altitudeFt - lower.altitudeFt) / 1000);
      verticalShear = Math.max(verticalShear, vectorWindDifferenceKt(lower, upper) / separationThousands);
    }
    const segmentNm = from && to && [from.lat, from.lon, to.lat, to.lon].every(Number.isFinite) ? greatCircleNm(from, to) : 0;
    const fromWeather = weatherAtAltitude(from || {}, result.altitudeFt);
    const toWeather = weatherAtAltitude(to || from || {}, result.altitudeFt);
    const horizontalShear = segmentNm > 0 ? vectorWindDifferenceKt(fromWeather, toWeather) / segmentNm * 150 : 0;
    maximumVerticalShear = Math.max(maximumVerticalShear, verticalShear);
    maximumHorizontalShear = Math.max(maximumHorizontalShear, horizontalShear);
    const shearRatio = Math.max(
      verticalShear / PERFORMANCE.turbulence.moderateVerticalShearKtPer1000Ft,
      horizontalShear / PERFORMANCE.turbulence.moderateHorizontalShearKtPer150Nm,
    );
    const shearScore = shearRatio >= 1.7 ? 82 : shearRatio >= 1 ? 55 : shearRatio >= 0.55 ? 28 : 8 * shearRatio;
    const riskScore = Math.round(Math.max(evidence.score, shearScore));
    maximumScore = Math.max(maximumScore, riskScore);
    segments.push({
      from: from?.ident || from?.icao || "—",
      to: to?.ident || to?.icao || "—",
      riskScore,
      verticalShear,
      horizontalShear,
    });
  }
  const status = maximumScore >= PERFORMANCE.turbulence.severeScore
    ? "severe"
    : maximumScore >= PERFORMANCE.turbulence.moderateScore
      ? "moderate"
      : maximumScore >= PERFORMANCE.turbulence.lightScore ? "light" : "smooth";
  const penalty = status === "severe"
    ? PERFORMANCE.turbulence.severePenalty
    : status === "moderate"
      ? PERFORMANCE.turbulence.moderatePenalty
      : status === "light" ? PERFORMANCE.turbulence.lightPenalty : 0;
  return {
    status,
    riskScore: maximumScore,
    penalty,
    confidence: evidenceSamples ? "weather" : fixes.some((fix) => (fix.windLevels || []).length > 1) ? "wind" : "limited",
    maximumVerticalShear,
    maximumHorizontalShear,
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

export function calculateOxygenPlan({ result, oxygen = {} }) {
  const cylinder = OXYGEN_CYLINDERS[oxygen.bottleModel] || OXYGEN_CYLINDERS["SK-12-24"];
  const bottles = clamp(Math.round(Number(oxygen.bottles) || 0), 0, 6);
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
  const recommendedBottles = requiredLiters > 0
    ? Math.max(Math.ceil(requiredLiters / (cylinder.capacityLiters * PERFORMANCE.oxygen.usableCapacityFraction)), Math.ceil(maximumUsers / cylinder.outlets))
    : 0;
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
    recommendedWeightLb: recommendedBottles * cylinder.fullWeightLb,
    enduranceMinutes: cruiseFlow > 0 ? installedLiters / cruiseFlow : Infinity,
    penalty: status === "insufficient" ? 100 : status === "marginal" ? 12 : 0,
  };
}

export function calculatePerformanceConfidence({ plan, result, calibration = {}, debriefs = [], mode }) {
  const modeDebriefs = debriefs.filter((entry) => entry.mode === mode);
  const factors = calibrationForMode(calibration, mode);
  const calibrated = Math.abs(factors.tasFactor - 1) > 0.001 || Math.abs(factors.fuelFlowFactor - 1) > 0.001;
  const temperatureSamples = (plan.waypoints || []).filter((fix) => Number.isFinite(fix.oatC) || (fix.windLevels || []).some((level) => Number.isFinite(level.oatC))).length;
  const weatherCoverage = (plan.waypoints || []).length ? temperatureSamples / plan.waypoints.length : 0;
  const learnedReduction = Math.min(0.05, modeDebriefs.length * PERFORMANCE.confidence.debriefReductionPerFlight);
  const tasUncertainty = Math.max(PERFORMANCE.confidence.minimumTasUncertainty, PERFORMANCE.confidence.baseTasUncertainty - learnedReduction - (calibrated ? 0.01 : 0));
  const fuelUncertainty = Math.max(PERFORMANCE.confidence.minimumFuelUncertainty, PERFORMANCE.confidence.baseFuelUncertainty - learnedReduction - (calibrated ? 0.015 : 0));
  const timeUncertainty = tasUncertainty + (1 - weatherCoverage) * PERFORMANCE.confidence.weatherTimeUncertainty;
  const score = clamp(Math.round(100 - tasUncertainty * 260 - fuelUncertainty * 220 - (1 - weatherCoverage) * 22), 0, 100);
  return {
    score,
    sampleCount: modeDebriefs.length,
    weatherCoverage,
    tasUncertainty,
    fuelUncertainty,
    timeUncertainty,
    fuel: { low: result.fuelRequiredGal * (1 - fuelUncertainty), nominal: result.fuelRequiredGal, high: result.fuelRequiredGal * (1 + fuelUncertainty) },
    time: { low: result.tripTimeHr * (1 - timeUncertainty), nominal: result.tripTimeHr, high: result.tripTimeHr * (1 + timeUncertainty) },
    tas: { low: result.tasKt * (1 - tasUncertainty), nominal: result.tasKt, high: result.tasKt * (1 + tasUncertainty) },
    range: { low: result.maxRangeNm * (1 - fuelUncertainty - tasUncertainty / 2), nominal: result.maxRangeNm, high: result.maxRangeNm * (1 + fuelUncertainty + tasUncertainty / 2) },
  };
}

export function calculateMissionRisk({ result, confidence, alternateAdvice = null }) {
  let score = result.feasibility.status === "unavailable"
    ? PERFORMANCE.missionRisk.feasibilityUnavailable
    : result.feasibility.status === "marginal" ? PERFORMANCE.missionRisk.feasibilityMarginal : 0;
  const fuelMargin = result.feasibility.fuelMarginGal;
  score += fuelMargin < 0 ? PERFORMANCE.missionRisk.fuelMarginWeight : clamp((10 - fuelMargin) / 10, 0, 1) * PERFORMANCE.missionRisk.fuelMarginWeight;
  score += result.icing.riskScore * PERFORMANCE.missionRisk.icingWeight;
  score += result.turbulence.riskScore * PERFORMANCE.missionRisk.turbulenceWeight;
  score += result.oxygen.status === "insufficient"
    ? PERFORMANCE.missionRisk.oxygenInsufficient
    : result.oxygen.status === "marginal" ? PERFORMANCE.missionRisk.oxygenMarginal : 0;
  score += result.weightBalance?.status === "unavailable"
    ? PERFORMANCE.missionRisk.weightBalanceUnavailable
    : result.weightBalance?.status === "marginal" ? PERFORMANCE.missionRisk.weightBalanceMarginal : 0;
  score += (100 - confidence.score) * PERFORMANCE.missionRisk.confidenceWeight;
  const alternateStatus = alternateAdvice?.destination?.status;
  if (alternateStatus === "unavailable" || alternateStatus === "unknown") score += PERFORMANCE.missionRisk.alternateUnavailable;
  else if (alternateStatus === "marginal") score += PERFORMANCE.missionRisk.alternateMarginal;
  score = clamp(Math.round(score), 0, 100);
  return { score, status: score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low" };
}

export function calculateDebrief({ result, actualTimeMinutes, actualFuelGal, currentCalibration = {} }) {
  const actualTimeHr = Math.max(1, Number(actualTimeMinutes)) / 60;
  const actualFuel = Math.max(0.1, Number(actualFuelGal));
  const timeErrorPct = (actualTimeHr - result.tripTimeHr) / result.tripTimeHr * 100;
  const fuelErrorPct = (actualFuel - result.tripFuelGal) / result.tripFuelGal * 100;
  const accuracyScore = clamp(Math.round(100 - Math.abs(timeErrorPct) * 0.45 - Math.abs(fuelErrorPct) * 0.55), 0, 100);
  const learningRate = PERFORMANCE.debrief.learningRate;
  const tasFactor = clamp(
    (Number(currentCalibration.tasFactor) || 1) * (1 + learningRate * (result.tripTimeHr / actualTimeHr - 1)),
    ...PERFORMANCE.calibrationLimits.tasFactor,
  );
  const fuelFlowFactor = clamp(
    (Number(currentCalibration.fuelFlowFactor) || 1) * (1 + learningRate * (actualFuel / result.tripFuelGal - 1)),
    ...PERFORMANCE.calibrationLimits.fuelFlowFactor,
  );
  return { accuracyScore, timeErrorPct, fuelErrorPct, actualTimeHr, actualFuelGal: actualFuel, calibration: { tasFactor, fuelFlowFactor } };
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

function climbProfile(altitudeFt, weightLb, weather, phaseName = "climb") {
  const avgAltitudeRatio = altitudeFt / 2 / AIRCRAFT.serviceCeilingFt;
  const baseRate = PERFORMANCE.climbRate.seaLevelFpm -
    (PERFORMANCE.climbRate.seaLevelFpm - PERFORMANCE.climbRate.ceilingFpm) * avgAltitudeRatio;
  const weightFactor = 1 - ((weightLb - PERFORMANCE.referenceWeightLb) / 100) * PERFORMANCE.climbWeightFactorPer100Lb;
  const setting = PERFORMANCE.powerModel.phases[phaseName];
  const power = powerAtAltitude({ altitudeFt, oatC: weather.oatC, mapInHg: setting.mapInHg, rpm: setting.rpm, source: setting.throttle });
  const referencePower = PERFORMANCE.powerModel.ratedHp * (setting.mapInHg / AIRCRAFT.normalManifoldInHg) * (setting.rpm / AIRCRAFT.maxRpm);
  const powerRatio = clamp(power.estimatedHp / referencePower, 0.55, 1);
  const rateFpm = Math.max(550, baseRate * weightFactor * (0.72 + 0.28 * powerRatio));
  const timeHr = altitudeFt / rateFpm / 60;
  const distanceNm = timeHr * PERFORMANCE.climbSpeedKt;
  const fuelFlowGph = setting.fuelFlowGph * powerRatio;
  return { rateFpm, timeHr, distanceNm, fuelGal: timeHr * fuelFlowGph, fuelFlowGph, power };
}

function calibrationForMode(calibration, mode) {
  const values = calibration?.[mode] || calibration || {};
  return {
    tasFactor: clamp(Number(values.tasFactor) || 1, ...PERFORMANCE.calibrationLimits.tasFactor),
    fuelFlowFactor: clamp(Number(values.fuelFlowFactor) || 1, ...PERFORMANCE.calibrationLimits.fuelFlowFactor),
  };
}

export function cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, calibration = {}, powerSetting = {} }) {
  const modeData = PERFORMANCE.modes[mode];
  const factors = calibrationForMode(calibration, mode);
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

function descentProfile(altitudeFt) {
  const timeHr = altitudeFt / PERFORMANCE.descentRateFpm / 60;
  return { timeHr, distanceNm: timeHr * PERFORMANCE.descentSpeedKt, fuelGal: timeHr * PERFORMANCE.descentFuelFlowGph };
}

export function calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {} }) {
  const takeoffWeightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
  const cruise = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, calibration, powerSetting });
  const { weather, tasKt, gsKt, fuelFlowGph } = cruise;

  const climb = climbProfile(altitudeFt, takeoffWeightLb, weather);
  const descent = descentProfile(altitudeFt);
  const cruiseDistanceNm = Math.max(0, plan.distanceNm - climb.distanceNm - descent.distanceNm);
  const cruiseTimeHr = cruiseDistanceNm / gsKt;
  const cruiseFuelGal = cruiseTimeHr * fuelFlowGph;
  const tripFuelGal = climb.fuelGal + cruiseFuelGal + descent.fuelGal;
  const tripTimeHr = climb.timeHr + cruiseTimeHr + descent.timeHr;
  const reserveFuelGal = (reserveMinutes / 60) * PERFORMANCE.modes.ECON.fuelFlowGph;
  const contingencyFuelGal = tripFuelGal * (PERFORMANCE.contingencyPercent / 100);
  const fuelRequiredGal = tripFuelGal + reserveFuelGal + contingencyFuelGal + PERFORMANCE.taxiFuelGal;
  const specificRangeNmGal = gsKt / fuelFlowGph;
  const usableForCruise = Math.max(0, AIRCRAFT.usableFuelGal - reserveFuelGal - PERFORMANCE.taxiFuelGal - climb.fuelGal - descent.fuelGal);
  const maxRangeNm = usableForCruise * specificRangeNmGal + climb.distanceNm + descent.distanceNm;
  const enduranceHr = AIRCRAFT.usableFuelGal / fuelFlowGph;

  return {
    altitudeFt,
    fl: Math.round(altitudeFt / 100),
    tasKt,
    gsKt,
    fuelFlowGph,
    power: cruise.power,
    weather,
    climb,
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

function normalize(values, value, lowerIsBetter = false) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 1;
  const score = (value - min) / (max - min);
  return lowerIsBetter ? 1 - score : score;
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

export function calculatePlan({ plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {}, powerSetting = {}, oxygen = {}, debriefs = [], weightBalance = null }) {
  const oxygenWeightLb = oxygenSystemWeightLb(oxygen);
  const results = ALTITUDES_FT.map((altitudeFt) => calculateAtAltitude({
    plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, reserveMinutes, calibration, powerSetting,
  }));
  results.forEach((item) => {
    item.feasibility = assessFeasibility(item, { plan, fuelOnboardGal });
    item.icing = calculateIcingRisk({ plan, result: item });
    item.turbulence = calculateTurbulenceRisk({ plan, result: item });
    item.oxygen = calculateOxygenPlan({ result: item, oxygen });
    item.weightBalance = weightBalance ? calculateWeightBalance({
      weightBalance,
      fuelOnboardGal,
      landingFuelGal: Math.max(0, fuelOnboardGal - PERFORMANCE.taxiFuelGal - item.tripFuelGal),
      oxygenWeightLb,
    }) : null;
    item.confidence = calculatePerformanceConfidence({ plan, result: item, calibration, debriefs, mode });
    item.missionRisk = calculateMissionRisk({ result: item, confidence: item.confidence });
  });
  const fuels = results.map((item) => item.fuelRequiredGal);
  const times = results.map((item) => item.tripTimeHr);
  const ranges = results.map((item) => item.maxRangeNm);
  results.forEach((item) => {
    const baseScore = 100 * (
      normalize(fuels, item.fuelRequiredGal, true) * 0.42 +
      normalize(times, item.tripTimeHr, true) * 0.33 +
      normalize(ranges, item.maxRangeNm) * 0.25
    );
    const feasibilityPenalty = item.feasibility.status === "unavailable" ? 50 : item.feasibility.status === "marginal" ? 8 : 0;
    item.performanceScore = Math.max(0, Math.round(baseScore - feasibilityPenalty));
    item.score = Math.max(0, Math.round(item.performanceScore - item.icing.penalty - item.turbulence.penalty - item.oxygen.penalty - (item.weightBalance?.penalty || 0)));
  });

  const available = results.filter((item) => item.feasibility.status !== "unavailable" && item.weightBalance?.status !== "unavailable");
  const weatherAvailable = available.filter((item) => item.icing.status !== "avoid" && item.turbulence.status !== "severe" && item.oxygen.status !== "insufficient");
  const icingRank = { low: 0, watch: 1, caution: 2, avoid: 3 };
  const turbulenceRank = { smooth: 0, light: 1, moderate: 2, severe: 3 };
  const riskRank = (item) => Math.max(icingRank[item.icing.status], turbulenceRank[item.turbulence.status]);
  const hasWeatherEvidence = weatherAvailable.some((item) => item.icing.confidence === "weather" || item.turbulence.confidence !== "limited");
  const safestRank = weatherAvailable.length ? Math.min(...weatherAvailable.map(riskRank)) : 3;
  const weatherWinnerPool = hasWeatherEvidence
    ? weatherAvailable.filter((item) => riskRank(item) === safestRank)
    : weatherAvailable;
  const winnerPool = weatherWinnerPool.length ? weatherWinnerPool : available.length ? available : results;
  const performancePool = available.length ? available : results;
  const performanceWinner = [...performancePool].sort((a, b) => b.performanceScore - a.performanceScore)[0];
  const overallWinner = [...winnerPool].sort((a, b) => b.score - a.score)[0];
  const winners = {
    overall: overallWinner,
    performance: performanceWinner,
    fuel: [...winnerPool].sort((a, b) => a.fuelRequiredGal - b.fuelRequiredGal)[0],
    fastest: [...winnerPool].sort((a, b) => a.tripTimeHr - b.tripTimeHr)[0],
    range: [...winnerPool].sort((a, b) => b.maxRangeNm - a.maxRangeNm)[0],
  };
  return {
    results,
    winners,
    icing: {
      acceptableCount: weatherAvailable.length,
      hasAcceptableProfile: weatherAvailable.length > 0,
      confidence: hasWeatherEvidence ? "weather" : "limited",
      cost: {
        changedAltitude: overallWinner.altitudeFt !== performanceWinner.altitudeFt,
        fuelGal: overallWinner.fuelRequiredGal - performanceWinner.fuelRequiredGal,
        timeHr: overallWinner.tripTimeHr - performanceWinner.tripTimeHr,
        gsKt: overallWinner.gsKt - performanceWinner.gsKt,
        rangeNm: overallWinner.maxRangeNm - performanceWinner.maxRangeNm,
      },
    },
    turbulence: {
      acceptableCount: results.filter((item) => item.turbulence.status !== "severe").length,
      confidence: results.some((item) => item.turbulence.confidence !== "limited") ? "weather" : "limited",
    },
    oxygen: {
      installedWeightLb: oxygenWeightLb,
      acceptableCount: results.filter((item) => item.oxygen.status !== "insufficient").length,
    },
    weightBalance: {
      acceptableCount: results.filter((item) => item.weightBalance?.status !== "unavailable").length,
      status: overallWinner.weightBalance?.status || "unknown",
    },
    feasibility: {
      availableCount: available.length,
      viableCount: results.filter((item) => item.feasibility.status === "viable").length,
      marginalCount: results.filter((item) => item.feasibility.status === "marginal").length,
      unavailableCount: results.filter((item) => item.feasibility.status === "unavailable").length,
    },
  };
}

function fuelUsedToDistance(result, distanceNm) {
  if (distanceNm <= 0) return PERFORMANCE.taxiFuelGal;
  if (distanceNm <= result.climb.distanceNm) {
    const ratio = clamp(distanceNm / Math.max(1, result.climb.distanceNm), 0, 1);
    return PERFORMANCE.taxiFuelGal + result.climb.fuelGal * ratio;
  }
  const cruiseDistanceNm = Math.min(result.cruiseDistanceNm, Math.max(0, distanceNm - result.climb.distanceNm));
  return PERFORMANCE.taxiFuelGal + result.climb.fuelGal + cruiseDistanceNm / result.gsKt * result.fuelFlowGph;
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

export function calculateAlternateDiversion({
  plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {},
  waypointIndex = 0, manual = null,
}) {
  const result = calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, reserveMinutes, calibration, powerSetting });
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

export function compareScenarios({ plan, scenarioA, scenarioB, calibration = {} }) {
  const calculate = (scenario) => {
    const result = calculateAtAltitude({ plan, calibration, ...scenario });
    result.feasibility = assessFeasibility(result, { plan, fuelOnboardGal: scenario.fuelOnboardGal });
    return result;
  };
  const a = calculate(scenarioA);
  const b = calculate(scenarioB);
  return {
    a,
    b,
    delta: {
      fuelGal: b.fuelRequiredGal - a.fuelRequiredGal,
      timeHr: b.tripTimeHr - a.tripTimeHr,
      gsKt: b.gsKt - a.gsKt,
      marginGal: b.feasibility.fuelMarginGal - a.feasibility.fuelMarginGal,
    },
  };
}

export function calculateLoadOptimization({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {}, oxygen = {}, weightBalance = null, minimumPayloadLb = null, requireWeightBalanceViable = false }) {
  const requestedPayloadLb = Math.max(0, payloadLb);
  const payloadFloorLb = Number.isFinite(minimumPayloadLb)
    ? Math.min(requestedPayloadLb, Math.max(0, minimumPayloadLb))
    : weightBalance ? Math.ceil(normalizeWeightBalance(weightBalance).pilot / 10) * 10 : 0;
  const oxygenWeightLb = oxygenSystemWeightLb(oxygen);
  const currentWeightLb = AIRCRAFT.emptyWeightLb + requestedPayloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
  const payloadStepLb = 10;
  let bestAttempt = null;
  const payloadCandidates = [requestedPayloadLb];
  for (let candidatePayloadLb = Math.floor((requestedPayloadLb - 0.001) / payloadStepLb) * payloadStepLb; candidatePayloadLb > payloadFloorLb; candidatePayloadLb -= payloadStepLb) {
    payloadCandidates.push(candidatePayloadLb);
  }
  if (payloadFloorLb < requestedPayloadLb) payloadCandidates.push(payloadFloorLb);

  for (const candidatePayloadLb of [...new Set(payloadCandidates)]) {
    let candidateFuelGal = clamp(fuelOnboardGal, 0, AIRCRAFT.usableFuelGal);
    let rawRecommendedFuelGal = candidateFuelGal;

    for (let index = 0; index < 8; index += 1) {
      const iteration = calculateAtAltitude({
        plan,
        altitudeFt,
        mode,
        payloadLb: candidatePayloadLb,
        fuelOnboardGal: candidateFuelGal,
        oxygenWeightLb,
        reserveMinutes,
        calibration,
        powerSetting: { type: "AUTO" },
      });
      rawRecommendedFuelGal = Math.ceil(
        (iteration.fuelRequiredGal + PERFORMANCE.loadOptimizer.targetFuelMarginGal) / PERFORMANCE.loadOptimizer.fuelIncrementGal,
      ) * PERFORMANCE.loadOptimizer.fuelIncrementGal;
      const nextFuelGal = Math.min(AIRCRAFT.usableFuelGal, rawRecommendedFuelGal);
      if (Math.abs(nextFuelGal - candidateFuelGal) < 0.01) break;
      candidateFuelGal = nextFuelGal;
    }

    const recommendedFuelGal = Math.min(AIRCRAFT.usableFuelGal, rawRecommendedFuelGal);
    const result = calculateAtAltitude({
      plan,
      altitudeFt,
      mode,
      payloadLb: candidatePayloadLb,
      fuelOnboardGal: recommendedFuelGal,
      oxygenWeightLb,
      reserveMinutes,
      calibration,
      powerSetting: { type: "AUTO" },
    });
    result.feasibility = assessFeasibility(result, { plan, fuelOnboardGal: recommendedFuelGal });
    result.icing = calculateIcingRisk({ plan, result });
    result.turbulence = calculateTurbulenceRisk({ plan, result });
    result.oxygen = calculateOxygenPlan({ result, oxygen });
    const candidateWeightBalance = weightBalance ? scaleWeightBalanceToPayload(weightBalance, candidatePayloadLb) : null;
    result.weightBalance = candidateWeightBalance ? calculateWeightBalance({
      weightBalance: candidateWeightBalance,
      fuelOnboardGal: recommendedFuelGal,
      landingFuelGal: Math.max(0, recommendedFuelGal - PERFORMANCE.taxiFuelGal - result.tripFuelGal),
      oxygenWeightLb,
    }) : null;
    const optimizedWeightLb = AIRCRAFT.emptyWeightLb + candidatePayloadLb + recommendedFuelGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
    const weightMarginLb = AIRCRAFT.maxGrossWeightLb - optimizedWeightLb;
    const maxFuelByWeightGal = clamp(
      (AIRCRAFT.maxGrossWeightLb - PERFORMANCE.loadOptimizer.targetWeightMarginLb - AIRCRAFT.emptyWeightLb - oxygenWeightLb - candidatePayloadLb) / AIRCRAFT.fuelDensityLbGal,
      0,
      AIRCRAFT.usableFuelGal,
    );
    const candidate = {
      feasible: rawRecommendedFuelGal <= AIRCRAFT.usableFuelGal
        && weightMarginLb >= PERFORMANCE.loadOptimizer.targetWeightMarginLb
        && result.feasibility.status === "viable"
        && result.icing.status !== "avoid"
        && result.turbulence.status !== "severe"
        && result.oxygen.status !== "insufficient"
        && (requireWeightBalanceViable ? result.weightBalance?.status === "viable" : result.weightBalance?.status !== "unavailable"),
      altitudeFt,
      mode,
      result,
      recommendedFuelGal,
      rawRecommendedFuelGal,
      maxFuelByWeightGal,
      maxPayloadLb: Math.max(0, AIRCRAFT.maxGrossWeightLb - AIRCRAFT.emptyWeightLb - oxygenWeightLb - recommendedFuelGal * AIRCRAFT.fuelDensityLbGal),
      recommendedPayloadLb: candidatePayloadLb,
      payloadReductionLb: Math.max(0, requestedPayloadLb - candidatePayloadLb),
      currentWeightLb,
      optimizedWeightLb,
      weightMarginLb,
      weightBalance: candidateWeightBalance,
    };
    bestAttempt = candidate;
    if (candidate.feasible) return candidate;
  }

  return bestAttempt;
}

export function calculateModeLoadOptimization({ plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {}, oxygen = {}, weightBalance = null, minimumPayloadLb = null, requireWeightBalanceViable = false }) {
  const candidates = ALTITUDES_FT.map((altitudeFt) => calculateLoadOptimization({
    plan,
    altitudeFt,
    mode,
    payloadLb,
    fuelOnboardGal,
    reserveMinutes,
    calibration,
    oxygen,
    weightBalance,
    minimumPayloadLb,
    requireWeightBalanceViable,
  }));
  const viable = candidates.filter((candidate) => candidate?.feasible);
  if (!viable.length) {
    const bestAttempt = [...candidates].filter(Boolean).sort((a, b) => a.rawRecommendedFuelGal - b.rawRecommendedFuelGal)[0];
    return { ...bestAttempt, feasible: false, recommendedAltitudeFt: bestAttempt?.altitudeFt ?? null, candidates };
  }

  const icingRank = { low: 0, watch: 1, caution: 2, avoid: 3 };
  const turbulenceRank = { smooth: 0, light: 1, moderate: 2, severe: 3 };
  const riskRank = (candidate) => Math.max(icingRank[candidate.result.icing.status], turbulenceRank[candidate.result.turbulence.status]);
  const hasWeatherEvidence = viable.some((candidate) => candidate.result.icing.confidence === "weather" || candidate.result.turbulence.confidence !== "limited");
  const safestRank = Math.min(...viable.map(riskRank));
  const weatherPool = hasWeatherEvidence ? viable.filter((candidate) => riskRank(candidate) === safestRank) : viable;
  const maximumRetainedPayloadLb = Math.max(...weatherPool.map((candidate) => candidate.recommendedPayloadLb));
  const payloadPool = weatherPool.filter((candidate) => candidate.recommendedPayloadLb === maximumRetainedPayloadLb);
  const fuels = payloadPool.map((candidate) => candidate.result.fuelRequiredGal);
  const times = payloadPool.map((candidate) => candidate.result.tripTimeHr);
  const ranges = payloadPool.map((candidate) => candidate.result.maxRangeNm);
  payloadPool.forEach((candidate) => {
    candidate.optimizationScore = 100 * (
      normalize(fuels, candidate.result.fuelRequiredGal, true) * 0.42
      + normalize(times, candidate.result.tripTimeHr, true) * 0.33
      + normalize(ranges, candidate.result.maxRangeNm) * 0.25
    ) - candidate.result.icing.penalty - candidate.result.turbulence.penalty - candidate.result.oxygen.penalty;
  });
  const winner = [...payloadPool].sort((a, b) => b.optimizationScore - a.optimizationScore)[0];
  return { ...winner, recommendedAltitudeFt: winner.altitudeFt, candidates };
}

export function calculateMissionOptimization({ plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {}, oxygen = {}, weightBalance = null }) {
  const loads = normalizeWeightBalance(weightBalance || {});
  const occupiedPayloadLb = loads.pilot + loads.copilot + loads.rearLeft + loads.rearCenter + loads.rearRight;
  const currentBottles = clamp(Math.round(Number(oxygen.bottles) || 0), 0, 4);
  const variants = [];
  for (let bottles = currentBottles; bottles <= 4; bottles += 1) {
    const oxygenVariant = { ...oxygen, bottles };
    const candidate = calculateModeLoadOptimization({
      plan,
      mode,
      payloadLb,
      fuelOnboardGal,
      reserveMinutes,
      calibration,
      oxygen: oxygenVariant,
      weightBalance,
      minimumPayloadLb: occupiedPayloadLb,
      requireWeightBalanceViable: true,
    });
    if (candidate) variants.push({ ...candidate, oxygen: oxygenVariant, bottles });
  }
  const viable = variants.filter((candidate) => candidate.feasible);
  const operationalPenalty = (candidate) => {
    const result = candidate.result;
    return (result.icing.status === "low" ? 0 : result.icing.status === "watch" ? 1 : result.icing.status === "caution" ? 3 : 20)
      + (result.turbulence.status === "smooth" || result.turbulence.status === "light" ? 0 : result.turbulence.status === "moderate" ? 3 : 20)
      + (result.oxygen.status === "not-required" || result.oxygen.status === "compliant" ? 0 : result.oxygen.status === "marginal" ? 3 : 20)
      + (result.weightBalance?.status === "viable" ? 0 : 20);
  };
  const ranked = [...viable].sort((a, b) =>
    b.recommendedPayloadLb - a.recommendedPayloadLb
    || operationalPenalty(a) - operationalPenalty(b)
    || (b.optimizationScore || 0) - (a.optimizationScore || 0)
    || a.bottles - b.bottles);
  const winner = ranked[0];
  if (!winner) {
    const bestAttempt = [...variants].filter((candidate) => candidate.result).sort((a, b) =>
      (a.rawRecommendedFuelGal || Infinity) - (b.rawRecommendedFuelGal || Infinity)
      || b.recommendedPayloadLb - a.recommendedPayloadLb)[0];
    return {
      ...(bestAttempt || {}),
      feasible: false,
      achievedStatus: "unavailable",
      occupiedPayloadLb,
      variants,
    };
  }
  const result = winner.result;
  const marginal = result.feasibility.status === "marginal"
    || result.icing.status === "watch"
    || result.icing.status === "caution"
    || result.turbulence.status === "moderate"
    || result.oxygen.status === "marginal"
    || result.weightBalance?.status === "marginal";
  return {
    ...winner,
    feasible: true,
    achievedStatus: marginal ? "marginal" : "viable",
    occupiedPayloadLb,
    recommendedBottleCount: winner.bottles,
    variants,
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

export function calculateEtpPnr({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {} }) {
  const result = calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, oxygenWeightLb, reserveMinutes, calibration, powerSetting });
  const outboundGsKt = result.gsKt;
  const returnGsKt = clamp(result.tasKt - result.weather.componentKt, 110, 360);
  const etpDistanceNm = plan.distanceNm * returnGsKt / (outboundGsKt + returnGsKt);
  const etpCruiseDistanceNm = Math.max(0, etpDistanceNm - result.climb.distanceNm);
  const etpFuelUsedGal = PERFORMANCE.taxiFuelGal + result.climb.fuelGal + etpCruiseDistanceNm / outboundGsKt * result.fuelFlowGph;
  const usableCruiseFuelGal = Math.max(0, fuelOnboardGal - PERFORMANCE.taxiFuelGal - result.reserveFuelGal - result.climb.fuelGal - result.descent.fuelGal);
  const pnrDistanceRawNm = usableCruiseFuelGal / result.fuelFlowGph * outboundGsKt * returnGsKt / (outboundGsKt + returnGsKt);
  const pnrDistanceNm = clamp(pnrDistanceRawNm + result.climb.distanceNm, 0, plan.distanceNm);
  const pnrBeyondDestination = pnrDistanceRawNm + result.climb.distanceNm >= plan.distanceNm;
  const fuelUsedToPnrGal = PERFORMANCE.taxiFuelGal + result.climb.fuelGal + Math.max(0, pnrDistanceNm - result.climb.distanceNm) / outboundGsKt * result.fuelFlowGph;
  return {
    etp: {
      distanceNm: etpDistanceNm,
      fraction: clamp(etpDistanceNm / plan.distanceNm, 0, 1),
      elapsedHr: result.climb.timeHr + etpCruiseDistanceNm / outboundGsKt,
      fuelRemainingGal: Math.max(0, fuelOnboardGal - etpFuelUsedGal),
      waypoint: nearestWaypoint(plan, etpDistanceNm),
    },
    pnr: {
      distanceNm: pnrDistanceNm,
      rawDistanceNm: pnrDistanceRawNm + result.climb.distanceNm,
      fraction: clamp(pnrDistanceNm / plan.distanceNm, 0, 1),
      elapsedHr: result.climb.timeHr + Math.max(0, pnrDistanceNm - result.climb.distanceNm) / outboundGsKt,
      fuelRemainingGal: Math.max(0, fuelOnboardGal - fuelUsedToPnrGal),
      beyondDestination: pnrBeyondDestination,
      waypoint: nearestWaypoint(plan, pnrDistanceNm),
    },
    outboundGsKt,
    returnGsKt,
  };
}

export function calculateStepClimbs({
  plan, mode, payloadLb, fuelOnboardGal, oxygenWeightLb = 0, reserveMinutes, calibration = {}, powerSetting = {}, initialAltitudeFt,
  manual = null,
}) {
  const startDistanceNm = clamp(Number(manual?.distanceNm) || 0, 0, plan.distanceNm);
  const startFuelGal = clamp(Number(manual?.fuelRemainingGal) || fuelOnboardGal, 0, AIRCRAFT.usableFuelGal);
  const startingAltitudeFt = Number(manual?.altitudeFt) || initialAltitudeFt;
  let currentAltitudeFt = startingAltitudeFt;
  let currentFuelGal = startFuelGal;
  let currentDistanceNm = startDistanceNm;
  const startWeightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal + oxygenWeightLb;
  const candidates = (plan.waypoints || [])
    .map((point) => ({ ...point, distanceNm: Number(point.distanceNm) }))
    .filter((point) => Number.isFinite(point.distanceNm) && point.distanceNm > startDistanceNm + 5 && point.distanceNm < plan.distanceNm - 10)
    .sort((a, b) => a.distanceNm - b.distanceNm);
  const steps = [];

  for (const point of candidates) {
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
    const candidate = cruiseSnapshot({ plan, altitudeFt: candidateAltitudeFt, mode, payloadLb, fuelOnboardGal: currentFuelGal, oxygenWeightLb, calibration, powerSetting });
    const remainingNm = plan.distanceNm - currentDistanceNm;
    const deltaAltitudeFt = candidateAltitudeFt - currentAltitudeFt;
    const candidateWeather = averageRouteWeather(plan, candidateAltitudeFt);
    const stepClimb = climbProfile(candidateAltitudeFt, weightLb, candidateWeather, "enrouteClimb");
    const climbRateFpm = Math.max(550, stepClimb.rateFpm);
    const stepTimeHr = deltaAltitudeFt / climbRateFpm / 60;
    const stepDistanceNm = stepTimeHr * PERFORMANCE.climbSpeedKt;
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
    if (steps.length >= PERFORMANCE.stepClimb.maximumSteps) break;
  }

  return {
    startDistanceNm,
    startFuelGal,
    initialAltitudeFt: startingAltitudeFt,
    steps,
    next: steps[0] || null,
  };
}

export function deriveCalibration({ plan, mode, payloadLb, fuelRemainingGal, oxygenWeightLb = 0, altitudeFt, observedTasKt, observedFuelFlowGph, positionFix = null, powerSetting = {} }) {
  const baseline = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal: fuelRemainingGal, oxygenWeightLb, calibration: {}, powerSetting });
  const localWeather = positionFix ? weatherAtAltitude(positionFix, altitudeFt) : baseline.weather;
  const localIsaDeviationC = localWeather.oatC - isaTemperatureC(altitudeFt);
  const localTasKt = baseline.tasKt + (localIsaDeviationC - baseline.weather.isaDeviationC) * PERFORMANCE.isaTasGainKtPerC;
  return {
    tasFactor: clamp(observedTasKt / localTasKt, ...PERFORMANCE.calibrationLimits.tasFactor),
    fuelFlowFactor: clamp(observedFuelFlowGph / baseline.fuelFlowGph, ...PERFORMANCE.calibrationLimits.fuelFlowFactor),
  };
}
