// (#595, ADR 015 §5) When to bake a live preview of this board.
//
// Only actual ink changes dirty a preview. Prefer a short pen-up pause, but a
// long held stroke must not leave the teacher's grid stale indefinitely.
// Rendering uses a small offscreen target; the live camera stays untouched.
// Both short edits and long strokes share the same upload rate limit.
// Pure: the caller owns the clock and timers.

export interface PreviewScheduleOptions {
  /** How long the pen must have been up before a bake. */
  idleMs?: number
  /** Minimum time between two bakes. */
  minIntervalMs?: number
}

export const PREVIEW_IDLE_MS = 250
export const PREVIEW_MIN_INTERVAL_MS = 1500

export interface PreviewSchedule {
  /** A stroke started. Prefer pen-up, with a bounded wait for long strokes. */
  notePenDown(now: number): void
  /** The stroke ended; the idle countdown starts from here. */
  notePenUp(now: number): void
  /** An operation landed on this board — ours or a peer's. */
  noteOperation(now: number): void
  /** A bake was taken. Call it when the bake *starts*, not when its upload
   *  finishes: an operation arriving while the upload is in flight is not in
   *  that picture and must count toward the next one. */
  noteBaked(now: number): void
  /** Whether to bake right now. */
  shouldBake(now: number): boolean
  /** The earliest time a check could come out differently without any new
   *  event — i.e. when to arm the caller's timer. `now` itself if it is
   *  already time; null when nothing changed since the last bake. */
  nextCheckAt(now: number): number | null
}

export function createPreviewSchedule(options: PreviewScheduleOptions = {}): PreviewSchedule {
  const idleMs = options.idleMs ?? PREVIEW_IDLE_MS
  const minIntervalMs = options.minIntervalMs ?? PREVIEW_MIN_INTERVAL_MS

  let penDown = false
  let lastPenDown = -Infinity
  // -Infinity: a board nobody has drawn on in this session is "idle since
  // forever" — a teacher's edit alone must still be able to trigger a bake.
  let lastPenUp = -Infinity
  let lastBaked = -Infinity
  let dirty = false

  function earliest(): number | null {
    if (!dirty) return null
    return Math.max(penDown ? lastPenDown + minIntervalMs : lastPenUp + idleMs, lastBaked + minIntervalMs)
  }

  return {
    notePenDown(now) { penDown = true; lastPenDown = now },
    notePenUp(now) {
      penDown = false
      lastPenUp = now
    },
    noteOperation() { dirty = true },
    noteBaked(now) {
      lastBaked = now
      dirty = false
    },
    shouldBake(now) {
      const at = earliest()
      return at !== null && now >= at
    },
    nextCheckAt(now) {
      const at = earliest()
      return at === null ? null : Math.max(now, at)
    },
  }
}
