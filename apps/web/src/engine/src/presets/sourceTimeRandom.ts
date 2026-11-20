/** Functional81 query source, not native Qt RNG sequence. Only explicit random
 * controls opt in. Recorded F64 source time + captured gesture seed + role key
 * define a value independently of packet/callback/query order. */
export interface SourceTimeRandomSource {readonly kind:'grafettoSourceTime-v1';readonly key:string}
const roles=new WeakMap<SourceTimeRandomSource,number>()
// Eight bytes of synchronous scratch; no callback or external getter runs
// between writing the time and consuming BOTH words. No per-query allocation.
const bits=new DataView(new ArrayBuffer(8))
function roleHash(source:SourceTimeRandomSource):number{
 if(source.kind!=='grafettoSourceTime-v1'||typeof source.key!=='string'||source.key.length<1||source.key.length>128||source.key.includes('\0'))throw RangeError('Invalid source-time random role')
 const cached=roles.get(source)
 if(cached!==undefined)return cached
 let value=0x811c9dc5
 for(let i=0;i<source.key.length;i++)value=Math.imul(value^source.key.charCodeAt(i),0x01000193)>>>0
 // Only immutable issued descriptor data may reuse a hash. A mutable caller
 // is still supported without retaining its role or returning stale values.
 if(Object.isFrozen(source))roles.set(source,value)
 return value
}
export function sourceTimeRandomValue(source:SourceTimeRandomSource,strokeSeed:number|undefined,sourceTime:number|undefined):number{
 if(typeof strokeSeed!=='number'||!Number.isInteger(strokeSeed)||strokeSeed<0||strokeSeed>0xffffffff)throw RangeError('Source-time random requires a captured uint32 stroke seed')
 if(typeof sourceTime!=='number'||!Number.isFinite(sourceTime)||sourceTime<0||sourceTime>Number.MAX_SAFE_INTEGER)throw RangeError('Source-time random requires recorded sourceTime')
 const role=roleHash(source)
 // Canonicalize -0, which denotes the same elapsed time after plain JSON.
 bits.setFloat64(0,sourceTime===0?0:sourceTime,true)
 let value=(bits.getUint32(0,true)^Math.imul(bits.getUint32(4,true),0x9e3779b1)^Math.imul(strokeSeed,0x85ebca6b)^role)>>>0
 value=Math.imul(value^(value>>>16),0x7feb352d)>>>0
 value=Math.imul(value^(value>>>15),0x846ca68b)>>>0
 return ((value^(value>>>16))>>>0)/4294967296
}
