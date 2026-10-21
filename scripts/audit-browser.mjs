import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const projectRoot = path.resolve(import.meta.dirname, '..');
const baselineIndex = process.argv.indexOf('--baseline');
const baseline = baselineIndex >= 0;
const root = baseline ? path.resolve(process.argv[baselineIndex + 1]) : projectRoot;
const output = path.join(projectRoot, 'review');
const widths = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const modules = {
  mission: ['overview', 'score'],
  planning: ['config', 'optimize', 'systems', 'analyses'],
  route: ['overview', 'ice', 'ride', 'decisions'],
  flight: ['calibration'],
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
  fixture: 'Synthetic 18-waypoint OFP; all values illustrative; no SimBrief network call',
  widths, modules, states: [], screenshots: [], errors: [], selectorCoverage: {},
};
const captureWidths = new Map([[390, 'mobile'], [768, 'tablet'], [1440, 'desktop']]);
const audit = async (page, label) => {
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
        x: Math.round(box.x), y: Math.round(box.y), right: Math.round(box.right), width: Math.round(box.width), height: Math.round(box.height),
        fontSize: css.fontSize, padding: css.padding };
    });
    return {
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      heading: dimensions('.area-heading h1'),
      primaryButtons: dimensions('.primary-button'),
      textButtons: dimensions('.text-button'),
      inputs: dimensions('.field input, .input-with-unit input'),
      kpis: dimensions('.kpi-grid .kpi'),
      summaryPanels: dimensions('.summary-grid > .panel'),
      activeArea: document.querySelector('.app-area:not([hidden])')?.dataset.areaPanel,
      activeModule: document.querySelector('.app-module:not([hidden])')?.dataset.modulePanel,
      fontFamily: getComputedStyle(document.body).fontFamily,
      rootScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      legacyTriggerVisible: visible(document.querySelector('#tool-card-update')),
    };
  });
  const issues = [];
  if (data.scrollWidth > data.viewport + 1) issues.push(`horizontal overflow ${data.scrollWidth - data.viewport}px`);
  if (data.legacyTriggerVisible) issues.push('retired manual update trigger is visible');
  for (const item of [...data.primaryButtons, ...data.textButtons, ...data.inputs]) {
    if (item.height < 43) issues.push(`${item.selector} height ${item.height}px`);
    if (item.x < -1 || item.right > data.viewport + 1) issues.push(`${item.selector} outside viewport`);
  }
  if (data.kpis.length === 4) {
    const heights = data.kpis.map(item => item.height);
    if (Math.max(...heights) - Math.min(...heights) > 2) issues.push(`KPI heights differ: ${heights.join(',')}`);
  }
  if (data.summaryPanels.length === 2 && data.viewport >= 768 && Math.abs(data.summaryPanels[0].y - data.summaryPanels[1].y) > 2) issues.push('summary cards do not align at the top');
  const expectedModule = label.match(/(?:mission|planning|route|flight):(?:overview|score|config|optimize|systems|analyses|ice|ride|decisions|calibration)/)?.[0];
  if (expectedModule && data.activeModule !== expectedModule) issues.push(`navigation opened ${data.activeModule || 'nothing'}`);
  if (data.heading.length && data.rootScale === '1' && data.heading[0].fontSize !== '24px') issues.push(`screen title ${data.heading[0].fontSize}`);
  report.states.push({ label, ...data, issues });
  if (issues.length) report.errors.push({ label, issues });
};
const activate = async (page, area, module) => {
  await page.locator(`[data-area-button="${area}"]:visible`).first().click();
  await page.locator(`[data-module-button="${area}:${module}"]:visible`).click();
  await assert.doesNotReject(page.locator(`[data-module-panel="${area}:${module}"]:visible`).waitFor());
};
const screenshot = async (page, width, area, module) => {
  const device = captureWidths.get(width);
  if (!device) return;
  const folder = baseline ? 'baseline' : 'final';
  const name = `${device}-${area}-${module}.png`;
  const file = path.join(output, folder, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  report.screenshots.push(`${folder}/${name}`);
  if (width === 390 && area !== 'mission') {
    const fullName = `${device}-${area}-${module}-full.png`;
    await page.screenshot({ path: path.join(output, folder, fullName), fullPage: true, animations: 'disabled' });
    report.screenshots.push(`${folder}/${fullName}`);
  }
};

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : width === 768 ? 1024 : 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ label: `${width}px`, pageError: error.message }));
    await page.route('**/api/xml.fetcher.php?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.VelocityLayout);
    await page.locator('#quickPilotId').focus();
    const focusShadow = await page.locator('#quickPilotId').evaluate(element => getComputedStyle(element).boxShadow);
    if (focusShadow === 'none') report.errors.push({ label: `${width}px focus`, issues: ['Pilot ID focus indication is missing'] });
    if (!baseline) await audit(page, `${width}px no OFP`);
    if (width === 1440 && !baseline) {
      await page.screenshot({ path: path.join(output, 'final', 'desktop-no-ofp.png'), animations: 'disabled' });
      report.screenshots.push('final/desktop-no-ofp.png');
    }
    await page.locator('#quickPilotId').fill('VISUAL-FIXTURE');
    await page.locator('#importLatest').click();
    await page.locator('#routeTitle').getByText('SBSP', { exact: false }).waitFor();
    if (baseline) {
      if (captureWidths.has(width)) {
        for (const [area, module] of [['mission', 'overview'], ['planning', 'config'], ['route', 'ice'], ['flight', 'calibration']]) {
          await activate(page, area, module);
          await screenshot(page, width, area, module);
        }
      }
      await context.close();
      continue;
    }
    for (const [area, keys] of Object.entries(modules)) {
      for (const module of keys) {
        await activate(page, area, module);
        await audit(page, `${width}px PT-BR LB/GAL A ${area}:${module}`);
        if (captureWidths.has(width) && ['mission:overview', 'planning:config', 'route:ice', 'flight:calibration'].includes(`${area}:${module}`)) await screenshot(page, width, area, module);
        if (area === 'planning' && module === 'optimize') {
          await page.locator('#optimizeMission').click();
          await page.locator('#missionProposal:visible').waitFor();
          await audit(page, `${width}px optimized mission`);
          const sync = await page.evaluate(() => ({
            proposalFl: document.querySelector('#proposalFl').textContent,
            kpiFl: document.querySelector('#kpiAltitude').textContent,
            proposalStatus: document.querySelector('#proposalStatus').textContent,
            badgeStatus: document.querySelector('#feasibilityBadge').textContent,
            applied: localStorage.getItem('velocityxl.appliedMission'),
          }));
          if (sync.proposalFl !== sync.kpiFl || sync.proposalStatus !== sync.badgeStatus || sync.applied)
            report.errors.push({ label: `${width}px recommendation sync`, issues: [JSON.stringify(sync)] });
          if (captureWidths.has(width)) await screenshot(page, width, area, module);
        }
        for (const tool of tools[`${area}:${module}`] || []) {
          const trigger = page.locator(`[data-tool-view="${tool}"]:visible`);
          if (await trigger.count()) {
            await trigger.click();
            await audit(page, `${width}px PT-BR LB/GAL A ${area}:${module}:${tool}`);
            if (tool === 'cost') {
              await page.locator('#fuelPricePerLiter').fill('7.25');
              await audit(page, `${width}px PT-BR LB/GAL A ${area}:${module}:cost priced`);
            }
          }
        }
      }
    }
    if (width === 1440) {
      await activate(page, 'planning', 'optimize');
      const proposedFl = await page.locator('#proposalFl').textContent();
      await page.locator('#applyMissionProposal').click();
      const applied = await page.evaluate(() => JSON.parse(localStorage.getItem('velocityxl.appliedMission') || 'null'));
      if (!applied || `FL${applied.fl}` !== proposedFl || Number(await page.locator('#fuelInput').inputValue()) !== applied.fuelOnboardGal)
        report.errors.push({ label: '1440px explicit apply', issues: ['Applied fuel/FL and stored proposal disagree'] });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#quickPilotId').fill('VISUAL-FIXTURE');
      await page.locator('#importLatest').click();
      await page.locator('#routeTitle').getByText('SBSP', { exact: false }).waitFor();
      if (Number(await page.locator('#fuelInput').inputValue()) !== applied.fuelOnboardGal)
        report.errors.push({ label: '1440px applied proposal restore', issues: ['Applied fuel was not restored for the same OFP'] });
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
    if (width === 390) {
      await page.locator('#toast').evaluate(element => { element.textContent = 'A very long alert about weather, available oxygen and fuel margin across the route, used solely to check line wrapping in the visual audit.'; element.classList.add('show'); });
      await audit(page, `${width}px long alert`);
      await page.screenshot({ path: path.join(output, 'final', 'mobile-long-alert.png'), animations: 'disabled' });
      report.screenshots.push('final/mobile-long-alert.png');
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
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

await fs.writeFile(path.join(output, baseline ? 'baseline-browser-audit.json' : 'browser-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.states.length} browser states, ${report.errors.filter(item => item.issues || item.pageError).length} failures, ${report.screenshots.length} screenshots`);
if (report.errors.some(item => item.issues || item.pageError)) process.exitCode = 1;
