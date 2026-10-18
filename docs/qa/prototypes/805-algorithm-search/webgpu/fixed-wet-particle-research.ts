import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,validateSize,type Candidate,type Input} from './contract'
import {MACRO2_PARTICLES,MACRO2_PARTICLE_PACK,chooseParticleQuantum,estimateParticleWork,type ParticleConfig} from './macro2-particles'
import {MACRO3_COMPACT_WALK,MACRO3_COMPACT_PACK,occupiedParticleIndices} from './macro3-particles-compact'
import {MACRO4_SAFE_PARTICLES,safeParticleWork} from './macro4-particles-safe'
export type ParticleResearchVariant='baseline'|'compact'|'safe'
export const PARTICLE_RESEARCH_BUDGET=Object.freeze({maxTotalEstimatedReads:32000000000,maxDispatchEstimatedReads:8000000})
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Research particle shader source drift');return s.replace(a,b)}
export function particleResearchSource(variant:ParticleResearchVariant){
 let walk=variant==='baseline'?MACRO2_PARTICLES:variant==='compact'?MACRO3_COMPACT_WALK:MACRO4_SAFE_PARTICLES
 const oldParams=variant==='baseline'?'seed:u32,quantum:u32}':'occupiedCount:u32,pad0:u32,pad1:u32,pad2:u32}'
 walk=once(walk,oldParams,oldParams.slice(0,-1)+',chunkBegin:u32,chunkEnd:u32,chunkPad0:u32,chunkPad1:u32}')
 if(variant==='baseline'){
  walk=once(walk,'@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){\n if(any(gid.xy>=vec2u(p.size))){return;}let sourceIndex=gid.y*p.size+gid.x;', '@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3u){\n let sourceIndex=p.chunkBegin+gid.x;if(sourceIndex>=p.chunkEnd){return;}let origin=vec2u(sourceIndex%p.size,sourceIndex/p.size);')
  walk=walk.replaceAll('vec2i(gid.xy)','vec2i(origin)').replaceAll('vec2f(gid.xy)','vec2f(origin)')
 }else walk=once(walk,'if(gid.x>=p.occupiedCount){return;}let sourceIndex=occupied[gid.x];','let listIndex=p.chunkBegin+gid.x;if(listIndex>=p.chunkEnd||listIndex>=p.occupiedCount){return;}let sourceIndex=occupied[listIndex];')
 return {walk,pack:variant==='baseline'?MACRO2_PARTICLE_PACK:MACRO3_COMPACT_PACK,paramsBytes:variant==='baseline'?48:64,chunkWord:variant==='baseline'?8:12}
}
export function planParticleResearchChunks(count:number,samples:number,steps:number,pixels:number,safe:boolean){
 if(![1,2,4,8,16].includes(samples)||!Number.isInteger(steps)||steps<1||steps>128||!Number.isInteger(pixels)||pixels<1||pixels>24||typeof safe!=='boolean')throw Error('Invalid research particle work parameters')
 const readsPerSource=1+samples*(steps*(16+(safe?3:1)*(pixels+1))+4),capacity=Math.floor(PARTICLE_RESEARCH_BUDGET.maxDispatchEstimatedReads/readsPerSource)
 if(!Number.isInteger(count)||count<0||count>1024*1024||!Number.isSafeInteger(readsPerSource)||readsPerSource<1||capacity<1)throw Error('Invalid research particle chunk plan')
 const chunks:{begin:number;end:number;estimatedEnvironmentReads:number}[]=[]
 for(let begin=0;begin<count;begin+=capacity){const end=Math.min(count,begin+capacity);chunks.push({begin,end,estimatedEnvironmentReads:(end-begin)*readsPerSource})}
 return{readsPerSource,capacity,chunks}
}
/** Fixed-policy research execution ONLY. Old factories/limits/config identity remain unchanged.
 * Atomic total is bounded by chooseParticleQuantum; integer additions commute modulo u32,
 * and the GLOBAL bound proves no wrap. Uniform slots are immutable across the submission. */
export async function createFixedResearchParticles(device:GPUDevice,size:number,config:ParticleConfig={},variant:ParticleResearchVariant='baseline'):Promise<Candidate>{
 if(!['baseline','compact','safe'].includes(variant))throw Error('Unknown particle variant')
 validateSize(size);if(size>1024)throw Error('Research particle prototype bounded to1024')
 const samples=integerOption(config.samples??8,1,16,'samples');if(![1,2,4,8,16].includes(samples))throw Error('Samples must divide256')
 const steps=integerOption(config.steps??32,1,128,'steps'),pixels=integerOption(config.stepPixels??12,1,24,'stepPixels'),paperGain=config.paperGain??4,persistence=config.persistence??2
 // Keep validation of declared historical budget, but do not conflate that admission limit with physics.
 integerOption(config.maxEstimatedReads??128000000,1,500000000,'maxEstimatedReads')
 if(!Number.isFinite(paperGain)||paperGain<0||paperGain>32||!Number.isFinite(persistence)||persistence<0||persistence>16)throw Error('Invalid particle material parameters')
 const compact=variant!=='baseline',safe=variant==='safe',N=size*size,source=particleResearchSource(variant),maxPlan=planParticleResearchChunks(N,samples,steps,pixels,safe),alignment=device.limits.minUniformBufferOffsetAlignment??256,stride=Math.ceil(source.paramsBytes/alignment)*alignment
 if(device.limits.maxStorageBufferBindingSize<N*16||device.limits.maxStorageBuffersPerShaderStage<(compact?4:3))throw Error('Particle device limits insufficient')
 const all:GPUBuffer[]=[],alloc=(bytes:number,usage:number,label:string)=>{const b=buffer(device,bytes,usage,label);all.push(b);return b}
 try{
  const walk=await pipeline(device,source.walk,'805-fixed-research-particle-walk'),pack=await pipeline(device,source.pack,'805-fixed-research-particle-pack'),usage=BUFFER.STORAGE|BUFFER.COPY_DST
  const original=alloc(N*4,usage,'research-particle-original'),environment=alloc(N*4,usage,'research-particle-environment'),accum=alloc(N*16,usage,'research-particle-accum'),occupied=compact?alloc(N*4,usage,'research-particle-indices'):undefined,output=alloc(N*4,BUFFER.STORAGE|BUFFER.COPY_SRC,'research-particle-output'),staging=alloc(N*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'research-particle-readback'),uniform=alloc(stride*Math.max(1,maxPlan.chunks.length),BUFFER.UNIFORM|BUFFER.COPY_DST,'research-particle-immutable-chunks')
  const bind=(p:GPUComputePipeline,bs:GPUBuffer[],slot=0)=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:bs.map((b,binding)=>({binding,resource:b===uniform?{buffer:b,offset:slot*stride,size:source.paramsBytes}:{buffer:b}}))})
  const walkGroups=maxPlan.chunks.map((_,slot)=>bind(walk,[original,environment,accum,uniform,...(occupied?[occupied]:[])],slot)),packGroup=bind(pack,[accum,output,uniform,...(compact?[original,environment]:[])])
  let dead=false,uploaded=false,ready=false,count=0,quantum=256,inputAlpha=0,chunks:ReturnType<typeof planParticleResearchChunks>['chunks']=[],estimatedWork=estimateParticleWork(size,0,samples,steps,pixels)
  const metadata={algorithm:'fixed-research-'+variant+'-paper-particles',samples,steps,stepPixels:pixels,paperGain,persistence,domainPolicyRevision:'initial-fixed-particle-research-v2',fixedWetIntrinsicSource:true,sourcePolicyChange:'dispatch indexing only; original trajectory/atomic/splat arithmetic',get quantumUnitsPerCode(){return quantum},get inputAlphaSum(){return inputAlpha},get estimatedWork(){return{...estimatedWork}},get workChunks(){return chunks.map(c=>({...c}))},researchBudget:PARTICLE_RESEARCH_BUDGET,historicalAdmissionLimit:config.maxEstimatedReads??128000000,uniformPolicy:'immutable aligned per-chunk slots, no shared offset write hazard',submissionPolicy:'clear once; one bounded walk dispatch per ordered queue submission; PACK once after all walk submissions',timingQualification:'Exact source-index work splitting adds dispatch overhead; not original single-dispatch timing',limitations:'Historical particle saturation/finite sampling/f32 trajectory limitations remain; budget is conservative load estimate, not measured GPU time or watchdog guarantee'}
  return{get metadata(){return metadata},async upload(input:Input){if(dead)throw Error('Destroyed');uploaded=false;ready=false;validateInput(input,size);const list=occupiedParticleIndices(input);inputAlpha=list.totalAlpha;estimatedWork=safe?safeParticleWork(size,list.indices.length,samples,steps,pixels):estimateParticleWork(size,list.indices.length,samples,steps,pixels)
   if(estimatedWork.estimatedEnvironmentReads>PARTICLE_RESEARCH_BUDGET.maxTotalEstimatedReads)throw Error('Research particle total budget exceeded: '+estimatedWork.estimatedEnvironmentReads)
   quantum=chooseParticleQuantum(inputAlpha,samples);count=compact?list.indices.length:N;chunks=planParticleResearchChunks(count,samples,steps,pixels,safe).chunks
   const env=new Uint32Array(N);for(let i=0;i<N;i++)env[i]=input.water[i]|(input.paper[i]<<8)
   const bytes=new ArrayBuffer(stride*Math.max(1,chunks.length));for(let slot=0;slot<Math.max(1,chunks.length);slot++){const u=new Uint32Array(bytes,slot*stride,source.paramsBytes/4),f=new Float32Array(bytes,slot*stride,source.paramsBytes/4);u.set([size,samples,steps,pixels]);f.set([paperGain,persistence],4);u[6]=input.seed;u[7]=quantum;if(compact)u[8]=list.indices.length;u[source.chunkWord]=chunks[slot]?.begin??0;u[source.chunkWord+1]=chunks[slot]?.end??0}
   device.queue.writeBuffer(original,0,packedRGBA(input.rgba));device.queue.writeBuffer(environment,0,env);device.queue.writeBuffer(uniform,0,bytes);if(occupied&&list.indices.length)device.queue.writeBuffer(occupied,0,list.indices);await device.queue.onSubmittedWorkDone();uploaded=true
  },run(){if(dead||!uploaded)throw Error('Fresh upload required');uploaded=false;const clear=device.createCommandEncoder();clear.clearBuffer(accum);device.queue.submit([clear.finish()]);for(let slot=0;slot<chunks.length;slot++){const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(walk);p.setBindGroup(0,walkGroups[slot]);p.dispatchWorkgroups(Math.ceil((chunks[slot].end-chunks[slot].begin)/64));p.end();device.queue.submit([e.finish()]);}const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pack);p.setBindGroup(0,packGroup);p.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));p.end();device.queue.submit([e.finish()]);ready=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},readback(){if(dead||!ready)throw Error('No output');return readPacked(device,output,size,staging)},destroy(){if(dead)return;dead=true;for(const b of all)b.destroy()}}
 }catch(error){for(const b of all)b.destroy();throw error}
}
