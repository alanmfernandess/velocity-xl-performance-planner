import { AIRCRAFT, PERFORMANCE } from "../config.js?v=20261024-02";
import { solveScenario } from "./core.js?v=20261024-02";
import { domains } from "./stress.js?v=20261024-02";
export const PERTURBATIONS={windKt:10,temperatureC:5,payloadLb:50,departureHours:1};
const metrics=["tripFuelGal","eteSec","fuelMarginGal"];
export function finiteDifference(evaluate,x,step,[min,max]) {
  const baseline=evaluate(x),canPlus=x+step<=max,canMinus=x-step>=min;
  const plus=canPlus?evaluate(x+step):null,minus=canMinus?evaluate(x-step):null;
  const valid=s=>s?.available && !s.candidate?.physicalBlockers?.some(b=>["WEIGHT","FUEL_CAPACITY","OXYGEN"].includes(b));
  const central=valid(plus)&&valid(minus),a=central?minus:valid(baseline)?baseline:null,b=valid(plus)?plus:valid(minus)?minus:null;
  if(!a||!b)return {available:false,reason:"NO_ADMISSIBLE_DIFFERENCE",plus,minus};
  const denominator=central?step*2:b===plus?step:-step;
  return {available:true,method:central?"CENTRAL":b===plus?"FORWARD":"BACKWARD",baseline,plus,minus,
    derivative:Object.fromEntries(metrics.map(k=>[k,(b.metrics[k]-a.metrics[k])/denominator]))};
}
export function causalAnalysis(context) {
  const baseline=solveScenario(context),domain=domains(context.input);
  // Weight perturbations never cross maximum gross weight.
  const oxygenLb=context.candidate.result.oxygenWeightLb||0;
  domain.payloadLb[1]=Math.min(domain.payloadLb[1],AIRCRAFT.maxGrossWeightLb-AIRCRAFT.emptyWeightLb-context.input.payloadLb-context.input.fuelOnboardGal*AIRCRAFT.fuelDensityLbGal-oxygenLb);
  const effects=Object.entries(PERTURBATIONS).map(([axis,step])=>{
    const effectiveStep = Math.min(step, Math.max(domain[axis][1], -domain[axis][0]));
    const sensitivity=effectiveStep > 0 ? finiteDifference(x=>solveScenario({...context,perturbation:{[axis]:x}}),0,effectiveStep,domain[axis]) : { available:false, reason:"NO_ADMISSIBLE_DIFFERENCE" };
    const scenario=sensitivity.method==="BACKWARD"?sensitivity.minus:sensitivity.plus;
    const delta=baseline.available&&scenario?.available?Object.fromEntries(metrics.map(k=>[k,scenario.metrics[k]-baseline.metrics[k]])):null;
    const chain=delta?{tocNm:scenario.model.profile.tocNm-baseline.model.profile.tocNm,
      todNm:scenario.model.profile.todNm-baseline.model.profile.todNm,
      tasKt:scenario.candidate.result.tasKt-baseline.candidate.result.tasKt,
      encounteredWindKt:scenario.candidate.result.weather.componentKt-baseline.candidate.result.weather.componentKt,
      ...delta,newFuelMarginGal:scenario.metrics.fuelMarginGal}:null;
    return {axis,step,appliedStep:scenario===sensitivity.plus?effectiveStep:-effectiveStep,sensitivity,scenario,delta,chain};
  });
  const admitted=effects.filter(e=>e.sensitivity.available&&e.delta);
  const perturbation=Object.fromEntries(admitted.map(e=>[e.axis,e.appliedStep]));
  const combined=solveScenario({...context,perturbation});
  const interaction=baseline.available&&combined.available?Object.fromEntries(metrics.map(k=>[k,combined.metrics[k]-baseline.metrics[k]-admitted.reduce((s,e)=>s+e.delta[k],0)])):null;
  return {baseline,effects,combined,interaction,method:"MODEL_COUNTERFACTUAL_FINITE_DIFFERENCES"};
}
