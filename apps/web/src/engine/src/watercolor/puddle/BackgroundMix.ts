import {puddleDimensions,puddleLowDimensions,type PuddleSize} from './PuddleDimensions'
import {createPuddleNoiseTexture} from './PortablePuddleNoise'
import type {ReadPuddleParameters} from './PuddleParameters'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {createProgram} from '../../raster/utils'
/** M70 background diffusion and spatial distortion outside selected pigment peaks.
 * Room M70 uses the offline lattice; Mini retains the approved legacy hash for reference. */
export function createBackgroundMix(gl:WebGLRenderingContext,size:PuddleSize,readParameters: ReadPuddleParameters, portableNoise=false){
 const {width,height}=puddleDimensions(size),low=puddleLowDimensions(size)
 const noiseTexture=portableNoise?createPuddleNoiseTexture(gl):null
 let capturedStrength=.65,capturedDistortion=.6
 const make=()=>new AccumulationBuffer(gl,low.width,low.height,'linear')
 const eligible=make(),gate=make(),p0=make(),c0=make(),pa=make(),ca=make(),pb=make(),cb=make(),full=new AccumulationBuffer(gl,width,height)
 const vertex='attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}'
 const eligibility=createProgram(gl,vertex,`precision highp float;varying vec2 uv;uniform sampler2D initial,reference,coverage;uniform vec2 margin;void main(){float peak=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 q=uv+vec2(float(x),float(y))*margin;float a=texture2D(initial,q).a,b=texture2D(reference,q).a;if(a>.004)peak=max(peak,clamp(1.-b/a,0.,1.));}vec4 cov=texture2D(coverage,uv);float g=(1.-smoothstep(.03,.12,peak))*cov.a*step(.002,cov.b);gl_FragColor=vec4(g);}`)

 const copy=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D source;uniform vec2 texel;void main(){gl_FragColor=.25*(texture2D(source,uv+texel*.5)+texture2D(source,uv-texel*.5)+texture2D(source,uv+vec2(texel.x,-texel.y)*.5)+texture2D(source,uv+vec2(-texel.x,texel.y)*.5));}')
 const reconstruct=createProgram(gl,vertex,`precision highp float;varying vec2 uv;uniform sampler2D source,lowBefore,lowAfter,coverage,eligible;uniform float strength,distortion;uniform vec2 worldSize;
 ${portableNoise?'uniform sampler2D noiseLattice;float hash(vec2 p){return texture2D(noiseLattice,(p+.5)/256.).r;}':'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
 vec2 flow(vec2 p){return vec2(noise(p/36.+vec2(17.,3.)),noise(p/36.+vec2(3.,51.)))*2.-1.+.35*(vec2(noise(p/13.+vec2(81.,7.)),noise(p/13.+vec2(8.,91.)))*2.-1.);}
 void main(){float ownGate=texture2D(eligible,uv).r;vec2 shifted=clamp(uv+flow(uv*worldSize)*24.*distortion*ownGate/worldSize,vec2(0.),vec2(1.));float admissible=texture2D(eligible,shifted).r*step(.002,texture2D(coverage,shifted).a);vec4 displaced=mix(texture2D(lowAfter,uv),texture2D(lowAfter,shifted),admissible);float wet=step(.002,texture2D(coverage,uv).a);gl_FragColor=clamp(mix(texture2D(source,uv),displaced,strength*wet*ownGate),0.,1.);}`)
 const smooth=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D source,eligible;uniform vec2 stride;void main(){vec4 own=texture2D(source,uv),value=own;float wi=texture2D(eligible,uv).r;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){if(x==0&&y==0)continue;vec2 p=uv+vec2(float(x),float(y))*stride;float wj=texture2D(eligible,p).r;value+=.08*min(wi,wj)*(texture2D(source,p)-own);}gl_FragColor=clamp(value,0.,1.);}')
 const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 function draw(program:WebGLProgram,out:AccumulationBuffer,textures:Record<string,AccumulationBuffer>,uniform?:()=>void){out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const a=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);Object.entries(textures).forEach(([name,t],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.uniform1i(gl.getUniformLocation(program,name),i)});uniform?.();gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();gl.activeTexture(gl.TEXTURE0)}
 return{capture(initial:AccumulationBuffer,reference:AccumulationBuffer,coverage:AccumulationBuffer){capturedStrength=readParameters().backgroundStrength??.65;capturedDistortion=readParameters().backgroundDistortion??.6;draw(eligibility,eligible,{initial,reference,coverage},()=>gl.uniform2f(gl.getUniformLocation(eligibility,'margin'),12/width,12/height))},ops(p:AccumulationBuffer,c:AccumulationBuffer,coverage:AccumulationBuffer,_initialP:AccumulationBuffer,_initialC:AccumulationBuffer){
  const strength=capturedStrength;const distortion=capturedDistortion;const setStrength=()=>{gl.uniform1f(gl.getUniformLocation(reconstruct,'strength'),strength);gl.uniform1f(gl.getUniformLocation(reconstruct,'distortion'),distortion);gl.uniform2f(gl.getUniformLocation(reconstruct,'worldSize'),width,height);if(noiseTexture){gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,noiseTexture);gl.uniform1i(gl.getUniformLocation(reconstruct,'noiseLattice'),5)}};const ops:Array<()=>void>=[]
  ops.push(()=>draw(copy,gate,{source:eligible},()=>gl.uniform2f(gl.getUniformLocation(copy,'texel'),0,0)))
  ops.push(()=>{for(const [source,out]of [[p,p0],[c,c0]])draw(copy,out,{source},()=>gl.uniform2f(gl.getUniformLocation(copy,'texel'),1/width,1/height))})
  let ps=p0,cs=c0
  for(const [i,radius]of [2,4,8,4].entries()){const pd=i%2?pb:pa,cd=i%2?cb:ca,P=ps,C=cs;ops.push(()=>{for(const [source,out]of [[P,pd],[C,cd]])draw(smooth,out,{source,eligible:gate},()=>gl.uniform2f(gl.getUniformLocation(smooth,'stride'),radius/low.width,radius/low.height))});ps=pd;cs=cd}
  const finalP=ps,finalC=cs
  ops.push(()=>{draw(reconstruct,full,{source:p,lowBefore:p0,lowAfter:finalP,coverage,eligible},setStrength);full.copyTo(p)})
  ops.push(()=>{draw(reconstruct,full,{source:c,lowBefore:c0,lowAfter:finalC,coverage,eligible},setStrength);full.copyTo(c)})
  return ops
 },readback(){return{gate:gate.readPixels(),beforeP:p0.readPixels(),afterP:pb.readPixels(),beforeC:c0.readPixels(),afterC:cb.readPixels()}},destroy(){if(noiseTexture)gl.deleteTexture(noiseTexture);gl.useProgram(null);for(const p of [eligibility,copy,reconstruct,smooth])gl.deleteProgram(p);gl.deleteBuffer(quad);for(const b of [eligible,gate,p0,c0,pa,ca,pb,cb,full])b.destroy()}}
}
