// #108: the lesson-replay player drives a stroke's dab-by-dab reveal through
// previewOperation's `rate` parameter so 2x/4x playback speeds up the
// drawing animation itself, not just the pauses between operations (see
// Replay/index.tsx's tick()). The live room's own peer-stroke-reveal path
// never passes one (always the dabs' real recorded pacing, rate defaulting
// to 1) — see index.tiledPreview.test.ts for that existing coverage.
import { describe, expect, it, vi } from 'vitest'
import type { StrokeOperation } from '@art-lessons/shared'

import { createTestEngine, dab, makeLayerAdd, makeStroke } from './testing/engineTestUtils'

function setup() {
  let applied: StrokeOperation | null = null
  const { engine } = createTestEngine(
    { userId: 'user-a', onPreviewApplied: op => { applied = op } },
    { width: 32, height: 32 },
  )
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return { engine, getApplied: () => applied }
}

describe('previewOperation rate (#108)', () => {
  it("defaults to the dabs' own recorded real-time pacing", () => {
    vi.useFakeTimers()
    try {
      const { engine, getApplied } = setup()
      const op = makeStroke('user-b', 'L', [dab(8, 8, { t: 0 }), dab(24, 24, { t: 200 })])
      engine.previewOperation(op)

      vi.advanceTimersByTime(150) // < 200ms — the second dab isn't due yet
      expect(getApplied()).toBeNull()

      vi.advanceTimersByTime(70) // now past 200ms
      expect(getApplied()).toBe(op)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a higher rate finishes the reveal sooner, proportionally', () => {
    vi.useFakeTimers()
    try {
      const { engine, getApplied } = setup()
      const op = makeStroke('user-b', 'L', [dab(8, 8, { t: 0 }), dab(24, 24, { t: 400 })])
      engine.previewOperation(op, 4)

      vi.advanceTimersByTime(80) // 80ms real * 4 = 320 "virtual" ms — not due yet
      expect(getApplied()).toBeNull()

      vi.advanceTimersByTime(40) // 120ms real * 4 = 480 — past 400
      expect(getApplied()).toBe(op)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a lower rate stretches the reveal out, proportionally', () => {
    vi.useFakeTimers()
    try {
      const { engine, getApplied } = setup()
      const op = makeStroke('user-b', 'L', [dab(8, 8, { t: 0 }), dab(24, 24, { t: 100 })])
      engine.previewOperation(op, 0.5)

      vi.advanceTimersByTime(150) // 150ms real * 0.5 = 75 "virtual" ms — not due yet
      expect(getApplied()).toBeNull()

      vi.advanceTimersByTime(60) // 210ms real * 0.5 = 105 — past 100
      expect(getApplied()).toBe(op)
    } finally {
      vi.useRealTimers()
    }
  })

  it('multiple queued ops from the same author each keep their own requested rate', () => {
    vi.useFakeTimers()
    try {
      const { engine, getApplied } = setup()
      const slow = makeStroke('user-b', 'L', [dab(8, 8, { t: 0 }), dab(9, 9, { t: 200 })])
      const fast = makeStroke('user-b', 'L', [dab(8, 8, { t: 0 }), dab(9, 9, { t: 200 })])
      engine.previewOperation(slow, 1)
      engine.previewOperation(fast, 4) // queued behind `slow` — its own rate must survive until it's the head

      vi.advanceTimersByTime(210) // enough for `slow` (1x, 200ms) to finish...
      expect(getApplied()).toBe(slow)

      vi.advanceTimersByTime(100) // ...and then `fast` (4x, 200ms) needs only ~50 real ms more (padded generously for the 16ms tick granularity)
      expect(getApplied()).toBe(fast)
    } finally {
      vi.useRealTimers()
    }
  })
})
