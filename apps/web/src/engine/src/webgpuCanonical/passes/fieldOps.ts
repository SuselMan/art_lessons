import { canonicalDispatchRect } from '../dispatchRect'
/// <reference types="@webgpu/types" />
import type { CanonicalGpuContext, CanonicalGpuField, CanonicalPassResources } from '../types'
export const CANONICAL_FIELD_OPS_WGSL = `
struct Params { dimsDir:vec4f,tau:vec4f,scalars:vec4f,scissor:vec4f,originSize:vec4f,bandWorld:vec4f,worldExtra:vec4f,dispatch:vec4u }
@group(0) @binding(0) var aTex:texture_2d<f32>;
@group(0) @binding(1) var bTex:texture_2d<f32>;
@group(0) @binding(2) var cTex:texture_2d<f32>;
@group(0) @binding(3) var dTex:texture_2d<f32>;
@group(0) @binding(4) var eTex:texture_2d<f32>;
@group(0) @binding(5) var pathTex:texture_2d<f32>;
@group(0) @binding(6) var noiseTex:texture_2d<f32>;
@group(0) @binding(7) var outTex:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(8) var<uniform> u:Params;
fn texel(t:texture_2d<f32>,q:vec2i)->vec4f {
 let dims=vec2i(textureDimensions(t));let clamped=clamp(q,vec2i(0),dims-vec2i(1));
 return textureLoad(t,vec2i(clamped.x,dims.y-1-clamped.y),0);
}
fn sample(t:texture_2d<f32>,uv:vec2f,bit:u32)->vec4f {
 let dims=vec2f(textureDimensions(t));
 if((u32(u.worldExtra.z)&bit)==0u){return texel(t,vec2i(floor(uv*dims)));}
 let q=uv*dims-.5;let i=vec2i(floor(q));let f=fract(q);
 return mix(mix(texel(t,i),texel(t,i+vec2i(1,0)),f.x),mix(texel(t,i+vec2i(0,1)),texel(t,i+vec2i(1,1)),f.x),f.y);
}
fn sampleA(uv:vec2f)->vec4f{return sample(aTex,uv,1u);}
fn sampleB(uv:vec2f)->vec4f{return sample(bTex,uv,2u);}
fn sampleC(uv:vec2f)->vec4f{return sample(cTex,uv,4u);}
fn sampleD(uv:vec2f)->vec4f{return sample(dTex,uv,8u);}
fn sampleE(uv:vec2f)->vec4f{return sample(eTex,uv,16u);}
fn samplePath(uv:vec2f)->vec4f{return sample(pathTex,uv,32u);}
fn peak(v:vec4f)->f32{return max(max(v.r,v.g),max(v.b,v.a));}
fn fit(v:vec4f)->vec4f{return v/max(1.0,peak(v));}
fn rimHash(p:vec2f)->f32{let q=17.0*fract(p*0.3183099+vec2f(0.11,0.17));return fract(q.x*q.y*(q.x+q.y));}
fn rimNoise(p:vec2f)->f32{let i=floor(p);let f=fract(p);let w=f*f*(3.0-2.0*f);return mix(mix(rimHash(i),rimHash(i+vec2f(1,0)),w.x),mix(rimHash(i+vec2f(0,1)),rimHash(i+vec2f(1,1)),w.x),w.y);}
fn lattice(cell:vec2f)->f32{return textureLoad(noiseTex,vec2i(cell-251.0*floor(cell/251.0)),0).r;}
fn warp(p:vec2f)->f32{let i=floor(p);let f=fract(p);let w=f*f*(3.0-2.0*f);return mix(mix(lattice(i),lattice(i+vec2f(1,0)),w.x),mix(lattice(i+vec2f(0,1)),lattice(i+vec2f(1,1)),w.x),w.y);}
fn gradient(cell:vec2f)->vec2f {
 let k=floor(lattice(cell)*8.0);
 if(k<1){return vec2f(1,0);}if(k<2){return vec2f(-1,0);}if(k<3){return vec2f(0,1);}if(k<4){return vec2f(0,-1);}
 if(k<5){return vec2f(.70710678,.70710678);}if(k<6){return vec2f(-.70710678,.70710678);}if(k<7){return vec2f(.70710678,-.70710678);}return vec2f(-.70710678,-.70710678);
}
fn gradientNoise(q:vec2f)->f32 {
 let i=floor(q);let f=fract(q);let w=f*f*(3.0-2.0*f);
 let a=dot(gradient(i),f);let b=dot(gradient(i+vec2f(1,0)),f-vec2f(1,0));let c=dot(gradient(i+vec2f(0,1)),f-vec2f(0,1));let d=dot(gradient(i+vec2f(1,1)),f-vec2f(1,1));
 return clamp(.5+1.2*mix(mix(a,b,w.x),mix(c,d,w.x),w.y),0,1);
}
fn fibre(wp:vec2f,radial:vec2f)->f32 {
 if(u.scalars.w>0.5){let w=warp(wp*.024+vec2f(71,13))-.5;let n=gradientNoise(wp*vec2f(.09,.18)+vec2f(.8,1.3)*w);let raw=.4+1.9*smoothstep(.58,.85,n);return .75+.25*(raw-.75);}
 let d0=vec2f(1,0);let d1=vec2f(.5,.8660254);let d2=vec2f(-.5,.8660254);
 let n=vec3f(rimNoise(vec2f(dot(wp,d0)*.03,dot(wp,vec2f(-d0.y,d0.x))*.35)),rimNoise(vec2f(dot(wp,d1)*.03,dot(wp,vec2f(-d1.y,d1.x))*.35)+vec2f(5,9)),rimNoise(vec2f(dot(wp,d2)*.03,dot(wp,vec2f(-d2.y,d2.x))*.35)+vec2f(17,3)));
 let r=length(radial);let direction=radial/max(r,1e-6);var weights=vec3f(dot(direction,d0),dot(direction,d1),dot(direction,d2));weights*=weights;weights*=weights;weights=mix(vec3f(1),weights,smoothstep(.004,.02,r));
 let fibres=vec3f(.4)+1.9*smoothstep(vec3f(.58),vec3f(.85),n);return dot(fibres,weights)/max(dot(weights,vec3f(1)),1e-6);
}
fn axis(k:i32)->vec2f{if(k==0){return vec2f(1,0);}if(k==1){return vec2f(-1,0);}if(k==2){return vec2f(0,1);}return vec2f(0,-1);}
fn carryWeight(ci:f32,uvi:vec2f,uvj:vec2f)->f32 {
 if(any(uvj<vec2f(0))||any(uvj>vec2f(1))){return 0;}
 let band=u.bandWorld.xy;let size=u.originSize.zw;let origin=u.originSize.xy;
 let cj=sampleD(uvj).r;if(cj>band.x){return 0;}
 let deltaCost=(cj-ci)*size.y;
 if(deltaCost>1e-3&&u.scalars.z>.5){
  let connected=samplePath(uvi);let delta=uvj-uvi;var allowed=connected.a;
  if(delta.x>0){allowed=connected.r;}else if(delta.x<0){allowed=connected.g;}else if(delta.y>0){allowed=connected.b;}
  if(u.scalars.z>1.5){let decoded=floor(floor(allowed*255.0+.5)/origin.x);allowed=decoded-2.0*floor(decoded/2.0);}
  if(allowed<.5){return 0;}
 }
 if(deltaCost<=1e-3){
  if(u.tau.z<=0||band.y<=0||ci>1e-5||cj>1e-5||origin.x>8){return 0;}
  if(u.tau.y<=u.tau.x){return 0;}
  var minV=4.0*min(sampleE(uvi).a,sampleE(uvj).a);if(minV<=0){return 0;}
  for(var step=1;step<8;step++){
   if(f32(step)<origin.x){let uvp=mix(uvi,uvj,f32(step)/origin.x);let vp=4.0*sampleE(uvp).a;if(sampleD(uvp).r>1e-5||vp<=0){return 0;}minV=min(minV,vp);}
  }
  return pow(4.0,size.x)*smoothstep(u.tau.x,u.tau.y,minV);
 }
 let fade=pow(1.0-smoothstep(0.0,band.x,cj),1.6);
 return pow(min(origin.x/deltaCost,4.0),size.x)*fade;
}
fn capillary(uv:vec2f)->f32{
 var h=0.0;
 for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){h+=sampleD(uv+vec2f(f32(i),f32(j))*u.dimsDir.zw*(3.0/max(u.originSize.x,1.0))).g;}}
 h/=9.0;return mix(1.0,1.0,1.0-smoothstep(.46,.54,h));
}
fn carry(uv:vec2f,a:vec4f,colour:bool)->vec4f{
 let ci=sampleD(uv).r;var out4=a;var m=a;if(colour){m=sampleC(uv);}
 let band=u.bandWorld.xy;let size=u.originSize.zw;let origin=u.originSize.xy;let dir=u.dimsDir.zw;let k=u.scalars.x;
 let trav=origin.y;let capI=capillary(uv)*(1.0-.85*smoothstep(0.0,band.x,ci));let Ti=trav*m.a/capI;
 if(ci<=band.x){
  var weights:array<f32,4>;var total=0.0;
  for(var n=0;n<4;n++){weights[n]=carryWeight(ci,uv,uv+axis(n)*dir);total+=weights[n];}
  for(var n=0;n<4;n++){
   let uvj=uv+axis(n)*dir;if(any(uvj<vec2f(0))||any(uvj>vec2f(1))){continue;}
   let aj=sampleA(uvj);var mj=aj;if(colour){mj=sampleC(uvj);}
   let cj=sampleD(uvj).r;let capJ=capillary(uvj)*(1.0-.85*smoothstep(0.0,band.x,cj));let Tj=trav*mj.a/capJ;
   var capIJ=2.0*capI*capJ/(capI+capJ);
   if(u.worldExtra.y>.5&&ci<=1e-5&&cj<=1e-5&&abs((cj-ci)*size.y)<=1e-3){
    let zeroPhase=weights[n]/pow(4.0,size.x);let zeroGive=k*.25*zeroPhase*min(max(Ti-Tj,0.0)*capIJ,trav*m.a);let zeroTake=k*.25*zeroPhase*min(max(Tj-Ti,0.0)*capIJ,trav*mj.a);
    out4-=a*(zeroGive/max(m.a,5e-5));out4+=aj*(zeroTake/max(mj.a,5e-5));
   }
   if(ci<=1e-5&&cj<=1e-5){capIJ*=weights[n]/pow(4.0,size.x);}
   if(weights[n]>0){out4-=a*(k*weights[n]/total*min(max(Ti-Tj,0.0)*capIJ,trav*m.a)/max(m.a,5e-5));}
   if(cj>band.x){continue;}
   if(Tj>Ti){var back=2;if(n==0){back=1;}else if(n==1){back=0;}else if(n==2){back=3;}
    var wj=0.0;var wme=0.0;
    for(var mm=0;mm<4;mm++){let w=carryWeight(cj,uvj,uvj+axis(mm)*dir);wj+=w;if(mm==back){wme=w;}}
    if(wme>0){out4+=aj*(k*wme/wj*min(max(Tj-Ti,0.0)*capIJ,trav*mj.a)/max(mj.a,5e-5));}
   }
  }
 }
 return fit(max(out4,vec4f(0)));
}

fn evaluate(uv:vec2f,px:vec2f)->vec4f {
 let a=sampleA(uv);let b=sampleB(uv);let k=u.scalars.x;let mode=u.scalars.y;let dir=u.dimsDir.zw;let origin=u.originSize.xy;let size=u.originSize.zw;let band=u.bandWorld.xy;let world=vec3f(u.bandWorld.zw,u.worldExtra.x);
 if(mode>19.5){return max(a,b);}
 if(mode>18.5){let m=smoothstep(k,k*4.0,a.a);if(dir.x>0){return vec4f(m,0,0,1);}return vec4f(1.0-m,0,0,1);}
 if(mode>17.5){
  let dome=sampleD(uv).a;
  if(origin.y>.5){let pm=sampleC(uv);let pf=sampleE(uv);let share=max(pm.a/max(pm.a+pf.a,5e-5),origin.x*dome);let add=k*share*dome*pf;let room=max(1.0-peak(pm),0);return a+(k*share*dome*b)*min(1.0,room/max(peak(add),5e-5));}
  let share=max(a.a/max(a.a+b.a,5e-5),origin.x*dome);let add=k*share*dome*b;let room=max(1.0-peak(a),0);return a+add*min(1.0,room/max(peak(add),5e-5));
 }
 if(mode>16.5){return vec4f(a.r,a.g,a.b*sampleD(uv).a,a.a);}
 if(mode>14.5){return carry(uv,a,mode>15.5);}
 if(mode>13.5){let bd=sampleD(uv);let c=sampleC(uv);return fit(a*(1.0-k*bd.g)+bd.b*b/max(c.b,1e-3));}
 if(mode>12.5){let share=a.a/max(a.a+b.a,5e-5);let add=k*share*b*sampleD(uv).r;let room=max(1.0-peak(a),0);return a+add*min(1.0,room/max(peak(add),5e-5));}
 if(mode>11.5){var m=0.0;if(k>=a.r){m=1;}return vec4f(m,0,sampleD(uv).r,1);}
 if(mode>10.5){let inside=1.0-smoothstep(band.x,band.x+size.x,sampleD(uv).r);var r=.5*inside;var green=0.0;var standing=inside*k;if(a.a>.002){r=a.r;green=a.g;standing=a.b;}return vec4f(r,green,standing,max(a.a,inside));}
 if(mode>9.5){let m=1.0-smoothstep(k,k*4.0,a.a*2.0);let rel=b.b/max(band.y,1e-4);let deep=smoothstep(.78,.84,rel);var cost=1.0;if(a.a*2.0>k){cost=mix(size.x,m*band.x,deep);}return vec4f(cost,0,0,1);}
 if(mode>8.5){return k*a*sampleD(uv).a;}
 if(mode>7.5){let bd=sampleD(uv);let c=sampleC(uv);return fit(a*(1.0-k*bd.a)+bd.r*b/max(c.r,1e-3));}
 if(mode>6.5){return k*a*sampleD(uv).g;}
 if(mode>5.5){
  let inward=sampleC(uv);let costOut=sampleD(uv).r;let costIn=inward.r;
  let inside=1.0-smoothstep(band.x,band.x+size.x,costOut);let sharp=1.0-smoothstep(1.5*size.y,3.0*size.y,costIn);let valley=1.0-smoothstep(.35,.6,inward.g);
  let tail=(1.0-smoothstep(band.y,band.y+size.y,costIn))*(.25+(1.0-.25)*valley);let profileBloom=inside*min(sharp+.6*tail,1.0);
  let filmCost=band.x-size.x;let wOut=band.y*size.x/size.y;
  let backrun=u.tau.x*inside*smoothstep(filmCost-wOut,filmCost-.4*wOut,costOut)*(1.0-smoothstep(filmCost-.6*size.x,filmCost-.3*size.x,costOut));
  let profileTide=inside*min(sharp+0.0*tail,1.0)+2.5*backrun;
  var bb=b.b;for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){bb=max(bb,sampleB(uv+vec2f(f32(i),f32(j))*dir).b);}}
  let stood=clamp(bb/max(origin.x,1e-3),0,1);let stoodW=mix(.15,1.0,stood);var ring=0.0;
  for(var n=0;n<8;n++){let ang=f32(n)*.7853982;let o=vec2f(cos(ang),sin(ang))*10.0*dir;ring+=1.0-smoothstep(band.x,band.x+size.x,sampleD(uv+o).r);}
  let convexW=mix(.3,1.0,smoothstep(.5,.25,ring/8.0));let over=inward.b*max(k,origin.y);let dome=inside*(1.0-smoothstep(.35*band.x,band.x,costOut));var rimPatch=1.0;
  if(world.z>0){let wp=(px+world.xy)*world.z*.012;let n=.63*rimNoise(wp)+.37*rimNoise(wp*2.7+vec2f(31.4,17.9));rimPatch=mix(.1,1.0,smoothstep(.45,.6,n));}
  return vec4f(profileBloom*stoodW,inside*(1.0-over)*rimPatch,profileTide*stoodW*convexW*(1.0-over)*rimPatch,dome);
 }
 if(mode>4.5){var s=vec4f(0);for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){var wx=1.0;var wy=1.0;if(i==0){wx=2;}if(j==0){wy=2;}s+=wx*wy*sampleA(uv+vec2f(f32(i),f32(j))*dir);}}return s/16.0;}
 if(mode>3.5){return vec4f(smoothstep(k,k*4.0,a.a*2.0),0,0,1);}
 if(mode>2.5){return clamp(a+b-sampleC(uv),vec4f(0),vec4f(1));}
 if(mode>1.5){return vec4f(a.b*u.tau.xyz/4.0,a.b);}
 if(mode>.5&&world.z>0&&origin.x>0){
  let cv=sampleC(uv);var across=0.0;var poolHere=0.0;if(cv.a>.004){across=clamp(cv.r/cv.a,0,1)*2.0-1.0;poolHere=clamp(cv.g/cv.a,0,1);}
  let wp=(px+world.xy)*world.z;let drift=rimNoise(wp*.0012+vec2f(71,13));let hq=vec2f(across*size.x,drift*3.0)+vec2f(3,29);let hair=.63*rimNoise(hq)+.37*rimNoise(hq*2.7+vec2f(31.4,17.9));var jump=0.0;
  for(var n=0;n<4;n++){let cn=sampleC(uv+axis(n)*2.0*dir);var an=across;if(cn.a>.004){an=clamp(cn.r/cn.a,0,1)*2.0-1.0;}jump=max(jump,abs(an-across));}
  let smoothAcross=1.0-smoothstep(.08,.2,jump);let comb=mix(1.0,2.0*smoothstep(.3,.7,hair),origin.x*smoothstep(.08,.4,poolHere)*smoothAcross);return fit(a+b*k*(comb-1.0));
 }
 var f=1.0;
 if(mode>.5&&world.z>0){let radial=vec2f(sampleD(uv-vec2f(3.0*dir.x,0)).a-sampleD(uv+vec2f(3.0*dir.x,0)).a,sampleD(uv-vec2f(0,3.0*dir.y)).a-sampleD(uv+vec2f(0,3.0*dir.y)).a);let halo=1.0-smoothstep(.02,.20,sampleD(uv).a);f=mix(1.0,fibre((px+world.xy)*world.z,radial),halo);}
 if(mode<.5){return max(a-b,vec4f(0))*k;}return fit(a+b*k*f);
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u){
 if(any(tid.xy>=u.dispatch.zw)){return;}let q=tid.xy+u.dispatch.xy;let dims=u.dimsDir.xy;if(any(q>=vec2u(dims))){return;}
 let px=vec2f(f32(q.x)+.5,dims.y-f32(q.y)-.5);if(any(px<u.scissor.xy)||any(px>=u.scissor.xy+u.scissor.zw)){return;}
 textureStore(outTex,vec2i(q),evaluate(px/dims,px));
}
`;
/** Diagnostic sampler arm only. The frozen manual baseline remains unchanged.
 * Applies ONLY to non-paper fields already marked LINEAR by the existing mask. */
export const CANONICAL_FIELD_OPS_HARDWARE_LINEAR_WGSL=CANONICAL_FIELD_OPS_WGSL
 .replace('@group(0) @binding(8) var<uniform> u:Params;', '@group(0) @binding(8) var<uniform> u:Params;\n@group(0) @binding(9) var diagnosticLinear:sampler;')
 .replace('return mix(mix(texel(t,i),texel(t,i+vec2i(1,0)),f.x),mix(texel(t,i+vec2i(0,1)),texel(t,i+vec2i(1,1)),f.x),f.y);',
  'return textureSampleLevel(t,diagnosticLinear,vec2f(uv.x,1.0-uv.y),0.0);')
export interface CanonicalFieldOptions {
 c?: CanonicalGpuField; d?: CanonicalGpuField; e?: CanonicalGpuField; path?: CanonicalGpuField; noise?: CanonicalGpuField
 dir?: readonly [number, number]; tau?: readonly [number, number, number]; scissor?: readonly [number, number, number, number]
 origin?: readonly [number, number]; size?: readonly [number, number]; band?: readonly [number, number]; world?: readonly [number, number, number]
 gradientFibres?: boolean; pathPacked?: boolean; additiveZeroFaces?: boolean
 /** Explicit override for component oracle; defaults to field.filter metadata. */
 diagnosticHardwareLinearInputs?: boolean
 linearInputMask?: number
}
export class CanonicalFieldOps {
 private pipeline: GPUComputePipeline | null=null
 private hardwareLinearPipeline:GPUComputePipeline|null=null
 private hardwareLinearSampler:GPUSampler|null=null
 private readonly device: GPUDevice
 private readonly specializeModes: boolean
 private readonly omitDeadCapillary: boolean
 private readonly specialized = new Map<number,GPUComputePipeline>()
 private layout: GPUBindGroupLayout|null=null
 private module: GPUShaderModule|null=null
 constructor(device: GPUDevice, diagnostic:{specializeModes?:boolean;omitDeadCapillary?:boolean}={}){this.device=device;this.specializeModes=diagnostic.specializeModes===true;this.omitDeadCapillary=diagnostic.omitDeadCapillary===true}
 private shaderCode():string {
  if(!this.omitDeadCapillary)return CANONICAL_FIELD_OPS_WGSL
  const start=CANONICAL_FIELD_OPS_WGSL.indexOf('fn capillary('),end=CANONICAL_FIELD_OPS_WGSL.indexOf('fn carry(',start)
  if(start<0||end<0)throw new Error('Diagnostic capillary anchor missing')
  return CANONICAL_FIELD_OPS_WGSL.slice(0,start)+'fn capillary(uv:vec2f)->f32{return 1.0;}\n'+CANONICAL_FIELD_OPS_WGSL.slice(end)
 }
 private pipelineFor(mode:number):GPUComputePipeline {
  if(!this.specializeModes){if(!this.pipeline)this.pipeline=this.device.createComputePipeline({label:'Canonical field ops',layout:'auto',compute:{module:this.device.createShaderModule({code:this.shaderCode()}),entryPoint:'main'}});return this.pipeline}
  const cached=this.specialized.get(mode);if(cached)return cached
  if(!this.layout)this.layout=this.device.createBindGroupLayout({entries:[...Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'float' as const,viewDimension:'2d' as const}})),{binding:7,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba8unorm',viewDimension:'2d'}},{binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:128}}]})
  if(!this.module)this.module=this.device.createShaderModule({code:'override FIELD_MODE:i32=-1;\n'+this.shaderCode().replace('let mode=u.scalars.y;','let mode=f32(FIELD_MODE);')})
  const pipeline=this.device.createComputePipeline({label:'Diagnostic canonical field mode '+mode,layout:this.device.createPipelineLayout({bindGroupLayouts:[this.layout]}),compute:{module:this.module,entryPoint:'main',constants:{FIELD_MODE:mode}}})
  this.specialized.set(mode,pipeline);return pipeline
 }
 run(ctx:CanonicalGpuContext,r:CanonicalPassResources,mode:number,k:number,o:CanonicalFieldOptions={}){
  if(!Number.isInteger(mode)||mode<0||mode>20)throw new Error('Canonical field mode not yet ported')
  if(ctx.device!==this.device)throw new Error('Canonical device mismatch')
  if(o.gradientFibres&&(o.world?.[2]??0)>0&&(!o.noise||o.noise.width!==251||o.noise.height!==251))throw new Error('Canonical gradient fibres require lattice')
  const fields=[r.a,r.b,o.c??r.c??r.b,o.d??r.b,o.e??r.b,o.path??r.b,o.noise??r.b]
  if(fields.some(f=>f.texture===r.out.texture))throw new Error('Canonical output aliases input')
  const inferredMask=fields.slice(0,6).reduce((mask,field,index)=>mask|('filter' in field&&field.filter==='linear'?1<<index:0),0)
  const linearMask=o.linearInputMask??inferredMask
  if(!Number.isInteger(linearMask)||linearMask<0||linearMask>63)throw new Error('Canonical input filter mask invalid')
  const w=r.out.width,h=r.out.height;const values=new Float32Array(32)
  values.set([w,h,(o.dir?.[0]??0)/w,(o.dir?.[1]??0)/h,...(o.tau??[0,0,0]),0,k,mode,o.path?(o.pathPacked?2:1):0,o.gradientFibres?1:0,...(o.scissor??[0,0,w,h]),...(o.origin??[0,0]),...(o.size??[w,h]),...(o.band??[0,0]),o.world?.[0]??0,o.world?.[1]??0,o.world?.[2]??0,o.additiveZeroFaces?1:0,linearMask,0])
  const rect=canonicalDispatchRect(w,h,o.scissor);new Uint32Array(values.buffer).set(rect,28)
  if(values.slice(0,28).some(v=>!Number.isFinite(v)))throw new Error('Canonical uniforms must be finite')
  if(o.diagnosticHardwareLinearInputs&&this.specializeModes)throw new Error('Combined sampler and specialization diagnostics are not supported')
  if(o.diagnosticHardwareLinearInputs&&!this.hardwareLinearPipeline)this.hardwareLinearPipeline=this.device.createComputePipeline({label:'DIAGNOSTIC canonical hardware LINEAR fields',layout:'auto',compute:{module:this.device.createShaderModule({code:CANONICAL_FIELD_OPS_HARDWARE_LINEAR_WGSL}),entryPoint:'main'}})
  const pipeline=o.diagnosticHardwareLinearInputs?this.hardwareLinearPipeline!:this.pipelineFor(mode)
  const uniform=this.device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(uniform,0,values)
  const entries:GPUBindGroupEntry[]=fields.map((f,binding)=>({binding,resource:f.view}))
  entries.push({binding:7,resource:r.out.view},{binding:8,resource:{buffer:uniform}})
  if(o.diagnosticHardwareLinearInputs){this.hardwareLinearSampler??=this.device.createSampler({minFilter:'linear',magFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});entries.push({binding:9,resource:this.hardwareLinearSampler})}
  const bind=this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries});const pass=ctx.encoder.beginComputePass({label:'Canonical fieldOp '+mode});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(rect[2]/8),Math.ceil(rect[3]/8));pass.end();return uniform
 }
}
