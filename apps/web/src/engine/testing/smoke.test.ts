// Smoke test for the MockGL-backed test harness itself (#101) — not part of
// the structural undo/redo coverage, just verifying the harness produces a
// working PencilEngine before building real assertions on top of it.
import { describe, expect, it } from 'vitest'

import { createTestEngine, fillStroke, hasLayerBuffer, readLayerPixels } from './engineTestUtils'

describe('engine test harness smoke test', () => {
  it('constructs a real PencilEngine against MockGL and paints a stroke into a layer buffer', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('layer-1')
    expect(hasLayerBuffer(engine, 'layer-1')).toBe(true)

    const before = readLayerPixels(engine, 'layer-1')!
    expect(before.every(v => v === 0)).toBe(true)

    engine.appendOperation(fillStroke('user-a', 'layer-1', 4, 4, 6))
    const after = readLayerPixels(engine, 'layer-1')!
    expect(after.some(v => v > 0)).toBe(true)
    // Center pixel should be fully painted.
    const centerIdx = (4 * 8 + 4) * 4
    expect(after[centerIdx]).toBeGreaterThan(200)
  })
})
