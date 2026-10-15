import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {createProgram} from '../../../../apps/web/src/engine/src/raster/utils'
/** Replace the visible prior pair with its predicted future; keep the new material delta. */
export function createGoalChain(gl:WebGLRenderingContext){
 const p=createProgram(gl,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}',`precision highp float;varying vec2 uv;uniform sampler2D live,base,prior;void main(){gl_FragColor=max(texture2D(live,uv)-texture2D(base,uv)+texture2D(prior,uv),vec4(0.));}`)
 const q=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,q);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 return {draw(live:AccumulationBuffer,base:AccumulationBuffer,prior:AccumulationBuffer,dest:AccumulationBuffer){dest.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,q);const a=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);for(const [i,[name,b]] of [['live',live],['base',base],['prior',prior]].entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,(b as AccumulationBuffer).texture);gl.uniform1i(gl.getUniformLocation(p,name as string),i)}gl.drawArrays(gl.TRIANGLES,0,6);dest.endDraw();gl.activeTexture(gl.TEXTURE0)},destroy(){gl.deleteProgram(p);gl.deleteBuffer(q)}}
}
