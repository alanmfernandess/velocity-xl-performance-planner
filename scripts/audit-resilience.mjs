import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ensembleFixture} from '../tests/fixtures/resilience.mjs';
import {profileFixture} from '../tests/fixtures/mission-profile.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'review/resilience');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),base=`http://127.0.0.1:${server.address().port}`;
const report={fixture:'OFFLINE ILLUSTRATIVE OFP + synthetic ensemble members; screenshots are real Chromium renders, not a tested real flight',browser:browser.version(),widths:[320,375,390,430,768,1024,1440,1920],states:[],screenshots:[],errors:[]};
const types=['stress','ensemble','corridor','causal','dynamic'];
let page;
async function settled(){await page.waitForFunction(()=>document.querySelector('#resilienceLab').getAttribute('aria-busy')==='false',{timeout:45000});}
async function audit(label){
  const state=await page.evaluate(()=>{
    const host=document.querySelector('#resilienceLab'),probe=window.VelocityVisualProbe(host),visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    const controls=[...host.querySelectorAll('button,input,select,summary')].filter(visible).map(e=>({id:e.id||e.dataset.rlTab||e.dataset.rlInput||e.tagName,height:e.getBoundingClientRect().height}));
    const gaps=[...host.querySelectorAll('.rl-control')].map(e=>{const [label,value,control]=e.children;return {labelValue:value.getBoundingClientRect().top-label.getBoundingClientRect().bottom,valueControl:control.getBoundingClientRect().top-value.getBoundingClientRect().bottom};});
    const metricGaps=[...host.querySelectorAll('.rl-metric')].filter(visible).map(e=>{const [label,value]=e.children;return value.getBoundingClientRect().top-label.getBoundingClientRect().bottom;});
    const selected=host.querySelector('.rl-selected'),parts=selected?[...selected.children].map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})):[];
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,issues:probe.issues,controls,gaps,metricGaps,parts,
      rootScrollbar:getComputedStyle(document.documentElement).scrollbarWidth,svgInvalid:[...host.querySelectorAll('svg')].some(s=>/NaN|Infinity/.test(s.innerHTML)),
      title:host.querySelector('#rlTitle').textContent};
  });
  const errors=[...state.issues.map(e=>`${e.code}: ${e.target} ${e.detail||''}`)];
  if(state.scrollWidth>state.width+1)errors.push('horizontal overflow');
  for(const c of state.controls)if(c.height<43)errors.push(`control ${c.id}: ${c.height}`);
  if(state.gaps.some(g=>g.labelValue<7||g.valueControl<7))errors.push('stress spacing');
  if(state.metricGaps.some(g=>g<7))errors.push('metric label/value spacing');
  if(state.parts.some((p,i)=>i&&p.top<state.parts[i-1].bottom+7))errors.push('selected profile spacing');
  if(state.svgInvalid)errors.push('nonfinite chart');
  if(state.rootScrollbar!=='none')errors.push('visible page scrollbar');
  report.states.push({label,...state,errors});if(errors.length)report.errors.push({label,errors});
}
async function capture(name){
  await page.evaluate(()=>{const e=document.createElement('span');e.id='rlCaptureLabel';e.className='ui-status';e.textContent='PRÉVIA · DADOS ILUSTRATIVOS';document.querySelector('#resilienceLab').prepend(e);});
  await page.locator('#resilienceLab').screenshot({path:path.join(out,`${name}.png`),style:'.mobile-area-nav {visibility:hidden}'});report.screenshots.push(`${name}.png`);
  await page.evaluate(()=>document.querySelector('#rlCaptureLabel').remove());
}
try{
 for(const width of report.widths){
  const f=ensembleFixture(5),ctx=await browser.newContext({viewport:{width,height:width<760?844:1000}});page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push({label:`${width} JS`,error:e.message}));
  let network=0;
  await page.addInitScript(()=>localStorage.setItem('velocityxl.oxygen',JSON.stringify({bottleModel:'SK-12-24',bottles:4,seats:[true,true,true,true,true]})));
  await page.route('**/api/xml.fetcher.php?**',r=>r.fulfill({json:f.raw}));
  await page.route('**/v1/gfs?**',r=>{network++;return r.fulfill({json:f.gfsResponse});});
  await page.route('**/weather-snapshots/awc/latest.json',r=>r.fulfill({json:{generatedAt:new Date().toISOString(),sigmets:[],pireps:[]}}));
  await page.route('**/v1/ensemble?**',r=>{network++;const u=new URL(r.request().url()),lat=u.searchParams.get('latitude').split(',').map(Number),lon=u.searchParams.get('longitude').split(',').map(Number);return r.fulfill({json:lat.map((p,i)=>({...f.rawEnsemble[0],latitude:p,longitude:lon[i]}))});});
  await page.goto(base);await page.addScriptTag({path:path.join(root,'scripts/visual-probe.js')});
  assert.equal(await page.locator('#resilienceLab').isVisible(),false);
  await page.locator('#quickPilotId').fill('ILLUSTRATIVE');await page.locator('#importLatest').click();
  await page.waitForSelector('[data-rl-tab="stress"]');await page.waitForFunction(()=>/GFS · [1-9]/.test(document.querySelector('#mpLayerStatus').textContent));await settled();
  const storage=await page.evaluate(()=>JSON.stringify(localStorage)),ranking=await page.locator('#topLevelCards').innerHTML(),score=await page.locator('#missionScoreValue').textContent();
  for(const type of types){
    await page.locator(`[data-rl-tab="${type}"]`).click();if(type==='ensemble')await page.locator('[data-rl-action="ensemble"]').click();await settled();await audit(`${width} ${type} PT`);
    if(width===390||width===1440)await capture(`${width===390?'mobile':'desktop'}-${type}`);
  }
  if(width===768)await capture('tablet-dynamic');
  await page.locator('[data-rl-action="dynamic-preview"]').click();
  assert.match(await page.locator('#mpScenarioTag').textContent(),/EM ANÁLISE/);
  assert.equal(await page.locator('#mpCandidate').textContent(),await page.locator('.rl-selected h4').textContent());
  assert.ok(await page.locator('#mpSvg [data-profile-curve]').count());
  assert.equal(await page.locator('#missionScoreValue').textContent(),score);
  await page.locator('[data-rl-action="original"]').click();

  const requests=network;
  await page.locator('[data-rl-tab="stress"]').click();await settled();
  await page.locator('[data-rl-input="windKt"]').evaluate(e=>{e.value=10;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(300);await settled();assert.equal(network,requests,'sliders must not fetch');
  await audit(`${width} wind +10`);
  await page.locator('[data-rl-input="windKt"]').focus();await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);await settled();
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.rlInput),'windKt','slider keeps keyboard focus');
  await page.locator('[data-rl-action="preview"]').click();assert.match(await page.locator('#mpScenarioTag').textContent(),/EM ANÁLISE/);
  await page.locator('[data-rl-action="original"]').click();

  for(const lang of ['pt-BR','en-US'])for(const font of ['small','normal','large']){
    await page.locator(`[data-language="${lang}"]`).click();await page.locator(`[data-font-size="${font}"]`).click();
    await page.locator('[data-weight-unit="kg"]').click();await page.locator('[data-fuel-unit="l"]').click();await settled();
    for(const type of types){await page.locator(`[data-rl-tab="${type}"]`).click();if(type==='ensemble'&&!await page.locator('.rl-quantiles').count())await page.locator('[data-rl-action="ensemble"]').click();await settled();await audit(`${width} ${type} ${lang} ${font} KG L`);}
  }
  // Restore preferences before protected-state comparisons; UI settings are allowed to change.
  await page.locator('[data-language="pt-BR"]').click();await page.locator('[data-font-size="normal"]').click();await page.locator('[data-weight-unit="lb"]').click();await page.locator('[data-fuel-unit="gal"]').click();await settled();
  assert.equal(await page.locator('#missionScoreValue').textContent(),score,'analysis does not replace mission score');
  assert.equal(await page.locator('#topLevelCards').innerHTML(),ranking,'analysis does not replace Top 3');
  const protectedKeys=['velocityxl.appliedMission','velocityxl.virtualFlightTracker.v1','velocityxl.calibration'];
  const initial=JSON.parse(storage),after=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
  for(const key of protectedKeys)assert.equal(after[key],initial[key],`protected storage ${key}`);
  await ctx.close();
 }
 // Dedicated fresh page: no cached ensemble can disguise an unavailable provider.
 const f=ensembleFixture(),ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.addInitScript(()=>localStorage.setItem('velocityxl.oxygen',JSON.stringify({bottleModel:'SK-12-24',bottles:4,seats:[true,true,true,true,true]})));page=await ctx.newPage();
 page.on('pageerror',e=>report.errors.push({label:'adversarial JS',error:e.message}));
 await page.route('**/api/xml.fetcher.php?**',r=>r.fulfill({json:{...f.raw,navlog:profileFixture(150).raw.navlog}}));
 await page.route('**/v1/gfs?**',r=>r.fulfill({json:f.gfsResponse}));
 await page.route('**/weather-snapshots/awc/latest.json',r=>r.fulfill({json:{generatedAt:new Date().toISOString(),sigmets:[],pireps:[]}}));
 await page.route('**/v1/ensemble?**',r=>r.fulfill({status:503,body:'Unavailable'}));
 await page.goto(base);await page.addScriptTag({path:path.join(root,'scripts/visual-probe.js')});
 await page.locator('#quickPilotId').fill('ILLUSTRATIVE');await page.locator('#importLatest').click();await page.waitForSelector('[data-rl-tab="stress"]');await page.waitForFunction(()=>/GFS · [1-9]/.test(document.querySelector('#mpLayerStatus').textContent));await settled();
 await page.locator('[data-rl-tab="ensemble"]').click();await page.locator('[data-rl-action="ensemble"]').click();await settled();
 assert.ok((await page.locator('#rlAnalysis').textContent()).includes('ENSEMBLE HTTP 503'));
 assert.equal(await page.locator('.rl-quantiles').count(),0,'unavailable API must not show a distribution');await audit('390 unavailable ensemble');
 await page.locator('[data-rl-tab="corridor"]').click();await settled();assert.equal(await page.locator('#rlWaypoint option').count(),150);
 await page.locator('#rlWaypoint').selectOption('75');await audit('390 150 real fixture waypoints');
 const missingMoisture=structuredClone(f.rawEnsemble[0]);for(const key of Object.keys(missingMoisture.hourly))if(/relative_humidity|cloud_cover/.test(key))missingMoisture.hourly[key]=missingMoisture.hourly.time.map(()=>null);
 await page.route('**/v1/ensemble?**',r=>{const u=new URL(r.request().url()),lat=u.searchParams.get('latitude').split(',').map(Number),lon=u.searchParams.get('longitude').split(',').map(Number);return r.fulfill({json:lat.map((p,i)=>({...missingMoisture,latitude:p,longitude:lon[i]}))});});
 await page.locator('[data-rl-tab="ensemble"]').click();await page.locator('[data-rl-action="ensemble"]').click();await settled();
 assert.ok(await page.locator('.rl-state-count [data-state="UNKNOWN"]').isVisible(),'missing moisture remains visibly unknown');
 await audit('390 missing ensemble moisture');
 await ctx.close();
}catch(error){report.errors.push({label:'execution',error:error.stack});if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(out,'browser-audit.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({states:report.states.length,screenshots:report.screenshots.length,errors:report.errors.slice(0,15)},null,2));if(report.errors.length)process.exitCode=1;
