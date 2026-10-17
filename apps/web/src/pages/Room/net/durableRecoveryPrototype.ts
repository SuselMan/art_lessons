import type {Operation} from '@grafetto/shared'
import {isRecoverableContentOp, recoveryOperations} from './lostWork'
import type {OutboxEntry,OutboxStorage} from './outboxStorage'

/** Experimental, all-new-readers only. Capture this input on the OLD board;
 * never obtain an engine or room from mutable React refs in the callbacks.
 * No UI wiring: migration and cross-batch target mapping remain open. */
export function createDurableRecoveryPrototype(input:{
  roomId:string
  storage:OutboxStorage
  plan:Omit<Parameters<typeof recoveryOperations>[0],'lost'>
  isCurrent:()=>boolean
  publish:(operations:readonly Operation[])=>void
}){
  const waiting=new Map<string,{entry:OutboxEntry;resolve:()=>void;reject:(error:unknown)=>void}>()
  let flushing:Promise<void>|null=null
  return {
    /** Durable intent already exists before enqueue. A page turn must NOT
     * reset this collection. Restart can enqueue the stored terminal rows. */
    enqueue(entry:OutboxEntry):Promise<void>{
      if(entry.roomId!==input.roomId)return Promise.reject(new Error('wrong captured board'))
      if(entry.terminal?.result.reason!=='target_gone' || !isRecoverableContentOp(entry.op))return Promise.resolve()
      if(waiting.has(entry.op.id))return Promise.reject(new Error('duplicate handoff'))
      return new Promise<void>((resolve,reject)=>{waiting.set(entry.op.id,{entry,resolve,reject})})
    },
    /** Completion means storage commit, never replacement ACK. Caller owns
     * debounce scheduling; a board switch must retain or flush this planner. */
    flush():Promise<void>{
      if(flushing)return flushing.then(()=>this.flush())
      const batch=[...waiting.values()]
      if(!batch.length)return Promise.resolve()
      for(const item of batch)waiting.delete(item.entry.op.id)
      flushing=(async()=>{
        try{
          const lost=batch.map(item=>item.entry.op).filter(isRecoverableContentOp)
          const {operations}=recoveryOperations({...input.plan,lost})
          // Scoped Dry alone stays terminal until content can join it.
          if(!operations.length)throw new Error('recovery needs content; terminal intent retained')
          const replacements=operations.map(op=>({op,roomId:input.roomId,attempts:0,nextRetryAt:0}))
          const committed=await input.storage.replaceTerminal!(input.roomId,batch.map(item=>item.entry.op.id),replacements)
          // A competing new reader can win. Never publish a losing plan.
          if(committed && input.isCurrent())input.publish(operations)
          for(const item of batch)item.resolve()
        }catch(error){for(const item of batch)item.reject(error);throw error}
        finally{flushing=null}
      })()
      return flushing
    },
  }
}
