import { SOURCE_SENSOR_ORDER, type SourceOption, type SourceSensor, type SourceSensorId } from './sourceOption'
import { sourceCurveIsIdentity, sourceCurveTransfer, type SourceCurvePoint, type SourceCurvePolynomial } from './sourceCurve'
import { sourceSensorValue, type SourceSensorInput, type SourceSensorLaw } from './sourceSensors'

export interface SourceProgramSensor {
  readonly id: SourceSensorId
  readonly length?: number
  readonly periodic?: boolean
  readonly angleOffset?: number
  readonly lockedAngle?: boolean
  /** Already selected native common/per-sensor curve after settings reader. */
  readonly curve: { readonly points: readonly SourceCurvePoint[]; readonly coefficients?: SourceCurvePolynomial['coefficients']; readonly arithmetic?: 'installed-arm64-fused-v1' }
}
export interface SourceOptionProgramInput {
  readonly id: string
  readonly checked: boolean
  readonly useCurve: boolean
  readonly curveMode: number
  readonly strength: number
  readonly min: number
  readonly max: number
  readonly sensors: readonly SourceProgramSensor[]
}
export interface SourceOptionProgram { bind(input: SourceSensorInput): SourceOption }
const additive = new Set<SourceSensorId>(['rotation', 'tiltDirection', 'fuzzyPerDab', 'fuzzyPerStroke'])
/** Compile native option DATA, not an alternative KPP/XML settings reader.
 * All active sensors/common-curve selection/checkability must already follow
 * the pinned reader. No arbitrary-points solver or static stock allowlist. */
export function compileSourceOptionProgram(input: SourceOptionProgramInput): SourceOptionProgram {
  if (typeof input.id !== 'string' || !input.id.length || input.id.length > 128
    || typeof input.checked !== 'boolean' || typeof input.useCurve !== 'boolean'
    || !Number.isInteger(input.curveMode) || ![input.strength, input.min, input.max].every(Number.isFinite)
    || input.min > input.max) throw new RangeError('Invalid native option program')
  const seen = new Set<SourceSensorId>()
  const sensors = input.sensors.map(sensor => {
    if (!SOURCE_SENSOR_ORDER.includes(sensor.id) || seen.has(sensor.id)) throw new RangeError('Unknown or duplicate native sensor program')
    seen.add(sensor.id)
    const kind: SourceSensor['kind'] = additive.has(sensor.id) ? 'additive' : sensor.id === 'drawingAngle' ? 'absolute' : 'scaling'
    if(sensor.curve.arithmetic!==undefined && sensor.curve.arithmetic!=='installed-arm64-fused-v1')throw new RangeError('Unsupported native sensor curve arithmetic')
    const identity=sourceCurveIsIdentity(sensor.curve.points)
    const unavailable=!identity && sensor.curve.coefficients === undefined && (!input.checked || !input.useCurve)
    const transfer=identity || unavailable ? undefined
      : sourceCurveTransfer({ points: sensor.curve.points, coefficients: sensor.curve.coefficients ?? [] },sensor.curve.arithmetic===undefined?undefined:{layout:'sensor',arithmetic:sensor.curve.arithmetic})
    if (sensor.id === 'time' || sensor.id === 'fade' || sensor.id === 'distance') {
      if (!Number.isInteger(sensor.length) || sensor.length! < 1 || sensor.length! > 2147483647 || typeof sensor.periodic !== 'boolean') throw new RangeError('Invalid native sensor length program')
    }
    if (sensor.id === 'drawingAngle' && (!Number.isFinite(sensor.angleOffset) || typeof sensor.lockedAngle !== 'boolean')) throw new RangeError('Missing native drawing angle law')
    const law = Object.freeze({ id: sensor.id, length: sensor.length, periodic: sensor.periodic, angleOffset: sensor.angleOffset, lockedAngle: sensor.lockedAngle })
    return { id: sensor.id, kind, transfer: transfer && Object.freeze(transfer), unavailable, law }
  }).sort((a, b) => SOURCE_SENSOR_ORDER.indexOf(a.id) - SOURCE_SENSOR_ORDER.indexOf(b.id))
  if (!sensors.length) throw new RangeError('Native active sensor fallback must be resolved before compilation')
  const base = { id: input.id, checked: input.checked, useCurve: input.useCurve, curveMode: input.curveMode, strength: input.strength, min: input.min, max: input.max }
  return Object.freeze({ bind: (packet: SourceSensorInput): SourceOption => ({
    ...base,
    sensors: sensors.map(sensor => {
      const bound:SourceSensor={id:sensor.id,kind:sensor.kind,transfer:sensor.transfer,
        parameter:sensor.id === 'fuzzyPerDab' || sensor.id === 'fuzzyPerStroke' ? undefined : sourceSensorValue(sensor.law as SourceSensorLaw,packet)}
      // Apply skips this inactive consumer. A direct component caller must not
      // accidentally turn its unavailable nonlinear curve into identity.
      if(sensor.unavailable)Object.defineProperty(bound,'transfer',{enumerable:true,get:()=>{throw new RangeError('Inactive native curve transfer unavailable')}})
      return bound
    }),
  }) })
}
