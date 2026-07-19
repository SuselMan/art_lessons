// Pure timing logic for the lesson-replay player (#108) — kept free of the
// engine/DOM so it can run every animation frame cheaply and be unit-tested
// without a WebGL context. See index.tsx for how these are actually driven.

export const SPEED_OPTIONS = [1, 2, 4] as const
export type Speed = (typeof SPEED_OPTIONS)[number]

export interface ReplayTimeline {
  // Same length/order as the ops array fed in — offsetsMs[i] is how far
  // (in ms) op i landed after the very first op, per the server's own
  // persisted createdAt (not the client-stamped OperationBase.timestamp).
  offsetsMs: number[]
  durationMs: number // offsetsMs[offsetsMs.length - 1], or 0 for <2 ops
}

export function buildTimeline(ops: { createdAt: string }[]): ReplayTimeline {
  if (ops.length === 0) return { offsetsMs: [], durationMs: 0 }
  const firstMs = new Date(ops[0].createdAt).getTime()
  const offsetsMs = ops.map(op => new Date(op.createdAt).getTime() - firstMs)
  return { offsetsMs, durationMs: offsetsMs[offsetsMs.length - 1] }
}

/** How many ops (counting from the start) are due to be applied once
 *  playback has reached `elapsedMs` — i.e. the count of offsets <=
 *  elapsedMs. `offsetsMs` is assumed non-decreasing (server seq order
 *  tracks insertion order, which tracks createdAt). Binary search since a
 *  long lesson's op count can run into the thousands and this runs on every
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

/** "M:SS" for the scrubber's time labels — lesson recordings run minutes to
 *  low hours, never long enough to need an hours place. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
