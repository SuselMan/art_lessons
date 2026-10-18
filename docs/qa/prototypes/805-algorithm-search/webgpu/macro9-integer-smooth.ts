import {BUFFER,buffer,integerOption,pipeline,readPacked,validateInput,type Candidate,type Input} from './contract'
import {MACRO8_PAIR,initialIntegerDynamic} from './macro8-integer-dynamic'
const TYPES=`struct Cell{m:vec4u,d:vec4u,w:u32,s:u32,pad:vec2u} struct Params{n:u32,size:u32,phase:u32,pad:u32}`
const EXCHANGE=`
struct Mixed{a:vec4u,b:vec4u}
fn packet(m:vec4u,k:u32)->vec4u{let alpha=m.a*k/256u;let den=max(m.a,1u);var result=vec4u(0);for(var c=0u;c<4u;c++){result[c]=select((m[c]*alpha+den/2u)/den,alpha,c==3u);}return result;}
fn exchange(a:Cell,b:Cell,ca:u32,cb:u32)->Mixed{
 var k=64u*min(a.w,b.w)/max(max(a.w,b.w),1u);var A=packet(a.m,k);var B=packet(b.m,k);
 for(var step=0u;step<7u;step++){if(a.m.a-A.a+B.a+a.d.a<=ca&&b.m.a-B.a+A.a+b.d.a<=cb){break;}k/=2u;A=packet(a.m,k);B=packet(b.m,k);}
 return Mixed(a.m-A+B,b.m-B+A);
}
`
function replaceOnce(source:string,old:string,value:string){if(source.split(old).length!==2)throw Error('Macro9 source drift');return source.replace(old,value)}
// Explicit new physics variant; mixing=false preserves old pair source arithmetic.
export const MACRO9_PAIR=replaceOnce(replaceOnce(replaceOnce(replaceOnce(MACRO8_PAIR,'fn head(',EXCHANGE+'fn head('),'let ha=head(a,aux[ia]);','if((p.pad&2u)!=0u){let mixed=exchange(a,b,aux[ia].x,aux[ib].x);a.m=mixed.a;b.m=mixed.b;}let ha=head(a,aux[ia]);'),'c.w/32u','c.w/select(32u,128u,(p.pad&2u)!=0u)'),')*70u)/100u',')*select(70u,20u,(p.pad&2u)!=0u))/100u')
export const MACRO9_PACK=TYPES+`
@group(0) @binding(0) var<storage,read> src:array<Cell>;
@group(0) @binding(1) var<storage,read> stationary:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:array<u32>;
@group(0) @binding(3) var<uniform> p:Params;
fn unpack(v:u32)->vec4u{return vec4u(v&255u,(v>>8u)&255u,(v>>16u)&255u,v>>24u);}
fn sample(q:vec2i)->vec4u{let xy=vec2u(clamp(q,vec2i(0),vec2i(i32(p.n)-1)));let c=src[xy.y*p.n+xy.x];return c.m+c.d;}
fn floor16(v:i32)->i32{if(v<0){return -((-v+15)/16);}return v/16;}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;var b=vec4u(0);
 if((p.pad&5u)!=0u){let xy=gid.xy*p.n/p.size;let c=src[xy.y*p.n+xy.x];b=((c.m+c.d)*255u+vec4u(32767u))/65535u+unpack(stationary[i]);}
 else{
 let numer=vec2i(gid.xy)*2+vec2i(1-8);let base=vec2i(floor16(numer.x),floor16(numer.y));let t=vec2u(numer-base*16);
 let total=sample(base)*(16u-t.x)*(16u-t.y)+sample(base+vec2i(1,0))*t.x*(16u-t.y)+sample(base+vec2i(0,1))*(16u-t.x)*t.y+sample(base+vec2i(1,1))*t.x*t.y;
 b=(total+vec4u(32896u))/65792u;
 }
 output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);
}`
export interface PackingBuffers {states:readonly GPUBuffer[];stationary:GPUBuffer;output:GPUBuffer}
export interface IntegerSmoothOverrides {observePacking?:(buffers:PackingBuffers)=>void;packSourceOverride?:string;pairSourceOverride?:string;packSeed?:boolean}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={},options:IntegerSmoothOverrides={}):Promise<Candidate>{
 if(size!==1024)throw Error('Integer dynamic requires1024');const mixing=integerOption(config.mixing??1,0,1,'mixing'),smooth=integerOption(config.smooth??1,0,1,'smooth');const n=128,N=n*n,steps=integerOption(config.steps??128,1,512,'steps'),usage=BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC
 const pair=await pipeline(device,options.pairSourceOverride??MACRO9_PAIR,'u32-dynamic-pair-absorption'),pack=await pipeline(device,options.packSourceOverride??MACRO9_PACK,'u32-dynamic-nearest')
 const all:GPUBuffer[]=[];const alloc=(bytes:number,flags:number,label:string)=>{const b=buffer(device,bytes,flags,label);all.push(b);return b}
 try{
 const state=[alloc(N*48,usage,'dynamic0'),alloc(N*48,usage,'dynamic1')],aux=alloc(N*16,usage,'capacity-paper'),stationary=alloc(size*size*4,usage,'literal-stationary'),output=alloc(size*size*4,usage,'output'),staging=alloc(size*size*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'readback'),stateStaging=alloc(N*48,BUFFER.COPY_DST|BUFFER.MAP_READ,'state-ledger')
 const params=Array.from({length:4},(_,phase)=>{const b=alloc(16,BUFFER.UNIFORM|BUFFER.COPY_DST,'phase');device.queue.writeBuffer(b,0,Uint32Array.of(n,size,phase,0));return b})
 const packParams=options.packSeed?alloc(16,BUFFER.UNIFORM|BUFFER.COPY_DST,'pack-seed-params'):params[0]
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))})
 const groups=Array.from({length:4},(_,phase)=>[0,1].map(i=>bind(pair,[state[i],aux,state[1-i],params[phase]]))),packing=[0,1].map(i=>bind(pack,[state[i],stationary,output,packParams]))
 options.observePacking?.({states:state,stationary,output})
 let destroyed=false,uploaded=false,ready=false,summary:ReturnType<typeof initialIntegerDynamic>['summary']|null=null,ledger:Record<string,number>|null=null
 return{metadata:Object.freeze({algorithm:'u32-dynamic-carrier-exchange-smooth',grid:n,steps,dispatches:steps+1,mixing:mixing===1,get reconstruction(){return !smooth?'nearest-requested':summary&&summary.initialStationaryAlpha>0?'nearest-global-fallback-stationary':'integer-halfpixel-bilinear'},get reconstructionFallback(){return smooth&&summary&&summary.initialStationaryAlpha>0?'stationaryAlpha>0: bilinear capacity not certified':null},staticWallMap:false,waterBlocked:false,coefficients:mixing?'dt35/100,exchange64/256 wet-ratio scaled,absorption1/128,adsorption20/100':'old V8 dt35/100,absorption1/32,adsorption70/100',get initial(){return summary?{...summary}:null},get finalState(){return ledger?{...ledger}:null},massScope:'coarse M+D/W+S integer exact; input reduction and final byte rounding separate',limitations:'Phenomenological capacity, not full CFD. Mixed cells with insufficient fine free alpha keep ALL original pigment stationary; frozenWetAlpha explicitly reported. Global nearest fallback whenever stationary pigment exists; otherwise continuous integer reconstruction.',seedUsed:options.packSeed===true,featuresRequired:[]}),async upload(input:Input){
 if(destroyed)throw Error('Destroyed');validateInput(input,size);const data=initialIntegerDynamic(input);summary=data.summary;ledger=null;const flags=(summary.initialStationaryAlpha>0?1:0)|(mixing?2:0)|(!smooth?4:0);for(const b of params)device.queue.writeBuffer(b,12,Uint32Array.of(flags));if(options.packSeed)device.queue.writeBuffer(packParams,0,Uint32Array.of(n,size,input.seed,flags));device.queue.writeBuffer(state[0],0,data.state);device.queue.writeBuffer(aux,0,data.aux);device.queue.writeBuffer(stationary,0,data.stationary);await device.queue.onSubmittedWorkDone();uploaded=true;ready=false
 },run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pair);for(let s=0;s<steps;s++){p.setBindGroup(0,groups[s%4][s%2]);p.dispatchWorkgroups(16,16)}p.setPipeline(pack);p.setBindGroup(0,packing[steps%2]);p.dispatchWorkgroups(128,128);p.end();device.queue.submit([e.finish()]);ready=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},async readback(){
 if(destroyed||!ready)throw Error('No output');const pixels=await readPacked(device,output,size,staging),e=device.createCommandEncoder();e.copyBufferToBuffer(state[steps%2],0,stateStaging,0,N*48);device.queue.submit([e.finish()]);await stateStaging.mapAsync(1)
 try{const a=new Uint32Array(stateStaging.getMappedRange());let surface=0,absorbed=0,mobile=0,adsorbed=0;for(let i=0;i<N;i++){surface+=a[i*12+8];absorbed+=a[i*12+9];mobile+=a[i*12+3];adsorbed+=a[i*12+7]}ledger={surfaceCodes:surface,absorbedCodes:absorbed,totalWaterCodes:surface+absorbed,mobileAlphaCodes:mobile,adsorbedAlphaCodes:adsorbed,totalPigmentAlphaCodes:mobile+adsorbed}}finally{stateStaging.unmap()}return pixels
 },destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
 }catch(error){for(const b of all)b.destroy();throw error}
}
export const integerSmoothDefinitions=[
 {id:'wgsl-macro-integer-smooth-control',label:'Целочисленное сглаживание — без нового смешения',create:(d:GPUDevice,s:number,c:Record<string,number>={})=>create(d,s,{...c,mixing:0}),configs:[{steps:128,smooth:1}]},
 {id:'wgsl-macro-integer-mixing-smooth',label:'Динамическое смешение и гладкая реконструкция',create,configs:[{steps:128,smooth:1},{steps:256,smooth:1},{steps:256,smooth:0}]}
]
