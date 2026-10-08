/** Own OFF program. Fractional convex transport, unchanged source shader expression/order. */
export async function createPreviewFractionalDiffuse(passes){
 const[{createProgram,getUniforms},{DISPLAY_VERT,WC_DIFFUSE_FRAG},{WET_DIFFUSE_D,WET_DIFFUSE_B}]=await Promise.all([import('/src/engine/src/raster/utils.ts'),import('/src/engine/src/raster/shaders.ts'),import('/src/engine/src/watercolor/wetDiffusion.ts')]);
 const gl=passes.gl??passes.ctx.gl();const program=createProgram(gl,DISPLAY_VERT,WC_DIFFUSE_FRAG);const position=gl.getAttribLocation(program,'a_position');
 const u=getUniforms(gl,program,['u_ink','u_coverage','u_paperHeightMap','u_resolution','u_paperOrigin','u_paperTexSize','u_paperScale','u_d','u_b','u_radius','u_stencil']);let disposed=false;
 return{draw({src,out,coverage,world,paperWidth,paperHeight,radius,knight,fraction}){
  if(disposed||gl.isContextLost()||!Number.isFinite(fraction)||fraction<0||fraction>1||src.texture===out.texture||coverage.texture===out.texture)throw Error('Fractional diffusion lifecycle/feedback');
  out.beginReplaceDraw();gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,passes.ctx.screenBuf());gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  for(const [unit,name,texture]of[[0,'u_ink',src.texture],[1,'u_coverage',coverage.texture],[2,'u_paperHeightMap',passes.ctx.paperTex()]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(u[name],unit)}
  gl.uniform2f(u.u_resolution,128,128);gl.uniform2f(u.u_paperOrigin,world.x/8,-(world.y/8+128));gl.uniform2f(u.u_paperTexSize,paperWidth/8,paperHeight/8);gl.uniform2f(u.u_paperScale,passes.ctx.paperScale(),passes.ctx.paperScale());
  gl.uniform1f(u.u_d,WET_DIFFUSE_D*fraction);gl.uniform1f(u.u_b,WET_DIFFUSE_B*fraction);gl.uniform1f(u.u_radius,Math.max(1,Math.round(radius/8)));gl.uniform1f(u.u_stencil,knight?1:0);gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();
 },disposeAfterKnownIdle(){if(disposed)return;disposed=true;gl.deleteProgram(program)}};
}
