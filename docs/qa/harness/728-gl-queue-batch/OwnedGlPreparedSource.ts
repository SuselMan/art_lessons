import type { CanonicalDrawCommand } from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import type { PaintTarget } from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
import type { RibbonPasses, RibbonPassesContext } from '../../../../apps/web/src/engine/src/raster/RibbonPasses'
import type { WatercolorPasses } from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import type { PencilPreset } from '../../../../apps/web/src/engine/src/presets/pencilPresets'
import type { RibbonProfile } from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import type { OwnedGlSourceFields } from './OwnedGlSourceFields'
import { createPreparedGlSourcePort } from './PreparedGlSourceDraw'
import { TypedGlSourceReplayPrototype } from './TypedGlSourceReplayPrototype'
export interface PreparedOwnedComposite {
 previewSourceFluid?:Readonly<{waterLevel:number;landedWet:number;wetPeak:number;standingPeak:number}>
 previewSourceGeometry?:Readonly<{firstGap:number;tipDiameter:number}>
 bounds:{minX:number;minY:number;maxX:number;maxY:number};preset:PencilPreset;profile:RibbonProfile
 color:[number,number,number];opacity:number;fieldSeed:[number,number];spreadPx:number;fringeWater:number;migratePx:number;dabSpacing:number;strokeDir:[number,number];bristleRadiusPx:number
}
export interface OwnedSourceChunk {commands:readonly CanonicalDrawCommand[];rect:readonly[number,number,number,number]|null;film:boolean;waterOnly:boolean;composite:PreparedOwnedComposite}
/** Binary typed-array payload plus serialized descriptors/options; NOT a JavaScript heap bound. */
export function retainedSourcePayloadBytes(input:OwnedSourceChunk):number{
 let binary=0
 const buffers=new Set<ArrayBufferLike>()
 const descriptor=JSON.stringify(input,(_key,value:unknown)=>{
  if(ArrayBuffer.isView(value)){if(!(value.buffer instanceof ArrayBuffer))throw Error('Shared retained geometry is mutable');if(!buffers.has(value.buffer)){buffers.add(value.buffer);binary+=value.buffer.byteLength}if(!Number.isSafeInteger(binary))throw Error('Retained payload accounting overflow');return {typedArray:value.constructor.name,byteLength:value.byteLength,byteOffset:value.byteOffset}}
  return value
 })
 const bytes=binary+new TextEncoder().encode(descriptor).byteLength
 if(!Number.isSafeInteger(bytes))throw Error('Retained payload accounting overflow')
 return bytes
}
export type PresentationPredecessorFields=Readonly<Record<'presentation'|'original'|'coverage'|'pigmentLoad'|'colourLoad'|'solventLoad',OwnedGlSourceFields['fields']['presentation']>>
/** Own physical visual/source fields only. Canonical FIFO must replay separately against current predecessor base. */
export class OwnedGlPreparedSource {
 private materialInitialized=false
 private solventInitialized=false
 private retired=false
 private poisoned=false
 private readonly retainForRebase:boolean
 private readonly retainedPayloadBudgetBytes:number
 private readonly chunks:OwnedSourceChunk[]=[]
 private presentationEpoch=0
 private readonly ownerToken:Readonly<{layerId:string;gesture:number}>|null
 private retainedSerializedBytes=0
 private readonly lease:OwnedGlSourceFields
 private readonly context:RibbonPassesContext
 private readonly ribbon:RibbonPasses
 private readonly watercolor:WatercolorPasses
 constructor(input:{lease:OwnedGlSourceFields;context:RibbonPassesContext;ribbon:RibbonPasses;watercolor:WatercolorPasses;retainForRebase?:boolean;retainedPayloadBudgetBytes?:number;ownerToken?:Readonly<{layerId:string;gesture:number}>}){
  this.retainedPayloadBudgetBytes=input.retainedPayloadBudgetBytes??16*1024*1024;if(!Number.isSafeInteger(this.retainedPayloadBudgetBytes)||this.retainedPayloadBudgetBytes<1)throw Error('Explicit retained source payload budget required');this.retainForRebase=input.retainForRebase??false;if(this.retainForRebase&&(!input.ownerToken?.layerId||!Number.isSafeInteger(input.ownerToken.gesture)||input.ownerToken.gesture<1))throw Error('Immutable owner token required for material rebase');this.ownerToken=input.ownerToken?Object.freeze({...input.ownerToken}):null;this.lease=input.lease;this.context=input.context;this.ribbon=input.ribbon;this.watercolor=input.watercolor
 }
 get rebaseToken(){return this.ownerToken}
 get retainedPayloadBytes(){return this.retainedSerializedBytes}
 get epoch():number{return this.presentationEpoch}
 paint(input:OwnedSourceChunk):PaintTarget{
  if(this.poisoned)throw Error('Poisoned presentation requires fenced cancellation');if(this.retired)throw Error('Retired presentation cannot receive source')
  const bytes=this.retainForRebase?retainedSourcePayloadBytes(input):0;if(this.retainForRebase&&(this.chunks.length>=2048||this.retainedSerializedBytes+bytes>this.retainedPayloadBudgetBytes))throw Error('Explicit retained source payload capacity');const snapshot=this.retainForRebase?structuredClone(input):null
  const tile=this.executeChunk(input);if(snapshot){this.chunks.push(snapshot);this.retainedSerializedBytes+=bytes}return tile
 }
 /** Presentation-only rebase: canonical source/future does NOT read or write these fields. */
 rebaseFromPredecessor(input:{ownerToken:object;layerId:string;predecessorGesture:number;expectedEpoch:number;nextEpoch:number;fields:PresentationPredecessorFields}):PaintTarget{
  if(this.retired||this.poisoned||!this.retainForRebase)throw Error('Presentation rebase unavailable')
  if(input.ownerToken!==this.ownerToken||input.layerId!==this.ownerToken?.layerId||!Number.isSafeInteger(input.predecessorGesture)||input.predecessorGesture<1||input.predecessorGesture>=this.ownerToken.gesture)throw Error('Foreign or future presentation owner')
  if(input.expectedEpoch!==this.presentationEpoch||!Number.isSafeInteger(input.nextEpoch)||input.nextEpoch<=input.expectedEpoch)throw Error('Stale presentation predecessor epoch')
  if(!this.chunks.length)throw Error('No immutable source chunks')
  const own=this.lease.fields,identities=new Set(Object.values(own).map(f=>f.texture))
  for(const role of ['presentation','original','coverage','pigmentLoad','colourLoad','solventLoad']as const){const f=input.fields[role];if(!f||f.width!==1024||f.height!==1024||identities.has(f.texture))throw Error('Predecessor source feedback/dimension invalid')}
  // Prevalidate every binding before touching owned fields. Replay never regenerates dabs/geometry.
  try{for(const role of ['presentation','original','coverage','pigmentLoad','colourLoad','solventLoad']as const)input.fields[role].copyTo(own[role])
   this.materialInitialized=false;this.solventInitialized=false
   let tile!:PaintTarget;for(const chunk of this.chunks)tile=this.executeChunk(chunk)
   this.presentationEpoch=input.nextEpoch;return tile
  }catch(error){this.poisoned=true;throw error}
 }
 private executeChunk(input:OwnedSourceChunk):PaintTarget{
  if(this.poisoned)throw Error('Poisoned presentation requires fenced cancellation');if(this.retired)throw Error('Retired presentation cannot receive source')
  const f=this.lease.fields,tile:PaintTarget={buffer:f.presentation,originX:0,originY:0,contentRect:{minX:0,minY:0,maxX:1024,maxY:1024}},c=input.composite
  const record=new TypedGlSourceReplayPrototype({segments:[{commands:input.commands,rect:input.rect,waterOnly:input.waterOnly}],expectedPredecessorVersion:0,film:input.film,captureRunningCoverage:!this.materialInitialized,initializeMaterialFilm:!this.materialInitialized,initializeSolventFilm:!this.solventInitialized})
  const port=createPreparedGlSourcePort({bindCurrentCanonical:()=>({landedVersion:0,fields:f}),tile,context:this.context,ribbon:this.ribbon,watercolor:this.watercolor,presetHardness:c.preset.hardness})
  record.execute(port)
  this.materialInitialized=true
  if(input.commands.some(command=>command.phase==='solvent'))this.solventInitialized=true
  this.ribbon.drawRibbonCompositeRect(tile,c.bounds,c.preset,c.profile,f.original,f.coverage,f.pigmentLoad,f.colourLoad,c.color,c.opacity,c.fieldSeed,c.spreadPx,c.fringeWater,c.migratePx,c.profile.normalizeDeposit?c.dabSpacing:0,c.strokeDir,c.bristleRadiusPx)
  return tile
 }
 /** Owner coordinator invokes only after normal land or explicit cancellation fence. */
 retire():void{if(this.retired)return;this.retired=true;this.chunks.length=0;this.retainedSerializedBytes=0;this.lease.release()}
}
