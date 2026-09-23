// A ribbon gesture replayed a second time must start clean.
//
// The chunk cache (_replayRibbonChunks) exists so a long gesture split across
// several operations paints as one connected figure on replay: the second
// operation gets the first one's last dab as `prevDab`, and the band builder
// bridges the two. Nothing evicted that cache when a layer was rebuilt from its
// log, so a *rebuild* replaying the very same gesture again found its own
// previous pass still cached — and bridged the gesture's first dab onto its own
// last one. A single wavy line came back with its two ends joined by a straight
// hairline (thin because a brush pen's last dab is tapered), which is what "два
// раза undo и последняя линия меняется" was.
//
// Asserted through the band builder's own argument rather than through pixels:
// MockGL never rasterizes the ribbon programs (see mockGL.ts), so the phantom
// band is invisible to a pixel readback here. The recording wrapper is a plain
// closure rather than vi.fn — a mockClear() from a hook drops a module
// factory's implementation under Vitest 4, and this needs the real builder to
// keep running.
import { describe, expect, it, vi } from 'vitest'

import type { Dab } from '@grafetto/shared'

import {
  createTestEngine, dab, makeLayerAdd, makeStroke, markerReplayChunkFor,
} from './testing/engineTestUtils'

const recorded = vi.hoisted(() => ({ prevDabs: [] as Array<Dab | undefined> }))

vi.mock('./src/markerRibbon', async importOriginal => {
  const actual = await importOriginal<typeof import('./src/markerRibbon')>()
  return {
    ...actual,
    buildRibbonBands: (...args: Parameters<typeof actual.buildRibbonBands>) => {
      recorded.prevDabs.push(args[2])
      return actual.buildRibbonBands(...args)
    },
  }
})

/** Every dab the band builder was handed to bridge *from* since the last
 *  reset. Empty is what a room of single-operation gestures must produce:
 *  there is no earlier chunk to bridge from. */
function bridges(): Array<Dab | undefined> {
  return recorded.prevDabs.filter(Boolean)
}

function watchBands(): void {
  recorded.prevDabs.length = 0
}

function wavyLine(y: number): Dab[] {
  return [0, 1, 2, 3, 4, 5].map(i => dab(10 + i * 6, y + (i % 2 ? 3 : -3), { size: 8 }))
}

function layer() {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

function threeLines() {
  const engine = layer()
  for (const [i, y] of [16, 32, 48].entries()) {
    engine.appendOperation(makeStroke(
      'user-a', 'L', wavyLine(y), { tool: 'brushPen', strokeId: `g${i + 1}` },
    ))
  }
  return engine
}

describe('ribbon replay across a layer rebuild (#554)', () => {
  it('does not bridge a gesture onto its own previous replay', () => {
    const engine = threeLines()
    watchBands()

    engine.undo()
    engine.undo()

    expect(bridges()).toEqual([])
  })

  it('gives a re-replayed gesture a fresh scratch', () => {
    const engine = threeLines()
    const first = markerReplayChunkFor(engine, 'g1')?.scratch

    engine.undo()

    expect(first).toBeTruthy()
    expect(markerReplayChunkFor(engine, 'g1')?.scratch).not.toBe(first)
  })

  // The reason the cache exists at all — a rebuild must not cost a long gesture
  // its own internal continuity, only its continuity with whatever replayed it
  // last.
  it('still bridges the chunks of one gesture within a single replay', () => {
    const engine = layer()
    engine.appendOperation(makeStroke('user-a', 'L', wavyLine(16), { tool: 'brushPen', strokeId: 'g1' }))
    engine.appendOperation(makeStroke('user-a', 'L', wavyLine(24), { tool: 'brushPen', strokeId: 'g1' }))
    engine.appendOperation(makeStroke('user-a', 'L', wavyLine(32), { tool: 'brushPen', strokeId: 'g2' }))
    watchBands()

    engine.undo() // drops g2, rebuilds the layer from g1's two chunks

    expect(bridges()).toHaveLength(1)
  })
})
