/** Exact quotient for bounded material ratios, NOT a generic u32 divider.
 * Preconditions: 1<=d<=65535, floor(n/d)<=65535, n<=0xffffffff.
 * f32 numerator conversion error + WGSL division accuracy is <0.04 quotient
 * units here. Thus trunc estimate is at most one away. Both correction products
 * fit u32: (65535+1)*65535=4294901760 < 2^32. No result uses the float estimate
 * without exact unsigned multiply/compare correction. Device validation required.
 * Primary numeric contract: https://www.w3.org/TR/WGSL/#floating-point-accuracy
 */
export const EXACT_BOUNDED_DIVIDE=/* wgsl */`
fn exactBoundedDiv(n:u32,d:u32)->u32{
 var q=min(65535u,u32(f32(n)/f32(d)));
 if(q*d>n){return q-1u;}
 if((q+1u)*d<=n){return q+1u;}
 return q;
}
`
export function exactBoundedDivide(n:number,d:number){
 if(!Number.isInteger(n)||n<0||n>0xffffffff||!Number.isInteger(d)||d<1||d>65535||Math.floor(n/d)>65535)throw Error('Bounded divide precondition')
 let q=Math.min(65535,Math.trunc(Math.fround(Math.fround(n)/Math.fround(d))))
 if(q*d>n)return q-1
 if((q+1)*d<=n)return q+1
 return q
}
