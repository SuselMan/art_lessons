/** OFF installer. Requires the reviewed actual queue patch; no fallback/mocks. */
export function installPhysicalBatchTwoQa(e,{enabled=false}={}){
 const q=e._settleQueue;if(!q||!Object.hasOwn(q,'diagnosticPhysicalBatchTwoEnabled'))throw Error('Reviewed actual physical-batch-two queue required');
 const flags=()=>({physicalBatchTwo:!!q.diagnosticPhysicalBatchTwoEnabled,solverBatch:!!q.diagnosticSolverBatchEnabled,contactBatch:!!q.contactBatchEnabled,frontBatch:!!q.frontBatchEnabled,presentationBatch:!!q.presentationBatchEnabled,continuationTasks:!!q.continuationTasksEnabled,continuationGpuFence:!!e._wcContinuationGpuFence});
 const before=flags();if(enabled&&Object.entries(before).some(([k,v])=>v&&k!=='continuationGpuFence'))throw Error('Isolated batch-two arm requires all other scheduler experiments OFF');
 q.diagnosticPhysicalBatchTwoEnabled=enabled;
 return{flags,restore(){q.diagnosticPhysicalBatchTwoEnabled=before.physicalBatchTwo}};
}
