import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");

test("guided mission keeps one preset selector and one global optimizer above the detailed tools",()=>{
  assert.match(html,/class="guided-grid"[\s\S]*?guided-choice[\s\S]*?guided-recommendation[\s\S]*?<details class="mission-details"/);
  assert.equal((html.match(/id="optimizeMission"/g)||[]).length,1);
  for(const mode of ["ECON","NORMAL","FAST"]) assert.equal((html.match(new RegExp(`data-mode="${mode}"`,"g"))||[]).length,1);
  for(const id of ["flight-tools-panel","levelCards","payloadInput","fuelInput","reserveInput","missionScoreValue"]){
    assert.match(html,new RegExp(id));
  }
  assert.match(app,/\$\("#guidedLevel"\)\.textContent=`FL\$\{selected\.fl\}`/);
  assert.match(app,/\$\("#guidedScore"\)\.textContent=`\$\{missionScore\.score\}\/100`/);
  assert.match(app,/\$\("#guidedStatus"\)\.textContent=missionStatusLabel\(missionScore\.status\)/);
});

test("both guided cards have the same grid size on desktop and mobile",()=>{
  assert.match(css,/\.guided-grid \{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\);[\s\S]*?grid-auto-rows:1fr;/);
  assert.match(css,/@media \(max-width:760px\) \{\s*\.guided-grid \{ grid-template-columns:minmax\(0,1fr\); grid-auto-rows:1fr; \}/);
  assert.match(css,/\.guided-card \{[\s\S]*?display:flex;[\s\S]*?flex-direction:column;/);
});
