/* Velocity XL — Zen Essential Planning / Config, read-only engine adapter. */
(function planningUI(){
"use strict";
if(new URLSearchParams(location.search).has("auditLegacyUi"))return;
const $=s=>document.querySelector(s);
const icon=(name)=>{
 const p={
 plane:'<path d="M2 20 21 3 16 21 11 14 2 20ZM21 3 9 11l2 3"/>',
 route:'<path d="m21 3-8 18-3-7-7-3L21 3Z"/>',
 settings:'<circle cx="12" cy="12" r="8"/><path d="M12 8v.01M12 11v5"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 fuel:'<path d="M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/>',
 scale:'<path d="M12 3v17M6 7h12M6 7 3 13h6L6 7Zm12 0-3 6h6l-3-6ZM9 20h6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
 check:'<path d="m5 12 5 5L20 7"/>'
 };
 return '<svg viewBox="0 0 24 24" class="zpc-icon" aria-hidden="true">'+(p[name]||p.info)+'</svg>';
};
const background=`<svg class="zpc-art" viewBox="0 0 840 690" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="zpc-fade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#d1e2ee" stop-opacity=".65"/></linearGradient></defs>
<path d="M0 425Q160 450 310 492T620 465T840 430V690H0Z" fill="url(#zpc-fade)"/>
<g fill="none" stroke="#98b7d0" stroke-width="1" opacity=".42">
<path d="M-140 420C-22 344 28 405 85 478S187 545 258 502"/>
<path d="M-140 451C-22 368 25 433 79 503S194 570 269 528"/>
<path d="M-140 479C-22 392 16 464 73 524S208 595 284 549"/>
<path d="M-140 509C-20 412 15 486 74 549S211 624 304 571"/>
<path d="M-157 541C-28 426 7 508 73 573S223 652 316 597"/>
<path d="M600 485C684 434 763 450 901 353"/>
<path d="M581 511C678 463 773 468 909 379"/>
<path d="M574 540C679 484 782 502 919 401"/>
<path d="M567 566C687 502 785 529 935 423"/>
<path d="M550 596C672 522 793 562 948 448"/>
<path d="M540 623C679 548 803 591 956 478"/></g></svg>`;
const root=document.createElement("section");
root.id="zenPlanningShell";
root.hidden=true;
root.setAttribute("aria-label","Planejamento · Configuração Zen Essential");
root.innerHTML=`<div class="zpc-outer"><div class="zpc-app">${background}
<header class="zpc-header">
<button type="button" class="zpc-brand" data-zpc="overview" aria-label="Voltar à visão geral">${icon("plane")}<span>VELOCITY XL</span></button>
<button type="button" class="zpc-iconbtn" data-zpc="settings" aria-label="Configurações e navegação">${icon("settings")}</button>
</header>
<main class="zpc-body">
<div class="zpc-route"><span id="zpcFrom">—</span>${icon("route")}<span id="zpcTo">—</span></div>
<section class="zpc-config" id="zpcConfig" hidden>
<div class="zpc-kicker" id="zpcKicker">CONFIGURAÇÃO DE VOO</div>
<div class="zpc-profiles" role="group" aria-label="Perfil preferido">
<button type="button" data-zpc-mode="ECON">ECON</button>
<button type="button" data-zpc-mode="NORMAL">NORMAL</button>
<button type="button" data-zpc-mode="FAST">FAST</button>
</div>
<div class="zpc-controls">
<label class="zpc-range"><span><span id="zpcPayloadLabel">Carga útil</span><strong id="zpcPayloadValue">—</strong></span><input id="zpcPayload" type="range" min="0" max="1100" step="10" value="520"/></label>
<label class="zpc-range"><span><span id="zpcFuelLabel">Combustível a bordo</span><strong id="zpcFuelValue">—</strong></span><input id="zpcFuel" type="range" min="0" max="87" step="0.5" value="77"/></label>
<label class="zpc-reserve"><span id="zpcReserveLabel">Reserva</span><select id="zpcReserve" aria-label="Reserva"><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label>
</div>
<div class="zpc-separator"></div>
<div class="zpc-stats">
<div class="zpc-stat">${icon("scale")}<strong id="zpcWeight">—</strong><small id="zpcWeightLabel">PESO DE DECOLAGEM</small></div>
<div class="zpc-stat">${icon("fuel")}<strong id="zpcFuelSummary">—</strong><small id="zpcFuelSummaryLabel">A BORDO</small></div>
</div>
<div class="zpc-weight-note" id="zpcWeightNote" role="status"></div>
<button class="zpc-primary" type="button" data-zpc="optimize" id="zpcOptimize">Otimizar missão ${icon("arrow")}</button>
<button class="zpc-textbtn" type="button" data-zpc="details" id="zpcDetails">Detalhes da configuração ›</button>
</section>
<form class="zpc-import" id="zpcImport" hidden>
<div class="zpc-kicker" id="zpcImportKicker">PLANEJAMENTO</div>
<label><span>Pilot ID / Alias</span><input id="zpcPilotId" autocomplete="off" placeholder="123456" required/></label>
<button class="zpc-primary" type="submit" id="zpcImportButton">Importar OFP ${icon("arrow")}</button>
</form>
<div class="zpc-notice">${icon("info")}<span id="zpcCaveat">Terreno e obstáculos não avaliados</span></div>
</main>
<div class="zpc-shade" id="zpcShade" hidden></div>
<aside class="zpc-drawer" id="zpcDrawer" role="dialog" aria-modal="true" aria-labelledby="zpcDrawerTitle" hidden>
<div class="zpc-drawer-head"><strong id="zpcDrawerTitle">Configurações</strong><button type="button" data-zpc="close" class="zpc-iconbtn" aria-label="Fechar painel">${icon("close")}</button></div>
<div class="zpc-drawer-content" id="zpcDrawerContent"></div>
<div class="zpc-drawer-bottom"><button type="button" data-zpc="close" class="zpc-secondary" id="zpcBack">Voltar à configuração</button></div>
</aside>
<div class="zpc-modal-shade" id="zpcModalShade" hidden>
<section class="zpc-modal" role="alertdialog" aria-modal="true" aria-labelledby="zpcModalTitle" aria-describedby="zpcModalDescription">
<div class="zpc-modal-icon">${icon("check")}</div>
<h2 id="zpcModalTitle">Otimizar esta configuração?</h2><p id="zpcModalDescription">O motor recalculará a missão com os parâmetros selecionados.</p>
<div class="zpc-modal-summary" id="zpcModalSummary">—</div>
<button type="button" data-zpc="confirm" id="zpcConfirm" class="zpc-primary">Confirmar otimização</button>
<button type="button" data-zpc="cancel" class="zpc-secondary">Cancelar</button>
</section></div></div></div>`;
document.body.append(root);
const z=s=>root.querySelector(s);
const english=()=>document.documentElement.lang==="en-US";
const tr=(pt,en)=>english()?en:pt;
const txt=s=>$(s)?.textContent?.trim()||"";
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hasPlan=()=>Boolean($("#plannerContent")&&!$("#plannerContent").hidden);
let drawer=null,modal=false,previousFocus=null,renderScheduled=false;
function isActive(){const state=window.VelocityLayout?.state;return state?.area==="planning"&&state.module?.planning==="config";}
function visible(){
 const on=isActive();
 root.hidden=!on;
 document.body.classList.toggle("zen-planning",on);
 document.documentElement.classList.toggle("zen-locked",
   on||document.body.classList.contains("zen-overview")||document.body.classList.contains("zen-assessment"));
 if(!on){if(drawer)closeDrawer();if(modal)closeModal();}
 else draw();
}
function route(){
 const parts=txt("#routeTitle").split(/\s*[→➜]\s*/);
 z("#zpcFrom").textContent=parts[0]||"—";
 z("#zpcTo").textContent=parts[1]||"—";
}
function draw(){
 if(root.hidden)return;
 route();
 const loaded=hasPlan();
 z("#zpcConfig").hidden=!loaded;
 z("#zpcImport").hidden=loaded;
 z("#zpcCaveat").textContent=tr("Terreno e obstáculos não avaliados","Terrain and obstacles not assessed");
 if(!loaded){z("#zpcPilotId").value|| (z("#zpcPilotId").value=$("#quickPilotId")?.value||"");return;}
 z("#zpcKicker").textContent=tr("CONFIGURAÇÃO DE VOO","FLIGHT CONFIGURATION");
 z("#zpcPayloadLabel").textContent=tr("Carga útil","Payload");
 z("#zpcFuelLabel").textContent=tr("Combustível a bordo","Fuel onboard");
 z("#zpcReserveLabel").textContent=tr("Reserva","Reserve");
 z("#zpcWeightLabel").textContent=tr("PESO DE DECOLAGEM","TAKEOFF WEIGHT");
 z("#zpcFuelSummaryLabel").textContent=tr("A BORDO","ONBOARD");
 z("#zpcOptimize").innerHTML=tr("Otimizar missão","Optimize mission")+" "+icon("arrow");
 z("#zpcDetails").textContent=tr("Detalhes da configuração ›","Configuration details ›");
 for(const mode of ["ECON","NORMAL","FAST"]){
  const native=$(`[data-mode="${mode}"]`),button=z(`[data-zpc-mode="${mode}"]`);
  const active=native?.classList.contains("active")||false;
  button.classList.toggle("active",active);
  button.setAttribute("aria-pressed",String(active));
 }
 for(const [from,to,out] of [
 ["#payloadInput","#zpcPayload","#zpcPayloadValue"],
 ["#fuelInput","#zpcFuel","#zpcFuelValue"]
 ]){
   const native=$(from),mirror=z(to);
   if(!native)continue;
   for(const attr of ["min","max","step"])mirror.setAttribute(attr,native.getAttribute(attr));
   if(document.activeElement!==mirror)mirror.value=native.value;
   z(out).textContent=txt(from==="#payloadInput"?"#payloadOutput":"#fuelOutput")||"—";
 }
 z("#zpcReserve").value=$("#reserveInput")?.value||"45";
 z("#zpcWeight").textContent=txt("#weightValue")||"—";
 z("#zpcFuelSummary").textContent=txt("#fuelOutput")||"—";
 const note=txt("#weightNote");
 z("#zpcWeightNote").textContent=note||"";
 z("#zpcWeightNote").classList.toggle("warning",Boolean($("#weightNote")?.style.color));
 z("#zpcOptimize").disabled=Boolean($("#optimizeMission")?.disabled);
 if(drawer)drawDrawer();
}
const detail=(label,value)=>'<div class="zpc-row"><span>'+safe(label)+'</span><strong>'+safe(value||"—")+'</strong></div>';
function drawDrawer(){
 if(!drawer)return;
 const details=drawer==="details",title=details?tr("Detalhes da configuração","Configuration details"):tr("Configurações e navegação","Settings and navigation");
 z("#zpcDrawerTitle").textContent=title;
 const nav='<div class="zpc-minihead">'+tr("NAVEGAÇÃO","NAVIGATION")+'</div><div class="zpc-nav">'+
 [['mission','overview',tr("Visão geral","Overview")],
 ['mission','score',tr("Avaliação","Assessment")],
 ['planning','systems',tr("Peso e sistemas","Weight and systems")],
 ['planning','analyses',tr("Análises e custo","Analysis and cost")],
 ['route','overview',tr("Rota e riscos","Route and risks")],
 ['flight','update',tr("Em voo","In flight")]]
 .map(([area,module,label])=>'<button type="button" data-zpc="navigate" data-area="'+area+'" data-module="'+module+'">'+safe(label)+'</button>').join("")+'</div>';
 if(details){
   z("#zpcDrawerContent").innerHTML=
   '<div class="zpc-minihead">'+tr("PARÂMETROS","PARAMETERS")+'</div>'+
   detail(tr("Perfil","Profile"),[...document.querySelectorAll("[data-mode]")].find(e=>e.classList.contains("active"))?.dataset.mode||"—")+
   detail(tr("Potência","Power"),txt("#powerSettingValue")+" · "+txt("#powerPercent"))+
   detail(tr("Carga útil","Payload"),txt("#payloadOutput"))+
   detail(tr("Combustível a bordo","Fuel onboard"),txt("#fuelOutput"))+
   detail(tr("Reserva","Reserve"),($("#reserveInput")?.value||"—")+" min")+
   detail(tr("Peso de decolagem","Takeoff weight"),txt("#weightValue"))+
   detail(tr("Margem de combustível","Fuel margin"),txt("#layoutFuelMargin"))+
   detail(tr("Oxigênio","Oxygen"),txt("#layoutOxygenSummary"))+
   '<div class="zpc-minihead">'+tr("PESO E BALANCEAMENTO","WEIGHT AND BALANCE")+'</div>'+
   '<p class="zpc-detail-note">'+safe(txt("#weightNote"))+'</p>'+nav;
 }else{
  z("#zpcDrawerContent").innerHTML=
  '<div class="zpc-minihead">'+tr("UNIDADES","UNITS")+'</div>'+
  '<div class="zpc-row"><span>'+tr("Peso","Weight")+'</span><div class="zpc-inlinebtn">'+
    ['lb','kg'].map(unit=>'<button type="button" data-zpc="weight-unit" data-unit="'+unit+'" class="'+(document.querySelector('[data-weight-unit="'+unit+'"]')?.classList.contains("active")?"active":"")+'">'+unit.toUpperCase()+'</button>').join("")+'</div></div>'+
  '<div class="zpc-row"><span>'+tr("Combustível","Fuel")+'</span><div class="zpc-inlinebtn">'+
    ['gal','l'].map(unit=>'<button type="button" data-zpc="fuel-unit" data-unit="'+unit+'" class="'+(document.querySelector('[data-fuel-unit="'+unit+'"]')?.classList.contains("active")?"active":"")+'">'+unit.toUpperCase()+'</button>').join("")+'</div></div>'+
  '<div class="zpc-row"><span>'+tr("Idioma","Language")+'</span><div class="zpc-inlinebtn">'+
    ['pt-BR','en-US'].map(unit=>'<button type="button" data-zpc="language" data-unit="'+unit+'" class="'+(document.querySelector('[data-language="'+unit+'"]')?.classList.contains("active")?"active":"")+'">'+(unit==="pt-BR"?"PT":"EN")+'</button>').join("")+'</div></div>'+nav;
 }
 z("#zpcBack").textContent=tr("Voltar à configuração","Back to configuration");
}
function openDrawer(kind){
 if(modal)return;
 drawer=kind;previousFocus=document.activeElement;
 z("#zpcShade").hidden=false;z("#zpcDrawer").hidden=false;drawDrawer();
 z('#zpcDrawer [data-zpc="close"]').focus();
}
function closeDrawer(){
 drawer=null;z("#zpcShade").hidden=true;z("#zpcDrawer").hidden=true;
 if(previousFocus?.isConnected)previousFocus.focus();
}
function openModal(){
 if(!hasPlan()||$("#optimizeMission")?.disabled)return;
 if(drawer)closeDrawer();
 modal=true;previousFocus=document.activeElement;
 z("#zpcModalShade").hidden=false;
 z("#zpcModalTitle").textContent=tr("Otimizar esta configuração?","Optimize this configuration?");
 z("#zpcModalDescription").textContent=tr(
  "A recomendação será recalculada com os parâmetros atuais. A otimização não aplica automaticamente uma altitude.",
  "Recommendations will be recalculated using the current settings. Optimization does not automatically apply a flight level."
 );
 const selected=[...document.querySelectorAll("[data-mode]")].find(el=>el.classList.contains("active"))?.dataset.mode||"—";
 z("#zpcModalSummary").textContent=[selected,txt("#payloadOutput"),txt("#fuelOutput"),($("#reserveInput")?.value||"45")+" min"].join(" · ");
 z("#zpcConfirm").textContent=tr("Confirmar otimização","Confirm optimization");
 z('#zpcModalShade [data-zpc="cancel"]').textContent=tr("Cancelar","Cancel");
 z("#zpcConfirm").focus();
}
function closeModal(){
 modal=false;z("#zpcModalShade").hidden=true;
 if(previousFocus?.isConnected)previousFocus.focus();
}
function confirm(){
 if(!modal)return;
 closeModal();
 if(!hasPlan())return;
 $("#optimizeMission")?.click();
 schedule();
}
function navigate(area,module){
 if(drawer)closeDrawer();
 if(modal)closeModal();
 window.VelocityLayout?.activate(area,module);
 schedule();
}
root.addEventListener("input",e=>{
 const lookup={zpcPayload:"#payloadInput",zpcFuel:"#fuelInput"};
 const native=$(lookup[e.target.id]);
 if(!native)return;
 native.value=e.target.value;
 native.dispatchEvent(new Event("input",{bubbles:true}));
 schedule();
});
root.addEventListener("change",e=>{
 if(e.target.id==="zpcReserve"){
  const native=$("#reserveInput");
  if(native){native.value=e.target.value;native.dispatchEvent(new Event("change",{bubbles:true}));}
 }else if(e.target.matches("#zpcPayload,#zpcFuel"))draw();
});
root.addEventListener("click",e=>{
 const btn=e.target.closest("button");if(!btn)return;
 if(btn.dataset.zpcMode){
   $(`[data-mode="${btn.dataset.zpcMode}"]`)?.click();
   schedule();return;
 }
 const action=btn.dataset.zpc;
 if(action==="overview")navigate("mission","overview");
 else if(action==="settings")openDrawer("settings");
 else if(action==="details")openDrawer("details");
 else if(action==="close")closeDrawer();
 else if(action==="optimize")openModal();
 else if(action==="cancel")closeModal();
 else if(action==="confirm")confirm();
 else if(action==="navigate")navigate(btn.dataset.area,btn.dataset.module);
 else if(action==="fuel-unit"){
   $(`[data-fuel-unit="${btn.dataset.unit}"]`)?.click();setTimeout(()=>{draw();drawDrawer();},0);
 }else if(action==="weight-unit"){
   $(`[data-weight-unit="${btn.dataset.unit}"]`)?.click();setTimeout(()=>{draw();drawDrawer();},0);
 }else if(action==="language"){
   $(`[data-language="${btn.dataset.unit}"]`)?.click();setTimeout(()=>{draw();drawDrawer();},0);
 }
});
z("#zpcImport").addEventListener("submit",e=>{
 e.preventDefault();
 const form=$("#simbriefImportForm"),native=$("#quickPilotId");
 const id=z("#zpcPilotId").value.trim();
 if(!id||!form||!native)return;
 native.value=id;form.requestSubmit();
 schedule();
});
z("#zpcShade").addEventListener("click",closeDrawer);
z("#zpcModalShade").addEventListener("click",e=>{if(e.target===z("#zpcModalShade"))closeModal();});
document.addEventListener("keydown",e=>{
 if(root.hidden)return;
 if(e.key==="Escape"){
   if(modal){e.preventDefault();closeModal();}
   else if(drawer){e.preventDefault();closeDrawer();}
   return;
 }
 if(e.key!=="Tab")return;
 const container=modal?z("#zpcModalShade .zpc-modal"):drawer?z("#zpcDrawer"):null;
 if(!container)return;
 const list=[...container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')];
 if(!list.length)return;
 if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus();}
 else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus();}
});
function schedule(){
 if(renderScheduled)return;
 renderScheduled=true;
 requestAnimationFrame(()=>{renderScheduled=false;visible();});
}
const top=$("#top");
if(top)new MutationObserver(schedule).observe(top,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["hidden","class","disabled","aria-busy"]});
const module=$('[data-module-panel="planning:config"]');
if(module)new MutationObserver(schedule).observe(module,{attributes:true,attributeFilter:["hidden"]});
document.addEventListener("click",e=>{
 if(e.target.closest("[data-area-button],[data-module-button],[data-open-module]"))queueMicrotask(schedule);
});
window.addEventListener("velocityxl:weather-status",schedule);
window.addEventListener("load",schedule);
visible();
})();
