import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");

test("three-step mission wizard keeps one preset selector and one global optimizer above the detailed tools",()=>{
  assert.match(html,/class="mission-wizard"[\s\S]*?data-wizard-panel="0"[\s\S]*?data-wizard-panel="1"[\s\S]*?data-wizard-panel="2"[\s\S]*?<details class="mission-details"/);
  assert.equal((html.match(/id="optimizeMission"/g)||[]).length,1);
  for(const mode of ["ECON","NORMAL","FAST"]) assert.equal((html.match(new RegExp(`data-mode="${mode}"`,"g"))||[]).length,1);
  assert.equal((html.match(/data-wizard-wb-key=/g)||[]).length,6);
  assert.match(html,/id="wizardRandomizeWeightBalance"/);
  for(const id of ["flight-tools-panel","levelCards","payloadInput","fuelInput","reserveInput","missionScoreValue"]){
    assert.match(html,new RegExp(id));
  }
  assert.match(app,/\$\("#guidedLevel"\)\.textContent=`FL\$\{selected\.fl\}`/);
  assert.match(app,/\$\("#guidedScore"\)\.textContent=`\$\{missionScore\.score\}\/100`/);
  assert.match(app,/\$\("#guidedStatus"\)\.textContent=missionStatusLabel\(missionScore\.status\)/);
});

test("wizard is responsive and tries the selected preset before alternatives",()=>{
  assert.match(css,/\.wizard-wb-grid \{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(max-width:760px\) \{[\s\S]*?\.wizard-wb-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(max-width:430px\) \{[\s\S]*?\.wizard-result-row \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(app,/if\(!suggestion\) suggestion=tryModes\(\[state\.mode\],null\)/);
  assert.match(app,/if\(!suggestion\) suggestion=tryModes\(otherModes,null\)/);
  assert.match(app,/const altitudeFt=applyMissionOptimization\(suggestion,pendingKeepSelectedLevel\)/);
});
