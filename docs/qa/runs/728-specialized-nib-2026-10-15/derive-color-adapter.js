export async function install(e){
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');
 const ctx=e._ribbonPainter.ctx,passes=e._watercolorPasses,film=new Map(),pending=new Map(),saved=[];let lastMass=null,flushing=false;const stats={skippedNibs:0,skippedBands:0,deferredAdds:0,filmDerivations:0,mergedWrites:0};
 const field=passes.fieldOp,colour=passes.pigmentColor;
 function materializeFilm(out){const record=film.get(out);if(!record)return;film.delete(out);colour.call(passes,out,record.mass,record.tau);stats.filmDerivations++}
 function flush(out){const r=pending.get(out);if(!r)return;pending.delete(out);const old=flushing;flushing=true;try{materializeFilm(r.args[2]);field.apply(passes,r.args);stats.mergedWrites++}finally{flushing=old}}
 function flushInputs(inputs){for(const input of inputs){if(!input)continue;flush(input);materializeFilm(input)}}
 function wrap(obj,name,fn){const original=obj[name];saved.push([obj,name,original]);obj[name]=fn(original)}
 wrap(ctx,'drawRibbonNibPass',original=>function(...a){if(a[5]===7){if(a[16]){if(!lastMass)throw Error('Missing current pigment film');film.set(a[0],{mass:lastMass,tau:[...a[16]]});stats.skippedNibs++;return}lastMass=a[0]}return original.apply(this,a)});
 wrap(ctx,'drawRibbonBands',original=>function(...a){if(a[3]==='ink'||a[3]==='ink-max'){if(a[12]){if(!lastMass)throw Error('Missing band pigment film');film.set(a[0],{mass:lastMass,tau:[...a[12]]});stats.skippedBands++;return}lastMass=a[0]}return original.apply(this,a)});
 wrap(passes,'fieldOp',original=>function(...a){
  if(!flushing&&a[3]===1&&a[4]===1&&film.has(a[2])&&a[5]?.scissor){
   const [out,base,src]=a;let r=pending.get(out);if(r&&(r.args[1]!==base||r.args[2]!==src)){flush(out);r=null}
   const rect=[...a[5].scissor];if(r){const old=r.args[5].scissor;const x=Math.min(old[0],rect[0]),y=Math.min(old[1],rect[1]);rect[2]=Math.max(old[0]+old[2],rect[0]+rect[2])-x;rect[3]=Math.max(old[1]+old[3],rect[1]+rect[3])-y;rect[0]=x;rect[1]=y}
   pending.set(out,{args:[out,base,src,1,1,{...a[5],scissor:rect}]});stats.deferredAdds++;return;
  }
  if(!flushing)flushInputs([a[1],a[2],a[5]?.c,a[5]?.d,a[5]?.e]);return original.apply(this,a);
 });
 wrap(passes,'wcResample',original=>function(...a){flushInputs([a[5],a[10],a[11]]);return original.apply(this,a)});
 for(const name of ['copyTo','copyRegionInto'])wrap(AccumulationBuffer.prototype,name,original=>function(...a){if(this.gl===e.gl)flushInputs([this]);return original.apply(this,a)});
 wrap(e,'_drawRibbonCompositeRect',original=>function(...a){flushInputs([a[4],a[5],a[6],a[7]]);return original.apply(this,a)});
 wrap(e,'_finishRibbonStroke',original=>function(...a){if(a[4])for(const out of [...pending.keys()])flush(out);return original.apply(this,a)});
 return{stats:()=>({...stats,pending:pending.size,films:film.size,approximation:'Colour film derived from quantized pigment mass. Optical mixing retained; not native byte parity.'}),dispose(){if(!e.gl.isContextLost())for(const out of [...pending.keys()])flush(out);pending.clear();film.clear();for(const[obj,name,fn]of saved)obj[name]=fn}};
}
