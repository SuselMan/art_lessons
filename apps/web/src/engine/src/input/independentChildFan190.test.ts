import { describe, expect, it } from 'vitest'
import { independentChildFan190Requests, type IndependentChildFan190State } from './independentChildFan190'
import { sourceDrawingDirection, sourceFanRequests, type SourcePaintInformation } from './kritaStrokeInput'

const point = (x: number, y: number, extra: Partial<SourcePaintInformation> = {}): SourcePaintInformation => ({ x, y, angle: 0, pressure: .2, tiltX: 0, tiltY: 10, t: 5, ...extra })
describe('independent child190 paintLine fan', () => {
  it('uses child sampled geometry despite unrelated incoming parent directions', () => {
    const state: IndependentChildFan190State = {}
    independentChildFan190Requests(state, point(0, 0), 30)
    independentChildFan190Requests(state, point(10, 0, { angle: Math.PI }), 30)
    const next = point(10, 10, { angle: -.3, pressure: .8, tiltX: 20, t: 105 })
    const requests = independentChildFan190Requests(state, next, 30)
    const ownAngle = sourceDrawingDirection(point(10, 0), next, 0)
    expect(requests.slice(0, -1).map(r => r.information)).toEqual(sourceFanRequests(point(10, 0), { ...next, angle: ownAngle }, 30))
    expect(requests[0].fraction).toBe(0)
    expect(requests[0].information.x).toBe(10)
    expect(requests[0].information.y).toBe(0)
    expect(requests[0].information.pressure).toBe(.2)
    expect(requests.at(-1)).toEqual({ information: { ...next, angle: ownAngle }, fraction: 1, fan: false })
    // Projection uses source pressure before a nonlinear child size curve.
    expect(requests[0].information.pressure ** 2).toBeCloseTo(.04)
  })
  it('retains only child history across chunks and clone/rollback branches', () => {
    const input = [point(0, 0), point(20, 0), point(20, 20), point(0, 20), point(0, 0), point(20, 0)]
    const run = (chunk: number) => {
      let state: IndependentChildFan190State = {}
      const output = []
      for (let i = 0; i < input.length; i += chunk) {
        for (const p of input.slice(i, i + chunk)) output.push(...independentChildFan190Requests(state, p, 15))
        state = structuredClone(state)
      }
      return { state, output }
    }
    expect(run(1)).toEqual(run(6))
    const state: IndependentChildFan190State = {}
    independentChildFan190Requests(state, point(0, 0), 30)
    const fork = structuredClone(state)
    independentChildFan190Requests(fork, point(0, 10), 30)
    expect(state.previous).toEqual(point(0, 0))
  })
  it('does not inherit parent fans and keeps same-position fallback and no-fan policy', () => {
    const state: IndependentChildFan190State = {}
    expect(independentChildFan190Requests(state, point(0, 0, { angle: .75 }), 5)).toHaveLength(1)
    expect(independentChildFan190Requests(state, point(0, 0, { angle: -2 }), 5)).toEqual([{ information: point(0, 0, { angle: .75 }), fraction: 1, fan: false }])
    expect(independentChildFan190Requests(state, point(0, 10))).toHaveLength(1)
  })
  it('bounds a native 5 degree half-turn and rejects invalid settings before state mutation', () => {
    const state: IndependentChildFan190State = {}
    independentChildFan190Requests(state, point(0, 0), 5)
    const out = independentChildFan190Requests(state, point(-1, 0), 5)
    expect(out.length).toBeLessThanOrEqual(38)
    expect(out.length).toBeGreaterThan(30)
    for (const step of [4, 91, 5.5, NaN, Infinity]) {
      const before = structuredClone(state)
      expect(() => independentChildFan190Requests(state, point(0, 1), step)).toThrow()
      expect(state).toEqual(before)
    }
    const before = structuredClone(state)
    expect(() => independentChildFan190Requests(state, point(Infinity, 0), 30)).toThrow()
    expect(state).toEqual(before)
  })
})
