import { describe, expect, it, vi } from 'vitest'
import { PaperWetness, WET_DRY_MS } from './paperWetness'

function exact(f: PaperWetness, minCx: number, minCy: number, step: number, w: number, h: number, now: number) {
  const baselineWet = f.raster(minCx, minCy, step, w, h, now)
  const baselinePool = f.rasterPool(minCx, minCy, step, w, h, now)
  const actual = f.rasterWetAndPool(minCx, minCy, step, w, h, now)
  expect(Buffer.compare(Buffer.from(actual.wet.buffer), Buffer.from(baselineWet.buffer))).toBe(0)
  expect(Buffer.compare(Buffer.from(actual.pool.buffer), Buffer.from(baselinePool.buffer))).toBe(0)
}

describe('paired display raster', () => {
  it('keeps independent maxima for mixed layers, pending water, collisions and drying', () => {
    const f = new PaperWetness()
    for (let i = 0; i < 24; i++) {
      f.deposit(i % 2 ? 'A' : 'B', i * 17 - 180, (i % 5) * 25 - 80, 30 + i,
        .02 + (i % 9) * .11, i * 2000, i % 3 === 0, i % 4 === 0 ? 0 : .91 - (i % 8) * .1)
    }
    for (const now of [0, 5000, WET_DRY_MS / 2, WET_DRY_MS * 2]) {
      for (const step of [1, 2, 7]) {
        exact(f, -40, -30, step, 162, 100, now)
        exact(f, 2, 1, step, 3, 1, now)
      }
    }
    f.forgetLayer('A'); exact(f, -40, -30, 2, 162, 100, 20000)
    f.clear(); exact(f, -40, -30, 2, 162, 100, 20000)
  })

  it('preserves rasterPool predicate for a NaN decay rather than replacing it with wet > 0', () => {
    const f = new PaperWetness()
    f.deposit('A', 0, 0, 8, 1, 0, false, .7)
    exact(f, -2, -2, 1, 5, 5, Number.NaN)
  })

  it('decays each eligible cell once, never once per output', () => {
    const f = new PaperWetness()
    f.deposit('A', 0, 0, 8, 1, 0, false, .7)
    const probe = PaperWetness as unknown as { _decayed(cell: unknown, now: number): number }
    const spy = vi.spyOn(probe, '_decayed')
    f.raster(-2, -2, 1, 5, 5, 10); f.rasterPool(-2, -2, 1, 5, 5, 10)
    const before = spy.mock.calls.length
    spy.mockClear(); f.rasterWetAndPool(-2, -2, 1, 5, 5, 10)
    expect(spy.mock.calls.length).toBeGreaterThan(0)
    expect(spy.mock.calls.length * 2).toBe(before)
    spy.mockRestore()
  })
})
