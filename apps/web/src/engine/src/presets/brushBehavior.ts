import {bristleStamps,type BristleState} from './brushBristle'
import {sketchStamps,type SketchState} from './brushSketch'
import { sprayStamps } from './brushSpray'
import {brushTipColorPlanes} from '@grafetto/shared'
import { brushRequestGeometry, placeBrushRequest } from './brushRequestGeometry'
import { brushExecutionContext, assertBrushExecutionContext, assertBrushSourceInputs, type BrushExecutionContext } from './brushExecutionContext'
import { KritaPerStrokeRandomSource, KritaRandomSource, type KritaRandomSnapshot } from './nativeRandom'
import type { BrushDescriptor, BrushDynamic, BrushDynamicTarget, Dab } from '@grafetto/shared'
import { brushDabRandom, brushDabSeed, brushStampsForDab, curveAt, type BrushStamp } from './digitalBrushPresets'
/** Logical gesture state: never derives randomness or dynamics from a frame/batch. */
export interface BrushBehaviorState {
  bristle?:BristleState
  sketch?:SketchState
  execution?: BrushExecutionContext
  /** Mutable source represented only by a cloneable value snapshot. */
  sequentialRandom?: KritaRandomSnapshot
  /** Plain bounded cache, copied with preview/savepoints; never a native RNG instance. */
  strokeRandomCache?: {seed:number;values:[string,number][]}
  pending?: BehaviorPlaced[]
  dabOrdinal?: number
  dabSequence?: number
  washOpacity?: {average:number;maximum:number}
  washColor?: [number,number,number]
  washVaryingPigment?: boolean
  seed: number
  charge: number
  distance: number
  firstAngle: number
  directionSet?: boolean
  opacity: number
  previous?: Dab
  /** Actual placed circle, cloned with scratch savepoints/prediction forks. */
  previousCoverageCircle?: { x: number; y: number; radius: number }
  bounds?: {minX:number;minY:number;maxX:number;maxY:number}
}

export interface BrushSpacingAxes { x:number; y:number; angle:number }
export function brushSpacingStep(axes:BrushSpacingAxes,pathAngle:number):number {
  const angle=pathAngle-axes.angle
  return 1/Math.hypot(Math.cos(angle)/axes.x,Math.sin(angle)/axes.y)
}
/** Common source spacing for the primary sampler and independent masks.
 * This observes pre-advance controls, then advances exactly one geometry dab. */
export function brushSourceSpacingAxes(brush:BrushDescriptor,input:Dab,state:BrushBehaviorState,profile:NonNullable<NonNullable<BrushDescriptor['behavior']>['spacing']>,sizeMultiplier:number,pathAngle:number,baseDiameter?:number):BrushSpacingAxes {
  if(brush.spray){const diameter=baseDiameter??input.size/Math.max(.000001,curveAt(brush.sizeByPressure,input.pressure));const step=Math.max(.5,diameter*brush.spacing);return{x:step,y:step,angle:0}}
  const {mode,coefficient,dynamics,isotropic,axisScale,angleOffset}=profile
  const seed=brushDabSeed(input.x,input.y,input.pressure)
  const factor=dynamics?.reduce((value,control,index)=>value*brushDynamicValue(control,{...input,angle:pathAngle},state,brushDabRandom(seed,0xa0000+index)),1) ?? 1
  // New request probes are pure: spacing never consumes placement draws or
  // advances the gesture's previous-point/animation state.
  const native = !!brush.behavior?.sequentialRandom
  const stamp=behaviorStampsForDab(brush,input,native ? structuredClone(state) : state,[0,0,0],{geometryOnly:native})[0]
  if (!stamp) return {x:.5,y:.5,angle:pathAngle}
  const diameter=native
    ? stamp.sourceDiameter!*(Math.abs(Math.cos(brush.tip.angle))+Math.abs(Math.sin(brush.tip.angle)))
    : stamp.size*sizeMultiplier/(1+stamp.edgeSoftness*.15)
  const axis=(value:number):number=>{
    const actual=Math.max(0,value)
    return Math.max(.5,coefficient*factor*(mode==='diameter' ? actual : actual<1 ? actual : Math.sqrt(actual)))
  }
  const x=axis(diameter*stamp.aspect*(axisScale?.x ?? 1)),y=axis(diameter*(axisScale?.y ?? 1))
  return isotropic ? {x:Math.max(x,y),y:Math.max(x,y),angle:0} : {x,y,angle:angleOffset === undefined ? stamp.angle : stamp.angle+angleOffset}
}
export interface SecondarySamplingState { previous?: Dab; remaining: number; geometry?:BrushBehaviorState; axes?:BrushSpacingAxes; direction?:number }
/** Resample the recorded centreline using the child's own source geometry.
 * The bounded segment loop and independent phase survive network chunks. */
export function secondaryBrushDabs(primary: BrushDescriptor, child: BrushDescriptor, dabs: readonly Dab[], state: SecondarySamplingState, sizePressure=true, endpoint?: Dab & {baseSize:number}, execution?: BrushExecutionContext): Dab[] {
  const result: Dab[] = []
  const baseSize=(d:Dab):number=>endpoint ? endpoint.baseSize : d.size/Math.max(.01,sizePressure?curveAt(primary.sizeByPressure,d.pressure):1)
  const size = (d:Dab):Dab=>({...d,opacity:child.opacity ?? 1,
    size:baseSize(d)*curveAt(child.sizeByPressure,sizePressure?d.pressure:1),
    aspectRatio:child.tip.aspect,angle:child.tip.rotation==='fixed'?child.tip.angle:d.angle})
  const spacing=(dab:Dab,pathAngle:number):number=>{
    const profile=child.behavior?.spacing ?? {mode:'diameter' as const,coefficient:child.spacing}
    const geometry=state.geometry ??= beginBrushBehavior(dab,execution)
    state.axes=brushSourceSpacingAxes({...child,scatter:undefined},dab,geometry,profile,1/Math.max(child.tip.aspect,1),pathAngle)
    return brushSpacingStep(state.axes,pathAngle)
  }
  for (const raw of endpoint ? [...dabs,endpoint] : dabs) {
    const dab=size(raw),previous=state.previous
    if(!previous){result.push(dab);state.remaining=spacing(dab,dab.angle);state.direction=dab.angle;state.previous={...raw};continue}
    const length=Math.hypot(dab.x-previous.x,dab.y-previous.y)
    if(!length){state.previous={...raw};continue}
    const direction=Math.atan2(dab.y-previous.y,dab.x-previous.x)
    if(state.axes && state.direction!==undefined)state.remaining*=brushSpacingStep(state.axes,direction)/brushSpacingStep(state.axes,state.direction)
    const stepFloor=Math.max(.5,length/256)
    let travel=state.remaining
    while(travel<=length){
      const t=travel/length,lerp=(a:number,b:number):number=>Math.fround(a+(b-a)*t)
      const pressure=lerp(previous.pressure,raw.pressure)
      const point:Dab={x:lerp(previous.x,raw.x),y:lerp(previous.y,raw.y),size:lerp(baseSize(previous),baseSize(raw))*curveAt(child.sizeByPressure,sizePressure?pressure:1),pressure,angle:child.tip.rotation==='fixed'?child.tip.angle:lerp(previous.angle,raw.angle),aspectRatio:child.tip.aspect,tiltX:lerp(previous.tiltX,dab.tiltX),tiltY:lerp(previous.tiltY,dab.tiltY),opacity:child.opacity ?? 1,t:lerp(previous.t,dab.t),...(previous.sourceTime===undefined||raw.sourceTime===undefined?{}:{sourceTime:(1-t)*previous.sourceTime+t*raw.sourceTime}),...(previous.normalizedSpeed!==undefined && raw.normalizedSpeed!==undefined ? {normalizedSpeed:Math.fround(lerp(previous.normalizedSpeed,raw.normalizedSpeed))} : {})}
      result.push(point);travel+=Math.max(stepFloor,spacing(point,direction))
    }
    state.remaining=travel-length;state.direction=direction;state.previous={...raw}
  }
  return result
}
export interface BehaviorStamp extends BrushStamp {
  group?:number
  segmentLength?:number
  /** Native source metric for sampling; not the continuous rendered diameter. */
  sourceDiameter?: number
  mask?: BrushDescriptor['tip']['mask']
  dualMask?: BrushDescriptor['tip']['mask']
  colorPlanes?: readonly [string,string,string]
  gray?: string
  dualGray?: string
  wetGrade: number
  edgeSoftness: number
  bleed: number
  opacityScale: number
  grainDepth: number
  sharpnessScale?: number
  dualSharpnessScale?: number
  flipX: number
  flipY: number
  color: [
    number,
    number,
    number
  ]
  distance: number
}
export interface BehaviorPlaced extends BehaviorStamp {
  radius: number
  flow: number
  ceiling: number
  washAverage?: number
  washFeedback?: boolean
  pressure: number
}
/** A bounded provisional tail, recalculated from fixed gesture distance. */
export function splitBrushTail(stamps: BehaviorPlaced[], distance: number, end: number, finish: boolean, size = 1, opacity = 1): {
  ready: BehaviorPlaced[]
  pending: BehaviorPlaced[]
  preview: BehaviorPlaced[]
} {
  if (end <= 0)
    return { ready: stamps, pending: [], preview: [] }
  const span = end * 10
  const taper = (s: BehaviorPlaced): BehaviorPlaced => {
    const t = Math.max(0, Math.min(1, (distance - s.distance) / span))
    return { ...s, radius: s.radius * (1 - size * (1 - t)), size: s.size * (1 - size * (1 - t)), ceiling: s.ceiling * (1 - opacity * (1 - t)) }
  }
  if (finish)
    return { ready: stamps.map(taper), pending: [], preview: [] }
  const boundary = Math.max(stamps.findIndex(s => s.distance > distance - span), stamps.length - 4096)
  const at = boundary < 0 ? stamps.length : boundary
  const ready = stamps.slice(0, at), pending = stamps.slice(at)
  return { ready, pending, preview: pending.map(taper) }
}
const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v))
export function beginBrushBehavior(dab: Dab, execution?: BrushExecutionContext): BrushBehaviorState {
  return { ...(execution ? {execution:brushExecutionContext(execution.brushRandom,execution.brushSource)} : {}), charge: 1, seed: brushDabSeed(dab.x, dab.y, dab.pressure), distance: 0, firstAngle: dab.angle, opacity: dab.opacity }
}
/** PointerEvent tilt axes describe slopes, not independent polar angles. */
function penTilt(dab:Dab): {angle:number;azimuth:number} {
  const x=Math.tan(dab.tiltX*Math.PI/180),y=Math.tan(dab.tiltY*Math.PI/180)
  return {angle:Math.atan(Math.hypot(x,y)),azimuth:Math.atan2(y,x)}
}
function keyedStrokeValue(key: string, state: BrushBehaviorState): number {
  const seeds=state.execution?.brushRandom
  if (!seeds) throw Error('Keyed brush source requires an explicit gesture context')
  const cache=state.strokeRandomCache?.seed===seeds.strokeSeed ? state.strokeRandomCache
    : (state.strokeRandomCache={seed:seeds.strokeSeed,values:[]})
  const known=cache.values.find(entry=>entry[0]===key)
  if(known)return known[1]
  const value=new KritaPerStrokeRandomSource(seeds.strokeSeed).generateNormalized(key)
  // Overflow recomputes a pure keyed value; this is a residency bound, not a
  // truncation of native controls or a mutable draw schedule.
  if(cache.values.length<64)cache.values.push([key,value])
  return value
}
export function brushDynamicValue(d: BrushDynamic | undefined, dab: Dab, state: BrushBehaviorState, random: number): number {
  if (!d)
    return 1
  if(d.control==='time' && (dab.sourceTime===undefined || !Number.isFinite(dab.sourceTime) || dab.sourceTime<0))throw Error('Missing or invalid sourceTime')
  const prev = state.previous
  const travel = prev ? Math.hypot(dab.x - prev.x, dab.y - prev.y) : 0
  const speed = prev ? travel / Math.max(1, dab.t - prev.t) : 0
  const turn = (a: number): number => ((a / (Math.PI * 2)) % 1 + 1) % 1
  const sensor = d.control === 'strokeRandom' ? d.randomSource ? keyedStrokeValue(d.randomSource.key,state) : brushDabRandom(state.seed,0xd0000+(d.randomStream ?? 0)) : d.control === 'random' ? clamp(random) : d.control === 'pressure' ? dab.pressure
    : d.control === 'tiltElevation' ? 1-clamp(penTilt(dab).angle/(Math.PI/2))
      : d.control === 'tiltX' ? clamp((dab.tiltX+90)/180)
      : d.control === 'tiltY' ? clamp((dab.tiltY+90)/180)
      : d.control === 'azimuth' ? turn(penTilt(dab).azimuth)
      // Raw tilt-axis direction is a separate input convention from the
      // physical slope azimuth. A vertical pen has a defined reference.
      : d.control === 'tiltDirection' ? (Math.PI + (dab.tiltX === 0 && dab.tiltY === 0 ? -Math.PI / 2 : Math.atan2(-dab.tiltX,dab.tiltY))) / (2 * Math.PI)
    : d.control === 'tilt' ? clamp(penTilt(dab).angle/(Math.PI/2))
      : d.control === 'speed' ? dab.normalizedSpeed ?? clamp(speed / 2)
        : d.control === 'time' ? d.periodic ? ((dab.sourceTime! % d.period!) / d.period!) : Math.min(dab.sourceTime!,d.period!)/d.period!
        : d.control === 'dabProgress' ? (d.periodic ? ((state.dabSequence ?? 0) % d.period!) / d.period! : clamp((state.dabSequence ?? 0) / d.period!))
        : d.control === 'fade' ? clamp(1 - state.distance / Math.max(0.001, d.fade ?? 1))
          : d.control === 'direction' ? turn(dab.angle)
            : d.control === 'initialDirection' ? turn(state.firstAngle) : 1
  const value = d.curve ? curveAt(d.curve, sensor) : sensor
  const controlled = d.strength === undefined ? value : d.strength >= 0 ? 1 - d.strength + d.strength * value : 1 + d.strength * value
  return clamp((d.minimum + (1 - d.minimum) * controlled) * (1 - d.jitter * random))
}
/** Native-style signed additive minus scaling angle, in physical radians.
 * Periodic wrap may be deferred to trig; this preserves the exact direction. */
export function brushRotationOffset(profile:NonNullable<NonNullable<BrushDescriptor['behavior']>['rotation']>['composition'],input:Dab,state:BrushBehaviorState):number {
  if(!profile)return 0
  const seed=brushDabSeed(input.x,input.y,input.pressure)
  const additive=profile.additive.reduce((sum,control,i)=>sum+2*brushDynamicValue(control,input,state,brushDabRandom(seed,0xe0000+i))-1,0)
  const scaling=profile.scaling?.length ? 2*profile.scaling.reduce((v,control,i)=>v*brushDynamicValue(control,input,state,brushDabRandom(seed,0xe0100+i)),1)-1 : 0
  return Math.PI*(-1+profile.strength*(additive-scaling))
}
/** RGB/HSV conversion on CPU, before rasterisation, shared by all participants. */
function shiftColor(rgb: [
  number,
  number,
  number
], hue: number, saturation: number, brightness: number): [
    number,
    number,
    number
  ] {
  const [r, g, b] = rgb, max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  let h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  h = ((h / 6 + hue) % 1 + 1) % 1
  const s = clamp((max === 0 ? 0 : delta / max) * saturation), v = clamp(max * brightness)
  const c = v * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = v - c
  const values = h < 1 / 6 ? [c, x, 0] : h < 2 / 6 ? [x, c, 0] : h < 3 / 6 ? [0, c, x] : h < 4 / 6 ? [0, x, c] : h < 5 / 6 ? [x, 0, c] : [c, 0, x]
  return [values[0] + m, values[1] + m, values[2] + m]
}
/** Signed HSV adjustment: positive value mixes towards white, negative
 * towards black; chroma is adjusted before value. Hue spans half a turn. */
export function hsvAdjustColor(rgb: [number,number,number], hue:number, saturation:number, value:number): [number,number,number] {
  const [r,g,b]=rgb,v=Math.max(r,g,b),minimum=Math.min(r,g,b),chroma=v-minimum
  const adjustedV=clamp(value>=0 ? v+value*(1-v) : v*(1+value))
  if(chroma<=1e-9 || v<=1e-9) return [adjustedV,adjustedV,adjustedV]
  let h=v===r ? ((g-b)/chroma)%6 : v===g ? (b-r)/chroma+2 : (r-g)/chroma+4
  h=((h+hue*3)%6+6)%6
  const saturationScale=saturation>0 ? 1+saturation+2*saturation*saturation : 1+saturation
  const c=Math.min(adjustedV,Math.min(1,chroma*saturationScale)*(1-Math.abs(value)))
  const x=c*(1-Math.abs(h%2-1)),m=adjustedV-c
  const sector=h<1 ? [c,x,0] : h<2 ? [x,c,0] : h<3 ? [0,c,x] : h<4 ? [0,x,c] : h<5 ? [x,0,c] : [c,0,x]
  return [sector[0]+m,sector[1]+m,sector[2]+m]
}
/** Frame choice is one logical-dab event, independent of scatter and batches.
 * Dedicated random stream leaves every existing brush jitter salt unchanged. */
export function brushAnimationIndex(tip: BrushDescriptor['tip'], seed: number, ordinal: number, stream = 0): number | undefined {
  const animation=tip.animation
  if(!animation) return undefined
  return animation.mode==='incremental' ? ordinal%animation.frames.length
    : Math.min(animation.frames.length-1,Math.floor(brushDabRandom(seed,0x40000+stream*0x10000+ordinal)*animation.frames.length))
}
export function brushAnimationFrame(tip: BrushDescriptor['tip'], seed: number, ordinal: number, stream = 0): BrushDescriptor['tip']['mask'] {
  const index=brushAnimationIndex(tip,seed,ordinal,stream)
  return index===undefined ? undefined : tip.animation!.frames[index]
}
export function advanceBrushAnimation(brush: BrushDescriptor, state: BrushBehaviorState): number {
  const ordinal = state.dabOrdinal ?? 0
  if (brush.tip.animation || brush.behavior?.dual?.brush.tip.animation) state.dabOrdinal = ordinal + 1
  return ordinal
}
export function behaviorStampsForDab(brush: BrushDescriptor, dab: Dab, state: BrushBehaviorState, color: [
  number,
  number,
  number
], options: {geometryOnly?:boolean} = {}): BehaviorStamp[] {
  const behavior = brush.behavior
  const native=!!behavior?.sequentialRandom
  if(native || behavior?.strokeInput) {
    assertBrushExecutionContext(brush,state.execution)
    assertBrushSourceInputs(brush,[dab])
  }
  const ordinal = advanceBrushAnimation(brush, state)
  const index=brushAnimationIndex(brush.tip,state.seed,ordinal)
  const dualIndex=behavior?.dual ? brushAnimationIndex(behavior.dual.brush.tip,state.seed,ordinal,1) : undefined
  const mask=index===undefined ? undefined : brush.tip.animation!.frames[index]
  const dualMask=dualIndex===undefined ? undefined : behavior!.dual!.brush.tip.animation!.frames[dualIndex]
  const colorPlanes=brushTipColorPlanes(brush.tip,index)
  const gray=(index===undefined ? undefined : brush.tip.material?.grayFrames?.[index]) ?? brush.tip.material?.gray
  const dualGray=(dualIndex===undefined ? undefined : behavior?.dual?.brush.tip.material?.grayFrames?.[dualIndex]) ?? behavior?.dual?.brush.tip.material?.gray
  const prev = state.previous
  if (prev)
    state.distance += Math.hypot(dab.x - prev.x, dab.y - prev.y) / Math.max(0.5, (dab.size + prev.size) * 0.5)
  const direction = behavior?.strokeInput ? dab.sourceAngle! : prev && (prev.x !== dab.x || prev.y !== dab.y) ? Math.atan2(dab.y - prev.y, dab.x - prev.x) : dab.angle
  if (!behavior?.strokeInput && prev && !state.directionSet && (prev.x !== dab.x || prev.y !== dab.y)) {
    state.firstAngle = direction
    state.directionSet = true
  }
  if(behavior?.strokeInput && !prev)state.firstAngle=direction
  const directionalDab = { ...dab, angle: direction }
  const seed = brushDabSeed(dab.x, dab.y, dab.pressure)
  const rand = (i: number): number => brushDabRandom(seed, i)
  const dynamic = (target: BrushDynamicTarget, i: number, source = behavior): number => brushDynamicValue(source?.dynamics?.[target], directionalDab, state, rand(i)) * (source?.modulations?.[target] ?? []).reduce((factor, control, index) => factor * brushDynamicValue(control, directionalDab, state, rand(i + 67 + index)), 1)
  const rotation = behavior?.rotation
  const randomRotation = rotation?.random === 'stroke' ? brushDabRandom(state.seed, 9) : rand(9)
  const countScale = dynamic('count', 10) * (1 - (behavior?.scatter?.countJitter ?? 0) * rand(11))
  const count = Math.max(1, Math.round((brush.scatter?.count ?? 1) * countScale))
  const scatter = brush.scatter ? { ...brush.scatter, count, radius: brush.scatter.radius * dynamic('scatter', 12) } : undefined
  const configured = native ? {...brush,scatter:undefined} : scatter ? { ...brush, scatter } : brush
  const pen=penTilt(dab),tilt=Math.min(1.5,pen.angle)
  const penAngle = tilt > 0.001 ? pen.azimuth : direction
  const rotationAngle = rotation ? brush.tip.angle + (rotation.azimuth ? penAngle : direction * rotation.follow) + (rotation.random === 'none' ? 0 : randomRotation * Math.PI * 2) : dab.angle
  const angleDynamic = behavior?.dynamics?.angle
  const angle = rotationAngle + brushRotationOffset(rotation?.composition,directionalDab,state) + (angleDynamic ? angleDynamic.control === 'off' ? (rand(13) - 0.5) * 2 * Math.PI * angleDynamic.jitter : (dynamic('angle', 13) - 1) * Math.PI * 2 : 0)
  let taper = 1
  const t = behavior?.taper
  if (t && t.start > 0)
    taper = clamp(state.distance / Math.max(0.001, t.start * 10))
  // The end taper is supplied by the painter at logical finish, independent of batches.
  if (t?.pressure && t.end > 0)
    taper *= clamp(dab.pressure / Math.max(0.001, t.end))
  const edge=behavior?.edgeBleed
  const edgeControl=(amount:number,value:number):number=>Math.abs(amount)*(amount<0 ? 1-value : value)
  const bleed=edge ? clamp(edgeControl(edge.pressure,edge.pressureCurve?curveAt(edge.pressureCurve,dab.pressure):dab.pressure)+edgeControl(edge.tilt,clamp(tilt/(Math.PI/2)))) : 0
  const wetGrade=(behavior?.wetMix?.dynamics?.grade??[]).reduce((value,control,i)=>value*brushDynamicValue(control,directionalDab,state,rand(100+i)),behavior?.wetMix?.grade??0)
  const edgeSoftness=1-(1-bleed)*(1-(behavior?.rendering?.wetEdges ?? 0)*.5)
  const sizeScale = dynamic('size', 14) * (t ? 1 - t.size * (1 - taper) : 1)
  let sourceDiameter: number | undefined
  let nativePosition: {x:number;y:number} | undefined
  if(native) {
    const geometry=brushRequestGeometry(dab.sourceSize!,dab.sourceScale!*sizeScale,angle)
    sourceDiameter=geometry.width
    if(!geometry.admitted) {
      state.previous={...dab}
      return []
    }
    if(!options.geometryOnly) {
      const snapshot=state.sequentialRandom ?? new KritaRandomSource(state.execution!.brushRandom!.sequentialSeed).snapshot()
      const placed=placeBrushRequest(geometry,dab.x,dab.y,scatter?.radius ?? 0,snapshot)
      state.sequentialRandom=placed.snapshot
      nativePosition=placed
    }
  }
  const opacityScale = dynamic('opacity', 15) * (t ? 1 - t.opacity * (1 - taper) : 1)
  const adjustment=behavior?.colorAdjustment
  const adjustedColor=adjustment ? hsvAdjustColor(color,...(['hue','saturation','value'] as const).map((key,i)=>adjustment[key] ? 2*brushDynamicValue(adjustment[key],directionalDab,state,rand(0xc0000+i))-1 : 0) as [number,number,number]) : color
  if(brush.bristle){
    const bristle=state.bristle??={ordinal:0,oldPressure:1,ends:[]}
    const stamps=bristleStamps(brush,{...dab,angle,size:dab.size*sizeScale},bristle,adjustedColor,state.seed)
    state.previous={...dab};state.dabSequence=(state.dabSequence??0)+1
    return stamps.map(stamp=>({...stamp,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}))
  }
  if(brush.sketch){
    const sketch=state.sketch??={points:[],cells:new Map(),ordinal:0,color:[...adjustedColor],alpha:1}
    const factor=(key:'width'|'offset'|'probability',salt:number)=>(brush.sketch!.dynamics?.[key]??[]).reduce((v,c,i)=>v*brushDynamicValue(c,directionalDab,state,rand(salt+i)),1)
    const stamps=sketchStamps(brush,{...dab,size:dab.size*sizeScale},sketch,adjustedColor,state.seed,{width:factor('width',0xf1000),offset:factor('offset',0xf2000),probability:factor('probability',0xf3000)},1)
    state.previous={...dab};state.dabSequence=(state.dabSequence??0)+1
    return stamps.map(stamp=>({...stamp,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}))
  }
  const bases = brush.spray ? sprayStamps(brush,{...dab,angle,size:dab.size*sizeScale},state.seed,state.dabSequence??0,direction) : brushStampsForDab(configured, { ...dab, angle, size: dab.size * sizeScale })
  const out = bases.map((stamp, i): BehaviorStamp => {
    let x = stamp.x, y = stamp.y
    const placement=behavior?.scatter?.placement
    if(native) {
      x=nativePosition?.x ?? dab.x; y=nativePosition?.y ?? dab.y
    } else if(placement) {
      // Explicit axis scatter is uniform in its native interval/square. The
      // diameter is the configured pre-scatter size, not jittered tip size.
      const extent=dab.size*sizeScale*(scatter?.radius ?? 0)
      const along=(brushDabRandom(seed,0x90000+i*2)*2-1)*extent
      const across=(brushDabRandom(seed,0x90001+i*2)*2-1)*extent
      if(placement==='xyUniform') {x=dab.x+along;y=dab.y+across}
      else {
        const axis=direction+(placement==='normalUniform' ? Math.PI/2 : 0)
        x=dab.x+Math.cos(axis)*along
        y=dab.y+Math.sin(axis)*along
      }
    } else if (behavior?.scatter && !behavior.scatter.bothAxes) {
      const offset = (stamp.x - dab.x) * Math.cos(angle) + (stamp.y - dab.y) * Math.sin(angle)
      x = dab.x - Math.sin(angle) * offset
      y = dab.y + Math.cos(angle) * offset
    }
    const roundness = Math.max(0.02, dynamic('roundness', 20 + i * 8) * (1 - (behavior?.scatter?.roundnessJitter ?? 0) * rand(21 + i * 8)))
    const spray=brush.spray?.color
    const spraySeed=(state.seed^Math.imul((state.dabSequence??0)+1,0x9e3779b9))>>>0
    const colorIndex=spray?.perParticle?i:0
    const sprayColor=spray ? hsvAdjustColor(adjustedColor,spray.hue*brushDabRandom(spraySeed,16+colorIndex*16+4),spray.saturation*brushDabRandom(spraySeed,16+colorIndex*16+5),spray.value*brushDabRandom(spraySeed,16+colorIndex*16+6)) : adjustedColor
    const hasColor = behavior?.dynamics?.hue || behavior?.dynamics?.saturation || behavior?.dynamics?.brightness
    return {
      ...stamp, ...(colorPlanes ? {colorPlanes} : {}), ...(sourceDiameter===undefined ? {} : {sourceDiameter}), ...(gray ? {gray} : {}), ...(dualGray ? {dualGray} : {}), ...(mask ? { mask } : {}), ...(dualMask ? { dualMask } : {}), x, y, bleed, wetGrade, edgeSoftness, size:stamp.size*roundness*(1+edgeSoftness*.15), aspect: clamp(stamp.aspect / roundness / (rotation?.projection ? Math.max(0.1, Math.cos(tilt)) : 1), 0.05, 20),
      flowScale: stamp.flowScale * curveAt(brush.flowByPressure, dab.pressure) * dynamic('flow', 22 + i * 8) * Math.exp(-state.distance*(behavior?.falloff??0)*4),
      opacityScale, grainDepth: dynamic('grainDepth', 23 + i * 8),
      ...(behavior?.dynamics?.sharpness || behavior?.modulations?.sharpness?.length
        ? { sharpnessScale: dynamic('sharpness', 4096 + i * 8) } : {}),
      ...(behavior?.dual?.sampling !== 'independent' && (behavior?.dual?.brush.behavior?.dynamics?.sharpness || behavior?.dual?.brush.behavior?.modulations?.sharpness?.length)
        ? { dualSharpnessScale: dynamic('sharpness', 8192 + i * 8, behavior.dual.brush.behavior) } : {}),
      flipX: rotation?.flipX && rand(24 + i * 8) < 0.5 ? -1 : 1,
      flipY: rotation?.flipY && rand(25 + i * 8) < 0.5 ? -1 : 1,
      color: hasColor ? shiftColor(sprayColor, behavior.dynamics?.hue ? dynamic('hue', 26 + i * 8) : 0, dynamic('saturation', 27 + i * 8), dynamic('brightness', 28 + i * 8)) : sprayColor,
      distance: state.distance,
    }
  })
  state.previous = { ...dab }
  state.dabSequence = (state.dabSequence ?? 0) + 1
  return out
}
