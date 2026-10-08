/** QA-only visual domain. Retained solvent record b/a defines water, not brush silhouette. */
export const PREVIEW_WATER_DOMAIN_FRAG = `precision highp float;
uniform sampler2D u_solvent; varying vec2 v_uv;
void main(){vec4 v=texture2D(u_solvent,v_uv);float wet=v.a>0.002?clamp(v.b/max(v.a,0.002),0.0,1.0):0.0;gl_FragColor=vec4(0.0,0.0,0.0,wet);}`;
export async function createPreviewWaterDomain(passes){
 const [{DISPLAY_VERT},{createProgram}]=await Promise.all([import('/src/engine/src/raster/shaders.ts'),import('/src/engine/src/raster/utils.ts')]);
 const ctx=passes.ctx,gl=ctx.gl(),program=createProgram(gl,DISPLAY_VERT,PREVIEW_WATER_DOMAIN_FRAG),position=gl.getAttribLocation(program,'a_position'),uniform=gl.getUniformLocation(program,'u_solvent');let disposed=false;
 return {draw(out,solvent){if(disposed||out.texture===solvent.texture||out.width!==128||solvent.width!==128)throw Error('Preview domain ownership/dimensions');out.beginReplaceDraw();gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,ctx.screenBuf());gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,solvent.texture);gl.uniform1i(uniform,0);gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw()},disposeAfterFence(){if(disposed)return;disposed=true;gl.deleteProgram(program)}}
}
