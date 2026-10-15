export async function install(e) {
  const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');
  const proto=AccumulationBuffer.prototype, original=proto.copyTo;
  const stats={reused:0,fallback:0};
  proto.copyTo=function(dest){
    if(this.width!==dest.width||this.height!==dest.height){stats.fallback++;return original.call(this,dest)}
    stats.reused++;dest._invalidateMips();const gl=this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this._fbo);gl.bindTexture(gl.TEXTURE_2D,dest._texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,this.width,this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  };
  return {stats:()=>({...stats}),dispose(){proto.copyTo=original}};
}
