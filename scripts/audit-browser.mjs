import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { PRESSURE_LEVELS } from '../js/weather/open-meteo.js';
import { parseSimBrief } from '../js/simbrief.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const baselineIndex = process.argv.indexOf('--baseline');
const baseline = baselineIndex >= 0;
const engineV2 = process.argv.includes('--engine-v2');
const trackerOnly = process.argv.includes('--tracker-only');
const afterFolder = engineV2 ? 'decision-engine-v3' : 'definitive-after';
const root = baseline ? path.resolve(process.argv[baselineIndex + 1]) : projectRoot;
const output = path.join(projectRoot, 'review');
const widths = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const modules = {
  mission: ['overview', 'score'],
  planning: ['config', 'systems', 'analyses'],
  route: ['overview', 'ice', 'ride', 'decisions'],
  flight: ['update'],
};
const tools = {
  'planning:systems': ['wb', 'oxygen'],
  'planning:analyses': ['cost'],
  'route:ice': ['ice'],
  'route:ride': ['ride'],
  'route:decisions': ['etp', 'alternate', 'glide', 'steps'],
};
const fixture = {
  fetch: { status: 'Success' },
  general: { initial_altitude: '18000', route_distance: '246', route: 'DCT WPT1 WPT2 DCT' },
  times: { sched_out: '2026-10-21T12:00:00Z', sched_on: '2026-10-21T14:00:00Z' },
  origin: { icao_code: 'SBSP', pos_lat: -23.6261, pos_long: -46.6566, elevation: '2631' },
  destination: { icao_code: 'SBGL', pos_lat: -22.8099, pos_long: -43.2506, elevation: '28' },
  alternate: { icao_code: 'SBRJ', pos_lat: -22.9105, pos_long: -43.1631 },
  navlog: Array.from({ length: 18 }, (_, index) => ({
    ident: index === 0 ? 'SBSP' : index === 17 ? 'SBGL' : `WPT${index}`,
    pos_lat: -23.6261 + index * .048,
    pos_long: -46.6566 + index * .200,
    cum_distance: index * (246 / 17),
    mora: '6500',
    altitude_feet: '18000',
    wind_data: [
      { altitude: '10000', wind_dir: '235', wind_spd: '15', oat: '-5' },
      { altitude: '18000', wind_dir: '245', wind_spd: '22', oat: '-20' },
      { altitude: '25000', wind_dir: '255', wind_spd: '31', oat: '-34' },
    ],
  })),
};
const trackerPlan = parseSimBrief(fixture);
const trackerPlanKey = [trackerPlan.source,trackerPlan.ofpId,trackerPlan.generatedAt,trackerPlan.generatedAtMs,
  trackerPlan.scheduledOffMs,trackerPlan.scheduledOnMs,trackerPlan.origin?.icao,trackerPlan.destination?.icao,
  trackerPlan.alternate,trackerPlan.route,trackerPlan.distanceNm].join('|');
function gfsFixture(url) {
  const params = new URL(url).searchParams;
  const latitudes = params.get('latitude').split(',').map(Number);
  const longitudes = params.get('longitude').split(',').map(Number);
  const times = Array.from({ length: 48 }, (_, index) => `2026-10-${index < 24 ? '21' : '22'}T${String(index % 24).padStart(2, '0')}:00`);
  const hourlyUnits = { time: 'iso8601', cape: 'J/kg', freezing_level_height: 'm', precipitation: 'mm', cloud_cover: '%' };
  const hourly = { time: times, cape: times.map(() => 0), freezing_level_height: times.map(() => 3000),
    precipitation: times.map(() => 0), cloud_cover: times.map(() => 0) };
  for (const level of PRESSURE_LEVELS) {
    const metres = 44330 * (1 - (level / 1013.25) ** .1903);
    const fields = { temperature: [15 - .0065 * metres, '°C'], relative_humidity: [25, '%'], cloud_cover: [0, '%'],
      wind_speed: [20, 'kn'], wind_direction: [240, '°'], vertical_velocity: [0, 'm/s'], geopotential_height: [metres, 'm'] };
    for (const [field, [value, unit]] of Object.entries(fields)) {
      const name = `${field}_${level}hPa`;
      hourlyUnits[name] = unit;
      hourly[name] = times.map(() => value);
    }
  }
  return latitudes.map((latitude, index) => ({ latitude, longitude: longitudes[index], hourly_units: hourlyUnits, hourly }));
}
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
  try {
    const content = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  browser: await browser.version(),
  fixture: 'Synthetic 18-waypoint OFP and synthetic clear GFS/AWC responses; all values illustrative; no live API call',
  widths, modules, states: [], screenshots: [], errors: [], selectorCoverage: {},
  typography: [], negativeChecks: [], trackerStates: [],
};
const captureWidths = new Map([[390, 'mobile'], [768, 'tablet'], [1440, 'desktop']]);
const audit = async (page, label) => {
  const probe = await page.evaluate(() => window.VelocityVisualProbe());
  const data = await page.evaluate(() => {
    const visible = element => {
      const box = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return css.display !== 'none' && css.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const dimensions = selector => [...document.querySelectorAll(selector)].filter(visible).map(element => {
      const box = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return { selector: element.id ? `#${element.id}` : element.className?.baseVal || element.className || element.tagName.toLowerCase(),
        x: Math.round(box.x), xExact: box.x, y: Math.round(box.y), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom),
        width: Math.round(box.width), height: Math.round(box.height), borderWidth: css.borderTopWidth,
        borderRadius: css.borderRadius, fontSize: css.fontSize, fontWeight: css.fontWeight,
        lineHeight: css.lineHeight, padding: css.padding };
    });
    return {
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      heading: dimensions('.area-heading h1'),
      headingContent: dimensions('.area-heading > div:first-child'),
      headingEyebrow: dimensions('.area-heading > div:first-child > span'),
      ofpContent: dimensions('.plan-bar .plan-identity'),
      ofpSourceBadge: dimensions('.plan-bar .route-source'),
      primaryButtons: dimensions('.primary-button'),
      textButtons: dimensions('.text-button'),
      inputs: dimensions('.ui-field > input, .ui-field > select, .ui-unit-input'),
      costControls: dimensions('#fuelPriceCurrency, .cost-price .ui-unit-input'),
      calibrationControls: dimensions('#manualWaypoint, #manualAltitude, #manualUpdateForm .ui-unit-input, #manualUpdateForm > button'),
      kpis: dimensions('.kpi-grid .kpi'),
      summaryPanels: dimensions('.summary-grid > .panel'),
      missionAdjustment: dimensions('#missionScoreAction'),
      activeArea: document.querySelector('.app-area:not([hidden])')?.dataset.areaPanel,
      activeModule: document.querySelector('.app-module:not([hidden])')?.dataset.modulePanel,
      fontFamily: getComputedStyle(document.body).fontFamily,
      rootScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      legacyTriggerVisible: (() => { const el=document.querySelector('#tool-card-update'); return el ? visible(el) : false; })(),
    };
  });
  const issues = [];
  issues.push(...probe.issues.map(issue => `${issue.code}: ${issue.target}${issue.detail ? ` (${issue.detail})` : ''}`));
  if (data.scrollWidth > data.viewport + 1) issues.push(`horizontal overflow ${data.scrollWidth - data.viewport}px`);
  if (data.legacyTriggerVisible) issues.push('retired manual update trigger is visible');
  // Compare literal text-column coordinates rather than card outer borders.
  // This must hold for all areas, languages, scales and viewport widths.
  if (data.ofpSourceBadge.length) {
    const target = data.ofpSourceBadge[0].xExact;
    for (const [name, items] of [
      ['section label', data.headingEyebrow],
      ['section title', data.heading],
      ['section heading group', data.headingContent],
      ['OFP card content', data.ofpContent],
    ]) {
      if (!items.length) continue;
      const delta = Math.abs(items[0].xExact - target);
      if (delta > 0.25) issues.push(`${name} starts ${delta.toFixed(3)}px from SIMBRIEF badge left edge (expected exact alignment)`);
    }
  }
  for (const item of [...data.primaryButtons, ...data.textButtons, ...data.inputs]) {
    if (item.height < 43) issues.push(`${item.selector} height ${item.height}px`);
    if (item.x < -1 || item.right > data.viewport + 1) issues.push(`${item.selector} outside viewport`);
  }
  if (data.kpis.length === 4) {
    const heights = data.kpis.map(item => item.height);
    if (Math.max(...heights) - Math.min(...heights) > 2) issues.push(`KPI heights differ: ${heights.join(',')}`);
  }
  if (data.summaryPanels.length === 2 && data.viewport >= 768 && Math.abs(data.summaryPanels[0].y - data.summaryPanels[1].y) > 2) issues.push('summary cards do not align at the top');
  const expectedModule = label.match(/(?:mission|planning|route|flight):(?:overview|score|config|systems|analyses|ice|ride|decisions|update)/)?.[0];
  if (expectedModule && data.activeModule !== expectedModule) issues.push(`navigation opened ${data.activeModule || 'nothing'}`);
  if (data.heading.length && data.rootScale === '1' && data.heading[0].fontSize !== '24px') issues.push(`screen title ${data.heading[0].fontSize}`);
  if (data.activeModule === 'mission:overview' && data.missionAdjustment.length) {
    const actualPx = Number.parseFloat(data.missionAdjustment[0].fontSize);
    const expectedPx = 14 * Number(data.rootScale);
    if (!Number.isFinite(actualPx) || !Number.isFinite(expectedPx) || Math.abs(actualPx - expectedPx) > 0.25)
      issues.push(`mission adjustment font ${data.missionAdjustment[0].fontSize}, expected ${expectedPx}px body text`);
  }
  report.states.push({ label, ...data, issues });
  if (/planning:config|planning:systems|planning:analyses|flight:update|route:ice|route:ride|mission:overview/.test(label))
    report.typography.push({ label, values: probe.typography });
  if (issues.length) report.errors.push({ label, issues });
};
const activate = async (page, area, module) => {
  await page.locator(`[data-area-button="${area}"]:visible`).first().click();
  const tab=page.locator(`[data-module-button="${area}:${module}"]:visible`);
  if(await tab.count())await tab.click();
  await assert.doesNotReject(page.locator(`[data-module-panel="${area}:${module}"]:visible`).waitFor());
};
const screenshot = async (page, width, area, module) => {
  const device = captureWidths.get(width);
  if (!device) return;
  const folder = baseline ? 'definitive-before' : afterFolder;
  const name = `${device}-${area}-${module}.png`;
  const file = path.join(output, folder, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  report.screenshots.push(`${folder}/${name}`);
  if (width === 390 && (area !== 'mission' || module === 'analysis')) {
    const fullName = `${device}-${area}-${module}-full.png`;
    await page.screenshot({ path: path.join(output, folder, fullName), fullPage: true, animations: 'disabled' });
    report.screenshots.push(`${folder}/${fullName}`);
  }
};

try {
  if (!trackerOnly) {
  for (const width of widths) {
    let awcMode = 'clear';
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : width === 768 ? 1024 : 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ label: `${width}px`, pageError: error.message }));
    await page.route('**/api/xml.fetcher.php?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    await page.route('**/v1/gfs?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gfsFixture(route.request().url())) }));
    await page.route('**/weather-snapshots/awc/latest.json', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ generatedAt: new Date().toISOString(), sigmets: awcMode === 'ice' ? [{ hazard: 'ICE',
        validTimeFrom: Date.parse('2026-10-21T11:00:00Z') / 1000, validTimeTo: Date.parse('2026-10-21T16:00:00Z') / 1000,
        base: 5000, top: 12000, coords: [{ lat: -24, lon: -47 }, { lat: -24, lon: -42 }, { lat: -22, lon: -42 }, { lat: -22, lon: -47 }] }] : [], pireps: [] }) }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.VelocityLayout);
    await page.addScriptTag({ path: path.join(projectRoot, 'scripts/visual-probe.js') });
    if (width === 390 && !baseline) {
      const cases = {
        '38px select beside 44px input': ['control-row-drift', '<div data-ui-control-row="cost" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="ui-field"><span>A</span><select style="min-height:38px;height:38px"><option>A</option></select></label><label class="ui-field"><span>B</span><input value="4"></label></div>'],
        '38px grid track around 44px control': ['field-row-underflow', '<label class="ui-field" style="display:grid;grid-template-rows:auto 38px"><span>Price</span><span class="ui-unit-input"><input value="7"><small>R$</small></span></label>'],
        'money unit over next panel': ['unit-panel-collision', '<span class="ui-unit-input" style="position:relative"><input value="7"><small id="fuelPriceSymbol" style="position:absolute;right:6px;bottom:-40px">R$</small></span><div id="costUnassessed" style="height:44px;background:#eee">Next panel</div>'],
        'icon over label': ['icon-text-collision', '<span class="ui-icon-inline" style="position:relative;display:inline-block"><svg class="ui-icon" style="position:absolute;left:0;top:0"></svg>Collision</span>'],
        'number separated from unit': ['split-number-unit', '<div data-ui-role="secondary" style="width:22px">163 kg</div>'],
        'truncated operational text': ['clipped-text', '<div data-ui-role="secondary" style="width:28px;white-space:nowrap;overflow:hidden">123 gal</div>'],
        'unequal paired cards': ['card-pair-drift', '<div data-ui-card-pair style="display:grid;grid-template-columns:1fr 1fr"><div class="panel" style="height:44px"></div><div class="panel" style="height:70px"></div></div>'],
        'different secondary typography': ['secondary-value-mismatch', '<strong id="payloadOutput" data-ui-role="secondary">2 kg</strong><strong id="layoutFuelMargin" data-ui-role="secondary" style="font-size:13px">3 gal</strong>'],
        'button text outside border': ['button-text-outside', '<button style="width:38px;white-space:nowrap;overflow:visible"><span>Record flight now</span></button>'],
        'narrow-screen overflow': ['viewport-overflow', '<div class="panel" style="width:600px;height:44px"></div>'],
      };
      for (const [name, [expected, html]] of Object.entries(cases)) {
        const codes = await page.evaluate(markup => {
          const fixture = document.createElement('section');
          fixture.className = 'app-module';
          fixture.style.cssText = 'position:absolute;left:0;top:0;width:390px;z-index:-1';
          fixture.innerHTML = markup;
          document.body.append(fixture);
          const found = window.VelocityVisualProbe(fixture).issues.map(issue => issue.code);
          fixture.remove();
          return found;
        }, html);
        report.negativeChecks.push({ name, expected, detected: codes.includes(expected), codes });
        if (!codes.includes(expected)) report.errors.push({ label: `negative detector: ${name}`, issues: [`failed to detect ${expected}`] });
      }
    }
    await page.locator('#quickPilotId').focus();
    const focusShadow = await page.locator('#quickPilotId').evaluate(element => getComputedStyle(element).boxShadow);
    if (focusShadow === 'none') report.errors.push({ label: `${width}px focus`, issues: ['Pilot ID focus indication is missing'] });
    if (!baseline) await audit(page, `${width}px no OFP`);
    if (width === 1440 && !baseline) {
      await fs.mkdir(path.join(output, afterFolder), { recursive: true });
      await page.screenshot({ path: path.join(output, afterFolder, 'desktop-no-ofp.png'), animations: 'disabled' });
      report.screenshots.push(`${afterFolder}/desktop-no-ofp.png`);
    }
    await page.locator('#quickPilotId').fill('VISUAL-FIXTURE');
    await page.locator('#importLatest').click();
    await page.locator('#routeTitle').getByText('SBSP', { exact: false }).waitFor();
    await page.waitForFunction(() => document.querySelector('#missionRiskValue')?.textContent !== '—', { timeout: 10000 });
    if (width === 390 && !baseline) {
      await activate(page, 'flight', 'update');
      await page.locator('#observedTas').focus();
      const fieldFocus = await page.locator('#observedTas').evaluate(element => getComputedStyle(element.closest('.ui-unit-input')).boxShadow);
      if (fieldFocus === 'none') report.errors.push({ label: '390px calibration focus', issues: ['unit field has no focus indicator'] });
    }
    if (baseline) {
      if (captureWidths.has(width)) {
        for (const [area, module] of [['mission', 'overview'], ['planning', 'config'], ['route', 'ice'], ['flight', 'update']]) {
          await activate(page, area, module);
          await screenshot(page, width, area, module);
        }
        await activate(page, 'planning', 'analyses');
        await screenshot(page, width, 'planning', 'cost-unassessed');
      }
      await context.close();
      continue;
    }
    await activate(page, 'planning', 'config');
    for (const mode of ['ECON', 'NORMAL', 'FAST']) {
      await page.locator(`[data-mode="${mode}"]`).click();
      await audit(page, `${width}px PT-BR LB/GAL A planning:config ${mode}`);
    }
    await page.locator('[data-mode="NORMAL"]').click();
    if ([390, 1440].includes(width)) {
      await activate(page, 'mission', 'overview');
      const original = await page.evaluate(() => {
        const badge = document.querySelector('#feasibilityBadge');
        const score = document.querySelector('#missionScoreStatus');
        const level = document.querySelector('#kpiSelectedLevel');
        return { badge: badge.className, badgeText: badge.textContent, badgeHidden: badge.hidden,
          score: score.dataset.status, scoreText: score.textContent, level: level.dataset.status };
      });
      for (const [tone, badgeClass, caption] of [['marginal', 'marginal', 'MARGINAL'], ['not-viable', 'unavailable', 'INVIÁVEL']]) {
        await page.evaluate(({ tone, badgeClass, caption }) => {
          const badge = document.querySelector('#feasibilityBadge');
          badge.className = `feasibility-badge ${badgeClass}`;
          badge.hidden = false;
          badge.textContent = caption;
          const score = document.querySelector('#missionScoreStatus');
          score.dataset.status = tone;
          score.textContent = caption;
          document.querySelector('#kpiSelectedLevel').dataset.status = tone;
        }, { tone, badgeClass, caption });
        await audit(page, `${width}px synthetic ${tone} status`);
      }
      await page.evaluate(saved => {
        const badge = document.querySelector('#feasibilityBadge');
        badge.className = saved.badge;
        badge.hidden = saved.badgeHidden;
        badge.textContent = saved.badgeText;
        const score = document.querySelector('#missionScoreStatus');
        if (saved.score === undefined) delete score.dataset.status; else score.dataset.status = saved.score;
        score.textContent = saved.scoreText;
        const level = document.querySelector('#kpiSelectedLevel');
        if (saved.level === undefined) delete level.dataset.status; else level.dataset.status = saved.level;
      }, original);
    }
    for (const [area, keys] of Object.entries(modules)) {
      for (const module of keys) {
        await activate(page, area, module);
        await audit(page, `${width}px PT-BR LB/GAL A ${area}:${module}`);
        if (captureWidths.has(width) && ['mission:overview', 'mission:score', 'planning:config', 'planning:systems', 'route:ice', 'route:ride', 'flight:update'].includes(`${area}:${module}`)) await screenshot(page, width, area, module);
        if (area === 'planning' && module === 'config') {
          await page.locator('#optimizeMission').click();
          await page.locator('#pilotDecisionPanel:visible').waitFor();
          await audit(page, `${width}px optimized mission:overview`);
          const decision = await page.evaluate(() => ({
            top: document.querySelectorAll('#topLevelCards .top-level-card').length,
            unique: new Set([...document.querySelectorAll('#topLevelCards .top-level-card')].map(el => el.dataset.decisionFl)).size,
            applied: localStorage.getItem('velocityxl.appliedMission'),
          }));
          if (decision.top !== decision.unique || decision.top > 3 || decision.applied)
            report.errors.push({ label: `${width}px ranking contract`, issues: [JSON.stringify(decision)] });
          if(captureWidths.has(width))await screenshot(page,width,'mission','decision');
          if(captureWidths.has(width) && await page.locator('#topLevelCards .top-level-card').count()){
            await page.locator('#topLevelCards .top-level-card').first().click();
            await audit(page, `${width}px pilot analysis mission:overview`);
            const actionGeometry = await page.evaluate(() => {
              const apply = document.querySelector('#applyPilotAlternative')?.getBoundingClientRect();
              const rerank = document.querySelector('#recalculateRanking')?.getBoundingClientRect();
              return apply && rerank ? { apply: { x: apply.x, width: apply.width, height: apply.height },
                rerank: { x: rerank.x, width: rerank.width, height: rerank.height } } : null;
            });
            if (!actionGeometry || Math.abs(actionGeometry.apply.width - actionGeometry.rerank.width) > 1
              || Math.abs(actionGeometry.apply.height - actionGeometry.rerank.height) > 1
              || Math.abs(actionGeometry.apply.x - actionGeometry.rerank.x) > 1)
              report.errors.push({ label: `${width}px pilot decision button geometry`,
                issues: [JSON.stringify(actionGeometry) || 'missing action buttons'] });
            await page.locator('#pilotAnalysis').scrollIntoViewIfNeeded();
            await screenshot(page,width,'mission','analysis');
            if(width===390){
              await page.locator('#applyPilotAlternative').scrollIntoViewIfNeeded();
              const actionPath=path.join(output,afterFolder,'mobile-mission-analysis-action.png');
              await page.screenshot({path:actionPath,animations:'disabled'});
              report.screenshots.push(`${afterFolder}/mobile-mission-analysis-action.png`);
            }
            await page.locator('#cancelPilotAnalysis').click();
          }
          await activate(page,'planning','config');
        }
        for (const tool of tools[`${area}:${module}`] || []) {
          const trigger = page.locator(`[data-tool-view="${tool}"]:visible`);
          const panel = page.locator(`[data-tool-panel="${tool}"]:visible`);
          if (await trigger.count()) await trigger.click();
          if (await panel.count()) {
            await audit(page, `${width}px PT-BR LB/GAL A ${area}:${module}:${tool}`);
            if (tool === 'alternate') {
              const metrics = await page.evaluate(() => {
                const group = document.querySelector('[data-tool-panel="alternate"] .advisor-strip');
                if (!group) return null;
                const cells = [...group.children];
                const groupBox = group.getBoundingClientRect();
                return { group: { left: groupBox.left, right: groupBox.right },
                  gap: getComputedStyle(group).columnGap,
                  cells: cells.map(cell => {
                    const box = cell.getBoundingClientRect();
                    const label = cell.querySelector('b');
                    const value = cell.querySelector('strong');
                    const valueBox = value?.getBoundingClientRect();
                    const labelBox = label?.getBoundingClientRect();
                    const style = getComputedStyle(cell);
                    return { x: box.x, right: box.right, width: box.width, y: box.y,
                      labelScroll: label?.scrollWidth, labelWidth: label?.clientWidth,
                      labelBottom: labelBox?.bottom, valueBottom: valueBox?.bottom,
                      valueRight: valueBox?.right, valueLeft: valueBox?.left,
                      borderTop: style.borderTopWidth, borderRight: style.borderRightWidth,
                      borderBottom: style.borderBottomWidth, borderLeft: style.borderLeftWidth };
                  }) };
              });
              const cells = metrics?.cells || [];
              const metricIssues = [];
              if (cells.length !== 3) metricIssues.push('expected three fuel metrics');
              else {
                if (cells.some(cell => Math.abs(cell.width - cells[0].width) > 1 || Math.abs(cell.y - cells[0].y) > 1))
                  metricIssues.push('metric columns have unequal width or top alignment');
                if (cells.some(cell => Math.abs(cell.valueBottom - cells[0].valueBottom) > 1))
                  metricIssues.push('fuel values do not share a baseline');
                if (cells.some(cell => cell.labelScroll > cell.labelWidth + 1))
                  metricIssues.push('metric labels overflow their columns');
                if (cells.some(cell => cell.right > metrics.group.right + 1 || cell.x < metrics.group.left - 1))
                  metricIssues.push('metric columns exceed container');
                if (cells.some(cell => cell.borderTop !== '0px' || cell.borderRight !== '0px'
                    || cell.borderBottom !== '0px' || cell.borderLeft !== '0px'))
                  metricIssues.push('unexpected metric divider');
              }
              if (metricIssues.length) report.errors.push({ label: `${width}px alternate fuel metrics`, issues: metricIssues, metrics });
              if (captureWidths.has(width)) await screenshot(page, width, area, 'alternate');
            }
            if (tool === 'cost') {
              if (captureWidths.has(width)) await screenshot(page, width, area, 'cost-unassessed');
              await page.locator('#fuelPricePerLiter').fill('7.25');
              await audit(page, `${width}px PT-BR LB/GAL A ${area}:${module}:cost priced`);
              if (captureWidths.has(width)) await screenshot(page, width, area, 'cost');
              await page.locator('#fuelPriceCurrency').selectOption('USD');
              await audit(page, `${width}px PT-BR LB/GAL A ${area}:${module}:cost USD`);
              await page.locator('#fuelPriceCurrency').selectOption('BRL');
            }
          }
        }
      }
    }
    if (width === 1440) {
      await activate(page, 'planning', 'config');
      await page.locator('#optimizeMission').click();
      await page.locator('#pilotDecisionPanel:visible').waitFor();
      const cards=page.locator('#topLevelCards .top-level-card');
      if(await cards.count()){
        await cards.first().click();
        await page.locator('#pilotAnalysis:visible').waitFor();
        const before=await page.evaluate(()=>localStorage.getItem('velocityxl.appliedMission'));
        if(before)report.errors.push({label:'1440px selection',issues:['analysis applied without confirmation']});
        const auto=await page.locator('#decisionAutoStatus').textContent();
        const originalFuel=await page.locator('#analysisComparison').textContent();
        await page.locator('[data-analysis-mode="FAST"]').click();
        const fasterFuel=await page.locator('#analysisComparison').textContent();
        if(originalFuel===fasterFuel || await page.locator('#decisionAutoStatus').textContent()!==auto)
          report.errors.push({label:'1440px scenario switch',issues:['preset analysis did not recalculate or changed automatic recommendation']});
        await page.locator('[data-analysis-mode="MANUAL"]').click();
        await page.locator('#analysisMap').fill('99');
        if(await page.locator('#applyPilotAlternative').isEnabled())
          report.errors.push({label:'1440px invalid manual',issues:['out-of-range MAP may be applied']});
        await page.locator('#analysisMap').fill('25.5');
        await page.locator('#analysisRpm').fill('2475');
        await audit(page,'1440px manual scenario mission:overview');
        await page.locator('#cancelPilotAnalysis').click();
        if(await page.locator('#pilotAnalysis').isVisible() || await page.evaluate(()=>localStorage.getItem('velocityxl.appliedMission')))
          report.errors.push({label:'1440px cancel',issues:['cancel changed applied configuration']});
        await cards.first().click();
        const apply=page.locator('#applyPilotAlternative');
        if(await apply.isEnabled()){
          await apply.click();
          if((await apply.textContent())?.includes('marginal'))await apply.click();
          const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('velocityxl.appliedMission')||'null'));
          if(!stored?.choice)report.errors.push({label:'1440px explicit apply',issues:['confirmed choice was not persisted']});
          else {
            const expectedFuel=stored.fuelOnboardGal;
            await page.reload({waitUntil:'domcontentloaded'});
            await page.addScriptTag({path:path.join(projectRoot,'scripts/visual-probe.js')});
            await page.locator('#quickPilotId').fill('VISUAL-FIXTURE');
            await page.locator('#importLatest').click();
            await page.locator('#routeTitle').getByText('SBSP',{exact:false}).waitFor();
            const restored=await page.evaluate(()=>({fuel:Number(document.querySelector('#fuelInput').value),level:document.querySelector('#kpiLevelMeta').textContent}));
            if(restored.fuel!==expectedFuel || !/aplicada|applied/i.test(restored.level))
              report.errors.push({label:'1440px applied restore',issues:[JSON.stringify(restored)]});
            const otherOFP=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...fixture,destination:{...fixture.destination,icao_code:'SBNF'}})});
            await page.route('**/api/xml.fetcher.php?**',otherOFP);
            await page.locator('#importLatest').click();
            await page.locator('#routeTitle').getByText('SBNF',{exact:false}).waitFor();
            const otherLevel=await page.locator('#kpiLevelMeta').textContent();
            if(/aplicada|applied/i.test(otherLevel))
              report.errors.push({label:'1440px other OFP',issues:['configuration from previous OFP was restored']});
            await page.unroute('**/api/xml.fetcher.php?**',otherOFP);
            await page.locator('#importLatest').click();
            await page.locator('#routeTitle').getByText('SBGL',{exact:false}).waitFor();
          }
        }
      }
    }
    await page.locator('[data-language="en-US"]').click();
    await page.locator('[data-weight-unit="kg"]').click();
    await page.locator('[data-fuel-unit="l"]').click();
    await page.locator('[data-font-size="large"]').click();
    for (const [area, keys] of Object.entries(modules)) {
      for (const module of keys) {
        await activate(page, area, module);
        await audit(page, `${width}px EN-US KG/L A+ ${area}:${module}`);
      }
    }
    await page.locator('[data-font-size="small"]').click();
    await activate(page, 'mission', 'overview');
    await audit(page, `${width}px EN-US KG/L A- mission:overview`);
    await page.locator('[data-font-size="normal"]').click();
    await audit(page, `${width}px EN-US KG/L A mission:overview`);
    if ([390, 1440].includes(width)) {
      await activate(page, 'planning', 'config');
      const setRange = async (selector, value) => page.locator(selector).evaluate((element, next) => {
        element.value = String(next);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
      await setRange('#payloadInput', 1100);
      await setRange('#fuelInput', 87);
      await audit(page, `${width}px EN-US KG/L A planning:config maximum load`);
      await setRange('#payloadInput', 0);
      await setRange('#fuelInput', 0);
      await audit(page, `${width}px EN-US KG/L A planning:config minimum load`);
      await setRange('#payloadInput', 520);
      await setRange('#fuelInput', 77);
      await page.locator('[data-weight-unit="lb"]').click();
      await audit(page, `${width}px EN-US LB/L A planning:config`);
      await page.locator('[data-weight-unit="kg"]').click();
      await page.locator('[data-fuel-unit="gal"]').click();
      await audit(page, `${width}px EN-US KG/GAL A planning:config`);
      await page.locator('[data-fuel-unit="l"]').click();
    }
    if (width === 390) {
      await page.locator('#toast').evaluate(element => { element.textContent = 'A very long alert about weather, available oxygen and fuel margin across the route, used solely to check line wrapping in the visual audit.'; element.classList.add('show'); });
      await audit(page, `${width}px long alert`);
      await page.screenshot({ path: path.join(output, afterFolder, 'mobile-long-alert.png'), animations: 'disabled' });
      report.screenshots.push(`${afterFolder}/mobile-long-alert.png`);
      await activate(page, 'flight', 'update');
      const bottomClearance = await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, document.body.scrollHeight);
        const footer = document.querySelector('footer').getBoundingClientRect();
        const nav = document.querySelector('.mobile-area-nav').getBoundingClientRect();
        return { footerBottom: footer.bottom, navTop: nav.top };
      });
      if (bottomClearance.footerBottom > bottomClearance.navTop + 1)
        report.errors.push({ label: '390px bottom navigation', issues: [`footer ends at ${bottomClearance.footerBottom}px behind navigation at ${bottomClearance.navTop}px`] });
      await page.locator('#toast').evaluate(element => element.classList.remove('show'));
      await page.locator('[data-language="pt-BR"]').click();
      await page.locator('[data-fuel-unit="gal"]').click();
      await page.locator('#resetCalibration').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, afterFolder, 'mobile-flight-calibration-bottom.png'), animations: 'disabled' });
      report.screenshots.push(`${afterFolder}/mobile-flight-calibration-bottom.png`);
    }
    if (width === 1440) {
      const coverage = await page.evaluate(() => {
        const rows = [];
        const split = value => { let parts = [], start = 0, depth = 0; for (let i = 0; i < value.length; i++) { if ('(['.includes(value[i])) depth++; else if (')]'.includes(value[i])) depth--; else if (value[i] === ',' && !depth) { parts.push(value.slice(start, i)); start = i + 1; } } parts.push(value.slice(start)); return parts; };
        const walk = rules => { for (const rule of rules) { if (rule.selectorText) { const parts = split(rule.selectorText); let match = false; let stateOnly = false; for (const part of parts) { try { if (document.querySelector(part.replace(/::[\\w-]+(?:\\([^)]*\\))?/g, ''))) match = true; } catch { stateOnly = true; } } rows.push({ selector: rule.selectorText, matched: match, stateOnly }); } else if (rule.cssRules) walk(rule.cssRules); } };
        walk(document.styleSheets[0].cssRules);
        return { total: rows.length, unmatched: rows.filter(row => !row.matched) };
      });
      report.selectorCoverage = coverage;
      await page.setViewportSize({ width: 720, height: 900 });
      await activate(page, 'planning', 'config');
      await audit(page, '1440px at 200% equivalent viewport planning:config');
      await page.setViewportSize({ width: 1440, height: 900 });
      await activate(page, 'flight', 'update');
      await page.locator('[data-fuel-unit="gal"]').click();
      await page.locator('#manualWaypoint').selectOption({ index: 2 });
      await page.locator('#manualAltitude').selectOption('18000');
      await page.locator('#manualFuel').fill('60');
      await page.locator('#observedTas').fill('245');
      if(await page.locator('#submitFlightUpdate').isEnabled())
        report.errors.push({label:'1440px incomplete calibration',issues:['one optional reading enabled submission']});
      await page.locator('#observedFuelFlow').fill('17.5');
      await page.locator('#submitFlightUpdate').click();
      const calibration=await page.evaluate(()=>JSON.parse(localStorage.getItem('velocityxl.calibration')||'null'));
      if(!calibration?.reference)report.errors.push({label:'calibration regression',issues:['complete in-flight observation was not stored']});
    }
    if (engineV2 && [390, 1440].includes(width)) {
      awcMode = 'ice';
      await page.locator('#importLatest').click();
      await page.waitForFunction(() => document.querySelector('#kpiAltitude')?.textContent === '—');
      await activate(page, 'planning', 'config');
      await audit(page, `${width}px EN-US KG/L A planning:config no feasible FL`);
      if (await page.locator('#topLevelCards .top-level-card').count())
        report.errors.push({ label: `${width}px no solution`, issues: ['an incompatible mission can still be applied'] });
      const file = `${width === 390 ? 'mobile' : 'desktop'}-icing-no-solution.png`;
      await page.screenshot({ path: path.join(output, afterFolder, file), animations: 'disabled' });
      report.screenshots.push(`${afterFolder}/${file}`);
    }
    await context.close();
  }
  if (engineV2) {
    for (const [width, mode] of [[390, 'partial'], [390, 'offline'], [1440, 'offline']]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ label: `${width}px ${mode}`, pageError: error.message }));
      await page.route('**/api/xml.fetcher.php?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
      await page.route('**/v1/gfs?**', route => mode === 'offline' ? route.fulfill({ status: 503, body: 'unavailable' })
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gfsFixture(route.request().url())) }));
      await page.route('**/weather-snapshots/awc/latest.json', route => route.fulfill({ status: 404, body: 'unavailable' }));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.VelocityLayout);
      await page.addScriptTag({ path: path.join(projectRoot, 'scripts/visual-probe.js') });
      await page.locator('#quickPilotId').fill('VISUAL-FIXTURE');
      await page.locator('#importLatest').click();
      await page.waitForTimeout(mode === 'offline' ? 1800 : 500);
      await activate(page, 'planning', 'config');
      await page.locator('#optimizeMission').click();
      await page.locator('#pilotDecisionPanel:visible').waitFor();
      await audit(page, `${width}px ${mode} weather mission:overview`);
      if (mode === 'offline' && (await page.locator('#kpiAltitude').textContent())?.trim() !== '—')
        report.errors.push({ label: `${width}px ${mode}`, issues: ['unknown weather appears as a recommended FL'] });
      if (mode === 'offline' && (await page.locator('#missionRiskValue').textContent())?.trim() !== '—')
        report.errors.push({ label: `${width}px ${mode}`, issues: ['unknown weather appears as a numeric mission score'] });
      if (mode === 'offline' && await page.locator('#topLevelCards .top-level-card').count())
        report.errors.push({ label: `${width}px ${mode}`, issues: ['unknown weather proposal can be applied'] });
      const name = `${width === 390 ? 'mobile' : 'desktop'}-${mode}-weather.png`;
      await page.screenshot({ path: path.join(output, afterFolder, name), animations: 'disabled' });
      report.screenshots.push(`${afterFolder}/${name}`);
      await context.close();
    }
  }
  }
  if (engineV2 && !baseline) {
    const trackerFolder = path.join(output, 'virtual-flight-tracker-v1');
    await fs.mkdir(trackerFolder, { recursive: true });
    const captureTracker = async (page, width, state) => {
      if (!captureWidths.has(width)) return;
      const device = captureWidths.get(width);
      await page.locator('#toast').evaluate(element => element.classList.remove('show'));
      for (const [suffix, target] of [['', page], ['-card', page.locator('#virtualTracker')]]) {
        const name = `${device}-${state}${suffix}.png`;
        await target.screenshot({ path: path.join(trackerFolder, name), animations: 'disabled',
          ...(suffix ? { style: '.mobile-area-nav { visibility: hidden !important; }' } : {}) });
        report.screenshots.push(`virtual-flight-tracker-v1/${name}`);
      }
    };
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : width === 768 ? 1024 : 900 } });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ label: `${width}px tracker`, pageError: error.message }));
      await page.addInitScript((applied) => {
        localStorage.setItem('velocityxl.appliedMission', JSON.stringify(applied));
      }, { planKey: trackerPlanKey, choice: { altitudeFt: 18000, mode: 'NORMAL' },
        engineMode: 'NORMAL', powerSetting: { type: 'AUTO' }, fuelOnboardGal: 77 });
      await page.route('**/api/xml.fetcher.php?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
      await page.route('**/v1/gfs?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gfsFixture(route.request().url())) }));
      await page.route('**/weather-snapshots/awc/latest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt: new Date().toISOString(), sigmets: [], pireps: [] }) }));
      const importPlan = async () => {
        await page.locator('#quickPilotId').fill('TRACKER-FIXTURE');
        await page.locator('#importLatest').click();
        await page.locator('#routeTitle').getByText('SBSP', { exact: false }).waitFor();
        await activate(page, 'flight', 'update');
      };
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.VelocityLayout);
      await page.addScriptTag({ path: path.join(projectRoot, 'scripts/visual-probe.js') });
      await importPlan();
      if (!await page.locator('#trackerPrimary').isEnabled()) report.errors.push({ label: `${width}px tracker`, issues: ['applied configuration did not enable start'] });
      await audit(page, `${width}px tracker not started flight:update`);
      await page.locator('#trackerPrimary').click();
      const start = await page.evaluate(() => ({ width: document.querySelector('#virtualTracker').getBoundingClientRect().width,
        metrics: [...document.querySelectorAll('.tracker-metrics > div')].map(item => { const r=item.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; }),
        clock: document.querySelector('#trackerClock').textContent,
        stored: JSON.parse(localStorage.getItem('velocityxl.virtualFlightTracker.v1') || 'null') }));
      if (start.stored?.status !== 'RUNNING') report.errors.push({ label: `${width}px tracker start`, issues: ['clock state was not persisted'] });
      await audit(page, `${width}px tracker running flight:update`);
      await page.waitForFunction((clock) => document.querySelector('#trackerClock').textContent !== clock,
        start.clock, { timeout: 3500 });
      const after = await page.evaluate(() => ({ width: document.querySelector('#virtualTracker').getBoundingClientRect().width,
        metrics: [...document.querySelectorAll('.tracker-metrics > div')].map(item => { const r=item.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; }),
        clock: document.querySelector('#trackerClock').textContent }));
      if (start.width !== after.width || start.metrics.some((item,index) => Math.abs(item.x-after.metrics[index].x)>1 || Math.abs(item.y-after.metrics[index].y)>1 || Math.abs(item.height-after.metrics[index].height)>1))
        report.errors.push({ label: `${width}px tracker stability`, issues: ['metric geometry shifted during clock tick'] });
      if (start.clock === after.clock) report.errors.push({ label: `${width}px tracker clock`, issues: ['simulation clock did not advance'] });
      await page.locator('#trackerFactor').selectOption('8');
      await page.locator('#trackerSyncToggle').click();
      await audit(page, `${width}px tracker sync flight:update`);
      await captureTracker(page, width, 'checkpoint');
      await page.locator('#trackerFix').selectOption('5');
      await page.locator('#trackerObservedFuel').fill('60');
      await page.locator('#trackerConfirmFix').click();
      const sync = await page.evaluate(() => JSON.parse(localStorage.getItem('velocityxl.virtualFlightTracker.v1') || 'null'));
      if (sync?.checkpoints?.length !== 1 || sync.checkpoints[0].fuelGal !== 60)
        report.errors.push({ label: `${width}px tracker checkpoint`, issues: ['observed fix and fuel were not persisted'] });
      await page.locator('#trackerProjectionToggle').click();
      await audit(page, `${width}px tracker projection flight:update`);
      const conditions = await page.locator('#trackerConditions').textContent();
      if (!/NÃO AVALIADO|UNASSESSED/.test(conditions))
        report.errors.push({ label: `${width}px tracker weather`, issues: ['unconfirmed weather appeared assessed'] });
      await captureTracker(page, width, 'projection');
      if ([390, 1440].includes(width)) {
        await page.locator('.tracker-events summary').click();
        const eventsText = await page.locator('#trackerEvents').textContent();
        if (!/TOC · OFP/.test(eventsText) || !/TOD · OFP/.test(eventsText) || !/MODELO/.test(eventsText))
          report.errors.push({ label: `${width}px tracker TOC/TOD`, issues: ['OFP and model markers not shown independently'] });
        await audit(page, `${width}px tracker events flight:update`);
        await captureTracker(page, width, 'events');
      }
      await page.locator('#trackerProjectionClose').click();
      await page.locator('#trackerPrimary').click();
      if ((await page.locator('#trackerState').textContent())?.trim() !== 'PAUSADO')
        report.errors.push({ label: `${width}px tracker pause`, issues: ['pause state missing'] });
      await page.locator('#trackerPrimary').click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ path: path.join(projectRoot, 'scripts/visual-probe.js') });
      await importPlan();
      if (!await page.locator('#trackerAttention').isVisible())
        report.errors.push({ label: `${width}px tracker recovery`, issues: ['recovered running session did not request resynchronization'] });
      await audit(page, `${width}px tracker recovered flight:update`);
      await captureTracker(page, width, 'running');
      if ([390, 1440].includes(width)) {
        for (const [marker, beforePhase, afterPhase] of [['tocSec', 'SUBIDA', 'CRUZEIRO'], ['todSec', 'CRUZEIRO', 'DESCIDA']]) {
          await page.evaluate((name) => {
            const saved = JSON.parse(localStorage.getItem('velocityxl.virtualFlightTracker.v1'));
            saved.status = 'RUNNING'; saved.factor = 8;
            saved.accumulatedSec = saved.profile[name] - 20;
            saved.anchorWallMs = Date.now(); saved.recoveredAttention = false;
            saved.anchor = { simSec: 0, modelSec: 0, distanceNm: 0,
              fuelGal: saved.profile.startFuelGal, fuelSource: 'PROJECTED', observedAltitudeFt: null };
            saved.checkpoints = []; saved.confirmedPhase = null;
            localStorage.setItem('velocityxl.virtualFlightTracker.v1', JSON.stringify(saved));
          }, marker);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.addScriptTag({ path: path.join(projectRoot, 'scripts/visual-probe.js') });
          await importPlan();
          const label = marker === 'tocSec' ? 'toc' : 'tod';
          if (!(await page.locator('#trackerPhase').textContent()).includes(beforePhase))
            report.errors.push({ label: `${width}px tracker ${label} before`, issues: [`expected ${beforePhase} before transition`] });
          await audit(page, `${width}px tracker ${label} before flight:update`);
          await captureTracker(page, width, `${label}-before`);
          await page.waitForFunction(phase => document.querySelector('#trackerPhase').textContent.includes(phase), afterPhase, { timeout: 8000 });
          await audit(page, `${width}px tracker ${label} after flight:update`);
          await captureTracker(page, width, `${label}-after`);
        }
      }
      await page.locator('[data-language="en-US"]').click();
      await page.locator('[data-weight-unit="kg"]').click();
      await page.locator('[data-fuel-unit="l"]').click();
      await page.locator('[data-font-size="large"]').click();
      await audit(page, `${width}px tracker EN-US KG/L A+ flight:update`);
      if (width === 1440) {
        await page.locator('#manualWaypoint').selectOption('0');
        await page.locator('#manualAltitude').selectOption('18000');
        await page.locator('#manualFuel').fill('200');
        await page.locator('#submitFlightUpdate').click();
        const unresolved = await page.evaluate(() => ({ phase: document.querySelector('#trackerPhase').textContent,
          status: document.querySelector('#trackerState').textContent,
          session: JSON.parse(localStorage.getItem('velocityxl.virtualFlightTracker.v1') || 'null') }));
        if (unresolved.phase !== '—' || unresolved.status !== 'PAUSED'
          || !unresolved.session?.limitations?.includes('MANUAL_UPDATE_UNMODELED'))
          report.errors.push({ label: '1440px tracker unmodeled FL', issues: ['invalid prospective FL was projected as known'] });
        await audit(page, `${width}px tracker unmodeled FL flight:update`);
      }
      report.trackerStates.push({ width, startClock: start.clock, afterClock: after.clock,
        checkpoint: sync?.checkpoints?.at(-1), weather: conditions });
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

await fs.writeFile(path.join(output, trackerOnly ? 'virtual-flight-tracker-v1/browser-audit.json' : baseline ? 'definitive-baseline-audit.json' : engineV2 ? 'decision-engine-v3-browser-audit.json' : 'definitive-browser-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.states.length} browser states, ${report.errors.filter(item => item.issues || item.pageError).length} failures, ${report.screenshots.length} screenshots`);
const failures = report.errors.filter(item => item.issues || item.pageError);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
