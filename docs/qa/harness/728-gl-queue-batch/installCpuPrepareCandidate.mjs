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
 return queue.diagnosticCpuPrepareCounts;
}
