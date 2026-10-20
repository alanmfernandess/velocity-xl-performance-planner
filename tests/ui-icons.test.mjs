import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
const engine=readFileSync(new URL("../js/engine.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");

test("uses a pinned Lucide release and cache-busted local assets",()=>{
  assert.match(index,/lucide@0\.468\.0/);
  assert.match(index,/styles\.css\?v=\d{8}-\d+/);
  assert.match(index,/js\/app\.js\?v=\d{8}-\d+/);
});

test("oxygen recommendation button aligns with the adjacent controls",()=>{
  assert.match(css,/\.oxygen-controls > button \{ align-self:end; \}/);
  assert.match(css,/\.oxygen-controls select \{[^}]*height:36px/);
  assert.match(css,/\.text-button \{ height:36px/);
});

test("performance ranking replaces the tiny SVG and contains the metric selector on mobile",()=>{
  assert.match(index,/class="performance-ranking" id="performanceChart"/);
  assert.doesNotMatch(index,/class="chart-wrap" id="performanceChart"/);
  assert.match(app,/rankMetricLevels\(results\.map/);
  assert.match(app,/data-ranking-toggle/);
  assert.match(app,/data-rank-altitude/);
  assert.match(css,/\[data-view-panel="performance"\] \.chart-tabs \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(max-width:600px\) \{[\s\S]*?\.ranking-top \{ grid-template-columns:minmax\(0,1fr\)/);
});

test("flight phases stay live in the icing card after Route and Profile tabs are removed",()=>{
  assert.doesNotMatch(index,/data-view="(?:route|profile)"/);
  assert.doesNotMatch(index,/id="(?:routeMap|verticalProfile)"/);
  assert.match(index,/class="icing-summary" id="icingSummary"[\s\S]*?class="phase-footer"[\s\S]*?id="climbStats"[\s\S]*?id="cruiseStats"[\s\S]*?id="descentStats"/);
  assert.match(app,/\$\("#phaseLevel"\)\.textContent=`\$\{t\("selectedLevel"\)\} · FL\$\{selected\.fl\}`/);
  assert.match(app,/\$\("#climbStats"\)\.textContent=`\$\{Math\.round\(selected\.climb\.timeHr/);
  assert.match(app,/\$\("#cruiseStats"\)\.textContent=`\$\{Math\.round\(selected\.cruiseTimeHr/);
  assert.match(app,/\$\("#descentStats"\)\.textContent=`\$\{Math\.round\(selected\.descent\.timeHr/);
  assert.match(app,/renderMissionScore\(selected,missionScore\)/);
  assert.match(css,/\.phase-footer \{ border-top:1px solid var\(--line\)/);
  assert.match(css,/@media \(max-width:600px\) \{[\s\S]*?\.phase-grid \{ grid-template-columns:minmax\(0,1fr\)/);
});

test("ICE exposes route timing, terminal validity, alternate risk, and vertical exit",()=>{
  assert.match(index,/id="iceRiskWindow"[\s\S]*id="iceDestinationRisk"[\s\S]*id="iceAlternateRisk"[\s\S]*id="iceEscapeLevel"/);
  assert.match(app,/combinedCoverage[\s\S]*VALIDADE TERMINAL[\s\S]*METAR MAIS PRÓXIMO/);
  assert.match(engine,/terminalWeatherAtTime[\s\S]*alternateEtaOffsetMin[\s\S]*escapeAltitudeFt/);
});

test("A/B matrix keeps B controls above four aligned comparison metrics",()=>{
  assert.match(index,/class="scenario-inputs scenario-matrix-inputs"/);
  for(const id of ["scenarioBMode","scenarioBAltitude","scenarioBPayload","scenarioBFuel","scenarioAName","scenarioBName","scenarioMatrixRows","applyScenarioB"]){
    assert.match(index,new RegExp(`id="${id}"`));
  }
  assert.match(app,/\$\("#scenarioMatrixRows"\)\.innerHTML=\[/);
  assert.match(app,/comparison\.delta\.marginGal/);
  assert.match(css,/\.scenario-matrix-head,\.scenario-matrix-row \{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});

test("mission strip centers each complete information group",()=>{
  assert.match(css,/\.mission-strip div \{[^}]*justify-content:center; align-content:center/);
  assert.match(css,/\.mission-strip strong \{[^}]*grid-column:1\/-1/);
  assert.match(css,/\.mission-strip small \{[^}]*text-align:center/);
  assert.doesNotMatch(css,/\.mission-strip strong \{[^}]*position:absolute/);
});

test("A/B matrix stacks each metric for narrow screens without horizontal overflow",()=>{
  assert.match(css,/@media \(max-width:760px\) \{[\s\S]*?\.scenario-matrix-head,\.scenario-matrix-row \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.scenario-metric,\.scenario-change \{ grid-column:1\/-1; \}/);
  assert.match(css,/\.scenario-matrix \{[^}]*overflow:hidden/);
});

test("GLIDE focuses an OFP point and keeps the full route navigable on narrow screens",()=>{
  for(const id of ["glideRoute","glideFocusHint","glideFocusPoint","glideFocusRange","glideFocusMeta","glideFocusForward","glideFocusReverse","glideFocusAltitude"]){
    assert.match(index,new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(index,/id="glideChart"/);
  assert.match(app,/glide\.samples\.map\(\(sample,index\)=>/);
  assert.match(app,/state\.glideSampleIndex=Number\(button\.dataset\.glideIndex\)/);
  assert.match(app,/state\.selectedAltitudeFt=null;state\.glideSampleIndex=null;/);
  assert.match(css,/\.glide-route \{[^}]*overflow-x:auto/);
  assert.match(css,/\.glide-focus \{[^}]*grid-template-columns:minmax\(0,1\.2fr\)/);
  assert.match(css,/\.glide-focus \{ grid-template-columns:minmax\(0,1fr\); \}/);
});

test("STEP CLIMB compares complete remaining profiles and explains no-step cases",()=>{
  assert.match(index,/id="stepComparison" aria-live="polite"/);
  assert.doesNotMatch(index,/id="stepTrack"/);
  assert.match(app,/function renderStepComparison\(stepPlan\)/);
  assert.match(app,/stepPlan\.comparison/);
  assert.match(app,/stepNoNetGain/);
  assert.match(app,/availableAltitudesFt:analysis\.results\.filter\(operationallyAvailable\)/);
  assert.match(css,/\.step-profiles \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(max-width:600px\) \{[\s\S]*?\.step-profiles \{ grid-template-columns:minmax\(0,1fr\)/);
});

test("discrete icon rules cover every primary calculator surface",()=>{
  [
    ".brand-mark", ".kpi-grid .kpi:nth-child(1)", ".mission-strip > div:nth-child(1)",
    '[data-view-panel="performance"] .view-heading h2', '.phase-grid > div:nth-child(1) > span',
    '[data-tool-view="alternate"]', '[data-tool-view="compare"]', '[data-tool-view="load"]',
    '[data-tool-view="wb"]', '[data-tool-view="glide"]', '[data-tool-view="oxygen"]',
    '[data-tool-view="confidence"]', '[data-tool-view="ride"]', '[data-tool-view="cost"]',
    '[data-tool-view="steps"]', '.manual-update-strip-icon', ".section-heading h2",
  ].forEach((selector)=>assert.ok(app.includes(selector),`missing icon rule for ${selector}`));
});

test("flight cost uses a manual per-liter price and a bounded mission-score penalty",()=>{
  assert.match(index,/data-tool-view="cost"[\s\S]*data-tool-panel="cost"/);
  assert.match(index,/id="fuelPriceCurrency"[\s\S]*id="fuelPricePerLiter"/);
  assert.match(app,/localStorage\.setItem\("velocityxl\.financial"/);
  assert.match(app,/calculateFinancialImpact\(\{currentCost:cost,minimumViableCost\}\)/);
  assert.match(app,/preflightSnapshot=\{missionScore:structuredClone\(lastRenderedMissionScore\),financial:structuredClone\(lastRenderedFinancial\)\}/);
  assert.match(css,/\.cost-detail-grid \{[^}]*grid-template-columns:1fr 1fr/);
  assert.match(css,/@media \(max-width:700px\) \{[\s\S]*?\.cost-detail-grid \{ grid-template-columns:1fr/);
});

test("flight cost separates the OFP alternate scenario without changing planned cost",()=>{
  assert.match(index,/id="costAlternate"[\s\S]*id="costAlternatePlanned"[\s\S]*id="costAlternateTotal"/);
  assert.match(index,/id="costAlternateMissed"[\s\S]*id="costAlternateLeg"[\s\S]*id="costAlternateApproach"/);
  assert.match(app,/const alternate=Number\.isFinite\(alternateFuelGal\)/);
  assert.match(app,/formatMoney\(financial\.cost\+alternateData\.cost\)/);
  assert.match(app,/buildFinancialAnalysis\(plan,selected,alternateAdvice\)/);
  assert.match(css,/\.cost-alternate-grid \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("completed-flight calibration lives under Manual Update without a separate DEBRIEF tab",()=>{
  assert.doesNotMatch(index,/data-tool-view="debrief"|data-tool-panel="debrief"/);
  const manualPanel=index.slice(index.indexOf('data-tool-panel="update"'),index.indexOf('class="mission-strip"'));
  assert.match(manualPanel,/data-manual-mode="flight"[\s\S]*data-manual-mode="finished"/);
  assert.match(manualPanel,/data-manual-panel="flight"[\s\S]*id="manualUpdateForm"[\s\S]*id="calibrationForm"/);
  assert.match(manualPanel,/data-manual-panel="finished"[\s\S]*id="debriefForm"[\s\S]*id="debriefHistory"/);
  assert.match(app,/localStorage\.setItem\("velocityxl\.debriefs"/);
});

test("Manual Update keeps cruise calibration to TAS, fuel flow and OAT",()=>{
  assert.match(index,/id="observedTas"[\s\S]*id="observedFuelFlow"[\s\S]*id="observedOat"/);
  assert.doesNotMatch(index,/id="calibrationFactors"|data-debrief-phase|data-debrief-time|data-debrief-fuel/);
  assert.match(app,/observedOatC:Number\(\$\("#observedOat"\)\.value\)/);
});

test("flight tools open as individual cards in the page flow",()=>{
  assert.match(index,/class="tool-card-grid"/);
  assert.doesNotMatch(index,/class="tool-tabs"/);
  assert.match(app,/function setOpenTool\(key\)/);
  assert.match(app,/toolCardGrid\.insertBefore\(panel,toolCardButtons\[rowEnd\+1\]\|\|null\)/);
  assert.match(css,/\.flight-tools-panel \{ position:static; display:block; max-height:none; overflow:visible/);
  assert.match(css,/\.tool-card-grid \{ display:grid; grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test("Manual Update uses the approved situation strip outside the tool-card grid",()=>{
  assert.match(index,/class="manual-update-strip"[^>]*data-tool-trigger="update"/);
  assert.doesNotMatch(index,/data-tool-view="update"/);
  assert.match(index,/id="manualUpdateStripValue"[\s\S]*id="manualUpdateStripState"/);
  assert.match(app,/manualUpdateStrip\.addEventListener/);
  assert.match(app,/if\(key==="update"\)[\s\S]*flightToolsPanel\.insertBefore\(panel,toolCardsHeading\)/);
  assert.match(css,/\.manual-update-strip \{[^}]*grid-template-columns:36px minmax\(190px,1fr\) auto auto/);
});

test("dynamic operational cards use semantic line icons",()=>{
  assert.match(app,/missionReasonIcon/);
  assert.match(app,/level-state-icon/);
  assert.match(app,/fuel-legend-icon/);
  assert.match(app,/stationIcon/);
  assert.match(app,/iconMarkup\("wind"\)/);
  assert.match(app,/iconMarkup\("history"\)/);
});

test("RIDE exposes comfort preferences, route evidence, and explicit apply action",()=>{
  const ridePanel=index.slice(index.indexOf('data-tool-panel="ride"'),index.indexOf('data-tool-panel="ice"'));
  assert.match(ridePanel,/data-ride-preference="standard"/);
  assert.match(ridePanel,/data-ride-preference="comfort"/);
  assert.match(ridePanel,/data-ride-preference="maximum"/);
  assert.match(ridePanel,/id="applyRideRecommendation"/);
  assert.match(ridePanel,/id="rideRouteBand"/);
  assert.match(ridePanel,/id="ridePhaseList"/);
  assert.match(ridePanel,/id="rideEvidenceList"/);
  assert.match(app,/calculateRideRecommendation/);
  assert.match(app,/localStorage\.setItem\("velocityxl\.ridePreference"/);
});

test("icon styling remains discrete and preserves operational status colors",()=>{
  assert.match(css,/\.ui-icon\s*\{/);
  assert.match(css,/width:13px/);
  assert.match(css,/status-ui-icon/);
  assert.match(css,/color:var\(--green\)/);
  assert.match(css,/color:var\(--orange\)/);
  assert.match(css,/color:var\(--red\)/);
  assert.match(css,/\.level-item\.unavailable \.level-status \{ color:var\(--red\); \}/);
});
