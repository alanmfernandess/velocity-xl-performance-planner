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
  assert.match(html, /styles\.css\?v=20261023-ice-simple/);
});


test("pilot decision action buttons share a full-width column and button dimensions", () => {
  assertDeclaration(css, ".analysis-actions", "display", "grid");
  assertDeclaration(css, ".analysis-actions", "grid-template-columns", "minmax(0, 1fr)");
  assertDeclaration(css, ".analysis-actions > button", "width", "100%");
  assertDeclaration(css, ".analysis-actions > button", "min-height", "var(--control-height)");
  assert.match(html, /id="applyPilotAlternative"/);
  assert.match(html, /id="recalculateRanking"/);
});


test("alternate fuel metrics are balanced columns without dividing lines", () => {
  assertDeclaration(css, ".advisor-strip", "grid-template-columns", "repeat(3, minmax(0, 1fr))");
  assertDeclaration(css, ".advisor-strip", "gap", "var(--space-3)");
  assertDeclaration(css, ".advisor-strip > span", "display", "flex");
  assertDeclaration(css, ".advisor-strip > span", "flex-direction", "column");
  assertDeclaration(css, ".advisor-strip > span", "align-items", "center");
  assertDeclaration(css, ".advisor-strip strong", "font-size", "var(--ui-body)");
  assert.doesNotMatch(cssRule(css, ".advisor-strip"), /border(?:-\\w+)?\\s*:/);
  assert.doesNotMatch(cssRule(css, ".advisor-strip > span"), /border(?:-\\w+)?\\s*:/);
  for (const id of ["fuelAtDestination", "alternateFuel", "alternateLandingFuel"])
    assert.match(html, new RegExp(`id="${id}"`));
});


test("section title and eyebrow share the OFP SIMBRIEF content x-coordinate at every width", () => {
  assertDeclaration(css, ".area-heading", "padding-inline", "calc(var(--space-6) + 1px)");
  assertDeclaration(css, ".plan-bar", "border", "1px solid var(--line)");
  assertDeclaration(css, ".plan-bar", "padding", "var(--space-5) var(--space-6)");
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.plan-bar \{[\s\S]*?padding: var\(--space-4\);[\s\S]*?\.area-heading \{\s*min-height: 74px;\s*padding-inline: calc\(var\(--space-4\) \+ 1px\);/);
  assert.match(layout, /heading\.className = 'area-heading'/);
});

test("ICE evidence presents simple route coverage and on-demand technical facts without protection alert", () => {
  assert.match(html, /id="iceCoverageTrack"[^>]*role="meter"/);
  assert.match(html, /id="iceCoverageContext"/);
  assert.match(html, /id="iceCoverageNotice"[^>]*hidden/);
  assert.match(html, /<details class="ice-technical-details" id="iceCoverageDetails">/);
  assert.match(html, /<div class="ice-evidence-list" id="iceEvidenceList"><\/div>/);
  assert.match(app, /iceCoverageNoticeTitle/);
  assert.match(app, /awcStatus==="stale"/);
  assert.match(app, /Cobertura dos dados não significa ausência de gelo/);
  assert.doesNotMatch(app, /PROTEÇÃO|NÃO INSTALADA|NOT INSTALLED/);
  assertDeclaration(css, ".ice-technical-details > summary", "min-height", "var(--control-height)");
  assert.match(html, /js\/app\.js\?v=20261023-07/);
});
