import type {Dab} from '@grafetto/shared'
import type {PencilPreset} from './../../apps/web/src/engine/src/presets/pencilPresets'
import type {RibbonProfile} from './../../apps/web/src/engine/src/dabs/ribbonProfile'
import type {CanonicalDrawCommand,CanonicalDrawPhase,CanonicalPreparedUniforms} from './../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import type {prepareRibbonDelivery} from './../../apps/web/src/engine/src/dabs/ribbonDelivery'
import {ribbonDabTouchesTile} from './../../apps/web/src/engine/src/dabs/dabWorldHalfExtents'
import {ribbonWaterDelivery} from './../../apps/web/src/engine/src/dabs/ribbonStrokeMath'

/** Generated from original command-only tail; no delivery, geometry or GPU work is invoked. */
export interface PreparedSourceInput {
 drawable:Dab[];preset:PencilPreset;profile:RibbonProfile
 tile:{originX:number;originY:number;buffer:{width:number;height:number}}
 delivery:Pick<ReturnType<typeof prepareRibbonDelivery>,'deposits'|'waterByDab'|'acrossByDab'|'paperWetByDab'|'puddleByDab'|'pigmentPoolByDab'|'movingByDab'>
 bands:{bands:Float32Array;waterBands:Float32Array;solventBands:Float32Array}
 haloDabs:Dab[];haloDose:Map<Dab,number>;haloShed:Map<Dab,number>
 combs:number;tau:readonly[number,number,number];strokeSeed?:[number,number];film:boolean
 segmentMode:false|'combined'|'explicit';waterOnly:boolean;hasInk?:boolean;hasColor?:boolean
 options:{diagnosticSolventField:boolean;diagnosticSharedFluid:boolean;diagnosticPigmentRecord:boolean}
 wetOf:(dab:Dab)=>number
}
export function recordPreparedSource(input:PreparedSourceInput):CanonicalDrawCommand[]{
 const {drawable,preset,profile,tile,delivery,bands,haloDabs,haloDose,haloShed,film,segmentMode,options,wetOf}=input
 const commands:CanonicalDrawCommand[]=[]
 const {combs,tau}=input,sourceDelivery=ribbonWaterDelivery(profile)
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
 return structuredClone(commands)
}
