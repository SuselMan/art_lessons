// (#595, ADR 015 §5) When to bake a live preview of this board.
//
// The class grid wants every student's work to refresh every few seconds,
// baked on the tablet that is being drawn on. The bake is cheap now
// (engine.bakePreview) but not free, and the one moment it must never land
// in is the middle of a stroke. So the rule is:
//
//   - the pen has been up for at least `idleMs` (1.5 s) — never while it is
//     down, however long the stroke;
//   - something changed since the last preview: an operation of our own, or
//     one someone else (the teacher) made on this board;
//   - at least `minIntervalMs` (5 s) passed since the last preview — the
//     server enforces its own floor too (429), this keeps us under it.
//
// The existing triggers (every SNAPSHOT_SEQ_INTERVAL operations, and room
// exit — snapshotSync.ts) stay as they are; this only adds the "while
// working" one.
//
// Pure: no timers, no DOM, time comes in as an argument. The caller owns the
// clock and the setTimeout, which is what makes every rule here testable
// with plain numbers.

export interface PreviewScheduleOptions {
  /** How long the pen must have been up before a bake. */
  idleMs?: number
  /** Minimum time between two bakes. */
  minIntervalMs?: number
}

export const PREVIEW_IDLE_MS = 1500
export const PREVIEW_MIN_INTERVAL_MS = 5000

export interface PreviewSchedule {
  /** A stroke started. Nothing bakes until the matching notePenUp. */
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
   *  already time; null when only an event can change the answer (the pen is
   *  down, or nothing changed since the last bake). */
  nextCheckAt(now: number): number | null
}

export function createPreviewSchedule(options: PreviewScheduleOptions = {}): PreviewSchedule {
  const idleMs = options.idleMs ?? PREVIEW_IDLE_MS
  const minIntervalMs = options.minIntervalMs ?? PREVIEW_MIN_INTERVAL_MS

  let penDown = false
  // -Infinity: a board nobody has drawn on in this session is "idle since
  // forever" — a teacher's edit alone must still be able to trigger a bake.
  let lastPenUp = -Infinity
  let lastBaked = -Infinity
  let dirty = false

  function earliest(): number | null {
    if (penDown || !dirty) return null
    return Math.max(lastPenUp + idleMs, lastBaked + minIntervalMs)
  }

  return {
    notePenDown() { penDown = true },
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
