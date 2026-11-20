/** Serializable scalar responses; sparse knots retain their historical meaning. */
export interface UniformBrushCurve {
  kind: 'uniform'
  samples: readonly number[]
  /** Snap fractions this close to a table sample; default0. */
  endpointEpsilon?: number
  /** Restore the input sign after a nonnegative lookup (including negative0). */
  preserveInputSign?: boolean
}
export type BrushCurve = readonly (readonly [x: number, y: number])[] | UniformBrushCurve

export function isBrushCurve(value: unknown, maximum = 2, maxKnots = 32, strictKnots = false): value is BrushCurve {
  const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  if (!Array.isArray(value)) {
    if (!value || typeof value !== 'object') return false
    const v = value as Record<string, unknown>
    return Object.keys(v).every(k => ['kind','samples','endpointEpsilon','preserveInputSign'].includes(k))
      && v.kind === 'uniform' && Array.isArray(v.samples) && v.samples.length >= 2 && v.samples.length <= 256
      && v.samples.every(sample => finite(sample,0,maximum))
      && (v.endpointEpsilon === undefined || finite(v.endpointEpsilon,0,0.001))
      && (v.preserveInputSign === undefined || typeof v.preserveInputSign === 'boolean')
  }
  if (value.length < 2 || value.length > maxKnots) return false
  let last = -1
  return value.every(point => {
    if (!Array.isArray(point) || point.length !== 2 || !finite(point[0],0,1) || !finite(point[1],0,maximum)
      || (strictKnots ? point[0] <= last : point[0] < last)) return false
    last = point[0]
    return true
  })
}

/** O(1) uniform lookup; old sparse curves preserve their exact arithmetic. */
export function evaluateBrushCurve(curve: BrushCurve, x: number): number {
  const t = Math.max(0, Math.min(1, x))
  if (!Array.isArray(curve)) {
    const uniform = curve as UniformBrushCurve
    // Clamp BEFORE restoring the input sign; this is not an abs(x) lookup.
    const position = t * (uniform.samples.length - 1)
    const lower = Math.floor(position), upper = Math.ceil(position), fraction = position - lower
    const epsilon = uniform.endpointEpsilon ?? 0
    const value = fraction < epsilon ? uniform.samples[lower]
      : fraction > 1 - epsilon ? uniform.samples[upper]
        : uniform.samples[lower] + (uniform.samples[upper] - uniform.samples[lower]) * fraction
    return uniform.preserveInputSign && (x < 0 || Object.is(x,-0)) ? -Math.abs(value) : value
  }
  if (t <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    if (t > x1) continue
    const [x0, y0] = curve[i - 1]
    const span = x1 - x0
    return span <= 0 ? y1 : y0 + (y1 - y0) * ((t - x0) / span)
  }
  return curve[curve.length - 1][1]
}
