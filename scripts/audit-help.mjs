import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root=path.resolve(import.meta.dirname,"..");
const output=path.join(root,"review/help-center");
await fs.mkdir(output,{recursive:true});
const report={widths:[320,390,768,1440],states:[],errors:[]};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");
  const file=path.resolve(root,`.${url.pathname==="/"?"/index.html":url.pathname}`);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const type={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json"}[path.extname(file)]||"application/octet-stream";
  res.writeHead(200,{"Content-Type":type});res.end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
try{
 for(const width of report.widths){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator("#helpLaunch").waitFor({state:"visible",timeout:10000});
  assert.equal(await page.locator('[data-area-button="mission"]').count(),2);
  await page.locator("#helpLaunch").click();
  await page.locator("#helpDrawer").waitFor({state:"visible"});
  assert.match(await page.locator("#helpDrawerTitle").innerText(),/Central de ajuda/);
  await page.locator('.help-tabs [data-help-page="catalog"]').click();
  await page.locator("#helpSearch").fill("Calibração");
  await page.locator('[data-help-topic="calibration"]').waitFor();
  const rows=await page.locator("#helpResults .help-result").count();
  assert.ok(rows>0 && rows<10);
  await page.locator('[data-help-topic="calibration"]').click();
  assert.match(await page.locator("#helpDrawerBody").innerText(),/K1/);
  await page.locator('[data-help-action="all-topics"]').click();
  await page.locator('.help-tabs [data-help-page="guides"]').click();
  await page.locator('[data-help-action="start-tour"]').click();
  await page.locator("#helpTourOverlay").waitFor({state:"visible"});
  const first=await page.locator("#helpTipMeta").innerText();
  assert.match(first,/1\/16/);
  assert.equal(await page.locator('[data-help-action="primary"]').isDisabled(),true);
  const focus=await page.locator("#helpTourOutline").boundingBox();
  const target=await page.locator("#importLatest").boundingBox();
  assert.ok(focus&&target&&Math.abs(focus.x-target.x)<9&&Math.abs(focus.y-target.y)<9,"focus should track the actual Import OFP button");
  // Do not enter a Pilot ID or make an external request.
  await page.locator("#importLatest").click();
  await page.waitForTimeout(70);
  assert.match(await page.locator("#helpTipMeta").innerText(),/1\/16/);
  await page.locator('[data-help-action="exit"]').click();
  assert.equal(await page.locator("#helpTourOverlay").isVisible(),false);
  await page.locator("#helpLaunch").click();
  assert.match(await page.locator("#helpDrawerBody").innerText(),/Planejar voo completo/);
  await page.screenshot({path:path.join(output,`help-${width}.png`),fullPage:false});
  if(errors.length)throw new Error(errors.join(" | "));
  const over=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(over,false,`viewport ${width}: horizontal body overflow`);
  report.states.push({width,searchResults:rows,focus:true,validation:true,overflow:over});
  await page.close();
 }
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
 await fs.writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
