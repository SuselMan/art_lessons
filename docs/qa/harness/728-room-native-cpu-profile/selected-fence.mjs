/** QA scheduling ablation only. Original job.step order/arity stays unchanged. */
export function fenceSelectedMaterialJob(job,queue,index,record){
 if(!Number.isInteger(index)||index<0)throw Error('Explicit selected original operation index required')
 let next=0,state='before',pending=false,error,alive=true,disposed=false,savedDone=false
 const wait=kind=>{pending=true;record('fence.'+kind+':start',{operationIndex:index});Promise.resolve().then(()=>queue.onSubmittedWorkDone()).then(()=>{if(alive){pending=false;record('fence.'+kind+':end',{operationIndex:index})}},e=>{if(alive){pending=false;error=e}})}
 return{
  step(){if(!alive)throw Error('Selected fence job disposed');if(error)throw error;if(pending)return false
   if(next===index&&state==='before'){state='ready-before';wait('before');return false}
   if(next===index&&state==='ready-before'){savedDone=job.step();next++;state='after';wait('after');return false}
   if(state==='after'){state='complete';return savedDone}
   const done=job.step();next++;return done
  },
  finish(){if(!alive)throw Error('Selected fence job disposed');if(state!=='complete')throw Error('Selected operation fence did not complete');return job.finish()},
  publish:job.publish?()=>job.publish():undefined,
  dispose(){if(disposed)return;disposed=true;alive=false;return job.dispose()}
 }
}
