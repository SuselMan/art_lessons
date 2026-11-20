import{tangentConstructorIsPoint195}from'./tangentConstructor195'
import{usesNativeFilterMask,usesNativeSketchSpray,usesNativeSmudgeFeatures}from'./nativeBrushFeatures'
import { independentChildFan190Requests, type IndependentChildFan190State } from '../input/independentChildFan190'
import { mask190Role } from './independentMask190'
import{assertRecordedPen188Values,recordedPen188Carrier}from './recordedPen188'
import{EMPTY_RECORDED_PEN_INPUT,hasRecordedPenInput,interpolatePenInput}from'@grafetto/shared'
import{hasSketchGih174Scope,hasSketchPressureGih181Scope,hasSketchAngularGih182Scope}from'@grafetto/shared'
import{sourceDrawingDirection}from'../input/kritaStrokeInput'
import{hasOriginalRgbaGih119Scope,hasEqualOriginalRgbaGih121Scope,hasEqualLightnessGih123Scope,hasEqualGradientGih125Scope,hasUnequalGradientGih126Scope,hasUnequalLightnessGih124Scope}from'@grafetto/shared'
import{assertSketchDistanceOpacityPolicy,prepareSketchMask,type SketchMaskView}from'./sketchMask'
import {sourceTimeRandomValue} from './sourceTimeRandom'
import {autoMaskNoiseKey} from '../raster/autoMaskNoise'
import{brushUsesDistanceControl,brushAnimationUsesMode,gihTiltIndex,isIndependentDrawingAnglePair}from'@grafetto/shared'
import type{DeformState}from'./brushDeform'
import{experimentStamps,type ExperimentState,type PolygonGeometry}from'./brushExperiment'
import{particleStamps,type ParticleState}from'./brushParticle'
import{hatchingPlacement,type HatchingPlacement}from'./brushHatching'
import {curveTraceStamps,type CurveTraceState}from'./brushCurveTrace'
import {bristleGeometryStamps,bristleStamps,type BristleState} from './brushBristle'
import {sketchStamps,type SketchState} from './brushSketch'
import { sprayStamps,sprayRequestGeometry } from './brushSpray'
import{brushTipColorPlanes}from'@grafetto/shared'
import { brushRequestGeometry, placeBrushRequest } from './brushRequestGeometry'
import { brushExecutionContext, assertBrushExecutionContext, assertBrushSourceInputs, type BrushExecutionContext } from './brushExecutionContext'
import { KritaPerStrokeRandomSource, KritaRandomSource, type KritaRandomSnapshot } from './nativeRandom'
import type { BrushDescriptor, BrushDynamic, BrushDynamicTarget, Dab } from '@grafetto/shared'
import { brushDabRandom, brushDabSeed, brushStampsForDab, curveAt, type BrushStamp } from './digitalBrushPresets'
/** Logical gesture state: never derives randomness or dynamics from a frame/batch. */
export interface BrushBehaviorState {
  maxPressure?:number
  sprayPainterOpacity?:number
  deform?:DeformState
  experiment?:ExperimentState
  particle?:ParticleState
  curveTrace?:CurveTraceState
  bristle?:BristleState
  sketch?:SketchState
  execution?: BrushExecutionContext
  /** Mutable source represented only by a cloneable value snapshot. */
  sequentialRandom?: KritaRandomSnapshot
  /** Plain bounded cache, copied with preview/savepoints; never a native RNG instance. */
  strokeRandomCache?: {seed:number;values:[string,number][]}
  pending?: BehaviorPlaced[]
  /** Angular movement history includes rejected logical requests, independently of painted geometry. */
  angularCursor?: {x:number;y:number}
  angularPreviousSize?: number
  dabOrdinal?: number
  dabSequence?: number
  /** Native generic point counter; history/RNG/animation ordinals stay separate. */
  genericDabSequence195?:number
  washOpacity?: {average:number;maximum:number}
  washColor?: [number,number,number]
  washVaryingPigment?: boolean
  seed: number
  charge: number
  distance: number
  worldDistance?:number
  worldDistancePoint?:{x:number;y:number}
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
export function brushSourceSpacingAxes(brush:BrushDescriptor,input:Dab,state:BrushBehaviorState,profile:NonNullable<NonNullable<BrushDescriptor['behavior']>['spacing']>,sizeMultiplier:number,pathAngle:number,baseDiameter?:number,commitGeometry=false):BrushSpacingAxes {
  if(brush.version===188||brush.version===190||brush.version===191||usesNativeFilterMask(brush)||usesNativeSmudgeFeatures(brush)||usesNativeSketchSpray(brush)||brush.version===195)assertRecordedPen188Values(input)
  if(brush.deform){const diameter=baseDiameter??input.size/Math.max(.000001,curveAt(brush.sizeByPressure,input.pressure));const step=Math.max(.5,diameter*profile.coefficient);return{x:step,y:step,angle:0}}
  if(brush.spray){const diameter=baseDiameter??input.size/Math.max(.000001,curveAt(brush.sizeByPressure,input.pressure));const step=Math.max(.5,diameter*brush.spacing);return{x:step,y:step,angle:0}}
  const {mode,coefficient,dynamics,isotropic,axisScale,angleOffset}=profile
  const seed=brushDabSeed(input.x,input.y,input.pressure)
  const factor=dynamics?.reduce((value,control,index)=>value*brushDynamicValue(control,{...input,angle:pathAngle},state,brushDabRandom(seed,0xa0000+index)),1) ?? 1
  // New request probes are pure: spacing never consumes placement draws or
  // advances the gesture's previous-point/animation state.
  const native = !!brush.behavior?.sequentialRandom
  const stamp=behaviorStampsForDab(brush,input,native && !commitGeometry ? structuredClone(state) : state,[0,0,0],{geometryOnly:native})[0]
  if (!stamp) return {x:.5,y:.5,angle:pathAngle}
  const diameter=native
    ? stamp.sourceDiameter!*(Math.abs(Math.cos(brush.tip.angle))+Math.abs(Math.sin(brush.tip.angle)))
    : stamp.size*sizeMultiplier/(1+stamp.edgeSoftness*.15)
  const axis=(value:number):number=>{
    const actual=Math.max(0,value)
    return Math.max(.5,coefficient*factor*(mode==='diameter' ? actual : actual<1 ? actual : Math.sqrt(actual)))
  }
  const x=axis(diameter*stamp.aspect*(axisScale?.x ?? 1)),y=axis(diameter*(brush.tip.autoShape?stamp.aspect:1)*(axisScale?.y ?? 1))
  return isotropic ? {x:Math.max(x,y),y:Math.max(x,y),angle:0} : {x,y,angle:angleOffset === undefined ? stamp.angle : stamp.angle+angleOffset}
}
export interface SecondarySamplingState { childFan?:IndependentChildFan190State; childFanPrevious?:{dab:Dab;baseDiameter:number}; sourceCursor?:{x:number;y:number;angle:number}; previous?: Dab; remaining: number; geometry?:BrushBehaviorState; axes?:BrushSpacingAxes; direction?:number }
/** Resample the recorded centreline using the child's own source geometry.
 * The bounded segment loop and independent phase survive network chunks. */
export function secondaryBrushDabs(primary: BrushDescriptor, child: BrushDescriptor, dabs: readonly Dab[], state: SecondarySamplingState, sizePressure=true, endpoint?: Dab & {baseSize:number}, execution?: BrushExecutionContext): Dab[] {
  const nativeMask=(primary.version===190||primary.version===191||primary.version===195)&&execution?.maskRole190?.rootId===primary.id
  const sourceAware=child.behavior?.strokeInput!==undefined
  if(sourceAware&&!(nativeMask&&execution?.maskRole190?.rootId===primary.id)&&!isIndependentDrawingAnglePair(primary))throw Error('Independent DrawingAngle requires matching120 root/child policies')
  if(sourceAware)assertBrushSourceInputs(primary,dabs,endpoint,nativeMask&&execution?.maskRole190?{...execution,maskRole190:{...execution.maskRole190,role:'primary'}}:execution)
  const capture=sourceAware?((dab:Dab):void=>{
    const previous=state.sourceCursor
    const angle=previous?sourceDrawingDirection(previous,dab,previous.angle):dab.sourceAngle
    if(angle===undefined||!Number.isFinite(angle))throw Error('Missing independent DrawingAngle seed')
    dab.sourceAngle=angle
    state.sourceCursor={x:dab.x,y:dab.y,angle}
  }):undefined
  const result: Dab[] = []
  const resourceSize=nativeMask&&primary.behavior?.dual?.sizePolicy?.kind==='resource'?primary.behavior.dual.sizePolicy.diameter:undefined
  const baseSize=(d:Dab):number=>resourceSize??(nativeMask?d.sourceSize!:(endpoint ? endpoint.baseSize : d.size/Math.max(.01,sizePressure?curveAt(primary.sizeByPressure,d.pressure):1)))
  const size = (d:Dab):Dab=>({...d,...(nativeMask?{sourceSize:Math.fround(baseSize(d)),sourceScale:Math.fround(curveAt(child.sizeByPressure,sizePressure?d.pressure:1))}:{}),opacity:child.opacity ?? 1,
    size:baseSize(d)*curveAt(child.sizeByPressure,sizePressure?d.pressure:1),
    aspectRatio:child.tip.aspect,angle:child.tip.rotation==='fixed'?child.tip.angle:d.angle})
  const spacing=(dab:Dab,pathAngle:number):number=>{
    const profile=child.behavior?.spacing ?? {mode:'diameter' as const,coefficient:child.spacing}
    const geometry=state.geometry ??= beginBrushBehavior(dab,execution)
    state.axes=brushSourceSpacingAxes({...child,scatter:undefined},dab,geometry,profile,1/Math.max(child.tip.aspect,1),pathAngle,undefined,nativeMask)
    return brushSpacingStep(state.axes,pathAngle)
  }
  const emit=(point:Dab,baseDiameter:number):number=>{
    if(!nativeMask){capture?.(point);result.push(point);return spacing(point,point.angle)}
    const previous=state.childFanPrevious
    const requests=independentChildFan190Requests(state.childFan??={}, {...point,angle:point.sourceAngle??point.angle},child.behavior?.strokeInput?.fanCorners?.stepDegrees)
    let finalSpacing=.5
    for(const request of requests){
      const info=request.information,fraction=request.fraction
      const projectedBase=previous?previous.baseDiameter+fraction*(baseDiameter-previous.baseDiameter):baseDiameter
      const placed:Dab={...point,...info,angle:child.tip.rotation==='fixed'?child.tip.angle:previous?previous.dab.angle+fraction*(point.angle-previous.dab.angle):point.angle,sourceAngle:info.angle,sourceSize:Math.fround(projectedBase),sourceScale:Math.fround(curveAt(child.sizeByPressure,sizePressure?info.pressure:1)),size:projectedBase*curveAt(child.sizeByPressure,sizePressure?info.pressure:1),...(previous?.dab.sourceTime===undefined||point.sourceTime===undefined?{}:{sourceTime:previous.dab.sourceTime+fraction*(point.sourceTime-previous.dab.sourceTime)})}
      result.push(placed);finalSpacing=spacing(placed,info.angle)
    }
    state.sourceCursor={x:point.x,y:point.y,angle:state.childFan!.previous!.angle}
    state.childFanPrevious={dab:{...point},baseDiameter}
    return finalSpacing
  }
  for (const raw of endpoint ? [...dabs,endpoint] : dabs) {
    const dab=size(raw),previous=state.previous
    if(!previous){state.remaining=emit(dab,baseSize(raw));state.direction=dab.angle;state.previous={...raw};continue}
    const length=Math.hypot(dab.x-previous.x,dab.y-previous.y)
    if(!length){if(primary.version===195&&raw.sourceTime!==previous.sourceTime)emit(dab,baseSize(raw));state.previous={...raw};continue}
    const direction=Math.atan2(dab.y-previous.y,dab.x-previous.x)
    if(state.axes && state.direction!==undefined)state.remaining*=brushSpacingStep(state.axes,direction)/brushSpacingStep(state.axes,state.direction)
    const stepFloor=Math.max(.5,length/256)
    let travel=state.remaining
    while(travel<=length){
      const t=travel/length,lerp=(a:number,b:number):number=>Math.fround(a+(b-a)*t)
      const pressure=lerp(previous.pressure,raw.pressure)
      const point:Dab={...(nativeMask?{sourceSize:Math.fround(lerp(baseSize(previous),baseSize(raw))),sourceScale:Math.fround(curveAt(child.sizeByPressure,sizePressure?pressure:1))}:{}),...(hasRecordedPenInput(previous)||hasRecordedPenInput(raw)?interpolatePenInput(previous,raw,t):EMPTY_RECORDED_PEN_INPUT),x:lerp(previous.x,raw.x),y:lerp(previous.y,raw.y),size:lerp(baseSize(previous),baseSize(raw))*curveAt(child.sizeByPressure,sizePressure?pressure:1),pressure,angle:child.tip.rotation==='fixed'?child.tip.angle:lerp(previous.angle,raw.angle),aspectRatio:child.tip.aspect,tiltX:lerp(previous.tiltX,dab.tiltX),tiltY:lerp(previous.tiltY,dab.tiltY),opacity:child.opacity ?? 1,t:lerp(previous.t,dab.t),...(previous.sourceTime===undefined||raw.sourceTime===undefined?{}:{sourceTime:(1-t)*previous.sourceTime+t*raw.sourceTime}),...(previous.normalizedSpeed!==undefined && raw.normalizedSpeed!==undefined ? {normalizedSpeed:Math.fround(lerp(previous.normalizedSpeed,raw.normalizedSpeed))} : {})}
      travel+=Math.max(stepFloor,nativeMask?emit(point,lerp(baseSize(previous),baseSize(raw))):(()=>{capture?.(point);result.push(point);return spacing(point,direction)})())
    }
    state.remaining=travel-length;state.direction=direction;state.previous={...raw}
  }
  return result
}
export interface BehaviorStamp extends BrushStamp {
  sprayImageHsv?:readonly[number,number,number]
  polygon?:PolygonGeometry
  hatching?:HatchingPlacement
  requestGroup?:number
  pathOpacity?:number
  group?:number
  segmentLength?:number
  /** Native source metric for sampling; not the continuous rendered diameter. */
  sourceDiameter?: number
  mask?: BrushDescriptor['tip']['mask']
  dualMask?: BrushDescriptor['tip']['mask']
  frameIndex?:number
  frameCoordinateFlip?:boolean
  colorPlanes?: readonly [string,string,string]
  gray?: string
  dualGray?: string
  wetGrade: number
  edgeSoftness: number
  bleed: number
  opacityScale: number
  grainDepth: number
  /** Effective RGB lightness transfer only; never opacity or mask coverage. */
  lightnessStrength?: number
  dualLightnessStrength?: number
  softnessScale?: number
  dualSoftnessScale?: number
  autoNoiseKey?:number
  dualFlipX?:number
  dualFlipY?:number
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
  return { ...(execution ? {execution:brushExecutionContext(execution.brushRandom,execution.brushSource,execution.maskRole190)} : {}), charge: 1, seed: brushDabSeed(dab.x, dab.y, dab.pressure), distance: 0, firstAngle: dab.angle, opacity: dab.opacity }
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
/** Pure before/after admission: all option consumers see the same current
 * centreline length, regardless of which one evaluates before the stamp. */
function worldDistanceForDab(dab:Dab,state:BrushBehaviorState):number {
  const p=state.worldDistancePoint
  return (state.worldDistance??0)+(p?Math.hypot(dab.x-p.x,dab.y-p.y):0)
}
export function brushDynamicValue(d: BrushDynamic | undefined, dab: Dab, state: BrushBehaviorState, random: number,absolutePolicy?:'native-size-absolute187-v1'): number {
  if (!d)
    return 1
  if(d.control==='random'&&d.randomSource?.kind==='grafettoSourceTime-v1')random=sourceTimeRandomValue(d.randomSource,state.execution?.brushRandom?.strokeSeed,dab.sourceTime)
  if(d.control==='time' && (dab.sourceTime===undefined || !Number.isFinite(dab.sourceTime) || dab.sourceTime<0))throw Error('Missing or invalid sourceTime')
  if(d.combine){
    const c=d.combine,seed=Math.floor(clamp(random)*4294967295)>>>0
    const values=c.scaling.map((control,i)=>brushDynamicValue(control,dab,state,brushDabRandom(seed,0x51000+i),absolutePolicy))
    const scaling=!values.length?1:values.length===1?values[0]:c.mode==='sum'?values.reduce((a,b)=>a+b,0):c.mode==='max'?Math.max(...values):c.mode==='min'?Math.min(...values):c.mode==='difference'?Math.max(...values)-Math.min(...values):values.reduce((a,b)=>a*b,1)
    const additive=c.additive.length ? .5*(1+c.additive.reduce((sum,control,i)=>sum+2*brushDynamicValue(control,dab,state,brushDabRandom(seed,0x52000+i),absolutePolicy)-1,0)):1
    // Callers already multiply the option constant. Return its normalized
    // factor, allowing >1 when needed: .5 * (clamp(.5 * 1.5)/.5) = .75.
    const constant=c.constant??1,a=c.absolute
    const direction=(a?.locked?state.firstAngle:dab.sourceAngle??dab.angle)/(2*Math.PI)+(a?.angleOffset??0)/360
    const identity187=absolutePolicy==='native-size-absolute187-v1'&&a&&Array.isArray(a.curve)&&a.curve.length===2&&a.curve[0][0]===0&&a.curve[0][1]===0&&a.curve[1][0]===1&&a.curve[1][1]===1
    const rawAbsolute=.5+direction
    const absolute=identity187?(rawAbsolute>1?rawAbsolute-1:rawAbsolute):a?((curveAt(a.curve,((direction%1)+1)%1)+.5)%1):1
    return constant===0?0:(c.policy==='native-scatter-v1'?Math.max(0,Math.min(5,constant*absolute*scaling*additive)):clamp(constant*absolute*scaling*additive))/constant
  }
  const prev = state.previous
  const travel = prev ? Math.hypot(dab.x - prev.x, dab.y - prev.y) : 0
  const speed = prev ? travel / Math.max(1, dab.t - prev.t) : 0
  const turn = (a: number): number => ((a / (Math.PI * 2)) % 1 + 1) % 1
  const sensor = d.control==='barrelRotation'||d.control==='tangentialPressure'?recordedPen188Carrier(d.control,dab):d.control === 'strokeRandom' ? d.randomSource ? keyedStrokeValue(d.randomSource.key,state) : brushDabRandom(state.seed,0xd0000+(d.randomStream ?? 0)) : d.control === 'random' ? clamp(random) : d.control === 'pressure' ? dab.pressure : d.control === 'pressureIn' ? Math.max(state.maxPressure??0,dab.pressure) : d.control === 'perspective' ? 1
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
        : d.control === 'distance' ? (d.periodic?worldDistanceForDab(dab,state)%d.period!:Math.min(worldDistanceForDab(dab,state),d.period!))/d.period!
        : d.control === 'dabProgress' ? (d.periodic ? ((state.genericDabSequence195 ?? state.dabSequence ?? 0) % d.period!) / d.period! : clamp((state.genericDabSequence195 ?? state.dabSequence ?? 0) / d.period!))
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
  const values=profile.scaling?.map((control,i)=>brushDynamicValue(control,input,state,brushDabRandom(seed,0xe0100+i)))??[]
  const factor=!values.length?1:values.length===1?values[0]:profile.scalingMode==='sum'?values.reduce((a,b)=>a+b,0):profile.scalingMode==='max'?Math.max(...values):profile.scalingMode==='min'?Math.min(...values):profile.scalingMode==='difference'?Math.max(...values)-Math.min(...values):values.reduce((a,b)=>a*b,1)
  const scaling=values.length?2*factor-1:0
  const absolute=profile.absolute
  const direction=(absolute?.locked?state.firstAngle:input.sourceAngle??input.angle)/(2*Math.PI)+(absolute?.angleOffset??0)/360
  const base=absolute?2*Math.PI*curveAt(absolute.curve,((direction%1)+1)%1):-Math.PI
  return base+Math.PI*profile.strength*(additive-scaling)
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
/** New113 raw signed selector: reduction is deliberately owned by the combined branch. */
function dimensionSelector(mode:string,rank:number,pressure?:number,speed?:number,angle?:number,x?:number,y?:number,stride=1):number {
  if(mode==='constant')return 0
  if(mode==='pressure'){
    const p=Math.fround(pressure??NaN)
    if(!Number.isFinite(p)||p<0||p>1)throw Error('Invalid multidimensional pressure input')
    return Math.trunc(p*(rank-1)+.5)
  }
  if(mode==='velocity'){
    const v=Math.fround(speed??NaN)
    if(!Number.isFinite(v)||v<0||v>1)throw Error('Invalid multidimensional speed input')
    return Math.floor(Math.min(Math.log(1+v),3)/3*(rank-.5)+.5)
  }
  if(mode==='angular'){
    if(angle===undefined||!Number.isFinite(angle))throw Error('Invalid multidimensional source angle')
    const turn=2*Math.PI,wrapped=(angle+3*Math.PI/4)%turn
    return Math.trunc((wrapped<0?wrapped+turn:wrapped)/turn*rank)
  }
  if(mode==='xtilt'||mode==='ytilt'){
    const index=gihTiltIndex(mode==='xtilt'?x:y,rank,stride)
    if(index===undefined)throw Error('Invalid multidimensional tilt input')
    return index
  }
  throw Error('Unsupported multidimensional selector')
}
/** Frame choice is one logical-dab event, independent of scatter and batches.
 * Dedicated random stream leaves every existing brush jitter salt unchanged. */
export function brushAnimationIndex(tip: BrushDescriptor['tip'], seed: number, ordinal: number, stream = 0, pressure?: number, normalizedSpeed?: number, sourceAngle?: number, tiltX?:number,tiltY?:number,strokeSeed?:number): number | undefined {
  const animation=tip.animation
  if(!animation) return undefined
  if(animation.mode==='dimensions'){
    const dims=animation.dimensions
    if(animation.rank!==undefined||!Array.isArray(dims)||dims.length<2||dims.length>4||!dims.every(d=>['constant','pressure','velocity','angular','xtilt','ytilt','random','incremental'].includes(d.mode)&&Number.isInteger(d.rank)&&d.rank>=2&&d.rank<=256)||dims.every(d=>d.mode==='constant'))throw Error('Invalid multidimensional pipe')
    const product=dims.reduce((n,d)=>n*d.rank,1),angular=brushAnimationUsesMode(animation,'angular'),tilt=brushAnimationUsesMode(animation,'xtilt')||brushAnimationUsesMode(animation,'ytilt')
    if(product>256||animation.frames.length<1||animation.frames.length>product||(angular?animation.cursorPolicy!=='first-request-v1':animation.cursorPolicy!==undefined)||(tilt?animation.roundingPolicy!=='qt5-half-up-v1':animation.roundingPolicy!==undefined))throw Error('Invalid multidimensional product/policy')
    const random=brushAnimationUsesMode(animation,'random')
    if((random?animation.randomPolicy!=='grafetto-dim-stream-v1':animation.randomPolicy!==undefined)||random&&(strokeSeed===undefined||!Number.isInteger(strokeSeed)||strokeSeed<0||strokeSeed>4294967295)||!Number.isSafeInteger(ordinal)||ordinal<0)throw Error('Invalid multidimensional random policy/seed/ordinal')
    let stride=product,index=0
    for(const [dimensionIndex,dimension] of dims.entries()){

      stride/=dimension.rank
      // Per-axis stateless stream: no scatter/sourceRandom draws and no mutable RNG.
      const raw=dimension.mode==='incremental'?ordinal%dimension.rank:dimension.mode==='random'
        ?Math.floor(brushDabRandom((strokeSeed!^Math.imul(0x47494844+dimensionIndex,0x9e3779b1))>>>0,ordinal)*dimension.rank)
        :dimensionSelector(dimension.mode,dimension.rank,pressure,normalizedSpeed,sourceAngle,tiltX,tiltY,stride)
      index=(index+stride*raw)>>>0
    }
    return index%animation.frames.length
  }

  if(animation.mode==='xtilt'||animation.mode==='ytilt'){
    const rank=animation.rank,index=gihTiltIndex(animation.mode==='xtilt'?tiltX:tiltY,rank)
    if(rank===undefined||!Number.isInteger(rank)||rank<2||rank>256||animation.roundingPolicy!=='qt5-half-up-v1'||animation.cursorPolicy!==undefined||!Array.isArray(animation.frames)||animation.frames.length<2||animation.frames.length>256||index===undefined)throw Error('Invalid GIH captured tilt input')
    // Qt5.15 qRound: nearest with negative half-ties toward positive infinity.
    // Degrees are NOT normalized; the native unsigned accumulation precedes actual EOF modulo.
    return(index>>>0)%animation.frames.length
  }
  if(animation.mode==='angular'){
    const rank=animation.rank
    if(animation.cursorPolicy!=='first-request-v1'||rank===undefined||!Number.isInteger(rank)||rank<2||rank>256||sourceAngle===undefined||!Number.isFinite(sourceAngle))throw Error('Invalid GIH captured angular input')
    const turn=2*Math.PI,wrapped=(sourceAngle+3*Math.PI/4)%turn,angle=wrapped<0?wrapped+turn:wrapped
    return Math.trunc(angle/turn*rank)%animation.frames.length
  }
  if(animation.mode==='velocity'){
    const rank=animation.rank
    if(!Number.isInteger(rank)||rank===undefined||rank<1||rank>256||normalizedSpeed===undefined||!Number.isFinite(normalizedSpeed)||normalizedSpeed<0||normalizedSpeed>1)throw Error('Invalid GIH captured velocity input')
    // Native selectPre: positive qRound(log(1+speed)/3*((rank-1)+.5)).
    // Keep its normalized speed domain; do NOT stretch log(2) to the last frame.
    const speed=Math.fround(normalizedSpeed)
    const index=Math.floor(Math.min(Math.log(1+speed),3)/3*((rank-1)+.5)+.5)
    return (index>>>0)%animation.frames.length
  }
  if(animation.mode==='constant')return 0
  if(animation.mode==='pressure'){
    const rank=animation.rank,p=Math.fround(pressure ?? NaN)
    if(!Number.isInteger(rank)||rank===undefined||rank<1||rank>2147483647||!Number.isFinite(p))throw Error('Invalid GIH pressure selection input')
    // Native selectPre uses static_cast<int>, then chooseNextBrush accumulates uint32.
    // Narrow author pressure exactly as the existing recorded dab codec does.
    const index=Math.trunc(p*(rank-1)+.5)
    if(index< -2147483648||index>2147483647)throw Error('GIH pressure selection exceeds native int range')
    return (index>>>0)%animation.frames.length
  }
  return animation.mode==='incremental' ? ordinal%animation.frames.length
    : Math.min(animation.frames.length-1,Math.floor(brushDabRandom(seed,0x40000+stream*0x10000+ordinal)*animation.frames.length))
}
export function brushAnimationFrame(tip: BrushDescriptor['tip'], seed: number, ordinal: number, stream = 0, pressure?: number, normalizedSpeed?: number, sourceAngle?: number, tiltX?:number,tiltY?:number,strokeSeed?:number): BrushDescriptor['tip']['mask'] {
  const index=brushAnimationIndex(tip,seed,ordinal,stream,pressure,normalizedSpeed,sourceAngle,tiltX,tiltY,strokeSeed)
  return index===undefined ? undefined : tip.animation!.frames[index]
}
export function advanceBrushAnimation(brush: BrushDescriptor, state: BrushBehaviorState): number {
  const ordinal = state.dabOrdinal ?? 0
  if (brush.tip.animation || brush.behavior?.dual?.brush.tip.animation) state.dabOrdinal = ordinal + 1
  return ordinal
}
/** One accepted request advances the native generic counter independently of
 * the existing callback/history/RNG cursor. Geometry probes own cloned states. */
export function behaviorStampsForDab(brush:BrushDescriptor,dab:Dab,state:BrushBehaviorState,color:[number,number,number],options:Parameters<typeof behaviorStampsForDabCore>[4]={}):BehaviorStamp[]{
  if(brush.version!==195||mask190Role(brush,state.execution)!=='primary')return behaviorStampsForDabCore(brush,dab,state,color,options)
  const role=state.execution!.maskRole190!.stationary195
  if(!role)throw Error('Missing stationary195 render counter role')
  const before=state.genericDabSequence195,sequence=before??0,previous=state.previous
  const moving=!!previous&&(previous.x!==dab.x||previous.y!==dab.y)
  const line=sequence!==0&&(role.callback==='lineCallback'||role.family==='tangentNormal'&&tangentConstructorIsPoint195(brush,dab.sourceSize!))
  const register=sequence===0||role.family==='bristle'||!(line||role.callback==='movingBypass'&&moving)
  state.genericDabSequence195=sequence
  try{
    const stamps=behaviorStampsForDabCore(brush,dab,state,color,options)
    if(register)state.genericDabSequence195=sequence+1
    return stamps
  }catch(error){
    if(before===undefined)delete state.genericDabSequence195
    else state.genericDabSequence195=before
    throw error
  }
}
function behaviorStampsForDabCore(brush: BrushDescriptor, dab: Dab, state: BrushBehaviorState, color: [
  number,
  number,
  number
], options: {sketchMask?:SketchMaskView;geometryOnly?:boolean;sprayRequest?:{spray?:{geometry:{x:number;y:number;radius:number};opacityScale:number;foreground:readonly[number,number,number]}}} = {}): BehaviorStamp[] {
  if(brush.version===188||brush.version===190||brush.version===191||usesNativeFilterMask(brush)||usesNativeSmudgeFeatures(brush)||usesNativeSketchSpray(brush)||brush.version===195)assertRecordedPen188Values(dab)
  assertSketchDistanceOpacityPolicy(brush)
  const sketchAngular182=hasSketchAngularGih182Scope(brush)
  const sketchMask=brush.sketch?.mode==='mask'?(options.sketchMask??prepareSketchMask(brush,state.execution)):undefined
  if(hasSketchGih174Scope(brush)||hasSketchPressureGih181Scope(brush)||sketchAngular182)sketchMask!.forDab(dab,0)
  const behavior = brush.behavior
  const noise=brush.tip.autoNoise
  const activeNoise=!!noise&&(noise.density!==1||noise.randomness!==0)
  const noiseSeed=activeNoise?state.execution?.brushRandom?.strokeSeed:undefined
  if(activeNoise&&noiseSeed===undefined)throw Error('Auto-mask noise requires a captured stroke seed')
  const mask190=mask190Role(brush,state.execution)!==undefined
  const dimensions=brush.tip.animation?.mode==='dimensions',angular=!usesNativeSketchSpray(brush)&&!sketchAngular182&&brushAnimationUsesMode(brush.tip.animation,'angular')
  const originalSensorRgba119=brush.tip.color!==undefined&&(hasOriginalRgbaGih119Scope(brush)||hasEqualOriginalRgbaGih121Scope(brush)||hasEqualGradientGih125Scope(brush)||hasUnequalGradientGih126Scope(brush))
  const equalSensorLightness123=brush.tip.material!==undefined&&(hasEqualLightnessGih123Scope(brush)||hasUnequalLightnessGih124Scope(brush))
  const sensorGeometry=!!brush.tip.animation?.geometry&&(dimensions||brush.tip.animation.mode==='angular'||brush.tip.animation.mode==='xtilt'||brush.tip.animation.mode==='ytilt')
  if(!mask190&&sensorGeometry&&(brush.version<118||brush.tip.animation!.frames.length<2||(brush.scatter?.radius??0)>0||brush.model!=='stamp'||brush.tip.kind!=='bitmap'||(brush.tip.color!==undefined&&!originalSensorRgba119)||(brush.tip.material&&!equalSensorLightness123)||brush.tip.imageSampling||brush.tip.profile||brush.tip.autoNoise||brush.tip.autoShape||['mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>brush[k as keyof BrushDescriptor]!==undefined)||!behavior||behavior.dual||behavior.erase||behavior.timing||behavior.sequentialRandom||behavior.strokeInput?.fanCorners||behavior.rendering?.blendMode!=='normal'||behavior.rendering.accumulation!=='directOver'||(behavior.rendering.wetEdges??0)!==0||(behavior.rendering.burntEdges??0)!==0))throw Error('Sensor GIH geometry requires118 alpha without positional scatter')
  const native=!!behavior?.sequentialRandom
  if(native || behavior?.strokeInput || dimensions) {
    assertBrushExecutionContext(brush,state.execution)
    assertBrushSourceInputs(brush,[dab],undefined,state.execution)
  }
  if(!mask190&&behavior?.dual?.brush.tip.animation?.mode==='dimensions')throw Error('Multidimensional GIH child is unsupported')
  if(!mask190&&dimensions&&(brush.version<(brushAnimationUsesMode(brush.tip.animation,'random')||brushAnimationUsesMode(brush.tip.animation,'incremental')?115:113)||brush.model!=='stamp'||brush.tip.kind!=='bitmap'||(brush.tip.color!==undefined&&!originalSensorRgba119)||(brush.tip.material&&!equalSensorLightness123)||brush.tip.profile||brush.tip.imageSampling||brush.tip.autoNoise||brush.tip.autoShape||['mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','wet','texture'].some(k=>brush[k as keyof BrushDescriptor]!==undefined)||!behavior||behavior.dual||behavior.erase||behavior.timing||behavior.sequentialRandom||behavior.strokeInput?.fanCorners||behavior.rendering?.blendMode!=='normal'||behavior.rendering.accumulation!=='directOver'||(behavior.rendering.wetEdges??0)!==0||(behavior.rendering.burntEdges??0)!==0||angular&&(!behavior.strokeInput||behavior.strokeInput.version!==1||behavior.strokeInput.initialDirection!=='cursorHistory')))throw Error('Multidimensional GIH requires root static Pixel source policy')
  // Tilt112 is root-only; reject forged child/mixed descriptors before any selector/counter mutation.
  const tiltSelector=brush.tip.animation?.mode==='xtilt'||brush.tip.animation?.mode==='ytilt',childTilt=behavior?.dual?.brush.tip.animation?.mode==='xtilt'||behavior?.dual?.brush.tip.animation?.mode==='ytilt'
  if(!mask190&&childTilt)throw Error('GIH tilt child is unsupported')
  if(!mask190&&tiltSelector&&(brush.version<112||brush.model!=='stamp'||brush.tip.kind!=='bitmap'||brush.tip.animation?.geometry&&brush.version<118||(brush.tip.color!==undefined&&!originalSensorRgba119)||(brush.tip.material&&!equalSensorLightness123)||brush.tip.imageSampling||brush.tip.profile||brush.tip.autoNoise||brush.tip.autoShape||['mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','wet','texture'].some(k=>brush[k as keyof BrushDescriptor]!==undefined)||!behavior||behavior.dual||behavior.erase||behavior.timing||behavior.sequentialRandom||behavior.strokeInput?.fanCorners||behavior.rendering?.blendMode!=='normal'||behavior.rendering.accumulation!=='directOver'||(behavior.rendering.wetEdges??0)!==0||(behavior.rendering.burntEdges??0)!==0))throw Error('GIH tilt requires root static normal directOver Pixel')
  // Validate both selectors before advancing any real gesture state.
  const velocity=brush.tip.animation?.mode==='velocity'||behavior?.dual?.brush.tip.animation?.mode==='velocity'||dimensions&&brushAnimationUsesMode(brush.tip.animation,'velocity')
  if(velocity){
    const speed=behavior?.speedInput
    if(brush.version<92||speed?.version!==1||speed.space!=='view'||speed.maximum!==30||speed.estimator!=='grafettoEMA30ms')throw Error('GIH velocity requires root captured speedInput30')
    if(dab.normalizedSpeed===undefined||!Number.isFinite(dab.normalizedSpeed)||dab.normalizedSpeed<0||dab.normalizedSpeed>1)throw Error('Invalid GIH captured velocity input')
  }
  if(angular&&(!Number.isFinite(dab.x)||!Number.isFinite(dab.y)))throw Error('Invalid GIH angular request coordinates')
  const ordinal = state.dabOrdinal ?? 0
  const index=sketchAngular182||usesNativeSketchSpray(brush)&&!!brush.sketch?undefined:brushAnimationIndex(brush.tip,state.seed,usesNativeSketchSpray(brush)&&brush.spray?0:ordinal,0,dab.pressure,dab.normalizedSpeed,dab.sourceAngle,dab.tiltX,dab.tiltY,state.execution?.brushRandom?.strokeSeed)
  // Independent sensor masks are queried only by their own resampled child dabs.
  // Admitted independent DrawingAngle pairs also choose random frames only in
  // their own recursive paint. Historical non-pair metadata paths stay unchanged.
  const dualIndex=behavior?.dual && !(behavior.dual.sampling==='independent'&&(mask190||behavior.dual.brush.tip.animation?.mode==='pressure'||behavior.dual.brush.tip.animation?.mode==='velocity'||isIndependentDrawingAnglePair(brush))) ? brushAnimationIndex(behavior.dual.brush.tip,state.seed,ordinal,1,dab.pressure,dab.normalizedSpeed) : undefined
  if(!(usesNativeSketchSpray(brush)&&brush.sketch)&&!hasSketchGih174Scope(brush)&&!hasSketchPressureGih181Scope(brush)&&!hasSketchAngularGih182Scope(brush))advanceBrushAnimation(brush, state)
  if(mask190)state.maxPressure=Math.max(state.maxPressure??0,dab.pressure)
  if(angular){
    const previous=state.angularCursor
    const x=Math.fround(dab.x),y=Math.fround(dab.y)
    const travelled=previous?Math.hypot(x-previous.x,y-previous.y):0
    // Native registers total stroke length even when canPaintFor emits no dab.
    // Keep the canonical attempt polyline, not a chord between painted dabs.
    if(brushUsesDistanceControl(brush)){
      state.worldDistance=(state.worldDistance??0)+travelled
      // The current sensor query must not add the current segment twice.
      state.worldDistancePoint={x:dab.x,y:dab.y}
    }
    if(previous)state.distance+=travelled/Math.max(.5,(dab.size+(state.angularPreviousSize??dab.size))*.5)
    state.angularPreviousSize=dab.size
    state.angularCursor={x,y}
    // first-request-v1 is explicit functional policy, not native initialization identity.
    if(previous&&travelled<.5){
      state.dabSequence=(state.dabSequence??0)+1
      return []
    }
  }
  const mask=index===undefined ? undefined : brush.tip.animation!.frames[index]
  const dualMask=dualIndex===undefined ? undefined : behavior!.dual!.brush.tip.animation!.frames[dualIndex]
  const colorPlanes=brushTipColorPlanes(brush.tip,index)
  const gray=(index===undefined ? undefined : brush.tip.material?.grayFrames?.[index]) ?? brush.tip.material?.gray
  const dualGray=(dualIndex===undefined ? undefined : behavior?.dual?.brush.tip.material?.grayFrames?.[dualIndex]) ?? behavior?.dual?.brush.tip.material?.gray
  const prev = state.previous
  if(!angular&&brushUsesDistanceControl(brush)){
    state.worldDistance=worldDistanceForDab(dab,state)
    state.worldDistancePoint={x:dab.x,y:dab.y}
  }
  if (prev&&!angular)
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
  const dynamic = (target: BrushDynamicTarget, i: number, source = behavior): number => brushDynamicValue(source?.dynamics?.[target], directionalDab, state, rand(i),((brush.version===187||brush.version===189)&&target==='size'||mask190Role(brush,state.execution)!==undefined)?'native-size-absolute187-v1':undefined) * (source?.modulations?.[target] ?? []).reduce((factor, control, index) => factor * brushDynamicValue(control, directionalDab, state, rand(i + 67 + index),((brush.version===187||brush.version===189)&&target==='size'||mask190Role(brush,state.execution)!==undefined)?'native-size-absolute187-v1':undefined), 1)
  // Native Pixel queries this option once per logical dab before deposition.
  const lightness = brush.version>=90 && brush.model==='stamp' && brush.tip.material && (behavior?.dynamics?.lightnessStrength || behavior?.modulations?.lightnessStrength?.length)
    ? clamp(brush.tip.material.strength*dynamic('lightnessStrength',0x65000)) : undefined
  const lightnessChild = brush.version>=90 && behavior?.dual?.sampling!=='independent' ? behavior?.dual?.brush : undefined
  const dualLightness = lightnessChild?.tip.material && (lightnessChild.behavior?.dynamics?.lightnessStrength || lightnessChild.behavior?.modulations?.lightnessStrength?.length)
    ? clamp(lightnessChild.tip.material.strength*dynamic('lightnessStrength',0x66000,lightnessChild.behavior)) : undefined
  const rotation = behavior?.rotation
  const mirror=behavior?.mirror
  const mirrorActive=!!mirror&&mirror.value*(mirror.dynamics??[]).reduce((factor,control,index)=>factor*brushDynamicValue(control,directionalDab,state,rand(0x53000+index)),1)>=.5
  const childMirror=brush.version>=73&&behavior?.dual?.sampling!=='independent'?behavior?.dual?.brush.behavior?.mirror:undefined
  const childMirrored=!!childMirror&&childMirror.value*(childMirror.dynamics??[]).reduce((factor,control,index)=>factor*brushDynamicValue(control,directionalDab,state,rand(0x64000+index)),1)>=.5
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
    const geometry=brushRequestGeometry(dab.sourceSize!,dab.sourceScale!*sizeScale,angle,mask190)
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
  if(brush.version===195&&brush.tangentNormal&&mask190&&state.previous&&tangentConstructorIsPoint195(brush,dab.sourceSize!)){
    const previous=state.previous,dx=dab.x-previous.x,dy=dab.y-previous.y,length=Math.hypot(dx,dy),group=state.dabSequence??0
    state.previous={...dab};state.dabSequence=group+1
    return[{x:(previous.x+dab.x)*.5,y:(previous.y+dab.y)*.5,size:1,aspect:length+1,angle:Math.atan2(dy,dx),segmentLength:length,group,flowScale:1,color:adjustedColor,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}]
  }
  if(brush.experiment){
    const experiment=state.experiment??={points:[],firstLine:true,speedCoeff:0,smoothDistance:0}
    const stamps=experimentStamps(brush.experiment,dab,experiment,adjustedColor)
    state.previous={...dab};state.dabSequence=(state.dabSequence??0)+1
    return stamps.map(stamp=>({...stamp,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}))
  }
  if(brush.particle){
    const particles=state.particle??={values:new Float64Array(),ordinal:0}
    const stamps=particleStamps(brush.particle,dab,particles,adjustedColor)
    state.previous={...dab};state.dabSequence=(state.dabSequence??0)+1
    return stamps.map(stamp=>({...stamp,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}))
  }
  if(brush.curveTrace){
    const trace=state.curveTrace??={points:[],ordinal:0}
    const factor=(key:'width'|'opacity',salt:number)=>(brush.curveTrace!.dynamics?.[key]??[]).reduce((v,c,i)=>v*brushDynamicValue(c,directionalDab,state,rand(salt+i)),1)
    const stamps=curveTraceStamps(brush,dab,trace,adjustedColor,{width:factor('width',0xf4000),opacity:factor('opacity',0xf5000)})
    state.previous={...dab};state.dabSequence=(state.dabSequence??0)+1
    return stamps.map(stamp=>({...stamp,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}))
  }
  if(brush.bristle){
    const bristle=state.bristle??={ordinal:0,oldPressure:1,ends:[]}
    const stamps=(brush.bristle.version===2?bristleGeometryStamps:bristleStamps)(brush,{...dab,angle,size:dab.size*sizeScale},bristle,adjustedColor,state.seed)
    state.previous={...dab};state.dabSequence=(state.dabSequence??0)+1
    return stamps.map(stamp=>({...stamp,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}))
  }
  if(brush.sketch){
    const sketch:SketchState=state.sketch??={points:[],cells:new Map(),ordinal:0,color:[...adjustedColor],alpha:1}
    const factor=(key:'width'|'offset'|'probability',salt:number)=>(brush.sketch!.dynamics?.[key]??[]).reduce((v,c,i)=>v*brushDynamicValue(c,directionalDab,state,rand(salt+i)),1)
    const stamps=sketchStamps(brush,sketchMask?{...dab,angle,size:dab.size*sizeScale}:{...dab,size:dab.size*sizeScale},sketch,adjustedColor,state.seed,{width:factor('width',0xf1000),offset:factor('offset',0xf2000),probability:factor('probability',0xf3000)},1,sketchMask,usesNativeSketchSpray(brush)?brushAnimationIndex(brush.tip,state.seed,sketch.maskDabOrdinal??0,0,dab.pressure,dab.normalizedSpeed,dab.sourceAngle,dab.tiltX,dab.tiltY,state.execution?.brushRandom?.strokeSeed):sketchAngular182?brushAnimationIndex(brush.tip,state.seed,sketch.maskDabOrdinal??0,0,undefined,undefined,dab.sourceAngle):hasSketchPressureGih181Scope(brush)?brushAnimationIndex(brush.tip,state.seed,sketch.maskDabOrdinal??0,0,dab.pressure):hasSketchGih174Scope(brush)?brushAnimationIndex(brush.tip,state.seed,sketch.maskDabOrdinal??0):undefined,(usesNativeSketchSpray(brush)||hasSketchGih174Scope(brush)||hasSketchPressureGih181Scope(brush)||sketchAngular182)?clamp(curveAt(brush.sizeByPressure,dab.pressure)*sizeScale):undefined)
    state.previous={...dab};state.dabSequence=(state.dabSequence??0)+1
    return stamps.map(stamp=>({...stamp,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale,grainDepth:1,flipX:1,flipY:1,distance:state.distance}))
  }
  if(brush.spray&&options.sprayRequest)options.sprayRequest.spray={geometry:sprayRequestGeometry(brush,{...dab,size:dab.size*sizeScale},state.seed,state.dabSequence??0),opacityScale,foreground:adjustedColor}
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
      ...stamp, ...(brush.tip.animation?.geometry?{frameIndex:index,frameCoordinateFlip:mirrorActive&&!!mirror&&(!!mirror.horizontal!==!!mirror.vertical)}:{}), ...(activeNoise?{autoNoiseKey:autoMaskNoiseKey(noiseSeed!,state.dabSequence??0,i,0)}:{}), ...((brush.spray?.particle.image||usesNativeSketchSpray(brush)&&brush.spray&&brush.tip.color&&'planes'in brush.tip.color)?{sprayImageHsv:[spray!.hue*brushDabRandom(spraySeed,16+colorIndex*16+4),spray!.saturation*brushDabRandom(spraySeed,16+colorIndex*16+5),spray!.value*brushDabRandom(spraySeed,16+colorIndex*16+6)]as const}:{}), ...(colorPlanes ? {colorPlanes} : {}), ...(sourceDiameter===undefined ? {} : {sourceDiameter}), ...(gray ? {gray} : {}), ...(dualGray ? {dualGray} : {}), ...(mask ? { mask } : {}), ...(dualMask ? { dualMask } : {}), x, y, bleed, wetGrade, edgeSoftness, size:stamp.size*roundness*(1+edgeSoftness*.15), aspect: clamp(stamp.aspect / roundness / (rotation?.projection ? Math.max(0.1, Math.cos(tilt)) : 1), 0.05, 20),
      flowScale: stamp.flowScale * curveAt(brush.flowByPressure, dab.pressure) * dynamic('flow', 22 + i * 8) * Math.exp(-state.distance*(behavior?.falloff??0)*4),
      ...(brush.hatching?{hatching:hatchingPlacement(brush.hatching,Object.fromEntries((['angle','cross','separation','thickness']as const).map((key,j)=>[key,(brush.hatching!.dynamics?.[key]??[]).reduce((v,c,i)=>v*brushDynamicValue(c,directionalDab,state,rand(0xf6000+j*16+i)),1)]))as {angle:number;cross:number;separation:number;thickness:number})}:{}),
      ...(lightness===undefined?{}:{lightnessStrength:lightness}),
      ...(dualLightness===undefined?{}:{dualLightnessStrength:dualLightness}),
      opacityScale, grainDepth: dynamic('grainDepth', 23 + i * 8),
      ...((brush.tip.profile?.kind==='standard'||brush.tip.profile?.kind==='radialCurveSoftness'||brush.tip.profile?.kind==='curveRectangleSoftness') && (behavior?.softness!==undefined || behavior?.modulations?.softness?.length || behavior?.dynamics?.softness)
        ? {softnessScale:clamp((behavior?.softness??1)*dynamic('softness',0x61000+i*16))}:{}),
      ...(behavior?.dual?.sampling!=='independent' && (behavior?.dual?.brush.tip.profile?.kind==='standard'||behavior?.dual?.brush.tip.profile?.kind==='radialCurveSoftness') && (behavior.dual.brush.behavior?.softness!==undefined || behavior.dual.brush.behavior?.modulations?.softness?.length || behavior.dual.brush.behavior?.dynamics?.softness)
        ? {dualSoftnessScale:clamp((behavior.dual.brush.behavior?.softness??1)*dynamic('softness',0x62000+i*16,behavior.dual.brush.behavior))}:{}),
      ...(behavior?.dynamics?.sharpness || behavior?.modulations?.sharpness?.length
        ? { sharpnessScale: dynamic('sharpness', 4096 + i * 8) } : {}),
      ...(behavior?.dual?.sampling !== 'independent' && (behavior?.dual?.brush.behavior?.dynamics?.sharpness || behavior?.dual?.brush.behavior?.modulations?.sharpness?.length)
        ? { dualSharpnessScale: dynamic('sharpness', 8192 + i * 8, behavior.dual.brush.behavior) } : {}),
      ...(childMirror?{dualFlipX:childMirrored&&childMirror.horizontal?-1:1,dualFlipY:childMirrored&&childMirror.vertical?-1:1}:{}),
      flipX: (rotation?.flipX && rand(24 + i * 8) < 0.5 ? -1 : 1)*(mirrorActive&&mirror?.horizontal?-1:1),
      flipY: (rotation?.flipY && rand(25 + i * 8) < 0.5 ? -1 : 1)*(mirrorActive&&mirror?.vertical?-1:1),
      color: hasColor ? shiftColor(sprayColor, behavior.dynamics?.hue ? dynamic('hue', 26 + i * 8) : 0, dynamic('saturation', 27 + i * 8), dynamic('brightness', 28 + i * 8)) : sprayColor,
      distance: state.distance,
    }
  })
  state.previous = { ...dab }
  state.dabSequence = (state.dabSequence ?? 0) + 1
  return out
}
