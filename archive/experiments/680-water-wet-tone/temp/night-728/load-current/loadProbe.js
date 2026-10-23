(() => {
 const trace=window.__loadTrace={start:performance.now(),calls:[],engineSet:null}
 const wrapped=new WeakSet();let current
 Object.defineProperty(window,'__engine',{configurable:true,get:()=>current,set(e){
  current=e;if(!e)return;if(window.__qaAsyncLoad){e._wcAsyncFinish=true;e._settlePlan.splitQuanta=true}e.bakeNetworkSnapshot=()=>null;trace.engineSet=performance.now();if(wrapped.has(e))return;wrapped.add(e)
  for(const name of ['restoreLayerFromSnapshot','restoreHistoricalOperations','absorbHistoricalOperations','appendOperation']){
   const original=e[name];if(typeof original!=='function')continue
   e[name]=function(...args){const row={name,start:performance.now(),count:Array.isArray(args[0])?args[0].length:undefined,type:args[0]?.type,id:args[0]?.id};trace.calls.push(row)
    try{const result=original.apply(this,args);if(result?.then)return result.then(v=>{row.end=performance.now();return v},err=>{row.error=String(err);row.end=performance.now();throw err});row.end=performance.now();return result}
    catch(err){row.error=String(err);row.end=performance.now();throw err}
   }
  }
 }})
 let lastSample=-Infinity
 const watchReady=()=>{
  const e=window.__engine,now=performance.now()
  const state={at:now,engine:!!e,canvas:!!e?.canvas,paper:e?._paper?.loaded,locked:e?._locked,lost:e?.gl?.isContextLost(),pointerEvents:e?.canvas?getComputedStyle(e.canvas).pointerEvents:null,visibility:document.visibilityState,connected:e?.canvas?.isConnected,tool:window.__roomStore?.getState()?.tool,activeLayer:window.__roomStore?.getState()?.layerState?.activeId,ops:e?._log?.entries?.length}
  if(now-lastSample>=250){(trace.readySamples??=[]).push(state);lastSample=now}
  if(state.canvas&&state.paper&&!state.locked&&!state.lost&&state.pointerEvents!=='none'&&state.visibility==='visible'&&state.connected){trace.inputReady={...state,sinceNavigation:now,canonical:e._wcCanonical.pending,owners:e._wcAsyncOwners.size};return}
  requestAnimationFrame(watchReady)
 };requestAnimationFrame(watchReady)
})()
