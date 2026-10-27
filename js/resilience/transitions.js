import { AIRCRAFT, PERFORMANCE } from "../config.js?v=20261027-01";
import { bearingDeg, greatCircleNm, calculateFlightTransition, cruiseSnapshot, solveWindTriangle } from "../engine.js?v=20261027-01";
import { sampleGfs, gfsSampleStatus } from "../weather/open-meteo.js?v=20261027-01";
import { validCoordinates } from "../mission-profile.js?v=20261027-01";

/** Geometry follows real waypoint positions. Cumulative route distance is
 * retained; geographic interpolation is local, never uniform waypoint spacing. */
export function routePosition(route,distanceNm) {
  if(route.length<2||!route.every(validCoordinates))throw new RangeError("ROUTE_GEOMETRY_MISSING");
  const i=Math.max(1,route.findIndex(p=>p.distanceNm>=distanceNm)),a=route[i-1],b=route[i];
  const f=Math.max(0,Math.min(1,(distanceNm-a.distanceNm)/(b.distanceNm-a.distanceNm||1)));
  return {lat:a.lat+(b.lat-a.lat)*f,lon:a.lon+(b.lon-a.lon)*f,courseDeg:bearingDeg(a,b)};
}
function localPlan(route,state,altitudeFt,timestampMs,snapshot) {
  const position=routePosition(route,state.distanceNm),to=routePosition(route,Math.min(route.at(-1).distanceNm,state.distanceNm+1));
  // At the final endpoint use the preceding track, not an undefined zero leg.
  const course=position.courseDeg;
  const r=Math.PI/180,toFix={lat:position.lat+Math.cos(course*r)/60,lon:position.lon+Math.sin(course*r)/(60*Math.cos(position.lat*r))};
  const point={...position,altitudeFt,timestampMs},wx=sampleGfs(snapshot.gfs,point);
  if(!wx||![wx.oatC,wx.windDir,wx.windSpd].every(Number.isFinite))throw new RangeError(gfsSampleStatus(snapshot.gfs,point,wx));
  const from={...position,...wx,ident:"STATE",distanceNm:0,windLevels:[{altitudeFt:0,...wx},{altitudeFt:AIRCRAFT.serviceCeilingFt,...wx}]};
  const end={...toFix,...wx,ident:"TARGET",distanceNm:1,windLevels:from.windLevels};
  return {origin:from,destination:end,waypoints:[from,end],distanceNm:1,vectorWind:true,scheduledOffMs:timestampMs};
}
/** Shared physical transition integrator for graph edges and corridor branches.
 * Vertical substeps <=1,000 ft, horizontal <=10 NM. Each step resolves midpoint
 * atmospheric time with the same 2 s / .02 gal tolerances as the mission core. */
export function advanceState({route,snapshot,input,state,targetDistanceNm,targetAltitudeFt,mode,initial=false,verticalOnly=false,allowOvershoot=false}) {
  if(!Number.isFinite(state.timestampMs))throw new RangeError("MISSING_FLIGHT_TIME");
  if(targetDistanceNm<state.distanceNm || targetAltitudeFt<0 || targetAltitudeFt>AIRCRAFT.serviceCeilingFt)throw new RangeError("TRANSITION_OUTSIDE_ENVELOPE");
  let current={...state,mode},sections=[];
  const weight=()=>AIRCRAFT.emptyWeightLb+input.payloadLb+(input.oxygenWeightLb||0)+current.fuelRemainingGal*AIRCRAFT.fuelDensityLbGal;
  const append=(part,phase,endAltitudeFt)=>{
    if(![part.timeHr,part.distanceNm,part.fuelGal].every(Number.isFinite)||part.timeHr<0||part.distanceNm<0||part.fuelGal<0)throw new RangeError("TRANSITION_NONPHYSICAL");
    if(!allowOvershoot && current.distanceNm+part.distanceNm>targetDistanceNm+1e-6)throw new RangeError("TRANSITION_DISTANCE_INSUFFICIENT");
    if(current.fuelRemainingGal<part.fuelGal)throw new RangeError("FUEL_EXHAUSTED");
    const next={...current,...routePosition(route,Math.min(route.at(-1).distanceNm,current.distanceNm+part.distanceNm)),distanceNm:current.distanceNm+part.distanceNm,altitudeFt:endAltitudeFt,
      timestampMs:current.timestampMs+part.timeHr*3600000,fuelRemainingGal:current.fuelRemainingGal-part.fuelGal};
    sections.push({...part,phase,start:{...current},end:{...next},mode});current=next;
  };
  while(Math.abs(current.altitudeFt-targetAltitudeFt)>.1){
    const nextAlt=current.altitudeFt+Math.sign(targetAltitudeFt-current.altitudeFt)*Math.min(1000,Math.abs(targetAltitudeFt-current.altitudeFt));
    let part=null,guessSec=0,converged=false;
    for(let i=0;i<PERFORMANCE.missionTime.maxIterations;i++){
      const plan=localPlan(route,current,(current.altitudeFt+nextAlt)/2,current.timestampMs+guessSec*500,snapshot);
      const next=calculateFlightTransition({plan,fromAltitudeFt:current.altitudeFt,toAltitudeFt:nextAlt,weightLb:weight(),initial});
      if(part&&Math.abs(next.timeHr-part.timeHr)*3600<=PERFORMANCE.missionTime.timeToleranceSec&&Math.abs(next.fuelGal-part.fuelGal)<=PERFORMANCE.missionTime.fuelToleranceGal)converged=true;
      part=next;guessSec=part.timeHr*3600;if(converged)break;
    }
    if(!converged)throw new RangeError("TRANSITION_NOT_CONVERGED");
    append(part,nextAlt>current.altitudeFt?"climb":"descent",nextAlt);
  }
  while(!verticalOnly && targetDistanceNm-current.distanceNm>1e-6){
    const nextFix=route.find(p=>p.distanceNm>current.distanceNm+1e-5)?.distanceNm??targetDistanceNm;
    const distanceNm=Math.min(10,targetDistanceNm-current.distanceNm,nextFix-current.distanceNm);
    let part=null,guessSec=0,converged=false;
    for(let i=0;i<PERFORMANCE.missionTime.maxIterations;i++){
      const probe={...current,distanceNm:current.distanceNm+distanceNm/2};
      const plan=localPlan(route,probe,current.altitudeFt,current.timestampMs+guessSec*500,snapshot);
      const cruise=cruiseSnapshot({...input,plan,altitudeFt:current.altitudeFt,mode,fuelOnboardGal:current.fuelRemainingGal});
      const wx=cruise.weather,gsKt=solveWindTriangle(cruise.tasKt,bearingDeg(plan.origin,plan.destination),wx.windDir,wx.windSpeedKt).gsKt;
      const timeHr=distanceNm/gsKt,next={distanceNm,timeHr,fuelGal:timeHr*cruise.fuelFlowGph,tasKt:cruise.tasKt,gsKt,power:cruise.power};
      if(part&&Math.abs(next.timeHr-part.timeHr)*3600<=PERFORMANCE.missionTime.timeToleranceSec&&Math.abs(next.fuelGal-part.fuelGal)<=PERFORMANCE.missionTime.fuelToleranceGal)converged=true;
      part=next;guessSec=part.timeHr*3600;if(converged)break;
    }
    if(!converged)throw new RangeError("TRANSITION_NOT_CONVERGED");
    append(part,"cruise",current.altitudeFt);
  }
  return {state:{...current,...routePosition(route,current.distanceNm),massLb:weight()},sections};
}
export function directDecisionRoute(from,to) {
  if(!validCoordinates(from)||!validCoordinates(to))return null;
  const distance=greatCircleNm(from,to);
  return distance>.01?[{...from,distanceNm:0},{...to,distanceNm:distance}]:null;
}

/** Couple TOD to the physical descent distance. Search iterations may overshoot
 * the endpoint, but only a converged route balance is returned as a result. */
export function finishRoute({route,snapshot,input,state,destinationAltitudeFt,mode,descentSeedNm}) {
  const end=route.at(-1).distanceNm;
  let start=Math.max(state.distanceNm,end-descentSeedNm);
  for(let i=0;i<PERFORMANCE.missionTime.maxIterations;i++){
    const cruise=advanceState({route,snapshot,input,state,targetDistanceNm:start,targetAltitudeFt:state.altitudeFt,mode});
    const descent=advanceState({route,snapshot,input,state:cruise.state,targetDistanceNm:end,targetAltitudeFt:destinationAltitudeFt,mode,verticalOnly:true,allowOvershoot:true});
    const error=descent.state.distanceNm-end;
    if(Math.abs(error)<=.02)return {state:descent.state,sections:[...cruise.sections,...descent.sections],distanceResidualNm:error};
    start-=error;
    if(start<state.distanceNm||start>end)throw new RangeError("TRANSITION_DISTANCE_INSUFFICIENT");
  }
  throw new RangeError("DESCENT_DISTANCE_NOT_CONVERGED");
}
