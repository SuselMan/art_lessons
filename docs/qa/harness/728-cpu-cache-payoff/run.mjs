import { CpuProbe,configureDiagnostic,snapshotPlan } from './probe.mjs';
import { compareRuns } from '../728-gpu-method-timer/parity.mjs';
/** Uses the shared source bundle, whose fixed canonical tape records size400 dabs. */
export async function runCpuCachePayoff({engineUrl,scenario='zigzag',paper='fine',repetitions=3}={}){
 const module=await import(new URL(engineUrl,location.href).href);const results=[];const prior=Object.getOwnPropertyDescriptor(window,'__prototypeEngine');let active;
 Object.defineProperty(window,'__prototypeEngine',{configurable:true,get:()=>active?.engine,set:engine=>{
  active.engine=engine;active.flags=configureDiagnostic(engine,active.variant);const p=active.probe,plan=engine._settlePlan;
  for(const name of ['_paintDabs','_finishRibbonStroke','_updateWetTexture','_onStart','_onMove','_onEnd','_runSlice'])p.wrap(engine,name,'Engine.'+name);
  for(const name of ['_ribbonDabsWork','_ribbonStrokeWork'])p.wrap(engine,name,'Engine.'+name,{generator:true});
  p.wrap(engine._ribbonPainter,'paint','RibbonPainter.paint',{generator:true});
  p.wrap(plan,'prepare','SettlePlan.prepare',{after:()=>p.prepareSnapshots.push(snapshotPlan(plan))});
 }});
 try{
  for(let trial=0;trial<repetitions;trial++){
   const order=trial%2?['workspace','cache','off']:['off','cache','workspace'];const group=[];
   for(const variant of order){active={variant,probe:new CpuProbe()};try{
    const report=await module.runPrototype({backend:'webgl1',scenario,paper});
    group.push({trial,variant,flags:active.flags,report,cpu:active.probe.methods,prepareSnapshots:active.probe.prepareSnapshots,plan:snapshotPlan(active.engine._settlePlan)});
   }finally{active.probe.dispose();module.disposePrototype();}}
   const baseline=group.find(r=>r.variant==='off');for(const run of group){run.comparison=compareRuns(baseline.report,run.report);if(baseline.report.fields||run.report.fields){run.comparison.parity.fields=JSON.stringify(baseline.report.fields)===JSON.stringify(run.report.fields);run.comparison.valid&&=run.comparison.parity.fields;}const stats=run.plan.cache;run.cacheHitRatio=stats&&stats.hits+stats.misses?stats.hits/(stats.hits+stats.misses):0;}results.push(...group);
  }
  return {scenario,paper,repetitions,results,pass:results.every(r=>r.comparison.valid),limitations:['Standalone canonical size400 replay, not human input or live packet splitting','CPU elapsed includes WebGL submission; own subtracts only instrumented descendants','Generator next cost measured; inclusive totals overlap and must not be summed','No GPU timing, pen latency, FPS or hardware speedup inference','Flags change only owned harness engines; production defaults untouched','Cache hit ratio is workload-specific; cold costs included; compare alternating runs, not synthetic warm kernels']};
 }finally{module.disposePrototype();if(prior)Object.defineProperty(window,'__prototypeEngine',prior);else delete window.__prototypeEngine;}
}
window.runCpuCachePayoff=runCpuCachePayoff;
