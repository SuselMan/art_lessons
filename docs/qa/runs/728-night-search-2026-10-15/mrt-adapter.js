import { DISPLAY_VERT, WC_BRUSH_DRAG_FRAG } from '/src/engine/src/raster/shaders.ts';
import { createProgram, getUniforms } from '/src/engine/src/raster/utils.ts';
export function install(engine) {
 const gl=engine.gl, passes=engine._watercolorPasses, ext=gl.getExtension('WEBGL_draw_buffers');
 if(!ext || gl.getParameter(ext.MAX_DRAW_BUFFERS_WEBGL)<2) throw Error('No WebGL1 MRT');
 const main=`void main() {
 vec2 center=snapUV(v_uv);
 vec4 ownP=floor(texture2D(u_pigment,center)*255.0+0.5), ownC=floor(texture2D(u_color,center)*255.0+0.5);
 vec4 resultP=ownP,resultC=ownC;
 for(int k=0;k<4;k++) {
  vec2 dir=axis(k),neighbour=snapUV(center+dir*u_step);
  float leave=integerFraction(center,neighbour,dir);
  float enter=integerFraction(neighbour,center,-dir);
  resultP-=floor(ownP*leave);
  resultP+=floor(floor(texture2D(u_pigment,neighbour)*255.0+0.5)*enter);
  resultC-=floor(ownC*leave);
  resultC+=floor(floor(texture2D(u_color,neighbour)*255.0+0.5)*enter);
 }
 gl_FragData[0]=resultP/255.0;
 gl_FragData[1]=resultC/255.0;
 }`;
 const shader='#extension GL_EXT_draw_buffers : require\n'+WC_BRUSH_DRAG_FRAG.slice(0,WC_BRUSH_DRAG_FRAG.lastIndexOf('void main()'))+main;
 const prog=createProgram(gl,DISPLAY_VERT,shader),u=getUniforms(gl,prog,['u_flow','u_water','u_pigment','u_step','u_flowRect','u_color','u_contactGain','u_texel']),pos=gl.getAttribLocation(prog,'a_position');
 const orig=passes.brushPass;let pending=null,draws=0;
 passes.brushPass=function(...a){
  if(!pending){pending=a;return}
  const prev=pending;pending=null;
  const [field,flowTexture,radiusPx,S,source,out,pigment,rect,scissor,color,gain]=a;
  const colorOut=prev[5];
  if(prev[6]!==pigment || prev[9]!==color || prev[10]!==gain || prev[0]!==field || prev[1]!==flowTexture)throw Error('Nonpaired contact');
  colorOut.beginReplaceDraw();colorOut.endDraw();out.beginReplaceDraw();
  gl.framebufferTexture2D(gl.FRAMEBUFFER,ext.COLOR_ATTACHMENT1_WEBGL,gl.TEXTURE_2D,colorOut.texture,0);
  ext.drawBuffersWEBGL([ext.COLOR_ATTACHMENT0_WEBGL,ext.COLOR_ATTACHMENT1_WEBGL]);
  if(!draws && gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete MRT');
  try{
   gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,passes.ctx.screenBuf());gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   for(const [unit,name,texture] of [[1,'u_flow',flowTexture],[2,'u_water',field.coverage.texture],[3,'u_pigment',pigment.texture],[4,'u_color',color.texture]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(u[name],unit)}
   const step=Math.max(1,Math.round(radiusPx*.25/S));gl.uniform2f(u.u_step,step/field.w,step/field.h);gl.uniform2f(u.u_texel,1/pigment.width,1/pigment.height);gl.uniform1f(u.u_contactGain,gain);gl.uniform4fv(u.u_flowRect,rect);
   gl.enable(gl.SCISSOR_TEST);gl.scissor(...scissor);gl.drawArrays(gl.TRIANGLES,0,6);draws++;
  }finally{gl.disable(gl.SCISSOR_TEST);ext.drawBuffersWEBGL([ext.COLOR_ATTACHMENT0_WEBGL]);gl.framebufferTexture2D(gl.FRAMEBUFFER,ext.COLOR_ATTACHMENT1_WEBGL,gl.TEXTURE_2D,null,0);out.endDraw();gl.activeTexture(gl.TEXTURE0)}
 };
 return {stats:()=>({draws,pending:!!pending}),dispose:()=>{passes.brushPass=orig;gl.useProgram(null);gl.deleteProgram(prog)}};
}
