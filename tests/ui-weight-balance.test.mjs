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

test("responsive typography no longer exposes manual A-minus/A-plus scaling",()=>{
  assert.doesNotMatch(html,/class="toolbar-group font-switch"/);
  assert.doesNotMatch(app,/data-font-size/);
  assert.doesNotMatch(css,/html\[data-font-size/);
  assert.match(css,/--font-base: 19px/);
});
