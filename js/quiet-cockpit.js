import {ofpDistanceReference,locateOfpDistance} from './quiet-position.js?v=20261027-01';
import {buildMissionProfile,sampleMissionDistance,profileWeatherLayers} from './mission-profile.js?v=20261027-01';
import {newVirtualFlightSession,recoverVirtualFlight,projectVirtualFlight,startVirtualFlight,pauseVirtualFlight,resumeVirtualFlight,finishVirtualFlight,setVirtualTimeFactor,correctVirtualElapsed,confirmVirtualCheckpoint,TRACKER_STORAGE_KEY} from './virtual-flight.js?v=20261027-01';
import {createResiliencePresenter} from './resilience-view.js?v=20261027-01';
const $=s=>document.querySelector(s),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createQuietCockpit(actions){
  let ctx=null,reference=null,model=null,preview=null,nm=0,session=null,missionKey=null,layer='METEO',resilienceKey=null,positionDirty=false;
  const pt=()=>ctx?.language!=='en-US',w=(a,b)=>pt()?a:b,n=(v,d=1)=>Number.isFinite(v)?v.toLocaleString(ctx.language,{maximumFractionDigits:d}):'—';
  const fuel=v=>Number.isFinite(v)?`${n(ctx.fuelUnit==='l'?v*3.785411784:v)} ${ctx.fuelUnit==='l'?'L':'gal'}`:'—';
  const time=s=>Number.isFinite(s)?`${String(Math.floor(Math.max(0,s)/3600)).padStart(2,'0')}:${String(Math.floor(Math.max(0,s)/60)%60).padStart(2,'0')}`:'—';
  const metric=(label,value)=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const store=()=>{if(session)localStorage.setItem(TRACKER_STORAGE_KEY,JSON.stringify(session));};
  const notify=(m,error=false)=>actions.notify(m,error);
  const profilePresenter={setResilienceAdvisor(){},clearPreview(){preview=null;renderRibbon();},previewScenario(s){preview=s.model;window.VelocityLayout.activate('route','overview');renderRibbon();}};
  const resilience=createResiliencePresenter({profilePresenter});
  function position(){return locateOfpDistance(reference,nm);}
  function showPosition(){
    const p=position(),slider=$('#essentialPosition');slider.disabled=!reference?.valid;
    slider.max=reference?.valid?String(reference.totalNm):'0';if(document.activeElement!==slider)slider.value=String(nm);
    $('#essentialPercent').textContent=p?`${n(p.percent,1)}%`:'—';$('#essentialDistance').textContent=p?`${n(nm,2)} NM`:'—';
    $('#essentialPrevious').textContent=p?p.previous.ident:'—';$('#essentialNext').textContent=p?p.next.ident:'—';
    for(const [id,point]of [['essentialPrevious',p?.previous],['essentialNext',p?.next]]){$('#'+id).disabled=!point||(p?.exact&&point.distanceNm===nm);$('#'+id).dataset.distance=point?.distanceNm??'';}
    $('#essentialFrom').textContent=p?`${n(p.fromNm,2)} NM`:'—';$('#essentialTo').textContent=p?`${n(p.toNm,2)} NM`:'—';
    $('#essentialPositionStatus').textContent=!p?w('Posição não avaliada · navlog insuficiente','Position unassessed · insufficient navlog'):p.exact?p.ident:`${p.previous.ident} → ${p.next.ident} · ${n(p.legNm,2)} NM`;
    const sample=model?.valid&&p?sampleMissionDistance(model,nm):null;$('#essentialEte').textContent=sample?time(model.profile.totalSec-sample.elapsedSec):'—';
    updateGate();
  }
  function updateGate(){
    const field=$('#manualFuel'),val=field.value.trim(),gal=ctx?.fuelUnit==='l'?Number(val)/3.785411784:Number(val);
    $('#submitFlightUpdate').disabled=!ctx||!position()||!model?.valid||!session||!ctx.input.appliedChoice||!val||!field.validity.valid||!Number.isFinite(gal)||gal<0||gal>ctx.capacityGal;
    $('#submitFlightUpdate').textContent=w('Salvar checkpoint','Save checkpoint');
    const gate=$('#calibrationGate');gate.textContent=!ctx?.input.appliedChoice?w('Aplique o perfil da missão','Apply the mission profile'):!val||!field.validity.valid||gal<0||gal>ctx.capacityGal?w('Informe um combustível válido','Enter valid observed fuel'):'';gate.hidden=!gate.textContent;
    const last=session?.checkpoints?.at(-1),cruise=last&&model?.valid&&sampleMissionDistance(model,last.distanceNm)?.phase==='CRUISE';
    $('#essentialCalibrationGate').textContent=!last?w('Registre um checkpoint de cruzeiro','Record a cruise checkpoint'):!cruise?w('Calibração indisponível nesta fase','Calibration unavailable in this phase'):!ctx?.input.appliedChoice?w('Aplique o perfil da missão','Apply the mission profile'):'';
    $('#essentialCalibrate').disabled=!cruise||!ctx?.input.appliedChoice||!session?.checkpoints?.length||!$('#observedTas').value.trim()||!$('#observedFuelFlow').value.trim()||!$('#observedTas').validity.valid||!$('#observedFuelFlow').validity.valid;
  }
  function ribbonShape(m){
    const p=m.profile,parts=[['CLIMB','CLB',0,p.tocSec],['CRUISE','CRZ',p.tocSec,p.todSec],['DESCENT','DSC',p.todSec,p.totalSec]],current=sampleMissionDistance(m,Math.min(nm,m.totalNm))?.phase;
    const columns=parts.map(([, ,start,end])=>`${Math.max(1,end-start)}fr`).join(' ');
    return `<section class="foco-timeline" aria-label="${w('Linha do tempo','Flight timeline')}"><div class="foco-timeline-cells" style="grid-template-columns:${columns}">${parts.map(([phase,label,start,end])=>`<button type="button" data-timeline-distance="${phase==='CLIMB'?0:phase==='CRUISE'?p.tocNm:p.todNm}" aria-pressed="${current===phase}"><span>${label}</span><small>${n((end-start)/60,0)} min</small></button>`).join('')}</div><div class="foco-timeline-track" style="grid-template-columns:${columns}" aria-hidden="true">${parts.map(([phase])=>`<span data-current="${current===phase}"></span>`).join('')}</div><div class="foco-timeline-endpoints"><span>00:00</span><span>${time(p.totalSec)}</span></div></section>`;
  }
  function renderRibbon(){
    if(!ctx)return;
    const host=$('#missionProfilePanel'),focused=document.activeElement,detailsOpen=host.querySelector('details')?.open||false;
    const focusSelector=host.contains(focused)?focused?.dataset.ribbonLayer?`[data-ribbon-layer="${focused.dataset.ribbonLayer}"]`:focused?.dataset.routeOrder?`[data-route-order="${focused.dataset.routeOrder}"]`:null:null;
    const m=preview||model,wx=m?.valid?profileWeatherLayers(m,ctx.weatherSnapshot):null;
    let rows='',routeTechnical='';
    if(m?.valid){
      const sample=sampleMissionDistance(m,Math.min(nm,m.totalNm));
      const at=(wx?.[layer]||[]).find(s=>nm>=s.startNm&&nm<=s.endNm);
      let val='—';
      if(layer==='FUEL')val=fuel(sample?.fuelRemainingGal);
      if(layer==='ICE')val=at?.known?`${n(at.value,0)}/100`:w('NÃO AVALIADO','UNASSESSED');
      if(layer==='RIDE')val=at?.known?`${n(at.value,0)}/100`:w('NÃO AVALIADO','UNASSESSED');
      if(layer==='METEO')val=wx?.METEO?.length?`${wx.METEO.filter(p=>p.known).length}/${wx.METEO.length}`:w('NÃO AVALIADO','UNASSESSED');
      routeTechnical=`<div class="essential-metrics">${metric(layer,val)}${metric('FL',sample?`FL${n(sample.altitudeFt/100,0)}`:'—')}${metric('ETE',sample?time(m.profile.totalSec-sample.elapsedSec):'—')}</div>`;rows=`<div class="foco-fuel-reading"><span>${layer} <small>· ${{CLIMB:'CLB',CRUISE:'CRZ',DESCENT:'DSC'}[sample?.phase]||'—'}</small></span><strong>${esc(val)}</strong></div>`;
    }
    host.innerHTML=`<div class="shared-card-head foco-ribbon-head"><h2>Flight Ribbon</h2>${preview?`<button type="button" class="text-button" data-route-original>${w('Original','Original')}</button>`:`<span>${`FL${ctx.candidate.altitudeFt/100}`}</span>`}</div>${m?.valid?ribbonShape(m,wx?.[layer]||[]):`<p role="status">${w('Perfil não avaliado','Profile unassessed')} · ${esc(m?.reason||'OFP')}</p>`}<div class="ribbon-layers" role="group" aria-label="Layers">${['METEO','ICE','RIDE','FUEL'].map(v=>`<button type="button" class="text-button" data-ribbon-layer="${v}" aria-pressed="${v===layer}">${v}</button>`).join('')}</div>${rows}<details class="technical-details"><summary>OFP · ${w('Waypoints','Waypoints')}</summary>${routeTechnical}<div class="ribbon-waypoints">${reference?.valid?reference.points.map((p,i)=>`<button class="text-button" type="button" data-route-order="${i}" data-route-distance="${p.distanceNm}"><strong>${esc(p.ident)}</strong><span>${n(p.distanceNm,2)} NM</span></button>`).join(''):`<p>${w('Posição não avaliada · navlog insuficiente','Position unassessed · insufficient navlog')}</p>`}</div></details>`;
    const details=host.querySelector('details');if(details)details.open=detailsOpen;
    if(focusSelector)host.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function renderTracker(){
    if(!ctx)return;
    document.querySelector('.foco-route-identity .foco-tracker-toggle')?.remove();
    const host=$('#essentialTracker'),projection=session?projectVirtualFlight(session,ctx.plan,Date.now()):null;
    const status=session?.status||'UNAVAILABLE';
    host.innerHTML=`<div class="shared-card-head foco-tracker-header"><h2>Virtual Tracker</h2><span>${esc(({RUNNING:w('EM CURSO','RUNNING'),PAUSED:w('PAUSADO','PAUSED'),NOT_STARTED:w('PRONTO','READY'),FINISHED:w('CONCLUÍDO','FINISHED')})[status]||w('NÃO AVALIADO','UNASSESSED'))}</span></div><div class="essential-metrics foco-tracker-metrics">${metric(w('POSIÇÃO · NM','POSITION · NM'),projection?n(projection.distanceNm,2):'—')}${metric('ETE',projection?time(projection.remainingSec):'—')}</div><div class="foco-fuel-reading"><span>Fuel</span><strong>${fuel(projection?.fuelGal)}</strong></div><div class="tracker-actions">${['NOT_STARTED','PAUSED'].includes(status)?`<button class="text-button foco-tracker-toggle" type="button" data-tracker-action="start" aria-label="${w(status==='PAUSED'?'Retomar':'Iniciar',status==='PAUSED'?'Resume':'Start')}"><i data-lucide="play" aria-hidden="true"></i></button>`:''}${status==='RUNNING'?`<button class="text-button foco-tracker-toggle" type="button" data-tracker-action="pause" aria-label="${w('Pausar','Pause')}"><i data-lucide="pause" aria-hidden="true"></i></button>`:''}${['RUNNING','PAUSED'].includes(status)?`<button class="text-button" type="button" data-tracker-action="finish">${w('Concluir','Finish')}</button>`:''}<label class="ui-field"><span>SIM RATE</span><select id="essentialTrackerFactor" ${status==='FINISHED'||!session?'disabled':''}>${[1,2,4,8].map(v=>`<option value="${v}" ${session?.factor===v?'selected':''}>${v}×</option>`).join('')}</select></label></div><details class="technical-details"><summary>${w('Ajustar tempo','Adjust time')}</summary><form id="essentialTrackerTime"><label class="ui-field"><span>min</span><input name="minutes" type="number" min="0" step="0.1" required/></label><button class="text-button" ${['RUNNING','PAUSED'].includes(status)?'':'disabled'}>${w('Aplicar','Apply')}</button></form></details>${session?.recoveredAttention?`<p>${w('Sessão recuperada · confirme antes de retomar','Recovered session · confirm before resuming')}</p>`:''}`;
    const trackerSettings=$('#focoTrackerSettings');trackerSettings.replaceChildren(...host.querySelectorAll('.tracker-actions,.technical-details'));
    const toggle=trackerSettings.querySelector('.foco-tracker-toggle');if(toggle)document.querySelector('.foco-route-identity').append(toggle);window.lucide?.createIcons();
    const history=session?.checkpoints||[];
    $('#essentialHistory').innerHTML=history.length?history.slice().reverse().map(p=>`<div class="checkpoint-row"><strong>${esc(p.ident||w('Posição manual','Manual position'))}</strong><span>${n(p.distanceNm,2)} NM</span><span>${fuel(p.fuelGal)}</span><time>${new Date(p.wallMs).toLocaleTimeString(ctx.language,{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})}Z</time></div>`).join(''):`<p>${w('Sem checkpoints','No checkpoints')}</p>`;
  }
  function renderWeather(){
    const wx=ctx.weatherSnapshot,r=ctx.candidate.result;
    $('#essentialWeather').innerHTML=`<div class="essential-metrics">${metric('GFS',wx?.gfs?.status||'UNKNOWN')}${metric('AWC',wx?.awc?.status||'UNKNOWN')}${metric('SimBrief',ctx.plan.source||'OFP')}</div><p>${esc(w('Cobertura ICE','ICE coverage'))}: ${r.icing.compatibility==='UNKNOWN'?w('NÃO AVALIADO','UNASSESSED'):esc(r.icing.compatibility)}</p><details class="technical-details"><summary>${w('Dados & fontes','Data & sources')}</summary><pre>${esc(JSON.stringify({gfs:wx?.gfs?.diagnostics,errors:wx?.errors,ice:r.icing.coverage,ride:r.turbulence.confidence},null,2))}</pre></details>`;
  }
  function update(next){
    ctx=next;const key=actions.planKey(next.plan),newMission=key!==missionKey;reference=ofpDistanceReference(next.plan);
    model=buildMissionProfile(next.plan,{...next.candidate,recommendedFuelGal:next.input.fuelOnboardGal});
    if(newMission){missionKey=key;nm=0;positionDirty=false;preview=null;session=null;try{session=recoverVirtualFlight(JSON.parse(localStorage.getItem(TRACKER_STORAGE_KEY)||'null'),key,Date.now());}catch{}
      if(session?.recoveredAttention&&session.status==='RUNNING')session=pauseVirtualFlight(session,Date.now());
    }
    if(!session&&model.valid&&next.input.appliedChoice)session=newVirtualFlightSession(key,{altitudeFt:next.candidate.altitudeFt,mode:next.candidate.mode,fuelOnboardGal:next.input.fuelOnboardGal,powerSetting:next.candidate.powerSetting},model.profile);
    // An untouched tracker can follow a newly selected plan; a running flight retains its original context.
    if(session?.status==='NOT_STARTED'&&!session.checkpoints.length&&model.valid)session={...session,profile:model.profile,config:{altitudeFt:next.candidate.altitudeFt,mode:next.candidate.mode,fuelOnboardGal:next.input.fuelOnboardGal,powerSetting:next.candidate.powerSetting}};
    const candidate=next.candidate,result=candidate.result,score=next.score;
    $('#essentialScore').textContent=score.partial||score.status==='unknown'?w('NÃO AVALIADO','UNASSESSED'):String(score.score);
    const statusText=actions.statusLabel(score.status).toLocaleLowerCase(ctx.language),statusIcon={viable:'check',marginal:'triangle-alert','not-viable':'circle-x',unknown:'circle-help'}[score.status]||'circle-help';$('#essentialStatus').innerHTML=`<i data-lucide="${statusIcon}" aria-hidden="true"></i><span>${esc(statusText.charAt(0).toLocaleUpperCase(ctx.language)+statusText.slice(1))}</span>`;$('#essentialMission').dataset.status=score.status;
    $('#kpiSelectedLevel > span').textContent=next.input.appliedChoice?w('SELECIONADO','SELECTED'):w('RECOMENDADO','RECOMMENDED');
    $('#essentialMode').textContent=candidate.mode;$('#essentialTime').textContent=time(result.tripTimeHr*3600);$('#essentialTrip').textContent=n(next.fuelUnit==='l'?result.tripFuelGal*3.785411784:result.tripFuelGal);$('#essentialMargin').textContent=n(next.fuelUnit==='l'?result.feasibility.fuelMarginGal*3.785411784:result.feasibility.fuelMarginGal);document.querySelector('[data-layout-text="trip"]').textContent=`TRIP · ${next.fuelUnit==='l'?'L':'gal'}`;document.querySelector('[data-layout-text="margin"]').textContent=`${w('MARGEM','MARGIN')} · ${next.fuelUnit==='l'?'L':'gal'}`;
    const blocker=$('#missionScoreSummary').textContent;$('#essentialBlocker').textContent=blocker;$('#essentialBlocker').hidden=!blocker;
    const rec=next.mission.automaticRecommendation,apply=$('#essentialApply');apply.disabled=!rec||!['viable','marginal'].includes(rec.status);apply.textContent=next.input.appliedChoice?w('Aplicado','Applied'):w('Aplicar','Apply');if(next.input.appliedChoice)apply.disabled=true;
    $('#essentialFuelMetrics').innerHTML=metric(w('Requerido','Required'),fuel(result.fuelRequiredGal));
    const wb=next.mission.currentWeightBalance;
    const summaries={wb:`${actions.formatWeight(wb.takeoff.weightLb)} · ${n(wb.takeoff.cgIn,2)} in`,oxygen:$('#oxygenStatus').textContent,fuel:fuel(next.input.fuelOnboardGal),cost:$('#estimatedFlightCost').textContent};
    document.querySelectorAll('[data-module-summary]').forEach(el=>el.textContent=summaries[el.dataset.moduleSummary]||'');
    const field=$('#wbFuelOnboard');if(document.activeElement!==field)field.value=String(next.fuelUnit==='l'?next.input.fuelOnboardGal*3.785411784:next.input.fuelOnboardGal);field.max=String(next.fuelUnit==='l'?next.capacityGal*3.785411784:next.capacityGal);document.querySelectorAll('[data-essential-fuel-unit]').forEach(el=>el.textContent=next.fuelUnit==='l'?'L':'gal');
    showPosition();renderRibbon();renderTracker();renderWeather();
    $('#essentialCalibrate').textContent=w('Registrar','Record');$('#focoCalibrationContext').textContent=`FL${candidate.altitudeFt/100} · ${candidate.mode}`;
    if(window.VelocityLayout.state.area==='plan'&&window.VelocityLayout.state.module.plan==='resilience')updateResilience();
  }
  function updateResilience(){if(!ctx)return;resilience.update(ctx);resilienceKey=ctx.mission;}
  $('#essentialPosition').addEventListener('input',e=>{nm=Number(e.target.value);positionDirty=true;showPosition();renderRibbon();});
  $('#manualFuel').addEventListener('input',updateGate);
  document.addEventListener('input',e=>{if(['observedTas','observedFuelFlow'].includes(e.target.id))updateGate();});
  document.addEventListener('click',e=>{
    const fix=e.target.closest('[data-route-distance],#essentialPrevious,#essentialNext');if(fix&&!fix.disabled){nm=Number(fix.dataset.routeDistance??fix.dataset.distance);positionDirty=true;showPosition();renderRibbon();}
    const layerButton=e.target.closest('[data-ribbon-layer]');if(layerButton){layer=layerButton.dataset.ribbonLayer;renderRibbon();}
    const phase=e.target.closest('[data-timeline-distance]');if(phase){nm=Number(phase.dataset.timelineDistance);positionDirty=true;showPosition();renderRibbon();}
    if(e.target.closest('[data-route-original]')){preview=null;renderRibbon();}
    const tracker=e.target.closest('[data-tracker-action]');if(tracker&&session){try{const now=Date.now(),action=tracker.dataset.trackerAction;session=action==='start'?(session.status==='PAUSED'?resumeVirtualFlight(session,now):startVirtualFlight(session,now)):action==='pause'?pauseVirtualFlight(session,now):finishVirtualFlight(session,now);store();renderTracker();}catch(err){notify(err.message,true);}}
  });
  document.addEventListener('change',e=>{if(e.target.id==='essentialTrackerFactor'&&session){session=setVirtualTimeFactor(session,Number(e.target.value),Date.now());store();renderTracker();}});
  document.addEventListener('submit',e=>{if(e.target.id==='essentialTrackerTime'){e.preventDefault();try{session=correctVirtualElapsed(session,Number(new FormData(e.target).get('minutes'))*60,Date.now());store();renderTracker();}catch(err){notify(err.message,true);}}});
  $('#quietManualPower').addEventListener('click',()=>actions.analyzeManual());
  $('#essentialApply').addEventListener('click',()=>actions.analyzeRecommendation());
  $('#wbFuelOnboard').addEventListener('input',e=>{if(e.target.value&&e.target.validity.valid)actions.setFuel(ctx.fuelUnit==='l'?Number(e.target.value)/3.785411784:Number(e.target.value));});
  $('#manualUpdateForm').addEventListener('submit',e=>{e.preventDefault();if($('#submitFlightUpdate').disabled)return;const p=position(),observed=ctx.fuelUnit==='l'?Number($('#manualFuel').value)/3.785411784:Number($('#manualFuel').value);try{
    if(!session||!model.valid)throw new Error('PROFILE_UNAVAILABLE');
    const base=session.status==='NOT_STARTED'?pauseVirtualFlight(startVirtualFlight(session,Date.now()),Date.now()):session;
    const next=confirmVirtualCheckpoint(base,ctx.plan,{distanceNm:nm,fuelGal:observed},Date.now(),model.profile);
    next.checkpoints.at(-1).ident=p.exact?p.ident:`${p.previous.ident} → ${p.next.ident}`;
    if(!actions.saveManual({distanceNm:nm,fuelRemainingGal:observed,altitudeFt:ctx.candidate.altitudeFt,waypoint:p.current||p.previous,calibrate:false}))return;
    session=next;store();positionDirty=false;renderTracker();updateGate();notify(w('Checkpoint registrado','Checkpoint saved'));
  }catch(err){notify(err.message,true);}});
  $('#essentialCalibrationForm').addEventListener('submit',e=>{e.preventDefault();if($('#essentialCalibrate').disabled)return;const point=session?.checkpoints.at(-1),pos=point?locateOfpDistance(reference,point.distanceNm):null;if(!pos)return;actions.saveManual({distanceNm:point.distanceNm,fuelRemainingGal:point.fuelGal,altitudeFt:session.config.altitudeFt,waypoint:pos.current||pos.previous,calibrate:true});updateGate();});
  document.addEventListener('velocity:navigate',e=>{if(e.detail.area==='plan'&&e.detail.module==='resilience')updateResilience();updateGate();});
  // Visual viewport lifts both fixed controls above the keyboard; CSS also reserves form padding.
  const viewport=()=>document.documentElement.style.setProperty('--keyboard-lift',`${Math.max(0,innerHeight-(window.visualViewport?.height||innerHeight)-(window.visualViewport?.offsetTop||0))}px`);
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
  setInterval(()=>{if(!ctx||session?.status!=='RUNNING')return;const p=projectVirtualFlight(session,ctx.plan,Date.now());if(!positionDirty&&reference?.valid){nm=Math.min(reference.totalNm,p.distanceNm);showPosition();renderRibbon();}if(window.VelocityLayout.state.area==='flight'&&window.VelocityLayout.state.module.flight==='overview'&&!$('#essentialTracker').contains(document.activeElement))renderTracker();store();},1000);
  return {update,position,updateGate};
}
