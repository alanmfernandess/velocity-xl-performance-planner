import { AIRCRAFT, PERFORMANCE, ALTITUDES_FT, OXYGEN_CYLINDERS } from "./config.js?v=20261021-unified";
import { optimizeMission } from "./unified-optimization.js";
import { fetchGfsSnapshot } from "./weather/open-meteo.js";
import { fetchAwcSnapshot } from "./weather/awc.js";
import { createWeatherSnapshot } from "./weather/fusion.js";
import { calculateOxygenPlan, calculateRemainingFlightAssessment, calculateStepClimbs, clamp, deriveCalibration, migrateCalibration, normalizeWeightBalance, oxygenSystemWeightLb, randomizeWeightBalance, scaleWeightBalanceToPayload, weightBalancePayloadLb } from "./engine.js?v=20261021-unified";
import { fetchLatestOFP } from "./simbrief.js?v=20261018-08";

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
  [".manual-update-strip-icon","refresh-cw","inline"],
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
  ["#manualUpdateForm > label:nth-child(1) > span:first-child","map-pin","inline"],
  ["#manualUpdateForm > label:nth-child(2) > span:first-child","navigation","inline"],
  ["#manualUpdateForm > label:nth-child(3) > span:first-child","fuel","inline"],
  ["#manualUpdateForm .primary-button","refresh-cw","button"],
  [".calibration-head > span","sliders-horizontal","inline"],
  ["#calibrationForm > label:nth-of-type(1) > span:first-child","gauge","inline"],
  ["#calibrationForm > label:nth-of-type(2) > span:first-child","fuel","inline"],
  ["#calibrationForm .primary-button","check","button"],
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
Object.assign(COPY["pt-BR"], { flightTools:"Ferramentas de voo", chooseTool:"Escolha um módulo", closeTool:"Fechar", toolHintEtp:"Pontos de decisão", toolHintAlternate:"Alternados", toolHintCompare:"Comparar cenários", toolHintLoad:"Carga e combustível", toolHintWb:"Peso e centro de gravidade", toolHintGlide:"Alcance planado", toolHintOxygen:"Oxigênio", toolHintConfidence:"Confiança do modelo", toolHintRide:"Conforto de voo", toolHintIce:"Gelo por trecho", toolHintSteps:"Subida em etapas", toolHintUpdate:"Em voo · Voo concluído", thermalWindow:"Janela térmica", routeBand:"Faixa da rota", iceExposure:"Exposição", flightPhases:"Fases do voo", ofpEvidence:"Evidências do OFP", indexReading:"Leitura do índice" });
Object.assign(COPY["en-US"], { flightTools:"Flight tools", chooseTool:"Choose a module", closeTool:"Close", toolHintEtp:"Decision points", toolHintAlternate:"Alternates", toolHintCompare:"Compare scenarios", toolHintLoad:"Load and fuel", toolHintWb:"Weight and balance", toolHintGlide:"Glide range", toolHintOxygen:"Oxygen", toolHintConfidence:"Model confidence", toolHintRide:"Ride comfort", toolHintIce:"Icing by leg", toolHintSteps:"Step climb", toolHintUpdate:"In flight · Flight complete", thermalWindow:"Thermal window", routeBand:"Route band", iceExposure:"Exposure", flightPhases:"Flight phases", ofpEvidence:"OFP evidence", indexReading:"Index reading" });
Object.assign(COPY["pt-BR"], { manualFlightStatusTitle:"ATUALIZAÇÃO EM VOO", manualNoUpdate:"Sem atualização registrada", manualUpdateRecorded:"Atualização registrada" });
Object.assign(COPY["en-US"], { manualFlightStatusTitle:"IN-FLIGHT UPDATE", manualNoUpdate:"No update recorded", manualUpdateRecorded:"Update recorded" });
Object.assign(COPY["pt-BR"], { toolHintCost:"Custo e eficiência", fuelPrice:"Preço do combustível", currency:"Moeda", pricePerLiter:"Valor por litro", costUnassessed:"Informe o valor por litro para avaliar o custo.", estimatedFlightCost:"Custo estimado do voo", financialEfficiency:"Eficiência financeira", costPerNm:"Por NM", costPerHour:"Por hora", costPerPerson:"Por pessoa", requiredFuelValue:"Abastecimento requerido", costBreakdown:"Custo por fase", modeComparison:"Comparação de modos", possibleSavings:"Economia possível", costInFlight:"Projeção após atualização manual" });
Object.assign(COPY["en-US"], { toolHintCost:"Cost and efficiency", fuelPrice:"Fuel price", currency:"Currency", pricePerLiter:"Price per liter", costUnassessed:"Enter the price per liter to assess flight cost.", estimatedFlightCost:"Estimated flight cost", financialEfficiency:"Financial efficiency", costPerNm:"Per NM", costPerHour:"Per hour", costPerPerson:"Per person", requiredFuelValue:"Required fuel value", costBreakdown:"Cost by phase", modeComparison:"Mode comparison", possibleSavings:"Possible savings", costInFlight:"Projection after manual update" });
Object.assign(COPY["pt-BR"], { alternateCost:"Custo do alternado", plannedFlightCost:"Voo planejado", diversionIncrement:"Acréscimo se desviar", diversionTotal:"Total com alternado", missedApproach:"Arremetida", alternateLeg:"Trecho ao alternado", alternateApproach:"Aproximação" });
Object.assign(COPY["en-US"], { alternateCost:"Alternate cost", plannedFlightCost:"Planned flight", diversionIncrement:"Diversion increment", diversionTotal:"Total with alternate", missedApproach:"Missed approach", alternateLeg:"Leg to alternate", alternateApproach:"Approach" });

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
};
let lastRenderedMissionScore=null;
let lastRenderedFinancial=null;
let latestOptimizedMission=null;
let proposalOpen=false;
let weatherRequest=null;
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
    phaseCosts,alternate,fl:selected.fl,mode:state.mode,
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
  return [plan.source,plan.generatedAt,plan.origin?.icao,plan.destination?.icao,plan.route,plan.distanceNm].join("|");
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
  $$('[data-power-type]').forEach((button)=>button.classList.toggle("active",button.dataset.powerType===state.powerSetting.type));
  $("#powerManualFields").hidden=state.powerSetting.type!=="MANUAL";
  window.VelocityLayout?.translate();
}

function icingLabel(icing) {
  return t(icing.status==="avoid"?"icingAvoid":icing.status==="caution"?"icingCaution":icing.status==="watch"?"icingWatch":"icingLow");
}

function iceBlue(score, minimum=.08, maximum=.82) {
  const ratio=clamp((Number(score)||0)/100,0,1);
  return `rgba(37,129,217,${(minimum+(maximum-minimum)*ratio).toFixed(3)})`;
}

function renderIceModule(plan,analysis,selected) {
  const pt=state.language==="pt-BR",icing=selected.icing,score=clamp(Math.round(icing.riskScore||0),0,100);
  const weatherSources=["SIMBRIEF",state.weatherSnapshot?.sources?.OPEN_METEO?.status==="available"?"GFS":null,
    state.weatherSnapshot?.sources?.AWC?.status==="available"?"AWC":null].filter(Boolean).join(" · ");
  const exposureLabel=(minutes)=>minutes>0&&minutes<1?"<1 min":`${number(minutes||0,0)} min`;
  const source=icing.confidence==="weather"?t("icingWeather"):icing.confidence==="estimated"?t("weatherEstimated"):t("icingLimited");
  $("#iceModuleLevel").textContent=`ICE · FL${selected.fl}`;
  $("#iceModuleIndex").textContent=number(score);
  $("#iceModuleStatus").textContent=icingLabel(icing);
  $("#iceModuleConfidence").textContent=source;
  $("#iceIndexTrack").setAttribute("aria-valuenow",String(score));
  $("#iceIndexFill").style.width=`${score}%`;
  $("#iceIndexMarker").style.left=`${score}%`;
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
  $("#iceRiskWindow").textContent=firstRisk?`${firstRisk.from||"—"} → ${lastRisk?.to||firstRisk.to||"—"}`:(pt?"SEM TRECHO":"NO LEG");
  $("#iceRiskWindowMeta").textContent=firstRisk?`${number(firstRisk.startNm,0)}–${number(lastRisk?.endNm??firstRisk.endNm,0)} NM · ${number(riskSegments.reduce((sum,segment)=>sum+(segment.minutes||0),0),0)} min`:(pt?"abaixo do limite":"below threshold");
  const terminalView=(terminal)=>terminal?`${number(terminal.riskScore||0)}/100`:"—";
  $("#iceDestinationLabel").textContent=pt?"DESTINO":"DESTINATION";
  $("#iceDestinationRisk").textContent=terminalView(icing.destination);
  $("#iceDestinationMeta").textContent=icing.destination?`${exposureLabel(icing.destination.exposureMinutes)} · ${icingLabel(icing.destination)}`:"—";
  $("#iceAlternateLabel").textContent=pt?"ALTERNADO":"ALTERNATE";
  $("#iceAlternateRisk").textContent=icing.alternate?`${icing.alternate.ident} · ${terminalView(icing.alternate)}`:"—";
  $("#iceAlternateMeta").textContent=icing.alternate?`${exposureLabel(icing.alternate.exposureMinutes)} · ${icingLabel(icing.alternate)}`:(pt?"não informado":"not filed");
  const escapeButton=$("#iceEscapeLevel"),escapeAltitude=icing.escapeAltitudeFt;
  $("#iceEscapeLabel").textContent=pt?"SAÍDA VERTICAL":"VERTICAL EXIT";
  escapeButton.querySelector("strong").textContent=Number.isFinite(escapeAltitude)?`FL${Math.round(escapeAltitude/100)}`:"—";
  escapeButton.querySelector("small").textContent=Number.isFinite(escapeAltitude)?`ICE ${number(icing.escapeRiskScore)}/100`:(pt?"sem ganho ≥ 8":"no gain ≥ 8");
  escapeButton.disabled=true;
  escapeButton.onclick=null;
  const temperatureNm=temperatureSegments.reduce((sum,segment)=>sum+Math.max(0,(Number(segment.endNm)||0)-(Number(segment.startNm)||0)),0);
  $("#iceRouteExposure").textContent=segments.length?`${temperatureSegments.length}/${segments.length} · ${number(temperatureNm,0)} NM`:"—";
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
  $("#iceExposureTotal").textContent=exposureLabel(icing.exposureMinutes);
  $("#icePhaseList").innerHTML=phases.map((phase)=>`<div><span>${phase.label}</span><div><i style="width:${phase.minutes/maxPhase*100}%;background:${iceBlue(score,.28,.9)}"></i></div><strong>${exposureLabel(phase.minutes)}</strong></div>`).join("");

  const oats=segments.map((segment)=>segment.oatC).filter(Number.isFinite),evidenceCount=segments.filter((segment)=>segment.evidenceAvailable).length;
  const oatRange=oats.length?`${number(Math.min(...oats),0)}° a ${number(Math.max(...oats),0)}°C`:"—";
  const coverage=Math.round((icing.combinedCoverage||0)*100);
  const weatherPoints=[icing.originWeather,icing.destination?.weather,icing.alternate?.weather].filter(Boolean);
  const validForecasts=weatherPoints.filter((weather)=>weather.tafValid||Number.isFinite(weather.metarAgeMinutes)&&weather.metarAgeMinutes<=PERFORMANCE.icing.metarMaximumAgeMin).length;
  const ages=weatherPoints.map((weather)=>weather.metarAgeMinutes).filter(Number.isFinite);
  const freshest=ages.length?Math.min(...ages):NaN;
  const tafKinds=[...new Set(weatherPoints.flatMap((weather)=>weather.sources||[]).map((item)=>item.kind).filter((kind)=>!["metar","legacy"].includes(kind)))];
  const tafModes=tafKinds.length?tafKinds.map((kind)=>kind.replace("prob","PROB").replace("temporary",pt?"TEMPO":"TEMPO").replace("becoming","BECMG").replace("prevailing",pt?"PREDOMINANTE":"PREVAILING").toUpperCase()).join(" · "):"—";
  $("#iceEvidenceCoverage").textContent=`${coverage}%`;
  $("#iceEvidenceList").innerHTML=`<div><span>${pt?"TEMPERATURA":"TEMPERATURE"}</span><strong>${oatRange}</strong></div><div><span>${pt?"COBERTURA COMBINADA":"COMBINED COVERAGE"}</span><strong>${coverage}%</strong></div><div><span>${pt?"EVIDÊNCIA APLICÁVEL":"APPLICABLE EVIDENCE"}</span><strong>${evidenceCount}/${segments.length||0} ${pt?"trechos":"legs"}</strong></div><div><span>${pt?"VALIDADE TERMINAL":"TERMINAL VALIDITY"}</span><strong>${validForecasts}/${weatherPoints.length||0}</strong></div><div><span>${pt?"METAR MAIS PRÓXIMO":"NEAREST METAR"}</span><strong>${Number.isFinite(freshest)?`${number(freshest,0)} min`:"—"}</strong></div><div><span>${pt?"GRUPOS TAF":"TAF GROUPS"}</span><strong>${tafModes}</strong></div><div><span>${pt?"PROTEÇÃO":"PROTECTION"}</span><strong>${pt?"NÃO INSTALADA":"NOT INSTALLED"}</strong></div><div><span>${pt?"FONTE":"SOURCE"}</span><strong>${weatherSources} · ${source}</strong></div>`;

  const reading=score>=PERFORMANCE.icing.cautionScore?(pt?"ÍNDICE ELEVADO":"HIGH INDEX"):score>=PERFORMANCE.icing.watchScore?(pt?"ÍNDICE MODERADO":"MODERATE INDEX"):(pt?"ÍNDICE BAIXO":"LOW INDEX");
  $("#iceCompositionLabel").textContent=reading;
  $("#iceCompositionValue").textContent=`${number(score)}/100`;
  $("#iceCompositionFill").style.width=`${score}%`;
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

function renderFlightTools(plan,navigation,stepPlan,selected) {
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
  $("#manualFuel").value=number(fuelValue(state.manual.active?state.manual.fuelRemainingGal:state.fuelOnboardGal),1).replace(/[^0-9,.-]/g,"").replace(",",".");
  $("#manualFuelUnit").textContent=fuelLabel();
  const manualIdent=state.manual.active?plan.waypoints[state.manual.waypointIndex]?.ident:plan.origin.icao;
  const stripAltitudeFt=state.manual.active?state.manual.altitudeFt:selected.altitudeFt;
  const stripFuelGal=state.manual.active?state.manual.fuelRemainingGal:state.fuelOnboardGal;
  $("#manualUpdateStripValue").textContent=`FL${Math.round(stripAltitudeFt/100)} · ${formatFuel(stripFuelGal,1)} · ${manualIdent||plan.origin.icao} · ${number(state.manual.active?state.manual.distanceNm:0)} NM`;
  const stripState=$("#manualUpdateStripState");
  stripState.dataset.i18n=state.manual.active?"manualUpdateRecorded":"manualNoUpdate";
  stripState.textContent=t(stripState.dataset.i18n);
  $("#observedFuelFlowUnit").textContent=state.fuelUnit==="l"?"L/h":"gal/h";
  $("#calibrationMode").textContent=state.calibration.reference?.mode||state.mode;
  const factors=state.calibration;
  $("#calibrationFactors").textContent=`K1 ${number(factors.tasFactor||1,3)} · K2 ${number(factors.fuelFlowFactor||1,3)}`;
  $("#calibrationReference").textContent=state.calibration.reference?.altitudeFt?`FL${Math.round(state.calibration.reference.altitudeFt/100)} · ${number(state.calibration.reference.mapInHg,1)}″ · ${number(state.calibration.reference.rpm)} RPM`:(state.language==="pt-BR"?"Sem calibração de cruzeiro":"No cruise calibration");
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
  for(const [reason,count] of Object.entries(missing).sort((a,b)=>b[1]-a[1]).slice(0,2)){
    parts.push(`${mapping[reason]||reason} (${count})`);
  }
  if(mission?.diagnosticReasons?.includes("ALTERNATE_ICE_NOT_ASSESSED"))parts.push(pt?"Alternado sem dados ICE suficientes":"Alternate icing evidence insufficient");
  if(mission?.diagnosticReasons?.includes("ICE_SIGMET_VERTICAL_LIMIT_UNKNOWN"))parts.push(pt?"SIGMET sem limites verticais":"SIGMET vertical limits missing");
  if(mission?.diagnosticReasons?.includes("RIDE_EVIDENCE_LIMITED"))parts.push(pt?"RIDE sem dados suficientes":"RIDE evidence insufficient");
  if(mission?.diagnosticReasons?.includes("ALTERNATE_DISTANCE_UNKNOWN"))parts.push(pt?"Distância do alternado desconhecida":"Alternate distance unknown");
  const sources=coverage?.sources;
  const status=sources?[`GFS: ${sources.OPEN_METEO?.status||"—"}`,`AWC: ${sources.AWC?.status||"—"}`].join(" · "):"";
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
  if(code==="icing") return pt?"Escolha um nível fora da faixa de gelo.":"Choose a level outside the icing band.";
  if(code==="turbulence") return pt?"Escolha o nível de menor turbulência.":"Choose the lowest-turbulence level.";
  if(code==="alternate") return pt?"Aumente a margem para o alternado.":"Increase the alternate margin.";
  if(code==="financial") return pt?"Considere a configuração de menor custo.":"Consider the lowest-cost configuration.";
  if(code==="efficiency") return pt?"Avalie o consumo e o tempo da proposta.":"Review the proposal's fuel and time.";
  return pt?"Nenhum ajuste obrigatório.":"No mandatory adjustment.";
}

function renderMissionScore(result,score,mission=null) {
  const color=score.status==="viable"?"var(--green)":score.status==="marginal"?"var(--orange)":score.status==="unknown"?"var(--blue)":"var(--red)";
  $("#missionScoreLevel").textContent=`FL${result.fl}`;
  $("#missionScoreMode").textContent=state.mode;
  $("#missionScoreValue").textContent=score.partial?"—":score.score;
  $("#missionScoreStatus").textContent=missionStatusLabel(score.status);
  $("#missionScoreStatus").dataset.status=score.status;
  const dial=$("#missionScoreDial");
  dial.style.setProperty("--score",score.partial?0:score.score);
  dial.style.setProperty("--score-color",color);
  dial.setAttribute("aria-label",score.partial?`${t("missionScore")} · ${t("weatherLimited")}`:`${t("missionScore")} ${score.score} ${state.language==="pt-BR"?"de":"of"} 100`);
  const primary=score.reasons.find((reason)=>reason.blocking||reason.impact>=4);
  $("#missionScoreSummary").textContent=primary?missionReasonLabel(primary,result):(state.language==="pt-BR"?"Parâmetros principais dentro das margens.":"Main parameters are within margins.");
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
  $("#cruiseIcingValue").textContent=`${number(result.icing.riskScore)}/100`;
  $("#cruiseIcingValue").setAttribute("aria-label",`${t("iceProbabilityAria")}: ${number(result.icing.riskScore)} / 100`);
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

  $$('[data-ride-preference]').forEach((button)=>button.addEventListener("click",()=>{state.ridePreference=button.dataset.ridePreference;localStorage.setItem("velocityxl.ridePreference",state.ridePreference);render();}));
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
  $("#costFuelBasis").textContent=`${formatFuel(financial.consumedGal,1)} · ${state.mode} · FL${financial.fl}`;
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
  const optimizedMission=optimizeMission({...state,pricePerLiter:fuelPricePerLiter(),currency:state.financial.currency});
  latestOptimizedMission=optimizedMission;
  const hasSolution=Boolean(optimizedMission.selected)&&optimizedMission.status!=="unknown";
  $("#applyMissionProposal").disabled=!hasSolution||optimizedMission.status==="unknown";
  const selected=(optimizedMission.selected||optimizedMission.diagnostic).result,recommended=selected;
  const analysis={results:optimizedMission.candidates.map((candidate)=>candidate.result),winners:{overall:selected,performance:selected}};
  const navigation=optimizedMission.etpPnr;
  const stepPlan=calculateStepClimbs({...state,oxygenWeightLb,initialAltitudeFt:selected.altitudeFt,manual:state.manual.active?state.manual:null,availableAltitudesFt:analysis.results.filter(operationallyAvailable).map((result)=>result.altitudeFt)});
  const alternateAdvice=optimizedMission.alternate;
  const financial=buildFinancialAnalysis(plan,selected,alternateAdvice,optimizedMission);
  selected.financial=financial;
  const calculatedMissionScore=optimizedMission.missionScore;
  const missionScore=state.manual.active&&state.preflightSnapshot?.missionScore?state.preflightSnapshot.missionScore:calculatedMissionScore;
  selected.displayMissionScore=missionScore;
  if(!state.manual.active){lastRenderedMissionScore=structuredClone(calculatedMissionScore);lastRenderedFinancial=structuredClone(financial);}
  const glide=optimizedMission.glide;
  const proposal=$("#missionProposal");proposal.hidden=!proposalOpen;
  if(proposalOpen){
    const pt=state.language==="pt-BR";
    $("#proposalTitle").textContent=pt?"Recomendação integrada":"Integrated recommendation";
    $("#proposalSummary").textContent=`${state.mode} · ${plan.origin.icao} → ${plan.destination.icao}`;
    const status=$("#proposalStatus");status.textContent=missionStatusLabel(optimizedMission.status);status.className=`status-pill ${optimizedMission.status==="not-viable"?"unavailable":optimizedMission.status}`;
    $("#proposalFl").textContent=hasSolution?`FL${selected.fl}`:"—";
    $("#proposalFuel").textContent=hasSolution?formatFuel(optimizedMission.recommendedFuelGal,1):"—";
    $("#proposalTime").textContent=formatTime(selected.tripTimeHr);
    $("#missionPowerGrid").innerHTML=["climb","cruise","descent"].map((phase)=>{
      const profile=optimizedMission.powerProfile[phase],title={climb:pt?"SUBIDA":"CLIMB",cruise:pt?"CRUZEIRO":"CRUISE",descent:pt?"DESCIDA":"DESCENT"}[phase];
      return `<div><span>${title}</span><strong>${number(profile.power.availableMapInHg,1)}″ · ${number(profile.power.rpm)} RPM</strong><small>${number(profile.fuelFlowGph,1)} GPH · ${Math.round(profile.timeHr*60)} min</small></div>`;
    }).join("");
    $("#proposalIceFl").textContent=hasSolution?`FL${optimizedMission.iceAltitudeFt/100}`:"—";
    $("#proposalRideFl").textContent=hasSolution?`FL${optimizedMission.comfortAltitudeFt/100}`:"—";
    $("#proposalGlobalLabel").firstChild.textContent=pt?"GLOBAL ":"GLOBAL ";
    $("#proposalGlobalFl").textContent=hasSolution?`FL${selected.fl}`:"—";
    $("#proposalWb").textContent=weightBalanceLabel(selected.weightBalance.status);
    $("#proposalOxygen").textContent=oxygenLabel(selected.oxygen.status);
    const reasonText=missionScore.reasons.slice(0,2).map((reason)=>missionReasonLabel(reason,selected));
    if(optimizedMission.status==="unknown") reasonText.push(weatherDiagnosticText(optimizedMission));
    if(!hasSolution&&optimizedMission.status!=="unknown") reasonText.unshift(pt?"Nenhuma solução viável":"No feasible solution");
    $("#proposalReason").textContent=reasonText.join(" · ")||(`${pt?"Melhor equilíbrio no preset":"Best balance for preset"} ${state.mode}`);
    $("#proposalTerrain").textContent=pt?"Terreno e obstáculos não avaliados. Estimativa para simulador.":"Terrain and obstacles not assessed. Simulator estimate.";
    $("#applyMissionProposal").disabled=!hasSolution||optimizedMission.status==="unknown";
  }
  $("#routeTitle").innerHTML=`${escapeHtml(plan.origin.icao)} <span>→</span> ${escapeHtml(plan.destination.icao)}`; $("#routeSource").textContent=t("simbrief"); $("#planTimestamp").textContent=`${number(plan.distanceNm)} NM · FL${Math.round(plan.plannedAltitudeFt/100)}`;
  $("#layoutRouteMeta").textContent=`${plan.waypoints.length} ${state.language==="pt-BR"?"pontos":"fixes"} · ${number(plan.distanceNm)} NM`;
  $("#layoutRouteRail").innerHTML=plan.waypoints.map((fix,index)=>`<span title="${escapeHtml(fix.ident||`WPT${index+1}`)}" class="${index===0||index===plan.waypoints.length-1?"viable":"outside-cruise"}"></span>`).join("");
  const feasibility=selected.feasibility,feasibilityBadge=$("#feasibilityBadge"),badgeClass=missionScore.status==="not-viable"?"unavailable":missionScore.status==="unknown"?"unknown":missionScore.status==="viable"?"viable":"marginal";
  feasibilityBadge.textContent=missionStatusLabel(missionScore.status); feasibilityBadge.className=`feasibility-badge ${badgeClass}`;
  $("#kpiSelectedLevel").dataset.status=missionScore.status;
  $("#feasibilityMeta").textContent=hasSolution?`FL${selected.fl} · ${signedNumber(fuelValue(feasibility.fuelMarginGal),1,` ${fuelLabel()}`)} · ${signedNumber(weightValue(feasibility.weightMarginLb),0,` ${weightLabel()}`)}`:optimizedMission.status==="unknown"?(state.language==="pt-BR"?"Dados insuficientes":"Insufficient evidence"):(state.language==="pt-BR"?"Sem solução viável":"No feasible solution");
  const power=selected.power,mapLabel=power.turboLimited?`${number(power.targetMapInHg,1)}→${number(power.availableMapInHg,1)}\"`:`${number(power.availableMapInHg,1)}\"`;
  $("#powerSettingValue").textContent=`${mapLabel} · ${number(power.rpm)} RPM`;
  $("#powerPercent").textContent=`${number(power.percentPower)}%`;
  $("#powerPercent").classList.toggle("limited",power.turboLimited);
  if(document.activeElement!==$("#manualMap")) $("#manualMap").value=Number(state.powerSetting.mapInHg).toFixed(1);
  if(document.activeElement!==$("#manualRpm")) $("#manualRpm").value=String(Math.round(state.powerSetting.rpm));
  $("#kpiAltitude").textContent=hasSolution?`FL${selected.fl}`:"—"; $("#kpiLevelMeta").textContent=hasSolution?t("recommendedLevel"):optimizedMission.status==="unknown"?(state.language==="pt-BR"?"NÃO AVALIADO":"NOT ASSESSED"):(state.language==="pt-BR"?"SEM SOLUÇÃO":"NO SOLUTION"); $("#kpiFuel").innerHTML=`${number(fuelValue(selected.fuelRequiredGal),1)} <small>${state.fuelUnit==="l"?"L":"GAL"}</small>`; $("#kpiFuelDelta").textContent=`${signed(fuelValue(selected.feasibility.fuelMarginGal),` ${fuelLabel()}`)} ${t("margin")}`; $("#kpiTime").textContent=formatTime(selected.tripTimeHr); $("#kpiGs").textContent=`${Math.round(selected.gsKt)} kt GS`; $("#kpiRange").innerHTML=`${number(selected.maxRangeNm)} <small>NM</small>`; $("#kpiSpecificRange").textContent=`${number(state.fuelUnit==="l"?selected.specificRangeNmGal/3.785411784:selected.specificRangeNmGal,1)} NM/${state.fuelUnit==="l"?"L":"gal"}`;
  renderIceModule(plan,analysis,selected); renderFinancialCard(financial); renderFuel(selected); renderFlightTools(plan,navigation,stepPlan,selected); renderAlternateAdvisor(plan,alternateAdvice); renderGlideCorridor(plan,glide); renderMissionStrip(selected,missionScore); renderMissionScore(selected,missionScore,optimizedMission); renderOxygenPlanner(analysis); renderWeightBalance(optimizedMission.currentWeightBalance); renderRideOptimizer(optimizedMission,selected);
  $("#fuelRequiredSide").textContent=formatFuel(selected.fuelRequiredGal,1);
  $("#payloadOutput").textContent=formatWeight(state.payloadLb); $("#fuelOutput").textContent=formatFuel(state.fuelOnboardGal,0);
  const weight=AIRCRAFT.emptyWeightLb+state.payloadLb+state.fuelOnboardGal*AIRCRAFT.fuelDensityLbGal+oxygenWeightLb,delta=AIRCRAFT.maxGrossWeightLb-weight,currentWb=optimizedMission.currentWeightBalance; $("#weightValue").textContent=formatWeight(weight); $("#weightBar").style.width=`${Math.min(100,weight/AIRCRAFT.maxGrossWeightLb*100)}%`; $("#weightBar").style.background=delta<0?"#dc5661":"linear-gradient(90deg,var(--blue),var(--green))"; $("#weightNote").textContent=`${formatWeight(Math.abs(delta))} ${t(delta>=0?"belowMax":"aboveMax")} · CG ${number(currentWb.takeoff.cgIn,2)}→${number(currentWb.landing.cgIn,2)} in`; $("#weightNote").style.color=delta<0||currentWb.status==="unavailable"?"var(--red)":"";
  refreshUiIcons();
}

$$('[data-language]').forEach((button)=>button.addEventListener("click",()=>{state.language=button.dataset.language;localStorage.setItem("velocityxl.language",state.language);render();}));
$$('.font-switch button[data-font-size]').forEach((button)=>button.addEventListener("click",()=>{state.fontSize=button.dataset.fontSize;localStorage.setItem("velocityxl.fontSize",state.fontSize);applyTranslations();}));
$$('[data-weight-unit]').forEach((button)=>button.addEventListener("click",()=>{state.weightUnit=button.dataset.weightUnit;localStorage.setItem("velocityxl.weightUnit",state.weightUnit);render();}));
$$('[data-fuel-unit]').forEach((button)=>button.addEventListener("click",()=>{const previous=state.fuelUnit,next=button.dataset.fuelUnit,observed=$("#observedFuelFlow"),value=Number(observed.value);state.fuelUnit=next;if(Number.isFinite(value)&&value>0&&previous!==next)observed.value=(next==="l"?value*3.785411784:value/3.785411784).toFixed(1);localStorage.setItem("velocityxl.fuelUnit",state.fuelUnit);render();}));
$$('[data-mode]').forEach((button)=>button.addEventListener("click",()=>{state.mode=button.dataset.mode;state.selectedAltitudeFt=null;$$('[data-mode]').forEach((item)=>item.classList.toggle("active",item===button));render();}));
$$('[data-power-type]').forEach((button)=>button.addEventListener("click",()=>{const type=button.dataset.powerType;if(type==="MANUAL"&&state.powerSetting.type!=="MANUAL"){const mode=PERFORMANCE.modes[state.mode];state.powerSetting={type,mapInHg:mode.mapInHg,rpm:mode.rpm};}else{state.powerSetting={...state.powerSetting,type};}state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();}));
$("#manualMap").addEventListener("input",(event)=>{state.powerSetting.mapInHg=Math.min(AIRCRAFT.maxManifoldInHg,Math.max(PERFORMANCE.powerModel.minimumMapInHg,Number(event.target.value)||PERFORMANCE.modes[state.mode].mapInHg));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
$("#manualRpm").addEventListener("input",(event)=>{state.powerSetting.rpm=Math.min(AIRCRAFT.maxRpm,Math.max(PERFORMANCE.powerModel.minimumRpm,Number(event.target.value)||PERFORMANCE.modes[state.mode].rpm));state.selectedAltitudeFt=null;localStorage.setItem("velocityxl.powerSetting",JSON.stringify(state.powerSetting));render();});
const manualUpdateStrip=$("#tool-card-update");
const toolCardButtons=$$('[data-tool-view]');
const toolCardPanels=$$('[data-tool-panel]');
const toolHintKeys={etp:"toolHintEtp",alternate:"toolHintAlternate",wb:"toolHintWb",glide:"toolHintGlide",oxygen:"toolHintOxygen",ride:"toolHintRide",ice:"toolHintIce",cost:"toolHintCost",steps:"toolHintSteps",update:"toolHintUpdate"};
const initialTools={"planning:systems":"wb","planning:analyses":"cost","route:ice":"ice","route:ride":"ride","route:decisions":"etp"};
const selectedTools={...initialTools};
toolCardButtons.forEach((button)=>{
  const key=button.dataset.toolView,label=button.textContent;
  button.classList.add("tool-card");
  button.id=`tool-card-${key}`;
  button.removeAttribute("data-i18n");
  button.setAttribute("aria-controls",`tool-panel-${key}`);
  button.setAttribute("aria-expanded","false");
  button.innerHTML=`<span class="tool-card-label" ${key==="update"?'data-i18n="manualUpdate"':''}>${escapeHtml(label)}</span><small data-i18n="${toolHintKeys[key]}">${escapeHtml(t(toolHintKeys[key]))}</small>`;
  button.addEventListener("click",()=>setOpenTool(key));
});
toolCardPanels.forEach((panel)=>{
  const key=panel.dataset.toolPanel;
  panel.id=`tool-panel-${key}`;
  panel.setAttribute("role","region");
  panel.setAttribute("aria-labelledby",key==="update"?"tool-card-update":`tool-card-${key}`);
});
manualUpdateStrip.addEventListener("click",()=>window.VelocityLayout?.activate("flight","calibration"));
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
$("#payloadInput").addEventListener("input",(event)=>{setPayloadAndScaleStations(Number(event.target.value));render();}); $("#fuelInput").addEventListener("input",(event)=>{state.fuelOnboardGal=Number(event.target.value);render();}); $("#reserveInput").addEventListener("change",(event)=>{state.reserveMinutes=Number(event.target.value);render();});
$("#diversionWaypoint").addEventListener("change",(event)=>{state.diversionWaypointIndex=Number(event.target.value);render();});
$("#fuelPriceCurrency").addEventListener("change",(event)=>{state.financial.currency=event.target.value;localStorage.setItem("velocityxl.financial",JSON.stringify(state.financial));render();});
$("#fuelPricePerLiter").addEventListener("input",(event)=>{const value=Math.max(0,Number(event.target.value)||0);if(value>0)state.financial.prices[financialPriceKey()]=value;else delete state.financial.prices[financialPriceKey()];localStorage.setItem("velocityxl.financial",JSON.stringify(state.financial));render();});
$("#glideRoute").addEventListener("click",(event)=>{const button=event.target.closest("[data-glide-index]");if(!button||!currentGlideCorridor)return;state.glideSampleIndex=Number(button.dataset.glideIndex);renderGlideFocus(currentGlideCorridor);centerGlideRoutePoint();});
$("#optimizeMission").addEventListener("click",()=>{
  if(!state.plan)return;
  proposalOpen=true;
  render();
  $("#missionProposal").scrollIntoView({behavior:"smooth",block:"nearest"});
});
$("#applyMissionProposal").addEventListener("click",()=>{
  const mission=latestOptimizedMission;
  if(!mission?.selected||mission.status==="not-viable"||mission.status==="unknown")return;
  state.fuelOnboardGal=mission.recommendedFuelGal;
  state.selectedAltitudeFt=mission.recommendedAltitudeFt;
  state.manual.fuelRemainingGal=state.fuelOnboardGal;
  $("#fuelInput").value=String(state.fuelOnboardGal);
  localStorage.setItem("velocityxl.appliedMission",JSON.stringify({planKey:missionPlanKey(state.plan),mode:state.mode,fl:mission.selected.result.fl,fuelOnboardGal:state.fuelOnboardGal}));
  proposalOpen=false;
  render();
  showToast(state.language==="pt-BR"?"Configuração aplicada.":"Configuration applied.");
});
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
$("#applyOxygenRecommendation").addEventListener("click",()=>{
  const target=latestOptimizedMission?.selected.result;
  if(!target)return;
  const oxygen=calculateOxygenPlan({result:target,oxygen:state.oxygen});
  if(oxygen.recommendedBottles===null)return;
  state.oxygen.bottleModel=oxygen.recommendedBottleModel;
  state.oxygen.bottles=oxygen.recommendedBottles;
  localStorage.setItem("velocityxl.oxygen",JSON.stringify(state.oxygen));
  render();
});
function manualCalibrationReady(){
  const waypointIndex=Number($("#manualWaypoint").value),altitudeFt=Number($("#manualAltitude").value);
  const fuelInput=$("#manualFuel"),fuelRemainingGal=fuelFromDisplay(Number(fuelInput.value));
  return state.manual.active
    && Number.isInteger(waypointIndex) && waypointIndex>=0 && waypointIndex<state.plan.waypoints.length
    && ALTITUDES_FT.includes(altitudeFt)
    && fuelInput.value!=="" && fuelInput.validity.valid
    && Number.isFinite(fuelRemainingGal) && fuelRemainingGal>0 && fuelRemainingGal<=AIRCRAFT.usableFuelGal
    && waypointIndex===state.manual.waypointIndex && altitudeFt===state.manual.altitudeFt
    && fuelInput.value===number(fuelValue(state.manual.fuelRemainingGal),1).replace(/[^0-9,.-]/g,"").replace(",",".");
}

function updateCalibrationGate(){
  const ready=manualCalibrationReady();
  $("#calibrateObserved").disabled=!ready;
  $("#calibrationGate").textContent=t(ready?"calibrationReady":"calibrationNeedsUpdate");
}

$("#manualUpdateForm").addEventListener("input",updateCalibrationGate);
$("#manualUpdateForm").addEventListener("change",updateCalibrationGate);

$("#manualUpdateForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  const waypointIndex=Number($("#manualWaypoint").value),waypoint=state.plan.waypoints[waypointIndex];
  const altitudeFt=Number($("#manualAltitude").value),fuelRemainingGal=fuelFromDisplay(Number($("#manualFuel").value));
  if(!waypoint||!ALTITUDES_FT.includes(altitudeFt)||!Number.isFinite(fuelRemainingGal)||fuelRemainingGal<0||fuelRemainingGal>AIRCRAFT.usableFuelGal){showToast(t("calibrationNeedsUpdate"),true);return;}
  if(!state.manual.active&&lastRenderedMissionScore)state.preflightSnapshot={missionScore:structuredClone(lastRenderedMissionScore),financial:structuredClone(lastRenderedFinancial)};
  state.manual={active:true,waypointIndex,distanceNm:Number(waypoint.distanceNm)||0,fuelRemainingGal,altitudeFt};
  state.diversionWaypointIndex=waypointIndex;
  render();
});

$("#calibrationForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  if(!manualCalibrationReady()){showToast(t("calibrationNeedsUpdate"),true);updateCalibrationGate();return;}
  try {
    state.calibration=deriveCalibration({plan:state.plan,mode:state.mode,payloadLb:state.payloadLb,fuelRemainingGal:state.manual.fuelRemainingGal,oxygenWeightLb:currentOxygenWeightLb(),altitudeFt:state.manual.altitudeFt,observedTasKt:Number($("#observedTas").value),observedFuelFlowGph:fuelFromDisplay(Number($("#observedFuelFlow").value)),positionFix:state.plan.waypoints[state.manual.waypointIndex],powerSetting:state.powerSetting});
    localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
    render();
  } catch (error) {
    showToast(error.message==="CALIBRATION_ATMOSPHERE_UNAVAILABLE"?(state.language==="pt-BR"?"OFP sem temperatura neste ponto.":"No OFP temperature at this fix."):(state.language==="pt-BR"?"Leitura fora do intervalo de calibração.":"Calibration reading outside valid range."),true);
  }
});

$("#resetCalibration").addEventListener("click",()=>{
  state.calibration={tasFactor:1,fuelFlowFactor:1,reference:null};
  localStorage.setItem("velocityxl.calibration",JSON.stringify(state.calibration));
  $("#observedTas").value=""; $("#observedFuelFlow").value="";
  render();
});

function activatePlan(plan) {
  weatherRequest?.abort();
  state.plan=plan;
  state.weatherSnapshot=createWeatherSnapshot(plan);
  proposalOpen=false;
  state.selectedAltitudeFt=null;state.glideSampleIndex=null;
  try {
    const applied=JSON.parse(localStorage.getItem("velocityxl.appliedMission")||"null");
    if(applied?.planKey===missionPlanKey(plan)&&applied.mode===state.mode
      && ALTITUDES_FT.includes(applied.fl*100)
      && Number.isFinite(applied.fuelOnboardGal)&&applied.fuelOnboardGal>=0&&applied.fuelOnboardGal<=AIRCRAFT.usableFuelGal){
      state.selectedAltitudeFt=applied.fl*100;
      state.fuelOnboardGal=applied.fuelOnboardGal;
      $("#fuelInput").value=String(state.fuelOnboardGal);
    }
  } catch { /* Ignore malformed saved proposals while preserving other preferences. */ }
  state.preflightSnapshot=null;lastRenderedMissionScore=null;lastRenderedFinancial=null;
  state.manual={active:false,waypointIndex:0,distanceNm:0,fuelRemainingGal:state.fuelOnboardGal,altitudeFt:null};
  render();
  const request=new AbortController();weatherRequest=request;
  Promise.allSettled([fetchGfsSnapshot(plan,{signal:request.signal}),fetchAwcSnapshot({signal:request.signal})]).then((outcomes)=>{
    if(request.signal.aborted||state.plan!==plan)return;
    const [gfs,awc]=outcomes.map((outcome)=>outcome.status==="fulfilled"?outcome.value:null);
    const errors=outcomes.map((outcome,index)=>outcome.status==="rejected"?`${index===0?"OPEN_METEO":"AWC"}: ${outcome.reason?.message||"unavailable"}`:null).filter(Boolean);
    state.weatherSnapshot=createWeatherSnapshot(plan,{gfs,awc,errors});
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
