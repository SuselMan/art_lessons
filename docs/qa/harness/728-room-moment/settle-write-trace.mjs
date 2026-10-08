/** Metadata-only owned-page trace. No GPU copy/readback or fences. */
export async function installSettleWriteTrace(){
 const {CanonicalRoomWatercolorExecutor}=await import('/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts')
 const proto=CanonicalRoomWatercolorExecutor.prototype,original=proto.prepareSettle,restores=[],results=window.__settleWriteTrace=[]
 const ids=new WeakMap();let nextId=0
 const id=v=>v&&typeof v==='object'?(ids.has(v)?ids.get(v):(ids.set(v,++nextId),nextId)):null
 proto.prepareSettle=function(input){
  if(results.length>=3)throw Error('Bounded settle trace three jobs exceeded')
  const owner=this,record={gesture:owner.scratch.gesture,phase:'prepare',counts:{},writes:[],firstLoadWrite:null},ring=[]
  results.push(record)
  const hooks=[],wrap=(object,name,describe)=>{const fn=object[name];if(typeof fn!=='function')throw Error('Actual native trace method missing '+name);const hook=function(...args){const fields=owner.scratch.tiles.peek(owner.target.buffer),entry=describe(args,fields);record.counts[name]=(record.counts[name]??0)+1;const event={method:name,phase:record.phase,...entry};ring.push(event);if(ring.length>8)ring.shift();if(entry.destinationRole){if(record.writes.length>=32)throw Error('Bounded native writes exceeded32');record.writes.push(event);if(!record.firstLoadWrite&&['inkLoad','inkColor'].includes(entry.destinationRole))record.firstLoadWrite={...event,preceding:ring.slice(0,-1)}}return fn.apply(this,args)};object[name]=hook;hooks.push(()=>{object[name]=fn})}
  const role=(value,fields)=>Object.entries(fields??{}).find(([,v])=>v===value||v?.field===value)?.[0]??null
  const describe=(out,inputs,fields,extra={})=>({destination:id(out),destinationRole:role(out,fields),inputs:inputs.map(id),...extra})
  try{wrap(owner.adapter,'wcResample',(a,f)=>describe(a[0],a.slice(5,6).concat(a.slice(10,12)),f,{mode:a[9],dst:a.slice(1,5),src:a.slice(6,9)}))
  wrap(owner.adapter,'fieldOp',(a,f)=>describe(a[0],a.slice(1,3),f,{mode:a[3],k:a[4]}))
  wrap(owner.backend,'copyRegion',(a,f)=>describe(a[1],[a[0]],f,{sourceOrigin:a[2],destinationOrigin:a[3],size:a[4]}))
  wrap(owner.backend,'copyField',(a,f)=>describe(a[1],[a[0]],f))}catch(error){for(const undo of hooks.reverse())undo();throw error}
  let restored=false;const restore=()=>{if(restored)return;restored=true;for(const fn of hooks.reverse())fn()};restores.push(restore)
  let task;try{task=original.call(owner,input)}catch(error){restore();throw error}
  if(!task){record.skipped=true;restore();return task}
  const step=task.step,finish=task.finish,dispose=task.dispose;let ordinal=0
  task.step=function(...args){record.phase='step-'+ordinal++;return step.apply(this,args)}
  task.finish=function(...args){record.phase='finish';return finish.apply(this,args)}
  task.dispose=function(...args){try{return dispose.apply(this,args)}finally{restore()}}
  return task
 }
 window.__restoreSettleWriteTrace=()=>{proto.prepareSettle=original;for(const restore of restores)restore()}
}
