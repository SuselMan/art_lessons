/** Exact finite-binary32 fused multiply-add VALUE reference, RNE/gradual underflow.
 * Authored integer-significand math: exact product+sum, then ONE binary32 round.
 * BigInt baseline is deliberately not a hot-renderer implementation. No FENV,
 * NaN/Inf input semantics, payloads, traps, FZ/DN/AH or installed dispatch claim.
 * Output overflow may be infinity. Raw API preserves both zero signs exactly.
 */
interface FiniteBinary32 {readonly negative:boolean;readonly significand:bigint;readonly exponent:number}
function decode(bits:number):FiniteBinary32 {
 if(!Number.isInteger(bits)||bits<0||bits>0xffffffff||((bits>>>23)&255)===255)throw new RangeError('Expected finite binary32 bits')
 const exponent=(bits>>>23)&255,fraction=bits&0x7fffff
 return {negative:(bits>>>31)!==0,significand:BigInt(exponent===0?fraction:fraction+0x800000),exponent:exponent===0?-149:exponent-150}
}
function roundAt(integer:bigint,shift:number):bigint {
 if(shift<=0)return integer<<BigInt(-shift)
 const amount=BigInt(shift),whole=integer>>amount,remainder=integer-(whole<<amount),half=1n<<BigInt(shift-1)
 return remainder>half||(remainder===half&&(whole&1n)!==0n)?whole+1n:whole
}
export function arm64FusedMultiplyAddF32Bits(aBits:number,bBits:number,cBits:number):number {
 const a=decode(aBits),b=decode(bBits),c=decode(cBits),productNegative=a.negative!==b.negative
 const product=a.significand*b.significand,productExponent=a.exponent+b.exponent
 const exponent=Math.min(productExponent,c.exponent)
 const p=product<<BigInt(productExponent-exponent),z=c.significand<<BigInt(c.exponent-exponent)
 const sum=(productNegative?-p:p)+(c.negative?-z:z)
 if(sum===0n)return product===0n&&c.significand===0n&&productNegative&&c.negative?0x80000000:0
 const negative=sum<0n,sign=negative?0x80000000:0,magnitude=negative?-sum:sum
 let top=magnitude.toString(2).length-1+exponent
 if(top < -126){
  const rounded=roundAt(magnitude,-149-exponent)
  // A subnormal may round up to the smallest normal (bit23 set).
  return (sign|Number(rounded))>>>0
 }
 let significand=roundAt(magnitude,top-23-exponent)
 if(significand===0x1000000n){significand>>=1n;top++}
 if(top>127)return (sign|0x7f800000)>>>0
 return (sign|((top+127)<<23)|Number(significand-0x800000n))>>>0
}
const view=new DataView(new ArrayBuffer(4))
/** Numeric convenience: first narrow inputs to binary32; reject resulting Inf/NaN. */
export function arm64FusedMultiplyAddF32(a:number,b:number,c:number):number {
 if(![a,b,c].every(v=>typeof v==='number'&&Number.isFinite(v)))throw new RangeError('Expected finite numeric FMA inputs')
 const bits=(value:number)=>{view.setFloat32(0,value,true);return view.getUint32(0,true)}
 const result=arm64FusedMultiplyAddF32Bits(bits(a),bits(b),bits(c))
 view.setUint32(0,result,true);return view.getFloat32(0,true)
}
