import {
  buildCanonicalMaterial, canonicalMaterialGeometryCost, canonicalAutoCost, canonicalDefaultAutoStatic, canonicalDefaultAutoSourcePin, canonicalGaussianAutoStatic, canonicalGaussianAutoSourcePin, canonicalSoftAutoStatic, canonicalSoftAutoSourcePin, canonicalSoftAutoCost, CANONICAL_MATERIAL_LIMITS,
  type CanonicalMaterialBuildInput, type CanonicalMaterialContext, type CanonicalMaterialEntry,
  type CanonicalMaterialFence, type CanonicalMaterialFrame, type CanonicalMaterialContextV2, type CanonicalMaterialFrameV2, type AnyCanonicalMaterialRecipe, type AnyCanonicalMaterialFrame, type AnyCanonicalMaterialContext, type CanonicalMaterialBuildInputV2,
} from '@grafetto/shared'
import type { SourceStrokeAuthorProgram, SourceStrokeAuthorState, SourceStrokeAuthorStep, SourceAuthorPacket } from './sourceStrokeAuthor'

import { planCanonicalTargets } from '../dabs/CanonicalTargetPlan'
import type { WorldRect } from '../buffers/tileMath'
import type { SourceDabGeometry } from './sourceDabCache'

type Draw=CanonicalMaterialBuildInput['draws'][number] | CanonicalMaterialBuildInputV2['draws'][number]
/** Arrays are version-homogeneous; the shared builder rejects a wrong recipe
 * kind before decoding. This bridge keeps that runtime validation in ONE owner. */
function buildAdapterMaterial(input:Omit<CanonicalMaterialBuildInput,'draws'>&{readonly draws:readonly Draw[]},context:AnyCanonicalMaterialContext){
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
export type AnySourceStrokeMaterialContext=SourceStrokeMaterialContext|SourceStrokeMaterialContextV2
type FrameFor<C> = C extends SourceStrokeMaterialContextV2 ? CanonicalMaterialFrameV2 : CanonicalMaterialFrame
type ChunkFor<C> = SourceStrokeMaterialChunk<FrameFor<C>>
const version2=(c:AnySourceStrokeMaterialContext|AnyCanonicalMaterialContext):c is CanonicalMaterialContextV2=>'version' in c&&c.version===2
/** Pin room geometry once. This is NOT a viewport or an execution grant. */
export function pinSourceMaterialTargets(g:SourceMaterialTargetGeometry|undefined):Readonly<SourceMaterialTargetGeometry>|undefined {
  if(g===undefined)return
  if(!g||Object.keys(g).some(k=>!['pageBounds','tileWidth','tileHeight','maxTargets'].includes(k)))invalid()
  planCanonicalTargets({minX:0,minY:0,maxX:0,maxY:0},g.pageBounds,g.tileWidth,g.tileHeight,g.maxTargets??64)
  return freeze({pageBounds:g.pageBounds===null?null:{...g.pageBounds},tileWidth:g.tileWidth,tileHeight:g.tileHeight,maxTargets:g.maxTargets??64})
}
export function copySourceMaterialContext(c:AnySourceStrokeMaterialContext):AnyCanonicalMaterialContext {
  if('version' in c&&c.version===2){
    const binding=(s:CanonicalMaterialContextV2['primarySource'])=>s?.kind==='defaultAuto'?canonicalDefaultAutoSourcePin(s):s?.kind==='gaussianAuto'?canonicalGaussianAutoSourcePin(s):s?.kind==='softAuto'?canonicalSoftAutoSourcePin(s):freeze({...s})
    const primarySource=binding(c.primarySource),maskSource=c.maskSource===undefined?undefined:binding(c.maskSource)
    return freeze({version:2,assets:structuredClone(c.assets),primarySource,...maskSource?{maskSource}:{},budget:{...c.budget}})
  }
  const legacy=c as SourceStrokeMaterialContext
  if(legacy.geometry?.kind==='defaultAuto'||legacy.geometry?.kind==='gaussianAuto'||legacy.geometry?.kind==='softAuto')throw new RangeError('Default auto requires a trusted wire2 source context')
  return freeze({assets:structuredClone(legacy.assets),primaryAsset:legacy.primaryAsset,maskAsset:legacy.maskAsset,budget:{...legacy.budget},preflightDefinition:canonicalMaterialGeometryCost})
}
function targetKeys(d:Pick<Draw,'x'|'y'|'recipe'>,g:SourceMaterialTargetGeometry|undefined):readonly string[]{
  if(!g)return[]
  return planCanonicalTargets({minX:d.x,minY:d.y,maxX:d.x+d.recipe.width,maxY:d.y+d.recipe.height},g.pageBounds,g.tileWidth,g.tileHeight,g.maxTargets??64).tiles.map(t=>t.tileX+':'+t.tileY)
}
/** Encoder recheck, not a second packetizer. Caller uses the SAME room grid. */
export function assertSourceMaterialTargets(frame:AnyCanonicalMaterialFrame,g:SourceMaterialTargetGeometry|undefined):void{
  const keys=new Set<string>()
  for(const d of frame.draws)for(const k of targetKeys({x:d.x,y:d.y,recipe:frame.definitions[d.definition]},g)){
    keys.add(k)
    if(keys.size>(g?.maxTargets??64))throw new RangeError('Canonical frame exceeds target union')
  }
}
export interface SourceStrokeMaterialInput {
  readonly packet:SourceAuthorPacket;readonly sourceAngle:number;readonly sourceTime:number
  readonly logicalSequence:number;readonly role:'primary'|'mask'
}
/** Inputs are AUTHOR-LOCAL actual paint metadata, not another wire field. They
 * keep existing Dab production aligned when a budget cut returns an older chunk. */
export interface SourceStrokeMaterialChunk<F extends AnyCanonicalMaterialFrame=CanonicalMaterialFrame> {readonly packed:string;readonly frame:F;readonly inputs:readonly SourceStrokeMaterialInput[]}
/** Private author checkpoint, never a wire/RNG journal. Source author owns all
 * query/scheduler/RNG state; counters only tie these pending bytes to that state. */
export interface SourceStrokeMaterialCheckpoint {
  readonly version:1|2;readonly materialVersion?:1|2;readonly targetGeometry?:Readonly<SourceMaterialTargetGeometry>|null;readonly pendingTargets?:readonly string[];readonly programId:string;readonly masked:boolean
  readonly inputOrdinal:number;readonly eventOrdinal:number;readonly active:boolean;readonly ended:boolean
  readonly entry:CanonicalMaterialEntry;readonly current:CanonicalMaterialEntry
  readonly draws:readonly Draw[];readonly inputs:readonly SourceStrokeMaterialInput[];readonly fences:readonly CanonicalMaterialFence[]
}
type Event={readonly kind:'draw';readonly draw:Draw;readonly input:SourceStrokeMaterialInput}|{readonly kind:'fence';readonly fence:Omit<Extract<CanonicalMaterialFence,{group:number}>,'at'>|{readonly kind:'gestureEnd'}}
function invalid():never {throw new RangeError('Invalid source material adapter state or result')}
function freeze<T>(value:T):T {if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value}
function validateInput(input:SourceStrokeMaterialInput):void {
  if(!input||Object.keys(input).some(k=>!['packet','sourceAngle','sourceTime','logicalSequence','role'].includes(k))||!['primary','mask'].includes(input.role)||!Number.isSafeInteger(input.logicalSequence)||input.logicalSequence<0||input.logicalSequence>0x7fffffff
    ||!Number.isFinite(input.sourceAngle)||!Number.isFinite(input.sourceTime)||input.sourceTime<0||input.sourceTime>Number.MAX_SAFE_INTEGER||!input.packet)invalid()
  const p=input.packet
  if(Object.keys(p).some(k=>!['x','y','t','pressure','tiltX','tiltY','speed','rotation','tangentialPressure','perspective','canvasRotation','mirroredH','mirroredV','tiltDirectionOffset','hover'].includes(k)))invalid()
  if(![p.x,p.y,p.t,p.pressure,p.tiltX,p.tiltY,p.speed,p.rotation,p.tangentialPressure,p.perspective,p.canvasRotation,p.tiltDirectionOffset].every(Number.isFinite)
    ||!Object.is(p.t,input.sourceTime)||p.pressure<0||p.pressure>1||[p.hover,p.mirroredH,p.mirroredV].some(v=>typeof v!=='boolean'))invalid()
}
/** Internal author Request adds drawingAngle/angleOverride to the runtime
 * object. Project the exact typed packet without those duplicate scheduling
 * fields; sourceAngle below is the one authoritative resolved direction. */
function packet(p:SourceAuthorPacket):SourceAuthorPacket {
  if(!p)invalid()
  const {x,y,t,pressure,tiltX,tiltY,speed,rotation,tangentialPressure,perspective,canvasRotation,mirroredH,mirroredV,tiltDirectionOffset,hover}=p
  return{x,y,t,pressure,tiltX,tiltY,speed,rotation,tangentialPressure,perspective,canvasRotation,mirroredH,mirroredV,tiltDirectionOffset,hover}
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
export class SourceStrokeMaterialAdapter<C extends AnySourceStrokeMaterialContext=SourceStrokeMaterialContext> {
  private readonly context:AnyCanonicalMaterialContext
  private readonly targets:Readonly<SourceMaterialTargetGeometry>|undefined
  private targetUnion=new Set<string>()
  private readonly program:Pick<SourceStrokeAuthorProgram,'id'> & {readonly roles:readonly {readonly id:'primary'|'mask';readonly asset:string}[]}
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

  constructor(program:SourceStrokeAuthorProgram,context:C,source:SourceStrokeAuthorState,checkpoint?:SourceStrokeMaterialCheckpoint){
    if(!version2(context)&&program.roles.some(r=>r.geometry?.kind==='defaultAuto'||r.geometry?.kind==='gaussianAuto'||r.geometry?.kind==='softAuto'))throw new RangeError('Default auto requires a trusted wire2 source context')
    this.targets=pinSourceMaterialTargets(context.targetGeometry)
    this.context=copySourceMaterialContext(context)
    buildAdapterMaterial({masked:program.roles.length===2,entry:{phase:'between'},draws:[],fences:[]},this.context)
    if(!program.id||program.id.length>256||program.roles.length<1||program.roles.length>2||program.roles[0].id!=='primary'||program.roles.length===2&&program.roles[1].id!=='mask')invalid()
    this.program={id:program.id,roles:program.roles.map(r=>({id:r.id,asset:r.material.brushIdentity}))}
    for(const r of program.roles){
      if(version2(this.context)){
        const pin=r.id==='primary'?this.context.primarySource:this.context.maskSource
        if(!pin)invalid()
        if(pin.kind==='defaultAuto'||pin.kind==='gaussianAuto'||pin.kind==='softAuto'){
          const g=r.geometry
          const policy=pin.kind==='softAuto'?'soft-auto-fixed1-rng-free':pin.kind==='defaultAuto'?'default-auto-fixed1-rng-free':'gaussian-auto-fixed1-rng-free'
          if(pin.kind==='softAuto'&&pin.sourceSlot!==(r.id==='primary'?0:1))invalid()
          if(!g||g.kind!==pin.kind||r.materialPolicy!==policy||pin.brushScale!==1
            ||r.material.brushIdentity!==pin.descriptorId+'@'+pin.descriptorVersion
            ||g.coverageProfile!==pin.coverageProfile)invalid()
          const actual=g.kind==='defaultAuto'?canonicalDefaultAutoStatic(g.source,r.brush.scale,r.brush.angle)
            :g.kind==='gaussianAuto'?canonicalGaussianAutoStatic(g.source,r.brush.scale,r.brush.angle):g.kind==='softAuto'?canonicalSoftAutoStatic(g.source,r.brush.scale,r.brush.angle):invalid()
          const expected=pin.kind==='defaultAuto'?canonicalDefaultAutoStatic(pin.source,pin.brushScale,pin.brushAngle)
            :pin.kind==='gaussianAuto'?canonicalGaussianAutoStatic(pin.source,pin.brushScale,pin.brushAngle):canonicalSoftAutoStatic(pin.source,pin.brushScale,pin.brushAngle)
          if(!sameData(actual,expected))invalid()
        } else {
          const a=this.context.assets.find(a=>a.id===pin.asset)
          if(r.geometry?.kind==='defaultAuto'||r.materialPolicy!=='png-fixed1-rng-free'||r.material.brushIdentity!==pin.asset||!a
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
    if(source.programId!==this.program.id||source.inputOrdinal!==this.inputOrdinal||source.eventOrdinal!==this.eventOrdinal)invalid()
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
      const input={packet:packet(step.packet!),sourceAngle:step.sourceAngle!,sourceTime:step.sourceTime!,logicalSequence:step.logicalSequence!,role:step.role}
      validateInput(input)
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
    if(!m||!s||!r.painted||s.brushIdentity!==this.program.roles.find(p=>p.id===role)!.asset
      ||m.resolvedRect.width!==s.width||m.resolvedRect.height!==s.height
      ||typeof r.opacity!=='number'||!Number.isFinite(r.opacity)||r.opacity<0||r.opacity>1
      ||typeof r.flow!=='number'||!Number.isFinite(r.flow)||r.flow<0||r.flow>1
      ||!Number.isSafeInteger(m.resolvedRect.x)||!Number.isSafeInteger(m.resolvedRect.y)
      ||Math.abs(m.resolvedRect.x)>1e8||Math.abs(m.resolvedRect.y)>1e8
      ||Math.abs(m.resolvedRect.x+s.width)>1e8||Math.abs(m.resolvedRect.y+s.height)>1e8)invalid()
    const common={brushScale:s.brush.scale,brushAngle:s.brush.angle,
      scale:s.shape.scale,ratio:s.shape.ratio,rotation:s.shape.rotation,subX:s.key.subPixelX,subY:s.key.subPixelY,
      width:s.width,height:s.height,mirrorH:s.mirror.horizontal,mirrorV:s.mirror.vertical}
    let recipe:AnyCanonicalMaterialRecipe
    if(s.geometry?.kind==='defaultAuto'){
      if(!version2(this.context))invalid()
      recipe={...common,kind:'defaultAuto',coverageProfile:s.geometry.coverageProfile,
        ...canonicalDefaultAutoStatic(s.geometry.source,s.brush.scale,s.brush.angle)}
    }else if(s.geometry?.kind==='gaussianAuto'){
      if(!version2(this.context))invalid()
      recipe={...common,kind:'gaussianAuto',coverageProfile:s.geometry.coverageProfile,
        ...canonicalGaussianAutoStatic(s.geometry.source,s.brush.scale,s.brush.angle)}
    }else if(s.geometry?.kind==='softAuto'){
      if(!version2(this.context))invalid()
      recipe={...common,kind:'softAuto',sourceSlot:role==='primary'?0:1,coverageProfile:s.geometry.coverageProfile,
        ...canonicalSoftAutoStatic(s.geometry.source,s.brush.scale,s.brush.angle)}
    }else recipe=version2(this.context)?{...common,kind:'image',asset:s.brushIdentity}:{...common,asset:s.brushIdentity}
    // Saved source shape already consumed coordinateSystemFlipped. Bitmap flips
    // are saved mirror bits; NEVER use the second, spacing-only Mirror result.
    return{recipe,role,x:m.resolvedRect.x,y:m.resolvedRect.y,opacity:r.opacity,flow:r.flow} as Draw
  }
  private cost(draw:Draw){
    if('kind' in draw.recipe&&draw.recipe.kind==='softAuto'){
      if(!version2(this.context))invalid()
      const pin=draw.role==='primary'?this.context.primarySource:this.context.maskSource
      if(!pin||pin.kind!=='softAuto')invalid()
      return canonicalSoftAutoCost(draw.recipe,pin)
    }
    if('kind' in draw.recipe&&(draw.recipe.kind==='defaultAuto'||draw.recipe.kind==='gaussianAuto')){
      if(!version2(this.context))invalid()
      const pin=draw.role==='primary'?this.context.primarySource:this.context.maskSource
      if(!pin||pin.kind!==draw.recipe.kind)invalid()
      return canonicalAutoCost(draw.recipe,pin)
    }
    const recipe=draw.recipe
    if(!('asset' in recipe))return invalid()
    const a=this.context.assets.find(a=>a.id===recipe.asset)
    if(!a)return invalid()
    return canonicalMaterialGeometryCost(recipe,a)
  }
  private measure(draw:Draw|undefined):{work:number;output:number;pixels:number;fresh:boolean}{
    if(!draw)return{work:0,output:0,pixels:0,fresh:false}
    const cost=this.cost(draw)
    const fresh=!this.recipes.some(r=>equalRecipe(r,draw.recipe))
    return{work:fresh?cost.workUnits:0,output:fresh?cost.outputBytes:0,pixels:draw.recipe.width*draw.recipe.height,fresh}
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
    if(union.size>(this.targets?.maxTargets??64)||!this.fits(this.draws.length+n,this.fences.length+f,this.work+cost.work,this.output+cost.output,this.pixels+cost.pixels)){
      // First ensure the exact pending result can fit a cold chunk. Failure must
      // not flush/mutate already accepted records or advance author counters.
      const cold=draw?.kind==='draw'?this.cost(draw.draw):{workUnits:0,outputBytes:0}
      if(keys.length>(this.targets?.maxTargets??64)||!this.fits(n,f,cold.workUnits,cold.outputBytes,cost.pixels))throw new RangeError('Source material result exceeds a cold chunk budget')
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
  checkpoint():SourceStrokeMaterialCheckpoint {
    const extra=version2(this.context)||this.targets?{version:2 as const,materialVersion:version2(this.context)?2 as const:1 as const,
      targetGeometry:this.targets??null,pendingTargets:[...this.targetUnion]}:{version:1 as const}
    return freeze(structuredClone({...extra,programId:this.program.id,masked:this.masked,inputOrdinal:this.inputOrdinal,eventOrdinal:this.eventOrdinal,
      active:this.active,ended:this.ended,entry:this.entry,current:this.current,draws:this.draws,inputs:this.inputs,fences:this.fences}))
  }
  private restore(source:SourceStrokeAuthorState,c:SourceStrokeMaterialCheckpoint):void {
    if(!c||Object.keys(c).some(k=>!['version','programId','masked','inputOrdinal','eventOrdinal','active','ended','entry','current','draws','inputs','fences','materialVersion','targetGeometry','pendingTargets'].includes(k))||![1,2].includes(c.version)||c.programId!==this.program.id||c.masked!==this.masked||c.inputOrdinal!==source.inputOrdinal||c.eventOrdinal!==source.eventOrdinal
      ||typeof c.active!=='boolean'||typeof c.ended!=='boolean'||c.active!==!!source.cursor||c.active&&c.ended
      ||!Array.isArray(c.draws)||!Array.isArray(c.fences)||!Array.isArray(c.inputs)||c.inputs.length!==c.draws.length)invalid()
    if(c.version===1){if(version2(this.context)||this.targets||c.materialVersion!==undefined||c.targetGeometry!==undefined||c.pendingTargets!==undefined)invalid()}
    else if(c.materialVersion!==(version2(this.context)?2:1)||!sameData(c.targetGeometry,this.targets??null)||!Array.isArray(c.pendingTargets)||c.pendingTargets.length>64)invalid()
    // Shared builder validates bounded pending closure BEFORE cloning arrays.
    buildAdapterMaterial({masked:c.masked,entry:c.entry,draws:c.draws,fences:c.fences},this.context)
    const union=new Set<string>()
    for(const d of c.draws)for(const key of targetKeys(d,this.targets)){union.add(key);if(union.size>(this.targets?.maxTargets??64))invalid()}
    if(union.size>(this.targets?.maxTargets??64)||c.version===2&&!sameData([...union],c.pendingTargets))invalid()
    c.inputs.forEach((input,i)=>{validateInput(input);if(input.role!==c.draws[i].role)invalid()})
    if(!c.current||Object.keys(c.current).some(k=>!(c.current.phase==='between'?['phase']:['phase','group']).includes(k))||!sameEntry(after(c.entry,c.fences),c.current)||c.active===(c.current.phase==='between')
      ||c.current.phase!=='between'&&c.current.group!==c.inputOrdinal||c.ended&&c.fences.length&&c.fences.at(-1)?.kind!=='gestureEnd'
      ||!c.ended&&c.fences.some(f=>f.kind==='gestureEnd'))invalid()
    if(source.cursor){const role=this.program.roles[source.cursor.roleIndex]?.id,expected=role==='mask'||source.cursor.phase==='nextRole'?'mask':'primary';if(c.current.phase!==expected)invalid()}
    this.active=c.active;this.ended=c.ended;this.entry={...c.entry};this.current={...c.current};this.draws=structuredClone(c.draws) as Draw[];this.inputs=structuredClone(c.inputs) as SourceStrokeMaterialInput[];this.fences=structuredClone(c.fences) as CanonicalMaterialFence[];this.targetUnion=union
    for(const d of this.draws){const cost=this.measure(d);if(cost.fresh)this.recipes.push({...d.recipe});this.work+=cost.work;this.output+=cost.output;this.pixels+=cost.pixels}
  }
}
