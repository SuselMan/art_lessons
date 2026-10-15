(() => {
 const e=window.__engine,events=[],costs={};window.__qaDryTrace={events,costs};window.__qaTraceActive=true;
 const state=()=>({queued:e._wcCanonical.queuedRequestCount,settle:e._settle?{next:e._settle.next,total:e._settle.ops.length}:null,opQueue:e._opQueue.length,active:e._wcDryWorkScheduler?.active,owners:e._wcMaterialOwners.layers.size});
 const note=(type,extra={})=>{if(window.__qaTraceActive)events.push({t:performance.now(),stage:window.__qaFrameStage??'setup',type,...state(),...extra})};
 for(const key of ['appendOperation','watercolorDryAll','_startDryWorkClock','_finishDryWorkClock','_waitForDryGpu','_advanceAsyncCanonical','_display']){
  const original=e[key];e[key]=function(...args){if(!window.__qaTraceActive)return original.apply(this,args);const relevant=key!=='appendOperation'||args[0]?.type==='paper_dry';const detailed=relevant&&!['_waitForDryGpu','_advanceAsyncCanonical','_display'].includes(key);if(detailed)note(key+':start',{ticket:key==='_finishDryWorkClock'?args[0]:undefined});const at=performance.now();try{return original.apply(this,args)}finally{const ms=performance.now()-at;if(relevant){const c=costs[key]??={calls:0,totalMs:0,maxMs:0};c.calls++;c.totalMs+=ms;c.maxMs=Math.max(c.maxMs,ms);if(detailed||ms>16)note(key+':end',{ms})}}};
 }
 document.addEventListener('click',ev=>{const b=ev.target.closest?.('button');if(b&&/dry everything|высушить всё/i.test((b.getAttribute('aria-label')??'')+' '+(b.title??'')))note('actual-dry-click')},true);
 window.__qaTraceTimer=setInterval(()=>{if(window.__qaTraceActive)note('sample')},50);note('installed');
})()
