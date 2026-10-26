/* Zen Essential Refined · Weight and Systems · native engine adapter. */
(function installZenSystems(){
"use strict";
if(new URLSearchParams(location.search).has("auditLegacyUi"))return;
const $=s=>document.querySelector(s);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const i=name=>'<svg viewBox="0 0 24 24" class="zws-icon" aria-hidden="true">'+({
plane:'<path d="M2 20 21 3 16 21 11 14 2 20ZM21 3 9 11l2 3"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
route:'<path d="m21 3-8 18-3-7-7-3L21 3Z"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',
weight:'<path d="M12 3v18M5 7h14M5 7 2 13h6L5 7Zm14 0-3 6h6l-3-6ZM7 21h10"/>',
cg:'<circle cx="12" cy="12" r="9"/><path d="M12 4v16M4 12h16"/>',
oxygen:'<circle cx="12" cy="12" r="9"/><path d="M8 8c-2 1-3 3-3 5m14 0c0-2-1-4-3-5M9 15h6M10 10l2 5 2-5"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',check:'<path d="m5 12 5 5L20 7"/>'})[name]+'</svg>';
const art=`<svg class="zws-art" viewBox="0 0 840 680" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="zws-wash" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#dbe9f4" stop-opacity=".5"/></linearGradient></defs><path d="M0 450Q150 415 275 505T585 520T840 435V680H0Z" fill="url(#zws-wash)"/><g fill="none" stroke="#a9c8dd" stroke-width="1.1" opacity=".34"><path d="M-95 455Q75 360 215 575"/><path d="M-100 486Q88 390 238 600"/><path d="M-110 515Q100 417 257 633"/><path d="M-115 550Q108 449 279 668"/><path d="M570 582Q740 438 933 375"/><path d="M545 609Q762 464 940 402"/><path d="M521 635Q776 488 947 430"/><path d="M500 660Q790 507 960 458"/></g></svg>`;
const root=document.createElement("section");root.id="zenSystemsShell";root.hidden=true;root.setAttribute("aria-label","Planejamento · Peso e Sistemas");
root.innerHTML=`<div class="zws-outer"><div class="zws-app">${art}
<header class="zws-header"><button class="zws-brand" type="button" data-zws="overview" aria-label="Voltar à visão geral">${i("plane")}<span>VELOCITY XL</span></button><button class="zws-iconbtn" data-zws="nav" aria-label="Configurações e navegação" type="button">${i("info")}</button></header>
<main class="zws-body">
<div class="zws-route"><span id="zwsFrom">—</span>${i("route")}<span id="zwsTo">—</span></div>
<div class="zws-kicker" id="zwsKicker">PLANEJAMENTO · SISTEMAS</div>
<div class="zws-tabs" role="tablist" aria-label="Peso e sistemas"><button type="button" id="zwsWeightTab" data-zws-tab="weight" role="tab" aria-selected="true">PESO &amp; CG</button><button id="zwsOxygenTab" type="button" data-zws-tab="oxygen" role="tab" aria-selected="false">OXIGÊNIO</button></div>
<div id="zwsData">
<div class="zws-status" id="zwsStatus" role="status" aria-live="polite">—</div>
<div class="zws-statusnote" id="zwsStatusNote">—</div>
<div class="zws-metrics">
<div class="zws-metric"><span id="zwsIconOne">${i("weight")}</span><small id="zwsLabelOne">PESO DE DECOLAGEM</small><strong id="zwsValueOne">—</strong></div>
<div class="zws-metric"><span id="zwsIconTwo">${i("cg")}</span><small id="zwsLabelTwo">CG DECOLAGEM</small><strong id="zwsValueTwo">—</strong></div>
</div>
<div class="zws-technical">
<div class="zws-tech"><small id="zwsTechLabelOne">CG NO POUSO</small><strong id="zwsTechOne">—</strong></div>
<div class="zws-tech"><small id="zwsTechLabelTwo">VARIAÇÃO DO CG</small><strong id="zwsTechTwo">—</strong></div>
</div>
<div class="zws-primary-note" id="zwsPrimaryNote" hidden></div>
</div>
<div class="zws-no-plan" id="zwsNoPlan" hidden><p id="zwsNoPlanText">Importe um plano de voo para configurar os sistemas.</p><button type="button" data-zws="config" class="zws-primary">Abrir configuração ${i("arrow")}</button></div>
<div class="zws-actions" id="zwsActions">
<button class="zws-primary" id="zwsEdit" data-zws="edit" type="button"><span id="zwsEditText">Editar distribuição</span>${i("arrow")}</button>
<button class="zws-textbutton" id="zwsDetails" type="button" data-zws="details">Envelope e estações ›</button>
</div>
<div class="zws-caveat">${i("info")}<span id="zwsCaveat">Terreno e obstáculos não avaliados</span></div>
</main>
<div class="zws-shade" id="zwsShade" hidden></div>
<aside class="zws-drawer" id="zwsDrawer" role="dialog" aria-modal="true" aria-labelledby="zwsDrawerTitle" hidden>
<div class="zws-drawerhead"><strong id="zwsDrawerTitle">Peso e sistemas</strong><button type="button" data-zws="close" class="zws-iconbtn" aria-label="Fechar">${i("close")}</button></div>
<div class="zws-drawerbody" id="zwsDrawerBody"></div>
<div class="zws-drawerfoot"><button class="zws-secondary" data-zws="close" type="button" id="zwsBack">Voltar ao resumo</button></div>
</aside>
<div class="zws-modalshade" id="zwsModalShade" hidden><section class="zws-modal" role="alertdialog" aria-modal="true" aria-labelledby="zwsModalTitle" aria-describedby="zwsModalDescription">
<span class="zws-modal-icon">${i("info")}</span><h2 id="zwsModalTitle">Confirmar alterações?</h2><p id="zwsModalDescription">O motor recalculará os resultados.</p>
<div id="zwsModalSummary" class="zws-modal-summary">—</div>
<button id="zwsConfirm" class="zws-primary" type="button" data-zws="confirm">Confirmar</button>
<button type="button" class="zws-secondary" data-zws="cancel" id="zwsCancel">Cancelar</button>
</section></div></div></div>`;
document.body.append(root);
const z=s=>root.querySelector(s);
const pt=()=>document.documentElement.lang!=="en-US";
const t=(a,b)=>pt()?a:b;
const txt=s=>$(s)?.textContent?.trim()||"";
const plan=()=>Boolean($("#plannerContent")&&!$("#plannerContent").hidden);
let tab="weight",drawer=null,modal=null,draft=null,focus=null,scheduled=false;
const keys=["pilot","copilot","rearLeft","rearCenter","rearRight","baggage"];
const labels=()=>pt()?["Piloto","Copiloto","Traseiro E","Traseiro C","Traseiro D","Bagagem"]:["Pilot","Copilot","Rear L","Rear C","Rear R","Baggage"];
const tone=(kind)=>kind.includes("not-viable")||kind.includes("insufficient")||kind.includes("avoid")?"bad":kind.includes("marginal")||kind.includes("limited")?"marginal":kind.includes("viable")||kind.includes("sufficient")||kind.includes("adequate")?"good":"unknown";
function setText(id,str){const n=z(id);if(n&&n.textContent!==str)n.textContent=str;}
function selectedTab(){for(const b of root.querySelectorAll("[data-zws-tab]")){const yes=b.dataset.zwsTab===tab;b.classList.toggle("active",yes);b.setAttribute("aria-selected",String(yes));}}
function isActive(){const l=window.VelocityLayout?.state;return l?.area==="planning"&&l.module?.planning==="systems";}
function route(){const parts=txt("#routeTitle").split(/\s*[→➜]\s*/);setText("#zwsFrom",parts[0]||"—");setText("#zwsTo",parts[1]||"—");}
function nativeStatus(){
 const el=$(tab==="weight"?"#wbStatus":"#oxygenStatus");
 if(!plan()||!el||!el.textContent.trim()||el.textContent.trim()==="—")return {label:t("NÃO AVALIADO","NOT ASSESSED"),kind:"unknown"};
 const classes=[...el.classList].filter(c=>c!=="status-pill").join(" ");
 return {label:el.textContent.trim(),kind:tone(classes)};
}
function show(){
 const on=isActive();root.hidden=!on;document.body.classList.toggle("zen-systems",on);
 document.documentElement.classList.toggle("zen-locked",on||["zen-overview","zen-assessment","zen-planning"].some(c=>document.body.classList.contains(c)));
 if(!on){if(modal)closeModal();if(drawer)closeDrawer();return;}
 render();
}
function render(){
 if(root.hidden)return;
 route();selectedTab();setText("#zwsKicker",t("PLANEJAMENTO · SISTEMAS","PLANNING · SYSTEMS"));
 setText("#zwsWeightTab",t("PESO & CG","WEIGHT & CG"));setText("#zwsOxygenTab",t("OXIGÊNIO","OXYGEN"));
 const loaded=plan();z("#zwsData").hidden=!loaded;z("#zwsActions").hidden=!loaded;z("#zwsNoPlan").hidden=loaded;
 setText("#zwsNoPlanText",t("Importe um plano de voo antes de avaliar peso, CG e oxigênio.","Import a flight plan before assessing weight, CG and oxygen."));
 if(!loaded){setText("#zwsStatus",t("NÃO AVALIADO","NOT ASSESSED"));return;}
 const s=nativeStatus();z("#zwsStatus").dataset.tone=s.kind;setText("#zwsStatus",s.label);
 if(tab==="weight"){
  setText("#zwsIconOne","");z("#zwsIconOne").innerHTML=i("weight");
  z("#zwsIconTwo").innerHTML=i("cg");
  setText("#zwsLabelOne",t("PESO DE DECOLAGEM","TAKEOFF WEIGHT"));setText("#zwsLabelTwo",t("CG DECOLAGEM","TAKEOFF CG"));
  setText("#zwsValueOne",txt("#wbGrossWeight")||"—");setText("#zwsValueTwo",txt("#wbTakeoffCg")||"—");
  setText("#zwsTechLabelOne",t("CG NO POUSO","LANDING CG"));setText("#zwsTechLabelTwo",t("VARIAÇÃO DO CG","CG TRAVEL"));
  setText("#zwsTechOne",txt("#wbLandingCg")||"—");setText("#zwsTechTwo",txt("#wbCgTravel")||"—");
  setText("#zwsStatusNote",txt("#wbMargins")||t("Dados do motor de peso e balanceamento","Weight and balance engine results"));
  setText("#zwsEditText",t("Editar distribuição","Edit loading"));
  setText("#zwsDetails",t("Envelope e estações ›","Envelope and stations ›"));
  setText("#zwsCaveat",t("Terreno e obstáculos não avaliados","Terrain and obstacles not assessed"));
  z("#zwsPrimaryNote").hidden=true;
 }else{
  z("#zwsIconOne").innerHTML=i("oxygen");z("#zwsIconTwo").innerHTML=i("clock");
  setText("#zwsLabelOne",t("GARRAFAS INSTALADAS","INSTALLED CYLINDERS"));setText("#zwsLabelTwo",t("AUTONOMIA CALCULADA","CALCULATED ENDURANCE"));
  setText("#zwsValueOne",$("#oxygenBottleCount")?.value||"—");setText("#zwsValueTwo",txt("#oxygenEndurance")||"—");
  setText("#zwsTechLabelOne",t("REQUERIDO","REQUIRED"));setText("#zwsTechLabelTwo",t("DISPONÍVEL","AVAILABLE"));
  setText("#zwsTechOne",txt("#oxygenRequired")||"—");setText("#zwsTechTwo",txt("#oxygenInstalled")||"—");
  setText("#zwsStatusNote",txt("#oxygenRecommendation")||t("Autonomia deve ser calculada","Endurance must be calculated"));
  setText("#zwsEditText",t("Configurar oxigênio","Configure oxygen"));
  setText("#zwsDetails",t("Requisitos e cobertura ›","Requirements and coverage ›"));
  setText("#zwsCaveat",t("Terreno e obstáculos não avaliados · O₂ depende do FL analisado","Terrain and obstacles not assessed · O₂ depends on assessed FL"));
  const oxyStatus=$("#oxygenStatus")?.className||"";
  const alert=/insufficient|marginal|unknown|unavailable/i.test(oxyStatus);
  z("#zwsPrimaryNote").hidden=!alert;
  setText("#zwsPrimaryNote",alert?txt("#oxygenRecommendation"):"");
  z("#zwsPrimaryNote").dataset.tone=s.kind;
 }
 if(drawer==="details"||drawer==="nav")drawDrawer(); // Never redraw a draft form while being edited.
}
function row(label,value){return '<div class="zws-row"><span>'+esc(label)+'</span><strong>'+esc(value||"—")+'</strong></div>';}
function startDraft(){
 if(tab==="weight"){
  draft={section:"weight",values:Object.fromEntries(keys.map(k=>[k,$(`[data-wb-key="${k}"]`)?.value||"0"]))};
 }else{
  draft={section:"oxygen",model:$("#oxygenBottle")?.value||"",count:$("#oxygenBottleCount")?.value||"0",
    seats:[...document.querySelectorAll("[data-oxygen-seat]")].map(e=>e.checked)};
 }
}
function drawDrawer(){
 if(!drawer)return;
 const details=drawer==="details",settings=drawer==="nav";
 setText("#zwsDrawerTitle",settings?t("Navegação","Navigation"):tab==="weight"?
    details?t("Envelope e estações","Envelope and stations"):t("Distribuição de peso","Weight distribution"):
    details?t("Requisitos e cobertura","Requirements and coverage"):t("Equipamento de oxigênio","Oxygen equipment"));
 const navigation='<div class="zws-subhead">'+t("NAVEGAÇÃO","NAVIGATION")+'</div><div class="zws-nav">'+[
 ["mission","overview",t("Visão geral","Overview")],["mission","score",t("Avaliação","Assessment")],
 ["planning","config",t("Configuração","Configuration")],["planning","analyses",t("Custo","Cost")],
 ["route","overview",t("Rota e riscos","Route and risks")],["flight","update",t("Em voo","In flight")]
 ].map(([area,module,label])=>`<button type="button" data-zws="go" data-area="${area}" data-module="${module}">${esc(label)}</button>`).join("")+"</div>";
 if(settings){z("#zwsDrawerBody").innerHTML=navigation;return;}
 if(!details){
  if(tab==="weight"){
   z("#zwsDrawerBody").innerHTML='<div class="zws-subhead">'+t("PESOS POR ESTAÇÃO","STATION WEIGHTS")+'</div>'+
     keys.map((k,idx)=>`<label class="zws-row"><span>${esc(labels()[idx])}</span><input type="number" data-zws-weight="${k}" min="0" step="1" value="${esc(draft.values[k])}" aria-label="${esc(labels()[idx])}"></label>`).join("")+
     '<p class="zws-info">'+t("Valores nas unidades exibidas pelo planejador. O motor original recalculará peso, CG, momentos e envelope após a confirmação.","Values are in the planner's selected units. The native engine will recalculate weight, CG, moments and envelope after confirmation.")+'</p>'+
     '<button type="button" class="zws-primary" data-zws="save">'+t("Aplicar alterações","Apply changes")+" "+i("arrow")+'</button>';
  }else{
   const native=$("#oxygenBottle");
   const opts=[...(native?.options||[])].map(o=>`<option value="${esc(o.value)}"${o.value===draft.model?" selected":""}>${esc(o.textContent)}</option>`).join("");
   z("#zwsDrawerBody").innerHTML='<div class="zws-subhead">'+t("EQUIPAMENTO","EQUIPMENT")+'</div>'+
   '<label class="zws-row"><span>'+t("Garrafa","Cylinder")+'</span><select data-zws-model>'+opts+'</select></label>'+
   '<label class="zws-row"><span>'+t("Quantidade","Quantity")+'</span><select data-zws-count>'+[0,1,2,3,4].map(n=>`<option value="${n}"${String(n)===draft.count?" selected":""}>${n}</option>`).join("")+'</select></label>'+
   '<div class="zws-subhead">'+t("OCUPANTES COM O₂","OXYGEN OCCUPANTS")+'</div>'+
   labels().slice(0,5).map((label,idx)=>`<label class="zws-row"><span>${esc(label)}</span><input data-zws-seat="${idx}" type="checkbox"${draft.seats[idx]?" checked":""}${idx===0?" disabled":""}></label>`).join("")+
   '<p class="zws-info">'+t("Alterações nos ocupantes podem ajustar também os pesos das estações. Autonomia e condições de uso dependem do FL e serão recalculadas pelo motor.","Occupant choices can also update station weights. Endurance and use requirements depend on FL and are recalculated by the engine.")+'</p>'+
   '<button type="button" class="zws-primary" data-zws="save">'+t("Aplicar alterações","Apply changes")+" "+i("arrow")+'</button>';
  }
  return;
 }
 if(tab==="weight"){
  z("#zwsDrawerBody").innerHTML=
   '<div class="zws-subhead">'+t("ESTADO E LIMITES","STATUS AND LIMITS")+'</div>'+
   row(t("Avaliação","Assessment"),txt("#wbStatus"))+row(t("Margens FWD / AFT","FWD / AFT margins"),txt("#wbMargins"))+
   row(t("Envelope","Envelope"),txt("#wbEnvelopeLegend"))+
   '<div class="zws-subhead">'+t("ENVELOPE COMPLETO","COMPLETE ENVELOPE")+'</div>'+
   '<div class="zws-cg-chart">'+($("#cgChart")?.innerHTML||"—")+'</div>'+
   '<div class="zws-subhead">'+t("ESTAÇÕES · PESO / BRAÇO / MOMENTO","STATIONS · WEIGHT / ARM / MOMENT")+'</div>'+
   '<div class="zws-stations"><div class="zws-station-head"><span>'+t("Estação","Station")+'</span><span>'+t("Peso","Weight")+'</span><span>'+t("Braço","Arm")+'</span><span>'+t("Momento","Moment")+'</span></div>'+($("#wbStationRows")?.innerHTML||"—")+"</div>"+
   '<div class="zws-subhead">'+t("RESUMO","SUMMARY")+'</div>'+
   row(t("Peso total","Gross weight"),txt("#wbGrossWeight"))+row(t("Decolagem","Takeoff"),txt("#wbTakeoffCg"))+
   row(t("Pouso","Landing"),txt("#wbLandingCg"))+row(t("Variação do CG","CG travel"),txt("#wbCgTravel"));
 }else{
  z("#zwsDrawerBody").innerHTML='<div class="zws-subhead">'+t("ESTADO DE OXIGÊNIO","OXYGEN STATUS")+'</div>'+
  row(t("Condição","Status"),txt("#oxygenStatus"))+row(t("FL avaliado","Assessed FL"),$("#oxygenAltitude")?.selectedOptions[0]?.textContent||"—")+
  row(t("Garrafa","Cylinder"),$("#oxygenBottle")?.selectedOptions[0]?.textContent||"—")+
  row(t("Quantidade","Quantity"),$("#oxygenBottleCount")?.value||"—")+
  row(t("Requerido","Required"),txt("#oxygenRequired"))+row(t("Disponível","Available"),txt("#oxygenInstalled"))+
  row(t("Autonomia","Endurance"),txt("#oxygenEndurance"))+row(t("Peso de O₂","Oxygen weight"),txt("#oxygenWeight"))+
  row(t("Recomendação","Recommendation"),txt("#oxygenRecommendation"))+
  '<p class="zws-info">'+t("A capacidade, a escolha de máscara ou cânula e o equipamento recomendado são determinados pelo motor de oxigênio. Dados insuficientes não são autorização de voo.","Capacity, mask/cannula choice, and recommended equipment come from the oxygen engine. Missing data is not flight authorization.")+'</p>'+
  ($("#applyOxygenRecommendation")?.disabled?"":'<button type="button" class="zws-secondary" data-zws="recommend">'+t("Aplicar recomendação do motor","Apply engine recommendation")+'</button>')+
  '<div class="zws-references">'+($('#oxygenStatus')?.parentElement?.querySelector('small')?.innerHTML||"")+'</div>';
 }
}
function openDrawer(which){
 if(modal)return;drawer=which;focus=document.activeElement;if(which==="edit")startDraft();
 z("#zwsShade").hidden=false;z("#zwsDrawer").hidden=false;drawDrawer();
 z('#zwsDrawer [data-zws="close"]').focus();
}
function closeDrawer(){drawer=null;draft=null;z("#zwsShade").hidden=true;z("#zwsDrawer").hidden=true;if(focus?.isConnected)focus.focus();}
function confirmDialog(kind){
 if(kind==="edit"&&!draft)return;
 modal=kind;
 setText("#zwsModalTitle",kind==="recommend"?t("Aplicar recomendação de oxigênio?","Apply oxygen recommendation?"):t("Confirmar alterações?","Confirm changes?"));
 setText("#zwsModalDescription",kind==="recommend"?t("A configuração recomendada pelo motor será aplicada e a análise recalculada.","The engine-recommended configuration will be applied and recalculated."):
 t("Os parâmetros serão enviados aos controles originais. Peso, envelope de CG e oxigênio serão recalculados; esta confirmação não representa aprovação operacional.","Parameters will be sent to the native controls. Weight, CG envelope and oxygen will be recalculated; this confirmation is not operational approval."));
 const label=kind==="recommend"?txt("#oxygenRecommendation"):draft?.section==="weight"?
   keys.map((k,index)=>`${labels()[index]}: ${draft.values[k]}`).join(" · "):
   `${draft?.model} · ${draft?.count} · ${draft?.seats.filter(Boolean).length} ${t("ocupantes","occupants")}`;
 setText("#zwsModalSummary",label||"—");
 setText("#zwsConfirm",t("Confirmar e recalcular","Confirm and recalculate"));
 setText("#zwsCancel",t("Cancelar","Cancel"));
 z("#zwsModalShade").hidden=false;z("#zwsConfirm").focus();
}
function closeModal(){modal=null;z("#zwsModalShade").hidden=true;if(focus?.isConnected)focus.focus();}
function dispatch(el,type){el.dispatchEvent(new Event(type,{bubbles:true}));}
function commit(){
 const kind=modal;if(!kind)return;
 if(kind==="recommend"){
  const button=$("#applyOxygenRecommendation");if(button&&!button.disabled)button.click();
 }else if(draft?.section==="weight"){
  const updates=keys.map(k=>({el:$(`[data-wb-key="${k}"]`),value:String(draft.values[k])}));
  if(updates.some(p=>!p.el||!Number.isFinite(Number(p.value))||Number(p.value)<0)){closeModal();return;}
  for(const u of updates){if(u.el.value!==u.value){u.el.value=u.value;dispatch(u.el,"input");}}
 }else if(draft?.section==="oxygen"){
  const bottle=$("#oxygenBottle"),count=$("#oxygenBottleCount");
  if(bottle&&bottle.value!==draft.model){bottle.value=draft.model;dispatch(bottle,"change");}
  if(count&&count.value!==draft.count){count.value=draft.count;dispatch(count,"change");}
  document.querySelectorAll("[data-oxygen-seat]").forEach((el,idx)=>{
   if(!el.disabled&&el.checked!==draft.seats[idx]){el.checked=draft.seats[idx];dispatch(el,"change");}
  });
 }
 closeModal();if(drawer)closeDrawer();schedule();
}
root.addEventListener("click",event=>{
 const btn=event.target.closest("button");if(!btn)return;
 if(btn.dataset.zwsTab){tab=btn.dataset.zwsTab;if(drawer)closeDrawer();render();return;}
 switch(btn.dataset.zws){
  case "overview":navigate("mission","overview");break;
  case "config":navigate("planning","config");break;
  case "nav":openDrawer("nav");break;
  case "details":openDrawer("details");break;
  case "edit":openDrawer("edit");break;
  case "close":closeDrawer();break;
  case "save":confirmDialog("edit");break;
  case "recommend":confirmDialog("recommend");break;
  case "cancel":closeModal();break;
  case "confirm":commit();break;
  case "go":navigate(btn.dataset.area,btn.dataset.module);break;
 }
});
root.addEventListener("input",event=>{if(!draft)return;const key=event.target.dataset.zwsWeight;if(key!==undefined)draft.values[key]=event.target.value;});
root.addEventListener("change",event=>{if(!draft)return;const el=event.target;
 if(el.hasAttribute("data-zws-model"))draft.model=el.value;
 if(el.hasAttribute("data-zws-count"))draft.count=el.value;
 if(el.hasAttribute("data-zws-seat"))draft.seats[Number(el.dataset.zwsSeat)]=el.checked;
});
function navigate(area,module){
 if(modal)closeModal();if(drawer)closeDrawer();
 window.VelocityLayout?.activate(area,module);schedule();
}
z("#zwsShade").addEventListener("click",closeDrawer);
z("#zwsModalShade").addEventListener("click",e=>{if(e.target===z("#zwsModalShade"))closeModal();});
document.addEventListener("keydown",e=>{
 if(root.hidden)return;
 if(e.key==="Escape"){if(modal){e.preventDefault();closeModal();}else if(drawer){e.preventDefault();closeDrawer();}return;}
 if(e.key!=="Tab")return;
 const container=modal?z("#zwsModalShade .zws-modal"):drawer?z("#zwsDrawer"):null;if(!container)return;
 const nodes=[...container.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled])")];if(!nodes.length)return;
 if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}
 else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}
});
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;show();});}
const native=$("#top");if(native)new MutationObserver(schedule).observe(native,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["hidden","class","disabled"]});
document.addEventListener("click",e=>{if(e.target.closest("[data-area-button],[data-module-button],[data-open-module]"))queueMicrotask(schedule);});
window.addEventListener("load",schedule);
show();
})();
