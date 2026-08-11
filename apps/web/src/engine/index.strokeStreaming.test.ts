// Foundation for #429 (живая трансляция штриха). Streaming a peer's stroke
// means the receiving client paints one gesture as many small batches, as they
// arrive, instead of one finished StrokeOperation after pen-up. That is only
// sound if applying a gesture in N pieces paints exactly the same pixels as
// applying it whole.
//
// For pencil that is trivially true — its dabs are independent of each other.
// For the other two tools it is not automatic, and they are the reason this
// file exists:
//
//   * marker composites by multiplying the layer's content frozen once per
//     gesture (MarkerStrokeScratch). Give each batch its own scratch and the
//     second batch multiplies over the first batch's own output — a nib-shaped
//     dark band at every seam, which is exactly what a long marker line looked
//     like after an undo before StrokeOperation.strokeId existed.
//   * smudge carries a positional imprint that resets per gesture (#416), plus
//     it needs the dab immediately preceding each batch to smear continuously
//     across the seam rather than restarting there.
//
// Both already have their cross-operation carriers, built for chunked long
// strokes: PencilEngine._replayMarkerChunk and ._smudgeReplayChunks, both keyed
// by StrokeOperation.strokeId. This file checks they still hold at streaming
// granularity — batches of a handful of dabs, not 800 — which is the property
// #429 builds on, so a regression surfaces as a failing test rather than as a
// seam a teacher notices mid-lesson.
//
// MARKER IS DELIBERATELY NOT COVERED HERE, and that is not an oversight — see
// the note at the bottom of this file. MockGL cannot answer the question for
// that tool, and a green (or red) marker case here would mean nothing either
// way. Its equivalent check has to run against a real GPU.
//
// What this file does cover is exactly what the mock can speak to:
//   * pencil — dabs are independent, so the property is structural and the
//     shader plays no part in it;
//   * smudge — MockGL has a real SMUDGE_TRANSFER_FRAG rasterizer, and the
//     state that batching threatens (the per-user imprint and the previous
//     dab across a seam) lives in engine code the mock drives for real.
import type { Dab, ToolType } from '@grafetto/shared'
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeStroke, paperReady,
  markerReplayChunk, readLayerPixels, simulateStroke,
} from './testing/engineTestUtils'

const CANVAS = { width: 128, height: 64 }
const BRUSH_SIZE = 20

// Recorded from the real pointer pipeline rather than hand-built with dab():
// a synthetic array can't reproduce the pressure/size/angle/`t` progression the
// engine actually bakes, and it is precisely those per-dab values that the
// marker's distance-normalized deposit and the smudge's transfer read.
async function recordGestureDabs(tool: ToolType): Promise<Dab[]> {
  const { engine } = createTestEngine({ userId: 'rec', size: BRUSH_SIZE }, CANVAS)
  engine.appendOperation(makeLayerAdd('rec', 'L'))
  engine.setActiveLayer('L')
  engine.setTool(tool)
  await paperReady(engine)
  // Something to interact with: marker multiplies what is already on the layer
  // and smudge redistributes it, so recording either over an empty layer would
  // produce a gesture whose defining behaviour never engages.
  engine.appendOperation(fillStroke('rec', 'L', 64, 32, 40))

  // Only the operations this gesture itself emits — the base fill above is a
  // stroke operation too, and sweeping it in would prepend a single size-80
  // blob at the canvas centre to every "gesture" this returns.
  const before = engine.getOperations().length
  simulateStroke(engine, Array.from({ length: 21 }, (_, i) => ({ x: 14 + i * 5, y: 32 })))

  const dabs = engine.getOperations().slice(before)
    .flatMap(op => (op.type === 'stroke' ? strokeDabs(op) : []))
  engine.destroy()
  return dabs
}

/** A layer with the same starting content both sides of the comparison get. */
async function freshLayer(tool: ToolType) {
  const { engine } = createTestEngine({ userId: 'peer', size: BRUSH_SIZE }, CANVAS)
  engine.appendOperation(makeLayerAdd('peer', 'L'))
  engine.setActiveLayer('L')
  engine.setTool(tool)
  await paperReady(engine)
  engine.appendOperation(fillStroke('peer', 'L', 64, 32, 40))
  return engine
}

describe('#429 a gesture applied in streaming-sized batches paints what the whole gesture does', () => {
  for (const tool of ['pencil', 'smudge'] as const) {
    it(`${tool}: batches of one strokeId are pixel-identical to a single operation`, async () => {
      const dabs = await recordGestureDabs(tool)
      // Sanity: the gesture has to be long enough that batching it is a real
      // test and not a single batch wearing a disguise.
      expect(dabs.length).toBeGreaterThan(12)

      const whole = await freshLayer(tool)
      whole.appendOperation(makeStroke('peer', 'L', dabs, { tool, strokeId: 'g1' }))
      const wholePixels = readLayerPixels(whole, 'L')

      // 4 dabs per batch is roughly what an 80–120 ms streaming packet carries
      // at a normal drawing speed — far below STROKE_DAB_CHUNK_LIMIT's 800, so
      // this exercises the seam machinery at a granularity chunking never did.
      const streamed = await freshLayer(tool)
      for (let i = 0; i < dabs.length; i += 4) {
        streamed.appendOperation(makeStroke('peer', 'L', dabs.slice(i, i + 4), { tool, strokeId: 'g1' }))
      }
      const streamedPixels = readLayerPixels(streamed, 'L')

      expectPixelsEqual(streamedPixels, wholePixels)

      whole.destroy()
      streamed.destroy()
    })
  }

  // Structural counterpart to the pixel checks above, and the only form the
  // marker's own seam behaviour can take in this file: assert that a batched
  // gesture is actually being stitched (one scratch, previous dab carried),
  // which is engine bookkeeping the mock drives for real, rather than
  // asserting the pixels it produces, which the mock cannot render.
  it('marker: streaming-sized batches of one gesture keep stitching to one scratch', async () => {
    const dabs = await recordGestureDabs('marker')
    const engine = await freshLayer('marker')

    engine.appendOperation(makeStroke('peer', 'L', dabs.slice(0, 4), { tool: 'marker', strokeId: 'g1' }))
    const first = markerReplayChunk(engine)
    expect(first?.scratch).toBeTruthy()

    for (let i = 4; i < dabs.length; i += 4) {
      const batch = dabs.slice(i, i + 4)
      engine.appendOperation(makeStroke('peer', 'L', batch, { tool: 'marker', strokeId: 'g1' }))
      const stitched = markerReplayChunk(engine)
      // Same gesture -> same frozen original, and each batch hands the next one
      // its last dab so the ribbon bridges the seam instead of restarting.
      expect(stitched?.scratch).toBe(first?.scratch)
      expect(stitched?.lastDab.x).toBe(batch[batch.length - 1].x)
    }

    engine.destroy()
  })
})

// ─── Why marker has no pixel test here ──────────────────────────────────────
//
// It was tried, it produced a confident-looking failure, and the failure was an
// artifact of the mock. Recorded so the next person does not spend the same
// afternoon on it.
//
// MockGL does not implement the marker at all:
//   * _tagFragShader tags a shader by substring, and every marker pass
//     (coverage u_inkMode=6, ink =7, composite =2) is DAB_FRAG, which matches
//     `u_eraseMode` first — so all three arrive at _rasterDab;
//   * _rasterDab never reads u_inkMode, u_original, u_strokeCoverage or
//     u_inkLoad. It splats an ordinary pencil profile. There is no multiply
//     against frozen content, because there is nothing to multiply;
//   * RIBBON_FRAG matches no tag, lands on the switch's default, and draws
//     nothing — so the band between samples, which is most of a marker mark's
//     silhouette, simply does not exist here;
//   * the mock stores one scalar per texel, not RGBA. A marker stroke over a
//     filled layer and over an empty one read back byte-identical, which is
//     impossible on a real GPU and is the clearest tell that nothing about this
//     tool's compositing is being exercised.
//
// So a whole-vs-batched marker comparison in vitest measures how many stray
// composite-rect draws the mock happened to splat, not what the engine renders.
// `.claude/rules.md` already says this in general terms under "Cross-device
// pixel determinism"; this is the concrete instance.
//
// The marker's real check for #429 belongs in the browser QA pass: same gesture
// drawn whole and streamed, exported through exportPNG and diffed, on a real
// GPU — and per that same rule, confirmed on a second device before it counts.
