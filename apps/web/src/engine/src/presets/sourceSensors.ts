import { type SourceSensorId } from './sourceOption'

export interface SourceSensorInput {
  readonly pressure: number
  readonly maxPressure: number
  readonly tangentialPressure: number
  /** Native already-normalized drawingSpeed(), not browser px/ms. */
  readonly speed: number
  readonly drawingAngle: number
  readonly lockedDrawingAngle: number
  readonly rotation: number
  readonly xTilt: number
  readonly yTilt: number
  readonly tiltDirectionOffset: number
  readonly perspective: number
  readonly time: number
  readonly dabSequence: number
  readonly distance: number
  readonly hover: boolean
}
export interface SourceSensorLaw {
  readonly id: Exclude<SourceSensorId, 'fuzzyPerDab' | 'fuzzyPerStroke'>
  readonly length?: number
  readonly periodic?: boolean
  readonly angleOffset?: number
  readonly lockedAngle?: boolean
}
const fuzzyNull = (value: number): boolean => Math.abs(value) <= 1e-12
const bound = (value: number): number => Math.max(-1, Math.min(value, 1))
/** Scalar native value(info) laws. No curves or random draws in this layer.
 * Transcendental qreal libm conformance is bounded by the recorded CPU fixture;
 * browser input normalization/Qt pen packet interpretation is a separate law. */
export function sourceSensorValue(law: SourceSensorLaw, input: SourceSensorInput): number {
  switch (law.id) {
    case 'pressure': return input.pressure
    case 'pressureIn': return input.hover ? 0 : input.maxPressure
    case 'tangentialPressure': return input.tangentialPressure
    case 'speed': return input.speed
    case 'rotation': return input.rotation / 180
    case 'xTilt': return 1 - Math.abs(input.xTilt) / 60
    case 'yTilt': return 1 - Math.abs(input.yTilt) / 60
    case 'perspective': return input.perspective
    case 'drawingAngle': {
      let result = .5 + (law.lockedAngle ? input.lockedDrawingAngle : input.drawingAngle) / (2 * Math.PI) + (law.angleOffset ?? 0) / 360
      if (result > 1) result -= 1
      return result
    }
    case 'tiltDirection': {
      let direction = fuzzyNull(input.xTilt) && fuzzyNull(input.yTilt)
        ? -(input.xTilt >= 0 ? 1 : -1) * (input.yTilt >= 0 ? 1 : -1) * (Math.PI / 2)
        : Math.atan2(-input.xTilt, input.yTilt)
      if (!fuzzyNull(input.tiltDirectionOffset)) {
        direction += input.tiltDirectionOffset * Math.PI / 180
        if (direction < -Math.PI) direction += 2 * Math.PI
        else if (direction > Math.PI) direction -= 2 * Math.PI
      }
      return -1 + 2 * (direction / (2 * Math.PI) + .5)
    }
    case 'tiltElevation': {
      const x = bound(input.xTilt / 60), y = bound(input.yTilt / 60)
      const e = Math.abs(x) > Math.abs(y) ? Math.sqrt(1 + y * y) : Math.sqrt(1 + x * x)
      return Math.acos(Math.sqrt(x * x + y * y) / e) / (Math.PI * .5)
    }
    case 'time': case 'fade': case 'distance': {
      if (!Number.isInteger(law.length) || law.length! < 1 || law.length! > 2147483647 || typeof law.periodic !== 'boolean') throw new RangeError('Invalid native sensor length/periodic law')
      if (input.hover) return 1
      const value = law.id === 'time' ? input.time : law.id === 'fade' ? input.dabSequence : input.distance
      if (law.id === 'fade' && (!Number.isInteger(value) || value < 0 || value > 2147483647)) throw new RangeError('Invalid native dab sequence')
      return (law.periodic ? value % law.length! : Math.min(value, law.length!)) / law.length!
    }
    default: throw new RangeError('Unknown native deterministic sensor')
  }
}
