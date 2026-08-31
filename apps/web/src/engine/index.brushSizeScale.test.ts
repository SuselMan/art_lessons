// A brush size means the same width on every device.
//
// It did not. In a bounded room PencilEngine multiplied the size it was given
// by `canvas.width / canvas.clientWidth` — the backing-store scale, which is
// `min(devicePixelRatio, sqrt(4MP / viewport CSS area))` (cameraMath.ts's
// boundedBackingStoreZoom). One sheet, one slider value, three devices
// (room `s1i6233k`, 27.08): iPad 9 painted 18.00 world px, a Tab S7+ 18.50, a
// Surface 12.00, and the teacher on a DPR-1 laptop got 9. `Dab.size` is baked
// at record time and goes into the Operation Log, so that difference is
// permanent in the shared drawing rather than a local viewing quirk.
//
// The whole reason it survived this long is visible in engineTestUtils'
// createMockCanvas: it sets `clientWidth: width`, so the ratio was 1 in every
// existing test and the multiplication was a no-op. This file is the one that
// makes it not 1.
//
// Geometry only — nothing here reads pixels, which MockGL could not answer
// anyway (see the project's own note on that).
import { strokeDabs } from '@grafetto/shared'
import { describe, expect, it } from 'vitest'

import type { Dab, StrokeOperation } from '@grafetto/shared'

import type { PencilEngine } from './index'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'

const BRUSH_PX = 24
const PATH = [10, 30, 50, 70, 90, 110].map(x => ({ x, y: 40 }))

/** One stroke on a canvas whose CSS box is `cssScale` times smaller than its
 *  backing store — i.e. what a device of that DPR hands the engine. */
async function strokeAtBackingScale(cssScale: number, infinite = false): Promise<Dab[]> {
  const { engine, canvas } = createTestEngine(
    { userId: 'user-a', infinite }, { width: 200, height: 200 },
  )
  canvas.clientWidth = canvas.width / cssScale
  canvas.clientHeight = canvas.height / cssScale
  await paperReady(engine)
  engine.appendOperation(makeLayerAdd('user-a', 'L1'))
  engine.setActiveLayer('L1')
  engine.setCompositeOrder([{ id: 'L1', opacity: 1 }])
  engine.setTool('pencil')
  engine.setPencil('HB')
  engine.setSize(BRUSH_PX)
  simulateStroke(engine, PATH, { pressure: 0.5, tiltX: 0, tiltY: 0 })
  return strokeDabs(lastStroke(engine))
}

function lastStroke(engine: PencilEngine): StrokeOperation {
  const ops = engine.getOperations()
  const op = ops[ops.length - 1]
  if (op.type !== 'stroke') throw new Error(`expected a stroke op, got ${op.type}`)
  return op
}

const sizes = (dabs: Dab[]): number[] => dabs.map(d => d.size)

describe('brush size is a property of the drawing, not of the screen', () => {
  it('records the same dab width whatever the device pixel ratio', async () => {
    // 1 = a plain 96-dpi display, 2 = an iPad, 2.058 = the Tab S7+ measured in
    // `s1i6233k` (the megapixel budget makes the factor fractional, which is
    // why that one could never have been a whole-number DPR).
    const [dpr1, dpr2, tabS7] = await Promise.all([
      strokeAtBackingScale(1),
      strokeAtBackingScale(2),
      strokeAtBackingScale(2.058),
    ])

    expect(sizes(dpr1).length).toBeGreaterThan(0)
    expect(sizes(dpr2)).toEqual(sizes(dpr1))
    expect(sizes(tabS7)).toEqual(sizes(dpr1))
  })

  it('paints the nominal size at full pressure, not a multiple of it', async () => {
    // The pencil's width law is 0.3 + 0.7*pressure, so 0.5 lands at 0.65 of
    // nominal. Pinning the absolute number (not just cross-device equality)
    // is what stops a future "consistent but consistently wrong" scale.
    const dabs = await strokeAtBackingScale(2)
    const widest = Math.max(...sizes(dabs))
    expect(widest).toBeCloseTo(BRUSH_PX * 0.65, 4)
  })

  it('leaves infinite rooms exactly as they were', async () => {
    // They already returned the size untouched and were always right — this is
    // the branch bounded rooms joined, so it must not have moved.
    const [dpr1, dpr2] = await Promise.all([
      strokeAtBackingScale(1, true),
      strokeAtBackingScale(2, true),
    ])
    expect(sizes(dpr2)).toEqual(sizes(dpr1))
  })
})
