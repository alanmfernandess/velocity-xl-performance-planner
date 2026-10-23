import { PERFORMANCE } from "../config.js?v=20261021-unified";
import { calculateIcingRisk, calculateTurbulenceRisk } from "../engine.js?v=20261021-unified";
import { weatherAt } from "./fusion.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const phaseMinutes = () => ({ climb: 0, cruise: 0, descent: 0 });
const vector = (dir, speed) => Number.isFinite(dir) && Number.isFinite(speed)
  ? { u: -speed * Math.sin(dir * Math.PI / 180), v: -speed * Math.cos(dir * Math.PI / 180) } : null;
const deltaWind = (a, b) => a && b ? Math.hypot(a.u - b.u, a.v - b.v) : null;

function groupSegments(samples, assessments) {
  const groups = new Map();
  samples.forEach((sample, index) => {
    const key = `${sample.from || "—"} → ${sample.to || "—"}`;
    const record = groups.get(key) || { from: sample.from, to: sample.to, startNm: sample.distanceNm,
      endNm: sample.distanceNm, minutes: 0, riskScore: 0, oatC: null, evidenceAvailable: false,
      coveredSamples: 0, totalSamples: 0, temperatureRelevant: false };
    const assessment = assessments[index];
    record.startNm = Math.min(record.startNm, sample.distanceNm);
    record.endNm = Math.max(record.endNm, sample.distanceNm);
    record.minutes += sample.minutes;
    record.riskScore = Math.max(record.riskScore, assessment.score || 0);
    if (Number.isFinite(assessment.oatC)) record.oatC = assessment.oatC;
    record.evidenceAvailable ||= assessment.covered;
    record.totalSamples += 1;
    if (assessment.covered) record.coveredSamples += 1;
    record.temperatureRelevant ||= assessment.temperatureRelevant;
    groups.set(key, record);
  });
  return [...groups.values()].map((segment) => ({ ...segment, riskScore: Math.round(segment.riskScore) }));
}

/** Exposure estimates are conditional model indicators, not icing probability. */
export function assessIceTrajectory({ plan, result, trajectory, weatherSnapshot }) {
  const baseline = calculateIcingRisk({ plan, result });
  const byPhase = phaseMinutes();
  let modelPeak = 0, covered = 0, explicit = false, unresolvedVertical = false, temperatureMinutes = 0;
  const coverageReasons = {}; const phaseCoverage = { climb: { covered: 0, total: 0 }, cruise: { covered: 0, total: 0 }, descent: { covered: 0, total: 0 } };
  const alternateAirport = plan.alternates?.[0];
  const alternatePoint = alternateAirport && trajectory.endMs !== null && Number.isFinite(alternateAirport.lat)
    && Number.isFinite(alternateAirport.lon) ? { lat: alternateAirport.lat, lon: alternateAirport.lon,
      altitudeFt: alternateAirport.elevationFt || 0,
      timestampMs: trajectory.endMs + PERFORMANCE.icing.alternateEtaOffsetMin * 60_000 } : null;
  const alternatePoints = [...(trajectory.alternateSamples || []), ...(alternatePoint ? [alternatePoint] : [])];
  const alternateWeather = alternatePoints.map((point) => ({ point, wx: weatherAt(weatherSnapshot, plan, point) }));
  const alternateEvidence = alternateWeather.flatMap(({ wx }) => wx.evidence.filter((item) => item.phenomenon === "ICE"));
  const alternateBlocking = alternateEvidence.some((item) => item.kind === "SIGMET" ? item.verticalKnown : item.intensity === "SEVERE");
  unresolvedVertical ||= alternateEvidence.some((item) => item.kind === "SIGMET" && !item.verticalKnown);
  const alternateAssessed = alternateWeather.filter(({ wx }) => wx.humidity !== null && wx.cloudCover !== null);
  const alternateModelPeak = alternateAssessed.reduce((peak, { wx }) => {
    const model = PERFORMANCE.icing.forecast;
    const moist = Math.max(wx.cloudCover / 100 * clamp((wx.humidity - model.humidityStartPct) / (100 - model.humidityStartPct), 0, 1),
      (wx.precipitationMm ?? 0) / model.precipitationSaturationMm * model.precipitationWeight);
    return wx.oatC !== null && wx.oatC >= PERFORMANCE.icing.coldBoundaryC && wx.oatC <= PERFORMANCE.icing.warmBoundaryC
      ? Math.max(peak, Math.round(model.maxHeuristicScore * clamp(moist, 0, 1))) : peak;
  }, 0);
  const alternateRisk = alternateBlocking ? 100 : Math.max(alternateModelPeak, alternateEvidence.length ? 70 : 0,
    baseline.alternate?.riskScore || 0);
  const assessments = trajectory.samples.map((point) => {
    const wx = weatherAt(weatherSnapshot, plan, point);
    const temperatureRelevant = wx.oatC !== null && wx.oatC >= PERFORMANCE.icing.coldBoundaryC && wx.oatC <= PERFORMANCE.icing.warmBoundaryC;
    const moistureKnown = wx.humidity !== null && wx.cloudCover !== null;
    const reported = wx.evidence.filter((item) => item.phenomenon === "ICE");
    const severeReport = reported.some((item) => item.kind === "SIGMET" ? item.verticalKnown : item.intensity === "SEVERE");
    unresolvedVertical ||= reported.some((item) => item.kind === "SIGMET" && !item.verticalKnown);
    explicit ||= severeReport;
    const cloud = moistureKnown ? clamp(wx.cloudCover / 100, 0, 1) : null;
    const model = PERFORMANCE.icing.forecast;
    const humidity = moistureKnown ? clamp((wx.humidity - model.humidityStartPct) / (100 - model.humidityStartPct), 0, 1) : null;
    const precipitation = wx.precipitationMm !== null ? clamp(wx.precipitationMm / model.precipitationSaturationMm, 0, 1) : 0;
    const modelScore = temperatureRelevant && moistureKnown
      ? Math.round(model.maxHeuristicScore * Math.max(cloud * humidity, precipitation * model.precipitationWeight)) : 0;
    const score = Math.max(modelScore, severeReport ? 100 : reported.length ? 70 : 0);
    const coveredSample = moistureKnown || reported.length > 0;
    if (coveredSample) covered += 1;
    if (phaseCoverage[point.phase]) { phaseCoverage[point.phase].total += 1; if (coveredSample) phaseCoverage[point.phase].covered += 1; }
    if (!coveredSample) { const reason = wx.provenance?.gfsStatus || "NO_MOISTURE_EVIDENCE"; coverageReasons[reason] = (coverageReasons[reason] || 0) + 1; }
    modelPeak = Math.max(modelPeak, score);
    if (temperatureRelevant) temperatureMinutes += point.minutes;
    if (score >= PERFORMANCE.icing.watchScore) byPhase[point.phase] += point.minutes;
    return { score, covered: coveredSample, oatC: wx.oatC, temperatureRelevant,
      evidence: reported, provenance: wx.provenance };
  });
  const riskScore = Math.max(baseline.riskScore || 0, modelPeak, alternateRisk);
  const blocking = explicit || alternateBlocking || baseline.status === "avoid";
  const status = blocking ? "avoid" : riskScore >= PERFORMANCE.icing.cautionScore ? "caution"
    : riskScore >= PERFORMANCE.icing.watchScore ? "watch" : "low";
  const coverage = trajectory.samples.length ? covered / trajectory.samples.length : 0;
  const modelAvailable = covered > 0;
  // A terminal TAF cannot establish moisture coverage for an unobserved
  // climb, cruise, descent, or diversion corridor.
  const routePhaseUnassessed = Object.values(phaseCoverage)
    .some(({ covered: phaseCovered, total }) => total > 0 && phaseCovered === 0);
  // terminalWeatherAtTime returns {sources, tafValid, metarAgeMinutes}, not metar/taf.
  // Validity has already been applied to sources. Never treat a raw outdated bulletin as evidence.
  const alternateTerminalWeather = baseline.alternate?.weather;
  const validAlternateTerminalEvidence = Array.isArray(alternateTerminalWeather?.sources)
    && alternateTerminalWeather.sources.some((source) => ["metar", "legacy", "prevailing", "temporary", "becoming", "probability", "prob", "tempo"].includes(source.kind)
      || Boolean(source.text) && source.weight > 0);
  const alternateCoverageInsufficient = Boolean(alternateAirport && trajectory.alternateSamples?.length
    && !alternateAssessed.length && !alternateEvidence.length);
  const compatibility = blocking ? "INCOMPATIBLE" : unresolvedVertical || alternateCoverageInsufficient || routePhaseUnassessed
    || !modelAvailable && baseline.confidence === "limited" ? "UNKNOWN"
    : status === "low" ? "LOW_EXPOSURE_ESTIMATED" : "CAUTION";
  return { ...baseline, status, riskScore, compatibility, blocking,
    confidence: routePhaseUnassessed ? "limited" : modelAvailable ? "estimated" : baseline.confidence,
    coverage, phaseCoverage, coverageReasons, alternateCoverage: { assessed: alternateAssessed.length, total: alternatePoints.length, terminalEvidence: Boolean(validAlternateTerminalEvidence) }, combinedCoverage: Math.max(coverage, baseline.combinedCoverage || 0),
    exposureMinutes: Math.max(baseline.exposureMinutes || 0, Object.values(byPhase).reduce((a, b) => a + b, 0)),
    climbExposureMinutes: Math.max(baseline.climbExposureMinutes || 0, byPhase.climb),
    cruiseExposureMinutes: Math.max(baseline.cruiseExposureMinutes || 0, byPhase.cruise),
    descentExposureMinutes: Math.max(baseline.descentExposureMinutes || 0, byPhase.descent),
    temperatureExposureMinutes: Math.max(baseline.temperatureExposureMinutes || 0, temperatureMinutes),
    segments: modelAvailable ? groupSegments(trajectory.samples, assessments) : baseline.segments,
    alternate: alternateAirport ? { ...(baseline.alternate || {}), ident: alternateAirport.icao || baseline.alternate?.ident || "—",
      status: alternateBlocking ? "avoid" : alternateCoverageInsufficient ? "unknown"
        : alternateRisk >= PERFORMANCE.icing.cautionScore ? "caution" : alternateRisk >= PERFORMANCE.icing.watchScore ? "watch" : "low",
      riskScore: alternateRisk, coverage: alternatePoints.length ? alternateAssessed.length / alternatePoints.length : 0,
      exposureMinutes: Math.max(baseline.alternate?.exposureMinutes || 0,
        (trajectory.alternateSamples || []).reduce((sum, point) => sum + (alternateRisk >= PERFORMANCE.icing.watchScore ? point.minutes : 0), 0)),
      weather: baseline.alternate?.weather || null, evidence: alternateEvidence } : baseline.alternate,
    trajectoryEvidence: [...assessments.filter((sample) => sample.evidence.length).flatMap((sample) => sample.evidence), ...alternateEvidence],
    limitations: [coverage < 1 ? "ICE_PARTIAL_COVERAGE" : null,
      routePhaseUnassessed ? "ICE_ROUTE_PHASE_NOT_ASSESSED" : null,
      alternateCoverageInsufficient ? "ALTERNATE_ICE_NOT_ASSESSED" : null,
      unresolvedVertical ? "ICE_SIGMET_VERTICAL_LIMIT_UNKNOWN" : null,
      "NUMERICAL_CLOUD_AND_HUMIDITY_DO_NOT_CONFIRM_SUPERCOOLED_LIQUID_WATER"].filter(Boolean) };
}

/** Shear/CAPE are discomfort proxies; only explicit severe reports are blockers. */
export function assessRideTrajectory({ plan, result, trajectory, weatherSnapshot }) {
  // SimBrief's `shear` unit is undocumented: omit it rather than mapping it
  // directly to severe turbulence. All other OFP evidence remains available.
  const noAmbiguousShear = { ...plan, waypoints: plan.waypoints?.map((fix) => ({ ...fix, shear: NaN })) };
  const baseline = calculateTurbulenceRisk({ plan: noAmbiguousShear, result });
  const byPhase = phaseMinutes();
  let peak = 0, covered = 0, reportedSevere = false, unresolvedVertical = false;
  let previous = null;
  const assessments = trajectory.samples.map((point) => {
    const wx = weatherAt(weatherSnapshot, plan, point);
    const lower = weatherAt(weatherSnapshot, plan, { ...point, altitudeFt: Math.max(0, point.altitudeFt - 1000) });
    const upper = weatherAt(weatherSnapshot, plan, { ...point, altitudeFt: point.altitudeFt + 1000 });
    const vertical = deltaWind(vector(lower.windDir, lower.windSpd), vector(upper.windDir, upper.windSpd));
    const horizontal = previous && point.distanceNm > previous.point.distanceNm
      ? deltaWind(vector(wx.windDir, wx.windSpd), vector(previous.wx.windDir, previous.wx.windSpd))
        / Math.max(10, point.distanceNm - previous.point.distanceNm) * 50 : null;
    previous = { point, wx };
    const warnings = wx.evidence.filter((item) => item.phenomenon === "TURBULENCE" || item.phenomenon === "CONVECTION");
    unresolvedVertical ||= warnings.some((item) => item.kind === "SIGMET" && !item.verticalKnown);
    const explicitSevere = warnings.some((item) => item.kind === "SIGMET" && !item.verticalKnown ? false
      : item.intensity === "SEVERE" || item.phenomenon === "CONVECTION" && item.kind === "SIGMET");
    reportedSevere ||= explicitSevere;
    const known = vertical !== null || horizontal !== null || wx.cape !== null || wx.verticalVelocity !== null || warnings.length > 0;
    if (known) covered += 1;
    const model = PERFORMANCE.turbulence.forecast;
    const shearIndex = Math.max(vertical === null ? 0 : vertical / model.verticalShearScaleKt * model.verticalShearScore,
      horizontal === null ? 0 : horizontal / model.horizontalShearScaleKt * model.horizontalShearScore);
    const convectiveIndex = Math.max(wx.cape === null ? 0 : clamp(wx.cape / model.capeScale * model.capeScore, 0, 55),
      wx.verticalVelocity === null ? 0 : clamp(Math.abs(wx.verticalVelocity) / model.verticalVelocityScale * model.verticalVelocityScore, 0, 40));
    const score = Math.round(Math.max(Math.min(model.maximumShearScore, shearIndex), convectiveIndex,
      explicitSevere ? 90 : warnings.length ? 55 : 0));
    peak = Math.max(peak, score);
    if (score >= PERFORMANCE.turbulence.lightScore) byPhase[point.phase] += point.minutes;
    return { score, covered: known, oatC: wx.oatC, temperatureRelevant: false,
      evidence: warnings, provenance: wx.provenance };
  });
  const alternateAssessments = (trajectory.alternateSamples || []).map((point) => {
    const wx = weatherAt(weatherSnapshot, plan, point);
    const lower = weatherAt(weatherSnapshot, plan, { ...point, altitudeFt: Math.max(0, point.altitudeFt - 1000) });
    const upper = weatherAt(weatherSnapshot, plan, { ...point, altitudeFt: point.altitudeFt + 1000 });
    const shear = deltaWind(vector(lower.windDir, lower.windSpd), vector(upper.windDir, upper.windSpd));
    const warnings = wx.evidence.filter((item) => item.phenomenon === "TURBULENCE" || item.phenomenon === "CONVECTION");
    unresolvedVertical ||= warnings.some((item) => item.kind === "SIGMET" && !item.verticalKnown);
    const severe = warnings.some((item) => item.kind === "SIGMET" && !item.verticalKnown ? false
      : item.intensity === "SEVERE" || item.phenomenon === "CONVECTION" && item.kind === "SIGMET");
    const model = PERFORMANCE.turbulence.forecast;
    const score = Math.round(Math.max(severe ? 90 : warnings.length ? 55 : 0,
      shear === null ? 0 : Math.min(model.maximumShearScore, shear / model.verticalShearScaleKt * model.verticalShearScore),
      wx.cape === null ? 0 : clamp(wx.cape / model.capeScale * model.capeScore, 0, 55),
      wx.verticalVelocity === null ? 0 : clamp(Math.abs(wx.verticalVelocity) / model.verticalVelocityScale * model.verticalVelocityScore, 0, 40)));
    reportedSevere ||= severe;
    peak = Math.max(peak, score);
    return { score, covered: shear !== null || wx.cape !== null || wx.verticalVelocity !== null || warnings.length > 0,
      evidence: warnings, minutes: point.minutes };
  });
  const riskScore = covered || baseline.riskScore !== null ? Math.max(peak, baseline.riskScore || 0) : null;
  const blocking = reportedSevere || baseline.blocking;
  const status = riskScore === null ? "unknown" : blocking ? "severe"
    : riskScore >= PERFORMANCE.turbulence.moderateScore ? "moderate"
      : riskScore >= PERFORMANCE.turbulence.lightScore ? "light" : "smooth";
  const coverage = trajectory.samples.length ? covered / trajectory.samples.length : 0;
  return { ...baseline, status, riskScore, blocking,
    confidence: unresolvedVertical ? "limited" : covered ? "estimated" : baseline.confidence,
    coverage: Math.max(coverage, baseline.coverage || 0),
    exposureMinutes: Math.max(baseline.exposureMinutes || 0, Object.values(byPhase).reduce((a, b) => a + b, 0))
      + alternateAssessments.reduce((sum, sample) => sum + (sample.score >= PERFORMANCE.turbulence.lightScore ? sample.minutes : 0), 0),
    phaseExposureMinutes: Object.fromEntries(Object.keys(byPhase).map((phase) => [phase,
      Math.max(baseline.phaseExposureMinutes?.[phase] || 0, byPhase[phase])])),
    segments: covered ? groupSegments(trajectory.samples, assessments).map((segment) => ({ ...segment,
      exposureMinutes: segment.riskScore >= PERFORMANCE.turbulence.lightScore ? segment.minutes : 0,
      status: segment.riskScore >= 75 ? "severe" : segment.riskScore >= 45 ? "moderate" : segment.riskScore >= 20 ? "light" : "smooth" })) : baseline.segments,
    alternate: alternateAssessments.length ? { riskScore: Math.max(...alternateAssessments.map((item) => item.score)),
      coverage: alternateAssessments.filter((item) => item.covered).length / alternateAssessments.length,
      exposureMinutes: alternateAssessments.reduce((sum, item) => sum + (item.score >= PERFORMANCE.turbulence.lightScore ? item.minutes : 0), 0),
      evidence: alternateAssessments.flatMap((item) => item.evidence) } : null,
    limitations: [coverage < 1 ? "RIDE_PARTIAL_COVERAGE" : null,
      unresolvedVertical ? "RIDE_SIGMET_VERTICAL_LIMIT_UNKNOWN" : null,
      "WIND_SHEAR_IS_NOT_OBSERVED_EDR", "SIMBRIEF_SHEAR_UNIT_UNVERIFIED"].filter(Boolean) };
}
