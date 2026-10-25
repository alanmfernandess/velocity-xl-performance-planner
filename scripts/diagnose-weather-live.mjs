import { buildGfsUrl, parseGfsResponse } from "../js/weather/open-meteo.js";
import { AWC_SNAPSHOT_URL, parseAwcSnapshot } from "../js/weather/awc.js";

async function probe(label, url, parse) {
  const began=Date.now();
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(22000),headers:{Accept:"application/json"},cache:"no-store"});
    const text=await response.text();
    let json;
    try {json=JSON.parse(text);} catch {json=null;}
    let result={http:response.status,bytes:text.length,durationMs:Date.now()-began,
      providerError:json?.error===true?json.reason:null};
    if(response.ok && json) {
      try {result={...result,...parse(json)};}
      catch(error){result.parseError=error.message;}
    } else result.errorBody=text.slice(0,500);
    console.log(label,JSON.stringify(result));
  } catch(error) {
    console.log(label,JSON.stringify({networkError:error.message,cause:error.cause?.message,durationMs:Date.now()-began}));
  }
}

const brazil=[{lat:-23.55,lon:-46.63},{lat:-22.91,lon:-43.17}];
await probe("GFS_2_POINTS",buildGfsUrl(brazil),raw=>{
  const parsed=parseGfsResponse(raw,2);
  return {locations:parsed.length,firstTime:new Date(parsed[0].times[0]).toISOString(),units:raw[0]?.hourly_units?.geopotential_height_500hPa}
});
await probe("AWC_RAW",AWC_SNAPSHOT_URL,raw=>{
  const parsed=parseAwcSnapshot(raw);
  return {providerStatus:parsed.status,ageMinutes:Math.round(parsed.ageMs/60000),sigmets:parsed.sigmets.length,pireps:parsed.pireps.length};
});
