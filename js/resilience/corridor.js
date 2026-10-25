import { PERFORMANCE } from "../config.js?v=20261024-02";
import { calculateRemainingFlightAssessment, oxygenSystemWeightLb } from "../engine.js?v=20261024-02";
import { solveScenario } from "./core.js?v=20261024-02";
import { finishRoute, directDecisionRoute } from "./transitions.js?v=20261024-02";
const fuelState=margin=>!Number.isFinite(margin)?"UNKNOWN":margin<0?"INCOMPATIBLE":margin<PERFORMANCE.diversion.marginalFuelMarginGal?"MARGINAL":"FUEL_FEASIBLE";
export function decisionCorridor(context) {
  const scenario=solveScenario(context);
  if(!scenario.available)return {available:false,reason:scenario.reason,waypoints:[]};
  const {model,candidate}=scenario,input={...scenario.input,oxygenWeightLb:oxygenSystemWeightLb(context.input.oxygen)};
  const option=(ident,requiredFuelGal,remainingFuelGal,extra={})=>({ident,requiredFuelGal,marginGal:Number.isFinite(requiredFuelGal)?remainingFuelGal-requiredFuelGal:null,
    state:fuelState(Number.isFinite(requiredFuelGal)?remainingFuelGal-requiredFuelGal:null),operationalState:"UNKNOWN",...extra});
  const waypoints=model.waypoints.map(fix=>{
    if(!fix.located)return {...fix,state:null,options:[],reason:"WAYPOINT_POSITION_UNKNOWN"};
    const state=scenario.sampleDistance(fix.distanceNm),remainingTripFuelGal=candidate.result.tripFuelGal-state.fuelUsedGal;
    // The native remaining-flight calculator validates cruise FL; actual state
    // altitude remains separately visible and is used for return/diversion legs.
    const remaining=calculateRemainingFlightAssessment({...input,mode:candidate.engineMode||candidate.mode,
      manual:{active:true,distanceNm:fix.distanceNm,altitudeFt:candidate.altitudeFt,fuelRemainingGal:state.fuelRemainingGal},
      projectedRemainingTripFuelGal:remainingTripFuelGal});
    const options=[option(scenario.plan.destination.icao,remaining?.requiredFuelGal,state.fuelRemainingGal,{kind:"continue",components:remaining})];
    const targets=[{kind:"return",target:scenario.plan.origin},{kind:"alternate",target:scenario.plan.alternates?.[0]}];
    for(const {kind,target} of targets){
      if(!target){options.push({kind,ident:null,state:"UNKNOWN",operationalState:"UNKNOWN",reason:"NO_OFP_ALTERNATE"});continue;}
      let route=kind==="return"?[{...state,distanceNm:0},...model.waypoints.filter(p=>p.located&&p.distanceNm<fix.distanceNm-.01).reverse()
        .map(p=>({...p,distanceNm:fix.distanceNm-p.distanceNm}))]:directDecisionRoute(state,target);
      if(kind==="return"&&route.length<2)route=null;
      if(!route){options.push({kind,ident:target.icao,state:"UNKNOWN",operationalState:"UNKNOWN",reason:"DECISION_GEOMETRY_UNAVAILABLE"});continue;}
      try{
        // Descend physically first, then continue at airport altitude only if
        // the model covers it. No invented cruise altitude or return procedure.
        const destinationFt=Number.isFinite(target.elevationFt)?target.elevationFt:null;
        if(destinationFt===null)throw new RangeError("AIRPORT_ELEVATION_UNKNOWN");
        const leg=finishRoute({route,snapshot:scenario.snapshot,input,state:{...state,distanceNm:0},
          destinationAltitudeFt:destinationFt,mode:candidate.engineMode||candidate.mode,descentSeedNm:candidate.result.descent.distanceNm});
        const tripFuelGal=state.fuelRemainingGal-leg.state.fuelRemainingGal;
        const required=tripFuelGal*(1+PERFORMANCE.contingencyPercent/100)+candidate.result.reserveFuelGal;
        options.push(option(target.icao,required,state.fuelRemainingGal,{kind,tripFuelGal,eteSec:(leg.state.timestampMs-state.timestampMs)/1000,
          limitations:["DIRECT_BRANCH_ONLY","TERRAIN_NOT_ASSESSED","RUNWAY_NOT_ASSESSED"],terminal:leg.state}));
      }catch(error){options.push({kind,ident:target.icao,state:"UNKNOWN",operationalState:"UNKNOWN",reason:error.message});}
    }
    return {...fix,state,options,sufficientCount:options.filter(o=>o.state==="FUEL_FEASIBLE").length,
      evaluatedCount:options.filter(o=>o.state!=="UNKNOWN").length};
  });
  return {available:true,scenario,waypoints,etpPnr:candidate.etpPnr,glide:candidate.glide,operationalState:"UNKNOWN"};
}
