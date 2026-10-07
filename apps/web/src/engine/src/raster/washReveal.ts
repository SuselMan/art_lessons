/** Presentation clock. The held wet picture cannot expire before its dry
 * target exists; calculation time is not animation time. */
export function washRevealHold(startedAt: number | null, now: number, durationMs: number): number {
  if (startedAt === null) return 1
  const left = Math.max(0, Math.min(1, 1 - (now - startedAt) / durationMs))
  return left * left
}

/** A delayed target must not produce a large first animation step. */
export function washRevealStep(dtMs: number, remainingMs: number | null, partialTauMs?: number): number {
  const dt = Math.max(0, Math.min(40, dtMs))
  if (remainingMs === null) {
    const tau = Number.isFinite(partialTauMs) ? Math.max(150, Math.min(1400, partialTauMs!)) : 1400
    return 1 - Math.exp(-dt / tau)
  }
  if (remainingMs <= 0) return 1
  return 1 - Math.pow(Math.max(0, 1 - dt / remainingMs), 3)
}
