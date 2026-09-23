// (#557) The display filter: the layer panel's solo narrows what *this*
// screen composites without touching the picture itself. Two properties are
// worth pinning at the engine level, because both are the kind of thing that
// stays wrong quietly:
//
//   1. With a filter set, the on-screen composite is exactly the composite of
//      the kept layers — the split-composite cache (#122) has to be
//      invalidated on the way in and out, or the screen would keep showing a
//      half baked before the filter changed.
//   2. The picture's own order is untouched: clearing the filter brings the
//      screen back to the full composite with nothing re-sent, which is the
//      whole reason solo is a filter rather than a visibility change.
//
// Same "independent ground truth" pattern as index.recompositeCache.test.ts:
// the expectation is a full recompute forced through setCompositeOrder, never
// the engine's own filtered output compared with itself.
import { describe, expect, it } from 'vitest'

import type { CompositeItem } from './index'
import {
  createTestEngine, expectPixelsClose, fillStroke, makeLayerAdd, readCompositePixels,
} from './testing/engineTestUtils'

describe('#557 setDisplayFilter', () => {
  function setUp() {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(makeLayerAdd('user-a', 'C'))
    engine.appendOperation(fillStroke('user-a', 'A', 2, 2, 3))
    engine.appendOperation(fillStroke('user-a', 'B', 4, 4, 3))
    engine.appendOperation(fillStroke('user-a', 'C', 6, 6, 3))
    engine.setActiveLayer('B')
    const full: CompositeItem[] = [{ id: 'A', opacity: 0.6 }, { id: 'B', opacity: 1 }, { id: 'C', opacity: 0.8 }]
    engine.setCompositeOrder(full)
    return { engine, full }
  }

  it('composites only the kept layers while the filter is set', () => {
    const { engine, full } = setUp()

    // Ground truth: what the picture would be if B were the only layer in it,
    // reached through the unconditional full-recompute path.
    engine.setCompositeOrder(full.filter(it => it.id === 'B'))
    const onlyB = readCompositePixels(engine)
    engine.setCompositeOrder(full)
    const everything = readCompositePixels(engine)
    // Sanity: the two ground truths differ, or the assertions below are vacuous.
    expect(() => expectPixelsClose(onlyB, everything, 0)).toThrow()

    engine.setDisplayFilter(new Set(['B']))
    expectPixelsClose(readCompositePixels(engine), onlyB)
  })

  it('keeps the filter across a later setCompositeOrder, and clearing it restores the full picture', () => {
    const { engine } = setUp()
    engine.setDisplayFilter(new Set(['A', 'C']))

    // A composite-order push (a peer toggling opacity, say) must not silently
    // drop the viewer's filter — the store re-derives the order far more often
    // than the solo changes.
    const reordered: CompositeItem[] = [{ id: 'A', opacity: 0.6 }, { id: 'B', opacity: 1 }, { id: 'C', opacity: 0.3 }]
    engine.setCompositeOrder(reordered)
    const filtered = readCompositePixels(engine)

    engine.setDisplayFilter(null)
    const unfiltered = readCompositePixels(engine)
    engine.setCompositeOrder(reordered.filter(it => it.id !== 'B'))
    const truthFiltered = readCompositePixels(engine)
    engine.setCompositeOrder(reordered)
    const truthUnfiltered = readCompositePixels(engine)

    expectPixelsClose(filtered, truthFiltered)
    expectPixelsClose(unfiltered, truthUnfiltered)
  })

  it('an id the filter names but the order lacks is simply absent', () => {
    const { engine, full } = setUp()
    engine.setDisplayFilter(new Set(['B', 'never-added']))
    const shown = readCompositePixels(engine)
    engine.setDisplayFilter(null)
    engine.setCompositeOrder(full.filter(it => it.id === 'B'))
    expectPixelsClose(shown, readCompositePixels(engine))
  })
})
