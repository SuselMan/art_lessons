/** OFF float moment accumulator; no blend, no in-place feedback, no canonical writes. */
export async function createPreviewFixedAccumulator(gl,{dependencies=null}={}){
 const [{createProgram},{DISPLAY_VERT}]=dependencies??await Promise.all([import('/src/engine/src/raster/utils.ts'),import('/src/engine/src/raster/shaders.ts')]);
 const frag=`precision highp float;varying vec2 v_uv;uniform sampler2D u_fixed;uniform sampler2D u_mobile;uniform float u_weight;void main(){gl_FragColor=texture2D(u_fixed,v_uv)+u_weight*texture2D(u_mobile,v_uv);}`;
 const program=createProgram(gl,DISPLAY_VERT,frag);const position=gl.getAttribLocation(program,'a_position');
 const uniforms=Object.fromEntries(['u_fixed','u_mobile','u_weight'].map(n=>[n,gl.getUniformLocation(program,n)]));
 const buffer=gl.createBuffer();if(!buffer){gl.deleteProgram(program);throw Error('Preview accumulator geometry allocation')}
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);let disposed=false;
 return{draw({fixedP,fixedC,mobileP,mobileC,outP,outC,weight}){
  if(disposed||gl.isContextLost())throw Error('Accumulator unavailable');
  const fields=[fixedP,fixedC,mobileP,mobileC,outP,outC];if(!Number.isFinite(weight)||weight<0||weight>1||fields.some(f=>f.width!==128||f.height!==128)||new Set(fields.map(f=>f.texture)).size!==6)throw Error('Accumulator dimensions/feedback/weight');
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.viewport(0,0,128,128);gl.uniform1f(uniforms.u_weight,weight);
  for(const [fixed,mobile,out] of [[fixedP,mobileP,outP],[fixedC,mobileC,outC]]){gl.bindFramebuffer(gl.FRAMEBUFFER,out.fbo);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,fixed.texture);gl.uniform1i(uniforms.u_fixed,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mobile.texture);gl.uniform1i(uniforms.u_mobile,1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}
 },disposeAfterKnownIdle(){if(disposed)return;disposed=true;gl.deleteBuffer(buffer);gl.deleteProgram(program)}};
}
