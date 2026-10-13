import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT, OXYGEN_CYLINDERS } from "./config.js?v=20261013-17";
import { calculateAlternateDiversion, calculateDebrief, calculateEtpPnr, calculateGlideCorridor, calculateMissionOptimization, calculateMissionRisk, calculateModeLoadOptimization, calculateOxygenPlan, calculatePlan, calculateStepClimbs, clamp, compareScenarios, deriveCalibration, normalizeWeightBalance, oxygenSystemWeightLb, scaleWeightBalanceToPayload, weightBalancePayloadLb } from "./engine.js?v=20261013-17";
import { fetchLatestOFP } from "./simbrief.js?v=20261013-17";

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
    destinationAlternate:"Destino → alternado", diversionFrom:"Desvio a partir de", fuelAtDestination:"Combustível no destino", alternateFuel:"Combustível até alternado", alternateLanding:"Pouso no alternado", currentScenario:"ATUAL", comparisonScenario:"COMPARAÇÃO", applyScenario:"Aplicar B", recommendedFuel:"Combustível recomendado", presetLevel:"Preset / nível", recommendedPayload:"Payload recomendado", optimizedWeight:"Peso otimizado", applyOptimization:"Aplicar otimização", optimizeMission:"Otimizar missão", optimizationFailed:"Nenhuma configuração viável", glideRatio:"Razão de planeio", bestGlide:"Melhor planeio", glideRange:"Alcance sem vento", glideTime:"Tempo estimado", reducePayload:"reduzir payload", noAdjustment:"sem ajuste", noAlternateData:"SEM COORDENADAS", icingLow:"GELO BAIXO", icingWatch:"GELO POSSÍVEL", icingCaution:"CAUTELA GELO", icingAvoid:"EVITAR GELO", icingLimited:"DADOS LIMITADOS", icingWeather:"METEO OFP", icingNoProfile:"SEM PERFIL ACEITÁVEL", icingNoCost:"SEM CUSTO METEO", tempWindow:"JANELA TÉRMICA", iceProbability:"ICE PROB", iceProbabilityAria:"Índice estimado de gelo",
    missionRisk:"Risco da missão", confidence:"Confiança", rideComfort:"Conforto", oxygen:"Oxigênio", cabinAltitude:"Altitude cabine", bottle:"Garrafa", quantity:"Quantidade", applyOxygen:"Aplicar recomendação", pilot:"Piloto", copilot:"Copiloto", rearLeft:"Traseiro E", rearCenter:"Traseiro C", rearRight:"Traseiro D", baggage:"Bagagem", oxygenRequired:"Requerido", oxygenInstalled:"Disponível", oxygenEndurance:"Autonomia", oxygenWeight:"Peso O₂", modelConfidence:"Confiança do modelo", actualTime:"Tempo real", actualFuel:"Combustível usado", saveDebrief:"Salvar debrief", flights:"voos", low:"BAIXO", moderate:"MODERADO", high:"ALTO", critical:"CRÍTICO", smooth:"SUAVE", light:"LEVE", severe:"SEVERA", oxygenNotRequired:"NÃO REQUERIDO", oxygenCompliant:"ADEQUADO", oxygenMarginal:"MARGINAL", oxygenInsufficient:"INSUFICIENTE", maskRequired:"MÁSCARA", cannula:"CÂNULA", expected:"ESPERADO", accuracy:"PRECISÃO", noDebriefs:"SEM DEBRIEFS", weatherLimited:"DADOS LIMITADOS", weightBalance:"Peso e CG", cgEnvelope:"Envelope de CG", weight:"Peso", zeroFuel:"Sem combustível", takeoff:"Decolagem", landing:"Pouso", grossWeight:"Peso total", cgTravel:"Variação do CG", station:"Estação", arm:"Braço", moment:"Momento", emptyAircraft:"Aeronave vazia", headerFuel:"Header fuel", mainFuel:"Combustível principal", cgForward:"Limite dianteiro", cgAft:"Limite traseiro",
    stepAt:(waypoint,fl)=>`${waypoint} · FL${fl}`, stepSaving:(fuel,minutes)=>`−${fuel} · ${minutes} min`,
  },
  "en-US": {
    pilotId:"Pilot ID / Alias", importLatest:"Import OFP",
    bestLevel:"Best level", fuelRequired:"Fuel required", estimatedTime:"Estimated time", maximumRange:"Maximum range", performance:"Performance", route:"Route", profile:"Profile", altitudeComparison:"Altitude comparison", selectedLevel:"Selected", recommendedLevel:"Recommended", windComponent:"Component", alternate:"Alternate", flightProfile:"Flight profile",
    payload:"Payload", fuelOnboard:"Fuel onboard", reserve:"Reserve", takeoffWeight:"Takeoff weight", fuel:"Fuel", allLevels:"All levels", climb:"CLIMB", cruise:"CRUISE", descent:"DESCENT", power:"Power", automatic:"Automatic", viable:"VIABLE", marginalStatus:"MARGINAL", notViable:"NOT VIABLE", profileLimit:"PROFILE", ceilingLimit:"CEILING", disclaimer:"Simulation only · Non-certified model · No telemetry",
    demo:"DEMO", simbrief:"SIMBRIEF", fuelHint:"Lower is better", timeHint:"Lower is better", efficiencyHint:"Higher is better", margin:"margin", belowMax:"below maximum", aboveMax:"above maximum", missingId:"Enter a Pilot ID or Alias.", importError:"Could not import the OFP.",
    fuelRank:(rank)=>`#${rank} fuel`, timeRank:(rank,gs)=>`#${rank} time · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingency", taxi:"Taxi",
    manualUpdate:"Manual update", continueLabel:"Continue", returnLabel:"Return", position:"Position", fuelRemaining:"Fuel remaining", update:"Update", calibration:"Calibration", observedTas:"Observed TAS", observedFuelFlow:"Observed fuel flow", calibrate:"Calibrate", reset:"Reset", beyondDestination:"Beyond destination", noStep:"No step climb", nextStep:"Next", updated:"MANUAL", preflight:"PREFLIGHT",
    destinationAlternate:"Destination → alternate", diversionFrom:"Diversion from", fuelAtDestination:"Fuel at destination", alternateFuel:"Fuel to alternate", alternateLanding:"Alternate landing", currentScenario:"CURRENT", comparisonScenario:"COMPARISON", applyScenario:"Apply B", recommendedFuel:"Recommended fuel", presetLevel:"Preset / level", recommendedPayload:"Recommended payload", optimizedWeight:"Optimized weight", applyOptimization:"Apply optimization", optimizeMission:"Optimize mission", optimizationFailed:"No viable configuration", glideRatio:"Glide ratio", bestGlide:"Best glide", glideRange:"Still-air range", glideTime:"Estimated time", reducePayload:"reduce payload", noAdjustment:"no adjustment", noAlternateData:"NO COORDINATES", icingLow:"LOW ICE", icingWatch:"POSSIBLE ICE", icingCaution:"ICE CAUTION", icingAvoid:"AVOID ICE", icingLimited:"LIMITED DATA", icingWeather:"OFP WEATHER", icingNoProfile:"NO ACCEPTABLE PROFILE", icingNoCost:"NO WEATHER COST", tempWindow:"TEMP WINDOW", iceProbability:"ICE PROB", iceProbabilityAria:"Estimated icing index",
    missionRisk:"Mission risk", confidence:"Confidence", rideComfort:"Ride", oxygen:"Oxygen", cabinAltitude:"Cabin altitude", bottle:"Bottle", quantity:"Quantity", applyOxygen:"Apply recommendation", pilot:"Pilot", copilot:"Copilot", rearLeft:"Rear left", rearCenter:"Rear center", rearRight:"Rear right", baggage:"Baggage", oxygenRequired:"Required", oxygenInstalled:"Available", oxygenEndurance:"Endurance", oxygenWeight:"O₂ weight", modelConfidence:"Model confidence", actualTime:"Actual time", actualFuel:"Fuel used", saveDebrief:"Save debrief", flights:"flights", low:"LOW", moderate:"MODERATE", high:"HIGH", critical:"CRITICAL", smooth:"SMOOTH", light:"LIGHT", severe:"SEVERE", oxygenNotRequired:"NOT REQUIRED", oxygenCompliant:"COMPLIANT", oxygenMarginal:"MARGINAL", oxygenInsufficient:"INSUFFICIENT", maskRequired:"MASK", cannula:"CANNULA", expected:"EXPECTED", accuracy:"ACCURACY", noDebriefs:"NO DEBRIEFS", weatherLimited:"LIMITED DATA", weightBalance:"Weight & CG", cgEnvelope:"CG envelope", weight:"Weight", zeroFuel:"Zero fuel", takeoff:"Takeoff", landing:"Landing", grossWeight:"Gross weight", cgTravel:"CG travel", station:"Station", arm:"Arm", moment:"Moment", emptyAircraft:"Empty aircraft", headerFuel:"Header fuel", mainFuel:"Main fuel", cgForward:"Forward limit", cgAft:"Aft limit",
    stepAt:(waypoint,fl)=>`${waypoint} · FL${fl}`, stepSaving:(fuel,minutes)=>`−${fuel} · ${minutes} min`,
  },
};

function storedJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

const state = {
  plan:null, mode:"NORMAL", payloadLb:520, fuelOnboardGal:77, reserveMinutes:45,
  metric:"fuel", selectedAltitudeFt:null, language:localStorage.getItem("velocityxl.language") || "pt-BR",
  weightUnit:localStorage.getItem("velocityxl.weightUnit") || "lb", fuelUnit:localStorage.getItem("velocityxl.fuelUnit") || "gal", fontSize:localStorage.getItem("velocityxl.fontSize") || "medium",
  calibration:storedJson("velocityxl.calibration", {}),
  powerSetting:storedJson("velocityxl.powerSetting", { type:"AUTO", mapInHg:24, rpm:2450 }),
  oxygen:storedJson("velocityxl.oxygen", { bottleModel:"SK-12-24", bottles:0, seats:[true,true,true,true,true], altitudeFt:null }),
  weightBalance:storedJson("velocityxl.weightBalance", { pilot:190, copilot:170, rearLeft:55, rearCenter:50, rearRight:55, baggage:0 }),
  debriefs:storedJson("velocityxl.debriefs", []),
  lastDebrief:null,
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
const currentOxygenWeightLb=()=>oxygenSystemWeightLb(state.oxygen);
const operationallyAvailable=(result)=>result.feasibility.status!=="unavailable"&&result.icing.status!=="avoid"&&result.turbulence.status!=="severe"&&result.oxygen.status!=="insufficient"&&result.weightBalance?.status!=="unavailable";

state.weightBalance=normalizeWeightBalance(state.weightBalance);
state.payloadLb=weightBalancePayloadLb(state.weightBalance);
state.oxygen.seats=[state.weightBalance.pilot,state.weightBalance.copilot,state.weightBalance.rearLeft,state.weightBalance.rearCenter,state.weightBalance.rearRight].map((value,index)=>index===0||value>0);
state.oxygen.bottleModel=OXYGEN_CYLINDERS[state.oxygen.bottleModel]?state.oxygen.bottleModel:"SK-12-24";
state.oxygen.bottles=clamp(Math.round(Number(state.oxygen.bottles)||0),0,4);

function persistWeightBalance() {
  state.payloadLb=weightBalancePayloadLb(state.weightBalance);
  localStorage.setItem("velocityxl.weightBalance",JSON.stringify(state.weightBalance));
  state.oxygen.seats=[state.weightBalance.pilot,state.weightBalance.copilot,state.weightBalance.rearLeft,state.weightBalance.rearCenter,state.weightBalance.rearRight].map((value,index)=>index===0||value>0);
  localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));
}

function setPayloadAndScaleStations(payloadLb) {
  const target=Math.max(state.weightBalance.pilot,Number(payloadLb)||0);
  state.weightBalance=scaleWeightBalanceToPayload(state.weightBalance,target);
  persistWeightBalance();
}

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
  const dots=results.map((r,i)=>{ const value=config.get(r),unavailable=!operationallyAvailable(r),best=r.altitudeFt===recommended.altitudeFt&&!unavailable,selected=r.altitudeFt===selectedResult.altitudeFt,icingColor=r.turbulence.status==="severe"||r.icing.status==="avoid"||r.oxygen.status==="insufficient"?"#dc5661":r.icing.status==="caution"||r.turbulence.status==="moderate"?"#d98b34":r.icing.status==="watch"||r.turbulence.status==="light"?"#b49a45":"#1976d2",dotColor=unavailable?icingColor:best?"#52a964":icingColor,softColor=unavailable?"#f8eef0":best?"#edf8ef":r.icing.status==="caution"||r.icing.status==="watch"?"#fff7e9":"#e9f3fd"; return `<g class="chart-point ${unavailable?"unavailable":""}" data-altitude="${r.altitudeFt}" data-unavailable="${unavailable}" tabindex="${unavailable?"-1":"0"}" role="button" aria-disabled="${unavailable}"><circle cx="${x(i)}" cy="${y(value)}" r="${selected?10:6}" fill="${softColor}"/><circle cx="${x(i)}" cy="${y(value)}" r="${best?5:4}" fill="${dotColor}" stroke="#fff" stroke-width="2"/>${best?`<g transform="translate(${x(i)-27},${y(value)-35})"><rect width="54" height="19" rx="9" fill="#52a964"/><text x="27" y="12.5" fill="#fff" text-anchor="middle" font-size="7" font-weight="700">${config.value(value)}</text></g>`:""}<text x="${x(i)}" y="${height-19}" fill="${unavailable?"#b36a72":best?"#438b52":"#84929e"}" font-size="8" text-anchor="middle">FL${r.fl}</text></g>`; }).join("");
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
  const icingBands=(result.icing?.segments||[]).map((segment)=>{const start=left+clamp(segment.startNm/Math.max(1,plan.distanceNm),0,1)*plotWidth,end=left+clamp(segment.endNm/Math.max(1,plan.distanceNm),0,1)*plotWidth,color=segment.status==="avoid"?"#dc5661":segment.status==="caution"?"#d98b34":segment.status==="watch"?"#c2a13c":"#52a964",opacity=segment.status==="low"?.08:.2;return `<rect x="${start}" y="${yForAltitude(result.altitudeFt)-7}" width="${Math.max(2,end-start)}" height="14" rx="3" fill="${color}" opacity="${opacity}"/>`;}).join("");
  $("#verticalProfile").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img">${[10000,15000,20000,25000].map((alt)=>{const y=yForAltitude(alt);return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#eef1f4"/><text x="${left-8}" y="${y+3}" text-anchor="end" fill="#8a97a2" font-size="8">FL${alt/100}</text>`;}).join("")}${icingBands}<path d="${profilePath}" fill="none" stroke="#1976d2" stroke-width="2" stroke-linejoin="round"/><text x="${tocX}" y="${yForAltitude(startAltitude)-10}" text-anchor="middle" fill="#8794a0" font-size="8">TOC</text><text x="${todX}" y="${lastY-10}" text-anchor="middle" fill="#8794a0" font-size="8">TOD</text>${stepLabels}<text x="${left}" y="${base+25}" fill="#43515d" font-size="9" font-weight="700">${escapeHtml(plan.origin.icao)}</text><text x="${width-right}" y="${base+25}" text-anchor="end" fill="#43515d" font-size="9" font-weight="700">${escapeHtml(plan.destination.icao)}</text></svg>`;
}

function icingLabel(icing) {
  return t(icing.status==="avoid"?"icingAvoid":icing.status==="caution"?"icingCaution":icing.status==="watch"?"icingWatch":"icingLow");
}

function icingProbabilityMarkup(icing) {
  const score=Math.round(icing.riskScore);
  return `<span class="ice-probability icing-${icing.status}" aria-label="${escapeHtml(t("iceProbabilityAria"))}: ${score}%"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v14M2 4.5l12 7M14 4.5l-12 7M5.8 2.3 8 4.5l2.2-2.2M5.8 13.7 8 11.5l2.2 2.2M1.9 7.5l3-.8-.8-3M14.1 8.5l-3 .8.8 3"/></svg><span>${t("iceProbability")} - ${score}%</span></span>`;
}

function levelFeasibilityLabel(result) {
  if(result.weightBalance?.status==="unavailable") return result.weightBalance.primaryReason==="WEIGHT"?t("grossWeight"):"CG";
  if(result.oxygen.status==="insufficient") return "O₂";
  if(result.turbulence.status==="severe") return "SEV TURB";
  if(result.icing.status==="avoid") return "ICE";
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
  $("#levelCards").innerHTML=results.map((r)=>{const status=r.feasibility.status,blocked=!operationallyAvailable(r),performanceLabel=levelFeasibilityLabel(r),recommendedClass=r.altitudeFt===recommended.altitudeFt&&!blocked?"recommended":"";return `<button class="level-card ${status} icing-${r.icing.status} ${blocked?"weather-unavailable":""} ${recommendedClass} ${r.altitudeFt===selected.altitudeFt?"selected":""}" data-level="${r.altitudeFt}" type="button" ${blocked?"disabled aria-disabled=\"true\"":""}><b>FL${r.fl}</b><span>${unit} · ETE · GS</span><strong>${number(fuelValue(r.fuelRequiredGal),1)} · ${formatTime(r.tripTimeHr)} · ${Math.round(r.gsKt)}</strong><span class="level-card-status">${performanceLabel?`<em>${escapeHtml(performanceLabel)}</em>`:""}${icingProbabilityMarkup(r.icing)}</span></button>`;}).join("");
  $$(".level-card:not(:disabled)").forEach((card)=>card.addEventListener("click",()=>{state.selectedAltitudeFt=Number(card.dataset.level);render();}));
}

function renderIcingSummary(analysis) {
  const recommended=analysis.winners.overall,performance=analysis.winners.performance,cost=analysis.icing.cost,icing=recommended.icing;
  const status=$("#icingStatus");
  status.textContent=analysis.icing.hasAcceptableProfile?icingLabel(icing):t("icingNoProfile");
  status.className=analysis.icing.hasAcceptableProfile?`icing-${icing.status}`:"icing-avoid";
  $("#icingDelta").textContent=cost.changedAltitude?`FL${performance.fl} → FL${recommended.fl} · ${signedNumber(fuelValue(cost.fuelGal),1,` ${fuelLabel()}`)} · ${signedNumber(cost.timeHr*60,0," min")}`:`FL${recommended.fl} · ${t("icingNoCost")}`;
  $("#icingSource").textContent=`SIMBRIEF OAT · ${t(icing.confidence==="weather"?"icingWeather":"icingLimited")} · ${t("tempWindow")} ${number(icing.temperatureExposureMinutes,0)} min`;
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
  $("#loadRecommendedFuel").textContent=Number.isFinite(optimizer?.recommendedFuelGal)?formatFuel(optimizer.recommendedFuelGal,1):"—";
  $("#loadMaxFuel").textContent=optimizer.recommendedAltitudeFt?`${optimizer.mode} · FL${optimizer.recommendedAltitudeFt/100}`:"—";
  $("#loadMaxPayload").textContent=Number.isFinite(optimizer?.recommendedPayloadLb)?formatWeight(optimizer.recommendedPayloadLb):"—";
  $("#loadOptimizedWeight").textContent=Number.isFinite(optimizer?.optimizedWeightLb)?formatWeight(optimizer.optimizedWeightLb):"—";
  setStatusPill("#loadStatus",optimizer.feasible?"viable":"unavailable");
  $("#loadAdjustment").textContent=optimizer.payloadReductionLb>0?`${t("reducePayload")} ${formatWeight(optimizer.payloadReductionLb)}`:t("noAdjustment");
}

function renderGlideCorridor(plan,glide) {
  $("#glideRatio").textContent=`${number(glide.ratio,2)}:1`;
  $("#bestGlide").textContent=`${number(glide.bestGlideKias)} KIAS`;
  $("#glideRange").textContent=`${number(glide.cruiseRangeNm,1)} NM`;
  $("#glideTime").textContent=`${number(glide.cruiseMinutes)} min`;
  const width=860,height=180,left=46,right=24,top=18,bottom=42,plotWidth=width-left-right,maxRange=Math.max(1,...glide.samples.map((sample)=>sample.stillAirRangeNm));
  const x=(distance)=>left+clamp(distance/Math.max(1,plan.distanceNm),0,1)*plotWidth;
  const y=(range)=>top+(maxRange-range)/maxRange*(height-top-bottom);
  const points=glide.samples.map((sample)=>`${x(sample.distanceNm)},${y(sample.stillAirRangeNm)}`).join(" ");
  const area=`${left},${height-bottom} ${points} ${width-right},${height-bottom}`;
  const grid=[0,.5,1].map((ratio)=>{const value=maxRange*(1-ratio),yy=top+ratio*(height-top-bottom);return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#e8edf1"/><text x="${left-8}" y="${yy+3}" text-anchor="end" fill="#7a8793" font-size="8">${number(value,0)}</text>`;}).join("");
  const labelSamples=glide.samples.filter((_,index)=>index===0||index===glide.samples.length-1||index%Math.max(1,Math.ceil(glide.samples.length/5))===0);
  const labels=labelSamples.map((sample)=>`<g><circle cx="${x(sample.distanceNm)}" cy="${y(sample.stillAirRangeNm)}" r="4" fill="#1976d2" stroke="#fff" stroke-width="2"/><text x="${x(sample.distanceNm)}" y="${height-14}" text-anchor="middle" fill="#7a8793" font-size="8">${escapeHtml(sample.ident||"")}</text></g>`).join("");
  $("#glideChart").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="glideFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1976d2" stop-opacity=".18"/><stop offset="1" stop-color="#1976d2" stop-opacity=".02"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#glideFill)"/><polyline points="${points}" fill="none" stroke="#1976d2" stroke-width="2" stroke-linejoin="round"/>${labels}<text x="${left}" y="10" fill="#7a8793" font-size="8">NM</text></svg>`;
  $("#glideWind").textContent=`→ ${number(glide.forwardRangeNm,1)} NM · ← ${number(glide.reverseRangeNm,1)} NM`;
}

function riskLabel(status){return t(status);}
function rideLabel(status){return t(status);}
function oxygenLabel(status){return t(status==="not-required"?"oxygenNotRequired":status==="compliant"?"oxygenCompliant":status==="marginal"?"oxygenMarginal":"oxygenInsufficient");}
function weightBalanceLabel(status){return t(status==="viable"?"viable":status==="marginal"?"marginalStatus":"notViable");}

function renderMissionStrip(result,missionRisk) {
  $("#missionRiskValue").textContent=`${missionRisk.score}/100`;
  $("#missionRiskStatus").textContent=riskLabel(missionRisk.status);
  $("#missionRiskValue").dataset.status=missionRisk.status;
  $("#confidenceValue").textContent=`${result.confidence.score}%`;
  $("#confidenceMeta").textContent=`${result.confidence.sampleCount} ${t("flights")}`;
  $("#rideValue").textContent=rideLabel(result.turbulence.status);
  $("#rideMeta").textContent=`${number(result.turbulence.riskScore)}/100`;
  $("#oxygenValue").textContent=oxygenLabel(result.oxygen.status);
  $("#oxygenMeta").textContent=result.oxygen.requiredLiters>0?`${number(result.oxygen.requiredLiters)} L · ${formatWeight(result.oxygen.bottleWeightLb)}`:`FL${result.fl}`;
}

function renderOxygenPlanner(analysis) {
  const altitudeSelect=$("#oxygenAltitude");
  if(!altitudeSelect.options.length) altitudeSelect.innerHTML=ALTITUDES_FT.map((altitude)=>`<option value="${altitude}">FL${altitude/100}</option>`).join("");
  if(!ALTITUDES_FT.includes(Number(state.oxygen.altitudeFt))) state.oxygen.altitudeFt=analysis.winners.overall.altitudeFt;
  altitudeSelect.value=String(state.oxygen.altitudeFt);
  const bottleSelect=$("#oxygenBottle");
  if(!bottleSelect.options.length) bottleSelect.innerHTML=Object.values(OXYGEN_CYLINDERS).map((item)=>`<option value="${item.label}">${item.label} · ${item.capacityLiters} L · ${formatWeight(item.fullWeightLb)}</option>`).join("");
  bottleSelect.value=state.oxygen.bottleModel;
  $("#oxygenBottleCount").value=String(state.oxygen.bottles);
  $$('[data-oxygen-seat]').forEach((input)=>{input.checked=state.oxygen.seats[Number(input.dataset.oxygenSeat)];});
  const target=analysis.results.find((item)=>item.altitudeFt===Number(state.oxygen.altitudeFt))||analysis.winners.overall;
  const oxygen=calculateOxygenPlan({result:target,oxygen:state.oxygen});
  $("#oxygenRequired").textContent=`${number(oxygen.requiredLiters)} L`;
  $("#oxygenInstalled").textContent=`${number(oxygen.installedLiters)} L`;
  $("#oxygenEndurance").textContent=Number.isFinite(oxygen.enduranceMinutes)?`${number(oxygen.enduranceMinutes)} min`:"—";
  $("#oxygenWeight").textContent=formatWeight(oxygen.bottleWeightLb);
  const pill=$("#oxygenStatus"); pill.textContent=oxygenLabel(oxygen.status); pill.className=`status-pill oxygen-${oxygen.status}`;
  const equipment=oxygen.maskRequired?t("maskRequired"):t("cannula");
  $("#oxygenRecommendation").textContent=oxygen.recommendedBottles?`${oxygen.recommendedBottles} × ${oxygen.bottleModel} · ${formatWeight(oxygen.recommendedWeightLb)} · ${equipment}`:`FL${target.fl} · ${t("oxygenNotRequired")}`;
  $("#applyOxygenRecommendation").disabled=oxygen.recommendedBottles===oxygen.bottles;
}

function renderWeightBalance(weightBalance) {
  const inputKeys=["pilot","copilot","rearLeft","rearCenter","rearRight","baggage"];
  inputKeys.forEach((key)=>{
    const input=$(`[data-wb-key="${key}"]`);
    if(document.activeElement!==input) input.value=number(weightValue(state.weightBalance[key]),0).replace(/\D/g,"");
  });
  $$("[data-wb-unit]").forEach((element)=>{element.textContent=weightLabel();});
  const status=$("#wbStatus"); status.textContent=weightBalanceLabel(weightBalance.status); status.className=`status-pill ${weightBalance.status}`;
  $("#wbTakeoffCg").textContent=`${number(weightBalance.takeoff.cgIn,2)} in`;
  $("#wbLandingCg").textContent=`${number(weightBalance.landing.cgIn,2)} in`;
  $("#wbGrossWeight").textContent=formatWeight(weightBalance.takeoff.weightLb);
  $("#wbCgTravel").textContent=signedNumber(weightBalance.cgTravelIn,2," in");
  $("#wbMargins").textContent=`FWD ${number(weightBalance.takeoff.forwardMarginIn,2)} · AFT ${number(weightBalance.takeoff.aftMarginIn,2)} in`;
  $("#wbEnvelopeLegend").textContent=`127–134 in · ${formatWeight(weightBalance.envelope.maximumWeightLb)}`;

  const width=760,height=350,left=62,right=24,top=30,bottom=48,env=weightBalance.envelope,relevantPoints=[weightBalance.zeroFuel,weightBalance.takeoff,weightBalance.landing];
  const minCg=Math.min(126,Math.floor((Math.min(...relevantPoints.map((item)=>item.cgIn))-.5)*2)/2),maxCg=Math.max(135,Math.ceil((Math.max(...relevantPoints.map((item)=>item.cgIn))+.5)*2)/2),minWeight=env.minimumChartWeightLb,maxWeight=Math.max(env.maximumWeightLb,Math.ceil(Math.max(...relevantPoints.map((item)=>item.weightLb))/200)*200);
  const x=(cg)=>left+(cg-minCg)/(maxCg-minCg)*(width-left-right);
  const y=(weight)=>top+(maxWeight-weight)/(maxWeight-minWeight)*(height-top-bottom);
  const xTicks=Array.from({length:Math.floor(maxCg-minCg)+1},(_,index)=>Math.ceil(minCg)+index).filter((value)=>value<=maxCg);
  const xGrid=xTicks.map((value)=>`<g><line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height-bottom}" stroke="#e8edf1"/><text x="${x(value)}" y="${height-19}" text-anchor="middle" fill="#7a8793" font-size="9">${value}</text></g>`).join("");
  const yGrid=Array.from({length:5},(_,index)=>minWeight+(maxWeight-minWeight)*index/4).map((value)=>`<g><line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#e8edf1"/><text x="${left-10}" y="${y(value)+3}" text-anchor="end" fill="#7a8793" font-size="9">${number(weightValue(value),0)}</text></g>`).join("");
  const trajectory=weightBalance.trajectory.map((point)=>`${x(point.cgIn)},${y(point.weightLb)}`).join(" ");
  const point=(item,label,color,dy,dx=9,anchor="start")=>`<g><circle cx="${x(item.cgIn)}" cy="${y(item.weightLb)}" r="6" fill="${color}" stroke="#fff" stroke-width="2"/><text x="${x(item.cgIn)+dx}" y="${y(item.weightLb)+dy}" text-anchor="${anchor}" fill="${color}" font-size="9" font-weight="700">${label} · ${number(item.cgIn,2)}\"</text></g>`;
  $("#cgChart").innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("cgEnvelope"))}"><rect x="${x(env.forwardCgIn)}" y="${y(env.maximumWeightLb)}" width="${x(env.aftCgIn)-x(env.forwardCgIn)}" height="${y(env.minimumChartWeightLb)-y(env.maximumWeightLb)}" rx="8" fill="#edf8ef" stroke="#52a964" stroke-width="1.5"/>${xGrid}${yGrid}<line x1="${x(env.forwardCgIn)}" y1="${top}" x2="${x(env.forwardCgIn)}" y2="${height-bottom}" stroke="#52a964" stroke-width="2"/><line x1="${x(env.aftCgIn)}" y1="${top}" x2="${x(env.aftCgIn)}" y2="${height-bottom}" stroke="#52a964" stroke-width="2"/><polyline points="${trajectory}" fill="none" stroke="#1976d2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${point(weightBalance.zeroFuel,"ZFW","#7a8793",14,-9,"end")}${point(weightBalance.takeoff,"TO","#1976d2",-9)}${point(weightBalance.landing,"LDG",weightBalance.status==="unavailable"?"#dc5661":"#52a964",14)}<text x="${left}" y="14" fill="#7a8793" font-size="9">${escapeHtml(weightLabel().toUpperCase())}</text><text x="${width-right}" y="${height-5}" text-anchor="end" fill="#7a8793" font-size="9">CG · IN AFT DATUM</text></svg>`;

  const stationLabels={empty:t("emptyAircraft"),pilot:t("pilot"),copilot:t("copilot"),rearLeft:t("rearLeft"),rearCenter:t("rearCenter"),rearRight:t("rearRight"),baggage:t("baggage"),oxygen:t("oxygen"),headerFuel:t("headerFuel"),mainFuel:t("mainFuel")};
  $("#wbStationRows").innerHTML=weightBalance.takeoff.stations.filter((item)=>item.weightLb>0).map((item)=>`<div><b>${escapeHtml(stationLabels[item.key]||item.key)}</b><span>${formatWeight(item.weightLb)}</span><span>${number(item.armIn,1)} in</span><strong>${number(item.momentInLb,0)}</strong></div>`).join("");
}

function renderConfidenceEnvelope(confidence) {
  $("#confidenceScore").textContent=`${confidence.score}%`;
  $("#confidenceSamples").textContent=confidence.sampleCount?`${confidence.sampleCount} ${t("flights")}`:t("noDebriefs");
  const rows=[
    [t("fuel"),formatFuel(confidence.fuel.low,1),formatFuel(confidence.fuel.nominal,1),formatFuel(confidence.fuel.high,1)],
    ["ETE",formatTime(confidence.time.low),formatTime(confidence.time.nominal),formatTime(confidence.time.high)],
    ["TAS",`${number(confidence.tas.low)} kt`,`${number(confidence.tas.nominal)} kt`,`${number(confidence.tas.high)} kt`],
    [state.language==="pt-BR"?"Alcance":"Range",`${number(confidence.range.low)} NM`,`${number(confidence.range.nominal)} NM`,`${number(confidence.range.high)} NM`],
  ];
  $("#confidenceEnvelope").innerHTML=`<div class="envelope-head"><span></span><span>LOW</span><span>${t("expected")}</span><span>HIGH</span></div>${rows.map((row)=>`<div class="envelope-row"><b>${escapeHtml(row[0])}</b><span>${row[1]}</span><strong>${row[2]}</strong><span>${row[3]}</span></div>`).join("")}`;
}

function renderRideOptimizer(analysis,selected) {
  const eligible=analysis.results.filter(operationallyAvailable);
  const best=[...(eligible.length?eligible:analysis.results)].sort((a,b)=>a.turbulence.riskScore-b.turbulence.riskScore||b.score-a.score)[0];
  $("#rideHeadline").textContent=`FL${best.fl} · ${rideLabel(best.turbulence.status)}`;
  $("#rideSummaryMeta").textContent=`${number(best.turbulence.riskScore)}/100 · ${best.turbulence.confidence==="limited"?t("weatherLimited"):"SIMBRIEF"}`;
  $("#rideLevels").innerHTML=analysis.results.map((item)=>`<button type="button" data-ride-level="${item.altitudeFt}" ${!operationallyAvailable(item)?"disabled":""} class="ride-level ${item.turbulence.status} ${item.altitudeFt===selected.altitudeFt?"selected":""}"><b>FL${item.fl}</b><span>${rideLabel(item.turbulence.status)}</span><i><em style="width:${item.turbulence.riskScore}%"></em></i><strong>${number(item.turbulence.riskScore)}</strong></button>`).join("");
  $$('[data-ride-level]:not(:disabled)').forEach((button)=>button.addEventListener("click",()=>{state.selectedAltitudeFt=Number(button.dataset.rideLevel);render();}));
}

function renderDebrief(result) {
  $("#debriefFuelUnit").textContent=fuelLabel();
  if(document.activeElement!==$("#debriefTime")&&!$("#debriefTime").value) $("#debriefTime").value=String(Math.round(result.tripTimeHr*60));
  if(document.activeElement!==$("#debriefFuel")&&!$("#debriefFuel").value) $("#debriefFuel").value=number(fuelValue(result.tripFuelGal),1).replace(",",".");
  const last=state.lastDebrief;
  $("#debriefResult").innerHTML=last?`<strong>${last.accuracyScore}% ${t("accuracy")}</strong><span>ETE ${signedNumber(last.timeErrorPct,1,"%")} · ${t("fuel")} ${signedNumber(last.fuelErrorPct,1,"%")}</span>`:`<strong>—</strong><span>${t("noDebriefs")}</span>`;
  $("#debriefHistory").innerHTML=state.debriefs.slice(-5).reverse().map((entry)=>`<div><span>${escapeHtml(entry.route)} · ${entry.mode} · FL${entry.fl}</span><strong>${entry.accuracyScore}%</strong></div>`).join("");
}

function render() {
  applyTranslations();
  const hasPlan=Boolean(state.plan);
  $("#plannerContent").hidden=!hasPlan;
  $("#feasibilityBadge").hidden=!hasPlan;
  $("#feasibilityMeta").hidden=!hasPlan;
  if(!hasPlan){$("#routeSource").textContent=t("simbrief");$("#routeTitle").innerHTML=`— <span>→</span> —`;$("#planTimestamp").textContent="—";return;}
  const analysis=calculatePlan(state),recommended=analysis.winners.overall,selectedCandidate=analysis.results.find((r)=>r.altitudeFt===state.selectedAltitudeFt),selected=selectedCandidate&&operationallyAvailable(selectedCandidate)?selectedCandidate:recommended,plan=state.plan,oxygenWeightLb=currentOxygenWeightLb();
  const navigation=calculateEtpPnr({...state,oxygenWeightLb,altitudeFt:selected.altitudeFt});
  const stepPlan=calculateStepClimbs({...state,oxygenWeightLb,initialAltitudeFt:selected.altitudeFt,manual:state.manual.active?state.manual:null});
  const alternateAdvice=calculateAlternateDiversion({...state,oxygenWeightLb,altitudeFt:selected.altitudeFt,waypointIndex:state.diversionWaypointIndex,manual:state.manual.active?state.manual:null});
  const missionRisk=calculateMissionRisk({result:selected,confidence:selected.confidence,alternateAdvice});
  const scenarioComparison=compareScenarios({plan,calibration:state.calibration,scenarioA:{altitudeFt:selected.altitudeFt,mode:state.mode,payloadLb:state.payloadLb,fuelOnboardGal:state.fuelOnboardGal,oxygenWeightLb,reserveMinutes:state.reserveMinutes,powerSetting:state.powerSetting},scenarioB:{...state.scenarioB,oxygenWeightLb,reserveMinutes:state.reserveMinutes,powerSetting:{type:"AUTO"}}});
  const loadOptimizer=calculateModeLoadOptimization({...state,minimumPayloadLb:state.weightBalance.pilot,requireWeightBalanceViable:true});
  const glide=calculateGlideCorridor({plan,result:selected});
  $("#routeTitle").innerHTML=`${escapeHtml(plan.origin.icao)} <span>→</span> ${escapeHtml(plan.destination.icao)}`; $("#routeSource").textContent=t(plan.source==="SIMBRIEF"?"simbrief":"demo"); $("#planTimestamp").textContent=`${number(plan.distanceNm)} NM · FL${Math.round(plan.plannedAltitudeFt/100)}`;
  const feasibility=selected.feasibility,feasibilityKey=feasibility.status==="viable"?"viable":feasibility.status==="marginal"?"marginalStatus":"notViable",feasibilityBadge=$("#feasibilityBadge"),noOperationalProfile=!analysis.results.some(operationallyAvailable),operationalCaution=(selected.icing.status==="watch"&&selected.icing.confidence==="weather")||selected.icing.status==="caution"||selected.turbulence.status==="moderate"||selected.oxygen.status==="marginal"||selected.weightBalance?.status==="marginal";
  feasibilityBadge.textContent=noOperationalProfile?t("notViable"):operationalCaution?`${t("marginalStatus")} · ${riskLabel(missionRisk.status)}`:t(feasibilityKey); feasibilityBadge.className=`feasibility-badge ${noOperationalProfile?"unavailable":operationalCaution?"marginal":feasibility.status}`;
  $("#feasibilityMeta").textContent=`${analysis.results.filter(operationallyAvailable).length}/${analysis.results.length} FL · ${signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`)} · ${signedNumber(weightValue(feasibility.weightMarginLb),0,` ${weightLabel()}`)}`;
  $("#routeFrom").textContent=plan.origin.icao; $("#routeTo").textContent=plan.destination.icao;
  const power=selected.power,mapLabel=power.turboLimited?`${number(power.targetMapInHg,1)}→${number(power.availableMapInHg,1)}\"`:`${number(power.availableMapInHg,1)}\"`;
  $("#powerSettingValue").textContent=`${mapLabel} · ${number(power.rpm)} RPM`;
  $("#powerPercent").textContent=`${number(power.percentPower)}%`;
  $("#powerPercent").classList.toggle("limited",power.turboLimited);
  if(document.activeElement!==$("#manualMap")) $("#manualMap").value=Number(state.powerSetting.mapInHg).toFixed(1);
  if(document.activeElement!==$("#manualRpm")) $("#manualRpm").value=String(Math.round(state.powerSetting.rpm));
  $("#kpiAltitude").textContent=`FL${recommended.fl}`; $("#kpiScore").textContent=recommended.score; $("#kpiFuel").innerHTML=`${number(fuelValue(recommended.fuelRequiredGal),1)} <small>${state.fuelUnit==="l"?"L":"GAL"}</small>`; $("#kpiFuelDelta").textContent=`${signed(fuelValue(state.fuelOnboardGal-recommended.fuelRequiredGal),` ${fuelLabel()}`)} ${t("margin")}`; $("#kpiTime").textContent=formatTime(recommended.tripTimeHr); $("#kpiGs").textContent=`${Math.round(recommended.gsKt)} kt GS`; $("#kpiRange").innerHTML=`${number(recommended.maxRangeNm)} <small>NM</small>`; $("#kpiSpecificRange").textContent=`${number(state.fuelUnit==="l"?recommended.specificRangeNmGal/3.785411784:recommended.specificRangeNmGal,1)} NM/${state.fuelUnit==="l"?"L":"gal"}`;
  renderPerformanceChart(analysis.results,recommended,selected); renderIcingSummary(analysis); renderRouteMap(plan,selected,navigation); renderVerticalProfile(plan,selected,stepPlan); renderLevelCards(analysis.results,recommended,selected); renderFuel(selected); renderFlightTools(plan,navigation,stepPlan,selected); renderAlternateAdvisor(plan,alternateAdvice); renderScenarioComparison(scenarioComparison,selected); renderLoadOptimizer(loadOptimizer); renderGlideCorridor(plan,glide); renderMissionStrip(selected,missionRisk); renderOxygenPlanner(analysis); renderWeightBalance(selected.weightBalance); renderConfidenceEnvelope(selected.confidence); renderRideOptimizer(analysis,selected); renderDebrief(selected);
  $("#avgWind").textContent=`${String(Math.round(selected.weather.windDir)).padStart(3,"0")}° / ${Math.round(selected.weather.windSpeedKt)} kt`; $("#isaDeviation").textContent=signed(selected.weather.isaDeviationC,"°C"); $("#windComponent").textContent=signed(selected.weather.componentKt," kt"); $("#cruiseOat").textContent=`${Math.round(selected.weather.oatC)}°C`; $("#alternate").textContent=plan.alternate||"—";
  $("#tocTodNote").textContent=`TOC ${Math.round(selected.climb.distanceNm)} NM · TOD ${Math.round(selected.descent.distanceNm)} NM`; $("#climbStats").textContent=`${Math.round(selected.climb.timeHr*60)} min · ${formatFuel(selected.climb.fuelGal,1)} · ${number(selected.climb.power.availableMapInHg,1)}\" / ${number(selected.climb.power.rpm)}`; $("#cruiseStats").textContent=`${Math.round(selected.cruiseTimeHr*60)} min · ${formatFuel(selected.cruiseFuelGal,1)} · ${number(selected.power.availableMapInHg,1)}\" / ${number(selected.power.rpm)}`; $("#descentStats").textContent=`${Math.round(selected.descent.timeHr*60)} min · ${formatFuel(selected.descent.fuelGal,1)} · ${number(PERFORMANCE.powerModel.phases.descent.mapInHg,1)}\" / ${number(PERFORMANCE.powerModel.phases.descent.rpm)}`;
  const fuelRank=[...analysis.results].sort((a,b)=>a.fuelRequiredGal-b.fuelRequiredGal).findIndex((r)=>r.altitudeFt===recommended.altitudeFt)+1,timeRank=[...analysis.results].sort((a,b)=>a.tripTimeHr-b.tripTimeHr).findIndex((r)=>r.altitudeFt===recommended.altitudeFt)+1;
  $("#whyTitle").textContent=`FL${recommended.fl}`; $("#scoreRing").textContent=recommended.score; $("#whyList").innerHTML=[`${riskLabel(missionRisk.status)} · ${missionRisk.score}/100`,`${weightBalanceLabel(recommended.weightBalance.status)} CG · ${number(recommended.weightBalance.takeoff.cgIn,2)}→${number(recommended.weightBalance.landing.cgIn,2)} in`,`${icingLabel(recommended.icing)} · ${number(recommended.icing.riskScore)}/100`,`${rideLabel(recommended.turbulence.status)} · ${number(recommended.turbulence.riskScore)}/100`,`${oxygenLabel(recommended.oxygen.status)} · ${number(recommended.oxygen.requiredLiters)} L`,t("fuelRank",fuelRank),t("timeRank",timeRank,Math.round(recommended.gsKt))].map((line)=>`<li>${escapeHtml(line)}</li>`).join("");
  $("#fuelRequiredSide").textContent=formatFuel(selected.fuelRequiredGal,1); $("#selectionNote").textContent=`FL${selected.fl} · ${formatFuel(selected.fuelRequiredGal,1)} · ${formatTime(selected.tripTimeHr)} · ${t(feasibilityKey)}`;
  $("#payloadOutput").textContent=formatWeight(state.payloadLb); $("#fuelOutput").textContent=formatFuel(state.fuelOnboardGal,0);
  const weight=AIRCRAFT.emptyWeightLb+state.payloadLb+state.fuelOnboardGal*AIRCRAFT.fuelDensityLbGal+oxygenWeightLb,delta=AIRCRAFT.maxGrossWeightLb-weight; $("#weightValue").textContent=formatWeight(weight); $("#weightBar").style.width=`${Math.min(100,weight/AIRCRAFT.maxGrossWeightLb*100)}%`; $("#weightBar").style.background=delta<0?"#dc5661":"linear-gradient(90deg,var(--blue),var(--green))"; $("#weightNote").textContent=`${formatWeight(Math.abs(delta))} ${t(delta>=0?"belowMax":"aboveMax")} · CG ${number(selected.weightBalance.takeoff.cgIn,2)}→${number(selected.weightBalance.landing.cgIn,2)} in`; $("#weightNote").style.color=delta<0||selected.weightBalance.status==="unavailable"?"var(--red)":"";
}

$$('[data-language]').forEach((button)=>button.addEventListener("click",()=>{state.language=button.dataset.language;localStorage.setItem("velocityxl.language",state.language);render();}));
$$('[data-font-size]').forEach((button)=>button.addEventListener("click",()=>{state.fontSize=button.dataset.fontSize;localStorage.setItem("velocityxl.fontSize",state.fontSize);render();}));
$$('[data-weight-unit]').forEach((button)=>button.addEventListener("click",()=>{state.weightUnit=button.dataset.weightUnit;localStorage.setItem("velocityxl.weightUnit",state.weightUnit);render();}));
$$('[data-fuel-unit]').forEach((button)=>button.addEventListener("click",()=>{const previous=state.fuelUnit,next=button.dataset.fuelUnit,observed=$("#observedFuelFlow"),debrief=$("#debriefFuel"),value=Number(observed.value),debriefValue=Number(debrief.value);state.fuelUnit=next;if(Number.isFinite(value)&&value>0&&previous!==next)observed.value=(next==="l"?value*3.785411784:value/3.785411784).toFixed(1);if(Number.isFinite(debriefValue)&&debriefValue>0&&previous!==next)debrief.value=(next==="l"?debriefValue*3.785411784:debriefValue/3.785411784).toFixed(1);localStorage.setItem("velocityxl.fuelUnit",state.fuelUnit);render();}));
$$('[data-mode]').forEach((button)=>button.addEventListener("click",()=>{state.mode=button.dataset.mode;state.selectedAltitudeFt=null;$$('[data-mode]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-power-type]').forEach((button)=>button.addEventListener("click",()=>{const type=button.dataset.powerType;if(type==="MANUAL"&&state.powerSetting.type!=="MANUAL"){const mode=PERFORMANCE.modes[state.mode];state.powerSetting={type,mapInHg:mode.mapInHg,rpm:mode.rpm};}else{state.powerSetting={...state.powerSetting,type};}state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();}));
$("#manualMap").addEventListener("input",(event)=>{state.powerSetting.mapInHg=Math.min(AIRCRAFT.maxManifoldInHg,Math.max(PERFORMANCE.powerModel.minimumMapInHg,Number(event.target.value)||PERFORMANCE.modes[state.mode].mapInHg));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$("#manualRpm").addEventListener("input",(event)=>{state.powerSetting.rpm=Math.min(AIRCRAFT.maxRpm,Math.max(PERFORMANCE.powerModel.minimumRpm,Number(event.target.value)||PERFORMANCE.modes[state.mode].rpm));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$$('[data-metric]').forEach((button)=>button.addEventListener("click",()=>{state.metric=button.dataset.metric;$$('[data-metric]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-view]').forEach((button)=>button.addEventListener("click",()=>{$$('[data-view]').forEach((item)=>item.classList.toggle("active",item===button));$$('[data-view-panel]').forEach((panel)=>panel.classList.toggle("active",panel.dataset.viewPanel===button.dataset.view));}));
$$('[data-tool-view]').forEach((button)=>button.addEventListener("click",()=>{$$('[data-tool-view]').forEach((item)=>item.classList.toggle("active",item===button));$$('[data-tool-panel]').forEach((panel)=>panel.classList.toggle("active",panel.dataset.toolPanel===button.dataset.toolView));}));
$("#payloadInput").addEventListener("input",(event)=>{setPayloadAndScaleStations(Number(event.target.value));render();}); $("#fuelInput").addEventListener("input",(event)=>{state.fuelOnboardGal=Number(event.target.value);render();}); $("#reserveInput").addEventListener("change",(event)=>{state.reserveMinutes=Number(event.target.value);render();});
$("#diversionWaypoint").addEventListener("change",(event)=>{state.diversionWaypointIndex=Number(event.target.value);render();});
$("#scenarioBMode").addEventListener("change",(event)=>{state.scenarioB.mode=event.target.value;render();});
$("#scenarioBAltitude").addEventListener("change",(event)=>{state.scenarioB.altitudeFt=Number(event.target.value);render();});
$("#scenarioBPayload").addEventListener("input",(event)=>{state.scenarioB.payloadLb=Math.max(0,weightFromDisplay(Number(event.target.value)||0));render();});
$("#scenarioBFuel").addEventListener("input",(event)=>{state.scenarioB.fuelOnboardGal=clamp(fuelFromDisplay(Number(event.target.value)||0),0,AIRCRAFT.usableFuelGal);render();});
$("#applyScenarioB").addEventListener("click",()=>{state.mode=state.scenarioB.mode;setPayloadAndScaleStations(state.scenarioB.payloadLb);state.fuelOnboardGal=state.scenarioB.fuelOnboardGal;state.selectedAltitudeFt=state.scenarioB.altitudeFt;state.powerSetting={type:"AUTO",mapInHg:PERFORMANCE.modes[state.mode].mapInHg,rpm:PERFORMANCE.modes[state.mode].rpm};$("#payloadInput").value=String(Math.round(state.payloadLb/10)*10);$("#fuelInput").value=String(Math.round(state.fuelOnboardGal));$$('[data-mode]').forEach((button)=>button.classList.toggle("active",button.dataset.mode===state.mode));localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$("#optimizeMission").addEventListener("click",()=>{const optimizer=calculateMissionOptimization(state);if(!optimizer.feasible){showToast(t("optimizationFailed"),true);return;}state.mode=optimizer.mode;state.oxygen={...state.oxygen,...optimizer.oxygen,altitudeFt:optimizer.recommendedAltitudeFt};state.fuelOnboardGal=clamp(optimizer.recommendedFuelGal,0,AIRCRAFT.usableFuelGal);state.weightBalance=optimizer.weightBalance||scaleWeightBalanceToPayload(state.weightBalance,optimizer.recommendedPayloadLb);persistWeightBalance();state.selectedAltitudeFt=optimizer.recommendedAltitudeFt;state.powerSetting={type:"AUTO",mapInHg:PERFORMANCE.modes[state.mode].mapInHg,rpm:PERFORMANCE.modes[state.mode].rpm};state.manual.fuelRemainingGal=state.fuelOnboardGal;$("#payloadInput").value=String(state.payloadLb);$("#fuelInput").value=String(state.fuelOnboardGal);$$('[data-mode]').forEach((button)=>button.classList.toggle("active",button.dataset.mode===state.mode));localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();showToast(`${t(optimizer.achievedStatus==="viable"?"viable":"marginalStatus")} · ${optimizer.mode} · FL${optimizer.recommendedAltitudeFt/100} · ${formatFuel(optimizer.recommendedFuelGal,1)}`);});

$("#oxygenAltitude").addEventListener("change",(event)=>{state.oxygen.altitudeFt=Number(event.target.value);localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$("#oxygenBottle").addEventListener("change",(event)=>{state.oxygen.bottleModel=event.target.value;localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$("#oxygenBottleCount").addEventListener("change",(event)=>{state.oxygen.bottles=clamp(Number(event.target.value),0,4);localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$$('[data-oxygen-seat]').forEach((input)=>input.addEventListener("change",()=>{const keys=["pilot","copilot","rearLeft","rearCenter","rearRight"],index=Number(input.dataset.oxygenSeat),key=keys[index];state.weightBalance[key]=input.checked?Math.max(state.weightBalance[key],index===0?190:170):0;persistWeightBalance();render();}));
$$('[data-wb-key]').forEach((input)=>input.addEventListener("input",()=>{state.weightBalance[input.dataset.wbKey]=Math.max(0,weightFromDisplay(Number(input.value)||0));persistWeightBalance();render();}));
$("#applyOxygenRecommendation").addEventListener("click",()=>{const analysis=calculatePlan(state),target=analysis.results.find((item)=>item.altitudeFt===Number(state.oxygen.altitudeFt))||analysis.winners.overall,oxygen=calculateOxygenPlan({result:target,oxygen:state.oxygen});state.oxygen.bottles=clamp(oxygen.recommendedBottles,0,4);localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});

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
  state.calibration[state.mode]=deriveCalibration({plan:state.plan,mode:state.mode,payloadLb:state.payloadLb,fuelRemainingGal,oxygenWeightLb:currentOxygenWeightLb(),altitudeFt,observedTasKt:Number($("#observedTas").value),observedFuelFlowGph:fuelFromDisplay(Number($("#observedFuelFlow").value)),positionFix:state.plan.waypoints[Number($("#manualWaypoint").value)],powerSetting:state.powerSetting});
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  render();
});

$("#resetCalibration").addEventListener("click",()=>{
  delete state.calibration[state.mode];
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  $("#observedTas").value=""; $("#observedFuelFlow").value="";
  render();
});

$("#debriefForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  const analysis=calculatePlan(state),result=analysis.results.find((item)=>item.altitudeFt===state.selectedAltitudeFt&&operationallyAvailable(item))||analysis.winners.overall;
  const debrief=calculateDebrief({result,actualTimeMinutes:Number($("#debriefTime").value),actualFuelGal:fuelFromDisplay(Number($("#debriefFuel").value)),currentCalibration:state.calibration[state.mode]||{}});
  state.calibration[state.mode]=debrief.calibration;
  state.lastDebrief=debrief;
  state.debriefs.push({route:`${state.plan.origin.icao}-${state.plan.destination.icao}`,mode:state.mode,fl:result.fl,accuracyScore:debrief.accuracyScore,timeErrorPct:debrief.timeErrorPct,fuelErrorPct:debrief.fuelErrorPct,date:new Date().toISOString()});
  state.debriefs=state.debriefs.slice(-PERFORMANCE.debrief.maximumHistory);
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  localStorage.setItem("velocityxl.debriefs",JSON.stringify(state.debriefs));
  render();
});

$("#simbriefImportForm").addEventListener("submit",async(event)=>{event.preventDefault();const input=$("#quickPilotId"),identifier=input.value.trim();if(!identifier){showToast(t("missingId"),true);input.focus();return;}const button=$("#importLatest");try{button.disabled=true;button.setAttribute("aria-busy","true");button.textContent="…";let plan;try{plan=await fetchLatestOFP(identifier,"userid");}catch(firstError){plan=await fetchLatestOFP(identifier,"username");}state.plan=plan;state.selectedAltitudeFt=null;state.oxygen.altitudeFt=ALTITUDES_FT.reduce((best,altitude)=>Math.abs(altitude-plan.plannedAltitudeFt)<Math.abs(best-plan.plannedAltitudeFt)?altitude:best,ALTITUDES_FT[0]);state.manual={active:false,waypointIndex:0,distanceNm:0,fuelRemainingGal:state.fuelOnboardGal,altitudeFt:null};localStorage.setItem("velocityxl.simbriefIdentifier",identifier);localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();}catch(error){showToast(error.message||t("importError"),true);}finally{button.disabled=false;button.removeAttribute("aria-busy");button.textContent=t("importLatest");}});

const savedIdentifier=localStorage.getItem("velocityxl.simbriefIdentifier"); if(savedIdentifier)$("#quickPilotId").value=savedIdentifier;
render();
