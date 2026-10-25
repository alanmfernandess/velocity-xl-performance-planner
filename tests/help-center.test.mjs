import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HELP_TOPICS,HELP_TOUR,HELP_SCHEMA,HELP_STORAGE_KEY,validateHelpRegistry,readHelpProgress,writeHelpProgress,missingPrerequisites,resumeStep} from "../js/help-registry.js";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
test("single PT/EN help registry covers all areas, mission modules and controls",()=>{
 assert.ok(validateHelpRegistry());
 assert.ok(HELP_TOPICS.length>=45);
 assert.deepEqual(new Set(HELP_TOPICS.map(t=>t.area)),new Set(["mission","planning","route","flight"]));
 assert.equal(new Set(HELP_TOPICS.map(t=>t.id)).size,HELP_TOPICS.length);
 assert.equal(HELP_TOUR.length,16);
 assert.ok(HELP_TOUR.every(t=>HELP_TOPICS.some(topic=>topic.id===t.topic)));
 for(const t of HELP_TOPICS)for(const field of ["title","purpose","usage"])assert.equal(t[field].length,2,t.id+" "+field);
});
test("progress stores only version, bounded step, completion and timestamp",()=>{
 const values=new Map();
 const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.deepEqual(readHelpProgress(storage),{step:0,completed:false});
 assert.ok(writeHelpProgress(storage,{step:5,completed:false}));
 assert.deepEqual(readHelpProgress(storage),{step:5,completed:false});
 assert.equal(Object.keys(JSON.parse(values.get(HELP_STORAGE_KEY))).sort().join(","),"completed,step,updatedAt,version");
 assert.ok(writeHelpProgress(storage,{step:999,completed:true}));
 assert.deepEqual(readHelpProgress(storage),{step:16,completed:true});
 assert.equal(JSON.parse(values.get(HELP_STORAGE_KEY)).version,HELP_SCHEMA);
 values.set(HELP_STORAGE_KEY,"broken");
 assert.deepEqual(readHelpProgress(storage),{step:0,completed:false});
 values.set(HELP_STORAGE_KEY,JSON.stringify({version:0,step:15,completed:true}));
 assert.deepEqual(readHelpProgress(storage),{step:0,completed:false});
});
test("blocked storage does not interrupt help",()=>{
 const bad={getItem(){throw new Error("disabled")},setItem(){throw new Error("disabled")}};
 assert.deepEqual(readHelpProgress(bad),{step:0,completed:false});
 assert.equal(writeHelpProgress(bad,{step:3,completed:false}),false);
});
test("prerequisites and resume never bypass unavailable real mission",()=>{
 const importStep=HELP_TOUR[0];
 assert.deepEqual(missingPrerequisites(importStep,{}),[]);
 const optimized=HELP_TOUR.find(s=>s.id==="choose-candidate");
 assert.deepEqual(missingPrerequisites(optimized,{plan:true}),["optimized"]);
 assert.deepEqual(missingPrerequisites(optimized,{plan:true,optimized:true}),[]);
 assert.equal(resumeStep({step:12,completed:false},{plan:false,optimized:false,selected:false,applied:false}),0);
 assert.equal(resumeStep({step:12,completed:false},{plan:true,optimized:false,selected:false,applied:false}),7);
 assert.equal(resumeStep({step:14,completed:false},{plan:true,optimized:true,selected:false,applied:false}),8);
 assert.equal(resumeStep({step:15,completed:false},{plan:true,optimized:true,selected:true,applied:false}),13);
 assert.equal(resumeStep({step:15,completed:false},{plan:true,optimized:true,selected:true,applied:true}),15);
});
test("real UI integration keeps the four areas and requires actual successful operations",()=>{
 const html=read("index.html"),layout=read("js/layout.js"),app=read("js/app.js"),help=read("js/help.js");
 assert.match(html,/js\/help\.js\?v=20261024-03-help1/);
 assert.match(layout,/type: 'navigation'/);
 for(const signal of ["plan-imported","mission-optimized","candidate-selected","configuration-applied"])assert.match(app,new RegExp('helpSignal\\("'+signal+'"\\)'));
 assert.match(help,/window\.addEventListener\("velocity:activity"/);
 assert.match(help,/missingPrerequisites\(s,applicableFacts\(\)\)/);
 assert.match(read("js/help-registry.js"),/event:"ack"/);
 assert.match(help,/window\.VelocityLayout\.activate/);
 assert.doesNotMatch(help,/state\.plan\s*=|trackerSession\s*=|state\.appliedChoice\s*=/);
 assert.match(html,/id="areaNav"/);
});
