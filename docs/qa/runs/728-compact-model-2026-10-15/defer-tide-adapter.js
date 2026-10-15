import {RibbonStrokeScratch} from '/src/engine/src/buffers/RibbonStrokeScratch.ts';
import {pigmentAbsorption} from '/src/engine/src/watercolor/pigmentOptics.ts';
export function install(e){const capture=RibbonStrokeScratch.prototype.captureCanonicalFinish,start=e._startDryWorkClock,finish=e._finishDryWorkClock,plan=e._settlePlan,prepare=plan.prepare,tide=plan.groupTideOps;const finished=new Map(),bounds=[];let context=null,skipped=0,kept=0,captures=0;const rows=[];
RibbonStrokeScratch.prototype.captureCanonicalFinish=function(...a){const f=capture.apply(this,a);if(f){finished.set(this,Math.max(finished.get(this)??-1,f.gesture));captures++}return f};
e._startDryWorkClock=function(...a){const ticket=start.apply(this,a);bounds.push({ticket,max:new Map(finished)});return ticket};
e._finishDryWorkClock=function(ticket,...a){const r=finish.call(this,ticket,...a);const i=bounds.findIndex(b=>b.ticket===ticket);if(i>=0)bounds.splice(i,1);return r};
plan.prepare=function(...a){const previous=context;context={scratch:a[0],metadata:a[12]??a[0]};try{return prepare.apply(this,a)}finally{context=previous}};
plan.groupTideOps=function(...a){const c=context,bound=c?bounds.find(b=>b.max.has(c.scratch))?.max.get(c.scratch):undefined,gesture=c?.metadata.gesture;rows.push({gesture,latest:c?.scratch.gesture,material:c?.scratch.materialGesture,bound,dryTo:c?e._wcAsyncDryTo.get(c.scratch):undefined,active:e._wcDryWorkScheduler?.active});
if(!c||!e._wcDryWorkScheduler?.active||bound===undefined||gesture>=bound){kept++;return tide.apply(this,a)}
skipped++;const[ops,,,,,,paints,dep,col,outDep,outCol]=a;ops.push(()=>{dep.copyTo(outDep);if(col)col.copyTo(outCol);else{const only=[...paints][0],tau=only?pigmentAbsorption(only.split(',').map(Number)):[0,0,0];e._watercolorPasses.pigmentColor(outCol,outDep,tau)}})};
return{stats:()=>({captures,skipped,kept,rows}),dispose(){RibbonStrokeScratch.prototype.captureCanonicalFinish=capture;e._startDryWorkClock=start;e._finishDryWorkClock=finish;plan.prepare=prepare;plan.groupTideOps=tide;finished.clear();bounds.length=0}}}
