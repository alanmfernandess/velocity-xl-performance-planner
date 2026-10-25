import { AIRCRAFT, PERFORMANCE } from "../config.js?v=20261024-03";
import { solveScenario } from "./core.js?v=20261024-03";

export const domains = input => ({ windKt:[-40,100], temperatureC:[-20,30],
  payloadLb:[-Math.max(0,Number(input.weightBalance?.baggage)||0),Math.max(0,AIRCRAFT.maxGrossWeightLb-AIRCRAFT.emptyWeightLb-input.payloadLb)],
  fuelGal:[PERFORMANCE.taxiFuelGal-input.fuelOnboardGal,AIRCRAFT.usableFuelGal-input.fuelOnboardGal], departureHours:[0,3] });
export function constraintMargins(scenario) {
  if(!scenario.available)return scenario.fuelDemandOnly ? {fuel:scenario.metrics.fuelMarginGal,availability:null} : {availability:null};
  const c=scenario.candidate, r=c.result;
  return {fuel:scenario.metrics.fuelMarginGal,weight:r.feasibility.weightMarginLb,
    profile:r.feasibility.profileMarginNm-PERFORMANCE.viability.minimumCruiseSegmentNm,
    altitude:r.feasibility.altitudeMarginFt,
    oxygen:r.oxygen.status==="insufficient"?-1:1,
    weather:c.unknown?null:(r.icing.status==="avoid"||r.turbulence.blocking?-1:1),
    balance:r.weightBalance.status==="unavailable"?-1:1};
}
/** Full domain scan, then refine EVERY detected transition. No monotonicity
 * assumption; resolution is reported and roots cannot imply absent narrow islands. */
export function findConstraintFrontiers(evaluate,min,max,{samples=PERFORMANCE.resilience.frontierSamples,iterations=PERFORMANCE.resilience.frontierIterations}={}) {
  if(!(max>min)||samples<2)return {samples:[],transitions:[],resolution:0};
  const points=Array.from({length:samples},(_,i)=>({x:min+(max-min)*i/(samples-1)}));
  for(const p of points)p.margins=evaluate(p.x);
  const transitions=[];
  const signature=v=>v===null||!Number.isFinite(v)?"UNKNOWN":v<0?"NEGATIVE":"NONNEGATIVE";
  for(let i=1;i<points.length;i++)for(const constraint of new Set([...Object.keys(points[i-1].margins),...Object.keys(points[i].margins)])){
    let low=points[i-1],high=points[i];
    if(signature(low.margins[constraint])===signature(high.margins[constraint]))continue;
    const before=signature(low.margins[constraint]),after=signature(high.margins[constraint]);
    for(let j=0;j<iterations;j++){
      const x=(low.x+high.x)/2,mid={x,margins:evaluate(x)};
      if(signature(mid.margins[constraint])===signature(low.margins[constraint]))low=mid;else high=mid;
    }
    transitions.push({constraint,x:(low.x+high.x)/2,bracket:[low.x,high.x],before,after});
  }
  return {samples:points,transitions,resolution:(max-min)/(samples-1),method:"SCAN_ALL_TRANSITIONS"};
}
export function stressTest(context,perturbation={},axis="windKt") {
  const scenario=solveScenario({...context,perturbation});
  const margins=constraintMargins(scenario),negative=Object.entries(margins).find(([,v])=>v!==null&&v<0);
  const dominant=negative?.[0]||(!scenario.available?scenario.reason:scenario.candidate.physicalBlockers[0]
    ||scenario.candidate.unknownReasons[0]||scenario.candidate.result.feasibility.primaryReason);
  const [min,max]=domains(context.input)[axis];
  const frontiers=findConstraintFrontiers(x=>constraintMargins(solveScenario({...context,perturbation:{...perturbation,[axis]:x}})),min,max);
  const windFrontiers=axis==="windKt"?frontiers:findConstraintFrontiers(x=>constraintMargins(solveScenario({...context,perturbation:{...perturbation,windKt:x}})),...domains(context.input).windKt);
  return {scenario,dominant,axis,frontiers,windFrontiers};
}
