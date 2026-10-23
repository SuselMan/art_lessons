import { describe, expect, it } from 'vitest'
import { brushDragField, type BrushTravel } from './brushDrag'
import { brushDragFieldWork } from './brushDragFieldWork'

const motion: BrushTravel = { x: 180, y: 160, radius: 200, aspect: 1.3, angle: .73, dx: 24, dy: -12, water: .8 }
function exact(d: BrushTravel, rect: { x: number; y: number; w: number; h: number }, cell: number) {
  // The bounded generator retains the original three Float32 work grids;
  // it is an independent pre-optimization oracle for the direct single path.
  const work = brushDragFieldWork([d], rect, cell)
  let result = work.next()
  while (!result.done) result = work.next()
  const actual = brushDragField([d], rect, cell)!
  const baseline = result.value!
  expect([actual.width, actual.height]).toEqual([baseline.width, baseline.height])
  expect(Buffer.compare(Buffer.from(actual.pixels), Buffer.from(baseline.pixels))).toBe(0)
}

describe('direct single contact field', () => {
  it.each([1, 2, 4, 8])('preserves rounded/clipped/chisel400 bytes at cell size %s', cell => {
    exact(motion, { x: -40, y: -40, w: 500, h: 400 }, cell)
    exact({ ...motion, aspect: 2.5, angle: -.41, dx: -17, dy: 32 }, { x: 70, y: 50, w: 200, h: 180 }, cell)
    exact({ ...motion, radius: 0, x: .25, y: .5 }, { x: 0, y: 0, w: 2, h: 2 }, cell)
  })

  it('preserves quantized cancellation, tiny exposure, signed zero and nonfinite input behavior', () => {
    const rect = { x: 0, y: 0, w: 40, h: 30 }
    for (const patch of [
      { water: 0 }, { water: -1 }, { water: 1e-16 }, { water: Number.NaN }, { water: Infinity },
      { dx: 0, dy: -0 }, { dx: Infinity }, { angle: Number.NaN }, { radius: Number.NaN },
      { dx: .010001, dy: 0 }, { dx: .0099, dy: 0 },
    ]) exact({ ...motion, x: 20, y: 10, radius: 10, ...patch }, rect, 2)
  })

  it('matches the old accumulation for deterministic varied poses and crops', () => {
    let seed = 728
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let i = 0; i < 100; i++) {
      const d = { ...motion, x: random() * 80 - 20, y: random() * 70 - 20,
        radius: random() * 50, aspect: random() * 4, angle: (random() - .5) * Math.PI * 4,
        dx: (random() - .5) * 90, dy: (random() - .5) * 90, water: random() * 1.2 }
      exact(d, { x: 0, y: -10, w: 53, h: 41 }, i % 3 + 1)
    }
  })
})
