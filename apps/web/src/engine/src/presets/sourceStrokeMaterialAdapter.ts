import {
  buildCanonicalMaterial, canonicalMaterialGeometryCost, CANONICAL_MATERIAL_LIMITS,
  type CanonicalMaterialBuildInput, type CanonicalMaterialContext, type CanonicalMaterialEntry,
  type CanonicalMaterialFence, type CanonicalMaterialFrame, type CanonicalMaterialRecipe,
} from '@grafetto/shared'
import type { SourceStrokeAuthorProgram, SourceStrokeAuthorState, SourceStrokeAuthorStep, SourceAuthorPacket } from './sourceStrokeAuthor'

import type { SourceDabGeometry } from './sourceDabCache'

type Draw=CanonicalMaterialBuildInput['draws'][number]
export type SourceStrokeMaterialContext=Omit<CanonicalMaterialContext,'preflightDefinition'|'expectedDrawCount'|'expectedStrokeEnd'> & { readonly geometry?: SourceDabGeometry }
export interface SourceStrokeMaterialInput {
  readonly packet:SourceAuthorPacket;readonly sourceAngle:number;readonly sourceTime:number
  readonly logicalSequence:number;readonly role:'primary'|'mask'
}
/** Inputs are AUTHOR-LOCAL actual paint metadata, not another wire field. They
 * keep existing Dab production aligned when a budget cut returns an older chunk. */
export interface SourceStrokeMaterialChunk {readonly packed:string;readonly frame:CanonicalMaterialFrame;readonly inputs:readonly SourceStrokeMaterialInput[]}
/** Private author checkpoint, never a wire/RNG journal. Source author owns all
 * query/scheduler/RNG state; counters only tie these pending bytes to that state. */
export interface SourceStrokeMaterialCheckpoint {
  readonly version:1;readonly programId:string;readonly masked:boolean
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
const equalRecipe=(a:CanonicalMaterialRecipe,b:CanonicalMaterialRecipe)=>Object.keys(a).every(k=>Object.is(a[k as keyof CanonicalMaterialRecipe],b[k as keyof CanonicalMaterialRecipe]))

/** OFF-path adapter from ACTUAL SourceStrokeAuthor yields to closed canonical
 * material chunks. No active hooks, renderer, asset loading, source evaluation or
 * RNG. Source fences frame input/role order, NOT native composite/reset commands.
 * Each returned chunk is already decoded from its canonical packed bytes; a
 * future local renderer must consume chunk.frame, never these raw author DTOs.
 */
export class SourceStrokeMaterialAdapter {
  private readonly context:CanonicalMaterialContext
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
  private recipes:CanonicalMaterialRecipe[]=[]
  private work=0
  private output=0
  private pixels=0

  constructor(program:SourceStrokeAuthorProgram,context:SourceStrokeMaterialContext,source:SourceStrokeAuthorState,checkpoint?:SourceStrokeMaterialCheckpoint){
    if(context.geometry?.kind==='defaultAuto')throw new RangeError('Default auto canonical material recipe is not implemented')
    if(program.roles.some(r=>r.geometry?.kind==='defaultAuto'||r.materialPolicy==='default-auto-fixed1-rng-free'))throw new RangeError('Default auto canonical material recipe is not implemented')
    if(!program.id||program.id.length>256||program.roles.length<1||program.roles.length>2||program.roles[0].id!=='primary'||program.roles.length===2&&program.roles[1].id!=='mask')invalid()
    this.program={id:program.id,roles:program.roles.map(r=>({id:r.id,asset:r.material.brushIdentity}))}
    this.context={assets:structuredClone(context.assets),primaryAsset:context.primaryAsset,maskAsset:context.maskAsset,
      budget:{...context.budget},preflightDefinition:canonicalMaterialGeometryCost}
    // Empty builder validation binds context/budgets, without images or options.
    buildCanonicalMaterial({masked:program.roles.length===2,entry:{phase:'between'},draws:[],fences:[]},this.context)
    for(const r of program.roles){
      const expected=r.id==='primary'?context.primaryAsset:context.maskAsset,a=context.assets.find(a=>a.id===expected)
      if(r.material.brushIdentity!==expected||!a||r.brush.width!==a.width||r.brush.height!==a.height||r.materialPolicy!=='png-fixed1-rng-free')invalid()
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
  beginInput(source:SourceStrokeAuthorState):SourceStrokeMaterialChunk[]{
    this.match(source)
    if(this.active||this.ended||source.cursor||this.current.phase!=='between'||this.inputOrdinal===Number.MAX_SAFE_INTEGER)invalid()
    const chunks=this.push([{kind:'fence',fence:{kind:'segmentBegin',group:this.inputOrdinal}}],{phase:'primary',group:this.inputOrdinal})
    this.active=true
    return chunks
  }
  /** Consumes a yield once. Retry never calls source author/options/RNG again:
   * bounded cuts retain and apply this exact result after flushing old bytes. */
  accept(step:SourceStrokeAuthorStep):SourceStrokeMaterialChunk[]{
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
    if(s?.geometry?.kind==='defaultAuto')throw new RangeError('Default auto canonical material recipe is not implemented')
    if(!m||!s||!r.painted||s.brushIdentity!==this.program.roles.find(p=>p.id===role)!.asset
      ||m.resolvedRect.width!==s.width||m.resolvedRect.height!==s.height
      ||typeof r.opacity!=='number'||!Number.isFinite(r.opacity)||r.opacity<0||r.opacity>1
      ||typeof r.flow!=='number'||!Number.isFinite(r.flow)||r.flow<0||r.flow>1
      ||!Number.isSafeInteger(m.resolvedRect.x)||!Number.isSafeInteger(m.resolvedRect.y)
      ||Math.abs(m.resolvedRect.x)>1e8||Math.abs(m.resolvedRect.y)>1e8
      ||Math.abs(m.resolvedRect.x+s.width)>1e8||Math.abs(m.resolvedRect.y+s.height)>1e8)invalid()
    const recipe:CanonicalMaterialRecipe={asset:s.brushIdentity,brushScale:s.brush.scale,brushAngle:s.brush.angle,
      scale:s.shape.scale,ratio:s.shape.ratio,rotation:s.shape.rotation,subX:s.key.subPixelX,subY:s.key.subPixelY,
      width:s.width,height:s.height,mirrorH:s.mirror.horizontal,mirrorV:s.mirror.vertical}
    // Saved source shape already consumed coordinateSystemFlipped. Bitmap flips
    // are saved mirror bits; NEVER use the second, spacing-only Mirror result.
    return{recipe,role,x:m.resolvedRect.x,y:m.resolvedRect.y,opacity:r.opacity,flow:r.flow}
  }
  private measure(draw:Draw|undefined):{work:number;output:number;pixels:number;fresh:boolean}{
    if(!draw)return{work:0,output:0,pixels:0,fresh:false}
    const a=this.context.assets.find(a=>a.id===draw.recipe.asset)
    if(!a)invalid()
    const cost=canonicalMaterialGeometryCost(draw.recipe,a!)
    const fresh=!this.recipes.some(r=>equalRecipe(r,draw.recipe))
    return{work:fresh?cost.workUnits:0,output:fresh?cost.outputBytes:0,pixels:draw.recipe.width*draw.recipe.height,fresh}
  }
  private fits(draws:number,fences:number,work:number,output:number,pixels:number):boolean {
    return draws<=CANONICAL_MATERIAL_LIMITS.draws&&fences<=3*(draws+1)+1
      &&[work,output,pixels].every(n=>Number.isSafeInteger(n)&&n>=0)
      &&work<=this.context.budget.workUnits&&output<=this.context.budget.outputBytes&&pixels<=this.context.budget.drawPixels
  }
  private push(events:readonly Event[],next:CanonicalMaterialEntry):SourceStrokeMaterialChunk[]{
    if(!events.length){this.current=next;return[]}
    const draw=events.find(e=>e.kind==='draw')
    if(events.filter(e=>e.kind==='draw').length>1)invalid()
    let cost=this.measure(draw?.kind==='draw'?draw.draw:undefined)
    const n=draw?1:0,f=events.length-n,chunks:SourceStrokeMaterialChunk[]=[]
    if(!this.fits(this.draws.length+n,this.fences.length+f,this.work+cost.work,this.output+cost.output,this.pixels+cost.pixels)){
      // First ensure the exact pending result can fit a cold chunk. Failure must
      // not flush/mutate already accepted records or advance author counters.
      const cold=draw?.kind==='draw'?canonicalMaterialGeometryCost(draw.draw.recipe,this.context.assets.find(a=>a.id===draw.draw.recipe.asset)!):{workUnits:0,outputBytes:0}
      if(!this.fits(n,f,cold.workUnits,cold.outputBytes,cost.pixels))throw new RangeError('Source material result exceeds a cold chunk budget')
      const old=this.flush();if(old)chunks.push(old)
      cost=this.measure(draw?.kind==='draw'?draw.draw:undefined)
    }
    for(const e of events){if(e.kind==='draw'){this.draws.push(structuredClone(e.draw));this.inputs.push(freeze(structuredClone(e.input)))}else this.fences.push({...e.fence,at:this.draws.length})}
    if(draw?.kind==='draw'&&cost.fresh)this.recipes.push({...draw.draw.recipe})
    this.work+=cost.work;this.output+=cost.output;this.pixels+=cost.pixels;this.current=next
    return chunks
  }
  /** An explicit cut preserves current role/segment context and repeats all
   * referenced saved material definitions in the next closed packet. */
  flush():SourceStrokeMaterialChunk|undefined {
    if(!this.draws.length&&!this.fences.length)return undefined
    const chunk=buildCanonicalMaterial({masked:this.masked,entry:this.entry,draws:this.draws,fences:this.fences},
      {...this.context,expectedDrawCount:this.draws.length,expectedStrokeEnd:this.fences.at(-1)?.kind==='gestureEnd'})
    const result=freeze({...chunk,inputs:this.inputs})
    this.draws=[];this.inputs=[];this.fences=[];this.recipes=[];this.work=0;this.output=0;this.pixels=0;this.entry={...this.current}
    return result
  }
  /** Outer author pen-up fence, distinct from an inputComplete segment fence.
   * A zero-draw final tail is returned even after all material dabs were flushed. */
  finish(source:SourceStrokeAuthorState):SourceStrokeMaterialChunk[]{
    this.match(source)
    if(this.active||this.ended||source.cursor||this.current.phase!=='between')invalid()
    const chunks=this.push([{kind:'fence',fence:{kind:'gestureEnd'}}],this.current)
    this.ended=true
    const last=this.flush();if(last)chunks.push(last)
    return chunks
  }
  checkpoint():SourceStrokeMaterialCheckpoint {
    return freeze(structuredClone({version:1,programId:this.program.id,masked:this.masked,inputOrdinal:this.inputOrdinal,eventOrdinal:this.eventOrdinal,
      active:this.active,ended:this.ended,entry:this.entry,current:this.current,draws:this.draws,inputs:this.inputs,fences:this.fences}))
  }
  private restore(source:SourceStrokeAuthorState,c:SourceStrokeMaterialCheckpoint):void {
    if(!c||Object.keys(c).some(k=>!['version','programId','masked','inputOrdinal','eventOrdinal','active','ended','entry','current','draws','inputs','fences'].includes(k))||c.version!==1||c.programId!==this.program.id||c.masked!==this.masked||c.inputOrdinal!==source.inputOrdinal||c.eventOrdinal!==source.eventOrdinal
      ||typeof c.active!=='boolean'||typeof c.ended!=='boolean'||c.active!==!!source.cursor||c.active&&c.ended
      ||!Array.isArray(c.draws)||!Array.isArray(c.fences)||!Array.isArray(c.inputs)||c.inputs.length!==c.draws.length)invalid()
    // Shared builder validates bounded pending closure BEFORE cloning arrays.
    buildCanonicalMaterial({masked:c.masked,entry:c.entry,draws:c.draws,fences:c.fences},this.context)
    c.inputs.forEach((input,i)=>{validateInput(input);if(input.role!==c.draws[i].role)invalid()})
    if(!c.current||Object.keys(c.current).some(k=>!(c.current.phase==='between'?['phase']:['phase','group']).includes(k))||!sameEntry(after(c.entry,c.fences),c.current)||c.active===(c.current.phase==='between')
      ||c.current.phase!=='between'&&c.current.group!==c.inputOrdinal||c.ended&&c.fences.length&&c.fences.at(-1)?.kind!=='gestureEnd'
      ||!c.ended&&c.fences.some(f=>f.kind==='gestureEnd'))invalid()
    if(source.cursor){const role=this.program.roles[source.cursor.roleIndex]?.id,expected=role==='mask'||source.cursor.phase==='nextRole'?'mask':'primary';if(c.current.phase!==expected)invalid()}
    this.active=c.active;this.ended=c.ended;this.entry={...c.entry};this.current={...c.current};this.draws=structuredClone(c.draws) as Draw[];this.inputs=structuredClone(c.inputs) as SourceStrokeMaterialInput[];this.fences=structuredClone(c.fences) as CanonicalMaterialFence[]
    for(const d of this.draws){const cost=this.measure(d);if(cost.fresh)this.recipes.push({...d.recipe});this.work+=cost.work;this.output+=cost.output;this.pixels+=cost.pixels}
  }
}
