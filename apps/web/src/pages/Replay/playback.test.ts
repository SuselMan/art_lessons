import { describe, expect, it } from 'vitest'
import type { Dab, ReplayOperation, StrokeOperation } from '@art-lessons/shared'

import { appliedCountForElapsed, buildTimeline, currentElapsedMs, formatDuration } from './playback'

const CREATED_AT = '2026-07-19T10:00:00.000Z'

function dab(t: number): Dab {
  return { x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, size: 1, aspectRatio: 1, angle: 0, opacity: 1, t }
}

/** A stroke op whose last dab lands at `lastDabT` — i.e. one that takes
 *  `lastDabT` ms to reveal dab-by-dab. `createdAt` is deliberately far from
 *  a "real" gap-based value in these tests: buildTimeline must ignore it. */
function strokeOp(lastDabT: number): ReplayOperation {
  const op: StrokeOperation = {
    id: 'op', userId: 'user', timestamp: 0, type: 'stroke',
    layerId: 'L', tool: 'pencil', preset: 'HB', color: [0, 0, 0],
    dabs: lastDabT === 0 ? [dab(0)] : [dab(0), dab(lastDabT)],
  }
  return { ...op, createdAt: CREATED_AT }
}

/** A structural op — always zero-duration in the compressed timeline,
 *  regardless of how long a real wall-clock pause preceded it. */
function nonStrokeOp(): ReplayOperation {
  return { id: 'op', userId: 'user', timestamp: 0, type: 'layer_add', layerId: 'L', name: 'Layer', createdAt: CREATED_AT }
}

describe('buildTimeline', () => {
  it('returns an empty timeline for no ops', () => {
    expect(buildTimeline([])).toEqual({ offsetsMs: [], durationMs: 0 })
  })

  it('gives every non-stroke op zero duration', () => {
    expect(buildTimeline([nonStrokeOp(), nonStrokeOp(), nonStrokeOp()])).toEqual({
      offsetsMs: [0, 0, 0], durationMs: 0,
    })
  })

  it('is 0 duration for a single non-stroke op', () => {
    expect(buildTimeline([nonStrokeOp()])).toEqual({ offsetsMs: [0], durationMs: 0 })
  })

  it("a stroke's own duration is its last dab's t", () => {
    expect(buildTimeline([strokeOp(1200)])).toEqual({ offsetsMs: [0], durationMs: 1200 })
  })

  it('offsets each op by the summed drawing-time of every op before it — idle gaps between operations do not count', () => {
    const ops = [strokeOp(500), nonStrokeOp(), strokeOp(300)]
    // op0 draws for 500ms; op1 is instant and starts right after; op2 starts
    // right after that too — none of their real recorded createdAt gaps
    // (all CREATED_AT here, i.e. zero apart) factor in either way.
    expect(buildTimeline(ops)).toEqual({ offsetsMs: [0, 500, 500], durationMs: 800 })
  })
})

describe('appliedCountForElapsed', () => {
  const offsetsMs = [0, 1000, 1000, 2500, 5000]

  it('is 0 before the first op is due', () => {
    expect(appliedCountForElapsed(offsetsMs, -1)).toBe(0)
  })

  it('counts every op whose offset has been reached, including ties', () => {
    expect(appliedCountForElapsed(offsetsMs, 0)).toBe(1)
    expect(appliedCountForElapsed(offsetsMs, 1000)).toBe(3)
    expect(appliedCountForElapsed(offsetsMs, 2000)).toBe(3)
  })

  it('is the full length once elapsed reaches the last offset', () => {
    expect(appliedCountForElapsed(offsetsMs, 5000)).toBe(5)
    expect(appliedCountForElapsed(offsetsMs, 999999)).toBe(5)
  })

  it('is always 0 for an empty timeline', () => {
    expect(appliedCountForElapsed([], 5000)).toBe(0)
  })
})

describe('currentElapsedMs', () => {
  it('holds still when playback is paused (speed 0)', () => {
    expect(currentElapsedMs(1000, 5000, 0, 9000)).toBe(5000)
  })

  it('advances 1ms of elapsed time per 1ms of wall clock at 1x', () => {
    expect(currentElapsedMs(1000, 5000, 1, 4000)).toBe(8000)
  })

  it('advances proportionally to the speed multiplier', () => {
    expect(currentElapsedMs(1000, 5000, 4, 2000)).toBe(9000)
  })
})

describe('formatDuration', () => {
  it('formats sub-minute durations', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7000)).toBe('0:07')
  })

  it('formats minutes with zero-padded seconds', () => {
    expect(formatDuration(65000)).toBe('1:05')
    expect(formatDuration(600000)).toBe('10:00')
  })

  it('never goes negative', () => {
    expect(formatDuration(-500)).toBe('0:00')
  })
})
