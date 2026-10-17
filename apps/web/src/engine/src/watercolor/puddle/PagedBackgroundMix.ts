import { AccumulationBuffer } from '../../buffers/AccumulationBuffer'
import { createProgram } from '../../raster/utils'
import { puddleDimensions, puddleLowDimensions, type PuddleSize } from './PuddleDimensions'
import { createPuddleNoiseTexture } from './PortablePuddleNoise'
import type { ReadPuddleParameters } from './PuddleParameters'
import type { MaterialFieldSnapshot, MaterialRect } from './MaterialFieldPages'
import { PAGED_VERTEX, buildPagedTapAtlas, createPagedDraw, type PagedBufferFactory } from './PagedContrastPhase'

export interface PagedBackgroundCapture {
 initialP: MaterialFieldSnapshot
 referenceP: MaterialFieldSnapshot
 coverage: MaterialFieldSnapshot
}
export interface PagedSolvedFields { p: MaterialFieldSnapshot; c: MaterialFieldSnapshot }
/** Global M70 coarse diffusion; only raw tap extraction happens on CPU. */
export function createPagedBackgroundMix(gl:WebGLRenderingContext,size:PuddleSize,readParameters:ReadPuddleParameters,portableNoise=true,factory?:PagedBufferFactory){
 const dimensions=puddleDimensions(size),low=puddleLowDimensions(size)
 const make=factory??((w,h,f)=>new AccumulationBuffer(gl,w,h,f)),draw=createPagedDraw(gl,dimensions)
 const noiseTexture=portableNoise?createPuddleNoiseTexture(gl):null
 const eligibility=createProgram(gl,PAGED_VERTEX,`precision highp float;varying vec2 uv;uniform sampler2D initial,reference,coverage;uniform vec2 grid;void main(){float peak=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 q=(floor(uv*grid)*3.+vec2(float(x)+1.5,float(y)+1.5))/(grid*3.);float a=texture2D(initial,q).a,b=texture2D(reference,q).a;if(a>.004)peak=max(peak,clamp(1.-b/a,0.,1.));}vec4 cov=texture2D(coverage,uv);float g=(1.-smoothstep(.03,.12,peak))*cov.a*step(.002,cov.b);gl_FragColor=vec4(g);}`)
 const copy=createProgram(gl,PAGED_VERTEX,`precision highp float;varying vec2 uv;uniform sampler2D taps;uniform vec2 grid;void main(){vec2 base=floor(uv*grid)*2.;vec2 size=grid*2.;gl_FragColor=.25*(texture2D(taps,(base+vec2(1.5,1.5))/size)+texture2D(taps,(base+vec2(.5,.5))/size)+texture2D(taps,(base+vec2(1.5,.5))/size)+texture2D(taps,(base+vec2(.5,1.5))/size));}`)
 const reconstructProgram=createProgram(gl,PAGED_VERTEX,`precision highp float;varying vec2 uv;varying vec2 localUV;uniform sampler2D source,lowBefore,lowAfter,coverage,eligible;uniform float strength,distortion;uniform vec2 worldSize,windowOrigin,windowExtent;
 ${portableNoise?'uniform sampler2D noiseLattice;float hash(vec2 p){return texture2D(noiseLattice,(p+.5)/256.).r;}':'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
 vec2 flow(vec2 p){return vec2(noise(p/36.+vec2(17.,3.)),noise(p/36.+vec2(3.,51.)))*2.-1.+.35*(vec2(noise(p/13.+vec2(81.,7.)),noise(p/13.+vec2(8.,91.)))*2.-1.);}
 void main(){float ownGate=texture2D(eligible,uv).r;vec2 shifted=clamp(uv+flow(uv*worldSize)*24.*distortion*ownGate/worldSize,vec2(0.),vec2(1.));float admissible=texture2D(eligible,shifted).r*step(.002,texture2D(coverage,(shifted*worldSize-windowOrigin)/windowExtent).a);vec4 displaced=mix(texture2D(lowAfter,uv),texture2D(lowAfter,shifted),admissible);float wet=step(.002,texture2D(coverage,localUV).a);gl_FragColor=clamp(mix(texture2D(source,localUV),displaced,strength*wet*ownGate),0.,1.);}`)
 const smooth=createProgram(gl,PAGED_VERTEX,'precision highp float;varying vec2 uv;uniform sampler2D source,eligible;uniform vec2 stride;void main(){vec4 own=texture2D(source,uv),value=own;float wi=texture2D(eligible,uv).r;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){if(x==0&&y==0)continue;vec2 p=uv+vec2(float(x),float(y))*stride;float wj=texture2D(eligible,p).r;value+=.08*min(wi,wj)*(texture2D(source,p)-own);}gl_FragColor=clamp(value,0.,1.);}')
 type Capture={eligible:AccumulationBuffer;strength:number;distortion:number;serial:number}
 type Solved={p0:AccumulationBuffer;c0:AccumulationBuffer;afterP:AccumulationBuffer;afterC:AccumulationBuffer;serial:number}
 let capture:Capture|undefined,solved:Solved|undefined,serial=0
 const freeSolved=(s:Solved)=>{for(const b of [s.p0,s.c0,s.afterP,s.afterC])b.destroy()}
 function validate(fields:Record<string,MaterialFieldSnapshot>){for(const f of Object.values(fields))if(f.width!==dimensions.width||f.height!==dimensions.height)throw Error('Background field dimensions differ')}
 const coarseRect={x:0,y:0,...dimensions}
 return {
  /** Coverage shifted lookups require this much raw halo around committed interiors. */
  get reconstructionHalo(){if(!capture)throw Error('Background not captured');return Math.ceil(32.4*Math.abs(capture.distortion))+1},
  capture(raw:PagedBackgroundCapture){
   validate({...raw})
   const resources:AccumulationBuffer[]=[]
   const alloc=(w:number,h:number,f:'nearest'|'linear')=>{const b=make(w,h,f);resources.push(b);return b}
   try{
    const initial=alloc(low.width*3,low.height*3,'nearest'),reference=alloc(low.width*3,low.height*3,'nearest'),coverage=alloc(low.width,low.height,'nearest'),eligible=alloc(low.width,low.height,'linear')
    initial.writePixels(buildPagedTapAtlas(raw.initialP,low,[-12,0,12]));reference.writePixels(buildPagedTapAtlas(raw.referenceP,low,[-12,0,12]));coverage.writePixels(buildPagedTapAtlas(raw.coverage,low,[0]))
    draw.draw(eligibility,eligible,{initial,reference,coverage},coarseRect,()=>gl.uniform2f(gl.getUniformLocation(eligibility,'grid'),low.width,low.height))
    const parameters=readParameters(),next={eligible,strength:parameters.backgroundStrength??.65,distortion:parameters.backgroundDistortion??.6,serial:++serial}
    const old=capture;capture=next;if(old)old.eligible.destroy()
    if(solved){freeSolved(solved);solved=undefined}
   }finally{for(const b of resources)if(b!==capture?.eligible)b.destroy()}
  },
  prepareSolved(raw:PagedSolvedFields){
   if(!capture)throw Error('Background not captured');validate({...raw})
   const current=capture,resources:AccumulationBuffer[]=[]
   const alloc=(w=low.width,h=low.height,f:'nearest'|'linear'='linear')=>{const b=make(w,h,f);resources.push(b);return b}
   try{
    const p0=alloc(),c0=alloc(),pa=alloc(),ca=alloc(),pb=alloc(),cb=alloc(),atlas=alloc(low.width*2,low.height*2,'nearest')
    for(const [source,out] of [[raw.p,p0],[raw.c,c0]] as const){
     atlas.writePixels(buildPagedTapAtlas(source,low,[-.5,.5]))
     draw.draw(copy,out,{taps:atlas},coarseRect,()=>gl.uniform2f(gl.getUniformLocation(copy,'grid'),low.width,low.height))
    }
    let ps=p0,cs=c0
    for(const [i,radius]of [2,4,8,4].entries()){
     const pd=i%2?pb:pa,cd=i%2?cb:ca
     for(const [source,out]of [[ps,pd],[cs,cd]] as const)draw.draw(smooth,out,{source,eligible:current.eligible},coarseRect,()=>gl.uniform2f(gl.getUniformLocation(smooth,'stride'),radius/low.width,radius/low.height))
     ps=pd;cs=cd
    }
    const next={p0,c0,afterP:ps,afterC:cs,serial:current.serial},old=solved;solved=next;if(old)freeSolved(old)
   }finally{for(const b of resources)if(!solved||![solved.p0,solved.c0,solved.afterP,solved.afterC].includes(b))b.destroy()}
  },
  /** rect describes the complete local window, including halo. Publish only its interior. */
  reconstruct(rect:MaterialRect,p:AccumulationBuffer,c:AccumulationBuffer,coverage:AccumulationBuffer,outP:AccumulationBuffer,outC:AccumulationBuffer){
   if(!capture||!solved||capture.serial!==solved.serial)throw Error('Background solved state not prepared')
   for(const b of [p,c,coverage,outP,outC])if(b.width!==rect.width||b.height!==rect.height)throw Error('Background window dimensions differ')
   const current=capture
   for(const [source,lowBefore,lowAfter,out]of [[p,solved.p0,solved.afterP,outP],[c,solved.c0,solved.afterC,outC]] as const)
    draw.draw(reconstructProgram,out,{source,lowBefore,lowAfter,coverage,eligible:current.eligible},rect,()=>{
     gl.uniform1f(gl.getUniformLocation(reconstructProgram,'strength'),current.strength);gl.uniform1f(gl.getUniformLocation(reconstructProgram,'distortion'),current.distortion)
     if(noiseTexture){gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,noiseTexture);gl.uniform1i(gl.getUniformLocation(reconstructProgram,'noiseLattice'),5)}
    })
  },
  readback(){if(!capture||!solved)throw Error('Background not prepared');return {gate:capture.eligible.readPixels(),beforeP:solved.p0.readPixels(),afterP:solved.afterP.readPixels(),beforeC:solved.c0.readPixels(),afterC:solved.afterC.readPixels()}},
  destroy(){if(solved)freeSolved(solved);if(capture)capture.eligible.destroy();solved=undefined;capture=undefined;draw.destroy();if(noiseTexture)gl.deleteTexture(noiseTexture);for(const p of [eligibility,copy,reconstructProgram,smooth])gl.deleteProgram(p)}
 }
}
