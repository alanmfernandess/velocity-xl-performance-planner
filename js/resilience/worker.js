import { stressTest } from "./stress.js?v=20261024-03";
import { causalAnalysis } from "./sensitivity.js?v=20261024-03";
import { decisionCorridor } from "./corridor.js?v=20261024-03";
import { dynamicOptimize } from "./dynamic.js?v=20261024-03";
import { analyzeEnsemble } from "./ensemble.js?v=20261024-03";
import { workerData, ensembleViewData } from "./transfer.js?v=20261024-03";
let context=null,revision=0;
self.onmessage=({data})=>{
  if(data.type==='context'){context=data.context;revision=data.revision;return;}
  if(data.revision!==revision||!context)return;
  try{
    const result=data.type==='stress'?stressTest(context,data.perturbation,data.axis):data.type==='causal'?causalAnalysis(context)
      :data.type==='corridor'?decisionCorridor(context):data.type==='dynamic'?dynamicOptimize(context):analyzeEnsemble(context,data.ensemble);
    // Functions are local convenience queries, never persisted or transferred.
    self.postMessage({id:data.id,revision,result:workerData(data.type==='ensemble'?ensembleViewData(result):result)});
  }catch(error){self.postMessage({id:data.id,revision,error:error.message});}
};
