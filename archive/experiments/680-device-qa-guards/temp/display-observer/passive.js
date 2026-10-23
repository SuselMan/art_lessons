// Observation only: no new GL calls, timer/RAF scheduling or app-state writes.
window.__installDisplayObserver = function() {
  const e=window.__engine, events=[], restores=[], active=[]
  const state=()=>({stroke:e._strokeLayerId||null,partialOK:e._paperPartialOK,damage:e._paperDamage?{...e._paperDamage}:null,pendingRAF:e._displayRafId,revealTimer:e._revealTimer,reveals:e._washReveals.size})
  const record=(kind,detail={})=>{if(events.length<2500)events.push({at:performance.now(),kind,scope:[...active],phase:window.__displayTracePhase||null,...state(),...detail})}
  for(const name of ['_onStart','_onEnd','_displayIfNotSuspended','_scheduleDisplay','_display','_takePaperPartial','_composePaperToScreen']) {
    const original=e[name];if(typeof original!=='function')continue
    e[name]=function(...args){const before=state();active.push(name);record(name+':enter',{argPartial:name==='_composePaperToScreen'?args[0]:undefined,stack:['_displayIfNotSuspended','_scheduleDisplay','_display'].includes(name)?new Error().stack?.split('\n').slice(2,7).join('\n'):undefined});try{const result=original.apply(this,args);record(name+':exit',{before,resultPartial:name==='_takePaperPartial'?result:undefined});return result}finally{active.pop()}}
    restores.push(()=>e[name]=original)
  }
  const stop=()=>{for(const restore of restores.reverse())restore();return events}
  window.__displayObserver={events,stop}
  return {cap:2500,observed:true,zeroAddedGL:true}
}
