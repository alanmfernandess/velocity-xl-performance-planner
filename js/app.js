import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT, OXYGEN_CYLINDERS } from "./config.js?v=20261021-unified";
import { evaluateMissionAlternative, optimizeMission } from "./unified-optimization.js?v=20261022-04";
import { fetchGfsSnapshot } from "./weather/open-meteo.js";
import { fetchAwcSnapshot } from "./weather/awc.js";
import { createWeatherSnapshot } from "./weather/fusion.js";
import { calculateAtAltitude, calculateOxygenPlan, calculateRemainingFlightAssessment, calculateStepClimbs, calibrationForMode, clamp, deriveCalibration, migrateCalibration, normalizeWeightBalance, oxygenSystemWeightLb, randomizeWeightBalance, scaleWeightBalanceToPayload, weightBalancePayloadLb } from "./engine.js?v=20261022-tracker1";
import { fetchLatestOFP } from "./simbrief.js?v=20261022-tracker1";
import { TRACKER_STORAGE_KEY, buildVirtualFlightProfile, confirmVirtualCheckpoint, correctVirtualElapsed, finishVirtualFlight, newVirtualFlightSession, pauseVirtualFlight, projectVirtualFlight, recoverVirtualFlight, remainingExposure, resumeVirtualFlight, setVirtualTimeFactor, startVirtualFlight, virtualElapsedSeconds } from "./virtual-flight.js?v=20261022-tracker1";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
const iconMarkup = (name, className="") => `<i class="ui-icon ${className}" data-lucide="${name}" aria-hidden="true"></i>`;

const UI_ICON_RULES = [
  [".brand-mark","plane","brand"],
  ['.toolbar-group[aria-label="Weight unit"]',"scale","group"],
  ['.toolbar-group[aria-label="Fuel unit"]',"fuel","group"],
  [".language-switch","languages","group"],
  ["#planTimestamp","route","inline"],
  ["#importLatest","cloud-download","button"],
  [".kpi-grid .kpi:nth-child(1)","navigation","card"],
  [".kpi-grid .kpi:nth-child(2)","fuel","card"],
  [".kpi-grid .kpi:nth-child(3)","clock-3","card"],
  [".kpi-grid .kpi:nth-child(4)","trending-up","card"],
  [".mission-strip > div:nth-child(1)","activity","card"],
  [".mission-strip > div:nth-child(2)","snowflake","card"],
  [".mission-strip > div:nth-child(3)","waves","card"],
  [".mission-strip > div:nth-child(4)","wind","card"],
  [".power-heading > span","gauge","inline"],
  [".range-control:nth-of-type(1) b","luggage","inline"],
  [".range-control:nth-of-type(2) b","fuel","inline"],
  [".select-control > span","timer","inline"],
  [".weight-meter > div:first-child > span","scale","inline"],
  ["#optimizeMission","wand-sparkles","button"],
  ["#randomizeWeightBalance","shuffle","button"],
  [".mission-score-heading > div > span","activity","inline"],
  [".mission-score-action > span","wrench","inline"],
  [".compact-heading > span","fuel","inline"],
  ['[data-tool-view="etp"]',"route","button"],
  ['[data-tool-view="alternate"]',"map-pinned","button"],
  ['[data-tool-view="wb"]',"scale","button"],
  ['[data-tool-view="glide"]',"wind","button"],
  ['[data-tool-view="oxygen"]',"heart-pulse","button"],
  ['[data-tool-view="ride"]',"waves","button"],
  ['[data-tool-view="ice"]',"snowflake","button"],
  ['[data-tool-view="cost"]',"dollar-sign","button"],
  ['[data-tool-view="steps"]',"trending-up","button"],
  [".etp-point > span","route","inline"],
  [".pnr-point > span","rotate-ccw","inline"],
  [".navigation-speeds > span:nth-child(1) b","move-right","inline"],
  [".navigation-speeds > span:nth-child(2) b","move-left","inline"],
  [".advisor-card:nth-child(1) > span","map-pinned","inline"],
  [".advisor-card:nth-child(2) .inline-select > span","route","inline"],
  [".advisor-strip > span:nth-child(1) b","fuel","inline"],
  [".advisor-strip > span:nth-child(2) b","navigation","inline"],
  [".advisor-strip > span:nth-child(3) b","plane-landing","inline"],
  [".wb-inputs > label:nth-child(-n+5) > span:first-child","user-round","inline"],
  [".wb-inputs > label:nth-child(6) > span:first-child","luggage","inline"],
  [".wb-chart-head strong","scale","inline"],
  [".wb-kpis > span:nth-child(1) b","plane-takeoff","inline"],
  [".wb-kpis > span:nth-child(2) b","plane-landing","inline"],
  [".wb-kpis > span:nth-child(3) b","scale","inline"],
  [".wb-kpis > span:nth-child(4) b","move-horizontal","inline"],
  [".glide-kpis > span:nth-child(1) b","ratio","inline"],
  [".glide-kpis > span:nth-child(2) b","gauge","inline"],
  [".glide-kpis > span:nth-child(3) b","move-up-right","inline"],
  [".glide-kpis > span:nth-child(4) b","clock-3","inline"],
  [".oxygen-controls > label:nth-child(1) > span","gauge","inline"],
  [".oxygen-controls > label:nth-child(2) > span","cylinder","inline"],
  [".oxygen-controls > label:nth-child(3) > span","hash","inline"],
  ["#applyOxygenRecommendation","check","button"],
  [".oxygen-stats > span:nth-child(1) b","activity","inline"],
  [".oxygen-stats > span:nth-child(2) b","cylinder","inline"],
  [".oxygen-stats > span:nth-child(3) b","clock-3","inline"],
  [".oxygen-stats > span:nth-child(4) b","scale","inline"],
  [".ride-summary","waves","heading"],
  [".step-comparison-heading h2","trending-up","heading"],
  ["#manualUpdateForm .flight-context-row > label:nth-child(1) > span:first-child","map-pin","inline"],
  ["#manualUpdateForm .flight-context-row > label:nth-child(2) > span:first-child","navigation","inline"],
  ["#manualUpdateForm .flight-context-row > label:nth-child(3) > span:first-child","fuel","inline"],
  ["#manualUpdateForm .primary-button","refresh-cw","button"],
  ["#manualUpdateForm .flight-observation-row > label:nth-child(1) > span:first-child","gauge","inline"],
  ["#manualUpdateForm .flight-observation-row > label:nth-child(2) > span:first-child","fuel","inline"],
  ["#resetCalibration","rotate-ccw","button"],
];

function ensureUiIcon(element,name,mode="inline") {
  if(!element) return;
  const current=element.querySelector(":scope > .ui-icon");
  if(current?.dataset.uiIcon===name) return;
  current?.remove();
  const icon=document.createElement("i");
  icon.className="ui-icon";
  icon.dataset.lucide=name;
  icon.dataset.uiIcon=name;
  icon.setAttribute("aria-hidden","true");
  element.prepend(icon);
  element.classList.add(`ui-icon-${mode}`);
}

function refreshUiIcons() {
  UI_ICON_RULES.forEach(([selector,name,mode])=>document.querySelectorAll(selector).forEach((element)=>ensureUiIcon(element,name,mode)));
  $$(".status-pill, #feasibilityBadge, #missionScoreStatus").forEach((element)=>{
    element.querySelector(":scope > .status-ui-icon")?.remove();
    const status=element.dataset.status||[...element.classList].find((item)=>["viable","marginal","unavailable","unknown","oxygen-compliant","oxygen-not-required","oxygen-marginal","oxygen-insufficient"].includes(item));
    const name=["viable","oxygen-compliant","oxygen-not-required"].includes(status)?"circle-check":["marginal","oxygen-marginal"].includes(status)?"triangle-alert":"circle-x";
    const icon=document.createElement("i");
    icon.className="ui-icon status-ui-icon";
    icon.dataset.lucide=name;
    icon.setAttribute("aria-hidden","true");
    element.prepend(icon);
  });
  if(window.lucide?.createIcons) window.lucide.createIcons({attrs:{"stroke-width":1.7}});
}

const COPY = {
  "pt-BR": {
    pilotId:"Pilot ID / Alias", importLatest:"Importar OFP",
    bestLevel:"Melhor nível", fuelRequired:"Combustível requerido", estimatedTime:"Tempo estimado", maximumRange:"Alcance máximo", performance:"Performance", route:"Rota", profile:"Perfil", altitudeComparison:"Comparação por altitude", selectedLevel:"Selecionado", recommendedLevel:"Recomendado", windComponent:"Componente", alternate:"Alternativa", flightProfile:"Perfil de voo",
    payload:"Carga útil", fuelOnboard:"Combustível a bordo", reserve:"Reserva", takeoffWeight:"Peso de decolagem", fuel:"Combustível", allLevels:"Todos os níveis", fontSize:"Tamanho da fonte", fontSmall:"Fonte menor", fontNormal:"Fonte padrão", fontLarge:"Fonte maior", selectLevel:"Selecionar nível", levelReason:"Motivo", levelSelection:"Seleção", climb:"SUBIDA", cruise:"CRUZEIRO", descent:"DESCIDA", power:"Potência", automatic:"Automático", viable:"VIÁVEL", marginalStatus:"MARGINAL", notViable:"INVIÁVEL", profileLimit:"PERFIL", ceilingLimit:"TETO", disclaimer:"Alan Fernandes - 2026",
    simbrief:"SIMBRIEF", fuelHint:"Menor valor", timeHint:"Menor valor", efficiencyHint:"Maior valor", margin:"de margem", belowMax:"abaixo do máximo", aboveMax:"acima do máximo", missingId:"Informe o Pilot ID ou Alias.", importError:"Não foi possível importar o OFP.",
    fuelRank:(rank)=>`${rank}º em consumo`, timeRank:(rank,gs)=>`${rank}º em tempo · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingência", taxi:"Taxi", rankingOthers:(count)=>`Outros níveis (${count})`, rankingShow:"Mostrar todos", rankingHide:"Ocultar", rankingNoAvailable:"Nenhum nível operacionalmente disponível.", rankingNote:"Ranking dos níveis disponíveis; a recomendação considera a missão completa.",
    manualUpdate:"Atualização manual", continueLabel:"Continuar", returnLabel:"Retornar", position:"Posição", fuelRemaining:"Combustível restante", update:"Atualizar", calibration:"Calibração", observedTas:"TAS observada", observedFuelFlow:"Fuel flow observado", calibrate:"Calibrar", reset:"Redefinir", beyondDestination:"Além do destino", noStep:"Sem step climb", nextStep:"Próximo", updated:"MANUAL", preflight:"PRÉ-VOO",
    destinationAlternate:"Destino → alternado", diversionFrom:"Desvio a partir de", fuelAtDestination:"Combustível no destino", alternateFuel:"Combustível até alternado", alternateLanding:"Pouso no alternado", currentScenario:"ATUAL", comparisonScenario:"COMPARAÇÃO", scenarioMetric:"MÉTRICA", scenarioModeB:"MODE B", scenarioPayloadB:"Carga útil B", scenarioFuelB:"Combustível B", scenarioMargin:"Margem", applyScenario:"Aplicar B", recommendedFuel:"Combustível recomendado", presetLevel:"Preset / nível", recommendedPayload:"Payload recomendado", optimizedWeight:"Peso otimizado", applyOptimization:"Aplicar otimização", optimizeMission:"Otimizar missão", optimizationFailed:"Nenhuma configuração viável", alternateOptimizationFailed:"Alternado: faltam {fuel} para a margem viável", glideRatio:"Razão de planeio", bestGlide:"Melhor planeio", glideRange:"Alcance sem vento", glideTime:"Tempo estimado", glideAlongRoute:"Alcance ao longo da rota", glideInFocus:"em foco", glidePoint:"Ponto da rota", glideForward:"Rumo da rota →", glideReverse:"Sentido oposto ←", glidePointAltitude:"Altitude no ponto", glideCaveat:"Alcance teórico com vento estimado; não considera terreno, obstáculos ou local de pouso.", reducePayload:"reduzir payload", noAdjustment:"sem ajuste", noAlternateData:"SEM COORDENADAS", icingLow:"GELO BAIXO", icingWatch:"GELO POSSÍVEL", icingCaution:"CAUTELA GELO", icingAvoid:"EVITAR GELO", icingLimited:"DADOS LIMITADOS", icingWeather:"EVIDÊNCIA OFP", weatherEstimated:"ESTIMADO", simbriefShear:"SHEAR SIMBRIEF", icingNoProfile:"SEM PERFIL ACEITÁVEL", icingNoCost:"SEM CUSTO METEO", tempWindow:"JANELA TÉRMICA", iceProbability:"ICE", iceProbabilityAria:"Índice estimado de gelo, não é probabilidade",
    missionRisk:"Risco da missão", missionScore:"Score da missão", mainAdjustment:"Ajuste principal", confidence:"Confiança", rideComfort:"Conforto", oxygen:"Oxigênio", cabinAltitude:"Altitude cabine", bottle:"Garrafa", quantity:"Quantidade", applyOxygen:"Aplicar recomendação", oxygenNoSolution:"Nenhuma configuração de garrafas disponível atende à margem de O₂.", pilot:"Piloto", copilot:"Copiloto", rearLeft:"Traseiro E", rearCenter:"Traseiro C", rearRight:"Traseiro D", baggage:"Bagagem", oxygenRequired:"Requerido", oxygenInstalled:"Disponível", oxygenEndurance:"Autonomia", oxygenWeight:"Peso O₂", modelConfidence:"Confiança do modelo", actualTime:"Tempo real", actualFuel:"Combustível usado", saveDebrief:"Salvar debrief", flights:"voos", low:"BAIXO", moderate:"MODERADO", high:"ALTO", critical:"CRÍTICO", smooth:"SUAVE", light:"LEVE", severe:"SEVERA", oxygenNotRequired:"NÃO REQUERIDO", oxygenCompliant:"ADEQUADO", oxygenMarginal:"MARGINAL", oxygenInsufficient:"INSUFICIENTE", maskRequired:"MÁSCARA", cannula:"CÂNULA", expected:"ESPERADO", accuracy:"PRECISÃO", noDebriefs:"SEM DEBRIEFS", weatherLimited:"DADOS LIMITADOS", weightBalance:"Peso e CG", cgEnvelope:"Envelope de CG", weight:"Peso", zeroFuel:"Sem combustível", takeoff:"Decolagem", landing:"Pouso", grossWeight:"Peso total", cgTravel:"Variação do CG", station:"Estação", arm:"Braço", moment:"Momento", emptyAircraft:"Aeronave vazia", headerFuel:"Header fuel", mainFuel:"Combustível principal", cgForward:"Limite dianteiro", cgAft:"Limite traseiro",
    stepDecisionTitle:"Vale a pena subir?", stepRemainingCruise:"TRECHO RESTANTE EM ROTA", stepConstant:"Nível constante", stepSuggested:"PERFIL SUGERIDO", stepAlternative:"ALTERNATIVA", stepEfficient:"Menor consumo estimado", stepNoProposal:"SEM PROPOSTA", stepNoSuggestion:"Nenhuma subida sugerida", stepNoProposed:"Sem subida", stepCountLabel:(count)=>`${count} ${count===1?"subida":"subidas"}`, stepFuelUsed:"Combustível", stepTravelTime:"Tempo", stepClimbsCount:"Subidas", stepTradeoff:"Troca proposta", stepMaintain:"Manter", stepNoWaypoint:"Sem waypoint elegível entre a posição atual e o destino.", stepNoNetGain:"Subir não reduz o consumo total estimado nesta rota.", stepNoBenefit:"Nenhuma etapa atende ao ganho mínimo estimado.", stepLevelUnavailable:"Níveis superiores indisponíveis nas condições atuais.", stepCaveat:"Estimativa para o trecho restante em rota; exclui subida inicial, descida e reserva. Confirme meteorologia, oxigênio e limites de cada nível.",
  },
  "en-US": {
    pilotId:"Pilot ID / Alias", importLatest:"Import OFP",
    bestLevel:"Best level", fuelRequired:"Fuel required", estimatedTime:"Estimated time", maximumRange:"Maximum range", performance:"Performance", route:"Route", profile:"Profile", altitudeComparison:"Altitude comparison", selectedLevel:"Selected", recommendedLevel:"Recommended", windComponent:"Component", alternate:"Alternate", flightProfile:"Flight profile",
    payload:"Payload", fuelOnboard:"Fuel onboard", reserve:"Reserve", takeoffWeight:"Takeoff weight", fuel:"Fuel", allLevels:"All levels", fontSize:"Font size", fontSmall:"Smaller font", fontNormal:"Default font", fontLarge:"Larger font", selectLevel:"Select level", levelReason:"Reason", levelSelection:"Selection", climb:"CLIMB", cruise:"CRUISE", descent:"DESCENT", power:"Power", automatic:"Automatic", viable:"VIABLE", marginalStatus:"MARGINAL", notViable:"NOT VIABLE", profileLimit:"PROFILE", ceilingLimit:"CEILING", disclaimer:"Alan Fernandes - 2026",
    simbrief:"SIMBRIEF", fuelHint:"Lower is better", timeHint:"Lower is better", efficiencyHint:"Higher is better", margin:"margin", belowMax:"below maximum", aboveMax:"above maximum", missingId:"Enter a Pilot ID or Alias.", importError:"Could not import the OFP.",
    fuelRank:(rank)=>`#${rank} fuel`, timeRank:(rank,gs)=>`#${rank} time · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingency", taxi:"Taxi", rankingOthers:(count)=>`Other levels (${count})`, rankingShow:"Show all", rankingHide:"Hide", rankingNoAvailable:"No operationally available level.", rankingNote:"Ranking of available levels; the recommendation considers the full mission.",
    manualUpdate:"Manual update", continueLabel:"Continue", returnLabel:"Return", position:"Position", fuelRemaining:"Fuel remaining", update:"Update", calibration:"Calibration", observedTas:"Observed TAS", observedFuelFlow:"Observed fuel flow", calibrate:"Calibrate", reset:"Reset", beyondDestination:"Beyond destination", noStep:"No step climb", nextStep:"Next", updated:"MANUAL", preflight:"PREFLIGHT",
    destinationAlternate:"Destination → alternate", diversionFrom:"Diversion from", fuelAtDestination:"Fuel at destination", alternateFuel:"Fuel to alternate", alternateLanding:"Alternate landing", currentScenario:"CURRENT", comparisonScenario:"COMPARISON", scenarioMetric:"METRIC", scenarioModeB:"MODE B", scenarioPayloadB:"Payload B", scenarioFuelB:"Fuel onboard B", scenarioMargin:"Margin", applyScenario:"Apply B", recommendedFuel:"Recommended fuel", presetLevel:"Preset / level", recommendedPayload:"Recommended payload", optimizedWeight:"Optimized weight", applyOptimization:"Apply optimization", optimizeMission:"Optimize mission", optimizationFailed:"No viable configuration", alternateOptimizationFailed:"Alternate: {fuel} short of the viable margin", glideRatio:"Glide ratio", bestGlide:"Best glide", glideRange:"Still-air range", glideTime:"Estimated time", glideAlongRoute:"Glide range along the route", glideInFocus:"in focus", glidePoint:"Route point", glideForward:"Along route →", glideReverse:"Opposite direction ←", glidePointAltitude:"Altitude at point", glideCaveat:"Theoretical range with estimated wind; terrain, obstacles, and landing sites are not considered.", reducePayload:"reduce payload", noAdjustment:"no adjustment", noAlternateData:"NO COORDINATES", icingLow:"LOW ICE", icingWatch:"POSSIBLE ICE", icingCaution:"ICE CAUTION", icingAvoid:"AVOID ICE", icingLimited:"LIMITED DATA", icingWeather:"OFP EVIDENCE", weatherEstimated:"ESTIMATED", simbriefShear:"SIMBRIEF SHEAR", icingNoProfile:"NO ACCEPTABLE PROFILE", icingNoCost:"NO WEATHER COST", tempWindow:"TEMP WINDOW", iceProbability:"ICE", iceProbabilityAria:"Estimated icing index, not a probability",
    missionRisk:"Mission risk", missionScore:"Mission score", mainAdjustment:"Main adjustment", confidence:"Confidence", rideComfort:"Ride", oxygen:"Oxygen", cabinAltitude:"Cabin altitude", bottle:"Bottle", quantity:"Quantity", applyOxygen:"Apply recommendation", oxygenNoSolution:"No available bottle setup meets the O₂ margin.", pilot:"Pilot", copilot:"Copilot", rearLeft:"Rear left", rearCenter:"Rear center", rearRight:"Rear right", baggage:"Baggage", oxygenRequired:"Required", oxygenInstalled:"Available", oxygenEndurance:"Endurance", oxygenWeight:"O₂ weight", modelConfidence:"Model confidence", actualTime:"Actual time", actualFuel:"Fuel used", saveDebrief:"Save debrief", flights:"flights", low:"LOW", moderate:"MODERATE", high:"HIGH", critical:"CRITICAL", smooth:"SMOOTH", light:"LIGHT", severe:"SEVERE", oxygenNotRequired:"NOT REQUIRED", oxygenCompliant:"COMPLIANT", oxygenMarginal:"MARGINAL", oxygenInsufficient:"INSUFFICIENT", maskRequired:"MASK", cannula:"CANNULA", expected:"EXPECTED", accuracy:"ACCURACY", noDebriefs:"NO DEBRIEFS", weatherLimited:"LIMITED DATA", weightBalance:"Weight & CG", cgEnvelope:"CG envelope", weight:"Weight", zeroFuel:"Zero fuel", takeoff:"Takeoff", landing:"Landing", grossWeight:"Gross weight", cgTravel:"CG travel", station:"Station", arm:"Arm", moment:"Moment", emptyAircraft:"Empty aircraft", headerFuel:"Header fuel", mainFuel:"Main fuel", cgForward:"Forward limit", cgAft:"Aft limit",
    stepDecisionTitle:"Is it worth climbing?", stepRemainingCruise:"REMAINING ENROUTE SEGMENT", stepConstant:"Constant level", stepSuggested:"SUGGESTED PROFILE", stepAlternative:"ALTERNATIVE", stepEfficient:"Lower estimated fuel", stepNoProposal:"NO PROPOSAL", stepNoSuggestion:"No step climb suggested", stepNoProposed:"No step climb", stepCountLabel:(count)=>`${count} ${count===1?"climb":"climbs"}`, stepFuelUsed:"Fuel", stepTravelTime:"Time", stepClimbsCount:"Climbs", stepTradeoff:"Proposed tradeoff", stepMaintain:"Maintain", stepNoWaypoint:"No eligible waypoint between the current position and destination.", stepNoNetGain:"Climbing does not reduce estimated total fuel on this route.", stepNoBenefit:"No step meets the minimum estimated fuel saving.", stepLevelUnavailable:"Higher levels are unavailable under current conditions.", stepCaveat:"Estimate for the remaining enroute segment; initial climb, descent and reserve are excluded. Confirm weather, oxygen and each level's limits.",
  },
};

Object.assign(COPY["pt-BR"], {
  optimizationCgAft: "CG traseiro fora do envelope com a carga atual. Reduzir a carga não basta; revise a distribuição em W&B.",
  optimizationCgForward: "CG dianteiro fora do envelope com a carga atual. Revise a distribuição em W&B.",
  optimizationWeight: "O peso continua acima do limite nas configurações permitidas.",
  optimizationFuelCapacity: "A missão exige mais combustível do que a capacidade utilizável.",
  optimizationAlternate: "A margem de combustível até o alternado não é suficiente.",
  optimizationWeather: "Os níveis disponíveis apresentam risco meteorológico bloqueante.",
  optimizationOxygen: "O oxigênio disponível não atende à missão.",
  optimizationTerrain: "Falta MORA em trechos da rota ou os níveis estão abaixo do mínimo. Informe os mínimos verificados ou escolha outro plano.",
  optimizationCombined: "Não há configuração viável com as condições e a carga atuais. Revise W&B, combustível e rota.",
  payloadAssignment: "Acréscimos vão para bagagem; ajuste ocupantes em W&B.",
  restoreViableMission: "Usar última carga viável",
  restoreViableWarning: "A carga anterior será reotimizada e substituirá ajustes de carga, combustível, preset e oxigênio. Confira os ocupantes e o W&B.",
  restoredViableMission: "Carga anterior reotimizada. Confira os ocupantes e o W&B.",
  randomizeWeightBalance: "Sortear passageiros e bagagem",
  randomizeWeightBalanceHint: "Mantém piloto e combustível; sorteia os demais ocupantes e a bagagem dentro dos limites de peso e CG.",
  randomizeWeightBalanceApplied: "Carga sorteada com peso e CG viáveis. Os demais indicadores foram recalculados.",
  randomizeWeightBalanceFailed: "Não foi encontrada uma carga segura com o piloto, combustível e oxigênio atuais. Revise esses valores.",
});
Object.assign(COPY["en-US"], {
  optimizationCgAft: "Aft CG is outside the envelope with the current load. Reducing weight is not enough; review the W&B distribution.",
  optimizationCgForward: "Forward CG is outside the envelope with the current load. Review the W&B distribution.",
  optimizationWeight: "Weight remains above the limit across the permitted configurations.",
  optimizationFuelCapacity: "The mission requires more fuel than the usable capacity.",
  optimizationAlternate: "Fuel margin to the alternate is insufficient.",
  optimizationWeather: "Available levels have blocking weather risk.",
  optimizationOxygen: "Available oxygen does not cover the mission.",
  optimizationTerrain: "Route legs lack MORA or levels are below the minimum. Enter verified minima or choose another plan.",
  optimizationCombined: "No viable configuration exists with the current conditions and load. Review W&B, fuel, and route.",
  payloadAssignment: "Added payload goes to baggage; adjust occupants in W&B.",
  restoreViableMission: "Use last viable load",
  restoreViableWarning: "The previous load will be reoptimized, replacing load, fuel, preset, and oxygen changes. Verify occupants and W&B.",
  restoredViableMission: "Previous load reoptimized. Verify occupants and W&B.",
  randomizeWeightBalance: "Randomize passengers and baggage",
  randomizeWeightBalanceHint: "Keeps the pilot and fuel; randomizes other occupants and baggage within weight and CG limits.",
  randomizeWeightBalanceApplied: "Random load has viable weight and CG. Other indicators have been recalculated.",
  randomizeWeightBalanceFailed: "No safe load was found with the current pilot, fuel, and oxygen. Review those values.",
});
Object.assign(COPY["pt-BR"], { bestLevel:"FL recomendado", cabinAltitude:"Nível de voo" });
Object.assign(COPY["en-US"], { bestLevel:"Recommended FL", cabinAltitude:"Flight level" });
Object.assign(COPY["pt-BR"], { cruiseIcing:"Índice de gelo" });
Object.assign(COPY["en-US"], { cruiseIcing:"Icing index" });
Object.assign(COPY["pt-BR"], { manualInFlight:"Em voo", manualFinished:"Voo concluído", saveDebrief:"Registrar voo", noDebriefs:"SEM VOOS REGISTRADOS", debriefResultTitle:"Resultado do voo", debriefHistory:"Histórico de calibração", debriefPhases:"Fases", phaseTime:"Tempo", phaseFuel:"Combustível", debriefSaved:"Voo registrado", debriefPhasePair:"Preencha tempo e combustível da fase.", debriefPhaseTotals:"Os valores das fases excedem o total do voo.", debriefNoLevel:"Selecione um nível antes de registrar o voo.", glideCaveat:"Alcance teórico · terreno e obstáculos não avaliados" });
Object.assign(COPY["en-US"], { manualInFlight:"In flight", manualFinished:"Flight complete", saveDebrief:"Record flight", noDebriefs:"NO FLIGHTS RECORDED", debriefResultTitle:"Flight result", debriefHistory:"Calibration history", debriefPhases:"Phases", phaseTime:"Time", phaseFuel:"Fuel", debriefSaved:"Flight recorded", debriefPhasePair:"Enter both time and fuel for this phase.", debriefPhaseTotals:"Phase values exceed flight totals.", debriefNoLevel:"Select a level before saving the flight.", glideCaveat:"Theoretical range · terrain and obstacles not assessed" });
Object.assign(COPY["pt-BR"], { calibrationNeedsUpdate:"Atualize posição, FL e combustível antes de calibrar.", calibrationReady:"Posição, FL e combustível confirmados." });
Object.assign(COPY["en-US"], { calibrationNeedsUpdate:"Update position, FL and fuel before calibrating.", calibrationReady:"Position, FL and fuel confirmed." });
Object.assign(COPY["pt-BR"], { remainingFuelTitle:"Combustível · trecho restante", remainingFuelViable:"SUFICIENTE", remainingFuelMarginal:"MARGEM BAIXA", remainingFuelUnavailable:"INSUFICIENTE", remainingUnknown:"NÃO AVALIADO", remainingDistance:(distance,fl)=>`${distance} NM · FL${fl}`, remainingRequired:(fuel)=>`Necessário ${fuel}`, remainingMargin:(fuel)=>`Margem ${fuel}` });
Object.assign(COPY["en-US"], { remainingFuelTitle:"Fuel · remaining route", remainingFuelViable:"SUFFICIENT", remainingFuelMarginal:"LOW MARGIN", remainingFuelUnavailable:"INSUFFICIENT", remainingUnknown:"UNASSESSED", remainingDistance:(distance,fl)=>`${distance} NM · FL${fl}`, remainingRequired:(fuel)=>`Required ${fuel}`, remainingMargin:(fuel)=>`Margin ${fuel}` });
Object.assign(COPY["pt-BR"], { flightTools:"Ferramentas de voo", chooseTool:"Escolha um módulo", closeTool:"Fechar", toolHintEtp:"Pontos de decisão", toolHintAlternate:"Alternados", toolHintCompare:"Comparar cenários", toolHintLoad:"Carga e combustível", toolHintWb:"Peso e centro de gravidade", toolHintGlide:"Alcance planado", toolHintOxygen:"Oxigênio", toolHintConfidence:"Confiança do modelo", toolHintRide:"Conforto de voo", toolHintIce:"Gelo por trecho", toolHintSteps:"Subida em etapas", toolHintUpdate:"Em voo · Voo concluído", thermalWindow:"Janela térmica", routeBand:"Faixa da rota", iceExposure:"Exposição", flightPhases:"Fases do voo", ofpEvidence:"Evidências do OFP", weatherEvidence:"Cobertura meteorológica", indexReading:"Leitura do índice" });
Object.assign(COPY["en-US"], { flightTools:"Flight tools", chooseTool:"Choose a module", closeTool:"Close", toolHintEtp:"Decision points", toolHintAlternate:"Alternates", toolHintCompare:"Compare scenarios", toolHintLoad:"Load and fuel", toolHintWb:"Weight and balance", toolHintGlide:"Glide range", toolHintOxygen:"Oxygen", toolHintConfidence:"Model confidence", toolHintRide:"Ride comfort", toolHintIce:"Icing by leg", toolHintSteps:"Step climb", toolHintUpdate:"In flight · Flight complete", thermalWindow:"Thermal window", routeBand:"Route band", iceExposure:"Exposure", flightPhases:"Flight phases", ofpEvidence:"OFP evidence", weatherEvidence:"Weather coverage", indexReading:"Index reading" });
Object.assign(COPY["pt-BR"], { manualFlightStatusTitle:"ATUALIZAÇÃO EM VOO", manualNoUpdate:"Sem atualização registrada", manualUpdateRecorded:"Atualização registrada" });
Object.assign(COPY["en-US"], { manualFlightStatusTitle:"IN-FLIGHT UPDATE", manualNoUpdate:"No update recorded", manualUpdateRecorded:"Update recorded" });
Object.assign(COPY["pt-BR"], { toolHintCost:"Custo e eficiência", fuelPrice:"Preço do combustível", currency:"Moeda", pricePerLiter:"Valor por litro", costUnassessed:"Informe o valor por litro para avaliar o custo.", estimatedFlightCost:"Custo estimado do voo", financialEfficiency:"Eficiência financeira", costPerNm:"Por NM", costPerHour:"Por hora", costPerPerson:"Por pessoa", requiredFuelValue:"Abastecimento requerido", costBreakdown:"Custo por fase", modeComparison:"Comparação de modos", possibleSavings:"Economia possível", costInFlight:"Projeção após atualização manual" });
Object.assign(COPY["en-US"], { toolHintCost:"Cost and efficiency", fuelPrice:"Fuel price", currency:"Currency", pricePerLiter:"Price per liter", costUnassessed:"Enter the price per liter to assess flight cost.", estimatedFlightCost:"Estimated flight cost", financialEfficiency:"Financial efficiency", costPerNm:"Per NM", costPerHour:"Per hour", costPerPerson:"Per person", requiredFuelValue:"Required fuel value", costBreakdown:"Cost by phase", modeComparison:"Mode comparison", possibleSavings:"Possible savings", costInFlight:"Projection after manual update" });
Object.assign(COPY["pt-BR"], { alternateCost:"Custo do alternado", plannedFlightCost:"Voo planejado", diversionIncrement:"Acréscimo se desviar", diversionTotal:"Total com alternado", missedApproach:"Arremetida", alternateLeg:"Trecho ao alternado", alternateApproach:"Aproximação" });
Object.assign(COPY["en-US"], { alternateCost:"Alternate cost", plannedFlightCost:"Planned flight", diversionIncrement:"Diversion increment", diversionTotal:"Total with alternate", missedApproach:"Missed approach", alternateLeg:"Leg to alternate", alternateApproach:"Approach" });
Object.assign(COPY["pt-BR"], { preferredProfile:"Perfil preferido", topThreeLevels:"TOP 3 · NÍVEIS DE VOO", automaticRecommendation:"Recomendação automática", pilotAlternative:"Alternativa em análise", cancel:"Cancelar", applyConfiguration:"Aplicar configuração", recalculateRanking:"Recalcular ranking", updateFlight:"Atualizar voo", updateAndCalibrate:"Atualizar e calibrar", technicalDetails:"Detalhes técnicos", noConfirmedRecommendation:"SEM RECOMENDAÇÃO CONFIRMADA", marginalAlternatives:"ALTERNATIVAS MARGINAIS", calibrationActive:"ATIVA", calibrationStored:"FORA DO REGIME", calibrationPending:"PENDENTE DE VALIDAÇÃO", noCalibration:"SEM CALIBRAÇÃO", missingTas:"Informe a TAS observada.", missingFlow:"Informe o Fuel Flow observado.", compareTitle:"Recomendação / análise", appliedConfiguration:"Configuração aplicada", manualPower:"MANUAL · MAP/RPM", invalidManualPower:"MAP/RPM fora dos limites.", rankingStale:"Parâmetros alterados · recalcule o ranking", confirmMarginal:"Confirmar aplicação marginal" });
Object.assign(COPY["en-US"], { preferredProfile:"Preferred profile", topThreeLevels:"TOP 3 · FLIGHT LEVELS", automaticRecommendation:"Automatic recommendation", pilotAlternative:"Alternative under review", cancel:"Cancel", applyConfiguration:"Apply configuration", recalculateRanking:"Recalculate ranking", updateFlight:"Update flight", updateAndCalibrate:"Update and calibrate", technicalDetails:"Technical details", noConfirmedRecommendation:"NO CONFIRMED RECOMMENDATION", marginalAlternatives:"MARGINAL ALTERNATIVES", calibrationActive:"ACTIVE", calibrationStored:"OUTSIDE REGIME", calibrationPending:"PENDING VALIDATION", noCalibration:"NO CALIBRATION", missingTas:"Enter observed TAS.", missingFlow:"Enter observed fuel flow.", compareTitle:"Recommendation / analysis", appliedConfiguration:"Applied configuration", manualPower:"MANUAL · MAP/RPM", invalidManualPower:"MAP/RPM outside limits.", rankingStale:"Inputs changed · recalculate ranking", confirmMarginal:"Confirm marginal application" });

function storedJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

const state = {
  plan:null, mode:"NORMAL", payloadLb:520, fuelOnboardGal:77, reserveMinutes:45, weatherSnapshot:null,
  selectedAltitudeFt:null, language:localStorage.getItem("velocityxl.language") || "pt-BR",
  fontSize:["small","normal","large"].includes(localStorage.getItem("velocityxl.fontSize"))?localStorage.getItem("velocityxl.fontSize"):"normal",
  weightUnit:localStorage.getItem("velocityxl.weightUnit") || "lb", fuelUnit:localStorage.getItem("velocityxl.fuelUnit") || "gal",
  calibration:migrateCalibration(storedJson("velocityxl.calibration", {})),
  powerSetting:storedJson("velocityxl.powerSetting", { type:"AUTO", mapInHg:24, rpm:2450 }),
  oxygen:storedJson("velocityxl.oxygen", { bottleModel:"SK-12-24", bottles:0, seats:[true,true,true,true,true] }),
  weightBalance:storedJson("velocityxl.weightBalance", { pilot:190, copilot:170, rearLeft:55, rearCenter:50, rearRight:55, baggage:0 }),
  financial:storedJson("velocityxl.financial", { currency:"BRL", prices:{} }),
  ridePreference:["standard","comfort","maximum"].includes(localStorage.getItem("velocityxl.ridePreference"))?localStorage.getItem("velocityxl.ridePreference"):"standard",
  preflightSnapshot:null,
  manual:{ active:false, waypointIndex:0, distanceNm:0, fuelRemainingGal:77, altitudeFt:null },
  diversionWaypointIndex:0,
  glideSampleIndex:null,
  appliedChoice:null,
};
let lastRenderedMissionScore=null;
let lastRenderedFinancial=null;
let latestOptimizedMission=null;
let latestActiveCandidate=null;
let renderOptimizationCache=null;
let decisionSnapshot=null;
let analysisChoice=null;
let analysisCandidate=null;
let decisionStale=false;
let marginalApplyArmed=false;
let optimizationBusy=false;
let decisionRevision=0;
let weatherRequest=null;
let trackerSession=null;
let trackerPanelMode=null;
let trackerPendingPhase=null;
let trackerProjectionUpdatedAt=0;
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
const financialPriceKey=(plan=state.plan,currency=state.financial.currency)=>`${plan?.origin?.icao||"----"}:${currency}`;
const fuelPricePerLiter=()=>Number(state.financial.prices?.[financialPriceKey()])||0;
const currencySymbol=()=>state.financial.currency==="USD"?"US$":"R$";
const formatMoney=(value,digits=2)=>Number(value).toLocaleString(state.language,{style:"currency",currency:state.financial.currency,minimumFractionDigits:digits,maximumFractionDigits:digits});
const currentOxygenWeightLb=()=>oxygenSystemWeightLb(state.oxygen);
const operationallyAvailable=(result)=>result.feasibility.status!=="unavailable"&&result.icing.status!=="avoid"&&!result.turbulence.blocking&&result.oxygen.status!=="insufficient"&&result.weightBalance?.status!=="unavailable";

state.weightBalance=normalizeWeightBalance(state.weightBalance);
state.payloadLb=weightBalancePayloadLb(state.weightBalance);
state.oxygen.seats=[state.weightBalance.pilot,state.weightBalance.copilot,state.weightBalance.rearLeft,state.weightBalance.rearCenter,state.weightBalance.rearRight].map((value,index)=>index===0||value>0);
state.oxygen.bottleModel=OXYGEN_CYLINDERS[state.oxygen.bottleModel]?state.oxygen.bottleModel:"SK-12-24";
state.oxygen.bottles=clamp(Math.round(Number(state.oxygen.bottles)||0),0,4);
state.financial={currency:["BRL","USD"].includes(state.financial?.currency)?state.financial.currency:"BRL",prices:state.financial?.prices&&typeof state.financial.prices==="object"?state.financial.prices:{}};
const legacyCalibration=storedJson("velocityxl.calibration",null);
if(legacyCalibration && ["ECON","NORMAL","FAST"].some((mode)=>legacyCalibration[mode]) && !localStorage.getItem("velocityxl.calibration.legacy")){
  localStorage.setItem("velocityxl.calibration.legacy",JSON.stringify(legacyCalibration));
}

function buildFinancialAnalysis(plan,selected,alternateAdvice,mission) {
  const pricePerLiter=fuelPricePerLiter();
  const consumedGal=PERFORMANCE.taxiFuelGal+selected.tripFuelGal;
  const impact=mission.financial;
  const cost=impact.cost;
  const minimumViableCost=impact.minimumViableCost;
  const occupants=Math.max(1,["pilot","copilot","rearLeft","rearCenter","rearRight"].filter((key)=>Number(state.weightBalance[key])>0).length);
  const phaseFuel={taxi:PERFORMANCE.taxiFuelGal,climb:selected.climb.fuelGal,cruise:selected.cruiseFuelGal,descent:selected.descent.fuelGal};
  const phaseCosts=Object.fromEntries(Object.entries(phaseFuel).map(([key,value])=>[key,pricePerLiter>0?value*PERFORMANCE.financial.litersPerGal*pricePerLiter:null]));
  const alternateDestination=alternateAdvice?.destination;
  const alternateFuelGal=Number(alternateDestination?.fuelGal);
  const missedFuelGal=PERFORMANCE.diversion.missedApproachFuelGal;
  const approachFuelGal=PERFORMANCE.diversion.approachFuelGal;
  const legFuelGal=Math.max(0,alternateFuelGal-missedFuelGal-approachFuelGal);
  const alternate=Number.isFinite(alternateFuelGal)&&alternateFuelGal>0&&pricePerLiter>0?{
    ident:alternateAdvice.alternate?.icao||alternateAdvice.alternate?.ident||"—",
    distanceNm:alternateDestination.distanceNm,
    fuelGal:alternateFuelGal,
    cost:alternateFuelGal*PERFORMANCE.financial.litersPerGal*pricePerLiter,
    missedCost:missedFuelGal*PERFORMANCE.financial.litersPerGal*pricePerLiter,
    legCost:legFuelGal*PERFORMANCE.financial.litersPerGal*pricePerLiter,
    approachCost:approachFuelGal*PERFORMANCE.financial.litersPerGal*pricePerLiter,
  }:null;
  return {
    ...impact,pricePerLiter,currency:state.financial.currency,cost,consumedGal,minimumViableCost,
    savings:Number.isFinite(cost)&&Number.isFinite(minimumViableCost)?Math.max(0,cost-minimumViableCost):null,
    costPerNm:Number.isFinite(cost)?cost/Math.max(1,plan.distanceNm):null,
    costPerHour:Number.isFinite(cost)?cost/Math.max(.01,selected.tripTimeHr):null,
    costPerPerson:Number.isFinite(cost)?cost/occupants:null,
    requiredFuelValue:pricePerLiter>0?selected.fuelRequiredGal*PERFORMANCE.financial.litersPerGal*pricePerLiter:null,
    phaseCosts,alternate,fl:selected.fl,mode:state.appliedChoice?.mode||latestActiveCandidate?.mode||state.mode,
  };
}

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

function missionPlanKey(plan) {
  return [plan.source,plan.ofpId,plan.generatedAt,plan.generatedAtMs,plan.scheduledOffMs,plan.scheduledOnMs,plan.origin?.icao,plan.destination?.icao,plan.alternate,plan.route,plan.distanceNm].join("|");
}
function legacyMissionPlanKey(plan) {
  return [plan.source,plan.generatedAt,plan.origin?.icao,plan.destination?.icao,plan.route,plan.distanceNm].join("|");
}

const trackerWords={
  "pt-BR":{notStarted:"NÃO INICIADO",running:"EM ANDAMENTO",paused:"PAUSADO",finished:"ENCERRADO",estimated:"ESTIMADO",confirmed:"CONFIRMADO PELO PILOTO",phase:"Fase",clock:"Tempo de simulação",fl:"FL estimado",fuel:"Combustível estimado",ete:"ETE restante",start:"Iniciar voo",pause:"Pausar",resume:"Retomar",sync:"Sincronizar",projection:"Projeção restante",finish:"Encerrar",time:"Tempo",projected:"PROJETADO · SEM TELEMETRIA",recovered:"Sessão reconstruída. Confirme posição ou tempo; o estado do Xbox não é detectado.",applied:"Aplique uma configuração da missão antes de iniciar.",invalid:"Perfil desta configuração não pode ser projetado.",fix:"Fixo",observedFl:"FL observado · opcional",observedFuel:"Combustível observado · opcional",elapsed:"Tempo simulado · min",toc:"Confirmar TOC",tod:"Confirmar TOD",climb:"Subida",confirmFix:"Confirmar fixo",cancel:"Cancelar",close:"Fechar",remaining:"PROJEÇÃO RESTANTE",distance:"Distância",destinationFuel:"No destino",alternateFuel:"No alternado",reserve:"Reserva",margin:"Margem",alternate:"Alternado",next:"Próximo fixo",unknown:"NÃO AVALIADO",planned:"PLANEJADO",condition:"OFP · confirme horário e cobertura",weatherMatch:"UTC do simulador corresponde ao OFP",noWeather:"Sem alinhamento/cobertura temporal suficiente",climbPhase:"SUBIDA",cruisePhase:"CRUZEIRO",descentPhase:"DESCIDA",profileLimit:"Perfil restante não avaliado após correção de fase.",syncDone:"Fixo confirmado. Projeção realinhada.",timeCorrected:"Tempo corrigido pelo piloto.",flUnavailable:"Novo FL sem perfil modelado válido.",earlyDescent:"Confirme a descida antecipada.",newMission:"Outra missão possui uma sessão salva. Substituir essa sessão?",finishConfirm:"Encerrar o Tracker desta missão?",routeEnd:"Fim da rota projetada. Encerre o voo quando confirmar o pouso."},
  "en-US":{notStarted:"NOT STARTED",running:"RUNNING",paused:"PAUSED",finished:"FINISHED",estimated:"ESTIMATED",confirmed:"PILOT CONFIRMED",phase:"Phase",clock:"Simulation time",fl:"Estimated FL",fuel:"Estimated fuel",ete:"Remaining ETE",start:"Start flight",pause:"Pause",resume:"Resume",sync:"Sync",projection:"Remaining projection",finish:"Finish",time:"Time",projected:"PROJECTED · NO TELEMETRY",recovered:"Session reconstructed. Confirm position or time; Xbox state cannot be detected.",applied:"Apply a mission configuration before starting.",invalid:"This configuration has no valid projected profile.",fix:"Fix",observedFl:"Observed FL · optional",observedFuel:"Observed fuel · optional",elapsed:"Simulated time · min",toc:"Confirm TOC",tod:"Confirm TOD",climb:"Climb",confirmFix:"Confirm fix",cancel:"Cancel",close:"Close",remaining:"REMAINING PROJECTION",distance:"Distance",destinationFuel:"At destination",alternateFuel:"At alternate",reserve:"Reserve",margin:"Margin",alternate:"Alternate",next:"Next fix",unknown:"UNASSESSED",planned:"PLANNED",condition:"OFP · confirm time and coverage",weatherMatch:"Simulator UTC matches OFP",noWeather:"Insufficient temporal alignment/coverage",climbPhase:"CLIMB",cruisePhase:"CRUISE",descentPhase:"DESCENT",profileLimit:"Remaining profile unavailable after phase correction.",syncDone:"Fix confirmed. Projection realigned.",timeCorrected:"Pilot corrected simulation time.",flUnavailable:"No valid modeled profile for observed FL.",earlyDescent:"Confirm early descent.",newMission:"A different mission has a saved session. Replace it?",finishConfirm:"Finish this mission Tracker?",routeEnd:"Projected route end reached. Finish after confirming landing."}
};
const tw=(key)=>trackerWords[state.language]?.[key]||trackerWords["en-US"][key]||key;
const trackerTime=(seconds)=>Number.isFinite(seconds)?`${String(Math.floor(seconds/3600)).padStart(2,"0")}:${String(Math.floor(seconds%3600/60)).padStart(2,"0")}:${String(Math.floor(seconds%60)).padStart(2,"0")}`:"—";
const trackerUtc=(value)=>Number.isFinite(value)?new Date(value).toLocaleString(state.language,{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false}).replace(",","")+"Z":"—";
function persistTracker(){
  try { if(trackerSession)localStorage.setItem(TRACKER_STORAGE_KEY,JSON.stringify(trackerSession)); }
  catch { showToast(state.language==="pt-BR"?"Não foi possível salvar o Tracker neste navegador.":"Tracker could not be saved in this browser.",true); }
}
function trackerConfig(){return {altitudeFt:state.appliedChoice.altitudeFt,mode:state.mode,payloadLb:state.payloadLb,
  fuelOnboardGal:state.fuelOnboardGal,oxygenWeightLb:currentOxygenWeightLb(),reserveMinutes:state.reserveMinutes,
  calibration:structuredClone(state.calibration),powerSetting:structuredClone(state.powerSetting)};}
function trackerProfileForFl(altitudeFt,calibration=trackerSession.config.calibration){
  const config={...trackerSession.config,altitudeFt,calibration};
  const result=calculateAtAltitude({plan:latestOptimizedMission?.performancePlan||state.plan,...config});
  return buildVirtualFlightProfile(state.plan,result,config.fuelOnboardGal);
}
function trackerWeatherAligned(){
  return Boolean(trackerSession?.weatherTimeAligned && state.weatherSnapshot?.status!=="SIMBRIEF_ONLY"
    && state.weatherSnapshot?.ofpKey===latestOptimizedMission?.weatherSnapshot?.ofpKey);
}
function renderTrackerProjection(nowMs=Date.now()){
  if(!trackerSession||trackerPanelMode!=="projection")return;
  if(trackerSession.limitations?.includes("MANUAL_UPDATE_UNMODELED")){
    $("#trackerProjectionGrid").innerHTML=`<div><span>${escapeHtml(tw("remaining"))}</span><strong>—</strong></div>`;
    $("#trackerConditions").innerHTML=`<span>ICE · ${tw("unknown")}</span><span>RIDE · ${tw("unknown")}</span><span>${escapeHtml(tw("alternate"))} · ${tw("unknown")}</span>`;
    $("#trackerEvents").textContent="—";$("#trackerProjectionNote").textContent=tw("flUnavailable");return;
  }
  const p=projectVirtualFlight(trackerSession,state.plan,nowMs);
  if(!p)return;
  const manual={active:true,distanceNm:p.distanceNm,altitudeFt:trackerSession.config.altitudeFt,fuelRemainingGal:p.fuelGal};
  const assessment=p.remainingTripFuelGal===null?{status:"unknown"}:calculateRemainingFlightAssessment({plan:state.plan,...trackerSession.config,manual,projectedRemainingTripFuelGal:p.remainingTripFuelGal});
  const hasFuel=Number.isFinite(p.destinationFuelGal),alternateFuel=hasFuel&&Number.isFinite(assessment?.alternateFuelGal)?p.destinationFuelGal-assessment.alternateFuelGal:null;
  const entries=[[tw("distance"),`${number(p.remainingDistanceNm,0)} NM`],["ETE",trackerTime(p.remainingSec)],
    [state.language==="pt-BR"?"ETA local":"Local ETA",p.etaWallMs?new Date(p.etaWallMs).toLocaleTimeString(state.language,{hour:"2-digit",minute:"2-digit"}):"—"],
    [tw("destinationFuel"),hasFuel?formatFuel(p.destinationFuelGal,1):"—"],
    [tw("alternateFuel"),Number.isFinite(alternateFuel)?formatFuel(alternateFuel,1):"—"],
    [tw("reserve"),Number.isFinite(assessment?.reserveFuelGal)?formatFuel(assessment.reserveFuelGal,1):"—"],
    [tw("margin"),Number.isFinite(assessment?.marginGal)?formatFuel(assessment.marginGal,1):"—"],
    [tw("next"),p.nextFix]];
  $("#trackerProjectionGrid").innerHTML=entries.map(([label,value])=>`<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  const matching=trackerWeatherAligned();
  const ice=remainingExposure(latestActiveCandidate?.result?.icing,p.distanceNm,matching);
  const ride=remainingExposure(latestActiveCandidate?.result?.turbulence,p.distanceNm,matching,"RIDE");
  $("#trackerConditions").innerHTML=`<span>ICE · ${ice.status==="UNKNOWN"?tw("unknown"):`${ice.score}/100 · ${tw("planned")}`}</span><span>RIDE · ${ride.status==="UNKNOWN"?tw("unknown"):`${ride.score}/100 · ${tw("planned")}`}</span><span>${escapeHtml(tw("alternate"))} · ${assessment?.status==="unknown"?tw("unknown"):assessment?.status==="not-viable"?t("remainingFuelUnavailable"):assessment?.status==="marginal"?t("remainingFuelMarginal"):t("remainingFuelViable")}</span>`;
  const eventValue=(event)=>event?`${Number.isFinite(event.distanceNm)?number(event.distanceNm,0):"—"} NM · ${trackerTime(event.timeSec)}${event.quality?` · ${state.language==="pt-BR"?({COMPLETE:"COMPLETO",PARTIAL:"PARCIAL",UNKNOWN:"DESCONHECIDO"}[event.quality]||event.quality):event.quality}`:""}`:tw("unknown");
  const ofp=state.plan.ofpTocTod||{},model=trackerSession.profile;
  $("#trackerEvents").innerHTML=`<p>TOC · OFP ${escapeHtml(eventValue(ofp.toc))} · ${state.language==="pt-BR"?"MODELO":"MODEL"} ${escapeHtml(eventValue({distanceNm:model.tocNm,timeSec:model.tocSec}))}</p><p>TOD · OFP ${escapeHtml(eventValue(ofp.tod))} · ${state.language==="pt-BR"?"MODELO":"MODEL"} ${escapeHtml(model.todNm>model.tocNm?eventValue({distanceNm:model.todNm,timeSec:model.todSec}):tw("unknown"))}</p>`;
  $("#trackerProjectionNote").textContent=p.profileExhausted?tw("profileLimit"):!matching?tw("noWeather"):tw("condition");
  trackerProjectionUpdatedAt=nowMs;
}
function tickTracker(nowMs=Date.now()){
  if(!trackerSession||!state.plan||trackerSession.missionKey!==missionPlanKey(state.plan))return;
  const p=projectVirtualFlight(trackerSession,state.plan,nowMs);
  $("#trackerClock").textContent=trackerTime(virtualElapsedSeconds(trackerSession,nowMs));
  if(trackerSession.limitations?.includes("MANUAL_UPDATE_UNMODELED")){
    for(const id of ["trackerPhase","trackerFl","trackerFuel","trackerEte","trackerNextDistance"])$("#"+id).textContent="—";
    $("#trackerFixes").textContent="— → —";$("#trackerProgress").value=0;
    $("#trackerProvenance").textContent=tw("unknown");
    $("#trackerAttention").hidden=false;
    $("#trackerAttention").textContent=state.language==="pt-BR"?"FL sem perfil válido. Tracker pausado; sincronize novamente.":"No valid FL profile. Tracker paused; sync again.";
    return;
  }
  if(!p)return;
  $("#trackerPhase").textContent=`${tw(p.phase.toLowerCase()+"Phase")} · ${p.phaseSource==="PILOT_CONFIRMED"?tw("confirmed"):tw("estimated")}`;
  $("#trackerFl").textContent=`FL${Math.round(p.altitudeFt/100)}`;
  $("#trackerFuel").textContent=formatFuel(p.fuelGal,1);
  $("#trackerEte").textContent=trackerTime(p.remainingSec);
  $("#trackerFixes").textContent=`${p.previousFix} → ${p.nextFix}`;
  $("#trackerNextDistance").textContent=`${number(p.distanceToNextNm,0)} NM`;
  $("#trackerProgress").value=p.percent;
  const lastCheckpoint=trackerSession.checkpoints.at(-1);
  const provenance=[tw("projected")];
  if(lastCheckpoint){provenance.push(`${lastCheckpoint.ident} · ${state.language==="pt-BR"?"FIXO CONFIRMADO":"FIX CONFIRMED"}`);
    if(lastCheckpoint.direction!=="ON_TRACK")provenance.push(state.language==="pt-BR"?"RESSINCRONIZADO":"RESYNCED");}
  if(p.lastConfirmedFuelGal!==null)provenance.push(`${tw("confirmed")} ${number(fuelValue(p.lastConfirmedFuelGal),1)}\u00a0${fuelLabel()} · ${trackerTime(p.lastSyncAgeSec)}`);
  $("#trackerProvenance").textContent=provenance.join(" · ");
  const attention=$("#trackerAttention");attention.hidden=!trackerSession.recoveredAttention&&!p.profileExhausted;
  if(!attention.hidden)attention.textContent=trackerSession.limitations?.includes("MANUAL_UPDATE_UNMODELED")
    ? (state.language==="pt-BR"?"FL sem perfil válido. Tracker pausado; sincronize novamente.":"No valid FL profile. Tracker paused; sync again.")
    : trackerSession.recoveredAttention?tw("recovered"):tw("routeEnd");
  if(trackerPanelMode==="projection"&&nowMs-trackerProjectionUpdatedAt>60000)renderTrackerProjection(nowMs);
}
function renderTracker(){
  const hasPlan=Boolean(state.plan),status=trackerSession?.missionKey===missionPlanKey(state.plan||{})?trackerSession.status:"NOT_STARTED";
  $("#trackerTitle").textContent="VIRTUAL FLIGHT TRACKER";
  $("#trackerState").textContent=tw(status==="NOT_STARTED"?"notStarted":status.toLowerCase());
  $("#trackerOrigin").textContent=tw("estimated");
  $("#trackerTiming").textContent=`OFP ${trackerUtc(state.plan?.scheduledOffMs)} · ${state.language==="pt-BR"?"Início Tracker":"Tracker start"} ${trackerUtc(trackerSession?.startedWallMs)}`;
  for(const [id,key] of [["trackerPhaseLabel","phase"],["trackerClockLabel","clock"],["trackerFlLabel","fl"],["trackerFuelLabel","fuel"],["trackerEteLabel","ete"],["trackerSyncToggle","sync"],["trackerProjectionToggle","projection"],["trackerFinish","finish"],["trackerFactorLabel","time"],["trackerSyncTitle","sync"],["trackerFixLabel","fix"],["trackerObservedFlLabel","observedFl"],["trackerObservedFuelLabel","observedFuel"],["trackerElapsedLabel","elapsed"],["trackerConfirmFix","confirmFix"],["trackerSyncCancel","cancel"],["trackerProjectionTitle","remaining"],["trackerProjectionClose","close"],["trackerWeatherMatchLabel","weatherMatch"]])$("#"+id).textContent=tw(key);
  $$('[data-tracker-phase]').forEach((button)=>{button.textContent=tw(button.dataset.trackerPhase==="CRUISE"?"toc":button.dataset.trackerPhase==="DESCENT"?"tod":"climb");button.classList.toggle("active",button.dataset.trackerPhase===trackerPendingPhase);});
  const primary=$("#trackerPrimary");primary.textContent=tw(status==="RUNNING"?"pause":status==="PAUSED"?"resume":"start");primary.hidden=status==="FINISHED";
  primary.disabled=!hasPlan||status==="NOT_STARTED"&&!state.appliedChoice
    ||status==="PAUSED"&&trackerSession?.limitations?.includes("MANUAL_UPDATE_UNMODELED");
  $("#trackerSyncToggle").hidden=status==="NOT_STARTED"||status==="FINISHED";
  $("#trackerProjectionToggle").hidden=status==="NOT_STARTED";
  $("#trackerFinish").hidden=status==="NOT_STARTED"||status==="FINISHED";
  $("#trackerFactor").value=String(trackerSession?.factor||1);
  $("#trackerFactor").disabled=status==="FINISHED"||status==="NOT_STARTED";
  $("#trackerSyncPanel").hidden=trackerPanelMode!=="sync";
  $("#trackerProjectionPanel").hidden=trackerPanelMode!=="projection";
  $("#trackerFuelUnit").textContent=fuelLabel();
  $("#trackerWeatherAligned").checked=Boolean(trackerSession?.weatherTimeAligned);
  if(hasPlan){
    const fix=$("#trackerFix"),old=fix.value;
    fix.innerHTML=state.plan.waypoints.map((item,index)=>`<option value="${index}">${escapeHtml(item.ident)} · ${number(item.distanceNm,0)} NM</option>`).join("");
    fix.value=old&&[...fix.options].some((option)=>option.value===old)?old:"0";
    const fl=$("#trackerObservedFl"),oldFl=fl.value;
    fl.innerHTML=`<option value="">—</option>${ALTITUDES_FT.map((altitude)=>`<option value="${altitude}">FL${altitude/100}</option>`).join("")}`;
    fl.value=oldFl||"";
  }
  if(status==="NOT_STARTED"){
    $("#trackerPhase").textContent="—";$("#trackerClock").textContent="00:00:00";
    $("#trackerFl").textContent=state.appliedChoice?`FL${state.appliedChoice.altitudeFt/100}`:"—";
    $("#trackerFuel").textContent="—";$("#trackerEte").textContent="—";
    $("#trackerFixes").textContent="— → —";$("#trackerNextDistance").textContent="—";
    $("#trackerProgress").value=0;$("#trackerProvenance").textContent=tw("projected");
    $("#trackerAttention").hidden=Boolean(state.appliedChoice);
    if(!state.appliedChoice)$("#trackerAttention").textContent=tw("applied");
  } else {tickTracker();renderTrackerProjection();}
}

const decisionInput=()=>({...state,pricePerLiter:fuelPricePerLiter(),currency:state.financial.currency});
function optimizedMissionForRender(){
  const input=decisionInput();
  const key=JSON.stringify([input.mode,input.payloadLb,input.fuelOnboardGal,input.reserveMinutes,
    input.selectedAltitudeFt,input.calibration,input.powerSetting,input.oxygen,input.weightBalance,
    input.ridePreference,input.pricePerLiter,input.currency]);
  if(renderOptimizationCache?.plan===input.plan&&renderOptimizationCache.weatherSnapshot===input.weatherSnapshot
    &&renderOptimizationCache.key===key)return renderOptimizationCache.mission;
  const mission=optimizeMission(input);
  renderOptimizationCache={plan:input.plan,weatherSnapshot:input.weatherSnapshot,key,mission};
  return mission;
}
function validDecisionChoice(choice){
  return choice&&ALTITUDES_FT.includes(choice.altitudeFt)
    && (["ECON","NORMAL","FAST"].includes(choice.mode)
      || choice.mode==="MANUAL"&&Number.isFinite(choice.mapInHg)&&Number.isFinite(choice.rpm)
        && choice.mapInHg>=PERFORMANCE.powerModel.minimumMapInHg&&choice.mapInHg<=AIRCRAFT.maxManifoldInHg
        && choice.rpm>=PERFORMANCE.powerModel.minimumRpm&&choice.rpm<=AIRCRAFT.maxRpm);
}
function invalidateDecision(clearApplied=false) {
  decisionRevision++;
  if(decisionSnapshot)decisionStale=true;
  analysisCandidate=null;
  marginalApplyArmed=false;
  if(clearApplied){state.appliedChoice=null;localStorage.removeItem("velocityxl.appliedMission");}
}

const trophySvg=(place)=>`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M10 5h12v8a6 6 0 0 1-12 0V5Zm0 2H5v3a5 5 0 0 0 5 5m12-8h5v3a5 5 0 0 1-5 5M16 19v5m-6 3h12m-9-3h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${place}º</span>`;
function decisionCard(candidate,place,marginal=false){
  const ice=candidate.result.icing.compatibility==="UNKNOWN"?"—":`${number(candidate.result.icing.riskScore)}/100`;
  const ride=candidate.result.turbulence.riskScore===null?"—":`${number(candidate.result.turbulence.riskScore)}/100`;
  const score=candidate.score.partial?"—":`${candidate.score.score}/100`;
  const label=missionStatusLabel(candidate.status);
  return `<button class="top-level-card ${marginal?"marginal":""}" type="button" data-decision-fl="${candidate.altitudeFt}" data-decision-mode="${candidate.mode}">
    ${marginal?"":`<span class="trophy trophy-${place}">${trophySvg(place)}</span>`}<span class="top-level-identity"><strong>FL${candidate.altitudeFt/100}</strong><small>${candidate.mode}</small></span><span class="top-level-status ${candidate.status}">${label}</span>
    <span class="top-level-metrics"><span><b>Score</b><strong>${score}</strong></span><span><b>ICE</b><strong>${ice}</strong></span><span><b>RIDE</b><strong>${ride}</strong></span><span><b>${state.language==="pt-BR"?"Combustível":"Fuel"}</b><strong>${formatFuel(candidate.result.fuelRequiredGal,1)}</strong></span><span><b>${state.language==="pt-BR"?"Tempo":"Time"}</b><strong>${formatTime(candidate.result.tripTimeHr)}</strong></span></span></button>`;
}
function renderDecisionPanel(){
  const panel=$("#pilotDecisionPanel");
  panel.hidden=!decisionSnapshot;
  if(!decisionSnapshot)return;
  const mission=decisionSnapshot,auto=mission.automaticRecommendation,pt=state.language==="pt-BR";
  $("#decisionAutoStatus").textContent=decisionStale?t("rankingStale"):auto?`FL${auto.altitudeFt/100} · ${auto.mode} · ${missionStatusLabel(auto.status)}`:t("noConfirmedRecommendation");
  $("#topLevelCards").innerHTML=mission.topLevels.map((candidate,index)=>decisionCard(candidate,index+1)).join("");
  const marginal=mission.marginalLevels.filter((candidate)=>!mission.topLevels.some((top)=>top.altitudeFt===candidate.altitudeFt)).slice(0,3);
  $("#marginalLevels").hidden=!marginal.length;
  $("#marginalLevels").innerHTML=marginal.length?`<h3>${t("marginalAlternatives")}</h3><div>${marginal.map((candidate)=>decisionCard(candidate,0,true)).join("")}</div>`:"";
  const diagnostic=$("#decisionDiagnostic");
  diagnostic.hidden=Boolean(mission.topLevels.length||marginal.length);
  diagnostic.textContent=mission.status==="unknown"?`${t("noConfirmedRecommendation")} · ${weatherDiagnosticText(mission)}`:t("noConfirmedRecommendation");
  const analysis=$("#pilotAnalysis");analysis.hidden=!analysisChoice;
  if(!analysisChoice){analysisCandidate=null;refreshUiIcons();return;}
  $("#analysisLevel").textContent=`FL${analysisChoice.altitudeFt/100} · ${analysisChoice.mode==="MANUAL"?t("manualPower"):analysisChoice.mode}`;
  $$('[data-analysis-mode]').forEach((button)=>{const active=button.dataset.analysisMode===analysisChoice.mode;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});
  $("#analysisManualFields").hidden=analysisChoice.mode!=="MANUAL";
  try{analysisCandidate=decisionStale?null:evaluateMissionAlternative(mission,decisionInput(),analysisChoice);}catch{analysisCandidate=null;}
  const candidate=analysisCandidate,status=$("#analysisStatus"),apply=$("#applyPilotAlternative");
  status.textContent=decisionStale?t("rankingStale"):candidate?missionStatusLabel(candidate.status):t("invalidManualPower");
  status.dataset.status=candidate?.status||"unknown";
  apply.disabled=decisionStale||!candidate||!["viable","marginal"].includes(candidate.status);
  apply.textContent=candidate?.status==="marginal"&&marginalApplyArmed?t("confirmMarginal"):t("applyConfiguration");
  const comparison=$("#analysisComparison");
  if(!auto||!candidate){comparison.innerHTML="";refreshUiIcons();return;}
  const value=(entry,key)=>{
    const r=entry.result;
    return ({fl:`FL${entry.altitudeFt/100}`,mode:entry.mode==="MANUAL"?t("manualPower"):entry.mode,
      score:entry.score.partial?"—":`${entry.score.score}/100`,fuel:formatFuel(r.fuelRequiredGal,1),margin:formatFuel(r.feasibility.fuelMarginGal,1),
      time:formatTime(r.tripTimeHr),ice:r.icing.compatibility==="UNKNOWN"?"—":`${number(r.icing.riskScore)}/100`,
      ride:r.turbulence.riskScore===null?"—":`${number(r.turbulence.riskScore)}/100`,wb:weightBalanceLabel(r.weightBalance.status),
      oxygen:oxygenLabel(r.oxygen.status),alternate:entry.alternate.destination?`${formatFuel(entry.alternate.destination.marginGal,1)} · ${missionStatusLabel(entry.alternate.destination.status)}`:"—"})[key];
  };
  const labels={fl:"FL",mode:pt?"Modo":"Mode",score:"Score",fuel:pt?"Combustível":"Fuel",margin:pt?"Margem":"Margin",time:pt?"Tempo":"Time",ice:"ICE",ride:"RIDE",wb:"W&B",oxygen:"O₂",alternate:pt?"Alternado":"Alternate"};
  const difference=(key)=>{
    const a=auto.result,b=candidate.result;
    const numeric={score:[auto.score.score,candidate.score.score,""],fuel:[a.fuelRequiredGal,b.fuelRequiredGal,"fuel"],margin:[a.feasibility.fuelMarginGal,b.feasibility.fuelMarginGal,"fuel"],time:[a.tripTimeHr,b.tripTimeHr,"time"],ice:[a.icing.riskScore,b.icing.riskScore,""],ride:[a.turbulence.riskScore,b.turbulence.riskScore,""]}[key];
    if(!numeric||!Number.isFinite(numeric[0])||!Number.isFinite(numeric[1])||auto.score.partial||candidate.score.partial)return "—";
    const [before,after,unit]=numeric,delta=after-before;
    if(unit==="time")return signedNumber(delta*60,0," min");
    if(unit==="fuel")return signedNumber(fuelValue(delta),1,` ${fuelLabel()}`);
    return signedNumber(delta,0);
  };
  comparison.innerHTML=`<div class="analysis-comparison-head"><span></span><b>AUTO</b><b>${pt?"PILOTO":"PILOT"}</b><b>Δ</b></div>${Object.entries(labels).map(([key,label])=>`<div class="analysis-comparison-row"><span>${label}</span><strong>${escapeHtml(value(auto,key))}</strong><strong>${escapeHtml(value(candidate,key))}</strong><strong>${escapeHtml(difference(key))}</strong></div>`).join("")}`;
  refreshUiIcons();
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
  $$('[data-i18n-aria-label]').forEach((element)=>element.setAttribute("aria-label",t(element.dataset.i18nAriaLabel)));
  $$('[data-language]').forEach((button)=>button.classList.toggle("active",button.dataset.language===state.language));
  $$('[data-weight-unit]').forEach((button)=>button.classList.toggle("active",button.dataset.weightUnit===state.weightUnit));
  $$('[data-fuel-unit]').forEach((button)=>button.classList.toggle("active",button.dataset.fuelUnit===state.fuelUnit));
  $$('.font-switch button[data-font-size]').forEach((button)=>{const active=button.dataset.fontSize===state.fontSize;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));button.setAttribute("aria-label",t(button.dataset.fontSize==="small"?"fontSmall":button.dataset.fontSize==="large"?"fontLarge":"fontNormal"));});
  $$('[data-mode]').forEach((button)=>button.classList.toggle("active",button.dataset.mode===state.mode));
  window.VelocityLayout?.translate();
}

function icingLabel(icing) {
  return t(icing.status==="avoid"?"icingAvoid":icing.status==="caution"?"icingCaution":icing.status==="watch"?"icingWatch":"icingLow");
}

function iceBlue(score, minimum=.08, maximum=.82) {
  const ratio=clamp((Number(score)||0)/100,0,1);
  return `rgba(37,129,217,${(minimum+(maximum-minimum)*ratio).toFixed(3)})`;
}

function weatherMissingLabel(reason,pt) {
  const mapping={
    OUTSIDE_FORECAST_WINDOW: pt?"GFS fora do horário do voo":"GFS outside flight time",
    MISSING_FLIGHT_TIME: pt?"Horário do OFP indisponível":"OFP time unavailable",
    OUTSIDE_SPATIAL_COVERAGE: pt?"GFS sem cobertura da rota":"GFS lacks route coverage",
    OUTSIDE_VERTICAL_COVERAGE: pt?"GFS sem cobertura da altitude":"GFS lacks altitude coverage",
    MOISTURE_FIELDS_MISSING: pt?"GFS sem umidade/nuvens":"GFS humidity/clouds missing",
    PROVIDER_UNAVAILABLE: pt?"GFS indisponível":"GFS unavailable",
    MODEL_FIELDS_MISSING: pt?"Dados atmosféricos insuficientes":"Atmospheric fields missing",
    HEIGHT_LEVELS_MISSING: pt?"Níveis de pressão ausentes":"Pressure levels missing",
  };
  return mapping[reason]||reason||"—";
}

function renderIceModule(plan,analysis,selected) {
  const pt=state.language==="pt-BR",icing=selected.icing,score=clamp(Math.round(icing.riskScore||0),0,100);
  const assessed=icing.compatibility!=="UNKNOWN";
  const gfsStatus=state.weatherSnapshot?.sources?.OPEN_METEO?.status||"unavailable";
  const awcStatus=state.weatherSnapshot?.sources?.AWC?.status||"unavailable";
  const weatherSources=["SIMBRIEF",gfsStatus==="available"?`GFS ${Math.round((icing.coverage||0)*100)}%`:`GFS ${pt?"indisponível":"unavailable"}`,
    awcStatus==="available"?"AWC":`AWC ${awcStatus==="stale"?(pt?"vencido":"stale"):(pt?"indisponível":"unavailable")}`].join(" · ");
  const exposureLabel=(minutes)=>minutes>0&&minutes<1?"<1 min":`${number(minutes||0,0)} min`;
  const source=assessed?(icing.confidence==="weather"?t("icingWeather"):icing.confidence==="estimated"?t("weatherEstimated"):t("icingLimited")):`ICE ${Math.round((icing.coverage||0)*100)}% ${pt?"avaliado":"assessed"}`;
  $("#iceModuleLevel").textContent=`ICE · FL${selected.fl}${assessed?"":` · ${pt?"diagnóstico":"diagnostic"}`}`;
  $("#iceModuleIndex").textContent=assessed?number(score):"—";
  $("#iceModuleStatus").textContent=assessed?icingLabel(icing):t("icingLimited");
  $("#iceModuleConfidence").textContent=source;
  if(assessed){$("#iceIndexTrack").setAttribute("role","meter");$("#iceIndexTrack").setAttribute("aria-valuenow",String(score));$("#iceIndexTrack").removeAttribute("aria-label");}
  else{$("#iceIndexTrack").setAttribute("role","img");$("#iceIndexTrack").removeAttribute("aria-valuenow");$("#iceIndexTrack").setAttribute("aria-label",t("icingLimited"));}
  $("#iceIndexFill").style.width=assessed?`${score}%`:"0%";
  $("#iceIndexMarker").style.left=assessed?`${score}%`:"0%";
  $("#iceIndexFill").style.background=iceBlue(score,.38,.95);
  $("#iceIndexMarker").style.background=iceBlue(score,.55,1);

  const segments=icing.segments||[],temperatureSegments=segments.filter((segment)=>segment.temperatureRelevant);
  const peakIndex=segments.reduce((best,segment,index)=>(segment.riskScore||0)>(segments[best]?.riskScore||0)?index:best,0);
  let riskStart=peakIndex,riskEnd=peakIndex;
  if((segments[peakIndex]?.riskScore||0)>=PERFORMANCE.icing.watchScore){
    while(riskStart>0&&(segments[riskStart-1]?.riskScore||0)>=PERFORMANCE.icing.watchScore)riskStart-=1;
    while(riskEnd<segments.length-1&&(segments[riskEnd+1]?.riskScore||0)>=PERFORMANCE.icing.watchScore)riskEnd+=1;
  }
  const riskSegments=(segments[peakIndex]?.riskScore||0)>=PERFORMANCE.icing.watchScore?segments.slice(riskStart,riskEnd+1):[];
  const firstRisk=riskSegments[0],lastRisk=riskSegments.at(-1);
  $("#iceRiskWindowLabel").textContent=pt?"TRECHO CRÍTICO":"CRITICAL LEG";
  $("#iceRiskWindow").textContent=firstRisk?`${firstRisk.from||"—"} → ${lastRisk?.to||firstRisk.to||"—"}`:assessed?(pt?"SEM TRECHO":"NO LEG"):(pt?"NÃO AVALIADO":"NOT ASSESSED");
  $("#iceRiskWindowMeta").textContent=firstRisk?`${number(firstRisk.startNm,0)}–${number(lastRisk?.endNm??firstRisk.endNm,0)} NM · ${number(riskSegments.reduce((sum,segment)=>sum+(segment.minutes||0),0),0)} min`:assessed?(pt?"abaixo do limite":"below threshold"):(pt?"sem cobertura suficiente":"insufficient coverage");
  const terminalView=(terminal)=>terminal?`${number(terminal.riskScore||0)}/100`:"—";
  $("#iceDestinationLabel").textContent=pt?"DESTINO":"DESTINATION";
  $("#iceDestinationRisk").textContent=terminalView(icing.destination);
  $("#iceDestinationMeta").textContent=icing.destination?`${exposureLabel(icing.destination.exposureMinutes)} · ${icingLabel(icing.destination)}${assessed?"":` · ${pt?"terminal":"terminal"}`}`:"—";
  $("#iceAlternateLabel").textContent=pt?"ALTERNADO":"ALTERNATE";
  $("#iceAlternateRisk").textContent=icing.alternate?`${icing.alternate.ident} · ${icing.alternate.status==="unknown"?"—":terminalView(icing.alternate)}`:"—";
  $("#iceAlternateMeta").textContent=icing.alternate?.status==="unknown"?t("icingLimited"):icing.alternate?`${exposureLabel(icing.alternate.exposureMinutes)} · ${icingLabel(icing.alternate)}`:(pt?"não informado":"not filed");
  const escapeButton=$("#iceEscapeLevel"),escapeAltitude=icing.escapeAltitudeFt;
  $("#iceEscapeLabel").textContent=pt?"SAÍDA VERTICAL":"VERTICAL EXIT";
  escapeButton.querySelector("strong").textContent=Number.isFinite(escapeAltitude)?`FL${Math.round(escapeAltitude/100)}`:"—";
  escapeButton.querySelector("small").textContent=Number.isFinite(escapeAltitude)?`ICE ${number(icing.escapeRiskScore)}/100`:(pt?"sem ganho ≥ 8":"no gain ≥ 8");
  escapeButton.disabled=true;
  escapeButton.onclick=null;
  const temperatureNm=temperatureSegments.reduce((sum,segment)=>sum+Math.max(0,(Number(segment.endNm)||0)-(Number(segment.startNm)||0)),0);
  $("#iceRouteExposure").textContent=segments.length?`${temperatureSegments.length}/${segments.length} ${pt?"frio":"cold"} · ${number(temperatureNm,0)} NM`:"—";
  $("#iceRouteLabels").innerHTML=segments.length?`<span>${escapeHtml(segments[0].from||plan.origin.icao)}</span>${segments.map((segment)=>`<span>${escapeHtml(segment.to||"—")}</span>`).join("")}`:"";
  $("#iceRouteBand").innerHTML=segments.map((segment,index)=>{
    const value=clamp(Math.round(segment.riskScore||0),0,100),available=segment.evidenceAvailable;
    const display=available?number(value):"—",temperature=Number.isFinite(segment.oatC)?`${number(segment.oatC,0)}°`:"—";
    return `<button type="button" class="${available?"":"limited"}" data-ice-segment="${index}" style="--ice-band-color:${available?iceBlue(value,.12,.9):"var(--panel-soft)"}" aria-label="${escapeHtml(segment.from||"—")} → ${escapeHtml(segment.to||"—")}, ICE ${display}, OAT ${temperature}"><strong>${display}</strong><small>${temperature}</small></button>`;
  }).join("");
  const renderRouteFocus=(index)=>{
    const segment=segments[index];
    if(!segment){$("#iceRouteFocus").innerHTML=`<span>${escapeHtml(t("icingLimited"))}</span>`;return;}
    $$("[data-ice-segment]").forEach((button)=>button.classList.toggle("active",Number(button.dataset.iceSegment)===index));
    const value=segment.evidenceAvailable?`${number(segment.riskScore)}/100`:"—";
    $("#iceRouteFocus").innerHTML=`<div><span>${pt?"TRECHO":"LEG"}</span><strong>${escapeHtml(segment.from||"—")} → ${escapeHtml(segment.to||"—")}</strong></div><div><span>OAT</span><strong>${Number.isFinite(segment.oatC)?`${number(segment.oatC,0)}°C`:"—"}</strong></div><div><span>${pt?"TEMPO":"TIME"}</span><strong>${number(segment.minutes||0,0)} min</strong></div><div><span>ICE</span><strong>${value}</strong></div>`;
  };
  const initialSegment=segments.reduce((best,segment,index)=>segment.riskScore>(segments[best]?.riskScore??-1)?index:best,0);
  renderRouteFocus(initialSegment);
  $$("[data-ice-segment]").forEach((button)=>button.addEventListener("click",()=>renderRouteFocus(Number(button.dataset.iceSegment))));

  const phases=[
    {label:pt?"SUBIDA":"CLIMB",minutes:icing.climbExposureMinutes||0},
    {label:pt?"CRUZEIRO":"CRUISE",minutes:icing.cruiseExposureMinutes||0},
    {label:pt?"DESCIDA":"DESCENT",minutes:icing.descentExposureMinutes||0},
  ];
  const maxPhase=Math.max(1,...phases.map((phase)=>phase.minutes));
  $("#iceExposureTotal").textContent=assessed?exposureLabel(icing.exposureMinutes):"—";
  $("#icePhaseList").innerHTML=phases.map((phase)=>`<div><span>${phase.label}</span><div><i style="width:${assessed?phase.minutes/maxPhase*100:0}%;background:${iceBlue(score,.28,.9)}"></i></div><strong>${assessed?exposureLabel(phase.minutes):"—"}</strong></div>`).join("");

  const oats=segments.map((segment)=>segment.oatC).filter(Number.isFinite),evidenceCount=segments.filter((segment)=>segment.evidenceAvailable).length;
  const oatRange=oats.length?`${number(Math.min(...oats),0)}° a ${number(Math.max(...oats),0)}°C`:"—";
  const coverage=Math.round((icing.combinedCoverage||0)*100);
  const phaseCoverage=icing.phaseCoverage||{};
  const phaseCounts=["climb","cruise","descent"].map((phase)=>`${phaseCoverage[phase]?.covered||0}/${phaseCoverage[phase]?.total||0}`).join(" · ");
  const [missingReason,missingCount]=Object.entries(icing.coverageReasons||{}).sort((a,b)=>b[1]-a[1])[0]||[];
  const alternateCoverage=icing.alternateCoverage;
  const alternateCounts=alternateCoverage?.total?`${alternateCoverage.assessed}/${alternateCoverage.total}`:"—";
  const shortUtc=(value)=>Number.isFinite(value)?new Date(value).toLocaleString(pt?"pt-BR":"en-US",{timeZone:"UTC",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}):"—";
  const firstGfsHour=state.weatherSnapshot?.gfs?.locations?.[0]?.times?.[0];
  const timeWindow=`${shortUtc(plan.scheduledOffMs)} / ${shortUtc(firstGfsHour)}`;
  const weatherPoints=[icing.originWeather,icing.destination?.weather,icing.alternate?.weather].filter(Boolean);
  const validForecasts=weatherPoints.filter((weather)=>weather.tafValid||Number.isFinite(weather.metarAgeMinutes)&&weather.metarAgeMinutes<=PERFORMANCE.icing.metarMaximumAgeMin).length;
  const ages=weatherPoints.map((weather)=>weather.metarAgeMinutes).filter(Number.isFinite);
  const freshest=ages.length?Math.min(...ages):NaN;
  const tafKinds=[...new Set(weatherPoints.flatMap((weather)=>weather.sources||[]).map((item)=>item.kind).filter((kind)=>!["metar","legacy"].includes(kind)))];
  const tafModes=tafKinds.length?tafKinds.map((kind)=>kind.replace("prob","PROB").replace("temporary",pt?"TEMPO":"TEMPO").replace("becoming","BECMG").replace("prevailing",pt?"PREDOMINANTE":"PREVAILING").toUpperCase()).join(" · "):"—";
  $("#iceEvidenceCoverage").textContent=`${coverage}%`;
  $("#iceEvidenceList").innerHTML=`<div><span>${pt?"TEMPERATURA":"TEMPERATURE"}</span><strong>${oatRange}</strong></div><div><span>${pt?"COBERTURA COMBINADA":"COMBINED COVERAGE"}</span><strong>${coverage}%</strong></div><div><span>${pt?"EVIDÊNCIA APLICÁVEL":"APPLICABLE EVIDENCE"}</span><strong>${evidenceCount}/${segments.length||0} ${pt?"trechos":"legs"}</strong></div><div><span>${pt?"FASES · S / C / D":"PHASES · C / C / D"}</span><strong>${phaseCounts}</strong></div><div><span>${pt?"LACUNA PRINCIPAL":"MAIN GAP"}</span><strong>${weatherMissingLabel(missingReason,pt)}${missingCount?` (${missingCount})`:""}</strong></div><div><span>${pt?"ALTERNADO · ROTA":"ALTERNATE · ROUTE"}</span><strong>${alternateCounts}${alternateCoverage?.terminalEvidence?` · ${pt?"TAF/METAR terminal":"terminal TAF/METAR"}`:""}</strong></div><div><span>${pt?"VALIDADE TERMINAL":"TERMINAL VALIDITY"}</span><strong>${validForecasts}/${weatherPoints.length||0}</strong></div><div><span>${pt?"METAR MAIS PRÓXIMO":"NEAREST METAR"}</span><strong>${Number.isFinite(freshest)?`${number(freshest,0)} min`:"—"}</strong></div><div><span>${pt?"GRUPOS TAF":"TAF GROUPS"}</span><strong>${tafModes}</strong></div><div><span>${pt?"PROTEÇÃO":"PROTECTION"}</span><strong>${pt?"NÃO INSTALADA":"NOT INSTALLED"}</strong></div><div><span>${pt?"FONTE":"SOURCE"}</span><strong>${weatherSources}</strong></div><div><span>${pt?"OFP / GFS UTC":"OFP / GFS UTC"}</span><strong>${timeWindow}</strong></div>`;
  $(".ice-module-grid").classList.toggle("unassessed",!assessed);

  const reading=score>=PERFORMANCE.icing.cautionScore?(pt?"ÍNDICE ELEVADO":"HIGH INDEX"):score>=PERFORMANCE.icing.watchScore?(pt?"ÍNDICE MODERADO":"MODERATE INDEX"):(pt?"ÍNDICE BAIXO":"LOW INDEX");
  $("#iceCompositionLabel").textContent=assessed?reading:t("icingLimited");
  $("#iceCompositionValue").textContent=assessed?`${number(score)}/100`:"—";
  $("#iceCompositionFill").style.width=assessed?`${score}%`:"0%";
  $("#iceCompositionFill").style.background=iceBlue(score,.36,1);
}

function renderFuel(result) {
  const pieces=[{label:t("trip"),value:result.tripFuelGal,color:"#1976d2",icon:"route"},{label:t("reserve"),value:result.reserveFuelGal,color:"#52a964",icon:"shield-check"},{label:t("contingency"),value:result.contingencyFuelGal,color:"#d98b34",icon:"plus-circle"},{label:t("taxi"),value:PERFORMANCE.taxiFuelGal,color:"#8a72d9",icon:"plane"}],total=pieces.reduce((sum,p)=>sum+p.value,0);
  $("#fuelBar").innerHTML=pieces.map((p)=>`<span style="width:${p.value/total*100}%;background:${p.color}"></span>`).join("");
  $("#fuelLegend").innerHTML=pieces.map((p)=>`<div>${iconMarkup(p.icon,"fuel-legend-icon")}<span>${p.label}</span><b>${formatFuel(p.value,1)}</b></div>`).join("");
}

function renderStepComparison(stepPlan) {
  const {baseline,stepped,fuelSavingGal,timeDeltaMin,reason}=stepPlan.comparison;
  const initialLevel=`FL${stepPlan.initialAltitudeFt/100}`;
  const suggestedPath=[initialLevel,...stepPlan.steps.map((step)=>`FL${step.altitudeFt/100}`)].join(" → ");
  const reasonKey=reason==="no-waypoint"?"stepNoWaypoint":reason==="no-net-gain"?"stepNoNetGain":reason==="level-unavailable"?"stepLevelUnavailable":"stepNoBenefit";
  const metric=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const proposed=Boolean(stepped);
  const points=proposed?`<div class="step-comparison-points">${stepPlan.steps.map((step)=>`<span>${iconMarkup("trending-up")}<b>${escapeHtml(step.waypoint||"—")}</b> · ${number(step.distanceNm)} NM → FL${step.altitudeFt/100}</span>`).join("")}</div>`:"";
  $("#stepComparison").innerHTML=`
    <div class="step-comparison-heading"><div><span>${t("stepRemainingCruise")}</span><h2>${t("stepDecisionTitle")}</h2></div><small>${proposed?t("stepCountLabel",stepPlan.steps.length):t("stepNoProposed")}</small></div>
    <div class="step-profiles">
      <article class="step-profile-card"><div class="step-profile-top"><span>${t("currentScenario")}</span><small>${t("stepConstant")}</small></div><strong>${initialLevel}</strong><dl>${metric(t("stepFuelUsed"),formatFuel(baseline.fuelGal,1))}${metric(t("stepTravelTime"),formatTime(baseline.timeHr))}${metric(t("stepClimbsCount"),"0")}</dl></article>
      <article class="step-profile-card ${proposed?"suggested":"not-proposed"}"><div class="step-profile-top"><span>${t(proposed?"stepSuggested":"stepAlternative")}</span><small>${t(proposed?"stepEfficient":"stepNoProposal")}</small></div><strong>${proposed?suggestedPath:t("stepNoSuggestion")}</strong><dl>${metric(t("stepFuelUsed"),proposed?formatFuel(stepped.fuelGal,1):"—")}${metric(t("stepTravelTime"),proposed?formatTime(stepped.timeHr):"—")}${metric(t("stepClimbsCount"),proposed?number(stepPlan.steps.length):"—")}</dl></article>
    </div>
    <div class="step-comparison-verdict"><span>${t(proposed?"stepTradeoff":"stepNoSuggestion")}</span><strong>${proposed?`−${formatFuel(fuelSavingGal,1)} · ${signedNumber(timeDeltaMin,0," min")}`:`${t("stepMaintain")} ${initialLevel}`}</strong></div>
    ${points}
    <p class="step-comparison-note">${proposed?(state.language==="pt-BR"?"Trecho restante · sem reserva":"Remaining segment · no reserve"):t(reasonKey)}</p>`;
}

function renderFlightTools(plan,navigation,stepPlan,selected,candidate) {
  $("#etpDistance").textContent=`${number(navigation.etp.distanceNm)} NM`;
  $("#etpDetails").textContent=`${navigation.etp.waypoint.ident} · ${formatTime(navigation.etp.elapsedHr)} · ${formatFuel(navigation.etp.fuelRemainingGal,1)}`;
  const pnrExtra=Number.isFinite(navigation.pnr.rawDistanceNm)?Math.max(0,navigation.pnr.rawDistanceNm-plan.distanceNm):null;
  $("#pnrDistance").textContent=navigation.pnr.status==="UNAVAILABLE"?"—":navigation.pnr.beyondDestination?`DEST + ${number(pnrExtra)} NM`:`${number(navigation.pnr.distanceNm)} NM`;
  $("#pnrDetails").textContent=navigation.pnr.status==="UNAVAILABLE"?(state.language==="pt-BR"?"Combustível insuficiente para retorno":"Insufficient fuel for return"):navigation.pnr.beyondDestination?t("beyondDestination"):`${navigation.pnr.waypoint.ident} · ${formatTime(navigation.pnr.elapsedHr)} · ${formatFuel(navigation.pnr.fuelRemainingGal,1)}`;
  $("#outboundGs").textContent=`${Math.round(navigation.outboundGsKt)} kt`;
  $("#returnGs").textContent=`${Math.round(navigation.returnGsKt)} kt`;
  $("#etpScaleMarker").style.left=`${navigation.etp.fraction*100}%`;
  $("#pnrScaleMarker").hidden=navigation.pnr.fraction===null;
  if(navigation.pnr.fraction!==null)$("#pnrScaleMarker").style.left=`${navigation.pnr.fraction*100}%`;

  renderStepComparison(stepPlan);

  const waypointSelect=$("#manualWaypoint"),currentWaypointValue=String(state.manual.waypointIndex);
  waypointSelect.innerHTML=plan.waypoints.map((waypoint,index)=>`<option value="${index}">${escapeHtml(waypoint.ident)} · ${number(waypoint.distanceNm)} NM</option>`).join("");
  waypointSelect.value=currentWaypointValue;
  $("#manualAltitude").innerHTML=ALTITUDES_FT.map((altitude)=>`<option value="${altitude}">FL${altitude/100}</option>`).join("");
  $("#manualAltitude").value=String(state.manual.altitudeFt||selected.altitudeFt);
  if(document.activeElement!==$("#manualFuel"))$("#manualFuel").value=number(fuelValue(state.manual.active?state.manual.fuelRemainingGal:state.fuelOnboardGal),1).replace(/[^0-9,.-]/g,"").replace(",",".");
  $("#manualFuelUnit").textContent=fuelLabel();
  $("#observedFuelFlowUnit").textContent=state.fuelUnit==="l"?"L/h":"gal/h";
  const factors=state.calibration,reference=factors.reference;
  const calibrationState=!reference?t("noCalibration"):reference.legacy?t("calibrationPending")
    :calibrationForMode(factors,candidate.engineMode,selected.altitudeFt,candidate.powerSetting).applicable?t("calibrationActive"):t("calibrationStored");
  $("#calibrationStatus").textContent=calibrationState;
  $("#calibrationFactors").textContent=reference?`K1 ${number(factors.tasFactor,3)} · K2 ${number(factors.fuelFlowFactor,3)}`:"—";
  $("#calibrationReference").textContent=reference&&!reference.legacy?`FL${Math.round(reference.altitudeFt/100)} · ${number(reference.mapInHg,1)}″ · ${number(reference.rpm)} RPM`:"";
  updateCalibrationGate();
  renderRemainingAssessment();
}

function renderRemainingAssessment(){
  const panel=$("#remainingAssessment");
  panel.hidden=!state.manual.active;
  if(panel.hidden)return;
  const assessment=calculateRemainingFlightAssessment({...state,oxygenWeightLb:currentOxygenWeightLb()});
  panel.dataset.status=assessment.status;
  $("#remainingStatus").textContent=t(assessment.status==="viable"?"remainingFuelViable":assessment.status==="marginal"?"remainingFuelMarginal":assessment.status==="not-viable"?"remainingFuelUnavailable":"remainingUnknown");
  $("#remainingDistance").textContent=Number.isFinite(assessment.remainingDistanceNm)?t("remainingDistance",number(assessment.remainingDistanceNm),Math.round(state.manual.altitudeFt/100)):"—";
  $("#remainingRequired").textContent=Number.isFinite(assessment.requiredFuelGal)?t("remainingRequired",formatFuel(assessment.requiredFuelGal,1)):"—";
  $("#remainingMargin").textContent=Number.isFinite(assessment.marginGal)?t("remainingMargin",signedNumber(fuelValue(assessment.marginGal),1,` ${fuelLabel()}`)):"—";
}

function statusLabel(status) {
  if(status==="viable") return t("viable");
  if(status==="marginal") return t("marginalStatus");
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

let currentGlideCorridor=null;
function centerGlideRoutePoint() {
  const route=$("#glideRoute"),active=route.querySelector('[aria-pressed="true"]');
  if(!route.clientWidth||!active) return;
  route.scrollTo({left:Math.max(0,active.offsetLeft-(route.clientWidth-active.clientWidth)/2),behavior:"smooth"});
}

function renderGlideFocus(glide) {
  const index=state.glideSampleIndex,sample=glide.samples[index];
  if(!sample) return;
  const ident=String(sample.ident||sample.icao||`${t("glidePoint")} ${index+1}`);
  $("#glideFocusHint").textContent=`${ident} ${t("glideInFocus")} · ${index+1}/${glide.samples.length}`;
  $("#glideFocusPoint").textContent=`${ident} · ${t("glideRange")}`;
  $("#glideFocusRange").textContent=`${number(sample.stillAirRangeNm,1)} NM`;
  $("#glideFocusMeta").textContent=`${number(glide.bestGlideKias)} KIAS · ${number(sample.glideMinutes)} min`;
  $("#glideFocusForward").textContent=`${number(sample.forwardRangeNm,1)} NM`;
  $("#glideFocusReverse").textContent=`${number(sample.reverseRangeNm,1)} NM`;
  $("#glideFocusAltitude").textContent=`${number(sample.altitudeFt)} ft`;
  $$("#glideRoute [data-glide-index]").forEach((button)=>button.setAttribute("aria-pressed",String(Number(button.dataset.glideIndex)===index)));
}

function renderGlideCorridor(plan,glide) {
  currentGlideCorridor=glide;
  $("#glideRatio").textContent=`${number(glide.ratio,2)}:1`;
  $("#bestGlide").textContent=`${number(glide.bestGlideKias)} KIAS`;
  $("#glideRange").textContent=`${number(glide.cruiseRangeNm,1)} NM`;
  $("#glideTime").textContent=`${number(glide.cruiseMinutes)} min`;
  if(!glide.samples.length) return;
  if(!Number.isInteger(state.glideSampleIndex)||state.glideSampleIndex<0||state.glideSampleIndex>=glide.samples.length){
    const maxRange=Math.max(...glide.samples.map((sample)=>sample.stillAirRangeNm));
    const midpoint=plan.distanceNm/2;
    const candidates=glide.samples.map((sample,index)=>({sample,index})).filter(({sample})=>sample.stillAirRangeNm>=maxRange-.05);
    state.glideSampleIndex=candidates.reduce((best,{sample,index})=>Math.abs(sample.distanceNm-midpoint)<Math.abs(glide.samples[best].distanceNm-midpoint)?index:best,candidates[0].index);
  }
  $("#glideRoute").setAttribute("aria-label",t("glidePoint"));
  $("#glideRoute").innerHTML=glide.samples.map((sample,index)=>{
    const ident=String(sample.ident||sample.icao||`${t("glidePoint")} ${index+1}`);
    return `<button class="glide-route-point" type="button" data-glide-index="${index}" aria-pressed="false" aria-label="${escapeHtml(ident)} · ${number(sample.distanceNm)} NM · ${number(sample.stillAirRangeNm,1)} NM"><span>${escapeHtml(ident)}</span><small>${number(sample.stillAirRangeNm,1)} NM</small></button>`;
  }).join("");
  renderGlideFocus(glide);
  centerGlideRoutePoint();
}

function missionStatusLabel(status){return status==="unknown"?(state.language==="pt-BR"?"NÃO AVALIADO":"UNASSESSED"):t(status==="not-viable"?"notViable":status==="viable"?"viable":"marginalStatus");}
function rideLabel(status){return status==="unknown"?t("weatherLimited"):t(status);}
function rideScoreLabel(turbulence){return turbulence.riskScore===null?"—":number(turbulence.riskScore);}
function oxygenLabel(status){return t(status==="not-required"?"oxygenNotRequired":status==="compliant"?"oxygenCompliant":status==="marginal"?"oxygenMarginal":"oxygenInsufficient");}
function weightBalanceLabel(status){return t(status==="viable"?"viable":status==="marginal"?"marginalStatus":"notViable");}

function missionReasonLabel(reason,result) {
  const pt=state.language==="pt-BR";
  if(reason.code==="weight-balance") return reason.blocking?(pt?"Peso ou CG fora do envelope":"Weight or CG outside envelope"):(pt?"Margem de peso/CG reduzida":"Reduced weight/CG margin");
  if(reason.code==="fuel") return reason.blocking?`${pt?"Combustível insuficiente":"Insufficient fuel"} · ${signedNumber(fuelValue(result.feasibility.fuelMarginGal),1,` ${fuelLabel()}`)}`:`${pt?"Margem de combustível reduzida":"Reduced fuel margin"} · ${formatFuel(result.feasibility.fuelMarginGal,1)}`;
  if(reason.code==="flight-profile") return reason.blocking?(pt?"Perfil vertical incompatível":"Vertical profile unavailable"):(pt?"Cruzeiro muito curto":"Cruise segment too short");
  if(reason.code==="performance") return pt?"Margem de performance reduzida":"Reduced performance margin";
  if(reason.code==="icing") return `${pt?"Índice de gelo":"Icing index"} · ${number(result.icing.riskScore)}/100`;
  if(reason.code==="turbulence") return `${pt?"Turbulência":"Turbulence"} · ${rideLabel(result.turbulence.status)}`;
  if(reason.code==="oxygen") return reason.blocking?(pt?"Oxigênio insuficiente":"Insufficient oxygen"):(pt?"Oxigênio com pouca margem":"Low oxygen margin");
  if(reason.code==="alternate") return Number.isFinite(reason.detail)?`${pt?"Alternado com pouca margem":"Low alternate margin"} · ${formatFuel(reason.detail,1)} / ${formatFuel(PERFORMANCE.diversion.marginalFuelMarginGal,0)}`:(pt?"Alternado sem margem calculável":"Alternate margin unavailable");
  if(reason.code==="financial") return `${pt?"Eficiência financeira":"Financial efficiency"} · ${number(reason.detail.efficiencyScore)}/100`;
  if(reason.code==="efficiency") return pt?"Eficiência da missão":"Mission efficiency";
  return pt?"Evidência meteorológica limitada":"Limited weather evidence";
}

function missionPositiveReasons(result,excluded) {
  const pt=state.language==="pt-BR",items=[];
  if(!excluded.has("fuel")&&result.feasibility.fuelMarginGal>=0) items.push({code:"fuel",label:`${pt?"Combustível suficiente":"Fuel sufficient"} · ${formatFuel(result.feasibility.fuelMarginGal,1)}`,status:"ok"});
  if(!excluded.has("weight-balance")&&result.weightBalance?.status==="viable") items.push({code:"weight-balance",label:pt?"Peso e CG dentro do envelope":"Weight and CG within envelope",status:"ok"});
  if(!excluded.has("icing")&&result.icing.status==="low"&&result.icing.confidence!=="limited") items.push({code:"icing",label:pt?"Sem indicação relevante de gelo":"No relevant icing indication",status:"ok"});
  if(!excluded.has("oxygen")&&["compliant","not-required"].includes(result.oxygen.status)) items.push({code:"oxygen",label:pt?"Oxigênio adequado":"Oxygen adequate",status:"ok"});
  if(!excluded.has("financial")&&result.financial?.assessed) items.push({code:"financial",label:`${pt?"Eficiência financeira":"Financial efficiency"} · ${number(result.financial.efficiencyScore)}/100`,status:"ok"});
  return items;
}

function missionReasonIcon(code,status) {
  if(status==="critical") return "circle-x";
  if(status==="ok") return "circle-check";
  return ({fuel:"fuel","weight-balance":"scale","flight-profile":"area-chart",icing:"snowflake",turbulence:"waves",oxygen:"heart-pulse",alternate:"map-pinned",financial:"dollar-sign",efficiency:"gauge"})[code]||"triangle-alert";
}

function weatherDiagnosticText(mission) {
  const pt=state.language==="pt-BR";
  const coverage=mission?.weatherCoverage;
  const parts=[];
  const missing=coverage?.iceMissingReasons || {};
  for(const [reason,count] of Object.entries(missing).sort((a,b)=>b[1]-a[1]).slice(0,2)){
    parts.push(`${weatherMissingLabel(reason,pt)} (${count})`);
  }
  if(mission?.diagnosticReasons?.includes("ALTERNATE_ICE_NOT_ASSESSED"))parts.push(pt?"Alternado sem dados ICE suficientes":"Alternate icing evidence insufficient");
  if(mission?.diagnosticReasons?.includes("ICE_SIGMET_VERTICAL_LIMIT_UNKNOWN"))parts.push(pt?"SIGMET sem limites verticais":"SIGMET vertical limits missing");
  if(mission?.diagnosticReasons?.includes("RIDE_EVIDENCE_LIMITED"))parts.push(pt?"RIDE sem dados suficientes":"RIDE evidence insufficient");
  if(mission?.diagnosticReasons?.includes("ALTERNATE_DISTANCE_UNKNOWN"))parts.push(pt?"Distância do alternado desconhecida":"Alternate distance unknown");
  const sources=coverage?.sources;
  const gfsStatus=sources?.OPEN_METEO?.status;
  const awcStatus=sources?.AWC?.status;
  const gfsLabel=gfsStatus==="available"?(pt?"GFS: recebido":"GFS: received")
    :gfsStatus==="stale"?(pt?"GFS: vencido":"GFS: stale"):(pt?"GFS: indisponível":"GFS: unavailable");
  const awcLabel=awcStatus==="available"?(pt?"AWC: atual":"AWC: current")
    :awcStatus==="stale"?(pt?"AWC: vencido":"AWC: stale"):(pt?"AWC: indisponível":"AWC: unavailable");
  const status=sources?[gfsLabel,awcLabel].join(" · "):"";
  const coverageLabel=Number.isFinite(coverage?.ice)?`ICE ${Math.round(coverage.ice*100)}%`:"";
  return [parts.join(" · ") || (pt?"Evidência meteorológica insuficiente":"Insufficient weather evidence"),coverageLabel,status].filter(Boolean).join(" · ");
}

function missionAction(score) {
  const pt=state.language==="pt-BR",code=score.reasons.find((reason)=>reason.blocking||reason.impact>=4)?.code;
  if(score.status==="unknown") return pt?"Dados insuficientes para confirmar as condições meteorológicas.":"Insufficient data to confirm weather conditions.";
  if(code==="weight-balance") return pt?"Reduza ou redistribua a carga.":"Reduce or redistribute the load.";
  if(code==="fuel") return pt?"Aumente o combustível ou reduza a reserva/carga.":"Add fuel or reduce reserve/load.";
  if(code==="flight-profile") return pt?"Selecione um nível mais baixo.":"Select a lower flight level.";
  if(code==="oxygen") return pt?"Adicione a capacidade de O₂ recomendada.":"Add the recommended O₂ capacity.";
  if(code==="icing") return pt?"ICE · atenção. Compare os níveis avaliados.":"ICE · caution. Compare assessed levels.";
  if(code==="turbulence") return pt?"RIDE · atenção. Compare os níveis avaliados.":"RIDE · caution. Compare assessed levels.";
  if(code==="alternate") return pt?"Aumente a margem para o alternado.":"Increase the alternate margin.";
  if(code==="financial") return pt?"Considere a configuração de menor custo.":"Consider the lowest-cost configuration.";
  if(code==="efficiency") return pt?"Avalie o consumo e o tempo da proposta.":"Review the proposal's fuel and time.";
  return pt?"SEM AJUSTE":"NO ADJUSTMENT";
}

function renderMissionScore(result,score,mission=null,candidate=null) {
  const color=score.status==="viable"?"var(--green)":score.status==="marginal"?"var(--orange)":score.status==="unknown"?"var(--blue)":"var(--red)";
  $("#missionScoreLevel").textContent=score.status==="unknown"?`FL${result.fl} · ${state.language==="pt-BR"?"DIAGNÓSTICO":"DIAGNOSTIC"}`:`FL${result.fl}`;
  $("#missionScoreMode").textContent=candidate?.mode||state.mode;
  $("#missionScoreValue").textContent=score.partial?"—":score.score;
  $("#missionScoreStatus").textContent=missionStatusLabel(score.status);
  $("#missionScoreStatus").dataset.status=score.status;
  const dial=$("#missionScoreDial");
  dial.style.setProperty("--score",score.partial?0:score.score);
  dial.style.setProperty("--score-color",color);
  dial.setAttribute("aria-label",score.partial?`${t("missionScore")} · ${t("weatherLimited")}`:`${t("missionScore")} ${score.score} ${state.language==="pt-BR"?"de":"of"} 100`);
  const primary=score.reasons.find((reason)=>reason.blocking||reason.impact>=4);
  const unknownSummary=result.icing.compatibility==="UNKNOWN"
    ? (state.language==="pt-BR"?"ICE · sem cobertura suficiente":"ICE · insufficient coverage")
    : ["limited","unknown"].includes(result.turbulence.confidence)
      ? (state.language==="pt-BR"?"RIDE · sem cobertura suficiente":"RIDE · insufficient coverage")
      : (state.language==="pt-BR"?"Dados da missão insuficientes":"Insufficient mission data");
  $("#missionScoreSummary").textContent=score.status==="unknown"?unknownSummary:primary?missionReasonLabel(primary,result):"";
  $("#missionScoreSummary").hidden=!$("#missionScoreSummary").textContent;
  const negatives=score.reasons.filter((reason)=>reason.impact>=4||reason.code==="financial").slice(0,3).map((reason)=>({
    code:reason.code,
    label:missionReasonLabel(reason,result),
    status:reason.blocking?"critical":"penalty",
    value:reason.blocking?t("critical"):`−${reason.impact}`,
  }));
  const excluded=new Set(negatives.map((item)=>item.code));
  const items=[...negatives,...missionPositiveReasons(result,excluded)].slice(0,3);
  $("#missionScoreReasons").innerHTML=items.map((item)=>`<div class="${item.status}">${iconMarkup(missionReasonIcon(item.code,item.status),"reason-icon")}<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value||"OK")}</strong></div>`).join("");
  $("#missionScoreAction").textContent=score.status==="unknown"&&mission?weatherDiagnosticText(mission):missionAction(score);
}

function renderMissionStrip(result,missionScore) {
  $("#missionRiskValue").textContent=missionScore.partial?"—":`${missionScore.score}/100`;
  $("#missionRiskStatus").textContent=missionStatusLabel(missionScore.status);
  $("#missionRiskValue").dataset.status=missionScore.status;
  const iceAssessed=result.icing.compatibility!=="UNKNOWN";
  $("#cruiseIcingValue").textContent=iceAssessed?`${number(result.icing.riskScore)}/100`:"—";
  $("#cruiseIcingValue").setAttribute("aria-label",iceAssessed?`${t("iceProbabilityAria")}: ${number(result.icing.riskScore)} / 100`:t("icingLimited"));
  $("#cruiseIcingMeta").textContent=`FL${result.fl} · ${t(result.icing.confidence==="weather"?"icingWeather":result.icing.confidence==="estimated"?"weatherEstimated":"icingLimited")}`;
  $("#rideValue").textContent=rideLabel(result.turbulence.status);
  $("#rideMeta").textContent=result.turbulence.riskScore===null?t("weatherLimited"):`${rideScoreLabel(result.turbulence)}/100`;
  $("#oxygenValue").textContent=oxygenLabel(result.oxygen.status);
  $("#oxygenMeta").textContent=result.oxygen.requiredLiters>0?`${number(result.oxygen.requiredLiters)} L · ${formatWeight(result.oxygen.bottleWeightLb)}`:`FL${result.fl}`;
}

function renderOxygenPlanner(analysis) {
  const altitudeSelect=$("#oxygenAltitude");
  if(!altitudeSelect.options.length) altitudeSelect.innerHTML=ALTITUDES_FT.map((altitude)=>`<option value="${altitude}">FL${altitude/100}</option>`).join("");
  altitudeSelect.value=String(analysis.winners.overall.altitudeFt);
  altitudeSelect.disabled=true;
  const bottleSelect=$("#oxygenBottle");
  if(!bottleSelect.options.length) bottleSelect.innerHTML=Object.values(OXYGEN_CYLINDERS).map((item)=>`<option value="${item.label}">${item.label} · ${item.capacityLiters} L · ${formatWeight(item.fullWeightLb)}</option>`).join("");
  bottleSelect.value=state.oxygen.bottleModel;
  $("#oxygenBottleCount").value=String(state.oxygen.bottles);
  $$('[data-oxygen-seat]').forEach((input)=>{input.checked=state.oxygen.seats[Number(input.dataset.oxygenSeat)];});
  const target=analysis.winners.overall;
  const oxygen=calculateOxygenPlan({result:target,oxygen:state.oxygen});
  $("#oxygenRequired").textContent=`${number(oxygen.requiredLiters)} L`;
  $("#oxygenInstalled").textContent=`${number(oxygen.installedLiters)} L`;
  $("#oxygenEndurance").textContent=Number.isFinite(oxygen.enduranceMinutes)?`${number(oxygen.enduranceMinutes)} min`:"—";
  $("#oxygenWeight").textContent=formatWeight(oxygen.bottleWeightLb);
  const pill=$("#oxygenStatus"); pill.textContent=oxygenLabel(oxygen.status); pill.className=`status-pill oxygen-${oxygen.status}`;
  const equipment=oxygen.maskRequired?t("maskRequired"):t("cannula");
  $("#oxygenRecommendation").textContent=oxygen.recommendedBottles===null?t("oxygenNoSolution"):oxygen.recommendedBottles?`${oxygen.recommendedBottles} × ${oxygen.recommendedBottleModel} · ${formatWeight(oxygen.recommendedWeightLb)} · ${equipment}`:`FL${target.fl} · ${t("oxygenNotRequired")}`;
  $("#applyOxygenRecommendation").disabled=oxygen.recommendedBottles===null||(oxygen.recommendedBottles===oxygen.bottles&&oxygen.recommendedBottleModel===oxygen.bottleModel);
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
  $("#wbMargins").textContent=`${state.language==="pt-BR"?"ATUAL":"CURRENT"} · FWD ${number(weightBalance.takeoff.forwardMarginIn,2)} · AFT ${number(weightBalance.takeoff.aftMarginIn,2)} in`;
  $("#wbEnvelopeLegend").textContent=`${number(weightBalance.envelope.forwardCgIn)}–${number(weightBalance.envelope.aftCgIn)} in · ${formatWeight(weightBalance.envelope.maximumWeightLb)}`;

  const env=weightBalance.envelope;
  const phases=[
    {key:"zfw",label:t("zeroFuel"),point:weightBalance.zeroFuel},
    {key:"takeoff",label:t("takeoff"),point:weightBalance.takeoff},
    {key:"landing",label:t("landing"),point:weightBalance.landing},
  ];
  const minCg=Math.min(env.forwardCgIn-.7,...phases.map(({point})=>point.cgIn-.35));
  const maxCg=Math.max(env.aftCgIn+.7,...phases.map(({point})=>point.cgIn+.35));
  const position=(cg)=>clamp((cg-minCg)/(maxCg-minCg)*100,0,100);
  const safeStart=position(env.forwardCgIn),safeWidth=position(env.aftCgIn)-safeStart;
  $("#cgChart").innerHTML=`<div class="cg-phase-list" role="group" aria-label="${escapeHtml(t("cgEnvelope"))}">${phases.map(({key,label,point})=>{
    const outside=point.cgIn<env.forwardCgIn||point.cgIn>env.aftCgIn||point.weightLb>env.maximumWeightLb;
    const closeToLimit=!outside&&key!=="zfw"&&(Math.min(point.forwardMarginIn,point.aftMarginIn)<env.marginalCgIn||point.weightMarginLb<env.marginalWeightLb);
    const phaseStatus=outside?"notViable":closeToLimit?"marginalStatus":"viable";
    const summary=`${label}: CG ${number(point.cgIn,2)} in; ${formatWeight(point.weightLb)}; ${t(phaseStatus)}`;
    return `<div class="cg-phase-row ${key} ${outside?"outside":closeToLimit?"marginal":""}" role="img" aria-label="${escapeHtml(summary)}"><div class="cg-phase-heading"><span>${escapeHtml(label)}</span><strong>${number(point.cgIn,2)} in</strong><span class="cg-phase-weight">${formatWeight(point.weightLb)}</span></div><div class="cg-phase-track" style="--cg-safe-start:${safeStart.toFixed(2)}%;--cg-safe-width:${safeWidth.toFixed(2)}%;--cg-at:${position(point.cgIn).toFixed(2)}%"><span class="cg-phase-safe"></span><i class="cg-phase-marker"></i></div>${outside||closeToLimit?`<small class="cg-phase-warning">${escapeHtml(t(phaseStatus))}</small>`:""}</div>`;
  }).join("")}<div class="cg-phase-axis"><span>${number(env.forwardCgIn)} in · ${escapeHtml(t("cgForward"))}</span><span>${number(env.aftCgIn)} in · ${escapeHtml(t("cgAft"))}</span></div></div>`;
  const stationLabels={empty:t("emptyAircraft"),pilot:t("pilot"),copilot:t("copilot"),rearLeft:t("rearLeft"),rearCenter:t("rearCenter"),rearRight:t("rearRight"),baggage:t("baggage"),oxygen:t("oxygen"),headerFuel:t("headerFuel"),mainFuel:t("mainFuel")};
  const stationIcon=(key)=>key==="empty"?"plane":key==="baggage"?"luggage":key==="oxygen"?"cylinder":key.includes("Fuel")?"fuel":"user-round";
  $("#wbStationRows").innerHTML=weightBalance.takeoff.stations.filter((item)=>item.weightLb>0).map((item)=>`<div><b>${iconMarkup(stationIcon(item.key))}${escapeHtml(stationLabels[item.key]||item.key)}</b><span>${formatWeight(item.weightLb)}</span><span>${number(item.armIn,1)} in</span><strong>${number(item.momentInLb,0)}</strong></div>`).join("");
}

function renderRideOptimizer(mission,selected) {
  const pt=state.language==="pt-BR",ride=selected.turbulence,score=Number.isFinite(ride.riskScore)?clamp(Math.round(ride.riskScore),0,100):null;
  const source=ride.confidence==="weather"?t("icingWeather"):ride.confidence==="simbrief"?t("simbriefShear"):ride.confidence==="estimated"?t("weatherEstimated"):t("weatherLimited");
  const exposureLabel=(minutes)=>minutes>0&&minutes<1?"<1 min":`${number(minutes||0,0)} min`;
  $("#rideModuleLevel").textContent=`RIDE · FL${selected.fl}`;
  $("#rideModuleIndex").textContent=score===null?"—":number(score);
  $("#rideModuleStatus").textContent=rideLabel(ride.status);
  $("#rideModuleStatus").className=`ride-${ride.status}`;
  $("#rideModuleConfidence").textContent=source;
  $("#rideIndexTrack").setAttribute("aria-valuenow",String(score||0));
  $("#rideIndexFill").style.width=`${score||0}%`;
  $("#rideIndexMarker").style.left=`${score||0}%`;

  const preferenceCopy={standard:{pt:"Padrão",en:"Standard",notePt:"Equilibra conforto, combustível e tempo",noteEn:"Balances comfort, fuel, and time"},comfort:{pt:"Conforto",en:"Comfort",notePt:"Aumenta o peso do RIDE na recomendação",noteEn:"Gives RIDE more weight in the recommendation"},maximum:{pt:"Máx. conforto",en:"Max comfort",notePt:"Prioriza o menor RIDE entre os níveis viáveis",noteEn:"Prioritizes the lowest RIDE among viable levels"}};
  $$('[data-ride-preference]').forEach((button)=>{const copy=preferenceCopy[button.dataset.ridePreference];button.textContent=pt?copy.pt:copy.en;button.classList.toggle("active",button.dataset.ridePreference===state.ridePreference);button.setAttribute("aria-pressed",String(button.dataset.ridePreference===state.ridePreference));});
  $("#ridePreferenceLabel").textContent=pt?"PREFERÊNCIA DE CONFORTO":"COMFORT PREFERENCE";
  $("#ridePreferenceNote").textContent=pt?preferenceCopy[state.ridePreference].notePt:preferenceCopy[state.ridePreference].noteEn;
  const recommendation=mission.status==="unknown"?null:mission.candidates.find((candidate)=>candidate.altitudeFt===mission.comfortAltitudeFt)?.result;
  $("#rideRecommendationLabel").textContent=pt?"MELHOR CONFORTO":"BEST COMFORT";
  $("#rideRecommendationLevel").textContent=recommendation?`FL${recommendation.fl}`:"—";
  const fuelDelta=recommendation?recommendation.fuelRequiredGal-selected.fuelRequiredGal:0,timeDelta=recommendation?(recommendation.tripTimeHr-selected.tripTimeHr)*60:0;
  $("#rideRecommendationMeta").textContent=recommendation?`RIDE ${rideScoreLabel(recommendation.turbulence)}/100 · ${signedNumber(fuelValue(fuelDelta),1,` ${fuelLabel()}`)} · ${signedNumber(timeDelta,0," min")}`:t("rankingNoAvailable");


  const segments=ride.segments||[],threshold=PERFORMANCE.turbulence.lightScore;
  const peakIndex=segments.reduce((best,segment,index)=>(segment.riskScore??-1)>(segments[best]?.riskScore??-1)?index:best,0);
  let start=peakIndex,end=peakIndex;
  if((segments[peakIndex]?.riskScore??-1)>=threshold){while(start>0&&(segments[start-1]?.riskScore??-1)>=threshold)start-=1;while(end<segments.length-1&&(segments[end+1]?.riskScore??-1)>=threshold)end+=1;}
  const critical=(segments[peakIndex]?.riskScore??-1)>=threshold?segments.slice(start,end+1):[];
  const first=critical[0],last=critical.at(-1);
  $("#rideCriticalLabel").textContent=pt?"TRECHO CRÍTICO":"CRITICAL LEG";
  $("#rideCriticalLeg").textContent=first?`${first.from} → ${last?.to||first.to}`:(pt?"SEM TRECHO":"NO LEG");
  $("#rideCriticalMeta").textContent=first?`${number(first.startNm,0)}–${number(last?.endNm??first.endNm,0)} NM · ${exposureLabel(critical.reduce((sum,item)=>sum+(item.exposureMinutes||0),0))}`:(pt?"abaixo do limite":"below threshold");
  const terminalMarkup=(terminal)=>terminal&&Number.isFinite(terminal.riskScore)?`${number(terminal.riskScore)}/100`:"—";
  $("#rideDestinationLabel").textContent=pt?"DESTINO":"DESTINATION";
  $("#rideDestinationRisk").textContent=terminalMarkup(ride.destination);
  $("#rideDestinationMeta").textContent=ride.destination?`${exposureLabel(ride.destination.exposureMinutes)} · ${rideLabel(ride.destination.status)}`:"—";
  $("#rideAlternateLabel").textContent=pt?"ALTERNADO":"ALTERNATE";
  $("#rideAlternateRisk").textContent=ride.alternate?`${ride.alternate.ident} · ${terminalMarkup(ride.alternate)}`:"—";
  $("#rideAlternateMeta").textContent=ride.alternate?`${exposureLabel(ride.alternate.exposureMinutes)} · ${rideLabel(ride.alternate.status)}`:(pt?"não informado":"not filed");
  $("#rideTropopauseLabel").textContent=pt?"TROPOPAUSA":"TROPOPAUSE";
  $("#rideTropopause").textContent=Number.isFinite(ride.tropopauseFt)?`FL${Math.round(ride.tropopauseFt/100)}`:"—";
  $("#rideTropopauseMeta").textContent=Number.isFinite(ride.tropopauseFt)?`${signedNumber(ride.tropopauseFt-selected.altitudeFt,0," ft")}`:(pt?"sem dados":"no data");

  $("#rideRouteLabel").textContent=pt?"EXPOSIÇÃO NA ROTA":"ROUTE EXPOSURE";
  $("#rideRouteTitle").textContent=pt?"Fluxo por trecho":"Flow by leg";
  $("#rideRouteExposure").textContent=`${exposureLabel(ride.exposureMinutes)} · ${number(state.plan.distanceNm,0)} NM`;
  $("#rideRouteLabels").innerHTML=segments.length?`<span>${escapeHtml(segments[0].from||state.plan.origin.icao)}</span>${segments.map((segment)=>`<span>${escapeHtml(segment.to||"—")}</span>`).join("")}`:"";
  $("#rideRouteBand").innerHTML=segments.map((segment,index)=>`<button type="button" class="${segment.status}" data-ride-segment="${index}" aria-label="${escapeHtml(segment.from)} → ${escapeHtml(segment.to)}, RIDE ${segment.riskScore??"—"}"><strong>${segment.riskScore??"—"}</strong><small>${Number.isFinite(segment.windSpeedKt)?`${number(segment.windSpeedKt)} kt`:"—"}</small></button>`).join("");
  const renderSegment=(index)=>{const segment=segments[index];if(!segment){$("#rideRouteFocus").innerHTML=`<span>${escapeHtml(t("weatherLimited"))}</span>`;return;}$$('[data-ride-segment]').forEach((button)=>button.classList.toggle("active",Number(button.dataset.rideSegment)===index));$("#rideRouteFocus").innerHTML=`<div><span>${pt?"TRECHO":"LEG"}</span><strong>${escapeHtml(segment.from)} → ${escapeHtml(segment.to)}</strong></div><div><span>RIDE</span><strong>${segment.riskScore??"—"}${segment.riskScore===null?"":"/100"}</strong></div><div><span>${pt?"GRADIENTE":"GRADIENT"}</span><strong>${number(Math.max(segment.verticalShear||0,segment.horizontalShear||0),1)} kt</strong></div><div><span>${pt?"VENTO":"WIND"}</span><strong>${Number.isFinite(segment.windSpeedKt)?`${number(segment.windSpeedKt)} kt`:"—"}</strong></div><div><span>${pt?"EXPOSIÇÃO":"EXPOSURE"}</span><strong>${exposureLabel(segment.exposureMinutes)}</strong></div>`;};
  renderSegment(peakIndex);
  $$('[data-ride-segment]').forEach((button)=>button.addEventListener("click",()=>renderSegment(Number(button.dataset.rideSegment))));

  $("#rideExposureLabel").textContent=pt?"EXPOSIÇÃO":"EXPOSURE";$("#ridePhasesLabel").textContent=pt?"Fases do voo":"Flight phases";$("#rideExposureTotal").textContent=exposureLabel(ride.exposureMinutes);
  const phases=[{label:pt?"SUBIDA":"CLIMB",minutes:ride.phaseExposureMinutes?.climb||0},{label:pt?"CRUZEIRO":"CRUISE",minutes:ride.phaseExposureMinutes?.cruise||0},{label:pt?"DESCIDA":"DESCENT",minutes:ride.phaseExposureMinutes?.descent||0}],maxPhase=Math.max(1,...phases.map((phase)=>phase.minutes));
  $("#ridePhaseList").innerHTML=phases.map((phase)=>`<div><span>${phase.label}</span><div><i style="width:${phase.minutes/maxPhase*100}%"></i></div><strong>${exposureLabel(phase.minutes)}</strong></div>`).join("");
  const coverage=Math.round((ride.coverage||0)*100),shearCount=segments.filter((segment)=>Number.isFinite(segment.simbriefShear)).length,windCount=segments.filter((segment)=>Number.isFinite(segment.windSpeedKt)).length;
  $("#rideEvidenceLabel").textContent=pt?"EVIDÊNCIA METEO":"WEATHER EVIDENCE";$("#rideEvidenceCoverage").textContent=`${coverage}%`;
  $("#rideEvidenceList").innerHTML=`<div><span>SHEAR NAVLOG</span><strong>${shearCount}/${segments.length||0} ${pt?"trechos":"legs"}</strong></div><div><span>${iconMarkup("wind")}${pt?"VENTOS POR FL":"WINDS BY FL"}</span><strong>${windCount}/${segments.length||0} ${pt?"trechos":"legs"}</strong></div><div><span>${pt?"GRADIENTE VERTICAL":"VERTICAL GRADIENT"}</span><strong>${number(ride.maximumVerticalShear||0,1)} kt/1.000 ft</strong></div><div><span>${pt?"GRADIENTE HORIZONTAL":"HORIZONTAL GRADIENT"}</span><strong>${number(ride.maximumHorizontalShear||0,1)} kt/150 NM</strong></div><div><span>SIGMET / CB</span><strong>${ride.unboundedAdvisory?(pt?"sem limite vertical":"no vertical bounds"):(pt?"sem interseção":"no intersection")}</strong></div><div><span>${pt?"FONTE":"SOURCE"}</span><strong>SIMBRIEF OFP · ${source}</strong></div>`;

  $$('[data-ride-preference]').forEach((button)=>button.addEventListener("click",()=>{invalidateDecision(false);state.ridePreference=button.dataset.ridePreference;localStorage.setItem("velocityxl.ridePreference",state.ridePreference);render();}));
}

function renderFinancialCard(financial) {
  const pt=state.language==="pt-BR";
  $("#costOrigin").textContent=state.plan.origin.icao;
  $("#fuelPriceCurrency").value=state.financial.currency;
  $("#fuelPriceSymbol").textContent=currencySymbol();
  if(document.activeElement!==$("#fuelPricePerLiter")) $("#fuelPricePerLiter").value=financial.pricePerLiter>0?financial.pricePerLiter.toFixed(2):"";
  $("#costUnassessed").hidden=financial.assessed;
  $("#costContent").hidden=!financial.assessed;
  if(!financial.assessed)return;
  $("#estimatedFlightCost").textContent=formatMoney(financial.cost);
  $("#costFuelBasis").textContent=`${formatFuel(financial.consumedGal,1)} · ${financial.mode} · FL${financial.fl}`;
  $("#financialEfficiency").textContent=`${number(financial.efficiencyScore)}/100`;
  $("#financialPenalty").textContent=state.manual.active&&state.preflightSnapshot?.missionScore
    ? (pt?"Score pré-voo preservado":"Preflight score preserved")
    : financial.penalty?`−${financial.penalty} ${pt?"no score":"from score"}`:(pt?"Sem impacto no score":"No score impact");
  const alternate=$("#costAlternate"),alternateData=financial.alternate;
  alternate.hidden=!alternateData;
  if(alternateData){
    $("#costAlternateRoute").textContent=`${state.plan.destination.icao} → ${alternateData.ident} · ${number(alternateData.distanceNm)} NM`;
    $("#costAlternateIncrement").textContent=`+ ${formatMoney(alternateData.cost)}`;
    $("#costAlternatePlanned").textContent=formatMoney(financial.cost);
    $("#costAlternateExtra").textContent=`${formatFuel(alternateData.fuelGal,1)} · ${formatMoney(alternateData.cost)}`;
    $("#costAlternateTotal").textContent=formatMoney(financial.cost+alternateData.cost);
    $("#costAlternateMissed").textContent=formatMoney(alternateData.missedCost);
    $("#costAlternateLeg").textContent=formatMoney(alternateData.legCost);
    $("#costAlternateApproach").textContent=formatMoney(alternateData.approachCost);
  }
  $("#costPerNm").textContent=formatMoney(financial.costPerNm);
  $("#costPerHour").textContent=formatMoney(financial.costPerHour);
  $("#costPerPerson").textContent=formatMoney(financial.costPerPerson);
  $("#requiredFuelValue").textContent=formatMoney(financial.requiredFuelValue);
  $("#costBreakdownTotal").textContent=formatMoney(financial.cost);
  const phaseLabels={taxi:"Taxi",climb:t("climb"),cruise:t("cruise"),descent:t("descent")};
  $("#costPhaseList").innerHTML=Object.entries(financial.phaseCosts).map(([key,value])=>{
    const share=financial.cost>0?value/financial.cost*100:0;
    return `<div><span>${escapeHtml(phaseLabels[key])}</span><div><i style="width:${clamp(share,0,100)}%"></i></div><strong>${escapeHtml(formatMoney(value))}</strong></div>`;
  }).join("");
  const planned=state.manual.active?state.preflightSnapshot?.financial:null;
  const live=$("#costLive");
  live.hidden=!planned?.assessed;
  if(planned?.assessed){
    const delta=financial.cost-planned.cost;
    $("#costLiveValue").textContent=formatMoney(financial.cost);
    $("#costLiveDelta").textContent=`${pt?"Planejado":"Planned"} ${formatMoney(planned.cost)} · ${signedNumber(delta,2,` ${state.financial.currency}`)}`;
  }
}

function render() {
  applyTranslations();
  const hasPlan=Boolean(state.plan);
  $("#plannerContent").hidden=!hasPlan;
  document.querySelector('.no-plan-state').hidden=hasPlan;
  $("#feasibilityBadge").hidden=!hasPlan;
  $("#feasibilityMeta").hidden=!hasPlan;
  if(!hasPlan){$("#routeSource").textContent=t("simbrief");$("#routeTitle").innerHTML=`— <span>→</span> —`;$("#planTimestamp").textContent="—";refreshUiIcons();return;}
  const plan=state.plan,oxygenWeightLb=currentOxygenWeightLb();
  const optimizedMission=optimizedMissionForRender();
  latestOptimizedMission=optimizedMission;
  const activeCandidate=state.appliedChoice?evaluateMissionAlternative(optimizedMission,decisionInput(),state.appliedChoice)
    :optimizedMission.selected||optimizedMission.diagnostic;
  latestActiveCandidate=activeCandidate;
  const activeStatus=activeCandidate.status;
  const hasSolution=Boolean(optimizedMission.selected);
  const selected=activeCandidate.result;
  const analysis={results:optimizedMission.candidates.map((candidate)=>candidate.result),winners:{overall:selected,performance:selected}};
  const navigation=activeCandidate.etpPnr;
  const stepPlan=calculateStepClimbs({...state,oxygenWeightLb,initialAltitudeFt:selected.altitudeFt,manual:state.manual.active?state.manual:null,availableAltitudesFt:analysis.results.filter(operationallyAvailable).map((result)=>result.altitudeFt)});
  const alternateAdvice=activeCandidate.alternate;
  const financial=buildFinancialAnalysis(plan,selected,alternateAdvice,{financial:activeCandidate.financial});
  selected.financial=financial;
  const calculatedMissionScore=activeCandidate.score;
  const missionScore=state.manual.active&&state.preflightSnapshot?.missionScore?state.preflightSnapshot.missionScore:calculatedMissionScore;
  selected.displayMissionScore=missionScore;
  if(!state.manual.active){lastRenderedMissionScore=structuredClone(calculatedMissionScore);lastRenderedFinancial=structuredClone(financial);}
  const glide=activeCandidate.glide;
  $("#routeTitle").innerHTML=`${escapeHtml(plan.origin.icao)} <span>→</span> ${escapeHtml(plan.destination.icao)}`; $("#routeSource").textContent=t("simbrief"); $("#planTimestamp").textContent=`${number(plan.distanceNm)} NM · FL${Math.round(plan.plannedAltitudeFt/100)}`;
  $("#layoutRouteMeta").textContent=`${plan.waypoints.length} ${state.language==="pt-BR"?"pontos":"fixes"} · ${number(plan.distanceNm)} NM`;
  $("#layoutRouteRail").innerHTML=plan.waypoints.map((fix,index)=>`<span title="${escapeHtml(fix.ident||`WPT${index+1}`)}" class="${index===0||index===plan.waypoints.length-1?"viable":"outside-cruise"}"></span>`).join("");
  const feasibility=selected.feasibility,feasibilityBadge=$("#feasibilityBadge"),badgeClass=missionScore.status==="not-viable"?"unavailable":missionScore.status==="unknown"?"unknown":missionScore.status==="viable"?"viable":"marginal";
  feasibilityBadge.textContent=missionStatusLabel(missionScore.status); feasibilityBadge.className=`feasibility-badge ${badgeClass}`;
  $("#kpiSelectedLevel").dataset.status=missionScore.status;
  $("#feasibilityMeta").textContent=["viable","marginal"].includes(activeStatus)?`FL${selected.fl} · ${signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`)} · ${signedNumber(weightValue(feasibility.weightMarginLb),0,` ${weightLabel()}`)}`:activeStatus==="unknown"?(state.language==="pt-BR"?"Dados insuficientes":"Insufficient evidence"):(state.language==="pt-BR"?"Sem solução viável":"No feasible solution");
  const power=selected.power,mapLabel=power.turboLimited?`${number(power.targetMapInHg,1)}→${number(power.availableMapInHg,1)}\"`:`${number(power.availableMapInHg,1)}\"`;
  $("#powerSettingValue").textContent=`${mapLabel} · ${number(power.rpm)} RPM`;
  $("#powerPercent").textContent=`${number(power.percentPower)}%`;
  $("#powerPercent").classList.toggle("limited",power.turboLimited);
  $("#kpiAltitude").textContent=state.appliedChoice||["viable","marginal"].includes(activeStatus)?`FL${selected.fl}`:"—"; $("#kpiLevelMeta").textContent=state.appliedChoice?t("appliedConfiguration"):hasSolution?t("recommendedLevel"):optimizedMission.status==="unknown"?(state.language==="pt-BR"?"NÃO AVALIADO":"NOT ASSESSED"):(state.language==="pt-BR"?"SEM SOLUÇÃO":"NO SOLUTION"); $("#kpiFuel").innerHTML=`${number(fuelValue(selected.fuelRequiredGal),1)} <small>${state.fuelUnit==="l"?"L":"GAL"}</small>`; $("#kpiFuelDelta").textContent=`${signed(fuelValue(selected.feasibility.fuelMarginGal),` ${fuelLabel()}`)} ${t("margin")}`; $("#kpiTime").textContent=formatTime(selected.tripTimeHr); $("#kpiGs").textContent=`${Math.round(selected.gsKt)} kt GS`; $("#kpiRange").innerHTML=`${number(selected.maxRangeNm)} <small>NM</small>`; $("#kpiSpecificRange").textContent=`${number(state.fuelUnit==="l"?selected.specificRangeNmGal/3.785411784:selected.specificRangeNmGal,1)} NM/${state.fuelUnit==="l"?"L":"gal"}`;
  renderIceModule(plan,analysis,selected); renderFinancialCard(financial); renderFuel(selected); renderFlightTools(plan,navigation,stepPlan,selected,activeCandidate); renderAlternateAdvisor(plan,alternateAdvice); renderGlideCorridor(plan,glide); renderMissionStrip(selected,missionScore); renderMissionScore(selected,missionScore,optimizedMission,activeCandidate); renderOxygenPlanner(analysis); renderWeightBalance(optimizedMission.currentWeightBalance); renderRideOptimizer(optimizedMission,selected); renderDecisionPanel();
  $("#fuelRequiredSide").textContent=formatFuel(selected.fuelRequiredGal,1);
  $("#payloadOutput").textContent=formatWeight(state.payloadLb); $("#fuelOutput").textContent=formatFuel(state.fuelOnboardGal,0);
  const weight=AIRCRAFT.emptyWeightLb+state.payloadLb+state.fuelOnboardGal*AIRCRAFT.fuelDensityLbGal+oxygenWeightLb,delta=AIRCRAFT.maxGrossWeightLb-weight,currentWb=optimizedMission.currentWeightBalance; $("#weightValue").textContent=formatWeight(weight); $("#weightBar").style.width=`${Math.min(100,weight/AIRCRAFT.maxGrossWeightLb*100)}%`; $("#weightBar").style.background=delta<0?"#dc5661":"linear-gradient(90deg,var(--blue),var(--green))"; $("#weightNote").textContent=`${formatWeight(Math.abs(delta))} ${t(delta>=0?"belowMax":"aboveMax")} · CG ${number(currentWb.takeoff.cgIn,2)}→${number(currentWb.landing.cgIn,2)} in`; $("#weightNote").style.color=delta<0||currentWb.status==="unavailable"?"var(--red)":"";
  renderTracker();
  refreshUiIcons();
}

$$('[data-language]').forEach((button)=>button.addEventListener("click",()=>{state.language=button.dataset.language;localStorage.setItem("velocityxl.language",state.language);render();}));
$$('.font-switch button[data-font-size]').forEach((button)=>button.addEventListener("click",()=>{state.fontSize=button.dataset.fontSize;localStorage.setItem("velocityxl.fontSize",state.fontSize);applyTranslations();}));
$$('[data-weight-unit]').forEach((button)=>button.addEventListener("click",()=>{state.weightUnit=button.dataset.weightUnit;localStorage.setItem("velocityxl.weightUnit",state.weightUnit);render();}));
$$('[data-fuel-unit]').forEach((button)=>button.addEventListener("click",()=>{const previous=state.fuelUnit,next=button.dataset.fuelUnit;for(const selector of ["#observedFuelFlow","#trackerObservedFuel"]){const input=$(selector),value=Number(input.value);if(input.value&&Number.isFinite(value)&&value>=0&&previous!==next)input.value=(next==="l"?value*3.785411784:value/3.785411784).toFixed(1);}state.fuelUnit=next;localStorage.setItem("velocityxl.fuelUnit",state.fuelUnit);render();}));
$$('[data-mode]').forEach((button)=>button.addEventListener("click",()=>{invalidateDecision(true);state.mode=button.dataset.mode;state.selectedAltitudeFt=null;$$('[data-mode]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
const toolCardButtons=$$('[data-tool-view]');
const toolCardPanels=$$('[data-tool-panel]');
const toolHintKeys={etp:"toolHintEtp",alternate:"toolHintAlternate",wb:"toolHintWb",glide:"toolHintGlide",oxygen:"toolHintOxygen",ride:"toolHintRide",ice:"toolHintIce",cost:"toolHintCost",steps:"toolHintSteps"};
const initialTools={"planning:systems":"wb","planning:analyses":"cost","route:ice":"ice","route:ride":"ride","route:decisions":"etp"};
const selectedTools={...initialTools};
toolCardButtons.forEach((button)=>{
  const key=button.dataset.toolView,label=button.textContent;
  button.classList.add("tool-card");
  button.id=`tool-card-${key}`;
  button.removeAttribute("data-i18n");
  button.setAttribute("aria-controls",`tool-panel-${key}`);
  button.setAttribute("aria-expanded","false");
  button.innerHTML=`<span class="tool-card-label">${escapeHtml(label)}</span><small data-i18n="${toolHintKeys[key]}">${escapeHtml(t(toolHintKeys[key]))}</small>`;
  button.addEventListener("click",()=>setOpenTool(key));
});
toolCardPanels.forEach((panel)=>{
  const key=panel.dataset.toolPanel;
  panel.id=`tool-panel-${key}`;
  panel.setAttribute("role","region");
  if(key!=="update")panel.setAttribute("aria-labelledby",`tool-card-${key}`);
});
function setOpenTool(key){
  if(!key)return;
  const panel=toolCardPanels.find((item)=>item.dataset.toolPanel===key);
  const module=panel?.closest('[data-module-panel]');
  if(!module)return;
  selectedTools[module.dataset.modulePanel]=key;
  module.querySelectorAll('[data-tool-view]').forEach((button)=>{
    const active=button.dataset.toolView===key;
    button.classList.toggle('active',active);
    button.setAttribute('aria-expanded',String(active));
  });
  module.querySelectorAll('[data-tool-panel]').forEach((item)=>{
    const active=item.dataset.toolPanel===key;
    item.classList.toggle('active',active);
    item.hidden=!active;
  });
  if(key==="glide")centerGlideRoutePoint();
}
Object.values(initialTools).forEach(setOpenTool);
$("#payloadInput").addEventListener("input",(event)=>{invalidateDecision(true);setPayloadAndScaleStations(Number(event.target.value));render();}); $("#fuelInput").addEventListener("input",(event)=>{invalidateDecision(true);state.fuelOnboardGal=Number(event.target.value);render();}); $("#reserveInput").addEventListener("change",(event)=>{invalidateDecision(true);state.reserveMinutes=Number(event.target.value);render();});
$("#diversionWaypoint").addEventListener("change",(event)=>{state.diversionWaypointIndex=Number(event.target.value);render();});
$("#fuelPriceCurrency").addEventListener("change",(event)=>{invalidateDecision(false);state.financial.currency=event.target.value;localStorage.setItem("velocityxl.financial",JSON.stringify(state.financial));render();});
$("#fuelPricePerLiter").addEventListener("input",(event)=>{invalidateDecision(false);const value=Math.max(0,Number(event.target.value)||0);if(value>0)state.financial.prices[financialPriceKey()]=value;else delete state.financial.prices[financialPriceKey()];localStorage.setItem("velocityxl.financial",JSON.stringify(state.financial));render();});
$("#glideRoute").addEventListener("click",(event)=>{const button=event.target.closest("[data-glide-index]");if(!button||!currentGlideCorridor)return;state.glideSampleIndex=Number(button.dataset.glideIndex);renderGlideFocus(currentGlideCorridor);centerGlideRoutePoint();});
$("#optimizeMission").addEventListener("click",async()=>{
  if(!state.plan||optimizationBusy)return;
  optimizationBusy=true;
  const button=$("#optimizeMission"),revision=decisionRevision,plan=state.plan;
  button.disabled=true;button.setAttribute("aria-busy","true");
  try{
    await new Promise((resolve)=>requestAnimationFrame(resolve));
    if(revision!==decisionRevision||plan!==state.plan)return;
    const snapshot=optimizeMission(decisionInput());
    if(revision!==decisionRevision||plan!==state.plan)return;
    decisionSnapshot=snapshot;decisionStale=false;analysisChoice=null;analysisCandidate=null;
    renderDecisionPanel();window.VelocityLayout?.activate("mission","overview");
    $("#pilotDecisionPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }finally{optimizationBusy=false;button.disabled=false;button.removeAttribute("aria-busy");}
});
$("#pilotDecisionPanel").addEventListener("click",(event)=>{
  const card=event.target.closest("[data-decision-fl]");
  if(card){
    const altitudeFt=Number(card.dataset.decisionFl),mode=card.dataset.decisionMode;
    analysisChoice={altitudeFt,mode};marginalApplyArmed=false;
    const preset=PERFORMANCE.modes[mode];
    if(preset){$("#analysisMap").value=String(preset.mapInHg);$("#analysisRpm").value=String(preset.rpm);}
    renderDecisionPanel();$("#pilotAnalysis").scrollIntoView({behavior:"smooth",block:"nearest"});return;
  }
  const modeButton=event.target.closest("[data-analysis-mode]");
  if(modeButton&&analysisChoice){
    const previousMode=analysisChoice.mode,nextMode=modeButton.dataset.analysisMode;
    if(nextMode==="MANUAL"&&previousMode!=="MANUAL"){
      const preset=PERFORMANCE.modes[previousMode];
      if(preset){$("#analysisMap").value=String(preset.mapInHg);$("#analysisRpm").value=String(preset.rpm);}
    }
    analysisChoice={...analysisChoice,mode:nextMode};marginalApplyArmed=false;
    if(nextMode==="MANUAL"){
      analysisChoice.mapInHg=Number($("#analysisMap").value);
      analysisChoice.rpm=Number($("#analysisRpm").value);
    }
    renderDecisionPanel();return;
  }
  if(event.target.closest("#cancelPilotAnalysis")){analysisChoice=null;analysisCandidate=null;renderDecisionPanel();return;}
  if(event.target.closest("#recalculateRanking")){$("#optimizeMission").click();return;}
  if(!event.target.closest("#applyPilotAlternative"))return;
  if(decisionStale||!analysisCandidate||!["viable","marginal"].includes(analysisCandidate.status))return;
  if(analysisCandidate.status==="marginal"&&!marginalApplyArmed){marginalApplyArmed=true;renderDecisionPanel();return;}
  const candidate=analysisCandidate;
  state.appliedChoice={...analysisChoice};
  state.mode=candidate.engineMode;
  state.powerSetting=analysisChoice.mode==="MANUAL"?{type:"MANUAL",mapInHg:analysisChoice.mapInHg,rpm:analysisChoice.rpm}:{type:"AUTO",mapInHg:PERFORMANCE.modes[candidate.engineMode].mapInHg,rpm:PERFORMANCE.modes[candidate.engineMode].rpm};
  state.fuelOnboardGal=candidate.recommendedFuelGal;state.selectedAltitudeFt=candidate.altitudeFt;
  state.manual.fuelRemainingGal=state.fuelOnboardGal;
  $("#fuelInput").value=String(state.fuelOnboardGal);
  localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));
  localStorage.setItem("velocityxl.appliedMission",JSON.stringify({planKey:missionPlanKey(state.plan),choice:state.appliedChoice,engineMode:state.mode,powerSetting:state.powerSetting,fuelOnboardGal:state.fuelOnboardGal}));
  marginalApplyArmed=false;render();showToast(state.language==="pt-BR"?"Configuração aplicada.":"Configuration applied.");
});
for(const selector of ["#analysisMap","#analysisRpm"]){$(selector).addEventListener("input",()=>{
  if(!analysisChoice||analysisChoice.mode!=="MANUAL")return;
  analysisChoice={...analysisChoice,mapInHg:Number($("#analysisMap").value),rpm:Number($("#analysisRpm").value)};
  marginalApplyArmed=false;renderDecisionPanel();
});}
$("#oxygenBottle").addEventListener("change",(event)=>{invalidateDecision(true);state.oxygen.bottleModel=event.target.value;localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$("#oxygenBottleCount").addEventListener("change",(event)=>{invalidateDecision(true);state.oxygen.bottles=clamp(Number(event.target.value),0,4);localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$$('[data-oxygen-seat]').forEach((input)=>input.addEventListener("change",()=>{const keys=["pilot","copilot","rearLeft","rearCenter","rearRight"],index=Number(input.dataset.oxygenSeat),key=keys[index];state.weightBalance[key]=input.checked?Math.max(state.weightBalance[key],index===0?190:170):0;invalidateDecision(true);persistWeightBalance();render();}));
$$('[data-wb-key]').forEach((input)=>input.addEventListener("input",()=>{state.weightBalance[input.dataset.wbKey]=Math.max(0,weightFromDisplay(Number(input.value)||0));invalidateDecision(true);persistWeightBalance();render();}));
$("#randomizeWeightBalance").addEventListener("click",()=>{
  const randomized=randomizeWeightBalance({weightBalance:state.weightBalance,fuelOnboardGal:state.fuelOnboardGal,oxygenWeightLb:currentOxygenWeightLb()});
  if(!randomized){showToast(t("randomizeWeightBalanceFailed"),true);return;}
  invalidateDecision(true);state.weightBalance=randomized;
  persistWeightBalance();
  $("#payloadInput").value=String(state.payloadLb);
  render();
  showToast(t("randomizeWeightBalanceApplied"));
});
$("#applyOxygenRecommendation").addEventListener("click",()=>{
  const target=latestActiveCandidate?.result;
  if(!target)return;
  const oxygen=calculateOxygenPlan({result:target,oxygen:state.oxygen});
  if(oxygen.recommendedBottles===null)return;
  invalidateDecision(true);state.oxygen.bottleModel=oxygen.recommendedBottleModel;
  state.oxygen.bottles=oxygen.recommendedBottles;
  localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));
  render();
});
function updateCalibrationGate(){
  const tas=Boolean($("#observedTas").value.trim()),flow=Boolean($("#observedFuelFlow").value.trim());
  $("#submitFlightUpdate").textContent=t(tas&&flow?"updateAndCalibrate":"updateFlight");
  $("#calibrationGate").textContent=tas&&!flow?t("missingFlow"):flow&&!tas?t("missingTas"):"";
  $("#submitFlightUpdate").disabled=tas!==flow;
}

$("#trackerPrimary").addEventListener("click",()=>{
  if(!state.plan)return;
  if(trackerSession?.limitations?.includes("MANUAL_UPDATE_UNMODELED")){showToast(tw("flUnavailable"),true);return;}
  try{
    const now=Date.now();
    if(!trackerSession||trackerSession.missionKey!==missionPlanKey(state.plan)){
      if(!state.appliedChoice){showToast(tw("applied"),true);return;}
      const saved=storedJson(TRACKER_STORAGE_KEY,null);
      if(saved?.missionKey&&saved.missionKey!==missionPlanKey(state.plan)&&!["FINISHED","NOT_STARTED"].includes(saved.status)
        && !window.confirm(tw("newMission")))return;
      const profile=buildVirtualFlightProfile(state.plan,latestActiveCandidate?.result,state.fuelOnboardGal);
      if(!profile.valid){showToast(tw("invalid"),true);return;}
      trackerSession=newVirtualFlightSession(missionPlanKey(state.plan),trackerConfig(),profile);
    }
    trackerSession=trackerSession.status==="NOT_STARTED"?startVirtualFlight(trackerSession,now)
      :trackerSession.status==="RUNNING"?pauseVirtualFlight(trackerSession,now)
      :resumeVirtualFlight(trackerSession,now);
    persistTracker();renderTracker();
  }catch(error){showToast(error.message,true);}
});
$("#trackerFactor").addEventListener("change",(event)=>{
  if(!trackerSession||trackerSession.status==="FINISHED")return;
  try{trackerSession=setVirtualTimeFactor(trackerSession,Number(event.target.value),Date.now());persistTracker();renderTracker();}
  catch(error){showToast(error.message,true);}
});
$("#trackerFinish").addEventListener("click",()=>{
  if(!trackerSession||!window.confirm(tw("finishConfirm")))return;
  trackerSession=finishVirtualFlight(trackerSession,Date.now());persistTracker();trackerPanelMode=null;renderTracker();
});
$("#trackerSyncToggle").addEventListener("click",()=>{
  trackerPanelMode=trackerPanelMode==="sync"?null:"sync";trackerPendingPhase=null;
  const p=trackerSession&&projectVirtualFlight(trackerSession,state.plan,Date.now());
  if(p){const index=state.plan.waypoints.findIndex((fix)=>fix.distanceNm>=p.distanceNm-.01);$("#trackerFix").value=String(Math.max(0,index));}
  $("#trackerObservedFuel").value="";$("#trackerObservedFl").value="";$("#trackerElapsed").value="";
  $("#trackerSyncMessage").textContent="";renderTracker();
});
$("#trackerSyncCancel").addEventListener("click",()=>{trackerPanelMode=null;trackerPendingPhase=null;renderTracker();});
$("#trackerProjectionToggle").addEventListener("click",()=>{trackerPanelMode=trackerPanelMode==="projection"?null:"projection";renderTracker();});
$("#trackerProjectionClose").addEventListener("click",()=>{trackerPanelMode=null;renderTracker();});
$$('[data-tracker-phase]').forEach((button)=>button.addEventListener("click",()=>{
  trackerPendingPhase=trackerPendingPhase===button.dataset.trackerPhase?null:button.dataset.trackerPhase;
  renderTracker();
}));
$("#trackerWeatherAligned").addEventListener("change",(event)=>{
  if(!trackerSession)return;
  trackerSession={...trackerSession,weatherTimeAligned:event.target.checked};
  persistTracker();renderTrackerProjection();
});
$("#trackerSyncPanel").addEventListener("submit",(event)=>{
  event.preventDefault();
  if(!trackerSession||!state.plan)return;
  const now=Date.now(),index=Number($("#trackerFix").value),flText=$("#trackerObservedFl").value,
    fuelText=$("#trackerObservedFuel").value.trim(),elapsedText=$("#trackerElapsed").value.trim();
  const fl=flText?Number(flText):null,fuelGal=fuelText?fuelFromDisplay(Number(fuelText)):null;
  if(!Number.isInteger(index)||!state.plan.waypoints[index]||fl!==null&&!ALTITUDES_FT.includes(fl)
    ||fuelGal!==null&&(!Number.isFinite(fuelGal)||fuelGal<0||fuelGal>AIRCRAFT.usableFuelGal)
    ||elapsedText&&(!$("#trackerElapsed").validity.valid||!Number.isFinite(Number(elapsedText)))){
    $("#trackerSyncMessage").textContent=tw("invalid");return;
  }
  try{
    const corrected=elapsedText?correctVirtualElapsed(trackerSession,Number(elapsedText)*60,now):trackerSession;
    const profile=fl!==null&&fl!==corrected.config.altitudeFt?trackerProfileForFl(fl):corrected.profile;
    if(!profile.valid)throw new RangeError("TRACKER_FL_PROFILE_UNAVAILABLE");
    let allowEarlyDescent=false;
    const current=projectVirtualFlight(corrected,state.plan,now);
    if(trackerPendingPhase==="DESCENT"&&(current.phase==="CLIMB"||state.plan.waypoints[index].distanceNm<profile.tocNm)){
      allowEarlyDescent=window.confirm(tw("earlyDescent"));
      if(!allowEarlyDescent)return;
    }
    const next=confirmVirtualCheckpoint(corrected,state.plan,{waypointIndex:index,altitudeFt:fl,fuelGal,
      phase:trackerPendingPhase,allowEarlyDescent},now,profile);
    trackerSession=next;persistTracker();trackerPanelMode=null;trackerPendingPhase=null;
    renderTracker();showToast(tw("syncDone"));
  }catch(error){$("#trackerSyncMessage").textContent=error.message==="TRACKER_FL_PROFILE_UNAVAILABLE"?tw("flUnavailable"):error.message;}
});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)tickTracker();});
window.setInterval(()=>{if(!document.hidden&&trackerSession?.status==="RUNNING")tickTracker();},1000);

$("#manualUpdateForm").addEventListener("input",updateCalibrationGate);
$("#manualUpdateForm").addEventListener("change",updateCalibrationGate);

$("#manualUpdateForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  if(!state.plan)return;
  const waypointIndex=Number($("#manualWaypoint").value),waypoint=state.plan.waypoints[waypointIndex];
  const altitudeFt=Number($("#manualAltitude").value),fuelRemainingGal=fuelFromDisplay(Number($("#manualFuel").value));
  const tasValue=$("#observedTas").value.trim(),flowValue=$("#observedFuelFlow").value.trim();
  if(Boolean(tasValue)!==Boolean(flowValue)){updateCalibrationGate();return;}
  if(!waypoint||!ALTITUDES_FT.includes(altitudeFt)||!$("#manualFuel").validity.valid||!Number.isFinite(fuelRemainingGal)||fuelRemainingGal<0||fuelRemainingGal>AIRCRAFT.usableFuelGal){showToast(t("calibrationNeedsUpdate"),true);return;}
  let nextCalibration=null;
  try {
    if(tasValue&&flowValue)nextCalibration=deriveCalibration({plan:state.plan,mode:latestActiveCandidate?.engineMode||state.mode,payloadLb:state.payloadLb,fuelRemainingGal,oxygenWeightLb:currentOxygenWeightLb(),altitudeFt,observedTasKt:Number(tasValue),observedFuelFlowGph:fuelFromDisplay(Number(flowValue)),positionFix:waypoint,powerSetting:latestActiveCandidate?.powerSetting||state.powerSetting});
  } catch (error) {
    showToast(error.message==="CALIBRATION_ATMOSPHERE_UNAVAILABLE"?(state.language==="pt-BR"?"OFP sem temperatura neste ponto.":"No OFP temperature at this fix."):(state.language==="pt-BR"?"Leitura fora do intervalo de calibração.":"Calibration reading outside valid range."),true);
    return;
  }
  let nextTracker=null;
  if(trackerSession?.missionKey===missionPlanKey(state.plan)&&["RUNNING","PAUSED"].includes(trackerSession.status)){
    try{
      const profile=altitudeFt!==trackerSession.config.altitudeFt||nextCalibration
        ?trackerProfileForFl(altitudeFt,nextCalibration||trackerSession.config.calibration):trackerSession.profile;
      if(!profile.valid)throw new RangeError("TRACKER_FL_PROFILE_UNAVAILABLE");
      nextTracker=confirmVirtualCheckpoint(trackerSession,state.plan,{waypointIndex,altitudeFt,fuelGal:fuelRemainingGal},Date.now(),profile);
      if(nextCalibration)nextTracker.config={...nextTracker.config,calibration:structuredClone(nextCalibration)};
    }catch(error){
      if(error.message!=="TRACKER_FL_PROFILE_UNAVAILABLE"){showToast(error.message,true);return;}
      trackerSession=trackerSession.status==="RUNNING"?pauseVirtualFlight(trackerSession,Date.now()):trackerSession;
      trackerSession={...trackerSession,recoveredAttention:true,
        limitations:[...new Set([...trackerSession.limitations,"MANUAL_UPDATE_UNMODELED"])]};
      persistTracker();showToast(tw("flUnavailable"),true);
    }
  }
  if(!state.manual.active&&lastRenderedMissionScore)state.preflightSnapshot={missionScore:structuredClone(lastRenderedMissionScore),financial:structuredClone(lastRenderedFinancial)};
  state.manual={active:true,waypointIndex,distanceNm:Number(waypoint.distanceNm)||0,fuelRemainingGal,altitudeFt};
  state.diversionWaypointIndex=waypointIndex;
  if(nextCalibration){state.calibration=nextCalibration;localStorage.setItem("velocityxl.calibration",JSON.stringify(nextCalibration));}
  if(nextTracker){trackerSession=nextTracker;persistTracker();}
  render();
});

$("#resetCalibration").addEventListener("click",()=>{
  if(!window.confirm(state.language==="pt-BR"?"Redefinir a calibração armazenada?":"Reset stored calibration?"))return;
  state.calibration={tasFactor:1,fuelFlowFactor:1,reference:null};
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  $("#observedTas").value=""; $("#observedFuelFlow").value="";
  render();
});

function activatePlan(plan) {
  weatherRequest?.abort();
  decisionRevision++;decisionSnapshot=null;analysisChoice=null;analysisCandidate=null;decisionStale=false;state.appliedChoice=null;
  $("#topLevelCards").replaceChildren();$("#marginalLevels").replaceChildren();
  state.plan=plan;
  state.weatherSnapshot=createWeatherSnapshot(plan);
  state.selectedAltitudeFt=null;state.glideSampleIndex=null;
  try {
    const applied=JSON.parse(localStorage.getItem("velocityxl.appliedMission")||"null");
    const legacyChoice=!applied?.choice&&plan.generatedAt&&applied?.planKey===legacyMissionPlanKey(plan)
      && PERFORMANCE.modes[applied.mode]&&ALTITUDES_FT.includes(applied.fl*100)
      ?{altitudeFt:applied.fl*100,mode:applied.mode}:null;
    const choice=applied?.choice||legacyChoice;
    if((applied?.planKey===missionPlanKey(plan)||legacyChoice)&&validDecisionChoice(choice)
      && Number.isFinite(applied.fuelOnboardGal)&&applied.fuelOnboardGal>=0&&applied.fuelOnboardGal<=AIRCRAFT.usableFuelGal){
      state.appliedChoice=choice;
      if(PERFORMANCE.modes[applied.engineMode||choice.mode])state.mode=applied.engineMode||choice.mode;
      if(applied.powerSetting)state.powerSetting=applied.powerSetting;
      state.selectedAltitudeFt=choice.altitudeFt;
      state.fuelOnboardGal=applied.fuelOnboardGal;
      $("#fuelInput").value=String(state.fuelOnboardGal);
      if(legacyChoice)localStorage.setItem("velocityxl.appliedMission",JSON.stringify({planKey:missionPlanKey(plan),choice,engineMode:state.mode,powerSetting:{type:"AUTO"},fuelOnboardGal:state.fuelOnboardGal}));
    }
  } catch { /* Ignore malformed saved proposals while preserving other preferences. */ }
  state.preflightSnapshot=null;lastRenderedMissionScore=null;lastRenderedFinancial=null;
  state.manual={active:false,waypointIndex:0,distanceNm:0,fuelRemainingGal:state.fuelOnboardGal,altitudeFt:null};
  trackerPanelMode=null;trackerPendingPhase=null;
  trackerSession=recoverVirtualFlight(storedJson(TRACKER_STORAGE_KEY,null),missionPlanKey(plan),Date.now());
  render();
  const request=new AbortController();weatherRequest=request;
  Promise.allSettled([fetchGfsSnapshot(plan,{signal:request.signal}),fetchAwcSnapshot({signal:request.signal})]).then((outcomes)=>{
    if(request.signal.aborted||state.plan!==plan)return;
    const [gfs,awc]=outcomes.map((outcome)=>outcome.status==="fulfilled"?outcome.value:null);
    const errors=outcomes.map((outcome,index)=>outcome.status==="rejected"?`${index===0?"OPEN_METEO":"AWC"}: ${outcome.reason?.message||"unavailable"}`:null).filter(Boolean);
    state.weatherSnapshot=createWeatherSnapshot(plan,{gfs,awc,errors});
    invalidateDecision(false);
    render();
  });
}

$("#simbriefImportForm").addEventListener("submit",async(event)=>{
  event.preventDefault();
  const input=$("#quickPilotId"),identifier=input.value.trim();
  if(!identifier){showToast(t("missingId"),true);input.focus();return;}
  const button=$("#importLatest");
  try{
    button.disabled=true;button.setAttribute("aria-busy","true");button.textContent="…";
    let plan;
    try{plan=await fetchLatestOFP(identifier,"userid");}catch(firstError){plan=await fetchLatestOFP(identifier,"username");}
    localStorage.setItem("velocityxl.simbriefIdentifier",identifier);
    activatePlan(plan);
  }catch(error){showToast(error.message||t("importError"),true);}
  finally{button.disabled=false;button.removeAttribute("aria-busy");button.textContent=t("importLatest");refreshUiIcons();}
});

const savedIdentifier=localStorage.getItem("velocityxl.simbriefIdentifier"); if(savedIdentifier)$("#quickPilotId").value=savedIdentifier;
window.addEventListener("load",refreshUiIcons,{once:true});
render();
