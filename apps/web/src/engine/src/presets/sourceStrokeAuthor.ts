import { SourceDistanceTiming, sourceTimingInterval, type SourceSpacing } from '../dabs/sourceDistanceTiming'
import { sourceDrawingDirection, sourceFanRequests, shortestSourceTurn } from '../input/kritaStrokeInput'
import { KritaRandomSource, KritaPerStrokeRandomSource, type KritaRandomSnapshot, type KritaPerStrokeRandomSnapshot } from './nativeRandom'
import { compileSourceOptionProgram, type SourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
import { sourcePngCharacteristicSize, type SourcePngBrush } from './sourcePngGeometry'
import type { SourceDabCacheRequest, SourceDabCacheState } from './sourceDabCache'
import { SourceStampQueryExecutor, type SourceStampOptionId, type SourceStampOptions, type SourceStampResult } from './sourceStampQuery'

/** Author-only, no persisted representation or renderer activation. */
export interface SourceAuthorPacket {
  readonly x: number; readonly y: number; readonly t: number
  readonly pressure: number; readonly tiltX: number; readonly tiltY: number
  readonly speed: number; readonly rotation: number; readonly tangentialPressure: number; readonly perspective: number
  readonly canvasRotation: number; readonly mirroredH: boolean; readonly mirroredV: boolean
  readonly tiltDirectionOffset: number; readonly hover: boolean
}
export interface SourceAuthorRoleProgram {
  readonly id: 'primary' | 'mask'
  readonly options: Readonly<Record<SourceStampOptionId, SourceOptionProgramInput>>
  readonly brush: SourcePngBrush
  readonly material: Omit<SourceDabCacheRequest, 'x' | 'y' | 'shape'>
  /** Current supported material law; active extra consumers must be rejected. */
  readonly materialPolicy: 'png-fixed1-rng-free'
  readonly lodScale: number
  readonly scatterX: boolean; readonly scatterY: boolean
  readonly mirrorX: boolean; readonly mirrorY: boolean; readonly indirectPainting: boolean
  readonly spacing: { readonly value: number; readonly automatic: boolean; readonly coefficient: number; readonly isotropic: boolean }
  readonly timing: { readonly enabled: boolean; readonly rate: number; readonly ignoreDistance: boolean }
  readonly fanStepDegrees?: number
  readonly spacingRefreshMs: number; readonly timingRefreshMs: number
}
export interface SourceStrokeAuthorProgram {
  /** Caller supplies immutable descriptor identity. Not a new wire hash. */
  readonly id: string
  readonly roles: readonly SourceAuthorRoleProgram[]
}
type DistanceState = Pick<SourceDistanceTiming, 'x' | 'y' | 'time' | 'spacingElapsed' | 'timingElapsed'>
interface Request extends SourceAuthorPacket { readonly drawingAngle: number; readonly angleOverride?: boolean }
export interface SourceAuthorRoleState {
  readonly distance: DistanceState
  readonly spacing: SourceSpacing
  readonly interval?: number
  readonly cache: SourceDabCacheState
  readonly sequence: number; readonly totalDistance: number; readonly maxPressure: number
  readonly lastPosition: { readonly x: number; readonly y: number }
  readonly lastAngle: number; readonly lockedAngle?: number
  readonly lastPaint?: Request
}
interface Cursor {
  readonly kind: 'start' | 'segment'
  readonly endpoint: SourceAuthorPacket
  readonly roleIndex: number
  readonly current: SourceAuthorPacket
  readonly phase: 'distance' | 'paint' | 'spacing' | 'timing' | 'nextRole'
  readonly requests: readonly Request[]
}
export interface SourceStrokeAuthorState {
  readonly version: 1; readonly programId: string
  readonly random: KritaRandomSnapshot; readonly perStroke: KritaPerStrokeRandomSnapshot
  readonly roles: readonly SourceAuthorRoleState[]
  readonly initialAngle: number
  readonly lastInput?: SourceAuthorPacket
  readonly cursor?: Cursor
  readonly inputOrdinal: number; readonly eventOrdinal: number
}
export interface SourceStrokeAuthorStep {
  readonly kind: 'material' | 'query' | 'inputComplete'
  readonly role?: 'primary' | 'mask'
  readonly query?: 'paint' | 'spacing' | 'timing'
  readonly sourceAngle?: number; readonly sourceTime?: number; readonly logicalSequence?: number
  readonly packet?: SourceAuthorPacket
  readonly result?: SourceStampResult
  readonly state: SourceStrokeAuthorState
}
const IDS: readonly SourceStampOptionId[] = ['Size','Rotation','Ratio','Scatter','Opacity','Flow','Mirror','Spacing','Rate']
const distanceState = (d: DistanceState): DistanceState => ({ x:d.x,y:d.y,time:d.time,spacingElapsed:d.spacingElapsed,timingElapsed:d.timingElapsed })
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}
function validatePacket(p: SourceAuthorPacket): void {
  if (!p || ![p.x,p.y,p.t,p.pressure,p.tiltX,p.tiltY,p.speed,p.rotation,p.tangentialPressure,p.perspective,p.canvasRotation,p.tiltDirectionOffset].every(Number.isFinite)
    || p.t<0 || p.t>Number.MAX_SAFE_INTEGER || p.pressure<0 || p.pressure>1
    || [p.hover,p.mirroredH,p.mirroredV].some(v=>typeof v!=='boolean')) throw new RangeError('Invalid native author packet')
}
function mix(a: SourceAuthorPacket,b: SourceAuthorPacket,t: number): SourceAuthorPacket {
  // Native mix preserves first packet canvas/hover settings. Rotation's circular
  // interpolation is explicitly unsupported until its separate law is supplied.
  const scalar=(x:number,y:number)=>(1-t)*x+t*y
  return {...a,x:scalar(a.x,b.x),y:scalar(a.y,b.y),t:scalar(a.t,b.t),pressure:scalar(a.pressure,b.pressure),
    tiltX:scalar(a.tiltX,b.tiltX),tiltY:scalar(a.tiltY,b.tiltY),speed:scalar(a.speed,b.speed),
    tangentialPressure:scalar(a.tangentialPressure,b.tangentialPressure),perspective:scalar(a.perspective,b.perspective)}
}
function spacing(program: SourceAuthorRoleProgram,r: SourceStampResult): SourceSpacing {
  if (r.scale===undefined || r.rotation===undefined || r.spacing===undefined || !r.spacingMirror) {
    // Native canPaintFor false uses1; tiny uses default enabled spacing0.
    return {enabled:true,isotropic:true,x:r.scale===undefined?1:0,y:r.scale===undefined?1:0,angle:0}
  }
  const metric=sourcePngCharacteristicSize(program.brush,{scale:r.scale,ratio:1,rotation:0})
  const auto=(v:number)=>program.spacing.coefficient*(v<1?v:Math.sqrt(v))
  let x:number,y:number
  if(program.spacing.isotropic){
    const dimension=Math.max(...metric)
    x=y=program.spacing.automatic?auto(dimension):dimension*program.spacing.value
  }else{
    const axis=(v:number)=>program.spacing.automatic?program.lodScale*auto(v/program.lodScale):v*program.spacing.value
    x=axis(metric[0]);y=axis(metric[1])
  }
  x*=r.spacing;y*=r.spacing
  return {enabled:!(program.timing.enabled && program.timing.ignoreDistance),isotropic:x===y,x,y,
    angle:program.spacing.isotropic?0:r.rotation,
    flipped:program.spacing.isotropic?false:r.spacingMirror.horizontal!==r.spacingMirror.vertical}
}

/** One generic owner of compiled options, source query/cache and role scheduling.
 * Every yielded checkpoint is immutable and structured-cloneable, including a
 * partially consumed segment. Consumers may stop at any yield and resume/fork.
 * Query events are NOT render dabs. No RNG is evaluated by replay here.
 */
export class SourceStrokeAuthor {
  private readonly program: SourceStrokeAuthorProgram
  private readonly options: readonly Readonly<Record<SourceStampOptionId, SourceOptionProgram>>[]
  constructor(program: SourceStrokeAuthorProgram) {
    if(!program.id || program.roles.length<1 || program.roles.length>2 || program.roles[0].id!=='primary'
      || program.roles.length===2 && program.roles[1].id!=='mask') throw new RangeError('Invalid author source roles')
    this.program=freeze(structuredClone(program))
    this.options=this.program.roles.map(role=>{
      if(role.materialPolicy!=='png-fixed1-rng-free' || role.material.softness!==1 || role.material.lightness!==1
        || role.material.sharpnessChecked || !Number.isFinite(role.lodScale) || role.lodScale<=0
        || ![role.spacing.value,role.spacing.coefficient,role.spacingRefreshMs,role.timingRefreshMs].every(v=>Number.isFinite(v)&&v>=0)
        || !Number.isFinite(role.timing.rate) || role.timing.rate<=0
        || Object.keys(role.options).length!==IDS.length
        || !role.material.brushIdentity || !Number.isInteger(role.material.precisionLevel) || role.material.precisionLevel<1 || role.material.precisionLevel>5
        || [role.scatterX,role.scatterY,role.mirrorX,role.mirrorY,role.indirectPainting,role.spacing.automatic,role.spacing.isotropic,
          role.timing.enabled,role.timing.ignoreDistance,role.material.autoPrecision,role.material.imprecisePosition,role.material.disableSubpixel,
          role.material.supportsCaching,role.material.solidColor,role.material.textureEnabled].some(v=>typeof v!=='boolean')
        || role.fanStepDegrees!==undefined && (!Number.isInteger(role.fanStepDegrees)||role.fanStepDegrees<5||role.fanStepDegrees>90)) throw new RangeError('Unsupported source material/scheduling program')
      sourcePngCharacteristicSize(role.brush,{scale:1,ratio:1,rotation:0})
      return Object.fromEntries(IDS.map(id=>{
        const option=role.options[id]
        if(!option || option.id!==id)throw new RangeError('Missing source option program')
        return [id,compileSourceOptionProgram(option)]
      })) as unknown as Readonly<Record<SourceStampOptionId, SourceOptionProgram>>
    })
  }
  createState(sequentialSeed:number,perStrokeSeed:number,initialAngle:number):SourceStrokeAuthorState {
    if(!Number.isFinite(initialAngle))throw new RangeError('Invalid source initial angle')
    return freeze({version:1,programId:this.program.id,random:new KritaRandomSource(sequentialSeed).snapshot(),
      perStroke:new KritaPerStrokeRandomSource(perStrokeSeed).snapshot(),roles:[],initialAngle,inputOrdinal:0,eventOrdinal:0})
  }
  /** Validation precedes any restored RNG draw or mutation; input state is never modified. */
  *plan(state:SourceStrokeAuthorState,packet:SourceAuthorPacket):Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState> {
    this.validateState(state);validatePacket(packet)
    if(state.cursor)throw new RangeError('Pending source input must be resumed first')
    if(state.inputOrdinal===Number.MAX_SAFE_INTEGER)throw new RangeError('Source author input counter exhausted')
    if(state.lastInput && (packet.t<state.lastInput.t || packet.rotation!==state.lastInput.rotation
      || packet.hover!==state.lastInput.hover))throw new RangeError('Unsupported source packet clock/rotation/hover transition')
    const owned=structuredClone(state)
    const start=!owned.lastInput
    const roles=start?this.program.roles.map(()=>({distance:distanceState(new SourceDistanceTiming()),
      spacing:{enabled:true,isotropic:true,x:0,y:0,angle:0},cache:{nextSequence:0},sequence:0,totalDistance:0,maxPressure:0,
      lastPosition:{x:packet.x,y:packet.y},lastAngle:owned.initialAngle})):owned.roles
    const cursor:Cursor={kind:start?'start':'segment',endpoint:structuredClone(packet),roleIndex:0,
      current:owned.lastInput??structuredClone(packet),phase:start?'paint':'distance',requests:start?[{...packet,drawingAngle:owned.initialAngle}]:[]}
    return yield* this.run(freeze({...owned,roles,cursor}))
  }
  *resume(state:SourceStrokeAuthorState):Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState> {
    this.validateState(state)
    if(!state.cursor)throw new RangeError('No pending source input')
    return yield* this.run(freeze(structuredClone(state)))
  }
  private validateState(state:SourceStrokeAuthorState):void {
    const bad=():never=>{throw new RangeError('Invalid source author checkpoint')}
    const nonnegative=(v:number)=>Number.isFinite(v)&&v>=0
    const count=(v:number)=>Number.isSafeInteger(v)&&v>=0
    if(!state || state.version!==1 || state.programId!==this.program.id || !Array.isArray(state.roles)
      || !count(state.inputOrdinal) || !count(state.eventOrdinal) || !Number.isFinite(state.initialAngle))bad()
    const started=state.lastInput!==undefined||state.cursor!==undefined
    if(state.roles.length!==(started?this.program.roles.length:0))bad()
    if(state.lastInput!==undefined)validatePacket(state.lastInput)
    for(const [index,role] of state.roles.entries()){
      if(!role || !role.distance || !role.spacing || !role.cache || !role.lastPosition)bad()
      if(![role.distance.x,role.distance.y,role.distance.time,role.distance.spacingElapsed,role.distance.timingElapsed,
        role.spacing.x,role.spacing.y,role.totalDistance].every(nonnegative)
        || !Number.isFinite(role.spacing.angle) || ![role.spacing.enabled,role.spacing.isotropic].every(v=>typeof v==='boolean')
        || role.spacing.flipped!==undefined && typeof role.spacing.flipped!=='boolean'
        || !count(role.sequence) || role.sequence>0x7fffffff || !Number.isFinite(role.maxPressure) || role.maxPressure<0 || role.maxPressure>1
        || ![role.lastPosition.x,role.lastPosition.y,role.lastAngle].every(Number.isFinite)
        || role.lockedAngle!==undefined && !Number.isFinite(role.lockedAngle)
        || !count(role.cache.nextSequence) || role.cache.nextSequence>role.sequence)bad()
      // Native effectiveTiming may store positive Infinity; DistanceTiming clamps
      // it to LONG_TIME when consumed. NaN/negative intervals are never valid.
      if(role.interval!==undefined && (typeof role.interval!=='number'||Number.isNaN(role.interval)||role.interval<0))bad()
      if(role.lastPaint!==undefined){
        validatePacket(role.lastPaint)
        if(!Number.isFinite(role.lastPaint.drawingAngle) || role.lastPaint.angleOverride!==undefined && typeof role.lastPaint.angleOverride!=='boolean')bad()
      }
      if(role.cache.saved!==undefined){
        if(!role.cache.saved)bad()
        const saved=role.cache.saved,key=saved.key
        if(!saved.shape || !key || !saved.position || !saved.brush || !saved.mirror
          || !count(saved.sequence) || saved.sequence>=role.cache.nextSequence
          || saved.brushIdentity!==this.program.roles[index].material.brushIdentity
          || ![saved.width,saved.height,key.width,key.height].every(v=>Number.isSafeInteger(v)&&v>=1)
          || ![saved.shape.scale,saved.shape.ratio,key.subPixelX,key.subPixelY].every(nonnegative)
          || ![saved.shape.rotation,saved.position.x,saved.position.y,key.angle,key.softness,key.lightness,key.ratio].every(Number.isFinite)
          || !count(key.index) || typeof key.color!=='string'
          || ![saved.mirror.horizontal,saved.mirror.vertical,saved.mirror.coordinateSystemFlipped,key.mirrorH,key.mirrorV].every(v=>typeof v==='boolean'))bad()
        sourcePngCharacteristicSize(saved.brush,saved.shape)
      }else if(role.cache.nextSequence!==0)bad()
    }
    if(state.cursor!==undefined){
      if(!state.cursor)bad()
      const c=state.cursor
      if(!['start','segment'].includes(c.kind) || !['distance','paint','spacing','timing','nextRole'].includes(c.phase)
        || !Number.isInteger(c.roleIndex) || c.roleIndex<0 || c.roleIndex>=state.roles.length
        || !Array.isArray(c.requests) || c.requests.length>65 || (c.phase==='paint'?c.requests.length===0:c.requests.length!==0)
        || (c.kind==='segment')!==!!state.lastInput)bad()
      validatePacket(c.endpoint);validatePacket(c.current)
      if(state.lastInput && (c.endpoint.t<state.lastInput.t || c.endpoint.rotation!==state.lastInput.rotation || c.endpoint.hover!==state.lastInput.hover))bad()
      for(const request of c.requests){
        validatePacket(request)
        if(!Number.isFinite(request.drawingAngle) || request.angleOverride!==undefined && typeof request.angleOverride!=='boolean')bad()
      }
    }
    // These restores validate bounded snapshots; no authoritative sequential
    // draw is made. Keyed cache verification recomputes its deterministic values.
    if(!state.perStroke || !Array.isArray(state.perStroke.cache) || state.perStroke.cache.length>IDS.length)bad()
    for(const entry of state.perStroke.cache){
      if(!Array.isArray(entry) || entry.length!==2 || !IDS.some(id=>entry[0]===id+'FuzzyStroke'))bad()
    }
    KritaRandomSource.restore(state.random)
    KritaPerStrokeRandomSource.restore(state.perStroke)
  }
  private *run(initial:SourceStrokeAuthorState):Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState> {
    let state=initial
    while(state.cursor){
      const cursor=state.cursor,index=cursor.roleIndex,program=this.program.roles[index],role=state.roles[index]
      if(cursor.phase==='nextRole'){
        if(index+1===this.program.roles.length){
          state=freeze({...state,cursor:undefined,lastInput:cursor.endpoint,inputOrdinal:state.inputOrdinal+1})
          yield freeze({kind:'inputComplete',state});break
        }
        const next=state.roles[index+1]
        state=freeze({...state,cursor:{...cursor,roleIndex:index+1,current:state.lastInput??cursor.endpoint,
          phase:cursor.kind==='start'?'paint':'distance',requests:cursor.kind==='start'?[{...cursor.endpoint,drawingAngle:next.lastAngle}]:[]}})
        continue
      }
      const distance=Object.assign(new SourceDistanceTiming(),distanceState(role.distance))
      if(cursor.phase==='distance'){
        const factor=distance.next(cursor.current,cursor.endpoint,role.spacing,role.interval)
        const roles=[...state.roles];roles[index]={...role,distance:distanceState(distance)}
        if(factor<0){state=freeze({...state,roles,cursor:{...cursor,phase:'spacing'}});continue}
        const current=mix(cursor.current,cursor.endpoint,factor)
        const request={...current,drawingAngle:sourceDrawingDirection(role.lastPosition,current,role.lastAngle)}
        const requests:Request[]=[]
        if(role.lastPaint && program.fanStepDegrees!==undefined){
          const prior=role.lastPaint
          const old={...prior,angle:prior.drawingAngle,normalizedSpeed:prior.speed}
          const target={...request,angle:request.drawingAngle,normalizedSpeed:request.speed}
          const turn=shortestSourceTurn(old.angle,target.angle)
          sourceFanRequests(old,target,program.fanStepDegrees).forEach((fan,i)=>{
            const fraction=(program.fanStepDegrees!*Math.PI/180)*i/turn
            requests.push({...mix(prior,request,fraction),x:fan.x,y:fan.y,drawingAngle:fan.angle,angleOverride:true})
          })
        }
        requests.push(request)
        state=freeze({...state,roles,cursor:{...cursor,current,phase:'paint',requests}});continue
      }
      if(cursor.phase==='spacing' && distance.spacingElapsed<program.spacingRefreshMs){
        state=freeze({...state,cursor:{...cursor,phase:'timing'}});continue
      }
      if(cursor.phase==='timing' && distance.timingElapsed<program.timingRefreshMs){
        state=freeze({...state,cursor:{...cursor,phase:'nextRole'}});continue
      }
      const kind=cursor.phase==='paint'?'paint':cursor.phase==='spacing'?'spacing':'timing'
      const packet=kind==='paint'?cursor.requests[0]:cursor.endpoint
      const drawingAngle=kind==='paint' && cursor.requests[0].angleOverride
        ?cursor.requests[0].drawingAngle:sourceDrawingDirection(role.lastPosition,packet,role.lastAngle)
      const sensor={pressure:packet.pressure,maxPressure:Math.max(role.maxPressure,packet.pressure),tangentialPressure:packet.tangentialPressure,
        speed:packet.speed,drawingAngle,lockedDrawingAngle:role.lockedAngle??drawingAngle,rotation:packet.rotation,xTilt:packet.tiltX,yTilt:packet.tiltY,
        tiltDirectionOffset:packet.tiltDirectionOffset,perspective:packet.perspective,time:packet.t,dabSequence:role.sequence,distance:role.totalDistance,hover:packet.hover}
      if(state.eventOrdinal===Number.MAX_SAFE_INTEGER || kind==='paint' && role.sequence===0x7fffffff)throw new RangeError('Source author counter exhausted')
      const context={random:KritaRandomSource.restore(state.random),perStroke:KritaPerStrokeRandomSource.restore(state.perStroke),hover:packet.hover}
      const bound=Object.fromEntries(IDS.map(id=>[id,this.options[index][id].bind(sensor)])) as unknown as SourceStampOptions
      const result=new SourceStampQueryExecutor(bound,context).execute(kind,{x:packet.x,y:packet.y,drawingAngle,canvasRotation:packet.canvasRotation,
        mirroredH:packet.mirroredH,mirroredV:packet.mirroredV},{canPaint:true,lodScale:program.lodScale,scatterX:program.scatterX,scatterY:program.scatterY,
        mirrorX:program.mirrorX,mirrorY:program.mirrorY,indirectPainting:program.indirectPainting,
        sourceCache:{brush:program.brush,state:role.cache,request:program.material}})
      let nextRole:SourceAuthorRoleState={...role}
      let nextCursor:Cursor
      if(kind==='paint'){
        const dx=packet.x-role.lastPosition.x,dy=packet.y-role.lastPosition.y
        nextRole={...role,spacing:spacing(program,result),interval:program.timing.enabled?sourceTimingInterval(program.timing.rate,result.rate):undefined,
          cache:result.material?.state??role.cache,sequence:role.sequence+1,totalDistance:role.totalDistance+Math.sqrt(dx*dx+dy*dy)/program.lodScale,
          maxPressure:Math.max(role.maxPressure,packet.pressure),lastPosition:{x:packet.x,y:packet.y},lastAngle:drawingAngle,
          lockedAngle:packet.hover?role.lockedAngle:role.lockedAngle??drawingAngle,lastPaint:{...packet,drawingAngle}}
        const requests=cursor.requests.slice(1)
        nextCursor={...cursor,requests,phase:requests.length?'paint':cursor.kind==='start'?'nextRole':'distance'}
      }else if(kind==='spacing'){
        distance.updateSpacing();nextRole={...role,spacing:spacing(program,result),distance:distanceState(distance)}
        nextCursor={...cursor,phase:'timing'}
      }else{
        distance.updateTiming();nextRole={...role,interval:program.timing.enabled?sourceTimingInterval(program.timing.rate,result.rate):undefined,distance:distanceState(distance)}
        nextCursor={...cursor,phase:'nextRole'}
      }
      const roles=[...state.roles];roles[index]=nextRole
      state=freeze({...state,roles,cursor:nextCursor,random:context.random.snapshot(),perStroke:context.perStroke.snapshot(),eventOrdinal:state.eventOrdinal+1})
      yield freeze({kind:result.painted?'material':'query',role:program.id,query:kind,packet:{...packet},sourceAngle:drawingAngle,sourceTime:packet.t,logicalSequence:role.sequence,result,state})
    }
    return state
  }
}
