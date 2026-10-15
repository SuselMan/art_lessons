import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {createProgram} from '../../../../apps/web/src/engine/src/raster/utils'
/** Presentation boundary only. Leaves all interior pigment/colour channels free. */
export function createContourClip(gl:WebGLRenderingContext,size:number){
 const out=new AccumulationBuffer(gl,size,size)
 const p=createProgram(gl,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}',`precision highp float;varying vec2 uv;uniform sampler2D image,contour,backing;void main(){float a=texture2D(contour,uv).a;float gate=smoothstep(.5/255.,2./255.,a);gl_FragColor=mix(texture2D(backing,uv),texture2D(image,uv),gate);}`)
 const q=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,q);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 return {draw(image:AccumulationBuffer,contour:AccumulationBuffer,backing:AccumulationBuffer){out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,q);const a=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);for(const [i,[name,b]] of [['image',image],['contour',contour],['backing',backing]].entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,(b as AccumulationBuffer).texture);gl.uniform1i(gl.getUniformLocation(p,name as string),i)}gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();gl.activeTexture(gl.TEXTURE0);return out},destroy(){out.destroy();gl.deleteBuffer(q);gl.deleteProgram(p)}}
}
