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
// by StrokeOperation.strokeId. This proves they hold at streaming granularity
// (batches of a handful of dabs, not 800), which is the property #429 builds
// on — so a regression here shows up as a failing seam test rather than as a
// dark band a teacher notices mid-lesson.
import type { Dab, ToolType } from '@grafetto/shared'
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeStroke, paperReady,
  readLayerPixels, simulateStroke,
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

  simulateStroke(engine, Array.from({ length: 21 }, (_, i) => ({ x: 14 + i * 5, y: 32 })))

  const dabs = engine.getOperations().flatMap(op => (op.type === 'stroke' ? strokeDabs(op) : []))
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
  for (const tool of ['pencil', 'marker', 'smudge'] as const) {
    // Marker does NOT hold this today — see #435. The seam machinery carries
    // the scratch and the previous dab correctly (index.marker.test.ts proves
    // both structurally), but the composite pass runs once per batch over that
    // batch's own dirty rect while coverage/inkLoad keep accumulating in the
    // shared scratch, so pixels behind the seam keep a stale, under-composited
    // value: a light gap at every boundary, one per seam. Pinned as an expected
    // failure rather than skipped, so fixing #435 flips this green by itself
    // instead of leaving a disabled test nobody re-enables.
    const check = tool === 'marker' ? it.fails : it
    check(`${tool}: batches of one strokeId are pixel-identical to a single operation`, async () => {
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

  it('marker: batches WITHOUT a shared strokeId diverge — the seam this guards against is real', async () => {
    // The negative control for the marker case above. Without strokeId every
    // batch freezes the layer content afresh, including what the previous batch
    // just painted, so the result must NOT match the whole-gesture render. If
    // this ever starts passing, the positive test above has stopped proving
    // anything and the seam machinery is being bypassed.
    const dabs = await recordGestureDabs('marker')

    const whole = await freshLayer('marker')
    whole.appendOperation(makeStroke('peer', 'L', dabs, { tool: 'marker', strokeId: 'g1' }))
    const wholePixels = readLayerPixels(whole, 'L')

    const seamed = await freshLayer('marker')
    for (let i = 0; i < dabs.length; i += 4) {
      seamed.appendOperation(makeStroke('peer', 'L', dabs.slice(i, i + 4), { tool: 'marker' }))
    }
    const seamedPixels = readLayerPixels(seamed, 'L')

    expect(() => expectPixelsEqual(seamedPixels, wholePixels)).toThrow(/pixel mismatch/)

    whole.destroy()
    seamed.destroy()
  })
})
