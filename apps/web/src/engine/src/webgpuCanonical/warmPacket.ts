import type {PreparedSourceSegment} from './sourcePhaseExecutor'
/** Preserve every Float32 bit, including signed zero; scalar metadata remains
 * JSON exact. This serializer is a QA packet identity, not an op codec. */
export function serializeWarmPacket(packet:PreparedSourceSegment){
 return JSON.stringify(packet,(_key,value)=>{
  if(value instanceof Float32Array)return{float32Bits:Array.from(new Uint32Array(value.buffer,value.byteOffset,value.length))}
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Nonfinite warm packet scalar')
  return value
 })
}
export async function warmPacketSha256(packet:PreparedSourceSegment){
 const bytes=new TextEncoder().encode(serializeWarmPacket(packet)),hash=await crypto.subtle.digest('SHA-256',bytes)
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')
}
export function cloneWarmPacket(packet:PreparedSourceSegment):PreparedSourceSegment{
 const copy=structuredClone(packet)
 if(serializeWarmPacket(copy)!==serializeWarmPacket(packet))throw new Error('Warm packet clone mismatch')
 return copy
}
export interface WarmResourceRecord {label:string;width:number;height:number;filter:'nearest'|'linear';format:'rgba8unorm';bytes:number}
export function assertWarmResourceRetirement(before:readonly WarmResourceRecord[],after:readonly WarmResourceRecord[]){
 const remaining=after.map(r=>JSON.stringify(r))
 for(const record of before){const i=remaining.indexOf(JSON.stringify(record));if(i<0)throw new Error('Warmup altered a preexisting resource ledger');remaining.splice(i,1)}
 if(!remaining.length)return 0
 const constant:WarmResourceRecord={label:'constant zero source water',width:1,height:1,filter:'nearest',format:'rgba8unorm',bytes:4}
 if(remaining.length===1&&remaining[0]===JSON.stringify(constant))return 4
 throw new Error('Warmup left unexpected backend resource ledger')
}
