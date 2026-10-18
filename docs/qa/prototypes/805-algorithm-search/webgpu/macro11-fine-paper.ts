import {create as createBase,type PackingBuffers} from './macro9-integer-smooth'
import {MACRO11_FINE_PAIR} from './macro11-fine-paper-core'
import {BUFFER,buffer,integerOption,pipeline,type Candidate,type Input} from './contract'
const TYPES=`struct Cell{m:vec4u,d:vec4u,w:u32,s:u32,pad:vec2u} struct Params{n:u32,size:u32,phase:u32,seed:u32,gain:u32,dither:u32,pad:vec2u}`
export const MACRO11_FINE_INIT=TYPES+`
@group(0) @binding(0) var<storage,read> coarse:array<Cell>;
@group(0) @binding(1) var<storage,read> stationary:array<u32>;
@group(0) @binding(2) var<storage,read> paper:array<u32>;
@group(0) @binding(3) var<storage,read_write> mobile:array<vec4u>;
@group(0) @binding(4) var<storage,read_write> aux:array<vec4u>;
@group(0) @binding(5) var<uniform> p:Params;
@group(0) @binding(6) var<storage,read_write> guard:array<atomic<u32>>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let q=gid.xy*p.n/p.size;let c=coarse[q.y*p.n+q.x];
 let fixedAlpha=(stationary[i]>>24u)*257u+c.d.a;
 if(fixedAlpha>65535u||c.m.a>65535u-min(fixedAlpha,65535u)){atomicAdd(&guard[0],1u);mobile[i]=vec4u(0);aux[i]=vec4u(0,1,0,0);return;}
 mobile[i]=c.m;let wet=select(0u,1u,c.w+c.s>0u);
 aux[i]=vec4u(65535u-fixedAlpha,1u+(255u-paper[i])*p.gain/4u,wet,0u);
}`
export const MACRO11_FINE_PACK=TYPES+`
@group(0) @binding(0) var<storage,read> fine:array<vec4u>;
@group(0) @binding(1) var<storage,read> coarse:array<Cell>;
@group(0) @binding(2) var<storage,read> stationary:array<u32>;
@group(0) @binding(3) var<storage,read_write> output:array<u32>;
@group(0) @binding(4) var<uniform> p:Params;
@group(0) @binding(5) var<storage,read_write> guard:array<atomic<u32>>;
fn randomCode(x:u32,y:u32,seed:u32)->u32{var v=(x*0x9e3779b9u)^(y*0x85ebca6bu)^seed^805u;v=(v^(v>>16u))*0x7feb352du;v=(v^(v>>15u))*0x846ca68bu;return v^(v>>16u);}
fn unpack(v:u32)->vec4u{return vec4u(v&255u,(v>>8u)&255u,(v>>16u)&255u,v>>24u);}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let q=gid.xy*p.n/p.size;let c=coarse[q.y*p.n+q.x];let value=fine[i]+c.d;
 let literal=unpack(stationary[i]);if(value.a+literal.a*257u>65535u||any(value>vec4u(value.a))){atomicAdd(&guard[1],1u);}
 let threshold=select(128u,randomCode(gid.x,gid.y,p.seed)%257u,p.dither!=0u);
 let b=(value+vec4u(threshold))/257u+literal;output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);
}`
export interface FineConfig {steps?:number;fineSteps?:number;paperGain?:number;dither?:number;mixing?:number}
export interface FineOverrides {affinityBase?:number;baseFactory?:typeof createBase;initSourceOverride?:string;fineDepositPlane?:boolean;smoothInitialization?:boolean;stateHash?:boolean;packSourceOverride?:string;basePairSourceOverride?:string}
export async function create(device:GPUDevice,size:number,config:FineConfig={},options:FineOverrides={}):Promise<Candidate>{
 if(size!==1024)throw Error('Fine integer requires1024');const steps=integerOption(config.steps??128,1,512,'steps'),fineSteps=integerOption(config.fineSteps??12,0,32,'fineSteps'),paperGain=integerOption(config.paperGain??3,0,4,'paperGain'),dither=integerOption(config.dither??1,0,1,'dither'),mixing=integerOption(config.mixing??1,0,1,'mixing'),N=size*size
 const init=await pipeline(device,options.initSourceOverride??MACRO11_FINE_INIT,'fine-integer-init'),pair=await pipeline(device,MACRO11_FINE_PAIR,'fine-integer-paper-pair'),pack=await pipeline(device,options.packSourceOverride??MACRO11_FINE_PACK,'fine-integer-pack'),owned:GPUBuffer[]=[]
 const alloc=(bytes:number,usage:number,label:string)=>{const b=buffer(device,bytes,usage,label);owned.push(b);return b}
 let base:Candidate|undefined
 try{
 const fine=[alloc(N*16,BUFFER.STORAGE|BUFFER.COPY_SRC,'fine-mobile0'),alloc(N*16,BUFFER.STORAGE|BUFFER.COPY_SRC,'fine-mobile1')],aux=alloc(N*16,BUFFER.STORAGE,'fine-capacity-affinity-wet'),paper=alloc(N*4,BUFFER.STORAGE|BUFFER.COPY_DST,'fine-paper'),params=alloc(32,BUFFER.UNIFORM|BUFFER.COPY_DST,'fine-reconstruct-params'),guard=alloc(16,BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC,'fine-guards'),staging=alloc(N*16+16,BUFFER.COPY_DST|BUFFER.MAP_READ,'fine-ledger-staging'),phaseParams=Array.from({length:4},(_,phase)=>{const b=alloc(16,BUFFER.UNIFORM|BUFFER.COPY_DST,'fine-pair-phase');device.queue.writeBuffer(b,0,Uint32Array.of(size,phase,0,0));return b})
 const fineDeposit=options.fineDepositPlane?alloc(N*16,BUFFER.STORAGE,'fine-fixed-deposit'):undefined
 let borrowed:PackingBuffers|undefined;base=await (options.baseFactory??createBase)(device,size,{steps,mixing,smooth:0},{stateHash:options.stateHash,pairSourceOverride:options.basePairSourceOverride,observePacking:b=>{borrowed=b}});if(!borrowed)throw Error('Missing packing buffer observer');const shared=borrowed,coarse=shared.states[steps%2]
 const bind=(program:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:program.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))}),initGroup=bind(init,[coarse,shared.stationary,paper,fine[0],aux,params,guard,...(fineDeposit?[fineDeposit]:[])]),pairGroups=Array.from({length:4},(_,phase)=>[0,1].map(i=>bind(pair,[fine[i],aux,fine[1-i],phaseParams[phase]]))),packGroup=bind(pack,[fine[fineSteps%2],coarse,shared.stationary,shared.output,params,guard,...(fineDeposit?[fineDeposit]:[])])
 let uploaded=false,ready=false,destroyed=false,ledger:Record<string,unknown>|null=null
 const underlying=base
 return{get metadata(){return{...underlying.metadata,algorithm:'u32-dynamic-plus-fine-paper-regularization',fineSteps,paperGain,dither:dither===1,extraFineGPUBytes:owned.reduce((s,b)=>s+b.size,0),extraDispatches:fineSteps+2,redundantBasePackDispatches:1,fineInitialization:options.smoothInitialization?'independent floor bilinear mobile/deposit; local nearest at stationary pixel':'nearest coarse mobile/deposit',fineModel:'NEW conservative integer mobile-carrier paper-affinity exchange, fixed deposited/literal; final wet=W+S>0; NOT PACK-only',get fineLedger(){return ledger?{...ledger}:null},limitations:'Fine redistribution is new physics/regularization, not historical pixel equivalence. Nearest coarse deposited remains fixed; 6–12 local steps have bounded small horizon. Coarse base PACK is redundantly executed before fine overwrite.'}},async upload(input:Input){if(destroyed)throw Error('Destroyed');await underlying.upload(input);device.queue.writeBuffer(paper,0,Uint32Array.from(input.paper));device.queue.writeBuffer(params,0,Uint32Array.of(128,size,0,input.seed,paperGain,dither,0,0));await device.queue.onSubmittedWorkDone();uploaded=true;ready=false;ledger=null},run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const output=underlying.run(),e=device.createCommandEncoder();e.clearBuffer(guard);const p=e.beginComputePass();p.setPipeline(init);p.setBindGroup(0,initGroup);p.dispatchWorkgroups(128,128);p.setPipeline(pair);for(let s=0;s<fineSteps;s++){p.setBindGroup(0,pairGroups[s%4][s%2]);p.dispatchWorkgroups(128,128)}p.setPipeline(pack);p.setBindGroup(0,packGroup);p.dispatchWorkgroups(128,128);p.end();device.queue.submit([e.finish()]);ready=true;return output},async readback(){if(destroyed||!ready)throw Error('No output');const pixels=await underlying.readback(),e=device.createCommandEncoder();e.copyBufferToBuffer(fine[fineSteps%2],0,staging,0,N*16);e.copyBufferToBuffer(guard,0,staging,N*16,16);device.queue.submit([e.finish()]);await staging.mapAsync(1);try{const a=new Uint32Array(staging.getMappedRange()),totals=[0,0,0,0];for(let i=0;i<N;i++)for(let k=0;k<4;k++)totals[k]+=a[i*4+k];ledger={mobileRGBA16Codes:totals,initialFineMobileAlphaExpected:options.smoothInitialization?null:(underlying.metadata.finalState as Record<string,number>).mobileAlphaCodes*64,initializationMassQualification:options.smoothInitialization?'Bilinear floor/local nearest changes init totals; compare identical fineSteps0 vsfineSteps12, pair-stage all4channels exact':'nearest replicates coarse mobile64times',initCapacityFailures:a[N*4],packFailures:a[N*4+1],guardPassed:a[N*4]===0&&a[N*4+1]===0,reads:'full fine storage copy/map only after timed compute'}}finally{staging.unmap()}return pixels},destroy(){if(destroyed)return;destroyed=true;underlying.destroy();for(const b of owned)b.destroy()}}
 }catch(error){base?.destroy();for(const b of owned)b.destroy();throw error}
}
export const fineIntegerDefinitions=[{id:'wgsl-macro-integer-fine-paper',label:'Динамическая акварель и консервативная мелкая бумага',create,configs:[{steps:128,fineSteps:12,paperGain:3,dither:1},{steps:128,fineSteps:12,paperGain:0,dither:1},{steps:128,fineSteps:0,paperGain:0,dither:1},{steps:256,fineSteps:12,paperGain:4,dither:1}]}]
