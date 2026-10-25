import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, PERFORMANCE } from '../js/config.js';
import { optimizeMission } from '../js/unified-optimization.js';
import { solveWindTriangle, calculateFlightTransition } from '../js/engine.js';
import { sampleGfs } from '../js/weather/open-meteo.js';
import { solveScenario, scenarioInputs, scenarioKey, clearScenarioCache, scenarioCacheSize } from '../js/resilience/core.js';
import { findConstraintFrontiers, stressTest } from '../js/resilience/stress.js';
import { finiteDifference, causalAnalysis } from '../js/resilience/sensitivity.js';
import { parseEnsembleResponse, analyzeEnsemble, quantile, buildEnsembleUrl, fetchEnsemble } from '../js/resilience/ensemble.js';
import { decisionCorridor } from '../js/resilience/corridor.js';
import { dynamicOptimize, paretoFront, dynamicProfileScenario } from '../js/resilience/dynamic.js';
import { advanceState, finishRoute } from '../js/resilience/transitions.js';
import { sampleMissionTime, smoothProfileGeometry } from '../js/mission-profile.js';
import { profileFixture } from './fixtures/mission-profile.mjs';
import { ensembleFixture } from './fixtures/resilience.mjs';
const f=profileFixture(),mission=optimizeMission(f.input),candidate=mission.candidates.find(c=>c.altitudeFt===18000&&c.mode==='NORMAL'),context={mission,input:f.input,candidate};
const baseline=solveScenario(context);
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);

test('Resilience 4D conserves phases, mass, time, fuel and midnight UTC',()=>{
  assert.equal(baseline.available,true);assert.equal(baseline.converged,true);
  const m=baseline.model,states=Array.from({length:101},(_,i)=>baseline.sampleDistance(m.totalNm*i/100));
  for(let i=1;i<states.length;i++){
    assert.ok(states[i].elapsedSec>=states[i-1].elapsedSec);
    assert.ok(states[i].fuelUsedGal>=states[i-1].fuelUsedGal);
    assert.ok(states[i].fuelRemainingGal<=states[i-1].fuelRemainingGal);
    near(states[i].fuelRemainingGal+states[i].fuelUsedGal,m.profile.startFuelGal);
    near(baseline.sampleTime(states[i].elapsedSec).distanceNm,states[i].distanceNm,.001);
    assert.ok(states[i].fuelRemainingGal>=0&&states[i].massLb>0);
  }
  near(m.profile.totalFuelGal,baseline.metrics.tripFuelGal);
  near(baseline.sampleDistance(m.profile.tocNm).altitudeFt,candidate.altitudeFt);
  near(baseline.sampleDistance(m.profile.todNm).altitudeFt,candidate.altitudeFt);
  assert.notEqual(new Date(m.startMs).getUTCDate(),new Date(baseline.metrics.arrivalMs).getUTCDate());
});
test('Wind triangle preserves geometry and rejects impossible crosswind/headwind',()=>{
  near(solveWindTriangle(100,0,180,20).gsKt,120);
  near(solveWindTriangle(100,0,0,20).gsKt,80);
  near(solveWindTriangle(100,0,90,60).gsKt,80);
  assert.throws(()=>solveWindTriangle(100,0,90,100),/CROSSWIND/);
  assert.throws(()=>solveWindTriangle(100,0,0,110),/GROUNDSPEED/);
});
test('Stress wind, weight, temperature and fuel have traced effects with fixed onboard fuel',()=>{
  for(const perturbation of [{windKt:10},{payloadLb:50},{temperatureC:5}]){
    const next=solveScenario({...context,perturbation});assert.equal(next.available,true);
    assert.ok(next.metrics.tripFuelGal>baseline.metrics.tripFuelGal);
  }
  const fuel=solveScenario({...context,perturbation:{fuelGal:-5}});
  near(fuel.candidate.recommendedFuelGal,f.input.fuelOnboardGal-5);
  assert.ok(fuel.metrics.fuelMarginGal<baseline.metrics.fuelMarginGal);
  const weight=solveScenario({...context,perturbation:{payloadLb:50}});
  near(weight.metrics.weightMarginLb,baseline.metrics.weightMarginLb-50);
  assert.ok(weight.candidate.result.weightBalance);
});
test('Scenario mutation cannot change original OFP, stations, ranking, calibration or applied input',()=>{
  const before=JSON.stringify({mission,input:f.input});
  const next=scenarioInputs(f.input,{payloadLb:50});
  assert.equal(next.input.weightBalance.pilot,f.input.weightBalance.pilot);
  assert.equal(next.input.weightBalance.baggage,50);
  solveScenario({...context,perturbation:{windKt:12,departureHours:1,payloadLb:10}});
  assert.equal(JSON.stringify({mission,input:f.input}),before);assert.equal(mission.candidates.length,27);
});
test('Physical input limits are explicit, never clamped into a valid scenario',()=>{
  assert.equal(solveScenario({...context,perturbation:{fuelGal:100}}).state,'INCOMPATIBLE');
  assert.equal(solveScenario({...context,perturbation:{payloadLb:-1}}).reason,'BAGGAGE_BELOW_ZERO');
  assert.equal(solveScenario({...context,perturbation:{payloadLb:100}}).candidate.eligibility.status,'INCOMPATIBLE');
});
test('Atmospheric time iteration is bounded; nonconvergence cannot reuse a confirmed cache entry',()=>{
  const failed=solveScenario({...context,settings:{maxIterations:0,timeToleranceSec:0,fuelToleranceGal:0}});
  assert.equal(failed.available,false);assert.equal(failed.reason,'TIME_SOLVER_NOT_CONVERGED');
  assert.ok(baseline.iterations<=PERFORMANCE.missionTime.maxIterations);
  assert.ok(baseline.deltaSeconds<=2&&baseline.fuelDeltaGal<=.02);
});
test('Missing UTC or forecast horizon produces an explicit unavailable result',()=>{
  const noTime={...f.input,plan:{...f.plan,scheduledOffMs:null}};
  assert.equal(solveScenario({...context,input:noTime}).reason,'MISSING_FLIGHT_TIME');
  const bad={...f.snapshot,gfs:{...f.snapshot.gfs,locations:f.snapshot.gfs.locations.map(l=>({...l,times:l.times.map(t=>t+30*86400000)}))}};
  assert.equal(solveScenario({...context,weatherSnapshot:bad}).available,false);
});
test('Cache key includes weather, aircraft, UTC, perturbation and method; cache is bounded',()=>{
  assert.notEqual(scenarioKey(context),scenarioKey({...context,perturbation:{windKt:1}}));
  assert.notEqual(scenarioKey(context),scenarioKey({...context,input:{...f.input,reserveMinutes:50}}));
  assert.notEqual(scenarioKey(context),scenarioKey({...context,weatherSnapshot:{...f.snapshot}}));
  clearScenarioCache();for(let i=0;i<70;i++)solveScenario({...context,perturbation:{fuelGal:100+i}});
  assert.equal(scenarioCacheSize(),PERFORMANCE.resilience.cacheEntries);
});
test('Frontier scan detects multiple nonmonotone transitions and unknown intervals',()=>{
  const r=findConstraintFrontiers(x=>({fuel:(x-2)*(x-6),data:x>3&&x<5?null:1}),0,8,{samples:17,iterations:12});
  const roots=r.transitions.filter(t=>t.constraint==='fuel');assert.equal(roots.length,2);
  near(roots[0].x,2,.001);near(roots[1].x,6,.001);assert.equal(r.transitions.filter(t=>t.constraint==='data').length,2);
});
test('Stress weight frontier is calculated from actual gross weight',()=>{
  const r=stressTest(context,{},'payloadLb');
  const root=r.frontiers.transitions.find(t=>t.constraint==='weight');assert.ok(root);near(root.x,baseline.metrics.weightMarginLb,.1);
});
test('Finite differences use central or one-sided derivatives at domain boundaries',()=>{
  const evaluate=x=>({available:true,metrics:{tripFuelGal:x*x,eteSec:3*x,fuelMarginGal:10-x}});
  near(finiteDifference(evaluate,2,.1,[0,4]).derivative.tripFuelGal,4);
  assert.equal(finiteDifference(evaluate,0,.1,[0,4]).method,'FORWARD');
  assert.equal(finiteDifference(evaluate,4,.1,[0,4]).method,'BACKWARD');
});
test('Causal effects and combined interaction equal re-solved model outputs',()=>{
  const r=causalAnalysis(context);assert.equal(r.effects.length,4);
  const effects=r.effects.filter(e=>e.sensitivity.available&&e.delta);
  near(r.interaction.tripFuelGal,r.combined.metrics.tripFuelGal-r.baseline.metrics.tripFuelGal-effects.reduce((s,e)=>s+e.delta.tripFuelGal,0));
  for(const e of effects)near(e.chain.newFuelMarginGal,e.scenario.metrics.fuelMarginGal);
});
const ef=ensembleFixture(),points=ef.rawEnsemble.map(l=>({lat:l.latitude,lon:l.longitude}));
test('Ensemble parser preserves member identity across every location and level',()=>{
  const ensemble=parseEnsembleResponse(ef.rawEnsemble,points);
  assert.equal(ensemble.members.length,5);assert.ok(ensemble.members.every(m=>m.valid));
  for(const m of ensemble.members)for(const l of m.gfs.locations)assert.equal(l.memberId,m.id);
  const p={lat:points[0].lat,lon:points[0].lon,altitudeFt:18000,timestampMs:f.plan.scheduledOffMs};
  const speeds=ensemble.members.map(m=>sampleGfs(m.gfs,p).windSpd);assert.equal(new Set(speeds).size,5);
});
test('Ensemble rejects incomplete members without borrowing another member',()=>{
  const raw=structuredClone(ef.rawEnsemble);delete raw[1].hourly.wind_speed_500hPa_member02;
  const ensemble=parseEnsembleResponse(raw,points);assert.equal(ensemble.members.find(m=>m.id==='02').valid,false);
  assert.equal(ensemble.members.find(m=>m.id==='01').valid,true);
});
test('Ensemble rejects inconsistent timestamps, missing heights and wrong units',()=>{
  for(const mutate of [raw=>raw[0].hourly.time[1]=raw[0].hourly.time[0],raw=>delete raw[0].hourly.geopotential_height_500hPa,raw=>raw[0].hourly_units.wind_speed_850hPa='km/h']){
    const raw=structuredClone(ef.rawEnsemble);mutate(raw);const parsed=parseEnsembleResponse(raw,points);assert.equal(parsed.members.find(m=>m.id==='control').valid,false);
  }
});
test('Ensemble quantiles are empirical, and invalid spatial/time members are excluded',()=>{
  near(quantile([0,10,20,30,40],.1),4);near(quantile([0,10,20,30,40],.5),20);near(quantile([0,10,20,30,40],.9),36);
  const parsed=parseEnsembleResponse(ef.rawEnsemble,points),outside=structuredClone(parsed.members[0]);outside.id='outside';outside.gfs.locations.forEach(l=>l.lat=70);
  const expired=structuredClone(parsed.members[0]);expired.id='expired';expired.gfs.locations.forEach(l=>l.times=l.times.map(t=>t-30*86400000));
  parsed.members.push(outside,expired);
  const r=analyzeEnsemble(context,parsed);assert.equal(r.validCount,5);assert.equal(r.receivedCount,7);assert.equal(r.excludedCount,2);
  assert.ok(r.statistics.tripFuelGal.p10<=r.statistics.tripFuelGal.p50&&r.statistics.tripFuelGal.p50<=r.statistics.tripFuelGal.p90);
});
test('Ensemble request is explicit bounded batching and cache; no SimBrief polling',async()=>{
  const urls=[],r=await fetchEnsemble(ef.plan,{nowMs:10000,fetcher:async url=>{urls.push(url);return {ok:true,json:async()=>ef.rawEnsemble};}});
  assert.equal(r.members.length,5);assert.equal(urls.length,1);
  assert.ok(urls[0].includes('ecmwf_ifs025_ensemble'));assert.ok(urls[0].includes('geopotential_height'));
  await fetchEnsemble(ef.plan,{nowMs:10001,fetcher:()=>assert.fail('cached query')});
  assert.throws(()=>buildEnsembleUrl([],NaN,NaN));
});
test('Corridor uses actual OFP points, exact remaining fuel, native ETP and documented alternate',()=>{
  const r=decisionCorridor(context);assert.equal(r.available,true);
  assert.equal(r.waypoints[0].ident,f.plan.origin.icao);assert.equal(r.waypoints.at(-1).ident,f.plan.destination.icao);
  const middle=r.waypoints[3];near(middle.state.fuelRemainingGal,baseline.sampleDistance(middle.distanceNm).fuelRemainingGal);
  assert.equal(middle.options[1].kind,'return');assert.equal(middle.options[1].state,'FUEL_FEASIBLE');
  assert.equal(middle.options[2].ident,'SBRJ');assert.equal(middle.options[2].reason,'AIRPORT_ELEVATION_UNKNOWN');
  assert.equal(middle.options[0].operationalState,'UNKNOWN');assert.deepEqual(r.etpPnr,baseline.candidate.etpPnr);
  near(r.waypoints.at(-1).options[0].components.remainingTripFuelGal,0);
});
test('Corridor insufficient fuel cannot become operationally viable and reserves remain included',()=>{
  const low={...context,input:{...f.input,fuelOnboardGal:25}};
  const r=decisionCorridor(low);assert.ok(r.available);
  assert.equal(r.waypoints[0].options[0].state,'INCOMPATIBLE');
  assert.ok(r.waypoints[0].options[0].components.reserveFuelGal>0);
  assert.ok(r.waypoints.every(p=>p.options.every(o=>o.operationalState==='UNKNOWN')));
});
test('Physical step climb reuses production ROC and power with positive time, distance and fuel',()=>{
  const p=calculateFlightTransition({plan:f.plan,fromAltitudeFt:16000,toAltitudeFt:18000,weightLb:2700});
  assert.ok(p.timeHr>0&&p.distanceNm>0&&p.fuelGal>0&&p.power.estimatedHp>0);
  near(p.sections.reduce((s,p)=>s+p.fuelGal,0),p.fuelGal);
  assert.throws(()=>calculateFlightTransition({plan:f.plan,fromAltitudeFt:24000,toAltitudeFt:26000,weightLb:2700}),/ENVELOPE/);
  assert.throws(()=>calculateFlightTransition({plan:f.plan,fromAltitudeFt:16000,toAltitudeFt:18000,weightLb:3100}),/ENVELOPE/);
});
test('Transition cannot teleport altitude through a segment too short for the climb',()=>{
  assert.throws(()=>advanceState({route:baseline.model.waypoints,snapshot:baseline.snapshot,input:baseline.input,state:baseline.sampleDistance(0),targetDistanceNm:.01,targetAltitudeFt:18000,mode:'NORMAL',initial:true}),/DISTANCE/);
});
test('Pareto frontier preserves fuel/time tradeoffs without arbitrary weighted sum',()=>{
  const a={tripFuelGal:10,eteSec:120,weatherExposure:0,fuelMarginGal:20},b={tripFuelGal:12,eteSec:100,weatherExposure:0,fuelMarginGal:18},c={tripFuelGal:15,eteSec:150,weatherExposure:1,fuelMarginGal:15};
  assert.deepEqual(paretoFront([a,b,c]),[a,b]);
});
test('Dynamic profiles conserve physical steps, fuel, mass and chronological time',()=>{
  const r=dynamicOptimize(context,{beam:4,stages:3});assert.ok(r.solutions.length>0);
  for(const p of r.solutions){
    assert.notEqual(p.eligibility,'INCOMPATIBLE');near(p.sections.reduce((s,p)=>s+p.fuelGal,0),p.tripFuelGal);
    assert.ok(p.state.fuelRemainingGal>=0&&p.state.fuelRemainingGal<=AIRCRAFT.usableFuelGal);
    for(let i=0;i<p.sections.length;i++){
      const s=p.sections[i];assert.ok(s.end.timestampMs>s.start.timestampMs&&s.fuelGal>0);
      if(i){near(s.start.altitudeFt,p.sections[i-1].end.altitudeFt);near(s.start.timestampMs,p.sections[i-1].end.timestampMs,.001);}
      if(s.phase==='climb')assert.ok(s.end.altitudeFt>s.start.altitudeFt);
    }
    const preview=dynamicProfileScenario(r,r.solutions.indexOf(p));assert.ok(preview.model.valid);
    near(sampleMissionTime(preview.model,preview.model.totalSec).fuelRemainingGal,p.state.fuelRemainingGal,.01);
    assert.ok(smoothProfileGeometry(preview.model));
  }
});
test('Dynamic optimizer reports no solution when fuel/envelope cannot sustain a path',()=>{
  const r=dynamicOptimize({...context,input:{...f.input,fuelOnboardGal:4}},{beam:2,stages:2});
  assert.equal(r.solutions.length,0);
});

test('Ensemble includes adverse fuel-demand members without propagating impossible negative fuel states',()=>{
  const ensemble=parseEnsembleResponse(ef.rawEnsemble,points);
  const low={...context,input:{...f.input,fuelOnboardGal:10}};
  const r=analyzeEnsemble(low,ensemble);
  assert.equal(r.validCount,5);assert.equal(r.negative,5);
  assert.ok(r.evaluated.every(m=>m.scenario.fuelDemandOnly));
  assert.ok(r.evaluated.every(m=>!m.scenario.model&&!m.scenario.sampleDistance));
});
test('Missing ensemble moisture retains unknown eligibility instead of claiming clear weather',()=>{
  const raw=structuredClone(ef.rawEnsemble);
  for(const location of raw)for(const key of Object.keys(location.hourly))if(/relative_humidity|cloud_cover/.test(key))location.hourly[key]=location.hourly.time.map(()=>null);
  const r=analyzeEnsemble(context,parseEnsembleResponse(raw,points));assert.equal(r.validCount,5);assert.ok(r.eligibility.UNKNOWN>0);
});
test('Cancelled ensemble requests never return cached results',async()=>{
  const c=new AbortController();c.abort();
  await assert.rejects(fetchEnsemble(ef.plan,{signal:c.signal}),{name:'AbortError'});
});

test('Documented alternate elevation is retained and enables a physical diversion when covered',async()=>{
  const {parseSimBrief}=await import('../js/simbrief.js');
  const raw=structuredClone(f.raw);raw.alternate.elevation=3;
  const plan=parseSimBrief(raw);assert.equal(plan.alternates[0].elevationFt,3);
  const input={...f.input,plan},mission2=optimizeMission(input),candidate2=mission2.candidates.find(c=>c.altitudeFt===18000&&c.mode==='NORMAL');
  const corridor=decisionCorridor({mission:mission2,input,candidate:candidate2});
  const middle=corridor.waypoints[3].options.find(o=>o.kind==='alternate');
  assert.equal(middle.ident,'SBRJ');assert.equal(middle.state,'FUEL_FEASIBLE');assert.ok(middle.tripFuelGal>0&&middle.eteSec>0);
  assert.equal(middle.operationalState,'UNKNOWN');
});
test('Untimed legacy OFP advisories cannot be silently reused in a shifted 4D scenario',()=>{
  const plan={...f.plan,meteorology:{...f.plan.meteorology,advisorySources:undefined,enrouteBulletins:['ICE']}};
  assert.equal(solveScenario({...context,input:{...f.input,plan},perturbation:{departureHours:1}}).reason,'OFP_ADVISORY_VALIDITY_UNKNOWN');
});

test('Production module graph uses one cache version so new exports cannot load stale dependencies',async()=>{
  const {readdir,readFile}=await import('node:fs/promises');
  async function inspect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=`${dir}/${entry.name}`;
    if(entry.isDirectory())await inspect(path);
    else if(entry.name.endsWith('.js')){
      const source=await readFile(path,'utf8');
      for(const match of source.matchAll(/["'](\.{1,2}\/[^"'\n]+\.js(?:\?v=[^"'\n]+)?)["']/g))assert.ok(match[1].endsWith('?v=20261024-03'),`${path}: ${match[1]}`);
    }
  }}
  await inspect(new URL('../js',import.meta.url).pathname);
});

test('Unavailable forecast plus missing OFP fields cannot manufacture calm winds or ISA weather',()=>{
  const plan={...f.plan,waypoints:f.plan.waypoints.map(p=>({...p,windLevels:[],windDir:NaN,windSpd:NaN,oatC:NaN}))};
  const r=solveScenario({...context,input:{...f.input,plan},weatherSnapshot:{...f.snapshot,gfs:{status:'unavailable',locations:[]}}});
  assert.equal(r.available,false);assert.equal(r.reason,'OFP_ATMOSPHERIC_FIELDS_MISSING');
});

test('Worker transfer preserves missing-number semantics and shared forecasts without query functions',async()=>{
  const {workerData,ensembleViewData}=await import('../js/resilience/transfer.js');
  const shared={value:NaN},source={a:shared,b:shared,query:()=>1};
  const transferred=workerData(source);assert.equal(transferred.a,transferred.b);assert.ok(Number.isNaN(transferred.a.value));assert.equal(transferred.query,undefined);assert.equal(source.query(),1);
  const full=analyzeEnsemble(context,parseEnsembleResponse(ef.rawEnsemble,points)),dto=ensembleViewData(full);
  assert.equal(dto.validCount,full.validCount);assert.equal(dto.evaluated[0].scenario.snapshot,undefined);
  assert.deepEqual(dto.evaluated[0].scenario.metrics,full.evaluated[0].scenario.metrics);
});
