import { fetchEnsemble } from "./resilience/ensemble.js?v=20261024-03";
import { dynamicProfileScenario } from "./resilience/dynamic.js?v=20261024-03";
import { domains } from "./resilience/stress.js?v=20261024-03";
import { resilienceAdvisor } from "./resilience/advisor.js?v=20261024-03";

const names={stress:['Stress Test','Stress Test'],ensemble:['Ensemble','Ensemble'],corridor:['Corredor 4D','4D Corridor'],causal:['Causal','Causal'],dynamic:['Otimizador dinâmico','Dynamic optimizer']};
const title={stress:'Mission Stress Test',ensemble:'Atmospheric Ensemble',corridor:'4D Decision Corridor',causal:'Causal Engineering',dynamic:'Dynamic Flight Optimizer'};
const axes={windKt:['Vento adicional de proa','Additional headwind','kt',1],payloadLb:['Bagagem adicional','Additional baggage','lb',5],
  temperatureC:['Temperatura','Temperature','°C',1],fuelGal:['Combustível a bordo','Fuel onboard','gal',.5],departureHours:['Partida','Departure','h',.25]};
const escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createResiliencePresenter({profilePresenter}) {
  const host=document.querySelector('#resilienceLab');
  let context=null,active='stress',revision=0,id=0,worker=null,busy=false,controller=null,timer=null,selectedFix=0,selectedEffect=0,selectedProfile=0;
  let fetchId=0,profileInPreview=false;
  let pending=new Map(),results={},perturbation={},axis='windKt',previousMission=null,previousInput=null,error=null;
  const pt=()=>context?.language==='pt-BR',w=(a,b)=>pt()?a:b;
  const n=(v,d=1)=>Number.isFinite(v)?v.toLocaleString(context.language,{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
  const fuel=(v,d=1)=>`${n(context.fuelUnit==='l'?v*3.785411784:v,d)}\u00a0${context.fuelUnit==='l'?'L':'gal'}`;
  const mass=v=>`${n(context.weightUnit==='kg'?v/2.20462262185:v,0)}\u00a0${context.weightUnit==='kg'?'kg':'lb'}`;
  const time=v=>{if(!Number.isFinite(v))return '—';const minutes=Math.round(v/60);return `${Math.floor(minutes/60).toString().padStart(2,'0')}:${(minutes%60).toString().padStart(2,'0')}`;};
  const utc=v=>Number.isFinite(v)?`${new Date(v).toLocaleString(context.language,{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}Z`:'—';
  const stateLabel=s=>({ELIGIBLE:w('ELEGÍVEL','ELIGIBLE'),MARGINAL:'MARGINAL',INCOMPATIBLE:w('INCOMPATÍVEL','INCOMPATIBLE'),UNKNOWN:w('NÃO AVALIADO','UNKNOWN'),FUEL_FEASIBLE:'FUEL FEASIBLE',AVAILABLE:w('DISPONÍVEL','AVAILABLE'),PARTIAL:w('PARCIAL','PARTIAL'),UNAVAILABLE:w('INDISPONÍVEL','UNAVAILABLE')})[s]||s;
  const status=(s)=>`<span class="ui-status rl-status" data-state="${escape(s)}">${escape(stateLabel(s))}</span>`;
  const metric=(label,value)=>`<div class="ui-metric rl-metric" ${label.includes('UTC')?'data-reading="utc"':''}><span data-ui-role="label">${escape(label)}</span>${Array.isArray(value)?`<div class="rl-frontier-values">${value.map(v=>`<strong data-ui-role="emphasis">${escape(v)}</strong>`).join('')}</div>`:`<strong data-ui-role="emphasis">${escape(value)}</strong>`}</div>`;
  const empty=reason=>`<div class="rl-alert" role="status">${status('UNKNOWN')}<strong data-ui-role="secondary">${escape((reason||w('OFP NÃO IMPORTADO','NO OFP')).replaceAll('_',' '))}</strong></div>`;
  function ensureWorker(){
    if(worker)return;
    worker=new Worker(new URL('./resilience/worker.js?v=20261024-03',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const waiter=pending.get(data.id);pending.delete(data.id);
      if(data.revision!==revision){waiter?.reject(new Error('STALE_RESULT'));return;}
      data.error?waiter?.reject(new Error(data.error)):waiter?.resolve(data.result);
    };
    worker.onerror=()=>{for(const waiter of pending.values())waiter.reject(new Error('WORKER_UNAVAILABLE'));pending.clear();};
  }
  async function run(type,extra={}) {
    if(!context?.candidate)return;
    const currentRevision=revision,request=++id;
    busy=true;error=null;render();
    try{
      ensureWorker();
      const result=await new Promise((resolve,reject)=>{pending.set(request,{resolve,reject});worker.postMessage({type,id:request,revision,...extra});});
      if(currentRevision!==revision||request!==id)return;
      results[type]=result;
      profilePresenter.setResilienceAdvisor(resilienceAdvisor(results));
    }catch(err){if(currentRevision===revision&&err.message!=='STALE_RESULT')error=err.message;}
    finally{if(currentRevision===revision&&request===id){busy=false;render();}}
  }
  async function loadEnsemble(){
    if(!context?.plan)return;
    const currentRevision=revision, requestFetch=++fetchId;id++;controller?.abort();controller=new AbortController();const requestController=controller;
    const timeout=setTimeout(()=>requestController.abort(),30000);busy=true;error=null;render();
    try{
      const snapshot=await fetchEnsemble(context.plan,{signal:controller.signal});
      if(currentRevision!==revision||requestFetch!==fetchId)return;
      await run('ensemble',{ensemble:snapshot});
    }catch(err){if(currentRevision===revision&&requestFetch===fetchId){busy=false;error=null;results.ensemble={status:'UNAVAILABLE',reason:err.name==='AbortError'?'ENSEMBLE_TIMEOUT':err.message,validCount:0,receivedCount:0,evaluated:[],excludedCount:0};profilePresenter.setResilienceAdvisor(resilienceAdvisor(results));render();}}
    finally{clearTimeout(timeout);}
  }
  const plot=(curves,key)=>{
    const valid=curves.filter(c=>c.scenario?.model?.nodes?.length);
    if(!valid.length)return '';
    const points=valid.map(c=>c.scenario.model.nodes.map(p=>[p.distanceNm,p[key]]));
    const maxD=Math.max(...valid.map(c=>c.scenario.model.totalNm)),values=points.flat().map(p=>p[1]),low=Math.min(...values),high=Math.max(...values,1);
    const paths=points.map((p,i)=>`<path d="${p.map(([x,y],j)=>`${j?'L':'M'}${32+x/maxD*636},${170-(y-low)/(high-low||1)*140}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-opacity="${i===Math.floor(points.length/2)?'.9':'.12'}" stroke-width="${i===Math.floor(points.length/2)?'2':'1'}"/>`).join('');
    return `<div class="rl-plot"><svg viewBox="0 0 700 210" role="img" aria-label="${w('Dispersão de combustível por membro','Member fuel dispersion')}"><path d="M32 24v146h636" fill="none" stroke="var(--line)"/>${paths}<text x="32" y="200">0 NM</text><text x="668" y="200" text-anchor="end">${n(maxD,0)} NM</text><text x="32" y="18">${escape(fuel(high))}</text></svg></div>`;
  };
  function controls(){
    const limits=domains(context.input);
    return `<div class="rl-controls">${Object.entries(axes).map(([key,[p,e,unit,step]])=>{
      const raw=perturbation[key]||0,value=key==='fuelGal'?context.input.fuelOnboardGal+raw:raw;
      const display=unit==='gal'?fuel(value):unit==='lb'?mass(value):`${n(value,unit==='h'?2:0)}\u00a0${unit}`;
      return `<label class="ui-field rl-control"><span data-ui-role="label">${escape(pt()?p:e)}</span><strong data-ui-role="emphasis" data-rl-reading="${key}">${escape(display)}</strong><input type="range" data-rl-input="${key}" aria-label="${escape(pt()?p:e)}" min="${limits[key][0]}" max="${limits[key][1]}" step="${step}" value="${raw}"/></label>`;
    }).join('')}</div>`;
  }
  function stress(){
    const r=results.stress,s=r?.scenario;
    const wind=r?.windFrontiers?.transitions.filter(t=>['fuel','weight','profile','weather','availability'].includes(t.constraint))||[];
    return `${controls()}<div class="rl-metrics">${metric('WIND LIMIT',wind.length?wind.map(t=>`${n(t.x,0)}\u00a0kt`):'—')}${metric('FUEL MARGIN',fuel(s?.metrics?.fuelMarginGal))}${metric('WEIGHT MARGIN',mass(s?.metrics?.weightMarginLb))}</div>${s?`<div class="rl-state-row">${status(s.state)}<strong data-ui-role="secondary">${escape((r.dominant||'—').replaceAll('_',' '))}</strong></div>`:''}${s&&!s.available?empty(s.reason):''}<div class="rl-actions"><button class="text-button ui-button" data-rl-action="reset">${w('Restaurar','Reset')}</button><button class="text-button ui-button" data-rl-action="preview" ${s?.available?'':'disabled'}>${w('Ver perfil','View profile')}</button></div>`;
  }
  function ensemble(){
    const r=results.ensemble;
    if(r&&!r.validCount)return `<div class="rl-actions"><span class="ui-status">WX ENSEMBLE · ECMWF IFS</span><button class="text-button ui-button" data-rl-action="ensemble">${w('Analisar ensemble','Analyze ensemble')}</button></div>${status(r.status)}${empty(r.reason||'NO_VALID_MEMBERS')}`;
    return `<div class="rl-actions"><span class="ui-status">WX ENSEMBLE · ECMWF IFS</span><button class="text-button ui-button" data-rl-action="ensemble" ${busy?'disabled':''}>${w('Analisar ensemble','Analyze ensemble')}</button></div>${r?`${status(r.status)}<div class="rl-state-row">${['INCOMPATIBLE','UNKNOWN','MARGINAL'].filter(key=>r.eligibility?.[key]>0).map(key=>`<span class="rl-state-count">${status(key)}<strong data-ui-role="secondary">${r.eligibility[key]}/${r.validCount}</strong></span>`).join('')}</div><div class="rl-metrics">${metric(w('MEMBROS VÁLIDOS','VALID MEMBERS'),`${r.validCount}/${r.receivedCount}`)}${metric(w('MARGEM NEGATIVA','NEGATIVE MARGIN'),`${r.negative}/${r.validCount}`)}${metric(w('MARGEM MARGINAL','MARGINAL MARGIN'),`${r.marginal}/${r.validCount}`)}</div>${plot([...r.evaluated].sort((a,b)=>(a.scenario?.metrics?.fuelMarginGal??Infinity)-(b.scenario?.metrics?.fuelMarginGal??Infinity)),'fuelRemainingGal')}<div class="rl-quantiles">${['p10','p50','p90'].map(q=>`<article class="ui-card rl-quantile"><h4 data-ui-role="emphasis">${q.toUpperCase()}</h4>${metric('TRIP FUEL',fuel(r.statistics.tripFuelGal[q]))}${metric('ETE',time(r.statistics.eteSec[q]))}${metric('FUEL MARGIN',fuel(r.statistics.fuelMarginGal[q]))}${metric(w('CHEGADA UTC','ARRIVAL UTC'),utc(r.statistics.arrivalMs[q]))}</article>`).join('')}</div>${r.validCount?'':empty('NO_VALID_MEMBERS')}`:empty('ENSEMBLE_NOT_REQUESTED')}`;
  }
  function corridor(){
    const r=results.corridor;if(!r?.available)return empty(r?.reason||'ANALYSIS_PENDING');
    const fixes=r.waypoints,fix=fixes[Math.min(selectedFix,fixes.length-1)];
    return `<label class="ui-field"><span>Waypoint · OFP</span><select id="rlWaypoint">${fixes.map((p,i)=>`<option value="${i}" ${i===selectedFix?'selected':''}>${escape(p.ident||`OFP #${p.order+1}`)} · ${n(p.distanceNm,0)} NM</option>`).join('')}</select></label><div class="rl-corridor" aria-label="${w('Corredor da rota','Route corridor')}">${fixes.filter(p=>p.located).map(p=>`<button class="text-button ui-button" data-rl-fix="${fixes.indexOf(p)}" aria-pressed="${p===fix}" aria-label="${escape(p.ident)}"><span data-ui-role="label">${escape(p.ident||'OFP')}</span><strong data-ui-role="secondary">${p.sufficientCount}/${p.options.length}</strong></button>`).join('')}</div><div class="rl-metrics">${metric('ALT · MSL',`${n(fix.state?.altitudeFt,0)}\u00a0ft`)}${metric('ETA · UTC',utc(fix.state?.timestampMs))}${metric(w('COMBUSTÍVEL','FUEL'),fuel(fix.state?.fuelRemainingGal))}</div><div class="rl-options">${fix.options.map(o=>`<article class="ui-card rl-option"><header><span data-ui-role="label">${escape(({continue:w('CONTINUAR','CONTINUE'),return:w('RETORNAR','RETURN'),alternate:w('ALTERNADO','ALTERNATE')})[o.kind])}</span><strong data-ui-role="emphasis">${escape(o.ident)}</strong></header>${status(o.state)}${metric('FUEL MARGIN',fuel(o.marginGal))}<span class="rl-reason" data-ui-role="label">${escape((o.reason||w('PISTA / TERRENO · NÃO AVALIADOS','RUNWAY / TERRAIN · UNKNOWN')).replaceAll('_',' '))}</span></article>`).join('')}</div>`;
  }
  function causal(){
    const r=results.causal;if(!r)return empty('ANALYSIS_PENDING');
    const e=r.effects[Math.min(selectedEffect,r.effects.length-1)];
    return `<div class="rl-effects">${r.effects.map((effect,i)=>`<button class="text-button ui-button rl-effect" data-rl-effect="${i}" aria-pressed="${i===selectedEffect}"><span data-ui-role="secondary">${escape(pt()?axes[effect.axis][0]:axes[effect.axis][1])} · ${effect.appliedStep>0?'+':''}${effect.axis==='payloadLb'?mass(effect.appliedStep):`${n(effect.appliedStep,0)}\u00a0${axes[effect.axis][2]}`}</span><span class="rl-effect-metrics"><span>Δ FUEL <strong>${fuel(effect.delta?.tripFuelGal,2)}</strong></span><span>Δ ETE <strong>${n(effect.delta?.eteSec/60)}\u00a0min</strong></span></span><progress max="1" value="${Math.abs(effect.delta?.tripFuelGal||0)/Math.max(.01,...r.effects.map(x=>Math.abs(x.delta?.tripFuelGal||0)))}" aria-label="Δ Fuel"></progress></button>`).join('')}</div>${e.chain?`<div class="rl-chain"><h4 data-ui-role="emphasis">${w('Cadeia de impacto','Impact chain')}</h4><div class="rl-metrics">${metric('Δ TAS',`${n(e.chain.tasKt)}\u00a0kt`)}${metric('Δ TOC',`${n(e.chain.tocNm)}\u00a0NM`)}${metric('Δ TOD',`${n(e.chain.todNm)}\u00a0NM`)}${metric(w('Δ VENTO','Δ WIND'),`${n(e.chain.encounteredWindKt)}\u00a0kt`)}${metric('Δ TRIP FUEL',fuel(e.chain.tripFuelGal,2))}${metric('Δ ETE',`${n(e.chain.eteSec/60)}\u00a0min`)}${metric('FUEL MARGIN',fuel(e.chain.newFuelMarginGal))}</div></div>`:empty(e.sensitivity.reason)}${metric(w('INTERAÇÃO COMBINADA · Δ FUEL','COMBINED INTERACTION · Δ FUEL'),fuel(r.interaction?.tripFuelGal,2))}`;
  }
  function dynamic(){
    const r=results.dynamic;if(!r)return empty('ANALYSIS_PENDING');
    if(!r.solutions?.length)return empty(r.reason||r.errors?.[0]||'NO_ADMISSIBLE_PROFILE');
    const p=r.solutions[Math.min(selectedProfile,r.solutions.length-1)];
    return `<div class="rl-profiles">${r.solutions.map((profile,i)=>`<button class="text-button ui-button rl-profile" data-rl-profile="${i}" aria-pressed="${i===selectedProfile}"><span data-ui-role="emphasis">${escape(profile.name)}</span><span class="rl-profile-metrics"><span>TRIP FUEL <strong>${fuel(profile.tripFuelGal)}</strong></span><span>ETE <strong>${time(profile.eteSec)}</strong></span></span><span class="rl-profile-margin">FUEL MARGIN <strong>${fuel(profile.fuelMarginGal)}</strong></span></button>`).join('')}</div><article class="ui-card rl-selected"><span data-ui-role="label">${w('PERFIL SELECIONADO','SELECTED PROFILE')}</span><h4 data-ui-role="emphasis">${escape(p.name)}</h4><div class="rl-metrics">${metric('TRIP FUEL',fuel(p.tripFuelGal))}${metric('ETE',time(p.eteSec))}</div><div class="rl-selected-margin">${metric('FUEL MARGIN',fuel(p.fuelMarginGal))}${status(p.eligibility)}</div></article><button class="text-button ui-button" data-rl-action="dynamic-preview">${w('Ver perfil','View profile')}</button>`;
  }
  function assumptions(){
    const base=results.stress?.scenario||results.corridor?.scenario||results.dynamic?.scenario;
    const content=pt()?
      'Modelo estimado para simulador. Cenários contrafactuais não são previsões observadas. Vento positivo acrescenta componente de proa relativa a cada trecho; carga adicional altera somente a bagagem da cópia. Combustível mantém o valor a bordo, sem abastecimento automático. Fronteiras: varredura e refinamento de todas as transições detectadas; não exclui ilhas menores que a resolução. Causalidade interna ao modelo; efeitos não são somáveis. Corredor avalia somente combustível, sem validar pista, terreno ou obstáculos. Retorno segue o caminho inverso do OFP; desvio usa geometria direta, sem procedimento publicado. Otimizador: busca Pareto limitada, não ótimo global; O₂ conservador pela maior altitude, sem aplicação automática.':
      'Estimated simulator model. Counterfactuals are not observed forecasts. Positive wind adds headwind relative to each leg; extra payload changes scenario baggage only. Onboard fuel stays fixed; no automatic refueling. Frontiers scan and refine all detected transitions; islands smaller than the scan resolution can remain undetected. Causality is internal to the model; effects are not additive. Corridor evaluates fuel only, without runway, terrain or obstacle validation. Return reverses the OFP path; diversion uses direct geometry without a published procedure. Optimizer uses a bounded Pareto search, not a global optimum; conservative maximum-altitude O₂ screening, no automatic application.';
    return `<details class="rl-assumptions"><summary>${w('Dados & premissas','Data & assumptions')}</summary><div><p>${content}</p><dl><dt>${w('Solucionador','Solver')}</dt><dd>${base?.version||'4D-1'} · ≤2 s / 0.02 gal · 8 ${w('iterações','iterations')}</dd><dt>${w('Cobertura','Coverage')}</dt><dd>${escape(base?.coverage||'UNKNOWN')} · ${escape(base?.source||'—')}</dd><dt>Stress</dt><dd>${escape(results.stress?.axis||'—')} · ${n(results.stress?.frontiers?.resolution)} · ${results.stress?.frontiers?.transitions.length||0} ${w('transições','transitions')}</dd><dt>Ensemble</dt><dd>${results.ensemble?.validCount??0}/${results.ensemble?.receivedCount??0} · ${results.ensemble?.excludedCount??0} ${w('excluídos','excluded')} · R7 P10/P50/P90</dd><dt>${w('Grafo','Graph')}</dt><dd>${escape(JSON.stringify(results.dynamic?.discretization||{}))}</dd></dl><p>${w('ECMWF IFS: global, 0,25°, nativo 3h; API interpola para 1h. Um membro conserva sua identidade na rota inteira. Contagens não representam probabilidade de segurança. Sem extrapolação vertical/temporal.','ECMWF IFS: global, 0.25°, native 3h; API interpolates to 1h. Each member retains its identity across the entire route. Counts are not safety probabilities. No vertical/time extrapolation.')}</p><a href="https://open-meteo.com/en/docs/ensemble-api" target="_blank" rel="noopener">Open-Meteo · ECMWF · CC BY 4.0</a><ul>${(results.dynamic?.errors||[]).map(e=>`<li>${escape(e)}</li>`).join('')}${(results.ensemble?.evaluated||[]).filter(m=>!m.valid).map(m=>`<li>${escape(m.id)} · ${escape(m.reason||m.errors?.join(' · '))}</li>`).join('')}</ul></div></details>`;
  }
  function render(){
    if(!context)return;
    const focused=document.activeElement;
    const focusKey=host.contains(focused)?['data-rl-input','data-rl-tab','data-rl-action','data-rl-fix','data-rl-effect','data-rl-profile'].find(a=>focused.hasAttribute(a)):null;
    const focusSelector=focusKey?`[${focusKey}="${focused.getAttribute(focusKey)}"]`:focused?.id==='rlWaypoint'?'#rlWaypoint':null;
    const detailsOpen=host.querySelector('.rl-assumptions')?.open||false;
    host.hidden=!context.plan;
    host.setAttribute('aria-busy',String(busy));
    host.innerHTML=`<header class="rl-heading"><span data-ui-role="label">Velocity Mission Intelligence</span><h2>Resilience Lab</h2><span class="ui-status">${w('EM ANÁLISE','IN ANALYSIS')} · FL${context.candidate?.altitudeFt/100||'—'} · ${escape(context.candidate?.mode)}</span>${profileInPreview?`<button class="text-button ui-button" data-rl-action="original">Original</button>`:''}</header><div class="rl-tabs" role="group" aria-label="Resilience Lab">${Object.entries(names).map(([key,label])=>`<button type="button" class="text-button ui-button" data-rl-tab="${key}" aria-pressed="${active===key}" aria-controls="rlAnalysis">${escape(pt()?label[0]:label[1])}</button>`).join('')}</div><section class="rl-analysis" id="rlAnalysis" aria-labelledby="rlTitle"><header><h3 id="rlTitle">${title[active]}</h3><span class="rl-busy ui-status" role="status">${busy?w('CALCULANDO','CALCULATING'):''}</span></header>${error?empty(error):''}${({stress,ensemble,corridor,causal,dynamic})[active]()}</section>${assumptions()}`;
    host.querySelectorAll('button').forEach(b=>b.type='button');
    host.querySelector('.rl-assumptions').open=detailsOpen;
    if(focusSelector)host.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  host.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.dataset.rlTab){fetchId++;controller?.abort();busy=false;active=target.dataset.rlTab;error=null;render();if(!results[active]&&active!=='ensemble')run(active,active==='stress'?{perturbation,axis}:{});}
    if(target.dataset.rlAction==='reset'){perturbation={};axis='windKt';run('stress',{perturbation,axis});profilePresenter.clearPreview();}
    if(target.dataset.rlAction==='ensemble')loadEnsemble();
    if(target.dataset.rlAction==='original'){profileInPreview=false;profilePresenter.clearPreview();render();}
    if(target.dataset.rlAction==='dynamic-preview'){const s=dynamicProfileScenario(results.dynamic,selectedProfile);if(s){profileInPreview=true;profilePresenter.previewScenario(s);render();document.querySelector('#missionProfilePanel').scrollIntoView({behavior:'smooth',block:'start'});}}
    if(target.dataset.rlAction==='preview'&&results.stress?.scenario?.available){profileInPreview=true;profilePresenter.previewScenario(results.stress.scenario);render();document.querySelector('#missionProfilePanel').scrollIntoView({behavior:'smooth',block:'start'});}
    if(target.dataset.rlFix!==undefined){selectedFix=Number(target.dataset.rlFix);render();}
    if(target.dataset.rlEffect!==undefined){selectedEffect=Number(target.dataset.rlEffect);render();}
    if(target.dataset.rlProfile!==undefined){selectedProfile=Number(target.dataset.rlProfile);render();}
  });
  host.addEventListener('change',event=>{if(event.target.id==='rlWaypoint'){selectedFix=Number(event.target.value);render();}});
  host.addEventListener('input',event=>{
    const key=event.target.dataset.rlInput;if(!key)return;
    perturbation[key]=Number(event.target.value);axis=key;id++;busy=true;host.setAttribute("aria-busy","true");host.querySelector(".rl-busy").textContent=w("CALCULANDO","CALCULATING");
    const raw=perturbation[key],value=key==='fuelGal'?context.input.fuelOnboardGal+raw:raw;
    host.querySelector(`[data-rl-reading="${key}"]`).textContent=key==='fuelGal'?fuel(value):key==='payloadLb'?mass(value):`${n(value,key==='departureHours'?2:0)}\u00a0${axes[key][2]}`;
    clearTimeout(timer);timer=setTimeout(()=>run('stress',{perturbation:{...perturbation},axis}),240);
  });
  return {update(next){
    const signature=JSON.stringify([next.input.payloadLb,next.input.fuelOnboardGal,next.input.reserveMinutes,next.input.oxygen,next.input.weightBalance,next.input.calibration,next.candidate?.altitudeFt,next.candidate?.mode,next.candidate?.powerSetting]);
    const changed=previousMission!==next.mission||previousInput!==signature;
    context=next;previousMission=next.mission;previousInput=signature;
    if(changed){revision++;fetchId++;controller?.abort();clearTimeout(timer);worker?.terminate();worker=null;for(const waiter of pending.values())waiter.reject(new Error('STALE_RESULT'));pending.clear();
      results={};profileInPreview=false;profilePresenter.setResilienceAdvisor(null);perturbation={};error=null;busy=false;selectedFix=selectedEffect=selectedProfile=0;
      if(next.candidate){ensureWorker();worker.postMessage({type:'context',revision,context:{mission:next.mission,input:next.input,candidate:next.candidate}});if(active!=='ensemble')run(active,active==='stress'?{perturbation,axis:'windKt'}:{});}
    }
    render();
  }};
}
