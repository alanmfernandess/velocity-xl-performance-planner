/** Schematic visual proportions only. All duration values come from the integrated flight profile. */
export function createFlightRibbonData(profile){
 if(!profile?.valid||!Number.isFinite(profile.totalSec)||profile.totalSec<=0)return null;
 const end=profile.totalSec;
 const toc=Math.max(0,Math.min(end,profile.tocSec));
 const tod=Math.max(toc,Math.min(end,profile.todSec));
 const candidates=[
  {phase:"CLIMB",seconds:toc,weight:1},
  {phase:"CRUISE",seconds:tod-toc,weight:3},
  {phase:"DESCENT",seconds:end-tod,weight:1}
 ];
 const active=candidates.filter(item=>item.seconds>1e-7);
 if(!active.length)return null;
 const totalWeight=active.reduce((a,p)=>a+p.weight,0);
 let elapsed=0,cumulative=0;
 const phases=active.map(p=>{
  const startPct=100*cumulative/totalWeight;
  const endPct=100*(cumulative+p.weight)/totalWeight;
  const part={...p,startSec:elapsed,endSec:elapsed+p.seconds,startPct,endPct};
  elapsed+=p.seconds;cumulative+=p.weight;return part;
 });
 const boundaries=phases.slice(0,-1).map((p,i)=>({
  percent:p.endPct,
  label:p.phase==="CLIMB"&&phases[i+1].phase==="DESCENT"?"TOC/TOD":p.phase==="CLIMB"?"TOC":"TOD"
 }));
 return {phases,boundaries,totalSec:end};
}
/** Display coordinate, not elapsed time or distance used for performance. */
export function flightRibbonPosition(ribbon,elapsedSec){
 if(!ribbon?.phases?.length||!Number.isFinite(elapsedSec))return null;
 const t=Math.max(0,Math.min(ribbon.totalSec,elapsedSec));
 const phase=ribbon.phases.find(p=>t<p.endSec-1e-7)||ribbon.phases.at(-1);
 const ratio=phase.seconds>0?Math.max(0,Math.min(1,(t-phase.startSec)/phase.seconds)):0;
 return phase.startPct+(phase.endPct-phase.startPct)*ratio;
}
