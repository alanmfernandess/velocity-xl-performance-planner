import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertDeclaration, cssRule } from "./css-utils.mjs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const engine = readFileSync(new URL("../js/engine.js", import.meta.url), "utf8");
const layout = readFileSync(new URL("../js/layout.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

 test("one consolidated visual system and cache-busted assets", () => {
  assert.match(index, /lucide@0\.468\.0/);
  assert.match(index, /styles\.css\?v=[\w-]+/);
  assert.match(index, /js\/app\.js\?v=\d{8}-\d+/);
  assert.doesNotMatch(index, /design-system\.css/);
  assert.match(css, /\.ui-icon\s*\{/);
});

test("oxygen recommendation remains accessible with aligned controls", () => {
  assert.match(index, /id="applyOxygenRecommendation"/);
  assertDeclaration(css, ".oxygen-controls > button", "align-self", "end");
  assert.match(index, /class="ui-field"[^>]*><span[^>]*data-i18n="cabinAltitude"[^<]*<\/span><select id="oxygenAltitude"/);
  assertDeclaration(css, '.ui-unit-input', "min-height", "var(--control-height)");
});

test("one optimization action exposes Top 3 without applying it", () => {
  assert.match(index, /id="optimizeMission"/);
  assert.match(index, /id="pilotDecisionPanel"[^>]*hidden/);
  for (const id of ["topLevelCards", "pilotAnalysis", "analysisMap", "analysisRpm", "analysisComparison", "applyPilotAlternative"])
    assert.match(index, new RegExp(`id="${id}"`));
  assert.match(app, /const snapshot=optimizeMission\(decisionInput\(\)\)/);
  assert.match(app, /localStorage\.setItem\("velocityxl\.appliedMission"/);
  assert.doesNotMatch(index, /id="missionProposal"/);
  assert.doesNotMatch(index, /id="powerManualFields"|id="manualMap"|id="manualRpm"/);
  assert.match(index, /id="analysisMap"[\s\S]*id="analysisRpm"/);
});

test("obsolete comparison and debrief modules are absent from active UI", () => {
  for (const key of ["compare", "load", "confidence", "debrief"])
    assert.doesNotMatch(index, new RegExp(`data-tool-(?:view|panel)="${key}"`));
  assert.doesNotMatch(index, /id="(?:levelCards|scenarioMatrixRows|debriefForm|terrainMatrix)"/);
  assert.doesNotMatch(layout, /\['history', 'history'\]/);
});

test("exactly three areas remain navigable and preserve operational modules", () => {
  assert.match(index, /id="areaNav"/);
  for (const area of ["plan", "route", "flight"])
    assert.match(layout, new RegExp(`\\['${area}'`));
  for (const key of ["etp", "alternate", "wb", "glide", "oxygen", "ride", "ice", "cost", "steps"])
    assert.match(index, new RegExp(`data-tool-view="${key}"`));
  assert.match(layout, /flight.*overview.*update.*calibration.*history/);
});

test("checkpoint and paired calibration share one validated observation path", () => {
  assert.match(index, /id="manualUpdateForm"/);
  assert.doesNotMatch(index, /id="calibrationForm"/);
  assert.match(index, /id="observedTas"/);
  assert.match(index, /id="observedFuelFlow"/);
  assert.match(app, /if\(!tasValue\|\|!flowValue/);
  assert.match(app, /nextCalibration=deriveCalibration/);
  assert.match(engine, /CALIBRATION_ATMOSPHERE_UNAVAILABLE/);
});

test("ICE keeps flight phases and route evidence visible", () => {
  assert.match(index, /id="iceRiskWindow"[\s\S]*id="iceDestinationRisk"[\s\S]*id="iceAlternateRisk"/);
  for (const id of ["iceRouteBand", "icePhaseList"])
    assert.match(index, new RegExp(`id="${id}"`));
  assert.match(engine, /terminalWeatherAtTime[\s\S]*alternateEtaOffsetMin/);
});

test("GLIDE exposes route focus and does not claim a safe landing site", () => {
  for (const id of ["glideRoute", "glideFocusPoint", "glideFocusRange", "glideFocusAltitude"])
    assert.match(index, new RegExp(`id="${id}"`));
  assert.match(app, /glide\.samples\.map\(\(sample,index\)=>/);
  assertDeclaration(css, ".glide-route", "overflow-x", "auto");
});

test("financial estimate uses manual fuel price and alternate scenario", () => {
  assert.match(index, /id="fuelPriceCurrency"[\s\S]*id="fuelPricePerLiter"/);
  assert.match(index, /id="costAlternate"[\s\S]*id="costAlternateTotal"/);
  assert.match(app, /localStorage\.setItem\("velocityxl\.financial"/);
  assert.match(app, /buildFinancialAnalysis\(plan,selected,alternateAdvice,\{financial:activeCandidate\.financial\}\)/);
  assertDeclaration(css, ".cost-detail-grid", "grid-template-columns", "minmax(0,1fr)");
});

test("RIDE preferences feed the unified optimizer without a separate level action", () => {
  for (const preset of ["standard", "comfort", "maximum"])
    assert.match(index, new RegExp(`data-ride-preference="${preset}"`));
  assert.match(app, /ridePreference:state\.ridePreference|\.\.\.state,pricePerLiter/);
  assert.match(app, /localStorage\.setItem\("velocityxl\.ridePreference"/);
  assert.doesNotMatch(index, /id="applyRideRecommendation"/);
  assert.match(cssRule(css, ".status-pill.unknown"), /color:/);
});
