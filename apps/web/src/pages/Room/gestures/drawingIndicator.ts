// "Who's drawing" (#38) has no dedicated drawing_start/drawing_stop socket
// event in the current shared contract (adding one would be a packages/shared
// change — flagged as a nice-to-have, not done here). Instead activity is
// inferred: local strokes refresh their own timestamp continuously between
// strokeStart/strokeEnd (engine events), remote strokes refresh once per
// received `peer_operation` of type 'stroke' (which only ever arrives whole,
// after the fact). Either way "currently drawing" is just "recently active".

/** Ids considered "currently drawing": active within `timeoutMs` of `now`. */
export function currentlyDrawing(
  lastActiveAt: Readonly<Record<string, number>>,
  now: number,
  timeoutMs: number,
): string[] {
  return Object.entries(lastActiveAt)
    .filter(([, at]) => now - at <= timeoutMs)
    .map(([userId]) => userId)
}

/** True when two id lists contain the same ids, ignoring order — used to skip
 *  a re-render when a recompute doesn't actually change the visible set. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(id => set.has(id))
}

// ── Per-layer activity (layer panel highlight) ─────────────────────────────
// The same inference, keyed by *where* rather than *who*: the layer panel
// outlines the row someone is drawing into, in that person's colour. Only
// peers are fed in — your own stroke on your own active layer is already
// obvious, and a row pulsing under your pen is noise.

/** One entry per (user, layer) pair, so a peer who moves to another layer
 *  lights the new row without waiting for the old one to time out first. */
export interface LayerActivity {
  userId: string
  layerId: string
  at: number
}

export function layerActivityKey(userId: string, layerId: string): string {
  return `${userId}\u0000${layerId}`
}

/** Layer id → the ids of the users drawing into it, active within
 *  `timeoutMs` of `now`. User ids are sorted so the result is stable across
 *  recomputes regardless of who drew last. */
export function currentlyDrawingLayers(
  activity: Readonly<Record<string, LayerActivity>>,
  now: number,
  timeoutMs: number,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const { userId, layerId, at } of Object.values(activity)) {
    if (now - at > timeoutMs) continue
    ;(out[layerId] ??= []).push(userId)
  }
  for (const ids of Object.values(out)) ids.sort()
  return out
}

/** True when both maps name the same layers with the same drawers. */
export function sameLayerDrawers(
  a: Readonly<Record<string, readonly string[]>>,
  b: Readonly<Record<string, readonly string[]>>,
): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(k => b[k] !== undefined && sameIds(a[k], b[k]))
}
