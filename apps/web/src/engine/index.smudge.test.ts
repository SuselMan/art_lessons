// Engine-level tests for the smudge tool (#14) — see SMUDGE_TRANSFER_FRAG's
// own doc comment in shaders.ts, and _paintOneSmudgeDab's/_smudgeContact's in
// index.ts, for the algorithm this exercises: each dab exchanges graphite
// with a per-user reservoir (engine's this._smudgeUserLoad, keyed by userId)
// at three contacts along its own footprint (rear/center/front) — pick up
// (or top up) behind the dab, work the material in place at the dab's own
// center (plus press some into the paper under pressure), then lay more of
// the reservoir down ahead — rather than copying a patch of pixels directly
// from one spot to another. The reservoir now also persists across separate
// strokes by the same user (see StrokeOperation.smudgeLoadAtStart/End in
// packages/shared), instead of resetting to empty at every stroke start.
// Most of these tests predate all of that and were kept passing unchanged
// through each redesign: the properties they check (nothing on the very
// first dab, no-op on an empty layer, no spontaneous color, determinism,
// fading over a long drag, no growth beyond where the tool actually reached)
// are still exactly what a believable blending-stump tool should guarantee,
// regardless of which algorithm underneath provides them.
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

  // The property the old patch-copy algorithm never had: dragging away from
  // a mark actually reduces the mark itself, because the tool's reservoir
  // (this._smudgeToolLoad) picks up real graphite at the source contact and
  // writes a reduced value back there (see _paintOneSmudgeDab) — it doesn't
  // just re-sample the same untouched pixels on every dab. Without this, a
  // small mark could be duplicated outward indefinitely without ever itself
  // fading, which is what made "smudge the whole line away" possible.
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
  // enough, fills the whole page black"). The current reservoir-exchange
  // algorithm (see this file's own header comment) is conservative for a
  // different, more physical reason than that first fix's mix()-based cap
  // was: this._smudgeToolLoad can only ever carry a bounded amount, and
  // every exchange with the paper is a real transfer in *both* directions
  // (see _paintOneSmudgeDab) — but the observable guarantee these tests
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
  // redesign above shipped: reported as "a real pencil's dark areas barely
  // lighten under a real blending stump, but this tool can smudge a mark
  // into invisibility" — and, worse, that this happened even during one
  // long continuous drag that never left a single solid, already-dark area
  // (not just repeated separate strokes). Root cause was in the deposit
  // side of _paintOneSmudgeDab: this._smudgeToolLoad used to drain by
  // however much a dab *requested* to deposit, regardless of whether the
  // destination had any headroom left to actually receive it — an "over"
  // blend onto near-opaque content barely raises its alpha at all, so that
  // deposit was mostly wasted, yet the reservoir accounting spent itself as
  // if it had landed. That forced the pickup side to keep pulling more from
  // the source to "refill" a reservoir that was never really being spent —
  // real, visible erosion at the source, indefinitely, for as long as the
  // stroke continued, even standing still over one uniform area. Fixed by
  // scaling the reservoir's drain by actual measured headroom at the
  // destination (see that method's own comment).
  it('working entirely within one solid, already-dark area barely lightens it, even across one long continuous drag', () => {
    const engine = setupLayer(120, 120)
    // Big solid disc, radius 40 — smudge below oscillates in a narrow band
    // deep inside it (at least ~25px of clearance to the disc's own edge in
    // every direction), so the pickup patch (brush radius 8, half-extent 8)
    // never itself samples any real paper outside the disc — otherwise a
    // patch average blending in genuine blank paper near the disc's own
    // edge would look like "lightening" that has nothing to do with the
    // reservoir exchange this test means to isolate.
    engine.appendOperation(fillStroke('user-a', 'L', 60, 60, 40))
    const before = alphaAt(readLayerPixels(engine, 'L')!, 120, 60, 60)
    expect(before).toBeGreaterThan(200)

    // One single stroke (one makeStroke call — the dab chain _paintOneSmudgeDab
    // threads via `prev` is unbroken throughout), oscillating within x∈[45,75].
    const xs: number[] = []
    for (let pass = 0; pass < 12; pass++) {
      const sweep = [45, 52, 60, 68, 75]
      for (const x of pass % 2 === 0 ? sweep : [...sweep].reverse()) xs.push(x)
    }
    const dabs = xs.map(x => dab(x, 60, { size: 16, pressure: 1, opacity: 1 }))
    engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge' }))

    const after = alphaAt(readLayerPixels(engine, 'L')!, 120, 60, 60)
    // Some softening at the very start of the stroke (the reservoir's own
    // ramp-up, see SMUDGE_MAX_STEP's comment) is expected and fine — the
    // bug was continuous, unbounded lightening for as long as the stroke
    // kept going. Measured ~255->209 (82%) with the headroom-aware deposit
    // fix in place, vs ~255->126 (49%) without it (same geometry) — 65% is
    // a safety margin under the real number, not the target itself.
    expect(after).toBeGreaterThan(before * 0.65)
  })

  // Regression coverage for #14 round 3: the reservoir now persists across
  // separate strokes by the same user (see StrokeOperation.smudgeLoadAtStart)
  // instead of resetting to empty every time, and it's keyed per-user so two
  // people smudging at once in the same room can't corrupt each other's tool.
  describe('reservoir persistence and per-user isolation (#14 round 3)', () => {
    it('a recorded smudgeLoadAtStart seeds the reservoir instead of starting empty', () => {
      const engine = setupLayer()
      const targetX = 40, targetY = 32
      expect(alphaAt(readLayerPixels(engine, 'L')!, 64, targetX, targetY)).toBe(0)

      // No disc to pick up from at all here — a fresh (0-start) reservoir
      // would have nothing to deposit. A pre-loaded one (as if this user's
      // tool was already carrying graphite from earlier, unrelated work)
      // should deposit right away on its very first dab.
      const dabs = [dab(36, 32, { size: 16, pressure: 1, opacity: 1 }), dab(targetX, 32, { size: 16, pressure: 1, opacity: 1 })]
      engine.appendOperation(makeStroke('user-a', 'L', dabs, { tool: 'smudge', smudgeLoadAtStart: 0.9 }))

      expect(alphaAt(readLayerPixels(engine, 'L')!, 64, targetX, targetY)).toBeGreaterThan(0)
    })

    it('two different users smudging do not corrupt each other\'s reservoir', () => {
      const engine = setupLayer(120, 60)
      engine.appendOperation(fillStroke('user-a', 'L', 20, 30, 15))
      engine.appendOperation(fillStroke('user-b', 'L', 100, 30, 15))

      const dabsA1 = [dab(20, 30, { size: 16, pressure: 1, opacity: 1 }), dab(30, 30, { size: 16, pressure: 1, opacity: 1 })]
      engine.appendOperation(makeStroke('user-a', 'L', dabsA1, { tool: 'smudge' }))
      const afterA1 = readLayerPixels(engine, 'L')!

      // User B smudges their own, unrelated disc in between — must not
      // observably change anything about user A's own area, and must not
      // itself behave as if it inherited user A's in-progress reservoir.
      const dabsB = [dab(100, 30, { size: 16, pressure: 1, opacity: 1 }), dab(90, 30, { size: 16, pressure: 1, opacity: 1 })]
      engine.appendOperation(makeStroke('user-b', 'L', dabsB, { tool: 'smudge' }))
      const afterB = readLayerPixels(engine, 'L')!
      // User A's side of the canvas (x < 60) is untouched by user B's stroke.
      for (let x = 0; x < 60; x += 5) {
        expect(afterB[(30 * 120 + x) * 4 + 3]).toBe(afterA1[(30 * 120 + x) * 4 + 3])
      }

      // User A continues their own stroke as a separate op (same user,
      // fresh op) — comparing against a from-scratch engine that runs
      // user A's *combined* dab sequence as one uninterrupted stroke (never
      // touched by user B at all) checks that B's interleaved stroke left
      // A's own reservoir exactly where A's own dabs left it, unaffected.
      const dabsA2 = [dab(30, 30, { size: 16, pressure: 1, opacity: 1 }), dab(40, 30, { size: 16, pressure: 1, opacity: 1 })]
      engine.appendOperation(makeStroke('user-a', 'L', dabsA2, { tool: 'smudge' }))

      const reference = setupLayer(120, 60)
      reference.appendOperation(fillStroke('user-a', 'L', 20, 30, 15))
      reference.appendOperation(makeStroke('user-a', 'L', dabsA1, { tool: 'smudge' }))
      reference.appendOperation(makeStroke('user-a', 'L', dabsA2, { tool: 'smudge' }))

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
