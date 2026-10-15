import {createProgram} from '../../../../apps/web/src/engine/src/raster/utils'
import type {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type {WatercolorPassField} from '../../../../apps/web/src/engine/src/raster/WatercolorPassTypes'

/** Symmetric bounded integer exchange: a full recipient can simultaneously give. */
export const UNBLOCKED_BRUSH_FRAG=`precision highp float;
varying vec2 uv;uniform sampler2D paint,flow,water;uniform vec2 texel,stepUV;uniform vec4 flowRect;uniform float gain;
vec2 snap(vec2 p){return (floor(p/texel)+.5)*texel;}
vec3 flowAt(vec2 p){vec2 q=(p-flowRect.xy)/flowRect.zw;if(min(min(q.x,q.y),min(1.-q.x,1.-q.y))<0.)return vec3(.5,.5,0.);return texture2D(flow,q).rgb;}
float exchange(vec2 a,vec2 b,vec2 dir){
 if(min(min(b.x,b.y),min(1.-b.x,1.-b.y))<0.)return 0.;
 vec3 f=flowAt(a),g=flowAt(b);float dose=min(f.b,g.b);
 float gate=smoothstep(.015,.15,min(texture2D(water,a).a,texture2D(water,b).a))*step(.015,texture2D(water,(a+b)*.5).a);
 vec2 velocity=(f.rg+g.rg)-1.;float clock=-log(max(1.-clamp(dose,0.,1.),1./255.));
 return min(.21,(.3535533905932738*gain*abs(dot(velocity,dir))*clock+.02*dose)*gate);
}
void main(){vec2 center=snap(uv);vec4 own=floor(texture2D(paint,center)*255.+.5),result=own;
 for(int k=0;k<4;k++){vec2 dir=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):vec2(0.,-1.);vec2 q=snap(center+dir*stepUV);float w=exchange(center,q,dir);vec4 other=floor(texture2D(paint,q)*255.+.5),delta=other-own;result+=sign(delta)*floor(abs(delta)*w);}
 gl_FragColor=result/255.;}`
export function createUnblockedBrush(gl:WebGLRenderingContext){
 const p=createProgram(gl,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}',UNBLOCKED_BRUSH_FRAG)
 const q=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,q);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 return {draw(field:WatercolorPassField,flow:WebGLTexture,radius:number,S:number,source:AccumulationBuffer,out:AccumulationBuffer,_pigment:AccumulationBuffer,rect:[number,number,number,number],scissor:[number,number,number,number],_color:AccumulationBuffer,gain:number,jump=1,mixScale=1){
  if(jump!==1||mixScale!==1)throw Error('M11 supports unit contact pulses only')
  out.beginReplaceDraw();gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,q);const a=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0)
  for(const [i,[name,texture]] of [['paint',source.texture],['flow',flow],['water',field.coverage.texture]].entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture as WebGLTexture);gl.uniform1i(gl.getUniformLocation(p,name as string),i)}
  const step=Math.max(1,Math.round(radius*.25/S));gl.uniform2f(gl.getUniformLocation(p,'stepUV'),step/field.w,step/field.h);gl.uniform2f(gl.getUniformLocation(p,'texel'),1/source.width,1/source.height);gl.uniform4fv(gl.getUniformLocation(p,'flowRect'),rect);gl.uniform1f(gl.getUniformLocation(p,'gain'),gain)
  gl.enable(gl.SCISSOR_TEST);gl.scissor(...scissor);gl.drawArrays(gl.TRIANGLES,0,6);gl.disable(gl.SCISSOR_TEST);out.endDraw();gl.activeTexture(gl.TEXTURE0)
 },destroy(){gl.useProgram(null);gl.deleteProgram(p);gl.deleteBuffer(q)}}
}
