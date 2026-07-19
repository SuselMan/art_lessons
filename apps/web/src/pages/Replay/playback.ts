import type { ReplayOperation } from '@art-lessons/shared'

// Pure timing logic for the lesson-replay player (#108) — kept free of the
// engine/DOM so it can run every animation frame cheaply and be unit-tested
// without a WebGL context. See index.tsx for how these are actually driven.

export const SPEED_OPTIONS = [1, 2, 4] as const
export type Speed = (typeof SPEED_OPTIONS)[number]

export interface ReplayTimeline {
  // Same length/order as the ops array fed in — offsetsMs[i] is when op i
  // starts in the *compressed* timeline (see buildTimeline's own doc
  // comment), not its real recorded createdAt.
  offsetsMs: number[]
  durationMs: number // offsetsMs[offsetsMs.length - 1] + that last op's own duration
}

/** How long `op` takes to visually draw: a stroke's own last recorded dab
 *  time (Dab.t — ms since that stroke's first dab), zero for every other
 *  op type (they always apply instantly, live or in replay). */
function opDurationMs(op: ReplayOperation): number {
  if (op.type !== 'stroke' || op.dabs.length === 0) return 0
  return op.dabs[op.dabs.length - 1].t
}

/** Builds the replay's own "compressed" timeline — every idle gap between
 *  operations removed, ops played back-to-back (Ilya: "не вижу смысла в
 *  этих паузах" — a lesson with long thinking pauses between strokes plays
 *  just as fast as one without any). Each op's offset is simply the summed
 *  drawing-time of every op before it, not the real wall-clock gap since
 *  the previous one — only actual pencil-on-paper time counts toward the
 *  timeline/duration shown. A stroke still reveals dab-by-dab at its own
 *  real recorded pace once it's its turn (Dab.t, scaled by the player's
 *  speed — see engine.previewOperation); only the *gap before* it is what
 *  gets cut, not the stroke's own motion. */
export function buildTimeline(ops: ReplayOperation[]): ReplayTimeline {
  const offsetsMs: number[] = new Array(ops.length)
  let cursor = 0
  for (let i = 0; i < ops.length; i++) {
    offsetsMs[i] = cursor
    cursor += opDurationMs(ops[i])
  }
  return { offsetsMs, durationMs: cursor }
}

/** How many ops (counting from the start) are due to be applied once
 *  playback has reached `elapsedMs` — i.e. the count of offsets <=
 *  elapsedMs. `offsetsMs` is non-decreasing by construction (buildTimeline
 *  is a running sum of non-negative durations). Binary search since a long
 *  lesson's op count can run into the thousands and this runs on every
 *  animation frame during playback. */
export function appliedCountForElapsed(offsetsMs: number[], elapsedMs: number): number {
  let lo = 0
  let hi = offsetsMs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsetsMs[mid] <= elapsedMs) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Projects the playback position forward from an anchor (the wall-clock
 *  time and timeline position last rebased at — on play, pause, seek, or a
 *  speed change) at the given speed multiplier. */
export function currentElapsedMs(
  anchorWallMs: number, anchorElapsedMs: number, speedMultiplier: number, nowWallMs: number,
): number {
  return anchorElapsedMs + (nowWallMs - anchorWallMs) * speedMultiplier
}

/** "M:SS" for the scrubber's time labels — the compressed (idle-time-cut)
 *  timeline runs from seconds to low minutes even for a long lesson, never
 *  long enough to need an hours place. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
