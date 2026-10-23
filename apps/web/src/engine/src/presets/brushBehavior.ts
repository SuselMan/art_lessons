import type { BrushDescriptor, BrushDynamic, BrushDynamicTarget, Dab } from '@grafetto/shared'
import { brushDabRandom, brushDabSeed, brushStampsForDab, curveAt, type BrushStamp } from './digitalBrushPresets'
/** Logical gesture state: never derives randomness or dynamics from a frame/batch. */
export interface BrushBehaviorState {
  pending?: BehaviorPlaced[]
  seed: number
  distance: number
  firstAngle: number
  directionSet?: boolean
  opacity: number
  previous?: Dab
}
export interface BehaviorStamp extends BrushStamp {
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
  return { seed: brushDabSeed(dab.x, dab.y, dab.pressure), distance: 0, firstAngle: dab.angle, opacity: dab.opacity }
}
function dynamicValue(d: BrushDynamic | undefined, dab: Dab, state: BrushBehaviorState, random: number): number {
  if (!d)
    return 1
  const prev = state.previous
  const travel = prev ? Math.hypot(dab.x - prev.x, dab.y - prev.y) : 0
  const speed = prev ? travel / Math.max(1, dab.t - prev.t) : 0
  const turn = (a: number): number => ((a / (Math.PI * 2)) % 1 + 1) % 1
  const value = d.control === 'pressure' ? dab.pressure
    : d.control === 'tilt' ? clamp(Math.hypot(dab.tiltX, dab.tiltY) / 90)
      : d.control === 'speed' ? clamp(speed / 2)
        : d.control === 'fade' ? clamp(1 - state.distance / Math.max(0.001, d.fade ?? 1))
          : d.control === 'direction' ? turn(dab.angle)
            : d.control === 'initialDirection' ? turn(state.firstAngle) : 1
  return clamp((d.minimum + (1 - d.minimum) * value) * (1 - d.jitter * random))
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
export function behaviorStampsForDab(brush: BrushDescriptor, dab: Dab, state: BrushBehaviorState, color: [
  number,
  number,
  number
]): BehaviorStamp[] {
  const behavior = brush.behavior
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
  const dynamic = (target: BrushDynamicTarget, i: number): number => dynamicValue(behavior?.dynamics?.[target], directionalDab, state, rand(i))
  const rotation = behavior?.rotation
  const randomRotation = rotation?.random === 'stroke' ? brushDabRandom(state.seed, 9) : rand(9)
  const countScale = dynamic('count', 10) * (1 - (behavior?.scatter?.countJitter ?? 0) * rand(11))
  const count = Math.max(1, Math.round((brush.scatter?.count ?? 1) * countScale))
  const scatter = brush.scatter ? { ...brush.scatter, count, radius: brush.scatter.radius * dynamic('scatter', 12) } : undefined
  const configured = scatter ? { ...brush, scatter } : brush
  const rotationAngle = rotation ? brush.tip.angle + direction * rotation.follow + (rotation.random === 'none' ? 0 : randomRotation * Math.PI * 2) : dab.angle
  const angleDynamic = behavior?.dynamics?.angle
  const angle = rotationAngle + (angleDynamic ? angleDynamic.control === 'off' ? (rand(13) - 0.5) * 2 * Math.PI * angleDynamic.jitter : (dynamic('angle', 13) - 1) * Math.PI * 2 : 0)
  let taper = 1
  const t = behavior?.taper
  if (t && t.start > 0)
    taper = clamp(state.distance / Math.max(0.001, t.start * 10))
  // The end taper is supplied by the painter at logical finish, independent of batches.
  if (t?.pressure && t.end > 0)
    taper *= clamp(dab.pressure / Math.max(0.001, t.end))
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
      ...stamp, x, y, aspect: clamp(stamp.aspect / roundness, 0.05, 20),
      flowScale: stamp.flowScale * curveAt(brush.flowByPressure, dab.pressure) * dynamic('flow', 22 + i * 8),
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
