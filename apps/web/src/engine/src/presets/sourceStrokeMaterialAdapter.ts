import {canonicalImageFrameAsset} from '@grafetto/shared'
import {canonicalPixelDualSourceMaterialContext,sourceRoleTextureInputsFromPins} from '@grafetto/shared'
import {canonicalSourceColorFieldDraw} from '@grafetto/shared'
import {SOURCE_SEEDED_AUTO_MASK_PROFILE} from './sourceSeededAutoMask'
import {canonicalSourceMaterialContext} from '@grafetto/shared'
import {canonicalPixelTextureMaterialContext,type CanonicalPixelTextureSourceBinding} from '@grafetto/shared'
import {canonicalPrimaryGrainMaterialContext,canonicalPrimaryGrainImageMaterialContext,buildCanonicalPrimaryGrainMaterial,type CanonicalPrimaryGrainImageBinding,type CanonicalMaterialContextV8,type CanonicalMaterialFrameV8,type CanonicalMaterialBuildInputV8} from '@grafetto/shared'
import {canonicalTexturedAutoMaterialContext,assertTexturedAutoProgramContext,buildCanonicalTexturedAutoMaterial,type CanonicalMaterialContextV7,type CanonicalMaterialFrameV7,type CanonicalMaterialBuildInputV7} from '@grafetto/shared'
import { CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE } from '@grafetto/shared'
import {
  type CanonicalMaterialContextV6,type CanonicalMaterialFrameV6,type CanonicalMaterialBuildInputV6,canonicalSoftNativeDefaultTexturedSourceMaterialContext, buildCanonicalMaterial, canonicalPressureTexturedSourceMaterialContext, canonicalTexturedSourceMaterialContext, canonicalPrimaryTextureMaterialContext, canonicalPrimaryTextureDrawWork, canonicalMaterialGeometryCost, canonicalAutoCost, canonicalDefaultAutoStatic, canonicalGaussianAutoStatic, canonicalSoftAutoStatic, canonicalSoftAutoCost, CANONICAL_MATERIAL_LIMITS,
  type CanonicalMaterialBuildInput, type CanonicalMaterialContext, type CanonicalMaterialEntry,
  type CanonicalMaterialFence, type CanonicalMaterialFrame, type CanonicalMaterialContextV2, type CanonicalMaterialFrameV2, type AnyCanonicalMaterialRecipe, type AnyCanonicalMaterialFrame, type AnyCanonicalMaterialContext, type CanonicalMaterialBuildInputV2, type CanonicalMaterialContextV3, type CanonicalMaterialFrameV3, type CanonicalMaterialBuildInputV3, type CanonicalMaterialContextV4, type CanonicalMaterialFrameV4, type CanonicalMaterialBuildInputV4, type CanonicalMaterialContextV5, type CanonicalMaterialFrameV5, type CanonicalMaterialBuildInputV5,
} from '@grafetto/shared'
import type { SourceStrokeAuthorProgram, SourceStrokeAuthorState, SourceStrokeAuthorStep, SourceAuthorPacket } from './sourceStrokeAuthor'

import { planCanonicalTargets } from '../dabs/CanonicalTargetPlan'
import type { WorldRect } from '../buffers/tileMath'
import type { SourceDabGeometry } from './sourceDabCache'

type Draw=CanonicalMaterialBuildInputV8['draws'][number] | CanonicalMaterialBuildInputV7['draws'][number] | CanonicalMaterialBuildInputV6['draws'][number] | CanonicalMaterialBuildInputV5['draws'][number] | CanonicalMaterialBuildInput['draws'][number] | CanonicalMaterialBuildInputV2['draws'][number] | CanonicalMaterialBuildInputV3['draws'][number] | CanonicalMaterialBuildInputV4['draws'][number]
type MaterialContext=CanonicalMaterialContextV8|CanonicalMaterialContextV7|CanonicalMaterialContextV6|CanonicalMaterialContextV5|AnyCanonicalMaterialContext|CanonicalMaterialContextV3|CanonicalMaterialContextV4
type MaterialFrame=CanonicalMaterialFrameV8|CanonicalMaterialFrameV7|CanonicalMaterialFrameV6|CanonicalMaterialFrameV5|AnyCanonicalMaterialFrame|CanonicalMaterialFrameV3|CanonicalMaterialFrameV4
function pixelSourceInputs(c:CanonicalMaterialContextV8|CanonicalMaterialContextV2){
 const gradient=c.version===8&&c.primaryTexture.law==='pixel-color-texture-v1'&&c.primaryTexture.mode==='gradient'?c.primaryTexture.gradient:undefined
 const primary=c.primarySource.kind==='image'&&c.primarySource.imageMaterial?.kind==='gradient-map-v1'?c.primarySource.imageMaterial.gradient:undefined
 const mask=c.version===2&&c.maskSource?.kind==='image'&&c.maskSource.imageMaterial?.kind==='gradient-map-v1'?c.maskSource.imageMaterial.gradient:undefined
 if(primary&&mask&&!sameData(primary,mask))invalid()
 const sourceTipGradient=primary??mask
 return gradient||sourceTipGradient||c.sourceColorFields?{...gradient?{textureGradient:gradient}:{},...sourceTipGradient?{sourceTipGradient}:{},...c.sourceColorFields?{sourceColorFields:c.sourceColorFields,sourceColorAvailable:c.assets.map(a=>({id:a.id,size:a.size}))}:{}}:undefined
}
function sourceImageMaterialMatches(role:SourceStrokeAuthorProgram['roles'][number],pin:import('@grafetto/shared').CanonicalMaterialImageSource):boolean{
 const template=role.gradientMapTemplate,material=pin.imageMaterial
 if(template)return material?.kind==='gradient-map-v1'&&material.grayAsset===template.grayAsset&&sameData(material.grayFrames,template.grayFrames)&&material.application===template.application
 return sameData(role.imageMaterial,material)
}
function textureDrawControls(context:MaterialContext,role:'primary'|'mask',value:object):{grainStrengthU8:number}|{textureColorStrength:number}|Record<string,never>{
 const grain=Object.getOwnPropertyDescriptor(value,'grainStrengthU8'),color=Object.getOwnPropertyDescriptor(value,'textureColorStrength')
 if(grain&&!Object.hasOwn(grain,'value')||color&&!Object.hasOwn(color,'value'))invalid()
 const version8='version'in context&&context.version===8,roleTextures='version'in context&&context.version===2?context.roleTextures:undefined
 if(!version8&&!roleTextures){if(grain||color)invalid();return{}}
 const pin=version8?context.primaryTexture:role==='primary'?roleTextures?.primary:roleTextures?.mask
 if(pin?.law==='pixel-color-texture-v1'){
  const n=color?.value
  if(grain||typeof n!=='number'||!Number.isFinite(n)||Object.is(n,-0)||n<0||n>(pin.mode==='lightness'?1:255)||pin.mode==='gradient'&&!Number.isInteger(n))invalid()
  return{textureColorStrength:n}
 }
 const n=grain?.value
 if(color||typeof n!=='number'||!Number.isInteger(n)||n<0||n>255||Object.is(n,-0)||!pin&&n!==0)invalid()
 return{grainStrengthU8:n}
}
/** Arrays are version-homogeneous; the shared builder rejects a wrong recipe
 * kind before decoding. This bridge keeps that runtime validation in ONE owner. */
function buildAdapterMaterial(input:Omit<CanonicalMaterialBuildInput,'draws'>&{readonly draws:readonly Draw[]},context:MaterialContext){
  if('version'in context&&context.version===8){if(input.masked)invalid();const draws=input.draws.map(d=>{if(!('kind'in d.recipe)||d.role!=='primary')return invalid();const common={...d.sourceColorField?{sourceColorField:d.sourceColorField}:{},recipe:d.recipe,role:d.role,x:d.x,y:d.y,opacity:d.opacity,flow:d.flow,...d.sourcePigmentRGB?{sourcePigmentRGB:d.sourcePigmentRGB}:{},...d.sourcePigmentRGBA?{sourcePigmentRGBA:d.sourcePigmentRGBA}:{}};if(context.primaryTexture.law==='pixel-color-texture-v1'){if(!('textureColorStrength'in d)||d.textureColorStrength===undefined)return invalid();return{...common,textureColorStrength:d.textureColorStrength}}if(!('grainStrengthU8'in d)||d.grainStrengthU8===undefined)return invalid();return{...common,grainStrengthU8:d.grainStrengthU8}});return buildCanonicalPrimaryGrainMaterial({...input,masked:false,draws},context)}
  if('version'in context&&context.version===7){if(input.masked)invalid();return buildCanonicalTexturedAutoMaterial({...input,masked:false,draws:input.draws as CanonicalMaterialBuildInputV7['draws']},context)}
  if('version' in context&&context.version===6){if(input.masked)invalid();return buildCanonicalMaterial({...input,masked:false,draws:input.draws as CanonicalMaterialBuildInputV6['draws']},context)}
  if('version' in context&&context.version===5){if(input.masked)invalid();return buildCanonicalMaterial({...input,masked:false,draws:input.draws as CanonicalMaterialBuildInputV5['draws']},context)}
  if('version' in context&&context.version===4){if(input.masked)invalid();return buildCanonicalMaterial({...input,masked:false,draws:input.draws as CanonicalMaterialBuildInputV4['draws']},context)}
  if('version' in context&&context.version===3){if(input.masked)invalid();return buildCanonicalMaterial({...input,masked:false,draws:input.draws as CanonicalMaterialBuildInputV3['draws']},context)}
  if('version' in context)return buildCanonicalMaterial({...input,draws:input.draws as CanonicalMaterialBuildInputV2['draws']},context)
  return buildCanonicalMaterial({...input,draws:input.draws as CanonicalMaterialBuildInput['draws']},context)
}
export interface SourceMaterialTargetGeometry {
  readonly pageBounds:Readonly<WorldRect>|null
  readonly tileWidth:number;readonly tileHeight:number;readonly maxTargets?:number
}
export type SourceStrokeMaterialContext=Omit<CanonicalMaterialContext,'preflightDefinition'|'expectedDrawCount'|'expectedStrokeEnd'> & {
  readonly geometry?:SourceDabGeometry;readonly targetGeometry?:SourceMaterialTargetGeometry
}
export type SourceStrokeMaterialContextV2=Omit<CanonicalMaterialContextV2,'expectedDrawCount'|'expectedStrokeEnd'> & {readonly targetGeometry?:SourceMaterialTargetGeometry}
export type SourceStrokeMaterialContextV3=CanonicalMaterialContextV3 & {readonly targetGeometry?:SourceMaterialTargetGeometry}
export type SourceStrokeMaterialContextV4=CanonicalMaterialContextV4 & {readonly targetGeometry?:SourceMaterialTargetGeometry}
export type SourceStrokeMaterialContextV5=CanonicalMaterialContextV5 & {readonly targetGeometry?:SourceMaterialTargetGeometry}
export type SourceStrokeMaterialContextV6=CanonicalMaterialContextV6 & {readonly targetGeometry?:SourceMaterialTargetGeometry}
export type AnySourceStrokeMaterialContext=SourceStrokeMaterialContextV6|SourceStrokeMaterialContextV5|SourceStrokeMaterialContext|SourceStrokeMaterialContextV2|SourceStrokeMaterialContextV3|SourceStrokeMaterialContextV4
export type SourceStrokeMaterialContextV7=Omit<CanonicalMaterialContextV7,'expectedDrawCount'|'expectedStrokeEnd'> & {readonly targetGeometry?:SourceMaterialTargetGeometry}
export type SourceStrokeMaterialContextV8=Omit<CanonicalMaterialContextV8,'expectedDrawCount'|'expectedStrokeEnd'>&{readonly targetGeometry?:SourceMaterialTargetGeometry}
type CoreSourceContext=SourceStrokeMaterialContextV8|AnySourceStrokeMaterialContext|SourceStrokeMaterialContextV7
type FrameFor<C> = C extends SourceStrokeMaterialContextV8 ? CanonicalMaterialFrameV8 : C extends SourceStrokeMaterialContextV7 ? CanonicalMaterialFrameV7 : C extends SourceStrokeMaterialContextV6 ? CanonicalMaterialFrameV6 : C extends SourceStrokeMaterialContextV5 ? CanonicalMaterialFrameV5 : C extends SourceStrokeMaterialContextV4 ? CanonicalMaterialFrameV4 : C extends SourceStrokeMaterialContextV3 ? CanonicalMaterialFrameV3 : C extends SourceStrokeMaterialContextV2 ? CanonicalMaterialFrameV2 : CanonicalMaterialFrame
type ChunkFor<C> = SourceStrokeMaterialChunk<FrameFor<C>>
const version6=<T extends CoreSourceContext|MaterialContext>(c:T):c is Extract<T,{readonly version:6}>=>'version' in c&&c.version===6
const version8=<T extends CoreSourceContext|MaterialContext>(c:T):c is Extract<T,{readonly version:8}>=>'version'in c&&c.version===8
const version7=<T extends CoreSourceContext|MaterialContext>(c:T):c is Extract<T,{readonly version:7}>=>'version'in c&&c.version===7
const pressure=(c:CoreSourceContext|MaterialContext)=>version7(c)||version5(c)||version6(c)
const version5=<T extends CoreSourceContext|MaterialContext>(c:T):c is Extract<T,{readonly version:5}>=>'version' in c&&c.version===5
const version2=<T extends CoreSourceContext|MaterialContext>(c:T):c is Extract<T,{readonly version:2}>=>'version' in c&&c.version===2
const version3=<T extends CoreSourceContext|MaterialContext>(c:T):c is Extract<T,{readonly version:3}>=>'version' in c&&c.version===3
const version4=<T extends CoreSourceContext|MaterialContext>(c:T):c is Extract<T,{readonly version:4}>=>'version'in c&&c.version===4
const extendedDefinitions=(c:CoreSourceContext|MaterialContext):boolean=>{
 if(!version2(c)&&!version8(c))return false
 return !!c.materialParams||c.primarySource.kind!=='image'&&c.primarySource.coverageProfile===SOURCE_SEEDED_AUTO_MASK_PROFILE||version2(c)&&!!c.maskSource&&c.maskSource.kind!=='image'&&c.maskSource.coverageProfile===SOURCE_SEEDED_AUTO_MASK_PROFILE
}
const textured=(c:CoreSourceContext|MaterialContext)=>version8(c)||version7(c)||version3(c)||version4(c)||version5(c)||version6(c)
/** Pin room geometry once. This is NOT a viewport or an execution grant. */
export function pinSourceMaterialTargets(g:SourceMaterialTargetGeometry|undefined):Readonly<SourceMaterialTargetGeometry>|undefined {
  if(g===undefined)return
  if(!g||Object.keys(g).some(k=>!['pageBounds','tileWidth','tileHeight','maxTargets'].includes(k)))invalid()
  planCanonicalTargets({minX:0,minY:0,maxX:0,maxY:0},g.pageBounds,g.tileWidth,g.tileHeight,g.maxTargets??64)
  return freeze({pageBounds:g.pageBounds===null?null:{...g.pageBounds},tileWidth:g.tileWidth,tileHeight:g.tileHeight,maxTargets:g.maxTargets??64})
}
export function copySourceMaterialContext(c:SourceStrokeMaterialContextV6):CanonicalMaterialContextV6
export function copySourceMaterialContext(c:SourceStrokeMaterialContextV5):CanonicalMaterialContextV5
export function copySourceMaterialContext(c:SourceStrokeMaterialContextV4):CanonicalMaterialContextV4
export function copySourceMaterialContext(c:SourceStrokeMaterialContextV3):CanonicalMaterialContextV3
export function copySourceMaterialContext(c:SourceStrokeMaterialContextV2):CanonicalMaterialContextV2
export function copySourceMaterialContext(c:SourceStrokeMaterialContext):CanonicalMaterialContext
export function copySourceMaterialContext(c:SourceStrokeMaterialContext|SourceStrokeMaterialContextV2):AnyCanonicalMaterialContext
export function copySourceMaterialContext(c:AnySourceStrokeMaterialContext):Exclude<MaterialContext,CanonicalMaterialContextV7|CanonicalMaterialContextV8>
export function copySourceMaterialContext(c:AnySourceStrokeMaterialContext):Exclude<MaterialContext,CanonicalMaterialContextV7|CanonicalMaterialContextV8> {
  if(Object.getOwnPropertyDescriptor(c,'version')?.value===7||Object.getOwnPropertyDescriptor(c,'version')?.value===8)invalid()
  if(version6(c)){const {targetGeometry:_target,...material}=c;return canonicalSoftNativeDefaultTexturedSourceMaterialContext(material)}
  if(version5(c)){const {targetGeometry:_target,...material}=c;return canonicalPressureTexturedSourceMaterialContext(material)}
  if(version4(c)){const {targetGeometry:_target,...material}=c as SourceStrokeMaterialContextV4;return canonicalTexturedSourceMaterialContext(material)}
  if(version3(c)){const {targetGeometry:_target,...material}=c as SourceStrokeMaterialContextV3;return canonicalPrimaryTextureMaterialContext(material)}
  if('version' in c&&c.version===2){
    const {targetGeometry:_target,...material}=c
    return canonicalSourceMaterialContext({...material,budget:{workUnits:material.budget.workUnits,outputBytes:material.budget.outputBytes,drawPixels:material.budget.drawPixels}})
  }

  const legacy=c as SourceStrokeMaterialContext
  if(legacy.geometry?.kind==='defaultAuto'||legacy.geometry?.kind==='gaussianAuto'||legacy.geometry?.kind==='softAuto')throw new RangeError('Default auto requires a trusted wire2 source context')
  return freeze({assets:structuredClone(legacy.assets),primaryAsset:legacy.primaryAsset,...(legacy.primaryImageFrames?{primaryImageFrames:[...legacy.primaryImageFrames]}:{}),maskAsset:legacy.maskAsset,budget:{...legacy.budget},preflightDefinition:canonicalMaterialGeometryCost})
}
function targetKeys(d:Pick<Draw,'x'|'y'|'recipe'>,g:SourceMaterialTargetGeometry|undefined):readonly string[]{
  if(!g)return[]
  return planCanonicalTargets({minX:d.x,minY:d.y,maxX:d.x+d.recipe.width,maxY:d.y+d.recipe.height},g.pageBounds,g.tileWidth,g.tileHeight,g.maxTargets??64).tiles.map(t=>t.tileX+':'+t.tileY)
}
/** Encoder recheck, not a second packetizer. Caller uses the SAME room grid. */
export function assertSourceMaterialTargets(frame:MaterialFrame,g:SourceMaterialTargetGeometry|undefined):void{
  const keys=new Set<string>()
  for(const d of frame.draws)for(const k of targetKeys({x:d.x,y:d.y,recipe:frame.definitions[d.definition]},g)){
    keys.add(k)
    if(keys.size>(g?.maxTargets??64))throw new RangeError('Canonical frame exceeds target union')
  }
}
export interface SourceStrokeMaterialInput {
  readonly sourceColorField?:import('@grafetto/shared').CanonicalSourceColorFieldDraw;readonly maskSeed?:number;readonly grainStrengthU8?:number;readonly textureColorStrength?:number;readonly materialStrength?:number;readonly packet:SourceAuthorPacket;readonly sourceAngle:number;readonly sourceTime:number
  readonly logicalSequence:number;readonly role:'primary'|'mask'
}
/** Inputs are AUTHOR-LOCAL actual paint metadata, not another wire field. They
 * keep existing Dab production aligned when a budget cut returns an older chunk. */
export interface SourceStrokeMaterialChunk<F extends MaterialFrame=CanonicalMaterialFrame> {readonly packed:string;readonly frame:F;readonly inputs:readonly SourceStrokeMaterialInput[]}
/** Private author checkpoint, never a wire/RNG journal. Source author owns all
 * query/scheduler/RNG state; counters only tie these pending bytes to that state. */
export interface SourceStrokeMaterialCheckpoint {
  readonly version:1|2|3|4|5|6;readonly materialVersion?:1|2|3|4|5|6;readonly materialIdentity?:string;readonly targetGeometry?:Readonly<SourceMaterialTargetGeometry>|null;readonly pendingTargets?:readonly string[];readonly programId:string;readonly masked:boolean
  readonly inputOrdinal:number;readonly eventOrdinal:number;readonly active:boolean;readonly ended:boolean
  readonly entry:CanonicalMaterialEntry;readonly current:CanonicalMaterialEntry
  readonly draws:readonly Draw[];readonly inputs:readonly SourceStrokeMaterialInput[];readonly fences:readonly CanonicalMaterialFence[]
}
export interface SourceStrokeMaterialCheckpointV7 extends Omit<SourceStrokeMaterialCheckpoint,'version'|'materialVersion'> {readonly version:7;readonly materialVersion:7;readonly materialIdentity:string}
export interface SourceStrokeMaterialCheckpointV8 extends Omit<SourceStrokeMaterialCheckpoint,'version'|'materialVersion'>{readonly version:8;readonly materialVersion:8;readonly materialIdentity:string}
type CoreCheckpoint=SourceStrokeMaterialCheckpointV8|SourceStrokeMaterialCheckpoint|SourceStrokeMaterialCheckpointV7
type Event={readonly kind:'draw';readonly draw:Draw;readonly input:SourceStrokeMaterialInput}|{readonly kind:'fence';readonly fence:Omit<Extract<CanonicalMaterialFence,{group:number}>,'at'>|{readonly kind:'gestureEnd'}}
function invalid():never {throw new RangeError('Invalid source material adapter state or result')}
function freeze<T>(value:T):T {if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value}
function validateInput(input:SourceStrokeMaterialInput):void {
  if(!input||Object.keys(input).some(k=>!['sourceColorField','maskSeed','grainStrengthU8','textureColorStrength','materialStrength','packet','sourceAngle','sourceTime','logicalSequence','role'].includes(k))||!['primary','mask'].includes(input.role)||!Number.isSafeInteger(input.logicalSequence)||input.logicalSequence<0||input.logicalSequence>0x7fffffff
    ||!Number.isFinite(input.sourceAngle)||!Number.isFinite(input.sourceTime)||input.sourceTime<0||input.sourceTime>Number.MAX_SAFE_INTEGER||!input.packet)invalid()
  if(input.maskSeed!==undefined&&(!Number.isInteger(input.maskSeed)||input.maskSeed<0||input.maskSeed>0xffffffff||Object.is(input.maskSeed,-0)))invalid()
  if(input.grainStrengthU8!==undefined&&(!Number.isInteger(input.grainStrengthU8)||input.grainStrengthU8<0||input.grainStrengthU8>255||Object.is(input.grainStrengthU8,-0)))invalid()
  if(input.textureColorStrength!==undefined&&(!Number.isFinite(input.textureColorStrength)||input.textureColorStrength<0||input.textureColorStrength>255||Object.is(input.textureColorStrength,-0)))invalid()
  if(input.materialStrength!==undefined&&(!Number.isFinite(input.materialStrength)||input.materialStrength<0||input.materialStrength>1))invalid()
  const p=input.packet
  if(Object.keys(p).some(k=>!['x','y','t','pressure','tiltX','tiltY','sourceViewSpeed','speed','rotation','tangentialPressure','perspective','canvasRotation','mirroredH','mirroredV','tiltDirectionOffset','hover'].includes(k)))invalid()
  if(p.sourceViewSpeed!==undefined&&(!Number.isFinite(p.sourceViewSpeed)||p.sourceViewSpeed<0))invalid()
  if(![p.x,p.y,p.t,p.pressure,p.tiltX,p.tiltY,p.speed,p.rotation,p.tangentialPressure,p.perspective,p.canvasRotation,p.tiltDirectionOffset].every(Number.isFinite)
    ||!Object.is(p.t,input.sourceTime)||p.pressure<0||p.pressure>1||[p.hover,p.mirroredH,p.mirroredV].some(v=>typeof v!=='boolean'))invalid()
}
/** Internal author Request adds drawingAngle/angleOverride to the runtime
 * object. Project the exact typed packet without those duplicate scheduling
 * fields; sourceAngle below is the one authoritative resolved direction. */
function packet(p:SourceAuthorPacket):SourceAuthorPacket {
  if(!p)invalid()
  const {x,y,t,pressure,tiltX,tiltY,speed,rotation,tangentialPressure,perspective,canvasRotation,mirroredH,mirroredV,tiltDirectionOffset,hover}=p
  return{x,y,t,pressure,tiltX,tiltY,...p.sourceViewSpeed!==undefined?{sourceViewSpeed:p.sourceViewSpeed}:{},speed,rotation,tangentialPressure,perspective,canvasRotation,mirroredH,mirroredV,tiltDirectionOffset,hover}
}
const count=(n:number)=>Number.isSafeInteger(n)&&n>=0
const sameEntry=(a:CanonicalMaterialEntry,b:CanonicalMaterialEntry)=>a.phase===b.phase&&(a.phase==='between'||b.phase!=='between'&&a.group===b.group)
function after(entry:CanonicalMaterialEntry,fences:readonly CanonicalMaterialFence[]):CanonicalMaterialEntry {
  let result=entry
  for(const f of fences)result=f.kind==='segmentBegin'?{phase:'primary',group:f.group}:f.kind==='primaryEnd'?{phase:'mask',group:f.group}:{phase:'between'}
  return result
}
// Bounded metadata interning for the incremental cost estimate only. Actual
// canonical first-use dictionary/bit identity is owned by the shared builder.
function sameData(a:unknown,b:unknown):boolean{
  if(Object.is(a,b))return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
  const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>,keys=Object.keys(aa)
  return keys.length===Object.keys(bb).length&&keys.every(k=>Object.hasOwn(bb,k)&&sameData(aa[k],bb[k]))
}
const equalRecipe=sameData

/** OFF-path adapter from ACTUAL SourceStrokeAuthor yields to closed canonical
 * material chunks. No active hooks, renderer, asset loading, source evaluation or
 * RNG. Source fences frame input/role order, NOT native composite/reset commands.
 * Each returned chunk is already decoded from its canonical packed bytes; a
 * future local renderer must consume chunk.frame, never these raw author DTOs.
 */
class MaterialAdapterCore<C extends CoreSourceContext> {
  private readonly context:MaterialContext
  private readonly targets:Readonly<SourceMaterialTargetGeometry>|undefined
  private targetUnion=new Set<string>()
  private readonly program:Pick<SourceStrokeAuthorProgram,'id'> & {readonly roles:readonly {readonly id:'primary'|'mask';readonly asset:string;readonly frames?:readonly string[]}[];readonly reusable?:SourceStrokeAuthorProgram;readonly binding?:import('@grafetto/shared').CanonicalTexturedAutoProgramBinding|CanonicalPrimaryGrainImageBinding|CanonicalPixelTextureSourceBinding}
  private inputOrdinal:number
  private eventOrdinal:number
  private active=false
  private ended=false
  private entry:CanonicalMaterialEntry={phase:'between'}
  private current:CanonicalMaterialEntry={phase:'between'}
  private draws:Draw[]=[]
  private inputs:SourceStrokeMaterialInput[]=[]
  private fences:CanonicalMaterialFence[]=[]
  private recipes:AnyCanonicalMaterialRecipe[]=[]
  private work=0
  private output=0
  private pixels=0

  constructor(program:SourceStrokeAuthorProgram,context:C,source:SourceStrokeAuthorState,checkpoint?:CoreCheckpoint,prepared?:{material:CanonicalMaterialContextV7|CanonicalMaterialContextV8;targets:Readonly<SourceMaterialTargetGeometry>|undefined;binding:import('@grafetto/shared').CanonicalTexturedAutoProgramBinding|CanonicalPrimaryGrainImageBinding|CanonicalPixelTextureSourceBinding}){
    if(!version8(context)&&!version7(context)&&!version2(context)&&!version4(context)&&!version5(context)&&!version6(context)&&program.roles.some(r=>r.geometry?.kind==='defaultAuto'||r.geometry?.kind==='gaussianAuto'||r.geometry?.kind==='softAuto'))throw new RangeError('Default auto requires a trusted wire2 source context')
    if(version8(context)||version7(context)){if(!prepared)invalid();this.targets=prepared.targets;this.context=prepared.material}
    else{if('version' in context&&(context.version===7||context.version===8))invalid();this.targets=pinSourceMaterialTargets(context.targetGeometry);this.context=copySourceMaterialContext(context)}
    if(program.imageFrameIndices!==((version2(this.context)||version8(this.context))?this.context.imageFrameIndices:undefined))invalid()
    if(!!program.colorParams!==((version2(this.context)||version8(this.context))&&!!this.context.colorParams))invalid()
    if(program.roles.some(r=>!!r.materialOptions)!==((version2(this.context)||version8(this.context))&&!!this.context.materialParams))invalid()
    if(program.roles.some(r=>r.textureProgram?.strength==='pixel-role-grain-u8-v1')!==(version2(this.context)&&!!this.context.roleTextures))invalid()
    if(version2(this.context)&&program.roles.length===2&&(!program.maskingBlend||this.context.maskingBlend!==program.maskingBlend))invalid()
    buildAdapterMaterial({masked:program.roles.length===2,entry:{phase:'between'},draws:[],fences:[]},this.context)
    if(!program.id||program.id.length>256||program.roles.length<1||program.roles.length>2||program.roles[0].id!=='primary'||program.roles.length===2&&program.roles[1].id!=='mask')invalid()
    this.program={id:program.id,...prepared?{reusable:program,binding:prepared.binding}:{},roles:program.roles.map(r=>({id:r.id,asset:r.material.brushIdentity,frames:r.imagePipe?.frames}))}
    for(const r of program.roles){
      const indexedPin=version8(this.context)?this.context.primarySource:version2(this.context)?r.id==='primary'?this.context.primarySource:this.context.maskSource:undefined
      if(indexedPin?.kind==='image'){const sizes=indexedPin.frames?indexedPin.frameBounds?.map(({width,height})=>({width,height})):undefined;if(!sameData(sizes,r.imageFrameSizes)||!sourceImageMaterialMatches(r,indexedPin))invalid()}else if(r.imageFrameSizes)invalid()
      if(version8(this.context)){
        const c=this.context,pin=c.primarySource
        if(program.roles.length!==1||r.id!=='primary'||r.materialProgram||!r.material.textureEnabled)invalid()
        let expected:CanonicalMaterialContextV8
        if(r.textureProgram?.strength==='pixel-grain-u8-v1'){
         if(r.materialPolicy!=='pixel-texture-v1'||r.geometry?.kind!==pin.kind)invalid()
         expected=canonicalPixelTextureMaterialContext(r.textureProgram.binding,c.primaryTexture.phase,c.budget,pixelSourceInputs(c))
         if(pin.kind==='image'){if(r.material.brushIdentity!==pin.asset||r.brush.scale!==pin.brushScale||r.brush.angle!==pin.brushAngle)invalid()}
         else {const g=r.geometry;if(!g||g.kind==='image'||!sameData(g.source,pin.source)||g.coverageProfile!==pin.coverageProfile)invalid()}
        }else{
         if(pin.kind!=='image'||r.imagePipe||r.materialPolicy!=='primary-grain-image-v1'||r.geometry?.kind!=='image'||r.textureProgram?.strength!=='recorded-grain-u8-v1'||r.material.brushIdentity!==pin.asset||r.brush.width!==c.assets[0].width||r.brush.height!==c.assets[0].height||r.brush.scale!==pin.brushScale||r.brush.angle!==pin.brushAngle)invalid()
         expected=canonicalPrimaryGrainImageMaterialContext(r.textureProgram.binding,c.primaryTexture.phase,c.budget)
        }
        if(!sameData(expected,c))invalid()
        continue
      }
      if(version7(this.context)){
        const c=this.context,pin=c.primarySource,g=r.geometry
        if(program.roles.length!==1||r.id!=='primary'||r.imagePipe||r.materialPolicy!=='textured-auto-program-v1'||r.textureProgram?.strength!=='recorded-grain-v1'||!r.materialProgram||!r.material.textureEnabled||!g||g.kind!==pin.kind||r.material.brushIdentity!==pin.descriptorId+'@'+pin.descriptorVersion||!Object.is(r.brush.scale,pin.brushScale)||!Object.is(r.brush.angle,pin.brushAngle)||g.coverageProfile!==pin.coverageProfile||!sameData(g.source,pin.source))invalid()
        continue
      }
      if(version6(this.context)){
        const c=this.context,pin=c.primarySource,g=r.geometry
        if(program.roles.length!==1||r.id!=='primary'||r.imagePipe||r.materialPolicy!=='soft-auto-native-default-texture-v1'||r.textureProgram?.strength!=='source-pressure-curve-v1'||!sameData(r.textureProgram.context,c)||r.materialProgram?.kind!=='texture-pressure-native-default-v1'||!r.material.textureEnabled||!g||g.kind!=='softAuto'||pin.sourceSlot!==0||pin.brushScale!==1||r.material.brushIdentity!==pin.descriptorId+'@'+pin.descriptorVersion||g.coverageProfile!==pin.coverageProfile||!sameData(canonicalSoftAutoStatic(g.source,r.brush.scale,r.brush.angle,g.coverageProfile),canonicalSoftAutoStatic(pin.source,pin.brushScale,pin.brushAngle,pin.coverageProfile))||!sameData(g.source.softnessCurve,pin.radialCurve.source))invalid()
        continue
      }
      if(version5(this.context)){
        const c=this.context,pin=c.primarySource,g=r.geometry
        if(program.roles.length!==1||r.id!=='primary'||r.imagePipe||r.materialPolicy!=='default-auto-pressure-texture-v1'||r.textureProgram?.strength!=='source-pressure-curve-v1'||!sameData(r.textureProgram.context,c)||!r.materialProgram||!r.material.textureEnabled||!g||g.kind!=='defaultAuto'||pin.brushScale!==1
          ||r.material.brushIdentity!==pin.descriptorId+'@'+pin.descriptorVersion||g.coverageProfile!==pin.coverageProfile
          ||!sameData(canonicalDefaultAutoStatic(g.source,r.brush.scale,r.brush.angle,g.coverageProfile),canonicalDefaultAutoStatic(pin.source,pin.brushScale,pin.brushAngle,pin.coverageProfile)))invalid()
        continue
      }
      if(version4(this.context)){
        const c=this.context,pin=c.primarySource,g=r.geometry
        if(program.roles.length!==1||r.id!=='primary'||r.imagePipe||r.materialPolicy!=='default-auto-fixed-texture-v1'
          ||r.textureProgram?.strength!=='fixed-one-v1'||!sameData(r.textureProgram.context,c)||!r.material.textureEnabled||!g||g.kind!=='defaultAuto'||pin.brushScale!==1
          ||r.material.brushIdentity!==pin.descriptorId+'@'+pin.descriptorVersion||g.coverageProfile!==pin.coverageProfile
          ||!sameData(canonicalDefaultAutoStatic(g.source,r.brush.scale,r.brush.angle,g.coverageProfile),canonicalDefaultAutoStatic(pin.source,pin.brushScale,pin.brushAngle,pin.coverageProfile)))invalid()
        continue
      }
      if(version3(this.context)){
        const c=this.context,a=c.assets[0]
        if(program.roles.length!==1||r.id!=='primary'||r.imagePipe||r.materialPolicy!=='png-pressure-texture-v1'||r.textureProgram?.strength!==c.primaryTexture.strength
          ||!r.material.textureEnabled||r.material.brushIdentity!==c.primarySource.asset||r.brush.width!==a.width||r.brush.height!==a.height
          ||!Object.is(r.brush.scale,c.primarySource.brushScale)||!Object.is(r.brush.angle,c.primarySource.brushAngle)||r.geometry&&r.geometry.kind!=='image')invalid()
        continue
      }
      if(r.textureProgram?.strength==='pixel-role-grain-u8-v1'){if(!version2(this.context)||!this.context.roleTextures)invalid();const expected=canonicalPixelDualSourceMaterialContext(r.textureProgram.binding,sourceRoleTextureInputsFromPins(this.context.roleTextures),pixelSourceInputs(this.context));if(!sameData(expected.roleTextures,this.context.roleTextures))invalid()}
      if(r.materialProgram||r.textureProgram&&r.textureProgram.strength!=='pixel-role-grain-u8-v1'||r.materialPolicy==='png-pressure-texture-v1'||r.materialPolicy==='default-auto-fixed-texture-v1')invalid()
      if(r.imagePipe){
        if(version2(this.context)&&program.roles.length!==1&&(!this.context.imageFrameIndices||!this.context.maskingBlend)||!version2(this.context)&&r.id!=='primary')invalid()
        const rolePin=version2(this.context)?r.id==='primary'?this.context.primarySource:this.context.maskSource:undefined
        const frames=version2(this.context)?rolePin?.kind==='image'?rolePin.frames:undefined:this.context.primaryImageFrames
        if(!frames||!sameData(frames,r.imagePipe.frames))invalid()
        for(const [index,id] of r.imagePipe.frames.entries()){const a=rolePin?.kind==='image'?canonicalImageFrameAsset(rolePin,this.context.assets,index):this.context.assets.find(a=>a.id===id);const metrics=r.imageFrameSizes?.[index]??r.brush;if(!a||a.width!==metrics.width||a.height!==metrics.height)invalid()}
      }
      if(version2(this.context)){
        const pin=r.id==='primary'?this.context.primarySource:this.context.maskSource
        if(!pin)invalid()
        if(pin.kind==='defaultAuto'||pin.kind==='gaussianAuto'||pin.kind==='softAuto'){
          const g=r.geometry
          if(pin.kind==='defaultAuto'&&pin.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE&&(r.id!=='primary'||program.roles.length!==1||this.context.maskSource!==undefined))invalid()
          const policy=this.context.materialParams&&r.materialOptions?'auto-source-material-v1':pin.kind==='softAuto'?'soft-auto-fixed1-rng-free':pin.kind==='defaultAuto'?pin.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE?'default-auto-fixed1-seeded-density-v1':'default-auto-fixed1-rng-free':'gaussian-auto-fixed1-rng-free'
          if(pin.kind==='softAuto'&&pin.sourceSlot!==(r.id==='primary'?0:1))invalid()
          if(!g||g.kind!==pin.kind||r.materialPolicy!==policy||pin.brushScale!==(program.roles.length===2?r.brush.scale:1)
            ||r.material.brushIdentity!==pin.descriptorId+'@'+pin.descriptorVersion
            ||g.coverageProfile!==pin.coverageProfile)invalid()
          const actual=g.kind==='defaultAuto'?canonicalDefaultAutoStatic(g.source,r.brush.scale,r.brush.angle,g.coverageProfile)
            :g.kind==='gaussianAuto'?canonicalGaussianAutoStatic(g.source,r.brush.scale,r.brush.angle,g.coverageProfile):g.kind==='softAuto'?canonicalSoftAutoStatic(g.source,r.brush.scale,r.brush.angle,g.coverageProfile):invalid()
          const expected=pin.kind==='defaultAuto'?canonicalDefaultAutoStatic(pin.source,pin.brushScale,pin.brushAngle,pin.coverageProfile)
            :pin.kind==='gaussianAuto'?canonicalGaussianAutoStatic(pin.source,pin.brushScale,pin.brushAngle,pin.coverageProfile):canonicalSoftAutoStatic(pin.source,pin.brushScale,pin.brushAngle,pin.coverageProfile)
          if(!sameData(actual,expected))invalid()
        } else {
          const a=canonicalImageFrameAsset(pin,this.context.assets,0)
          if(r.geometry?.kind==='defaultAuto'||r.materialPolicy!==(pin.imageMaterial?pin.imageMaterial.kind==='gradient-map-v1'?'png-fixed1-rng-free':pin.imageMaterial.kind==='lightness-map-v1'?'image-lightness-map-v1':'image-color-stamp-v1':'png-fixed1-rng-free')||!sourceImageMaterialMatches(r,pin)||r.material.brushIdentity!==pin.asset||!a
            ||r.brush.width!==a.width||r.brush.height!==a.height||!Object.is(r.brush.scale,pin.brushScale)||!Object.is(r.brush.angle,pin.brushAngle))invalid()
        }
      } else {
        if(r.geometry?.kind==='defaultAuto'||r.materialPolicy==='default-auto-fixed1-rng-free')throw new RangeError('Default auto requires a trusted wire2 source context')
        const expected=r.id==='primary'?this.context.primaryAsset:this.context.maskAsset,a=this.context.assets.find(a=>a.id===expected)
        if(r.material.brushIdentity!==expected||!a||r.brush.width!==a.width||r.brush.height!==a.height||r.materialPolicy!=='png-fixed1-rng-free')invalid()
      }
    }
    if(source.programId!==program.id||!count(source.inputOrdinal)||!count(source.eventOrdinal))invalid()
    this.inputOrdinal=source.inputOrdinal;this.eventOrdinal=source.eventOrdinal
    if(checkpoint)this.restore(source,checkpoint)
    else if(source.cursor)invalid()
  }
  private get masked():boolean{return this.program.roles.length===2}
  private match(source:SourceStrokeAuthorState):void {
    if(this.program.reusable&&this.program.reusable.id!==this.program.id||source.programId!==this.program.id||source.inputOrdinal!==this.inputOrdinal||source.eventOrdinal!==this.eventOrdinal)invalid()
  }
  /** Call exactly once BEFORE author.plan; returns only an older full chunk if
   * the new structural begin fence requires a bounded transport cut. */
  beginInput(source:SourceStrokeAuthorState):ChunkFor<C>[]{
    this.match(source)
    if(this.active||this.ended||source.cursor||this.current.phase!=='between'||this.inputOrdinal===Number.MAX_SAFE_INTEGER)invalid()
    const chunks=this.push([{kind:'fence',fence:{kind:'segmentBegin',group:this.inputOrdinal}}],{phase:'primary',group:this.inputOrdinal})
    this.active=true
    return chunks
  }
  /** Consumes a yield once. Retry never calls source author/options/RNG again:
   * bounded cuts retain and apply this exact result after flushing old bytes. */
  accept(step:SourceStrokeAuthorStep):ChunkFor<C>[]{
    if(!this.active||this.ended||!step||!step.state||step.state.programId!==this.program.id)invalid()
    const events:Event[]=[],group=this.inputOrdinal
    let current=this.current
    if(step.kind!=='material'&&(step.sourceColorField!==undefined||step.materialStrength!==undefined||step.textureColorStrength!==undefined||step.grainStrengthU8!==undefined||step.maskSeed!==undefined))invalid()
    if(step.kind==='inputComplete'){
      if(step.state.cursor||step.state.inputOrdinal!==group+1||step.state.eventOrdinal!==this.eventOrdinal)invalid()
      if(current.phase==='primary'){events.push({kind:'fence',fence:{kind:'primaryEnd',group}});current={phase:'mask',group}}
      if(current.phase!=='mask')invalid()
      events.push({kind:'fence',fence:{kind:'segmentEnd',group}})
      const chunks=this.push(events,{phase:'between'})
      this.active=false;this.inputOrdinal=step.state.inputOrdinal
      return chunks
    }
    if(!['material','query'].includes(step.kind)||!step.role||!this.program.roles.some(r=>r.id===step.role)||!step.state.cursor||step.state.inputOrdinal!==group
      ||step.state.eventOrdinal!==this.eventOrdinal+1||!step.result||(step.kind==='material')!==step.result.painted||this.program.roles[step.state.cursor.roleIndex]?.id!==step.role)invalid()
    if(step.role==='mask'&&current.phase==='primary'){events.push({kind:'fence',fence:{kind:'primaryEnd',group}});current={phase:'mask',group}}
    if(current.phase!==step.role)invalid()
    if(step.kind==='material'){
      const input:SourceStrokeMaterialInput={...step.sourceColorField?{sourceColorField:step.sourceColorField}:{},...step.maskSeed!==undefined?{maskSeed:step.maskSeed}:{},...textureDrawControls(this.context,step.role,step),...pressure(this.context)?{materialStrength:step.materialStrength}:{},packet:packet(step.packet!),sourceAngle:step.sourceAngle!,sourceTime:step.sourceTime!,logicalSequence:step.logicalSequence!,role:step.role}
      validateInput(input)
      const fields=version2(this.context)||version8(this.context)?this.context.sourceColorFields:undefined
      if(fields)canonicalSourceColorFieldDraw(input.sourceColorField,input.role==='primary'?fields.primary:fields.mask??null);else if(input.sourceColorField!==undefined)invalid()
      if(pressure(this.context)?input.materialStrength===undefined:step.materialStrength!==undefined)invalid()
      events.push({kind:'draw',draw:this.material(step),input})
    }
    // A yielded nextRole checkpoint proves that the FULL primary pass is done,
    // even when no later mask yield exists. Otherwise detect transition at the
    // first actual mask yield, or the final inputComplete (zero-mask case).
    if(step.role==='primary'&&step.state.cursor.phase==='nextRole'){
      events.push({kind:'fence',fence:{kind:'primaryEnd',group}});current={phase:'mask',group}
    }
    const chunks=this.push(events,current)
    this.eventOrdinal=step.state.eventOrdinal
    return chunks
  }
  private material(step:SourceStrokeAuthorStep):Draw {
    const r=step.result!,m=r.material,s=m?.resolvedSource,role=step.role!
    if(!m||!s||!r.painted||!(this.program.roles.find(p=>p.id===role)!.frames??[this.program.roles.find(p=>p.id===role)!.asset]).includes(s.brushIdentity)
      ||m.resolvedRect.width!==s.width||m.resolvedRect.height!==s.height
      ||typeof r.opacity!=='number'||!Number.isFinite(r.opacity)||r.opacity<0||r.opacity>1
      ||typeof r.flow!=='number'||!Number.isFinite(r.flow)||r.flow<0||r.flow>1
      ||!Number.isSafeInteger(m.resolvedRect.x)||!Number.isSafeInteger(m.resolvedRect.y)
      ||Math.abs(m.resolvedRect.x)>1e8||Math.abs(m.resolvedRect.y)>1e8
      ||Math.abs(m.resolvedRect.x+s.width)>1e8||Math.abs(m.resolvedRect.y+s.height)>1e8)invalid()
    if((version2(this.context)||version8(this.context))&&!!this.context.materialParams!==!!r.materialParams)invalid()
    if(version2(this.context)){const pin=role==='primary'?this.context.primarySource:this.context.maskSource;if(pin?.kind==='image'&&pin.imageMaterial?.kind==='lightness-map-v1'&&!this.context.materialParams&&s.key.lightness!==pin.imageMaterial.strength)invalid()}
    const common={...(version2(this.context)||version8(this.context))&&this.context.materialParams?{materialParams:r.materialParams}:{},brushScale:s.brush.scale,brushAngle:s.brush.angle,
      scale:s.shape.scale,ratio:s.shape.ratio,rotation:s.shape.rotation,subX:s.key.subPixelX,subY:s.key.subPixelY,
      width:s.width,height:s.height,mirrorH:s.mirror.horizontal,mirrorV:s.mirror.vertical}
    let recipe:AnyCanonicalMaterialRecipe
    if(s.geometry?.kind==='defaultAuto'){
      if(!version8(this.context)&&!version7(this.context)&&!version2(this.context)&&!version4(this.context)&&!version5(this.context))invalid()
      recipe={...common,kind:'defaultAuto',coverageProfile:s.geometry.coverageProfile,
        ...canonicalDefaultAutoStatic(s.geometry.source,s.brush.scale,s.brush.angle,s.geometry.coverageProfile)}
    }else if(s.geometry?.kind==='gaussianAuto'){
      if(!version8(this.context)&&!version7(this.context)&&!version2(this.context))invalid()
      recipe={...common,kind:'gaussianAuto',coverageProfile:s.geometry.coverageProfile,
        ...canonicalGaussianAutoStatic(s.geometry.source,s.brush.scale,s.brush.angle,s.geometry.coverageProfile)}
    }else if(s.geometry?.kind==='softAuto'){
      if(!version8(this.context)&&!version7(this.context)&&!version2(this.context)&&!version6(this.context))invalid()
      recipe={...common,kind:'softAuto',sourceSlot:role==='primary'?0:1,coverageProfile:s.geometry.coverageProfile,
        ...canonicalSoftAutoStatic(s.geometry.source,s.brush.scale,s.brush.angle,s.geometry.coverageProfile)}
    }else recipe=version8(this.context)||version2(this.context)||version3(this.context)?{...common,kind:'image',asset:s.brushIdentity,...(version2(this.context)||version8(this.context))&&this.context.imageFrameIndices?{imageFrameIndex:s.key.index,sourceSlot:role==='primary'?0:1}:{}}:{...common,asset:s.brushIdentity}
    // Saved source shape already consumed coordinateSystemFlipped. Bitmap flips
    // are saved mirror bits; NEVER use the second, spacing-only Mirror result.
    if('kind'in recipe&&recipe.kind==='image'&&(version2(this.context)||version8(this.context))&&this.context.imageFrameIndices&&s.key.sourceSlot!==(role==='primary'?0:1))invalid()
    if('kind'in recipe&&recipe.kind!=='image'&&recipe.coverageProfile===SOURCE_SEEDED_AUTO_MASK_PROFILE){if(step.maskSeed===undefined||s.key.maskSeed!==step.maskSeed||s.key.sourceSlot!==(role==='primary'?0:1))invalid();recipe={...recipe,maskSeed:step.maskSeed,sourceSlot:role==='primary'?0:1}}else if(step.maskSeed!==undefined)invalid()
    const colorParams=version2(this.context)||version8(this.context)?this.context.colorParams:undefined
    if(colorParams==='source-pigment-rgba8-v1'?!r.sourcePigmentRGBA||r.sourcePigmentRGB!==undefined:colorParams==='source-pigment-rgb8-v1'?!r.sourcePigmentRGB||r.sourcePigmentRGBA!==undefined:r.sourcePigmentRGB!==undefined||r.sourcePigmentRGBA!==undefined)invalid()
    return{recipe,...step.sourceColorField?{sourceColorField:step.sourceColorField}:{},...colorParams==='source-pigment-rgba8-v1'?{sourcePigmentRGBA:r.sourcePigmentRGBA}:colorParams==='source-pigment-rgb8-v1'?{sourcePigmentRGB:r.sourcePigmentRGB}:{},role,x:m.resolvedRect.x,y:m.resolvedRect.y,opacity:r.opacity,flow:r.flow,...textureDrawControls(this.context,role,step),...pressure(this.context)?{grainDepth:step.materialStrength!}:version4(this.context)?{grainDepth:1 as const}:version3(this.context)?{grainDepth:step.packet!.pressure}:{}} as Draw
  }
  private cost(draw:Draw){
    if('kind' in draw.recipe&&draw.recipe.kind==='softAuto'){
      if(!version8(this.context)&&!version7(this.context)&&!version2(this.context)&&!version6(this.context))invalid()
      const pin=draw.role==='primary'?this.context.primarySource:version2(this.context)?this.context.maskSource:undefined
      if(!pin||pin.kind!=='softAuto')invalid()
      return canonicalSoftAutoCost(draw.recipe,pin)
    }
    if('kind' in draw.recipe&&(draw.recipe.kind==='defaultAuto'||draw.recipe.kind==='gaussianAuto')){
      if(!version8(this.context)&&!version7(this.context)&&!version2(this.context)&&!version4(this.context)&&!version5(this.context))invalid()
      const pin=draw.role==='primary'?this.context.primarySource:version2(this.context)?this.context.maskSource:undefined
      if(!pin||pin.kind!==draw.recipe.kind)invalid()
      return canonicalAutoCost(draw.recipe,pin)
    }
    const recipe=draw.recipe
    if(!('asset' in recipe))return invalid()
    const pin=version8(this.context)?this.context.primarySource:version2(this.context)?draw.role==='primary'?this.context.primarySource:this.context.maskSource:undefined
    const a=pin?.kind==='image'&&'imageFrameIndex'in recipe?canonicalImageFrameAsset(pin,this.context.assets,recipe.imageFrameIndex??0):this.context.assets.find(a=>a.id===recipe.asset)
    if(!a)return invalid()
    const cost=canonicalMaterialGeometryCost(recipe,a)
    const planes=pin?.kind==='image'&&pin.imageMaterial?(pin.imageMaterial.kind==='lightness-map-v1'?2:4):1
    return{workUnits:cost.workUnits*planes,outputBytes:cost.outputBytes*planes}
  }
  private measure(draw:Draw|undefined):{work:number;output:number;pixels:number;fresh:boolean}{
    if(!draw)return{work:0,output:0,pixels:0,fresh:false}
    const cost=this.cost(draw)
    const fresh=!this.recipes.some(r=>equalRecipe(r,draw.recipe))
    const uncached='kind'in draw.recipe&&draw.recipe.kind!=='image'&&(draw.recipe.coverageProfile===SOURCE_SEEDED_AUTO_MASK_PROFILE||draw.recipe.kind==='defaultAuto'&&draw.recipe.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)
    return{work:(fresh||uncached?cost.workUnits:0)+(textured(this.context)?canonicalPrimaryTextureDrawWork(draw.recipe.width,draw.recipe.height):0),output:fresh||uncached?cost.outputBytes+(extendedDefinitions(this.context)?48:0):0,pixels:draw.recipe.width*draw.recipe.height,fresh}
  }
  private fits(draws:number,fences:number,work:number,output:number,pixels:number):boolean {
    return draws<=CANONICAL_MATERIAL_LIMITS.draws&&fences<=3*(draws+1)+1
      &&[work,output,pixels].every(n=>Number.isSafeInteger(n)&&n>=0)
      &&work<=this.context.budget.workUnits&&output<=this.context.budget.outputBytes&&pixels<=this.context.budget.drawPixels
  }
  private push(events:readonly Event[],next:CanonicalMaterialEntry):ChunkFor<C>[]{
    if(!events.length){this.current=next;return[]}
    const draw=events.find(e=>e.kind==='draw')
    if(events.filter(e=>e.kind==='draw').length>1)invalid()
    let cost=this.measure(draw?.kind==='draw'?draw.draw:undefined)
    const keys=draw?.kind==='draw'?targetKeys(draw.draw,this.targets):[]
    let union=new Set([...this.targetUnion,...keys])
    const n=draw?1:0,f=events.length-n,chunks:ChunkFor<C>[]=[]
    const definitionLimit=version8(this.context)&&this.context.primaryTexture.law!=='hard-multiply-u8-native-v1'?254:version2(this.context)?255-(this.context.roleTextures?new Set([this.context.roleTextures.primary,this.context.roleTextures.mask].flatMap(t=>t?[t.asset]:[])).size:0):Infinity
    if(this.recipes.length+Number(cost.fresh)>definitionLimit||union.size>(this.targets?.maxTargets??64)||!this.fits(this.draws.length+n,this.fences.length+f,this.work+cost.work,this.output+cost.output,this.pixels+cost.pixels)){
      // First ensure the exact pending result can fit a cold chunk. Failure must
      // not flush/mutate already accepted records or advance author counters.
      const cold=draw?.kind==='draw'?this.cost(draw.draw):{workUnits:0,outputBytes:0}
      if(keys.length>(this.targets?.maxTargets??64)||!this.fits(n,f,cold.workUnits+(textured(this.context)&&draw?.kind==='draw'?canonicalPrimaryTextureDrawWork(draw.draw.recipe.width,draw.draw.recipe.height):0),cold.outputBytes,cost.pixels))throw new RangeError('Source material result exceeds a cold chunk budget')
      buildAdapterMaterial({masked:this.masked,entry:this.current,draws:(draw?.kind==='draw'?[draw.draw]:[]),
        fences:events.filter((e):e is Extract<Event,{kind:'fence'}>=>e.kind==='fence').map(e=>({...e.fence,at:events.slice(0,events.indexOf(e)).filter(x=>x.kind==='draw').length}))},this.context)
      const old=this.flush();if(old)chunks.push(old)
      cost=this.measure(draw?.kind==='draw'?draw.draw:undefined)
      union=new Set(keys)
    }
    for(const e of events){if(e.kind==='draw'){this.draws.push(structuredClone(e.draw));this.inputs.push(freeze(structuredClone(e.input)))}else this.fences.push({...e.fence,at:this.draws.length})}
    if(draw?.kind==='draw'&&cost.fresh)this.recipes.push({...draw.draw.recipe})
    this.work+=cost.work;this.output+=cost.output;this.pixels+=cost.pixels;this.current=next;this.targetUnion=union
    return chunks
  }
  /** An explicit cut preserves current role/segment context and repeats all
   * referenced saved material definitions in the next closed packet. */
  flush():ChunkFor<C>|undefined {
    if(!this.draws.length&&!this.fences.length)return undefined
    const chunk=buildAdapterMaterial({masked:this.masked,entry:this.entry,draws:this.draws,fences:this.fences},
      {...this.context,expectedDrawCount:this.draws.length,expectedStrokeEnd:this.fences.at(-1)?.kind==='gestureEnd'})
    assertSourceMaterialTargets(chunk.frame,this.targets)
    // Constructor pins context version for this entire instance; the shared
    // builder returns that version, while TS cannot narrow conditional C.
    const result=freeze({...chunk,inputs:this.inputs}) as unknown as ChunkFor<C>
    this.draws=[];this.inputs=[];this.fences=[];this.recipes=[];this.work=0;this.output=0;this.pixels=0;this.targetUnion.clear();this.entry={...this.current}
    return result
  }
  /** Outer author pen-up fence, distinct from an inputComplete segment fence.
   * A zero-draw final tail is returned even after all material dabs were flushed. */
  finish(source:SourceStrokeAuthorState):ChunkFor<C>[]{
    this.match(source)
    if(this.active||this.ended||source.cursor||this.current.phase!=='between')invalid()
    const chunks=this.push([{kind:'fence',fence:{kind:'gestureEnd'}}],this.current)
    this.ended=true
    const last=this.flush();if(last)chunks.push(last)
    return chunks
  }
  checkpoint():CoreCheckpoint {
    const extra=version8(this.context)?{version:8 as const,materialVersion:8 as const,materialIdentity:JSON.stringify(this.context),targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:version7(this.context)?{version:7 as const,materialVersion:7 as const,materialIdentity:JSON.stringify(this.context),targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:version6(this.context)?{version:6 as const,materialVersion:6 as const,materialIdentity:JSON.stringify(this.context),targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:version5(this.context)?{version:5 as const,materialVersion:5 as const,materialIdentity:JSON.stringify(this.context),targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:version4(this.context)?{version:4 as const,materialVersion:4 as const,materialIdentity:JSON.stringify(this.context),targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:version3(this.context)?{version:3 as const,materialVersion:3 as const,targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:version2(this.context)||this.targets?{version:2 as const,materialVersion:version2(this.context)?2 as const:1 as const,
      targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:{version:1 as const}
    return freeze(structuredClone({...extra,programId:this.program.id,masked:this.masked,inputOrdinal:this.inputOrdinal,eventOrdinal:this.eventOrdinal,
      active:this.active,ended:this.ended,entry:this.entry,current:this.current,draws:this.draws,inputs:this.inputs,fences:this.fences}))
  }
  private restore(source:SourceStrokeAuthorState,c:CoreCheckpoint):void {
    if(!c||Object.keys(c).some(k=>!['version','programId','masked','inputOrdinal','eventOrdinal','active','ended','entry','current','draws','inputs','fences','materialVersion','targetGeometry','pendingTargets','materialIdentity'].includes(k))||![1,2,3,4,5,6,7,8].includes(c.version)||c.programId!==this.program.id||c.masked!==this.masked||c.inputOrdinal!==source.inputOrdinal||c.eventOrdinal!==source.eventOrdinal
      ||typeof c.active!=='boolean'||typeof c.ended!=='boolean'||c.active!==!!source.cursor||c.active&&c.ended
      ||!Array.isArray(c.draws)||!Array.isArray(c.fences)||!Array.isArray(c.inputs)||c.inputs.length!==c.draws.length)invalid()
    if(version8(this.context)?c.version!==8||c.materialIdentity!==JSON.stringify(this.context):version7(this.context)?c.version!==7||c.materialIdentity!==JSON.stringify(this.context):version6(this.context)?c.version!==6||c.materialIdentity!==JSON.stringify(this.context):version5(this.context)?c.version!==5||c.materialIdentity!==JSON.stringify(this.context):version4(this.context)?c.version!==4||c.materialIdentity!==JSON.stringify(this.context):c.materialIdentity!==undefined)invalid()
    if(c.version===1){if(version8(this.context)||version7(this.context)||version6(this.context)||version5(this.context)||version4(this.context)||version3(this.context)||version2(this.context)||this.targets||c.materialVersion!==undefined||c.targetGeometry!==undefined||c.pendingTargets!==undefined)invalid()}
    else if(c.version!==(version8(this.context)?8:version7(this.context)?7:version6(this.context)?6:version5(this.context)?5:version4(this.context)?4:version3(this.context)?3:2)||c.materialVersion!==(version8(this.context)?8:version7(this.context)?7:version6(this.context)?6:version5(this.context)?5:version4(this.context)?4:version3(this.context)?3:version2(this.context)?2:1)||!sameData(c.targetGeometry,this.targets??null)||!Array.isArray(c.pendingTargets)||c.pendingTargets.length>64)invalid()
    // Shared builder validates bounded pending closure BEFORE cloning arrays.
    buildAdapterMaterial({masked:c.masked,entry:c.entry,draws:c.draws,fences:c.fences},this.context)
    const union=new Set<string>()
    for(const d of c.draws)for(const key of targetKeys(d,this.targets)){union.add(key);if(union.size>(this.targets?.maxTargets??64))invalid()}
    if(union.size>(this.targets?.maxTargets??64)||c.version!==1&&!sameData([...union],c.pendingTargets))invalid()
    c.inputs.forEach((input,i)=>{validateInput(input);if(!sameData(input.sourceColorField,c.draws[i].sourceColorField))invalid();const recipe=c.draws[i].recipe;if('kind'in recipe&&recipe.kind!=='image'&&recipe.coverageProfile===SOURCE_SEEDED_AUTO_MASK_PROFILE?(input.maskSeed===undefined||recipe.maskSeed!==input.maskSeed||recipe.sourceSlot!==(input.role==='primary'?0:1)):input.maskSeed!==undefined)invalid();if(!sameData(textureDrawControls(this.context,input.role,input),textureDrawControls(this.context,c.draws[i].role,c.draws[i])))invalid();if(pressure(this.context)?input.materialStrength===undefined||!('grainDepth'in c.draws[i])||!Object.is(c.draws[i].grainDepth,input.materialStrength):input.materialStrength!==undefined)invalid();if(version4(this.context)&&(!('grainDepth'in c.draws[i])||c.draws[i].role!=='primary'||(c.draws[i] as CanonicalMaterialBuildInputV4['draws'][number]).grainDepth!==1))invalid();if(input.role!==c.draws[i].role||version3(this.context)&&(!('grainDepth'in c.draws[i])||!Object.is((c.draws[i] as CanonicalMaterialBuildInputV3['draws'][number]).grainDepth,input.packet.pressure)))invalid()})
    if(!c.current||Object.keys(c.current).some(k=>!(c.current.phase==='between'?['phase']:['phase','group']).includes(k))||!sameEntry(after(c.entry,c.fences),c.current)||c.active===(c.current.phase==='between')
      ||c.current.phase!=='between'&&c.current.group!==c.inputOrdinal||c.ended&&c.fences.length&&c.fences.at(-1)?.kind!=='gestureEnd'
      ||!c.ended&&c.fences.some(f=>f.kind==='gestureEnd'))invalid()
    if(source.cursor){const role=this.program.roles[source.cursor.roleIndex]?.id,expected=role==='mask'||source.cursor.phase==='nextRole'?'mask':'primary';if(c.current.phase!==expected)invalid()}
    this.active=c.active;this.ended=c.ended;this.entry={...c.entry};this.current={...c.current};this.draws=structuredClone(c.draws) as Draw[];this.inputs=structuredClone(c.inputs) as SourceStrokeMaterialInput[];this.fences=structuredClone(c.fences) as CanonicalMaterialFence[];this.targetUnion=union
    for(const d of this.draws){const cost=this.measure(d);if(cost.fresh)this.recipes.push({...d.recipe});this.work+=cost.work;this.output+=cost.output;this.pixels+=cost.pixels}
  }
}

/** Historical public constructor/helpers stay closed to standalone7. */
export class SourceStrokeMaterialAdapter<C extends AnySourceStrokeMaterialContext=SourceStrokeMaterialContext> extends MaterialAdapterCore<C> {
 constructor(program:SourceStrokeAuthorProgram,context:C,state:SourceStrokeAuthorState,checkpoint?:SourceStrokeMaterialCheckpoint){
  if(Object.getOwnPropertyDescriptor(context,'version')?.value===7||(checkpoint&&Object.getOwnPropertyDescriptor(checkpoint,'version')?.value===7))invalid()
  super(program,context,state,checkpoint)
 }
 override checkpoint():SourceStrokeMaterialCheckpoint {const c=super.checkpoint();if(c.version===7||c.version===8)invalid();return c}
}
function ownFields7(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid()
 const keys=Reflect.ownKeys(value),out:Record<string,unknown>=Object.create(null)
 if(keys.length>required.length+optional.length||keys.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k)))invalid()
 for(const k of [...required,...optional]){const d=Object.getOwnPropertyDescriptor(value,k);if(!d){if(required.includes(k))invalid();continue}if(!Object.hasOwn(d,'value'))invalid();out[k]=d.value}return out
}
function splitMaterial7(value:unknown){const all=ownFields7(value,['version','assets','primarySource','primaryTexture','budget'],['targetGeometry']),{targetGeometry,...material}=all;return{material,targetGeometry}}
function targets7(value:unknown):Readonly<SourceMaterialTargetGeometry>|undefined {
 if(value===undefined)return undefined
 const p=ownFields7(value,['pageBounds','tileWidth','tileHeight'],['maxTargets']),bounds=p.pageBounds===null?null:ownFields7(p.pageBounds,['minX','minY','maxX','maxY'])
 return pinSourceMaterialTargets({...p,pageBounds:bounds}as unknown as SourceMaterialTargetGeometry)
}
/** New pure metadata helper, not a room/source permission. */
export function captureTexturedAutoMaterialInput(value:unknown):{material:CanonicalMaterialContextV7;targets:Readonly<SourceMaterialTargetGeometry>|undefined}{const split=splitMaterial7(value);const material=canonicalTexturedAutoMaterialContext(split.material);return{material,targets:targets7(split.targetGeometry)}}
export type SourceTexturedAutoMaterialAdapter=Pick<MaterialAdapterCore<SourceStrokeMaterialContextV7>,'beginInput'|'accept'|'flush'|'finish'>&{checkpoint():SourceStrokeMaterialCheckpointV7}
export function createTexturedAutoMaterialAdapter(program:SourceStrokeAuthorProgram,context:SourceStrokeMaterialContextV7,state:SourceStrokeAuthorState,checkpoint?:SourceStrokeMaterialCheckpointV7):SourceTexturedAutoMaterialAdapter {
 const roles=Object.getOwnPropertyDescriptor(program,'roles'),list=roles&&Object.hasOwn(roles,'value')?roles.value:undefined,role=list&&Object.getOwnPropertyDescriptor(list,'0'),r=role&&Object.hasOwn(role,'value')?role.value:undefined,texture=r&&Object.getOwnPropertyDescriptor(r,'textureProgram'),t=texture&&Object.hasOwn(texture,'value')?texture.value:undefined,b=t&&Object.getOwnPropertyDescriptor(t,'binding')
 if(!b||!Object.hasOwn(b,'value'))invalid()
 const split=splitMaterial7(context),material=assertTexturedAutoProgramContext(b.value,split.material),targets=targets7(split.targetGeometry)
 const core=new MaterialAdapterCore(program,context,state,checkpoint,{material,targets,binding:b.value})
 return {beginInput:core.beginInput.bind(core),accept:core.accept.bind(core),flush:core.flush.bind(core),finish:core.finish.bind(core),checkpoint(){const c=core.checkpoint();if(c.version!==7)invalid();return c}}
}

export function capturePrimaryGrainMaterialInput(value:unknown):{material:CanonicalMaterialContextV8;targets:Readonly<SourceMaterialTargetGeometry>|undefined}{const split=splitMaterial7(value);return{material:canonicalPrimaryGrainMaterialContext(split.material),targets:targets7(split.targetGeometry)}}
export type SourcePrimaryGrainMaterialAdapter=Pick<MaterialAdapterCore<SourceStrokeMaterialContextV8>,'beginInput'|'accept'|'flush'|'finish'>&{checkpoint():SourceStrokeMaterialCheckpointV8}
export function createPrimaryGrainMaterialAdapter(program:SourceStrokeAuthorProgram,context:SourceStrokeMaterialContextV8,state:SourceStrokeAuthorState,checkpoint?:SourceStrokeMaterialCheckpointV8):SourcePrimaryGrainMaterialAdapter {
 const role=program.roles[0],texture=role?.textureProgram
 if(texture?.strength!=='recorded-grain-u8-v1'&&texture?.strength!=='pixel-grain-u8-v1')invalid()
 const captured=capturePrimaryGrainMaterialInput(context),expected=texture.strength==='pixel-grain-u8-v1'?canonicalPixelTextureMaterialContext(texture.binding,captured.material.primaryTexture.phase,captured.material.budget,pixelSourceInputs(captured.material)):canonicalPrimaryGrainImageMaterialContext(texture.binding,captured.material.primaryTexture.phase,captured.material.budget)
 if(!sameData(expected,captured.material))invalid()
 const core=new MaterialAdapterCore(program,context,state,checkpoint,{...captured,binding:texture.binding})
 return{beginInput:core.beginInput.bind(core),accept:core.accept.bind(core),flush:core.flush.bind(core),finish:core.finish.bind(core),checkpoint(){const c=core.checkpoint();if(c.version!==8)invalid();return c}}
}

/** Neutral name shares the same source8 adapter and checkpoint owner. */
export const createPixelTextureMaterialAdapter=createPrimaryGrainMaterialAdapter
