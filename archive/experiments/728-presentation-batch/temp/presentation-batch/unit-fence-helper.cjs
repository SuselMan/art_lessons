function createUnitFence(gl) {
 const previousTexture=gl.getParameter(gl.TEXTURE_BINDING_2D),previousFramebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING);
 let texture=null,framebuffer=null,disposed=false;
 try {
  texture=gl.createTexture();framebuffer=gl.createFramebuffer();
  if(!texture||!framebuffer)throw Error('Diagnostic fence allocation failed');
  gl.bindTexture(gl.TEXTURE_2D,texture);
  for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.NEAREST);
  for(const parameter of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Diagnostic fence incomplete');
 }catch(error){if(framebuffer)gl.deleteFramebuffer(framebuffer);if(texture)gl.deleteTexture(texture);throw error}
 finally {gl.bindFramebuffer(gl.FRAMEBUFFER,previousFramebuffer);gl.bindTexture(gl.TEXTURE_2D,previousTexture)}
 const pixel=new Uint8Array(4);
 return {
  sync(){if(disposed)throw Error('Diagnostic fence disposed');const prior=gl.getParameter(gl.FRAMEBUFFER_BINDING);try{gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,prior)}},
  dispose(){if(disposed)return;disposed=true;gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture)}
 };
}
module.exports={createUnitFence};
