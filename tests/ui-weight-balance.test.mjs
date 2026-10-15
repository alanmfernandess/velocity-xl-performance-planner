import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("weight and balance renders a separate responsive CG band for each flight phase",()=>{
  assert.match(app,/key:"zfw",label:t\("zeroFuel"\),point:weightBalance\.zeroFuel/);
  assert.match(app,/key:"takeoff",label:t\("takeoff"\),point:weightBalance\.takeoff/);
  assert.match(app,/key:"landing",label:t\("landing"\),point:weightBalance\.landing/);
  assert.match(app,/class="cg-phase-list"/);
  assert.match(app,/const phaseStatus=outside\?"notViable":closeToLimit\?"marginalStatus":"viable"/);
  assert.match(css,/\.cg-phase-track \{[^}]*height:16px/);
  assert.match(css,/@media \(max-width:430px\) \{\s*\.cg-phase-heading/);
});

test("W&B random load action updates shared payload and oxygen occupancy before global render",()=>{
  assert.match(html,/id="randomizeWeightBalance"/);
  assert.match(css,/\.wb-randomize \{ grid-column:1\/-1;/);
  assert.match(app,/randomizeWeightBalance\(\{weightBalance:state\.weightBalance,fuelOnboardGal:state\.fuelOnboardGal,oxygenWeightLb:currentOxygenWeightLb\(\)\}\)/);
  assert.match(app,/state\.weightBalance=randomized;\s*persistWeightBalance\(\);\s*\$\("#payloadInput"\)\.value=String\(state\.payloadLb\);\s*render\(\);/);
  assert.match(app,/state\.oxygen\.seats=\[state\.weightBalance\.pilot,state\.weightBalance\.copilot/);
});

test("A-minus/A/A-plus control persists a slightly smaller default font",()=>{
  assert.match(html,/class="toolbar-group font-switch"/);
  assert.match(app,/velocityxl\.fontSize/);
  assert.match(app,/document\.documentElement\.dataset\.fontSize=state\.fontSize/);
  assert.match(app,/\$\$\('\.font-switch button\[data-font-size\]'\)/);
  assert.match(css,/--font-base: 18px/);
  assert.match(css,/html\[data-font-size="small"\]/);
  assert.match(css,/html\[data-font-size="large"\]/);
  assert.match(css,/body :is\(strong,b,button\) \{ font-weight:500!important; \}/);
});

test("all cruise levels use expandable progressive rows with separate selection",()=>{
  assert.match(html,/class="levels-list" id="levelCards"/);
  assert.match(app,/aria-expanded="\$\{expanded\}" aria-controls="\$\{detailId\}"/);
  assert.match(app,/class="level-detail" id="\$\{detailId\}"/);
  assert.match(app,/!blocked&&!current\?`<button class="level-select"/);
  assert.match(css,/\.level-expand \{[^}]*grid-template-columns:90px minmax\(0,1fr\) auto 16px/);
  assert.match(css,/@media \(max-width:760px\) \{[^]*\.level-summary \{ grid-column:1\/-1; grid-row:2; \}/);
});

test("mission recovery explains the blocker and requires explicit restoration of the same OFP",()=>{
  assert.match(html,/id="missionRecovery"[^>]*hidden/);
  assert.match(html,/id="missionRecoveryAction"/);
  assert.match(html,/data-i18n="payloadAssignment"/);
  assert.match(app,/pendingMissionRecovery=calculateMissionRecovery\(state,lastViableMission\)/);
  assert.match(app,/savedViableMission\?\.planKey===missionPlanKey\(plan\)/);
  assert.match(app,/\$\("#missionRecoveryAction"\)\.addEventListener\("click"/);
  assert.match(css,/\.mission-recovery\[hidden\]/);
});
