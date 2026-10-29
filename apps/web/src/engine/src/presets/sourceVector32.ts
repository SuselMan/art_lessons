import { arm64ReciprocalEstimateF32 } from './sourceArmFrecpe'
import { sourceImageRoundEven } from './sourceImageTransformReciprocal'
import { normalizeSourcePainterOpacity } from './sourcePainterOpacity'
import { compositeSourceOver32Scalar } from './sourceOver32Scalar'
import { compositeSourceAlphaDarken32 } from './sourceAlphaDarken32'
import type { Rgba8 } from './mixWeightedRgba8'

/** Explicit four-lane, separate-F32 graph. NOT installed factory/FMA identity. */
export interface SourceVector32Data {
 readonly operator:'over'|'alphaDarkenCreamy'|'alphaDarkenHard'
 readonly source:Uint8Array;readonly destination:Uint8Array;readonly mask?:Uint8Array
 readonly cols:number;readonly rows:number
 readonly sourceStride:number;readonly destinationStride:number;readonly maskStride:number
 /** Logical pointer residues modulo16; buffers begin at the first addressed pixel. */
 readonly sourceAlignment:number;readonly destinationAlignment:number
 readonly opacity:number;readonly averageOpacity:number;readonly flow:number
}
export interface SourceVector32Input extends SourceVector32Data {readonly profile:'optimized32-neon64-vector4-no-fma-v1'}
export interface SourceVector32Partition {readonly row:number;readonly prefix:number;readonly vectors:number;readonly tail:number;readonly sourceAligned:boolean}
const f=Math.fround,INV255=f(1/255),INV65025=f(1/65025)
export const sourceVector32StoreByte=(v:number)=>Number.isNaN(v)?0:v>=2147483648?255:v<=-2147483648?0:sourceImageRoundEven(v)&255
/** Closed reciprocal-refinement graph: positive finite denominator, non-NaN
 * estimate/refinement. Double has enough bits for each F32 product and2-product
 * near1, so one final F32 store models fused FRECPS. Inf propagates naturally.
 * General ARM special/NaN payload/exception semantics are NOT this API. */
export function sourceVector32ReciprocalStep(denominator:number,estimate:number):number {
 if(!(denominator>0)||!Number.isFinite(denominator)||f(denominator)!==denominator||Number.isNaN(estimate)||f(estimate)!==estimate||(Number.isFinite(estimate)&&!(denominator*estimate>=.5&&denominator*estimate<=2)))throw new RangeError('Invalid reciprocal refinement domain')
 return f(2-denominator*estimate)
}
export const sourceVector32RefinedDivide=(numerator:number,denominator:number)=>{
 let r=arm64ReciprocalEstimateF32(denominator)
 r=f(sourceVector32ReciprocalStep(denominator,r)*r)
 r=f(sourceVector32ReciprocalStep(denominator,r)*r)
 return f(numerator*r)
}
export function sourceVector32Partition(cols:number,destinationResidue:number,sourceResidue:number,constantSource:boolean):Omit<SourceVector32Partition,'row'> {
 if(!Number.isInteger(cols)||cols<1||cols>4096||![destinationResidue,sourceResidue].every(v=>[0,4,8,12].includes(v)))throw new RangeError('Invalid vector row partition')
 const prefix=destinationResidue===0?0:cols>8?(16-destinationResidue)/4:cols
 const rest=cols-prefix
 return {prefix,vectors:Math.floor(rest/4),tail:rest%4,sourceAligned:constantSource||destinationResidue===sourceResidue}
}
const rgba=(data:Uint8Array,index:number):Rgba8=>[data[index],data[index+1],data[index+2],data[index+3]]
function vector(source:readonly Rgba8[],destination:readonly Rgba8[],mask:readonly number[]|undefined,operator:SourceVector32Input['operator'],opacity:number,average:number,flow:number):Rgba8[] {
 const all=(a:readonly number[],value:number)=>a.every(v=>v===value)
 const D=destination.map(v=>v[3]),S=source.map(v=>v[3])
 let A:number[],blend:number[],color:number[][]
 if(operator==='over'){
  for(let i=0;i<4;i++){S[i]=f(S[i]*opacity);if(mask)S[i]=f(S[i]*f(mask[i]*INV255))}
  if(all(S,0))return destination.map(v=>[...v])
  if(all(D,255)){A=[...D];blend=S.map(v=>f(v*INV255))}
  else if(all(D,0)){A=[...S];blend=[1,1,1,1]}
  else {A=D.map((d,i)=>f(d+f(f(f(255-d)*S[i])*INV255)));blend=S.map((s,i)=>f(s*arm64ReciprocalEstimateF32(A[i])))}
  if(all(blend,1)){
   if(!mask&&opacity===1)return source.map(v=>[...v])
   color=source.map(v=>[v[0],v[1],v[2]])
  }else color=destination.map((d,i)=>[0,1,2].map(k=>f(f(blend[i]*f(source[i][k]-d[k]))+d[k])))
 }else{
  const hard=operator==='alphaDarkenHard'
  if(hard){opacity=f(flow*opacity);average=f(flow*average)}
  const opacityVec=f(255*opacity),averageVec=f(255*average)
  const msk=S.map((s,i)=>mask?f(f(s*mask[i])*INV65025):f(s*INV255))
  for(let i=0;i<4;i++)S[i]=f(msk[i]*opacityVec)
  if(all(S,0))return destination.map(v=>[...v])
  const empty=D.map(v=>v===0),dstBlend=S.map(v=>f(v*INV255))
  if(all(D,0))color=source.map(v=>[v[0],v[1],v[2]])
  else if(all(S,255)){
   if(all(D,255))return source.map(v=>[...v])
   color=source.map(v=>[v[0],v[1],v[2]])
  }else color=destination.map((d,i)=>[0,1,2].map(k=>empty[i]?source[i][k]:f(f(dstBlend[i]*f(source[i][k]-d[k]))+d[k])))
  const full=D.map((d,i)=>{
   if(average>opacity)return averageVec>d?f(f(f(averageVec-S[i])*sourceVector32RefinedDivide(d,averageVec))+S[i]):d
   return opacityVec>d?f(f(f(opacityVec-d)*msk[i])+d):d
  })
  A=full.map((fullAlpha,i)=>{
   if(flow===1)return fullAlpha
   const zero=hard?f(f(S[i]+D[i])-f(f(S[i]*D[i])*INV255)):D[i]
   return f(f(f(fullAlpha-zero)*flow)+zero)
  })
 }
 return color.map((c,i)=>[sourceVector32StoreByte(c[0]),sourceVector32StoreByte(c[1]),sourceVector32StoreByte(c[2]),sourceVector32StoreByte(A[i])])
}
/** Internal trusted numeric strategies; no untrusted callback/wire admission. */
export interface SourceVector32Kernels {
 readonly scalar:(source:Rgba8,destination:Rgba8,mask:number|undefined,operator:SourceVector32Data['operator'],opacity:number,average:number,flow:number)=>Rgba8
 readonly vector:typeof vector
}
const noFmaKernels:SourceVector32Kernels={vector,scalar:(source,destination,mask,operator,opacity,averageOpacity,flow)=>operator==='over'?compositeSourceOver32Scalar(source,destination,{profile:'optimized32-neon64-scalar-frecpe-rne-v1',opacity,mask}):compositeSourceAlphaDarken32(source,destination,{profile:'optimized32-scalar-f32-rne-v1',variant:operator==='alphaDarkenHard'?'hard':'creamy',opacity,averageOpacity,flow,mask})}
export function compositeSourceVector32(input:SourceVector32Input):{readonly pixels:Uint8Array;readonly partitions:readonly SourceVector32Partition[]} {
 if(!input||input.profile!=='optimized32-neon64-vector4-no-fma-v1')throw new RangeError('Invalid vector32 profile')
 return runSourceVector32Rows(input,noFmaKernels)
}
/** Bounded whole-buffer oracle-friendly executor. Returns a fresh destination,
 * padding preserved. All admission happens before output allocation/work. */
export function runSourceVector32Rows(input:SourceVector32Data,kernels:SourceVector32Kernels):{readonly pixels:Uint8Array;readonly partitions:readonly SourceVector32Partition[]} {
 const q=input
 if(!q||!['over','alphaDarkenCreamy','alphaDarkenHard'].includes(q.operator))throw new RangeError('Invalid vector32 profile')
 const controls=normalizeSourcePainterOpacity(q)
 if(![q.cols,q.rows].every(v=>Number.isInteger(v)&&v>=1&&v<=4096)||q.cols*q.rows>1048576)throw new RangeError('Vector32 work budget exceeded')
 for(const [role,data,stride,width,constant]of [['source',q.source,q.sourceStride,q.cols*4,true],['destination',q.destination,q.destinationStride,q.cols*4,false],['mask',q.mask,q.maskStride,q.cols,false]]as const){
  if(data===undefined){if(role==='mask')continue;throw new RangeError('Missing vector32 pixels')}
  if(!(data instanceof Uint8Array)||data.length>4194304||!Number.isSafeInteger(stride)||stride<0||(stride===0?!constant&&role!=='mask':stride<width))throw new RangeError('Invalid vector32 buffer/stride')
  const needed=stride===0?(constant?4:width):(q.rows-1)*stride+width
  if(!Number.isSafeInteger(needed)||needed>data.length)throw new RangeError('Truncated vector32 buffer')
 }
 if(![q.sourceAlignment,q.destinationAlignment].every(v=>[0,4,8,12].includes(v))||q.sourceStride%4!==0||q.destinationStride%4!==0)throw new RangeError('Invalid pixel alignment')
 const output=q.destination.slice(),partitions:SourceVector32Partition[]=[]
 for(let row=0;row<q.rows;row++){
  const p=sourceVector32Partition(q.cols,(q.destinationAlignment+row*q.destinationStride)%16,(q.sourceAlignment+row*q.sourceStride)%16,q.sourceStride===0)
  partitions.push({row,...p})
  const sourceAt=(col:number)=>q.sourceStride===0?0:row*q.sourceStride+col*4
  const destinationAt=(col:number)=>row*q.destinationStride+col*4
  const maskAt=(col:number)=>q.mask?.[row*q.maskStride+col]
  const scalar=(col:number)=>{
   const src=rgba(q.source,sourceAt(col)),dst=rgba(output,destinationAt(col)),mask=maskAt(col)
   const value=kernels.scalar(src,dst,mask,q.operator,controls.opacity,controls.averageOpacity,controls.flow)
   output.set(value,destinationAt(col))
  }
  for(let col=0;col<p.prefix;col++)scalar(col)
  let col=p.prefix
  for(let group=0;group<p.vectors;group++,col+=4){
   const src=[0,1,2,3].map(i=>rgba(q.source,sourceAt(col+i))),dst=[0,1,2,3].map(i=>rgba(output,destinationAt(col+i))),mask=q.mask?[0,1,2,3].map(i=>maskAt(col+i)!):undefined
   const values=kernels.vector(src,dst,mask,q.operator,controls.opacity,controls.averageOpacity,controls.flow)
   values.forEach((value,i)=>output.set(value,destinationAt(col+i)))
  }
  for(;col<q.cols;col++)scalar(col)
 }
 return {pixels:output,partitions}
}
