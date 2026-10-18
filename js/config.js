export const AIRCRAFT = {
  name: "Black Square Velocity XL",
  engine: "Continental TSIO-550 EXP · Twin Turbo · ≈400 hp",
  emptyWeightLb: 1900,
  maxGrossWeightLb: 3000,
  usableFuelGal: 87,
  totalFuelGal: 92,
  fuelDensityLbGal: 6,
  criticalAltitudeFt: 24000,
  serviceCeilingFt: 25000,
  normalManifoldInHg: 29.6,
  maxManifoldInHg: 32,
  maxRpm: 2700,
  maxContinuousRpm: 2650,
  seats: 5,
  crewSeats: 2,
  pressurized: false,
};

// Full-system figures from the Aerox Sky-Ox portable system capacity table.
export const OXYGEN_CYLINDERS = {
  "SK-12-6": { label: "SK-12-6", capacityLiters: 164, fullWeightLb: 6, outlets: 4 },
  "SK-12-9": { label: "SK-12-9", capacityLiters: 248, fullWeightLb: 7, outlets: 4 },
  "SK-12-15": { label: "SK-12-15", capacityLiters: 415, fullWeightLb: 11, outlets: 4 },
  "SK-12-24": { label: "SK-12-24", capacityLiters: 682, fullWeightLb: 14, outlets: 4 },
  "SK-11-20": { label: "SK-11-20", capacityLiters: 566, fullWeightLb: 15, outlets: 4 },
  "SK-11-40": { label: "SK-11-40", capacityLiters: 1132, fullWeightLb: 28, outlets: 4 },
};

// Longitudinal arms use the Velocity XL owner's manual N97XL sample.
// The simulator's third rear passenger shares the rear bench arm.
// The 3,000 lb upper weight is the Black Square configuration; this remains
// an estimated simulator adaptation because each real experimental airframe
// requires its own measured empty CG and approved envelope.
export const WEIGHT_BALANCE = {
  emptyArmIn: 141.63,
  headerFuelGal: 4,
  armsIn: {
    pilot: 80,
    copilot: 80,
    rearLeft: 124,
    rearCenter: 124,
    rearRight: 124,
    baggage: 115,
    oxygen: 115,
    headerFuel: 145,
    mainFuel: 132,
  },
  envelope: {
    forwardCgIn: 127,
    aftCgIn: 134,
    minimumChartWeightLb: 1400,
    maximumWeightLb: 3000,
    marginalCgIn: 0.5,
    marginalWeightLb: 75,
  },
};

// Estimated coefficients are intentionally centralized for future manual calibration.
// They model the simulator aircraft—not a certified real-world POH.
export const PERFORMANCE = {
  referenceWeightLb: 2600,
  taxiFuelGal: 2.2,
  climbFuelFlowGph: 31.5,
  descentFuelFlowGph: 10.2,
  climbSpeedKt: 150,
  descentSpeedKt: 205,
  climbRate: { seaLevelFpm: 2400, ceilingFpm: 720 },
  descentRateFpm: 1200,
  powerModel: {
    ratedHp: 400,
    mapLossInHgPer1000FtAboveCritical: 0.95,
    tasPowerExponent: 1 / 3,
    fuelPowerExponent: 0.96,
    minimumMapInHg: 10,
    minimumRpm: 1200,
    phases: {
      takeoff: { throttle: "TAKEOFF", mapInHg: 29.6, rpm: 2700, fuelFlowGph: 40 },
      climb: { throttle: "MAX_CONTINUOUS", mapInHg: 29.6, rpm: 2650, fuelFlowGph: 31.5 },
      enrouteClimb: { throttle: "MAX_CONTINUOUS", mapInHg: 29.6, rpm: 2600, fuelFlowGph: 30.9 },
      descent: { throttle: "DESCENT", mapInHg: 20, rpm: 2000, fuelFlowGph: 10.2 },
    },
  },
  altitudeTasGainKtPer1000Ft: 2.05,
  isaTasGainKtPerC: -0.16,
  weightTasPenaltyKtPer100Lb: 0.72,
  climbWeightFactorPer100Lb: 0.035,
  reserveDefaultMin: 45,
  contingencyPercent: 5,
  calibrationLimits: {
    tasFactor: [0.85, 1.15],
    fuelFlowFactor: [0.75, 1.3],
    phaseTimeFactor: [0.7, 1.3],
    phaseFuelFactor: [0.7, 1.3],
    tripTimeFactor: [0.8, 1.2],
    tripFuelFactor: [0.8, 1.2],
  },
  viability: {
    minimumFuelMarginGal: 5,
    minimumWeightMarginLb: 75,
    minimumCruiseSegmentNm: 10,
    marginalCruiseSegmentNm: 30,
  },
  terrain: {
    // Planning buffer above the SimBrief route MORA; not an aviation minimum.
    marginalBufferFt: 2000,
    profileSamples: 80,
  },
  stepClimb: {
    weightLossLbPerStep: 90,
    minimumRemainingNm: 110,
    minimumFuelSavingGal: 0.35,
    maximumSteps: 3,
  },
  diversion: {
    missedApproachFuelGal: 2.2,
    approachFuelGal: 1,
    marginalFuelMarginGal: 3,
  },
  loadOptimizer: {
    targetFuelMarginGal: 6,
    targetWeightMarginLb: 80,
    fuelIncrementGal: 0.5,
  },
  icing: {
    warmBoundaryC: 5,
    coldBoundaryC: -40,
    cautionScore: 45,
    watchScore: 12,
    unknownMoistureFactor: 0.25,
    clearWeatherFactor: 0,
    visibleMoistureFactor: 0.9,
    terminalCloudFactor: 0.35,
    terminalCloudDepthFt: 6000,
    terminalVerticalVisibilityDepthFt: 3000,
    terminalPrecipitationTopAglFt: 8000,
    transitionSampleStepFt: 500,
    cruiseMinimumPeakWeight: 0.7,
    cruiseExposureTimeScaleMin: 20,
    watchBasePenalty: 4,
    cautionBasePenalty: 18,
  },
  oxygen: {
    usableCapacityFraction: 0.9,
    reserveMinutes: 15,
    maxBottles: 4,
    crewThresholdFt: 12500,
    crewImmediateFt: 14000,
    occupantsThresholdFt: 15000,
    maskThresholdFt: 18000,
    marginalCapacityRatio: 1.2,
    cannulaFlow: [[10000, 0.3], [12000, 0.4], [15000, 0.5], [18000, 0.6]],
    maskFlow: [[18000, 1.8], [20000, 2], [25000, 2.5]],
  },
  turbulence: {
    lightScore: 20,
    moderateScore: 45,
    severeScore: 75,
    lightPenalty: 4,
    moderatePenalty: 16,
    severePenalty: 100,
    moderateVerticalShearKtPer1000Ft: 6,
    moderateHorizontalShearKtPer150Nm: 18,
    simbriefShearApplicabilityFt: 3000,
    unboundedAdvisoryMaximumScore: 60,
  },
  confidence: {
    baseTasUncertainty: 0.08,
    minimumTasUncertainty: 0.025,
    baseFuelUncertainty: 0.12,
    minimumFuelUncertainty: 0.04,
    weatherTimeUncertainty: 0.06,
    debriefReductionPerFlight: 0.012,
  },
  missionRisk: {
    viableScoreMin: 70,
    feasibilityMarginal: 14,
    feasibilityUnavailable: 35,
    fuelMarginWeight: 18,
    icingWeight: 0.2,
    turbulenceWeight: 0.2,
    oxygenMarginal: 10,
    oxygenInsufficient: 30,
    confidenceWeight: 0.12,
    alternateMarginal: 6,
    alternateUnavailable: 14,
    weightBalanceMarginal: 10,
    weightBalanceUnavailable: 35,
  },
  financial: {
    litersPerGal: 3.785411784,
    tolerancePercent: 3,
    fullPenaltyPercent: 25,
    maximumMissionPenalty: 10,
  },
  debrief: {
    learningRate: 0.2,
    maximumHistory: 20,
  },
  glide: {
    ratio: 12.15,
    bestGlideKias: 90,
    feetPerNm: 6076.12,
  },
  modes: {
    ECON: {
      label: "ECON",
      tasAt10kKt: 215,
      fuelFlowGph: 14.6,
      mapInHg: 20,
      rpm: 2300,
    },
    NORMAL: {
      label: "NORMAL",
      tasAt10kKt: 236,
      fuelFlowGph: 18.2,
      mapInHg: 24,
      rpm: 2450,
    },
    FAST: {
      label: "FAST",
      tasAt10kKt: 254,
      fuelFlowGph: 23.8,
      mapInHg: 28,
      rpm: 2500,
    },
  },
};

export const ALTITUDES_FT = [10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 25000];

export const DEMO_PLAN = {
  source: "DEMO",
  origin: { icao: "SBSP", name: "Congonhas", lat: -23.6261, lon: -46.6566 },
  destination: { icao: "SBGL", name: "Galeão", lat: -22.8099, lon: -43.2506 },
  alternate: "SBRJ",
  alternates: [
    { icao: "SBRJ", name: "Santos Dumont", lat: -22.9105, lon: -43.1631 },
  ],
  route: "DCT KOVBI UZ10 OPALA DCT",
  distanceNm: 246,
  plannedAltitudeFt: 18000,
  generatedAt: "",
  waypoints: [
    { ident: "SBSP", lat: -23.6261, lon: -46.6566, distanceNm: 0, windDir: 245, windSpd: 22, oatC: -7, windLevels: [
      { altitudeFt: 10000, windDir: 235, windSpd: 15, oatC: -5 }, { altitudeFt: 18000, windDir: 245, windSpd: 22, oatC: -20 }, { altitudeFt: 25000, windDir: 255, windSpd: 31, oatC: -34 },
    ] },
    { ident: "KOVBI", lat: -23.48, lon: -45.88, distanceNm: 45, moraFt: 5300, windDir: 249, windSpd: 25, oatC: -19, windLevels: [
      { altitudeFt: 10000, windDir: 238, windSpd: 17, oatC: -4 }, { altitudeFt: 18000, windDir: 249, windSpd: 25, oatC: -19 }, { altitudeFt: 25000, windDir: 261, windSpd: 35, oatC: -33 },
    ] },
    { ident: "OPALA", lat: -23.02, lon: -44.56, distanceNm: 132, moraFt: 6500, windDir: 257, windSpd: 31, oatC: -18, windLevels: [
      { altitudeFt: 10000, windDir: 244, windSpd: 20, oatC: -3 }, { altitudeFt: 18000, windDir: 257, windSpd: 31, oatC: -18 }, { altitudeFt: 25000, windDir: 270, windSpd: 42, oatC: -32 },
    ] },
    { ident: "SBGL", lat: -22.8099, lon: -43.2506, distanceNm: 246, moraFt: 4400, windDir: 262, windSpd: 28, oatC: -17, windLevels: [
      { altitudeFt: 10000, windDir: 248, windSpd: 18, oatC: -2 }, { altitudeFt: 18000, windDir: 262, windSpd: 28, oatC: -17 }, { altitudeFt: 25000, windDir: 275, windSpd: 38, oatC: -31 },
    ] },
  ],
};
