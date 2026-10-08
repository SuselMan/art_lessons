/** OFF observation only. Instance hooks, bounded CPU records, no added GPU calls. */
export function installContinuationFenceProbe(engine,{limit=128,now=()=>performance.now()}={}){
 const gl=engine.gl,original=engine._syncContinuationGpu,rows=[],hooks=[];let serial=0,active=null,previousEnd=null;
 if(typeof original!=='function')throw Error('Actual continuation sync required');
 for(const name of ['drawArrays','copyTexSubImage2D','copyTexImage2D','clear','texImage2D','texSubImage2D','bufferData','bufferSubData','readPixels','finish']){
  const fn=gl[name];if(typeof fn!=='function')continue;
  const had=Object.hasOwn(gl,name),descriptor=Object.getOwnPropertyDescriptor(gl,name);
  const wrapper=function(...args){if(active)active.calls[name]=(active.calls[name]??0)+1;if(!active||!['readPixels','finish'].includes(name))serial++;return fn.apply(this,args)};
  Object.defineProperty(gl,name,{configurable:true,writable:true,value:wrapper});hooks.push(()=>{if(gl[name]!==wrapper)throw Error('Probe hook replaced '+name);if(had)Object.defineProperty(gl,name,descriptor);else delete gl[name]});
 }
 const wrapped=function(...args){
  if(active||rows.length>=limit)return original.apply(this,args);
  const observeStart=now();
  const stack=new Error().stack??'',label=stack.includes('_runSlice')?'runSlice':stack.includes('_advanceAsyncCanonical')?'asyncCanonical':stack.includes('WatercolorSettleQueue')?'settleQueue':'unresolved';
  const measuredStart=now();const row={label,observerSetupMs:measuredStart-observeStart,start:measuredStart,beforeSerial:serial,calls:{},sincePreviousMs:previousEnd===null?null:now()-previousEnd,previousSerial:rows.at(-1)?.afterSerial??null};active=row;
  try{return original.apply(this,args)}catch(error){row.error=String(error);throw error}finally{row.end=now();row.durationMs=row.end-row.start;row.afterSerial=serial;previousEnd=row.end;active=null;if(rows.length<limit)rows.push(row)}
 };
 engine._syncContinuationGpu=wrapped;
 return{rows,restore(){if(engine._syncContinuationGpu!==wrapped)throw Error('Sync probe replaced');engine._syncContinuationGpu=original;for(const undo of hooks.reverse())undo()}};
}
