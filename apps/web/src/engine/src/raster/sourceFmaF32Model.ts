/** Diagnostic WebGL1-operation finite FMA baseline. All limb arithmetic is
 * integer-valued binary32, not JS double products/BigInt. No GLSL/hotpath claim.
 * Authored exact significand algorithm; byte-split arithmetic follows the
 * existing affine16 integer-highp pattern without importing transform code. */
export interface SourceFiniteF32 {readonly negative:boolean;readonly significand:number;readonly exponent:number}
const f=Math.fround,N=72
function valid(a:SourceFiniteF32):void {
 if(typeof a.negative!=='boolean'||!Number.isInteger(a.significand)||a.significand<0||a.significand>16777215||!Number.isInteger(a.exponent)||a.exponent< -149||a.exponent>104|| (a.exponent!==-149&&a.significand<8388608))throw new RangeError('Expected canonical finite binary32 components')
}
export function sourceFiniteF32Components(bits:number):SourceFiniteF32 {
 if(!Number.isInteger(bits)||bits<0||bits>4294967295)throw new RangeError('Expected binary32 bits')
 const sign=Math.floor(bits/2147483648),m=bits-sign*2147483648,e=Math.floor(m/8388608),frac=m-e*8388608
 if(e===255)throw new RangeError('Expected finite binary32')
 return {negative:sign===1,significand:e===0?frac:frac+8388608,exponent:e===0?-149:e-150}
}
const bytes=(n:number)=>[n%256,Math.floor(n/256)%256,Math.floor(n/65536)]
function carry(a:number[]):void {for(let i=0;i<a.length-1;i++){const q=Math.floor(a[i]/256);a[i]=f(a[i]-f(q*256));a[i+1]=f(a[i+1]+q)}}
function aligned(values:number[],shift:number,width:number):{limbs:number[];tail:boolean}{
 let tail=false
 if(shift<0){
  const bits=-shift,drop=Math.floor(bits/8),rest=bits%8
  for(let i=0;i<Math.min(drop,values.length);i++)tail ||= values[i]!==0
  const right:number[]=[]
  for(let i=drop;i<values.length;i++)right.push(Math.floor(values[i]/2**rest)+(i+1<values.length?(values[i+1]%2**rest)*2**(8-rest):0))
  if(drop<values.length)tail ||= values[drop]%2**rest!==0
  values=right;shift=0
 }
 const a=Array<number>(width).fill(0),byte=Math.floor(shift/8),power=2**(shift%8)
 for(let i=0;i<values.length;i++)if(values[i]!==0){if(byte+i>=width)throw new Error('Alignment bound violated');a[byte+i]=f(values[i]*power)}
 carry(a);return {limbs:a,tail}
}
function bit(a:number[],index:number):number{return index<0||index>=a.length*8?0:Math.floor(a[Math.floor(index/8)]/2**(index%8))%2}
function compute(a:SourceFiniteF32,b:SourceFiniteF32,c:SourceFiniteF32,compact:boolean):number {
 valid(a);valid(b);valid(c)
 const x=bytes(a.significand),y=bytes(b.significand),product=Array<number>(6).fill(0)
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)product[i+j]=f(product[i+j]+f(x[i]*y[j]))
 // Every convolution accumulator <=195075; normalize before alignment,
 // then each shifted byte <=32640. All are exact highp binary32 integers.
 for(let i=0;i<5;i++){const q=Math.floor(product[i]/256);product[i]-=q*256;product[i+1]+=q}
 const topOf=(values:number[])=>{let i=values.length*8-1;while(i>=0&&bit(values,i)===0)i--;return i}
 const productTop=topOf(product),cBytes=bytes(c.significand),cTop=topOf(cBytes)
 const exponent=compact?Math.max(productTop<0?-1000:productTop+a.exponent+b.exponent,cTop<0?-1000:cTop+c.exponent)-79:Math.min(a.exponent+b.exponent,c.exponent)
 if(productTop<0&&cTop<0)return a.negative!==b.negative&&c.negative?2147483648:0
 const width=compact?11:N
 const pa=aligned(product,a.exponent+b.exponent-exponent,width),za=aligned(cBytes,c.exponent-exponent,width),p=pa.limbs,z=za.limbs
 const pn=a.negative!==b.negative;let negative=pn,result:number[]
 if(pn===c.negative){result=p.map((v,i)=>f(v+z[i]));carry(result)}
 else {
  let comparison=0;for(let i=width-1;i>=0&&comparison===0;i--)comparison=Math.sign(p[i]-z[i])
  if(comparison===0){if(pa.tail||za.tail)throw new Error('Discard cancellation bound violated');return 0}
  const hi=comparison>0?p:z,lo=comparison>0?z:p;negative=comparison>0?pn:c.negative;result=Array<number>(width).fill(0)
  let borrow=0;for(let i=0;i<width;i++){let d=f(f(hi[i]-lo[i])-borrow);borrow=Number(d<0);if(borrow)d=f(d+256);result[i]=d}
 }
 // At most ONE operand can have a discarded tail: the largest term has
 // <=48 bits and the window retains80. A discarded smaller operand has
 // top gap>=33 (product) or57 (addend), so cannot cancel the high word.
 const discarded=pa.tail||za.tail
 if(pa.tail&&za.tail)throw new Error('Two discarded tails')
 const tailNegative=pa.tail?pn:c.negative
 if(discarded&&tailNegative!==negative){
  let borrow=1;for(let i=0;i<width&&borrow;i++){const d=result[i]-borrow;result[i]=d<0?255:d;borrow=Number(d<0)}
  if(borrow)throw new Error('Discard borrow bound violated')
 }
 let top=width*8-1;while(top>=0&&bit(result,top)===0)top--
 const sign=negative?2147483648:0
 if(top<0)return sign
 let physicalTop=top+exponent,shift=physicalTop< -126?-149-exponent:top-23
 let q=0;for(let i=top;i>=Math.max(0,shift);i--)q=f(f(q*2)+bit(result,i))
 if(shift<0)q=f(q*2**(-shift))
 if(shift>0){const guard=bit(result,shift-1);let sticky=Number(discarded);for(let i=0;i<shift-1;i++)sticky=Math.max(sticky,bit(result,i));if(guard&&(sticky||q%2))q=f(q+1)}
 if(physicalTop< -126)return sign+q
 if(q===16777216){q=8388608;physicalTop++}
 if(physicalTop>127)return sign+2139095040
 return sign+(physicalTop+127)*8388608+q-8388608
}

/** Full-span exact byte-limb baseline, no discarded tail. */
export const sourceFmaF32Model=(a:SourceFiniteF32,b:SourceFiniteF32,c:SourceFiniteF32):number=>compute(a,b,c,false)
/** Compact aligned80-bit window; signed discarded tail is converted to a
 * floor+sticky representation BEFORE rounding, including subtraction borrow.
 * Ten window bytes plus one carry byte; shared arithmetic with baseline.
 * This proves arithmetic, not GLSL compilation size or hot performance. */
export const sourceFmaF32CompactModel=(a:SourceFiniteF32,b:SourceFiniteF32,c:SourceFiniteF32):number=>compute(a,b,c,true)
