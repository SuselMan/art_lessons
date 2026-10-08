import {WatercolorSettleQueue,cpuPrepareOp,diagnosticSettleOpTag} from '../../../../temp/device-runs/CpuPrepareSettleQueue.ts';
import {CanonicalWatercolorSettlePlan,diagnosticCpuTaggerIdentity} from '../../../../temp/device-runs/CanonicalCpuContactsStatic.ts';
/** New fresh QA engine only; no replacement under a held canonical owner. */
export async function installCpuPrepareStatic(engine,enabled,baseUrl){
 if(engine._settle||engine._strokeLayerId||engine._wcJoinedDeferred)throw Error('Fresh engine required');
 if (diagnosticCpuTaggerIdentity !== cpuPrepareOp) throw Error('CPU queue/plan ES identity mismatch');
 const previousQueue=engine._settleQueue,previousPlan=engine._settlePlan;
 const queue=new WatercolorSettleQueue(previousQueue.ctx),plan=new CanonicalWatercolorSettlePlan(previousPlan.ctx);
 for(const [before,after]of [[previousQueue,queue],[previousPlan,plan]])for(const key of Object.keys(before))if(typeof before[key]==='boolean')after[key]=before[key];
 queue.contactBatchMax=previousQueue.contactBatchMax;
 queue.diagnosticCpuPrepareBatchEnabled=enabled;plan.diagnosticLazyCapturedContacts=true;
 previousPlan.destroyTextures();engine._settleQueue=queue;engine._settlePlan=plan;
 const meta={enabled,prepares:0,captured:0,fallback:0,travel:[],counts:queue.diagnosticCpuPrepareCounts};
 const prepare=plan.prepare;plan.prepare=function(...args){meta.prepares++;const m=args[12];if(m?.brushTravel){meta.captured++;meta.travel.push(m.brushTravel.length)}else meta.fallback++;return prepare.apply(this,args)};
 engine.__cpuPrepareDiagnostic=meta;
 return meta;
}

/** Lightweight browser identity/class gate only; no Engine/GPU context. */
export async function probeCpuModuleIdentity(){
 if(diagnosticCpuTaggerIdentity!==cpuPrepareOp)throw Error('Shared module identity FAIL');
 const rows=[];
 for(const enabled of [false,true]){
  const events=[],q=new WatercolorSettleQueue({beforeStart(){},perf:()=>({settleStart:0,settleOps:0,settleMs:0}),isDrawing:()=>false,backlogSize:()=>0,backlogMax:()=>1,noteActivity(){},scheduleFieldRelease(){}});
  q.diagnosticCpuPrepareBatchEnabled=enabled;
  const units=Array.from({length:5},(_,i)=>diagnosticCpuTaggerIdentity(()=>events.push(i)));
  if(units.some(op=>diagnosticSettleOpTag(op)!=='cpu-prepare'))throw Error('Shared WeakSet FAIL');
  q.start({live:true},[()=>{},...units,()=>events.push('barrier')],()=>events.push('finish'));
  const deadline=performance.now()+2000;
  while(q.current){if(performance.now()>deadline){q.cancel();throw Error('Lightweight gate timeout')}await new Promise(r=>requestAnimationFrame(r))}
  rows.push({enabled,events,counts:{...q.diagnosticCpuPrepareCounts}});
 }
 if(rows[0].counts.units!==0||rows[1].counts.units!==5)throw Error('CPU class effectiveness FAIL');
 return{sharedIdentity:true,rows,scope:'CPU-only queue with five tagged synthetic units; no GPU or actual Engine quality proof'};
}
