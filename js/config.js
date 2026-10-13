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
  maxContinuousRpm: 2450,
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
  altitudeTasGainKtPer1000Ft: 2.05,
  isaTasGainKtPerC: -0.16,
  weightTasPenaltyKtPer100Lb: 0.72,
  climbWeightFactorPer100Lb: 0.035,
  reserveDefaultMin: 45,
  contingencyPercent: 5,
  modes: {
    ECON: {
      label: "ECON",
      tasAt10kKt: 215,
      fuelFlowGph: 14.6,
      description: "Máxima autonomia",
    },
    NORMAL: {
      label: "NORMAL",
      tasAt10kKt: 236,
      fuelFlowGph: 18.2,
      description: "Equilíbrio recomendado",
    },
    FAST: {
      label: "FAST",
      tasAt10kKt: 254,
      fuelFlowGph: 23.8,
      description: "Menor tempo de voo",
    },
  },
};

export const ALTITUDES_FT = [10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 25000];

export const DEMO_PLAN = {
  source: "DEMO",
  origin: { icao: "SBSP", name: "Congonhas", lat: -23.6261, lon: -46.6566 },
  destination: { icao: "SBGL", name: "Galeão", lat: -22.8099, lon: -43.2506 },
  alternate: "SBRJ",
  route: "DCT KOVBI UZ10 OPALA DCT",
  distanceNm: 246,
  plannedAltitudeFt: 18000,
  generatedAt: "Plano demonstrativo",
  waypoints: [
    { ident: "SBSP", lat: -23.6261, lon: -46.6566, distanceNm: 0, windDir: 110, windSpd: 10, oatC: 17 },
    { ident: "KOVBI", lat: -23.48, lon: -45.88, distanceNm: 45, windDir: 245, windSpd: 22, oatC: -7 },
    { ident: "OPALA", lat: -23.02, lon: -44.56, distanceNm: 132, windDir: 257, windSpd: 31, oatC: -18 },
    { ident: "SBGL", lat: -22.8099, lon: -43.2506, distanceNm: 246, windDir: 268, windSpd: 26, oatC: 22 },
  ],
};
