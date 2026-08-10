// Engine-level tests for the smudge tool (#14) — see SMUDGE_TRANSFER_FRAG's
// own doc comment in shaders.ts, and _paintOneSmudgeDab's/_smudgeApplyDab's
// in index.ts, for the algorithm this exercises: the stump carries a raster
// *imprint* of what it has picked up, anchored to the dab's own position, and
// every dab blends the imprint toward the canvas under it and the canvas
// toward the imprint — both per pixel, both within the same dab (#416).
//
// Most of these tests predate that redesign (and the two before it) and were
// kept passing unchanged through each one: the properties they check —
// nothing on the very first dab, no-op on an empty layer, no spontaneous
// color, determinism, fading over a long drag, no growth beyond where the
// tool actually reached — are still exactly what a believable blending-stump
// tool should guarantee, regardless of which algorithm underneath provides
// them. Where a test's own reasoning was tied to the carried scalar those
// rounds used, the comment says so and restates the property in the terms of
// the imprint that replaced it.
import { describe, expect, it } from 'vitest'

import type { Dab } from '@grafetto/shared'

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

    // Drag rightward, through the disc and beyond it. The imprint is
    // re-anchored to each dab's own position, so content picked up at one
    // dab is laid down one step further along at the next — the smear is
    // the offset between consecutive dabs, which is why an unbroken chain
    // of them carries graphite well past where the disc ends.
    const smudgeDabs = [16, 24, 32, 40, 48].map(x => dab(x, 32, { size: 20, pressure: 1, opacity: 1 }))
    engine.appendOperation(makeStroke('user-a', 'L', smudgeDabs, { tool: 'smudge' }))

    expect(alphaAt(readLayerPixels(engine, 'L')!, 64, targetX, targetY)).toBeGreaterThan(0)
  })

  // The property the very first, patch-copy version of this tool never had:
  // dragging away from a mark actually reduces the mark itself. Under the
  // imprint model it falls straight out of the lerp — a pixel is pulled
  // toward what the stump carries, and near a mark's trailing edge that is
  // the lighter paper the stump just came off. Without it, a small mark could
  // be duplicated outward indefinitely without ever itself fading, which is
  // what made "smudge the whole line away" possible.
  it('actually depletes the source it picks up from, rather than duplicating it', () => {
    const engine = setupLayer()
    engine.appendOperation(fillStroke('user-a', 'L', 30, 30, 10))
    const before = alphaAt(readLayerPixels(engine, 'L')!, 64, 30, 30)
    expect(before).toBeGreaterThan(200)

    // Drag away from the disc's own center.
    const dabs = [30, 38, 46, 54].map(x => dab(x, 30, { size: 20, pressure: 1, opacity: 1 }))
    engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))

    const after = alphaAt(readLayerPixels(engine, 'L')!, 64, 30, 30)
    expect(after).toBeLessThan(before)
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
  // an early version deposited the picked-up patch *additively* without ever
  // reducing wherever it was picked up from — an inexhaustible source, so a
  // long enough drag (or repeatedly working the same small area) could paint
  // arbitrarily much of the canvas fully opaque ("one thin line, smudged
  // enough, fills the whole page black"). The imprint model (see this file's
  // own header comment) is conservative structurally: a dab is a lerp between
  // what is already on the canvas and what the stump carries, so no pixel can
  // ever end up darker than the darker of the two, and the imprint itself is
  // only ever refreshed from the canvas. The observable guarantee these tests
  // check is the same one that mattered from the start: dragging can move
  // graphite around, never manufacture more of it than existed somewhere on
  // the canvas.
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

  // Regression coverage for a bug found *after* the reservoir-exchange
  // redesign shipped: reported as "a real pencil's dark areas barely lighten
  // under a real blending stump, but this tool can smudge a mark into
  // invisibility" — and, worse, that this happened even during one long
  // continuous drag that never left a single solid, already-dark area (not
  // just repeated separate strokes). Root cause was the carried scalar's own
  // bookkeeping: it drained by however much a dab *requested* to deposit
  // regardless of whether the destination had headroom to receive it, so the
  // pickup side kept pulling more from the source to refill a reservoir that
  // was never really being spent. #416 removed the whole mechanism rather
  // than the bug: working inside one uniform area, the imprint converges to
  // exactly what is under it and the lerp becomes the identity, so there is
  // nothing left to drift.
  it('working entirely within one solid, already-dark area barely lightens it, even across one long continuous drag', () => {
    const engine = setupLayer(120, 120)
    // Big solid disc, radius 40 — smudge below oscillates in a narrow band
    // deep inside it (at least ~25px of clearance to the disc's own edge in
    // every direction), so the patch under the brush never itself samples any
    // real paper outside the disc — otherwise genuine blank paper reaching
    // the imprint near the disc's own edge would look like "lightening" that
    // has nothing to do with the transfer this test means to isolate.
    engine.appendOperation(fillStroke('user-a', 'L', 60, 60, 40))
    const before = alphaAt(readLayerPixels(engine, 'L')!, 120, 60, 60)
    expect(before).toBeGreaterThan(200)

    // One single stroke (one makeStroke call — the dab chain _paintSmudgeDabs
    // threads via `prev` is unbroken throughout), oscillating within x∈[45,75].
    const xs: number[] = []
    for (let pass = 0; pass < 12; pass++) {
      const sweep = [45, 52, 60, 68, 75]
      for (const x of pass % 2 === 0 ? sweep : [...sweep].reverse()) xs.push(x)
    }
    const dabs = xs.map(x => dab(x, 60, { size: 16, pressure: 1, opacity: 1 }))
    engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))

    const after = alphaAt(readLayerPixels(engine, 'L')!, 120, 60, 60)
    // The bug was continuous, unbounded lightening for as long as the stroke
    // kept going. 65% was the safety margin under the scalar-reservoir fix's
    // own measured ~82%; the imprint model leaves this pixel untouched
    // (255 -> 255), so the old threshold is now a very loose floor rather
    // than a close call — kept at its original value deliberately, as the
    // statement of what must never regress.
    expect(after).toBeGreaterThan(before * 0.65)
  })

  // Regression coverage for #416, the bug that motivated the imprint model:
  // stroking a blending stump back and forth *across* a pencil line left a
  // clean white band about a brush radius wide on either side of it, with the
  // smudged graphite only starting beyond that band ("the graphite doesn't
  // transfer immediately"). The cause was structural — one carried scalar per
  // user meant a dab compared the *average* under it against that scalar and
  // put its whole footprint into pickup or deposit — so near a line every dab
  // was in pickup, scrubbing the paper beside it clean of whatever the
  // previous pass deposited there. Under the lerp, the pixel next to the line
  // receives from the imprint in the very same dab that takes from the line.
  it('depositing beside a line it works across, not only a brush radius away from it (#416)', () => {
    const engine = setupLayer(140, 60)
    // A thin vertical line at x=60, spanning the full height of the band the
    // smudge stroke below works over.
    const lineDabs: Dab[] = []
    for (let y = 10; y <= 50; y += 2) lineDabs.push(dab(60, y, { size: 5, pressure: 1, opacity: 1 }))
    engine.appendOperation(makeStroke('user-a', 'L', lineDabs))
    expect(alphaAt(readLayerPixels(engine, 'L')!, 140, 66, 30)).toBe(0)

    // One stroke, straight across the line and back several times — the exact
    // gesture from the report, at 90° to the line.
    const xs: number[] = []
    for (let pass = 0; pass < 6; pass++) {
      const sweep = [40, 46, 52, 58, 64, 70, 76, 82]
      for (const x of pass % 2 === 0 ? sweep : [...sweep].reverse()) xs.push(x)
    }
    const smudgeDabs = xs.map(x => dab(x, 30, { size: 20, pressure: 1, opacity: 1 }))
    engine.appendOperation(makeStroke('user-a', 'L', smudgeDabs, { tool: 'smudge' }))

    const px = readLayerPixels(engine, 'L')!
    const near = alphaAt(px, 140, 66, 30) // 6px out — inside the old halo band
    const far = alphaAt(px, 140, 76, 30)  // 16px out — past a brush radius
    // The halo was `near === 0` while `far > 0`. Both halves matter: graphite
    // has to reach the line's immediate neighbourhood *and* fall off with
    // distance from it, rather than skipping the near band entirely.
    expect(near).toBeGreaterThan(0)
    expect(near).toBeGreaterThan(far)
  })

  // #416 replaced a reservoir that persisted across strokes with an imprint
  // that resets at every gesture. That is not a regression of the property
  // round 3 added (a stump does stay dirty) but a consequence of what the
  // stump now carries: an imprint is *positional*, so reusing one across a
  // pen-up would stamp a ghost of the previous stroke's content wherever the
  // next one happens to begin. It also makes a recorded operation
  // self-sufficient again — which is why StrokeOperation.smudgeLoadAtStart/End
  // stopped being written.
  describe('gesture boundaries and per-user isolation', () => {
    it('starts every gesture with an empty imprint, so a fresh stroke over blank paper deposits nothing', () => {
      const engine = setupLayer()
      // Stroke one loads the stump up from a solid disc on the left.
      engine.appendOperation(fillStroke('user-a', 'L', 16, 32, 10))
      const loading = [16, 22, 28].map(x => dab(x, 32, { size: 16, pressure: 1, opacity: 1 }))
      engine.appendOperation(makeStroke('user-a', 'L', loading, { tool: 'smudge', strokeId: 'g1' }))

      // Stroke two is a separate gesture, far away, over paper that has never
      // had anything on it.
      const before = readLayerPixels(engine, 'L')
      const elsewhere = [45, 51, 57].map(x => dab(x, 10, { size: 16, pressure: 1, opacity: 1 }))
      engine.appendOperation(makeStroke('user-a', 'L', elsewhere, { tool: 'smudge', strokeId: 'g2' }))

      expectPixelsEqual(before, readLayerPixels(engine, 'L'))
    })

    it('rejoins the chunks of one gesture: two operations sharing a strokeId paint what one unbroken stroke would', () => {
      const chunked = setupLayer()
      const whole = setupLayer()
      const disc = fillStroke('user-a', 'L', 16, 32, 10)
      chunked.appendOperation(disc)
      whole.appendOperation(disc)

      // The same dab sequence, once split across two operations of one
      // gesture (what _flushStrokeChunk emits for a long stroke) and once as
      // a single operation. A gesture whose imprint restarted at the chunk
      // boundary would leave a visible seam here.
      const dabs = [16, 22, 28, 34, 40, 46].map(x => dab(x, 32, { size: 16, pressure: 1, opacity: 1 }))
      chunked.appendOperation(makeStroke('user-a', 'L', dabs.slice(0, 3), { tool: 'smudge', strokeId: 'g1' }))
      chunked.appendOperation(makeStroke('user-a', 'L', dabs.slice(3), { tool: 'smudge', strokeId: 'g1' }))
      whole.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge', strokeId: 'g1' }))

      expectPixelsEqual(readLayerPixels(chunked, 'L'), readLayerPixels(whole, 'L'))
    })

    it('two different users smudging do not corrupt each other\'s imprint', () => {
      const engine = setupLayer(120, 60)
      engine.appendOperation(fillStroke('user-a', 'L', 20, 30, 15))
      engine.appendOperation(fillStroke('user-b', 'L', 100, 30, 15))

      const dabsA1 = [dab(20, 30, { size: 16, pressure: 1, opacity: 1 }), dab(30, 30, { size: 16, pressure: 1, opacity: 1 })]
      engine.appendOperation(makeStroke('user-a', 'L', dabsA1, { tool: 'smudge', strokeId: 'a1' }))
      const afterA1 = readLayerPixels(engine, 'L')!

      // User B smudges their own, unrelated disc in between — must not
      // observably change anything about user A's own area, and must not
      // itself behave as if it inherited user A's in-progress imprint.
      const dabsB = [dab(100, 30, { size: 16, pressure: 1, opacity: 1 }), dab(90, 30, { size: 16, pressure: 1, opacity: 1 })]
      engine.appendOperation(makeStroke('user-b', 'L', dabsB, { tool: 'smudge', strokeId: 'b1' }))
      const afterB = readLayerPixels(engine, 'L')!
      // User A's side of the canvas (x < 60) is untouched by user B's stroke.
      for (let x = 0; x < 60; x += 5) {
        expect(afterB[(30 * 120 + x) * 4 + 3]).toBe(afterA1[(30 * 120 + x) * 4 + 3])
      }

      // User A's own gesture continues across the interleaved stroke (same
      // strokeId, so this is a later chunk of it, not a new gesture) —
      // comparing against a from-scratch engine that runs A's chunks with
      // nothing in between checks that B's stroke left A's imprint exactly
      // where A's own dabs left it.
      const dabsA2 = [dab(30, 30, { size: 16, pressure: 1, opacity: 1 }), dab(40, 30, { size: 16, pressure: 1, opacity: 1 })]
      engine.appendOperation(makeStroke('user-a', 'L', dabsA2, { tool: 'smudge', strokeId: 'a1' }))

      const reference = setupLayer(120, 60)
      reference.appendOperation(fillStroke('user-a', 'L', 20, 30, 15))
      reference.appendOperation(makeStroke('user-a', 'L', dabsA1, { tool: 'smudge', strokeId: 'a1' }))
      reference.appendOperation(makeStroke('user-a', 'L', dabsA2, { tool: 'smudge', strokeId: 'a1' }))

      // Only compare user A's own side — the reference engine never painted
      // user B's disc at all.
      const withB = readLayerPixels(engine, 'L')!
      const withoutB = readLayerPixels(reference, 'L')!
      for (let x = 0; x < 60; x += 5) {
        expect(withB[(30 * 120 + x) * 4 + 3]).toBe(withoutB[(30 * 120 + x) * 4 + 3])
      }
    })
  })
})
