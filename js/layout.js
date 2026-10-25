/* Quiet Cockpit: presentation owns placement; app.js owns the operational state. */
(() => {
  const $=s=>document.querySelector(s), content=$('#plannerContent'), nav=$('#areaNav');
  if(!content||!nav)return;
  const copy={
    'pt-BR':{plan:'Plano',route:'Rota',flight:'Em voo',back:'Voltar',overview:'Missão',score:'Mission Score',compare:'Comparar níveis',config:'Cruzeiro',fuel:'Combustível',wb:'Weight & Balance',oxygen:'Oxigênio',cost:'Custo',resilience:'Resilience Lab',meteo:'METEO',ice:'ICE',ride:'RIDE',etp:'ETP / PNR',alternate:'Alternado / Desvio',glide:'GLIDE',steps:'Step Climb',tracker:'Virtual Tracker',update:'Atualização manual',calibration:'Calibração K1 / K2',history:'Histórico',noPlan:'Importe um OFP para começar.',apply:'Aplicar perfil',trip:'Trip Fuel',margin:'Margem',range:'Alcance',details:'Detalhes',position:'Posição no OFP',from:'Desde',to:'Até',save:'Salvar checkpoint',observedFuel:'Fuel observado',selected:'Perfil da missão',settings:'Preferências',routeUnavailable:'Posição não avaliada'},
    'en-US':{plan:'Plan',route:'Route',flight:'In flight',back:'Back',overview:'Mission',score:'Mission Score',compare:'Compare levels',config:'Cruise',fuel:'Fuel',wb:'Weight & Balance',oxygen:'Oxygen',cost:'Cost',resilience:'Resilience Lab',meteo:'METEO',ice:'ICE',ride:'RIDE',etp:'ETP / PNR',alternate:'Alternate / Diversion',glide:'GLIDE',steps:'Step Climb',tracker:'Virtual Tracker',update:'Manual update',calibration:'Calibration K1 / K2',history:'History',noPlan:'Import an OFP to begin.',apply:'Apply profile',trip:'Trip Fuel',margin:'Margin',range:'Range',details:'Details',position:'OFP position',from:'From',to:'To',save:'Save checkpoint',observedFuel:'Observed fuel',selected:'Mission profile',settings:'Preferences',routeUnavailable:'Position unassessed'}
  };
  const text=k=>(copy[document.documentElement.lang]||copy['pt-BR'])[k]||k;
  const label=k=>`<span data-layout-text="${k}">${text(k)}</span>`;
  const icon=k=>`<i data-lucide="${k}" aria-hidden="true"></i>`;
  const preferences=document.createElement('details');preferences.className='app-preferences';preferences.innerHTML=`<summary>${icon('settings-2')}${label('settings')}</summary>`;const toolbar=$('.app-toolbar');toolbar.before(preferences);preferences.append(toolbar);
  // Retain SimBrief import on the first visit; collapse it to one unobtrusive action after import.
  const importDisclosure=document.createElement('details');
  importDisclosure.className='ofp-reimport';
  importDisclosure.innerHTML=`<summary>${icon('refresh-cw')}${label('importLatest')}</summary>`;
  const importForm=$('#simbriefImportForm');
  importForm.before(importDisclosure);
  importDisclosure.append(importForm);
  const syncImport=()=>{importDisclosure.open=content.hidden;importDisclosure.classList.toggle('ofp-loaded',!content.hidden);};
  new MutationObserver(syncImport).observe(content,{attributes:true,attributeFilter:['hidden']});
  syncImport();
  const panelMap=new Map(), areaMap=new Map();
  const areas=[['plan','sliders-horizontal',['overview','score','compare','config','fuel','wb','oxygen','cost','resilience']],['route','route',['overview','meteo','ice','ride','etp','alternate','glide','steps']],['flight','radio-tower',['overview','update','calibration','history']]];
  const noPlan=document.createElement('p');noPlan.className='no-plan-state';noPlan.dataset.layoutText='noPlan';noPlan.textContent=text('noPlan');content.before(noPlan);
  const mobileNav=document.createElement('nav');mobileNav.className='mobile-area-nav';mobileNav.setAttribute('aria-label','Áreas principais');document.body.append(mobileNav);
  for(const [area,glyph,modules] of areas){
    for(const host of [nav,mobileNav])host.insertAdjacentHTML('beforeend',`<button type="button" data-area-button="${area}">${icon(glyph)}${label(area)}</button>`);
    const section=document.createElement('section');section.className='app-area';section.dataset.areaPanel=area;
    section.innerHTML=`<header class="area-heading"><button class="text-button context-back" type="button" data-back>${icon('arrow-left')}${label('back')}</button><h1 data-area-title>${text(area)}</h1></header>`;
    content.append(section);areaMap.set(area,section);
    for(const key of modules){const panel=document.createElement('section');panel.className='app-module';panel.dataset.modulePanel=`${area}:${key}`;section.append(panel);panelMap.set(`${area}:${key}`,panel);}
  }
  const get=k=>panelMap.get(k);
  function move(s,key){const el=$(s);if(el)get(key).append(el);return el;}
  function moduleList(key,items){const list=document.createElement('div');list.className='module-list';for(const [module,glyph] of items)list.insertAdjacentHTML('beforeend',`<button type="button" data-open-module="${key.split(':')[0]}:${module}" class="module-link">${icon(glyph)}${label(module)}<strong data-module-summary="${module}"></strong>${icon('chevron-right')}</button>`);get(key).append(list);}
  get('plan:overview').innerHTML=`<article class="panel essential-mission" id="essentialMission"><div class="essential-identity"><div id="essentialLevelHost"></div><button class="score-reading" type="button" data-open-module="plan:score" aria-label="Mission Score"><span>SCORE</span><strong id="essentialScore">—</strong></button></div><div class="essential-metrics"><div><span>ETE</span><strong id="essentialTime">—</strong></div><div>${label('trip')}<strong id="essentialTrip">—</strong></div><div>${label('margin')}<strong id="essentialMargin">—</strong></div></div><div class="essential-state"><strong id="essentialStatus" role="status">—</strong><span id="essentialMode">—</span></div><p id="essentialBlocker"></p><button id="essentialApply" class="primary-button" type="button" disabled>${label('apply')}</button><button class="text-button essential-reveal" type="button" data-open-module="plan:compare">${label('compare')} · ${label('config')}${icon('chevron-down')}</button></article>`;
  $('#essentialLevelHost').append($('#kpiSelectedLevel'));
  const scorePanel=move('.mission-score-panel','plan:score');
  // Comparison and configuration share one destination without duplicating controls.
  const compareModule=get('plan:compare');
  compareModule.insertAdjacentHTML('beforeend',`<button class="text-button essential-compare-config" type="button" data-open-module="plan:config">${icon('sliders-horizontal')}${label('config')}${icon('chevron-right')}</button>`);
  move('.mission-strip','plan:score');
  move('#pilotDecisionPanel','plan:compare');
  const controls=move('.controls-panel','plan:config');
  // Payload remains individual W&B stations; the legacy aggregate control stays in technical details.
  const payload=controls.querySelector('#payloadInput').closest('label');
  const detail=document.createElement('details');detail.className='technical-details';detail.innerHTML=`<summary>${text('details')}</summary>`;detail.append(payload);controls.append(detail);
  const fuelDetails=document.createElement('details');fuelDetails.className='technical-details';fuelDetails.innerHTML=`<summary>${text('details')}</summary>`;get('plan:fuel').append(fuelDetails);fuelDetails.append($('.fuel-panel'));
  $('.mode-control').insertAdjacentHTML('beforeend','<button type="button" id="quietManualPower">MANUAL</button>');
  for(const id of ['fuelInput','reserveInput']){const field=$('#'+id)?.closest('label');if(field)get('plan:fuel').prepend(field);}
  const reserveSummary=document.createElement('div');reserveSummary.id='essentialFuelMetrics';reserveSummary.className='essential-metrics';get('plan:fuel').append(reserveSummary);
  const toolAreas={wb:'plan',oxygen:'plan',cost:'plan',ice:'route',ride:'route',etp:'route',alternate:'route',glide:'route',steps:'route'};
  for(const [key,area] of Object.entries(toolAreas)){const panel=move(`[data-tool-panel="${key}"]`,`${area}:${key}`);if(panel){panel.hidden=false;panel.classList.add('active');panel.setAttribute('aria-label',text(key));}}
  // Keep the full station table under explicit disclosure.
  const stations=$('.wb-stations');if(stations){const d=document.createElement('details');d.className='technical-details';d.innerHTML=`<summary>${text('details')}</summary>`;stations.before(d);d.append(stations,$('.wb-kpis'),$('#randomizeWeightBalance'));}
  const wbLayout=$('.wb-layout');
  const wbCorridor=wbLayout?.querySelector('.wb-chart-card');
  if(wbLayout&&wbCorridor)wbLayout.prepend(wbCorridor);
  // Primary risk signal stays visible; technical evidence stays accessible without dominating the page.
  for(const risk of ['ice','ride']){
    const node=$('.'+risk+'-module');
    const decisions=node?.querySelector('.'+risk+'-decision-grid');
    const focus=decisions?.querySelector(':scope > div:first-child');
    if(node&&decisions&&focus){
      focus.classList.add('qc-risk-focus');
      node.querySelector('.'+risk+'-index-track')?.after(focus);
      const more=document.createElement('details');
      more.className='technical-details qc-advanced';
      more.innerHTML=`<summary>${text('details')}</summary>`;
      const selectors=risk==='ice'?['.ice-decision-grid','.ice-route-window','.ice-module-grid','.ice-composition']:['.ride-preference','.ride-decision-grid','.ride-route-window','.ride-module-grid'];
      for(const selector of selectors){const element=node.querySelector(selector);if(element)more.append(element);}
      node.append(more);
    }
  }
  const wbFuel=document.createElement('label');wbFuel.className='ui-field';wbFuel.innerHTML=`${label('fuel')}<span class="ui-unit-input"><input id="wbFuelOnboard" type="number" min="0" step="0.1"/><small data-essential-fuel-unit>gal</small></span>`;$('.wb-inputs').append(wbFuel);
  moduleList('plan:overview',[['fuel','fuel'],['wb','scale'],['oxygen','heart-pulse'],['cost','dollar-sign'],['resilience','layers']]);
  get('plan:resilience').innerHTML='<section class="panel" id="resilienceLab"></section>';
  get('route:overview').innerHTML='<article class="panel" id="missionProfilePanel"></article>';
  // IDs remain for existing route renderers; the meaningful ribbon is generated from the solved trajectory.
  get('route:meteo').innerHTML='<article class="panel"><h2>METEO</h2><div id="essentialWeather"></div><div id="layoutRouteMeta"></div><div id="layoutRouteRail" class="route-rail"></div></article>';
  moduleList('route:overview',[['meteo','cloud-sun'],['ice','snowflake'],['ride','waves'],['etp','route'],['alternate','map-pin'],['glide','wind'],['steps','trending-up']]);
  get('flight:overview').innerHTML='<article class="panel" id="essentialTracker"></article>';
  moduleList('flight:overview',[['update','map-pin'],['calibration','sliders-horizontal'],['history','history']]);
  // Split position observation and the paired TAS/FF capture, keeping one operational submission contract.
  const flight=move('#manualFlightPanel','flight:update');
  const form=$('#manualUpdateForm');
  const calibration=document.createElement('form');calibration.id='essentialCalibrationForm';calibration.className='panel calibration-fields';
  calibration.innerHTML='<h2 data-layout-text="calibration">Calibração K1 / K2</h2><p id="essentialCalibrationGate" role="status"></p>';
  for(const id of ['observedTas','observedFuelFlow'])calibration.append($('#'+id).closest('label'));
  calibration.insertAdjacentHTML('beforeend','<button class="primary-button" id="essentialCalibrate" type="submit">Calibration</button>');
  get('flight:calibration').append(calibration,$('.calibration-state'));
  // Original hidden selects retain the precise operational calibration context.
  const selectors=document.createElement('div');selectors.hidden=true;for(const id of ['manualWaypoint','manualAltitude'])selectors.append($('#'+id).closest('label'));form.prepend(selectors);
  const position=document.createElement('section');position.className='position-editor';position.innerHTML=`<div class="shared-card-head">${label('position')}<strong id="essentialPercent">—</strong></div><label class="position-slider"><span class="sr-only" data-layout-text="position">${text('position')}</span><input id="essentialPosition" type="range" min="0" max="0" step="any" disabled/></label><div class="position-distance" id="essentialDistance">—</div><div class="position-waypoints"><button class="text-button" type="button" id="essentialPrevious">—</button><span>→</span><button class="text-button" type="button" id="essentialNext">—</button></div><div class="essential-metrics"><div>${label('from')}<strong id="essentialFrom">—</strong></div><div>${label('to')}<strong id="essentialTo">—</strong></div><div><span>ETE</span><strong id="essentialEte">—</strong></div></div><p id="essentialPositionStatus" role="status"></p>`;form.prepend(position);
  $('#manualFuel').closest('label').querySelector('span:first-child').removeAttribute('data-i18n');$('#manualFuel').closest('label').querySelector('span:first-child').dataset.layoutText='observedFuel';
  const submit=$('#submitFlightUpdate');submit.removeAttribute('data-i18n');const actions=document.createElement('div');actions.className='checkpoint-action';actions.append(submit);form.append(actions);
  get('flight:history').innerHTML='<article class="panel"><h2 data-layout-text="history">Histórico</h2><div id="essentialHistory"></div></article>';
  const vault=document.createElement('div');vault.hidden=true;vault.id='presentationVault';content.append(vault);
  fuelDetails.append($('.kpi-grid'));vault.append($('#optimizeMission'));
  // Source wrappers are now empty; their controls/results have moved, never cloned.
  $('.flight-tools-panel')?.remove();$('.dashboard-grid')?.remove();
  const componentKinds=[['.primary-button', 'ui-button ui-button--primary'],['.text-button', 'ui-button ui-button--outline'],['.panel','ui-card ui-card--summary'],['.tool-view','ui-card ui-card--technical']];
  for(const [selector,names]of componentKinds)document.querySelectorAll(selector).forEach(el=>el.classList.add(...names.split(' ')));
  const state={area:'plan',module:{plan:'overview',route:'overview',flight:'overview'}};
  function activate(area,module=state.module[area]){
    // Compatibility for engine-owned navigation, without exposing a fourth area.
    if(area==='mission'){area='plan';module=module==='overview'?'overview':'score';}
    if(area==='planning'){area='plan';module=({config:'config',systems:'wb',analyses:'cost'})[module]||module;}
    if(!areaMap.has(area))return;
    if(!panelMap.has(`${area}:${module}`))module='overview';
    state.area=area;state.module[area]=module;document.body.dataset.activeModule=`${area}:${module}`;
    for(const [key,node]of areaMap)node.hidden=key!==area;
    for(const [key,node]of panelMap)node.hidden=key!==`${area}:${module}`;
    document.querySelectorAll('[data-area-button]').forEach(b=>{const active=b.dataset.areaButton===area;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    const section=areaMap.get(area);section.querySelector('[data-area-title]').textContent=text(module==='overview'?area:module);section.querySelector('[data-back]').hidden=module==='overview';
    window.scrollTo({top:0,behavior:'instant'});window.lucide?.createIcons();
    document.dispatchEvent(new CustomEvent('velocity:navigate',{detail:{area,module}}));
  }
  function translate(){document.querySelectorAll('[data-layout-text]').forEach(el=>el.textContent=text(el.dataset.layoutText));for(const [area,section]of areaMap)section.querySelector('[data-area-title]').textContent=text(state.module[area]==='overview'?area:state.module[area]);nav.setAttribute('aria-label',text('overview'));mobileNav.setAttribute('aria-label',text('overview'));}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-area-button],[data-open-module],[data-back]');if(!b)return;if(b.hasAttribute('data-back'))activate(state.area,'overview');else if(b.dataset.areaButton)activate(b.dataset.areaButton);else{const [a,m]=b.dataset.openModule.split(':');activate(a,m);}});
  window.VelocityLayout={activate,translate,state,text};activate('plan');
})();
