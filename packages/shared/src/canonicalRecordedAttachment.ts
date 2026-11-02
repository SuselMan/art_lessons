import {canonicalImageMaterialPin} from './canonicalImageMaterial.js'
import type {Operation} from './operations.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2,CanonicalStrokeSnapshotV3,CanonicalStrokeSnapshotV4,CanonicalStrokeSnapshotV5,CanonicalStrokeSnapshotV6} from './canonicalStrokeOperation.js'
import {canonicalPrimaryTexturePin} from './canonicalPrimaryTexture.js'
import {buildCanonicalMaterial,canonicalTexturedSourceMaterialContext,canonicalPressureTexturedSourceMaterialContext,canonicalSoftNativeDefaultTexturedSourceMaterialContext,type CanonicalMaterialAsset} from './canonicalMaterialCodec.js'
import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_STROKE_RASTER_CONTRACTS,canonicalStrokeRasterContract,decodeCanonicalStrokeFrame,type CanonicalStrokeRasterProfile,type CanonicalStrokeComposition} from './canonicalStrokeFrame.js'
import {canonicalDefaultAutoSourcePin,canonicalGaussianAutoSourcePin} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'

export const CANONICAL_RECORDED_ATTACHMENT_LIMITS=Object.freeze({capabilities:64,bindings:1024,capabilityBytes:256*1024,batchBytes:4*1024*1024})
export interface CanonicalRecordedReadScope {
 readonly roomId:string;readonly boardEpoch:number
 /** Captured receiver policy; omission preserves the historical Over-only gate. */
 readonly rasterProfile?:CanonicalStrokeRasterProfile
 readonly allowedRasterProfiles?:readonly CanonicalStrokeRasterProfile[]
}
export interface CanonicalRecordedReadCapability {readonly originalUserId:string;readonly snapshot:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3|CanonicalStrokeSnapshotV4|CanonicalStrokeSnapshotV5}
/** Batch-local wire dictionary only; indexes never become retained history truth. */
export interface CanonicalRecordedAttachmentV1 {
 readonly version:1;readonly roomId:string;readonly boardEpoch:number
 readonly capabilities:readonly CanonicalRecordedReadCapability[]
 readonly bindings:readonly {readonly operationId:string;readonly sequence:number;readonly originalUserId:string;readonly capability:number}[]
}
/** Internal atomic preparation, not permission to append as originalUserId. */
export interface CanonicalPreparedRecordedOperation {
 readonly operation:Operation
 readonly read?:{readonly roomId:string;readonly boardEpoch:number;readonly rasterProfile:CanonicalStrokeRasterProfile;readonly operationId:string;readonly sequence:number;readonly capability:CanonicalRecordedReadCapability}
}
const fail=():never=>{throw new TypeError('Invalid canonical recorded capability attachment')}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const closed=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>record(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return !!d&&Object.hasOwn(d,'value')})
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length
const attachmentRasterProfile=(value:unknown):CanonicalStrokeRasterProfile=>{
 try{return canonicalStrokeRasterContract(value).profile}catch{return fail()}
}
/** Copy a bounded receiver policy, never a profile selected by received data.
 * The legacy singleton and a list cannot both be supplied. */
export function canonicalRecordedRasterProfiles(scope:Pick<CanonicalRecordedReadScope,'rasterProfile'|'allowedRasterProfiles'>):readonly CanonicalStrokeRasterProfile[] {
 if(scope.rasterProfile!==undefined&&scope.allowedRasterProfiles!==undefined)return fail()
 const profiles=scope.allowedRasterProfiles!==undefined?scope.allowedRasterProfiles:[scope.rasterProfile===undefined?CANONICAL_STROKE_RASTER_PROFILE:scope.rasterProfile]
 if(!Array.isArray(profiles)||profiles.length<1||profiles.length>CANONICAL_STROKE_RASTER_CONTRACTS.length||new Set(profiles).size!==profiles.length)return fail()
 return Object.freeze(profiles.map(attachmentRasterProfile))
}
export function canonicalStrokeSnapshotV2(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalStrokeSnapshotV2 {
 if(!closed(value,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material'])
  ||!text(value.layerId)||!text(value.brush)||!text(value.strokeId)||value.boardEpoch!==epoch||value.materialVersion!==2||value.rasterProfile!==rasterProfile
  ||!integer(epoch)||!Array.isArray(value.assets)||value.assets.length>256||!closed(value.material,['version','assets','primarySource','budget']))return fail()
 // Material/source/budget and composition schema belong to the SAME shared
 // builder/decoder. Validate original bounded metadata before any clone/size walk.
 const s=value as unknown as CanonicalStrokeSnapshotV2,m=s.material,p=m.primarySource
 if(!closed(m.budget,['workUnits','outputBytes','drawPixels'])||m.version!==2||!Array.isArray(m.assets)||m.assets.length>256||!p||!/^[a-f0-9]{64}$/.test(s.descriptorSha256))return fail()
 const kind=Object.getOwnPropertyDescriptor(p,'kind');if(!kind||!Object.hasOwn(kind,'value'))return fail()
 if(kind.value!=='image'&&(s.assets.length!==0||m.assets.length!==0))return fail()
 const image=kind.value==='image'?canonicalImageMaterialPin(p,m.assets):undefined
 if(image){const brush=/^brush:[a-z0-9-]+@([1-9][0-9]*)$/.exec(s.brush);if(!brush||!Number.isSafeInteger(Number(brush[1])))return fail()}
 if(!image&&(m.assets.length!==0||p.kind==='image'||p.descriptorSha256!==s.descriptorSha256
  ||s.brush!==`brush:${p.descriptorId}@${p.descriptorVersion}`||p.brushScale!==1||p.kind==='softAuto'&&p.sourceSlot!==0))return fail()
 if(s.assets.length!==m.assets.length)return fail()
 if(image){const outer=canonicalImageMaterialPin(p,s.assets);if(JSON.stringify(outer.assets)!==JSON.stringify(image.assets))return fail()}
 const probe=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},m)
 const decoded=decodeCanonicalStrokeFrame({version:canonicalStrokeRasterContract(rasterProfile).envelopeVersion,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked:probe.packed},
  {rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material:m})
 const primarySource=image?image.primarySource:p.kind==='defaultAuto'?canonicalDefaultAutoSourcePin(p):p.kind==='gaussianAuto'?canonicalGaussianAutoSourcePin(p):p.kind==='softAuto'?canonicalSoftAutoSourcePin(p):fail()
 const material=Object.freeze({version:2 as const,assets:image?image.assets:Object.freeze([]),primarySource,budget:Object.freeze({workUnits:m.budget.workUnits,outputBytes:m.budget.outputBytes,drawPixels:m.budget.drawPixels})})
 // Reconstruct only validated data fields: unknown extras/accessor serialization
 // cannot enter the bounded size walk or retained capability.
 return Object.freeze({layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,boardEpoch:epoch,descriptorSha256:s.descriptorSha256,rasterProfile,
  pigmentRgb8:decoded.envelope.pigmentRgb8,composition:decoded.envelope.composition,assets:material.assets,materialVersion:2 as const,material})
}
/** New metadata boundary only; old V2 normalization/attachment preparation stay closed. */
function plainData(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!closed(value,keys))return fail()
 const prototype=Object.getPrototypeOf(value)
 if(prototype!==Object.prototype&&prototype!==null)return fail()
 const copy:Record<string,unknown>=Object.create(null)
 for(const key of keys)copy[key]=Object.getOwnPropertyDescriptor(value,key)!.value
 return copy
}
function textureSnapshotAssets(value:unknown){
 if(!Array.isArray(value)||value.length!==2||Object.getPrototypeOf(value)!==Array.prototype)return fail()
 const keys=Reflect.ownKeys(value)
 if(keys.length!==3||keys.some(k=>k!=='0'&&k!=='1'&&k!=='length'))return fail()
 return [0,1].map(index=>{const d=Object.getOwnPropertyDescriptor(value,String(index));if(!d||!Object.hasOwn(d,'value'))return fail();return plainData(d.value,['id','size','x','y','width','height'])})
}
/** Pure standalone snapshot3 pin. No Operation/BEGIN/attachment capability is granted. */
export function canonicalStrokeSnapshotV3(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalStrokeSnapshotV3 {
 const s=plainData(value,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material'])
 if(rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||s.rasterProfile!==rasterProfile||s.materialVersion!==3||s.boardEpoch!==epoch||!integer(epoch)
  ||!text(s.layerId)||!text(s.brush)||!text(s.strokeId)||typeof s.descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(s.descriptorSha256))return fail()
 const brush=/^brush:[a-z0-9-]+@([1-9][0-9]*)$/.exec(s.brush);if(!brush||!Number.isSafeInteger(Number(brush[1])))return fail()
 const m=plainData(s.material,['version','assets','primarySource','primaryTexture','budget']),source=plainData(m.primarySource,['kind','asset','brushScale','brushAngle'])
 if(m.version!==3)return fail()
 const assets=textureSnapshotAssets(m.assets),outer=textureSnapshotAssets(s.assets)
 const image=canonicalImageMaterialPin(source,[assets[0]])
 // Pattern role is distinct from the static primary image; no frame list or dual role.
 const pattern=canonicalPrimaryTexturePin(m.primaryTexture,assets[1] as unknown as CanonicalMaterialAsset)
 const outerImage=canonicalImageMaterialPin(source,[outer[0]])
 canonicalPrimaryTexturePin(pattern,outer[1] as unknown as CanonicalMaterialAsset)
 const fields=['id','size','x','y','width','height'] as const
 if(fields.some(key=>image.assets[0][key]!==outerImage.assets[0][key]||assets[1][key]!==outer[1][key])||image.assets[0].id===pattern.asset)return fail()
 const budget=plainData(m.budget,['workUnits','outputBytes','drawPixels'])
 const normalizedAssets=Object.freeze([image.assets[0],Object.freeze({id:pattern.asset,size:assets[1].size as number,x:0,y:0,width:pattern.width,height:pattern.height})])
 const material=Object.freeze({version:3 as const,assets:normalizedAssets,primarySource:image.primarySource,primaryTexture:pattern,
  budget:Object.freeze({workUnits:budget.workUnits as number,outputBytes:budget.outputBytes as number,drawPixels:budget.drawPixels as number})})
 const composition=plainData(s.composition,['mode','alphaDarken','outerResourceOpacity','outerBlend'])
 const rgb=s.pigmentRgb8
 if(!Array.isArray(rgb)||rgb.length!==3||Object.getPrototypeOf(rgb)!==Array.prototype||Reflect.ownKeys(rgb).length!==4)return fail()
 const pigment=Object.freeze([0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(rgb,String(i));if(!d||!Object.hasOwn(d,'value')||!Number.isInteger(d.value)||d.value<0||d.value>255)return fail();return d.value})) as unknown as readonly [number,number,number]
 const probe=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material)
 const trusted={materialVersion:3 as const,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:pigment,
  composition:composition as unknown as CanonicalStrokeComposition,material}
 const decoded=decodeCanonicalStrokeFrame({version:2,rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:pigment,composition,materialPacked:probe.packed},trusted)
 return Object.freeze({layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,boardEpoch:epoch,descriptorSha256:s.descriptorSha256,rasterProfile,
  pigmentRgb8:decoded.envelope.pigmentRgb8,composition:decoded.envelope.composition,assets:material.assets,materialVersion:3 as const,material})
}
/** Standalone material4 metadata only. No attachment/BEGIN/read union activation. */
export function canonicalStrokeSnapshotV4(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalStrokeSnapshotV4 {
 const contract=canonicalStrokeRasterContract(rasterProfile)
 if(!contract.genericSC)return fail()
 const selectedProfile=contract.profile
 const s=plainData(value,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material'])
 if(s.rasterProfile!==selectedProfile||s.materialVersion!==4||s.boardEpoch!==epoch||!integer(epoch)
  ||!text(s.layerId)||!text(s.brush)||!text(s.strokeId)||typeof s.descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(s.descriptorSha256))return fail()
 const brush=/^brush:([a-z0-9-]+)@([1-9][0-9]*)$/.exec(s.brush)
 if(!brush||!Number.isSafeInteger(Number(brush[2])))return fail()
 // Snapshot metadata cannot smuggle frame-local expectedDrawCount/end selectors.
 plainData(s.material,['version','assets','primarySource','primaryTexture','budget'])
 const material=canonicalTexturedSourceMaterialContext(s.material)
 if(material.primarySource.descriptorId!==brush[1]||material.primarySource.descriptorVersion!==Number(brush[2])||material.primarySource.descriptorSha256!==s.descriptorSha256)return fail()
 const outer=s.assets
 if(!Array.isArray(outer)||outer.length!==1||Object.getPrototypeOf(outer)!==Array.prototype||Reflect.ownKeys(outer).length!==2)return fail()
 const d=Object.getOwnPropertyDescriptor(outer,'0')
 if(!d||!Object.hasOwn(d,'value'))return fail()
 const a=plainData(d.value,['id','size','x','y','width','height'])
 for(const k of ['id','size','x','y','width','height'] as const)if(!Object.is(a[k],material.assets[0][k]))return fail()
 const composition=plainData(s.composition,['mode','alphaDarken','outerResourceOpacity','outerBlend']),rgb=s.pigmentRgb8
 if(!Array.isArray(rgb)||rgb.length!==3||Object.getPrototypeOf(rgb)!==Array.prototype||Reflect.ownKeys(rgb).length!==4)return fail()
 const pigment=Object.freeze([0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(rgb,String(i));if(!d||!Object.hasOwn(d,'value')||!Number.isInteger(d.value)||d.value<0||d.value>255)return fail();return d.value})) as unknown as readonly [number,number,number]
 const probe=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material)
 const trusted={materialVersion:4 as const,rasterProfile:selectedProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:pigment,composition:composition as unknown as CanonicalStrokeComposition,material}
 const decoded=decodeCanonicalStrokeFrame({version:2,rasterProfile:selectedProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:pigment,composition,materialPacked:probe.packed},trusted)
 return Object.freeze({layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,boardEpoch:epoch,descriptorSha256:s.descriptorSha256,rasterProfile:selectedProfile,
  pigmentRgb8:decoded.envelope.pigmentRgb8,composition:decoded.envelope.composition,assets:material.assets,materialVersion:4 as const,material})
}
/** Pure decoder dispatch for an already normalized immutable snapshot. This is
 * not an authenticated delivery/read grant; material3 always carries top selector3. */
/** Same bounded snapshot law, distinct pressure material5 metadata. */
function pressureSourceSnapshot(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile,version:5):CanonicalStrokeSnapshotV5
function pressureSourceSnapshot(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile,version:6):CanonicalStrokeSnapshotV6
function pressureSourceSnapshot(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile,version:5|6):CanonicalStrokeSnapshotV5|CanonicalStrokeSnapshotV6 {
 const contract=canonicalStrokeRasterContract(rasterProfile)
 if(!contract.genericSC)return fail()
 const selectedProfile=contract.profile
 const s=plainData(value,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material'])
 if(s.rasterProfile!==selectedProfile||s.materialVersion!==version||s.boardEpoch!==epoch||!integer(epoch)
  ||!text(s.layerId)||!text(s.brush)||!text(s.strokeId)||typeof s.descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(s.descriptorSha256))return fail()
 const brush=/^brush:([a-z0-9-]+)@([1-9][0-9]*)$/.exec(s.brush)
 if(!brush||!Number.isSafeInteger(Number(brush[2])))return fail()
 // Snapshot metadata cannot smuggle frame-local expectedDrawCount/end selectors.
 plainData(s.material,['version','assets','primarySource','primaryTexture','budget'])
 const material=version===6?canonicalSoftNativeDefaultTexturedSourceMaterialContext(s.material):canonicalPressureTexturedSourceMaterialContext(s.material)
 if(material.primarySource.descriptorId!==brush[1]||material.primarySource.descriptorVersion!==Number(brush[2])||material.primarySource.descriptorSha256!==s.descriptorSha256)return fail()
 const outer=s.assets
 if(!Array.isArray(outer)||outer.length!==1||Object.getPrototypeOf(outer)!==Array.prototype||Reflect.ownKeys(outer).length!==2)return fail()
 const d=Object.getOwnPropertyDescriptor(outer,'0')
 if(!d||!Object.hasOwn(d,'value'))return fail()
 const a=plainData(d.value,['id','size','x','y','width','height'])
 for(const k of ['id','size','x','y','width','height'] as const)if(!Object.is(a[k],material.assets[0][k]))return fail()
 const composition=plainData(s.composition,['mode','alphaDarken','outerResourceOpacity','outerBlend']),rgb=s.pigmentRgb8
 if(!Array.isArray(rgb)||rgb.length!==3||Object.getPrototypeOf(rgb)!==Array.prototype||Reflect.ownKeys(rgb).length!==4)return fail()
 const pigment=Object.freeze([0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(rgb,String(i));if(!d||!Object.hasOwn(d,'value')||!Number.isInteger(d.value)||d.value<0||d.value>255)return fail();return d.value})) as unknown as readonly [number,number,number]
 const empty={masked:false as const,entry:{phase:'between' as const},draws:[],fences:[]},probe=material.version===6?buildCanonicalMaterial(empty,material):buildCanonicalMaterial(empty,material)
 const trusted={materialVersion:5 as const,rasterProfile:selectedProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:pigment,composition:composition as unknown as CanonicalStrokeComposition,material}
 const envelope={version:2,rasterProfile:selectedProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:pigment,composition,materialPacked:probe.packed}
 const decoded=material.version===6?decodeCanonicalStrokeFrame(envelope,{...trusted,materialVersion:6,material}):decodeCanonicalStrokeFrame(envelope,{...trusted,materialVersion:5,material})
 const common={layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,boardEpoch:epoch,descriptorSha256:s.descriptorSha256,rasterProfile:selectedProfile,pigmentRgb8:decoded.envelope.pigmentRgb8,composition:decoded.envelope.composition,assets:material.assets}
 return material.version===6?Object.freeze({...common,materialVersion:6 as const,material}):Object.freeze({...common,materialVersion:5 as const,material})
}
export function canonicalStrokeSnapshotV5(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalStrokeSnapshotV5{return pressureSourceSnapshot(value,epoch,rasterProfile,5)}
export function canonicalStrokeSnapshotV6(value:unknown,epoch:number,rasterProfile:CanonicalStrokeRasterProfile):CanonicalStrokeSnapshotV6{return pressureSourceSnapshot(value,epoch,rasterProfile,6)}
/** Pure decoder dispatch for an already normalized immutable snapshot. This is
 * not an authenticated delivery/read grant; material3 always carries top selector3. */
export function decodeCanonicalRecordedSnapshotFrame(value:unknown,snapshot:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3|CanonicalStrokeSnapshotV4|CanonicalStrokeSnapshotV5,frameOrdinal:number) {
 const s=snapshot,common={rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal,pigmentRgb8:s.pigmentRgb8,composition:s.composition}
 return s.materialVersion===5
  ?decodeCanonicalStrokeFrame(value,{...common,rasterProfile:s.rasterProfile,materialVersion:5,material:s.material})
  :s.materialVersion===4
  ?decodeCanonicalStrokeFrame(value,{...common,rasterProfile:s.rasterProfile,materialVersion:4,material:s.material})
  :s.materialVersion===3
  ?decodeCanonicalStrokeFrame(value,{...common,rasterProfile:s.rasterProfile,materialVersion:3,material:s.material})
  :decodeCanonicalStrokeFrame(value,{...common,material:s.material})
}
/** Caller establishes authoritative delivery origin/read permission and captured
 * room lifetime. Socket.IO JSON is already parsed: this is NOT a preparse cap.
 * Legacy operation schemas remain their existing owner's responsibility.
 * Entire atom validates before return; no engine/log/store/cursor mutation. */
export function prepareCanonicalRecordedAttachment(value:unknown,operations:readonly Operation[],expected:CanonicalRecordedReadScope):readonly CanonicalPreparedRecordedOperation[] {
 const profiles=canonicalRecordedRasterProfiles(expected)
 if(!text(expected.roomId)||!integer(expected.boardEpoch)||!Array.isArray(operations)||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)return fail()
 if(!closed(value,['version','roomId','boardEpoch','capabilities','bindings'])||value.version!==1||value.roomId!==expected.roomId||value.boardEpoch!==expected.boardEpoch
  ||!Array.isArray(value.capabilities)||value.capabilities.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities||!Array.isArray(value.bindings)||value.bindings.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)return fail()
 const capabilities:CanonicalRecordedReadCapability[]=[],identities=new Set<string>(),used=new Set<number>()
 let size=128
 for(const item of value.capabilities){
  if(!closed(item,['originalUserId','snapshot'])||!text(item.originalUserId))return fail()
  if(!record(item.snapshot))return fail()
  const selector=Object.getOwnPropertyDescriptor(item.snapshot,'materialVersion')
  if(!selector||!Object.hasOwn(selector,'value')||![2,3,4,5].includes(selector.value))return fail()
  // Explicit3 is a closed own-DATA boundary before any snapshot user code.
  // Retain the existing legacy2 profile read policy.
  const profile=selector.value===3||selector.value===4||selector.value===5?Object.getOwnPropertyDescriptor(item.snapshot,'rasterProfile'):undefined
  if((selector.value===3||selector.value===4||selector.value===5)&&(!profile||!Object.hasOwn(profile,'value')))return fail()
  const rasterProfile=attachmentRasterProfile(selector.value===3||selector.value===4||selector.value===5?profile!.value:item.snapshot.rasterProfile)
  if(!profiles.includes(rasterProfile))return fail()
  const s=selector.value===5?canonicalStrokeSnapshotV5(item.snapshot,expected.boardEpoch,rasterProfile):selector.value===4?canonicalStrokeSnapshotV4(item.snapshot,expected.boardEpoch,rasterProfile):selector.value===3?canonicalStrokeSnapshotV3(item.snapshot,expected.boardEpoch,rasterProfile):canonicalStrokeSnapshotV2(item.snapshot,expected.boardEpoch,rasterProfile),identity=JSON.stringify([item.originalUserId,s.strokeId])
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
  const rasterProfile=s.rasterProfile
  const decoded=decodeCanonicalRecordedSnapshotFrame(op.frame,s,op.frame.frameOrdinal)
  if(decoded.frame.masked)return fail()
  const operation:CanonicalStrokeOperation=Object.freeze({id:op.id,userId:op.userId,timestamp:op.timestamp,seq:op.seq,type:'canonical_stroke',layerId:op.layerId,frame:decoded.envelope})
  normalizedBindings.push({operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:binding.capability})
  result.push(Object.freeze({operation,read:Object.freeze({roomId:expected.roomId,boardEpoch:expected.boardEpoch,rasterProfile,operationId:op.id,sequence:op.seq,capability})}))
 }
 if(bindingIndex!==value.bindings.length||used.size!==capabilities.length)return fail()
 // Only bounded, projected data reaches serialization. Raw untrusted unknown
 // fields and arbitrary operations are never walked to compute this cap.
 const normalized={version:1,roomId:expected.roomId,boardEpoch:expected.boardEpoch,capabilities,bindings:normalizedBindings}
 if(bytes(normalized)>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)return fail()
 return Object.freeze(result)
}
