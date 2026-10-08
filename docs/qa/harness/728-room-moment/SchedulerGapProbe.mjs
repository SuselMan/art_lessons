/** OFF bounded CPU/rAF attribution. No GPU API calls, fences, or console. */
export function installSchedulerGapProbe(e,{limit=768,now=()=>performance.now(),raf=requestAnimationFrame,cancel=cancelAnimationFrame}={}){
 const records=[],hooks=[];let frame=0,lastFrame=null,phase='between',depth=0,closed=false;
 const state=()=>({phase,locked:!!e._locked,drawing:!!e._strokeLayerId,lost:!!e._contextLost,canonicalQueued:e._wcCanonical?.requests?.length??null,canonicalFrame:e._wcCanonical?.frame??null,canonicalWork:!!e._wcCanonical?.work,settle:!!e._settle,opQueue:e._opQueue?.length??null,rebuild:e._rebuildJobs?.size??null});
 const append=r=>{if(records.length<limit)records.push(r)};
 const wrap=(object,key,label,newPhase)=>{
  if(!object||typeof object[key]!=='function')return;
  const original=object[key],wrapper=function(...args){if(closed||records.length>=limit)return original.apply(this,args);const previous=phase;if(newPhase)phase=newPhase;const record={kind:'call',label,start:now(),depth:depth++,before:state()};try{return original.apply(this,args)}catch(error){record.error=String(error);throw error}finally{record.end=now();record.durationMs=record.end-record.start;record.after=state();depth--;phase=previous;append(record)}};
  object[key]=wrapper;hooks.push(()=>{if(object[key]!==wrapper)throw Error('Scheduler probe overwritten '+label);object[key]=original});
 };
 for(const [key,p]of[['_handleDown','down'],['_handleMove','move'],['_handleUp','up']])wrap(e._pointer,key,'PointerInput.'+key,p);
 for(const key of ['_onStart','_onMove','_onEnd','_advanceAsyncCanonical','_runSlice','_finishRibbonStroke','_prepareRibbonSettle','_scheduleDisplay','_render'])wrap(e,key,'Engine.'+key);
 for(const key of ['enqueue','advance','cancel'])wrap(e._wcCanonical,key,'CanonicalFIFO.'+key);
 for(const key of ['start','tick','advance','complete'])wrap(e._settleQueue,key,'SettleQueue.'+key);
 const tick=at=>{if(closed)return;append({kind:'raf',at,gapMs:lastFrame===null?null:at-lastFrame,state:state()});lastFrame=at;if(records.length<limit)frame=raf(tick);else frame=0};frame=raf(tick);
 return{records,restore(){closed=true;if(frame)cancel(frame);for(const undo of hooks.reverse())undo()}};
}
