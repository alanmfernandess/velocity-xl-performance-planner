import { AIRCRAFT, PERFORMANCE, DEMO_PLAN } from "./config.js";
import { calculatePlan, isaTemperatureC } from "./engine.js";
import { fetchLatestOFP } from "./simbrief.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const formatTime = (hours) => {
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};
const signed = (value, suffix = "") => `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value))}${suffix}`;

const state = {
  plan: structuredClone(DEMO_PLAN),
  mode: "NORMAL",
  payloadLb: 520,
  fuelOnboardGal: 77,
  reserveMinutes: 45,
  metric: "fuel",
  criterion: "overall",
  selectedAltitudeFt: null,
  identifierType: "userid",
};

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3400);
}

function metricConfig() {
  if (state.metric === "time") return { key: "tripTimeHr", label: "Tempo total", unit: "h", better: "Menor tempo total é melhor", value: (v) => formatTime(v) };
  if (state.metric === "efficiency") return { key: "specificRangeNmGal", label: "Eficiência", unit: "NM/GAL", better: "Maior distância por galão é melhor", value: (v) => one.format(v) };
  return { key: "fuelRequiredGal", label: "Fuel required", unit: "GAL", better: "Menor combustível total é melhor", value: (v) => one.format(v) };
}

function renderPerformanceChart(results, recommended) {
  const config = metricConfig();
  const values = results.map((r) => r[config.key]);
  const width = 860, height = 280, left = 50, right = 18, top = 26, bottom = 48;
  const min = Math.min(...values), max = Math.max(...values), spread = max - min || 1;
  const x = (i) => left + (i / (results.length - 1)) * (width - left - right);
  const y = (value) => top + ((max - value) / spread) * (height - top - bottom - 20) + 10;
  const points = results.map((r, i) => `${x(i)},${y(r[config.key])}`).join(" ");
  const area = `${left},${height - bottom} ${points} ${x(results.length - 1)},${height - bottom}`;
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const yy = top + ratio * (height - top - bottom);
    const labelValue = max - ratio * spread;
    return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="rgba(149,181,207,.09)"/><text x="${left-12}" y="${yy+3}" fill="#70869a" font-size="9" text-anchor="end">${config.value(labelValue)}</text>`;
  }).join("");
  const dots = results.map((r, i) => {
    const isBest = r.altitudeFt === recommended.altitudeFt;
    const selected = r.altitudeFt === (state.selectedAltitudeFt || recommended.altitudeFt);
    return `<g class="chart-point" data-altitude="${r.altitudeFt}" tabindex="0" role="button" aria-label="FL${r.fl}: ${config.value(r[config.key])} ${config.unit}">
      ${selected ? `<circle cx="${x(i)}" cy="${y(r[config.key])}" r="13" fill="${isBest ? "rgba(184,247,59,.08)" : "rgba(61,220,244,.08)"}"/>` : ""}
      <circle cx="${x(i)}" cy="${y(r[config.key])}" r="${isBest ? 6 : 4}" fill="${isBest ? "#b8f73b" : "#3ddcf4"}" stroke="#0b1828" stroke-width="2"/>
      ${isBest ? `<g transform="translate(${x(i)-31},${y(r[config.key])-39})"><rect width="62" height="22" rx="11" fill="#b8f73b"/><text x="31" y="14" fill="#07111f" text-anchor="middle" font-size="8" font-weight="700">BEST · ${config.value(r[config.key])}</text></g>` : ""}
      <text x="${x(i)}" y="${height-20}" fill="${isBest ? "#b8f73b" : "#70869a"}" font-size="9" text-anchor="middle">FL${r.fl}</text>
    </g>`;
  }).join("");
  $("#performanceChart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ddcf4" stop-opacity=".22"/><stop offset="1" stop-color="#3ddcf4" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#area)"/><polyline points="${points}" fill="none" stroke="#3ddcf4" stroke-width="2" stroke-linejoin="round"/>${dots}<text x="${left}" y="12" fill="#70869a" font-size="8" letter-spacing="1.3">${config.label.toUpperCase()} · ${config.unit}</text></svg>`;
  $("#chartHint").textContent = config.better;
  $$(".chart-point").forEach((point) => {
    const select = () => { state.selectedAltitudeFt = Number(point.dataset.altitude); render(); };
    point.addEventListener("click", select);
    point.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") select(); });
  });
}

function renderRouteMap(plan, result) {
  const fixes = plan.waypoints.filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon));
  const width = 860, height = 210, padX = 52, padY = 34;
  const lats = fixes.map((w) => w.lat), lons = fixes.map((w) => w.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 1, lonSpan = maxLon - minLon || 1;
  const project = (fix) => ({ x: padX + ((fix.lon - minLon) / lonSpan) * (width - padX * 2), y: height - padY - ((fix.lat - minLat) / latSpan) * (height - padY * 2) });
  const points = fixes.map(project);
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const shown = fixes.filter((_, i) => i === 0 || i === fixes.length - 1 || (i % Math.max(1, Math.ceil(fixes.length / 5)) === 0));
  const dots = shown.map((fix) => {
    const p = project(fix), endpoint = fix === fixes[0] || fix === fixes[fixes.length - 1];
    return `<g><circle cx="${p.x}" cy="${p.y}" r="${endpoint ? 7 : 4}" fill="${endpoint ? "#b8f73b" : "#0d1c2d"}" stroke="${endpoint ? "#b8f73b" : "#3ddcf4"}" stroke-width="2"/><text x="${p.x}" y="${p.y-14}" text-anchor="middle" fill="${endpoint ? "#eff8fc" : "#8296a9"}" font-size="9" font-weight="${endpoint ? 700 : 500}">${escapeHtml(fix.ident)}</text></g>`;
  }).join("");
  const windSamples = result.weather.samples.slice(0, 6).map((sample, i) => {
    const x = padX + sample.progress * (width - padX * 2), y = 178;
    return `<g transform="translate(${x},${y}) rotate(${sample.windDir + 180})"><line x1="-10" y1="0" x2="10" y2="0" stroke="#61788b"/><path d="M 5 -4 L 10 0 L 5 4" fill="none" stroke="#61788b"/></g>`;
  }).join("");
  $("#routeMap").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Representação gráfica da rota"><defs><linearGradient id="routeStroke" x1="0" x2="1"><stop stop-color="#3ddcf4"/><stop offset="1" stop-color="#b8f73b"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="${path}" fill="none" stroke="rgba(61,220,244,.12)" stroke-width="10" filter="url(#glow)"/><path d="${path}" fill="none" stroke="url(#routeStroke)" stroke-width="2" stroke-dasharray="4 4"/>${dots}${windSamples}</svg>`;
}

function renderVerticalProfile(plan, result) {
  const width = 860, height = 190, left = 36, right = 24, top = 26, base = 148;
  const tocX = left + (result.climb.distanceNm / plan.distanceNm) * (width-left-right);
  const todX = width-right - (result.descent.distanceNm / plan.distanceNm) * (width-left-right);
  const cruiseY = top + (25000 - result.altitudeFt) / 25000 * 32;
  $("#verticalProfile").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Perfil vertical do voo"><defs><linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3ddcf4" stop-opacity=".19"/><stop offset="1" stop-color="#3ddcf4" stop-opacity="0"/></linearGradient></defs>
    ${[10000,15000,20000,25000].map((alt) => { const y=top+(25000-alt)/25000*90; return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="rgba(149,181,207,.08)"/><text x="${left-8}" y="${y+3}" text-anchor="end" fill="#61788b" font-size="8">FL${alt/100}</text>`;}).join("")}
    <path d="M${left},${base} L${tocX},${cruiseY} L${todX},${cruiseY} L${width-right},${base} L${left},${base}Z" fill="url(#profileFill)"/>
    <path d="M${left},${base} L${tocX},${cruiseY}" stroke="#3ddcf4" stroke-width="2"/><path d="M${tocX},${cruiseY} L${todX},${cruiseY}" stroke="#b8f73b" stroke-width="2"/><path d="M${todX},${cruiseY} L${width-right},${base}" stroke="#ffb766" stroke-width="2"/>
    <line x1="${tocX}" y1="${cruiseY}" x2="${tocX}" y2="${base}" stroke="rgba(149,181,207,.18)" stroke-dasharray="3 4"/><line x1="${todX}" y1="${cruiseY}" x2="${todX}" y2="${base}" stroke="rgba(149,181,207,.18)" stroke-dasharray="3 4"/>
    <text x="${tocX}" y="${cruiseY-10}" text-anchor="middle" fill="#8296a9" font-size="8">TOC</text><text x="${todX}" y="${cruiseY-10}" text-anchor="middle" fill="#8296a9" font-size="8">TOD</text><text x="${(tocX+todX)/2}" y="${cruiseY-10}" text-anchor="middle" fill="#b8f73b" font-size="9" font-weight="700">FL${result.fl}</text>
    <text x="${left}" y="${base+23}" fill="#eff8fc" font-size="9" font-weight="700">${escapeHtml(plan.origin.icao)}</text><text x="${width-right}" y="${base+23}" text-anchor="end" fill="#eff8fc" font-size="9" font-weight="700">${escapeHtml(plan.destination.icao)}</text>
  </svg>`;
}

function renderLevelCards(results, recommended) {
  $("#levelCards").innerHTML = results.map((r) => `<button class="level-card ${r.altitudeFt === recommended.altitudeFt ? "recommended" : ""} ${r.altitudeFt === (state.selectedAltitudeFt || recommended.altitudeFt) ? "selected" : ""}" data-level="${r.altitudeFt}" type="button"><b>FL${r.fl}</b><span>FUEL · ETE · GS</span><strong>${one.format(r.fuelRequiredGal)} gal · ${formatTime(r.tripTimeHr)} · ${Math.round(r.gsKt)} kt</strong></button>`).join("");
  $$(".level-card").forEach((card) => card.addEventListener("click", () => { state.selectedAltitudeFt = Number(card.dataset.level); render(); }));
}

function renderFuel(result) {
  const pieces = [
    { label:"Trip", value:result.tripFuelGal, color:"#3ddcf4" },
    { label:"Reserva", value:result.reserveFuelGal, color:"#b8f73b" },
    { label:"Contingência", value:result.contingencyFuelGal, color:"#ffb766" },
    { label:"Taxi", value:PERFORMANCE.taxiFuelGal, color:"#8b72ff" },
  ];
  const total = pieces.reduce((sum, p) => sum + p.value, 0);
  $("#fuelBar").innerHTML = pieces.map((p) => `<span style="width:${(p.value/total)*100}%;background:${p.color}"></span>`).join("");
  $("#fuelLegend").innerHTML = pieces.map((p) => `<div><i style="background:${p.color}"></i><span>${p.label}</span><b>${one.format(p.value)} gal</b></div>`).join("");
}

function renderWhy(result, analysis) {
  const fuelRank = [...analysis.results].sort((a,b)=>a.fuelRequiredGal-b.fuelRequiredGal).findIndex((r)=>r.altitudeFt===result.altitudeFt)+1;
  const timeRank = [...analysis.results].sort((a,b)=>a.tripTimeHr-b.tripTimeHr).findIndex((r)=>r.altitudeFt===result.altitudeFt)+1;
  const windText = result.weather.componentKt >= 0 ? `${Math.round(result.weather.componentKt)} kt de vento de cauda` : `${Math.abs(Math.round(result.weather.componentKt))} kt de vento de proa`;
  $("#whyTitle").textContent = `FL${result.fl} é o melhor equilíbrio`;
  $("#whyList").innerHTML = [
    `${fuelRank}º menor fuel required entre os níveis`,
    `${timeRank}º menor tempo, com ${Math.round(result.gsKt)} kt de GS média`,
    `${windText} e ${signed(result.weather.isaDeviationC, "°C")} ISA`,
  ].map((text)=>`<li>${escapeHtml(text)}</li>`).join("");
}

function render() {
  const analysis = calculatePlan(state);
  const recommended = analysis.winners[state.criterion];
  const selected = analysis.results.find((r) => r.altitudeFt === state.selectedAltitudeFt) || recommended;
  const plan = state.plan;

  $("#routeTitle").innerHTML = `${escapeHtml(plan.origin.icao)} <span>→</span> ${escapeHtml(plan.destination.icao)}`;
  $("#routeDistance").textContent = `${fmt.format(plan.distanceNm)} NM`;
  $("#routeAltitude").textContent = `PLANEJADO FL${Math.round(plan.plannedAltitudeFt/100)}`;
  $("#routeSource").textContent = plan.source === "SIMBRIEF" ? "SIMBRIEF IMPORTADO" : "DADOS DEMO";
  $("#kpiAltitude").textContent = `FL${recommended.fl}`;
  $("#kpiScore").textContent = recommended.score;
  $("#kpiFuel").innerHTML = `${one.format(recommended.fuelRequiredGal)} <small>GAL</small>`;
  $("#kpiFuelDelta").textContent = `${signed(state.fuelOnboardGal - recommended.fuelRequiredGal, " gal")} de margem`;
  $("#kpiTime").textContent = formatTime(recommended.tripTimeHr);
  $("#kpiGs").textContent = `GS média ${Math.round(recommended.gsKt)} kt`;
  $("#kpiRange").innerHTML = `${fmt.format(recommended.maxRangeNm)} <small>NM</small>`;
  $("#kpiSpecificRange").textContent = `${one.format(recommended.specificRangeNmGal)} NM/gal · ${one.format(recommended.enduranceHr)} h`;
  $("#scoreRing").textContent = recommended.score;
  renderPerformanceChart(analysis.results, recommended);
  renderRouteMap(plan, selected);
  renderVerticalProfile(plan, selected);
  renderLevelCards(analysis.results, recommended);
  renderFuel(selected);
  renderWhy(recommended, analysis);

  $("#avgWind").textContent = `${String(Math.round(selected.weather.windDir)).padStart(3,"0")}° / ${Math.round(selected.weather.windSpeedKt)} kt`;
  $("#isaDeviation").textContent = `ISA ${signed(selected.weather.isaDeviationC, "°C")}`;
  $("#windComponent").textContent = `${signed(selected.weather.componentKt, " kt")} ${selected.weather.componentKt >= 0 ? "tailwind" : "headwind"}`;
  $("#cruiseOat").textContent = `${Math.round(selected.weather.oatC)}°C`;
  $("#alternate").textContent = plan.alternate || "—";
  $("#tocTodNote").textContent = `TOC ${Math.round(selected.climb.distanceNm)} NM · TOD ${Math.round(selected.descent.distanceNm)} NM`;
  $("#climbStats").textContent = `${Math.round(selected.climb.timeHr*60)} min · ${Math.round(selected.climb.distanceNm)} NM · ${one.format(selected.climb.fuelGal)} gal`;
  $("#cruiseStats").textContent = `${Math.round(selected.cruiseTimeHr*60)} min · ${Math.round(selected.cruiseDistanceNm)} NM · ${one.format(selected.cruiseFuelGal)} gal`;
  $("#descentStats").textContent = `${Math.round(selected.descent.timeHr*60)} min · ${Math.round(selected.descent.distanceNm)} NM · ${one.format(selected.descent.fuelGal)} gal`;
  $("#fuelRequiredSide").textContent = `${one.format(selected.fuelRequiredGal)} gal`;

  $("#payloadOutput").textContent = `${fmt.format(state.payloadLb)} lb`;
  $("#fuelOutput").textContent = `${fmt.format(state.fuelOnboardGal)} gal`;
  const weight = AIRCRAFT.emptyWeightLb + state.payloadLb + state.fuelOnboardGal * AIRCRAFT.fuelDensityLbGal;
  $("#weightValue").textContent = `${fmt.format(weight)} lb`;
  $("#weightBar").style.width = `${Math.min(100, (weight/AIRCRAFT.maxGrossWeightLb)*100)}%`;
  $("#weightBar").style.background = weight > AIRCRAFT.maxGrossWeightLb ? "#ff6d75" : "linear-gradient(90deg, var(--cyan), var(--lime))";
  $("#weightNote").textContent = weight > AIRCRAFT.maxGrossWeightLb ? `${fmt.format(weight-AIRCRAFT.maxGrossWeightLb)} lb acima do máximo estimado` : `${fmt.format(AIRCRAFT.maxGrossWeightLb-weight)} lb abaixo do máximo`;
  $("#weightNote").style.color = weight > AIRCRAFT.maxGrossWeightLb ? "var(--red)" : "";

  $("#winnerOverall").textContent = `FL${analysis.winners.overall.fl}`;
  $("#winnerFuel").textContent = `FL${analysis.winners.fuel.fl}`;
  $("#winnerFastest").textContent = `FL${analysis.winners.fastest.fl}`;
  $("#winnerRange").textContent = `FL${analysis.winners.range.fl}`;
}

$$('[data-mode]').forEach((button) => button.addEventListener("click", () => {
  state.mode = button.dataset.mode;
  state.selectedAltitudeFt = null;
  $$('[data-mode]').forEach((item) => item.classList.toggle("active", item === button));
  $("#modeDescription").textContent = PERFORMANCE.modes[state.mode].description;
  render();
}));
$$('[data-metric]').forEach((button) => button.addEventListener("click", () => {
  state.metric = button.dataset.metric;
  $$('[data-metric]').forEach((item) => item.classList.toggle("active", item === button));
  render();
}));
$$('[data-criterion]').forEach((button) => button.addEventListener("click", () => {
  state.criterion = button.dataset.criterion;
  state.selectedAltitudeFt = null;
  $$('[data-criterion]').forEach((item) => item.classList.toggle("active", item === button));
  render();
}));

$("#payloadInput").addEventListener("input", (event) => { state.payloadLb = Number(event.target.value); render(); });
$("#fuelInput").addEventListener("input", (event) => { state.fuelOnboardGal = Number(event.target.value); render(); });
$("#reserveInput").addEventListener("change", (event) => { state.reserveMinutes = Number(event.target.value); render(); });
$("#resetDemo").addEventListener("click", () => { state.plan = structuredClone(DEMO_PLAN); state.selectedAltitudeFt = null; render(); showToast("Dados demonstrativos restaurados."); });

const importDialog = $("#importDialog");
const aboutDialog = $("#aboutDialog");
$("#openImport").addEventListener("click", () => importDialog.showModal());
$("#aboutButton").addEventListener("click", () => aboutDialog.showModal());
$("#showMethod").addEventListener("click", () => aboutDialog.showModal());
$$('[data-close-about]').forEach((button) => button.addEventListener("click", () => aboutDialog.close()));
$("#useDemo").addEventListener("click", () => { importDialog.close(); state.plan = structuredClone(DEMO_PLAN); render(); });
$$('[data-idtype]').forEach((button) => button.addEventListener("click", () => {
  state.identifierType = button.dataset.idtype;
  $$('[data-idtype]').forEach((item) => item.classList.toggle("active", item === button));
  $("#identifierLabel").textContent = state.identifierType === "userid" ? "SimBrief Pilot ID" : "Navigraph Alias";
  $("#identifierInput").placeholder = state.identifierType === "userid" ? "Ex.: 123456" : "Ex.: seu_alias";
  $("#identifierInput").inputMode = state.identifierType === "userid" ? "numeric" : "text";
}));

$("#importForm").addEventListener("submit", async (event) => {
  const submitter = event.submitter;
  if (submitter?.value === "cancel") return;
  event.preventDefault();
  const input = $("#identifierInput");
  const button = $("#importSubmit");
  const previous = button.textContent;
  try {
    button.disabled = true;
    button.textContent = "Consultando SimBrief…";
    const plan = await fetchLatestOFP(input.value, state.identifierType);
    state.plan = plan;
    state.selectedAltitudeFt = null;
    localStorage.setItem("velocityxl.simbriefIdentifier", input.value.trim());
    localStorage.setItem("velocityxl.simbriefIdentifierType", state.identifierType);
    importDialog.close();
    render();
    showToast(`${plan.origin.icao} → ${plan.destination.icao} importado com sucesso.`);
  } catch (error) {
    showToast(error.message || "Não foi possível importar o OFP.", true);
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
});

const savedIdentifier = localStorage.getItem("velocityxl.simbriefIdentifier");
const savedType = localStorage.getItem("velocityxl.simbriefIdentifierType");
if (savedIdentifier) $("#identifierInput").value = savedIdentifier;
if (savedType && savedType !== state.identifierType) document.querySelector(`[data-idtype="${savedType}"]`)?.click();

render();
