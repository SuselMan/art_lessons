import { expect, it } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'
import type { PaperWetness } from './src/paper/paperWetness'

type Rect = { minX: number; minY: number; maxX: number; maxY: number }
it('repainting a brush includes the old and new extent of an updated global wet map', () => {
  const { engine } = createTestEngine({}, { width: 256, height: 256 })
  const e = engine as unknown as {
    _takePaperPartial(): Rect | null
    _markPaperDamage(rect: Rect): void
    _wetRect: [number, number, number, number]
    _wetTexAt: number
    _paperWet: PaperWetness
  }
  e._takePaperPartial() // establish the screen cache and camera key
  e._wetRect = [24, 24, 120, 120]
  e._paperWet.deposit('L', 190, 190, 20, 1, performance.now())
  e._wetTexAt = -Infinity
  e._markPaperDamage({ minX: 180, minY: 180, maxX: 200, maxY: 200 })
  const rect = e._takePaperPartial()
  expect(rect).not.toBeNull()
  expect(rect!.minX).toBeLessThanOrEqual(24)
  expect(rect!.minY).toBeLessThanOrEqual(24)
  expect(rect!.maxX).toBeGreaterThanOrEqual(e._wetRect[2])
  expect(rect!.maxY).toBeGreaterThanOrEqual(e._wetRect[3])
  engine.destroy()
})
