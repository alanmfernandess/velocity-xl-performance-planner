import { AIRCRAFT, PERFORMANCE, DEMO_PLAN } from "./config.js";
import { calculatePlan } from "./engine.js";
import { fetchLatestOFP } from "./simbrief.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));

const COPY = {
  "pt-BR": {
    pilotId:"Pilot ID / Alias", origin:"Origem", destination:"Destino", distance:"Distância", plannedFl:"FL planejado", apply:"Aplicar", weather:"Atmosfera", windDirection:"Direção", windSpeed:"Vento", importLatest:"Importar último OFP",
    bestLevel:"Melhor nível", fuelRequired:"Combustível requerido", estimatedTime:"Tempo estimado", maximumRange:"Alcance máximo", performance:"Performance", route:"Rota", profile:"Perfil", altitudeComparison:"Comparação por altitude", selectedLevel:"Selecionado", recommendedLevel:"Recomendado", windComponent:"Componente", alternate:"Alternativa", flightProfile:"Perfil de voo",
    objective:"Objetivo", bestOverall:"Melhor conjunto", lowestFuel:"Menor consumo", fastest:"Mais rápido", maxRange:"Maior alcance", payload:"Carga útil", fuelOnboard:"Combustível a bordo", reserve:"Reserva", takeoffWeight:"Peso de decolagem", fuel:"Combustível", allLevels:"Todos os níveis", climb:"SUBIDA", cruise:"CRUZEIRO", descent:"DESCIDA", disclaimer:"Simulação somente · Modelo não certificado · Sem telemetria",
    demo:"DEMO", simbrief:"SIMBRIEF", manual:"MANUAL", fuelHint:"Menor valor", timeHint:"Menor valor", efficiencyHint:"Maior valor", margin:"de margem", belowMax:"abaixo do máximo", aboveMax:"acima do máximo", imported:"OFP importado", manualApplied:"Rota aplicada", missingId:"Informe o Pilot ID ou Alias.", invalidRoute:"Preencha origem, destino e distância.", importError:"Não foi possível importar o OFP.",
    fuelRank:(rank)=>`${rank}º em consumo`, timeRank:(rank,gs)=>`${rank}º em tempo · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingência", taxi:"Taxi",
  },
  "en-US": {
    pilotId:"Pilot ID / Alias", origin:"Origin", destination:"Destination", distance:"Distance", plannedFl:"Planned FL", apply:"Apply", weather:"Weather", windDirection:"Direction", windSpeed:"Wind", importLatest:"Import latest OFP",
    bestLevel:"Best level", fuelRequired:"Fuel required", estimatedTime:"Estimated time", maximumRange:"Maximum range", performance:"Performance", route:"Route", profile:"Profile", altitudeComparison:"Altitude comparison", selectedLevel:"Selected", recommendedLevel:"Recommended", windComponent:"Component", alternate:"Alternate", flightProfile:"Flight profile",
    objective:"Objective", bestOverall:"Best Overall", lowestFuel:"Lowest Fuel", fastest:"Fastest", maxRange:"Maximum Range", payload:"Payload", fuelOnboard:"Fuel onboard", reserve:"Reserve", takeoffWeight:"Takeoff weight", fuel:"Fuel", allLevels:"All levels", climb:"CLIMB", cruise:"CRUISE", descent:"DESCENT", disclaimer:"Simulation only · Non-certified model · No telemetry",
    demo:"DEMO", simbrief:"SIMBRIEF", manual:"MANUAL", fuelHint:"Lower is better", timeHint:"Lower is better", efficiencyHint:"Higher is better", margin:"margin", belowMax:"below maximum", aboveMax:"above maximum", imported:"OFP imported", manualApplied:"Route applied", missingId:"Enter a Pilot ID or Alias.", invalidRoute:"Enter origin, destination and distance.", importError:"Could not import the OFP.",
    fuelRank:(rank)=>`#${rank} fuel`, timeRank:(rank,gs)=>`#${rank} time · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingency", taxi:"Taxi",
  },
};

const state = {
  plan: structuredClone(DEMO_PLAN), mode:"NORMAL", payloadLb:520, fuelOnboardGal:77, reserveMinutes:45,
  metric:"fuel", criterion:"overall", selectedAltitudeFt:null, language:localStorage.getItem("velocityxl.language") || "pt-BR",
};
const t = (key, ...args) => typeof COPY[state.language][key] === "function" ? COPY[state.language][key](...args) : COPY[state.language][key] || key;
const number = (value, digits = 0) => Number(value).toLocaleString(state.language, { minimumFractionDigits:digits, maximumFractionDigits:digits });
const signed = (value, suffix="") => `${value >= 0 ? "+" : "−"}${number(Math.abs(Math.round(value)))}${suffix}`;
const formatTime = (hours) => { const minutes=Math.max(0,Math.round(hours*60)); return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`; };

function showToast(message, error=false) {
  const toast=$("#toast"); toast.textContent=message; toast.classList.toggle("error",error); toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove("show"),3000);
}

function applyTranslations() {
  document.documentElement.lang=state.language;
  $$('[data-i18n]').forEach((element)=>{ element.textContent=t(element.dataset.i18n); });
  $$('[data-i18n-title]').forEach((element)=>{ const label=t(element.dataset.i18nTitle); element.title=label; element.setAttribute("aria-label",label); });
  $$('[data-language]').forEach((button)=>button.classList.toggle("active",button.dataset.language===state.language));
  const metricLabels={fuel:state.language==="pt-BR"?"Combustível":"Fuel",time:state.language==="pt-BR"?"Tempo":"Time",efficiency:state.language==="pt-BR"?"Eficiência":"Efficiency"};
  $$('[data-metric]').forEach((button)=>{ button.textContent=metricLabels[button.dataset.metric]; });
}

function metricConfig() {
  if(state.metric==="time") return { key:"tripTimeHr", unit:"h", hint:t("timeHint"), value:formatTime };
  if(state.metric==="efficiency") return { key:"specificRangeNmGal", unit:"NM/GAL", hint:t("efficiencyHint"), value:(v)=>number(v,1) };
  return { key:"fuelRequiredGal", unit:"GAL", hint:t("fuelHint"), value:(v)=>number(v,1) };
}

function renderPerformanceChart(results,recommended) {
  const config=metricConfig(), values=results.map((r)=>r[config.key]);
  const width=860,height=330,left=48,right=18,top=34,bottom=48,min=Math.min(...values),max=Math.max(...values),spread=max-min||1;
  const x=(i)=>left+(i/(results.length-1))*(width-left-right), y=(value)=>top+((max-value)/spread)*(height-top-bottom-18)+9;
  const points=results.map((r,i)=>`${x(i)},${y(r[config.key])}`).join(" ");
  const area=`${left},${height-bottom} ${points} ${x(results.length-1)},${height-bottom}`;
  const grid=[0,.25,.5,.75,1].map((ratio)=>{ const yy=top+ratio*(height-top-bottom),value=max-ratio*spread; return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#edf0f3"/><text x="${left-10}" y="${yy+3}" fill="#8b98a4" font-size="8" text-anchor="end">${config.value(value)}</text>`; }).join("");
  const dots=results.map((r,i)=>{ const best=r.altitudeFt===recommended.altitudeFt,selected=r.altitudeFt===(state.selectedAltitudeFt||recommended.altitudeFt); return `<g class="chart-point" data-altitude="${r.altitudeFt}" tabindex="0" role="button"><circle cx="${x(i)}" cy="${y(r[config.key])}" r="${selected?10:6}" fill="${best?"#edf8ef":"#e9f3fd"}"/><circle cx="${x(i)}" cy="${y(r[config.key])}" r="${best?5:4}" fill="${best?"#52a964":"#1976d2"}" stroke="#fff" stroke-width="2"/>${best?`<g transform="translate(${x(i)-27},${y(r[config.key])-35})"><rect width="54" height="19" rx="9" fill="#52a964"/><text x="27" y="12.5" fill="#fff" text-anchor="middle" font-size="7" font-weight="700">${config.value(r[config.key])}</text></g>`:""}<text x="${x(i)}" y="${height-19}" fill="${best?"#438b52":"#84929e"}" font-size="8" text-anchor="middle">FL${r.fl}</text></g>`; }).join("");
  $("#performanceChart").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1976d2" stop-opacity=".13"/><stop offset="1" stop-color="#1976d2" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#chartArea)"/><polyline points="${points}" fill="none" stroke="#1976d2" stroke-width="2" stroke-linejoin="round"/>${dots}<text x="${left}" y="14" fill="#8794a0" font-size="7" letter-spacing="1">${config.unit}</text></svg>`;
  $("#chartHint").textContent=config.hint;
  $$(".chart-point").forEach((point)=>{ const choose=()=>{state.selectedAltitudeFt=Number(point.dataset.altitude);render();}; point.addEventListener("click",choose); point.addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" ")choose();}); });
}

function renderRouteMap(plan,result) {
  const fixes=plan.waypoints.filter((fix)=>Number.isFinite(fix.lat)&&Number.isFinite(fix.lon));
  const width=860,height=320,padX=58,padY=48,lats=fixes.map((w)=>w.lat),lons=fixes.map((w)=>w.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons),latSpan=maxLat-minLat||1,lonSpan=maxLon-minLon||1;
  const project=(fix)=>({x:padX+((fix.lon-minLon)/lonSpan)*(width-padX*2),y:height-padY-((fix.lat-minLat)/latSpan)*(height-padY*2)});
  const points=fixes.map(project),path=points.map((p,i)=>`${i?"L":"M"}${p.x},${p.y}`).join(" ");
  const stride=Math.max(1,Math.ceil(fixes.length/5));
  const dots=fixes.filter((_,i)=>i===0||i===fixes.length-1||i%stride===0).map((fix)=>{ const p=project(fix),endpoint=fix===fixes[0]||fix===fixes.at(-1); return `<g><circle cx="${p.x}" cy="${p.y}" r="${endpoint?7:4}" fill="${endpoint?"#52a964":"#fff"}" stroke="${endpoint?"#52a964":"#1976d2"}" stroke-width="2"/><text x="${p.x}" y="${p.y-14}" text-anchor="middle" fill="#62717f" font-size="9" font-weight="600">${escapeHtml(fix.ident)}</text></g>`; }).join("");
  $("#routeMap").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="routeLine"><stop stop-color="#1976d2"/><stop offset="1" stop-color="#52a964"/></linearGradient></defs><path d="${path}" fill="none" stroke="#edf3f7" stroke-width="12"/><path d="${path}" fill="none" stroke="url(#routeLine)" stroke-width="2" stroke-dasharray="5 5"/>${dots}</svg>`;
}

function renderVerticalProfile(plan,result) {
  const width=860,height=290,left=44,right=24,top=42,base=226,tocX=left+(result.climb.distanceNm/plan.distanceNm)*(width-left-right),todX=width-right-(result.descent.distanceNm/plan.distanceNm)*(width-left-right),cruiseY=top+(25000-result.altitudeFt)/25000*55;
  $("#verticalProfile").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="profileArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1976d2" stop-opacity=".12"/><stop offset="1" stop-color="#1976d2" stop-opacity="0"/></linearGradient></defs>${[10000,15000,20000,25000].map((alt)=>{const y=top+(25000-alt)/25000*120;return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#eef1f4"/><text x="${left-8}" y="${y+3}" text-anchor="end" fill="#8a97a2" font-size="8">FL${alt/100}</text>`;}).join("")}<path d="M${left},${base} L${tocX},${cruiseY} L${todX},${cruiseY} L${width-right},${base} L${left},${base}Z" fill="url(#profileArea)"/><path d="M${left},${base} L${tocX},${cruiseY}" stroke="#1976d2" stroke-width="2"/><path d="M${tocX},${cruiseY} L${todX},${cruiseY}" stroke="#52a964" stroke-width="2"/><path d="M${todX},${cruiseY} L${width-right},${base}" stroke="#d98b34" stroke-width="2"/><text x="${tocX}" y="${cruiseY-10}" text-anchor="middle" fill="#8794a0" font-size="8">TOC</text><text x="${todX}" y="${cruiseY-10}" text-anchor="middle" fill="#8794a0" font-size="8">TOD</text><text x="${(tocX+todX)/2}" y="${cruiseY-10}" text-anchor="middle" fill="#438b52" font-size="9" font-weight="700">FL${result.fl}</text><text x="${left}" y="${base+25}" fill="#43515d" font-size="9" font-weight="700">${escapeHtml(plan.origin.icao)}</text><text x="${width-right}" y="${base+25}" text-anchor="end" fill="#43515d" font-size="9" font-weight="700">${escapeHtml(plan.destination.icao)}</text></svg>`;
}

function renderLevelCards(results,recommended) {
  $("#levelCards").innerHTML=results.map((r)=>`<button class="level-card ${r.altitudeFt===recommended.altitudeFt?"recommended":""} ${r.altitudeFt===(state.selectedAltitudeFt||recommended.altitudeFt)?"selected":""}" data-level="${r.altitudeFt}" type="button"><b>FL${r.fl}</b><span>GAL · ETE · GS</span><strong>${number(r.fuelRequiredGal,1)} · ${formatTime(r.tripTimeHr)} · ${Math.round(r.gsKt)}</strong></button>`).join("");
  $$(".level-card").forEach((card)=>card.addEventListener("click",()=>{state.selectedAltitudeFt=Number(card.dataset.level);render();}));
}

function renderFuel(result) {
  const pieces=[{label:t("trip"),value:result.tripFuelGal,color:"#1976d2"},{label:t("reserve"),value:result.reserveFuelGal,color:"#52a964"},{label:t("contingency"),value:result.contingencyFuelGal,color:"#d98b34"},{label:t("taxi"),value:PERFORMANCE.taxiFuelGal,color:"#8a72d9"}],total=pieces.reduce((sum,p)=>sum+p.value,0);
  $("#fuelBar").innerHTML=pieces.map((p)=>`<span style="width:${p.value/total*100}%;background:${p.color}"></span>`).join("");
  $("#fuelLegend").innerHTML=pieces.map((p)=>`<div><i style="background:${p.color}"></i><span>${p.label}</span><b>${number(p.value,1)} gal</b></div>`).join("");
}

function updatePlanFields(plan) {
  $("#manualOrigin").value=plan.origin.icao; $("#manualDestination").value=plan.destination.icao; $("#manualDistance").value=Math.round(plan.distanceNm); $("#manualFl").value=Math.round(plan.plannedAltitudeFt/100);
  const weatherFixes=plan.waypoints.filter((fix)=>Number.isFinite(fix.windSpd)||Number.isFinite(fix.oatC));
  const sample=weatherFixes[Math.floor(weatherFixes.length/2)]||{}; if(Number.isFinite(sample.windDir))$("#manualWindDir").value=Math.round(sample.windDir); if(Number.isFinite(sample.windSpd))$("#manualWindSpd").value=Math.round(sample.windSpd); if(Number.isFinite(sample.oatC))$("#manualOat").value=Math.round(sample.oatC);
}

function createManualPlan() {
  const originIcao=$("#manualOrigin").value.trim().toUpperCase(),destinationIcao=$("#manualDestination").value.trim().toUpperCase(),distanceNm=Number($("#manualDistance").value),plannedAltitudeFt=Number($("#manualFl").value)*100,windDir=Number($("#manualWindDir").value),windSpd=Number($("#manualWindSpd").value),oatC=Number($("#manualOat").value);
  if(!/^[A-Z0-9]{3,4}$/.test(originIcao)||!/^[A-Z0-9]{3,4}$/.test(destinationIcao)||!Number.isFinite(distanceNm)||distanceNm<30) throw new Error(t("invalidRoute"));
  const matchOrigin=state.plan.origin.icao===originIcao?state.plan.origin:null,matchDestination=state.plan.destination.icao===destinationIcao?state.plan.destination:null;
  const origin=matchOrigin||{icao:originIcao,name:originIcao,lat:0,lon:0},destination=matchDestination||{icao:destinationIcao,name:destinationIcao,lat:.4,lon:Math.max(.5,distanceNm/60)};
  return {source:"MANUAL",origin,destination,alternate:"—",route:"DCT",distanceNm,plannedAltitudeFt,generatedAt:"",waypoints:[{ident:originIcao,lat:origin.lat,lon:origin.lon,distanceNm:0,windDir,windSpd,oatC},{ident:"DCT",lat:(origin.lat+destination.lat)/2,lon:(origin.lon+destination.lon)/2,distanceNm:distanceNm/2,windDir,windSpd,oatC},{ident:destinationIcao,lat:destination.lat,lon:destination.lon,distanceNm,windDir,windSpd,oatC}]};
}

function render() {
  applyTranslations();
  const analysis=calculatePlan(state),recommended=analysis.winners[state.criterion],selected=analysis.results.find((r)=>r.altitudeFt===state.selectedAltitudeFt)||recommended,plan=state.plan;
  $("#routeTitle").innerHTML=`${escapeHtml(plan.origin.icao)} <span>→</span> ${escapeHtml(plan.destination.icao)}`; $("#routeSource").textContent=t(plan.source==="SIMBRIEF"?"simbrief":plan.source==="MANUAL"?"manual":"demo"); $("#planTimestamp").textContent=`${number(plan.distanceNm)} NM · FL${Math.round(plan.plannedAltitudeFt/100)}`;
  $("#routeFrom").textContent=plan.origin.icao; $("#routeTo").textContent=plan.destination.icao;
  $("#kpiAltitude").textContent=`FL${recommended.fl}`; $("#kpiScore").textContent=recommended.score; $("#kpiFuel").innerHTML=`${number(recommended.fuelRequiredGal,1)} <small>GAL</small>`; $("#kpiFuelDelta").textContent=`${signed(state.fuelOnboardGal-recommended.fuelRequiredGal," gal")} ${t("margin")}`; $("#kpiTime").textContent=formatTime(recommended.tripTimeHr); $("#kpiGs").textContent=`${Math.round(recommended.gsKt)} kt GS`; $("#kpiRange").innerHTML=`${number(recommended.maxRangeNm)} <small>NM</small>`; $("#kpiSpecificRange").textContent=`${number(recommended.specificRangeNmGal,1)} NM/gal`;
  renderPerformanceChart(analysis.results,recommended); renderRouteMap(plan,selected); renderVerticalProfile(plan,selected); renderLevelCards(analysis.results,recommended); renderFuel(selected);
  $("#avgWind").textContent=`${String(Math.round(selected.weather.windDir)).padStart(3,"0")}° / ${Math.round(selected.weather.windSpeedKt)} kt`; $("#isaDeviation").textContent=signed(selected.weather.isaDeviationC,"°C"); $("#windComponent").textContent=signed(selected.weather.componentKt," kt"); $("#cruiseOat").textContent=`${Math.round(selected.weather.oatC)}°C`; $("#alternate").textContent=plan.alternate||"—";
  $("#tocTodNote").textContent=`TOC ${Math.round(selected.climb.distanceNm)} NM · TOD ${Math.round(selected.descent.distanceNm)} NM`; $("#climbStats").textContent=`${Math.round(selected.climb.timeHr*60)} min · ${Math.round(selected.climb.distanceNm)} NM · ${number(selected.climb.fuelGal,1)} gal`; $("#cruiseStats").textContent=`${Math.round(selected.cruiseTimeHr*60)} min · ${Math.round(selected.cruiseDistanceNm)} NM · ${number(selected.cruiseFuelGal,1)} gal`; $("#descentStats").textContent=`${Math.round(selected.descent.timeHr*60)} min · ${Math.round(selected.descent.distanceNm)} NM · ${number(selected.descent.fuelGal,1)} gal`;
  const fuelRank=[...analysis.results].sort((a,b)=>a.fuelRequiredGal-b.fuelRequiredGal).findIndex((r)=>r.altitudeFt===recommended.altitudeFt)+1,timeRank=[...analysis.results].sort((a,b)=>a.tripTimeHr-b.tripTimeHr).findIndex((r)=>r.altitudeFt===recommended.altitudeFt)+1;
  $("#whyTitle").textContent=`FL${recommended.fl}`; $("#scoreRing").textContent=recommended.score; $("#whyList").innerHTML=[t("fuelRank",fuelRank),t("timeRank",timeRank,Math.round(recommended.gsKt)),t("windLine",signed(recommended.weather.componentKt),signed(recommended.weather.isaDeviationC,"°C"))].map((line)=>`<li>${escapeHtml(line)}</li>`).join("");
  $("#fuelRequiredSide").textContent=`${number(selected.fuelRequiredGal,1)} gal`; $("#selectionNote").textContent=`FL${selected.fl} · ${number(selected.fuelRequiredGal,1)} gal · ${formatTime(selected.tripTimeHr)}`;
  $("#payloadOutput").textContent=`${number(state.payloadLb)} lb`; $("#fuelOutput").textContent=`${number(state.fuelOnboardGal)} gal`;
  const weight=AIRCRAFT.emptyWeightLb+state.payloadLb+state.fuelOnboardGal*AIRCRAFT.fuelDensityLbGal,delta=AIRCRAFT.maxGrossWeightLb-weight; $("#weightValue").textContent=`${number(weight)} lb`; $("#weightBar").style.width=`${Math.min(100,weight/AIRCRAFT.maxGrossWeightLb*100)}%`; $("#weightBar").style.background=delta<0?"#dc5661":"linear-gradient(90deg,var(--blue),var(--green))"; $("#weightNote").textContent=`${number(Math.abs(delta))} lb ${t(delta>=0?"belowMax":"aboveMax")}`; $("#weightNote").style.color=delta<0?"var(--red)":"";
}

$$('[data-language]').forEach((button)=>button.addEventListener("click",()=>{state.language=button.dataset.language;localStorage.setItem("velocityxl.language",state.language);render();}));
$$('[data-mode]').forEach((button)=>button.addEventListener("click",()=>{state.mode=button.dataset.mode;state.selectedAltitudeFt=null;$$('[data-mode]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-metric]').forEach((button)=>button.addEventListener("click",()=>{state.metric=button.dataset.metric;$$('[data-metric]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-view]').forEach((button)=>button.addEventListener("click",()=>{$$('[data-view]').forEach((item)=>item.classList.toggle("active",item===button));$$('[data-view-panel]').forEach((panel)=>panel.classList.toggle("active",panel.dataset.viewPanel===button.dataset.view));}));
$("#criterionSelect").addEventListener("change",(event)=>{state.criterion=event.target.value;state.selectedAltitudeFt=null;render();}); $("#payloadInput").addEventListener("input",(event)=>{state.payloadLb=Number(event.target.value);render();}); $("#fuelInput").addEventListener("input",(event)=>{state.fuelOnboardGal=Number(event.target.value);render();}); $("#reserveInput").addEventListener("change",(event)=>{state.reserveMinutes=Number(event.target.value);render();});

$("#quickPlanForm").addEventListener("submit",(event)=>{event.preventDefault();try{state.plan=createManualPlan();state.selectedAltitudeFt=null;render();showToast(t("manualApplied"));}catch(error){showToast(error.message,true);}});
$("#importLatest").addEventListener("click",async()=>{const input=$("#quickPilotId"),identifier=input.value.trim();if(!identifier){showToast(t("missingId"),true);input.focus();return;}const button=$("#importLatest"),previous=button.textContent;try{button.disabled=true;button.textContent="…";let plan;try{plan=await fetchLatestOFP(identifier,"userid");}catch(firstError){plan=await fetchLatestOFP(identifier,"username");}state.plan=plan;state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.simbriefIdentifier",identifier);updatePlanFields(plan);render();showToast(`${plan.origin.icao} → ${plan.destination.icao} · ${t("imported")}`);}catch(error){showToast(error.message||t("importError"),true);}finally{button.disabled=false;button.textContent=previous;}});

const savedIdentifier=localStorage.getItem("velocityxl.simbriefIdentifier"); if(savedIdentifier)$("#quickPilotId").value=savedIdentifier;
updatePlanFields(state.plan); render();
