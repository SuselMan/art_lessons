// Engine-level integration tests for #122: the below/above split-composite
// cache. _runComposite used to re-blit every visible layer/folder-child from
// _compositeOrder on *every* call (paint move-events included); #122 instead
// caches the composite of everything below the active layer and everything
// above it separately, and only re-blends the active layer's own (always-
// current) texture between them — see the _belowCache/_aboveCache field
// comment in index.ts for the full design and the exhaustive list of
// invalidation call sites.
//
// The risk that makes this worth testing hard: blend order is exact
// (Porter-Duff "over", bottom to top), and a cache that misses even one
// invalidation point can silently composite stale pixels for a layer other
// than the active one — a bug that can look almost-right rather than
// obviously broken. Every test here follows the same "independent ground
// truth" pattern as the merge/undo tests in index.structuralUndo.test.ts:
// compare the incrementally-cached composite against (a) a guaranteed-fresh
// full rebuild (forced via a redundant setCompositeOrder call, which always
// unconditionally invalidates) and (b) a from-scratch manual blend of each
// layer's own already-verified-correct buffer content, computed independently
// in this file rather than by calling back into the engine's own compositing
// code.
import { describe, expect, it } from 'vitest'

import type { CompositeItem } from './index'
import {
  createTestEngine, expectPixelsClose, expectPixelsEqual, fillStroke, makeLayerAdd,
  makeLayerTransform, readCompositePixels, readLayerPixels,
} from './testing/engineTestUtils'

/** Manual from-scratch composite of `order` (bottom→top, same convention as
 *  CompositeItem[]/computeCompositeOrder) built directly from each layer's
 *  own buffer via readLayerPixels — deliberately *not* going through the
 *  engine's _runComposite/_compositeTextures at all, so this can't share a
 *  bug with the code under test. Mirrors MockGL's _rasterComposite blend
 *  arithmetic (`data[i] = srcAlpha*sf + data[i]*(1-srcAlpha)`, sf=1 for the
 *  normal (ONE, ONE_MINUS_SRC_ALPHA) blend every composite draw uses) but
 *  necessarily operates on already-8-bit-rounded per-layer snapshots rather
 *  than the engine's internal float accumulator, so callers should compare
 *  with a small tolerance (expectPixelsClose), not exact equality. */
function manualComposite(
  engine: ReturnType<typeof createTestEngine>['engine'], order: CompositeItem[], pixelCount: number,
): Uint8Array {
  const acc = new Float64Array(pixelCount) // 0..1
  for (const { id, opacity } of order) {
    const layer = readLayerPixels(engine, id)
    if (!layer) continue
    for (let i = 0; i < pixelCount; i++) {
      const srcAlpha = Math.min(Math.max((layer[i * 4] / 255) * opacity, 0), 1)
      acc[i] = srcAlpha + acc[i] * (1 - srcAlpha)
    }
  }
  const out = new Uint8Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    const v = Math.round(Math.min(Math.max(acc[i], 0), 1) * 255)
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = v
  }
  return out
}

describe('#122 split-composite cache: paint-on-active interleaved with changes to a different layer', () => {
  it('matches a guaranteed-fresh full recompute and an independent manual blend after paint → reorder/opacity-change another layer → paint again', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    const pixelCount = 8 * 8

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(makeLayerAdd('user-a', 'C'))
    engine.appendOperation(fillStroke('user-a', 'A', 2, 2, 3))
    engine.appendOperation(fillStroke('user-a', 'C', 6, 6, 3))
    // B (the active layer) starts empty — its content only ever changes via
    // the two "paint on active" steps below.

    engine.setActiveLayer('B')
    let order: CompositeItem[] = [{ id: 'A', opacity: 0.5 }, { id: 'B', opacity: 1 }, { id: 'C', opacity: 0.7 }]
    engine.setCompositeOrder(order)

    // (a) paint on the active layer — the hot path this cache exists for,
    // must never need an invalidation to stay correct.
    engine.appendOperation(fillStroke('user-a', 'B', 3, 4, 2))

    // (b) change opacity *and* order of a different (non-active) layer —
    // exactly the kind of below/above-affecting change that must invalidate.
    order = [{ id: 'C', opacity: 0.3 }, { id: 'A', opacity: 0.6 }, { id: 'B', opacity: 1 }]
    engine.setCompositeOrder(order)

    // (c) paint on the active layer again.
    engine.appendOperation(fillStroke('user-a', 'B', 5, 3, 2))

    const incremental = readCompositePixels(engine)

    // Ground truth #1: force a guaranteed-fresh full rebuild of both cache
    // halves (setCompositeOrder always unconditionally invalidates — see
    // index.ts) from the exact same current buffer state and order, with no
    // further pixel changes in between.
    engine.setCompositeOrder([...order])
    const forcedFresh = readCompositePixels(engine)
    expectPixelsEqual(incremental, forcedFresh)

    // Ground truth #2: fully independent manual blend, never touching the
    // engine's own compositing code.
    const manual = manualComposite(engine, order, pixelCount)
    expectPixelsClose(incremental, manual, 3)
  })
})

describe('#122 split-composite cache: visibility toggle of a non-active layer between two active-layer paints', () => {
  it('a layer removed then reinstated at a different opacity is reflected correctly, never stuck showing a stale cached state', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    const pixelCount = 8 * 8

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 4))

    engine.setActiveLayer('B')
    engine.setCompositeOrder([{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }])
    engine.appendOperation(fillStroke('user-a', 'B', 2, 2, 2))

    // Hide A entirely (removed from the order, as the layer panel would do
    // for a visibility toggle — see lib/layers.ts's orderedLayers).
    engine.setCompositeOrder([{ id: 'B', opacity: 1 }])
    const withAHidden = readCompositePixels(engine)
    // A's content must not show through at all.
    const manualHidden = manualComposite(engine, [{ id: 'B', opacity: 1 }], pixelCount)
    expectPixelsClose(withAHidden, manualHidden, 3)

    // Paint on active again while A is hidden.
    engine.appendOperation(fillStroke('user-a', 'B', 6, 6, 2))

    // Reinstate A at a different opacity.
    const order: CompositeItem[] = [{ id: 'A', opacity: 0.4 }, { id: 'B', opacity: 1 }]
    engine.setCompositeOrder(order)
    const withARestored = readCompositePixels(engine)

    engine.setCompositeOrder([...order])
    const forcedFresh = readCompositePixels(engine)
    expectPixelsEqual(withARestored, forcedFresh)

    const manualRestored = manualComposite(engine, order, pixelCount)
    expectPixelsClose(withARestored, manualRestored, 3)
  })
})

describe('#122 split-composite cache: layer_transform (#120) on a non-active layer', () => {
  it('a transform baked into a below-the-active-layer buffer is picked up without an explicit compositeOrder change', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    const pixelCount = 16 * 16

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))

    engine.setActiveLayer('B')
    engine.setCompositeOrder([{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }])
    engine.appendOperation(fillStroke('user-a', 'B', 10, 10, 2))

    // Prime the cache with a normal active-layer paint (exercises the fast,
    // non-invalidating path) before the transform.
    const beforeTransform = readCompositePixels(engine)
    expect(beforeTransform.some(v => v > 0)).toBe(true)

    // layer_transform is pixel-only — it never touches _compositeOrder, so
    // this is exactly the case the issue calls out: nothing but the engine's
    // own internal invalidation stands between this and a stale composite.
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'A', matrix: [1, 0, 0, 1, 4, 0] }]))

    // Paint on the active layer again after the transform.
    engine.appendOperation(fillStroke('user-a', 'B', 3, 12, 2))

    const incremental = readCompositePixels(engine)
    const order: CompositeItem[] = [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]
    engine.setCompositeOrder([...order])
    const forcedFresh = readCompositePixels(engine)
    expectPixelsEqual(incremental, forcedFresh)

    const manual = manualComposite(engine, order, pixelCount)
    expectPixelsClose(incremental, manual, 3)
  })
})

describe('#122 split-composite cache: a remote stroke landing on a different (non-active) layer', () => {
  it('a stroke appended for a layer other than this client\'s active one is reflected, not shadowed by the cache', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    const pixelCount = 8 * 8

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))

    engine.setActiveLayer('B')
    engine.setCompositeOrder([{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }])
    engine.appendOperation(fillStroke('user-a', 'B', 2, 2, 2))

    // A peer (this client's active layer is 'B', but the remote author's own
    // active layer might be 'A') paints on 'A' — arrives exactly like any
    // other appendOperation('stroke', ...), 'remote' or 'local' both take the
    // same code path in the engine.
    engine.appendOperation(fillStroke('user-b', 'A', 5, 5, 3), 'remote')
    engine.appendOperation(fillStroke('user-a', 'B', 6, 2, 1))

    const incremental = readCompositePixels(engine)
    const order: CompositeItem[] = [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]
    engine.setCompositeOrder([...order])
    const forcedFresh = readCompositePixels(engine)
    expectPixelsEqual(incremental, forcedFresh)

    const manual = manualComposite(engine, order, pixelCount)
    expectPixelsClose(incremental, manual, 3)
  })
})
