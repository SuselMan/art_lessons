import {BUFFER,buffer,pipeline,packedRGBA,validateInput,type Input} from './contract'
const HEADER=`struct Params{n:u32,size:u32,phase:u32,pad:u32}
fn bytes(v:u32)->vec4f{return vec4f(f32(v&255u),f32((v>>8u)&255u),f32((v>>16u)&255u),f32(v>>24u))/255.0;}
`
export const FLOAT_WET_INIT=HEADER+`
@group(0) @binding(0) var<storage,read> coarseM:array<vec4f>;
@group(0) @binding(1) var<storage,read> coarseD:array<vec4f>;
@group(0) @binding(2) var<storage,read> raw:array<u32>;
@group(0) @binding(3) var<storage,read> kind:array<u32>;
@group(0) @binding(4) var<storage,read_write> m:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> d:array<vec4f>;
@group(0) @binding(6) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u){if(any(g.xy>=vec2u(p.size))){return;}let i=g.y*p.size+g.x;let q=g.xy*p.n/p.size;let j=q.y*p.n+q.x;var M=vec4f(0);var D=vec4f(0);if(kind[i]==1u){M=coarseM[j];D=coarseD[j];}else if(kind[i]==2u){M=bytes(raw[i]);}m[i]=M;d[i]=D;}`
export const FLOAT_WET_PAIR=HEADER+`
@group(0) @binding(0) var<storage,read> src:array<vec4f>;
@group(0) @binding(1) var<storage,read> kind:array<u32>;
@group(0) @binding(2) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u){if(any(g.xy>=vec2u(p.size))){return;}let axis=p.phase/2u;let offset=p.phase%2u;let coord=select(g.x,g.y,axis==1u);if((coord&1u)!=offset){return;}let i=g.y*p.size+g.x;let q=g.xy+select(vec2u(1,0),vec2u(0,1),axis==1u);if(any(q>=vec2u(p.size))){dst[i]=src[i];return;}let j=q.y*p.size+q.x;let a=src[i];let b=src[j];if(kind[i]>0u&&kind[j]>0u){dst[i]=a*0.75+b*0.25;dst[j]=a*0.25+b*0.75;}else{dst[i]=a;dst[j]=b;}if(coord==1u){let edge=g.xy-select(vec2u(1,0),vec2u(0,1),axis==1u);let e=edge.y*p.size+edge.x;dst[e]=src[e];}}`
export const FLOAT_WET_PACK=HEADER+`
@group(0) @binding(0) var<storage,read> m:array<vec4f>;
@group(0) @binding(1) var<storage,read> d:array<vec4f>;
@group(0) @binding(2) var<storage,read> raw:array<u32>;
@group(0) @binding(3) var<storage,read> kind:array<u32>;
@group(0) @binding(4) var<storage,read_write> output:array<u32>;
@group(0) @binding(5) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u){if(any(g.xy>=vec2u(p.size))){return;}let i=g.y*p.size+g.x;if(kind[i]==0u){output[i]=raw[i];return;}let value=m[i]+d[i];let b=vec4u(floor(clamp(value,vec4f(0),vec4f(1))*255.0+vec4f(0.5)));output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);}`
export const FLOAT_WET_PAIR_WITH_D=FLOAT_WET_PAIR.replace('@compute ','@group(0) @binding(4) var<storage,read> deposited:array<vec4f>;\n@compute ').replace('dst[i]=a*0.75+b*0.25;dst[j]=a*0.25+b*0.75;','let delta=b.a-a.a;var rate=0.25;if(delta!=0.0){let free=select(1.0-deposited[j].a-b.a,1.0-deposited[i].a-a.a,delta>=0.0);rate=min(0.25,max(0.0,free)/abs(delta));}dst[i]=a*(1.0-rate)+b*rate;dst[j]=a*rate+b*(1.0-rate);')
export function fixedWetFloatPairReference(a:readonly number[],b:readonly number[],da:readonly number[],db:readonly number[]){
 for(const [m,d]of[[a,da],[b,db]])if(m.length!==4||d.length!==4||m.some(v=>!Number.isFinite(v)||v<0||v>m[3])||d.some(v=>!Number.isFinite(v)||v<0||v>d[3])||m[3]+d[3]>1)throw Error('Invalid float carrier capacity')
 const delta=b[3]-a[3],free=delta>=0?1-da[3]-a[3]:1-db[3]-b[3],rate=delta===0?.25:Math.min(.25,Math.max(0,free)/Math.abs(delta));return{a:a.map((v,k)=>v*(1-rate)+b[k]*rate),b:b.map((v,k)=>a[k]*rate+v*(1-rate)),rate}
}
export function fixedWetFloatSources(hasDeposit:boolean,weighted=false,stochastic=false){
 let init=FLOAT_WET_INIT,pack=FLOAT_WET_PACK
 if(weighted)init=init.replace('@compute ','@group(0) @binding(7) var<storage,read> weights:array<f32>;\n@compute ').replace('M=coarseM[j];D=coarseD[j];','M=coarseM[j]*weights[i];D=coarseD[j]*weights[i];')
 if(stochastic)pack=pack.replace('@compute ',`fn threshold(x:u32,y:u32,seed:u32)->f32{var v=(x*0x9e3779b9u)^(y*0x85ebca6bu)^seed^805u;v=(v^(v>>16u))*0x7feb352du;v=(v^(v>>15u))*0x846ca68bu;v=v^(v>>16u);return f32(v>>8u)/16777216.0;}\n@compute `).replace('vec4f(0.5)','vec4f(threshold(g.x,g.y,p.pad))')
 if(hasDeposit)return{init,pair:FLOAT_WET_PAIR_WITH_D,pack}
 init=init.replace('@group(0) @binding(1) var<storage,read> coarseD:array<vec4f>;','').replace('@group(0) @binding(5) var<storage,read_write> d:array<vec4f>;','').replace('D=coarseD[j];','D=vec4f(0);').replace('D=coarseD[j]*weights[i];','D=vec4f(0);').replace('d[i]=D;','')
 init=init.replace(/@binding\((\d+)\)/g,(_,n:string)=>'@binding('+({0:0,2:1,3:2,4:3,6:4,7:5} as Record<string,number>)[n]+')')
 pack=pack.replace('@group(0) @binding(1) var<storage,read> d:array<vec4f>;','').replace('m[i]+d[i]','m[i]')
 pack=pack.replace(/@binding\((\d+)\)/g,(_,n:string)=>'@binding('+({0:0,2:1,3:2,4:3,5:4} as Record<string,number>)[n]+')')
 return{init,pair:FLOAT_WET_PAIR,pack}
}
export function prepareFixedWetFloatInput(input:Input,grid:number){
 const size=input.size,ratio=size/grid;if(!Number.isInteger(ratio)||ratio<1)throw Error('Fixed float grid must divide size')
 const full=new Uint8Array(grid*grid).fill(1),kind=new Uint32Array(size*size),raw=packedRGBA(input.rgba),boundaryRGBA=[0,0,0,0]
 for(let i=0;i<kind.length;i++)if(input.water[i]===0)full[Math.floor(Math.floor(i/size)/ratio)*grid+Math.floor((i%size)/ratio)]=0
 let fullCells=0,partialPixels=0,dryPixels=0;for(const a of full)fullCells+=a
 for(let i=0;i<kind.length;i++){kind[i]=input.water[i]===0?0:full[Math.floor(Math.floor(i/size)/ratio)*grid+Math.floor((i%size)/ratio)]?1:2;if(kind[i]===0)dryPixels++;if(kind[i]===2){partialPixels++;for(let k=0;k<4;k++)boundaryRGBA[k]+=Math.fround(input.rgba[i*4+k]/255)}}
 return{full,kind,raw,boundaryRGBA,fullCells,partialPixels,dryPixels}
}
export interface FixedWetFloatTailOptions {size:number;grid:number;mobile:GPUBuffer;deposit?:GPUBuffer;output:GPUBuffer;phases?:number;fineWeights?:GPUBuffer;stochastic?:boolean}
export async function createFixedWetFloatTail(device:GPUDevice,options:FixedWetFloatTailOptions){
 const {size,grid,mobile,output}=options,coarseD=options.deposit,hasDeposit=!!coarseD,phases=options.phases??12;if(size!==1024||![64,128,256,512].includes(grid)||!Number.isInteger(phases)||phases<4||phases>32||phases%4)throw Error('Invalid fixed float tail geometry/phases')
 const sources=fixedWetFloatSources(hasDeposit,!!options.fineWeights,options.stochastic===true),sourceSHA=await Promise.all([sources.init,sources.pair,sources.pack].map(async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('')))
 const init=await pipeline(device,sources.init,'fixed-wet-float-init'),pair=await pipeline(device,sources.pair,'fixed-wet-float-pair'),pack=await pipeline(device,sources.pack,'fixed-wet-float-pack'),all:GPUBuffer[]=[],N=size*size,C=grid*grid,rw=BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC
 const alloc=(bytes:number,flags:number,label:string)=>{const b=buffer(device,bytes,flags,label);all.push(b);return b}
 try{
 const m=[alloc(N*16,rw,'fixed-float-m0'),alloc(N*16,rw,'fixed-float-m1')],d=hasDeposit?alloc(N*16,rw,'fixed-float-deposit'):undefined,raw=alloc(N*4,rw,'fixed-float-original'),kind=alloc(N*4,rw,'fixed-float-original-kind'),params=Array.from({length:4},(_,phase)=>{const p=alloc(16,BUFFER.UNIFORM|BUFFER.COPY_DST,'fixed-float-phase');device.queue.writeBuffer(p,0,Uint32Array.of(grid,size,phase,0));return p})
 const bind=(p:GPUComputePipeline,bs:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:bs.map((b,binding)=>({binding,resource:{buffer:b}}))}),gi=bind(init,[mobile,...(coarseD?[coarseD]:[]),raw,kind,m[0],...(d?[d]:[]),params[0],...(options.fineWeights?[options.fineWeights]:[])]),gp=params.map(p=>[0,1].map(i=>bind(pair,[m[i],kind,m[1-i],p,...(d?[d]:[])]))),go=bind(pack,[m[phases%2],...(d?[d]:[]),raw,kind,output,params[0]])
 let staging:GPUBuffer|undefined
 let dead=false,uploaded=false,ready=false,input:ReturnType<typeof prepareFixedWetFloatInput>|undefined,ledger:Record<string,unknown>|null=null
 return{get metadata(){return{domainPolicyRevision:'initial-fixed-float-v1',grid,phases,sourceSHA:sourceSHA.slice(),ownedBytes:all.reduce((s,b)=>s+b.size,0),diagnosticStagingAllocated:!!staging,hasDepositPlane:hasDeposit,weightedReconstruction:!!options.fineWeights,stochasticQuantization:options.stochastic===true,partition:input?{fullCells:input.fullCells,partialPixels:input.partialPixels,dryPixels:input.dryPixels}:null,ledger,qualification:'f32 prequant M/D ledgers, NOT integer exact mass; final RGBA8 clipping/rounding separately qualified. Raw dry literal and original wet face gate.'}},async upload(value:Input,prepared?:ReturnType<typeof prepareFixedWetFloatInput>){if(dead)throw Error('Destroyed tail');uploaded=false;ready=false;validateInput(value,size);input=prepared??prepareFixedWetFloatInput(value,grid);if(input.kind.length!==N||input.full.length!==C)throw Error('Invalid prepared float partition');ledger=null;device.queue.writeBuffer(raw,0,input.raw);device.queue.writeBuffer(kind,0,input.kind);if(options.stochastic)for(const p of params)device.queue.writeBuffer(p,12,Uint32Array.of(value.seed));await device.queue.onSubmittedWorkDone();uploaded=true},run(){if(dead||!uploaded)throw Error('Fresh tail upload required');uploaded=false;const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(init);p.setBindGroup(0,gi);p.dispatchWorkgroups(128,128);p.setPipeline(pair);for(let phase=0;phase<phases;phase++){p.setBindGroup(0,gp[phase%4][phase%2]);p.dispatchWorkgroups(128,128)}p.setPipeline(pack);p.setBindGroup(0,go);p.dispatchWorkgroups(128,128);p.end();device.queue.submit([e.finish()]);ready=true},async readbackLedger(){if(dead||!ready||!input)throw Error('No tail result');const fineBytes=N*16*(hasDeposit?2:1),coarseBytes=C*16*(hasDeposit?2:1);staging??=alloc(fineBytes+coarseBytes,BUFFER.MAP_READ|BUFFER.COPY_DST,'fixed-float-ledger-staging');const e=device.createCommandEncoder();e.copyBufferToBuffer(m[phases%2],0,staging,0,N*16);if(d)e.copyBufferToBuffer(d,0,staging,N*16,N*16);e.copyBufferToBuffer(mobile,0,staging,fineBytes,C*16);if(coarseD)e.copyBufferToBuffer(coarseD,0,staging,fineBytes+C*16,C*16);device.queue.submit([e.finish()]);await staging.mapAsync(1);try{const a=new Float32Array(staging.getMappedRange()),M=[0,0,0,0],D=[0,0,0,0],expectedM=input.boundaryRGBA.slice(),expectedD=[0,0,0,0],area=(size/grid)**2;let dryMaterial=0,invalid=0,negative=0,overflow=0,inactiveCoarseNonzero=0;for(let i=0;i<N;i++){for(let k=0;k<4;k++){const v=a[i*4+k],z=hasDeposit?a[N*4+i*4+k]:0;M[k]+=v;D[k]+=z;if(!Number.isFinite(v)||!Number.isFinite(z))invalid++;if(v<0||z<0)negative++;if(input.kind[i]===0&&(v!==0||z!==0))dryMaterial++;if(v+z>1.000001)overflow++}}for(let i=0;i<C;i++)for(let k=0;k<4;k++){const v=a[fineBytes/4+i*4+k],z=hasDeposit?a[fineBytes/4+C*4+i*4+k]:0;if(input.full[i]){expectedM[k]+=v*area;expectedD[k]+=z*area}else if(v!==0||z!==0)inactiveCoarseNonzero++}ledger={mobileRGBA:M,depositRGBA:D,expectedMobileRGBA:expectedM,expectedDepositRGBA:expectedD,deltaMobileRGBA:M.map((v,k)=>v-expectedM[k]),deltaDepositRGBA:D.map((v,k)=>v-expectedD[k]),dryMaterial,invalid,negative,overflow,inactiveCoarseNonzero,arithmetic:'f32, compare explicit signed deltas; no integer-exact conservation claim',display:'clamp to RGBA8 only at PACK; overflow is counted before display, never claimed as conserved output byte mass'};return ledger}finally{staging.unmap()}},destroy(){if(dead)return;dead=true;input=undefined;for(const b of all)b.destroy()}}
 }catch(error){for(const b of all)b.destroy();throw error}
}
