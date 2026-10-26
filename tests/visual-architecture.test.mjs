import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertDeclaration, cssRule } from "./css-utils.mjs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const layout = readFileSync(new URL("../js/layout.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("one stylesheet owns visual tokens and component dimensions", () => {
  assert.equal((html.match(/rel="stylesheet"/g) || []).length, 1);
  assert.doesNotMatch(html, /design-system\.css/);
  for (const [name, value] of [
    ["--ui-caption", "calc(12px * var(--ui-scale))"],
    ["--ui-body", "calc(14px * var(--ui-scale))"],
    ["--ui-title", "calc(16px * var(--ui-scale))"],
    ["--ui-display", "calc(24px * var(--ui-scale))"],
    ["--control-height", "44px"],
  ]) assertDeclaration(css, ":root", name, value);
  assertDeclaration(css, ".ui-button", "min-height", "var(--control-height)");
  assert.match(layout, /\['\.primary-button', 'ui-button ui-button--primary'\]/);
  assert.match(layout, /\['\.text-button', 'ui-button ui-button--outline'\]/);
  assertDeclaration(css, ".module-nav button", "min-height", "var(--control-height)");
});

test("global scrollbars are hidden without disabling vertical or horizontal scroll", () => {
  const universal=cssRule(css,"*");
  const webkit=cssRule(css,"*::-webkit-scrollbar");
  assert.match(universal,/scrollbar-width:\s*none\s*!important/);
  assert.match(universal,/-ms-overflow-style:\s*none/);
  assert.match(webkit,/display:\s*none\s*!important/);
  assert.match(webkit,/width:\s*0/);
  assert.match(webkit,/height:\s*0/);
  for (const selector of ["#zenShell .zen-content","#zenShell .zen-drawer-content","#zenAssessmentShell .zas-body","#zenAssessmentShell .zas-drawer-body",".glide-route",".ride-route-scroll"]) {
    assert.match(cssRule(css,selector),/overflow(?:-[xy])?:\s*(?:auto|scroll)/);
  }
  assert.doesNotMatch(universal,/(?:^|;)overflow\s*:\s*hidden/);
});

test("cards size to content and hidden modules stay hidden", () => {
  assertDeclaration(css, ".summary-grid > .panel", "min-height", "0");
  assertDeclaration(css, ".planning-live-summary", "min-height", "0");
  assert.doesNotMatch(cssRule(css, ".flight-update-form"), /min-height:/);
  assertDeclaration(css, '.app-module[data-module-panel="flight:update"] > #manualFlightPanel', "padding", "var(--space-4)");
  assert.match(cssRule(css, "[hidden]"), /display:\s*none\s*!important/);
  assert.match(layout, /flight: 'update'/);
});

test("responsive rules are grouped and iOS zoom remains available", () => {
  for (const width of [1100, 1024, 760, 700, 600, 430, 360]) {
    assert.equal((css.match(new RegExp(`@media \\(max-width: ${width}px\\)`, "g")) || []).length, 1);
  }
  assert.doesNotMatch(html, /maximum-scale|user-scalable|gesturestart|gesturechange/);
  assert.doesNotMatch(css, /min-height:\s*266px/);
  assert.doesNotMatch(css, /body \*\s*\{[^}]*!important/);
});

test("Zen mobile fills the visual viewport without hidden navigation padding", () => {
  assert.match(cssRule(css, "body.zen-overview"), /(?:^|;)padding:0(?:;|$)/);
  assert.match(cssRule(css, "html.zen-locked"), /(?:^|;)overflow:hidden(?:;|$)/);
  assert.match(css, /#zenShell \.zen-app\s*\{[^}]*height:100%/);
  assert.match(css, /#zenShell \.zen-content\s*\{[^}]*overflow-y:auto/);
  assert.match(html, /viewport-fit=cover/);
  const zen = readFileSync(new URL("../js/zen-overview.js", import.meta.url), "utf8");
  assert.match(zen, /document\.documentElement\.classList\.toggle\("zen-locked"/);
  assert.match(zen, /document\.addEventListener\("gesturestart"/);
  assert.match(zen, /event\.touches\.length>1/);
  assert.match(zen, /\(applied\|\|confirmed\)\?/);
});

test("Zen desktop remains contained and scrollable at short viewport heights", () => {
  assert.match(cssRule(css, "#zenShell"), /height:100dvh/);
  assert.match(cssRule(css, "#zenShell .zen-outer"), /height:100%/);
  assert.match(cssRule(css, "#zenShell .zen-app"), /height:100%/);
  assert.match(cssRule(css, "#zenShell .zen-app"), /min-height:0/);
  assert.match(cssRule(css, "#zenShell .zen-content"), /overflow-y:auto/);
  assert.ok(css.includes("@media (min-width:761px) and (max-height:650px)"));
  assert.doesNotMatch(cssRule(css, "#zenShell .zen-app"), /min-height:675px/);
});

test("Zen Status assessment uses native results and fits the app viewport", () => {
  const assessment=readFileSync(new URL("../js/zen-assessment.js",import.meta.url),"utf8");
  assert.match(html,/zen-assessment\.js\?v=20261026-01/);
  assert.match(cssRule(css,"#zenAssessmentShell"),/height:100dvh/);
  assert.match(cssRule(css,"#zenAssessmentShell .zas-app"),/height:100%/);
  assert.match(cssRule(css,"#zenAssessmentShell .zas-body"),/overflow-y:auto/);
  assert.match(assessment,/missionRiskValue/);
  assert.match(assessment,/missionScoreReasons/);
  assert.match(assessment,/cruiseIcingValue/);
  assert.match(assessment,/rideValue/);
  assert.match(assessment,/oxygenValue/);
  assert.match(assessment,/kpiFuelDelta/);
  assert.match(assessment,/role="dialog"/);
  assert.match(assessment,/nativeStatus/);
  assert.match(assessment,/score===null/);
});

test("approved Zen Essential planning has native editable controls and a centered confirmation", () => {
  const planning=readFileSync(new URL("../js/zen-planning.js",import.meta.url),"utf8");
  const overview=readFileSync(new URL("../js/zen-overview.js",import.meta.url),"utf8");
  const assessment=readFileSync(new URL("../js/zen-assessment.js",import.meta.url),"utf8");
  assert.ok(html.includes("zen-planning.js?v=20261026-01"));
  assert.match(cssRule(css,"#zenPlanningShell"),/height:100dvh/);
  assert.match(cssRule(css,"#zenPlanningShell .zpc-app"),/height:100%/);
  assert.match(cssRule(css,"#zenPlanningShell .zpc-body"),/overflow-y:auto/);
  assert.match(cssRule(css,"#zenPlanningShell .zpc-modal-shade"),/justify-content:center/);
  for(const selector of ["payloadInput","fuelInput","reserveInput","optimizeMission","powerSettingValue","weightValue","weightNote","layoutFuelMargin","layoutOxygenSummary"])assert.ok(planning.includes(selector));
  assert.ok(planning.includes('dispatchEvent(new Event("input"'));
  assert.ok(planning.includes('dispatchEvent(new Event("change"'));
  assert.ok(planning.includes('role="alertdialog"'));
  assert.ok(planning.includes("hasPlan()"));
  assert.ok(overview.includes("onPlanning"));
  assert.ok(assessment.includes("zen-planning"));
});

test("Zen Overview refined hierarchy keeps real metrics and deliberate spacing", () => {
  const overview=readFileSync(new URL("../js/zen-overview.js",import.meta.url),"utf8");
  assert.ok(html.includes("styles.css?v=20261026-02"));
  assert.ok(html.includes("zen-overview.js?v=20261026-02"));
  for(const id of ["zenFuelLabel","zenFuel","zenFuelUnit","zenTime","zenTimeUnit","zenReview","zenDetails","zenCaveat"]){
    assert.ok(overview.includes(id),id);
  }
  assert.ok(overview.includes('class="zen-reading"'));
  assert.ok(overview.includes('class="zen-main-actions"'));
  assert.ok(overview.includes('tr("COMBUSTÍVEL","FUEL")'));
  assert.match(css,/zenReview\s*\{max-width:355px/);
  assert.match(css,/zenDetails\s*\{[^}]*margin-top:35px/);
  assert.ok(css.includes("margin-top:30px"));
  assert.match(css,/max-height:650px/);
  assert.match(css,/max-width:760px/);
  assert.ok(css.includes("scrollbar-width: none !important"));
});

test("removed visual variables have no JavaScript writer", () => {
  assert.doesNotMatch(app, /--(?:ice-status|topbar-height)/);
  assert.match(app, /setProperty\("--score"/);
  assert.match(app, /setProperty\("--score-color"/);
});

test("editable fields and visual cards use shared component contracts", () => {
  for (const selector of [".ui-field", ".ui-unit-input", ".ui-button", ".ui-card", ".ui-metric", ".ui-status"])
    assert.match(cssRule(css, selector), /[a-z-]+:/);
  for (const id of ["manualWaypoint", "manualAltitude", "manualFuel", "observedTas", "observedFuelFlow", "fuelPriceCurrency", "fuelPricePerLiter"])
    assert.match(html, new RegExp(`<label class="ui-field[^"]*"[^>]*>[\\s\\S]*?id="${id}"`));
  assert.match(layout, /const componentKinds = \[/);
  assert.doesNotMatch(css, /grid-template-rows:\s*auto\s+38px|\.cost-price-row\s+\.ui-unit-input\s*\{|\.wb-inputs input\s*\{/);
  assertDeclaration(css, ".ui-field > select", "appearance", "none");
});

test("mission adjustment uses body typography instead of KPI display typography", () => {
  const secondaryRole = layout.match(/secondary:\s*'([^']+)'/)?.[1] || "";
  const primaryRole = layout.match(/primary:\s*'([^']+)'/)?.[1] || "";
  assert.match(secondaryRole, /#missionScoreAction/);
  assert.doesNotMatch(primaryRole, /#missionScoreAction/);
  assertDeclaration(css, '.app-module [data-ui-role="secondary"]', "font-size", "var(--ui-body)");
  assertDeclaration(css, '.app-module [data-ui-role="primary"]', "font-size", "var(--ui-display)");
  assert.match(html, /js\/layout\.js\?v=20261022-pde3/);
  assertDeclaration(css, '.recommendation-card .mission-score-action > #missionScoreAction', 'font-size', 'var(--ui-body)');
  assert.match(html, /styles\.css\?v=20261026-01/);
});
