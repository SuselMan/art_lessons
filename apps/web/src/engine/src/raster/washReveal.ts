/** Presentation clock. The held wet picture cannot expire before its dry
 * target exists; calculation time is not animation time. */
export function washRevealHold(startedAt: number | null, now: number, durationMs: number): number {
  if (startedAt === null) return 1
  const left = Math.max(0, Math.min(1, 1 - (now - startedAt) / durationMs))
  return left * left
}

/** A delayed target must not produce a large first animation step. */
export function washRevealStep(dtMs: number, remainingMs: number | null): number {
  const dt = Math.max(0, Math.min(40, dtMs))
  if (remainingMs === null) return 1 - Math.exp(-dt / 1400)
  if (remainingMs <= 0) return 1
  return 1 - Math.pow(Math.max(0, 1 - dt / remainingMs), 3)
}

/** A pending target has its own Dry clock, never the canonical landing clock.
 * Once the short preview interval ends, keep following calculated changes
 * with the existing smooth tail instead of snapping an unfinished solver. */
export function washRevealRemaining(startedAt: number | null, dryPreviewAt: number | undefined, now: number, durationMs: number): number | null {
  if (startedAt !== null) return durationMs - Math.max(0, now - startedAt)
  if (dryPreviewAt === undefined) return null
  const remaining = durationMs - Math.max(0, now - dryPreviewAt)
  return remaining > 0 ? remaining : null
}
