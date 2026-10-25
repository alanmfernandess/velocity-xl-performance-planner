import test from "node:test";
import assert from "node:assert/strict";
import { createFlightRibbonData, flightRibbonPosition } from "../js/flight-ribbon.js";

const profile = { valid: true, totalSec: 3600, tocSec: 360, todSec: 3060 };
test("ribbon displays actual climb, cruise and descent durations", () => {
  const ribbon = createFlightRibbonData(profile);
  assert.deepEqual(ribbon.phases.map(p => p.seconds), [360, 2700, 540]);
  assert.deepEqual(ribbon.boundaries.map(b => b.label), ["TOC", "TOD"]);
  assert.equal(ribbon.phases.reduce((sum,p)=>sum+p.seconds,0),profile.totalSec);
});
test("schematic position preserves order and phase transitions", () => {
  const ribbon = createFlightRibbonData(profile);
  assert.equal(flightRibbonPosition(ribbon,0),0);
  assert.equal(flightRibbonPosition(ribbon,360),20);
  assert.equal(flightRibbonPosition(ribbon,3060),80);
  assert.equal(flightRibbonPosition(ribbon,3600),100);
  assert.equal(flightRibbonPosition(ribbon,4000),100);
  assert.equal(flightRibbonPosition(ribbon,-100),0);
  for(let i=0,prev=0;i<=3600;i+=7){
    const current=flightRibbonPosition(ribbon,i);assert.ok(current>=prev);prev=current;
  }
});
test("zero-cruise route renders only phases present without fictitious cruise", () => {
  const ribbon=createFlightRibbonData({...profile,todSec:360});
  assert.deepEqual(ribbon.phases.map(p=>p.phase),["CLIMB","DESCENT"]);
  assert.deepEqual(ribbon.boundaries.map(b=>b.label),["TOC/TOD"]);
  assert.equal(flightRibbonPosition(ribbon,360),50);
});
test("invalid and nonfinite profiles do not fabricate data", () => {
  assert.equal(createFlightRibbonData(null),null);
  assert.equal(createFlightRibbonData({...profile,totalSec:0}),null);
  assert.equal(createFlightRibbonData({...profile,valid:false}),null);
  assert.equal(flightRibbonPosition(null,123),null);
  assert.equal(flightRibbonPosition(createFlightRibbonData(profile),NaN),null);
});
