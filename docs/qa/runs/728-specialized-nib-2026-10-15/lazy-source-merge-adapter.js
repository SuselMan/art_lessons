export async function install(e){
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');const ctx=e._ribbonPainter.ctx,passes=e._watercolorPasses,field=passes.fieldOp,producers=new WeakSet(),pending=new Map(),saved=[];let flushing=false;const stats={deferred:0,materialized:0,barriers:0,maxPending:0};
 function flush(){if(flushing||!pending.size)return;flushing=true;const records=[...pending.values()];pending.clear();stats.barriers++;try{for(const args of records){field.apply(passes,args);stats.materialized++}}finally{flushing=false}}
 function prepare(buffers){if(buffers.some(b=>pending.has(b)))flush()}
 function wrap(obj,name,fn){const original=obj[name];saved.push([obj,name,original]);obj[name]=fn(original)}
 wrap(ctx,'drawRibbonNibPass',original=>function(...a){const value=original.apply(this,a);if(a[5]===7)producers.add(a[0]);return value});
 wrap(ctx,'drawRibbonBands',original=>function(...a){const value=original.apply(this,a);if(a[3]==='ink'||a[3]==='ink-max')producers.add(a[0]);return value});
 wrap(ctx,'fieldOp',original=>function(...a){
  if(!flushing&&a[3]===1&&a[4]===1&&a[5]?.scissor&&producers.has(a[2])&&a[0]!==a[1]&&a[0]!==a[2]){
   producers.delete(a[2]);prepare([a[1],a[2]]);const[out,base,film]=a;let old=pending.get(out);if(old&&(old[1]!==base||old[2]!==film)){flush();old=null}
   const r=[...a[5].scissor];if(old){const q=old[5].scissor,x=Math.min(q[0],r[0]),y=Math.min(q[1],r[1]);r[2]=Math.max(q[0]+q[2],r[0]+r[2])-x;r[3]=Math.max(q[1]+q[3],r[1]+r[3])-y;r[0]=x;r[1]=y}
   pending.set(out,[out,base,film,1,1,{...a[5],scissor:r}]);stats.deferred++;stats.maxPending=Math.max(stats.maxPending,pending.size);return;
  }return original.apply(this,a);
 });
 wrap(passes,'fieldOp',original=>function(...a){if(!flushing)prepare([a[0],a[1],a[2],a[5]?.c,a[5]?.d,a[5]?.e]);return original.apply(this,a)});
 wrap(passes,'wcResample',original=>function(...a){prepare([a[0],a[5],a[10],a[11]]);return original.apply(this,a)});
 for(const name of ['copyTo','copyRegionInto'])wrap(AccumulationBuffer.prototype,name,original=>function(...a){if(this.gl===e.gl)prepare([this,a[0]]);return original.apply(this,a)});
 for(const name of ['readPixels','readPixelsRegion'])wrap(AccumulationBuffer.prototype,name,original=>function(...a){if(this.gl===e.gl)prepare([this]);return original.apply(this,a)});
 for(const name of ['_drawRibbonNibPass','_drawRibbonBands'])wrap(e,name,original=>function(...a){prepare([a[0]]);return original.apply(this,a)});
 wrap(e,'_drawRibbonCompositeRect',original=>function(...a){flush();return original.apply(this,a)});
 wrap(e,'_finishRibbonStroke',original=>function(...a){if(a[4])flush();return original.apply(this,a)});
 return{stats:()=>({...stats,pending:pending.size}),dispose(){if(!e.gl.isContextLost())flush();pending.clear();for(const[obj,name,fn]of saved)obj[name]=fn}};
}
