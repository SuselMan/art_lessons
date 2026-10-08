/** OFF candidate: only preview P0/C0/P1/C1, never canonical fields. */
export const FLOAT_PREVIEW_POOL_BYTES=3*(1024*1024*4+2*128*128*4+4*128*128*16);
const roles=['p0','c0','p1','c1'];
export function allocatePreviewPairs(gl,{enabled=false,budgetBytes,createQ8,excluded=[]}={}){
 if(typeof createQ8!=='function')throw Error('Explicit existing Q8 allocator required');
 const q8=reason=>{const fields={};let released=false;try{for(const r of roles)fields[r]=createQ8(128,128,'nearest');return {format:'rgba8',reason,fields,bytes:4*128*128*4,destroyAfterKnownIdle(){if(released)return;released=true;for(const f of Object.values(fields))f.destroy()}}}catch(e){for(const f of Object.values(fields))f.destroy();throw e}};
 if(!enabled)return q8('OFF');
 if(!Number.isSafeInteger(budgetBytes)||budgetBytes<FLOAT_PREVIEW_POOL_BYTES)throw Error('Explicit15.375MiB total three-slot budget required');
 if(gl.isContextLost())throw Error('Lost context: skip preview allocation');
 if(!gl.getExtension('OES_texture_float')||!gl.getExtension('WEBGL_color_buffer_float'))return q8('Renderable Float32 unavailable');
 if((gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision??0)<23)return q8('Fragment highp<23bits');
 const previous={active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),fbo:gl.getParameter(gl.FRAMEBUFFER_BINDING)};
 const fields={},identities=new Set(excluded.map(f=>f.texture??f));let reason;
 try{for(const role of roles){
  let texture=null,fbo=null;
  try{texture=gl.createTexture();fbo=gl.createFramebuffer();if(!texture||!fbo)throw Error('Float pair allocation failed');if(identities.has(texture))throw Error('Float preview source/output alias');identities.add(texture);
   gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,128,128,0,gl.RGBA,gl.FLOAT,null);
   for(const [p,v]of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,p,v);
   gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Float pair framebuffer incomplete');
   if(gl.getError()!==gl.NO_ERROR)throw Error('Float pair GL error');
   let destroyed=false;fields[role]={gl,width:128,height:128,texture,fbo,format:'rgba32f',beginReplaceDraw(){if(destroyed)throw Error('Destroyed preview field');gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,128,128);gl.disable(gl.BLEND)},endDraw(){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD)},destroy(){if(destroyed)return;destroyed=true;gl.deleteFramebuffer(fbo);gl.deleteTexture(texture)}};
  }catch(e){if(fbo)gl.deleteFramebuffer(fbo);if(texture)gl.deleteTexture(texture);throw e}
 }}catch(e){reason=String(e);for(const field of Object.values(fields))field.destroy()}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous.fbo);gl.activeTexture(previous.active);gl.bindTexture(gl.TEXTURE_2D,previous.texture)}
 if(reason)return q8(reason);
 let released=false;
 return {format:'rgba32f',reason:null,fields,bytes:4*128*128*16,destroyAfterKnownIdle(){if(released)return;released=true;for(const field of Object.values(fields))field.destroy()}};
}
