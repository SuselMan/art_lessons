import type { BrushDescriptor, BrushDynamic, BrushDynamicTarget, Dab } from '@grafetto/shared'
import { brushDabRandom, brushDabSeed, brushStampsForDab, curveAt, type BrushStamp } from './digitalBrushPresets'
/** Logical gesture state: never derives randomness or dynamics from a frame/batch. */
export interface BrushBehaviorState {
  pending?: BehaviorPlaced[]
  dabOrdinal?: number
  seed: number
  charge: number
  distance: number
  firstAngle: number
  directionSet?: boolean
  opacity: number
  previous?: Dab
  bounds?: {minX:number;minY:number;maxX:number;maxY:number}
}

export interface SecondarySamplingState { previous?: Dab; remaining: number }
/** Resample the recorded centreline, carrying phase through network chunks.
 * One-pixel minimum and 16 stamps per input diameter bound imported tiny spacing. */
export function secondaryBrushDabs(primary: BrushDescriptor, child: BrushDescriptor, dabs: readonly Dab[], state: SecondarySamplingState): Dab[] {
  const result: Dab[] = []
  const size = (d: Dab): Dab => ({...d,opacity:1,size:d.size*curveAt(child.sizeByPressure,d.pressure)/Math.max(0.01,curveAt(primary.sizeByPressure,d.pressure))})
  for (const raw of dabs) {
    const dab=size(raw), previous=state.previous
    if (!previous) { result.push(dab); state.remaining=Math.max(1,dab.size*child.spacing);state.previous=dab;continue }
    const length=Math.hypot(dab.x-previous.x,dab.y-previous.y)
    if (!length) {state.previous=dab;continue}
    const stepFloor=Math.max(1,length/256)
    let travel=state.remaining
    while(travel<=length) {
      const t=travel/length
      const lerp=(a:number,b:number):number=>Math.fround(a+(b-a)*t)
      const point: Dab={x:lerp(previous.x,dab.x),y:lerp(previous.y,dab.y),size:lerp(previous.size,dab.size),pressure:lerp(previous.pressure,dab.pressure),angle:lerp(previous.angle,dab.angle),aspectRatio:lerp(previous.aspectRatio,dab.aspectRatio),tiltX:lerp(previous.tiltX,dab.tiltX),tiltY:lerp(previous.tiltY,dab.tiltY),opacity:lerp(previous.opacity,dab.opacity),t:lerp(previous.t,dab.t)}
      result.push(point)
      travel+=Math.max(stepFloor,point.size*child.spacing)
    }
    state.remaining=travel-length
    state.previous=dab
  }
  return result
}
export interface BehaviorStamp extends BrushStamp {
  mask?: BrushDescriptor['tip']['mask']
  dualMask?: BrushDescriptor['tip']['mask']
  gray?: string
  dualGray?: string
  wetGrade: number
  edgeSoftness: number
  bleed: number
  opacityScale: number
  grainDepth: number
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
export function beginBrushBehavior(dab: Dab): BrushBehaviorState {
  return { charge: 1, seed: brushDabSeed(dab.x, dab.y, dab.pressure), distance: 0, firstAngle: dab.angle, opacity: dab.opacity }
}
/** PointerEvent tilt axes describe slopes, not independent polar angles. */
function penTilt(dab:Dab): {angle:number;azimuth:number} {
  const x=Math.tan(dab.tiltX*Math.PI/180),y=Math.tan(dab.tiltY*Math.PI/180)
  return {angle:Math.atan(Math.hypot(x,y)),azimuth:Math.atan2(y,x)}
}
export function brushDynamicValue(d: BrushDynamic | undefined, dab: Dab, state: BrushBehaviorState, random: number): number {
  if (!d)
    return 1
  const prev = state.previous
  const travel = prev ? Math.hypot(dab.x - prev.x, dab.y - prev.y) : 0
  const speed = prev ? travel / Math.max(1, dab.t - prev.t) : 0
  const turn = (a: number): number => ((a / (Math.PI * 2)) % 1 + 1) % 1
  const sensor = d.control === 'pressure' ? dab.pressure
    : d.control === 'tiltElevation' ? 1-clamp(penTilt(dab).angle/(Math.PI/2))
      : d.control === 'tiltX' ? clamp((dab.tiltX+90)/180)
      : d.control === 'tiltY' ? clamp((dab.tiltY+90)/180)
      : d.control === 'azimuth' ? turn(penTilt(dab).azimuth)
      // Raw tilt-axis direction is a separate input convention from the
      // physical slope azimuth. A vertical pen has a defined reference.
      : d.control === 'tiltDirection' ? (Math.PI + (dab.tiltX === 0 && dab.tiltY === 0 ? -Math.PI / 2 : Math.atan2(-dab.tiltX,dab.tiltY))) / (2 * Math.PI)
    : d.control === 'tilt' ? clamp(penTilt(dab).angle/(Math.PI/2))
      : d.control === 'speed' ? clamp(speed / 2)
        : d.control === 'fade' ? clamp(1 - state.distance / Math.max(0.001, d.fade ?? 1))
          : d.control === 'direction' ? turn(dab.angle)
            : d.control === 'initialDirection' ? turn(state.firstAngle) : 1
  const value = d.curve ? curveAt(d.curve, sensor) : sensor
  const controlled = d.strength === undefined ? value : d.strength >= 0 ? 1 - d.strength + d.strength * value : 1 + d.strength * value
  return clamp((d.minimum + (1 - d.minimum) * controlled) * (1 - d.jitter * random))
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
]): BehaviorStamp[] {
  const behavior = brush.behavior
  const ordinal = advanceBrushAnimation(brush, state)
  const index=brushAnimationIndex(brush.tip,state.seed,ordinal)
  const dualIndex=behavior?.dual ? brushAnimationIndex(behavior.dual.brush.tip,state.seed,ordinal,1) : undefined
  const mask=index===undefined ? undefined : brush.tip.animation!.frames[index]
  const dualMask=dualIndex===undefined ? undefined : behavior!.dual!.brush.tip.animation!.frames[dualIndex]
  const gray=(index===undefined ? undefined : brush.tip.material?.grayFrames?.[index]) ?? brush.tip.material?.gray
  const dualGray=(dualIndex===undefined ? undefined : behavior?.dual?.brush.tip.material?.grayFrames?.[dualIndex]) ?? behavior?.dual?.brush.tip.material?.gray
  const prev = state.previous
  if (prev)
    state.distance += Math.hypot(dab.x - prev.x, dab.y - prev.y) / Math.max(0.5, (dab.size + prev.size) * 0.5)
  const direction = prev && (prev.x !== dab.x || prev.y !== dab.y) ? Math.atan2(dab.y - prev.y, dab.x - prev.x) : dab.angle
  if (prev && !state.directionSet && (prev.x !== dab.x || prev.y !== dab.y)) {
    state.firstAngle = direction
    state.directionSet = true
  }
  const directionalDab = { ...dab, angle: direction }
  const seed = brushDabSeed(dab.x, dab.y, dab.pressure)
  const rand = (i: number): number => brushDabRandom(seed, i)
  const dynamic = (target: BrushDynamicTarget, i: number): number => brushDynamicValue(behavior?.dynamics?.[target], directionalDab, state, rand(i)) * (behavior?.modulations?.[target] ?? []).reduce((factor, control, index) => factor * brushDynamicValue(control, directionalDab, state, rand(i + 67 + index)), 1)
  const rotation = behavior?.rotation
  const randomRotation = rotation?.random === 'stroke' ? brushDabRandom(state.seed, 9) : rand(9)
  const countScale = dynamic('count', 10) * (1 - (behavior?.scatter?.countJitter ?? 0) * rand(11))
  const count = Math.max(1, Math.round((brush.scatter?.count ?? 1) * countScale))
  const scatter = brush.scatter ? { ...brush.scatter, count, radius: brush.scatter.radius * dynamic('scatter', 12) } : undefined
  const configured = scatter ? { ...brush, scatter } : brush
  const pen=penTilt(dab),tilt=Math.min(1.5,pen.angle)
  const penAngle = tilt > 0.001 ? pen.azimuth : direction
  const rotationAngle = rotation ? brush.tip.angle + (rotation.azimuth ? penAngle : direction * rotation.follow) + (rotation.random === 'none' ? 0 : randomRotation * Math.PI * 2) : dab.angle
  const angleDynamic = behavior?.dynamics?.angle
  const angle = rotationAngle + (angleDynamic ? angleDynamic.control === 'off' ? (rand(13) - 0.5) * 2 * Math.PI * angleDynamic.jitter : (dynamic('angle', 13) - 1) * Math.PI * 2 : 0)
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
  const opacityScale = dynamic('opacity', 15) * (t ? 1 - t.opacity * (1 - taper) : 1)
  const out = brushStampsForDab(configured, { ...dab, angle, size: dab.size * sizeScale }).map((stamp, i): BehaviorStamp => {
    let x = stamp.x, y = stamp.y
    if (behavior?.scatter && !behavior.scatter.bothAxes) {
      const offset = (stamp.x - dab.x) * Math.cos(angle) + (stamp.y - dab.y) * Math.sin(angle)
      x = dab.x - Math.sin(angle) * offset
      y = dab.y + Math.cos(angle) * offset
    }
    const roundness = Math.max(0.02, dynamic('roundness', 20 + i * 8) * (1 - (behavior?.scatter?.roundnessJitter ?? 0) * rand(21 + i * 8)))
    const hasColor = behavior?.dynamics?.hue || behavior?.dynamics?.saturation || behavior?.dynamics?.brightness
    return {
      ...stamp, ...(gray ? {gray} : {}), ...(dualGray ? {dualGray} : {}), ...(mask ? { mask } : {}), ...(dualMask ? { dualMask } : {}), x, y, bleed, wetGrade, edgeSoftness, size:stamp.size*(1+edgeSoftness*.15), aspect: clamp(stamp.aspect / roundness / (rotation?.projection ? Math.max(0.1, Math.cos(tilt)) : 1), 0.05, 20),
      flowScale: stamp.flowScale * curveAt(brush.flowByPressure, dab.pressure) * dynamic('flow', 22 + i * 8) * Math.exp(-state.distance*(behavior?.falloff??0)*4),
      opacityScale, grainDepth: dynamic('grainDepth', 23 + i * 8),
      flipX: rotation?.flipX && rand(24 + i * 8) < 0.5 ? -1 : 1,
      flipY: rotation?.flipY && rand(25 + i * 8) < 0.5 ? -1 : 1,
      color: hasColor ? shiftColor(color, behavior.dynamics?.hue ? dynamic('hue', 26 + i * 8) : 0, dynamic('saturation', 27 + i * 8), dynamic('brightness', 28 + i * 8)) : color,
      distance: state.distance,
    }
  })
  state.previous = { ...dab }
  return out
}
