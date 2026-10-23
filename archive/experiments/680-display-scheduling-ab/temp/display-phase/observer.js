window.__installDisplayPhaseObserver=function(){
 const e=__engine,g=e.gl,originalRAF=window.requestAnimationFrame;
 const saved={display:e._display,schedule:e._scheduleDisplay,invalidate:e._displayIfNotSuspended,paper:e._composePaperToScreen};
 let vsync=null,scope='external',rows=[],dropped=0,displayId=0;
 const bins={},frames=new Map();
 const caller=()=>new Error().stack?.split('\n').slice(2,6).join('\n');
 window.requestAnimationFrame=function(cb){return originalRAF.call(window,t=>{const prev=vsync;vsync=t;try{return cb(t)}finally{vsync=prev}})};
 const note=(kind,data={})=>{const phase=window.__displayObserverPhase||'external',k=phase+'|'+kind,b=bins[k]??={count:0,pendown:0};b.count++;if(e._strokeLayerId)b.pendown++;if(rows.length<2000)rows.push({at:performance.now(),phase,kind,vsync,...data});else dropped++};
 e._scheduleDisplay=function(...a){note('schedule',{pending:e._displayRafId!==null});return saved.schedule.apply(this,a)};
 e._displayIfNotSuspended=function(...a){const p=scope;scope='invalidate';note('invalidate',{caller:caller()});try{return saved.invalidate.apply(this,a)}finally{scope=p}};
 e._display=function(...a){const id=++displayId,phase=window.__displayObserverPhase||'external',key=vsync===null?null:phase+'|'+vsync; if(key){const frame=frames.get(key)||{phase,vsync,count:0};frame.count++;frames.set(key,frame)}note('display',{id,pending:e._displayRafId!==null,scope,caller:caller()});return saved.display.apply(this,a)};
 e._composePaperToScreen=function(partial,...a){note(partial?'partial':'full',{id:displayId,partial:partial?{...partial}:null});return saved.paper.call(this,partial,...a)};
 window.__displayPhaseObserver={result:()=>({bins,rows,dropped,duplicateFrames:[...frames.values()].filter(x=>x.count>1),limitation:'Passive wrappers; display/invalidation stacks add CPU overhead. No extra GL calls/readback/sync. Same-vsync counts exclude direct calls outside rAF execution.'}),restore(){window.requestAnimationFrame=originalRAF;e._display=saved.display;e._scheduleDisplay=saved.schedule;e._displayIfNotSuspended=saved.invalidate;e._composePaperToScreen=saved.paper}};
}
