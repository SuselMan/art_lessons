/** Fast capillary onset and a long drying tail; exactly the same end time. */
export function morphProgress(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 1
  if (!(elapsedMs > 0)) return 0
  if (elapsedMs >= durationMs) return 1
  const fastMs = Math.min(1800, durationMs * .04)
  const value = (ms:number) => .65 * -Math.expm1(-ms / fastMs) + .35 * -Math.expm1(-3 * ms / durationMs)
  return value(elapsedMs) / value(durationMs)
}
