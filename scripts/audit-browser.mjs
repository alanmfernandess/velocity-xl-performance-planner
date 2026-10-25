/* Real Chromium layout + interaction audit for the approved three-area architecture.
 * All remote responses in this audit are illustrative fixtures, never live flights. */
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import {chromium} from 'playwright';
import {fixture,gfsFixture} from '../tests/fixtures/quiet-browser.mjs';
import {ensembleFixture} from '../tests/fixtures/resilience.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.VELOCITY_AUDIT_OUTPUT||path.join(root,'review/quiet-cockpit');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),base=`http://127.0.0.1:${server.address().port}`;
const widths=[320,375,390,430,768,1024,1440,1920],modules={plan:['overview','score','compare','config','fuel','wb','oxygen','cost','resilience'],route:['overview','meteo','ice','ride','etp','alternate','glide','steps'],flight:['overview','update','calibration','history']};
const report={fixture:'ILLUSTRATIVE OFP/GFS/AWC/ensemble, intercepted only in Chromium; no real-flight claims',browser:browser.version(),widths,states:[],screenshots:[],errors:[],functional:[]};
let page;
async function open(area,module){await page.evaluate(([a,m])=>window.VelocityLayout.activate(a,m),[area,module]);await page.waitForTimeout(15);}
async function importAgain(){
 const button=page.locator('#importLatest');
 if(!await button.isVisible())await page.locator('.ofp-reimport > summary').click();
 await button.click();
 await page.waitForFunction(()=>!document.querySelector('#importLatest')?.hasAttribute('aria-busy'),{timeout:15000});
}
async function capture(name){const file=path.join(out,name+'.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);if(name.includes('overview')||name.includes('flight-update'))await page.screenshot({path:path.join(out,name+'-viewport.png')});}
async function audit(label){
 const state=await page.evaluate(()=>{const visible=el=>el.checkVisibility()&&el.getBoundingClientRect().width>0;const elements=[...document.querySelectorAll('button,input:not([type="checkbox"]),select,summary')].filter(visible);const r=el=>({id:el.id||el.dataset.openModule||el.dataset.areaButton||el.tagName,inScrollable:Boolean(el.closest('.ice-route-band,.ride-route-band,.glide-route,.rl-corridor,.rl-tabs')),height:el.getBoundingClientRect().height,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right});return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,module:document.body.dataset.activeModule,controls:elements.map(r),nav:[...document.querySelectorAll('#areaNav button')].map(b=>b.dataset.areaButton),fonts:[...document.querySelectorAll('.essential-metrics strong')].filter(visible).map(e=>getComputedStyle(e).fontFamily),primary:[...document.querySelectorAll('.primary-button')].filter(visible).map(e=>({id:e.id,color:getComputedStyle(e).backgroundColor})),svg:[...document.querySelectorAll('svg:not(.lucide)')].filter(visible).map(e=>({invalid:/NaN|Infinity/.test(e.innerHTML),viewBox:e.getAttribute('viewBox')}))};});
 const issues=[];if(state.scrollWidth>state.width+1)issues.push(`overflow ${state.scrollWidth-state.width}`);assert.deepEqual(state.nav,['plan','route','flight']);
 for(const c of state.controls){if(c.height<43)issues.push(`${c.id} touch height ${c.height}`);if((c.left<-.5||c.right>state.width+.5)&&!c.inScrollable)issues.push(`${c.id} outside viewport`);}
 for(const p of state.primary)if(p.color!=='rgb(23, 119, 210)')issues.push(`${p.id} primary ${p.color}`);
 if(state.svg.some(s=>s.invalid))issues.push('invalid SVG geometry');if(issues.length)report.errors.push({label,issues});report.states.push({label,...state,issues});
}
try{
 page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>report.errors.push({javascript:e.message}));
 let weather='clear',ofp=structuredClone(fixture);
 await page.route('**/xml.fetcher.php?**',r=>r.fulfill({json:ofp}));
 await page.route('**/api.open-meteo.com/**',r=>weather==='offline'?r.abort():r.fulfill({json:gfsFixture(r.request().url())}));
 await page.route('**/awc/latest.json*',r=>r.fulfill({json:{generatedAt:'2026-10-21T12:00:00Z',sigmets:[],pireps:[]}}));await page.route('**/aviationweather.gov/**',r=>r.fulfill({json:[]}));
 await page.route('**/ensemble-api.open-meteo.com/**',r=>r.fulfill({json:ensembleFixture().rawEnsemble}));
 await page.goto(base);await page.waitForFunction(()=>Boolean(window.VelocityLayout));await audit('no OFP · 390');assert.equal(await page.locator('#plannerContent').isVisible(),false);
 await page.locator('#quickPilotId').fill('ILLUSTRATIVE');await page.locator('#importLatest').click();await page.waitForFunction(()=>document.querySelector('#essentialScore').textContent!=='—'&&document.querySelector('#essentialScore').textContent!=='NÃO AVALIADO');await page.waitForTimeout(150);
 assert.equal(await page.locator('#pilotDecisionPanel').count(),1);await open('plan','oxygen');await page.locator('#oxygenBottleCount').selectOption('2');await open('plan','compare');assert.ok(await page.locator('[data-decision-fl]').count()>=3);report.functional.push('OFP import automatically evaluates candidates; explicit application still required');
 await open('plan','overview');
 const quietVisual=await page.evaluate(()=>{
   const score=document.querySelector('.score-reading'),value=score.querySelector('strong'),level=document.querySelector('#kpiAltitude'),card=document.querySelector('#essentialMission');
   return {scoreBg:getComputedStyle(score).backgroundColor,scoreColor:getComputedStyle(value).color,flColor:getComputedStyle(level).color,cardActions:card.querySelectorAll('.essential-reveal').length,previouslySeparate:card.querySelectorAll('.essential-secondary').length,cardRect:card.getBoundingClientRect().width};
 });
 assert.equal(quietVisual.scoreColor,'rgb(23, 119, 210)');
 assert.equal(quietVisual.scoreBg,'rgba(0, 0, 0, 0)');
 assert.equal(quietVisual.flColor,'rgb(24, 35, 49)');
 assert.equal(quietVisual.cardActions,1);
 assert.equal(quietVisual.previouslySeparate,0);
 report.functional.push('Approved visual contract: unboxed blue Score, neutral FL, one compare/adjust action');
 await page.locator('#essentialApply').click();assert.match(await page.locator('#kpiLevelMeta').innerText(),/aplicada/);report.functional.push('Recommended configuration explicitly applied');
 await open('flight','update');await page.locator('#essentialPosition').fill('131.23456789');await page.locator('#manualFuel').fill('22');await page.locator('#submitFlightUpdate').click();assert.match(await page.locator('#toast').innerText(),/registrado/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('velocityxl.virtualFlightTracker.v1')).checkpoints.at(-1).distanceNm),131.23456789);report.functional.push('Fractional NM checkpoint persisted without whole-percent rounding');
 await page.locator('#essentialNext').click();const exact=await page.locator('#essentialDistance').innerText();assert.ok(exact.endsWith('NM'));report.functional.push('Exact next waypoint selection');
 await open('flight','calibration');await page.locator('#observedTas').fill('210');assert.equal(await page.locator('#essentialCalibrate').isDisabled(),true);await page.locator('#observedFuelFlow').fill('14');assert.equal(await page.locator('#essentialCalibrate').isDisabled(),false);report.functional.push('Incomplete calibration pair blocked');
 const readings=await page.evaluate(async raw=>{const e=await import('./js/engine.js?v=20261025-01'),sb=await import('./js/simbrief.js?v=20261025-01');const applied=JSON.parse(localStorage.getItem('velocityxl.appliedMission')),oxygen=JSON.parse(localStorage.getItem('velocityxl.oxygen')),plan=sb.parseSimBrief(raw),point=plan.waypoints.findLast(p=>p.distanceNm<=131.23456789),baseline=e.cruiseSnapshot({plan,altitudeFt:applied.choice.altitudeFt,mode:applied.engineMode,payloadLb:520,fuelOnboardGal:22,oxygenWeightLb:e.oxygenSystemWeightLb(oxygen),calibration:{},powerSetting:applied.powerSetting}),local=e.weatherAtAltitude(point,applied.choice.altitudeFt);return {tas:baseline.tasKt+(local.oatC-e.isaTemperatureC(applied.choice.altitudeFt)-baseline.weather.isaDeviationC)*.12,flow:baseline.fuelFlowGph};},ofp);
 await page.locator('#observedTas').fill(String(Math.round(readings.tas)));await page.locator('#observedFuelFlow').fill(String(Math.round(readings.flow*10)/10));await page.locator('#essentialCalibrate').click();assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('velocityxl.calibration'))?.reference));report.functional.push('K1/K2 calibration saved with original engine validation and context');
 await open('route','overview');await page.locator('#missionProfilePanel summary').click();await page.locator('[data-route-order="4"]').click();assert.equal(await page.locator('#missionProfilePanel details').getAttribute('open'),'');assert.equal(await page.evaluate(()=>document.activeElement.dataset.routeOrder),'4');report.functional.push('Waypoint selection preserves focus and open route detail');
 await open('plan','compare');await page.locator('[data-decision-fl]').first().click();await page.locator('[data-analysis-mode="MANUAL"]').click();assert.equal(await page.locator('#analysisMap').isVisible(),true);report.functional.push('MANUAL MAP/RPM retained');
 for(const width of widths){
  await page.setViewportSize({width,height:width<600?844:1000});
  for(const lang of ['pt-BR','en-US']){
   await page.locator('.app-preferences summary').click();await page.locator(`[data-language="${lang}"]`).click();await page.locator('.app-preferences summary').click();
   for(const [area,items]of Object.entries(modules))for(const module of items){await open(area,module);if(module==='resilience')await page.waitForFunction(()=>document.querySelector('#resilienceLab').getAttribute('aria-busy')==='false',{timeout:45000});await audit(`${width} ${lang} ${area}:${module}`);if(lang==='pt-BR'&&[390,768,1440].includes(width)&&['plan:overview','plan:wb','route:overview','route:ice','flight:update'].includes(`${area}:${module}`))await capture(`${width}-${area}-${module}`);}
  }
  for(const size of ['small','normal','large']){
   await page.locator('.app-preferences summary').click();await page.locator(`[data-font-size="${size}"]`).click();await page.locator('[data-weight-unit="kg"]').click();await page.locator('[data-fuel-unit="l"]').click();await page.locator('.app-preferences summary').click();
   for(const [a,m]of [['plan','overview'],['plan','wb'],['flight','update'],['plan','compare']]){await open(a,m);await audit(`${width} A:${size} KG/L ${a}:${m}`);}
  }
  await page.locator('.app-preferences summary').click();await page.locator('[data-font-size="normal"]').click();await page.locator('[data-weight-unit="lb"]').click();await page.locator('[data-fuel-unit="gal"]').click();await page.locator('.app-preferences summary').click();
 }
 await page.setViewportSize({width:390,height:844});await open('flight','update');await page.locator('#manualFuel').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'submitFlightUpdate');
 const fixed=await page.locator('#submitFlightUpdate').boundingBox(),nav=await page.locator('.mobile-area-nav').boundingBox();assert.ok(fixed.y+fixed.height<=nav.y+1);assert.ok(fixed.y>=0);report.functional.push('Mobile checkpoint action visible immediately above bottom navigation; keyboard focus reachable');
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));assert.ok(await page.locator('#submitFlightUpdate').isVisible());
 await page.locator('.app-preferences summary').click();
 await page.locator('[data-language="pt-BR"]').click();
 await page.locator('.app-preferences summary').click();
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});await open('plan','resilience');await page.locator('[data-rl-tab="corridor"]').click();await page.waitForFunction(()=>document.querySelector('#resilienceLab').getAttribute('aria-busy')==='false',{timeout:45000});await audit(`${width} corridor`);
  const svg=page.locator('.rl-corridor-plot svg');if(await svg.count()){const bounds=await svg.evaluate(e=>({view:e.viewBox.baseVal.width,items:[...e.querySelectorAll('circle')].map(c=>({x:+c.getAttribute('cx'),r:+c.getAttribute('r')}))}));assert.ok(bounds.items.every(c=>c.x-c.r>=0&&c.x+c.r<=bounds.view));if(width===390)await capture('390-resilience-corridor');}
  const more=page.locator('.rl-4d-details');
  if(!await more.evaluate(el=>el.open))await more.locator('summary').click();
  assert.equal(await more.evaluate(el=>el.open),true);
  await page.locator('[data-rl-fix]').first().click({timeout:5000});
  assert.equal(await more.getAttribute('open'),'');
  report.functional.push('4D waypoint details preserve disclosure state and interaction');
 }
 for(const tab of ['stress','causal','dynamic','ensemble']){await page.locator(`[data-rl-tab="${tab}"]`).click();if(tab==='ensemble')await page.locator('[data-rl-action="ensemble"]').click();await page.waitForFunction(()=>document.querySelector('#resilienceLab').getAttribute('aria-busy')==='false',{timeout:45000});await audit(`resilience ${tab}`);}
 // Changes must invalidate the saved application and refresh recommendation, not silently apply it.
 await open('plan','fuel');await page.locator('#reserveInput').selectOption('60');assert.equal(await page.evaluate(()=>localStorage.getItem('velocityxl.appliedMission')),null);report.functional.push('Reserve change invalidates applied profile');
 weather='offline';ofp=structuredClone(fixture);ofp.general.route='NO WX';ofp.times={sched_out:'2020-01-01T12:00:00Z',sched_on:'2020-01-01T14:00:00Z'};ofp.navlog.forEach(p=>{delete p.mora;delete p.wind_data;});await open('plan','overview');await importAgain();await page.waitForTimeout(200);await open('plan','overview');assert.match(await page.locator('#essentialStatus').innerText(),/NÃO AVALIADO|UNASSESSED|INVIÁVEL|NOT VIABLE/);assert.equal(await page.locator('#essentialApply').isDisabled(),true);await audit('unknown weather and terrain, apply blocked');await capture('390-unassessed');
 await open('flight','update');ofp.navlog[3].cum_distance='';await open('plan','overview');await importAgain();await open('flight','update');await page.waitForTimeout(150);assert.equal(await page.locator('#essentialPosition').isDisabled(),true);assert.equal(await page.locator('#submitFlightUpdate').isDisabled(),true);report.functional.push('Incomplete raw navlog cannot masquerade as precise OFP position');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#submitFlightUpdate').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');report.functional.push('Reduced-motion preference removes control animation');
 await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({states:report.states.length,errors:report.errors.slice(0,35),errorCount:report.errors.length,screenshots:report.screenshots.length,functional:report.functional},null,2));assert.equal(report.errors.length,0);
}catch(error){report.failure=error.stack;await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1;}finally{await browser.close();await new Promise(r=>server.close(r));}
