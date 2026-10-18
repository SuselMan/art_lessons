import {captureFixedWetHooks,type FixedWetCoarseHooks} from './fixed-wet-coarse-hooks'
import {initialCoarsePigment,readCoarseCarrierLedger,cloneCoarseLedger,type CoarseCarrierLedger} from './coarse-carrier-ledger'
import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,type Candidate,type Input} from './contract'
const TYPES=`struct Cell{m:vec4u,d:vec4u,w:u32,s:u32,pad:vec2u} struct Params{n:u32,size:u32,phase:u32,pad:u32}`
export const MACRO8_PAIR=TYPES+`
@group(0) @binding(0) var<storage,read> src:array<Cell>;
@group(0) @binding(1) var<storage,read> aux:array<vec4u>;
@group(0) @binding(2) var<storage,read_write> dst:array<Cell>;
@group(0) @binding(3) var<uniform> p:Params;
fn head(c:Cell,e:vec4u)->i32{return i32(c.w+6u*e.z)-i32((e.y-c.s)/4u);}
fn adsorb(value:Cell,e:vec4u)->Cell{
 var c=value;let absorbed=min(c.w/32u,e.y-c.s);let den=max(c.w,1u);
 let alpha=(((c.m.a*absorbed+den/2u)/den)*70u)/100u;let ma=max(c.m.a,1u);
 for(var k=0u;k<4u;k++){let t=select((c.m[k]*alpha+ma/2u)/ma,alpha,k==3u);c.m[k]-=t;c.d[k]+=t;}
 c.w-=absorbed;c.s+=absorbed;return c;
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let i=gid.y*p.n+gid.x;let axis=p.phase%2u;let offset=p.phase/2u;
 let coord=select(gid.x,gid.y,axis==1u);let first=(coord+2u-offset)%2u==0u;var partner=vec2i(gid.xy);
 if(axis==0u){partner.x+=select(-1,1,first);}else{partner.y+=select(-1,1,first);}
 if(any(partner<vec2i(0))||any(partner>=vec2i(i32(p.n)))){dst[i]=adsorb(src[i],aux[i]);return;}
 let j=u32(partner.y)*p.n+u32(partner.x);let ia=min(i,j);let ib=max(i,j);var a=src[ia];var b=src[ib];let ha=head(a,aux[ia]);let hb=head(b,aux[ib]);let fromA=ha>hb;
 var donor=b;var receiver=a;if(fromA){donor=a;receiver=b;}let dh=u32(abs(ha-hb));
 let q=min(min((dh*35u*(1275u-2u*max(aux[ia].z,aux[ib].z))+63750u)/127500u,donor.w*4u/5u),65535u-receiver.w);
 let cap=select(aux[ia].x,aux[ib].x,fromA);let den=max(donor.w,1u);
 let alpha=min((donor.m.a*q+den/2u)/den,cap-receiver.m.a-receiver.d.a);let ma=max(donor.m.a,1u);
 for(var k=0u;k<4u;k++){let t=select((donor.m[k]*alpha+ma/2u)/ma,alpha,k==3u);donor.m[k]-=t;receiver.m[k]+=t;}
 donor.w-=q;receiver.w+=q;if(fromA){a=donor;b=receiver;}else{a=receiver;b=donor;}
 if(i==ia){dst[i]=adsorb(a,aux[ia]);}else{dst[i]=adsorb(b,aux[ib]);}
}`
export const MACRO8_PACK=TYPES+`
@group(0) @binding(0) var<storage,read> src:array<Cell>;
@group(0) @binding(1) var<storage,read> stationary:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:array<u32>;
@group(0) @binding(3) var<uniform> p:Params;
fn unpack(v:u32)->vec4u{return vec4u(v&255u,(v>>8u)&255u,(v>>16u)&255u,v>>24u);}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let xy=gid.xy*p.n/p.size;let j=xy.y*p.n+xy.x;
 let moved=src[j].m+src[j].d;let b=(moved*255u+vec4u(32767u))/65535u+unpack(stationary[i]);
 // cap=min per-fine free alpha guarantees b<=255, no saturation/clamp.
 output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);
}`
export function initialIntegerDynamic(input:Input){
 const n=128,N=n*n,state=new Uint32Array(N*12),aux=new Uint32Array(N*4),stationary=new Uint32Array(input.size**2),packed=packedRGBA(input.rgba)
 let initialStationaryAlpha=0,initialMobileAlpha=0,frozenWetAlpha=0,frozenCellCount=0,initialWaterCodes=0,initialMobileCodes=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const j=y*n+x,sum=[0,0,0,0];let water=0,paper=0,maxDryA=0
 for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){const i=(y*8+dy)*input.size+x*8+dx;water+=input.water[i];paper+=input.paper[i];if(input.water[i]===0)maxDryA=Math.max(maxDryA,input.rgba[i*4+3]);else for(let c=0;c<4;c++)sum[c]+=input.rgba[i*4+c]}
 const codes=sum.map(s=>Math.floor((s*257+32)/64));let cap=65535-maxDryA*257;const freeze=codes[3]>cap
 let maxStationaryA=0
 for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
 const i=(y*8+dy)*input.size+x*8+dx,a=input.rgba[i*4+3];if(freeze||input.water[i]===0){stationary[i]=packed[i];initialStationaryAlpha+=a;maxStationaryA=Math.max(maxStationaryA,a);if(freeze&&input.water[i]>0)frozenWetAlpha+=a}else initialMobileAlpha+=a
 }
 if(freeze){frozenCellCount++;cap=65535-maxStationaryA*257}else{state.set(codes,j*12);initialMobileCodes+=codes[3]}
 const W=Math.floor((water*257+128)/256),P=Math.floor((paper+32)/64);state[j*12+8]=W;initialWaterCodes+=W;aux.set([cap,8192+P*64,P,0],j*4)
 }
 return{state,aux,stationary,summary:{initialStationaryAlpha,initialMobileAlpha,frozenWetAlpha,frozenCellCount,initialWaterCodes,initialMobileCodes,initialCoarsePigmentCodesRGBA:initialCoarsePigment(state)}}
}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={},options:{readonly fixedWet?:FixedWetCoarseHooks}={}):Promise<Candidate>{
 const fixedWet=captureFixedWetHooks(options.fixedWet)
 if(size!==1024)throw Error('Integer dynamic requires1024');const n=128,N=n*n,steps=integerOption(config.steps??128,1,512,'steps'),usage=BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC
 const pair=await pipeline(device,fixedWet?fixedWet.transformPair(MACRO8_PAIR):MACRO8_PAIR,'u32-dynamic-pair-absorption'),pack=await pipeline(device,MACRO8_PACK,'u32-dynamic-nearest')
 const all:GPUBuffer[]=[];const alloc=(bytes:number,flags:number,label:string)=>{const b=buffer(device,bytes,flags,label);all.push(b);return b}
 try{
 const state=[alloc(N*48,usage,'dynamic0'),alloc(N*48,usage,'dynamic1')],aux=alloc(N*16,usage,'capacity-paper'),stationary=alloc(size*size*4,usage,'literal-stationary'),output=alloc(size*size*4,usage,'output'),staging=alloc(size*size*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'readback'),stateStaging=alloc(N*48,BUFFER.COPY_DST|BUFFER.MAP_READ,'state-ledger')
 const params=Array.from({length:4},(_,phase)=>{const b=alloc(16,BUFFER.UNIFORM|BUFFER.COPY_DST,'phase');device.queue.writeBuffer(b,0,Uint32Array.of(n,size,phase,0));return b})
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))})
 const groups=Array.from({length:4},(_,phase)=>[0,1].map(i=>bind(pair,[state[i],aux,state[1-i],params[phase]]))),packing=[0,1].map(i=>bind(pack,[state[i],stationary,output,params[0]]))
 fixedWet?.observePacking({states:state.slice(),stationary,output},steps%2)
 let destroyed=false,uploaded=false,ready=false,summary:ReturnType<typeof initialIntegerDynamic>['summary']|null=null,ledger:CoarseCarrierLedger|null=null
 return{metadata:Object.freeze({algorithm:'u32-dynamic-wetting-absorption',grid:n,steps,dispatches:steps+1,reconstruction:'nearest u32 plus literal stationary',staticWallMap:false,waterBlocked:false,coefficients:'dt35/100,absorption1/32,adsorption two-stage70/100',get initial(){return summary?{...summary,initialCoarsePigmentCodesRGBA:summary.initialCoarsePigmentCodesRGBA.slice()}:null},get finalState(){return ledger?cloneCoarseLedger(ledger):null},massScope:'coarse M+D/W+S integer exact; input reduction and final byte rounding separate',limitations:'Phenomenological capacity, not full CFD. Mixed cells with insufficient fine free alpha keep ALL original pigment stationary; frozenWetAlpha explicitly reported. Nearest8px grid.',seedUsed:false,featuresRequired:[]}),async upload(input:Input){
 if(destroyed)throw Error('Destroyed');validateInput(input,size);const data=fixedWet?fixedWet.initialize(input,initialIntegerDynamic):initialIntegerDynamic(input);summary={...data.summary,initialCoarsePigmentCodesRGBA:data.summary.initialCoarsePigmentCodesRGBA.slice()};ledger=null;device.queue.writeBuffer(state[0],0,data.state);device.queue.writeBuffer(aux,0,data.aux);device.queue.writeBuffer(stationary,0,data.stationary);await device.queue.onSubmittedWorkDone();uploaded=true;ready=false
 },run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pair);for(let s=0;s<steps;s++){p.setBindGroup(0,groups[s%4][s%2]);p.dispatchWorkgroups(16,16)}p.setPipeline(pack);p.setBindGroup(0,packing[steps%2]);p.dispatchWorkgroups(128,128);p.end();device.queue.submit([e.finish()]);ready=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},async readback(){
 if(destroyed||!ready)throw Error('No output');const pixels=await readPacked(device,output,size,staging),e=device.createCommandEncoder();e.copyBufferToBuffer(state[steps%2],0,stateStaging,0,N*48);device.queue.submit([e.finish()]);await stateStaging.mapAsync(1)
 try{const a=new Uint32Array(stateStaging.getMappedRange());if(!summary)throw Error('Missing initial coarse ledger');ledger=readCoarseCarrierLedger(a,summary.initialCoarsePigmentCodesRGBA,summary.initialWaterCodes,ledger?.prePackGuardPassed??true)}finally{stateStaging.unmap()}return pixels
 },destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
 }catch(error){for(const b of all)b.destroy();throw error}
}
export const integerDynamicDefinitions=[{id:'wgsl-macro-integer-dynamic',label:'Целочисленное динамическое смачивание',create,configs:[{steps:128},{steps:256}]}]
