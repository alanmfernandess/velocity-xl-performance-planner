export function resilienceAdvisor(results) {
  const findings=[];
  const stress=results.stress?.scenario;
  if(stress?.state==='INCOMPATIBLE')findings.push({priority:1,code:`${results.stress.dominant} · INCOMPATIBLE`,source:'STRESS TEST'});
  if(stress&&!stress.available)findings.push({priority:2,code:stress.reason,source:'STRESS TEST'});
  if(stress?.state==='UNKNOWN')findings.push({priority:2,code:stress.candidate?.unknownReasons?.[0]||'ESSENTIAL_DATA_UNKNOWN',source:'STRESS TEST'});
  if(stress?.state==='MARGINAL')findings.push({priority:3,code:results.stress.dominant||'MARGINAL',source:'STRESS TEST'});
  const causal=results.causal?.combined;
  if(causal?.state==='INCOMPATIBLE')findings.push({priority:1,code:`CAUSAL · ${causal.candidate?.physicalBlockers?.[0]||causal.reason||'INCOMPATIBLE'}`,source:'CAUSAL ENGINEERING'});
  if(results.ensemble?.status==='UNAVAILABLE')findings.push({priority:2,code:'ENSEMBLE · NO_VALID_MEMBERS',source:results.ensemble.model});
  const missingAlternate=results.corridor?.waypoints?.flatMap(p=>p.options).find(o=>o.kind==='alternate'&&o.state==='UNKNOWN');
  if(missingAlternate)findings.push({priority:2,code:`ALT · ${missingAlternate.reason}`,source:'CORRIDOR 4D'});
  if(results.ensemble?.eligibility?.INCOMPATIBLE)findings.push({priority:1,code:`ENSEMBLE · ${results.ensemble.eligibility.INCOMPATIBLE}/${results.ensemble.validCount} INCOMPATIBLE`,source:results.ensemble.model});
  if(results.ensemble?.eligibility?.UNKNOWN)findings.push({priority:2,code:`ENSEMBLE · ${results.ensemble.eligibility.UNKNOWN}/${results.ensemble.validCount} UNKNOWN`,source:results.ensemble.model});
  if(results.ensemble?.negative)findings.push({priority:4,code:`ENSEMBLE · ${results.ensemble.negative}/${results.ensemble.validCount} NEGATIVE MARGIN`,source:results.ensemble.model});
  const wind=results.stress?.frontiers?.transitions?.find(t=>t.constraint==='fuel'&&Math.abs(t.x-(stress?.perturbation?.windKt||0))<=10);
  if(wind)findings.push({priority:5,code:`WIND LIMIT · ${wind.x.toFixed(0)} KT`,source:'STRESS TEST'});
  const fix=results.corridor?.waypoints?.find(w=>w.evaluatedCount>0&&w.sufficientCount<w.evaluatedCount);
  if(fix)findings.push({priority:6,code:`${fix.ident||'OFP'} · ${fix.sufficientCount}/${fix.evaluatedCount}`,source:'CORRIDOR 4D'});
  const dynamic=results.dynamic?.solutions?.find(p=>['ELIGIBLE','MARGINAL'].includes(p.eligibility));
  if(dynamic)findings.push({priority:7,code:`${dynamic.name} · CANDIDATE`,source:'DYNAMIC OPTIMIZER'});
  return findings.sort((a,b)=>a.priority-b.priority)[0]||null;
}
