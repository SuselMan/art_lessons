/** OFF diagnostic scheduler variant. No source preparation or GPU math changes. */
export function boundMaterialJobInFlight(job,queue,limit,record){
 if(!Number.isInteger(limit)||limit<2||limit>4)throw Error('Explicit inflight limit2..4 required')
 let inflight=0,next=0,done=false,alive=true,disposed=false,error,peak=0,blockedCalls=0
 return{
  step(){if(!alive)throw Error('Bounded inflight job disposed');if(error)throw error;if(done)return inflight===0;if(inflight>=limit){blockedCalls++;return false}
   done=job.step();next++;inflight++;peak=Math.max(peak,inflight);const ordinal=next-1;record('inflight.submit',{operationIndex:ordinal,originalStepCalls:next,inflight,limit})
   try{Promise.resolve(queue.onSubmittedWorkDone()).then(()=>{if(alive){inflight--;record('inflight.complete',{operationIndex:ordinal,originalStepCalls:next,inflight,limit})}},e=>{if(alive){inflight--;error=e}})}catch(e){inflight--;error=e;throw e}
   return false
  },
  finish(){if(!alive||!done||inflight)throw Error('Bounded inflight finish before ordered completion');record('inflight.job:finish',{originalStepCalls:next,peak,limit,blockedCalls});return job.finish()},
  publish:job.publish?()=>job.publish():undefined,
  dispose(){if(disposed)return;disposed=true;alive=false;return job.dispose()}
 }
}
