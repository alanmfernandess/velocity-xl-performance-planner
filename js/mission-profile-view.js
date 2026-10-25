import { buildMissionProfile, sampleMissionTime, sampleMissionDistance, clusterProfileWaypoints,
  searchProfileWaypoints, profileWeatherLayers, profilePositionAtDistance } from "./mission-profile.js?v=20261024-03";
import { buildMissionEvents, missionAdvisor } from "./mission-events.js?v=20261024-03";
import { evaluateDepartureScenario } from "./mission-time.js?v=20261024-03";
import { weatherAt } from "./weather/fusion.js?v=20261024-03";
import { sampleGfs } from "./weather/open-meteo.js?v=20261024-03";
import { terminalWeatherAtTime } from "./engine.js?v=20261024-03";

import { createFlightRibbonData, flightRibbonPosition } from "./flight-ribbon.js?v=20261024-03";

const words = {
  "pt-BR": { schematic: "FASES · ESQUEMÁTICO", preview: "Prévia", distance: "Distância", altitude: "Altitude · MSL", fuelRemaining: "Combustível restante",
    search: "Buscar waypoint", close: "Fechar", sources: "Dados & fontes", original: "Original", noData: "NÃO AVALIADO",
    noCoverage: "SEM COBERTURA", planned: "PREVISTO", analyzing: "EM ANÁLISE", applied: "APLICADO", automatic: "AUTOMÁTICO",
    noProfile: "PERFIL INDISPONÍVEL", noLocation: "POSIÇÃO NÃO DETERMINADA", noMatches: "Nenhum waypoint", play: "Reproduzir prévia", pause: "Pausar prévia",
    previousFix: "Waypoint anterior", nextFix: "Próximo waypoint", previousEvent: "Evento anterior", nextEvent: "Próximo evento",
    climb: "SUBIDA", cruise: "CRUZEIRO", descent: "DESCIDA", used: "USADO", samples: "amostras", departure: "Partida", arrival: "Chegada",
    pending: "CALCULANDO", unknown: "NÃO AVALIADO", viable: "VIÁVEL", marginal: "MARGINAL", "not-viable": "INVIÁVEL",
    reference: "Referência", fuelBasis: "Combustível · cenário", convergence: "Convergência", iterations: "iterações", available: "DISPONÍVEL", unavailable: "INDISPONÍVEL", stale: "VENCIDO",
    position: "Distâncias", time: "Tempo", forecast: "Previsão", limitations: "Limites", localOnly: "Prévia independente do Tracker",
    DEPARTURE: "PARTIDA", ARRIVAL: "CHEGADA", WAYPOINT: "WAYPOINT", TOC: "TOC", TOD: "TOD", ETP: "ETP", PNR: "PNR",
    ICE_ENTRY: "ICE · ENTRADA", ICE_EXIT: "ICE · SAÍDA", RIDE_ENTRY: "RIDE · ENTRADA", RIDE_EXIT: "RIDE · SAÍDA", FUEL_RESERVE: "FUEL · RESERVA",
    NO_BLOCKER: "MISSÃO · SEM BLOQUEIOS", NO_OFP: "OFP · NÃO IMPORTADO", FUEL_OPPORTUNITY: "FUEL · MENOR CONSUMO",
    OXYGEN: "O₂ · CAPACIDADE INSUFICIENTE", ICE: "ICE · RESTRIÇÃO", RIDE: "RIDE · RESTRIÇÃO", ALTERNATE: "ALTERNADO · RESTRIÇÃO",
    FUEL_CAPACITY: "FUEL · CAPACIDADE EXCEDIDA", WEIGHT: "W&B · PESO EXCEDIDO", CG_AFT: "W&B · CG TRASEIRO", CG_FORWARD: "W&B · CG DIANTEIRO",
    FUEL: "FUEL · INSUFICIENTE", ALTITUDE: "ALTITUDE · ACIMA DO TETO", AIRPORT_ABOVE_FL: "FL · ABAIXO DO AERÓDROMO", PROFILE: "PERFIL · INCOMPATÍVEL",
    icing: "ICE · ATENÇÃO", turbulence: "RIDE · ATENÇÃO", oxygen: "O₂ · MARGEM REDUZIDA", fuel: "FUEL · MARGEM REDUZIDA",
    alternate: "ALTERNADO · MARGEM REDUZIDA", "weight-balance": "W&B · ATENÇÃO", performance: "PERFORMANCE · ATENÇÃO", efficiency: "FUEL · EFICIÊNCIA",
  },
  "en-US": { schematic: "PHASES · SCHEMATIC", preview: "Preview", distance: "Distance", altitude: "Altitude · MSL", fuelRemaining: "Fuel remaining",
    search: "Find waypoint", close: "Close", sources: "Data & sources", original: "Original", noData: "UNASSESSED",
    noCoverage: "NO COVERAGE", planned: "FORECAST", analyzing: "UNDER REVIEW", applied: "APPLIED", automatic: "AUTOMATIC",
    noProfile: "PROFILE UNAVAILABLE", noLocation: "POSITION UNDETERMINED", noMatches: "No waypoints", play: "Play preview", pause: "Pause preview",
    previousFix: "Previous waypoint", nextFix: "Next waypoint", previousEvent: "Previous event", nextEvent: "Next event",
    climb: "CLIMB", cruise: "CRUISE", descent: "DESCENT", used: "USED", samples: "samples", departure: "Departure", arrival: "Arrival",
    pending: "CALCULATING", unknown: "UNASSESSED", viable: "VIABLE", marginal: "MARGINAL", "not-viable": "NOT VIABLE",
    reference: "Reference", fuelBasis: "Scenario fuel", convergence: "Convergence", iterations: "iterations", available: "AVAILABLE", unavailable: "UNAVAILABLE", stale: "STALE",
    position: "Distances", time: "Time", forecast: "Forecast", limitations: "Limits", localOnly: "Preview independent of Tracker",
    DEPARTURE: "DEPARTURE", ARRIVAL: "ARRIVAL", WAYPOINT: "WAYPOINT", TOC: "TOC", TOD: "TOD", ETP: "ETP", PNR: "PNR",
    ICE_ENTRY: "ICE · ENTRY", ICE_EXIT: "ICE · EXIT", RIDE_ENTRY: "RIDE · ENTRY", RIDE_EXIT: "RIDE · EXIT", FUEL_RESERVE: "FUEL · RESERVE",
    NO_BLOCKER: "MISSION · NO BLOCKERS", NO_OFP: "OFP · NOT IMPORTED", FUEL_OPPORTUNITY: "FUEL · LOWER CONSUMPTION",
    OXYGEN: "O₂ · INSUFFICIENT CAPACITY", ICE: "ICE · RESTRICTION", RIDE: "RIDE · RESTRICTION", ALTERNATE: "ALTERNATE · RESTRICTION",
    FUEL_CAPACITY: "FUEL · CAPACITY EXCEEDED", WEIGHT: "W&B · OVERWEIGHT", CG_AFT: "W&B · AFT CG", CG_FORWARD: "W&B · FORWARD CG",
    FUEL: "FUEL · INSUFFICIENT", ALTITUDE: "ALTITUDE · ABOVE CEILING", AIRPORT_ABOVE_FL: "FL · BELOW AIRPORT", PROFILE: "PROFILE · INCOMPATIBLE",
    icing: "ICE · ATTENTION", turbulence: "RIDE · ATTENTION", oxygen: "O₂ · LOW MARGIN", fuel: "FUEL · LOW MARGIN",
    alternate: "ALTERNATE · LOW MARGIN", "weight-balance": "W&B · ATTENTION", performance: "PERFORMANCE · ATTENTION", efficiency: "FUEL · EFFICIENCY",
  },
};
const reasons = {
  MISSING_FLIGHT_TIME: ["UTC · INDISPONÍVEL", "UTC · UNAVAILABLE"], PROVIDER_UNAVAILABLE: ["GFS · SEM COBERTURA", "GFS · NO COVERAGE"],
  OUTSIDE_FORECAST_WINDOW: ["GFS · FORA DA JANELA UTC", "GFS · OUTSIDE UTC WINDOW"], OUTSIDE_SPATIAL_COVERAGE: ["GFS · FORA DA COBERTURA ESPACIAL", "GFS · OUTSIDE SPATIAL COVERAGE"],
  OUTSIDE_VERTICAL_COVERAGE: ["GFS · SEM COBERTURA VERTICAL", "GFS · NO VERTICAL COVERAGE"],
  ATMOSPHERIC_FIELDS_MISSING: ["GFS · VENTO/TEMPERATURA INDISPONÍVEL", "GFS · WIND/TEMPERATURE UNAVAILABLE"],
  TIME_SOLVER_NOT_CONVERGED: ["HORÁRIO · SEM CONVERGÊNCIA", "TIME · NOT CONVERGED"],
  OFP_ADVISORY_VALIDITY_UNKNOWN: ["OFP · VALIDADE NÃO DETERMINADA", "OFP · VALIDITY UNKNOWN"],
};
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);

/** Native presenter: a preview interaction never calls app render/optimization. */
export function createMissionProfilePresenter() {
  const host = $("missionProfilePanel");
  let context = null, model = null, layers = null, events = [], offset = 0, layer = "METEO";
  let elapsedSec = 0, selectedFixId = null, selectedEvent = 0, focus = "waypoint", playing = false, frame = null, lastFrame = null;
  let revision = 0, comparisons = new Map(), computing = false, graph = null;
  const models = new WeakMap();
  let externalScenario = null, resilienceAdvice = null;
  const w = (key) => words[context?.language || "pt-BR"][key] || key;
  const n = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString(context.language, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
  const fuel = (value) => `${n(context.fuelUnit === "l" ? value * 3.785411784 : value, 1)}\u00a0${context.fuelUnit === "l" ? "L" : "gal"}`;
  const utc = (value) => Number.isFinite(value) ? new Date(value).toLocaleString(context.language, { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "") + "Z" : "—";
  const duration = (seconds, round = false) => {
    if (!Number.isFinite(seconds)) return "—";
    const minutes = round ? Math.round(seconds / 60) : Math.floor(seconds / 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  const reason = (code) => reasons[code]?.[context.language === "pt-BR" ? 0 : 1] || `${w("noProfile")} · ${(code || "—").replaceAll("_", " ")}`;
  const current = () => externalScenario || comparisons.get(offset);
  const currentCandidate = () => current()?.candidate || context.candidate;
  const pause = () => { playing = false; if (frame !== null) cancelAnimationFrame(frame); frame = null; lastFrame = null; $("mpPlay").setAttribute("aria-label", w("play")); $("mpPlay").setAttribute("aria-pressed", "false"); $("mpPlay").querySelector("path").setAttribute("d", "m8 5 11 7-11 7Z"); };

  function translate() {
    host.querySelectorAll("[data-profile-text]").forEach((node) => { node.textContent = w(node.dataset.profileText); });
    for (const [id, key] of [["mpPreviousFix", "previousFix"], ["mpNextFix", "nextFix"], ["mpPreviousEvent", "previousEvent"], ["mpNextEvent", "nextEvent"], ["mpPlay", playing ? "pause" : "play"]]) $(id).setAttribute("aria-label", w(key));
    $("mpProgress").setAttribute("aria-label", w("preview"));
    host.querySelector(".mp-layers").setAttribute("aria-label", context.language === "pt-BR" ? "Camadas meteorológicas" : "Weather layers");
    host.querySelector(".mp-time-options").setAttribute("aria-label", context.language === "pt-BR" ? "Horário de partida" : "Departure scenario");
    $("mpSvg").setAttribute("aria-label", `Mission Profile · ${context.plan?.origin?.icao || "—"} → ${context.plan?.destination?.icao || "—"}`);
    $("mpWaypointList").setAttribute("aria-label", "Waypoints · OFP");
  }

  function prepareModel() {
    const scenario = current();
    const candidate = scenario?.candidate;
    if (!scenario?.available || !candidate) { model = { valid: false, reason: scenario?.reason || "NO_TRAJECTORY", waypoints: [] }; layers = null; events = []; return; }
    let saved = models.get(candidate);
    if (!saved || saved.plan !== scenario.plan) {
      const next = scenario.model?.valid ? scenario.model : buildMissionProfile(scenario.plan, candidate);
      const weather = profileWeatherLayers(next, scenario.snapshot || context.mission.weatherSnapshot);
      saved = { plan: scenario.plan, model: next, layers: weather, events: buildMissionEvents(next, weather) };
      models.set(candidate, saved);
    }
    ({ model, layers, events } = saved);
    elapsedSec = Math.max(0, Math.min(elapsedSec, model.totalSec || 0));
    if (!model.waypoints.some((p) => p.id === selectedFixId)) selectedFixId = model.waypoints[0]?.id || null;
    selectedEvent = Math.min(selectedEvent, Math.max(0, events.length - 1));
  }

  function showRibbonPosition(point){
   if(!graph?.ribbon)return;
   const percent=flightRibbonPosition(graph.ribbon,point?.elapsedSec??elapsedSec);
   if(percent===null)return;
   $("mpRibbonCursor").style.left=`${Math.max(1,Math.min(99,percent))}%`;
   $("mpRibbonCursor").setAttribute("aria-label",`${duration(point?.elapsedSec??elapsedSec)} · ${n(point?.distanceNm)} NM`);
   $("mpRibbonAltitude").textContent=point?`${n(point.altitudeFt)}\u00a0ft`:"—";
   $("mpRibbonFuel").textContent=point?fuel(point.fuelRemainingGal):"—";
   host.querySelectorAll(".mp-ribbon-strip").forEach(el=>el.classList.toggle("current",el.dataset.phase===point?.phase));
  }

  function drawChart(){
   if(!model?.valid||!host.getClientRects().length)return;
   const width=Math.max(120,$("mpPlot").clientWidth);
   const ribbon=createFlightRibbonData(model.profile);
   if(!ribbon)return;
   const x=distance=>10+Math.max(0,Math.min(model.totalNm,distance))/model.totalNm*(width-20);
   graph={x,ribbon};
   const fractions=ribbon.phases.map(phase=>`${phase.weight}fr`).join(" ");
   const short={CLIMB:"CLB",CRUISE:"CRZ",DESCENT:"DSC"};
   const translated={CLIMB:w("climb"),CRUISE:w("cruise"),DESCENT:w("descent")};
   $("mpRibbonPhases").style.gridTemplateColumns=fractions;
   $("mpRibbonStrips").style.gridTemplateColumns=fractions;
   $("mpRibbonPhases").innerHTML=ribbon.phases.map(phase=>`<div class="mp-ribbon-phase" title="${esc(translated[phase.phase])}"><strong data-ui-role="label">${short[phase.phase]}</strong><span data-ui-role="label">${duration(phase.seconds,true)}</span></div>`).join("");
   $("mpRibbonStrips").innerHTML=ribbon.phases.map(phase=>`<span class="mp-ribbon-strip ${phase.phase.toLowerCase()}" data-phase="${phase.phase}"></span>`).join("");
   $("mpRibbonBoundaries").innerHTML=ribbon.boundaries.map(b=>`<span style="left:${b.percent}%" data-ui-role="label">${b.label}</span>`).join("");
   $("mpRibbonFlightLevel").textContent=`FL${n(model.candidate.altitudeFt/100)}`;
   $("mpRibbonEte").textContent=duration(model.totalSec,true);
   $("mpRibbonRailCount").textContent=`${model.waypoints.length} WPT`;
   const groups=clusterProfileWaypoints(model.waypoints,model.totalNm,width-20,selectedFixId);
   const spans=layers?.[layer]||[];
   const maxRate=Math.max(1,...spans.map(s=>Number(s.value)||0));
   const bands=layer==="FUEL"?(()=>{
    const values=model.nodes.map(node=>model.profile.startFuelGal-node.fuelUsedGal);
    const lo=Math.min(...values),hi=Math.max(...values);
    return `<path class="mp-fuel-line" d="${model.nodes.map((node,i)=>`${i?"L":"M"}${x(node.distanceNm)},${19-(values[i]-lo)/Math.max(1,hi-lo)*12}`).join(" ")}"/>`;
   })():spans.map(span=>`<rect class="mp-band ${span.known?"known":"unassessed"} ${layer.toLowerCase()}" x="${x(span.startNm)}" y="5" width="${Math.max(.5,x(span.endNm)-x(span.startNm))}" height="8" ${span.known?`opacity="${layer==="METEO"?.7:.25+.75*Math.min(1,span.value/maxRate)}"`:""}><title>${esc(layer)} · ${esc(span.known?span.value:w("noData"))}</title></rect>`).join("");
   const markerHtml=groups.map(group=>{
    const lead=group.points[0],selected=group.points.some(p=>p.id===selectedFixId);
    const name=group.points.length>1?`${group.points.length} waypoints`:lead.ident||"—";
    return `<g role="button" tabindex="0" aria-label="${esc(name)}" data-profile-fix="${esc(lead.id)}" class="mp-fix-marker ${selected?"selected":""}"><circle cx="${10+group.x}" cy="34" r="${group.points.length>1?5:3.5}"/><title>${esc(name)}</title></g>`;
   }).join("");
   const currentPoint=sampleMissionTime(model,elapsedSec);
   $("mpSvg").setAttribute("viewBox",`0 0 ${width} 55`);
   $("mpSvg").innerHTML=`<title id="mpSvgTitle">${esc($("mpSvg").getAttribute("aria-label"))}</title><line class="mp-rail-baseline" x1="10" y1="34" x2="${width-10}" y2="34"/>${bands}${markerHtml}${currentPoint?`<circle class="mp-rail-progress" id="mpRailProgress" data-distance="${currentPoint.distanceNm}" cx="${x(currentPoint.distanceNm)}" cy="34" r="5"/>`:""}`;
   $("mpOrigin").textContent=context.plan.origin.icao;
   $("mpDestination").textContent=context.plan.destination.icao;
   showRibbonPosition(currentPoint);
  }

  function drawProgress(){
   const point=sampleMissionTime(model,elapsedSec);
   if(!point||!graph)return;
   const dot=$("mpRailProgress");
   if(dot){dot.setAttribute("cx",graph.x(point.distanceNm));dot.dataset.distance=point.distanceNm;}
   showRibbonPosition(point);
  }

  function renderReadings() {
    if (!model?.valid) return;
    const fix = model.waypoints.find((p) => p.id === selectedFixId);
    const point = focus === "waypoint" ? fix?.predicted : sampleMissionTime(model, elapsedSec);
    $("mpPointName").textContent = focus === "waypoint" ? fix?.ident || "—"
      : focus === "event" ? w(events[selectedEvent]?.type) : w((point?.phase || "").toLowerCase());
    $("mpPointKind").textContent = focus === "waypoint" ? fix?.located ? fix.distanceSource.startsWith("GEOMETRIC") ? "OFP · GEO" : "OFP" : w("noLocation") : w("preview").toUpperCase();
    $("mpDistance").textContent = point ? `${n(point.distanceNm)}\u00a0NM` : "—";
    $("mpEta").textContent = point ? utc(point.timestampMs) : "—";
    $("mpAltitude").textContent = point ? `${n(point.altitudeFt)}\u00a0ft` : "—";
    $("mpFuel").textContent = point ? fuel(point.fuelRemainingGal) : "—";
    $("mpElapsed").textContent = duration(elapsedSec);
    $("mpProgress").max = String(Math.ceil(model.totalSec));
    $("mpProgress").value = String(elapsedSec >= model.totalSec ? Math.ceil(model.totalSec) : elapsedSec);
    $("mpProgress").setAttribute("aria-valuetext", `${duration(elapsedSec)} · ${point ? n(point.distanceNm) : "—"} NM`);
    if (focus !== "event" && events.length) {
      const index = events.findLastIndex((event) => event.elapsedSec <= elapsedSec + .01);
      selectedEvent = Math.max(0, index); renderEvent();
    }
    const index = model.waypoints.findIndex((p) => p.id === selectedFixId);
    $("mpPreviousFix").disabled = index <= 0; $("mpNextFix").disabled = index >= model.waypoints.length - 1;
    const position = point ? { ...profilePositionAtDistance(model, point.distanceNm), altitudeFt: point.altitudeFt, timestampMs: point.timestampMs } : null;
    const wx = position ? weatherAt(context.mission.weatherSnapshot, model.plan, position) : null;
    const forecast = position ? sampleGfs(context.mission.weatherSnapshot.gfs, position) : null;
    const temperatureSource = Number.isFinite(forecast?.oatC) ? "GFS" : Number.isFinite(wx?.oatC) ? "OFP" : null;
    const windSource = Number.isFinite(forecast?.windSpd) && Number.isFinite(forecast?.windDir) ? "GFS"
      : Number.isFinite(wx?.windSpd) && Number.isFinite(wx?.windDir) ? "OFP" : null;
    const atmosphereSource = [...new Set([temperatureSource, windSource].filter(Boolean))].join(" / ") || w("noData");
    const numbers = wx ? [Number.isFinite(wx.oatC) ? `${n(wx.oatC)}\u00a0°C` : "—", Number.isFinite(wx.windSpd) && Number.isFinite(wx.windDir) ? `${n(wx.windDir)}° / ${n(wx.windSpd)}\u00a0kt` : "—"] : ["—", "—"];
    $("mpSelectedWeather").innerHTML = `<span data-ui-role="label">${esc(atmosphereSource)}</span><strong data-ui-role="secondary">${esc(numbers.join(" · "))}</strong>`;
    const data = currentCandidate()?.result;
    let status = "";
    if (layer === "METEO") status = `GFS · ${layers.METEO.filter((p) => p.known).length}/${layers.METEO.length} ${w("samples")} · ${layers.METEO.some((p) => p.known) ? w("planned") : w("noCoverage")}`;
    else if (layer === "FUEL") status = `FUEL · ${w("used")} ${point ? fuel(point.fuelUsedGal) : "—"}`;
    else {
      const risk = layer === "ICE" ? data.icing : data.turbulence;
      const known = layer === "ICE" ? risk.compatibility !== "UNKNOWN" : !["limited", "unknown"].includes(risk.confidence);
      status = `${layer} · ${known && Number.isFinite(risk.riskScore) ? `${n(risk.riskScore)}/100 · ${w("planned")}` : w("noData")}`;
    }
    $("mpLayerStatus").textContent = status;
  }

  function renderWaypointList() {
    if (!model?.valid || $("mpWaypointsPanel").hidden) return;
    const focused = document.activeElement?.dataset.selectProfileFix;
    const matches = searchProfileWaypoints(model, $("mpWaypointSearch").value);
    $("mpWaypointList").innerHTML = matches.length ? matches.map((fix) => `<button class="mp-waypoint-row" type="button" data-select-profile-fix="${esc(fix.id)}" aria-pressed="${fix.id === selectedFixId}"><strong data-ui-role="secondary">${esc(fix.ident || "—")}</strong><span data-ui-role="label">${esc(fix.located ? `${n(fix.distanceNm)}\u00a0NM` : w("noLocation"))}</span></button>`).join("") : `<p>${w("noMatches")}</p>`;
    if (focused) $("mpWaypointList").querySelector(`[data-select-profile-fix="${focused}"]`)?.focus({ preventScroll: true });
  }

  function renderEvent() {
    const event = events[selectedEvent];
    $("mpEventUtc").textContent = utc(event?.utcMs);
    $("mpEventType").textContent = event ? w(event.type) : "—";
    $("mpEventReference").textContent = event?.type === "WAYPOINT" || ["DEPARTURE", "ARRIVAL"].includes(event?.type) ? event.reference
      : event ? `${n(event.distanceNm)}\u00a0NM · ${w(event.phase.toLowerCase())}` : "—";
    $("mpEventCount").textContent = event ? `${selectedEvent + 1} / ${events.length}` : "—";
    $("mpPreviousEvent").disabled = selectedEvent <= 0;
    $("mpNextEvent").disabled = selectedEvent >= events.length - 1;
  }

  function renderComparisons() {
    $("mpTimeComparison").innerHTML = [0, 1, 2, 3].map((hour) => {
      const scenario = comparisons.get(hour), c = scenario?.candidate;
      const title = hour ? `+${hour} h` : w("original");
      const status = !scenario ? w("pending") : !scenario.available ? reason(scenario.reason) : w(c.status);
      const score = c && !c.score.partial ? `${c.score.score}/100` : "—";
      const original = comparisons.get(0)?.candidate?.result || context.candidate?.result;
      const delta = c && original ? (c.result.tripTimeHr - original.tripTimeHr) * 60 : null;
      const roundedDelta = delta === null ? null : Math.round(delta);
      const deltaLabel = roundedDelta === null ? "" : `${roundedDelta === 0 ? "" : roundedDelta > 0 ? "+" : "−"}${n(Math.abs(roundedDelta))}\u00a0min`;
      return `<div class="mp-time-row ${hour === offset ? "selected" : ""}"><div><strong data-ui-role="secondary">${esc(title)}</strong><span data-ui-role="label">${esc(utc(scenario?.startMs))}</span></div><span class="ui-status" data-status="${esc(c?.status || "unknown")}">${esc(status)}</span><div class="mp-time-values"><strong data-ui-role="secondary">${c ? esc(fuel(c.result.tripFuelGal)) : "—"}</strong><span data-ui-role="label">${c ? esc(`${duration(c.result.tripTimeHr * 3600, true)} · ETA ${utc((scenario.startMs ?? NaN) + c.result.tripTimeHr * 3600_000)}`) : "—"}</span><span data-ui-role="label">Score ${score}${delta !== null ? ` · Δ ${esc(deltaLabel)}` : ""}</span></div></div>`;
    }).join("");
    host.querySelectorAll("[data-profile-offset]").forEach((button) => { button.setAttribute("aria-pressed", String(Number(button.dataset.profileOffset) === offset)); });
  }

  function renderSources() {
    const scenario = current();
    const candidate = scenario?.candidate || context.candidate;
    const snapshot = context.mission?.weatherSnapshot;
    const rows = [["OFP", context.plan?.ofpId || "—"], ["GFS", w(snapshot?.sources?.OPEN_METEO?.status || "unavailable")],
      ["GFS · UTC", snapshot?.gfs?.locations?.[0]?.times?.length ? `${utc(snapshot.gfs.locations[0].times[0])} → ${utc(snapshot.gfs.locations[0].times.at(-1))}` : "—"],
      ["AWC", `${w(snapshot?.sources?.AWC?.status || "unavailable")} · ${utc(snapshot?.awc?.generatedAtMs)}`],
      [w("departure"), utc(scenario?.startMs)], [w("position"), model?.valid ? `${model.distanceReference.method.replaceAll("_", " ")} · ${n(model.distanceReference.ofpNm, 1)} → ${n(model.totalNm, 1)}\u00a0NM` : "—"],
      [w("fuelBasis"), candidate ? fuel(candidate.recommendedFuelGal) : "—"],
      [w("convergence"), scenario?.converged ? `${scenario.iterations} ${w("iterations")}` : (scenario?.reason || "—").replaceAll("_", " ")]];
    if (model?.valid) {
      rows.push(["GFS · METEO", `${layers.METEO.filter((point) => point.known).length}/${layers.METEO.length} ${w("samples")}`]);
      for (const [phase, coverage] of Object.entries(candidate.result.icing.phaseCoverage || {}))
        rows.push([`ICE · ${w(phase)}`, `${coverage.covered}/${coverage.total} ${w("samples")}`]);
      for (const [code, count] of Object.entries(candidate.result.icing.coverageReasons || {}))
        rows.push(["GFS · ICE", `${code.replaceAll("_", " ")} · ${count}`]);
    }
    if (candidate) for (const terminal of ["origin", "destination", "alternate"]) {
      const time = terminal === "origin" ? scenario?.startMs : (scenario?.startMs ?? NaN) + candidate.result.tripTimeHr * 3600_000;
      const weather = terminalWeatherAtTime(scenario?.plan || context.plan, terminal, time);
      const name = context.language === "pt-BR" ? ({ origin: "ORIGEM", destination: "DESTINO", alternate: "ALTERNADO" }[terminal]) : terminal.toUpperCase();
      rows.push([`${name} · METAR/TAF`, `${weather.sources.map((s) => s.kind).join(" / ") || "—"} · TAF ${weather.tafValid ? "✓" : "—"}`]);
    }
    const limitations = [...(model?.diagnostics || []), ...(candidate?.limitations || []),
      ...(candidate?.result.icing.limitations || []), ...(!Number.isFinite(scenario?.startMs) ? ["MISSING_FLIGHT_TIME"] : []),
      ...(!scenario?.available ? [scenario?.reason] : [])].filter(Boolean);
    $("mpSourcesBody").innerHTML = rows.map(([label, value]) => `<div><span data-ui-role="label">${esc(label)}</span><strong data-ui-role="secondary">${esc(value)}</strong></div>`).join("")
      + `<div><span data-ui-role="label">${w("limitations")}</span><ul>${[...new Set(limitations)].map((item) => `<li>${esc(item.replaceAll("_", " "))}</li>`).join("")}<li>${w("localOnly")}</li></ul></div>`;
  }

  function renderAdvisor() {
    const scenario = current();
    const candidate = scenario?.available ? scenario.candidate : null;
    const advisorCandidate = externalScenario ? context.candidate : candidate;
    const nativeAdvisor = missionAdvisor(advisorCandidate, context.mission);
    const advisor = resilienceAdvice && resilienceAdvice.priority < (nativeAdvisor.code === "NO_BLOCKER" ? Infinity : nativeAdvisor.priority) ? resilienceAdvice : nativeAdvisor;
    let text = w(advisor.code);
    if (advisor === resilienceAdvice) text = `LAB · ${advisor.code}`;
    else if (text === advisor.code) text = /ICE/.test(advisor.code) ? `ICE · ${w("noData")}`
      : /RIDE/.test(advisor.code) ? `RIDE · ${w("noData")}` : advisor.priority === 1 ? `${advisor.code.replaceAll("_", " ")} · ${w("not-viable")}` : w("noData");
    if (!scenario?.available) text = reason(scenario?.reason);
    $("missionScoreAction").textContent = `${offset ? `+${offset} h · ` : ""}${text}${advisor.reference ? ` · ${advisor.reference}` : ""}`;
    let details = $("mpAdvisorDetails");
    if (!details) {
      details = document.createElement("details"); details.id = "mpAdvisorDetails"; details.className = "mp-details";
      $("missionScoreAction").closest(".mission-score-action").after(details);
      details.addEventListener("toggle", () => { const body = details.querySelector(".mp-advisor-source"); if (body) body.hidden = !details.open; });
    }
    details.innerHTML = `<summary>${w("sources")}</summary><div class="mp-advisor-source" ${details.open ? "" : "hidden"}><strong data-ui-role="secondary">${esc(advisor.code.replaceAll("_", " "))}</strong><span data-ui-role="label">${esc(advisor.source)}</span><span data-ui-role="label">${esc([...(advisorCandidate?.physicalBlockers || []), ...(advisorCandidate?.unknownReasons || [])].join(" · ").replaceAll("_", " "))}</span></div>`;
  }

  function render() {
    if (!context) return;
    translate(); prepareModel();
    const candidate = currentCandidate();
    $("mpCandidate").textContent = candidate ? candidate.profileLabel || `FL${candidate.altitudeFt / 100} · ${candidate.mode}` : "—";
    $("mpScenarioTag").textContent = externalScenario ? w("analyzing") : offset ? `+${offset} h · ${w("analyzing")}`
      : current()?.source === "SHARED_FORECAST" ? `${w("original")} · ${w("analyzing")}` : w(context.source);
    $("mpScenarioTag").textContent += ` · ${w(current()?.candidate?.status || "unknown")}`;
    $("mpScenarioTag").dataset.status = current()?.candidate?.status || "unknown";
    $("mpUnavailable").hidden = Boolean(model?.valid);
    $("mpProfileBody").hidden = !model?.valid;
    $("mpUnavailable").textContent = reason(model?.reason);
    if (!model?.valid) { $("mpLayerStatus").textContent = w("noData"); pause(); }
    else { drawChart(); renderReadings(); renderEvent(); renderWaypointList(); }
    host.querySelectorAll("[data-profile-layer]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.profileLayer === layer)));
    renderComparisons(); renderSources(); renderAdvisor();
  }

  async function computeComparisons() {
    if (computing || !context?.candidate || !context.mission) return;
    computing = true;
    const token = revision, captured = context;
    $("mpTimeComparison").setAttribute("aria-busy", "true");
    for (const hour of [0, 1, 2, 3]) {
      if (comparisons.has(hour) && comparisons.get(hour).source !== "ORIGINAL_CANDIDATE") continue;
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (token !== revision) break;
      let scenario;
      try { scenario = evaluateDepartureScenario({ mission: captured.mission, input: captured.input, candidate: captured.candidate, offsetHours: hour }); }
      catch (error) { scenario = { available: false, offsetHours: hour, reason: "SCENARIO_INVALID", diagnostic: error.message }; }
      if (token !== revision) break;
      comparisons.set(hour, scenario);
      render();
    }
    computing = false;
    $("mpTimeComparison").setAttribute("aria-busy", "false");
    if (token !== revision && $("mpTimeMachine").open) computeComparisons();
  }

  function selectFix(id) {
    const fix = model?.waypoints.find((p) => p.id === id);
    if (!fix) return;
    pause(); selectedFixId = id; focus = "waypoint";
    if (fix.predicted) elapsedSec = fix.predicted.elapsedSec;
    drawChart(); renderReadings(); renderWaypointList();
  }
  function selectEvent(index) {
    if (!events.length) return;
    pause(); selectedEvent = Math.max(0, Math.min(events.length - 1, index)); focus = "event";
    elapsedSec = events[selectedEvent].elapsedSec;
    drawChart(); renderReadings(); renderEvent();
  }
  host.addEventListener("click", (event) => {
    const target = event.target.closest("button"); if (!target) return;
    if (target.dataset.profileLayer) { layer = target.dataset.profileLayer; render(); }
    if (target.dataset.profileOffset !== undefined) { pause(); externalScenario = null; offset = Number(target.dataset.profileOffset); elapsedSec = 0; focus = "waypoint"; selectedFixId = null; render(); computeComparisons(); }
    if (target.dataset.selectProfileFix) selectFix(target.dataset.selectProfileFix);
    if (["mpPreviousFix", "mpNextFix"].includes(target.id)) {
      const index = model.waypoints.findIndex((p) => p.id === selectedFixId);
      selectFix(model.waypoints[index + (target.id === "mpNextFix" ? 1 : -1)]?.id);
    }
    if (["mpPreviousEvent", "mpNextEvent", "mpEventSelect"].includes(target.id)) selectEvent(selectedEvent + (target.id === "mpNextEvent" ? 1 : target.id === "mpPreviousEvent" ? -1 : 0));
    if (["mpWaypointsToggle", "mpWaypointsClose"].includes(target.id)) {
      const open = target.id === "mpWaypointsToggle" && $("mpWaypointsPanel").hidden;
      $("mpWaypointsPanel").hidden = !open; $("mpWaypointsToggle").setAttribute("aria-expanded", String(open));
      renderWaypointList(); (open ? $("mpWaypointSearch") : $("mpWaypointsToggle")).focus();
    }
    if (target.id === "mpPlay") {
      if (playing) pause();
      else if (model?.valid) {
        playing = true; focus = "preview"; lastFrame = null;
        if (elapsedSec >= model.totalSec) elapsedSec = 0;
        target.setAttribute("aria-label", w("pause")); target.setAttribute("aria-pressed", "true");
        target.querySelector("path").setAttribute("d", "M8 5v14M16 5v14");
        drawChart(); let lastPaint = 0;
        const tick = (timestamp) => {
          if (!playing) return;
          if (lastFrame !== null) elapsedSec = Math.min(model.totalSec, elapsedSec + Math.min(.1, (timestamp - lastFrame) / 1000) * model.totalSec / 60);
          lastFrame = timestamp;
          if (timestamp - lastPaint >= 100) { drawProgress(); renderReadings(); lastPaint = timestamp; }
          if (elapsedSec >= model.totalSec) pause(); else frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }
    }
  });
  $("mpSvg").addEventListener("click", (event) => {
    const railFix = event.target.closest("[data-profile-fix]");
    if (railFix) selectFix(railFix.dataset.profileFix);
  });
  $("mpSvg").addEventListener("keydown", (event) => {
    const railFix = event.target.closest("[data-profile-fix]");
    if (railFix && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); selectFix(railFix.dataset.profileFix);
    }
  });
  $("mpProgress").addEventListener("input", () => { pause(); focus = "preview"; elapsedSec = Math.min(model.totalSec, Number($("mpProgress").value)); drawChart(); renderReadings(); });
  $("mpWaypointSearch").addEventListener("input", renderWaypointList);
  $("mpWaypointsPanel").addEventListener("keydown", (event) => {
    if (event.key === "Escape") { $("mpWaypointsClose").click(); return; }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const rows = [...$("mpWaypointList").querySelectorAll("button")], index = rows.indexOf(document.activeElement);
    if (rows.length) { event.preventDefault(); rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))].focus(); }
  });
  $("mpTimeMachine").addEventListener("toggle", () => { $("mpTimeBody").hidden = !$("mpTimeMachine").open; if ($("mpTimeMachine").open) computeComparisons(); });
  $("mpSources").addEventListener("toggle", () => { $("mpSourcesBody").hidden = !$("mpSources").open; });
  // One ResizeObserver measures only plot geometry; no mutation-based rerendering.
  const resize = new ResizeObserver(() => drawChart()); resize.observe($("mpPlot"));
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  document.addEventListener("click", (event) => {
    const navigation = event.target.closest("[data-area-button], [data-module-button], [data-open-module]");
    if (navigation && navigation.dataset.areaButton !== "mission"
      && navigation.dataset.moduleButton !== "mission:overview") pause();
  });
  return { update(next) {
    const choiceKey = (candidate) => candidate ? JSON.stringify([candidate.altitudeFt, candidate.mode,
      candidate.powerSetting?.mapInHg, candidate.powerSetting?.rpm]) : null;
    const changed = !context || context.plan !== next.plan || context.mission !== next.mission
      || choiceKey(context.candidate) !== choiceKey(next.candidate) || context.source !== next.source
      || context.selection !== next.selection;
    context = next;
    if (changed) {
      externalScenario = null; resilienceAdvice = null;
      revision++; pause(); offset = 0; elapsedSec = 0; selectedFixId = null; selectedEvent = 0; focus = "waypoint";
      comparisons = new Map([[0, { available: Boolean(next.candidate), candidate: next.candidate, plan: next.plan,
        startMs: Number.isFinite(next.plan?.scheduledOffMs) ? next.plan.scheduledOffMs : null, offsetHours: 0, converged: true, iterations: 0, reason: "NO_TRAJECTORY", source: "ORIGINAL_CANDIDATE" }]]);
      $("mpWaypointSearch").value = "";
    }
    render();
    if ($("mpTimeMachine").open) computeComparisons();
  }, pause, previewScenario(scenario) {
    if (!context || !scenario?.available) return;
    pause(); externalScenario = scenario; offset = 0; elapsedSec = 0; render();
  }, clearPreview() { externalScenario = null; if(context) render(); },
  setResilienceAdvisor(advice) { resilienceAdvice = advice; if(context) renderAdvisor(); } };
}
