import type {BristleInkProfile} from './brushBristleInk'
import {advanceBristleInkBulk,type BristleInkSpan} from './brushBristleInkBulk'

/** Functional89 proposal. Real clamped HSL saturation, not native RGB8 feedback.
 * This module does not enable shared/importer/renderer admission. */
export const BRISTLE_SATURATION_TABLE_LIMIT=512*1024
const SEGMENTS=512,PARAMETERS=126,HEADER=64,SCREEN_LIMIT=.01,SCREEN_STEPS=2_000_000
const MIN_LOG_PARAMETER=-32
export interface BristleSaturationQuality {
 readonly kind:'deterministic-witness-screen-v2';readonly witnesses:number;readonly referenceSteps:number
 readonly coveredBins:number;readonly requiredBins:number;readonly skipped:number;readonly horizons:readonly number[]
 readonly worst:Readonly<{parameter:number;counter:number;end:number;error:number}>
 readonly maxAbsoluteError:number;readonly limit:number;readonly universalBound:false
}
export interface BristleSaturationTable {readonly kind:'bristle-saturation-functional89-v1';readonly byteLength:number}
/** Compiler-only evidence; runtime deserialization never fabricates a quality receipt. */
export interface CompiledBristleSaturationTable extends BristleSaturationTable {readonly quality:BristleSaturationQuality}
export type BristleSaturationPreparation={readonly kind:'ready';readonly table:CompiledBristleSaturationTable}|{readonly kind:'unsupported';readonly reason:string;readonly quality?:BristleSaturationQuality}
interface Segment {start:number;end:number;q:number;score:number}
interface State {profile:BristleInkProfile;opacityProfile?:BristleInkProfile;bytes:Uint8Array;view:DataView;segments:number;base:number;rows:number;paramOffset:number;segmentOffset:number;rowOffset:number;tailStart:number;tailQ:number;maxParameter:number;multiplicative:boolean}
const issued=new WeakMap<BristleSaturationTable,State>()
const unit=(x:number)=>Number.isFinite(x)&&x>=0&&x<=1
function ceilF32(x:number):number{const data=new ArrayBuffer(4),f=new Float32Array(data),u=new Uint32Array(data);f[0]=x;if(f[0]<x)u[0]++;return f[0]}
function qAt(p:BristleInkProfile,index:number):number {
 const last=p.amount-1,current=1-p.depletion[Math.min(index,last)],previous=Math.fround(1-p.depletion[Math.min(index-1,last)])
 return p.useWeights?previous*p.bristleInkAmountWeight+current*p.inkDepletionWeight:previous*current
}
function logFactor(p:BristleInkProfile,parameter:number,q:number):number{return p.useWeights?Math.log(parameter+q):parameter+Math.log(q)}
function logTransferValue(a:number,b:number,s:number):number {return s===0?0:Math.exp(Math.min(0,a+Math.log(s),b))}
function transferError(a:number,b:number,c:number,d:number):number {
 let error=Math.abs(logTransferValue(a,b,1)-logTransferValue(c,d,1))
 for(const kink of [b-a,d-c])if(Number.isFinite(kink)&&kink<0){const s=Math.exp(kink);error=Math.max(error,Math.abs(logTransferValue(a,b,s)-logTransferValue(c,d,s)))}
 return error
}
function* rowStats(p:BristleInkProfile,segments:readonly Segment[],base:number,parameter:number):Generator<void,Float64Array,void> {
 // Five numbers/node: scale, ceiling, scale slope, ceiling left/right slopes.
 const data=new Float64Array(base*2*5)
 for(let i=0;i<segments.length;i++){
  if(i%128===0)yield
  const segment=segments[i],at=(base+i)*5,log=logFactor(p,parameter,segment.q)*(segment.end-segment.start)
  const derivative=p.useWeights?(segment.end-segment.start)/(parameter+segment.q):segment.end-segment.start
  data[at]=log;data[at+1]=Math.min(0,log);data[at+2]=derivative;data[at+3]=log<=0?derivative:0;data[at+4]=log<0?derivative:0
 }
 for(let i=base-1;i>0;i--){
  if(i%128===0)yield
  const at=i*5,left=i*10,right=left+5,x=data[right]+data[left+1],y=data[right+1]
  data[at]=data[left]+data[right];data[at+1]=Math.min(x,y);data[at+2]=data[left+2]+data[right+2]
  data[at+3]=x<y?data[right+2]+data[left+3]:y<x?data[right+3]:Math.max(data[right+2]+data[left+3],data[right+3])
  data[at+4]=x<y?data[right+2]+data[left+4]:y<x?data[right+4]:Math.min(data[right+2]+data[left+4],data[right+4])
 }
 return data
}
function tangentGap(lo:number,hi:number,v0:number,v1:number,d0:number,d1:number):number {
 const width=hi-lo,slope=(v1-v0)/width,den=d0-d1
 const x=den>0?Math.max(0,Math.min(width,(v1-v0-d1*width)/den)):width/2
 return Math.max(0,Math.min(v0+d0*x,v1+d1*(x-width))-(v0+slope*x))
}
function* cellScore(p:BristleInkProfile,segments:readonly Segment[],base:number,lo:number,hi:number):Generator<void,number,void> {
 const a=yield* rowStats(p,segments,base,lo),b=yield* rowStats(p,segments,base,hi);let worst=0
 for(let i=1;i<base;i++){if(i%128===0)yield;const at=i*5;worst=Math.max(worst,tangentGap(lo,hi,a[at],b[at],a[at+2],b[at+2]),tangentGap(lo,hi,a[at+1],b[at+1],a[at+4],b[at+3]))}
 return worst
}
function* makeSegments(p:BristleInkProfile,tailStart:number,maxParameter:number):Generator<void,Segment[],void> {
 if(tailStart<=1)return[]
 const probes=p.useWeights?[0,maxParameter/1024,maxParameter/128,maxParameter/16,maxParameter/4,maxParameter]:[MIN_LOG_PARAMETER,-16,-8,-4,0,Math.log(2)]
 function* create(start:number,end:number):Generator<void,Segment,void>{
  let sum=0
  for(let i=start;i<end;i++){sum+=Math.log(qAt(p,i));if((i-start)%128===0)yield}
  const q=Math.fround(Math.exp(sum/(end-start)))
  if(!(q>0))throw RangeError('Saturation factor is below the packed positive domain')
  let score=0
  for(const parameter of probes){let delta=0,lo=0,hi=0;const log=logFactor(p,parameter,q)
   for(let i=start;i<end;i++){if((i-start)%128===0)yield;delta+=log-logFactor(p,parameter,qAt(p,i));lo=Math.min(lo,delta);hi=Math.max(hi,delta)}
   score=Math.max(score,hi-lo+Math.abs(delta))
  }
  return{start,end,q,score}
 }
 const segments=[yield* create(1,tailStart)]
 while(segments.length<SEGMENTS){let best=-1,score=-1
  for(let i=0;i<segments.length;i++)if(segments[i].end-segments[i].start>1&&segments[i].score>score){best=i;score=segments[i].score}
  if(best<0||score<1e-12)break
  const old=segments[best],mid=Math.floor((old.start+old.end)/2);segments.splice(best,1,yield* create(old.start,mid),yield* create(mid,old.end));yield
 }
 return segments
}
function segmentAt(s:State,index:number):number {
 let lo=0,hi=s.segments-1
 while(lo<hi){const mid=(lo+hi)>>>1;if(index<s.view.getUint32(s.segmentOffset+mid*8,true))hi=mid;else lo=mid+1}
 return lo
}
function segmentStart(s:State,index:number):number{return index===0?1:s.view.getUint32(s.segmentOffset+(index-1)*8,true)}
function interpolateLog(a:number,b:number,mix:number):number{return mix===0?a:mix===1?b:a*(1-mix)+b*mix}
function intervalTransfer(s:State,parameter:number,start:number,end:number):readonly[number,number] {
 if(start===end)return[0,0]
 let a=0,b=0
 if(start<s.tailStart){
  const stop=Math.min(end,s.tailStart),first=segmentAt(s,start),last=segmentAt(s,stop-1)
  const firstEnd=s.view.getUint32(s.segmentOffset+first*8,true),firstQ=s.view.getFloat32(s.segmentOffset+first*8+4,true)
  let log=logFactor(s.profile,parameter,firstQ)*(Math.min(stop,firstEnd)-start);a=log;b=Math.min(0,log)
  if(first!==last){
   let lower=0,upper=s.rows-1
   while(lower+1<upper){const mid=(lower+upper)>>>1;if(s.view.getFloat32(s.paramOffset+mid*8,true)<=parameter)lower=mid;else upper=mid}
   if(s.rows===1)upper=lower=0
   const x=s.view.getFloat32(s.paramOffset+lower*8,true),y=s.view.getFloat32(s.paramOffset+upper*8,true),mix=x===y?0:Math.max(0,Math.min(1,(parameter-x)/(y-x)))
   const row0=s.view.getUint32(s.paramOffset+lower*8+4,true),row1=s.view.getUint32(s.paramOffset+upper*8+4,true)
   let left=s.base+first+1,right=s.base+last,la=0,lb=0,ra=0,rb=0
   while(left<right){
    for(let side=0;side<2;side++){
     let node=0
     if(side===0&&left%2)node=left++
     if(side===1&&right%2)node=--right
     if(!node)continue
     let na:number,nb:number
     if(node>=s.base){const leaf=node-s.base,q=s.view.getFloat32(s.segmentOffset+leaf*8+4,true),count=s.view.getUint32(s.segmentOffset+leaf*8,true)-segmentStart(s,leaf);na=logFactor(s.profile,parameter,q)*count;nb=Math.min(0,na)}
     else{const at0=s.rowOffset+(row0*(s.base-1)+node-1)*8,at1=s.rowOffset+(row1*(s.base-1)+node-1)*8;na=interpolateLog(s.view.getFloat32(at0,true),s.view.getFloat32(at1,true),mix);nb=interpolateLog(s.view.getFloat32(at0+4,true),s.view.getFloat32(at1+4,true),mix)}
     if(side===0){lb=Math.min(na+lb,nb);la+=na}else{rb=Math.min(ra+nb,rb);ra+=na}
    }
    left>>>=1;right>>>=1
   }
   const middleA=la+ra,middleB=Math.min(ra+lb,rb);b=Math.min(middleA+b,middleB);a+=middleA
   const q=s.view.getFloat32(s.segmentOffset+last*8+4,true);log=logFactor(s.profile,parameter,q)*(stop-segmentStart(s,last));b=Math.min(log+b,Math.min(0,log));a+=log
  }
  start=stop
 }
 if(start<end){const log=logFactor(s.profile,parameter,s.tailQ)*(end-start);b=Math.min(log+b,Math.min(0,log));a+=log}
 return[a,b]
}
function* referenceTransfer(p:BristleInkProfile,parameter:number,start:number,end:number):Generator<void,readonly[number,number],void> {
 let a=0,b=0
 const finite=Math.min(end,p.amount)
 for(let i=start;i<finite;i++){if((i-start)%128===0)yield;const log=logFactor(p,parameter,qAt(p,i));if(log===-Infinity)return[-Infinity,-Infinity];a+=log;b=Math.min(0,b+log)}
 if(end>Math.max(start,finite)){const log=logFactor(p,parameter,qAt(p,p.amount))*(end-Math.max(start,finite));a+=log;b=Math.min(0,b+log)}
 return[a,b]
}
function* qualityScreen(s:State):Generator<void,BristleSaturationQuality,void> {
 const n=s.profile.amount,last=2*n+3,parameterBins=s.maxParameter===0?1:8,requiredBins=parameterBins*8*4
 let seed=0x8917c3,steps=0,witnesses=0,maxAbsoluteError=0,skipped=0
 const coverage=new Uint8Array(requiredBins),horizons=[0,0,0,0]
 let worst={parameter:0,counter:1,end:1,error:0}
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 const at=(fraction:number)=>s.multiplicative?MIN_LOG_PARAMETER+(Math.log(2)-MIN_LOG_PARAMETER)*fraction:s.maxParameter*fraction
 function* test(start:number,end:number,parameter:number,bin=-1,horizon=-1):Generator<void,void,void>{
  const cost=Math.max(0,Math.min(end,n)-start)
  if(steps+cost>SCREEN_STEPS){skipped++;return}
  const expected=yield* referenceTransfer(s.profile,parameter,start,end),actual=intervalTransfer(s,parameter,start,end)
  const error=transferError(expected[0],expected[1],actual[0],actual[1])
  if(!Number.isFinite(error)||error>maxAbsoluteError){maxAbsoluteError=error;worst={parameter,counter:start,end,error}}
  steps+=cost;witnesses++
  if(bin>=0)coverage[bin]=1
  if(horizon>=0)horizons[horizon]++
 }
 // At most8*N reference steps. Leave >1M steps for representative random
 // core intervals at N=65536; long anchors cannot consume the whole screen.
 for(let i=0;i<8;i++)yield* test(1,n,at(i/7))
 for(let p=0;p<parameterBins;p++)for(let counter=0;counter<8;counter++)for(let h=0;h<4;h++)for(let repeat=0;repeat<2;repeat++){
  const parameter=at((p+random())/parameterBins),start=1+Math.floor((counter+random())*last/8)
  const length=h===0?1:h===1?16:h===2?Math.min(n,256):Math.max(1,Math.floor(n/4))
  yield* test(start,start+length,parameter,(p*8+counter)*4+h,h)
 }
 // Tail, table edges and safe-integer continuation are independent anchors.
 for(let i=0;i<16;i++){const parameter=at(i/15);yield* test(Math.max(1,n-3),last,parameter);yield* test(n,last,parameter);yield* test(Number.MAX_SAFE_INTEGER-80,Number.MAX_SAFE_INTEGER-1,parameter)}
 const coveredBins=coverage.reduce((sum,value)=>sum+value,0)
 return Object.freeze({kind:'deterministic-witness-screen-v2',witnesses,referenceSteps:steps,maxAbsoluteError,limit:SCREEN_LIMIT,universalBound:false,coveredBins,requiredBins,skipped,horizons:Object.freeze(horizons),worst:Object.freeze(worst)})
}
/** Prewarm-only bounded construction. No hidden strong cache or source mutation.
 * Rejection is explicit; witnesses assess this functional approximation, not
 * a universal error theorem or native color-space/RGB8 equivalence. */
export function* prepareBristleSaturationTableWork(profile:BristleInkProfile):Generator<void,BristleSaturationPreparation,void> {
 // No clock, GL, scheduling or mutable external state is consulted. The caller
 // owns cancellation by iterator.return() and must discard an obsolete result.
 yield
 if(!Object.isFrozen(profile)||!Object.isFrozen(profile.depletion)||profile.amount!==profile.depletion.length||profile.amount<1||profile.amount>65536||!profile.useSaturation)return{kind:'unsupported',reason:'Expected immutable saturation-enabled Bristle ink profile'}
 if(![profile.pressureWeight,profile.bristleLengthWeight,profile.bristleInkAmountWeight].every(unit)||!Number.isFinite(profile.inkDepletionWeight)||profile.inkDepletionWeight<0||profile.inkDepletionWeight>100||typeof profile.useWeights!=='boolean'||typeof profile.useOpacity!=='boolean')return{kind:'unsupported',reason:'Invalid Bristle saturation weights'}
 for(let i=0;i<profile.amount;i++){if(i%128===0)yield;const x=profile.depletion[i];if(!unit(x)||(i>0&&x<profile.depletion[i-1]))return{kind:'unsupported',reason:'Functional89 requires a monotone nondecreasing depletion curve'}}
 const maxParameter=profile.useWeights?2*profile.pressureWeight+profile.bristleLengthWeight:Math.log(2)
 const tailQ=qAt(profile,profile.amount);let tailStart=profile.amount
 while(tailStart>1&&qAt(profile,tailStart-1)===tailQ){tailStart--;if(tailStart%128===0)yield}
 let segments:Segment[]
 try{segments=yield* makeSegments(profile,tailStart,maxParameter)}catch(error){return{kind:'unsupported',reason:error instanceof Error?error.message:'Invalid packed saturation factors'}}
 let base=1;while(base<segments.length)base*=2
 const parameters=[profile.useWeights?0:MIN_LOG_PARAMETER]
 if(maxParameter!==parameters[0])parameters.push(ceilF32(maxParameter))
 const cells:Array<{lo:number;hi:number;score:number}>=[]
 function* addCell(lo:number,hi:number):Generator<void,void,void>{cells.push({lo,hi,score:yield* cellScore(profile,segments,base,lo,hi)})}
 if(parameters.length>1)yield* addCell(parameters[0],parameters[1])
 while(parameters.length<PARAMETERS&&cells.length&&segments.length>1){
  let at=0;for(let i=1;i<cells.length;i++)if(cells[i].score>cells[at].score)at=i
  const cell=cells[at],mid=Math.fround((cell.lo+cell.hi)/2)
  if(cell.score<1e-10||mid===cell.lo||mid===cell.hi)break
  cells.splice(at,1);parameters.push(mid);yield* addCell(cell.lo,mid);yield* addCell(mid,cell.hi)
 }
 parameters.sort((a,b)=>a-b)
 const paramOffset=HEADER,segmentOffset=paramOffset+parameters.length*8,rowOffset=segmentOffset+segments.length*8,byteLength=rowOffset+parameters.length*(base-1)*8
 if(byteLength>BRISTLE_SATURATION_TABLE_LIMIT)return{kind:'unsupported',reason:'Saturation table exceeds512KiB including metadata'}
 const bytes=new Uint8Array(byteLength),view=new DataView(bytes.buffer)
 view.setUint32(0,0x42525339,true);view.setUint32(4,1,true);view.setUint32(8,parameters.length,true);view.setUint32(12,segments.length,true);view.setUint32(16,base,true);view.setUint32(20,tailStart,true);view.setFloat64(24,tailQ,true);view.setFloat64(32,maxParameter,true);view.setUint32(40,Number(!profile.useWeights),true);view.setUint32(44,paramOffset,true);view.setUint32(48,segmentOffset,true);view.setUint32(52,rowOffset,true);view.setUint32(56,profile.amount,true);view.setUint32(60,byteLength,true)
 for(let i=0;i<segments.length;i++){view.setUint32(segmentOffset+i*8,segments[i].end,true);view.setFloat32(segmentOffset+i*8+4,segments[i].q,true)}
 for(let row=0;row<parameters.length;row++){
  view.setFloat32(paramOffset+row*8,parameters[row],true);view.setUint32(paramOffset+row*8+4,row,true)
  const stats=yield* rowStats(profile,segments,base,parameters[row])
  for(let node=1;node<base;node++){if(node%128===0)yield;const at=rowOffset+(row*(base-1)+node-1)*8;view.setFloat32(at,stats[node*5],true);view.setFloat32(at+4,stats[node*5+1],true)}
 }
 const state:State={profile,bytes,view,segments:segments.length,base,rows:parameters.length,paramOffset,segmentOffset,rowOffset,tailStart,tailQ,maxParameter,multiplicative:!profile.useWeights}
 const quality=yield* qualityScreen(state)
 if(quality.coveredBins!==quality.requiredBins||quality.skipped)return{kind:'unsupported',reason:'Insufficient representative saturation quality-screen coverage',quality}
 if(!Number.isFinite(quality.maxAbsoluteError)||quality.maxAbsoluteError>SCREEN_LIMIT)return{kind:'unsupported',reason:'Functional89 deterministic output-quality screen exceeds0.01 (not a universal bound)',quality}
 const table:CompiledBristleSaturationTable=Object.freeze({kind:'bristle-saturation-functional89-v1',byteLength,quality});issued.set(table,state)
 return Object.freeze({kind:'ready',table})
}
/** Explicit upload copy. Caller must budget this transient copy; no arrays or
 * mutable source views escape the opaque table. No GPU API is used here. */
export function copyBristleSaturationTable(table:BristleSaturationTable):Uint8Array {const s=issued.get(table);if(!s)throw TypeError('Expected issued Bristle saturation table');return s.bytes.slice(0,table.byteLength)}
export function bristleSaturationTableValue(table:BristleSaturationTable,profile:BristleInkProfile,span:Pick<BristleInkSpan,'counter'|'initialInk'|'length'|'pressure'|'samples'>,index:number,initialSaturation:number):number {
 const s=issued.get(table)
 if(!s||s.profile!==profile)throw TypeError('Expected matching issued Bristle saturation table')
 if(!Number.isSafeInteger(span.counter)||span.counter<0||!Number.isSafeInteger(span.samples)||span.samples<1||!Number.isSafeInteger(index)||index<0||index>=span.samples||span.counter>Number.MAX_SAFE_INTEGER-index-1||!unit(span.initialInk)||!unit(span.length)||!Number.isFinite(span.pressure)||span.pressure<0||span.pressure>2||!unit(initialSaturation))throw RangeError('Invalid Bristle saturation trajectory')
 if(initialSaturation===0)return 0
 const remaining=1-profile.depletion[Math.min(span.counter,profile.amount-1)],parameter=profile.useWeights?span.pressure*profile.pressureWeight+span.length*profile.bristleLengthWeight:Math.log(span.pressure*span.length)
 const first=profile.useWeights?parameter+span.initialInk*profile.bristleInkAmountWeight+remaining*profile.inkDepletionWeight:span.pressure*span.length*span.initialInk*remaining
 const initial=Math.min(1,initialSaturation*first)
 // Declared functional cutoff: P<exp(-32), q<=1 cannot recover, so
 // zero differs by at most exp(-32), including the first sample.
 if(initial===0||(!profile.useWeights&&parameter<MIN_LOG_PARAMETER))return 0
 if(index===0)return initial
 const transfer=intervalTransfer(s,parameter,span.counter+1,span.counter+index+1)
 return logTransferValue(transfer[0],transfer[1],initial)
}

/** Offline/test convenience only. UI and recorded preparation consume Work. */
export function prepareBristleSaturationTable(profile:BristleInkProfile):BristleSaturationPreparation {
 const work=prepareBristleSaturationTableWork(profile)
 for(;;){const step=work.next();if(step.done)return step.value}
}

export interface BristleSaturationGpuLayout {
 readonly width:1024;readonly height:128;readonly metadataRow:number
 readonly base:number;readonly segments:number;readonly tailStart:number;readonly tailQ:number
 readonly multiplicative:boolean;readonly rows:number
}
/** Owned upload allocation, never a borrowed mutable view of the CPU table.
 * Driver must charge its 512KiB transient until upload completes/cancels. */
export function* copyBristleSaturationGpuRowsWork(table:BristleSaturationTable):Generator<void,Readonly<{bytes:Uint8Array;layout:BristleSaturationGpuLayout}>,void>{
 const s=issued.get(table);if(!s)throw TypeError('Expected issued Bristle saturation table')
 const bytes=new Uint8Array(512*1024),v=new DataView(bytes.buffer)
 // GPU decoder uses big-endian IEEE754 bytes, independent of host endianness.
 for(let row=0;row<s.rows;row++)for(let node=1;node<s.base;node++){
  if(node%128===0)yield
  const src=s.rowOffset+(row*(s.base-1)+node-1)*8,dst=row*4096+(node-1)*8
  for(let c=0;c<2;c++){const x=s.view.getFloat32(src+c*4,true);v.setFloat32(dst+c*4,Number.isFinite(x)?x:-1e30,false)}
 }
 const metadataRow=126
 for(let i=0;i<s.segments;i++){
  if(i%128===0)yield
  v.setFloat32(metadataRow*4096+i*8,s.view.getUint32(s.segmentOffset+i*8,true),false)
  v.setFloat32(metadataRow*4096+i*8+4,s.view.getFloat32(s.segmentOffset+i*8+4,true),false)
 }
 for(let i=0;i<s.rows;i++)v.setFloat32(127*4096+i*4,s.view.getFloat32(s.paramOffset+i*8,true),false)
 return Object.freeze({bytes,layout:Object.freeze({width:1024,height:128,metadataRow,base:s.base,segments:s.segments,tailStart:s.tailStart,tailQ:s.tailQ,multiplicative:s.multiplicative,rows:s.rows})})
}
/** Writes actual per-hair parameter row selection into caller-owned staging.
 * No per-hair object/array allocation and no mutable table storage escapes. */
export function writeBristleSaturationParameter(table:BristleSaturationTable,pressure:number,length:number,target:Float32Array,offset:number):void{
 const s=issued.get(table);if(!s)throw TypeError('Expected issued Bristle saturation table')
 if(!Number.isFinite(pressure)||pressure<0||pressure>2||!unit(length)||!Number.isInteger(offset)||offset<0||offset+4>target.length)throw RangeError('Invalid Bristle saturation parameter staging')
 const parameter=s.multiplicative?Math.max(MIN_LOG_PARAMETER,Math.log(pressure*length)):pressure*s.profile.pressureWeight+length*s.profile.bristleLengthWeight
 let lower=0,upper=s.rows-1
 while(lower+1<upper){const mid=(lower+upper)>>>1;if(s.view.getFloat32(s.paramOffset+mid*8,true)<=parameter)lower=mid;else upper=mid}
 if(s.rows===1)upper=lower=0
 const a=s.view.getFloat32(s.paramOffset+lower*8,true),b=s.view.getFloat32(s.paramOffset+upper*8,true)
 target[offset]=lower;target[offset+1]=upper;target[offset+2]=a===b?0:Math.max(0,Math.min(1,(parameter-a)/(b-a)));target[offset+3]=parameter
}
/** Request row collapse has no spatial approximation: it interpolates exactly
 * the same neighboring profile rows as the shader. A 65th distinct parameter
 * selects explicit full-profile fallback before any output storage is touched. */
export function collapseBristleSaturationRequest(table:BristleSaturationTable,parameters:Float32Array,count:number,upload:Uint8Array,rows:Uint8Array):Readonly<{kind:'collapsed';rowCount:number;uploadBytes:number}>|Readonly<{kind:'full-profile'}>{
 const s=issued.get(table);if(!s)throw TypeError('Expected issued Bristle saturation table')
 if(!Number.isInteger(count)||count<0||count>4096||count>parameters.length||rows.length<count||upload.length<65*4096)throw RangeError('Invalid saturation request storage')
 const unique:number[]=[]
 for(let i=0;i<count;i++){
  const parameter=parameters[i]
  if(!Number.isFinite(parameter)||parameter<(s.multiplicative?MIN_LOG_PARAMETER:0)||parameter>s.maxParameter+1e-5)throw RangeError('Invalid saturation request parameter')
  if(!unique.includes(parameter)){if(unique.length===64)return Object.freeze({kind:'full-profile'});unique.push(parameter)}
 }
 const v=new DataView(upload.buffer,upload.byteOffset,upload.byteLength)
 for(let row=0;row<unique.length;row++){
  const parameter=unique[row];let lower=0,upper=s.rows-1
  while(lower+1<upper){const mid=(lower+upper)>>>1;if(s.view.getFloat32(s.paramOffset+mid*8,true)<=parameter)lower=mid;else upper=mid}
  if(s.rows===1)upper=lower=0
  const a=s.view.getFloat32(s.paramOffset+lower*8,true),b=s.view.getFloat32(s.paramOffset+upper*8,true),mix=a===b?0:Math.max(0,Math.min(1,(parameter-a)/(b-a)))
  for(let node=1;node<s.base;node++)for(let c=0;c<2;c++){
   const a=s.view.getFloat32(s.rowOffset+(lower*(s.base-1)+node-1)*8+c*4,true),b=s.view.getFloat32(s.rowOffset+(upper*(s.base-1)+node-1)*8+c*4,true)
   const x=lower===upper?a:a*(1-mix)+b*mix
   v.setFloat32(row*4096+(node-1)*8+c*4,Number.isFinite(x)?x:-1e30,false)
  }
 }
 for(let i=0;i<s.segments;i++){v.setFloat32(64*4096+i*8,s.view.getUint32(s.segmentOffset+i*8,true),false);v.setFloat32(64*4096+i*8+4,s.view.getFloat32(s.segmentOffset+i*8+4,true),false)}
 for(let i=0;i<count;i++)rows[i]=unique.indexOf(parameters[i])
 return Object.freeze({kind:'collapsed',rowCount:unique.length,uploadBytes:65*4096})
}
export function assertBristleSaturationTableProfile(table:BristleSaturationTable,profile:BristleInkProfile):void{if(issued.get(table)?.profile!==profile)throw TypeError('Expected matching issued Bristle saturation table')}
/** Reconstructs a bounded upload stripe directly from the owned CPU table.
 * Used only when a request has >64 distinct parameters; no retained full copy. */
export function writeBristleSaturationGpuStripe(table:BristleSaturationTable,firstRow:number,rowCount:number,target:Uint8Array):void{
 const s=issued.get(table);if(!s)throw TypeError('Expected issued Bristle saturation table')
 if(!Number.isInteger(firstRow)||!Number.isInteger(rowCount)||firstRow<0||rowCount<1||firstRow+rowCount>128||target.length<rowCount*4096)throw RangeError('Invalid saturation upload stripe')
 target.fill(0,0,rowCount*4096);const v=new DataView(target.buffer,target.byteOffset,rowCount*4096)
 for(let row=firstRow;row<firstRow+rowCount;row++){
  const dst=(row-firstRow)*4096
  if(row<s.rows)for(let node=1;node<s.base;node++)for(let c=0;c<2;c++){const x=s.view.getFloat32(s.rowOffset+(row*(s.base-1)+node-1)*8+c*4,true);v.setFloat32(dst+(node-1)*8+c*4,Number.isFinite(x)?x:-1e30,false)}
  if(row===126)for(let i=0;i<s.segments;i++){v.setFloat32(dst+i*8,s.view.getUint32(s.segmentOffset+i*8,true),false);v.setFloat32(dst+i*8+4,s.view.getFloat32(s.segmentOffset+i*8+4,true),false)}
  if(row===127)for(let i=0;i<s.rows;i++)v.setFloat32(dst+i*4,s.view.getFloat32(s.paramOffset+i*8,true),false)
 }
}

/** Same canonical F32 curve boundary as createBristleInkProfile, split before
 * any allocation/upload owned by a GL painter. */
export function* createBristleSaturationProfileWork(input:import('./brushBristleInk').BristleInkSettings):Generator<void,BristleInkProfile,void>{
 if(!Array.isArray(input.depletion)||input.depletion.length<1||input.depletion.length>65536)throw RangeError('Invalid Bristle ink curve')
 if(![input.pressureWeight,input.bristleLengthWeight,input.bristleInkAmountWeight].every(unit)||!Number.isFinite(input.inkDepletionWeight)||input.inkDepletionWeight<0||input.inkDepletionWeight>100||![input.useOpacity,input.useSaturation,input.useWeights].every(v=>typeof v==='boolean'))throw RangeError('Invalid Bristle ink controls')
 const depletion:number[]=[]
 for(let i=0;i<input.depletion.length;i++){if(i%128===0)yield;const value=input.depletion[i];if(!unit(value))throw RangeError('Invalid Bristle ink curve');depletion.push(Math.fround(value))}
 return Object.freeze({amount:depletion.length,depletion:Object.freeze(depletion),useOpacity:input.useOpacity,useSaturation:input.useSaturation,useWeights:input.useWeights,pressureWeight:input.pressureWeight,bristleLengthWeight:input.bristleLengthWeight,bristleInkAmountWeight:input.bristleInkAmountWeight,inkDepletionWeight:input.inkDepletionWeight})
}
export function* copyBristleSaturationCurveWork(profile:BristleInkProfile):Generator<void,{bytes:Uint8Array;width:number;height:number},void>{
 const width=Math.min(256,profile.amount),height=Math.ceil(profile.amount/width),bytes=new Uint8Array(width*height*4),view=new DataView(bytes.buffer)
 for(let i=0;i<profile.amount;i++){if(i%128===0)yield;view.setFloat32(i*4,profile.depletion[i],true)}
 return {bytes,width,height}
}

/** Runtime bulk advance stays O(hairs), including invisible geometry. Table
 * authority is checked before forwarding to the unchanged opacity-only helper. */
export function advancePreparedBristleSaturationInk(
 table:BristleSaturationTable,profile:BristleInkProfile,
 ...args:Parameters<typeof advanceBristleInkBulk> extends [BristleInkProfile,...infer A]?A:never
):BristleInkSpan{
 const s=issued.get(table);if(!s||s.profile!==profile)throw TypeError('Expected matching issued Bristle saturation table')
 s.opacityProfile??=Object.freeze({...profile,useSaturation:false})
 return advanceBristleInkBulk(s.opacityProfile,...args)
}

export function bristleSaturationParameter(table:BristleSaturationTable,pressure:number,length:number):number{
 const s=issued.get(table);if(!s)throw TypeError('Expected issued Bristle saturation table')
 if(!Number.isFinite(pressure)||pressure<0||pressure>2||!unit(length))throw RangeError('Invalid saturation parameter')
 return Math.fround(s.multiplicative?Math.max(MIN_LOG_PARAMETER,Math.log(pressure*length)):pressure*s.profile.pressureWeight+length*s.profile.bristleLengthWeight)
}

/** Structural decoding only. The asset-readiness boundary separately authenticates
 * the CAS bytes and BRP1 profile digest before supplying this issued table to paint.
 * The raw immutable room-owned plane is borrowed, not copied or exposed. */
export function loadBristleSaturationTable(profile:BristleInkProfile,plane:Uint8Array,byteLength:number):BristleSaturationTable {
 const bad=()=>{throw new RangeError('Invalid compiled Bristle saturation lookup')}
 if(!Object.isFrozen(profile)||!Object.isFrozen(profile.depletion)||!profile.useSaturation||profile.amount!==profile.depletion.length||profile.amount<1||profile.amount>65536)bad()
 if(![profile.pressureWeight,profile.bristleLengthWeight,profile.bristleInkAmountWeight].every(unit)||!Number.isFinite(profile.inkDepletionWeight)||profile.inkDepletionWeight<0||profile.inkDepletionWeight>100||typeof profile.useWeights!=='boolean'||typeof profile.useOpacity!=='boolean')bad()
 for(let i=0;i<profile.amount;i++){const x=profile.depletion[i];if(!unit(x)||Math.fround(x)!==x||(i>0&&x<profile.depletion[i-1]))bad()}
 if(!Number.isInteger(byteLength)||byteLength<HEADER||byteLength>BRISTLE_SATURATION_TABLE_LIMIT)bad()
 let side=2;while(side*side<byteLength)side*=2
 if(plane.byteLength!==side*side)bad()
 const view=new DataView(plane.buffer,plane.byteOffset,byteLength)
 const u=(at:number)=>view.getUint32(at,true)
 const rows=u(8),segments=u(12),base=u(16),tailStart=u(20),tailQ=view.getFloat64(24,true),maxParameter=view.getFloat64(32,true),multiplicative=u(40),paramOffset=u(44),segmentOffset=u(48),rowOffset=u(52)
 if(u(0)!==0x42525339||u(4)!==1||u(56)!==profile.amount||u(60)!==byteLength||rows<1||rows>PARAMETERS||segments>SEGMENTS||base<1||base>SEGMENTS||(base&(base-1))!==0||base!==2**Math.ceil(Math.log2(Math.max(1,segments)))||tailStart<1||tailStart>profile.amount||multiplicative!==Number(!profile.useWeights))bad()
 if(paramOffset!==HEADER||segmentOffset!==HEADER+rows*8||rowOffset!==segmentOffset+segments*8||byteLength!==rowOffset+rows*(base-1)*8)bad()
 const expectedMax=profile.useWeights?2*profile.pressureWeight+profile.bristleLengthWeight:Math.log(2)
 if(maxParameter!==expectedMax||tailQ!==qAt(profile,profile.amount))bad()
 // The tail boundary is canonical: the compiler consumes the maximal equal tail.
 let expectedTail=profile.amount;while(expectedTail>1&&qAt(profile,expectedTail-1)===tailQ)expectedTail--
 if(tailStart!==expectedTail||(segments===0)!==(tailStart===1))bad()
 let previous=profile.useWeights?0:MIN_LOG_PARAMETER
 for(let i=0;i<rows;i++){
  const value=view.getFloat32(paramOffset+i*8,true)
  if(!Number.isFinite(value)||u(paramOffset+i*8+4)!==i||(i===0?value!==previous:value<=previous))bad()
  previous=value
 }
 if(previous!==ceilF32(maxParameter)||rows===1&&maxParameter!==(profile.useWeights?0:MIN_LOG_PARAMETER))bad()
 let end=1
 for(let i=0;i<segments;i++){
  const next=u(segmentOffset+i*8),q=view.getFloat32(segmentOffset+i*8+4,true)
  if(next<=end||next>tailStart||!Number.isFinite(q)||q<=0||q>(profile.useWeights?101:1))bad()
  end=next
 }
 if(end!==tailStart)bad()
 for(let at=rowOffset;at<byteLength;at+=8){
  const scale=view.getFloat32(at,true),cap=view.getFloat32(at+4,true)
  if(Number.isNaN(scale)||scale===Infinity||Number.isNaN(cap)||cap>0)bad()
 }
 for(let i=byteLength;i<plane.byteLength;i++)if(plane[i]!==0)bad()
 const table:BristleSaturationTable=Object.freeze({kind:'bristle-saturation-functional89-v1',byteLength})
 issued.set(table,{profile,bytes:plane,view,segments,base,rows,paramOffset,segmentOffset,rowOffset,tailStart,tailQ,maxParameter,multiplicative:!!multiplicative})
 return table
}
/** Drop borrowed raw bytes before releasing the owning room/preparation lease. */
export function retireBristleSaturationTable(table:BristleSaturationTable):void {issued.delete(table)}

export interface BristleSaturationTableBinding {readonly kind:'bristle-saturation-validated-binding-v1'}
interface BindingState {readonly raw:WeakRef<Uint8Array>;readonly metadata:Omit<State,'bytes'|'view'|'opacityProfile'>;readonly byteLength:number}
const bindings=new WeakMap<BristleSaturationTableBinding,BindingState>()
/** Validation metadata may survive raw eviction; it cannot retain source bytes. */
export function createBristleSaturationTableBinding(table:BristleSaturationTable):BristleSaturationTableBinding {
 const state=issued.get(table);if(!state)throw TypeError('Expected issued Bristle saturation table')
 const {bytes,view:_view,opacityProfile:_opacityProfile,...metadata}=state
 const binding:BristleSaturationTableBinding=Object.freeze({kind:'bristle-saturation-validated-binding-v1'})
 bindings.set(binding,{raw:new WeakRef(bytes),metadata,byteLength:table.byteLength})
 return binding
}
/** O(1) rebind to the exact already-validated room-owned immutable byte plane. */
export function acquireBristleSaturationTableBinding(binding:BristleSaturationTableBinding,raw:Uint8Array):BristleSaturationTable {
 const state=bindings.get(binding)
 if(!state||state.raw.deref()!==raw)throw Error('Bristle saturation binding source is no longer resident')
 const table:BristleSaturationTable=Object.freeze({kind:'bristle-saturation-functional89-v1',byteLength:state.byteLength})
 issued.set(table,{...state.metadata,bytes:raw,view:new DataView(raw.buffer,raw.byteOffset,state.byteLength)})
 return table
}

export function bristleSaturationGpuLayout(table:BristleSaturationTable):BristleSaturationGpuLayout {
 const s=issued.get(table);if(!s)throw TypeError('Expected issued Bristle saturation table')
 return Object.freeze({width:1024,height:128,metadataRow:126,base:s.base,segments:s.segments,tailStart:s.tailStart,tailQ:s.tailQ,multiplicative:s.multiplicative,rows:s.rows})
}
