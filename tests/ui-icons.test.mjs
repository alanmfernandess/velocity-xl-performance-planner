import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertDeclaration, cssRule } from "./css-utils.mjs";

const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
const engine=readFileSync(new URL("../js/engine.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");

test("uses a pinned Lucide release and cache-busted local assets",()=>{
  assert.match(index,/lucide@0\.468\.0/);
  assert.match(index,/styles\.css\?v=[\w-]+/);
  assert.match(index,/js\/app\.js\?v=\d{8}-\d+/);
});

test("oxygen recommendation button aligns with the adjacent controls",()=>{
  assertDeclaration(css,".oxygen-controls > button","align-self","end");
  assertDeclaration(css,".oxygen-controls select","min-height","var(--control-height)");
  assertDeclaration(css,".text-button","min-height","var(--control-height)");
});

test("performance ranking replaces the tiny SVG and contains the metric selector on mobile",()=>{
  assert.match(index,/class="performance-ranking" id="performanceChart"/);
  assert.doesNotMatch(index,/class="chart-wrap" id="performanceChart"/);
  assert.match(app,/rankMetricLevels\(results\.map/);
  assert.match(app,/data-ranking-toggle/);
  assert.match(app,/data-rank-altitude/);
  assertDeclaration(css,'[data-view-panel="performance"] .chart-tabs',"grid-template-columns","repeat(3,minmax(0,1fr))");
  assertDeclaration(css,".ranking-top","grid-template-columns","minmax(0,1fr)",600);
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
  assertDeclaration(css,".phase-footer","border-top","1px solid var(--line)");
  assertDeclaration(css,".phase-grid","grid-template-columns","minmax(0,1fr)",600);
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
  assert.match(cssRule(css,".scenario-matrix-head"),/grid-template-columns:\s*minmax\(0,1fr\)/);
});

test("mission strip centers each complete information group",()=>{
  assertDeclaration(css,".mission-strip div","justify-content","center");
  assertDeclaration(css,".mission-strip div","align-content","center");
  assertDeclaration(css,".mission-strip strong","grid-column","1/-1");
  assertDeclaration(css,".mission-strip small","text-align","center");
  assert.doesNotMatch(cssRule(css,".mission-strip strong"),/position:\s*absolute/);
});

test("A/B matrix stacks each metric for narrow screens without horizontal overflow",()=>{
  assertDeclaration(css,".scenario-matrix-row","grid-template-columns","repeat(2,minmax(0,1fr))",760);
  assertDeclaration(css,".scenario-metric","grid-column","1/-1",760);
  assertDeclaration(css,".scenario-matrix","overflow","hidden");
});

test("GLIDE focuses an OFP point and keeps the full route navigable on narrow screens",()=>{
  for(const id of ["glideRoute","glideFocusHint","glideFocusPoint","glideFocusRange","glideFocusMeta","glideFocusForward","glideFocusReverse","glideFocusAltitude"]){
    assert.match(index,new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(index,/id="glideChart"/);
  assert.match(app,/glide\.samples\.map\(\(sample,index\)=>/);
  assert.match(app,/state\.glideSampleIndex=Number\(button\.dataset\.glideIndex\)/);
  assert.match(app,/state\.selectedAltitudeFt=null;state\.glideSampleIndex=null;/);
  assertDeclaration(css,".glide-route","overflow-x","auto");
  assert.match(cssRule(css,".glide-focus"),/grid-template-columns:\s*minmax\(0,1\.2fr\)/);
  assertDeclaration(css,".glide-focus","grid-template-columns","minmax(0,1fr)",760);
});

test("STEP CLIMB compares complete remaining profiles and explains no-step cases",()=>{
  assert.match(index,/id="stepComparison" aria-live="polite"/);
  assert.doesNotMatch(index,/id="stepTrack"/);
  assert.match(app,/function renderStepComparison\(stepPlan\)/);
  assert.match(app,/stepPlan\.comparison/);
  assert.match(app,/stepNoNetGain/);
  assert.match(app,/availableAltitudesFt:analysis\.results\.filter\(operationallyAvailable\)/);
  assertDeclaration(css,".step-profiles","grid-template-columns","repeat(2,minmax(0,1fr))");
  assertDeclaration(css,".step-profiles","grid-template-columns","minmax(0,1fr)",600);
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
  assertDeclaration(css,".cost-detail-grid","grid-template-columns","1fr 1fr");
  assertDeclaration(css,".cost-detail-grid","grid-template-columns","1fr",700);
});

test("flight cost separates the OFP alternate scenario without changing planned cost",()=>{
  assert.match(index,/id="costAlternate"[\s\S]*id="costAlternatePlanned"[\s\S]*id="costAlternateTotal"/);
  assert.match(index,/id="costAlternateMissed"[\s\S]*id="costAlternateLeg"[\s\S]*id="costAlternateApproach"/);
  assert.match(app,/const alternate=Number\.isFinite\(alternateFuelGal\)/);
  assert.match(app,/formatMoney\(financial\.cost\+alternateData\.cost\)/);
  assert.match(app,/buildFinancialAnalysis\(plan,selected,alternateAdvice\)/);
  assertDeclaration(css,".cost-alternate-grid","grid-template-columns","repeat(3,minmax(0,1fr))");
});

test("in-flight calibration and completed-flight records use only Calibration and History",()=>{
  assert.doesNotMatch(index,/data-tool-view="debrief"|data-tool-panel="debrief"/);
  const manualPanel=index.slice(index.indexOf('data-tool-panel="update"'),index.indexOf('class="mission-strip"'));
  assert.doesNotMatch(manualPanel,/data-manual-mode=/);
  assert.match(manualPanel,/id="manualFlightPanel"[\s\S]*id="manualUpdateForm"[\s\S]*id="calibrationForm"/);
  assert.match(manualPanel,/id="manualFinishedPanel"[\s\S]*id="debriefForm"[\s\S]*id="debriefHistory"/);
  assert.match(app,/localStorage\.setItem\("velocityxl\.debriefs"/);
});

test("approved four-area layout keeps each original tool in a dedicated module",()=>{
  const layout=readFileSync(new URL("../js/layout.js",import.meta.url),"utf8");
  assert.match(index,/id="areaNav"/);
  assert.doesNotMatch(index,/design-system\.css/);
  assert.match(index,/href="\.\/styles\.css\?/);
  for(const area of ["mission","planning","route","flight"])assert.match(layout,new RegExp(`\\['${area}'`));
  assert.match(layout,/flight: 'calibration'/);
  for(const key of ["etp","alternate","compare","load","wb","glide","oxygen","confidence","ride","ice","cost","steps","update"])
    assert.match(layout,new RegExp(`['"]${key}['"]`));
  assert.match(app,/function setOpenTool\(key\)/);
  assert.match(app,/selectedTools\[module\.dataset\.modulePanel\]=key/);
});

test("in-flight and completed-flight inputs remain accessible through two modules",()=>{
  assert.match(index,/class="manual-update-strip"[^>]*data-tool-trigger="update"/);
  assert.doesNotMatch(index,/data-tool-view="update"/);
  assert.match(index,/id="manualUpdateStripValue"[\s\S]*id="manualUpdateStripState"/);
  assert.match(app,/manualUpdateStrip\.addEventListener\("click",\(\)=>window\.VelocityLayout\?\.activate\("flight","calibration"\)\)/);
  const layout=readFileSync(new URL("../js/layout.js",import.meta.url),"utf8");
  assert.match(layout,/\['flight',[^\n]*\[\['calibration', 'calibration'\], \['history', 'history'\]\]/);
  assert.match(layout,/moduleNodes\.get\('flight:calibration'\)\.append\(flightPanel\)/);
  assert.match(layout,/moduleNodes\.get\('flight:calibration'\)\.append\(updateStrip\)/);
  assert.match(layout,/moduleNodes\.get\('flight:history'\)\.append\(finishedPanel\)/);
  assert.match(layout,/moduleNodes\.get\('flight:history'\)\.append\(history\)/);
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
  assert.match(css,/width:\s*13px/);
  assert.match(css,/status-ui-icon/);
  assert.match(css,/color:\s*var\(--green\)/);
  assert.match(css,/color:\s*var\(--orange\)/);
  assert.match(css,/color:\s*var\(--red\)/);
  assertDeclaration(css,".level-item.unavailable .level-status","color","var(--red)");
});
