import { PERFORMANCE } from "../config.js?v=20261024-03";
import { representativePoints } from "../weather/open-meteo.js?v=20261024-03";
import { solveScenario } from "./core.js?v=20261024-03";
export const ENSEMBLE_ENDPOINT="https://ensemble-api.open-meteo.com/v1/ensemble";
// GEFS returned null pressure fields in the controlled live contract probe.
// This explicitly selected global model returned actual geopotential/aviation data.
export const ENSEMBLE_MODEL="ecmwf_ifs025_ensemble";
export const ENSEMBLE_LEVELS=[1000,925,850,700,600,500,400,300];
const fields={temperature:"°C",geopotential_height:"m",wind_speed:"kn",wind_direction:"°",relative_humidity:"%",cloud_cover:"%"};
const cache=new Map();
export function buildEnsembleUrl(points,startMs,endMs) {
  if(!points.length||points.length>PERFORMANCE.resilience.ensembleBatch||!Number.isFinite(startMs)||!Number.isFinite(endMs))throw new RangeError("ENSEMBLE_REQUEST_INVALID");
  const url=new URL(ENSEMBLE_ENDPOINT);
  for(const [key,value] of Object.entries({latitude:points.map(p=>p.lat),longitude:points.map(p=>p.lon),models:ENSEMBLE_MODEL,
    hourly:ENSEMBLE_LEVELS.flatMap(p=>Object.keys(fields).map(f=>`${f}_${p}hPa`)),start_date:new Date(startMs).toISOString().slice(0,10),
    end_date:new Date(endMs).toISOString().slice(0,10),timezone:"UTC",wind_speed_unit:"kn"}))url.searchParams.set(key,String(value));
  return url.toString();
}
export function parseEnsembleResponse(raw,points,{nowMs=Date.now()}={}) {
  const locations=Array.isArray(raw)?raw:[raw];
  if(locations.length!==points.length)throw new Error("ENSEMBLE_LOCATION_COUNT");
  const ids=new Set();
  for(const location of locations)for(const key of Object.keys(location.hourly||{})){
    if(key.startsWith("temperature_")&&/hPa(?:_member\d+)?$/.test(key))ids.add(key.match(/_member(\d+)$/)?.[1]||"control");
  }
  const members=[];
  for(const id of [...ids].sort()){
    const suffix=id==="control"?"":`_member${id}`;
    const errors=[],parsed=[];
    locations.forEach((location,index)=>{
      const times=(location.hourly?.time||[]).map(t=>Date.parse(`${t.replace(/Z$/,"")}Z`));
      if(times.length<2||times.some((t,i)=>!Number.isFinite(t)||(i&&t<=times[i-1])))errors.push(`TIMESTAMPS:${index}`);
      if(!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude))errors.push(`COORDINATES:${index}`);
      const hourly={};
      for(const level of ENSEMBLE_LEVELS)for(const [field,unit] of Object.entries(fields)){
        const key=`${field}_${level}hPa`,name=key+suffix,values=location.hourly?.[name];
        const required=!['relative_humidity','cloud_cover'].includes(field);
        const validUnit=location.hourly_units?.[name]===unit;
        hourly[key]=Array.isArray(values)&&values.length===times.length&&validUnit?values.map(v=>typeof v==='number'&&Number.isFinite(v)?v:null):times.map(()=>null);
        // Reject a missing required series instead of borrowing another member.
        if(required&&(!validUnit||!Array.isArray(values)||values.length!==times.length||!values.some(Number.isFinite)))errors.push(`${name}:${index}`);
      }
      parsed.push({lat:location.latitude,lon:location.longitude,times,hourly,pressureLevels:ENSEMBLE_LEVELS,model:ENSEMBLE_MODEL,memberId:id,fetchedAtMs:nowMs});
    });
    members.push({id,valid:!errors.length,errors,gfs:{status:"available",locations:parsed,model:ENSEMBLE_MODEL,memberId:id,fetchedAtMs:nowMs}});
  }
  return {status:members.some(m=>m.valid)?members.every(m=>m.valid)?"AVAILABLE":"PARTIAL":"UNAVAILABLE",members,model:ENSEMBLE_MODEL,fetchedAtMs:nowMs};
}
export async function fetchEnsemble(plan,{signal,fetcher=fetch,nowMs=Date.now()}={}) {
  if(signal?.aborted)throw new DOMException("Aborted","AbortError");
  if(!Number.isFinite(plan.scheduledOffMs))return {status:"UNAVAILABLE",reason:"MISSING_FLIGHT_TIME",members:[]};
  const points=representativePoints(plan),start=plan.scheduledOffMs,end=start+24*3600000;
  const key=JSON.stringify([points,start,end,ENSEMBLE_MODEL]);
  if(cache.has(key)&&nowMs-cache.get(key).fetchedAtMs<PERFORMANCE.resilience.ensembleTtlMs)return cache.get(key);
  const raw=[];
  for(let i=0;i<points.length;i+=PERFORMANCE.resilience.ensembleBatch){
    const batch=points.slice(i,i+PERFORMANCE.resilience.ensembleBatch);
    const response=await fetcher(buildEnsembleUrl(batch,start,end),{signal});
    if(!response.ok)throw new Error(`ENSEMBLE_HTTP_${response.status}`);
    const data=await response.json();raw.push(...(Array.isArray(data)?data:[data]));
  }
  if(signal?.aborted)throw new DOMException("Aborted","AbortError");
  const result=parseEnsembleResponse(raw,points,{nowMs});cache.set(key,result);
  if(cache.size>3)cache.delete(cache.keys().next().value);
  return result;
}
/** R7 linearly interpolated empirical quantiles; margin P10 is the adverse end. */
export function quantile(values,q) {
  const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length)return null;
  const i=(v.length-1)*q,a=Math.floor(i),b=Math.ceil(i);return v[a]+(v[b]-v[a])*(i-a);
}
export function analyzeEnsemble(context,ensemble) {
  const evaluated=ensemble.members.map(member=>{
    if(!member.valid)return {id:member.id,valid:false,reason:"MEMBER_FIELDS_MISSING",errors:member.errors};
    const scenario=solveScenario({...context,weatherSnapshot:{...context.mission.weatherSnapshot,gfs:member.gfs}});
    return {id:member.id,valid:(scenario.available||scenario.fuelDemandOnly)&&scenario.converged,reason:scenario.reason,scenario};
  });
  const valid=evaluated.filter(m=>m.valid),statistics={};
  for(const key of ['tripFuelGal','eteSec','fuelMarginGal','arrivalMs'])statistics[key]=Object.fromEntries([.1,.5,.9].map(q=>[`p${q*100}`,quantile(valid.map(m=>m.scenario.metrics[key]),q)]));
  const negative=valid.filter(m=>m.scenario.metrics.fuelMarginGal<0).length,
    marginal=valid.filter(m=>m.scenario.metrics.fuelMarginGal>=0&&m.scenario.metrics.fuelMarginGal<PERFORMANCE.diversion.marginalFuelMarginGal).length;
  return {status:valid.length?valid.length===evaluated.length?"AVAILABLE":"PARTIAL":"UNAVAILABLE",model:ensemble.model,
    evaluated,validCount:valid.length,receivedCount:evaluated.length,excludedCount:evaluated.length-valid.length,statistics,negative,marginal,
    eligibility:Object.fromEntries(['ELIGIBLE','MARGINAL','INCOMPATIBLE','UNKNOWN'].map(s=>[s,valid.filter(m=>m.scenario.state===s).length]))};
}
