import type { Dab } from '@grafetto/shared'
import type { PencilPreset } from '../presets/pencilPresets'
import type { RibbonProfile } from './ribbonProfile'
import { prepareRibbonDelivery, createRibbonDeliveryState, type RibbonDeliveryState, type RibbonDeliveryOptions } from './ribbonDelivery'
import { prepareDrawableRibbonDabs, noteRibbonWetContacts, ribbonSegmentLength } from './ribbonDrawable'
import { prepareCanonicalRibbonBands } from './canonicalRibbonBands'
import { prepareRibbonGestureScalars } from './ribbonGestureScalars'
import { ribbonDabTouchesTile, type RibbonCommandTile } from './dabWorldHalfExtents'
import { ribbonBristleCombs, ribbonWaterDelivery } from './ribbonStrokeMath'
import { pigmentAbsorption } from '../watercolor/pigmentOptics'
import { wetAt } from '../paper/paperWetness'
import { prepareRibbonHalo } from './ribbonHalo'

/** Structural match for backend uniforms; deliberately has no backend/GPU imports. */
export interface CanonicalPreparedUniforms {
 aaPx:number;washWater:number;waterRetain:number;bristleCombs:number;bristleInk:number
 tau:readonly[number,number,number];worldOrigin:readonly[number,number];mottleSeed:readonly[number,number]
 cloudDeposit:number;granDeposit:number;poolBlot:number;useAvailableWater:boolean
}
export interface CanonicalPreparedStamp {
 center:readonly[number,number];radius:number;aspect:number;angle:number;pressure:number;opacity:number
 nibShape:'ellipse'|'roundedBox';cornerRadius:number;inkEdge:number;inkWater:number;paperWet:number;inkStrength:number
 puddle:number;pigmentPool:number;acrossLocal:readonly[number,number];inkClip:0|1|2;inkBlend:'max'|'add';uniforms:CanonicalPreparedUniforms
}
export interface CanonicalPreparedBatch {vertices:Float32Array;inkBlend:'max'|'add';uniforms:CanonicalPreparedUniforms}
export type CanonicalDrawPhase='coverage'|'solvent'|'pigment'|'color'|'halo'
export type CanonicalDrawCommand = {kind:'stamp';phase:CanonicalDrawPhase;inkMode:6|7;stamp:CanonicalPreparedStamp}|{kind:'ribbon';phase:CanonicalDrawPhase;batch:CanonicalPreparedBatch}
export interface CanonicalStrokeChunkState extends RibbonDeliveryState {
 gestureScalars?:ReturnType<typeof prepareRibbonGestureScalars>
 landedWet?:number
 dabPool:WeakMap<Dab,number>
}
export function createCanonicalStrokeChunkState():CanonicalStrokeChunkState {return {...createRibbonDeliveryState(),dabPool:new WeakMap()}}
export interface CanonicalStrokeChunkInput {
 dabs:Dab[];previous?:Dab;preset:PencilPreset;presetName:string;profile:RibbonProfile;color:[number,number,number]
 wetProfile?:string;strokeSeed?:[number,number];tile:RibbonCommandTile;film:boolean
 segmentMode:false|'combined'|'explicit';segmented?:boolean;waterOnly?:boolean
 /** False only when the existing owner proved no material target on the sheet. Clock still advances. */
 materialEnabled?:boolean
 hasInk?:boolean;hasColor?:boolean
 options:RibbonDeliveryOptions & {diagnosticSolventField:boolean;diagnosticPigmentRecord:boolean}
}
/** Exact source command order per segment. Scheduling/base+film copies/foreign V import remain owner operations. */
export function prepareCanonicalStrokeChunk(state:CanonicalStrokeChunkState,input:CanonicalStrokeChunkInput):{drawable:Dab[];commands:CanonicalDrawCommand[]} {
 const {preset,presetName,options,film}=input
 if(!input.profile.normalizeDeposit || input.profile.stampFlow || input.profile.brushStamp || input.profile.coverageInkMode !== 6) throw new Error('Canonical chunk requires the production watercolor ribbon profile')
 const segmentMode=input.segmentMode
 if(segmentMode&&input.dabs.length>1&&!input.segmented){
  state.standing.clear();const drawable:Dab[]=[],commands:CanonicalDrawCommand[]=[]
  for(let i=0;i<input.dabs.length;i++){
   const part=prepareCanonicalStrokeChunk(state,{...input,dabs:[input.dabs[i]],previous:i===0?input.previous:state.lastKept,wetProfile:input.wetProfile?.slice(i,i+1),segmented:true})
   drawable.push(...part.drawable);commands.push(...part.commands)
  }
  return {drawable,commands}
 }
 const profile=segmentMode&&options.diagnosticSharedFluid?{...input.profile,diagnosticReadFluid:true}:input.profile
 const prepared=prepareDrawableRibbonDabs(input.dabs,input.previous,preset,profile,state,input.wetProfile)
 const {drawable,previous,wetOf}=prepared
 const commands:CanonicalDrawCommand[]=[]
 if(!drawable.length)return {drawable,commands}
 const landedWet=state.landedWet??wetAt(input.wetProfile,0)
 noteRibbonWetContacts(state,drawable,preset,wetOf)
 const scalars=state.gestureScalars??=prepareRibbonGestureScalars(drawable[0],preset,profile,presetName)
 const delivery=prepareRibbonDelivery(drawable,previous,preset,profile,state,wetOf,landedWet,segmentMode,!!input.segmented,film,{markerSegmentLength:ribbonSegmentLength,dabPool:()=>state.dabPool},options)
 const result=buildCanonicalStrokeCommandsFromDelivery({...input,profile,drawable,previous,wetOf,scalars,delivery})
 if(input.materialEnabled!==false&&!input.waterOnly)state.landedWet=landedWet
 return result
}
/** Immutable recipe consumed per tile; does not advance delivery, clocks, wet contacts or scalar state. */
export interface CanonicalPreparedDeliveryInput extends Omit<CanonicalStrokeChunkInput,'dabs'|'previous'> {
 drawable:Dab[];previous?:Dab;wetOf:(dab:Dab)=>number
 scalars:ReturnType<typeof prepareRibbonGestureScalars>
 delivery:ReturnType<typeof prepareRibbonDelivery>
}
export function buildCanonicalStrokeCommandsFromDelivery(input:CanonicalPreparedDeliveryInput):{drawable:Dab[];commands:CanonicalDrawCommand[]} {
 const {preset,tile,options,film,profile,drawable,previous,wetOf,scalars,delivery}=input
 const segmentMode=input.segmentMode,commands:CanonicalDrawCommand[]=[]
 if(input.materialEnabled===false)return {drawable,commands}
 const {haloDabs,haloDoseByDab:haloDose,haloShedByDab:haloShed}=prepareRibbonHalo(drawable,scalars.spreadPx,true,delivery)
 const bands=prepareCanonicalRibbonBands({dabs:drawable,previous,sizeMultiplier:preset.sizeMultiplier,profile,film,segmented:!!segmentMode,solventField:options.diagnosticSolventField,wetOf,delivery:{water:delivery.waterByDab,pigment:delivery.pigmentByDab,excess:delivery.excessByDab,haloShed,paperWet:delivery.paperWetByDab,puddle:delivery.puddleByDab,pigmentPool:delivery.pigmentPoolByDab}})
 const combs=ribbonBristleCombs(profile,scalars.bristleRadiusPx),tau=pigmentAbsorption(input.color),sourceDelivery=ribbonWaterDelivery(profile)
 const inkBlend=film?'max' as const:'add' as const,mottle=input.strokeSeed??[0,0]
 const uniforms=(p:RibbonProfile,seed:readonly[number,number],depth:readonly[number,number,number]|null,poolBlot:number,available:boolean,forBands:boolean):CanonicalPreparedUniforms=>({
  aaPx:p.aaPx,washWater:forBands?0:sourceDelivery.water,waterRetain:forBands?0:sourceDelivery.retain,
  bristleCombs:combs,bristleInk:p.bristleInk,tau:depth??[0,0,0],worldOrigin:[tile.originX,-tile.originY||0],mottleSeed:[seed[0],seed[1]],cloudDeposit:p.cloud,granDeposit:p.granulation,poolBlot,useAvailableWater:available,
 })
 const stamp=(phase:CanonicalDrawPhase,dab:Dab,p:RibbonProfile,opacity:number,inkWater:number,paperWet:number,inkStrength:number,across:readonly[number,number],clip:boolean,puddle:number,poolBlot:number,seed:readonly[number,number],depth:readonly[number,number,number]|null)=>{
  if(!ribbonDabTouchesTile(tile,dab,preset))return
  const radius=dab.size*.5*preset.sizeMultiplier
  commands.push({kind:'stamp',phase,inkMode:phase==='coverage'?6:7,stamp:{center:[dab.x-tile.originX,dab.y-tile.originY],radius,aspect:dab.aspectRatio,angle:dab.angle,pressure:dab.pressure,opacity,nibShape:p.nibShape,cornerRadius:radius*p.cornerFraction,inkEdge:p.inkEdgeFalloff,inkWater,paperWet,inkStrength,puddle,pigmentPool:puddle,acrossLocal:[across[0],across[1]],inkClip:clip?p.diagnosticReadFluid?2:1:0,inkBlend,uniforms:uniforms(p,seed,depth,poolBlot,clip&&!!p.diagnosticReadFluid,false)}})
 }
 const ribbon=(phase:CanonicalDrawPhase,vertices:Float32Array,p:RibbonProfile,seed:readonly[number,number],depth:readonly[number,number,number]|null,poolBlot:number,available:boolean,coverage=false)=>{
  if(!vertices.length)return
  const u=uniforms(p,seed,depth,poolBlot,available,true)
  if(coverage){u.washWater=sourceDelivery.water;u.waterRetain=sourceDelivery.retain}
  commands.push({kind:'ribbon',phase,batch:{vertices,inkBlend,uniforms:u}})
 }
 const coverageProfile={...profile,cloud:0,granulation:0,bristleInk:0}
 for(const dab of drawable)stamp('coverage',dab,{...profile,bristleInk:0},0,delivery.waterByDab.get(dab)??0,wetOf(dab),1,delivery.acrossByDab.get(dab)??[0,1],false,delivery.puddleByDab.get(dab)??1,profile.waterDepletion&&delivery.movingByDab.has(dab)?1:0,[0,0],null)
 ribbon('coverage',bands.waterBands,coverageProfile,[0,0],null,profile.waterDepletion?1:0,false,true)
 if(segmentMode&&options.diagnosticSolventField){
  const solventProfile={...profile,diagnosticReadFluid:false,inkEdgeFalloff:1,cloud:0,granulation:0,bristleInk:0}
  for(const dab of drawable)stamp('solvent',dab,solventProfile,(delivery.waterByDab.get(dab)??0)/4,1,0,0,delivery.acrossByDab.get(dab)??[0,1],true,0,0,mottle,null)
  ribbon('solvent',bands.solventBands,solventProfile,mottle,null,0,false)
 }
 const inkStrength=profile.pigmentStrength,poolBlot=profile.waterDepletion?1:0,available=!!segmentMode&&options.diagnosticSharedFluid
 if(!input.waterOnly&&(input.hasInk??profile.ink)&&(!segmentMode||!options.diagnosticPigmentRecord||inkStrength>0)){
  for(const phase of ['pigment','color'] as const){
   if(phase==='color'&&input.hasColor===false)continue
   for(let i=0;i<drawable.length;i++){const dab=drawable[i];stamp(phase,dab,profile,delivery.deposits[i]*(1-(haloShed.get(dab)??0)),delivery.waterByDab.get(dab)??0,delivery.paperWetByDab.get(dab)??0,inkStrength,delivery.acrossByDab.get(dab)??[0,1],available,delivery.pigmentPoolByDab.get(dab)??(phase==='pigment'?.5:0),poolBlot,mottle,phase==='color'?tau:null)}
   ribbon(phase,bands.bands,profile,mottle,phase==='color'?tau:null,poolBlot,available)
  }
 }
 if(!input.waterOnly&&(input.hasInk??profile.ink))for(let i=0;i<haloDabs.length;i++){const dab=haloDabs[i],dose=haloDose.get(dab)??0;if(dose>0)stamp('halo',dab,{...profile,inkEdgeFalloff:1},delivery.deposits[i]*dose,delivery.waterByDab.get(dab)??0,delivery.paperWetByDab.get(dab)??0,inkStrength,delivery.acrossByDab.get(dab)??[0,1],true,1,0,mottle,null)}
 return {drawable,commands}
}
