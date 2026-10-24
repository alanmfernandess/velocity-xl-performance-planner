import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { profileFixture } from "../tests/fixtures/mission-profile.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "review/weather-decision");
await fs.mkdir(output, { recursive: true });
const report = { fixture: "Illustrative synthetic OFP and weather; real browser screenshots; no real flight import", widths: [320, 375, 390, 430, 768, 1024, 1440, 1920], states: [], screenshots: [], errors: [] };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"), file = path.resolve(root, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" }[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }); res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
let activePage;
async function audit(page, label) {
  const state = await page.evaluate(() => {
    const panel = document.querySelector("#missionProfilePanel");
    const probe = window.VelocityVisualProbe(panel);
    const controls = [...panel.querySelectorAll("button,input,summary")].filter((e) => e.getClientRects().length)
      .map((e) => ({ id: e.id || e.dataset.profileLayer || e.tagName, height: e.getBoundingClientRect().height }));
    const svg = document.querySelector("#mpSvg"), box = svg.getBoundingClientRect();
    const axis = document.querySelector(".mp-alt-axis").getBoundingClientRect();
    return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, issues: probe.issues,
      controls, markers: svg.querySelectorAll("[data-profile-fix]").length, axisRight: axis.right, plotLeft: box.left,
      badSvg: /NaN|Infinity/.test(svg.innerHTML), source: document.querySelector("#mpScenarioTag").textContent,
      profileVisible: !document.querySelector("#mpProfileBody").hidden,
      scrollbarsHidden: innerWidth > 760 || getComputedStyle(document.querySelector("#mpWaypointList")).scrollbarWidth === "none" };
  });
  const failures = [...state.issues.map((item) => `${item.code}: ${item.target} ${item.detail || ""}`)];
  if (state.scrollWidth > state.viewport + 1) failures.push(`viewport overflow ${state.scrollWidth - state.viewport}`);
  for (const item of state.controls) if (item.height < 43) failures.push(`${item.id} control ${item.height}px`);
  if (state.axisRight > state.plotLeft + 1) failures.push("altitude axis overlaps plot");
  if (state.badSvg) failures.push("nonfinite SVG");
  if (!state.scrollbarsHidden) failures.push("mobile scrollbar visible");
  report.states.push({ label, ...state, failures });
  if (failures.length) report.errors.push({ label, failures });
}
async function screenshot(page, name, overview = false) {
  await page.evaluate(() => {
    const badge = document.createElement("span"); badge.id = "profileCaptureFixture"; badge.className = "ui-status";
    badge.textContent = "PRÉVIA · DADOS ILUSTRATIVOS";
    document.querySelector("#missionProfilePanel").prepend(badge);
  });
  await page.locator("#missionProfilePanel").scrollIntoViewIfNeeded();
  await page.locator("#missionProfilePanel").screenshot({ path: path.join(output, `${name}.png`),
    style: ".mobile-area-nav { visibility: hidden; }" });
  report.screenshots.push(`${name}.png`);
  if (overview) {
    const file = `${name.replace("-profile", "-overview")}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: true }); report.screenshots.push(file);
  }
  await page.evaluate(() => document.querySelector("#profileCaptureFixture").remove());
}
try {
  for (const width of report.widths) {
    const count = width <= 390 ? 84 : width <= 1024 ? 48 : 150;
    const fixture = profileFixture(count);
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : 1000 } });
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (error) => report.errors.push({ label: `${width}px JS`, error: error.message }));
    let requests = 0, importRaw = fixture.raw, weatherResponse = fixture.gfsResponse;
    await page.addInitScript(() => { localStorage.setItem("velocityxl.oxygen", JSON.stringify({ bottleModel: "SK-12-24", bottles: 4, seats: [true, true, true, true, true] })); });
    await page.route("**/api/xml.fetcher.php?**", (route) => { requests++; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(importRaw) }); });
    await page.route("**/v1/gfs?**", (route) => { requests++; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(weatherResponse) }); });
    await page.route("**/weather-snapshots/awc/latest.json", (route) => { requests++; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), sigmets: [], pireps: [] }) }); });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ path: path.join(root, "scripts/visual-probe.js") });
    await page.waitForFunction(() => Boolean(window.VelocityLayout));
    assert.equal(await page.locator("#missionProfilePanel").isVisible(), false);
    await page.locator("#quickPilotId").fill("ILLUSTRATIVE"); await page.locator("#importLatest").click();
    await page.waitForSelector("#mpSvg [data-profile-curve]");
    await page.waitForFunction(() => /GFS · [1-9]/.test(document.querySelector("#mpLayerStatus").textContent));
    await page.locator('[data-area-button="planning"]:visible').click();
    await page.locator("#optimizeMission").click();
    await page.waitForSelector("[data-decision-fl]");
    const ranking = await page.locator("#topLevelCards").innerHTML();
    const preflight = await page.locator("#missionScoreValue").textContent();
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    const protectedState = await page.evaluate(() => [localStorage.getItem("velocityxl.virtualFlightTracker.v1"), localStorage.getItem("velocityxl.calibration"), localStorage.getItem("velocityxl.appliedMission")]);
    const beforeRequests = requests;
    for (const layer of ["METEO", "ICE", "RIDE", "FUEL"]) {
      await page.locator(`[data-profile-layer="${layer}"]`).click();
      await audit(page, `${width}px ${layer}`);
    }
    for (const fraction of [0, .1, .5, .9, 1]) {
      await page.locator("#mpProgress").evaluate((input, f) => { input.value = Number(input.max) * f; input.dispatchEvent(new Event("input", { bubbles: true })); }, fraction);
    }
    assert.equal(requests, beforeRequests, "preview must not fetch weather");
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage, "preview must not touch persistence");
    await page.locator("#mpPlay").click();
    await page.waitForFunction(() => Number(document.querySelector("#mpProgress").value) > 0
      && Number(document.querySelector("#mpProgress").value) < Number(document.querySelector("#mpProgress").max));
    await page.locator("#mpPlay").click();
    assert.equal(await page.locator("#mpPlay").getAttribute("aria-pressed"), "false");
    assert.equal(requests, beforeRequests);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage);
    await page.locator("#mpWaypointsToggle").click();
    assert.equal(await page.locator("[data-select-profile-fix]").count(), count);
    await page.locator("#mpWaypointSearch").fill("fix010");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#mpPointName").textContent(), "FIX010");
    const selectedDistance = await page.locator("[data-profile-indicator]").getAttribute("data-distance");
    assert.ok(Number(selectedDistance) > 0);
    await audit(page, `${width}px waypoint search`);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#mpWaypointsPanel").isVisible(), false);
    for (const language of ["pt-BR", "en-US"]) {
      await page.locator(`[data-language="${language}"]`).click();
      for (const font of ["small", "normal", "large"]) {
        await page.locator(`[data-font-size="${font}"]`).click();
        await page.locator(`[data-fuel-unit="${font === "large" ? "l" : "gal"}"]`).click();
        await page.locator(`[data-weight-unit="${font === "large" ? "kg" : "lb"}"]`).click();
        await audit(page, `${width}px ${language} ${font}`);
      }
    }
    await page.locator('[data-language="pt-BR"]').click(); await page.locator('[data-font-size="normal"]').click();
    await page.locator('[data-fuel-unit="gal"]').click();
    await page.locator('[data-profile-layer="METEO"]').click();
    if ([390, 768, 1440].includes(width)) {
      await screenshot(page, `${width}-profile`, true);
    }
    await page.locator("#mpNextEvent").click();
    const eventTime = Number(await page.locator("#mpProgress").inputValue());
    assert.ok(eventTime >= 0);
    await page.locator("#mpTimeMachine > summary").click();
    await page.waitForFunction(() => document.querySelector("#mpTimeComparison").getAttribute("aria-busy") === "false");
    for (const hour of [1, 2, 3, 0]) {
      await page.locator(`[data-profile-offset="${hour}"]`).click();
      await audit(page, `${width}px time +${hour}h`);
    }
    assert.equal(await page.locator("#topLevelCards").innerHTML(), ranking);
    assert.equal(await page.locator("#missionScoreValue").textContent(), preflight);
    if ([390, 1440].includes(width)) {
      await page.locator('[data-profile-offset="1"]').click();
      await screenshot(page, `${width}-time-machine`);
    }
    await page.locator('[data-profile-offset="1"]').click();
    await page.locator('[data-area-button="route"]:visible').click();
    await page.locator('[data-area-button="mission"]:visible').click();
    assert.equal(await page.locator('[data-profile-offset="1"]').getAttribute("aria-pressed"), "true");
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem("velocityxl.virtualFlightTracker.v1"), localStorage.getItem("velocityxl.calibration"), localStorage.getItem("velocityxl.appliedMission")]), protectedState);
    await page.locator("[data-decision-fl]").nth(1).click();
    assert.match(await page.locator("#mpScenarioTag").textContent(), /ANÁLISE/);
    assert.equal(await page.locator("#mpTimeMachine [data-profile-offset='0']").getAttribute("aria-pressed"), "true");
    if ([390, 1440].includes(width)) {
      await page.locator('[data-analysis-mode="MANUAL"]').click();
      await page.locator("#analysisMap").fill("26"); await page.locator("#analysisRpm").fill("2450");
      await page.waitForFunction(() => document.querySelector("#mpTimeComparison").getAttribute("aria-busy") === "false");
      await page.locator('[data-profile-offset="1"]').click();
      await page.locator('[data-fuel-unit="l"]').click(); await page.locator('[data-language="en-US"]').click();
      assert.equal(await page.locator('[data-profile-offset="1"]').getAttribute("aria-pressed"), "true", "unit/language changes must keep the manual scenario");
      assert.match(await page.locator("#mpCandidate").textContent(), /MANUAL/);
      await audit(page, `${width}px manual scenario EN/L`);
      await page.locator('[data-fuel-unit="gal"]').click(); await page.locator('[data-language="pt-BR"]').click();
    }
    await page.locator("#cancelPilotAnalysis").click();
    await page.locator("#mpSources > summary").click();
    await audit(page, `${width}px sources`);
    await page.locator("#mpSources > summary").click();
    await page.locator('[data-area-button="route"]:visible').click();
    await page.locator('[data-area-button="mission"]:visible').click();
    await audit(page, `${width}px navigation restored`);
    if (width === 390) {
      importRaw = { ...fixture.raw, params: { request_id: "SECOND-ILLUSTRATIVE-OFP" }, times: {} };
      await page.locator("#importLatest").click();
      await page.waitForFunction(() => document.querySelector("#mpEta").textContent === "—");
      await page.locator('[data-profile-offset="1"]').click();
      await page.waitForFunction(() => document.querySelector("#mpTimeComparison").getAttribute("aria-busy") === "false");
      assert.equal(await page.locator("#mpProfileBody").isVisible(), false);
      await audit(page, `${width}px missing UTC`);
      await screenshot(page, `${width}-unavailable`);
    }
    if (width === 1440) {
      importRaw = { ...fixture.raw, params: { request_id: "ILLUSTRATIVE-EXPIRED-TIME" }, times: { sched_off: "2026-10-30T12:00:00Z", sched_on: "2026-10-30T14:00:00Z" } };
      await page.locator("#importLatest").click();
      await page.waitForFunction(() => !document.querySelector("#mpUnavailable").hidden && /FORA DA JANELA/.test(document.querySelector("#mpUnavailable").textContent));
      await audit(page, `${width}px outside forecast window`);
      await screenshot(page, `${width}-unavailable`);
    }
    await context.close();
  }
} catch (error) {
  report.errors.push({ label: "audit execution", error: error.stack });
  if (activePage && !activePage.isClosed()) {
    report.debug = await activePage.evaluate(() => Object.fromEntries(["decisionDiagnostic", "mpLayerStatus", "mpCandidate", "missionScoreAction", "decisionAutoStatus", "toast"].map((id) => [id, document.getElementById(id)?.textContent])));
    await activePage.screenshot({ path: path.join(output, "audit-error.png"), fullPage: true });
    console.error(JSON.stringify(report.debug));
  }
} finally {
  await browser.close(); server.close();
}
report.generatedAt = new Date().toISOString();
await fs.writeFile(path.join(output, "browser-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`${report.states.length} Mission Profile states, ${report.errors.length} failures, ${report.screenshots.length} screenshots`);
if (report.errors.length) { console.error(JSON.stringify(report.errors, null, 2)); process.exitCode = 1; }
