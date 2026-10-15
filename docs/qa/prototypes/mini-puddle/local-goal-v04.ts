import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { createProgram } from '../../../../apps/web/src/engine/src/raster/utils'
import type { WaterFootprint } from '../../../../apps/web/src/engine/src/watercolor/foreignWater'

/** A finite local influence footprint, not a connected-component or water sum. */
export function localInfluenceRadius(radius:number){return Math.max(.5,radius)+Math.max(8,Math.min(24,radius*.3))}
export function createLocalGoal(gl:WebGLRenderingContext,size:number){
 const mask=new AccumulationBuffer(gl,size,size),tmp=new AccumulationBuffer(gl,size,size)
 const disk=createProgram(gl,`attribute vec2 pos,center,radii,rotation;varying vec2 q;uniform float size;void main(){q=pos;vec2 d=pos*radii;vec2 xy=center+vec2(d.x*rotation.x-d.y*rotation.y,d.x*rotation.y+d.y*rotation.x);gl_Position=vec4(xy.x/size*2.-1.,1.-xy.y/size*2.,0.,1.);}`,`precision highp float;varying vec2 q;void main(){float a=1.-smoothstep(.97,1.,length(q));gl_FragColor=vec4(a);}`)
 const mix=createProgram(gl,`attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}`,`precision highp float;varying vec2 uv;uniform sampler2D oldGoal,newGoal,mask;void main(){gl_FragColor=mix(texture2D(oldGoal,uv),texture2D(newGoal,uv),texture2D(mask,uv).r);}`)
 const vertices=gl.createBuffer()!,quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 return {
  reset(contacts:readonly WaterFootprint[]){
   mask.clear();const data:number[]=[]
   for(const d of contacts){const r=localInfluenceRadius(d.radius);for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]])data.push(x,y,d.x,d.y,r*Math.max(1,d.aspect),r,Math.cos(d.angle),Math.sin(d.angle))}
   mask.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(disk);gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW)
   for(const [i,name] of ['pos','center','radii','rotation'].entries()){const a=gl.getAttribLocation(disk,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,32,i*8)}
   gl.uniform1f(gl.getUniformLocation(disk,'size'),size);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArrays(gl.TRIANGLES,0,data.length/8);gl.disable(gl.BLEND);mask.endDraw()
  },
  merge(old:AccumulationBuffer,next:AccumulationBuffer,dest:AccumulationBuffer){tmp.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(mix);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const a=gl.getAttribLocation(mix,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);for(const [i,[name,b]] of [['oldGoal',old],['newGoal',next],['mask',mask]].entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,(b as AccumulationBuffer).texture);gl.uniform1i(gl.getUniformLocation(mix,name as string),i)}gl.drawArrays(gl.TRIANGLES,0,6);tmp.endDraw();tmp.copyTo(dest);gl.activeTexture(gl.TEXTURE0)},
  destroy(){mask.destroy();tmp.destroy();gl.deleteBuffer(vertices);gl.deleteBuffer(quad);gl.deleteProgram(disk);gl.deleteProgram(mix)},
 }
}
