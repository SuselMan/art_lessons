import { describe, expect, it } from 'vitest'
import { PartialFrontProgress } from './partialFrontProgress'
import { washRevealStep } from './washReveal'

describe('private physical presentation progress', () => {
  it('follows actual unit relaxation progress, bounded by source stencil margin', () => {
    for (const quantum of [1, 4]) {
      const c = new PartialFrontProgress(11, 100)
      let done = 0
      for (let i = 0; i < 20; i += quantum) {
        const n = c.advance(quantum)
        expect(n).toBeLessThanOrEqual(quantum)
        for (let j = 0; j < n; j++) { c.commit(); done++ }
        expect(done).toBeLessThanOrEqual(11)
      }
      expect(done).toBe(11)
      expect(c.target(200)?.steps).toBe(11)
    }
  })
  it('rejects invalid progress and backwards publication clocks without reviving work', () => {
    const c = new PartialFrontProgress(3, 100)
    expect(c.advance(NaN)).toBe(0); expect(c.advance(-1)).toBe(0)
    expect(c.advance(1.5)).toBe(0)
    expect(c.target(99)).toBeUndefined(); expect(c.target(NaN)).toBeUndefined()
    expect(c.target(200)?.tauMs).toBe(150)
    expect(c.target(200)).toBeUndefined()
    expect(c.target(5000)?.tauMs).toBe(1400)
  })
  it('keeps a bounded continuous interpolation of actual targets, never overshooting', () => {
    for (const dt of [-10, 0, 16, 40, 1000]) for (const tau of [1, 50, 150, 1400, Infinity, NaN]) {
      const step = washRevealStep(dt, null, tau)
      expect(step).toBeGreaterThanOrEqual(0)
      expect(step).toBeLessThanOrEqual(1 - Math.exp(-40 / 150))
      const before = .3, actualTarget = .6
      const visible = before + step * (actualTarget - before)
      expect(visible).toBeGreaterThanOrEqual(before); expect(visible).toBeLessThanOrEqual(actualTarget)
    }
    expect(washRevealStep(16, null)).toBe(1 - Math.exp(-16 / 1400))
    expect(washRevealStep(16, 500, 150)).toBe(washRevealStep(16, 500))
  })
})
