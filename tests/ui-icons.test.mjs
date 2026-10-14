import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");

test("uses a pinned Lucide release and cache-busted local assets",()=>{
  assert.match(index,/lucide@0\.468\.0/);
  assert.match(index,/styles\.css\?v=20261013-30/);
  assert.match(index,/js\/app\.js\?v=20261013-30/);
});

test("scenario B separates editable inputs from calculated results",()=>{
  assert.match(css,/\.scenario-inputs \{[^}]*padding:12px/);
  assert.match(css,/\.scenario-editable \.scenario-stats \{[^}]*border-top:1px solid var\(--line\)/);
  assert.match(css,/\.scenario-editable \.scenario-stats span \{[^}]*border-radius:9px/);
});

test("mission strip centers each complete information group",()=>{
  assert.match(css,/\.mission-strip div \{[^}]*justify-content:center; align-content:center/);
  assert.match(css,/\.mission-strip strong \{[^}]*grid-column:1\/-1/);
  assert.match(css,/\.mission-strip small \{[^}]*text-align:center/);
  assert.doesNotMatch(css,/\.mission-strip strong \{[^}]*position:absolute/);
});

test("scenario A centers its information block without changing scenario B",()=>{
  assert.match(index,/class="scenario-current-body"/);
  assert.match(css,/\.scenario-card:not\(\.scenario-editable\) \{ display:flex; flex-direction:column; \}/);
  assert.match(css,/\.scenario-current-body \{[^}]*justify-content:center/);
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
  assert.match(css,/\.level-card\.recommended::after \{ display:none; \}/);
});
