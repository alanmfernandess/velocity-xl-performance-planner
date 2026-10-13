import { AIRCRAFT, PERFORMANCE, DEMO_PLAN, ALTITUDES_FT } from "./config.js?v=20261013-7";
import { calculateAlternateDiversion, calculateEtpPnr, calculateGlideCorridor, calculateLoadOptimization, calculatePlan, calculateStepClimbs, clamp, compareScenarios, deriveCalibration } from "./engine.js?v=20261013-7";
import { fetchLatestOFP } from "./simbrief.js?v=20261013-7";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));

const COPY = {
  "pt-BR": {
    pilotId:"Pilot ID / Alias", importLatest:"Importar OFP",
    bestLevel:"Melhor nível", fuelRequired:"Combustível requerido", estimatedTime:"Tempo estimado", maximumRange:"Alcance máximo", performance:"Performance", route:"Rota", profile:"Perfil", altitudeComparison:"Comparação por altitude", selectedLevel:"Selecionado", recommendedLevel:"Recomendado", windComponent:"Componente", alternate:"Alternativa", flightProfile:"Perfil de voo",
    payload:"Carga útil", fuelOnboard:"Combustível a bordo", reserve:"Reserva", takeoffWeight:"Peso de decolagem", fuel:"Combustível", allLevels:"Todos os níveis", climb:"SUBIDA", cruise:"CRUZEIRO", descent:"DESCIDA", power:"Potência", automatic:"Automático", viable:"VIÁVEL", marginalStatus:"MARGINAL", notViable:"NÃO VIÁVEL", profileLimit:"PERFIL", ceilingLimit:"TETO", disclaimer:"Simulação somente · Modelo não certificado · Sem telemetria",
    demo:"DEMO", simbrief:"SIMBRIEF", fuelHint:"Menor valor", timeHint:"Menor valor", efficiencyHint:"Maior valor", margin:"de margem", belowMax:"abaixo do máximo", aboveMax:"acima do máximo", missingId:"Informe o Pilot ID ou Alias.", importError:"Não foi possível importar o OFP.",
    fuelRank:(rank)=>`${rank}º em consumo`, timeRank:(rank,gs)=>`${rank}º em tempo · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingência", taxi:"Taxi",
    manualUpdate:"Atualização manual", continueLabel:"Continuar", returnLabel:"Retornar", position:"Posição", fuelRemaining:"Combustível restante", update:"Atualizar", calibration:"Calibração", observedTas:"TAS observada", observedFuelFlow:"Fuel flow observado", calibrate:"Calibrar", reset:"Redefinir", beyondDestination:"Além do destino", noStep:"Sem step climb", nextStep:"Próximo", updated:"MANUAL", preflight:"PRÉ-VOO",
    destinationAlternate:"Destino → alternado", diversionFrom:"Desvio a partir de", fuelAtDestination:"Combustível no destino", alternateFuel:"Combustível até alternado", alternateLanding:"Pouso no alternado", currentScenario:"ATUAL", comparisonScenario:"COMPARAÇÃO", applyScenario:"Aplicar B", recommendedFuel:"Combustível recomendado", maximumFuelByWeight:"Máximo pelo peso", maximumPayload:"Payload máximo", optimizedWeight:"Peso otimizado", applyOptimization:"Aplicar otimização", glideRatio:"Razão de planeio", bestGlide:"Melhor planeio", glideRange:"Alcance sem vento", glideTime:"Tempo estimado", reducePayload:"reduzir payload", noAdjustment:"sem ajuste", noAlternateData:"SEM COORDENADAS",
    stepAt:(waypoint,fl)=>`${waypoint} · FL${fl}`, stepSaving:(fuel,minutes)=>`−${fuel} · ${minutes} min`,
  },
  "en-US": {
    pilotId:"Pilot ID / Alias", importLatest:"Import OFP",
    bestLevel:"Best level", fuelRequired:"Fuel required", estimatedTime:"Estimated time", maximumRange:"Maximum range", performance:"Performance", route:"Route", profile:"Profile", altitudeComparison:"Altitude comparison", selectedLevel:"Selected", recommendedLevel:"Recommended", windComponent:"Component", alternate:"Alternate", flightProfile:"Flight profile",
    payload:"Payload", fuelOnboard:"Fuel onboard", reserve:"Reserve", takeoffWeight:"Takeoff weight", fuel:"Fuel", allLevels:"All levels", climb:"CLIMB", cruise:"CRUISE", descent:"DESCENT", power:"Power", automatic:"Automatic", viable:"VIABLE", marginalStatus:"MARGINAL", notViable:"NOT VIABLE", profileLimit:"PROFILE", ceilingLimit:"CEILING", disclaimer:"Simulation only · Non-certified model · No telemetry",
    demo:"DEMO", simbrief:"SIMBRIEF", fuelHint:"Lower is better", timeHint:"Lower is better", efficiencyHint:"Higher is better", margin:"margin", belowMax:"below maximum", aboveMax:"above maximum", missingId:"Enter a Pilot ID or Alias.", importError:"Could not import the OFP.",
    fuelRank:(rank)=>`#${rank} fuel`, timeRank:(rank,gs)=>`#${rank} time · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingency", taxi:"Taxi",
    manualUpdate:"Manual update", continueLabel:"Continue", returnLabel:"Return", position:"Position", fuelRemaining:"Fuel remaining", update:"Update", calibration:"Calibration", observedTas:"Observed TAS", observedFuelFlow:"Observed fuel flow", calibrate:"Calibrate", reset:"Reset", beyondDestination:"Beyond destination", noStep:"No step climb", nextStep:"Next", updated:"MANUAL", preflight:"PREFLIGHT",
    destinationAlternate:"Destination → alternate", diversionFrom:"Diversion from", fuelAtDestination:"Fuel at destination", alternateFuel:"Fuel to alternate", alternateLanding:"Alternate landing", currentScenario:"CURRENT", comparisonScenario:"COMPARISON", applyScenario:"Apply B", recommendedFuel:"Recommended fuel", maximumFuelByWeight:"Maximum by weight", maximumPayload:"Maximum payload", optimizedWeight:"Optimized weight", applyOptimization:"Apply optimization", glideRatio:"Glide ratio", bestGlide:"Best glide", glideRange:"Still-air range", glideTime:"Estimated time", reducePayload:"reduce payload", noAdjustment:"no adjustment", noAlternateData:"NO COORDINATES",
    stepAt:(waypoint,fl)=>`${waypoint} · FL${fl}`, stepSaving:(fuel,minutes)=>`−${fuel} · ${minutes} min`,
  },
};

function storedJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

const state = {
  plan: structuredClone(DEMO_PLAN), mode:"NORMAL", payloadLb:520, fuelOnboardGal:77, reserveMinutes:45,
  metric:"fuel", selectedAltitudeFt:null, language:localStorage.getItem("velocityxl.language") || "pt-BR",
  weightUnit:localStorage.getItem("velocityxl.weightUnit") || "lb", fuelUnit:localStorage.getItem("velocityxl.fuelUnit") || "gal", fontSize:localStorage.getItem("velocityxl.fontSize") || "medium",
  calibration:storedJson("velocityxl.calibration", {}),
  powerSetting:storedJson("velocityxl.powerSetting", { type:"AUTO", mapInHg:24, rpm:2450 }),
  manual:{ active:false, waypointIndex:0, distanceNm:0, fuelRemainingGal:77, altitudeFt:null },
  diversionWaypointIndex:0,
  scenarioB:{ mode:"ECON", altitudeFt:16000, payloadLb:520, fuelOnboardGal:77 },
};
const t = (key, ...args) => typeof COPY[state.language][key] === "function" ? COPY[state.language][key](...args) : COPY[state.language][key] || key;
const number = (value, digits = 0) => Number(value).toLocaleString(state.language, { minimumFractionDigits:digits, maximumFractionDigits:digits });
const signed = (value, suffix="") => `${value >= 0 ? "+" : "−"}${number(Math.abs(Math.round(value)))}${suffix}`;
const signedNumber = (value, digits, suffix="") => `${value >= 0 ? "+" : "−"}${number(Math.abs(value),digits)}${suffix}`;
const formatTime = (hours) => { const minutes=Math.max(0,Math.round(hours*60)); return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`; };
const weightValue=(lb)=>state.weightUnit==="kg"?lb*.45359237:lb;
const fuelValue=(gal)=>state.fuelUnit==="l"?gal*3.785411784:gal;
const fuelFromDisplay=(value)=>state.fuelUnit==="l"?value/3.785411784:value;
const weightFromDisplay=(value)=>state.weightUnit==="kg"?value/.45359237:value;
const weightLabel=()=>state.weightUnit==="kg"?"kg":"lb";
const fuelLabel=()=>state.fuelUnit==="l"?"L":"gal";
const formatWeight=(lb,digits=0)=>`${number(weightValue(lb),digits)} ${weightLabel()}`;
const formatFuel=(gal,digits=1)=>`${number(fuelValue(gal),digits)} ${fuelLabel()}`;

function showToast(message, error=false) {
  const toast=$("#toast"); toast.textContent=message; toast.classList.toggle("error",error); toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove("show"),3000);
}

function applyTranslations() {
  document.documentElement.lang=state.language;
  document.documentElement.dataset.fontSize=state.fontSize;
  $$('[data-i18n]').forEach((element)=>{ element.textContent=t(element.dataset.i18n); });
  $$('[data-i18n-title]').forEach((element)=>{ const label=t(element.dataset.i18nTitle); element.title=label; element.setAttribute("aria-label",label); });
  $$('[data-language]').forEach((button)=>button.classList.toggle("active",button.dataset.language===state.language));
  $$('[data-font-size]').forEach((button)=>button.classList.toggle("active",button.dataset.fontSize===state.fontSize));
  $$('[data-weight-unit]').forEach((button)=>button.classList.toggle("active",button.dataset.weightUnit===state.weightUnit));
  $$('[data-fuel-unit]').forEach((button)=>button.classList.toggle("active",button.dataset.fuelUnit===state.fuelUnit));
  $$('[data-power-type]').forEach((button)=>button.classList.toggle("active",button.dataset.powerType===state.powerSetting.type));
  $("#powerManualFields").hidden=state.powerSetting.type!=="MANUAL";
  const metricLabels={fuel:state.language==="pt-BR"?"Combustível":"Fuel",time:state.language==="pt-BR"?"Tempo":"Time",efficiency:state.language==="pt-BR"?"Eficiência":"Efficiency"};
  $$('[data-metric]').forEach((button)=>{ button.textContent=metricLabels[button.dataset.metric]; });
}

function metricConfig() {
  if(state.metric==="time") return { get:(result)=>result.tripTimeHr, unit:"h", hint:t("timeHint"), value:formatTime };
  if(state.metric==="efficiency") return { get:(result)=>state.fuelUnit==="l"?result.specificRangeNmGal/3.785411784:result.specificRangeNmGal, unit:state.fuelUnit==="l"?"NM/L":"NM/GAL", hint:t("efficiencyHint"), value:(v)=>number(v,1) };
  return { get:(result)=>fuelValue(result.fuelRequiredGal), unit:state.fuelUnit==="l"?"L":"GAL", hint:t("fuelHint"), value:(v)=>number(v,1) };
}

function renderPerformanceChart(results,recommended,selectedResult) {
  const config=metricConfig(), values=results.map((r)=>config.get(r));
  const width=860,height=330,left=48,right=18,top=34,bottom=48,min=Math.min(...values),max=Math.max(...values),spread=max-min||1;
  const x=(i)=>left+(i/(results.length-1))*(width-left-right), y=(value)=>top+((max-value)/spread)*(height-top-bottom-18)+9;
  const points=results.map((r,i)=>`${x(i)},${y(config.get(r))}`).join(" ");
  const area=`${left},${height-bottom} ${points} ${x(results.length-1)},${height-bottom}`;
  const grid=[0,.25,.5,.75,1].map((ratio)=>{ const yy=top+ratio*(height-top-bottom),value=max-ratio*spread; return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#edf0f3"/><text x="${left-10}" y="${yy+3}" fill="#8b98a4" font-size="8" text-anchor="end">${config.value(value)}</text>`; }).join("");
  const dots=results.map((r,i)=>{ const value=config.get(r),unavailable=r.feasibility.status==="unavailable",best=r.altitudeFt===recommended.altitudeFt&&!unavailable,selected=r.altitudeFt===selectedResult.altitudeFt,dotColor=unavailable?"#aeb8c1":best?"#52a964":"#1976d2",softColor=unavailable?"#f0f2f4":best?"#edf8ef":"#e9f3fd"; return `<g class="chart-point ${unavailable?"unavailable":""}" data-altitude="${r.altitudeFt}" data-unavailable="${unavailable}" tabindex="${unavailable?"-1":"0"}" role="button" aria-disabled="${unavailable}"><circle cx="${x(i)}" cy="${y(value)}" r="${selected?10:6}" fill="${softColor}"/><circle cx="${x(i)}" cy="${y(value)}" r="${best?5:4}" fill="${dotColor}" stroke="#fff" stroke-width="2"/>${best?`<g transform="translate(${x(i)-27},${y(value)-35})"><rect width="54" height="19" rx="9" fill="#52a964"/><text x="27" y="12.5" fill="#fff" text-anchor="middle" font-size="7" font-weight="700">${config.value(value)}</text></g>`:""}<text x="${x(i)}" y="${height-19}" fill="${unavailable?"#aeb8c1":best?"#438b52":"#84929e"}" font-size="8" text-anchor="middle">FL${r.fl}</text></g>`; }).join("");
  $("#performanceChart").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1976d2" stop-opacity=".13"/><stop offset="1" stop-color="#1976d2" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#chartArea)"/><polyline points="${points}" fill="none" stroke="#1976d2" stroke-width="2" stroke-linejoin="round"/>${dots}<text x="${left}" y="14" fill="#8794a0" font-size="7" letter-spacing="1">${config.unit}</text></svg>`;
  $("#chartHint").textContent=config.hint;
  $$(".chart-point").filter((point)=>point.dataset.unavailable!=="true").forEach((point)=>{ const choose=()=>{state.selectedAltitudeFt=Number(point.dataset.altitude);render();}; point.addEventListener("click",choose); point.addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" ")choose();}); });
}

function renderRouteMap(plan,result,navigation) {
  const fixes=plan.waypoints.filter((fix)=>Number.isFinite(fix.lat)&&Number.isFinite(fix.lon));
  const width=860,height=320,padX=58,padY=48,lats=fixes.map((w)=>w.lat),lons=fixes.map((w)=>w.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons),latSpan=maxLat-minLat||1,lonSpan=maxLon-minLon||1;
  const project=(fix)=>({x:padX+((fix.lon-minLon)/lonSpan)*(width-padX*2),y:height-padY-((fix.lat-minLat)/latSpan)*(height-padY*2)});
  const points=fixes.map(project),path=points.map((p,i)=>`${i?"L":"M"}${p.x},${p.y}`).join(" ");
  const pointAtFraction=(fraction)=>{
    const lengths=points.slice(1).map((point,index)=>Math.hypot(point.x-points[index].x,point.y-points[index].y));
    const total=lengths.reduce((sum,value)=>sum+value,0)||1;
    let target=Math.max(0,Math.min(1,fraction))*total;
    for(let index=0;index<lengths.length;index+=1){if(target<=lengths[index]){const ratio=lengths[index]?target/lengths[index]:0;return{x:points[index].x+(points[index+1].x-points[index].x)*ratio,y:points[index].y+(points[index+1].y-points[index].y)*ratio};}target-=lengths[index];}
    return points.at(-1);
  };
  const stride=Math.max(1,Math.ceil(fixes.length/5));
  const dots=fixes.filter((_,i)=>i===0||i===fixes.length-1||i%stride===0).map((fix)=>{ const p=project(fix),endpoint=fix===fixes[0]||fix===fixes.at(-1); return `<g><circle cx="${p.x}" cy="${p.y}" r="${endpoint?7:4}" fill="${endpoint?"#52a964":"#fff"}" stroke="${endpoint?"#52a964":"#1976d2"}" stroke-width="2"/><text x="${p.x}" y="${p.y-14}" text-anchor="middle" fill="#62717f" font-size="9" font-weight="600">${escapeHtml(fix.ident)}</text></g>`; }).join("");
  const navMarkers=[{label:"ETP",point:pointAtFraction(navigation.etp.fraction),color:"#1976d2"},{label:"PNR",point:pointAtFraction(navigation.pnr.fraction),color:"#d98b34"}].map(({label,point,color},index)=>`<g><circle cx="${point.x}" cy="${point.y}" r="7" fill="#fff" stroke="${color}" stroke-width="3"/><rect x="${point.x-18}" y="${point.y+(index?-36:13)}" width="36" height="18" rx="9" fill="${color}"/><text x="${point.x}" y="${point.y+(index?-24:25)}" text-anchor="middle" fill="#fff" font-size="8" font-weight="700">${label}</text></g>`).join("");
  $("#routeMap").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="routeLine"><stop stop-color="#1976d2"/><stop offset="1" stop-color="#52a964"/></linearGradient></defs><path d="${path}" fill="none" stroke="#edf3f7" stroke-width="12"/><path d="${path}" fill="none" stroke="url(#routeLine)" stroke-width="2" stroke-dasharray="5 5"/>${dots}${navMarkers}</svg>`;
}

function renderVerticalProfile(plan,result,stepPlan) {
  const width=860,height=290,left=44,right=24,top=42,base=226,plotWidth=width-left-right,tocX=left+(result.climb.distanceNm/plan.distanceNm)*plotWidth,todX=width-right-(result.descent.distanceNm/plan.distanceNm)*plotWidth;
  const yForAltitude=(altitudeFt)=>top+(25000-altitudeFt)/25000*120;
  const cruiseEnd=Math.max(tocX,todX),startAltitude=stepPlan.initialAltitudeFt;
  let profilePath=`M${left},${base} L${tocX},${yForAltitude(startAltitude)}`;
  let lastY=yForAltitude(startAltitude);
  const stepLabels=stepPlan.steps.map((step)=>{const stepX=left+(step.distanceNm/plan.distanceNm)*plotWidth,nextY=yForAltitude(step.altitudeFt);profilePath+=` L${stepX},${lastY} L${stepX+7},${nextY}`;lastY=nextY;return `<g><circle cx="${stepX}" cy="${nextY}" r="4" fill="#52a964" stroke="#fff" stroke-width="2"/><text x="${stepX}" y="${nextY-10}" text-anchor="middle" fill="#438b52" font-size="8" font-weight="700">FL${step.altitudeFt/100}</text></g>`;}).join("");
  profilePath+=` L${cruiseEnd},${lastY} L${width-right},${base}`;
  $("#verticalProfile").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img">${[10000,15000,20000,25000].map((alt)=>{const y=yForAltitude(alt);return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#eef1f4"/><text x="${left-8}" y="${y+3}" text-anchor="end" fill="#8a97a2" font-size="8">FL${alt/100}</text>`;}).join("")}<path d="${profilePath}" fill="none" stroke="#1976d2" stroke-width="2" stroke-linejoin="round"/><text x="${tocX}" y="${yForAltitude(startAltitude)-10}" text-anchor="middle" fill="#8794a0" font-size="8">TOC</text><text x="${todX}" y="${lastY-10}" text-anchor="middle" fill="#8794a0" font-size="8">TOD</text>${stepLabels}<text x="${left}" y="${base+25}" fill="#43515d" font-size="9" font-weight="700">${escapeHtml(plan.origin.icao)}</text><text x="${width-right}" y="${base+25}" text-anchor="end" fill="#43515d" font-size="9" font-weight="700">${escapeHtml(plan.destination.icao)}</text></svg>`;
}

function levelFeasibilityLabel(result) {
  const feasibility=result.feasibility;
  if(feasibility.status==="viable") return "";
  if(feasibility.status==="marginal") return t("marginalStatus");
  if(feasibility.primaryReason==="FUEL") return signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`);
  if(feasibility.primaryReason==="WEIGHT") return `+${formatWeight(Math.abs(feasibility.weightMarginLb))}`;
  if(feasibility.primaryReason==="ALTITUDE") return t("ceilingLimit");
  return t("profileLimit");
}

function renderLevelCards(results,recommended,selected) {
  const unit=state.fuelUnit==="l"?"L":"GAL";
  $("#levelCards").innerHTML=results.map((r)=>{const status=r.feasibility.status,label=levelFeasibilityLabel(r),recommendedClass=r.altitudeFt===recommended.altitudeFt&&status!=="unavailable"?"recommended":"";return `<button class="level-card ${status} ${recommendedClass} ${r.altitudeFt===selected.altitudeFt?"selected":""}" data-level="${r.altitudeFt}" type="button" ${status==="unavailable"?"disabled aria-disabled=\"true\"":""}><b>FL${r.fl}</b><span>${unit} · ETE · GS</span><strong>${number(fuelValue(r.fuelRequiredGal),1)} · ${formatTime(r.tripTimeHr)} · ${Math.round(r.gsKt)}</strong><em>${label?escapeHtml(label):"&nbsp;"}</em></button>`;}).join("");
  $$(".level-card:not(:disabled)").forEach((card)=>card.addEventListener("click",()=>{state.selectedAltitudeFt=Number(card.dataset.level);render();}));
}

function renderFuel(result) {
  const pieces=[{label:t("trip"),value:result.tripFuelGal,color:"#1976d2"},{label:t("reserve"),value:result.reserveFuelGal,color:"#52a964"},{label:t("contingency"),value:result.contingencyFuelGal,color:"#d98b34"},{label:t("taxi"),value:PERFORMANCE.taxiFuelGal,color:"#8a72d9"}],total=pieces.reduce((sum,p)=>sum+p.value,0);
  $("#fuelBar").innerHTML=pieces.map((p)=>`<span style="width:${p.value/total*100}%;background:${p.color}"></span>`).join("");
  $("#fuelLegend").innerHTML=pieces.map((p)=>`<div><i style="background:${p.color}"></i><span>${p.label}</span><b>${formatFuel(p.value,1)}</b></div>`).join("");
}

function renderFlightTools(plan,navigation,stepPlan,selected) {
  $("#etpDistance").textContent=`${number(navigation.etp.distanceNm)} NM`;
  $("#etpDetails").textContent=`${navigation.etp.waypoint.ident} · ${formatTime(navigation.etp.elapsedHr)} · ${formatFuel(navigation.etp.fuelRemainingGal,1)}`;
  const pnrExtra=Math.max(0,navigation.pnr.rawDistanceNm-plan.distanceNm);
  $("#pnrDistance").textContent=navigation.pnr.beyondDestination?`DEST + ${number(pnrExtra)} NM`:`${number(navigation.pnr.distanceNm)} NM`;
  $("#pnrDetails").textContent=navigation.pnr.beyondDestination?t("beyondDestination"):`${navigation.pnr.waypoint.ident} · ${formatTime(navigation.pnr.elapsedHr)} · ${formatFuel(navigation.pnr.fuelRemainingGal,1)}`;
  $("#outboundGs").textContent=`${Math.round(navigation.outboundGsKt)} kt`;
  $("#returnGs").textContent=`${Math.round(navigation.returnGsKt)} kt`;
  $("#etpScaleMarker").style.left=`${navigation.etp.fraction*100}%`;
  $("#pnrScaleMarker").style.left=`${navigation.pnr.fraction*100}%`;

  if(stepPlan.next){
    $("#stepHeadline").textContent=`${t("nextStep")} · ${stepPlan.next.waypoint} → FL${stepPlan.next.altitudeFt/100}`;
    $("#stepMeta").textContent=`${formatFuel(stepPlan.next.savingGal,1)} · ${number(stepPlan.next.distanceNm)} NM`;
  }else{
    $("#stepHeadline").textContent=`FL${stepPlan.initialAltitudeFt/100}`;
    $("#stepMeta").textContent=t("noStep");
  }
  const startLabel=state.manual.active?`${t("updated")} · FL${stepPlan.initialAltitudeFt/100}`:`${t("preflight")} · FL${stepPlan.initialAltitudeFt/100}`;
  $("#stepTrack").innerHTML=[`<div class="step-item"><b>${startLabel}</b><span>${number(stepPlan.startDistanceNm)} NM · ${formatFuel(stepPlan.startFuelGal,1)}</span></div>`,...stepPlan.steps.map((step)=>`<div class="step-item"><b>${t("stepAt",escapeHtml(step.waypoint),step.altitudeFt/100)}</b><span>${number(step.distanceNm)} NM · ${t("stepSaving",formatFuel(step.savingGal,1),number(step.minutes))}</span></div>`)].join("");

  const waypointSelect=$("#manualWaypoint"),currentWaypointValue=String(state.manual.waypointIndex);
  waypointSelect.innerHTML=plan.waypoints.map((waypoint,index)=>`<option value="${index}">${escapeHtml(waypoint.ident)} · ${number(waypoint.distanceNm)} NM</option>`).join("");
  waypointSelect.value=currentWaypointValue;
  $("#manualAltitude").innerHTML=ALTITUDES_FT.map((altitude)=>`<option value="${altitude}">FL${altitude/100}</option>`).join("");
  $("#manualAltitude").value=String(state.manual.altitudeFt||selected.altitudeFt);
  $("#manualFuel").value=number(fuelValue(state.manual.active?state.manual.fuelRemainingGal:state.fuelOnboardGal),1).replace(/[^0-9,.-]/g,"").replace(",",".");
  $("#manualFuelUnit").textContent=fuelLabel();
  $("#observedFuelFlowUnit").textContent=state.fuelUnit==="l"?"L/h":"gal/h";
  $("#calibrationMode").textContent=state.mode;
  const factors=state.calibration[state.mode]||{tasFactor:1,fuelFlowFactor:1};
  $("#calibrationFactors").textContent=`TAS ×${number(factors.tasFactor||1,2)} · FF ×${number(factors.fuelFlowFactor||1,2)}`;
}

function statusLabel(status) {
  if(status==="viable") return t("viable");
  if(status==="marginal") return t("marginalStatus");
  if(status==="unknown") return t("noAlternateData");
  return t("notViable");
}

function setStatusPill(selector,status) {
  const element=$(selector);
  element.textContent=statusLabel(status);
  element.className=`status-pill ${status}`;
}

function renderAlternateAdvisor(plan,advice) {
  const waypointSelect=$("#diversionWaypoint");
  waypointSelect.innerHTML=plan.waypoints.map((waypoint,index)=>`<option value="${index}">${escapeHtml(waypoint.ident)} · ${number(waypoint.distanceNm)} NM</option>`).join("");
  waypointSelect.value=String(Math.min(state.diversionWaypointIndex,Math.max(0,plan.waypoints.length-1)));
  const alternateIdent=advice.alternate?.icao||plan.alternate||"—";
  $("#alternateRoute").textContent=`${plan.destination.icao} → ${alternateIdent}`;
  $("#diversionRoute").textContent=`${advice.position?.ident||plan.origin.icao} → ${alternateIdent}`;
  if(advice.destination){
    $("#alternateLegMeta").textContent=`${number(advice.destination.distanceNm)} NM · ${formatTime(advice.destination.timeHr)} · ${formatFuel(advice.destination.fuelGal,1)}`;
    $("#fuelAtDestination").textContent=formatFuel(advice.fuelAtDestinationGal,1);
    $("#alternateFuel").textContent=formatFuel(advice.destination.fuelGal,1);
    $("#alternateLandingFuel").textContent=formatFuel(advice.destination.landingFuelGal,1);
    setStatusPill("#alternateStatus",advice.destination.status);
  }else{
    $("#alternateLegMeta").textContent="—";
    $("#fuelAtDestination").textContent=formatFuel(advice.fuelAtDestinationGal||0,1);
    $("#alternateFuel").textContent="—";
    $("#alternateLandingFuel").textContent="—";
    setStatusPill("#alternateStatus","unknown");
  }
  if(advice.diversion){
    $("#diversionLegMeta").textContent=`${number(advice.diversion.distanceNm)} NM · ${formatTime(advice.diversion.timeHr)} · ${formatFuel(advice.diversion.fuelGal,1)} · ${formatFuel(advice.diversion.landingFuelGal,1)}`;
    setStatusPill("#diversionStatus",advice.diversion.status);
  }else{
    $("#diversionLegMeta").textContent="—";
    setStatusPill("#diversionStatus","unknown");
  }
}

function scenarioStats(result) {
  const key=result.feasibility.status==="viable"?"viable":result.feasibility.status==="marginal"?"marginalStatus":"notViable";
  return `<span><b>${escapeHtml(t("fuel"))}</b><strong>${formatFuel(result.fuelRequiredGal,1)}</strong></span><span><b>ETE</b><strong>${formatTime(result.tripTimeHr)}</strong></span><span><b>GS</b><strong>${number(result.gsKt)} kt</strong></span><span><b>${escapeHtml(t(key))}</b><strong>${signedNumber(fuelValue(result.feasibility.fuelMarginGal),1,` ${fuelLabel()}`)}</strong></span>`;
}

function renderScenarioComparison(comparison,selected) {
  $("#scenarioAName").textContent=`${state.mode} · FL${selected.fl}`;
  $("#scenarioAStats").innerHTML=scenarioStats(comparison.a);
  $("#scenarioBStats").innerHTML=scenarioStats(comparison.b);
  $("#scenarioBMode").value=state.scenarioB.mode;
  if(!$("#scenarioBAltitude").options.length) $("#scenarioBAltitude").innerHTML=ALTITUDES_FT.map((altitude)=>`<option value="${altitude}">FL${altitude/100}</option>`).join("");
  $("#scenarioBAltitude").value=String(state.scenarioB.altitudeFt);
  if(document.activeElement!==$("#scenarioBPayload")) $("#scenarioBPayload").value=number(weightValue(state.scenarioB.payloadLb),0).replace(/\D/g,"");
  if(document.activeElement!==$("#scenarioBFuel")) $("#scenarioBFuel").value=number(fuelValue(state.scenarioB.fuelOnboardGal),1).replace(/[^0-9,.-]/g,"").replace(",",".");
  $("#scenarioBWeightUnit").textContent=weightLabel();
  $("#scenarioBFuelUnit").textContent=fuelLabel();
  $("#scenarioDelta").innerHTML=`<span>Δ ${escapeHtml(t("fuel"))}<strong>${signedNumber(fuelValue(comparison.delta.fuelGal),1,` ${fuelLabel()}`)}</strong></span><span>Δ ETE<strong>${signedNumber(comparison.delta.timeHr*60,0," min")}</strong></span><span>Δ GS<strong>${signedNumber(comparison.delta.gsKt,0," kt")}</strong></span><span>Δ MARGIN<strong>${signedNumber(fuelValue(comparison.delta.marginGal),1,` ${fuelLabel()}`)}</strong></span>`;
}

function renderLoadOptimizer(optimizer) {
  $("#loadRecommendedFuel").textContent=formatFuel(optimizer.recommendedFuelGal,1);
  $("#loadMaxFuel").textContent=formatFuel(optimizer.maxFuelByWeightGal,1);
  $("#loadMaxPayload").textContent=formatWeight(optimizer.maxPayloadLb);
  $("#loadOptimizedWeight").textContent=formatWeight(optimizer.optimizedWeightLb);
  setStatusPill("#loadStatus",optimizer.feasible?"viable":"unavailable");
  $("#loadAdjustment").textContent=optimizer.payloadReductionLb>0?`${t("reducePayload")} ${formatWeight(optimizer.payloadReductionLb)}`:t("noAdjustment");
}

function renderGlideCorridor(plan,glide) {
  $("#glideRatio").textContent=`${number(glide.ratio,2)}:1`;
  $("#bestGlide").textContent=`${number(glide.bestGlideKias)} KIAS`;
  $("#glideRange").textContent=`${number(glide.cruiseRangeNm,1)} NM`;
  $("#glideTime").textContent=`${number(glide.cruiseMinutes)} min`;
  const width=860,height=145,left=34,right=24,mid=72,plotWidth=width-left-right,maxRange=Math.max(1,...glide.samples.flatMap((sample)=>[sample.forwardRangeNm,sample.reverseRangeNm]));
  const x=(distance)=>left+clamp(distance/Math.max(1,plan.distanceNm),0,1)*plotWidth;
  const scale=50/maxRange;
  const upper=glide.samples.map((sample)=>`${x(sample.distanceNm)},${mid-sample.forwardRangeNm*scale}`);
  const lower=[...glide.samples].reverse().map((sample)=>`${x(sample.distanceNm)},${mid+sample.reverseRangeNm*scale}`);
  const labels=glide.samples.filter((_,index)=>index===0||index===glide.samples.length-1||index%Math.max(1,Math.ceil(glide.samples.length/5))===0).map((sample)=>`<g><circle cx="${x(sample.distanceNm)}" cy="${mid}" r="3" fill="#1976d2"/><text x="${x(sample.distanceNm)}" y="${mid+68}" text-anchor="middle" fill="#7a8793" font-size="8">${escapeHtml(sample.ident||"")}</text></g>`).join("");
  $("#glideChart").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="glideFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#52a964" stop-opacity=".22"/><stop offset="1" stop-color="#1976d2" stop-opacity=".1"/></linearGradient></defs><line x1="${left}" y1="${mid}" x2="${width-right}" y2="${mid}" stroke="#cdd8e1" stroke-dasharray="4 5"/><polygon points="${[...upper,...lower].join(" ")}" fill="url(#glideFill)" stroke="#52a964" stroke-width="1.5"/>${labels}<text x="${left}" y="12" fill="#7a8793" font-size="8">→ ${number(glide.forwardRangeNm,1)} NM</text><text x="${left+82}" y="12" fill="#7a8793" font-size="8">← ${number(glide.reverseRangeNm,1)} NM</text></svg>`;
}

function render() {
  applyTranslations();
  const analysis=calculatePlan(state),recommended=analysis.winners.overall,selectedCandidate=analysis.results.find((r)=>r.altitudeFt===state.selectedAltitudeFt),selected=selectedCandidate&&selectedCandidate.feasibility.status!=="unavailable"?selectedCandidate:recommended,plan=state.plan;
  const navigation=calculateEtpPnr({...state,altitudeFt:selected.altitudeFt});
  const stepPlan=calculateStepClimbs({...state,initialAltitudeFt:selected.altitudeFt,manual:state.manual.active?state.manual:null});
  const alternateAdvice=calculateAlternateDiversion({...state,altitudeFt:selected.altitudeFt,waypointIndex:state.diversionWaypointIndex,manual:state.manual.active?state.manual:null});
  const scenarioComparison=compareScenarios({plan,calibration:state.calibration,scenarioA:{altitudeFt:selected.altitudeFt,mode:state.mode,payloadLb:state.payloadLb,fuelOnboardGal:state.fuelOnboardGal,reserveMinutes:state.reserveMinutes,powerSetting:state.powerSetting},scenarioB:{...state.scenarioB,reserveMinutes:state.reserveMinutes,powerSetting:{type:"AUTO"}}});
  const loadOptimizer=calculateLoadOptimization({...state,altitudeFt:selected.altitudeFt});
  const glide=calculateGlideCorridor({plan,result:selected});
  $("#routeTitle").innerHTML=`${escapeHtml(plan.origin.icao)} <span>→</span> ${escapeHtml(plan.destination.icao)}`; $("#routeSource").textContent=t(plan.source==="SIMBRIEF"?"simbrief":"demo"); $("#planTimestamp").textContent=`${number(plan.distanceNm)} NM · FL${Math.round(plan.plannedAltitudeFt/100)}`;
  const feasibility=selected.feasibility,feasibilityKey=feasibility.status==="viable"?"viable":feasibility.status==="marginal"?"marginalStatus":"notViable",feasibilityBadge=$("#feasibilityBadge");
  feasibilityBadge.textContent=t(feasibilityKey); feasibilityBadge.className=`feasibility-badge ${feasibility.status}`;
  $("#feasibilityMeta").textContent=`${analysis.feasibility.availableCount}/${analysis.results.length} FL · ${signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`)} · ${signedNumber(weightValue(feasibility.weightMarginLb),0,` ${weightLabel()}`)}`;
  $("#routeFrom").textContent=plan.origin.icao; $("#routeTo").textContent=plan.destination.icao;
  const power=selected.power,mapLabel=power.turboLimited?`${number(power.targetMapInHg,1)}→${number(power.availableMapInHg,1)}\"`:`${number(power.availableMapInHg,1)}\"`;
  $("#powerSettingValue").textContent=`${mapLabel} · ${number(power.rpm)} RPM`;
  $("#powerPercent").textContent=`${number(power.percentPower)}%`;
  $("#powerPercent").classList.toggle("limited",power.turboLimited);
  if(document.activeElement!==$("#manualMap")) $("#manualMap").value=Number(state.powerSetting.mapInHg).toFixed(1);
  if(document.activeElement!==$("#manualRpm")) $("#manualRpm").value=String(Math.round(state.powerSetting.rpm));
  $("#kpiAltitude").textContent=`FL${recommended.fl}`; $("#kpiScore").textContent=recommended.score; $("#kpiFuel").innerHTML=`${number(fuelValue(recommended.fuelRequiredGal),1)} <small>${state.fuelUnit==="l"?"L":"GAL"}</small>`; $("#kpiFuelDelta").textContent=`${signed(fuelValue(state.fuelOnboardGal-recommended.fuelRequiredGal),` ${fuelLabel()}`)} ${t("margin")}`; $("#kpiTime").textContent=formatTime(recommended.tripTimeHr); $("#kpiGs").textContent=`${Math.round(recommended.gsKt)} kt GS`; $("#kpiRange").innerHTML=`${number(recommended.maxRangeNm)} <small>NM</small>`; $("#kpiSpecificRange").textContent=`${number(state.fuelUnit==="l"?recommended.specificRangeNmGal/3.785411784:recommended.specificRangeNmGal,1)} NM/${state.fuelUnit==="l"?"L":"gal"}`;
  renderPerformanceChart(analysis.results,recommended,selected); renderRouteMap(plan,selected,navigation); renderVerticalProfile(plan,selected,stepPlan); renderLevelCards(analysis.results,recommended,selected); renderFuel(selected); renderFlightTools(plan,navigation,stepPlan,selected); renderAlternateAdvisor(plan,alternateAdvice); renderScenarioComparison(scenarioComparison,selected); renderLoadOptimizer(loadOptimizer); renderGlideCorridor(plan,glide);
  $("#avgWind").textContent=`${String(Math.round(selected.weather.windDir)).padStart(3,"0")}° / ${Math.round(selected.weather.windSpeedKt)} kt`; $("#isaDeviation").textContent=signed(selected.weather.isaDeviationC,"°C"); $("#windComponent").textContent=signed(selected.weather.componentKt," kt"); $("#cruiseOat").textContent=`${Math.round(selected.weather.oatC)}°C`; $("#alternate").textContent=plan.alternate||"—";
  $("#tocTodNote").textContent=`TOC ${Math.round(selected.climb.distanceNm)} NM · TOD ${Math.round(selected.descent.distanceNm)} NM`; $("#climbStats").textContent=`${Math.round(selected.climb.timeHr*60)} min · ${formatFuel(selected.climb.fuelGal,1)} · ${number(selected.climb.power.availableMapInHg,1)}\" / ${number(selected.climb.power.rpm)}`; $("#cruiseStats").textContent=`${Math.round(selected.cruiseTimeHr*60)} min · ${formatFuel(selected.cruiseFuelGal,1)} · ${number(selected.power.availableMapInHg,1)}\" / ${number(selected.power.rpm)}`; $("#descentStats").textContent=`${Math.round(selected.descent.timeHr*60)} min · ${formatFuel(selected.descent.fuelGal,1)} · ${number(PERFORMANCE.powerModel.phases.descent.mapInHg,1)}\" / ${number(PERFORMANCE.powerModel.phases.descent.rpm)}`;
  const fuelRank=[...analysis.results].sort((a,b)=>a.fuelRequiredGal-b.fuelRequiredGal).findIndex((r)=>r.altitudeFt===recommended.altitudeFt)+1,timeRank=[...analysis.results].sort((a,b)=>a.tripTimeHr-b.tripTimeHr).findIndex((r)=>r.altitudeFt===recommended.altitudeFt)+1;
  $("#whyTitle").textContent=`FL${recommended.fl}`; $("#scoreRing").textContent=recommended.score; $("#whyList").innerHTML=[t("fuelRank",fuelRank),t("timeRank",timeRank,Math.round(recommended.gsKt)),t("windLine",signed(recommended.weather.componentKt),signed(recommended.weather.isaDeviationC,"°C")),`${number(recommended.power.availableMapInHg,1)}\" · ${number(recommended.power.rpm)} RPM · ${number(recommended.power.percentPower)}%`].map((line)=>`<li>${escapeHtml(line)}</li>`).join("");
  $("#fuelRequiredSide").textContent=formatFuel(selected.fuelRequiredGal,1); $("#selectionNote").textContent=`FL${selected.fl} · ${formatFuel(selected.fuelRequiredGal,1)} · ${formatTime(selected.tripTimeHr)} · ${t(feasibilityKey)}`;
  $("#payloadOutput").textContent=formatWeight(state.payloadLb); $("#fuelOutput").textContent=formatFuel(state.fuelOnboardGal,0);
  const weight=AIRCRAFT.emptyWeightLb+state.payloadLb+state.fuelOnboardGal*AIRCRAFT.fuelDensityLbGal,delta=AIRCRAFT.maxGrossWeightLb-weight; $("#weightValue").textContent=formatWeight(weight); $("#weightBar").style.width=`${Math.min(100,weight/AIRCRAFT.maxGrossWeightLb*100)}%`; $("#weightBar").style.background=delta<0?"#dc5661":"linear-gradient(90deg,var(--blue),var(--green))"; $("#weightNote").textContent=`${formatWeight(Math.abs(delta))} ${t(delta>=0?"belowMax":"aboveMax")}`; $("#weightNote").style.color=delta<0?"var(--red)":"";
}

$$('[data-language]').forEach((button)=>button.addEventListener("click",()=>{state.language=button.dataset.language;localStorage.setItem("velocityxl.language",state.language);render();}));
$$('[data-font-size]').forEach((button)=>button.addEventListener("click",()=>{state.fontSize=button.dataset.fontSize;localStorage.setItem("velocityxl.fontSize",state.fontSize);render();}));
$$('[data-weight-unit]').forEach((button)=>button.addEventListener("click",()=>{state.weightUnit=button.dataset.weightUnit;localStorage.setItem("velocityxl.weightUnit",state.weightUnit);render();}));
$$('[data-fuel-unit]').forEach((button)=>button.addEventListener("click",()=>{const previous=state.fuelUnit,next=button.dataset.fuelUnit,observed=$("#observedFuelFlow"),value=Number(observed.value);state.fuelUnit=next;if(Number.isFinite(value)&&value>0&&previous!==next)observed.value=(next==="l"?value*3.785411784:value/3.785411784).toFixed(1);localStorage.setItem("velocityxl.fuelUnit",state.fuelUnit);render();}));
$$('[data-mode]').forEach((button)=>button.addEventListener("click",()=>{state.mode=button.dataset.mode;state.selectedAltitudeFt=null;$$('[data-mode]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-power-type]').forEach((button)=>button.addEventListener("click",()=>{const type=button.dataset.powerType;if(type==="MANUAL"&&state.powerSetting.type!=="MANUAL"){const mode=PERFORMANCE.modes[state.mode];state.powerSetting={type,mapInHg:mode.mapInHg,rpm:mode.rpm};}else{state.powerSetting={...state.powerSetting,type};}state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();}));
$("#manualMap").addEventListener("input",(event)=>{state.powerSetting.mapInHg=Math.min(AIRCRAFT.maxManifoldInHg,Math.max(PERFORMANCE.powerModel.minimumMapInHg,Number(event.target.value)||PERFORMANCE.modes[state.mode].mapInHg));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$("#manualRpm").addEventListener("input",(event)=>{state.powerSetting.rpm=Math.min(AIRCRAFT.maxRpm,Math.max(PERFORMANCE.powerModel.minimumRpm,Number(event.target.value)||PERFORMANCE.modes[state.mode].rpm));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$$('[data-metric]').forEach((button)=>button.addEventListener("click",()=>{state.metric=button.dataset.metric;$$('[data-metric]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-view]').forEach((button)=>button.addEventListener("click",()=>{$$('[data-view]').forEach((item)=>item.classList.toggle("active",item===button));$$('[data-view-panel]').forEach((panel)=>panel.classList.toggle("active",panel.dataset.viewPanel===button.dataset.view));}));
$$('[data-tool-view]').forEach((button)=>button.addEventListener("click",()=>{$$('[data-tool-view]').forEach((item)=>item.classList.toggle("active",item===button));$$('[data-tool-panel]').forEach((panel)=>panel.classList.toggle("active",panel.dataset.toolPanel===button.dataset.toolView));}));
$("#payloadInput").addEventListener("input",(event)=>{state.payloadLb=Number(event.target.value);render();}); $("#fuelInput").addEventListener("input",(event)=>{state.fuelOnboardGal=Number(event.target.value);render();}); $("#reserveInput").addEventListener("change",(event)=>{state.reserveMinutes=Number(event.target.value);render();});
$("#diversionWaypoint").addEventListener("change",(event)=>{state.diversionWaypointIndex=Number(event.target.value);render();});
$("#scenarioBMode").addEventListener("change",(event)=>{state.scenarioB.mode=event.target.value;render();});
$("#scenarioBAltitude").addEventListener("change",(event)=>{state.scenarioB.altitudeFt=Number(event.target.value);render();});
$("#scenarioBPayload").addEventListener("input",(event)=>{state.scenarioB.payloadLb=Math.max(0,weightFromDisplay(Number(event.target.value)||0));render();});
$("#scenarioBFuel").addEventListener("input",(event)=>{state.scenarioB.fuelOnboardGal=clamp(fuelFromDisplay(Number(event.target.value)||0),0,AIRCRAFT.usableFuelGal);render();});
$("#applyScenarioB").addEventListener("click",()=>{state.mode=state.scenarioB.mode;state.payloadLb=state.scenarioB.payloadLb;state.fuelOnboardGal=state.scenarioB.fuelOnboardGal;state.selectedAltitudeFt=state.scenarioB.altitudeFt;state.powerSetting={type:"AUTO",mapInHg:PERFORMANCE.modes[state.mode].mapInHg,rpm:PERFORMANCE.modes[state.mode].rpm};$("#payloadInput").value=String(Math.round(state.payloadLb/10)*10);$("#fuelInput").value=String(Math.round(state.fuelOnboardGal));$$('[data-mode]').forEach((button)=>button.classList.toggle("active",button.dataset.mode===state.mode));localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$("#applyLoadOptimization").addEventListener("click",()=>{const analysis=calculatePlan(state),candidate=analysis.results.find((result)=>result.altitudeFt===state.selectedAltitudeFt),selected=candidate&&candidate.feasibility.status!=="unavailable"?candidate:analysis.winners.overall,optimizer=calculateLoadOptimization({...state,altitudeFt:selected.altitudeFt});state.fuelOnboardGal=clamp(optimizer.recommendedFuelGal,0,AIRCRAFT.usableFuelGal);state.payloadLb=Math.min(state.payloadLb,optimizer.maxPayloadLb);$("#payloadInput").value=String(Math.round(state.payloadLb/10)*10);$("#fuelInput").value=String(Math.round(state.fuelOnboardGal));state.manual.fuelRemainingGal=state.fuelOnboardGal;render();});

$("#manualUpdateForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  const waypointIndex=Number($("#manualWaypoint").value),waypoint=state.plan.waypoints[waypointIndex];
  state.manual={active:true,waypointIndex,distanceNm:Number(waypoint?.distanceNm)||0,fuelRemainingGal:fuelFromDisplay(Number($("#manualFuel").value)),altitudeFt:Number($("#manualAltitude").value)};
  state.diversionWaypointIndex=waypointIndex;
  render();
});

$("#calibrationForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  const altitudeFt=Number($("#manualAltitude").value),fuelRemainingGal=state.manual.active?state.manual.fuelRemainingGal:fuelFromDisplay(Number($("#manualFuel").value));
  state.calibration[state.mode]=deriveCalibration({plan:state.plan,mode:state.mode,payloadLb:state.payloadLb,fuelRemainingGal,altitudeFt,observedTasKt:Number($("#observedTas").value),observedFuelFlowGph:fuelFromDisplay(Number($("#observedFuelFlow").value)),positionFix:state.plan.waypoints[Number($("#manualWaypoint").value)],powerSetting:state.powerSetting});
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  render();
});

$("#resetCalibration").addEventListener("click",()=>{
  delete state.calibration[state.mode];
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  $("#observedTas").value=""; $("#observedFuelFlow").value="";
  render();
});

$("#simbriefImportForm").addEventListener("submit",async(event)=>{event.preventDefault();const input=$("#quickPilotId"),identifier=input.value.trim();if(!identifier){showToast(t("missingId"),true);input.focus();return;}const button=$("#importLatest");try{button.disabled=true;button.setAttribute("aria-busy","true");button.textContent="…";let plan;try{plan=await fetchLatestOFP(identifier,"userid");}catch(firstError){plan=await fetchLatestOFP(identifier,"username");}state.plan=plan;state.selectedAltitudeFt=null;state.manual={active:false,waypointIndex:0,distanceNm:0,fuelRemainingGal:state.fuelOnboardGal,altitudeFt:null};localStorage.setItem("velocityxl.simbriefIdentifier",identifier);render();}catch(error){showToast(error.message||t("importError"),true);}finally{button.disabled=false;button.removeAttribute("aria-busy");button.textContent=t("importLatest");}});

const savedIdentifier=localStorage.getItem("velocityxl.simbriefIdentifier"); if(savedIdentifier)$("#quickPilotId").value=savedIdentifier;
render();
