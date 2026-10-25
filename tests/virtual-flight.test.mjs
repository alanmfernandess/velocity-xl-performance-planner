import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, DEMO_PLAN, PERFORMANCE } from '../js/config.js';
import { calculateAtAltitude, calculateAlternateDiversion, calculateRemainingFlightAssessment } from '../js/engine.js';
import { normalizeOfpTocTod, parseNavlogElapsedSeconds } from '../js/simbrief.js';
import { buildVirtualFlightProfile, confirmVirtualCheckpoint, correctVirtualElapsed, finishVirtualFlight,
  modelTocTod, newVirtualFlightSession, pauseVirtualFlight, projectVirtualFlight,
  recoverVirtualFlight, remainingExposure, resumeVirtualFlight, sampleVirtualProfile,
  setVirtualTimeFactor, startVirtualFlight, virtualElapsedSeconds, virtualTimeAtDistance } from '../js/virtual-flight.js';

const plan = DEMO_PLAN;
const config = { altitudeFt: 16000, mode: 'NORMAL', fuelOnboardGal: 77, reserveMinutes: 45,
  payloadLb: 520, powerSetting: { type: 'AUTO' }, calibration: { tasFactor: 1, fuelFlowFactor: 1 } };
const result = calculateAtAltitude({ plan, ...config });
const profile = buildVirtualFlightProfile(plan, result, config.fuelOnboardGal);
const key = 'OFP-TRACKER-1';
const session = newVirtualFlightSession(key, config, profile);
const started = startVirtualFlight(session, 1_000_000);
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('profile reuses the three calculated phases and exact model totals', () => {
  assert.equal(profile.valid, true);
  near(profile.totalNm, plan.distanceNm);
  near(profile.totalSec, result.tripTimeHr * 3600);
  near(profile.totalFuelGal, result.tripFuelGal);
  near(profile.startFuelGal, config.fuelOnboardGal - PERFORMANCE.taxiFuelGal);
  assert.ok(profile.segments.filter(item => item.phase === 'CLIMB').length > 3);
  assert.ok(profile.segments.filter(item => item.phase === 'DESCENT').length > 3);
  assert.ok(profile.segments.filter(item => item.phase === 'CRUISE').length > 0);
  for (let i = 1; i < profile.segments.length; i += 1) {
    near(profile.segments[i].startSec, profile.segments[i - 1].endSec);
    near(profile.segments[i].startNm, profile.segments[i - 1].endNm);
    near(profile.segments[i].startUsedGal, profile.segments[i - 1].endUsedGal);
  }
});

test('TOC and TOD remain continuous and distinct from any OFP markers', () => {
  const model = modelTocTod(profile);
  near(model.toc.distanceNm, result.climb.distanceNm);
  near(model.tod.distanceNm, plan.distanceNm - result.descent.distanceNm);
  near(sampleVirtualProfile(profile, model.toc.timeSec).distanceNm, model.toc.distanceNm);
  near(sampleVirtualProfile(profile, model.tod.timeSec).distanceNm, model.tod.distanceNm);
  assert.equal(sampleVirtualProfile(profile, model.toc.timeSec - .01).phase, 'CLIMB');
  assert.equal(sampleVirtualProfile(profile, model.toc.timeSec + .01).phase, 'CRUISE');
  assert.equal(sampleVirtualProfile(profile, model.tod.timeSec + .01).phase, 'DESCENT');
});

test('short route with overlapping climb and descent has no fictional cruise', () => {
  const shortPlan = { ...plan, distanceNm: 20 };
  const shortResult = calculateAtAltitude({ plan: shortPlan, ...config });
  const shortProfile = buildVirtualFlightProfile(shortPlan, shortResult, 77);
  assert.equal(shortProfile.valid, false);
  assert.equal(shortProfile.reason, 'PROFILE_PHASE_OVERLAP');
  assert.equal(modelTocTod(shortProfile).toc, null);
});

test('clock does not start before explicit action', () => {
  assert.equal(session.status, 'NOT_STARTED');
  assert.equal(virtualElapsedSeconds(session, 2_000_000), 0);
  assert.equal(projectVirtualFlight(session, plan, 2_000_000), null);
  assert.throws(() => pauseVirtualFlight(session, 2_000_000), /TRACKER_PAUSE_INVALID/);
});

test('running elapsed time derives from wall anchor, not timer callbacks', () => {
  near(virtualElapsedSeconds(started, 1_030_000), 30);
  near(virtualElapsedSeconds(started, 1_120_000), 120);
  const projected = projectVirtualFlight(started, plan, 1_120_000);
  assert.ok(projected.distanceNm > 0);
  assert.ok(projected.fuelGal < profile.startFuelGal);
  assert.equal(projected.phaseSource, 'PROJECTED');
});

test('pause, resume and finish preserve elapsed simulation time', () => {
  const paused = pauseVirtualFlight(started, 1_060_000);
  near(virtualElapsedSeconds(paused, 5_000_000), 60);
  const resumed = resumeVirtualFlight(paused, 5_000_000);
  near(virtualElapsedSeconds(resumed, 5_010_000), 70);
  const finished = finishVirtualFlight(resumed, 5_020_000);
  near(virtualElapsedSeconds(finished, 9_000_000), 80);
  assert.equal(finished.status, 'FINISHED');
  assert.throws(() => resumeVirtualFlight(finished, 9_000_000), /TRACKER_RESUME_INVALID/);
});

test('time factor changes only future time and survives a background timer gap', () => {
  const accelerated = setVirtualTimeFactor(started, 4, 1_030_000);
  near(virtualElapsedSeconds(accelerated, 1_040_000), 70);
  const normal = setVirtualTimeFactor(accelerated, 1, 1_040_000);
  near(virtualElapsedSeconds(normal, 1_050_000), 80);
  near(virtualElapsedSeconds(normal, 1_650_000), 680);
  assert.throws(() => setVirtualTimeFactor(started, 3, 1_010_000), /TRACKER_FACTOR_INVALID/);
});

test('running recovery flags uncertainty but reconstructs elapsed from wall time', () => {
  const recovered = recoverVirtualFlight(JSON.parse(JSON.stringify(started)), key, 1_600_000);
  assert.equal(recovered.recoveredAttention, true);
  near(virtualElapsedSeconds(recovered, 1_600_000), 600);
  assert.equal(recoverVirtualFlight(started, 'OTHER-OFP', 1_600_000), null);
  const futureClock = recoverVirtualFlight({ ...started, anchorWallMs: 9_000_000 }, key, 1_600_000);
  assert.equal(futureClock.status, 'PAUSED');
  assert.ok(futureClock.limitations.includes('CLOCK_ANCHOR_INCONSISTENT'));
});

test('paused recovery stays paused without manufacturing elapsed time', () => {
  const paused = pauseVirtualFlight(started, 1_030_000);
  const recovered = recoverVirtualFlight(JSON.parse(JSON.stringify(paused)), key, 1_600_000);
  assert.equal(recovered.status, 'PAUSED');
  near(virtualElapsedSeconds(recovered, 1_600_000), 30);
  assert.equal(projectVirtualFlight(recovered,plan,1_600_000).etaWallMs,null);
});

test('waypoint inverse timing and next-fix projection remain bounded', () => {
  const point = profile.totalNm * .42;
  const sec = virtualTimeAtDistance(profile, point);
  near(sampleVirtualProfile(profile, sec).distanceNm, point);
  const projected = projectVirtualFlight(started, plan, 1_000_000 + sec * 1000);
  assert.ok(projected.distanceToNextNm >= 0);
  assert.ok(projected.secondsToNext >= 0);
  assert.ok(projected.remainingSec >= 0);
  assert.ok(projected.percent > 0 && projected.percent < 100);
  assert.equal(virtualTimeAtDistance(profile, profile.totalNm + 10), null);
});

test('fuel decreases monotonically across climb, cruise and descent', () => {
  let previous = Infinity;
  for (let sec = 0; sec <= profile.totalSec; sec += 5) {
    const current = projectVirtualFlight(started, plan, 1_000_000 + sec * 1000);
    assert.ok(current.fuelGal <= previous + 1e-8);
    assert.ok(current.fuelGal >= 0);
    previous = current.fuelGal;
  }
  const end = projectVirtualFlight(started, plan, 1_000_000 + (profile.totalSec + 500) * 1000);
  assert.equal(end.atDestination, true);
  assert.equal(started.status, 'RUNNING');
});

test('checkpoint behind projection realigns position without inventing observed fuel', () => {
  const index = plan.waypoints.findIndex(fix => fix.distanceNm > 0 && fix.distanceNm < plan.distanceNm / 2);
  assert.ok(index >= 0);
  const now = 1_000_000 + profile.totalSec * .8 * 1000;
  const before = projectVirtualFlight(started, plan, now);
  const afterSession = confirmVirtualCheckpoint(started, plan, { waypointIndex: index }, now);
  const after = projectVirtualFlight(afterSession, plan, now);
  assert.equal(afterSession.checkpoints[0].direction, 'BACKWARD');
  near(after.distanceNm, plan.waypoints[index].distanceNm);
  assert.equal(after.lastConfirmedFuelGal, null);
  assert.ok(after.fuelGal <= before.fuelGal + 1e-8);
});

test('checkpoint ahead and observed fuel create a new prospective anchor', () => {
  const index = plan.waypoints.findIndex(fix => fix.distanceNm > plan.distanceNm / 2);
  assert.ok(index >= 0);
  const now = 1_000_000 + 10_000;
  const afterSession = confirmVirtualCheckpoint(started, plan,
    { waypointIndex: index, fuelGal: 49, altitudeFt: 16000 }, now);
  const atFix = projectVirtualFlight(afterSession, plan, now);
  assert.equal(afterSession.checkpoints[0].direction, 'FORWARD');
  near(atFix.fuelGal, 49);
  assert.equal(atFix.lastConfirmedFuelGal, 49);
  assert.equal(atFix.fuelSource, 'PILOT_CONFIRMED');
  assert.ok(projectVirtualFlight(afterSession, plan, now + 60_000).fuelGal < 49);
  assert.equal(afterSession.config.altitudeFt, 16000);
});

test('invalid checkpoint does not mutate session or calibration', () => {
  assert.throws(() => confirmVirtualCheckpoint(started, plan, { waypointIndex: 999 }, 1_000_100), /TRACKER_FIX_INVALID/);
  assert.throws(() => confirmVirtualCheckpoint(started, plan, { waypointIndex: 1, fuelGal: AIRCRAFT.usableFuelGal + 1 }, 1_000_100), /TRACKER_FUEL_INVALID/);
  assert.throws(() => confirmVirtualCheckpoint(started, plan, { waypointIndex: 1, altitudeFt: 99999 }, 1_000_100), /TRACKER_FL_INVALID/);
  assert.equal(started.checkpoints.length, 0);
  assert.equal(started.config.calibration.tasFactor, 1);
});

test('manual TOC and early TOD require a coherent pilot confirmation', () => {
  const toc = confirmVirtualCheckpoint(started, plan, { phase: 'CRUISE' }, 1_005_000);
  assert.equal(toc.checkpoints[0].kind, 'TOP_OF_CLIMB');
  assert.equal(projectVirtualFlight(toc, plan, 1_005_000).phase, 'CRUISE');
  assert.equal(projectVirtualFlight(toc, plan, 1_005_000).phaseSource, 'PILOT_CONFIRMED');
  assert.throws(() => confirmVirtualCheckpoint(started, plan, { phase: 'DESCENT' }, 1_005_000),
    /TRACKER_EARLY_DESCENT_CONFIRMATION_REQUIRED/);
  assert.throws(() => confirmVirtualCheckpoint(started, plan, { waypointIndex: 0, phase: 'DESCENT' },
    1_000_000 + (profile.tocSec + 30) * 1000), /TRACKER_EARLY_DESCENT_CONFIRMATION_REQUIRED/);
  const tod = confirmVirtualCheckpoint(started, plan,
    { phase: 'DESCENT', allowEarlyDescent: true }, 1_005_000);
  assert.equal(tod.checkpoints[0].kind, 'TOP_OF_DESCENT');
  assert.ok(tod.limitations.includes('PHASE_TIMING_DIFFERS_FROM_MODEL'));
});

test('remaining assessment accepts the tracker integrated fuel and preserves original result', () => {
  const projected = projectVirtualFlight(started, plan, 1_500_000);
  const assessment = calculateRemainingFlightAssessment({ plan, ...config,
    manual: { active: true, altitudeFt: 16000, distanceNm: projected.distanceNm,
      fuelRemainingGal: projected.fuelGal },
    projectedRemainingTripFuelGal: projected.remainingTripFuelGal });
  near(assessment.remainingTripFuelGal, projected.remainingTripFuelGal);
  near(result.tripFuelGal, profile.totalFuelGal);
});

test('weather without current route evidence remains unassessed', () => {
  assert.equal(remainingExposure(null, 50, true).status, 'UNKNOWN');
  assert.equal(remainingExposure({ confidence: 'estimated', segments: [{ endNm: 100, riskScore: 0, evidenceAvailable: true }] }, 50, false).status, 'UNKNOWN');
  assert.equal(remainingExposure({ compatibility: 'UNKNOWN', confidence: 'limited', segments: [] }, 50, true).status, 'UNKNOWN');
  assert.equal(remainingExposure({ confidence: 'estimated', segments: [{ endNm: 100, riskScore: 100, evidenceAvailable: true }], blocking: true, riskScore: 100 }, 50, true).status, 'RESTRICTION');
  assert.equal(remainingExposure({ confidence: 'estimated', segments: [{ endNm: 100, riskScore: 20, evidenceAvailable: true, coveredSamples: 1, totalSamples: 2 }] }, 50, true).status, 'UNKNOWN');
});

test('SimBrief TOC/TOD normalize before coordinate filtering and keep provenance', () => {
  const markers = normalizeOfpTocTod([
    { ident: 'TOC', cum_distance: '40', time_total: '00:15:30', altitude_feet: '16000' },
    { ident: 'TOD', cum_distance: '200', time_total: '00:51:15', pos_lat: '-23', pos_long: '-46', altitude_feet: '16000' },
  ], 246);
  assert.equal(markers.toc.distanceNm, 40);
  assert.equal(markers.toc.timeSec, 930);
  assert.equal(markers.toc.quality, 'PARTIAL');
  assert.equal(markers.tod.quality, 'COMPLETE');
  assert.equal(markers.tod.source, 'SIMBRIEF');
  assert.equal(parseNavlogElapsedSeconds('15'), null);
  assert.equal(parseNavlogElapsedSeconds('01:02:03'), 3723);
});

test('missing, duplicate, ambiguous and reversed OFP markers remain explicit', () => {
  assert.deepEqual(normalizeOfpTocTod([], 246), { toc: null, tod: null, diagnostics: [] });
  const markers = normalizeOfpTocTod([
    { ident: 'TOC', cum_distance: '150', time_total: '25' },
    { ident: 'TOC', cum_distance: '151' },
    { ident: 'TOD', cum_distance: '100', time_total: 'bad' },
  ], 246);
  assert.equal(markers.tod, null);
  assert.ok(markers.diagnostics.includes('TOC_DUPLICATE'));
  assert.ok(markers.diagnostics.includes('TOC_TIME_AMBIGUOUS'));
  assert.ok(markers.diagnostics.includes('TOD_BEFORE_TOC'));
});

test('a running clock cannot be started twice', () => {
  assert.throws(() => startVirtualFlight(started, 1_010_000), /TRACKER_START_INVALID/);
});

test('an unstarted flight cannot be finished', () => {
  assert.throws(() => finishVirtualFlight(session, 1_010_000), /TRACKER_FINISH_INVALID/);
  assert.throws(() => finishVirtualFlight(started,NaN),/TRACKER_FINISH_INVALID/);
});

test('a paused clock cannot be paused again', () => {
  assert.throws(() => pauseVirtualFlight(pauseVirtualFlight(started, 1_010_000), 1_020_000), /TRACKER_PAUSE_INVALID/);
  assert.throws(() => pauseVirtualFlight(started,NaN),/TRACKER_PAUSE_INVALID/);
});

test('a running clock cannot be resumed again', () => {
  assert.throws(() => resumeVirtualFlight(started, 1_020_000), /TRACKER_RESUME_INVALID/);
});

test('wall clock changes backwards never reverse elapsed simulation time', () => {
  near(virtualElapsedSeconds(started, 900_000), 0);
  near(virtualElapsedSeconds(setVirtualTimeFactor(started, 2, 1_020_000), 1_010_000), 20);
});

test('2x and 8x speed preserve prior simulated time', () => {
  const twice = setVirtualTimeFactor(started, 2, 1_020_000);
  const eight = setVirtualTimeFactor(twice, 8, 1_030_000);
  near(virtualElapsedSeconds(eight, 1_040_000), 120);
  assert.throws(() => setVirtualTimeFactor(started,2,NaN),/TRACKER_FACTOR_INVALID/);
});

test('a pilot can correct simulation time without changing a confirmed position', () => {
  const checkpoint = confirmVirtualCheckpoint(started, plan, { waypointIndex: 1 }, 1_010_000);
  const corrected = correctVirtualElapsed(checkpoint, 1800, 1_010_000);
  near(projectVirtualFlight(corrected, plan, 1_010_000).distanceNm, plan.waypoints[1].distanceNm);
  near(virtualElapsedSeconds(corrected, 1_010_000), 1800);
});

test('a backward pilot time correction preserves the checkpoint anchor', () => {
  const checkpoint = confirmVirtualCheckpoint(started, plan, { waypointIndex: 1 }, 1_500_000);
  const corrected = correctVirtualElapsed(checkpoint, 60, 1_500_000);
  near(projectVirtualFlight(corrected, plan, 1_500_000).distanceNm, plan.waypoints[1].distanceNm);
  near(corrected.anchor.simSec, 60);
});

test('invalid manual time cannot alter the session', () => {
  assert.throws(() => correctVirtualElapsed(started, -1, 1_010_000), /TRACKER_TIME_INVALID/);
  near(virtualElapsedSeconds(started, 1_010_000), 10);
});

test('recovery rejects an incompatible version', () => {
  assert.equal(recoverVirtualFlight({ ...started, version: 2 }, key, 1_010_000), null);
});

test('recovery rejects corrupted segment geometry', () => {
  const corrupt = structuredClone(started);
  corrupt.profile.segments[0].endNm = -1;
  assert.equal(recoverVirtualFlight(corrupt, key, 1_010_000), null);
});

test('climb samples use changing speed rather than one mission GS', () => {
  const climb = profile.segments.filter(item => item.phase === 'CLIMB');
  assert.ok(new Set(climb.map(item => Math.round(item.gsKt))).size > 1);
  assert.ok(climb.some(item => Math.abs(item.gsKt - result.gsKt) > 1));
});

test('climb, cruise and descent have independently integrated fuel flow', () => {
  const flows = ['CLIMB', 'CRUISE', 'DESCENT'].map(phase => profile.segments.find(item => item.phase === phase).fuelFlowGph);
  assert.ok(new Set(flows.map(Math.round)).size > 1);
});

test('projected altitude begins and ends at the route airport elevations', () => {
  const elevated={...plan,origin:{...plan.origin,elevationFt:2631},destination:{...plan.destination,elevationFt:28}};
  const elevatedResult=calculateAtAltitude({plan:elevated,...config});
  const elevatedProfile=buildVirtualFlightProfile(elevated,elevatedResult,77);
  assert.equal(elevatedProfile.valid,true);
  near(sampleVirtualProfile(elevatedProfile,0).altitudeFt,2631);
  near(sampleVirtualProfile(elevatedProfile,elevatedProfile.totalSec).altitudeFt,28);
  near(sampleVirtualProfile(elevatedProfile,elevatedProfile.tocSec-.001).altitudeFt,16000,.1);
  near(sampleVirtualProfile(elevatedProfile,elevatedProfile.tocSec).altitudeFt,16000);
  const climb=elevatedProfile.segments.filter(item=>item.phase==='CLIMB');
  for(let i=1;i<climb.length;i+=1)near(climb[i].startAltitudeFt,climb[i-1].endAltitudeFt);
});

test('climb phase reaches the applied FL at model TOC', () => {
  near(sampleVirtualProfile(profile, profile.tocSec).altitudeFt, config.altitudeFt);
  assert.equal(sampleVirtualProfile(profile, profile.tocSec - 1).phase, 'CLIMB');
});

test('descent begins at the applied FL and reaches destination elevation', () => {
  near(sampleVirtualProfile(profile, profile.todSec).altitudeFt, config.altitudeFt);
  near(sampleVirtualProfile(profile, profile.totalSec).altitudeFt, profile.destinationElevationFt);
});

test('TOC and TOD inverse distance maintain their model times', () => {
  near(virtualTimeAtDistance(profile, profile.tocNm), profile.tocSec);
  near(virtualTimeAtDistance(profile, profile.todNm), profile.todSec);
});

test('route fix names and next-fix distance follow an actual waypoint', () => {
  const p=projectVirtualFlight(started,plan,1_000_000+virtualTimeAtDistance(profile,50)*1000);
  assert.equal(p.previousFix,'KOVBI');
  assert.equal(p.nextFix,'OPALA');
  near(p.distanceToNextNm,82);
});

test('position is monotonic before a pilot checkpoint', () => {
  let previous=-1;
  for(let sec=0;sec<=profile.totalSec;sec+=11){
    const current=projectVirtualFlight(started,plan,1_000_000+sec*1000);
    assert.ok(current.distanceNm>=previous-1e-8);
    previous=current.distanceNm;
  }
});

test('time to next fix tends to zero as the waypoint approaches', () => {
  const target=virtualTimeAtDistance(profile,plan.waypoints[1].distanceNm);
  const early=projectVirtualFlight(started,plan,1_000_000+(target-30)*1000);
  const late=projectVirtualFlight(started,plan,1_000_000+(target-2)*1000);
  assert.ok(late.secondsToNext<early.secondsToNext);
});

test('integrated fuel at mission end equals starting fuel less modeled trip fuel', () => {
  const end=projectVirtualFlight(started,plan,1_000_000+profile.totalSec*1000);
  near(end.fuelGal,profile.startFuelGal-profile.totalFuelGal);
});

test('a waypoint correction without fuel cannot increase projected fuel', () => {
  const now=1_020_000,before=projectVirtualFlight(started,plan,now);
  const next=confirmVirtualCheckpoint(started,plan,{waypointIndex:2},now);
  const after=projectVirtualFlight(next,plan,now);
  assert.ok(after.fuelGal<=before.fuelGal);
  assert.equal(after.lastConfirmedFuelGal,null);
});

test('pilot-confirmed fuel retains provenance while future fuel stays projected', () => {
  const next=confirmVirtualCheckpoint(started,plan,{waypointIndex:1,fuelGal:55},1_010_000);
  assert.equal(projectVirtualFlight(next,plan,1_010_000).fuelSource,'PILOT_CONFIRMED');
  assert.equal(projectVirtualFlight(next,plan,1_020_000).fuelSource,'PROJECTED');
  near(projectVirtualFlight(next,plan,1_020_000).lastConfirmedFuelGal,55);
});

test('consecutive pilot checkpoints retain their separate history', () => {
  const first=confirmVirtualCheckpoint(started,plan,{waypointIndex:1},1_010_000);
  const second=confirmVirtualCheckpoint(first,plan,{waypointIndex:2,fuelGal:45},1_020_000);
  assert.deepEqual(second.checkpoints.map(item=>item.ident),['KOVBI','OPALA']);
  assert.equal(first.checkpoints.length,1);
});

test('an observed different FL only takes effect with a valid next profile', () => {
  const newResult=calculateAtAltitude({plan,...config,altitudeFt:18000});
  const nextProfile=buildVirtualFlightProfile(plan,newResult,77);
  assert.equal(nextProfile.valid,true);
  const next=confirmVirtualCheckpoint(started,plan,{waypointIndex:1,altitudeFt:18000},1_010_000,nextProfile);
  assert.equal(next.config.altitudeFt,18000);
  assert.ok(next.limitations.includes('FL_CHANGED_PROSPECTIVE_MODEL'));
});

test('invalid prospective FL model cannot be attached to a checkpoint', () => {
  assert.throws(()=>confirmVirtualCheckpoint(started,plan,{waypointIndex:1,altitudeFt:18000},1_010_000,{valid:false}),/TRACKER_CHECKPOINT_INVALID/);
  const model=buildVirtualFlightProfile(plan,calculateAtAltitude({plan,...config,altitudeFt:18000}),77);
  assert.throws(()=>confirmVirtualCheckpoint(started,plan,{waypointIndex:0,altitudeFt:18000},1_010_000,model),/TRACKER_FL_PROFILE_UNAVAILABLE/);
});

test('remaining alternate fuel uses the existing diversion model', () => {
  const p=projectVirtualFlight(started,plan,1_500_000);
  const assessment=calculateRemainingFlightAssessment({plan,...config,manual:{active:true,distanceNm:p.distanceNm,altitudeFt:16000,fuelRemainingGal:p.fuelGal},projectedRemainingTripFuelGal:p.remainingTripFuelGal});
  const diversion=calculateAlternateDiversion({plan,...config,result});
  near(assessment.alternateFuelGal,diversion.destination.fuelGal,.01);
});

test('past global icing block cannot relabel a clear remaining segment as restricted', () => {
  const exposure={confidence:'estimated',blocking:true,segments:[{endNm:50,riskScore:100,evidenceAvailable:true},{endNm:200,riskScore:10,evidenceAvailable:true}]};
  assert.equal(remainingExposure(exposure,60,true).status,'PROJECTED');
  assert.equal(remainingExposure(exposure,10,true).status,'RESTRICTION');
});

test('RIDE never inherits the ICE hard-block threshold', () => {
  const exposure={confidence:'estimated',segments:[{endNm:200,riskScore:100,evidenceAvailable:true}]};
  assert.equal(remainingExposure(exposure,50,true,'RIDE').status,'PROJECTED');
});
