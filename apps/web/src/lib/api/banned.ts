import { useSyncExternalStore } from 'react'

/** (#587) Whether the server has refused this browser's identity as banned.
 *
 *  The refusal can arrive through any request — the `/api/me` warm-up on load,
 *  whatever the current page happens to fetch, or a socket handshake after the
 *  ban closed a lesson in progress — so it is collected here, in one flag, by
 *  whichever of them hears it first, and App swaps the whole route tree for a
 *  single screen. A page that tried to handle it on its own would show its own
 *  error for what is not an error in that page at all.
 *
 *  Never cleared in-tab: lifting a ban is rare enough that a reload is the way
 *  back, and the screen offers one. */
let banned = false
const listeners = new Set<() => void>()

export const BANNED_ERROR_CODE = 'banned'

export function noteBanned(): void {
  if (banned) return
  banned = true
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBanned(): boolean {
  return useSyncExternalStore(subscribe, () => banned)
}
