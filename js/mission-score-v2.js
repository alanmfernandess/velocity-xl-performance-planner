import { PERFORMANCE } from "./config.js?v=20261021-unified";

const cap = (value, weight) => Math.max(0, Math.min(weight, value));
const valid = (value) => Number.isFinite(value) ? value : null;

/** @typedef {{code:string,weight:number,penalty:number|null,value:unknown,evidence:string[],limitations:string[]}} ScoreDimension */

/** A score explains a candidate. Eligibility is evaluated separately. */
export function scoreMissionV2(candidate, { minimumFuelGal = null, financial = null } = {}) {
  const r = candidate.result, weights = PERFORMANCE.missionScoreV2.weights;
  const dimensions = [];
  const add = (code, fraction, value, evidence = [], limitations = []) => {
    const weight = weights[code];
    dimensions.push({ code, weight, penalty: fraction === null ? null : cap(fraction * weight, weight),
      value, evidence, limitations });
  };
  const ice = r.icing;
  add("icing", ice.compatibility === "UNKNOWN" ? null : cap((ice.riskScore || 0) / 100, 1), ice.riskScore,
    (ice.trajectoryEvidence || []).map((item) => item.id).filter(Boolean), ice.limitations || []);
  const ride = r.turbulence;
  add("turbulence", ride.riskScore === null ? null : cap(ride.riskScore / 100, 1), ride.riskScore,
    [], ride.limitations || []);
  const fuelMargin = valid(r.feasibility?.fuelMarginGal);
  const target = PERFORMANCE.optimization.targetFuelMarginGal;
  add("fuel", fuelMargin === null ? null : cap((target - fuelMargin) / Math.max(1, target), 1), fuelMargin);
  const profile = valid(r.feasibility?.profileMarginNm);
  add("performance", profile === null ? null : r.feasibility.status === "unavailable" ? 1
    : r.power.turboLimited ? .55 : profile < PERFORMANCE.viability.marginalCruiseSegmentNm ? .4 : 0,
  { profileMarginNm: profile, powerPercent: r.power.percentPower });
  add("weight-balance", r.weightBalance?.status === "unavailable" ? 1 : r.weightBalance?.status === "marginal" ? .5 : 0,
    r.weightBalance?.minimumCgMarginIn ?? null);
  add("oxygen", r.oxygen?.status === "insufficient" ? 1 : r.oxygen?.status === "marginal" ? .5 : 0,
    r.oxygen?.capacityRatio ?? null);
  const alternateStatus = candidate.alternate?.destination?.status;
  add("alternate", alternateStatus === "unavailable" ? 1 : alternateStatus === "marginal" ? .5
    : candidate.alternate?.alternate && !candidate.alternate?.destination ? null : 0,
    candidate.alternate?.destination?.marginGal ?? null);
  const fuelRatio = minimumFuelGal > 0 ? r.fuelRequiredGal / minimumFuelGal - 1 : 0;
  const costFraction = financial?.assessed ? cap((financial.premiumPercent || 0) / 25, 1) : 0;
  add("efficiency", cap(Math.max(fuelRatio * 2, costFraction), 1),
    { specificRangeNmGal: r.specificRangeNmGal, cost: candidate.cost });
  const assessed = dimensions.filter((item) => item.penalty !== null);
  const score = Math.round(Math.max(0, 100 - assessed.reduce((sum, item) => sum + item.penalty, 0)));
  const partial = assessed.length !== dimensions.length;
  const reasons = dimensions.filter((item) => item.penalty !== null && item.penalty >= 1)
    .map((item) => ({ code: item.code, impact: Math.round(item.penalty), detail: item.value,
      blocking: candidate.physicalBlockers.some((blocker) => {
        const category = { ICE: "icing", RIDE: "turbulence", OXYGEN: "oxygen", ALTERNATE: "alternate",
          WEIGHT: "weight-balance", FUEL: "fuel", FUEL_CAPACITY: "fuel" }[blocker];
        return category === item.code;
      }) })).sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.impact - a.impact);
  return { score, status: candidate.physicalBlockers.length ? "not-viable" : partial || candidate.unknown ? "unknown"
    : score < PERFORMANCE.missionRisk.viableScoreMin ? "marginal" : "viable",
    blocked: candidate.physicalBlockers.length > 0, partial, penalty: 100 - score, dimensions, reasons };
}
