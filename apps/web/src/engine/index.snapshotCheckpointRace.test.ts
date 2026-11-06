import { expect, it, vi } from 'vitest'
import { createTestEngine, makeStroke, dab, readTilePixels } from './testing/engineTestUtils'

it('a sliced checkpoint started before replacement cannot republish old tiles afterwards', () => {
  vi.useFakeTimers()
  const { engine } = createTestEngine({ userId: 'A', infinite: true }, { width: 8, height: 8 })
  try {
    engine.initLayer('L')
    for (const [seq, x] of [[1, 4], [2, 1028]]) {
      engine.appendOperation(makeStroke('A', 'L', [dab(x, 4, { size: 4, opacity: 0.4 })], { seq }), 'remote')
    }
    engine['_takeCheckpoint']('L') // first tile now, second on the next slice
    expect(engine['_checkpoints'].all()).toHaveLength(0)
    engine.restoreLayerFromSnapshot('L', [], 3)
    vi.advanceTimersByTime(16)
    expect(engine['_checkpoints'].all().filter(cp => !cp.fromSnapshot)).toHaveLength(0)
    engine.appendOperation(makeStroke('A', 'L', [dab(4, 4, { size: 4, opacity: 0.4 })], { seq: 4 }), 'remote')
    engine.undo()
    expect(readTilePixels(engine, 'L', 0, 0)?.some(v => v > 0) ?? false).toBe(false)
  } finally { engine.destroy(); vi.useRealTimers() }
})
