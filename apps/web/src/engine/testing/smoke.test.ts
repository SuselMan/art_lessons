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

  // #15: MockGL deliberately never rasterizes the 'display'-tagged passes
  // (see mockGL.ts's drawArrays comment) — both DISPLAY_FRAG and the new
  // DISPLAY_TRANSPARENT_FRAG are tagged 'display' (they both reference
  // u_accumulation), so there's no real pixel output to assert on here.
  // What this *does* exercise under MockGL: the new program/uniform wiring
  // (_dispTransparentProg, _composeToFBO, _displayTransparent) runs without
  // throwing for both the default (paper) and transparent variants, and
  // getOperations() — session-save's data source — reflects an appended
  // stroke. Real transparency (alpha=0 outside strokes, alpha>0 inside) is
  // verified separately in a real browser (see PR description).
  it('exportPNG resolves for both variants and getOperations reflects appended strokes', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('layer-1')
    engine.setActiveLayer('layer-1')
    engine.appendOperation(fillStroke('user-a', 'layer-1', 4, 4, 6))

    // The fake canvas's toBlob always resolves with null (see engineTestUtils'
    // createMockCanvas) — this just proves neither code path throws.
    await expect(engine.exportPNG()).resolves.toBeNull()
    await expect(engine.exportPNG(true)).resolves.toBeNull()

    const ops = engine.getOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('stroke')
  })
})
