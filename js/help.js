import {HELP_TOPICS,HELP_TOUR,HELP_STORAGE_KEY,readHelpProgress,writeHelpProgress,missingPrerequisites,resumeStep,validateHelpRegistry} from "./help-registry.js?v=20261024-03";

// Contextual help and a guided workflow; never synthesizes flight data or presses operational buttons.
export function initVelocityHelp(){
 if(!validateHelpRegistry())return;
 const qs=s=>document.querySelector(s),pt=()=>document.documentElement.lang!=="en-US";
 const text=(ptValue,enValue)=>pt()?ptValue:enValue;
 const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
 const topic=id=>HELP_TOPICS.find(item=>item.id===id);
 const translation=arr=>arr?(pt()?arr[0]:arr[1]):"";
 const progress=readHelpProgress(window.localStorage);
 let stepIndex=progress.step,complete=progress.completed,active=false,mode="tour",quick=null,lastFocus=null,filter="all",search="",page="guides",selectedTopic=null,viewTarget=null;
 let tracking=false,rectObserver=null,restoreFocus=null,lastAnchor=null,repositionFrame=0,prevented=false;
 const ui=document.createElement("div");ui.id="velocityHelpUi";ui.className="help-ui";
 ui.innerHTML=`
 <button id="helpLaunch" type="button" class="ui-button help-launch" aria-label="Central de ajuda" aria-haspopup="dialog" aria-expanded="false" aria-controls="helpDrawer">?<span class="help-dot"></span></button>
 <div id="helpDrawerBackdrop" class="help-drawer-backdrop" hidden></div>
 <section id="helpDrawer" class="ui-card help-drawer" role="dialog" aria-modal="true" aria-labelledby="helpDrawerTitle" hidden>
  <header class="help-drawer-header"><div><span data-ui-role="label">VELOCITY XL</span><h2 id="helpDrawerTitle"></h2></div><button class="ui-button help-close" id="helpClose" type="button" aria-label="Fechar">×</button></header>
  <div class="help-tabs" role="group"><button type="button" class="ui-button" data-help-page="guides"></button><button type="button" class="ui-button" data-help-page="catalog"></button></div>
  <div class="help-drawer-body" id="helpDrawerBody"></div>
 </section>
 <div class="help-tour-overlay" id="helpTourOverlay" hidden aria-live="off">
  <svg id="helpTourShade" aria-hidden="true" preserveAspectRatio="none"><defs><mask id="helpTourHole"><rect id="helpMaskBackground" fill="white"/><rect id="helpMaskOpening" fill="black" rx="10"/></mask></defs><rect class="help-shade-fill" mask="url(#helpTourHole)"/></svg>
  <div class="help-tour-outline" id="helpTourOutline" aria-hidden="true"></div>
  <div class="help-tour-toolbar"><span id="helpTourPhase"></span><button class="ui-button" type="button" data-help-action="exit"></button></div>
  <section class="ui-card help-tip" id="helpTip" role="dialog" aria-modal="false" aria-labelledby="helpTipTitle"><div class="help-tip-meta" id="helpTipMeta"></div><h2 id="helpTipTitle"></h2><p id="helpTipBody"></p><p class="help-tip-warning" id="helpTipWarning" hidden></p><div class="help-tip-actions"><button type="button" class="ui-button help-secondary" data-help-action="back"></button><button type="button" class="ui-button help-primary" data-help-action="primary"></button></div></section>
 </div>
 `;
 document.body.append(ui);
 const $=id=>ui.querySelector("#"+id);
 const launch=$("helpLaunch");
 // One launch control in the existing header, never a fifth navigation tab.
 qs(".app-toolbar")?.append(launch);
 launch.addEventListener("click",()=>showDrawer("guides"));
 function facts(){
  const plan=Boolean(qs("#plannerContent")&&!qs("#plannerContent").hidden);
  const optimized=plan&&Boolean(qs("#topLevelCards [data-decision-fl]"));
  const selected=optimized&&Boolean(qs("#pilotAnalysis")&&!qs("#pilotAnalysis").hidden);
  const applied=plan&&Boolean(qs("#trackerPrimary")&&!qs("#trackerPrimary").disabled&&readApplied());
  return {plan,optimized,selected,applied};
 }
 function readApplied(){
  // Applied-state presence must be tied to the current candidate in the live UI,
  // not to a saved value for an unrelated OFP.
  const button=qs("#applyPilotAlternative");
  const applied=qs("#kpiLevelMeta")?.textContent||"";
  return Boolean(window.VelocityHelpFacts?.applied||applied.toLowerCase().includes("aplicad")||applied.toLowerCase().includes("applied"));
 }
 const state=()=>window.VelocityHelpFacts||facts();
 function applicableFacts(){const actual=facts();const official=window.VelocityHelpFacts||{};return {...actual,...official,plan:actual.plan,optimized:actual.optimized,selected:actual.selected,applied:Boolean(official.applied&&actual.plan)};}
 function save(){
  writeHelpProgress(localStorage,{step:stepIndex,completed:complete});
  const bar=ui.querySelector("[data-help-progress]");
  if(bar)bar.style.width=(100*(complete?1:stepIndex/HELP_TOUR.length))+"%";
 }
 function hideDrawer(){
  $("helpDrawer").hidden=true;$("helpDrawerBackdrop").hidden=true;
  launch.setAttribute("aria-expanded","false");
  selectedTopic=null;
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
 }
 function showDrawer(newPage="guides",id=null){
  leaveTour(false);
  page=newPage;selectedTopic=id;lastFocus=document.activeElement;
  $("helpDrawer").hidden=false;$("helpDrawerBackdrop").hidden=false;
  launch.setAttribute("aria-expanded","true");
  renderDrawer();
  $("helpClose").focus();
 }
 function card(title,body,extra=""){return `<article class="ui-card help-item"><h3>${esc(title)}</h3>${body}${extra}</article>`;}
 function renderDrawer(){
  const body=$("helpDrawerBody");
  $("helpDrawerTitle").textContent=text("Central de ajuda","Help center");
  ui.querySelectorAll("[data-help-page]").forEach(b=>{
   b.textContent=b.dataset.helpPage==="guides"?text("Guias","Guides"):text("Todas as funções","All features");
   b.setAttribute("aria-pressed",String(b.dataset.helpPage===page));
  });
  if(selectedTopic){
   const t=topic(selectedTopic);
   if(!t){selectedTopic=null;renderDrawer();return;}
   body.innerHTML=`<button class="ui-button help-secondary" type="button" data-help-action="all-topics">${text("‹ Todas as funções","‹ All features")}</button>
    <div class="help-topic-heading"><span data-ui-role="label">${esc(t.area.toUpperCase())} · ${esc(t.module.toUpperCase())}</span><h3>${esc(translation(t.title))}</h3></div>
    ${card(text("Para que serve","Purpose"),`<p>${esc(translation(t.purpose))}</p>`)}
    ${card(text("Como usar","How to use"),`<p>${esc(translation(t.usage))}</p>`)}
    ${t.limits?card(text("Limites","Limitations"),`<p>${esc(translation(t.limits))}</p>`):""}
    <button type="button" class="ui-button help-primary help-block" data-help-action="locate" data-help-id="${esc(t.id)}">${text("Mostrar na tela","Show on screen")}</button>`;
   return;
  }
  if(page==="guides"){
   const pos=complete?HELP_TOUR.length:stepIndex;
   body.innerHTML=`<p class="help-intro">${text("Aprenda o fluxo do OFP ao acompanhamento no simulador, ou abra uma explicação específica.","Learn the workflow from OFP to simulator tracking, or open a specific explanation.")}</p>
   ${card(text("Planejar voo completo","Plan a complete flight"),
    `<div class="help-step-count"><span>${text("PROGRESSO","PROGRESS")}</span><strong>${pos}/${HELP_TOUR.length}</strong></div><div class="help-progress"><span data-help-progress style="width:${100*pos/HELP_TOUR.length}%"></span></div><div class="help-tag-row"><span>SIMBRIEF</span><span>PERFORMANCE</span><span>TRACKER</span></div>`,
    `<button type="button" class="ui-button help-primary help-block" data-help-action="start-tour">${complete?text("Refazer guia","Restart guide"):pos?text("Continuar guia","Resume guide"):text("Iniciar guia","Start guide")}</button>`)}
    <div class="help-section-label">${text("GUIAS RÁPIDOS","QUICK GUIDES")}</div>
    ${[["ribbon","Flight Ribbon"],["resilience","Resilience Lab"],["tracker","Virtual Flight Tracker"]].map(([id,title])=>card(title,`<span data-ui-role="label">${esc(translation(topic(id).purpose))}</span>`,`<button type="button" class="ui-button help-secondary help-block" data-help-action="locate" data-help-id="${id}">${text("Mostrar na tela","Show on screen")}</button>`)).join("")}
    <button type="button" class="ui-button help-secondary help-block" data-help-page="catalog">${text("Índice de funcionalidades","Feature index")}</button>`;
   return;
  }
  const query=search;
  body.innerHTML=`<label class="ui-field help-search-field"><span data-ui-role="label">${text("Buscar funcionalidade","Search features")}</span><input id="helpSearch" type="search" autocomplete="off" placeholder="${text("Botão, card, cálculo...","Button, card, calculation...")}" value="${esc(query)}"/></label><div class="help-filters">${[["all",text("Tudo","All")],["mission",text("Missão","Mission")],["planning",text("Planejamento","Planning")],["route",text("Rota","Route")],["flight",text("Em voo","In flight")]].map(([k,label])=>`<button class="ui-button help-filter" type="button" data-help-filter="${k}" aria-pressed="${filter===k}">${esc(label)}</button>`).join("")}</div><div id="helpResults"></div>`;
  renderResults();
 }
 function renderResults(){
  const node=$("helpResults");if(!node)return;
  const norm=v=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const q=norm(search.trim());
  const options=HELP_TOPICS.filter(t=>(filter==="all"||t.area===filter)&&(!q||norm([t.id,...t.title,...t.purpose,...t.usage].join(" ")).includes(q)));
  node.innerHTML=`<div class="help-step-count"><span>${text("FUNCIONALIDADES","FEATURES")}</span><strong>${options.length}</strong></div><div class="help-result-list">${options.map(t=>`<button type="button" class="ui-button help-result" data-help-topic="${esc(t.id)}"><span><strong>${esc(translation(t.title))}</strong><small>${esc(t.area)} · ${esc(t.module)}</small></span><span aria-hidden="true">›</span></button>`).join("")}</div>${options.length?"":`<p class="help-empty">${text("Nenhum resultado.","No results.")}</p>`}`;
 }
 function visible(el){if(!el||el.closest("[hidden]"))return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=="hidden";}
 function findAnchor(selector){return [...document.querySelectorAll(selector)].find(visible)||null;}
 function navigateTo(t){
  if(t.area&&window.VelocityLayout?.activate){
   window.VelocityLayout.activate(t.area,t.module);
  }
  const tools={"weight-balance":"wb",oxygen:"oxygen",cost:"cost",ice:"ice",ride:"ride",etp:"etp",alternate:"alternate",glide:"glide",step:"steps"};
  const toolName=tools[t.topic||t.id];
  if((mode==="quick"||t.id==="oxygen-review")&&toolName){
   const button=qs('[data-tool-view="'+toolName+'"]');
   if(button&&visible(button))button.click();
  }
 }
 function locate(t){
  hideDrawer();
  navigateTo(t);
  quick=t;mode="quick";active=true;tracking=false;
  requestAnimationFrame(()=>requestAnimationFrame(placeTour));
 }
 function startTour(){
  hideDrawer();mode="tour";quick=null;active=true;tracking=false;lastFocus=document.activeElement;
  stepIndex=resumeStep({step:complete?0:stepIndex,completed:complete},applicableFacts());
  complete=false;showStep();
 }
 function showStep(){
  if(!active||mode!=="tour")return;
  const s=HELP_TOUR[stepIndex];
  tracking=false;
  // Navigation controls must be explicitly pressed, so navigate only to the
  // source module. Operational mutations remain exclusively in existing app handlers.
  navigateTo(s);
  requestAnimationFrame(()=>requestAnimationFrame(placeTour));
 }
 function leaveTour(focus=true){
  const had=active;
  active=false;tracking=false;quick=null;lastAnchor=null;
  $("helpTourOverlay").hidden=true;cancelAnimationFrame(repositionFrame);
  if(had&&focus&&restoreFocus?.isConnected)restoreFocus.focus({preventScroll:true});
 }
 function canAccept(s,detail){
  if(missingPrerequisites(s,applicableFacts()).length)return false;
  if(s.event==="navigation")return detail.type==="navigation"&&detail.value===s.value;
  return detail.type===s.event;
 }
 function advance(){
  if(!active||mode!=="tour")return;
  const s=HELP_TOUR[stepIndex];if(missingPrerequisites(s,applicableFacts()).length){placeTour();return;}
  stepIndex++;save();
  if(stepIndex>=HELP_TOUR.length){complete=true;save();showFinish();return;}
  showStep();
 }
 function showFinish(){
  const overlay=$("helpTourOverlay");
  overlay.hidden=false;overlay.classList.add("help-finished");
  $("helpTourShade").hidden=true;$("helpTourOutline").hidden=true;
  $("helpTourPhase").textContent=text("GUIA COMPLETO","GUIDE COMPLETE");
  $("helpTipMeta").textContent=`${HELP_TOUR.length}/${HELP_TOUR.length}`;
  $("helpTipTitle").textContent=text("Planejamento guiado concluído","Guided planning complete");
  $("helpTipBody").textContent=text("O roteiro terminou. O Tracker só deve ser iniciado quando começar o voo no simulador.","Guide finished. Start the Tracker only when the simulator flight actually begins.");
  $("helpTipWarning").hidden=true;
  $("helpTip").style.cssText="";
  $("helpTip").classList.add("help-tip-centered");
  ui.querySelector('[data-help-action="back"]').hidden=true;
  ui.querySelector('[data-help-action="primary"]').textContent=text("Concluir","Finish");
  ui.querySelector('[data-help-action="exit"]').textContent=text("Fechar","Close");
 }
 function placeTour(){
  if(!active)return;
  const s=mode==="tour"?HELP_TOUR[stepIndex]:quick;
  if(!s)return;
  const target=findAnchor(s.selector);
  if(!target){
   showMissing(s);return;
  }
  if(!tracking){restoreFocus=document.activeElement;tracking=true;}
  lastAnchor=target;
  // Only scroll real controls. No copy or artificial click on the planner.
  const r=target.getBoundingClientRect();
  if(r.top<88||r.bottom>innerHeight-110){
   target.scrollIntoView({behavior:"auto",block:"center",inline:"nearest"});
  }
  requestAnimationFrame(()=>updatePosition(s,target));
 }
 function updatePosition(s,target){
  if(!active||!target?.isConnected)return;
  const overlay=$("helpTourOverlay");overlay.hidden=false;overlay.classList.remove("help-finished");
  $("helpTourShade").hidden=false;$("helpTourOutline").hidden=false;$("helpTip").classList.remove("help-tip-centered");
  const rect=target.getBoundingClientRect(),pad=5,w=window.innerWidth,h=window.innerHeight;
  const x=Math.max(5,rect.left-pad),y=Math.max(5,rect.top-pad),rw=Math.min(rect.width+2*pad,w-x-5),rh=Math.min(rect.height+2*pad,h-y-5);
  const mask=overlay.querySelector("#helpMaskOpening"),background=overlay.querySelector("#helpMaskBackground");
  const full=overlay.querySelector(".help-shade-fill");
  overlay.querySelector("svg").setAttribute("viewBox",`0 0 ${w} ${h}`);
  background.setAttribute("width",w);background.setAttribute("height",h);
  full.setAttribute("width",w);full.setAttribute("height",h);
  for(const [attr,value] of Object.entries({x,y,width:rw,height:rh}))mask.setAttribute(attr,value);
  $("helpTourOutline").style.cssText=`left:${x}px;top:${y}px;width:${rw}px;height:${rh}px`;
  const t=topic(s.topic||s.id),isTour=mode==="tour",count=isTour?`${stepIndex+1}/${HELP_TOUR.length}`:text("AJUDA CONTEXTUAL","CONTEXT HELP");
  $("helpTourPhase").textContent=isTour?text("PLANEJAMENTO GUIADO","GUIDED PLANNING"):text("AJUDA CONTEXTUAL","CONTEXT HELP");
  ui.querySelector('[data-help-action="exit"]').textContent=text("Sair ×","Exit ×");
  $("helpTipMeta").textContent=isTour?`${count} · ${esc(s.stage.toUpperCase())}`:count;
  $("helpTipTitle").textContent=translation(t?.title)||"—";
  $("helpTipBody").textContent=isTour?translation(t?.usage):translation(t?.purpose);
  const blocked=isTour?missingPrerequisites(s,applicableFacts()):[];
  const warning=$("helpTipWarning");
  const disabled=target.matches(":disabled")||target.closest("button:disabled");
  warning.hidden=!(blocked.length||disabled);
  if(!warning.hidden)warning.textContent=blocked.length?text("Conclua as etapas anteriores para prosseguir.","Complete prior steps to continue."):text("Este controle não está disponível no estado atual da missão.","This control is unavailable in the current mission state.");
  const primary=ui.querySelector('[data-help-action="primary"]');
  const back=ui.querySelector('[data-help-action="back"]');
  back.hidden=!isTour||stepIndex===0;back.textContent=text("Voltar","Back");
  primary.hidden=false;
  if(isTour){
   const ack=s.event==="ack";
   primary.textContent=ack?text("Conferido · próximo","Reviewed · next"):text("Aguardando ação no controle","Waiting for control action");
   primary.disabled=!ack&&!canUseCurrent(s);
  }else{primary.textContent=text("Entendi","Got it");primary.disabled=false;}
  const tip=$("helpTip");
  tip.style.cssText="left:var(--space-3);right:var(--space-3);top:80px;";
  const th=tip.offsetHeight;
  const bottomSpace=h-(y+rh);
  let top=bottomSpace>th+17?y+rh+12:y-th-12;
  top=Math.min(h-th-10,Math.max(68,top));
  tip.style.top=top+"px";
  if(isTour&&s.event!=="ack"&&!primary.disabled)primary.textContent=text("Usar estado atual ✓","Use current state ✓");
 }
 function canUseCurrent(s){
  const f=applicableFacts();
  return s.event==="plan-imported"&&f.plan||s.event==="mission-optimized"&&f.optimized||s.event==="candidate-selected"&&f.selected||s.event==="configuration-applied"&&f.applied;
 }
 function showMissing(s){
  const overlay=$("helpTourOverlay");overlay.hidden=false;
  $("helpTourShade").hidden=true;$("helpTourOutline").hidden=true;
  $("helpTip").classList.add("help-tip-centered");
  $("helpTip").style.cssText="";
  $("helpTourPhase").textContent=text("GUIA","GUIDE");
  $("helpTipMeta").textContent="";
  $("helpTipTitle").textContent=translation(topic(s.topic)?.title)||text("Controle indisponível","Control unavailable");
  $("helpTipBody").textContent=text("O controle não está disponível. Confira se há um OFP carregado e se a análise necessária foi concluída.","Control unavailable. Verify that an OFP is loaded and its required analysis has finished.");
  $("helpTipWarning").hidden=true;
  ui.querySelector('[data-help-action="primary"]').hidden=true;
  ui.querySelector('[data-help-action="back"]').hidden=stepIndex===0;
 }
 function onActivity(detail){
  if(!active||mode!=="tour"||!detail)return;
  const s=HELP_TOUR[stepIndex];
  if(canAccept(s,detail))setTimeout(()=>{if(active&&mode==="tour"&&HELP_TOUR[stepIndex]===s)advance();},0);
 }
 window.addEventListener("velocity:activity",event=>onActivity(event.detail));
 document.addEventListener("click",event=>{
  if(!active||mode!=="tour")return;
  const s=HELP_TOUR[stepIndex];
  if(s.event==="layer-ice"&&event.target.closest('[data-profile-layer="ICE"]')){
   setTimeout(()=>{if(active&&HELP_TOUR[stepIndex]===s&&qs('[data-profile-layer="ICE"]')?.getAttribute("aria-pressed")==="true")advance();},0);
  }
 },false);
 function attachContextButtons(){
  // Rendered panels are replaced by the calculation engine; attach idempotently.
  const hosts=[
   ["#pilotDecisionPanel .pilot-decision-heading","top3"],
   ["#missionProfilePanel .mp-heading","ribbon"],
   ["#resilienceLab .rl-heading","resilience"],
   [".mission-score-panel .shared-card-head","score"],
   [".recommendation-card .shared-card-head","advisor"],
   [".planning-live-summary .shared-card-head","weight-balance"],
   ["#manualFlightPanel .tracker-heading","tracker"]
  ];
  for(const [selector,id] of hosts){
   const el=qs(selector);
   if(!el||el.querySelector('[data-help-topic]'))continue;
   const button=document.createElement("button");button.type="button";button.className="ui-button help-context-control";
   button.setAttribute("data-help-topic",id);
   button.setAttribute("aria-label",text("Ajuda: ","Help: ")+translation(topic(id)?.title));
   button.textContent="?";el.append(button);
  }
 }
 const contextObserver=new MutationObserver(()=>{if(!ui._contextQueued){ui._contextQueued=true;requestAnimationFrame(()=>{ui._contextQueued=false;attachContextButtons();});}});
 if(qs("#plannerContent"))contextObserver.observe(qs("#plannerContent"),{childList:true,subtree:true});
 attachContextButtons();
 document.addEventListener("click",event=>{const control=event.target.closest("[data-help-topic]");if(control&&!ui.contains(control)){event.stopPropagation();showDrawer("catalog",control.dataset.helpTopic);}},false);
 ui.addEventListener("click",event=>{
  const btn=event.target.closest("button");
  if(!btn)return;
  if(btn.id==="helpLaunch"){showDrawer("guides");return;}
  if(btn.id==="helpClose"||btn.id==="helpDrawerBackdrop"){hideDrawer();return;}
  if(btn.dataset.helpTopic){showDrawer("catalog",btn.dataset.helpTopic);return;}
  if(btn.dataset.helpPage){selectedTopic=null;page=btn.dataset.helpPage;renderDrawer();return;}
  if(btn.dataset.helpFilter){filter=btn.dataset.helpFilter;renderDrawer();return;}
  const action=btn.dataset.helpAction;
  if(action==="all-topics"){selectedTopic=null;page="catalog";renderDrawer();}
  if(action==="start-tour")startTour();
  if(action==="locate"){const t=topic(btn.dataset.helpId);if(t)locate(t);}
  if(action==="exit"){leaveTour();save();}
  if(action==="back"&&active&&mode==="tour"){stepIndex=Math.max(0,stepIndex-1);showStep();}
  if(action==="primary"){
   if(!active)return;
   if(complete&&stepIndex>=HELP_TOUR.length){leaveTour();return;}
   if(mode==="quick"){leaveTour();return;}
   const s=HELP_TOUR[stepIndex];
   if(s.event==="ack"||canUseCurrent(s))advance();
  }
 });
 ui.addEventListener("input",event=>{if(event.target.id==="helpSearch"){search=event.target.value;renderResults();}});
 $("helpDrawerBackdrop").addEventListener("click",hideDrawer);
 document.addEventListener("keydown",event=>{
  if(event.key!=="Escape")return;
  if(active){event.preventDefault();leaveTour();}
  else if(!$("helpDrawer").hidden){event.preventDefault();hideDrawer();}
 });
 // Dialog background trapping; focus remains on live controls during the tour.
 $("helpDrawer").addEventListener("keydown",event=>{
  if(event.key!=="Tab")return;
  const nodes=[...$("helpDrawer").querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(visible);
  if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 function schedulePosition(){if(!active||repositionFrame)return;repositionFrame=requestAnimationFrame(()=>{repositionFrame=0;const s=mode==="tour"?HELP_TOUR[stepIndex]:quick;if(s){const target=findAnchor(s.selector);if(target)updatePosition(s,target);}});}
 window.addEventListener("resize",schedulePosition);
 document.addEventListener("scroll",schedulePosition,true);
 // Only the active real control and help controls may be used during a tour.
 document.addEventListener("click",event=>{
  if(!active||mode!=="tour"||ui.contains(event.target))return;
  const s=HELP_TOUR[stepIndex];
  const target=findAnchor(s.selector);
  if(target&&(event.target===target||target.contains(event.target)))return;
  if(s.event==="plan-imported"&&event.target.closest("#simbriefImportForm"))return;
  if(s.event==="navigation"&&event.target.closest(s.selector))return;
  event.preventDefault();event.stopImmediatePropagation();
 },true);
 return {open:showDrawer,start:startTour,topics:HELP_TOPICS};
}
if(typeof document!=="undefined"){
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initVelocityHelp,{once:true});
 else initVelocityHelp();
}
