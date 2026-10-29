import { sourceAtan2F32 } from './sourceAtan2F32'

/** Pinned bd6e8d0 history/fan laws with explicit AOSP13 source-version F32
 * direction math. Authoring only: render/replay consumes recorded sourceAngle.
 * This does not assert identity with every installed platform libm binary. */
export interface CursorPoint { x: number; y: number }
export interface CursorHistory { first: CursorPoint; second: CursorPoint }
export function createCursorHistory(): CursorHistory {
  return { first: { x: 0, y: 0 }, second: { x: 0, y: 0 } }
}
export function pushCursorHistory(state: CursorHistory, point: CursorPoint, zoom: number): CursorPoint {
  if (!Number.isFinite(zoom) || zoom <= 0) throw Error('Invalid source input zoom')
  const distance = Math.min(Math.abs(point.x - state.second.x), Math.abs(point.y - state.second.y))
  if (Math.min(1, distance / (7 / zoom)) > 1 - Number.EPSILON) {
    const previous = state.second
    state.first = previous
    state.second = { ...point }
    return { ...previous }
  }
  return { ...state.first }
}
function fuzzy(a: number, b: number): boolean {
  return Math.abs(a - b) * 1e12 <= Math.min(Math.abs(a), Math.abs(b))
}
export function sourceDrawingDirection(previous: CursorPoint, point: CursorPoint, fallback: number): number {
  return fuzzy(previous.x, point.x) && fuzzy(previous.y, point.y) ? fallback
    : sourceAtan2F32(point.y - previous.y, point.x - previous.x)
}
export function startCursorDirection(state: CursorHistory, point: CursorPoint, zoom: number, touch = false): number {
  if (touch) state.first = state.second = { ...point }
  return sourceDrawingDirection(pushCursorHistory(state, point, zoom), point, 0)
}
export interface SourcePaintInformation extends CursorPoint {
  angle: number
  pressure: number
  tiltX: number
  tiltY: number
  t: number
  normalizedSpeed?: number
}
export function shortestSourceTurn(a: number, b: number): number {
  const distance = Math.abs(a - b) % (2 * Math.PI)
  return distance > Math.PI ? 2 * Math.PI - distance : distance
}
/** Override angles stay in author precision until the normal operation codec.
 * The first fan has fraction ZERO. It is a new paint request at the prior point.
 */
export function sourceFanRequests(previous: SourcePaintInformation, next: SourcePaintInformation, stepDegrees: number): SourcePaintInformation[] {
  if (!Number.isInteger(stepDegrees) || stepDegrees < 5 || stepDegrees > 90) throw Error('Unsupported source fan step')
  const step = stepDegrees * Math.PI / 180, fullDistance = shortestSourceTurn(previous.angle, next.angle)
  let angle = previous.angle, index = 0
  const result: SourcePaintInformation[] = []
  while (shortestSourceTurn(angle, next.angle) > step) {
    if (index >= 64) throw Error('Source fan request budget exceeded')
    const plus = angle + step, minus = angle - step
    angle = shortestSourceTurn(plus, next.angle) < shortestSourceTurn(minus, next.angle) ? plus : minus
    const t = step * index++ / fullDistance
    const mix = (a: number, b: number): number => a + t * (b - a)
    result.push({ x: mix(previous.x, next.x), y: mix(previous.y, next.y), angle,
      pressure: mix(previous.pressure, next.pressure), tiltX: mix(previous.tiltX, next.tiltX),
      tiltY: mix(previous.tiltY, next.tiltY), t: mix(previous.t, next.t),
      ...(previous.normalizedSpeed === undefined || next.normalizedSpeed === undefined ? {}
        : { normalizedSpeed: mix(previous.normalizedSpeed, next.normalizedSpeed) }),
    })
  }
  return result
}
