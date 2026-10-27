/** Worker DTO for the plain data schema: keep shared references and NaN/null
 * semantics, omit local query functions. JSON serialization duplicates entire
 * forecasts and silently turns NaN into a usable zero after numeric coercion. */
export function workerData(value,seen=new WeakMap()) {
  if(value===null||typeof value!=='object')return typeof value==='function'?undefined:value;
  if(seen.has(value))return seen.get(value);
  const copy=Array.isArray(value)?[]:{};seen.set(value,copy);
  for(const [key,item] of Object.entries(value))if(typeof item!=='function')copy[key]=workerData(item,seen);
  return copy;
}
export function ensembleViewData(result) {
  return {...result,evaluated:result.evaluated.map(member=>{
    const s=member.scenario;if(!s)return member;
    return {...member,scenario:{available:s.available,state:s.state,reason:s.reason,metrics:s.metrics,
      source:s.source,coverage:s.coverage,converged:s.converged,iterations:s.iterations,fuelDemandOnly:s.fuelDemandOnly,
      model:s.model?{nodes:s.model.nodes,totalNm:s.model.totalNm}:null,
      candidate:s.candidate?{eligibility:s.candidate.eligibility,unknownReasons:s.candidate.unknownReasons,
        icing:s.candidate.result.icing,turbulence:s.candidate.result.turbulence,oxygen:s.candidate.result.oxygen,
        weightBalance:s.candidate.result.weightBalance}:null}};
  })};
}
