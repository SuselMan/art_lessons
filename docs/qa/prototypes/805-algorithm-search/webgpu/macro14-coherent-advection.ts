import {readCoarseCarrierLedger,cloneCoarseLedger,type CoarseCarrierLedger} from './coarse-carrier-ledger'
import {BUFFER,buffer,integerOption,pipeline,readPacked,validateInput,type Candidate,type Input} from './contract'
import {initialIntegerDynamic} from './macro8-integer-dynamic'
import {MACRO10_LOCAL_PACK} from './macro10-wetness'
import {buildStream} from './macro14-stream-field'
import {coherentSource} from './macro14-coherent-source'
import type {PackingBuffers} from './macro9-integer-smooth'
export interface CoherentOverrides {pairSourceOverride?:string;exchangeSchedule?:readonly boolean[];initializer?:typeof initialIntegerDynamic;packSourceOverride?:string;observePacking?:(buffers:PackingBuffers)=>void}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={},options:CoherentOverrides={}):Promise<Candidate>{
 if(size!==1024)throw Error('Integer dynamic requires1024');const eddyCells=integerOption(config.eddyCells??16,4,64,'eddyCells'),strength=integerOption(config.curlStrength??128,0,128,'curlStrength'),gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain');const n=128,N=n*n,steps=integerOption(config.steps??256,1,512,'steps'),usage=BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC
 const schedule=options.exchangeSchedule===undefined?undefined:Array.from(options.exchangeSchedule)
 if(schedule&&(schedule.length!==steps||!schedule.every(v=>typeof v==='boolean')))throw Error('Invalid exchange schedule')
 const pairSource=options.pairSourceOverride??coherentSource(gain),pairDigest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pairSource)),pairSourceSHA=Array.from(new Uint8Array(pairDigest),b=>b.toString(16).padStart(2,'0')).join('')
 const pair=await pipeline(device,pairSource,'u32-dynamic-pair-absorption'),pack=await pipeline(device,options.packSourceOverride??MACRO10_LOCAL_PACK,'u32-dynamic-nearest')
 const all:GPUBuffer[]=[];const alloc=(bytes:number,flags:number,label:string)=>{const b=buffer(device,bytes,flags,label);all.push(b);return b}
 try{
 const state=[alloc(N*48,usage,'dynamic0'),alloc(N*48,usage,'dynamic1')],aux=alloc(N*16,usage,'capacity-paper'),stationary=alloc(size*size*4,usage,'literal-stationary'),output=alloc(size*size*4,usage,'output'),staging=alloc(size*size*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'readback'),stateStaging=alloc(N*48,BUFFER.COPY_DST|BUFFER.MAP_READ,'state-ledger')
 const params=Array.from({length:schedule?8:4},(_,slot)=>{const phase=slot%4;const b=alloc(16,BUFFER.UNIFORM|BUFFER.COPY_DST,'phase');device.queue.writeBuffer(b,0,Uint32Array.of(n,size,phase,0));return b})
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))})
 const groups=params.map(b=>[0,1].map(i=>bind(pair,[state[i],aux,state[1-i],b]))),packing=[0,1].map(i=>bind(pack,[state[i],stationary,output,params[0]]))
 options.observePacking?.({states:state,stationary,output})
 let destroyed=false,uploaded=false,ready=false,summary:ReturnType<typeof initialIntegerDynamic>['summary']|null=null,ledger:CoarseCarrierLedger|null=null,fieldInfo:ReturnType<typeof buildStream>['metadata']|null=null,fieldSHA:string|null=null
 return{metadata:Object.freeze({algorithm:'u32-coherent-artistic-water-advection',pairSourceSHA,pairSourceHasStreamFaceCall:pairSource.includes('streamFace(ia,ib)'),grid:n,steps,dispatches:steps+1,eddyCells,curlStrength:strength,mobilityGain:gain,get field(){return fieldInfo?{...fieldInfo,sha256:fieldSHA}:null},reconstruction:'integer halfpixel; nearest ONLY at literal stationary pixels',staticWallMap:false,waterBlocked:false,coefficients:'V13 calibrated pressure+mixing; stream face upwind water packets, bounded donor4/5 and recipient capacity; no new absorption coefficient',get initial(){return summary?{...summary,initialCoarsePigmentCodesRGBA:summary.initialCoarsePigmentCodesRGBA.slice()}:null},get finalState(){return ledger?cloneCoarseLedger(ledger):null},massScope:'coarse M+D/W+S integer exact; input reduction and final byte rounding separate',limitations:'Artistic coherent streamfunction, NOT full CFD. Vertex curl is divergence-free before wetness/upwind/donor gates; actual flux need not be. V8 stationary capacity and V10 local reconstruction qualifications remain.',seedUsed:strength>0,featuresRequired:[]}),async upload(input:Input){
 if(destroyed)throw Error('Destroyed');validateInput(input,size);const data=(options.initializer??initialIntegerDynamic)(input),field=buildStream(data.aux,n,input.seed,eddyCells,strength);fieldInfo=field.metadata;const digest=await crypto.subtle.digest('SHA-256',field.psi.buffer);fieldSHA=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');summary={...data.summary,initialCoarsePigmentCodesRGBA:data.summary.initialCoarsePigmentCodesRGBA.slice()};ledger=null;const flags=(summary.initialStationaryAlpha>0?1:0)|2;for(const [slot,b]of params.entries())device.queue.writeBuffer(b,12,Uint32Array.of(flags|(slot>=4?8:0)));device.queue.writeBuffer(state[0],0,data.state);device.queue.writeBuffer(aux,0,data.aux);device.queue.writeBuffer(stationary,0,data.stationary);await device.queue.onSubmittedWorkDone();uploaded=true;ready=false
 },run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pair);for(let s=0;s<steps;s++){p.setBindGroup(0,groups[s%4+(schedule?.[s]?4:0)][s%2]);p.dispatchWorkgroups(16,16)}p.setPipeline(pack);p.setBindGroup(0,packing[steps%2]);p.dispatchWorkgroups(128,128);p.end();device.queue.submit([e.finish()]);ready=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},async readback(){
 if(destroyed||!ready)throw Error('No output');const pixels=await readPacked(device,output,size,staging),e=device.createCommandEncoder();e.copyBufferToBuffer(state[steps%2],0,stateStaging,0,N*48);device.queue.submit([e.finish()]);await stateStaging.mapAsync(1)
 try{const a=new Uint32Array(stateStaging.getMappedRange());if(!summary)throw Error('Missing initial coarse ledger');ledger=readCoarseCarrierLedger(a,summary.initialCoarsePigmentCodesRGBA,summary.initialWaterCodes,ledger?.prePackGuardPassed??true)}finally{stateStaging.unmap()}return pixels
 },destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
 }catch(error){for(const b of all)b.destroy();throw error}
}
export const coherentDefinitions=[{id:'wgsl-macro-coherent-advection',label:'Связный вихревой перенос воды и пигмента',create,configs:[
 {steps:256,mobilityGain:3,eddyCells:16,curlStrength:0},
 {steps:256,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,mobilityGain:6,eddyCells:24,curlStrength:128}
]}]
