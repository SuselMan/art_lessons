import { describe, expect, it } from 'vitest'
import { brushDragContactGroups, brushDragContacts, brushDragField, type BrushTravel } from './brushDrag'
import { brushDragFieldWork } from './brushDragFieldWork'

const motion: BrushTravel = { x: 180, y: 160, radius: 200, aspect: 2.5, angle: .73, dx: 24, dy: -12, water: .8 }

describe('bounded CPU contact producer', () => {
  it.each([2, 4, 8])('preserves every encoded byte for rotated return contact cells %s', cell => {
    const travel = Array.from({ length: 12 }, (_, i) => ({ ...motion, x: 130 + i * 6, y: 100 + i * 3, dx: i % 2 ? -24 : 24, angle: i * .31 }))
    const rect = { x: -20, y: -30, w: 640, h: 480 }
    const work = brushDragFieldWork(travel, rect, cell)
    let result = work.next(), yields = 0
    while (!result.done) { yields++; result = work.next() }
    expect(yields).toBeGreaterThan(0)
    const baseline = brushDragField(travel, rect, cell)!
    expect(result.value?.width).toBe(baseline.width)
    expect(result.value?.height).toBe(baseline.height)
    expect(result.value?.pixels).toEqual(baseline.pixels)
  })

  it('keeps grouping, crop and pulse radius in recorded order', () => {
    const travel = Array.from({ length: 24 }, (_, i) => ({ ...motion, x: 130 + i * 8, y: 100 + i * 3, dx: i % 2 ? -24 : 24, settleRadius: 210 }))
    const rect = { x: 0, y: 0, w: 512, h: 512 }
    const eager = brushDragContacts(travel, rect), groups = brushDragContactGroups(travel, rect)
    expect(groups.length).toBeGreaterThan(1)
    expect(groups.map(g => [g.rect, g.radius])).toEqual(eager.map(c => [c.rect, c.radius]))
    for (let i = 0; i < groups.length; i++) {
      const work = brushDragFieldWork(groups[i].travel, groups[i].rect)
      let result = work.next()
      while (!result.done) result = work.next()
      expect(result.value?.pixels).toEqual(eager[i].field.pixels)
    }
  })

  it('closes a suspended field without finishing rasterization', () => {
    const work = brushDragFieldWork([motion], { x: 0, y: 0, w: 1024, h: 1024 })
    expect(work.next().done).toBe(false)
    expect(work.return(null)).toEqual({ value: null, done: true })
    expect(work.next().done).toBe(true)
  })
})

it('bounds raster checkpoints while retaining the actual encoded first contact', () => {
  const rect = { x: 0, y: 0, w: 1024, h: 1024 }
  const eager = brushDragField([motion], rect)!
  const work = brushDragFieldWork([motion], rect)
  // Every accepted cell invokes exp once; skipped cells also count toward
  // the generator checkpoint. This is a work bound, not a wall-time promise.
  const original = Math.exp
  let cells = 0, maxCells = 0
  Math.exp = value => { cells++; return original(value) }
  try {
    let result: ReturnType<typeof work.next>
    do {
      cells = 0; result = work.next(); maxCells = Math.max(maxCells, cells)
    } while (!result.done)
    expect(maxCells).toBeGreaterThan(0)
    expect(maxCells).toBeLessThanOrEqual(256)
    expect(result.value?.pixels).toEqual(eager.pixels)
  } finally { Math.exp = original; work.return(null) }
})
