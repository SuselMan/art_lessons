import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,type Candidate,type Input} from './contract'
import {coarseInput} from '../alternatives/macro3-input'
const PARAM=`struct Params{n:u32,size:u32,phase:u32,cap:u32}`
export const MACRO6_PAIR=PARAM+`
@group(0) @binding(0) var<storage,read> src:array<vec4u>;
@group(0) @binding(1) var<storage,read> water:array<u32>;
@group(0) @binding(2) var<storage,read> aux:array<vec2u>;
@group(0) @binding(3) var<storage,read_write> dst:array<vec4u>;
@group(0) @binding(4) var<storage,read_write> nextWater:array<u32>;
@group(0) @binding(5) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let i=gid.y*p.n+gid.x;
 let axis=p.phase%2u;let offset=p.phase/2u;let coord=select(gid.x,gid.y,axis==1u);
 let first=(coord+2u-offset)%2u==0u;var partner=vec2i(gid.xy);
 if(axis==0u){partner.x+=select(-1,1,first);}else{partner.y+=select(-1,1,first);}
 if(any(partner<vec2i(0))||any(partner>=vec2i(i32(p.n)))){dst[i]=src[i];nextWater[i]=water[i];return;}
 let j=u32(partner.y)*p.n+u32(partner.x);
 if(aux[i].x==0u||aux[j].x==0u){dst[i]=src[i];nextWater[i]=water[i];return;}
 let ia=min(i,j);let ib=max(i,j);var a=src[ia];var b=src[ib];let wa=water[ia];let wb=water[ib];
 for(var c=0u;c<4u;c++){if(b[c]>=a[c]){let t=((b[c]-a[c])*25u+50u)/100u;a[c]+=t;b[c]-=t;}else{let t=((a[c]-b[c])*25u+50u)/100u;a[c]-=t;b[c]+=t;}}
 let ha=wa+6u*aux[ia].y;let hb=wb+6u*aux[ib].y;let fromA=ha>hb;
 let dw=select(wb,wa,fromA);let rw=select(wa,wb,fromA);let dh=max(ha,hb)-min(ha,hb);
 let q=min(min((dh*35u*(1275u-2u*max(aux[ia].y,aux[ib].y))+63750u)/127500u,dw*4u/5u),65535u-rw);
 var donor=select(b,a,fromA);var receiver=select(a,b,fromA);let denominator=max(dw,1u);
 let alpha=min((donor.a*q+denominator/2u)/denominator,p.cap-receiver.a);
 let da=max(donor.a,1u);for(var c=0u;c<4u;c++){let t=select((donor[c]*alpha+da/2u)/da,alpha,c==3u);donor[c]-=t;receiver[c]+=t;}
 if(fromA){a=donor;b=receiver;}else{a=receiver;b=donor;}
 dst[i]=select(b,a,i==ia);nextWater[i]=select(select(wb-q,wb+q,fromA),select(wa+q,wa-q,fromA),i==ia);
}`
export const MACRO6_PACK=PARAM+`
@group(0) @binding(0) var<storage,read> src:array<vec4u>;
@group(0) @binding(1) var<storage,read> initial:array<vec4u>;
@group(0) @binding(2) var<storage,read> aux:array<vec2u>;
@group(0) @binding(3) var<storage,read> raw:array<u32>;
@group(0) @binding(4) var<storage,read_write> output:array<u32>;
@group(0) @binding(5) var<uniform> p:Params;
fn unpack(v:u32)->vec4u{return vec4u(v&255u,(v>>8u)&255u,(v>>16u)&255u,v>>24u);}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let cell=gid.xy*p.n/p.size;let j=cell.y*p.n+cell.x;
 if(aux[j].x==0u||all(src[j]==initial[j])){output[i]=raw[i];return;}
 // Baseline fully mobile: no f32 residual, no paper reconstruction, no clip beyond u16 range.
 let b=(src[j]*255u+vec4u(32767u))/65535u;
 output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);
}`
export async function create(device:GPUDevice,size:number,config:Record<string,number>={}):Promise<Candidate>{
 if(size!==1024)throw Error('Integer hydraulic requires1024');
 const steps=integerOption(config.steps??128,1,512,'steps'),n=128,N=n*n,usage=BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC
 const pair=await pipeline(device,MACRO6_PAIR,'integer-hydraulic-pair'),pack=await pipeline(device,MACRO6_PACK,'integer-nearest-reconstruct')
 const colors=[buffer(device,N*16,usage,'u32-color0'),buffer(device,N*16,usage,'u32-color1')],water=[buffer(device,N*4,usage,'u32-water0'),buffer(device,N*4,usage,'u32-water1')],initial=buffer(device,N*16,usage,'u32-initial'),aux=buffer(device,N*8,usage,'u32-aux'),raw=buffer(device,size*size*4,usage,'raw'),output=buffer(device,size*size*4,usage,'output'),staging=buffer(device,size*size*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'readback')
 const params=Array.from({length:4},(_,phase)=>{const b=buffer(device,16,BUFFER.UNIFORM|BUFFER.COPY_DST,'phase');device.queue.writeBuffer(b,0,Uint32Array.of(n,size,phase,65535));return b})
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))})
 const groups=Array.from({length:4},(_,phase)=>[0,1].map(i=>bind(pair,[colors[i],water[i],aux,colors[1-i],water[1-i],params[phase]])))
 const packing=[0,1].map(i=>bind(pack,[colors[i],initial,aux,raw,output,params[0]])),all=[...colors,...water,initial,aux,raw,output,staging,...params]
 let destroyed=false,uploaded=false,ready=false,blockedCells=0
 return{metadata:Object.freeze({algorithm:'u32-rational-local-hydraulic',grid:n,steps,dispatches:steps+1,mobile:1,reconstruction:'nearest integer; unchanged cells literal raw',integerCoefficients:'dt35/100,diffusion25/100,permeability(1275-2paper)/1275',staticWet:true,get blockedCells(){return blockedCells},massScope:'coarse u16 paired exact all4channels; reduction and final byte rounding measured separately',limitations:'8px nearest grid is deliberate deterministic baseline; no claim GL-f32 equality or watercolor quality',seedUsed:false,featuresRequired:[]}),async upload(input:Input){
 if(destroyed)throw Error('Destroyed');validateInput(input,size);const data=coarseInput(input,1),C=new Uint32Array(N*4),W=new Uint32Array(N),A=new Uint32Array(N*2)
 for(let i=0;i<N;i++){const k=i*4;C[k]=(data.initial0[k]<<8)|data.initial0[k+1];C[k+1]=(data.initial0[k+2]<<8)|data.initial0[k+3];C[k+2]=(data.initial1[k]<<8)|data.initial1[k+1];C[k+3]=(data.initial1[k+2]<<8)|data.initial1[k+3];W[i]=(data.water[k]<<8)|data.water[k+1];A[i*2]=data.aux[k];A[i*2+1]=data.aux[k+1]}
 blockedCells=data.blockedCells;device.queue.writeBuffer(colors[0],0,C);device.queue.writeBuffer(initial,0,C);device.queue.writeBuffer(water[0],0,W);device.queue.writeBuffer(aux,0,A);device.queue.writeBuffer(raw,0,packedRGBA(input.rgba));await device.queue.onSubmittedWorkDone();uploaded=true;ready=false
 },run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pair);for(let s=0;s<steps;s++){p.setBindGroup(0,groups[s%4][s%2]);p.dispatchWorkgroups(16,16)}p.setPipeline(pack);p.setBindGroup(0,packing[steps%2]);p.dispatchWorkgroups(128,128);p.end();device.queue.submit([e.finish()]);ready=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},async readback(){if(destroyed||!ready)throw Error('No output');return readPacked(device,output,size,staging)},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
export const integerHydraulicDefinitions=[{id:'wgsl-macro-integer-hydraulic',label:'Целочисленный консервативный перенос',create,configs:[{steps:128},{steps:256}]}]
