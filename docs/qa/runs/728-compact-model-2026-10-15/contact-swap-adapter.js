export async function install(e) {
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');
 const proto=AccumulationBuffer.prototype, copy=proto.copyTo, resample=e._watercolorPasses.wcResample, fieldFor=e._diffuseFieldFor;
 const candidates=new WeakSet(), pairs=new WeakMap(), stats={swaps:0};
 e._diffuseFieldFor=function(...a){const f=fieldFor.apply(this,a);candidates.add(f.pressure);candidates.add(f.band);return f};
 e._watercolorPasses.wcResample=function(...a){const result=resample.apply(this,a);if(a[9]===1&&candidates.has(a[0])&&a[11])pairs.set(a[0],a[11]);return result};
 proto.copyTo=function(dest){
  if(pairs.get(this)!==dest||this.width!==dest.width||this.height!==dest.height||this._baseFilter!==dest._baseFilter)return copy.call(this,dest);
  pairs.delete(this);stats.swaps++;
  this._invalidateMips();dest._invalidateMips();
  [this._texture,dest._texture]=[dest._texture,this._texture];
  [this._fbo,dest._fbo]=[dest._fbo,this._fbo];
  this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);this.gl.bindTexture(this.gl.TEXTURE_2D,dest._texture);
 };
 return {stats:()=>({...stats}),dispose(){proto.copyTo=copy;e._watercolorPasses.wcResample=resample;e._diffuseFieldFor=fieldFor}};
}
