import { it, expect } from 'vitest'
import { BrushDragRasterWorkspace, brushDragContacts, brushDragField, type BrushTravel } from './brushDrag'

it('keeps every field byte and payload ownership across growing/shrinking scratch reuse', () => {
  const workspace = new BrushDragRasterWorkspace()
  const retained: Array<{ pixels: Uint8Array; bytes: Uint8Array }> = []
  const travel: BrushTravel[] = [
    { x: 21, y: 19, radius: 16, aspect: 2, angle: .7, dx: 20, dy: -7, water: 1 },
    { x: 25, y: 23, radius: 17, aspect: .8, angle: -1.1, dx: -20, dy: 7, water: .7 },
    { x: 26, y: 21, radius: 15, aspect: 1.3, angle: 1, dx: 1, dy: 13, water: .15 },
  ]
  for (const size of [40, 20, 60, 20, 60, 40]) {
    const rect = { x: -3, y: -7, w: size + 1, h: size + 3 }
    const plain = brushDragField(travel, rect)!
    const reused = brushDragField(travel, rect, 4, workspace)!
    expect(reused).toEqual(plain)
    retained.push({ pixels: reused.pixels, bytes: reused.pixels.slice() })
  }
  expect(workspace.allocations).toBe(6)
  expect(workspace.reuses).toBe(4)
  for (const { pixels, bytes } of retained) expect(pixels).toEqual(bytes)
  const zero = brushDragField([{ ...travel[0], water: 0 }], { x: 0, y: 0, w: 20, h: 20 }, 4, workspace)!
  for (let i = 0; i < zero.pixels.length; i += 4) expect([...zero.pixels.subarray(i, i + 4)]).toEqual([128, 128, 0, 255])
})

it('preserves exact chronological contact grouping and all independent output payloads', () => {
  const travel = Array.from({ length: 30 }, (_, i): BrushTravel => ({
    x: 32 + (i % 7) * 9, y: 31 + Math.floor(i / 7) * 8,
    radius: 16 + i % 3, aspect: 1.3, angle: .2, dx: i % 2 ? -9 : 9, dy: 3, water: .9,
  }))
  const rect = { x: 0, y: 0, w: 128, h: 128 }
  const workspace = new BrushDragRasterWorkspace()
  const plain = brushDragContacts(travel, rect)
  const reused = brushDragContacts(travel, rect, workspace)
  expect(reused).toEqual(plain)
  expect(new Set(reused.map(c => c.field.pixels.buffer)).size).toBe(reused.length)
  expect(workspace.reuses).toBeGreaterThan(0)
})
