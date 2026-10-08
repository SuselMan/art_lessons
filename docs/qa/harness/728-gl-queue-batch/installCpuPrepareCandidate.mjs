/** New fresh QA engine only; no replacement under a held canonical owner. */
export async function installCpuPrepareCandidate(engine,enabled,baseUrl){
 if(engine._settle||engine._strokeLayerId||engine._wcJoinedDeferred)throw Error('Fresh engine required');
 const {WatercolorSettleQueue}=await import(baseUrl+'/CpuPrepareSettleQueue.ts');
 const {CanonicalWatercolorSettlePlan}=await import(baseUrl+'/CanonicalCpuContacts.ts');
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
