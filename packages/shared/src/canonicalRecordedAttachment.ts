import type {Operation} from './operations.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2} from './canonicalStrokeOperation.js'
import {buildCanonicalMaterial} from './canonicalMaterialCodec.js'
import {CANONICAL_STROKE_RASTER_PROFILE,decodeCanonicalStrokeFrame} from './canonicalStrokeFrame.js'
import {canonicalDefaultAutoSourcePin,canonicalGaussianAutoSourcePin} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'

export const CANONICAL_RECORDED_ATTACHMENT_LIMITS=Object.freeze({capabilities:64,bindings:1024,capabilityBytes:256*1024,batchBytes:4*1024*1024})
export interface CanonicalRecordedReadScope {readonly roomId:string;readonly boardEpoch:number}
export interface CanonicalRecordedReadCapability {readonly originalUserId:string;readonly snapshot:CanonicalStrokeSnapshotV2}
/** Batch-local wire dictionary only; indexes never become retained history truth. */
export interface CanonicalRecordedAttachmentV1 {
 readonly version:1;readonly roomId:string;readonly boardEpoch:number
 readonly capabilities:readonly CanonicalRecordedReadCapability[]
 readonly bindings:readonly {readonly operationId:string;readonly sequence:number;readonly originalUserId:string;readonly capability:number}[]
}
/** Internal atomic preparation, not permission to append as originalUserId. */
export interface CanonicalPreparedRecordedOperation {
 readonly operation:Operation
 readonly read?:{readonly roomId:string;readonly boardEpoch:number;readonly operationId:string;readonly sequence:number;readonly capability:CanonicalRecordedReadCapability}
}
const fail=():never=>{throw new TypeError('Invalid canonical recorded capability attachment')}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const closed=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>record(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length
function snapshot(value:unknown,epoch:number):CanonicalStrokeSnapshotV2 {
 if(!closed(value,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material'])
  ||!text(value.layerId)||!text(value.brush)||!text(value.strokeId)||value.boardEpoch!==epoch||value.materialVersion!==2||value.rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE
  ||!Array.isArray(value.assets)||value.assets.length!==0||!closed(value.material,['version','assets','primarySource','budget']))return fail()
 // Material/source/budget and composition schema belong to the SAME shared
 // builder/decoder. Validate original bounded metadata before any clone/size walk.
 const s=value as unknown as CanonicalStrokeSnapshotV2,m=s.material,p=m.primarySource
 if(m.version!==2||!Array.isArray(m.assets)||m.assets.length!==0||!p||p.kind==='image'||p.descriptorSha256!==s.descriptorSha256
  ||s.brush!==`brush:${p.descriptorId}@${p.descriptorVersion}`||p.brushScale!==1||p.kind==='softAuto'&&p.sourceSlot!==0)return fail()
 const probe=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},m)
 const decoded=decodeCanonicalStrokeFrame({version:1,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked:probe.packed},
  {brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material:m})
 const primarySource=p.kind==='defaultAuto'?canonicalDefaultAutoSourcePin(p):p.kind==='gaussianAuto'?canonicalGaussianAutoSourcePin(p):canonicalSoftAutoSourcePin(p)
 const material=Object.freeze({version:2 as const,assets:Object.freeze([]),primarySource,budget:Object.freeze({workUnits:m.budget.workUnits,outputBytes:m.budget.outputBytes,drawPixels:m.budget.drawPixels})})
 // Reconstruct only validated data fields: unknown extras/accessor serialization
 // cannot enter the bounded size walk or retained capability.
 return Object.freeze({layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,boardEpoch:epoch,descriptorSha256:primarySource.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,
  pigmentRgb8:decoded.envelope.pigmentRgb8,composition:decoded.envelope.composition,assets:Object.freeze([]),materialVersion:2 as const,material})
}
/** Caller establishes authoritative delivery origin/read permission and captured
 * room lifetime. Socket.IO JSON is already parsed: this is NOT a preparse cap.
 * Legacy operation schemas remain their existing owner's responsibility.
 * Entire atom validates before return; no engine/log/store/cursor mutation. */
export function prepareCanonicalRecordedAttachment(value:unknown,operations:readonly Operation[],expected:{readonly roomId:string;readonly boardEpoch:number}):readonly CanonicalPreparedRecordedOperation[] {
 if(!text(expected.roomId)||!integer(expected.boardEpoch)||!Array.isArray(operations)||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)return fail()
 if(!closed(value,['version','roomId','boardEpoch','capabilities','bindings'])||value.version!==1||value.roomId!==expected.roomId||value.boardEpoch!==expected.boardEpoch
  ||!Array.isArray(value.capabilities)||value.capabilities.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities||!Array.isArray(value.bindings)||value.bindings.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)return fail()
 const capabilities:CanonicalRecordedReadCapability[]=[],identities=new Set<string>(),used=new Set<number>()
 let size=128
 for(const item of value.capabilities){
  if(!closed(item,['originalUserId','snapshot'])||!text(item.originalUserId))return fail()
  const s=snapshot(item.snapshot,expected.boardEpoch),identity=JSON.stringify([item.originalUserId,s.strokeId])
  // One gesture has ONE immutable capability, even if a duplicate is equal.
  if(identities.has(identity))return fail();identities.add(identity)
  const capability=Object.freeze({originalUserId:item.originalUserId,snapshot:s}),n=bytes(capability)
  if(n>CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilityBytes)return fail()
  size+=n;if(size>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)return fail();capabilities.push(capability)
 }
 const result:CanonicalPreparedRecordedOperation[]=[],ids=new Set<string>()
 let previous=0,bindingIndex=0,nextCapability=0
 const normalizedBindings:CanonicalRecordedAttachmentV1['bindings'][number][]=[]
 for(const op of operations){
  if(!op||!text(op.id)||!text(op.userId)||!integer(op.seq)||op.seq<1||op.seq<=previous||ids.has(op.id))return fail()
  previous=op.seq;ids.add(op.id)
  if(op.type!=='canonical_stroke'){result.push(Object.freeze({operation:op}));continue}
  if(!closed(op,['id','userId','timestamp','seq','type','layerId','frame'])||!text(op.layerId)||typeof op.timestamp!=='number'||!Number.isFinite(op.timestamp)||!record(op.frame)||!integer(op.frame.frameOrdinal))return fail()
  const binding=value.bindings[bindingIndex++]
  if(!closed(binding,['operationId','sequence','originalUserId','capability'])||binding.operationId!==op.id||binding.sequence!==op.seq||binding.originalUserId!==op.userId
   ||!integer(binding.capability)||binding.capability>=capabilities.length)return fail()
  const capability=capabilities[binding.capability],s=capability.snapshot
  if(capability.originalUserId!==op.userId||s.layerId!==op.layerId)return fail()
  if(!used.has(binding.capability)){if(binding.capability!==nextCapability++)return fail();used.add(binding.capability)}
  const decoded=decodeCanonicalStrokeFrame(op.frame,{brush:s.brush,strokeId:s.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material:s.material})
  if(decoded.frame.masked)return fail()
  const operation:CanonicalStrokeOperation=Object.freeze({id:op.id,userId:op.userId,timestamp:op.timestamp,seq:op.seq,type:'canonical_stroke',layerId:op.layerId,frame:decoded.envelope})
  normalizedBindings.push({operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:binding.capability})
  result.push(Object.freeze({operation,read:Object.freeze({roomId:expected.roomId,boardEpoch:expected.boardEpoch,operationId:op.id,sequence:op.seq,capability})}))
 }
 if(bindingIndex!==value.bindings.length||used.size!==capabilities.length)return fail()
 // Only bounded, projected data reaches serialization. Raw untrusted unknown
 // fields and arbitrary operations are never walked to compute this cap.
 const normalized={version:1,roomId:expected.roomId,boardEpoch:expected.boardEpoch,capabilities,bindings:normalizedBindings}
 if(bytes(normalized)>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)return fail()
 return Object.freeze(result)
}
