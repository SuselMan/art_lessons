import {createProgram} from '../../../../apps/web/src/engine/src/raster/utils'
import type {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
/** Experimental phase split at initial concentration gradients, independent of prior goals. */
export function createLocalPhase(gl:WebGLRenderingContext){
 const program=createProgram(gl,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}',`precision highp float;varying vec2 uv;uniform sampler2D value,pigment;uniform vec2 delta;
 void main(){float own=texture2D(pigment,uv).a;
 float low=min(min(texture2D(pigment,uv+vec2(delta.x,0.)).a,texture2D(pigment,uv-vec2(delta.x,0.)).a),min(texture2D(pigment,uv+vec2(0.,delta.y)).a,texture2D(pigment,uv-vec2(0.,delta.y)).a));
 float mobile=smoothstep(.02,.2,(own-low)/max(.025,own));
 gl_FragColor=texture2D(value,uv)*(1.-mobile);}`)
 const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 return{draw(value:AccumulationBuffer,pigment:AccumulationBuffer,out:AccumulationBuffer){out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const a=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);for(const [i,[name,buf]]of [['value',value],['pigment',pigment]].entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,(buf as AccumulationBuffer).texture);gl.uniform1i(gl.getUniformLocation(program,name as string),i)}gl.uniform2f(gl.getUniformLocation(program,'delta'),12/value.width,12/value.height);gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();gl.activeTexture(gl.TEXTURE0)},destroy(){gl.deleteProgram(program);gl.deleteBuffer(quad)}}
}
