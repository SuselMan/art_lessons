import {sourceFiniteF32Components,type SourceFiniteF32} from './sourceFmaF32Model'
const f=Math.fround
const byte=(n:number)=>Number.isInteger(n)&&n>=0&&n<=255
function coefficient(bits:number):{parts:SourceFiniteF32;value:number}{
 const parts=sourceFiniteF32Components(bits)
 if((parts.negative&&parts.significand!==0)||(!parts.negative&&bits>0x40000000))throw new RangeError('Expected coefficient in [0,2]')
 return{parts,value:f(parts.significand*2**parts.exponent)}
}
function topBit(a:readonly number[]):number{let top=-1;for(let i=0;i<a.length;i++)for(let j=0;j<8;j++)if(a[i]>=2**j)top=i*8+j;return top}
/** Normalized exact leading24+fraction16 integers, neither exceeds2^24. */
function normalized(a:readonly number[],top:number):readonly[number,number]{
 const hi=(a[4]??0)*65536+(a[3]??0)*256+(a[2]??0),lo=(a[1]??0)*256+(a[0]??0),shift=top-23
 return shift>=0?[f(Math.floor(hi*2**(16-shift))+Math.floor(lo/2**shift)),f((lo%2**shift)*2**(16-shift))]:[f((hi*65536+lo)*2**(-shift)),0]
}
function roundEven(v:number):number{const lo=Math.floor(v),fraction=f(v-lo);return fraction>.5?lo+1:fraction<.5?lo:lo+(lo-2*Math.floor(lo/2))}
function kernel(parts:SourceFiniteF32,value:number,source:number,destination:number):number{
 if(!byte(source)||!byte(destination))throw new RangeError('Expected RGB bytes')
 const difference=source-destination
 if(difference===0||parts.significand===0)return destination
 const diff=Math.abs(difference),sig=parts.significand,p=Array<number>(4).fill(0);let carry=0
 for(let i=0;i<3;i++){const digit=Math.floor(sig/2**(i*8))%256,total=f(f(digit*diff)+carry);p[i]=total%256;carry=Math.floor(total/256)}p[3]=carry
 const pTop=topBit(p),pNorm=normalized(p,pTop),pPhysical=pTop+parts.exponent,pNegative=difference<0
 // Approximation selects at most one neighboring integer; exact comparisons
 // below decide. It is NEVER clamped or used as an error tolerance.
 const approx=f(f(value*difference)+destination),candidate=roundEven(approx)
 if(candidate< -255||candidate>510)throw new Error('Candidate range proof violated')
 const above=(k:number):boolean=>{
  const odd=k-2*Math.floor(k/2),midpointInteger=2*k+1,midTop=topBit([Math.abs(midpointInteger)%256,Math.floor(Math.abs(midpointInteger)/256)])
  const shift=24-midTop,coefficient=2*(k-destination)+1,nNegative=coefficient<0,magnitude=Math.abs(coefficient),n=Array<number>(5).fill(0),whole=Math.floor(shift/8),rest=shift%8
  for(let i=0;i<2;i++)n[whole+i]=f((Math.floor(magnitude/2**(i*8))%256)*2**rest)
  for(let i=0;i<4;i++){const q=Math.floor(n[i]/256);n[i]=n[i]%256;n[i+1]=f(n[i+1]+q)}
  const correction=(odd===0?1:-1)*(nNegative?-1:1);let residual=correction
  for(let i=0;i<5&&residual!==0;i++){const q=n[i]+residual;if(q<0){n[i]=255;residual=-1}else if(q>=256){n[i]=0;residual=1}else{n[i]=q;residual=0}}
  const nTop=topBit(n),nNorm=normalized(n,nTop),nPhysical=nTop+midTop-25
  let cmp:number
  if(pNegative!==nNegative)cmp=pNegative?-1:1
  else{cmp=pPhysical!==nPhysical?Math.sign(pPhysical-nPhysical):pNorm[0]!==nNorm[0]?Math.sign(pNorm[0]-nNorm[0]):Math.sign(pNorm[1]-nNorm[1]);if(pNegative)cmp=-cmp}
  return cmp>0||(cmp===0&&odd===1)
 }
 const result=above(candidate)?candidate+1:!above(candidate-1)?candidate-1:candidate
 return result-256*Math.floor(result/256)
}
/** Exact F32(FMA(t,source-destination,destination)) then RNE byte model.
 * Integer-highp-compatible32-bit product/threshold math; no BigInt/float64
 * product oracle. Raw bits are CPU serialization only, never a GLSL float. */
export function sourceRgbFmaByteModel(tBits:number,source:number,destination:number):number{const c=coefficient(tBits);return kernel(c.parts,c.value,source,destination)}
/** One coefficient decomposition shared across all three channel decisions. */
export function sourceRgbFmaBytesModel(tBits:number,source:readonly[number,number,number],destination:readonly[number,number,number]):readonly[number,number,number]{const c=coefficient(tBits);return[kernel(c.parts,c.value,source[0],destination[0]),kernel(c.parts,c.value,source[1],destination[1]),kernel(c.parts,c.value,source[2],destination[2])]}
