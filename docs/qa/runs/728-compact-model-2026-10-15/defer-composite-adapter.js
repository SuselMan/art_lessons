export function install(e) {
  const display=e._display, flush=e._flushLiveComposite;
  let inDisplay=false;
  const stats={skipped:0,flushed:0};
  e._display=function(...args){inDisplay=true;try{return display.apply(this,args)}finally{inDisplay=false}};
  e._flushLiveComposite=function(...args){
    if(inDisplay && e._wcDryWorkScheduler?.active && e._liveComposite){stats.skipped++;return}
    if(e._liveComposite)stats.flushed++;
    return flush.apply(this,args);
  };
  return {stats:()=>({...stats}),dispose(){e._display=display;e._flushLiveComposite=flush}};
}
