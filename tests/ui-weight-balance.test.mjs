import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertDeclaration } from "./css-utils.mjs";

const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("weight and balance renders a separate responsive CG band for each flight phase",()=>{
  assert.match(app,/key:"zfw",label:t\("zeroFuel"\),point:weightBalance\.zeroFuel/);
  assert.match(app,/key:"takeoff",label:t\("takeoff"\),point:weightBalance\.takeoff/);
  assert.match(app,/key:"landing",label:t\("landing"\),point:weightBalance\.landing/);
  assert.match(app,/class="cg-phase-list"/);
  assert.match(app,/const phaseStatus=outside\?"notViable":closeToLimit\?"marginalStatus":"viable"/);
  assertDeclaration(css,".cg-phase-track","height","16px");
  assertDeclaration(css,".cg-phase-heading","grid-template-columns","minmax(0,1fr) auto",430);
});

test("W&B random load action updates shared payload and oxygen occupancy before global render",()=>{
  assert.match(html,/id="randomizeWeightBalance"/);
  assertDeclaration(css,".wb-randomize","grid-column","1/-1");
  assert.match(app,/randomizeWeightBalance\(\{weightBalance:state\.weightBalance,fuelOnboardGal:state\.fuelOnboardGal,oxygenWeightLb:currentOxygenWeightLb\(\)\}\)/);
  assert.match(app,/invalidateDecision\(true\);\s*state\.weightBalance=randomized;\s*persistWeightBalance\(\);\s*\$\("#payloadInput"\)\.value=String\(state\.payloadLb\);\s*render\(\);/);
  assert.match(app,/state\.oxygen\.seats=\[state\.weightBalance\.pilot,state\.weightBalance\.copilot/);
});

test("A-minus/A/A-plus control persists a slightly smaller default font",()=>{
  assert.match(html,/class="toolbar-group font-switch"/);
  assert.match(app,/velocityxl\.fontSize/);
  assert.match(app,/document\.documentElement\.dataset\.fontSize=state\.fontSize/);
  assert.match(app,/\$\$\('\.font-switch button\[data-font-size\]'\)/);
  assert.match(css,/--ui-body: calc\(14px \* var\(--ui-scale\)\)/);
  assert.match(css,/html\[data-font-size="small"\]/);
  assert.match(css,/html\[data-font-size="large"\]/);
  assert.doesNotMatch(css,/body \*\s*\{[^}]*font-size:[^}]*!important/);
});

test("unified proposal does not silently change occupant stations",()=>{
  assert.match(app,/optimizeMission\(decisionInput\(\)\)/);
  assert.match(app,/state\.weightBalance=randomized/);
  assert.match(html,/id="applyPilotAlternative"/);
  assert.doesNotMatch(html,/id="levelCards"|id="missionRecovery"/);
});
