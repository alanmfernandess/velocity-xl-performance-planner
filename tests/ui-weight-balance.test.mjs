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

test("mission recovery offers a revalidated level in a centered dialog and preserves the same OFP",()=>{
  assert.match(html,/<dialog class="optimization-dialog" id="optimizationDialog"/);
  assert.match(html,/id="optimizationDialogApply"/);
  assert.match(html,/id="optimizationDialogReview"/);
  assert.match(html,/data-i18n="payloadAssignment"/);
  assert.match(app,/const locked=calculateMissionOptimization\(\{\.\.\.state,lockedAltitudeFt:state\.selectedAltitudeFt\}\)/);
  assert.match(app,/const recovery=global\.feasible&&global\.achievedStatus==="viable"\?null:calculateMissionRecovery\(state,lastViableMission\)/);
  assert.match(app,/savedViableMission\?\.planKey===missionPlanKey\(plan\)/);
  assert.match(app,/\$\("#optimizationDialogApply"\)\.addEventListener\("click"/);
  assert.match(app,/\$\("#optimizationDialogReview"\)\.addEventListener\("click",reviewOptimizationBlocker\)/);
  assert.match(css,/\.optimization-dialog::backdrop/);
  assert.match(css,/@media \(max-width:430px\) \{ \.optimization-dialog-content/);
});

test("the top card separates the suggested and active FL; the route omits the imported FL",()=>{
  assert.match(html,/class="kpi featured kpi-levels"/);
  assert.match(html,/id="kpiSelectedAltitude"/);
  assert.match(app,/\$\("#kpiSelectedAltitude"\)\.textContent=`FL\$\{selected\.fl\}`/);
  assert.match(app,/\$\("#planTimestamp"\)\.textContent=`\$\{number\(plan\.distanceNm\)\} NM`/);
  assert.match(css,/\.kpi-levels \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("pilot FL selection survives preset changes and an invalid manual setting remains visible",()=>{
  assert.match(app,/selectedAltitudeFt:null, selectedAltitudePinned:false/);
  assert.match(app,/state\.selectedAltitudeFt=Number\(button\.dataset\.selectLevel\);state\.selectedAltitudePinned=true/);
  assert.match(app,/state\.mode=button\.dataset\.mode;if\(!state\.selectedAltitudePinned\)state\.selectedAltitudeFt=null/);
  assert.match(app,/selected=selectedCandidate\|\|recommended/);
  assert.match(app,/if\(currentLevelIsViable\(\)\)\{\s*showToast/);
});
