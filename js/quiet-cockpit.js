import {ofpDistanceReference,locateOfpDistance} from './quiet-position.js?v=20261025-01';
import {buildMissionProfile,sampleMissionDistance,profileWeatherLayers,smoothProfileGeometry} from './mission-profile.js?v=20261025-01';
import {newVirtualFlightSession,recoverVirtualFlight,projectVirtualFlight,startVirtualFlight,pauseVirtualFlight,resumeVirtualFlight,finishVirtualFlight,setVirtualTimeFactor,correctVirtualElapsed,confirmVirtualCheckpoint,TRACKER_STORAGE_KEY} from './virtual-flight.js?v=20261025-01';
import {createResiliencePresenter} from './resilience-view.js?v=20261025-01';
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
  function ribbonShape(m,segments=[]){
    const geometry=smoothProfileGeometry(m,{left:40,right:660,top:40,bottom:174});
    if(!geometry)return '';
    const x=d=>40+d/m.totalNm*620;
    const selected=sampleMissionDistance(m,Math.min(nm,m.totalNm));
    const band=segments.filter(s=>Number.isFinite(s.startNm)&&Number.isFinite(s.endNm)).map(s=>{const a=Math.max(0,Math.min(m.totalNm,s.startNm)),b=Math.max(a,Math.min(m.totalNm,s.endNm));const opacity=s.known?Math.max(.15,Math.min(.9,typeof s.value==='number'?s.value/100:.65)):.08;return `<rect x="${x(a)}" y="180" width="${Math.max(.2,x(b)-x(a))}" height="8" fill="var(--blue)" fill-opacity="${opacity}"><title>${esc(layer)} · ${s.known?esc(typeof s.value==='number'?`${n(s.value,0)}/100`:s.value):w('NÃO AVALIADO','UNASSESSED')}</title></rect>`;}).join('');
    const phase=m.profile;const toc=x(phase.tocNm),tod=x(phase.todNm);
    return `<svg class="flight-ribbon" viewBox="0 0 700 220" role="img" aria-label="Flight Ribbon · CLB CRZ DSC"><path d="M40 182H660" stroke="var(--line)" fill="none"/><path d="${geometry.path}" stroke="var(--blue)" stroke-width="5" stroke-linecap="round" fill="none"/><text x="40" y="24">CLB</text><text x="350" y="24" text-anchor="middle">CRZ</text><text x="660" y="24" text-anchor="end">DSC</text><path d="M${toc} 184v-12 M${tod} 184v-12" stroke="var(--muted)"/><text x="${Math.max(55,Math.min(630,toc))}" y="207" text-anchor="middle">TOC</text><text x="${Math.max(55,Math.min(645,tod))}" y="${Math.abs(tod-toc)<65?219:207}" text-anchor="middle">TOD</text>${band}${selected?`<path d="M${x(Math.min(nm,m.totalNm))} 34V184" stroke="var(--blue)" stroke-dasharray="4 4"/><circle cx="${x(Math.min(nm,m.totalNm))}" cy="182" r="6" fill="var(--blue)"/>`:''}</svg>`;
  }
  function renderRibbon(){
    if(!ctx)return;
    const host=$('#missionProfilePanel'),focused=document.activeElement,detailsOpen=host.querySelector('details')?.open||false;
    const focusSelector=host.contains(focused)?focused?.dataset.ribbonLayer?`[data-ribbon-layer="${focused.dataset.ribbonLayer}"]`:focused?.dataset.routeOrder?`[data-route-order="${focused.dataset.routeOrder}"]`:null:null;
    const m=preview||model,wx=m?.valid?profileWeatherLayers(m,ctx.weatherSnapshot):null;
    let rows='';
    if(m?.valid){
      const sample=sampleMissionDistance(m,Math.min(nm,m.totalNm));
      const at=(wx?.[layer]||[]).find(s=>nm>=s.startNm&&nm<=s.endNm);
      let val='—';
      if(layer==='FUEL')val=fuel(sample?.fuelRemainingGal);
      if(layer==='ICE')val=at?.known?`${n(at.value,0)}/100`:w('NÃO AVALIADO','UNASSESSED');
      if(layer==='RIDE')val=at?.known?`${n(at.value,0)}/100`:w('NÃO AVALIADO','UNASSESSED');
      if(layer==='METEO')val=wx?.METEO?.length?`${wx.METEO.filter(p=>p.known).length}/${wx.METEO.length}`:w('NÃO AVALIADO','UNASSESSED');
      rows=`<div class="essential-metrics">${metric(layer,val)}${metric('FL',sample?`FL${n(sample.altitudeFt/100,0)}`:'—')}${metric('ETE',sample?time(m.profile.totalSec-sample.elapsedSec):'—')}</div>`;
    }
    host.innerHTML=`<div class="shared-card-head"><h2>Flight Ribbon</h2>${preview?`<button type="button" class="text-button" data-route-original>${w('Original','Original')}</button>`:`<span>${w('PREVISTO · MANUAL','PLANNED · MANUAL')}</span>`}</div>${m?.valid?ribbonShape(m,wx?.[layer]||[]):`<p role="status">${w('Perfil não avaliado','Profile unassessed')} · ${esc(m?.reason||'OFP')}</p>`}<div class="ribbon-layers" role="group" aria-label="Layers">${['METEO','ICE','RIDE','FUEL'].map(v=>`<button type="button" class="text-button" data-ribbon-layer="${v}" aria-pressed="${v===layer}">${v}</button>`).join('')}</div>${rows}<details class="technical-details"><summary>OFP · ${w('Waypoints','Waypoints')}</summary><div class="ribbon-waypoints">${reference?.valid?reference.points.map((p,i)=>`<button class="text-button" type="button" data-route-order="${i}" data-route-distance="${p.distanceNm}"><strong>${esc(p.ident)}</strong><span>${n(p.distanceNm,2)} NM</span></button>`).join(''):`<p>${w('Posição não avaliada · navlog insuficiente','Position unassessed · insufficient navlog')}</p>`}</div></details>`;
    const details=host.querySelector('details');if(details)details.open=detailsOpen;
    if(focusSelector)host.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function renderTracker(){
    if(!ctx)return;
    const host=$('#essentialTracker'),projection=session?projectVirtualFlight(session,ctx.plan,Date.now()):null;
    const status=session?.status||'UNAVAILABLE';
    host.innerHTML=`<div class="shared-card-head"><h2>Virtual Tracker</h2><span>${esc(({RUNNING:w('EM CURSO','RUNNING'),PAUSED:w('PAUSADO','PAUSED'),NOT_STARTED:w('PRONTO','READY'),FINISHED:w('CONCLUÍDO','FINISHED')})[status]||w('NÃO AVALIADO','UNASSESSED'))}</span></div><div class="essential-metrics">${metric('NM',projection?n(projection.distanceNm,2):'—')}${metric('ETE',projection?time(projection.remainingSec):'—')}${metric('FUEL',fuel(projection?.fuelGal))}</div><div class="tracker-actions">${['NOT_STARTED','PAUSED'].includes(status)?`<button class="primary-button" type="button" data-tracker-action="start">${w(status==='PAUSED'?'Retomar':'Iniciar',status==='PAUSED'?'Resume':'Start')}</button>`:''}${status==='RUNNING'?`<button class="primary-button" type="button" data-tracker-action="pause">${w('Pausar','Pause')}</button>`:''}${['RUNNING','PAUSED'].includes(status)?`<button class="text-button" type="button" data-tracker-action="finish">${w('Concluir','Finish')}</button>`:''}<label class="ui-field"><span>SIM RATE</span><select id="essentialTrackerFactor" ${status==='FINISHED'||!session?'disabled':''}>${[1,2,4,8].map(v=>`<option value="${v}" ${session?.factor===v?'selected':''}>${v}×</option>`).join('')}</select></label></div><details class="technical-details"><summary>${w('Ajustar tempo','Adjust time')}</summary><form id="essentialTrackerTime"><label class="ui-field"><span>min</span><input name="minutes" type="number" min="0" step="0.1" required/></label><button class="text-button" ${['RUNNING','PAUSED'].includes(status)?'':'disabled'}>${w('Aplicar','Apply')}</button></form></details>${session?.recoveredAttention?`<p>${w('Sessão recuperada · confirme antes de retomar','Recovered session · confirm before resuming')}</p>`:''}<small>${w('Estimativa temporal · sem telemetria','Time estimate · no telemetry')}</small>`;
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
    $('#essentialStatus').textContent=actions.statusLabel(score.status);$('#essentialMission').dataset.status=score.status;
    $('#kpiSelectedLevel > span').textContent=next.input.appliedChoice?w('FL SELECIONADO','SELECTED FL'):w('FL RECOMENDADO','RECOMMENDED FL');
    $('#essentialMode').textContent=candidate.mode;$('#essentialTime').textContent=time(result.tripTimeHr*3600);$('#essentialTrip').textContent=fuel(result.tripFuelGal);$('#essentialMargin').textContent=fuel(result.feasibility.fuelMarginGal);
    const blocker=$('#missionScoreSummary').textContent;$('#essentialBlocker').textContent=blocker;$('#essentialBlocker').hidden=!blocker;
    const rec=next.mission.automaticRecommendation,apply=$('#essentialApply');apply.disabled=!rec||!['viable','marginal'].includes(rec.status);apply.textContent=next.input.appliedChoice?w('Perfil aplicado','Profile applied'):w('Aplicar perfil','Apply profile');if(next.input.appliedChoice)apply.disabled=true;
    $('#essentialFuelMetrics').innerHTML=metric('FUEL',fuel(next.input.fuelOnboardGal))+metric('TRIP',fuel(result.tripFuelGal))+metric(w('RESERVA','RESERVE'),fuel(result.reserveFuelGal))+metric(w('REQUERIDO','REQUIRED'),fuel(result.fuelRequiredGal))+metric(w('MARGEM','MARGIN'),fuel(result.feasibility.fuelMarginGal));
    const wb=next.mission.currentWeightBalance;
    const summaries={wb:`${actions.formatWeight(wb.takeoff.weightLb)} · ${n(wb.takeoff.cgIn,2)} in`,oxygen:$('#oxygenStatus').textContent,fuel:fuel(next.input.fuelOnboardGal),cost:$('#estimatedFlightCost').textContent};
    document.querySelectorAll('[data-module-summary]').forEach(el=>el.textContent=summaries[el.dataset.moduleSummary]||'');
    const field=$('#wbFuelOnboard');if(document.activeElement!==field)field.value=String(next.fuelUnit==='l'?next.input.fuelOnboardGal*3.785411784:next.input.fuelOnboardGal);field.max=String(next.fuelUnit==='l'?next.capacityGal*3.785411784:next.capacityGal);document.querySelectorAll('[data-essential-fuel-unit]').forEach(el=>el.textContent=next.fuelUnit==='l'?'L':'gal');
    showPosition();renderRibbon();renderTracker();renderWeather();
    $('#essentialCalibrate').textContent=w('Calibrar','Calibrate');
    if(window.VelocityLayout.state.area==='plan'&&window.VelocityLayout.state.module.plan==='resilience')updateResilience();
  }
  function updateResilience(){if(!ctx)return;resilience.update(ctx);resilienceKey=ctx.mission;}
  $('#essentialPosition').addEventListener('input',e=>{nm=Number(e.target.value);positionDirty=true;showPosition();renderRibbon();});
  $('#manualFuel').addEventListener('input',updateGate);
  document.addEventListener('input',e=>{if(['observedTas','observedFuelFlow'].includes(e.target.id))updateGate();});
  document.addEventListener('click',e=>{
    const fix=e.target.closest('[data-route-distance],#essentialPrevious,#essentialNext');if(fix&&!fix.disabled){nm=Number(fix.dataset.routeDistance??fix.dataset.distance);positionDirty=true;showPosition();renderRibbon();}
    const layerButton=e.target.closest('[data-ribbon-layer]');if(layerButton){layer=layerButton.dataset.ribbonLayer;renderRibbon();}
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
