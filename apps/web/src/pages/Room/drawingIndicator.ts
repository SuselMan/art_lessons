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
