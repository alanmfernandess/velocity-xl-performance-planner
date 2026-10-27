import { AIRCRAFT, PERFORMANCE } from "../config.js?v=20261027-01";
import { bearingDeg } from "../engine.js?v=20261027-01";
import { evaluateMissionAlternative } from "../unified-optimization.js?v=20261027-01";
import { temporalPerformancePlan } from "../mission-time.js?v=20261027-01";
import { buildMissionProfile, sampleMissionDistance, sampleMissionTime, profilePositionAtDistance } from "../mission-profile.js?v=20261027-01";
import { retimeSimBriefPlan } from "../simbrief.js?v=20261027-01";
import { sampleGfs, gfsSampleStatus } from "../weather/open-meteo.js?v=20261027-01";

export const SOLVER_VERSION = PERFORMANCE.resilience.version;
const cache = new Map();
const snapshotIds = new WeakMap();
let nextSnapshotId = 0;
const snapshotId = value => {
  if (!value || typeof value !== "object") return null;
  if (!snapshotIds.has(value)) snapshotIds.set(value, ++nextSnapshotId);
  return snapshotIds.get(value);
};
export function scenarioKey({ mission, input, candidate, perturbation = {}, weatherSnapshot, settings }) {
  return JSON.stringify([SOLVER_VERSION, input.plan, input.payloadLb, input.weightBalance, input.oxygen,
    input.fuelOnboardGal, input.reserveMinutes, input.calibration, input.powerSetting, input.ridePreference,
    input.pricePerLiter, input.currency, candidate?.altitudeFt, candidate?.mode, candidate?.powerSetting,
    snapshotId(weatherSnapshot || mission.weatherSnapshot), perturbation, settings || PERFORMANCE.missionTime]);
}
export const clearScenarioCache = () => cache.clear();
export const scenarioCacheSize = () => cache.size;
const unavailable = (reason, extra={}) => ({ available:false, state:"UNKNOWN", reason, ...extra });
export function perturbWeather(value, courseDeg, windKt=0, temperatureC=0) {
  if (![value.windDir,value.windSpd,value.oatC].every(Number.isFinite)) return value;
  const r = Math.PI/180, u=-value.windSpd*Math.sin(value.windDir*r)-windKt*Math.sin(courseDeg*r),
    v=-value.windSpd*Math.cos(value.windDir*r)-windKt*Math.cos(courseDeg*r);
  return { ...value, windDir:(Math.atan2(-u,-v)/r+360)%360, windSpd:Math.hypot(u,v), oatC:value.oatC+temperatureC };
}
export function scenarioInputs(input, perturbation={}) {
  const { payloadLb=0, fuelGal=0, departureHours=0, windKt=0, temperatureC=0 } = perturbation;
  if (![payloadLb,fuelGal,departureHours,windKt,temperatureC].every(Number.isFinite)) throw new RangeError("INVALID_PERTURBATION");
  const baggage = Number(input.weightBalance?.baggage)||0;
  if (baggage+payloadLb < 0) throw new RangeError("BAGGAGE_BELOW_ZERO");
  const fuelOnboardGal = input.fuelOnboardGal+fuelGal;
  if (fuelOnboardGal < PERFORMANCE.taxiFuelGal || fuelOnboardGal > AIRCRAFT.usableFuelGal) throw new RangeError("FUEL_OUTSIDE_CAPACITY");
  let plan = { ...input.plan, vectorWind:true };
  if (departureHours && !Number.isFinite(plan.scheduledOffMs)) throw new RangeError("MISSING_FLIGHT_TIME");
  if (departureHours) plan = retimeSimBriefPlan(plan,plan.scheduledOffMs+departureHours*3600000,
    Number.isFinite(plan.scheduledOnMs) ? plan.scheduledOnMs+departureHours*3600000 : null);
  const legs = plan.waypoints.slice(0,-1).map((p,i) => ({lat:p.lat,lon:p.lon,startNm:p.distanceNm,endNm:plan.waypoints[i+1].distanceNm,courseDeg:bearingDeg(p,plan.waypoints[i+1])}));
  plan = { ...plan, waypoints:plan.waypoints.map((fix,i) => {
    const course = legs[Math.min(i,legs.length-1)]?.courseDeg;
    return { ...fix, ...perturbWeather(fix,course,windKt,temperatureC),
      windLevels:fix.windLevels?.map(level=>perturbWeather(level,course,windKt,temperatureC)) };
  }) };
  return { input:{ ...input, plan, fuelOnboardGal, payloadLb:input.payloadLb+payloadLb,
    weightBalance:{ ...input.weightBalance, baggage:baggage+payloadLb } }, legs };
}
function ofpProfileCoverage(plan,candidate) {
  const model=buildMissionProfile(plan,candidate);
  if(!model.valid)return model.reason;
  for(const section of model.profile.segments){
    const altitudeFt=(section.startAltitudeFt+section.endAltitudeFt)/2,distanceNm=(section.startNm+section.endNm)/2;
    const fixes=plan.waypoints;
    const fix=section.phase==='CLIMB'?fixes[0]:section.phase==='DESCENT'?fixes.at(-1):fixes[Math.max(0,fixes.findIndex(p=>p.distanceNm>distanceNm)-1)];
    const levels=(fix?.windLevels||[]).filter(l=>[l.altitudeFt,l.windDir,l.windSpd,l.oatC].every(Number.isFinite));
    if(levels.length<2)return 'OFP_ATMOSPHERIC_FIELDS_MISSING';
    if(altitudeFt<Math.min(...levels.map(l=>l.altitudeFt))||altitudeFt>Math.max(...levels.map(l=>l.altitudeFt)))return 'OFP_VERTICAL_COVERAGE_MISSING';
  }
  return null;
}
function finalize(plan,candidate,snapshot,extra={}) {
  const model = buildMissionProfile(plan,candidate);
  if (!model.valid) return unavailable(model.reason,{candidate,...extra});
  const metrics={tripFuelGal:candidate.result.tripFuelGal,eteSec:candidate.result.tripTimeHr*3600,
    fuelMarginGal:Math.min(candidate.result.feasibility.fuelMarginGal,candidate.alternate.destination?.marginGal ?? Infinity),
    weightMarginLb:candidate.result.feasibility.weightMarginLb,
    arrivalMs:Number.isFinite(model.startMs)?model.startMs+model.totalSec*1000:null};
  // A valid forecast can demonstrate fuel exhaustion. Keep its calculated fuel
  // demand in ensemble statistics, but expose no impossible negative-F states.
  if (model.nodes.some(p => p.fuelRemainingGal < 0)) return unavailable("FUEL_EXHAUSTED",
    { state:"INCOMPATIBLE", candidate, metrics, fuelDemandOnly:true, ...extra });
  const sampleDistance = distance => stateAt(model,snapshot,sampleMissionDistance(model,distance));
  const sampleTime = seconds => stateAt(model,snapshot,sampleMissionTime(model,seconds));
  return { available:true, candidate, model, plan, snapshot, state:candidate.eligibility.status,
    metrics,sampleDistance,sampleTime,...extra };
}
export function stateAt(model,snapshot,sample) {
  if (!sample) return null;
  const position=profilePositionAtDistance(model,sample.distanceNm);
  const point={...sample,...position};
  const atmosphere=sampleGfs(snapshot?.gfs,point);
  return {...point, massLb:model.candidate.result.takeoffWeightLb
    -(PERFORMANCE.taxiFuelGal+sample.fuelUsedGal)*AIRCRAFT.fuelDensityLbGal,
    mode:model.candidate.mode, power:model.candidate.powerSetting,
    atmosphere, provenance:atmosphere?.source||"SIMBRIEF", coverage:gfsSampleStatus(snapshot?.gfs,point,atmosphere)};
}
/** One coupled atmosphere/performance solver, fixed actual onboard fuel. All
 * exploratory mechanisms reuse it; the production recommendation solver is untouched. */
export function solveScenario(context) {
  const {mission,input,candidate,perturbation={},settings=PERFORMANCE.missionTime}=context;
  const key=scenarioKey(context);
  if (cache.has(key)) return cache.get(key);
  let answer;
  try {
    const prepared=scenarioInputs(input,perturbation), nextInput=prepared.input;
    let plan=nextInput.plan;
    if (!Array.isArray(plan.meteorology?.advisorySources) && plan.meteorology?.enrouteBulletins?.length)
      throw new RangeError("OFP_ADVISORY_VALIDITY_UNKNOWN");
    const original=context.weatherSnapshot||mission.weatherSnapshot;
    const snapshot={...original,gfs:{...original?.gfs,counterfactual:{windKt:perturbation.windKt||0,
      temperatureC:perturbation.temperatureC||0,legs:prepared.legs}}};
    const choice={altitudeFt:candidate.altitudeFt,mode:candidate.mode,
      mapInHg:candidate.powerSetting?.mapInHg,rpm:candidate.powerSetting?.rpm};
    let previous=evaluateMissionAlternative(mission,{...nextInput,plan},choice,
      {performancePlan:plan,weatherSnapshot:snapshot,fuelPolicy:"FIXED"});
    if (snapshot.gfs.status!=="available") {
      const missing=ofpProfileCoverage(plan,previous);
      answer=perturbation.departureHours ? unavailable("FORECAST_REQUIRED_FOR_TIME_SHIFT")
        :missing ? unavailable(missing) :finalize(plan,previous,snapshot,{converged:true,iterations:0,coverage:"PARTIAL",source:"SIMBRIEF_ONLY",input:nextInput});
    } else if (!Number.isFinite(plan.scheduledOffMs)) answer=unavailable("MISSING_FLIGHT_TIME");
    else for(let iteration=1;iteration<=settings.maxIterations;iteration++) {
      plan=retimeSimBriefPlan(nextInput.plan,plan.scheduledOffMs,plan.scheduledOffMs+previous.result.tripTimeHr*3600000);
      const model=buildMissionProfile(plan,previous);
      if (!model.valid) {answer=unavailable(model.reason,{candidate:previous});break;}
      const atmosphere=temporalPerformancePlan(plan,model,snapshot);
      if(atmosphere.missing.length){answer=unavailable(atmosphere.missing[0].reason,{diagnostics:atmosphere.missing});break;}
      const next=evaluateMissionAlternative(mission,{...nextInput,plan},choice,
        {performancePlan:{...atmosphere.plan,vectorWind:true},weatherSnapshot:snapshot,fuelPolicy:"FIXED"});
      const nextModel=buildMissionProfile(plan,next);
      if(!nextModel.valid){answer=unavailable(nextModel.reason,{candidate:next});break;}
      const samples=nextModel.nodes.map(p=>stateAt(nextModel,snapshot,p));
      const missing=samples.find(p=>!p.atmosphere||![p.atmosphere.oatC,p.atmosphere.windDir,p.atmosphere.windSpd].every(Number.isFinite));
      // Terminal below the model's lowest pressure surface is not extrapolated.
      // Interior phase samples must be covered; endpoint gaps remain explicit.
      const interior=missing && missing.distanceNm>0.01 && missing.distanceNm<nextModel.totalNm-.01;
      if(interior){answer=unavailable(missing.coverage,{diagnostics:[missing]});break;}
      const distances=[...new Set([...model.nodes,...nextModel.nodes].map(p=>p.distanceNm))];
      const deltaSeconds=Math.max(...distances.map(d=>Math.abs(sampleMissionDistance(model,d).elapsedSec-sampleMissionDistance(nextModel,d).elapsedSec)));
      const fuelDeltaGal=Math.abs(next.result.tripFuelGal-previous.result.tripFuelGal);
      if(deltaSeconds<=settings.timeToleranceSec && fuelDeltaGal<=settings.fuelToleranceGal){
        answer=finalize(plan,next,snapshot,{converged:true,iterations:iteration,deltaSeconds,fuelDeltaGal,
          coverage:missing?"PARTIAL":"AVAILABLE",source:"COUPLED_FORECAST",input:nextInput,performancePlan:atmosphere.plan});break;
      }
      previous=next;
    }
    answer ||= unavailable("TIME_SOLVER_NOT_CONVERGED",{converged:false,iterations:settings.maxIterations});
  } catch(error){answer=unavailable(error.message,{state:/CAPACITY|CROSSWIND|GROUNDSPEED|BAGGAGE/.test(error.message)?"INCOMPATIBLE":"UNKNOWN"});}
  answer={...answer,key,perturbation:{...perturbation},version:SOLVER_VERSION};
  cache.set(key,answer);
  if(cache.size>PERFORMANCE.resilience.cacheEntries)cache.delete(cache.keys().next().value);
  return answer;
}
