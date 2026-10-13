import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT } from "./config.js?v=20261013-3";

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

function calibrationForMode(calibration, mode) {
  const values = calibration?.[mode] || calibration || {};
  return {
    tasFactor: clamp(Number(values.tasFactor) || 1, ...PERFORMANCE.calibrationLimits.tasFactor),
    fuelFlowFactor: clamp(Number(values.fuelFlowFactor) || 1, ...PERFORMANCE.calibrationLimits.fuelFlowFactor),
  };
}

export function cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, calibration = {} }) {
  const modeData = PERFORMANCE.modes[mode];
  const factors = calibrationForMode(calibration, mode);
  const weightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal;
  const weather = averageRouteWeather(plan, altitudeFt);
  const weightPenalty = ((weightLb - PERFORMANCE.referenceWeightLb) / 100) * PERFORMANCE.weightTasPenaltyKtPer100Lb;
  const altitudeGain = ((altitudeFt - 10000) / 1000) * PERFORMANCE.altitudeTasGainKtPer1000Ft;
  const turboCeilingPenalty = Math.max(0, altitudeFt - AIRCRAFT.criticalAltitudeFt) / 1000 * 2.8;
  const baseTasKt = modeData.tasAt10kKt + altitudeGain - weightPenalty + weather.isaDeviationC * PERFORMANCE.isaTasGainKtPerC - turboCeilingPenalty;
  const tasKt = baseTasKt * factors.tasFactor;
  return {
    altitudeFt,
    weightLb,
    weather,
    tasKt,
    gsKt: clamp(tasKt + weather.componentKt, 110, 360),
    returnGsKt: clamp(tasKt - weather.componentKt, 110, 360),
    fuelFlowGph: modeData.fuelFlowGph * factors.fuelFlowFactor,
    factors,
  };
}

function descentProfile(altitudeFt) {
  const timeHr = altitudeFt / PERFORMANCE.descentRateFpm / 60;
  return { timeHr, distanceNm: timeHr * PERFORMANCE.descentSpeedKt, fuelGal: timeHr * PERFORMANCE.descentFuelFlowGph };
}

export function calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {} }) {
  const takeoffWeightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal;
  const cruise = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, calibration });
  const { weather, tasKt, gsKt, fuelFlowGph } = cruise;

  const climb = climbProfile(altitudeFt, takeoffWeightLb);
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

export function calculatePlan({ plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {} }) {
  const results = ALTITUDES_FT.map((altitudeFt) => calculateAtAltitude({
    plan, altitudeFt, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration,
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

function nearestWaypoint(plan, distanceNm) {
  const points = plan.waypoints || [];
  if (!points.length) return { ident: "—", distanceNm };
  return points.reduce((best, point) => {
    const pointDistance = Number(point.distanceNm);
    if (!Number.isFinite(pointDistance)) return best;
    return Math.abs(pointDistance - distanceNm) < Math.abs((Number(best.distanceNm) || 0) - distanceNm) ? point : best;
  }, points[0]);
}

export function calculateEtpPnr({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {} }) {
  const result = calculateAtAltitude({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration });
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
  plan, mode, payloadLb, fuelOnboardGal, reserveMinutes, calibration = {}, initialAltitudeFt,
  manual = null,
}) {
  const startDistanceNm = clamp(Number(manual?.distanceNm) || 0, 0, plan.distanceNm);
  const startFuelGal = clamp(Number(manual?.fuelRemainingGal) || fuelOnboardGal, 0, AIRCRAFT.usableFuelGal);
  const startingAltitudeFt = Number(manual?.altitudeFt) || initialAltitudeFt;
  let currentAltitudeFt = startingAltitudeFt;
  let currentFuelGal = startFuelGal;
  let currentDistanceNm = startDistanceNm;
  const startWeightLb = AIRCRAFT.emptyWeightLb + payloadLb + fuelOnboardGal * AIRCRAFT.fuelDensityLbGal;
  const candidates = (plan.waypoints || [])
    .map((point) => ({ ...point, distanceNm: Number(point.distanceNm) }))
    .filter((point) => Number.isFinite(point.distanceNm) && point.distanceNm > startDistanceNm + 5 && point.distanceNm < plan.distanceNm - 10)
    .sort((a, b) => a.distanceNm - b.distanceNm);
  const steps = [];

  for (const point of candidates) {
    const current = cruiseSnapshot({ plan, altitudeFt: currentAltitudeFt, mode, payloadLb, fuelOnboardGal: currentFuelGal, calibration });
    const segmentNm = point.distanceNm - currentDistanceNm;
    currentFuelGal = Math.max(0, currentFuelGal - segmentNm / current.gsKt * current.fuelFlowGph);
    currentDistanceNm = point.distanceNm;
    const weightLb = AIRCRAFT.emptyWeightLb + payloadLb + currentFuelGal * AIRCRAFT.fuelDensityLbGal;
    const weightLossLb = startWeightLb - weightLb;
    const unlockedSteps = Math.floor(weightLossLb / PERFORMANCE.stepClimb.weightLossLbPerStep);
    const targetAltitudeFt = Math.min(AIRCRAFT.serviceCeilingFt, startingAltitudeFt + unlockedSteps * 2000);
    if (targetAltitudeFt < currentAltitudeFt + 2000 || plan.distanceNm - currentDistanceNm < PERFORMANCE.stepClimb.minimumRemainingNm) continue;

    const candidateAltitudeFt = Math.min(targetAltitudeFt, currentAltitudeFt + 2000);
    const candidate = cruiseSnapshot({ plan, altitudeFt: candidateAltitudeFt, mode, payloadLb, fuelOnboardGal: currentFuelGal, calibration });
    const remainingNm = plan.distanceNm - currentDistanceNm;
    const deltaAltitudeFt = candidateAltitudeFt - currentAltitudeFt;
    const climbRateFpm = Math.max(650, climbProfile(candidateAltitudeFt, weightLb).rateFpm);
    const stepTimeHr = deltaAltitudeFt / climbRateFpm / 60;
    const stepDistanceNm = stepTimeHr * PERFORMANCE.climbSpeedKt;
    const stayFuelGal = remainingNm / current.gsKt * current.fuelFlowGph;
    const stepFuelGal = stepTimeHr * PERFORMANCE.climbFuelFlowGph + Math.max(0, remainingNm - stepDistanceNm) / candidate.gsKt * candidate.fuelFlowGph;
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

export function deriveCalibration({ plan, mode, payloadLb, fuelRemainingGal, altitudeFt, observedTasKt, observedFuelFlowGph, positionFix = null }) {
  const baseline = cruiseSnapshot({ plan, altitudeFt, mode, payloadLb, fuelOnboardGal: fuelRemainingGal, calibration: {} });
  const localWeather = positionFix ? weatherAtAltitude(positionFix, altitudeFt) : baseline.weather;
  const localIsaDeviationC = localWeather.oatC - isaTemperatureC(altitudeFt);
  const localTasKt = baseline.tasKt + (localIsaDeviationC - baseline.weather.isaDeviationC) * PERFORMANCE.isaTasGainKtPerC;
  return {
    tasFactor: clamp(observedTasKt / localTasKt, ...PERFORMANCE.calibrationLimits.tasFactor),
    fuelFlowFactor: clamp(observedFuelFlowGph / baseline.fuelFlowGph, ...PERFORMANCE.calibrationLimits.fuelFlowFactor),
  };
}
