/** Position is cumulative OFP NM. No percent rounding, synthetic fixes or equal spacing. */
export function ofpDistanceReference(plan) {
  const raw=plan?.ofpWaypoints??plan?.waypoints;
  const points=Array.isArray(raw)?raw.slice():raw;
  const invalid=reason=>({valid:false,reason,points:[],totalNm:null});
  if(!Array.isArray(points)||points.length<2)return invalid('NAVLOG_MISSING');
  const airportValid=p=>p?.icao&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
  if(points[0].distanceNm>0&&airportValid(plan.origin))points.unshift({...plan.origin,ident:plan.origin.icao,distanceNm:0,distanceSource:'OFP_ORIGIN'});
  if(points.at(-1).distanceNm<plan.distanceNm&&airportValid(plan.destination))points.push({...plan.destination,ident:plan.destination.icao,distanceNm:plan.distanceNm,distanceSource:'OFP_DESTINATION'});
  if(points.some(p=>!p.ident||!Number.isFinite(p.distanceNm)||p.distanceNm<0))return invalid('NAVLOG_DISTANCE_MISSING');
  if(points.some((p,i)=>i&&p.distanceNm<points[i-1].distanceNm))return invalid('NAVLOG_DISTANCE_ORDER');
  if(Math.abs(points[0].distanceNm)>1e-6||!(points.at(-1).distanceNm>0))return invalid('NAVLOG_ENDPOINTS_MISSING');
  if(!Number.isFinite(plan.distanceNm)||Math.abs(points.at(-1).distanceNm-plan.distanceNm)>.01)return invalid('NAVLOG_DISTANCE_REFERENCE_MISMATCH');
  return {valid:true,points,totalNm:points.at(-1).distanceNm};
}
export function locateOfpDistance(reference,distanceNm) {
  if(!reference?.valid||!Number.isFinite(distanceNm)||distanceNm<0||distanceNm>reference.totalNm)return null;
  const points=reference.points,exact=points.filter(p=>Math.abs(p.distanceNm-distanceNm)<=1e-6);
  if(exact.length){
    const previous=points.findLast(p=>p.distanceNm<distanceNm-1e-6)||exact[0];
    const next=points.find(p=>p.distanceNm>distanceNm+1e-6)||exact.at(-1);
    return {distanceNm,percent:distanceNm/reference.totalNm*100,exact:true,current:exact[0],ident:exact.map(p=>p.ident).join(' / '),previous,next,fromNm:distanceNm-previous.distanceNm,toNm:next.distanceNm-distanceNm,legNm:0};
  }
  const nextIndex=points.findIndex(p=>p.distanceNm>distanceNm),previous=points[nextIndex-1],next=points[nextIndex];
  if(!previous||!next||!(next.distanceNm>previous.distanceNm))return null;
  return {distanceNm,percent:distanceNm/reference.totalNm*100,exact:false,previous,next,fromNm:distanceNm-previous.distanceNm,toNm:next.distanceNm-distanceNm,legNm:next.distanceNm-previous.distanceNm};
}
/** Read the engine envelope at a phase weight. Its current model is rectangular;
 * overweight points have no allowed corridor. Future polygon vertices can be
 * added to the domain model without inventing a sloping UI envelope. */
export function cgCorridorForWeight(envelope,weightLb) {
  if(!Number.isFinite(weightLb)||weightLb>envelope.maximumWeightLb||weightLb<0)return null;
  return {forwardCgIn:envelope.forwardCgIn,aftCgIn:envelope.aftCgIn};
}
