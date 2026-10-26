/* Velocity XL — Zen Mission Overview / presentation-only adapter. */
(function zenApp(){
  "use strict";
  // Prevent browser pinch zoom while preserving ordinary one-finger scrolling.
  const preventPinch=(event)=>{if(event.cancelable)event.preventDefault();};
  document.addEventListener("gesturestart",preventPinch,{passive:false});
  document.addEventListener("gesturechange",preventPinch,{passive:false});
  document.addEventListener("touchmove",(event)=>{
    if(event.touches.length>1&&event.cancelable)event.preventDefault();
  },{passive:false});
  // Legacy regression audits continue testing the untouched original modules.
  if(new URLSearchParams(window.location.search).has("auditLegacyUi"))return;
  const $ = (selector) => document.querySelector(selector);
  const icon = (name,cls="") => {
    const paths = {
      plane:'<path d="M2 20 21 3 16 21 11 14 2 20ZM21 3 9 11l2 3"/>',
      route:'<path d="m21 3-8 18-3-7-7-3L21 3Z"/>',
      settings:'<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17-7-2 2m14 0-2-2M7 7 5 5"/>',
      fuel:'<path d="M12 3C9 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-4-7-7-12Z"/><path d="M8.5 16a3.7 3.7 0 0 0 3 3"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
      arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
      info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
      check:'<path d="M8 3h8l5 9-9 9L3 12l5-9Z"/><path d="m9 12 2 2 4-4"/>',
      close:'<path d="M18 6 6 18M6 6l12 12"/>'
    };
    return '<svg class="zen-icon '+cls+'" viewBox="0 0 24 24" aria-hidden="true">'+paths[name]+'</svg>';
  };
  const safe = (text) => String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const art = `<svg class="zen-art" viewBox="0 0 840 690" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="zen-flight-gradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#d1e2ee" stop-opacity=".65"/></linearGradient></defs>
<path fill="url(#zen-flight-gradient)" d="M0 425Q160 450 310 492T620 465T840 430V690H0Z"/>
<g fill="none" stroke="#98b7d0" stroke-width="1">
<path d="M-140 420C-22 344 28 405 85 478S187 545 258 502" opacity=".26"/>
<path d="M-140 451C-22 368 25 433 79 503S194 570 269 528" opacity=".34"/>
<path d="M-140 479C-22 392 16 464 73 524S208 595 284 549" opacity=".42"/>
<path d="M-140 509C-20 412 15 486 74 549S211 624 304 571" opacity=".52"/>
<path d="M-157 541C-28 426 7 508 73 573S223 652 316 597" opacity=".58"/>
<path d="M-166 573C-32 455 -1 538 69 604S228 681 327 629" opacity=".6"/>
<path d="M-185 604C-42 475 -14 562 63 629S236 710 348 658" opacity=".62"/>
<path d="M-207 640C-62 503 -31 589 56 658S254 745 378 688" opacity=".55"/>
<path d="M600 485C684 434 763 450 901 353" opacity=".25"/>
<path d="M581 511C678 463 773 468 909 379" opacity=".32"/>
<path d="M574 540C679 484 782 502 919 401" opacity=".42"/>
<path d="M567 566C687 502 785 529 935 423" opacity=".52"/>
<path d="M550 596C672 522 793 562 948 448" opacity=".6"/>
<path d="M540 623C679 548 803 591 956 478" opacity=".62"/>
<path d="M540 655C685 568 814 617 970 503" opacity=".6"/>
</g></svg>`;
  const root = document.createElement("section");
  root.id="zenShell";
  root.setAttribute("aria-label","Velocity XL Mission Overview");
  root.innerHTML=`<div class="zen-outer"><div class="zen-app">
    ${art}
    <header class="zen-header"><div class="zen-brand">${icon("plane")}VELOCITY XL</div>
      <button class="zen-iconbtn" type="button" data-zen="settings" aria-label="Configurações" title="Configurações">${icon("settings")}</button></header>
    <main class="zen-content">
      <div class="zen-route" id="zenRoute"><span id="zenFrom">—</span>${icon("route")}<span id="zenTo">—</span></div>
      <div id="zenHasPlan" hidden>
        <div class="zen-kicker" id="zenKicker">FL RECOMENDADO</div>
        <div class="zen-level" id="zenAltitude">—</div>
        <div class="zen-mode" id="zenMode">—</div>
        <div class="zen-condition" id="zenCondition" role="status" aria-live="polite"></div>
        <div class="zen-metrics">
          <div class="zen-metric">${icon("fuel")}
            <small class="zen-metric-label" id="zenFuelLabel">COMBUSTÍVEL</small>
            <div class="zen-reading"><strong id="zenFuel">—</strong><small id="zenFuelUnit">GAL</small></div>
          </div>
          <div class="zen-vline"></div>
          <div class="zen-metric">${icon("clock")}
            <small class="zen-metric-label" id="zenTimeUnit">TEMPO</small>
            <div class="zen-reading"><strong id="zenTime">—</strong></div>
          </div>
        </div>
        <div class="zen-main-actions">
          <button class="zen-primary" type="button" data-zen="review" id="zenReview">Revisar voo ${icon("arrow","small")}</button>
          <button class="zen-textbtn" type="button" data-zen="details" id="zenDetails">Detalhes da missão ›</button>
        </div>
      </div>
      <form class="zen-import" id="zenImport" hidden>
        <label><span id="zenImportLabel">Pilot ID / Alias</span>
          <input id="zenPilotId" autocomplete="off" placeholder="123456" required></label>
        <button class="zen-primary" type="submit" id="zenImportButton">Importar OFP ${icon("arrow","small")}</button>
      </form>
      <div class="zen-notice">${icon("info")}<span id="zenCaveat">Terreno e obstáculos não avaliados</span></div>
    </main>
    <div class="zen-drawer-shade" id="zenDrawerShade" hidden></div>
    <aside class="zen-drawer" id="zenDrawer" aria-label="Revisão da missão" hidden>
      <div class="zen-drawer-head"><strong id="zenDrawerTitle">Revisar voo</strong>
      <button class="zen-iconbtn" type="button" data-zen="close-drawer" aria-label="Fechar painel">${icon("close")}</button></div>
      <div class="zen-drawer-content" id="zenDrawerContent"></div>
      <div class="zen-drawer-bottom" id="zenDrawerFooter"></div>
    </aside>
    <div class="zen-modal-shade" id="zenModalShade" hidden>
      <section class="zen-modal" role="alertdialog" aria-modal="true" aria-labelledby="zenModalTitle" aria-describedby="zenModalMessage">
        <div class="zen-modal-icon">${icon("check")}</div>
        <h2 id="zenModalTitle">Aplicar configuração?</h2>
        <p id="zenModalMessage">Confirme a configuração selecionada.</p>
        <div class="zen-modal-details"><strong id="zenModalConfig">—</strong><span style="color:#aebbc7">|</span><span id="zenModalFuel">—</span></div>
        <div class="zen-modal-actions">
          <button class="zen-primary" type="button" data-zen="confirm" id="zenConfirm">Confirmar aplicação</button>
          <button class="zen-secondary" type="button" data-zen="cancel">Cancelar</button>
        </div>
      </section>
    </div>
    <div class="zen-status-toast" id="zenStatusToast" role="status" aria-live="polite" hidden></div>
  </div></div>`;
  document.body.append(root);
  const z=(selector)=>root.querySelector(selector);
  const lang=()=>document.documentElement.lang==="en-US";
  const tr=(pt,en)=>lang()?en:pt;
  let drawer=null,modal=false,selectedKey=null,confirmedKey=null,lastFocus=null;
  let renderQueued=false,optimizationPending=false,autoOptimizationKey=null,optimizationTimer=null;
  let toastTimer=null,previousPlan=null;
  const originalButton=(selector)=>$(selector);
  const hasPlan=()=>Boolean($("#plannerContent")&&!$("#plannerContent").hidden);
  const rawText=(sel)=>$(sel)?.textContent?.trim()||"";
  const parsedFuel=(text)=>{
    const m=text.match(/([+-]?\d[\d.,]*)\s*(GAL|L)\b/i);
    return m?{value:m[1],unit:m[2].toUpperCase()}:{value:"—",unit:"GAL"};
  };
  const presentTime=(text)=>{
    const match=text.match(/^(\d{1,2}):(\d\d)$/);
    return match?String(Number(match[1]))+"h"+match[2]:text||"—";
  };
  const choices=()=>[...document.querySelectorAll("#topLevelCards .top-level-card, #marginalLevels .top-level-card")].map(card=>{
    const fl=String(card.dataset.decisionFl||"");
    const mode=String(card.dataset.decisionMode||"");
    const status=card.querySelector(".top-level-status")?.textContent?.trim()||"—";
    const metrics=[...card.querySelectorAll(".top-level-metrics > span")];
    const metric=(name)=>metrics.find(el=>el.querySelector("b")?.textContent?.trim().toLowerCase()===name)?.querySelector("strong")?.textContent?.trim()||"—";
    return {key:fl+":"+mode,fl:"FL"+Number(fl)/100,mode,status,statusClass:card.querySelector(".top-level-status")?.className||"",
      fuel:metric("combustível")!=="—"?metric("combustível"):metric("fuel"),time:metric("tempo")!=="—"?metric("tempo"):metric("time"),card};
  });
  const autoConfirmed=()=>{
    if($("#pilotDecisionPanel")?.hidden)return null;
    const status=rawText("#decisionAutoStatus");
    if(/desatualiz|stale/i.test(status))return null;
    return status.match(/FL\s?(\d+)\s*·\s*(ECON|NORMAL|FAST)/i);
  };
  function activateOther(area,module){
    closeModal();drawer=null;renderDrawer();window.VelocityLayout?.activate(area,module);
    updateVisible();
  }
  function updateVisible(){
    const active=window.VelocityLayout?.state;
    const zenActive=!active||(active.area==="mission"&&active.module?.mission==="overview");
    document.body.classList.toggle("zen-overview",zenActive);
    // Both approved Zen screens share the app-style viewport lock.
    const onAssessment=active?.area==="mission"&&active.module?.mission==="score";
    const onPlanning=active?.area==="planning"&&active.module?.planning==="config";
    document.documentElement.classList.toggle("zen-locked",zenActive||onAssessment||onPlanning||Boolean(document.body.classList.contains("zen-systems")));
    root.hidden=!zenActive;
    if(!zenActive){closeModal();drawer=null;renderDrawer();}
  }
  function scheduleRender(){
    if(renderQueued)return;
    renderQueued=true;
    requestAnimationFrame(()=>{renderQueued=false;paintMain();if(drawer)renderDrawer();if(modal)paintModal();});
  }
  // GFS/AWC load after the OFP. Never optimize against the provisional
  // SIMBRIEF_ONLY snapshot, or leave that ranking displayed after arrival.
  function scheduleOptimization(){
    if(!hasPlan()||optimizationPending)return;
    const weather=window.VelocityWeather?.getStatus?.();
    if(weather?.loading)return;
    const plan=rawText("#routeTitle")+"|"+rawText("#planTimestamp");
    if(plan!==previousPlan){previousPlan=plan;autoOptimizationKey=null;}
    const status=rawText("#decisionAutoStatus");
    // Match the actual native pt-BR/en-US stale labels, not an invented
    // "stale" translation. The native engine remains the source of truth.
    const stale=/desatualiz|stale|recalcule o ranking|recalculate ranking/i.test(status);
    const ready=$("#pilotDecisionPanel")&&!$("#pilotDecisionPanel").hidden;
    const key=plan+":"+(stale?"stale":"new");
    if(!ready||stale){
      if(autoOptimizationKey===key)return;
      autoOptimizationKey=key;
      clearTimeout(optimizationTimer);
      optimizationTimer=setTimeout(()=>{
        if(!hasPlan()||window.VelocityWeather?.getStatus?.()?.loading){
          autoOptimizationKey=null;
          return;
        }
        const btn=$("#optimizeMission");
        if(!btn||btn.disabled){autoOptimizationKey=null;return;}
        optimizationPending=true;
        btn.click();
        setTimeout(()=>{optimizationPending=false;scheduleRender();},800);
      },180);
    }
  }
  function paintMain(){
    updateVisible();
    const loaded=hasPlan();
    z("#zenHasPlan").hidden=!loaded;
    z("#zenImport").hidden=loaded;
    z("#zenPilotId").value=loaded?"":($("#quickPilotId")?.value||z("#zenPilotId").value);
    z("#zenImportButton").disabled=Boolean($("#importLatest")?.disabled);
    z("#zenImportButton").textContent=$("#importLatest")?.disabled?"…":tr("Importar OFP","Import OFP");
    z("#zenImportLabel").textContent="Pilot ID / Alias";
    const originText=rawText("#routeTitle");
    const split=originText.split(/\s*[→➜]\s*/);
    z("#zenFrom").textContent=loaded?(split[0]||"—"):"—";
    z("#zenTo").textContent=loaded?(split[1]||"—"):"—";
    z("#zenFuelLabel").textContent=tr("COMBUSTÍVEL","FUEL");
    z("#zenTimeUnit").textContent=tr("TEMPO","TIME");
    z("#zenCaveat").textContent=tr("Terreno e obstáculos não avaliados","Terrain and obstacles not assessed");
    if(!loaded){z("#zenRoute").classList.add("zen-empty-route");return;}
    z("#zenRoute").classList.remove("zen-empty-route");
    const applied=/aplicad|applied/i.test(rawText("#kpiLevelMeta"));
    const confirmed=autoConfirmed();
    const altitude=rawText("#kpiAltitude");
    z("#zenKicker").textContent=applied?tr("FL APLICADO","APPLIED FL"):confirmed?tr("FL RECOMENDADO","RECOMMENDED FL"):tr("FL EM ANÁLISE","FL UNDER REVIEW");
    // Never present a provisional/marginal FL as a confirmed recommendation.
    z("#zenAltitude").textContent=(applied||confirmed)?
      ((altitude.match(/FL\\s?(\\d+)/i)||[])[1]||confirmed?.[1]||"—"):"—";
    let mode=applied?rawText("#analysisLevel").match(/(?:ECON|NORMAL|FAST|MANUAL)/)?.[0]:confirmed?.[2];
    if(!mode){mode=rawText("#decisionAutoStatus").match(/\b(ECON|NORMAL|FAST)\b/)?.[0];}
    z("#zenMode").textContent=mode||tr("AGUARDANDO","PENDING");
    const fuel=parsedFuel(rawText("#kpiFuel"));
    z("#zenFuel").textContent=(applied||confirmed)?fuel.value:"—";
    z("#zenFuelUnit").textContent=fuel.unit;
    z("#zenTime").textContent=(applied||confirmed)?presentTime(rawText("#kpiTime")):"—";
    const badge=$("#feasibilityBadge");
    const tone=badge?.classList.contains("unknown")?"unknown":badge?.classList.contains("unavailable")?"danger":badge?.classList.contains("marginal")?"caution":"";
    z("#zenMode").className="zen-mode "+tone;
    const safety=rawText("#feasibilityBadge");
    const diagnostics=rawText("#decisionDiagnostic");
    z("#zenCondition").textContent=(tone||!confirmed)?safety+(diagnostics&&$("#pilotDecisionPanel")&&!$("#pilotDecisionPanel").hidden&&!$("#decisionDiagnostic").hidden?" · "+diagnostics:""):"";
    z("#zenCondition").className="zen-condition "+(tone==="danger"?"danger":tone?"warning":"");
    z("#zenReview").innerHTML=tr("Revisar voo","Review flight")+" "+icon("arrow","small");
    z("#zenDetails").textContent=tr("Detalhes da missão ›","Mission details ›");
    scheduleOptimization();
  }
  function showToast(message){
    z("#zenStatusToast").textContent=message;
    z("#zenStatusToast").hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{z("#zenStatusToast").hidden=true;},2700);
  }
  function openDrawer(next){
    drawer=next;
    if(drawer==="review"){
      const list=choices();
      if(!selectedKey||!list.some(c=>c.key===selectedKey))selectedKey=list[0]?.key||null;
      if(selectedKey&&(!$("#pilotAnalysis")||$("#pilotAnalysis").hidden)){
        const item=list.find(c=>c.key===selectedKey);
        item?.card.click();
      }
    }
    renderDrawer();
    if(drawer)z("#zenDrawer").querySelector(".zen-iconbtn")?.focus();
  }
  function row(label,value){return '<div class="zen-detail"><span>'+safe(label)+'</span><strong>'+safe(value||"—")+'</strong></div>';}
  function renderDrawer(){
    z("#zenDrawerShade").hidden=!drawer;
    z("#zenDrawer").hidden=!drawer;
    if(!drawer)return;
    const list=choices();
    const weather=window.VelocityWeather?.getStatus?.() || {};
    const missingWeather=weather.gfs!=="available"||weather.awc!=="available";
    const refreshLabel=weather.loading?tr("Atualizando meteorologia…","Updating weather…"):
      tr("Atualizar meteorologia","Refresh weather");
    const refreshAction='<button class="zen-textbtn" type="button" data-zen="retry-weather" '+(weather.loading?"disabled":"")+'>'+refreshLabel+'</button>';
    let title="",content="",footer="";
    if(drawer==="review"){
      title=tr("Revisar voo","Review flight");
      if(!list.length){
        const diag=rawText("#decisionDiagnostic");
        content='<div class="zen-smallhead">'+tr("RECOMENDAÇÃO","RECOMMENDATION")+'</div><p class="zen-hint">'+safe(diag||tr("Nenhuma recomendação confirmada. Ajuste a missão ou verifique os dados.","No confirmed recommendation. Adjust the mission or check the data."))+'</p>';
        footer='<button class="zen-primary" type="button" data-zen="retry-weather" '+(weather.loading?"disabled":"")+'>'+refreshLabel+'</button>'+
          '<button class="zen-textbtn" type="button" data-zen="go-planning">'+tr("Ajustar missão","Adjust mission")+'</button>';
      }else{
        if(!list.some(c=>c.key===selectedKey))selectedKey=list[0].key;
        const sel=list.find(c=>c.key===selectedKey);
        const status=rawText("#analysisStatus");
        content='<div class="zen-smallhead">'+tr("ALTITUDES","FLIGHT LEVELS")+'</div>';
        content+=list.map(c=>'<button class="zen-choice '+(c.key===selectedKey?"selected":"")+'" type="button" data-zen="choose" data-choice="'+safe(c.key)+'"><div><strong>'+safe(c.fl)+'</strong><small>'+safe(c.mode)+(list.indexOf(c)===0?" · "+tr("Recomendado","Recommended"):"")+'</small></div><div style="text-align:right"><strong style="font-size:13px">'+safe(c.fuel)+'</strong><small>'+safe(presentTime(c.time))+'</small></div></button>').join("");
        content+='<div class="zen-smallhead" style="margin-top:24px">'+tr("EM ANÁLISE","UNDER REVIEW")+'</div>';
        content+=row(tr("Altitude","Level"),sel.fl)+row(tr("Perfil","Mode"),sel.mode)+row(tr("Combustível","Fuel"),sel.fuel)+row(tr("Tempo","Time"),presentTime(sel.time))+row(tr("Condição","Status"),status||sel.status);
        content+='<p class="zen-hint">'+tr("Confirme restrições operacionais, dados meteorológicos e disponibilidade de oxigênio antes de aplicar.","Review operational restrictions, weather evidence and oxygen before applying.")+'</p>';
        const btn=$("#applyPilotAlternative"), canApply=btn&&!btn.disabled;
        footer='<button class="zen-primary" type="button" data-zen="request-apply" '+(canApply?"":"disabled")+'>'+tr("Aplicar ","Apply ")+safe(sel.fl)+' '+icon("arrow","small")+'</button>';
        if(!canApply)footer+='<p class="zen-hint">'+tr("Configuração bloqueada, não avaliada ou desatualizada.","Configuration blocked, unassessed or stale.")+'</p>';
        if(missingWeather)footer+=refreshAction;
      }
    }else if(drawer==="settings"){
      title=tr("Configurações","Settings");
      const selectedUnit=document.querySelector('[data-fuel-unit].active')?.dataset.fuelUnit||"gal";
      const selectedLanguage=document.documentElement.lang;
      content='<div class="zen-smallhead">'+tr("UNIDADE DE COMBUSTÍVEL","FUEL UNIT")+'</div><div class="zen-toggle">'+["gal","l"].map(u=>'<button type="button" data-zen="fuel-unit" data-unit="'+u+'" class="'+(selectedUnit===u?"selected":"")+'">'+(u==="gal"?"GAL":"L")+'</button>').join("")+'</div>';
      content+='<div class="zen-smallhead">'+tr("IDIOMA","LANGUAGE")+'</div><div class="zen-toggle">'+["pt-BR","en-US"].map(u=>'<button type="button" data-zen="language" data-language="'+u+'" class="'+(selectedLanguage===u?"selected":"")+'">'+(u==="pt-BR"?"PT":"EN")+'</button>').join("")+'</div>';
      content+='<div class="zen-smallhead">'+tr("TELAS","SCREENS")+'</div><div class="zen-quicknav">'+
        [['mission:score',tr("Avaliação","Assessment")],['planning:config',tr("Planejamento","Planning")],['route:overview',tr("Rota e riscos","Route and risks")],['flight:update',tr("Em voo","In flight")]].map(([view,label])=>'<button type="button" data-zen="navigate" data-view="'+view+'">'+label+'</button>').join("")+'</div>';
      footer='<button class="zen-primary" type="button" data-zen="close-drawer">'+tr("Concluir","Done")+'</button>';
    }else{
      title=tr("Detalhes da missão","Mission details");
      content='<div class="zen-smallhead">'+tr("AVALIAÇÃO","ASSESSMENT")+'</div>';
      content+=row(tr("Condição","Status"),rawText("#feasibilityBadge"))+
        row("ICE",rawText("#cruiseIcingValue"))+row("RIDE",rawText("#rideValue"))+
        row(tr("Reserva","Reserve"),rawText("#kpiFuelDelta"))+
        row(tr("Oxigênio","Oxygen"),rawText("#oxygenValue"))+
        row(tr("Terreno e obstáculos","Terrain and obstacles"),tr("Não avaliados","Not assessed"));
      const reasons=rawText("#missionScoreReasons");
      if(reasons)content+='<p class="zen-hint">'+safe(reasons.slice(0,1000))+'</p>';
      content+='<div class="zen-smallhead" style="margin-top:24px">'+tr("FONTES METEOROLÓGICAS","WEATHER SOURCES")+'</div>';
      content+=row("GFS",weather.loading?tr("Atualizando…","Updating…"):weather.gfs||"—");
      content+=row("AWC",weather.loading?tr("Atualizando…","Updating…"):weather.awc||"—");
      if(weather.gfsReason)content+='<p class="zen-hint">GFS: '+safe(weather.gfsReason)+'</p>';
      if(weather.awcReason)content+='<p class="zen-hint">AWC: '+safe(weather.awcReason)+'</p>';
      footer='<button class="zen-primary" type="button" data-zen="retry-weather" '+(weather.loading?"disabled":"")+'>'+refreshLabel+'</button>'+
        '<button class="zen-textbtn" type="button" data-zen="go-assessment">'+tr("Avaliação completa","Full assessment")+' '+icon("arrow","small")+'</button>';
    }
    z("#zenDrawerTitle").textContent=title;
    z("#zenDrawerContent").innerHTML=content;
    z("#zenDrawerFooter").innerHTML=footer;
  }
  function selectChoice(key){
    const c=choices().find(item=>item.key===key);
    if(!c)return;
    selectedKey=key;
    c.card.click();
    renderDrawer();
  }
  function openModal(){
    const c=choices().find(item=>item.key===selectedKey);
    const native=$("#applyPilotAlternative");
    if(!c||!native||native.disabled){showToast(tr("Configuração indisponível.","Configuration unavailable."));return;}
    confirmedKey=c.key;
    modal=true;
    lastFocus=document.activeElement;
    paintModal();
    z("#zenModalShade").hidden=false;
    z("#zenConfirm").focus();
  }
  function paintModal(){
    if(!modal)return;
    const c=choices().find(item=>item.key===confirmedKey);
    if(!c){closeModal();return;}
    z("#zenModalTitle").textContent=tr("Aplicar ","Apply ")+c.fl+"?";
    z("#zenModalMessage").textContent=(c.statusClass.includes("marginal")?
      tr("Alternativa marginal. Confira as restrições antes de confirmar.","Marginal alternative. Check limitations before confirming."):
      tr("Confirme a configuração selecionada.","Confirm the selected configuration."));
    z("#zenModalConfig").textContent=c.fl+" · "+c.mode;
    z("#zenModalFuel").textContent=c.fuel;
    z("#zenConfirm").textContent=tr("Confirmar aplicação","Confirm application");
  }
  function closeModal(){
    if(!modal)return;
    modal=false;confirmedKey=null;
    z("#zenModalShade").hidden=true;
    if(lastFocus?.isConnected)lastFocus.focus();
  }
  function confirmApply(){
    const c=choices().find(item=>item.key===confirmedKey);
    const native=$("#applyPilotAlternative");
    if(!c||!native||native.disabled||selectedKey!==confirmedKey){
      closeModal();showToast(tr("Revisão desatualizada; escolha novamente.","Review outdated; choose again."));return;
    }
    // The existing engine owns eligibility, marginal double-confirmation and persistence.
    native.click();
    if(c.statusClass.includes("marginal")&&!native.disabled)native.click();
    const applied=/aplicad|applied/i.test(rawText("#kpiLevelMeta"));
    closeModal();
    if(applied){drawer=null;renderDrawer();showToast(tr("Configuração aplicada","Configuration applied"));}
    else showToast(tr("Verifique as restrições antes de aplicar.","Review restrictions before applying."));
    scheduleRender();
  }
  root.addEventListener("submit",event=>{
    if(event.target.id!=="zenImport")return;
    event.preventDefault();
    const pilot=z("#zenPilotId").value.trim();
    if(!pilot){z("#zenPilotId").focus();return;}
    const input=$("#quickPilotId"),form=$("#simbriefImportForm");
    if(!input||!form)return;
    input.value=pilot;
    form.requestSubmit();
    scheduleRender();
  });
  root.addEventListener("click",event=>{
    const btn=event.target.closest("[data-zen]");
    if(!btn)return;
    const act=btn.dataset.zen;
    if(act==="settings")openDrawer("settings");
    else if(act==="review")openDrawer("review");
    else if(act==="details")openDrawer("details");
    else if(act==="close-drawer"){drawer=null;renderDrawer();}
    else if(act==="choose")selectChoice(btn.dataset.choice);
    else if(act==="request-apply")openModal();
    else if(act==="confirm")confirmApply();
    else if(act==="cancel")closeModal();
    else if(act==="retry-weather"){
      if(window.VelocityWeather?.retry?.()){
        showToast(tr("Atualizando meteorologia…","Updating weather…"));
        renderDrawer();
      }else showToast(tr("Importe um voo primeiro.","Import a flight first."));
    }
    else if(act==="go-planning")activateOther("planning","config");
    else if(act==="go-assessment")activateOther("mission","score");
    else if(act==="navigate"){const [area,module]=btn.dataset.view.split(":");activateOther(area,module);}
    else if(act==="fuel-unit"){document.querySelector('[data-fuel-unit="'+btn.dataset.unit+'"]')?.click();renderDrawer();}
    else if(act==="language"){document.querySelector('[data-language="'+btn.dataset.language+'"]')?.click();setTimeout(()=>{scheduleRender();renderDrawer();},0);}
  });
  z("#zenDrawerShade").addEventListener("click",()=>{drawer=null;renderDrawer();});
  z("#zenModalShade").addEventListener("click",event=>{if(event.target===z("#zenModalShade"))closeModal();});
  document.addEventListener("keydown",event=>{
    if(event.key!=="Escape"||root.hidden)return;
    if(modal){event.preventDefault();closeModal();}
    else if(drawer){event.preventDefault();drawer=null;renderDrawer();}
  });
  document.addEventListener("click",event=>{
    if(event.target.closest('[data-area-button],[data-module-button],[data-open-module]')){
      queueMicrotask(updateVisible);
    }
  });
  // Original app owns data; observe only its existing nodes, never the Zen mirror.
  const target=$("#top");
  if(target)new MutationObserver(scheduleRender).observe(target,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["hidden","disabled","class","aria-busy"]});
  window.addEventListener("velocityxl:weather-status",()=>{
    // A newer weather snapshot invalidates the old recommendation even
    // when the same route and OFP remain loaded.
    if(!window.VelocityWeather?.getStatus?.()?.loading)autoOptimizationKey=null;
    if(drawer)renderDrawer();
    scheduleRender();
  });
  window.addEventListener("load",scheduleRender);
  paintMain();
})();
