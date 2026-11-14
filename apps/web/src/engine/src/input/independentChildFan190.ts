import { shortestSourceTurn, sourceDrawingDirection, sourceFanRequests, type SourcePaintInformation } from './kritaStrokeInput'

/** Child paintLine history, separate from the parent cursor and parent fan.
 * Value-only state survives normal scratch cloning and network chunk boundaries. */
export interface IndependentChildFan190State {
  previous?: SourcePaintInformation
}
export interface IndependentChildFan190Request {
  readonly information: SourcePaintInformation
  /** Project other source values (e.g. unpressured diameter) before shaping. */
  readonly fraction: number
  readonly fan: boolean
}

/** Expand one actually sampled child request, not a parent pointer segment.
 * Source paintLine emits fan paintAt calls before the normal child paintAt.
 * Fan pressure/tilt/pen/time interpolation comes from the existing source law. */
export function independentChildFan190Requests(state: IndependentChildFan190State, next: SourcePaintInformation, stepDegrees?: number): IndependentChildFan190Request[] {
  if (stepDegrees !== undefined && (!Number.isInteger(stepDegrees) || stepDegrees < 5 || stepDegrees > 90)) throw Error('Unsupported child fan step')
  for (const value of [next.x, next.y, next.angle, next.pressure, next.tiltX, next.tiltY, next.t]) {
    if (!Number.isFinite(value)) throw Error('Invalid child fan paint information')
  }
  if (next.normalizedSpeed !== undefined && !Number.isFinite(next.normalizedSpeed)) throw Error('Invalid child fan speed')
  const previous = state.previous
  const information = { ...next, angle: previous ? sourceDrawingDirection(previous, next, previous.angle) : next.angle }
  const requests: IndependentChildFan190Request[] = []
  if (previous && stepDegrees !== undefined) {
    const fans = sourceFanRequests(previous, information, stepDegrees)
    const fullDistance = shortestSourceTurn(previous.angle, information.angle)
    for (let i = 0; i < fans.length; i++) requests.push({ information: fans[i], fraction: stepDegrees * Math.PI / 180 * i / fullDistance, fan: true })
  }
  requests.push({ information, fraction: 1, fan: false })
  // The terminal normal paintAt owns the next segment's direction/paint info.
  state.previous = { ...information }
  return requests
}
