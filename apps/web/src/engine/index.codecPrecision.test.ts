import { expect, it, vi } from 'vitest'
import { packDabs, unpackDabs, type Dab } from '@grafetto/shared'
import { createTestEngine } from './testing/engineTestUtils'
import { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'
import { codecDab } from './src/dabs/codecDab'

const dab: Dab = { x: 100.123456789, y: 200.23456789, pressure: .8123456789, tiltX: 3.123456789, tiltY: -2.123456789, size: 80.123456789, aspectRatio: 1.23456789, angle: .123456789, opacity: .99123456789, t: 1000.123456789 }
it('matches the permanent codec exactly without changing its bytes or recorded dab', () => {
  const before = { ...dab }, canonical = codecDab(dab)
  expect(canonical).toEqual(unpackDabs(packDabs([dab]))[0])
  expect(packDabs([canonical])).toBe(packDabs([dab]))
  expect(dab).toEqual(before)
  expect(codecDab(canonical)).toBe(canonical)
})
it('native watercolor enters ribbon geometry with codec inputs and returns standing keyed by original retained dabs', () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const dropped = { ...dab, x: dab.x + 10 }, previous = { ...dab, x: dab.x - 10 }
  const seam = engine as unknown as { _paintRibbonDabs: (...args: unknown[]) => Map<Dab, number> }
  const spy = vi.spyOn(seam, '_paintRibbonDabs').mockImplementation((...args) => new Map([[(args[1] as Dab[])[0], .6]]))
  try {
    const result = engine['_paintDabs'](engine['_compositeFBO'], [dab, dropped], 'watercolor', 'normal:100:100:PB29:round', [.2, .3, .6], 'self', previous, scratch, 'gesture', 'wash', '00', [1, 2])
    const args = spy.mock.calls[0] as unknown[]
    expect(args[1]).toEqual(unpackDabs(packDabs([dab, dropped])))
    expect(args[6]).toEqual(unpackDabs(packDabs([previous]))[0])
    expect(args[9]).toBe('00'); expect(args[10]).toEqual([1, 2])
    expect(result?.get(dab)).toBe(.6)
    expect(result?.has(dropped)).toBe(false)
    expect(result?.has((args[1] as Dab[])[0])).toBe(false)
    expect(dab.x).toBe(100.123456789)
  } finally { spy.mockRestore(); scratch.destroy(); engine.destroy() }
})
