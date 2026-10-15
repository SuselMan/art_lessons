export function install(e,phase){const stats={},stack=[],restore=[];
function wrap(obj,key,label=key){if(typeof obj[key]!=='function')return;const original=obj[key];obj[key]=function(...a){const at=performance.now(),frame={child:0};stack.push(frame);try{return original.apply(this,a)}finally{const elapsed=performance.now()-at;stack.pop();if(stack.length)stack.at(-1).child+=elapsed;const k=phase()+':'+label,s=stats[k]??={calls:0,inclusiveMs:0,exclusiveMs:0,maxMs:0};s.calls++;s.inclusiveMs+=elapsed;s.exclusiveMs+=Math.max(0,elapsed-frame.child);s.maxMs=Math.max(s.maxMs,elapsed)}};restore.push(()=>obj[key]=original)}
for(const key of ['_display','_advanceAsyncCanonical','_runSlice','_syncContinuationGpu','_waitForDryGpu','_diffuseFieldFor'])wrap(e,key);
for(const key of ['fieldOp','waterFrontStep','brushPass','wcResample','pigmentColor'])wrap(e._watercolorPasses,key,'passes.'+key);
for(const key of ['prepare','groupTideOps'])wrap(e._settlePlan,key,'plan.'+key);
wrap(e._settleQueue,'advance','settle.advance');
for(const key of ['readPixels','finish','drawArrays','texImage2D','texSubImage2D','copyTexSubImage2D','checkFramebufferStatus','getParameter'])wrap(e.gl,key,'gl.'+key);
return{stats:()=>stats,dispose(){for(const fn of restore.reverse())fn()}}}
