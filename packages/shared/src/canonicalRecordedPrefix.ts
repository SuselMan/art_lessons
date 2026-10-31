import type {AnyCanonicalMaterialFrame,CanonicalMaterialEntry} from './canonicalMaterialCodec.js'

export interface CanonicalMaterialPrefixState {
 readonly nextOrdinal:number
 readonly entry:CanonicalMaterialEntry
 readonly lastGroup:number
 readonly ended:boolean
}
export const CANONICAL_MATERIAL_PREFIX_START:CanonicalMaterialPrefixState=Object.freeze({nextOrdinal:0,entry:Object.freeze({phase:'between' as const}),lastGroup:-1,ended:false})
const fail=():never=>{throw new TypeError('Invalid canonical recorded prefix')}
const integer=(v:number)=>Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER
const sameEntry=(a:CanonicalMaterialEntry,b:CanonicalMaterialEntry)=>a.phase===b.phase&&(a.phase==='between'||b.phase!=='between'&&a.group===b.group)
/** Cross-frame metadata law only. The caller decodes each frame under ONE
 * verified immutable material/context before using this helper. No read/paint
 * authority or local material-schema validation is inferred from these values. */
export function advanceCanonicalMaterialPrefix(state:CanonicalMaterialPrefixState,ordinal:number,frame:Pick<AnyCanonicalMaterialFrame,'entry'|'fences'>):CanonicalMaterialPrefixState {
 if(!integer(ordinal)||ordinal!==state.nextOrdinal||state.ended||!sameEntry(frame.entry,state.entry))return fail()
 let entry=state.entry,lastGroup=state.lastGroup
 let ended:boolean=state.ended
 for(const fence of frame.fences){
  if(fence.kind==='segmentBegin'){
   if(fence.group!==lastGroup+1)return fail()
   lastGroup=fence.group;entry={phase:'primary',group:fence.group}
  }else if(fence.kind==='primaryEnd')entry={phase:'mask',group:fence.group}
  else if(fence.kind==='segmentEnd')entry={phase:'between'}
  else ended=true
 }
 return Object.freeze({nextOrdinal:ordinal+1,entry:Object.freeze({...entry}),lastGroup,ended})
}
export interface CanonicalRecordedPrefixFrame {
 readonly operationId:string
 readonly sequence:number
 readonly frameOrdinal:number
 readonly decoded:Pick<AnyCanonicalMaterialFrame,'entry'|'fences'>
}
/** Complete target prefix under the caller's bounded indexed-query/durable-cut
 * contract, NOT proof against deletion of every trace from physical storage.
 * Open prefixes remain open. Frame count is not a product compatibility cap;
 * the owner bounds total normalized bytes/work and supplies decoded metadata. */
export function verifyCanonicalRecordedPrefix(records:readonly CanonicalRecordedPrefixFrame[]){
 if(!Array.isArray(records)||!records.length)return fail()
 let state=CANONICAL_MATERIAL_PREFIX_START,previous=0,endSeq:number|undefined
 const ids=new Set<string>()
 for(const record of records){
  if(typeof record.operationId!=='string'||!record.operationId.length||record.operationId.length>256||record.operationId.includes('\0')
   ||ids.has(record.operationId)||!integer(record.sequence)||record.sequence<1||record.sequence<=previous)return fail()
  ids.add(record.operationId);previous=record.sequence
  state=advanceCanonicalMaterialPrefix(state,record.frameOrdinal,record.decoded)
  if(state.ended)endSeq=record.sequence
 }
 return Object.freeze({...state,recordedNext:state.nextOrdinal,firstOperationId:records[0].operationId,lastOperationId:records.at(-1)!.operationId,
  firstSeq:records[0].sequence,lastSeq:previous,...endSeq===undefined?{}:{endSeq}})
}
