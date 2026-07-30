// (#365) Mip levels for the live paper grain in an infinite room.
//
// The grain is baked at ~13 texels per world unit (PAPER_BAKE_RESOLUTION over
// PAPER_WORLD_SIZE) and PAPER_COMPOSE_FRAG takes one tap per output pixel at
// that pixel's world position — so it point-samples a footprint 13 texels
// wide even at 1 world unit = 1 pixel, and hundreds wide when zoomed out.
// That is why an infinite room's paper crawls where a bounded room's (a
// different program, scaled by the browser's compositor) does not.
//
// The tests that matter here are the *restore* ones. This texture is shared
// with the paint path, and mip levels must never reach it there: level
// selection is implementation-defined, graphite deposit depends on the
// grain, and that deposit is baked into content every participant sees
// (.claude/rules.md, "Cross-device pixel determinism"). A leaked mip filter
// would not fail visibly on the machine that leaked it — it would quietly
// make one device's strokes differ from another's, which is exactly the
// failure that already bit this system three times.
import { describe, expect, it } from 'vitest'

import { createTestEngine, fillStroke, makeLayerAdd, paperMipState, paperReady, readCompositePixels } from './testing/engineTestUtils'
import { __resetPaperLoaderForTesting, __setPaperLoaderForTesting } from './src/paperLoader'
import { PAPER_BAKE_RESOLUTION } from './src/paperConstants'

async function engineWithPaper(infinite: boolean) {
  __setPaperLoaderForTesting(async () =>
    new Uint8Array(PAPER_BAKE_RESOLUTION * PAPER_BAKE_RESOLUTION * 2).fill(128))
  try {
    const { engine } = createTestEngine({ userId: 'user-a', infinite, paper: 'coarse' }, { width: 64, height: 64 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 0, 0, 15))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    return engine
  } finally {
    __resetPaperLoaderForTesting()
  }
}

describe('paper grain mip levels (#365)', () => {
  it('builds a chain when the baked texture is uploaded', async () => {
    const engine = await engineWithPaper(true)
    expect(paperMipState(engine).generations).toBeGreaterThan(0)
  })

  it('leaves the texture on a plain filter once a display pass is done with it', async () => {
    // The determinism guard: any dab drawn after this frame must sample
    // level 0, exactly as it did before #365.
    const engine = await engineWithPaper(true)
    engine.setInfiniteCamera(0, 0, 0.25, 0)
    readCompositePixels(engine)

    const state = paperMipState(engine)
    // Asserted together on purpose: without the first line this test would
    // pass just as happily if mip levels were never switched on at all,
    // which is the one way a restore test can quietly stop testing anything.
    expect(state.generations).toBeGreaterThan(0)
    expect(state.askingForMips).toBe(false)
  })

  it('leaves it on a plain filter at 1:1 too, not just when zoomed out', async () => {
    // The switch is unconditional rather than zoom-gated (see
    // _bindPaperForCompose — the grain is minified at every zoom), so the
    // restore has to hold at every zoom as well.
    const engine = await engineWithPaper(true)
    engine.setInfiniteCamera(0, 0, 1, 0)
    readCompositePixels(engine)
    expect(paperMipState(engine).askingForMips).toBe(false)
  })

  it('still holds after painting and displaying repeatedly', async () => {
    // Interleaves the two paths the way real drawing does, since a leak
    // would only ever be observable from the paint side.
    const engine = await engineWithPaper(true)
    engine.setInfiniteCamera(0, 0, 0.5, 0)
    for (let i = 0; i < 3; i++) {
      engine.appendOperation(fillStroke('user-a', 'L', 30 * i, 20, 8))
      readCompositePixels(engine)
      expect(paperMipState(engine).askingForMips).toBe(false)
    }
  })

  it('never asks for mips in a bounded room, which displays through another program entirely', async () => {
    const engine = await engineWithPaper(false)
    readCompositePixels(engine)
    expect(paperMipState(engine).askingForMips).toBe(false)
  })
})
