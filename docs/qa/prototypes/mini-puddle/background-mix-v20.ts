import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {createProgram} from '../../../../apps/web/src/engine/src/raster/utils'
/** Gentle native diffusion only where M14 has neither a source peak without the later motion veto. */
export function createBackgroundMix(gl:WebGLRenderingContext,size:number,passes:any){
 let capturedStrength=.65
 const low=256,S=size/low,make=()=>new AccumulationBuffer(gl,low,low,'linear')
 const eligible=make(),gate=make(),p0=make(),c0=make(),pa=make(),ca=make(),pb=make(),cb=make(),full=new AccumulationBuffer(gl,size,size)
 const vertex='attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}'
 const eligibility=createProgram(gl,vertex,`precision highp float;varying vec2 uv;uniform sampler2D initial,reference,coverage;uniform vec2 margin;void main(){float peak=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 q=uv+vec2(float(x),float(y))*margin;float a=texture2D(initial,q).a,b=texture2D(reference,q).a;if(a>.004)peak=max(peak,clamp(1.-b/a,0.,1.));}vec4 cov=texture2D(coverage,uv);float g=(1.-smoothstep(.03,.12,peak))*cov.a*step(.002,cov.b);gl_FragColor=vec4(g);}`)

 const copy=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D source;uniform vec2 texel;void main(){gl_FragColor=.25*(texture2D(source,uv+texel*.5)+texture2D(source,uv-texel*.5)+texture2D(source,uv+vec2(texel.x,-texel.y)*.5)+texture2D(source,uv+vec2(-texel.x,texel.y)*.5));}')
 const reconstruct=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D source,lowBefore,lowAfter,coverage;uniform float strength;void main(){vec4 delta=texture2D(lowAfter,uv)-texture2D(lowBefore,uv);float wet=step(.002,texture2D(coverage,uv).a);gl_FragColor=clamp(texture2D(source,uv)+strength*delta*wet,0.,1.);}')
 const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 function draw(program:WebGLProgram,out:AccumulationBuffer,textures:Record<string,AccumulationBuffer>,uniform?:()=>void){out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const a=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);Object.entries(textures).forEach(([name,t],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.uniform1i(gl.getUniformLocation(program,name),i)});uniform?.();gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();gl.activeTexture(gl.TEXTURE0)}
 return{capture(initial:AccumulationBuffer,reference:AccumulationBuffer,coverage:AccumulationBuffer){capturedStrength=(globalThis as any).__miniTuning?.backgroundStrength??.65;draw(eligibility,eligible,{initial,reference,coverage},()=>gl.uniform2f(gl.getUniformLocation(eligibility,'margin'),12/size,12/size))},ops(p:AccumulationBuffer,c:AccumulationBuffer,coverage:AccumulationBuffer,_initialP:AccumulationBuffer,_initialC:AccumulationBuffer){
  const strength=capturedStrength;const setStrength=()=>gl.uniform1f(gl.getUniformLocation(reconstruct,'strength'),strength);const ops:Array<()=>void>=[]
  ops.push(()=>draw(copy,gate,{source:eligible},()=>gl.uniform2f(gl.getUniformLocation(copy,'texel'),0,0)))
  ops.push(()=>{for(const [source,out]of [[p,p0],[c,c0]])draw(copy,out,{source},()=>gl.uniform2f(gl.getUniformLocation(copy,'texel'),1/size,1/size))})
  let ps=p0,cs=c0
  for(const [i,radius]of [8,16,8,4].entries()){const pd=i%2?pb:pa,cd=i%2?cb:ca,P=ps,C=cs;ops.push(()=>{const paper=passes.ctx.paperWorldSize(),field={w:low,h:low,coverage:gate};passes.diffuseStep(field,0,0,S,paper.w,paper.h,C,cd,radius,i%2===1,gate);passes.diffuseStep(field,0,0,S,paper.w,paper.h,P,pd,radius,i%2===1,gate)});ps=pd;cs=cd}
  const finalP=ps,finalC=cs
  ops.push(()=>{draw(reconstruct,full,{source:p,lowBefore:p0,lowAfter:finalP,coverage},setStrength);full.copyTo(p)})
  ops.push(()=>{draw(reconstruct,full,{source:c,lowBefore:c0,lowAfter:finalC,coverage},setStrength);full.copyTo(c)})
  return ops
 },readback(){return{gate:gate.readPixels(),beforeP:p0.readPixels(),afterP:pb.readPixels(),beforeC:c0.readPixels(),afterC:cb.readPixels()}},destroy(){gl.useProgram(null);for(const p of [eligibility,copy,reconstruct])gl.deleteProgram(p);gl.deleteBuffer(quad);for(const b of [eligible,gate,p0,c0,pa,ca,pb,cb,full])b.destroy()}}
}
