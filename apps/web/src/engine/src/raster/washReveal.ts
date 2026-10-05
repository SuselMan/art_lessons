/** Presentation clock. The held wet picture cannot expire before its dry
 * target exists; calculation time is not animation time. */
export function washRevealHold(startedAt: number | null, now: number, durationMs: number): number {
  if (startedAt === null) return 1
  const left = Math.max(0, Math.min(1, 1 - (now - startedAt) / durationMs))
  return left * left
}
