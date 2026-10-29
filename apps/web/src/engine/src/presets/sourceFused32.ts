import { arm64FusedMultiplyAddF32 } from './sourceArmFmaF32'
import { arm64ReciprocalEstimateF32 } from './sourceArmFrecpe'
import { runSourceVector32Rows,sourceVector32RefinedDivide,sourceVector32StoreByte,type SourceVector32Data,type SourceVector32Kernels,type SourceVector32Partition } from './sourceVector32'

/** Explicit installed-library graph, diagnostic CPU VALUE reference only.
 * Exact library SHA/provenance in fixtures; FPCR0, no active GUI/paint-device,
 * shader/hot-renderer, exception or NaN-payload equivalence is implied. */
export interface SourceFused32Input extends SourceVector32Data {readonly profile:'installed-arm64-vector32-fused-fpcr0-v1'}
const f=Math.fround,INV255=f(1/255),INV65025=f(1/65025),byte=sourceVector32StoreByte
/** Only RCP-generated nonfinite intermediates occur here. Their VALUE classes
 * propagate; NaN payloads/exceptions are unobservable in this RGBA8 API. The
 * general finite BigInt primitive remains strict and is not widened. */
const m=(a:number,b:number,c:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Number.isFinite(c)?arm64FusedMultiplyAddF32(a,b,c):f(a*b+c)
const scalar:SourceVector32Kernels['scalar']=(source,destination,mask,operator,opacity,average,flow)=>{
 let alpha:number,color:readonly number[]
 if(operator==='over'){
  let S=f(source[3]*opacity)
  if(mask!==undefined)S=f(S*f(mask*INV255))
  if(S===0)return [...destination]
  const D=destination[3];let blend:number
  if(D===255){alpha=D;blend=f(S*INV255)}
  else if(D===0){alpha=S;blend=1}
  else {const t=f(S*f(255-D));alpha=m(t,INV255,D);blend=f(S*arm64ReciprocalEstimateF32(alpha))}
  color=blend===1?source:blend===0?destination:[0,1,2].map(k=>byte(m(blend,source[k]-destination[k],destination[k])))
 }else{
  const hard=operator==='alphaDarkenHard'
  if(hard){opacity=f(flow*opacity);average=f(flow*average)}
  const D=destination[3]===0?0:f(destination[3]*INV255),M=mask===undefined?f(source[3]*INV255):f(f(mask*INV65025)*source[3]),S=f(opacity*M)
  color=destination[3]===0?source:[0,1,2].map(k=>byte(m(S,source[k]-destination[k],destination[k])))
  const full=average>opacity?(average>D?m(f(D/average),f(average-S),S):D):(opacity>D?m(f(opacity-D),M,D):D)
  if(flow===1)alpha=f(full*255)
  else {const zero=hard?m(-D,S,f(D+S)):D;alpha=f(m(flow,f(full-zero),zero)*255)}
 }
 return [color[0],color[1],color[2],byte(alpha)]
}
const vector:SourceVector32Kernels['vector']=(source,destination,mask,operator,opacity,average,flow)=>{
 const all=(values:readonly number[],value:number)=>values.every(v=>v===value)
 const D=destination.map(v=>v[3]),S=source.map(v=>v[3]);let alpha:number[],blend:number[],color:number[][]
 if(operator==='over'){
  for(let i=0;i<4;i++){S[i]=f(S[i]*opacity);if(mask)S[i]=f(S[i]*f(mask[i]*INV255))}
  if(all(S,0))return destination.map(v=>[...v])
  if(all(D,255)){alpha=[...D];blend=S.map(v=>f(v*INV255))}
  else if(all(D,0)){alpha=[...S];blend=[1,1,1,1]}
  else {alpha=D.map((d,i)=>m(f(S[i]*f(255-d)),INV255,d));blend=S.map((s,i)=>f(s*arm64ReciprocalEstimateF32(alpha[i])))}
  if(all(blend,1)){
   if(!mask&&opacity===1)return source.map(v=>[...v])
   color=source.map(v=>[v[0],v[1],v[2]])
  }else color=destination.map((d,i)=>[0,1,2].map(k=>m(blend[i],source[i][k]-d[k],d[k])))
 }else{
  const hard=operator==='alphaDarkenHard'
  if(hard){opacity=f(flow*opacity);average=f(flow*average)}
  const O255=f(255*opacity),A255=f(255*average),M=S.map((s,i)=>mask?f(f(s*mask[i])*INV65025):f(s*INV255))
  for(let i=0;i<4;i++)S[i]=f(M[i]*O255)
  if(all(S,0))return destination.map(v=>[...v])
  const dstBlend=S.map(s=>f(s*INV255))
  if(all(D,0))color=source.map(v=>[v[0],v[1],v[2]])
  else if(all(S,255)){
   if(all(D,255))return source.map(v=>[...v])
   color=source.map(v=>[v[0],v[1],v[2]])
  }else color=destination.map((d,i)=>[0,1,2].map(k=>D[i]===0?source[i][k]:m(dstBlend[i],source[i][k]-d[k],d[k])))
  const full=D.map((d,i)=>average>opacity?(A255>d?m(f(A255-S[i]),sourceVector32RefinedDivide(d,A255),S[i]):d):(O255>d?m(f(O255-d),M[i],d):d))
  alpha=full.map((value,i)=>{
   if(flow===1)return value
   const zero=hard?m(f(S[i]*D[i]),-INV255,f(S[i]+D[i])):D[i]
   return m(f(value-zero),flow,zero)
  })
 }
 return color.map((c,i)=>[byte(c[0]),byte(c[1]),byte(c[2]),byte(alpha[i])])
}
const kernels:SourceVector32Kernels={scalar,vector}
export function compositeSourceFused32(input:SourceFused32Input):{readonly pixels:Uint8Array;readonly partitions:readonly SourceVector32Partition[]} {
 if(!input||input.profile!=='installed-arm64-vector32-fused-fpcr0-v1')throw new RangeError('Invalid installed fused32 profile')
 return runSourceVector32Rows(input,kernels)
}
