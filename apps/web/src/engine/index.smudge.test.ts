// Engine-level tests for the smudge tool (#14) — see SMUDGE_FRAG's own doc
// comment in shaders.ts for the algorithm this exercises: each dab samples a
// small patch of whatever's currently painted *behind* it and *mixes* the
// destination toward it (not an additive/over deposit — see that shader's
// comment for why an earlier over-blend version could paint unbounded
// graphite from a single small mark, reported after shipping), so graphite
// trails along a stroke without any separate persistent "carried" state.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, fillStroke, makeLayerAdd, makeStroke,
  readLayerPixels, expectPixelsEqual,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

function alphaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3]
}

function setupLayer(width = 64, height = 64, infinite = false) {
  const { engine } = createTestEngine({ userId: 'user-a', infinite }, { width, height })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

describe('smudge tool (#14)', () => {
  it("does nothing on a stroke's very first dab — nothing to smear from yet", () => {
    const engine = setupLayer()
    engine.appendOperation(fillStroke('user-a', 'L', 20, 32, 10))
    const before = readLayerPixels(engine, 'L')

    engine.appendOperation(makeStroke('user-a', 'L', [dab(20, 32, { size: 20 })], { tool: 'smudge' }))

    expectPixelsEqual(before, readLayerPixels(engine, 'L'))
  })

  it('is a no-op on an empty layer (nothing to pick up)', () => {
    const engine = setupLayer()
    const before = readLayerPixels(engine, 'L')

    const dabs = [16, 24, 32, 40].map(x => dab(x, 32, { size: 20 }))
    engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))

    expectPixelsEqual(before, readLayerPixels(engine, 'L'))
  })

  it('drags graphite from behind the dab toward wherever it moves', () => {
    const engine = setupLayer()
    // Solid disc centered (16,32), radius 10 — spans roughly x∈[6,26].
    engine.appendOperation(fillStroke('user-a', 'L', 16, 32, 10))

    const targetX = 40, targetY = 32
    expect(alphaAt(readLayerPixels(engine, 'L')!, 64, targetX, targetY)).toBe(0)

    // Drag rightward, through the disc and beyond it — each dab picks up
    // from ~8px behind (SMUDGE_OFFSET_FACTOR * radius) and redeposits at
    // its own position, so consecutive dabs spaced similarly keep the
    // chain unbroken.
    const smudgeDabs = [16, 24, 32, 40, 48].map(x => dab(x, 32, { size: 20, pressure: 1, opacity: 1 }))
    engine.appendOperation(makeStroke('user-a', 'L', smudgeDabs, { tool: 'smudge' }))

    expect(alphaAt(readLayerPixels(engine, 'L')!, 64, targetX, targetY)).toBeGreaterThan(0)
  })

  it('never deposits its own color — an empty area smudged toward stays fully transparent unless graphite actually reaches it', () => {
    const engine = setupLayer()
    // Disc far from the smudge stroke below — never picked up.
    engine.appendOperation(fillStroke('user-a', 'L', 60, 60, 3))

    const dabs = [4, 8, 12, 16].map(x => dab(x, 8, { size: 6 }))
    engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))

    expect(alphaAt(readLayerPixels(engine, 'L')!, 64, 16, 8)).toBe(0)
  })

  it('is a pure function of the recorded dabs — replaying the same stroke twice from scratch is bit-identical', () => {
    const engineA = setupLayer()
    const engineB = setupLayer()
    const ops = [
      fillStroke('user-a', 'L', 16, 32, 10),
      makeStroke('user-a', 'L', [16, 24, 32, 40, 48].map(x => dab(x, 32, { size: 20 })), { tool: 'smudge' }),
    ]
    for (const op of ops) { engineA.appendOperation(op); engineB.appendOperation(op) }

    expectPixelsEqual(readLayerPixels(engineA, 'L'), readLayerPixels(engineB, 'L'))
  })

  it('skips a dab whose source or destination patch would cross a tile boundary (infinite canvas, v1 limitation)', () => {
    const engine = setupLayer(64, 64, true)
    // Paint solid content straddling the tile boundary at world x=TILE_SIZE.
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE - 5, 0, 10))

    // Smudge dabs whose own patch spans across the boundary — must not throw,
    // and (v1 scope) simply have no effect rather than attempting cross-tile
    // compositing.
    const dabs = [TILE_SIZE - 20, TILE_SIZE - 10, TILE_SIZE, TILE_SIZE + 10].map(x => dab(x, 0, { size: 20 }))
    expect(() => engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))).not.toThrow()
  })

  // Regression coverage for the exact bug reported after #14 first shipped:
  // an earlier version deposited the picked-up patch *additively* (the same
  // "over" blend a pencil dab uses) instead of mixing the destination
  // toward it. Since nothing ever took graphite away from wherever it was
  // picked up, a long enough drag (or repeatedly working the same small
  // area) could paint arbitrarily much of the canvas fully opaque — "one
  // thin line, smudged enough, fills the whole page black". These assert
  // the conservation property that fix relies on: mix() can only ever move
  // a destination *between* what it already had and what's being picked
  // up, never past either.
  describe('conservation — cannot manufacture graphite that was never there', () => {
    it('fades out over a long single-direction drag instead of propagating at full strength indefinitely', () => {
      const engine = setupLayer(200, 20)
      // Solid disc near the left edge — alpha 255 at its own center.
      engine.appendOperation(fillStroke('user-a', 'L', 10, 10, 8))

      const xs: number[] = []
      for (let x = 10; x <= 190; x += 6) xs.push(x)
      const dabs = xs.map(x => dab(x, 10, { size: 16, pressure: 1, opacity: 1 }))
      engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))

      // A real blending stump can't carry graphite indefinitely — dragged
      // this far (180px, over 30 dabs), it should have faded to something
      // far short of the fully-opaque source, not still be reading ~255.
      expect(alphaAt(readLayerPixels(engine, 'L')!, 200, 190, 10)).toBeLessThan(50)
    })

    it('repeatedly working the same small area does not grow the affected region beyond where the tool actually reached', () => {
      const engine = setupLayer()
      engine.appendOperation(fillStroke('user-a', 'L', 20, 32, 8))

      // Many back-and-forth passes, always within x∈[15,35].
      for (let i = 0; i < 15; i++) {
        const xs = i % 2 === 0 ? [15, 20, 25, 30, 35] : [35, 30, 25, 20, 15]
        const dabs = xs.map(x => dab(x, 32, { size: 16, pressure: 1, opacity: 1 }))
        engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))
      }

      // Well outside the ~20px the tool was ever dragged across.
      expect(alphaAt(readLayerPixels(engine, 'L')!, 64, 55, 32)).toBe(0)
    })
  })
})
