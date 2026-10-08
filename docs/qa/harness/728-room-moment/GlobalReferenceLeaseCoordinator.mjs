/** OFF proposal. No GL calls, timers, DOWN fences or engine/runtime patches.
 * Caller issues certificates ONLY after an existing synchronization returns.
 */
export class GlobalReferenceLeaseCoordinator{
 constructor({generation,capacity=3}={}){if(generation===undefined||capacity!==3)throw Error('Explicit generation/three-concurrent contract');this.generation=generation;this.capacity=capacity;this.records=new Map();this.submitted=0;this.completed=0;this.lost=false;this.latestAllSerial=0;this.eligible=0}
 admit(key,releaseAfterKnownIdle){if(this.lost)throw Error('Lost generation');if(this.records.has(key)||typeof releaseAfterKnownIdle!=='function')throw Error('Unique lease/release callback required');if(this.records.size>=this.capacity)return false;this.records.set(key,{lastReference:0,admittedAllSerial:this.latestAllSerial,state:'attached',releaseAfterKnownIdle});this.eligible++;return true}
 reference(key,generation=this.generation){if(generation!==this.generation||this.lost)return null;const record=this.records.get(key);if(!record||record.state!=='attached')throw Error('No GPU reference after retire/unknown lease');record.lastReference=++this.submitted;return record.lastReference}
 retire(key,{detached,generation=this.generation}={}){if(generation!==this.generation||this.lost)return false;const record=this.records.get(key);if(!record)return false;if(detached!==true)throw Error('Detach pending and stop tick before retirement');if(record.state==='attached')record.state='retired';return true}
 conservativeSubmission(){if(this.lost)throw Error('Lost generation submission');if(this.eligible)this.latestAllSerial=++this.submitted}
 effectiveReference(record){return Math.max(record.lastReference,this.latestAllSerial>record.admittedAllSerial?this.latestAllSerial:0)}
 captureExistingIdleBoundary(){if(this.lost)throw Error('Lost generation');return Object.freeze({generation:this.generation,serial:this.submitted})}
 completeExistingIdle(certificate,kind){
  if(certificate?.generation!==this.generation||this.lost)return{accepted:false,released:0};
  if(!['gl.finish','GpuBudgetFence.sync'].includes(kind)||!Number.isSafeInteger(certificate.serial)||certificate.serial<0||certificate.serial>this.submitted)throw Error('Actual existing idle certificate required');
  this.completed=Math.max(this.completed,certificate.serial);let released=0;
  for(const[key,record]of this.records){if(record.state!=='retired'||this.effectiveReference(record)>this.completed)continue;
   // A callback failure is ambiguous physical ownership: never automatically reuse/retry.
   this.eligible--;record.state='releasing';try{record.releaseAfterKnownIdle();this.records.delete(key);released++}catch(error){record.state='release-failed';throw error}
  }
  return{accepted:true,released};
 }
 contextLost(generation=this.generation){if(generation!==this.generation)return false;this.lost=true;this.eligible=0;for(const r of this.records.values())r.state='lost';return true}
 snapshot(){return Object.freeze({generation:this.generation,capacity:this.capacity,admitted:this.records.size,submitted:this.submitted,completed:this.completed,lost:this.lost,records:[...this.records].map(([key,r])=>({key,lastReference:this.effectiveReference(r),state:r.state}))})}
}
