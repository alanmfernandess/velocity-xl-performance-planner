import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");

test("uses a pinned Lucide release and cache-busted local assets",()=>{
  assert.match(index,/lucide@0\.468\.0/);
  assert.match(index,/styles\.css\?v=20261014-06/);
  assert.match(index,/js\/app\.js\?v=20261014-05/);
});

test("oxygen recommendation button aligns with the adjacent controls",()=>{
  assert.match(css,/\.oxygen-controls > button \{ align-self:end; \}/);
  assert.match(css,/\.oxygen-controls select \{[^}]*height:36px/);
  assert.match(css,/\.text-button \{ height:36px/);
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
  assert.match(app,/state\.glideSampleIndex=null;state\.oxygen\.altitudeFt/);
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
  assert.match(app,/calculateOxygenPlan, calculatePlan, calculateStepClimbs/);
  assert.match(css,/\.step-profiles \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(max-width:600px\) \{[\s\S]*?\.step-profiles \{ grid-template-columns:minmax\(0,1fr\)/);
});

test("discrete icon rules cover every primary calculator surface",()=>{
  [
    ".brand-mark", ".kpi-grid .kpi:nth-child(1)", ".mission-strip > div:nth-child(1)",
    '[data-view="performance"]', '[data-view="route"]', '[data-view="profile"]',
    '[data-tool-view="alternate"]', '[data-tool-view="compare"]', '[data-tool-view="load"]',
    '[data-tool-view="wb"]', '[data-tool-view="glide"]', '[data-tool-view="oxygen"]',
    '[data-tool-view="confidence"]', '[data-tool-view="ride"]', '[data-tool-view="debrief"]',
    '[data-tool-view="steps"]', '[data-tool-view="update"]', ".section-heading h2",
  ].forEach((selector)=>assert.ok(app.includes(selector),`missing icon rule for ${selector}`));
});

test("dynamic operational cards use semantic line icons",()=>{
  assert.match(app,/missionReasonIcon/);
  assert.match(app,/level-state-icon/);
  assert.match(app,/fuel-legend-icon/);
  assert.match(app,/stationIcon/);
  assert.match(app,/iconMarkup\("wind"\)/);
  assert.match(app,/iconMarkup\("history"\)/);
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
