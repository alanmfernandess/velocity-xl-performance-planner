/* Quiet Cockpit: presentation owns placement; app.js owns the operational state. */
(() => {
  const $=s=>document.querySelector(s), content=$('#plannerContent'), nav=$('#areaNav');
  if(!content||!nav)return;
  const copy={
    'pt-BR':{plan:'Plano',route:'Rota',flight:'Em voo',back:'Voltar',import:'OFP',register:'Registrar',adjust:'Ajustar',overview:'Missão',score:'Mission Score',compare:'Níveis',config:'Ajustes',fuel:'Combustível',wb:'Weight & Balance',oxygen:'Oxigênio',cost:'Custo',resilience:'Resilience Lab',meteo:'METEO',ice:'ICE',ride:'RIDE',etp:'ETP / PNR',alternate:'Alternado / Desvio',glide:'GLIDE',steps:'Step Climb',tracker:'Virtual Tracker',update:'Checkpoint',calibration:'Calibração',history:'Histórico',noPlan:'Importe um OFP para começar.',apply:'Aplicar perfil',trip:'Trip Fuel',margin:'Margem',range:'Alcance',details:'Detalhes',position:'Posição no OFP',from:'Desde',to:'Até',save:'Salvar checkpoint',observedFuel:'Fuel observado',selected:'Perfil da missão',settings:'Preferências',routeUnavailable:'Posição não avaliada'},
    'en-US':{plan:'Plan',route:'Route',flight:'In flight',back:'Back',import:'OFP',register:'Record',adjust:'Adjust',overview:'Mission',score:'Mission Score',compare:'Levels',config:'Adjust',fuel:'Fuel',wb:'Weight & Balance',oxygen:'Oxygen',cost:'Cost',resilience:'Resilience Lab',meteo:'METEO',ice:'ICE',ride:'RIDE',etp:'ETP / PNR',alternate:'Alternate / Diversion',glide:'GLIDE',steps:'Step Climb',tracker:'Virtual Tracker',update:'Checkpoint',calibration:'Calibration',history:'History',noPlan:'Import an OFP to begin.',apply:'Apply profile',trip:'Trip Fuel',margin:'Margin',range:'Range',details:'Details',position:'OFP position',from:'From',to:'To',save:'Save checkpoint',observedFuel:'Observed fuel',selected:'Mission profile',settings:'Preferences',routeUnavailable:'Position unassessed'}
  };
  const text=k=>(copy[document.documentElement.lang]||copy['pt-BR'])[k]||k;
  const label=k=>`<span data-layout-text="${k}">${text(k)}</span>`;
  const icon=k=>`<i data-lucide="${k}" aria-hidden="true"></i>`;
  const toolbar=$('.app-toolbar');toolbar.hidden=true;
  const preferences=document.createElement('section');preferences.id='focoPreferences';preferences.className='foco-page';preferences.hidden=true;
  preferences.innerHTML=`<header class="area-heading"><button class="text-button context-back" type="button" data-preferences-close aria-label="${text('back')}">${icon('arrow-left')}</button><h1 data-layout-text="settings">${text('settings')}</h1></header><form class="foco-preferences-form"><label class="ui-field"><span data-preference-label="weight">Peso</span><select data-preference="weight-unit"><option value="lb">LB</option><option value="kg">KG</option></select></label><label class="ui-field"><span>Fuel</span><select data-preference="fuel-unit"><option value="gal">GAL</option><option value="l">L</option></select></label><label class="ui-field"><span data-preference-label="font">Texto</span><select data-preference="font-size"><option value="small">A−</option><option value="normal">A</option><option value="large">A+</option></select></label><label class="ui-field"><span data-preference-label="language">Idioma</span><select data-preference="language"><option value="pt-BR">PT</option><option value="en-US">EN</option></select></label><button class="primary-button" type="submit" data-preferences-save>Guardar</button></form>`;
  $('.shell').prepend(preferences);
  const preferencesButton=document.createElement('button');preferencesButton.type='button';preferencesButton.className='foco-preferences-button';preferencesButton.dataset.preferencesOpen='';preferencesButton.setAttribute('aria-label',text('settings'));preferencesButton.innerHTML=icon('sliders-horizontal');$('.topbar').append(preferencesButton);
  $('.brand').innerHTML='<strong>VX / XL</strong>';$('.brand').dataset.openImport='';$('.brand').setAttribute('aria-label','Velocity XL · OFP');
  const panelMap=new Map(), areaMap=new Map();
  const areas=[['plan','sliders-horizontal',['overview','score','compare','config','fuel','wb','oxygen','cost','resilience']],['route','route',['overview','meteo','ice','ride','etp','alternate','glide','steps']],['flight','navigation',['overview','update','calibration','history']]];
  const noPlan=document.createElement('p');noPlan.className='no-plan-state';noPlan.dataset.layoutText='noPlan';noPlan.textContent=text('noPlan');content.before(noPlan);
  const mobileNav=document.createElement('nav');mobileNav.className='mobile-area-nav';mobileNav.setAttribute('aria-label','Áreas principais');document.body.append(mobileNav);
  for(const [area,glyph,modules] of areas){
    for(const host of [nav,mobileNav])host.insertAdjacentHTML('beforeend',`<button type="button" data-area-button="${area}">${icon(glyph)}${label(area)}</button>`);
    const section=document.createElement('section');section.className='app-area';section.dataset.areaPanel=area;
    section.innerHTML=`<header class="area-heading"><button class="text-button context-back" type="button" data-back aria-label="${text('back')}">${icon('arrow-left')}</button><h1 data-area-title>${text(area)}</h1></header>`;
    content.append(section);areaMap.set(area,section);
    for(const key of modules){const panel=document.createElement('section');panel.className='app-module';panel.dataset.modulePanel=`${area}:${key}`;section.append(panel);panelMap.set(`${area}:${key}`,panel);}
  }
  const get=k=>panelMap.get(k);
  function move(s,key){const el=$(s);if(el)get(key).append(el);return el;}
  function moduleList(key,items){const list=document.createElement('div');list.className='module-list';for(const [module,glyph] of items)list.insertAdjacentHTML('beforeend',`<button type="button" data-open-module="${key.split(':')[0]}:${module}" class="module-link">${icon(glyph)}${label(module)}<strong data-module-summary="${module}"></strong>${icon('chevron-right')}</button>`);get(key).append(list);}
  get('plan:overview').innerHTML=`<article class="panel essential-mission" id="essentialMission"><div class="essential-identity"><div id="essentialLevelHost"></div><button class="score-reading" type="button" data-open-module="plan:score"><span>SCORE</span><strong id="essentialScore">—</strong></button></div><div class="essential-state"><strong id="essentialStatus" role="status">—</strong><span id="essentialMode">—</span></div><p id="essentialBlocker"></p><div class="essential-metrics"><div><span>ETE</span><strong id="essentialTime">—</strong></div><div>${label('trip')}<strong id="essentialTrip">—</strong></div><div>${label('margin')}<strong id="essentialMargin">—</strong></div></div><button id="essentialApply" class="primary-button" type="button" disabled>${label('apply')}</button><div class="essential-secondary"><button class="text-button" type="button" data-open-module="plan:compare"><span data-foco-copy="compare">Comparar</span></button><button class="text-button" type="button" data-open-module="plan:config">${label('adjust')}${icon('sliders-horizontal')}</button></div></article>`;
  $('#essentialLevelHost').append($('#kpiSelectedLevel'));
  const scorePanel=move('.mission-score-panel','plan:score');
  move('.mission-strip','plan:score');
  move('#pilotDecisionPanel','plan:compare');
  const controls=move('.controls-panel','plan:config');
  // Payload remains individual W&B stations; the legacy aggregate control stays in technical details.
  const payload=controls.querySelector('#payloadInput').closest('label');
  const detail=document.createElement('details');detail.className='technical-details';detail.innerHTML=`<summary>${text('details')}</summary>`;detail.append(payload);controls.append(detail);
  const fuelDetails=document.createElement('details');fuelDetails.className='technical-details';fuelDetails.innerHTML=`<summary>${text('details')}</summary>`;get('plan:fuel').append(fuelDetails);fuelDetails.append($('.fuel-panel'));
  $('.mode-control').insertAdjacentHTML('beforeend','<button type="button" id="quietManualPower">MANUAL</button>');
  for(const id of ['fuelInput','reserveInput']){const field=$('#'+id)?.closest('label');if(field)get('plan:fuel').prepend(field);}
  $('#reserveInput').closest('label').classList.remove('select-control');
  const fuelField=$('#fuelInput').closest('label'),fuelInput=$('#fuelInput');toolbar.append($('#fuelOutput'));fuelField.replaceChildren();fuelField.className='ui-field';fuelField.innerHTML='<span data-foco-fuel-label>A bordo · gal</span>';fuelInput.type='number';fuelInput.step='0.1';fuelInput.inputMode='decimal';fuelField.append(fuelInput);
  const reserveSummary=document.createElement('div');reserveSummary.id='essentialFuelMetrics';reserveSummary.className='essential-metrics';get('plan:fuel').append(reserveSummary);
  const toolAreas={wb:'plan',oxygen:'plan',cost:'plan',ice:'route',ride:'route',etp:'route',alternate:'route',glide:'route',steps:'route'};
  for(const [key,area] of Object.entries(toolAreas)){const panel=move(`[data-tool-panel="${key}"]`,`${area}:${key}`);if(panel){panel.hidden=false;panel.classList.add('active');panel.setAttribute('aria-label',text(key));}}
  // Keep the full station table under explicit disclosure.
  const stations=$('.wb-stations');if(stations){const d=document.createElement('details');d.className='technical-details';d.innerHTML=`<summary>${text('details')}</summary>`;stations.before(d);d.append(stations,$('.wb-kpis'),$('#randomizeWeightBalance'));}
  const wbFuel=document.createElement('label');wbFuel.className='ui-field';wbFuel.innerHTML=`${label('fuel')}<span class="ui-unit-input"><input id="wbFuelOnboard" type="number" min="0" step="0.1"/><small data-essential-fuel-unit>gal</small></span>`;$('.wb-inputs').append(wbFuel);
  const dock=document.createElement('div');dock.className='foco-tool-dock';dock.innerHTML=[['wb','scale','W&B'],['oxygen','heart-pulse','O₂'],['fuel','fuel','Fuel'],['cost','dollar-sign','Custo']].map(([key,glyph,name])=>`<button type="button" data-open-module="plan:${key}">${icon(glyph)}<span ${key==='cost'?'data-layout-text="cost"':''}>${name}</span></button>`).join('');get('plan:overview').append(dock);
  moduleList('plan:config',[['fuel','fuel'],['wb','scale'],['oxygen','heart-pulse'],['cost','dollar-sign'],['resilience','layers']]);
  get('plan:resilience').innerHTML='<section class="panel" id="resilienceLab"></section>';
  get('route:overview').innerHTML='<article class="panel" id="missionProfilePanel"></article>';
  // IDs remain for existing route renderers; the meaningful ribbon is generated from the solved trajectory.
  get('route:meteo').innerHTML='<article class="panel"><h2>METEO</h2><div id="essentialWeather"></div><div id="layoutRouteMeta"></div><div id="layoutRouteRail" class="route-rail"></div></article>';
  for(const [title,items]of [['Trechos',[['meteo','cloud-sun'],['ice','snowflake'],['ride','waves']]],['Decisões',[['etp','route'],['alternate','map-pin'],['glide','wind'],['steps','trending-up']]]]){const d=document.createElement('details');d.className='technical-details foco-route-disclosure';d.innerHTML=`<summary data-route-disclosure="${title}">${title}${icon('plus')}</summary>`;get('route:overview').append(d);moduleList('route:overview',items);d.append(get('route:overview').lastElementChild);}
  get('flight:overview').innerHTML='<article class="panel" id="essentialTracker"></article>';
  moduleList('flight:overview',[['update','map-pin'],['calibration','sliders-horizontal'],['history','history']]);const checkpointLink=get('flight:overview').querySelector('[data-open-module="flight:update"]');checkpointLink.className='primary-button foco-checkpoint-link';checkpointLink.innerHTML=label('update')+icon('plus');
  // Split position observation and the paired TAS/FF capture, keeping one operational submission contract.
  const flight=move('#manualFlightPanel','flight:update');
  const form=$('#manualUpdateForm');
  const calibration=document.createElement('form');calibration.id='essentialCalibrationForm';calibration.className='panel calibration-fields';
  calibration.innerHTML='<p id="focoCalibrationContext"></p><p id="essentialCalibrationGate" role="status"></p>';
  for(const id of ['observedTas','observedFuelFlow']){const field=$('#'+id).closest('label'),prefix=field.firstElementChild;prefix.removeAttribute('data-i18n');prefix.textContent=id==='observedTas'?'TAS':'Fuel Flow';field.classList.add('foco-inline-field');field.querySelector('.ui-unit-input').prepend(prefix);calibration.append(field);}
  calibration.insertAdjacentHTML('beforeend','<button class="primary-button" id="essentialCalibrate" type="submit">Calibration</button>');
  get('flight:calibration').append(calibration);const calibrationDetails=document.createElement('details');calibrationDetails.className='technical-details';calibrationDetails.innerHTML=`<summary>${text('details')}</summary>`;calibrationDetails.append($('.calibration-state'));get('flight:calibration').append(calibrationDetails);
  // Original hidden selects retain the precise operational calibration context.
  const selectors=document.createElement('div');selectors.hidden=true;for(const id of ['manualWaypoint','manualAltitude'])selectors.append($('#'+id).closest('label'));form.prepend(selectors);
  const position=document.createElement('section');position.className='position-editor';position.innerHTML=`<div class="shared-card-head">${label('position')}<strong id="essentialPercent">—</strong></div><label class="position-slider"><span class="sr-only" data-layout-text="position">${text('position')}</span><input id="essentialPosition" type="range" min="0" max="0" step="any" disabled/></label><div class="position-distance" id="essentialDistance">—</div><div class="position-waypoints"><button class="text-button" type="button" id="essentialPrevious">—</button><span>→</span><button class="text-button" type="button" id="essentialNext">—</button></div><div class="essential-metrics"><div>${label('from')}<strong id="essentialFrom">—</strong></div><div>${label('to')}<strong id="essentialTo">—</strong></div><div><span>ETE</span><strong id="essentialEte">—</strong></div></div><p id="essentialPositionStatus" role="status"></p>`;form.prepend(position);
  $('#manualFuel').closest('label').querySelector('span:first-child').removeAttribute('data-i18n');$('#manualFuel').closest('label').querySelector('span:first-child').dataset.layoutText='observedFuel';
  const submit=$('#submitFlightUpdate');submit.removeAttribute('data-i18n');const actions=document.createElement('div');actions.className='checkpoint-action';actions.append(submit);form.append(actions);
  get('flight:history').innerHTML='<article class="panel"><h2 data-layout-text="history">Histórico</h2><div id="essentialHistory"></div><details class="technical-details"><summary>Tracker</summary><div id="focoTrackerSettings"></div></details></article>';
  const fuelPanel=get('plan:fuel');fuelPanel.classList.add('foco-fuel-form');fuelPanel.prepend($('#fuelInput').closest('label'));const fuelMetrics=$('#essentialFuelMetrics');fuelPanel.insertBefore(fuelMetrics,fuelDetails);
  const fuelSave=document.createElement('button');fuelSave.className='primary-button';fuelSave.type='button';fuelSave.dataset.focoSave='';fuelSave.textContent='Guardar';fuelPanel.insertBefore(fuelSave,fuelDetails);
  const cost=$('[data-tool-panel="cost"] .cost-module'),costContent=$('#costContent'),costSummary=$('.cost-summary'),estimated=$('#estimatedFlightCost').parentElement;
  const costEstimate=document.createElement('div');costEstimate.className='foco-cost-estimate';costEstimate.append(estimated);cost.prepend(costEstimate);
  const costMore=document.createElement('details');costMore.className='technical-details foco-cost-details';costMore.innerHTML=`<summary>${text('details')}</summary>`;costContent.append(costMore);
  for(const selector of ['.cost-efficiency','.cost-kpis','.cost-detail-grid','#costLive']){const node=$(selector);if(node)costMore.append(node);}costSummary.remove();
  const alternateMore=document.createElement('details');alternateMore.className='technical-details';alternateMore.innerHTML=`<summary>${text('details')}</summary>`;for(const node of [$('.cost-alternate-grid'),$('.cost-alternate-phases')])alternateMore.append(node);$('#costAlternate').append(alternateMore);
  const costSave=document.createElement('button');costSave.className='primary-button';costSave.type='button';costSave.dataset.focoSave='';costSave.textContent='Guardar';cost.append(costSave,costMore);const alternateHeading=$('.cost-alternate-head > div');alternateHeading.querySelector('span').removeAttribute('data-i18n');alternateHeading.querySelector('span').dataset.focoCopy='alternateShort';costMore.prepend($('#costAlternateRoute'),$('#costOrigin').parentElement);for(const child of [...alternateMore.children])if(child.tagName!=='SUMMARY')costMore.append(child);alternateMore.remove();
  const vault=document.createElement('div');vault.hidden=true;vault.id='presentationVault';content.append(vault);
  fuelDetails.append($('.kpi-grid'));vault.append($('#optimizeMission'));
  // Source wrappers are now empty; their controls/results have moved, never cloned.
  $('.flight-tools-panel')?.remove();$('.dashboard-grid')?.remove();
  const identity=document.createElement('div');identity.className='foco-route-identity';identity.append($('.plan-identity'),$('#essentialStatus'));content.before(identity);$('#essentialLevelHost').append($('#essentialMode'));$('.essential-state').remove();
  const presentationInfo=document.createElement('details');presentationInfo.className='technical-details foco-about';presentationInfo.innerHTML='<summary>Velocity XL · Info</summary>';presentationInfo.append($('footer'));preferences.append(presentationInfo);
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
    document.body.dataset.focoPage='app';preferences.hidden=true;
    const importPage=module==='import';document.body.classList.toggle('foco-import',importPage);
    window.scrollTo({top:0,behavior:'instant'});window.lucide?.createIcons();
    document.dispatchEvent(new CustomEvent('velocity:navigate',{detail:{area,module}}));
  }
  function translate(){document.querySelectorAll('[data-layout-text]').forEach(el=>el.textContent=text(el.dataset.layoutText));for(const [area,section]of areaMap)section.querySelector('[data-area-title]').textContent=text(state.module[area]==='overview'?area:state.module[area]);nav.setAttribute('aria-label',text('overview'));mobileNav.setAttribute('aria-label',text('overview'));const pt=document.documentElement.lang!=='en-US';for(const [key,value]of Object.entries({weight:pt?'Peso':'Weight',font:pt?'Texto':'Text',language:pt?'Idioma':'Language'}))preferences.querySelector(`[data-preference-label="${key}"]`).textContent=value;document.querySelectorAll('[data-foco-save],[data-preferences-save]').forEach(b=>b.textContent=pt?'Guardar':'Save');document.querySelectorAll('[data-foco-copy="compare"]').forEach(el=>el.textContent=pt?'Comparar':'Compare');document.querySelectorAll('[data-foco-copy="alternateShort"]').forEach(el=>el.textContent=pt?'Alternado':'Alternate');document.querySelectorAll('[data-route-disclosure]').forEach(el=>el.firstChild.textContent=el.dataset.routeDisclosure==='Trechos'?(pt?'Trechos':'Legs'):(pt?'Decisões':'Decisions'));for(const select of preferences.querySelectorAll('[data-preference]')){const active=document.querySelector(`[data-${select.dataset.preference}].active`);if(active)select.value=active.dataset[select.dataset.preference.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}}
  document.addEventListener('click',e=>{if(e.target.closest('[data-preferences-open]')){preferences.hidden=false;document.body.dataset.focoPage='preferences';translate();window.scrollTo(0,0);}if(e.target.closest('[data-preferences-close]')){preferences.hidden=true;document.body.dataset.focoPage='app';}if(e.target.closest('[data-open-import]')){e.preventDefault();document.body.classList.toggle('foco-import');$('#quickPilotId').focus();}if(e.target.closest('[data-foco-save]'))activate(state.area,'overview');});
  preferences.addEventListener('submit',e=>{e.preventDefault();const choices=[...preferences.querySelectorAll('[data-preference]')].map(select=>[select.dataset.preference,select.value]);for(const [key,value]of choices)document.querySelector(`[data-${key}="${value}"]`)?.click();preferences.hidden=true;document.body.dataset.focoPage='app';});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-area-button],[data-open-module],[data-back]');if(!b)return;if(b.hasAttribute('data-back'))activate(state.area,'overview');else if(b.dataset.areaButton)activate(b.dataset.areaButton);else{const [a,m]=b.dataset.openModule.split(':');activate(a,m);}});
  // Measure app chrome once per size change; all screens reserve the actual fixed navigation height.
  function syncChrome(){const style=document.documentElement.style;for(const [key,value]of [['--navigation-height',mobileNav.getBoundingClientRect().height],['--header-height',$('.topbar').getBoundingClientRect().height],['--app-viewport-height',window.visualViewport?.height||innerHeight]]){const pixels=`${value}px`;if(style.getPropertyValue(key)!==pixels)style.setProperty(key,pixels);}}
  const chromeObserver=new ResizeObserver(syncChrome);chromeObserver.observe(mobileNav);chromeObserver.observe($('.topbar'));window.visualViewport?.addEventListener('resize',syncChrome);window.addEventListener('resize',syncChrome);syncChrome();
  window.VelocityLayout={activate,translate,state,text};activate('plan');
})();
