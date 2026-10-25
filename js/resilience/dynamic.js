import { AIRCRAFT, ALTITUDES_FT, PERFORMANCE } from "../config.js?v=20261024-03";
import { oxygenSystemWeightLb, calculateWeightBalance, calculateOxygenPlan, calculateAlternateDiversion } from "../engine.js?v=20261024-03";
import { assessIceTrajectory, assessRideTrajectory } from "../weather/exposure.js?v=20261024-03";
import { solveScenario } from "./core.js?v=20261024-03";
import { advanceState, finishRoute, routePosition } from "./transitions.js?v=20261024-03";

export function paretoFront(items,objectives=[x=>x.tripFuelGal,x=>x.eteSec,x=>x.weatherExposure,x=>-x.fuelMarginGal]) {
  return items.filter((item,i)=>!items.some((other,j)=>i!==j&&objectives.every(f=>f(other)<=f(item)+1e-8)&&objectives.some(f=>f(other)<f(item)-1e-8)));
}
function trajectoryForSections(scenario,sections) {
  const samples=sections.map(p=>({...routePosition(scenario.model.waypoints.filter(p=>p.located&&p.coordinatesValid),(p.start.distanceNm+p.end.distanceNm)/2),
    distanceNm:(p.start.distanceNm+p.end.distanceNm)/2,altitudeFt:(p.start.altitudeFt+p.end.altitudeFt)/2,
    timestampMs:(p.start.timestampMs+p.end.timestampMs)/2,phase:p.phase,minutes:p.timeHr*60}));
  // Physical integrator states carry real route positions.
  return {...scenario.candidate.result.trajectory,samples,alternateSamples:[],
    endMs:sections.at(-1)?.end.timestampMs,timeHr:sections.reduce((sum,p)=>sum+p.timeHr,0)};
}
function assessPath(context,scenario,path,final=false) {
  const sections=path.sections,r0=scenario.candidate.result;
  const tripFuelGal=sections.reduce((s,p)=>s+p.fuelGal,0),timeHr=sections.reduce((s,p)=>s+p.timeHr,0);
  const phases=Object.fromEntries(['climb','cruise','descent'].map(phase=>{const parts=sections.filter(p=>p.phase===phase);return [phase,
    {...r0[phase],timeHr:parts.reduce((s,p)=>s+p.timeHr,0),fuelGal:parts.reduce((s,p)=>s+p.fuelGal,0),distanceNm:parts.reduce((s,p)=>s+p.distanceNm,0)}];}));
  const result={...r0,...phases,altitudeFt:Math.max(...sections.map(p=>Math.max(p.start.altitudeFt,p.end.altitudeFt))),
    tripFuelGal,tripTimeHr:timeHr,cruiseTimeHr:phases.cruise.timeHr,cruiseFuelGal:phases.cruise.fuelGal,
    fuelRequiredGal:tripFuelGal*(1+PERFORMANCE.contingencyPercent/100)+r0.reserveFuelGal+PERFORMANCE.taxiFuelGal};
  result.trajectory=trajectoryForSections(scenario,sections);
  const ice=assessIceTrajectory({plan:scenario.plan,result,trajectory:result.trajectory,weatherSnapshot:scenario.snapshot});
  const ride=assessRideTrajectory({plan:scenario.plan,result,trajectory:result.trajectory,weatherSnapshot:scenario.snapshot});
  const oxygen=calculateOxygenPlan({result,oxygen:context.input.oxygen});
  const balance=calculateWeightBalance({weightBalance:context.input.weightBalance,fuelOnboardGal:scenario.input.fuelOnboardGal,
    landingFuelGal:path.state.fuelRemainingGal,oxygenWeightLb:oxygenSystemWeightLb(context.input.oxygen)});
  const alternate=final?calculateAlternateDiversion({...scenario.input,altitudeFt:result.altitudeFt,mode:path.state.mode,
    oxygenWeightLb:oxygenSystemWeightLb(context.input.oxygen),result}):null;
  const alternateRequired=alternate?.destination?.fuelGal??(scenario.plan.alternates?.length?null:0);
  const fuelMarginGal=path.state.fuelRemainingGal-tripFuelGal*PERFORMANCE.contingencyPercent/100-r0.reserveFuelGal-(alternateRequired??0);
  const blockers=[...(balance.status==='unavailable'?['WEIGHT_BALANCE']:[]),...(oxygen.status==='insufficient'?['OXYGEN']:[]),
    ...(ice.status==='avoid'?['ICE']:[]),...(ride.blocking?['RIDE']:[]),...(fuelMarginGal<0?['FUEL']:[])];
  const unknown=ice.compatibility==='UNKNOWN'||ice.confidence==='limited'||['limited','unknown'].includes(ride.confidence)||(final&&alternateRequired===null);
  const state=blockers.length?'INCOMPATIBLE':unknown?'UNKNOWN':fuelMarginGal<PERFORMANCE.diversion.marginalFuelMarginGal||balance.status==='marginal'||oxygen.status==='marginal'?'MARGINAL':'ELIGIBLE';
  return {...path,result,ice,ride,oxygen,balance,alternate,blockers,eligibility:state,tripFuelGal,eteSec:timeHr*3600,fuelMarginGal,
    weatherExposure:Math.max(...[ice,ride].map(wx=>(wx.profileSamples||[]).reduce((sum,p)=>sum+(p.riskScore||0)*p.minutes,0))),
    limitations:['BOUNDED_GRAPH_SEARCH','OXYGEN_MAX_ALTITUDE_SCREEN','NO_TERRAIN_OR_RUNWAY_VALIDATION',...(!final?['PARTIAL_PATH']:[])]};
}
/** Bounded multiobjective beam graph, retaining actual UTC/fuel/mode. No scalar
 * weighted score. Dominance pruning only within equal FL/mode/time/fuel bins;
 * approximation and the beam cap are returned, never a global optimality claim. */
export function dynamicOptimize(context,{beam=PERFORMANCE.resilience.graphBeam,stages=PERFORMANCE.resilience.graphStages}={}) {
  const scenario=solveScenario(context);
  if(!scenario.available)return {available:false,reason:scenario.reason,solutions:[]};
  const model=scenario.model,route=model.waypoints.filter(p=>p.located&&p.coordinatesValid);
  if(route.length<2)return {available:false,reason:'ROUTE_GEOMETRY_MISSING',solutions:[]};
  const input={...scenario.input,powerSetting:{type:"AUTO"},oxygenWeightLb:oxygenSystemWeightLb(context.input.oxygen)};
  const actualState=scenario.sampleDistance(0),errors=new Set(),selectedFL=context.candidate.altitudeFt;
  const initialLevels=ALTITUDES_FT.filter(h=>Math.abs(h-selectedFL)<=2000);
  const cruiseStops=route.filter(p=>p.distanceNm>scenario.model.profile.tocNm+5&&p.distanceNm<model.profile.todNm-5);
  const stride=Math.max(1,Math.ceil(cruiseStops.length/Math.max(1,stages-1)));
  const stops=cruiseStops.filter((_,i)=>i%stride===0).slice(0,stages-1);
  // If no real internal waypoint is suitable, evaluate physically integrated
  // constant profiles; do not fabricate a graph waypoint.
  let paths=[{state:actualState,sections:[],choices:[]}],expanded=0,pruned=0;
  const anchors=[...stops,{distanceNm:model.totalNm,ident:scenario.plan.destination.icao,terminal:true}];
  for(let stage=0;stage<anchors.length;stage++){
    const anchor=anchors[stage],next=[];
    for(const path of paths){
      const levels=stage===0?initialLevels:[path.state.altitudeFt,...ALTITUDES_FT.filter(h=>h>path.state.altitudeFt&&h-path.state.altitudeFt<=2000)];
      for(const h of levels)for(const mode of ['ECON','NORMAL','FAST']){
        expanded++;
        try{
          // On the last leg perform the chosen step (if any), then solve actual TOD.
          let edge;
          if(anchor.terminal){
            const start=advanceState({route,snapshot:scenario.snapshot,input,state:path.state,
              targetDistanceNm:model.totalNm,targetAltitudeFt:h,mode,initial:stage===0,verticalOnly:true});
            const finish=finishRoute({route,snapshot:scenario.snapshot,input,state:start.state,
              destinationAltitudeFt:scenario.plan.destination.elevationFt,mode,descentSeedNm:scenario.candidate.result.descent.distanceNm});
            edge={state:finish.state,sections:[...start.sections,...finish.sections]};
          }else edge=advanceState({route,snapshot:scenario.snapshot,input,state:path.state,targetDistanceNm:anchor.distanceNm,targetAltitudeFt:h,mode,initial:stage===0});
          const combined={state:edge.state,sections:[...path.sections,...edge.sections],choices:[...path.choices,{ident:anchor.ident,altitudeFt:h,mode}]};
          const assessment=assessPath(context,scenario,combined,anchor.terminal);
          if(assessment.blockers.length){errors.add(assessment.blockers.join('/'));continue;}
          next.push(assessment);
        }catch(error){errors.add(error.message);}
      }
    }
    const eligibleNext=next.filter(p=>p.eligibility!=="UNKNOWN");
    const pool=eligibleNext.length?eligibleNext:next;
    const bins=new Map();
    for(const path of pool){
      const key=[path.state.altitudeFt,path.state.mode,Math.floor(path.state.timestampMs/60000),Math.floor(path.state.fuelRemainingGal*2)].join('|');
      if(!bins.has(key))bins.set(key,[]);bins.get(key).push(path);
    }
    const nondominated=[...bins.values()].flatMap(group=>paretoFront(group));
    const byFuel=[...nondominated].sort((a,b)=>a.tripFuelGal-b.tripFuelGal),byTime=[...nondominated].sort((a,b)=>a.eteSec-b.eteSec);
    const keep=[];for(let i=0;keep.length<beam&&i<nondominated.length;i++)for(const p of [byFuel[i],byTime[i]])if(p&&!keep.includes(p)&&keep.length<beam)keep.push(p);
    pruned+=next.length-keep.length;paths=keep;if(!paths.length)break;
  }
  const eligible=paths.filter(p=>p.eligibility==='ELIGIBLE'||p.eligibility==='MARGINAL');
  // Assessment's eligibility is distinct from its propagated physical state.
  const solutions=paretoFront(eligible.length?eligible:paths.filter(p=>p.eligibility==='UNKNOWN')).slice(0,3)
    .map((p,i)=>({...p,id:`profile-${i}`,name:p.choices.map(c=>`FL${c.altitudeFt/100} ${c.mode}`).filter((s,i,a)=>!i||a[i-1]!==s).join(' → ')}));
  return {available:true,scenario,solutions,confirmed:eligible.length>0,expanded,pruned,errors:[...errors],
    discretization:{altitudeFt:2000,verticalFt:1000,horizontalNm:10,timeBinSec:60,fuelBinGal:.5,beam,anchors:anchors.map(p=>p.ident)},method:'BOUNDED_PARETO_GRAPH'};
}

/** Read-only Mission Profile adapter for a selected variable-altitude path. */
export function dynamicProfileScenario(analysis,index=0) {
  const p=analysis.solutions[index],base=analysis.scenario;
  if(!p||!base?.available)return null;
  const startMs=base.model.startMs,startFuelGal=base.input.fuelOnboardGal-PERFORMANCE.taxiFuelGal;
  const segments=p.sections.map(s=>({phase:s.phase.toUpperCase(),startSec:(s.start.timestampMs-startMs)/1000,endSec:(s.end.timestampMs-startMs)/1000,
    startNm:s.start.distanceNm,endNm:s.end.distanceNm,startUsedGal:startFuelGal-s.start.fuelRemainingGal,endUsedGal:startFuelGal-s.end.fuelRemainingGal,
    startAltitudeFt:s.start.altitudeFt,endAltitudeFt:s.end.altitudeFt,gsKt:s.distanceNm/s.timeHr,fuelFlowGph:s.fuelGal/s.timeHr}));
  const initialClimb=segments.findIndex(s=>s.phase!=='CLIMB'),lastCruise=segments.findLastIndex(s=>s.phase!=='DESCENT');
  const toc=segments[Math.max(0,initialClimb-1)],tod=segments[Math.max(0,lastCruise)];
  const profile={...base.model.profile,segments,totalSec:p.eteSec,totalNm:p.state.distanceNm,totalFuelGal:p.tripFuelGal,
    startFuelGal,tocSec:toc.endSec,tocNm:toc.endNm,todSec:tod.endSec,todNm:tod.endNm};
  const candidate={...base.candidate,altitudeFt:p.result.altitudeFt,profileLabel:p.name,result:{...p.result,icing:p.ice,turbulence:p.ride,oxygen:p.oxygen,weightBalance:p.balance},
    status:p.eligibility==='ELIGIBLE'?'viable':p.eligibility==='MARGINAL'?'marginal':'unknown',eligibility:{...base.candidate.eligibility,status:p.eligibility}};
  const model={...base.model,profile,totalSec:p.eteSec,totalNm:p.state.distanceNm,candidate,
    maxFt:Math.ceil(Math.max(...segments.map(s=>Math.max(s.startAltitudeFt,s.endAltitudeFt)))/1000)*1000};
  model.nodes=segments.flatMap((s,i)=>[...(i?[]:[{distanceNm:s.startNm,elapsedSec:s.startSec,altitudeFt:s.startAltitudeFt,fuelUsedGal:s.startUsedGal,fuelRemainingGal:startFuelGal-s.startUsedGal,timestampMs:startMs+s.startSec*1000}]),
    {distanceNm:s.endNm,elapsedSec:s.endSec,altitudeFt:s.endAltitudeFt,fuelUsedGal:s.endUsedGal,fuelRemainingGal:startFuelGal-s.endUsedGal,timestampMs:startMs+s.endSec*1000}]);
  return {...base,candidate,model,source:'DYNAMIC_ANALYSIS'};
}
