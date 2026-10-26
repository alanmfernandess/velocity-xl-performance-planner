/* Velocity XL — Zen Status mission assessment (read-only presentation). */
(function createAssessment(){
"use strict";
if(new URLSearchParams(location.search).has("auditLegacyUi"))return;
const nativeSelector=s=>document.querySelector(s);
const icon=(n)=>{
 const path={
 plane:'<path d="M2 20 21 3 16 21 11 14 2 20ZM21 3 9 11l2 3"/>',
 route:'<path d="m21 3-8 18-3-7-7-3L21 3Z"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 ice:'<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/><path d="m9 4 3 3 3-3m-6 16 3-3 3 3"/>',
 ride:'<path d="M2 7c2 0 2 2 5 2s3-2 5-2 3 2 5 2 3-2 5-2M2 15c2 0 2 2 5 2s3-2 5-2 3 2 5 2 3-2 5-2"/>',
 fuel:'<path d="M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/><path d="M9 17q1 2 3 2"/>',
 oxygen:'<circle cx="12" cy="12" r="9"/><path d="M8 8c-2 1-3 3-3 5m14 0c0-2-1-4-3-5M9 15h6M10 10l2 5 2-5"/>'
 };
 return '<svg viewBox="0 0 24 24" class="zas-icon" aria-hidden="true">'+path[n]+'</svg>';
};
const art=`<svg class="zas-art" viewBox="0 0 840 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
 <defs><linearGradient id="zas-fade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#deecf6" stop-opacity=".33"/></linearGradient></defs>
 <path d="M0 375Q150 385 280 450T560 448T840 370V600H0Z" fill="url(#zas-fade)"/>
 <g fill="none" stroke="#a1bfd5" stroke-width="1" opacity=".24">
 <path d="M-80 420Q100 355 160 510T400 570"/><path d="M-95 445Q105 380 167 530T414 592"/><path d="M-90 475Q102 405 176 551T445 613"/>
 <path d="M630 470Q720 430 910 330"/><path d="M610 495Q745 455 920 355"/><path d="M590 530Q770 477 930 390"/><path d="M570 560Q780 510 945 422"/></g></svg>`;
const root=document.createElement("section");
root.id="zenAssessmentShell";
root.hidden=true;
root.setAttribute("aria-label","Missão · Avaliação");
root.innerHTML='<div class="zas-outer"><div class="zas-app">'+art+
'<header class="zas-header"><button class="zas-brand" type="button" data-zas="home" aria-label="Voltar à visão geral">'+icon("plane")+'<span>VELOCITY XL</span></button>'+
'<button class="zas-iconbtn" type="button" data-zas="info" aria-label="Informações">'+icon("info")+'</button></header>'+
'<main class="zas-body"><div class="zas-scene">'+
'<div class="zas-route"><span id="zasFrom">—</span>'+icon("route")+'<span id="zasTo">—</span></div>'+
'<div class="zas-kicker" id="zasKicker">AVALIAÇÃO DA MISSÃO</div>'+
'<div class="zas-status" id="zasStatus" role="status" aria-live="polite">—</div>'+
'<div class="zas-score" id="zasScore">—</div>'+
'<div class="zas-reason" id="zasReason">—</div>'+
'<div class="zas-metrics">'+
'<div class="zas-metric">'+icon("ice")+'<span>ICE</span><strong id="zasIce">—</strong></div>'+
'<div class="zas-metric">'+icon("ride")+'<span>RIDE</span><strong id="zasRide">—</strong></div>'+
'<div class="zas-metric">'+icon("fuel")+'<span id="zasReserveLabel">RESERVA</span><strong id="zasReserve">—</strong></div>'+
'<div class="zas-metric">'+icon("oxygen")+'<span>O₂</span><strong id="zasOxygen">—</strong></div></div>'+
'<button class="zas-primary" data-zas="details" type="button" id="zasReview">Ver análise '+icon("arrow")+'</button>'+
'</div><div class="zas-notice">'+icon("info")+'<span id="zasCaveat">Terreno e obstáculos não avaliados</span></div></main>'+
'<div class="zas-shade" id="zasShade" hidden></div>'+
'<aside class="zas-drawer" id="zasDrawer" aria-labelledby="zasDrawerTitle" role="dialog" aria-modal="true" hidden>'+
'<div class="zas-drawer-head"><strong id="zasDrawerTitle">Detalhes da missão</strong><button class="zas-iconbtn" data-zas="close" type="button" aria-label="Fechar">'+icon("close")+'</button></div>'+
'<div class="zas-drawer-body" id="zasDrawerBody"></div>'+
'<div class="zas-drawer-footer"><button class="zas-secondary" type="button" data-zas="close" id="zasClose">Voltar à avaliação</button></div>'+
'</aside></div></div>';
document.body.append(root);
const z=s=>root.querySelector(s);
const english=()=>document.documentElement.lang==="en-US";
const tr=(a,b)=>english()?b:a;
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const src=s=>nativeSelector(s)?.textContent?.trim()||"";
const statusLabels={viable:["VIÁVEL","VIABLE"],marginal:["MARGINAL","MARGINAL"],"not-viable":["NÃO VIÁVEL","NOT VIABLE"],unknown:["NÃO AVALIADO","NOT ASSESSED"]};
const colors={viable:"var(--green)",marginal:"var(--orange)","not-viable":"var(--red)",unknown:"#657d95"};
let drawer=null,previousFocus=null,queued=false,lastSignature="";
const nativeStatus=()=>nativeSelector("#missionRiskValue")?.dataset.status||"unknown";
function isScore(){const state=window.VelocityLayout?.state;return state?.area==="mission"&&state.module?.mission==="score";}
function active(){
 const on=isScore();root.hidden=!on;
 document.body.classList.toggle("zen-assessment",on);
 // Overview and assessment both use a fixed visual viewport. On other modules,
 // restore standard scrolling and the original navigation.
 document.documentElement.classList.toggle("zen-locked",on||Boolean(document.body.classList.contains("zen-overview"))||Boolean(document.body.classList.contains("zen-planning")));
 if(!on&&drawer)close();
 if(on)render();
}
function splitRoute(){
 const title=src("#routeTitle");
 const route=title.split(/\s*[→➜]\s*/);
 z("#zasFrom").textContent=route[0]||"—";
 z("#zasTo").textContent=route[1]||"—";
}
function reserveStatus(){
 const text=src("#kpiFuelDelta");
 const parsed=text.replace(/\s/g,"").match(/^([+\-−]?\d+(?:[.,]\d+)?)/);
 if(!parsed)return "—";
 const n=Number(parsed[1].replace("−","-").replace(",","."));
 if(!Number.isFinite(n))return "—";
 return n>=0?tr("Atendida","Met"):tr("Insuficiente","Insufficient");
}
function model(){
 const loaded=Boolean(nativeSelector("#plannerContent")&&!nativeSelector("#plannerContent").hidden);
 const status=loaded?nativeStatus():"unknown";
 const key=Object.hasOwn(statusLabels,status)?status:"unknown";
 const scoreText=src("#missionRiskValue");
 const val=/^(\d{1,3})\/100$/.exec(scoreText);
 const score=key!=="unknown"&&val?Number(val[1]):null;
 const rawReasons=[...document.querySelectorAll("#missionScoreReasons > div")].map(el=>({
   label:el.querySelector("span")?.textContent?.trim()||"",
   value:el.querySelector("strong")?.textContent?.trim()||"",
   severity:el.className||""
 })).filter(x=>x.label);
 const primary=src("#missionScoreSummary");
 const adjustment=src("#missionScoreAction");
 return {
 loaded,key,score,
 reason:loaded?(primary||adjustment||tr("Consulte os critérios avaliados","Review assessed criteria")):tr("Importe um plano de voo","Import a flight plan"),
 ice:loaded?src("#cruiseIcingValue"):"—",
 ride:loaded?src("#rideValue"):"—",
 reserve:loaded?reserveStatus():"—",
 reserveDelta:loaded?src("#kpiFuelDelta"):"—",
 oxygen:loaded?src("#oxygenValue"):"—",
 reasons:loaded?rawReasons:[],
 adjustment:loaded?adjustment:"",
 iceMeta:loaded?src("#cruiseIcingMeta"):"",
 rideMeta:loaded?src("#rideMeta"):"",
 oxygenMeta:loaded?src("#oxygenMeta"):"",
 statusText:loaded?src("#missionRiskStatus"):"",
 weather:window.VelocityWeather?.getStatus?.()||{}
 };
}
function render(){
 if(root.hidden)return;
 const m=model();
 root.style.setProperty("--zas-tone",colors[m.key]);
 splitRoute();
 z("#zasKicker").textContent=tr("AVALIAÇÃO DA MISSÃO","MISSION ASSESSMENT");
 z("#zasStatus").textContent=statusLabels[m.key][english()?1:0];
 z("#zasScore").textContent=m.score===null?tr("Score indisponível","Score unavailable"):`${m.score} / 100`;
 z("#zasScore").classList.toggle("missing",m.score===null);
 z("#zasReason").textContent=m.reason;
 z("#zasIce").textContent=m.ice||"—";
 z("#zasRide").textContent=m.ride||"—";
 z("#zasReserve").textContent=m.reserve||"—";
 z("#zasReserve").classList.toggle("alert",/insuficiente|insufficient/i.test(m.reserve));
 z("#zasOxygen").textContent=m.oxygen||"—";
 z("#zasReserveLabel").textContent=tr("RESERVA","RESERVE");
 z("#zasReview").innerHTML=tr("Ver análise","View analysis")+" "+icon("arrow");
 z("#zasCaveat").textContent=tr("Terreno e obstáculos não avaliados","Terrain and obstacles not assessed");
 if(drawer)renderDrawer(m);
}
function row(label,value){
 return '<div class="zas-detail"><span>'+safe(label)+'</span><strong>'+safe(value||"—")+'</strong></div>';
}
function renderDrawer(m=model()){
 if(!drawer)return;
 z("#zasDrawerTitle").textContent=drawer==="info"?tr("Sobre a avaliação","About assessment"):tr("Detalhes da missão","Mission details");
 let parts=[];
 if(drawer==="info"){
   parts.push('<div class="zas-subhead">'+tr("SOBRE ESTA TELA","ABOUT THIS SCREEN")+'</div>');
   parts.push('<p class="zas-info">'+tr("Esta tela apresenta os critérios calculados pelo motor. Dados insuficientes não significam condições seguras.","This screen shows engine-assessed criteria. Insufficient data does not mean safe conditions.")+'</p>');
 }else{
   parts.push('<div class="zas-subhead">'+tr("ESTADO","STATUS")+'</div>');
   parts.push('<div class="zas-drawer-status">'+safe(statusLabels[m.key][english()?1:0])+'</div>');
   parts.push('<div class="zas-drawer-score">'+(m.score===null?tr("Score indisponível","Score unavailable"):m.score+" / 100")+'</div>');
   parts.push('<div class="zas-subhead">'+tr("CRITÉRIOS","CRITERIA")+'</div>');
   parts.push(row("ICE",m.ice+" · "+m.iceMeta));
   parts.push(row("RIDE",m.ride+" · "+m.rideMeta));
   parts.push(row(tr("Reserva","Reserve"),m.reserveDelta));
   parts.push(row(tr("Oxigênio","Oxygen"),m.oxygen+" · "+m.oxygenMeta));
   parts.push(row(tr("Terreno e obstáculos","Terrain and obstacles"),tr("Não avaliados","Not assessed")));
   parts.push('<div class="zas-subhead">'+tr("OBSERVAÇÕES","FINDINGS")+'</div>');
   if(m.reasons.length){
     for(const reason of m.reasons){
       parts.push('<div class="zas-finding '+(/critical/i.test(reason.severity)?"critical":"")+'">'+icon("info")+'<span>'+safe(reason.label)+'</span><strong>'+safe(reason.value)+'</strong></div>');
     }
   } else parts.push('<p class="zas-info">'+safe(m.reason)+'</p>');
   if(m.adjustment)parts.push('<p class="zas-info">'+safe(m.adjustment)+'</p>');
   if(m.key==="unknown"){
     parts.push('<div class="zas-subhead">'+tr("FONTES METEOROLÓGICAS","WEATHER SOURCES")+'</div>');
     parts.push(row("GFS",m.weather.gfs||"—"));parts.push(row("AWC",m.weather.awc||"—"));
     if(m.weather.gfsReason)parts.push('<p class="zas-info">GFS: '+safe(m.weather.gfsReason)+'</p>');
     if(m.weather.awcReason)parts.push('<p class="zas-info">AWC: '+safe(m.weather.awcReason)+'</p>');
   }
 }
 parts.push('<div class="zas-subhead">'+tr("NAVEGAÇÃO","NAVIGATION")+'</div><div class="zas-nav">'+
  '<button type="button" data-zas="home">'+tr("Visão geral","Overview")+'</button>'+
  '<button type="button" data-zas="planning">'+tr("Planejamento","Planning")+'</button>'+
  '<button type="button" data-zas="route">'+tr("Rota","Route")+'</button>'+
  '<button type="button" data-zas="flight">'+tr("Em voo","In flight")+'</button></div>');
 z("#zasDrawerBody").innerHTML=parts.join("");
 z("#zasClose").textContent=tr("Voltar à avaliação","Back to assessment");
}
function open(which){
 drawer=which;previousFocus=document.activeElement;
 z("#zasShade").hidden=false;z("#zasDrawer").hidden=false;
 renderDrawer();
 z("#zasDrawer .zas-iconbtn")?.focus();
}
function close(){
 drawer=null;z("#zasShade").hidden=true;z("#zasDrawer").hidden=true;
 if(previousFocus?.isConnected)previousFocus.focus();
}
function navigate(area,module){
 if(drawer)close();
 window.VelocityLayout?.activate(area,module);
 active();
}
root.addEventListener("click",e=>{
 const el=e.target.closest("[data-zas]");
 if(!el)return;
 switch(el.dataset.zas){
 case "details":open("details");break;
 case "info":open("info");break;
 case "close":close();break;
 case "home":navigate("mission","overview");break;
 case "planning":navigate("planning","config");break;
 case "route":navigate("route","overview");break;
 case "flight":navigate("flight","update");break;
 }
});
z("#zasShade").addEventListener("click",close);
document.addEventListener("keydown",e=>{
 if(root.hidden||!drawer)return;
 if(e.key==="Escape"){e.preventDefault();close();return}
 if(e.key==="Tab"){
   const candidates=[...z("#zasDrawer").querySelectorAll("button:not([disabled])")];
   if(!candidates.length)return;
   if(e.shiftKey&&document.activeElement===candidates[0]){e.preventDefault();candidates.at(-1).focus();}
   else if(!e.shiftKey&&document.activeElement===candidates.at(-1)){e.preventDefault();candidates[0].focus();}
 }
});
function scheduleRender(){
 if(queued)return;queued=true;
 requestAnimationFrame(()=>{queued=false;active();});
}
// The original engine and native mission scoreboard remain the only
// authoritative sources. This is a read-only presentation layer.
const original=nativeSelector("#top");
if(original)new MutationObserver(scheduleRender).observe(original,{
  subtree:true,childList:true,characterData:true,attributes:true,
  attributeFilter:["hidden","class","data-status"]
});
const panel=nativeSelector('[data-module-panel="mission:score"]');
if(panel)new MutationObserver(scheduleRender).observe(panel,{attributes:true,attributeFilter:["hidden"]});
window.addEventListener("velocityxl:weather-status",scheduleRender);
document.addEventListener("click",e=>{
 if(e.target.closest('[data-area-button],[data-module-button],[data-open-module]'))queueMicrotask(scheduleRender);
});
window.addEventListener("load",scheduleRender);
active();
})();
