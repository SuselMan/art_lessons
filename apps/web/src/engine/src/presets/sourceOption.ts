import { KritaPerStrokeRandomSource, KritaRandomSource } from './nativeRandom'

/** Pinned KisCurveOption sensor construction order, independent of XML/key order. */
export const SOURCE_SENSOR_ORDER = [
  'pressure', 'pressureIn', 'tangentialPressure', 'drawingAngle', 'xTilt', 'yTilt',
  'tiltDirection', 'tiltElevation', 'rotation', 'fuzzyPerDab', 'fuzzyPerStroke',
  'speed', 'fade', 'distance', 'time', 'perspective',
] as const
export type SourceSensorId = typeof SOURCE_SENSOR_ORDER[number]
export interface SourceSensor {
  readonly id: SourceSensorId
  readonly kind: 'scaling' | 'additive' | 'absolute'
  /** Native value(info) for deterministic sensors; transfer applies its curve below. */
  readonly parameter?: number
  /** Native floatTransfer(256), not control points or a JS spline approximation. */
  readonly transfer?: readonly number[]
}
export interface SourceOption {
  readonly id: string
  readonly checked: boolean
  readonly useCurve: boolean
  readonly curveMode: number
  readonly strength: number
  readonly min: number
  readonly max: number
  readonly sensors: readonly SourceSensor[]
}
export interface SourceOptionComponents {
  constant: number
  scaling: number
  additive: number
  absoluteOffset: number
  hasAbsoluteOffset: boolean
  hasScaling: boolean
  hasAdditive: boolean
  minSizeLikeValue: number
  maxSizeLikeValue: number
}
export interface SourceOptionContext {
  readonly random: KritaRandomSource
  readonly perStroke: KritaPerStrokeRandomSource
  readonly hover: boolean
}
export const sourceWrap = (value: number, min: number, max: number): number => {
  let remainder = (value - min) % (max - min)
  if (remainder < 0) remainder += max - min
  return remainder + min
}

/** Size/rotation combine ONLY already-native sensor parameters. Unknown sensor
 * laws fail instead of silently delegating to the legacy coordinate hash. */
export function sourceOptionComponents(option: SourceOption, context: SourceOptionContext, useStrength = true): SourceOptionComponents {
  const result: SourceOptionComponents = {
    constant: useStrength ? option.strength : 1, scaling: 1, additive: 0, absoluteOffset: 0,
    hasAbsoluteOffset: false, hasScaling: false, hasAdditive: false,
    minSizeLikeValue: option.min, maxSizeLikeValue: option.max,
  }
  if (!option.useCurve) return result
  const sensors = new Map<SourceSensorId, SourceSensor>()
  for (const sensor of option.sensors) {
    if (!SOURCE_SENSOR_ORDER.includes(sensor.id) || sensors.has(sensor.id)) throw new RangeError('Unsupported or duplicate native sensor')
    if (sensor.transfer && (sensor.transfer.length !== 256 || !sensor.transfer.every(Number.isFinite))) throw new RangeError('Expected native 256-entry transfer')
    if (sensor.id !== 'fuzzyPerDab' && sensor.id !== 'fuzzyPerStroke' && (sensor.parameter === undefined || !Number.isFinite(sensor.parameter))) throw new RangeError('Missing native sensor parameter')
    if ((sensor.id === 'fuzzyPerDab' || sensor.id === 'fuzzyPerStroke') && sensor.kind !== 'additive') throw new RangeError('Native fuzzy sensor must be additive')
    sensors.set(sensor.id, sensor)
  }
  const scaling: number[] = []
  for (const id of SOURCE_SENSOR_ORDER) {
    const sensor = sensors.get(id)
    if (!sensor) continue
    const fuzzy = id === 'fuzzyPerDab' || id === 'fuzzyPerStroke'
    let value = fuzzy
      ? context.hover ? 0 : 2 * (id === 'fuzzyPerStroke'
        ? context.perStroke.generateNormalized(option.id + 'FuzzyStroke')
        : context.random.generateNormalized()) - 1
      : sensor.parameter
    if (value === undefined || !Number.isFinite(value)) throw new RangeError('Missing native sensor parameter')
    if (sensor.transfer) {
      const scaled = sensor.kind === 'additive' ? .5 * (1 + value)
        : sensor.kind === 'absolute' ? sourceWrap(value + .5, 0, 1) : value
      const curved = sourceTransfer(scaled, sensor.transfer)
      value = sensor.kind === 'additive' ? -1 + 2 * curved
        : sensor.kind === 'absolute' ? sourceWrap(curved + .5, 0, 1) : curved
    }
    if (sensor.kind === 'additive') {
      result.additive += value
      result.hasAdditive = true
    } else if (sensor.kind === 'absolute') {
      result.absoluteOffset = value
      result.hasAbsoluteOffset = true
    } else {
      scaling.push(value)
      result.hasScaling = true
    }
  }
  if (scaling.length === 1) result.scaling = scaling[0]
  else if (scaling.length > 1) {
    switch (option.curveMode) {
      case 1: result.scaling = scaling.reduce((a, b) => a + b, 0); break
      case 2: result.scaling = Math.max(...scaling); break
      case 3: result.scaling = Math.min(...scaling); break
      case 4: result.scaling = Math.max(...scaling) - Math.min(...scaling); break
      default: result.scaling = scaling.reduce((a, b) => a * b, 1)
    }
  }
  return result
}
export function sourceSizeLike(components: SourceOptionComponents): number {
  const value = components.constant * (components.hasAbsoluteOffset ? components.absoluteOffset : 1)
    * (components.hasScaling ? components.scaling : 1)
    * (components.hasAdditive ? .5 * (1 + components.additive) : 1)
  return Math.max(components.minSizeLikeValue, Math.min(value, components.maxSizeLikeValue))
}
export function sourceRotationLike(components: SourceOptionComponents, normalizedBase: number, flipped: boolean, coefficient: number, disableScaling: boolean): number {
  const offset = !components.hasAbsoluteOffset ? normalizedBase : flipped ? .5 - components.absoluteOffset : components.absoluteOffset
  const scaling = components.hasScaling && !disableScaling ? -1 + 2 * components.scaling : 0
  const value = sourceWrap(2 * offset + components.constant * (coefficient * scaling + (components.hasAdditive ? components.additive : 0)), -1, 1)
  return Number.isNaN(value) ? 0 : value
}
/** Standard options short-circuit unchecked before evaluating random sensors. */
export function sourceStandardOption(option: SourceOption, context: SourceOptionContext): number {
  return option.checked ? sourceSizeLike(sourceOptionComponents(option, context)) : 1
}

/** KisCubicCurve::interpolateLinear: epsilon branches and signed result matter. */
export function sourceTransfer(normalized: number, transfer: readonly number[]): number {
  const max = transfer.length - 1
  const x = Math.max(0, Math.min(max * normalized, max))
  const low = Math.floor(x), high = Math.ceil(x), t = x - low
  const value = t < 1e-6 ? transfer[low] : t > 1 - 1e-6 ? transfer[high]
    : transfer[low] + t * (transfer[high] - transfer[low])
  return normalized >= 0 ? Math.abs(value) : -Math.abs(value)
}
