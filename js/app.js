import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT, OXYGEN_CYLINDERS } from "./config.js?v=20261016-01";
import { calculateAlternateDiversion, calculateDebrief, calculateEtpPnr, calculateGlideCorridor, calculateMissionOptimization, calculateMissionRecovery, calculateMissionScore, calculateModeLoadOptimization, calculateOxygenPlan, calculatePlan, calculateStepClimbs, clamp, compareScenarios, deleteDebrief, deriveCalibration, icingDisplayTone, missionOptimizationFailureReason, normalizeWeightBalance, oxygenSystemWeightLb, randomizeWeightBalance, scaleWeightBalanceToPayload, summarizeDebriefs, weightBalancePayloadLb } from "./engine.js?v=20261016-04";
import { fetchLatestOFP } from "./simbrief.js?v=20261016-04";
import { rankMetricLevels } from "./performance-ranking.js?v=20261014-07";
import { fetchElevationProfile, routeTerrainLegs, terrainMinimumForLeg } from "./terrain.js?v=20261016-01";

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
  [".mission-strip > div:nth-child(2)","shield-check","card"],
  [".mission-strip > div:nth-child(3)","waves","card"],
  [".mission-strip > div:nth-child(4)","wind","card"],
  ['[data-view-panel="performance"] .view-heading h2',"bar-chart-3","heading"],
  ['[data-metric="fuel"]',"fuel","button"],
  ['[data-metric="time"]',"clock-3","button"],
  ['[data-metric="efficiency"]',"gauge","button"],
  ["#icingStatus","snowflake","inline"],
  [".phase-grid > div:nth-child(1) > span","plane-takeoff","inline"],
  [".phase-grid > div:nth-child(2) > span","move-right","inline"],
  [".phase-grid > div:nth-child(3) > span","plane-landing","inline"],
  [".power-heading > span","gauge","inline"],
  [".range-control:nth-of-type(1) b","luggage","inline"],
  [".range-control:nth-of-type(2) b","fuel","inline"],
  [".select-control > span","timer","inline"],
  [".weight-meter > div:first-child > span","scale","inline"],
  ["#optimizeMission","wand-sparkles","button"],
  ["#randomizeWeightBalance","shuffle","button"],
  ["#missionRecoveryAction","rotate-ccw","button"],
  [".mission-score-heading > div > span","activity","inline"],
  [".mission-score-action > span","wrench","inline"],
  [".compact-heading > span","fuel","inline"],
  ['[data-tool-view="etp"]',"route","button"],
  ['[data-tool-view="alternate"]',"map-pinned","button"],
  ['[data-tool-view="compare"]',"git-compare-arrows","button"],
  ['[data-tool-view="load"]',"package-check","button"],
  ['[data-tool-view="wb"]',"scale","button"],
  ['[data-tool-view="glide"]',"wind","button"],
  ['[data-tool-view="oxygen"]',"heart-pulse","button"],
  ['[data-tool-view="confidence"]',"shield-check","button"],
  ['[data-tool-view="ride"]',"waves","button"],
  ['[data-tool-view="debrief"]',"history","button"],
  ['[data-tool-view="steps"]',"trending-up","button"],
  ['[data-tool-view="update"]',"refresh-cw","button"],
  [".etp-point > span","route","inline"],
  [".pnr-point > span","rotate-ccw","inline"],
  [".navigation-speeds > span:nth-child(1) b","move-right","inline"],
  [".navigation-speeds > span:nth-child(2) b","move-left","inline"],
  [".advisor-card:nth-child(1) > span","map-pinned","inline"],
  [".advisor-card:nth-child(2) .inline-select > span","route","inline"],
  [".advisor-strip > span:nth-child(1) b","fuel","inline"],
  [".advisor-strip > span:nth-child(2) b","navigation","inline"],
  [".advisor-strip > span:nth-child(3) b","plane-landing","inline"],
  [".scenario-matrix-head > span:first-child","git-compare-arrows","inline"],
  ["#applyScenarioB","check","button"],
  [".load-grid > article:nth-child(1) > span","fuel","inline"],
  [".load-grid > article:nth-child(2) > span","navigation","inline"],
  [".load-grid > article:nth-child(3) > span","luggage","inline"],
  [".load-grid > article:nth-child(4) > span","scale","inline"],
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
  [".confidence-score > span","shield-check","inline"],
  [".ride-summary","waves","heading"],
  [".debrief-form > label:nth-child(1) > span:first-child","clock-3","inline"],
  [".debrief-form > label:nth-child(2) > span:first-child","fuel","inline"],
  ["#debriefForm .primary-button","save","button"],
  [".step-comparison-heading h2","trending-up","heading"],
  ["#manualUpdateForm > label:nth-child(1) > span:first-child","map-pin","inline"],
  ["#manualUpdateForm > label:nth-child(2) > span:first-child","navigation","inline"],
  ["#manualUpdateForm > label:nth-child(3) > span:first-child","fuel","inline"],
  ["#manualUpdateForm .primary-button","refresh-cw","button"],
  [".calibration-head > span","sliders-horizontal","inline"],
  ["#calibrationForm > label:nth-of-type(1) > span:first-child","gauge","inline"],
  ["#calibrationForm > label:nth-of-type(2) > span:first-child","fuel","inline"],
  ["#calibrationForm .primary-button","check","button"],
  ["#resetCalibration","rotate-ccw","button"],
  [".section-heading h2","layers-3","heading"],
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
    destinationAlternate:"Destino → alternado", diversionFrom:"Desvio a partir de", fuelAtDestination:"Combustível no destino", alternateFuel:"Combustível até alternado", alternateLanding:"Pouso no alternado", currentScenario:"ATUAL", comparisonScenario:"COMPARAÇÃO", scenarioMetric:"MÉTRICA", scenarioModeB:"MODE B", scenarioPayloadB:"Carga útil B", scenarioFuelB:"Combustível B", scenarioMargin:"Margem", applyScenario:"Aplicar B", recommendedFuel:"Combustível recomendado", presetLevel:"Preset / nível", recommendedPayload:"Payload recomendado", optimizedWeight:"Peso otimizado", applyOptimization:"Aplicar otimização", optimizeMission:"Otimizar missão", optimizationFailed:"Nenhuma configuração viável", alternateOptimizationFailed:"Alternado: faltam {fuel} para a margem viável", glideRatio:"Razão de planeio", bestGlide:"Melhor planeio", glideRange:"Alcance sem vento", glideTime:"Tempo estimado", glideAlongRoute:"Alcance ao longo da rota", glideInFocus:"em foco", glidePoint:"Ponto da rota", glideForward:"Rumo da rota →", glideReverse:"Sentido oposto ←", glidePointAltitude:"Altitude no ponto", glideCaveat:"Alcance teórico com vento estimado; não considera terreno, obstáculos ou local de pouso.", reducePayload:"reduzir payload", noAdjustment:"sem ajuste", noAlternateData:"SEM COORDENADAS", icingLow:"GELO BAIXO", icingWatch:"GELO POSSÍVEL", icingCaution:"CAUTELA GELO", icingAvoid:"EVITAR GELO", icingLimited:"DADOS LIMITADOS", icingWeather:"CONFIRMADO", weatherEstimated:"ESTIMADO", simbriefShear:"SHEAR SIMBRIEF", icingNoProfile:"SEM PERFIL ACEITÁVEL", icingNoCost:"SEM CUSTO METEO", tempWindow:"JANELA TÉRMICA", iceProbability:"ICE", iceProbabilityAria:"Indicador estimado de gelo",
    missionRisk:"Risco da missão", missionScore:"Score da missão", mainAdjustment:"Ajuste principal", confidence:"Confiança", rideComfort:"Conforto", oxygen:"Oxigênio", cabinAltitude:"Altitude cabine", bottle:"Garrafa", quantity:"Quantidade", applyOxygen:"Aplicar recomendação", pilot:"Piloto", copilot:"Copiloto", rearLeft:"Traseiro E", rearCenter:"Traseiro C", rearRight:"Traseiro D", baggage:"Bagagem", oxygenRequired:"Requerido", oxygenInstalled:"Disponível", oxygenEndurance:"Autonomia", oxygenWeight:"Peso O₂", modelConfidence:"Confiança do modelo", actualTime:"Tempo real", actualFuel:"Combustível usado", saveDebrief:"Salvar debrief", flights:"voos", low:"BAIXO", moderate:"MODERADO", high:"ALTO", critical:"CRÍTICO", smooth:"SUAVE", light:"LEVE", severe:"SEVERA", oxygenNotRequired:"NÃO REQUERIDO", oxygenCompliant:"ADEQUADO", oxygenMarginal:"MARGINAL", oxygenInsufficient:"INSUFICIENTE", maskRequired:"MÁSCARA", cannula:"CÂNULA", expected:"ESPERADO", accuracy:"PRECISÃO", noDebriefs:"SEM DEBRIEFS", weatherLimited:"DADOS LIMITADOS", weightBalance:"Peso e CG", cgEnvelope:"Envelope de CG", weight:"Peso", zeroFuel:"Sem combustível", takeoff:"Decolagem", landing:"Pouso", grossWeight:"Peso total", cgTravel:"Variação do CG", station:"Estação", arm:"Braço", moment:"Momento", emptyAircraft:"Aeronave vazia", headerFuel:"Header fuel", mainFuel:"Combustível principal", cgForward:"Limite dianteiro", cgAft:"Limite traseiro",
    stepDecisionTitle:"Vale a pena subir?", stepRemainingCruise:"TRECHO RESTANTE EM ROTA", stepConstant:"Nível constante", stepSuggested:"PERFIL SUGERIDO", stepAlternative:"ALTERNATIVA", stepEfficient:"Menor consumo estimado", stepNoProposal:"SEM PROPOSTA", stepNoSuggestion:"Nenhuma subida sugerida", stepNoProposed:"Sem subida", stepCountLabel:(count)=>`${count} ${count===1?"subida":"subidas"}`, stepFuelUsed:"Combustível", stepTravelTime:"Tempo", stepClimbsCount:"Subidas", stepTradeoff:"Troca proposta", stepMaintain:"Manter", stepNoWaypoint:"Sem waypoint elegível entre a posição atual e o destino.", stepNoNetGain:"Subir não reduz o consumo total estimado nesta rota.", stepNoBenefit:"Nenhuma etapa atende ao ganho mínimo estimado.", stepLevelUnavailable:"Níveis superiores indisponíveis nas condições atuais.", stepCaveat:"Estimativa para o trecho restante em rota; exclui subida inicial, descida e reserva. Confirme meteorologia, oxigênio e limites de cada nível.",
  },
  "en-US": {
    pilotId:"Pilot ID / Alias", importLatest:"Import OFP",
    bestLevel:"Best level", fuelRequired:"Fuel required", estimatedTime:"Estimated time", maximumRange:"Maximum range", performance:"Performance", route:"Route", profile:"Profile", altitudeComparison:"Altitude comparison", selectedLevel:"Selected", recommendedLevel:"Recommended", windComponent:"Component", alternate:"Alternate", flightProfile:"Flight profile",
    payload:"Payload", fuelOnboard:"Fuel onboard", reserve:"Reserve", takeoffWeight:"Takeoff weight", fuel:"Fuel", allLevels:"All levels", fontSize:"Font size", fontSmall:"Smaller font", fontNormal:"Default font", fontLarge:"Larger font", selectLevel:"Select level", levelReason:"Reason", levelSelection:"Selection", climb:"CLIMB", cruise:"CRUISE", descent:"DESCENT", power:"Power", automatic:"Automatic", viable:"VIABLE", marginalStatus:"MARGINAL", notViable:"NOT VIABLE", profileLimit:"PROFILE", ceilingLimit:"CEILING", disclaimer:"Alan Fernandes - 2026",
    simbrief:"SIMBRIEF", fuelHint:"Lower is better", timeHint:"Lower is better", efficiencyHint:"Higher is better", margin:"margin", belowMax:"below maximum", aboveMax:"above maximum", missingId:"Enter a Pilot ID or Alias.", importError:"Could not import the OFP.",
    fuelRank:(rank)=>`#${rank} fuel`, timeRank:(rank,gs)=>`#${rank} time · ${gs} kt GS`, windLine:(wind,isa)=>`${wind} kt · ISA ${isa}`, trip:"Trip", contingency:"Contingency", taxi:"Taxi", rankingOthers:(count)=>`Other levels (${count})`, rankingShow:"Show all", rankingHide:"Hide", rankingNoAvailable:"No operationally available level.", rankingNote:"Ranking of available levels; the recommendation considers the full mission.",
    manualUpdate:"Manual update", continueLabel:"Continue", returnLabel:"Return", position:"Position", fuelRemaining:"Fuel remaining", update:"Update", calibration:"Calibration", observedTas:"Observed TAS", observedFuelFlow:"Observed fuel flow", calibrate:"Calibrate", reset:"Reset", beyondDestination:"Beyond destination", noStep:"No step climb", nextStep:"Next", updated:"MANUAL", preflight:"PREFLIGHT",
    destinationAlternate:"Destination → alternate", diversionFrom:"Diversion from", fuelAtDestination:"Fuel at destination", alternateFuel:"Fuel to alternate", alternateLanding:"Alternate landing", currentScenario:"CURRENT", comparisonScenario:"COMPARISON", scenarioMetric:"METRIC", scenarioModeB:"MODE B", scenarioPayloadB:"Payload B", scenarioFuelB:"Fuel onboard B", scenarioMargin:"Margin", applyScenario:"Apply B", recommendedFuel:"Recommended fuel", presetLevel:"Preset / level", recommendedPayload:"Recommended payload", optimizedWeight:"Optimized weight", applyOptimization:"Apply optimization", optimizeMission:"Optimize mission", optimizationFailed:"No viable configuration", alternateOptimizationFailed:"Alternate: {fuel} short of the viable margin", glideRatio:"Glide ratio", bestGlide:"Best glide", glideRange:"Still-air range", glideTime:"Estimated time", glideAlongRoute:"Glide range along the route", glideInFocus:"in focus", glidePoint:"Route point", glideForward:"Along route →", glideReverse:"Opposite direction ←", glidePointAltitude:"Altitude at point", glideCaveat:"Theoretical range with estimated wind; terrain, obstacles, and landing sites are not considered.", reducePayload:"reduce payload", noAdjustment:"no adjustment", noAlternateData:"NO COORDINATES", icingLow:"LOW ICE", icingWatch:"POSSIBLE ICE", icingCaution:"ICE CAUTION", icingAvoid:"AVOID ICE", icingLimited:"LIMITED DATA", icingWeather:"CONFIRMED", weatherEstimated:"ESTIMATED", simbriefShear:"SIMBRIEF SHEAR", icingNoProfile:"NO ACCEPTABLE PROFILE", icingNoCost:"NO WEATHER COST", tempWindow:"TEMP WINDOW", iceProbability:"ICE", iceProbabilityAria:"Estimated icing indicator",
    missionRisk:"Mission risk", missionScore:"Mission score", mainAdjustment:"Main adjustment", confidence:"Confidence", rideComfort:"Ride", oxygen:"Oxygen", cabinAltitude:"Cabin altitude", bottle:"Bottle", quantity:"Quantity", applyOxygen:"Apply recommendation", pilot:"Pilot", copilot:"Copilot", rearLeft:"Rear left", rearCenter:"Rear center", rearRight:"Rear right", baggage:"Baggage", oxygenRequired:"Required", oxygenInstalled:"Available", oxygenEndurance:"Endurance", oxygenWeight:"O₂ weight", modelConfidence:"Model confidence", actualTime:"Actual time", actualFuel:"Fuel used", saveDebrief:"Save debrief", flights:"flights", low:"LOW", moderate:"MODERATE", high:"HIGH", critical:"CRITICAL", smooth:"SMOOTH", light:"LIGHT", severe:"SEVERE", oxygenNotRequired:"NOT REQUIRED", oxygenCompliant:"COMPLIANT", oxygenMarginal:"MARGINAL", oxygenInsufficient:"INSUFFICIENT", maskRequired:"MASK", cannula:"CANNULA", expected:"EXPECTED", accuracy:"ACCURACY", noDebriefs:"NO DEBRIEFS", weatherLimited:"LIMITED DATA", weightBalance:"Weight & CG", cgEnvelope:"CG envelope", weight:"Weight", zeroFuel:"Zero fuel", takeoff:"Takeoff", landing:"Landing", grossWeight:"Gross weight", cgTravel:"CG travel", station:"Station", arm:"Arm", moment:"Moment", emptyAircraft:"Empty aircraft", headerFuel:"Header fuel", mainFuel:"Main fuel", cgForward:"Forward limit", cgAft:"Aft limit",
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
Object.assign(COPY["pt-BR"], { terrainUnknown:"TERRENO NÃO AVALIADO", bestLevel:"Nível selecionado", cabinAltitude:"Nível de voo", deleteDebrief:"Excluir debrief", debriefAverage:(count)=>`Média de ${count} debriefs` });
Object.assign(COPY["en-US"], { terrainUnknown:"TERRAIN UNASSESSED", bestLevel:"Selected level", cabinAltitude:"Flight level", deleteDebrief:"Delete debrief", debriefAverage:(count)=>`Average of ${count} debriefs` });

function storedJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

const state = {
  plan:null, mode:"NORMAL", payloadLb:520, fuelOnboardGal:77, reserveMinutes:45,
  metric:"fuel", selectedAltitudeFt:null, expandedAltitudeFt:null, lastSelectedAltitudeFt:null, rankingExpanded:false, language:localStorage.getItem("velocityxl.language") || "pt-BR",
  fontSize:["small","normal","large"].includes(localStorage.getItem("velocityxl.fontSize"))?localStorage.getItem("velocityxl.fontSize"):"normal",
  weightUnit:localStorage.getItem("velocityxl.weightUnit") || "lb", fuelUnit:localStorage.getItem("velocityxl.fuelUnit") || "gal",
  calibration:storedJson("velocityxl.calibration", {}),
  powerSetting:storedJson("velocityxl.powerSetting", { type:"AUTO", mapInHg:24, rpm:2450 }),
  oxygen:storedJson("velocityxl.oxygen", { bottleModel:"SK-12-24", bottles:0, seats:[true,true,true,true,true], altitudeFt:null }),
  weightBalance:storedJson("velocityxl.weightBalance", { pilot:190, copilot:170, rearLeft:55, rearCenter:50, rearRight:55, baggage:0 }),
  debriefs:storedJson("velocityxl.debriefs", []),
  manual:{ active:false, waypointIndex:0, distanceNm:0, fuelRemainingGal:77, altitudeFt:null },
  diversionWaypointIndex:0,
  scenarioB:{ mode:"ECON", altitudeFt:16000, payloadLb:520, fuelOnboardGal:77 },
  glideSampleIndex:null,
  manualTerrainMora:{}, elevationProfile:null, elevationLoading:false, elevationError:null,
};
let lastViableMission=null;
let pendingMissionRecovery=null;
const viableMissionStorageKey="velocityxl.lastViableMission";
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
const operationallyAvailable=(result)=>result.feasibility.status!=="unavailable"&&result.terrain.status!=="unavailable"&&result.icing.status!=="avoid"&&!result.turbulence.blocking&&result.oxygen.status!=="insufficient"&&result.weightBalance?.status!=="unavailable";

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

function missionPlanKey(plan) {
  return [plan.source,plan.generatedAt,plan.origin?.icao,plan.destination?.icao,plan.route,plan.distanceNm].join("|");
}

function rememberViableMission() {
  lastViableMission={
    plan:state.plan,
    planKey:missionPlanKey(state.plan),
    mode:state.mode,
    fuelOnboardGal:state.fuelOnboardGal,
    oxygen:{...state.oxygen,seats:[...state.oxygen.seats]},
    weightBalance:{...state.weightBalance},
  };
  const {plan,...storedMission}=lastViableMission;
  localStorage.setItem(viableMissionStorageKey,JSON.stringify(storedMission));
}

function optimizationFailureText(optimization) {
  const key={CG_AFT:"optimizationCgAft",CG_FORWARD:"optimizationCgForward",WEIGHT:"optimizationWeight",FUEL_CAPACITY:"optimizationFuelCapacity",ALTERNATE:"optimizationAlternate",WEATHER:"optimizationWeather",OXYGEN:"optimizationOxygen",TERRAIN:"optimizationTerrain",COMBINED:"optimizationCombined"}[missionOptimizationFailureReason(optimization)];
  return t(key||"optimizationCombined");
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
  $$('[data-weight-unit]').forEach((button)=>button.classList.toggle("active",button.dataset.weightUnit===state.weightUnit));
  $$('[data-fuel-unit]').forEach((button)=>button.classList.toggle("active",button.dataset.fuelUnit===state.fuelUnit));
  $$('.font-switch button[data-font-size]').forEach((button)=>{const active=button.dataset.fontSize===state.fontSize;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));button.setAttribute("aria-label",t(button.dataset.fontSize==="small"?"fontSmall":button.dataset.fontSize==="large"?"fontLarge":"fontNormal"));});
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

function levelStatus(result) {
  if(!operationallyAvailable(result)) return "unavailable";
  if(result.terrain.status==="unknown") return "unknown";
  return result.terrain.status==="marginal"||result.feasibility.status==="marginal"||result.oxygen.status==="marginal"||result.icing.status==="caution"||["moderate","severe"].includes(result.turbulence.status)?"marginal":"viable";
}

function renderPerformanceRanking(results,recommended,selectedResult) {
  const config=metricConfig();
  const ranking=rankMetricLevels(results.map((result)=>({result,altitudeFt:result.altitudeFt,value:config.get(result),available:operationallyAvailable(result)})),state.metric);
  const available=ranking.filter((entry)=>entry.available),top=available.slice(0,3),rest=ranking.slice(top.length),best=available[0]?.value;
  const rankLabel=(rank)=>state.language==="pt-BR"?`${rank}º`:`#${rank}`;
  const metricValue=(value)=>`${config.value(value)}${state.metric==="time"?"":` ${config.unit}`}`;
  const difference=(value)=>{
    if(value===best) return "—";
    if(state.metric==="time") return `+${number(Math.max(0,Math.round(value*60)-Math.round(best*60)))} min`;
    if(state.metric==="efficiency") return `−${number(Math.max(0,best-value),1)} ${config.unit}`;
    return `+${number(Math.max(0,value-best),1)} ${config.unit}`;
  };
  const badges=(result)=>`${result.altitudeFt===selectedResult.altitudeFt?`<span class="ranking-badge selected">${escapeHtml(t("selectedLevel"))}</span>`:""}${result.altitudeFt===recommended.altitudeFt&&operationallyAvailable(recommended)&&recommended.terrain.status!=="unknown"?`<span class="ranking-badge recommended">${escapeHtml(t("recommendedLevel"))}</span>`:""}`;
  const statusLabel=(result)=>escapeHtml(t(levelStatus(result)==="unavailable"?"notViable":levelStatus(result)==="unknown"?"terrainUnknown":levelStatus(result)==="marginal"?"marginalStatus":"viable"));
  const topMarkup=top.map(({result,value,rank})=>`<button class="ranking-card ${levelStatus(result)} ${result.altitudeFt===selectedResult.altitudeFt?"selected":""}" type="button" data-rank-altitude="${result.altitudeFt}">
    <span class="ranking-card-top"><b>${rankLabel(rank)} · FL${result.fl}</b><small>${statusLabel(result)}</small></span>
    <strong>${metricValue(value)}</strong>
    <span class="ranking-card-bottom"><small>${difference(value)}</small><span class="ranking-badges">${badges(result)}</span></span>
  </button>`).join("");
  const restMarkup=rest.map(({result,value,rank,available:canSelect})=>`<button class="ranking-row ${levelStatus(result)} ${result.altitudeFt===selectedResult.altitudeFt?"selected":""}" type="button" data-rank-altitude="${result.altitudeFt}">
    <span class="ranking-row-id"><b>${rank?`${rankLabel(rank)} · `:""}FL${result.fl}</b><span>${statusLabel(result)} ${badges(result)}</span></span>
    <span class="ranking-row-value"><strong>${metricValue(value)}</strong><small>${canSelect?difference(value):escapeHtml(levelFeasibilityLabel(result))}</small></span>
  </button>`).join("");
  $("#performanceChart").innerHTML=`<div class="ranking-context"><span>${escapeHtml(t("selectedLevel"))} · FL${selectedResult.fl}</span><span>${recommended.terrain.status==="unknown"?`${escapeHtml(t("terrainUnknown"))} · FL${recommended.fl}`:operationallyAvailable(recommended)?`${escapeHtml(t("recommendedLevel"))} · FL${recommended.fl}`:escapeHtml(t("rankingNoAvailable"))}</span></div>
    <div class="ranking-top">${topMarkup||`<p class="ranking-empty">${escapeHtml(t("rankingNoAvailable"))}</p>`}</div>
    ${rest.length?`<button class="ranking-toggle" type="button" data-ranking-toggle aria-controls="rankingRest" aria-expanded="${state.rankingExpanded}">${escapeHtml(t("rankingOthers",rest.length))} · ${escapeHtml(t(state.rankingExpanded?"rankingHide":"rankingShow"))}</button><div class="ranking-rest" id="rankingRest" data-collapsed="${!state.rankingExpanded}">${restMarkup}</div>`:""}
    <p class="ranking-note">${escapeHtml(config.hint)} · ${escapeHtml(t("rankingNote"))}</p>`;
}

function icingLabel(icing) {
  return t(icing.status==="avoid"?"icingAvoid":icing.status==="caution"?"icingCaution":icing.status==="watch"?"icingWatch":"icingLow");
}

function icingProbabilityMarkup(icing) {
  const score=clamp(Math.round(icing.riskScore),0,100);
  const tone=icingDisplayTone(score,icing.status);
  return `<span class="ice-probability ice-${tone}" aria-label="${escapeHtml(t("iceProbabilityAria"))}: ${score}%">${iconMarkup("snowflake")}<span>ICE</span><strong>${score}%</strong></span>`;
}

function levelFeasibilityLabel(result) {
  if(result.terrain.status==="unavailable") return `MORA · ${signedNumber(result.terrain.marginFt,0," ft")}`;
  if(result.terrain.status==="unknown") return t("terrainUnknown");
  if(result.terrain.status==="marginal") return `MORA · ${signedNumber(result.terrain.marginFt,0," ft")}`;
  if(result.weightBalance?.status==="unavailable") return result.weightBalance.primaryReason==="WEIGHT"?t("grossWeight"):"CG";
  if(result.oxygen.status==="insufficient") return `${t("oxygenInsufficient")} O₂`;
  if(result.turbulence.blocking) return `${t("severe")} TURB`;
  if(result.icing.status==="avoid") return t("icingAvoid");
  const feasibility=result.feasibility;
  if(result.oxygen.status==="marginal") return "O₂";
  if(result.turbulence.status==="severe") return `${t("severe")} TURB`;
  if(result.turbulence.status==="moderate") return `${t("moderate")} TURB`;
  if(result.icing.status==="caution") return t("icingCaution");
  if(feasibility.status==="viable") return "";
  if(feasibility.status==="marginal") return feasibility.primaryReason==="FUEL"?`${t("fuel")} · ${signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`)}`:t("marginalStatus");
  if(feasibility.primaryReason==="FUEL") return signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`);
  if(feasibility.primaryReason==="WEIGHT") return `+${formatWeight(Math.abs(feasibility.weightMarginLb))}`;
  if(feasibility.primaryReason==="ALTITUDE") return t("ceilingLimit");
  return t("profileLimit");
}

function renderLevelCards(results,recommended,selected) {
  if(selected.altitudeFt!==state.lastSelectedAltitudeFt){state.expandedAltitudeFt=selected.altitudeFt;state.lastSelectedAltitudeFt=selected.altitudeFt;}
  if(!results.some((result)=>result.altitudeFt===state.expandedAltitudeFt)) state.expandedAltitudeFt=selected.altitudeFt;
  $("#levelCards").innerHTML=results.map((result)=>{
    const status=levelStatus(result);
    const blocked=status==="unavailable";
    const statusLabel=t(status==="unavailable"?"notViable":status==="unknown"?"terrainUnknown":status==="marginal"?"marginalStatus":"viable");
    const current=result.altitudeFt===selected.altitudeFt;
    const isRecommended=result.altitudeFt===recommended.altitudeFt&&!blocked&&recommended.terrain.status!=="unknown";
    const expanded=result.altitudeFt===state.expandedAltitudeFt;
    const reason=levelFeasibilityLabel(result);
    const oxygenStatus=oxygenLabel(result.oxygen.status);
    const detailId=`level-detail-${result.altitudeFt}`;
    const stateIcon=blocked?"triangle-alert":isRecommended?"star":["marginal","unknown"].includes(status)?"triangle-alert":"circle-check";
    return `<article class="level-item ${status} ${current?"selected":""} ${isRecommended?"recommended":""} ${expanded?"expanded":""}" data-level="${result.altitudeFt}">
      <button class="level-expand" type="button" aria-expanded="${expanded}" aria-controls="${detailId}" aria-label="FL${result.fl} · ${escapeHtml(statusLabel)} · ${formatFuel(result.fuelRequiredGal,1)} · ETE ${formatTime(result.tripTimeHr)} · ${Math.round(result.gsKt)} kt GS">
        <strong class="level-fl">FL${result.fl}</strong>
        <span class="level-summary">${formatFuel(result.fuelRequiredGal,1)} <span aria-hidden="true">·</span> ${formatTime(result.tripTimeHr)} <span aria-hidden="true">·</span> ${Math.round(result.gsKt)} kt GS</span>
        <span class="level-status">${iconMarkup(stateIcon,"level-state-icon")}${escapeHtml(statusLabel)}</span>
        ${iconMarkup("chevron-down","level-chevron")}
      </button>
      <div class="level-detail" id="${detailId}" ${expanded?"":"hidden"}>
        <div><span>${escapeHtml(t("iceProbability"))}</span>${icingProbabilityMarkup(result.icing)}</div>
        <div><span>${escapeHtml(t("oxygen"))}</span><strong class="${result.oxygen.status==="insufficient"?"level-warning":""}">${escapeHtml(oxygenStatus)}</strong></div>
        ${reason&&reason!==statusLabel?`<div class="level-reason"><span>${escapeHtml(t("levelReason"))}</span><strong>${escapeHtml(reason)}</strong></div>`:""}
        ${current?`<div class="level-selection"><span>${escapeHtml(t("levelSelection"))}</span><strong>${escapeHtml(t("selectedLevel"))}</strong></div>`:isRecommended?`<div class="level-selection"><span>${escapeHtml(t("levelSelection"))}</span><strong>${escapeHtml(t("recommendedLevel"))}</strong></div>`:""}
        ${!current?`<button class="level-select" type="button" data-select-level="${result.altitudeFt}">${escapeHtml(t("selectLevel"))}</button>`:""}
      </div>
    </article>`;
  }).join("");
  $$(".level-expand").forEach((button)=>button.addEventListener("click",()=>{
    const level=Number(button.closest(".level-item").dataset.level);
    state.expandedAltitudeFt=level;
    $$(".level-item").forEach((item)=>{const expanded=Number(item.dataset.level)===level;item.classList.toggle("expanded",expanded);item.querySelector(".level-expand").setAttribute("aria-expanded",String(expanded));item.querySelector(".level-detail").hidden=!expanded;});
  }));
  $$("[data-select-level]").forEach((button)=>button.addEventListener("click",()=>{state.selectedAltitudeFt=Number(button.dataset.selectLevel);render();$( `.level-item[data-level="${state.selectedAltitudeFt}"] .level-expand`)?.focus();}));
}

function renderIcingSummary(analysis) {
  const recommended=analysis.winners.overall,performance=analysis.winners.performance,cost=analysis.icing.cost,icing=recommended.icing;
  const source=icing.confidence==="weather"?t("icingWeather"):icing.confidence==="estimated"?t("weatherEstimated"):t("icingLimited");
  const status=$("#icingStatus");
  status.textContent=analysis.icing.hasAcceptableProfile?icingLabel(icing):t("icingNoProfile");
  status.className=analysis.icing.hasAcceptableProfile?`icing-${icing.status}`:"icing-avoid";
  $("#icingDelta").textContent=cost.changedAltitude?`FL${performance.fl} → FL${recommended.fl} · ${signedNumber(fuelValue(cost.fuelGal),1,` ${fuelLabel()}`)} · ${signedNumber(cost.timeHr*60,0," min")}`:`FL${recommended.fl} · ${t("icingNoCost")}`;
  $("#icingSource").textContent=`SIMBRIEF OAT · ${source} · ${t("tempWindow")} ${number(icing.temperatureExposureMinutes,0)} min`;
}

function renderTerrainProfile(plan,result) {
  const pt=state.language==="pt-BR",terrain=result.terrain,legs=routeTerrainLegs(plan),totalNm=Math.max(1,legs.at(-1)?.endNm||plan.distanceNm||1);
  const statusKey=terrain.status==="unknown"?"terrainUnknown":terrain.status==="unavailable"?"notViable":terrain.status==="marginal"?"marginalStatus":"viable";
  const badge=$("#terrainStatus");badge.textContent=t(statusKey);badge.className=`terrain-badge ${terrain.status}`;
  $("#terrainMargin").textContent=Number.isFinite(terrain.marginFt)?signedNumber(terrain.marginFt,0," ft"):"—";
  $("#terrainEyebrow").textContent=pt?"TERRENO · OFP":"TERRAIN · OFP";
  $("#terrainTitle").textContent=pt?"Perfil de elevação":"Elevation profile";
  $("#terrainIntro").textContent=pt?"MORA por trecho e relevo visual ao longo da rota.":"Leg-by-leg MORA and visual terrain along the route.";
  $("#terrainLegendFlight").textContent=pt?"Altitude planejada":"Planned altitude";
  $("#terrainLegendMora").textContent="MORA SimBrief";
  $("#terrainLegendElevation").textContent=pt?"Relevo amostrado":"Sampled terrain";
  $("#terrainLegendCritical").textContent=pt?"Trecho crítico":"Critical leg";
  $("#terrainCriticalLabel").textContent=pt?"Trecho crítico":"Critical leg";
  $("#terrainCoverageLabel").textContent=pt?"Cobertura da MORA":"MORA coverage";
  $("#terrainSelectedLabel").textContent=pt?"Nível selecionado":"Selected level";
  $("#terrainOrigin").textContent=`${plan.origin.icao} · 0 NM`;
  $("#terrainMidpoint").textContent=`${number(totalNm/2)} NM`;
  $("#terrainDestination").textContent=`${plan.destination.icao} · ${number(totalNm)} NM`;
  $("#terrainCritical").textContent=terrain.critical?`${terrain.critical.from.ident||"—"} → ${terrain.critical.to.ident||"—"} · ${number(terrain.critical.feet)} ft`:"—";
  $("#terrainCoverage").textContent=`${terrain.assessedCount-terrain.missingCount}/${terrain.assessedCount} ${pt?"trechos":"legs"}`;
  $("#terrainSelected").textContent=`FL${result.fl} · TOC ${number(terrain.tocNm)} / TOD ${number(terrain.todNm)} NM`;
  $("#terrainRefresh").textContent=state.elevationLoading?(pt?"Carregando…":"Loading…"):state.elevationError?(pt?"Tentar relevo novamente":"Retry terrain"):(pt?"Atualizar relevo":"Refresh terrain");
  $("#terrainRefresh").disabled=state.elevationLoading;
  const elevation=state.elevationProfile||[];
  const highest=Math.max(result.altitudeFt,2500,...legs.map((leg)=>terrainMinimumForLeg(leg,state.manualTerrainMora).feet).filter(Number.isFinite),...elevation.map((point)=>point.elevationFt).filter(Number.isFinite));
  const upper=Math.max(5000,highest*1.14),x=(distance)=>Math.max(0,Math.min(800,distance/totalNm*800)),y=(feet)=>200-Math.max(0,feet)/upper*184;
  const grid=[0.25,0.5,0.75].map((fraction)=>`<path class="terrain-grid" d="M0 ${y(upper*fraction).toFixed(1)} H800"/>`).join("");
  const critical=terrain.critical?`<rect class="terrain-critical-zone" x="${x(terrain.critical.startNm).toFixed(1)}" y="0" width="${Math.max(0,x(terrain.critical.endNm)-x(terrain.critical.startNm)).toFixed(1)}" height="220"/>`:"";
  const ground=elevation.length?`<path class="terrain-ground-back" d="M0 220 ${elevation.map((point)=>`L${x(point.distanceNm).toFixed(1)} ${y(point.elevationFt*.82).toFixed(1)}`).join(" ")} L800 220 Z"/><path class="terrain-ground" d="M0 220 ${elevation.map((point)=>`L${x(point.distanceNm).toFixed(1)} ${y(point.elevationFt).toFixed(1)}`).join(" ")} L800 220 Z"/>`:"";
  const mora=legs.map((leg)=>{const minimum=terrainMinimumForLeg(leg,state.manualTerrainMora);return Number.isFinite(minimum.feet)?`<path class="terrain-mora" d="M${x(leg.startNm).toFixed(1)} ${y(minimum.feet).toFixed(1)} H${x(leg.endNm).toFixed(1)}"/>`:"";}).join("");
  const startElevation=elevation[0]?.elevationFt??0,endElevation=elevation.at(-1)?.elevationFt??0;
  const flight=`<path class="terrain-flight" d="M0 ${y(startElevation).toFixed(1)} L${x(terrain.tocNm).toFixed(1)} ${y(result.altitudeFt).toFixed(1)} H${x(terrain.todNm).toFixed(1)} L800 ${y(endElevation).toFixed(1)}"/>`;
  const markers=`<path class="terrain-toc" d="M${x(terrain.tocNm).toFixed(1)} 0 V220"/><path class="terrain-tod" d="M${x(terrain.todNm).toFixed(1)} 0 V220"/>`;
  $("#terrainProfile").innerHTML=`<svg viewBox="0 0 800 220" preserveAspectRatio="none" aria-hidden="true">${grid}${critical}${ground}${mora}${flight}${markers}</svg>`;
  $("#terrainProfile").setAttribute("aria-label",pt?`Perfil estimado: FL${result.fl}; ${t(statusKey)}; ${terrain.missingCount} trechos sem MORA.`:`Estimated profile: FL${result.fl}; ${t(statusKey)}; ${terrain.missingCount} legs without MORA.`);
  const missing=terrain.legs.filter((leg)=>!Number.isFinite(leg.feet));
  $("#terrainManual").hidden=!missing.length;
  $("#terrainManual").innerHTML=missing.length?`<h3>${pt?"MORA ausente no OFP":"MORA missing from OFP"}</h3><p>${pt?"Informe a altitude mínima verificada e a fonte para cada trecho; não usamos o relevo amostrado para preencher MORA.":"Enter a verified minimum altitude and source for each leg; sampled terrain never fills MORA."}</p><div class="terrain-manual-list">${missing.map((leg)=>{const saved=state.manualTerrainMora[leg.index]||{};return `<form data-terrain-leg="${leg.index}"><span>${escapeHtml(leg.from.ident||"—")} → ${escapeHtml(leg.to.ident||"—")}<br><small>${number(leg.startNm)}–${number(leg.endNm)} NM</small></span><label>${pt?"Mínimo (ft)":"Minimum (ft)"}<input name="feet" type="number" min="1" max="60000" step="100" inputmode="numeric" value="${Number.isFinite(Number(saved.feet))?Number(saved.feet):""}" required></label><label>${pt?"Fonte verificada":"Verified source"}<input name="source" maxlength="80" value="${escapeHtml(saved.source||"")}" placeholder="${pt?"Carta / AIP":"Chart / AIP"}" required></label><button type="submit">${pt?"Aplicar":"Apply"}</button></form>`;}).join("")}</div>`:"";
}

async function refreshElevationProfile() {
  if(!state.plan||state.elevationLoading)return;
  const plan=state.plan;
  state.elevationLoading=true;state.elevationError=null;render();
  try { const profile=await fetchElevationProfile(plan);if(state.plan===plan)state.elevationProfile=profile; }
  catch(error) { if(state.plan===plan)state.elevationError=error.message||"API unavailable"; }
  finally { if(state.plan===plan){state.elevationLoading=false;render();} }
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
    <p class="step-comparison-note">${proposed?t("stepCaveat"):`${t(reasonKey)} ${t("stepCaveat")}`}</p>`;
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

  renderStepComparison(stepPlan);

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

function renderScenarioComparison(comparison,selected) {
  $("#scenarioAName").textContent=`A · ${state.mode} · FL${selected.fl}`;
  $("#scenarioBName").textContent=`B · ${state.scenarioB.mode} · FL${state.scenarioB.altitudeFt/100}`;
  $("#scenarioBMode").value=state.scenarioB.mode;
  if(!$("#scenarioBAltitude").options.length) $("#scenarioBAltitude").innerHTML=ALTITUDES_FT.map((altitude)=>`<option value="${altitude}">FL${altitude/100}</option>`).join("");
  $("#scenarioBAltitude").value=String(state.scenarioB.altitudeFt);
  if(document.activeElement!==$("#scenarioBPayload")) $("#scenarioBPayload").value=number(weightValue(state.scenarioB.payloadLb),0).replace(/\D/g,"");
  if(document.activeElement!==$("#scenarioBFuel")) $("#scenarioBFuel").value=number(fuelValue(state.scenarioB.fuelOnboardGal),1).replace(/[^0-9,.-]/g,"").replace(",",".");
  $("#scenarioBWeightUnit").textContent=weightLabel();
  $("#scenarioBFuelUnit").textContent=fuelLabel();
  const statusKey=(status)=>status==="viable"?"viable":status==="marginal"?"marginalStatus":"notViable";
  const statusCell=(result)=>`<strong class="scenario-margin-value" data-status="${escapeHtml(result.feasibility.status)}">${signedNumber(fuelValue(result.feasibility.fuelMarginGal),1,` ${fuelLabel()}`)}<small>${escapeHtml(t(statusKey(result.feasibility.status)))}</small></strong>`;
  const row=(label,a,b,delta)=>`<div class="scenario-matrix-row" role="row"><span class="scenario-metric" role="rowheader">${label}</span><span class="scenario-value" role="cell">${a}</span><span class="scenario-value" role="cell">${b}</span><span class="scenario-change" role="cell"><span class="scenario-mobile-delta">Δ </span>${delta}</span></div>`;
  $("#scenarioMatrixRows").innerHTML=[
    row(`${iconMarkup("fuel")}${escapeHtml(t("fuel"))}`,formatFuel(comparison.a.fuelRequiredGal,1),formatFuel(comparison.b.fuelRequiredGal,1),signedNumber(fuelValue(comparison.delta.fuelGal),1,` ${fuelLabel()}`)),
    row(`${iconMarkup("clock-3")}ETE`,formatTime(comparison.a.tripTimeHr),formatTime(comparison.b.tripTimeHr),signedNumber(comparison.delta.timeHr*60,0," min")),
    row(`${iconMarkup("navigation")}GS`,`${number(comparison.a.gsKt)} kt`,`${number(comparison.b.gsKt)} kt`,signedNumber(comparison.delta.gsKt,0," kt")),
    row(`${iconMarkup("circle-check")}${escapeHtml(t("scenarioMargin"))}`,statusCell(comparison.a),statusCell(comparison.b),signedNumber(fuelValue(comparison.delta.marginGal),1,` ${fuelLabel()}`)),
  ].join("");
}

function renderLoadOptimizer(optimizer) {
  $("#loadRecommendedFuel").textContent=Number.isFinite(optimizer?.recommendedFuelGal)?formatFuel(optimizer.recommendedFuelGal,1):"—";
  $("#loadMaxFuel").textContent=optimizer.recommendedAltitudeFt?`${optimizer.mode} · FL${optimizer.recommendedAltitudeFt/100}`:"—";
  $("#loadMaxPayload").textContent=Number.isFinite(optimizer?.recommendedPayloadLb)?formatWeight(optimizer.recommendedPayloadLb):"—";
  $("#loadOptimizedWeight").textContent=Number.isFinite(optimizer?.optimizedWeightLb)?formatWeight(optimizer.optimizedWeightLb):"—";
  setStatusPill("#loadStatus",optimizer.feasible?"viable":"unavailable");
  $("#loadAdjustment").textContent=optimizer.payloadReductionLb>0?`${t("reducePayload")} ${formatWeight(optimizer.payloadReductionLb)}`:t("noAdjustment");
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

function missionStatusLabel(status){return t(status==="unknown"?"terrainUnknown":status==="not-viable"?"notViable":status==="viable"?"viable":"marginalStatus");}
function rideLabel(status){return status==="unknown"?t("weatherLimited"):t(status);}
function rideScoreLabel(turbulence){return turbulence.riskScore===null?"—":number(turbulence.riskScore);}
function oxygenLabel(status){return t(status==="not-required"?"oxygenNotRequired":status==="compliant"?"oxygenCompliant":status==="marginal"?"oxygenMarginal":"oxygenInsufficient");}
function weightBalanceLabel(status){return t(status==="viable"?"viable":status==="marginal"?"marginalStatus":"notViable");}

function missionReasonLabel(reason,result) {
  const pt=state.language==="pt-BR";
  if(reason.code==="terrain") return result.terrain.status==="unknown"?t("terrainUnknown"):`${pt?"Margem sobre MORA":"Margin above MORA"} · ${signedNumber(result.terrain.marginFt,0," ft")}`;
  if(reason.code==="weight-balance") return reason.blocking?(pt?"Peso ou CG fora do envelope":"Weight or CG outside envelope"):(pt?"Margem de peso/CG reduzida":"Reduced weight/CG margin");
  if(reason.code==="fuel") return reason.blocking?`${pt?"Combustível insuficiente":"Insufficient fuel"} · ${signedNumber(fuelValue(result.feasibility.fuelMarginGal),1,` ${fuelLabel()}`)}`:`${pt?"Margem de combustível reduzida":"Reduced fuel margin"} · ${formatFuel(result.feasibility.fuelMarginGal,1)}`;
  if(reason.code==="flight-profile") return reason.blocking?(pt?"Perfil vertical incompatível":"Vertical profile unavailable"):(pt?"Cruzeiro muito curto":"Cruise segment too short");
  if(reason.code==="icing") return `${pt?"Risco de gelo":"Icing risk"} · ${number(result.icing.riskScore)}%`;
  if(reason.code==="turbulence") return `${pt?"Turbulência":"Turbulence"} · ${rideLabel(result.turbulence.status)}`;
  if(reason.code==="oxygen") return reason.blocking?(pt?"Oxigênio insuficiente":"Insufficient oxygen"):(pt?"Oxigênio com pouca margem":"Low oxygen margin");
  if(reason.code==="alternate") return Number.isFinite(reason.detail)?`${pt?"Alternado com pouca margem":"Low alternate margin"} · ${formatFuel(reason.detail,1)} / ${formatFuel(PERFORMANCE.diversion.marginalFuelMarginGal,0)}`:(pt?"Alternado sem margem calculável":"Alternate margin unavailable");
  return `${pt?"Confiança do modelo":"Model confidence"} · ${number(result.confidence.score)}%`;
}

function missionPositiveReasons(result,excluded) {
  const pt=state.language==="pt-BR",items=[];
  if(!excluded.has("fuel")&&result.feasibility.fuelMarginGal>=0) items.push({code:"fuel",label:`${pt?"Combustível suficiente":"Fuel sufficient"} · ${formatFuel(result.feasibility.fuelMarginGal,1)}`,status:"ok"});
  if(!excluded.has("weight-balance")&&result.weightBalance?.status==="viable") items.push({code:"weight-balance",label:pt?"Peso e CG dentro do envelope":"Weight and CG within envelope",status:"ok"});
  if(!excluded.has("icing")&&result.icing.status==="low") items.push({code:"icing",label:pt?"Sem indicação relevante de gelo":"No relevant icing indication",status:"ok"});
  if(!excluded.has("oxygen")&&["compliant","not-required"].includes(result.oxygen.status)) items.push({code:"oxygen",label:pt?"Oxigênio adequado":"Oxygen adequate",status:"ok"});
  if(!excluded.has("terrain")&&result.terrain.status==="viable") items.push({code:"terrain",label:pt?"MORA da rota com margem":"Route MORA with margin",status:"ok"});
  return items;
}

function missionReasonIcon(code,status) {
  if(status==="critical") return "circle-x";
  if(status==="ok") return "circle-check";
  return ({fuel:"fuel","weight-balance":"scale","flight-profile":"area-chart",icing:"snowflake",turbulence:"waves",oxygen:"heart-pulse",terrain:"mountain",alternate:"map-pinned",confidence:"shield-check"})[code]||"triangle-alert";
}

function missionAction(score) {
  const pt=state.language==="pt-BR",code=score.reasons[0]?.code;
  if(code==="weight-balance") return pt?"Reduza ou redistribua a carga.":"Reduce or redistribute the load.";
  if(code==="fuel") return pt?"Aumente o combustível ou reduza a reserva/carga.":"Add fuel or reduce reserve/load.";
  if(code==="flight-profile") return pt?"Selecione um nível mais baixo.":"Select a lower flight level.";
  if(code==="oxygen") return pt?"Adicione a capacidade de O₂ recomendada.":"Add the recommended O₂ capacity.";
  if(code==="terrain") return score.reasons[0]?.detail===null?(pt?"Informe as altitudes mínimas dos trechos sem MORA.":"Enter minimum altitudes for legs without MORA."):(pt?"Selecione um nível acima da MORA crítica.":"Select a level above the critical MORA.");
  if(code==="icing") return pt?"Escolha um nível fora da faixa de gelo.":"Choose a level outside the icing band.";
  if(code==="turbulence") return pt?"Escolha o nível de menor turbulência.":"Choose the lowest-turbulence level.";
  if(code==="alternate") return pt?"Aumente a margem para o alternado.":"Increase the alternate margin.";
  if(code==="confidence") return pt?"Calibre o modelo após o voo.":"Calibrate the model after the flight.";
  return pt?"Nenhum ajuste obrigatório.":"No mandatory adjustment.";
}

function renderMissionScore(result,score) {
  const color=score.status==="viable"?"var(--green)":score.status==="marginal"?"var(--orange)":score.status==="unknown"?"var(--blue)":"var(--red)";
  $("#missionScoreLevel").textContent=`FL${result.fl}`;
  $("#missionScoreMode").textContent=state.mode;
  $("#missionScoreValue").textContent=score.score;
  $("#missionScoreStatus").textContent=missionStatusLabel(score.status);
  $("#missionScoreStatus").dataset.status=score.status;
  const dial=$("#missionScoreDial");
  dial.style.setProperty("--score",score.score);
  dial.style.setProperty("--score-color",color);
  dial.setAttribute("aria-label",`${t("missionScore")} ${score.score} ${state.language==="pt-BR"?"de":"of"} 100`);
  const primary=score.reasons[0];
  $("#missionScoreSummary").textContent=primary?missionReasonLabel(primary,result):(state.language==="pt-BR"?"Parâmetros principais dentro das margens.":"Main parameters are within margins.");
  const negatives=score.reasons.filter((reason)=>reason.impact>=4).slice(0,3).map((reason)=>({
    code:reason.code,
    label:missionReasonLabel(reason,result),
    status:reason.blocking?"critical":"penalty",
    value:reason.blocking?t("critical"):`−${reason.impact}`,
  }));
  const excluded=new Set(negatives.map((item)=>item.code));
  const items=[...negatives,...missionPositiveReasons(result,excluded)].slice(0,3);
  $("#missionScoreReasons").innerHTML=items.map((item)=>`<div class="${item.status}">${iconMarkup(missionReasonIcon(item.code,item.status),"reason-icon")}<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value||"OK")}</strong></div>`).join("");
  $("#missionScoreAction").textContent=missionAction(score);
}

function renderMissionStrip(result,missionScore) {
  $("#missionRiskValue").textContent=`${missionScore.score}/100`;
  $("#missionRiskStatus").textContent=missionStatusLabel(missionScore.status);
  $("#missionRiskValue").dataset.status=missionScore.status;
  $("#confidenceValue").textContent=`${result.confidence.score}%`;
  $("#confidenceMeta").textContent=`${result.confidence.sampleCount} ${t("flights")}`;
  $("#rideValue").textContent=rideLabel(result.turbulence.status);
  $("#rideMeta").textContent=result.turbulence.riskScore===null?t("weatherLimited"):`${rideScoreLabel(result.turbulence)}/100`;
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

function renderConfidenceEnvelope(confidence) {
  $("#confidenceScore").textContent=`${confidence.score}%`;
  $("#confidenceSamples").textContent=confidence.sampleCount?`${confidence.sampleCount} ${t("flights")}`:t("noDebriefs");
  const rows=[
    ["fuel",t("fuel"),formatFuel(confidence.fuel.low,1),formatFuel(confidence.fuel.nominal,1),formatFuel(confidence.fuel.high,1)],
    ["clock-3","ETE",formatTime(confidence.time.low),formatTime(confidence.time.nominal),formatTime(confidence.time.high)],
    ["gauge","TAS",`${number(confidence.tas.low)} kt`,`${number(confidence.tas.nominal)} kt`,`${number(confidence.tas.high)} kt`],
    ["move-up-right",state.language==="pt-BR"?"Alcance":"Range",`${number(confidence.range.low)} NM`,`${number(confidence.range.nominal)} NM`,`${number(confidence.range.high)} NM`],
  ];
  $("#confidenceEnvelope").innerHTML=`<div class="envelope-head"><span></span><span>LOW</span><span>${t("expected")}</span><span>HIGH</span></div>${rows.map((row)=>`<div class="envelope-row"><b>${iconMarkup(row[0])}${escapeHtml(row[1])}</b><span>${row[2]}</span><strong>${row[3]}</strong><span>${row[4]}</span></div>`).join("")}`;
}

function renderRideOptimizer(analysis,selected) {
  const eligible=analysis.results.filter(operationallyAvailable);
  const best=[...(eligible.length?eligible:analysis.results)].sort((a,b)=>(a.turbulence.riskScore??Infinity)-(b.turbulence.riskScore??Infinity)||b.score-a.score)[0];
  const source=best.turbulence.confidence==="weather"?t("icingWeather"):best.turbulence.confidence==="simbrief"?t("simbriefShear"):best.turbulence.confidence==="estimated"?t("weatherEstimated"):t("weatherLimited");
  $("#rideHeadline").textContent=`FL${best.fl} · ${rideLabel(best.turbulence.status)}`;
  $("#rideSummaryMeta").textContent=`${rideScoreLabel(best.turbulence)}${best.turbulence.riskScore===null?"":"/100"} · ${source}`;
  $("#rideLevels").innerHTML=analysis.results.map((item)=>`<button type="button" data-ride-level="${item.altitudeFt}" ${!operationallyAvailable(item)?"disabled":""} class="ride-level ${item.turbulence.status} ${item.altitudeFt===selected.altitudeFt?"selected":""}"><b>${iconMarkup("wind")}FL${item.fl}</b><span>${rideLabel(item.turbulence.status)}</span><i><em style="width:${item.turbulence.riskScore??0}%"></em></i><strong>${rideScoreLabel(item.turbulence)}</strong></button>`).join("");
  $$('[data-ride-level]:not(:disabled)').forEach((button)=>button.addEventListener("click",()=>{state.selectedAltitudeFt=Number(button.dataset.rideLevel);render();}));
}

function renderDebrief(result) {
  $("#debriefFuelUnit").textContent=fuelLabel();
  if(document.activeElement!==$("#debriefTime")&&!$("#debriefTime").value) $("#debriefTime").value=String(Math.round(result.tripTimeHr*60));
  if(document.activeElement!==$("#debriefFuel")&&!$("#debriefFuel").value) $("#debriefFuel").value=number(fuelValue(result.tripFuelGal),1).replace(",",".");
  const summary=summarizeDebriefs(state.debriefs);
  $("#debriefResult").innerHTML=summary?`<strong>${summary.accuracyScore}% ${t("accuracy")}</strong><span>${t("debriefAverage",summary.count)} · ETE ${signedNumber(summary.timeErrorPct,1,"%")} · ${t("fuel")} ${signedNumber(summary.fuelErrorPct,1,"%")}</span>`:`<strong>—</strong><span>${t("noDebriefs")}</span>`;
  $("#debriefHistory").innerHTML=state.debriefs.map((entry,index)=>({entry,index})).reverse().map(({entry,index})=>`<div><span>${iconMarkup("history")}${escapeHtml(entry.route)} · ${escapeHtml(entry.mode)} · FL${escapeHtml(entry.fl)}</span><button class="debrief-delete" type="button" data-delete-debrief="${index}" aria-label="${escapeHtml(t("deleteDebrief"))}: ${escapeHtml(entry.route)} · ${escapeHtml(entry.mode)} · FL${escapeHtml(entry.fl)}" title="${escapeHtml(t("deleteDebrief"))}">${iconMarkup("trash-2")}</button><strong>${number(entry.accuracyScore)}%</strong></div>`).join("");
}

function render() {
  applyTranslations();
  pendingMissionRecovery=null;
  $("#missionRecovery").hidden=true;
  const hasPlan=Boolean(state.plan);
  $("#plannerContent").hidden=!hasPlan;
  $("#feasibilityBadge").hidden=!hasPlan;
  $("#feasibilityMeta").hidden=!hasPlan;
  if(!hasPlan){$("#routeSource").textContent=t("simbrief");$("#routeTitle").innerHTML=`— <span>→</span> —`;$("#planTimestamp").textContent="—";refreshUiIcons();return;}
  const analysis=calculatePlan(state),recommended=analysis.winners.overall,selectedCandidate=analysis.results.find((r)=>r.altitudeFt===state.selectedAltitudeFt),selected=selectedCandidate||recommended,plan=state.plan,oxygenWeightLb=currentOxygenWeightLb();
  state.oxygen.altitudeFt=selected.altitudeFt;
  const navigation=calculateEtpPnr({...state,oxygenWeightLb,altitudeFt:selected.altitudeFt});
  const stepPlan=calculateStepClimbs({...state,oxygenWeightLb,initialAltitudeFt:selected.altitudeFt,manual:state.manual.active?state.manual:null,availableAltitudesFt:analysis.results.filter(operationallyAvailable).map((result)=>result.altitudeFt)});
  const alternateAdvice=calculateAlternateDiversion({...state,oxygenWeightLb,altitudeFt:selected.altitudeFt,waypointIndex:state.diversionWaypointIndex,manual:state.manual.active?state.manual:null});
  const missionScore=calculateMissionScore({result:selected,confidence:selected.confidence,alternateAdvice});
  if(missionScore.status==="viable"&&selected.terrain.status==="viable"&&selected.feasibility.status==="viable"&&selected.weightBalance?.status==="viable"&&(selected.icing.status==="low"||(selected.icing.status==="watch"&&selected.icing.confidence!=="weather"))&&["smooth","light"].includes(selected.turbulence.status)&&["not-required","compliant"].includes(selected.oxygen.status)&&(!alternateAdvice.destination||alternateAdvice.destination.status==="viable")) rememberViableMission();
  const scenarioComparison=compareScenarios({plan,calibration:state.calibration,scenarioA:{altitudeFt:selected.altitudeFt,mode:state.mode,payloadLb:state.payloadLb,fuelOnboardGal:state.fuelOnboardGal,oxygenWeightLb,reserveMinutes:state.reserveMinutes,powerSetting:state.powerSetting},scenarioB:{...state.scenarioB,oxygenWeightLb,reserveMinutes:state.reserveMinutes,powerSetting:{type:"AUTO"}}});
  const loadOptimizer=calculateModeLoadOptimization({...state,minimumPayloadLb:state.weightBalance.pilot,requireWeightBalanceViable:true,requireTerrainKnown:true});
  const glide=calculateGlideCorridor({plan,result:selected});
  $("#routeTitle").innerHTML=`${escapeHtml(plan.origin.icao)} <span>→</span> ${escapeHtml(plan.destination.icao)}`; $("#routeSource").textContent=t("simbrief"); $("#planTimestamp").textContent=`${number(plan.distanceNm)} NM · FL${Math.round(plan.plannedAltitudeFt/100)}`;
  const feasibility=selected.feasibility,feasibilityBadge=$("#feasibilityBadge"),badgeClass=missionScore.status==="not-viable"?"unavailable":missionScore.status==="unknown"?"unknown":missionScore.status==="viable"?"viable":"marginal";
  feasibilityBadge.textContent=missionStatusLabel(missionScore.status); feasibilityBadge.className=`feasibility-badge ${badgeClass}`;
  $("#feasibilityMeta").textContent=`${analysis.results.filter(operationallyAvailable).length}/${analysis.results.length} FL · ${signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`)} · ${signedNumber(weightValue(feasibility.weightMarginLb),0,` ${weightLabel()}`)}`;
  const power=selected.power,mapLabel=power.turboLimited?`${number(power.targetMapInHg,1)}→${number(power.availableMapInHg,1)}\"`:`${number(power.availableMapInHg,1)}\"`;
  $("#powerSettingValue").textContent=`${mapLabel} · ${number(power.rpm)} RPM`;
  $("#powerPercent").textContent=`${number(power.percentPower)}%`;
  $("#powerPercent").classList.toggle("limited",power.turboLimited);
  if(document.activeElement!==$("#manualMap")) $("#manualMap").value=Number(state.powerSetting.mapInHg).toFixed(1);
  if(document.activeElement!==$("#manualRpm")) $("#manualRpm").value=String(Math.round(state.powerSetting.rpm));
  $("#kpiAltitude").textContent=`FL${selected.fl}`; $("#kpiLevelMeta").textContent=t("selectedLevel"); $("#kpiFuel").innerHTML=`${number(fuelValue(selected.fuelRequiredGal),1)} <small>${state.fuelUnit==="l"?"L":"GAL"}</small>`; $("#kpiFuelDelta").textContent=`${signed(fuelValue(state.fuelOnboardGal-selected.fuelRequiredGal),` ${fuelLabel()}`)} ${t("margin")}`; $("#kpiTime").textContent=formatTime(selected.tripTimeHr); $("#kpiGs").textContent=`${Math.round(selected.gsKt)} kt GS`; $("#kpiRange").innerHTML=`${number(selected.maxRangeNm)} <small>NM</small>`; $("#kpiSpecificRange").textContent=`${number(state.fuelUnit==="l"?selected.specificRangeNmGal/3.785411784:selected.specificRangeNmGal,1)} NM/${state.fuelUnit==="l"?"L":"gal"}`;
  renderTerrainProfile(plan,selected); renderPerformanceRanking(analysis.results,recommended,selected); renderIcingSummary(analysis); renderLevelCards(analysis.results,recommended,selected); renderFuel(selected); renderFlightTools(plan,navigation,stepPlan,selected); renderAlternateAdvisor(plan,alternateAdvice); renderScenarioComparison(scenarioComparison,selected); renderLoadOptimizer(loadOptimizer); renderGlideCorridor(plan,glide); renderMissionStrip(selected,missionScore); renderMissionScore(selected,missionScore); renderOxygenPlanner(analysis); renderWeightBalance(selected.weightBalance); renderConfidenceEnvelope(selected.confidence); renderRideOptimizer(analysis,selected); renderDebrief(selected);
  $("#phaseLevel").textContent=`${t("selectedLevel")} · FL${selected.fl}`;
  $("#climbStats").textContent=`${Math.round(selected.climb.timeHr*60)} min · ${formatFuel(selected.climb.fuelGal,1)} · ${number(selected.climb.power.availableMapInHg,1)}\" / ${number(selected.climb.power.rpm)}`; $("#cruiseStats").textContent=`${Math.round(selected.cruiseTimeHr*60)} min · ${formatFuel(selected.cruiseFuelGal,1)} · ${number(selected.power.availableMapInHg,1)}\" / ${number(selected.power.rpm)}`; $("#descentStats").textContent=`${Math.round(selected.descent.timeHr*60)} min · ${formatFuel(selected.descent.fuelGal,1)} · ${number(PERFORMANCE.powerModel.phases.descent.mapInHg,1)}\" / ${number(PERFORMANCE.powerModel.phases.descent.rpm)}`;
  $("#fuelRequiredSide").textContent=formatFuel(selected.fuelRequiredGal,1); $("#selectionNote").textContent=`FL${selected.fl} · ${formatFuel(selected.fuelRequiredGal,1)} · ${formatTime(selected.tripTimeHr)} · ${missionStatusLabel(missionScore.status)}`;
  $("#payloadOutput").textContent=formatWeight(state.payloadLb); $("#fuelOutput").textContent=formatFuel(state.fuelOnboardGal,0);
  const weight=AIRCRAFT.emptyWeightLb+state.payloadLb+state.fuelOnboardGal*AIRCRAFT.fuelDensityLbGal+oxygenWeightLb,delta=AIRCRAFT.maxGrossWeightLb-weight; $("#weightValue").textContent=formatWeight(weight); $("#weightBar").style.width=`${Math.min(100,weight/AIRCRAFT.maxGrossWeightLb*100)}%`; $("#weightBar").style.background=delta<0?"#dc5661":"linear-gradient(90deg,var(--blue),var(--green))"; $("#weightNote").textContent=`${formatWeight(Math.abs(delta))} ${t(delta>=0?"belowMax":"aboveMax")} · CG ${number(selected.weightBalance.takeoff.cgIn,2)}→${number(selected.weightBalance.landing.cgIn,2)} in`; $("#weightNote").style.color=delta<0||selected.weightBalance.status==="unavailable"?"var(--red)":"";
  refreshUiIcons();
}

$$('[data-language]').forEach((button)=>button.addEventListener("click",()=>{state.language=button.dataset.language;localStorage.setItem("velocityxl.language",state.language);render();}));
$$('.font-switch button[data-font-size]').forEach((button)=>button.addEventListener("click",()=>{state.fontSize=button.dataset.fontSize;localStorage.setItem("velocityxl.fontSize",state.fontSize);applyTranslations();}));
$$('[data-weight-unit]').forEach((button)=>button.addEventListener("click",()=>{state.weightUnit=button.dataset.weightUnit;localStorage.setItem("velocityxl.weightUnit",state.weightUnit);render();}));
$$('[data-fuel-unit]').forEach((button)=>button.addEventListener("click",()=>{const previous=state.fuelUnit,next=button.dataset.fuelUnit,observed=$("#observedFuelFlow"),debrief=$("#debriefFuel"),value=Number(observed.value),debriefValue=Number(debrief.value);state.fuelUnit=next;if(Number.isFinite(value)&&value>0&&previous!==next)observed.value=(next==="l"?value*3.785411784:value/3.785411784).toFixed(1);if(Number.isFinite(debriefValue)&&debriefValue>0&&previous!==next)debrief.value=(next==="l"?debriefValue*3.785411784:debriefValue/3.785411784).toFixed(1);localStorage.setItem("velocityxl.fuelUnit",state.fuelUnit);render();}));
$$('[data-mode]').forEach((button)=>button.addEventListener("click",()=>{state.mode=button.dataset.mode;state.selectedAltitudeFt=null;$$('[data-mode]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-power-type]').forEach((button)=>button.addEventListener("click",()=>{const type=button.dataset.powerType;if(type==="MANUAL"&&state.powerSetting.type!=="MANUAL"){const mode=PERFORMANCE.modes[state.mode];state.powerSetting={type,mapInHg:mode.mapInHg,rpm:mode.rpm};}else{state.powerSetting={...state.powerSetting,type};}state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();}));
$("#manualMap").addEventListener("input",(event)=>{state.powerSetting.mapInHg=Math.min(AIRCRAFT.maxManifoldInHg,Math.max(PERFORMANCE.powerModel.minimumMapInHg,Number(event.target.value)||PERFORMANCE.modes[state.mode].mapInHg));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$("#manualRpm").addEventListener("input",(event)=>{state.powerSetting.rpm=Math.min(AIRCRAFT.maxRpm,Math.max(PERFORMANCE.powerModel.minimumRpm,Number(event.target.value)||PERFORMANCE.modes[state.mode].rpm));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$$('[data-metric]').forEach((button)=>button.addEventListener("click",()=>{state.metric=button.dataset.metric;$$('[data-metric]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$("#performanceChart").addEventListener("click",(event)=>{
  const toggle=event.target.closest("[data-ranking-toggle]");
  if(toggle){
    state.rankingExpanded=!state.rankingExpanded;
    toggle.setAttribute("aria-expanded",String(state.rankingExpanded));
    toggle.textContent=`${t("rankingOthers",$("#rankingRest").children.length)} · ${t(state.rankingExpanded?"rankingHide":"rankingShow")}`;
    $("#rankingRest").dataset.collapsed=String(!state.rankingExpanded);
    return;
  }
  const level=event.target.closest("[data-rank-altitude]");
  if(!level||level.disabled) return;
  state.selectedAltitudeFt=Number(level.dataset.rankAltitude);
  render();
});
$$('[data-tool-view]').forEach((button)=>button.addEventListener("click",()=>{$$('[data-tool-view]').forEach((item)=>item.classList.toggle("active",item===button));$$('[data-tool-panel]').forEach((panel)=>panel.classList.toggle("active",panel.dataset.toolPanel===button.dataset.toolView));if(button.dataset.toolView==="glide")centerGlideRoutePoint();}));
$("#payloadInput").addEventListener("input",(event)=>{setPayloadAndScaleStations(Number(event.target.value));render();}); $("#fuelInput").addEventListener("input",(event)=>{state.fuelOnboardGal=Number(event.target.value);render();}); $("#reserveInput").addEventListener("change",(event)=>{state.reserveMinutes=Number(event.target.value);render();});
$("#diversionWaypoint").addEventListener("change",(event)=>{state.diversionWaypointIndex=Number(event.target.value);render();});
$("#scenarioBMode").addEventListener("change",(event)=>{state.scenarioB.mode=event.target.value;render();});
$("#scenarioBAltitude").addEventListener("change",(event)=>{state.scenarioB.altitudeFt=Number(event.target.value);render();});
$("#scenarioBPayload").addEventListener("input",(event)=>{state.scenarioB.payloadLb=Math.max(0,weightFromDisplay(Number(event.target.value)||0));render();});
$("#scenarioBFuel").addEventListener("input",(event)=>{state.scenarioB.fuelOnboardGal=clamp(fuelFromDisplay(Number(event.target.value)||0),0,AIRCRAFT.usableFuelGal);render();});
$("#applyScenarioB").addEventListener("click",()=>{state.mode=state.scenarioB.mode;setPayloadAndScaleStations(state.scenarioB.payloadLb);state.fuelOnboardGal=state.scenarioB.fuelOnboardGal;state.selectedAltitudeFt=state.scenarioB.altitudeFt;state.powerSetting={type:"AUTO",mapInHg:PERFORMANCE.modes[state.mode].mapInHg,rpm:PERFORMANCE.modes[state.mode].rpm};$("#payloadInput").value=String(Math.round(state.payloadLb/10)*10);$("#fuelInput").value=String(Math.round(state.fuelOnboardGal));$$('[data-mode]').forEach((button)=>button.classList.toggle("active",button.dataset.mode===state.mode));localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$("#glideRoute").addEventListener("click",(event)=>{const button=event.target.closest("[data-glide-index]");if(!button||!currentGlideCorridor)return;state.glideSampleIndex=Number(button.dataset.glideIndex);renderGlideFocus(currentGlideCorridor);centerGlideRoutePoint();});
function applyMissionOptimization(optimizer) {
  state.mode=optimizer.mode;
  state.oxygen={...state.oxygen,...optimizer.oxygen,altitudeFt:optimizer.recommendedAltitudeFt};
  state.fuelOnboardGal=clamp(optimizer.recommendedFuelGal,0,AIRCRAFT.usableFuelGal);
  state.weightBalance=optimizer.weightBalance||scaleWeightBalanceToPayload(state.weightBalance,optimizer.recommendedPayloadLb);
  persistWeightBalance();
  state.selectedAltitudeFt=optimizer.recommendedAltitudeFt;
  state.powerSetting={type:"AUTO",mapInHg:PERFORMANCE.modes[state.mode].mapInHg,rpm:PERFORMANCE.modes[state.mode].rpm};
  state.manual.fuelRemainingGal=state.fuelOnboardGal;
  $("#payloadInput").value=String(state.payloadLb);
  $("#fuelInput").value=String(state.fuelOnboardGal);
  $$('[data-mode]').forEach((button)=>button.classList.toggle("active",button.dataset.mode===state.mode));
  localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));
  if(optimizer.achievedStatus==="viable") rememberViableMission();
  render();
}

$("#optimizeMission").addEventListener("click",()=>{
  const optimizer=calculateMissionOptimization({...state,requireTerrainKnown:true});
  if(!optimizer.feasible){
    pendingMissionRecovery=calculateMissionRecovery({...state,requireTerrainKnown:true},lastViableMission);
    $("#missionRecoveryReason").textContent=optimizationFailureText(optimizer);
    $("#missionRecoveryAction").hidden=!pendingMissionRecovery;
    $("#missionRecoveryWarning").hidden=!pendingMissionRecovery;
    $("#missionRecovery").hidden=false;
    return;
  }
  applyMissionOptimization(optimizer);
  showToast(`${t(optimizer.achievedStatus==="viable"?"viable":"marginalStatus")} · ${optimizer.mode} · FL${optimizer.recommendedAltitudeFt/100} · ${formatFuel(optimizer.recommendedFuelGal,1)}`);
});
$("#missionRecoveryAction").addEventListener("click",()=>{
  const recovered=calculateMissionRecovery({...state,requireTerrainKnown:true},lastViableMission);
  if(!recovered){
    $("#missionRecovery").hidden=true;
    pendingMissionRecovery=null;
    showToast(t("optimizationCombined"),true);
    return;
  }
  applyMissionOptimization(recovered);
  showToast(t("restoredViableMission"));
});

$("#oxygenAltitude").addEventListener("change",(event)=>{state.selectedAltitudeFt=Number(event.target.value);render();});
$("#oxygenBottle").addEventListener("change",(event)=>{state.oxygen.bottleModel=event.target.value;localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$("#oxygenBottleCount").addEventListener("change",(event)=>{state.oxygen.bottles=clamp(Number(event.target.value),0,4);localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$$('[data-oxygen-seat]').forEach((input)=>input.addEventListener("change",()=>{const keys=["pilot","copilot","rearLeft","rearCenter","rearRight"],index=Number(input.dataset.oxygenSeat),key=keys[index];state.weightBalance[key]=input.checked?Math.max(state.weightBalance[key],index===0?190:170):0;persistWeightBalance();render();}));
$$('[data-wb-key]').forEach((input)=>input.addEventListener("input",()=>{state.weightBalance[input.dataset.wbKey]=Math.max(0,weightFromDisplay(Number(input.value)||0));persistWeightBalance();render();}));
$("#randomizeWeightBalance").addEventListener("click",()=>{
  const randomized=randomizeWeightBalance({weightBalance:state.weightBalance,fuelOnboardGal:state.fuelOnboardGal,oxygenWeightLb:currentOxygenWeightLb()});
  if(!randomized){showToast(t("randomizeWeightBalanceFailed"),true);return;}
  state.weightBalance=randomized;
  persistWeightBalance();
  $("#payloadInput").value=String(state.payloadLb);
  render();
  showToast(t("randomizeWeightBalanceApplied"));
});
$("#applyOxygenRecommendation").addEventListener("click",()=>{const analysis=calculatePlan(state),target=analysis.results.find((item)=>item.altitudeFt===Number(state.oxygen.altitudeFt))||analysis.winners.overall,oxygen=calculateOxygenPlan({result:target,oxygen:state.oxygen});state.oxygen.bottles=clamp(oxygen.recommendedBottles,0,4);localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));render();});
$("#terrainRefresh").addEventListener("click",()=>{void refreshElevationProfile();});
$("#terrainManual").addEventListener("submit",(event)=>{
  const form=event.target.closest("form[data-terrain-leg]");if(!form)return;
  event.preventDefault();
  const feet=Number(form.elements.feet.value),source=String(form.elements.source.value||"").trim();
  if(!Number.isFinite(feet)||feet<=0||feet>60000||!source){showToast(state.language==="pt-BR"?"Informe altitude e fonte verificadas.":"Enter a verified altitude and source.",true);return;}
  state.manualTerrainMora[Number(form.dataset.terrainLeg)]={feet,source};
  render();
});

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
  const calibrationBefore={...(state.calibration[state.mode]||{tasFactor:1,fuelFlowFactor:1})};
  const debrief=calculateDebrief({result,actualTimeMinutes:Number($("#debriefTime").value),actualFuelGal:fuelFromDisplay(Number($("#debriefFuel").value)),currentCalibration:calibrationBefore});
  state.calibration[state.mode]=debrief.calibration;
  state.debriefs.push({route:`${state.plan.origin.icao}-${state.plan.destination.icao}`,mode:state.mode,fl:result.fl,accuracyScore:debrief.accuracyScore,timeErrorPct:debrief.timeErrorPct,fuelErrorPct:debrief.fuelErrorPct,calibrationBefore,calibrationAfter:{...debrief.calibration},date:new Date().toISOString()});
  state.debriefs=state.debriefs.slice(-PERFORMANCE.debrief.maximumHistory);
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  localStorage.setItem("velocityxl.debriefs",JSON.stringify(state.debriefs));
  render();
});

$("#debriefHistory").addEventListener("click",(event)=>{
  const button=event.target.closest("[data-delete-debrief]");
  if(!button)return;
  const index=Number(button.dataset.deleteDebrief);
  const updated=deleteDebrief(state,index);
  if(!updated)return;
  state.debriefs=updated.debriefs;
  state.calibration=updated.calibration;
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  localStorage.setItem("velocityxl.debriefs",JSON.stringify(state.debriefs));
  render();
});

function activatePlan(plan) {
  state.plan=plan;
  const savedViableMission=storedJson(viableMissionStorageKey,null);
  lastViableMission=savedViableMission?.planKey===missionPlanKey(plan)?{...savedViableMission,plan}:null;
  pendingMissionRecovery=null;
  state.selectedAltitudeFt=null;state.glideSampleIndex=null;
  state.manualTerrainMora={};state.elevationProfile=null;state.elevationLoading=false;state.elevationError=null;
  state.oxygen.altitudeFt=ALTITUDES_FT.reduce((best,altitude)=>Math.abs(altitude-plan.plannedAltitudeFt)<Math.abs(best-plan.plannedAltitudeFt)?altitude:best,ALTITUDES_FT[0]);
  state.manual={active:false,waypointIndex:0,distanceNm:0,fuelRemainingGal:state.fuelOnboardGal,altitudeFt:null};
  localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));
  render();
  void refreshElevationProfile();
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
