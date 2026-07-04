// Caps outgoing cursor_move emits to ~30fps (#37) so a fast mouse/stylus
// doesn't flood the socket — the engine's 'pointer' event fires once per
// coalesced input event, far more often than needed for a cursor label.

export const CURSOR_EMIT_INTERVAL_MS = 1000 / 30

/** Whether enough time has passed since `lastSentAt` to emit again. */
export function shouldEmitCursor(
  lastSentAt: number,
  now: number,
  minIntervalMs: number = CURSOR_EMIT_INTERVAL_MS,
): boolean {
  return now - lastSentAt >= minIntervalMs
}
