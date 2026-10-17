import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,validateSize,type Candidate,type Input} from './contract'
export interface ParticleConfig {samples?:number;steps?:number;stepPixels?:number;paperGain?:number;persistence?:number;maxEstimatedReads?:number}
export function chooseParticleQuantum(totalAlpha:number,samples:number){if(!Number.isSafeInteger(totalAlpha)||totalAlpha<0||![1,2,4,8,16].includes(samples))throw Error('Invalid particle budget');let quantum=256;while(totalAlpha*quantum>0xffffffff)quantum/=2;if(quantum<samples)throw Error('Particle fixedpoint budget insufficient');return quantum}
/** Worst-case environment loads:8proposal wet+paper pairs, <=stepPixels+1 path reads,4splat probes. */
export function estimateParticleWork(size:number,occupiedWetPixels:number,samples:number,steps:number,stepPixels:number){
 const estimatedEnvironmentReads=occupiedWetPixels*(1+samples*(steps*(16+stepPixels+1)+4))
 return{occupiedWetPixels,estimatedEnvironmentReads,unconditionalSourceReads:size*size,estimatedWalks:occupiedWetPixels*samples}
}
export function hashParticle(x:number){x=((x>>>0)^((x>>>0)>>>16))>>>0;x=Math.imul(x,0x7feb352d)>>>0;x=(x^(x>>>15))>>>0;x=Math.imul(x,0x846ca68b)>>>0;return(x^(x>>>16))>>>0}
/** Pure geometry guard, checked at <=1px intervals; no long step may tunnel across a dry pixel. */
export function particlePathWet(water:Uint8Array,size:number,x:number,y:number,nx:number,ny:number){const distance=Math.hypot(nx-x,ny-y),count=Math.max(1,Math.ceil(distance));for(let t=1;t<=count;t++){const xx=Math.floor(x+(nx-x)*t/count+.5),yy=Math.floor(y+(ny-y)*t/count+.5);if(xx<0||yy<0||xx>=size||yy>=size||water[yy*size+xx]===0)return false}return true}
/** Integer bilinear partition oracle; all four pieces sum to the original units exactly. */
export function partitionParticleUnits(total:number,tx:number,ty:number){if(!Number.isSafeInteger(total)||total<0||tx<0||tx>1||ty<0||ty>1)throw Error('Invalid splat');const a=Math.floor(total*(1-tx)*(1-ty)),b=Math.floor(total*tx*(1-ty)),c=Math.floor(total*(1-tx)*ty);return[a,b,c,total-a-b-c]}
/** CDF allocation bounded by alpha capacities: exact per-channel sums AND premultiplication at each destination. */
export function partitionParticleRGBA(units:readonly number[],tx:number,ty:number){
 if(units.length!==4||units.some(v=>!Number.isInteger(v)||v<0||v>units[3])||units[3]>65280)throw Error('Invalid premultiplied units')
 const alpha=units[3];if(alpha===0)return Array.from({length:4},()=>[0,0,0,0]);const shares=partitionParticleUnits(alpha,tx,ty),out=Array.from({length:4},()=>[0,0,0,0]);
 for(let c=0;c<4;c++){let cumulative=0,previous=0;for(let k=0;k<4;k++){cumulative+=shares[k];const next=Math.floor(units[c]*cumulative/alpha);out[k][c]=next-previous;previous=next}}return out
}
const PARAMS=/* wgsl */`struct Params {size:u32,samples:u32,steps:u32,stepPixels:u32,paperGain:f32,persistence:f32,seed:u32,quantum:u32}`
export const MACRO2_PARTICLES=PARAMS+/* wgsl */`
@group(0) @binding(0) var<storage,read> original:array<u32>;
@group(0) @binding(1) var<storage,read> environment:array<u32>;
@group(0) @binding(2) var<storage,read_write> accum:array<atomic<u32>>;
@group(0) @binding(3) var<uniform> p:Params;
const DIR=array<vec2f,8>(vec2f(-1,0),vec2f(1,0),vec2f(0,-1),vec2f(0,1),vec2f(-0.70710678,-0.70710678),vec2f(0.70710678,-0.70710678),vec2f(-0.70710678,0.70710678),vec2f(0.70710678,0.70710678));
fn hash(x:u32)->u32{var v=x;v=(v^(v>>16u))*0x7feb352du;v=(v^(v>>15u))*0x846ca68bu;return v^(v>>16u);}
fn valid(q:vec2i)->bool{return all(q>=vec2i(0))&&all(q<vec2i(i32(p.size)));}
fn index(q:vec2i)->u32{return u32(q.y)*p.size+u32(q.x);}
fn wet(q:vec2i)->bool{if(!valid(q)){return false;}return (environment[index(q)]&255u)>0u;}
fn pathWet(a:vec2f,b:vec2f)->bool{let count=max(1u,u32(ceil(distance(a,b))));for(var t=1u;t<=count;t++){let q=vec2i(floor(mix(a,b,f32(t)/f32(count))+vec2f(0.5)));if(!wet(q)){return false;}}return true;}
fn add(i:u32,channel:u32,value:u32){atomicAdd(&accum[i*4u+channel],value);}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let sourceIndex=gid.y*p.size+gid.x;let code=original[sourceIndex];if(code==0u){return;}
 let rgba=vec4u(code&255u,(code>>8u)&255u,(code>>16u)&255u,code>>24u);let units=rgba*(p.quantum/p.samples);
 // Fully dry pigment stays exact; no stochastic walk is launched into a dry domain.
 if(!wet(vec2i(gid.xy))){for(var c=0u;c<4u;c++){add(sourceIndex,c,rgba[c]*p.quantum);}return;}
 for(var sampleIndex=0u;sampleIndex<p.samples;sampleIndex++){
  var pos=vec2f(gid.xy);var previous=vec2f(0);var state=hash(sourceIndex^p.seed^((sampleIndex+1u)*0x9e3779b9u));
  for(var step=0u;step<p.steps;step++){
   var weights:array<f32,8>;var total=0.0;
   for(var k=0u;k<8u;k++){let endpoint=vec2i(floor(pos+DIR[k]*f32(p.stepPixels)+vec2f(0.5)));var weight=0.0;
    if(wet(endpoint)){let height=f32((environment[index(endpoint)]>>8u)&255u)/255.0;let affinity=1.0/(1.0+p.paperGain*height);weight=affinity*(1.0+p.persistence*max(0.0,dot(previous,DIR[k])));}
    weights[k]=weight;total+=weight;
   }
   if(total<=0.0){break;}state=hash(state+step+1u);let target=f32(state>>8u)*(1.0/16777216.0)*total;var cumulative=0.0;var chosen=7u;
   for(var k=0u;k<8u;k++){cumulative+=weights[k];if(target<cumulative){chosen=k;break;}}
   let next=pos+DIR[chosen]*f32(p.stepPixels);if(pathWet(pos,next)){pos=next;previous=DIR[chosen];}else{previous=vec2f(0);}
  }
  let base=vec2i(floor(pos));let t=fract(pos);let ids=array<vec2i,4>(base,base+vec2i(1,0),base+vec2i(0,1),base+vec2i(1,1));
  var allWet=true;for(var k=0u;k<4u;k++){allWet=allWet&&wet(ids[k]);}
  if(!allWet){let closest=vec2i(floor(pos+vec2f(0.5)));for(var c=0u;c<4u;c++){add(index(closest),c,units[c]);}}
  else{let alpha=units.a;let a=u32(floor(f32(alpha)*(1.0-t.x)*(1.0-t.y)));let b=u32(floor(f32(alpha)*t.x*(1.0-t.y)));let d=u32(floor(f32(alpha)*(1.0-t.x)*t.y));let pieces=array<u32,4>(a,b,d,alpha-a-b-d);
   for(var c=0u;c<4u;c++){var cumulative=0u;var previousCode=0u;for(var k=0u;k<4u;k++){cumulative+=pieces[k];let nextCode=units[c]*cumulative/alpha;add(index(ids[k]),c,nextCode-previousCode);previousCode=nextCode;}}
  }
 }
}`
export const MACRO2_PARTICLE_PACK=PARAMS+/* wgsl */`
@group(0) @binding(0) var<storage,read> accum:array<u32>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
@group(0) @binding(2) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;var bytes:vec4u;for(var c=0u;c<4u;c++){bytes[c]=u32(min(255.0,floor(f32(accum[i*4u+c])/f32(p.quantum)+0.5)));}output[i]=bytes.r|(bytes.g<<8u)|(bytes.b<<16u)|(bytes.a<<24u);}`
export async function create(device:GPUDevice,size:number,config:ParticleConfig={}):Promise<Candidate>{
 validateSize(size);if(size>1024)throw Error('Particle prototype bounded to1024');const samples=integerOption(config.samples??8,1,16,'samples');if(![1,2,4,8,16].includes(samples))throw Error('Samples must divide256 as power of2')
 const steps=integerOption(config.steps??32,1,128,'steps'),stepPixels=integerOption(config.stepPixels??12,1,24,'stepPixels'),paperGain=config.paperGain??4,persistence=config.persistence??2
 const maxEstimatedReads=integerOption(config.maxEstimatedReads??128000000,1,500000000,'maxEstimatedReads')
 if(!Number.isFinite(paperGain)||paperGain<0||paperGain>32||!Number.isFinite(persistence)||persistence<0||persistence>16)throw Error('Invalid particle material parameters')
 if(device.limits.maxStorageBufferBindingSize<size*size*16||device.limits.maxStorageBuffersPerShaderStage<3)throw Error('Particle device limits insufficient')
 const walk=await pipeline(device,MACRO2_PARTICLES,'805-macro2-particle-walk'),pack=await pipeline(device,MACRO2_PARTICLE_PACK,'805-macro2-particle-pack'),usage=BUFFER.STORAGE|BUFFER.COPY_DST
 const original=buffer(device,size*size*4,usage,'particle-original'),environment=buffer(device,size*size*4,usage,'particle-water-paper'),accum=buffer(device,size*size*16,usage,'particle-fixedpoint-accum'),output=buffer(device,size*size*4,BUFFER.STORAGE|BUFFER.COPY_SRC,'particle-output'),staging=buffer(device,size*size*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'particle-readback'),params=buffer(device,32,BUFFER.UNIFORM|BUFFER.COPY_DST,'particle-params'),all=[original,environment,accum,output,staging,params]
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))}),walkGroup=bind(walk,[original,environment,accum,params]),packGroup=bind(pack,[accum,output,params]);let uploaded=false,hasOutput=false,destroyed=false,inputAlpha=0,quantum=256,estimatedWork=estimateParticleWork(size,0,samples,steps,stepPixels)
 const metadata={algorithm:'deterministic-paper-particle-transport',size,samples,steps,stepPixels,paperGain,persistence,get quantumUnitsPerCode(){return quantum},get inputAlphaSum(){return inputAlpha},get estimatedWork(){return {...estimatedWork}},maxEstimatedReads,workPolicy:'reject before upload when worst-case environment read budget exceeded; never silently reduce samples/steps',seedUsed:true,precision:'fixedpoint u32 atomic accumulation, f32 trajectories, RGBA8 final',domain:'path checked <=1px, fully dry input preserved',limitations:'Statistical finite-particle granulation, not calibrated MoXi; final saturation/byte quantization can lose mass; deterministic input seed is mandatory',featuresRequired:[]}
 return{metadata:Object.freeze(metadata),async upload(input:Input){if(destroyed)throw Error('Destroyed');validateInput(input,size);inputAlpha=0;let occupiedWetPixels=0;for(let i=3;i<input.rgba.length;i+=4){inputAlpha+=input.rgba[i];if(input.rgba[i]>0&&input.water[(i-3)/4]>0)occupiedWetPixels++}estimatedWork=estimateParticleWork(size,occupiedWetPixels,samples,steps,stepPixels);if(estimatedWork.estimatedEnvironmentReads>maxEstimatedReads)throw Error('Particle work budget exceeded: '+estimatedWork.estimatedEnvironmentReads+' > '+maxEstimatedReads+' environment reads (explicit config required for denser input)');quantum=chooseParticleQuantum(inputAlpha,samples);const env=new Uint32Array(size*size);for(let i=0;i<env.length;i++)env[i]=input.water[i]|(input.paper[i]<<8);const raw=new ArrayBuffer(32),u=new Uint32Array(raw),f=new Float32Array(raw);u.set([size,samples,steps,stepPixels]);f.set([paperGain,persistence],4);u[6]=input.seed;u[7]=quantum;device.queue.writeBuffer(original,0,packedRGBA(input.rgba));device.queue.writeBuffer(environment,0,env);device.queue.writeBuffer(params,0,raw);await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false},run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const encoder=device.createCommandEncoder();encoder.clearBuffer(accum);const pass=encoder.beginComputePass();pass.setPipeline(walk);pass.setBindGroup(0,walkGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.setPipeline(pack);pass.setBindGroup(0,packGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},readback(){if(destroyed||!hasOutput)throw Error('No output');return readPacked(device,output,size,staging)},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
export const particleDefinitions=[{id:'wgsl-macro-paper-particles',label:'Детерминированный перенос частиц по мокрой бумаге',create,configs:[
 {samples:8,steps:32,stepPixels:12,paperGain:4,persistence:2},
 {samples:8,steps:32,stepPixels:16,paperGain:8,persistence:4},
 {samples:16,steps:48,stepPixels:8,paperGain:4,persistence:1}
]}]
