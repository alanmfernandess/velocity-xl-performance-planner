import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT } from "./config.js";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const toRad = (deg) => (deg * Math.PI) / 180;
export const toDeg = (rad) => (rad * 180) / Math.PI;

export function isaTemperatureC(altitudeFt) {
  return 15 - 1.9812 * (altitudeFt / 1000);
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

function averageRouteWeather(plan, altitudeFt) {
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
    const windDirCandidate = Number(from.windDir ?? to.windDir ?? 0);
    const windSpdCandidate = Number(from.windSpd ?? to.windSpd ?? 0);
    const oatCandidate = Number(from.oatC ?? to.oatC);
    const windDir = Number.isFinite(windDirCandidate) ? windDirCandidate : 0;
    const windSpd = Number.isFinite(windSpdCandidate) ? windSpdCandidate : 0;
    const oat = Number.isFinite(oatCandidate) ? oatCandidate : isaTemperatureC(altitudeFt);
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

function climbProfile(altitudeFt, weightLb) {
  const avgAltitudeRatio = altitudeFt / 2 / AIRCRAFT.serviceCeilingFt;
  const baseRate = PERFORMANCE.climbRate.seaLevelFpm -
    (PERFORMANCE.climbRate.seaLevelFpm - PERFORMANCE.climbRate.ceilingFpm) * avgAltitudeRatio;
  const weightFactor = 1 - ((weightLb - PERFORMANCE.referenceWeightLb) / 100) * PERFORMANCE.climbWeightFactorPer100Lb;
  const rateFpm = Math.max(650, baseRate * weightFactor);
  const timeHr = altitudeFt / rateFpm / 60;
  const distanceNm = timeHr * PERFORMANCE.climbSpeedKt;
  return { rateFpm, timeHr, distanceNm, fuelGal: timeHr * PERFORMANCE.climbFuelFlowGph };
}

function descentProfile(altitudeFt) {
  const timeHr = altitudeFt / PERFORMANCE.descentRateFpm / 60;
  return { timeHr, distanceNm: timeHr * PERFORMANCE.descentSpeedKt, fuelGal: timeHr * PERFORMANCE.descentFuelFlowGph };
}

export function calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, reserveMinutes }) {
  const modeData = PERFORMANCE.modes[mode];
  const takeoffWeightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal;
  const weather = averageRouteWeather(plan, altitudeFt);
  const weightPenalty = ((takeoffWeightLb - PERFORMANCE.referenceWeightLb) / 100) * PERFORMANCE.weightTasPenaltyKtPer100Lb;
  const altitudeGain = ((altitudeFt - 10000) / 1000) * PERFORMANCE.altitudeTasGainKtPer1000Ft;
  const turboCeilingPenalty = Math.max(0, altitudeFt - AIRCRAFT.criticalAltitudeFt) / 1000 * 2.8;
  const tasKt = modeData.tasAt10kKt + altitudeGain - weightPenalty + weather.isaDeviationC * PERFORMANCE.isaTasGainKtPerC - turboCeilingPenalty;
  const gsKt = clamp(tasKt + weather.componentKt, 110, 360);

  const climb = climbProfile(altitudeFt, takeoffWeightLb);
  const descent = descentProfile(altitudeFt);
  const cruiseDistanceNm = Math.max(0, plan.distanceNm - climb.distanceNm - descent.distanceNm);
  const cruiseTimeHr = cruiseDistanceNm / gsKt;
  const cruiseFuelGal = cruiseTimeHr * modeData.fuelFlowGph;
  const tripFuelGal = climb.fuelGal + cruiseFuelGal + descent.fuelGal;
  const tripTimeHr = climb.timeHr + cruiseTimeHr + descent.timeHr;
  const reserveFuelGal = (reserveMinutes / 60) * PERFORMANCE.modes.ECON.fuelFlowGph;
  const contingencyFuelGal = tripFuelGal * (PERFORMANCE.contingencyPercent / 100);
  const fuelRequiredGal = tripFuelGal + reserveFuelGal + contingencyFuelGal + PERFORMANCE.taxiFuelGal;
  const specificRangeNmGal = gsKt / modeData.fuelFlowGph;
  const usableForCruise = Math.max(0, AIRCRAFT.usableFuelGal - reserveFuelGal - PERFORMANCE.taxiFuelGal - climb.fuelGal - descent.fuelGal);
  const maxRangeNm = usableForCruise * specificRangeNmGal + climb.distanceNm + descent.distanceNm;
  const enduranceHr = AIRCRAFT.usableFuelGal / modeData.fuelFlowGph;

  return {
    altitudeFt,
    fl: Math.round(altitudeFt / 100),
    tasKt,
    gsKt,
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

export function calculatePlan({ plan, mode, payloadLb, fuelOnboardGal, reserveMinutes }) {
  const results = ALTITUDES_FT.map((altitudeFt) => calculateAtAltitude({
    plan, altitudeFt, mode, payloadLb, fuelOnboardGal, reserveMinutes,
  }));
  const fuels = results.map((item) => item.fuelRequiredGal);
  const times = results.map((item) => item.tripTimeHr);
  const ranges = results.map((item) => item.maxRangeNm);
  results.forEach((item) => {
    item.score = Math.round(100 * (
      normalize(fuels, item.fuelRequiredGal, true) * 0.42 +
      normalize(times, item.tripTimeHr, true) * 0.33 +
      normalize(ranges, item.maxRangeNm) * 0.25
    ));
  });

  const winners = {
    overall: [...results].sort((a, b) => b.score - a.score)[0],
    fuel: [...results].sort((a, b) => a.fuelRequiredGal - b.fuelRequiredGal)[0],
    fastest: [...results].sort((a, b) => a.tripTimeHr - b.tripTimeHr)[0],
    range: [...results].sort((a, b) => b.maxRangeNm - a.maxRangeNm)[0],
  };
  return { results, winners };
}
