import { useEffect, useState } from 'react'

import type { RestoreFailureReason } from './RestoreFailedOverlay'

// (#313) How long a room may sit unloaded with no socket before the
// preloader is replaced by an explicit "no connection" screen. Long enough
// that an ordinary slow load or a brief blip never trips it, short enough
// that nobody watches a spinner wondering whether their work survived.
export const OFFLINE_OVERLAY_GRACE_MS = 6000

/** Which screen covers a room that is not open yet. */
export type NotOpenScreen = 'offline' | 'paperFailed' | 'restoreFailed' | 'loading'

/** (#313, #346, #533) Four ways a room can be not-open, in order of how much
 *  they know: no socket at all, the paper texture failed, the room's own
 *  pixels never arrived, or it is simply still loading. Each replaces the one
 *  below it. Null once the room is open. */
export function notOpenScreen(input: {
  roomContentReady: boolean
  connected: boolean
  offlineGraceElapsed: boolean
  paperFailed: boolean
  restoreFailure: RestoreFailureReason | null
}): NotOpenScreen | null {
  // Deliberately gated on `roomContentReady`, not on `connected` alone: a
  // mid-session reconnect blip also flips roomContentReady false (see
  // handleRoomState), and covering a room the user has already loaded — and
  // can still pan and zoom — with "no connection" would be a lie about what
  // they're looking at. This is only for a room that never opened.
  if (input.roomContentReady) return null
  if (!input.connected && input.offlineGraceElapsed) return 'offline'
  // (#346) Offline wins the tie. With no socket the paper fetch fails too, so
  // both are true at once — and "no connection" is the diagnosis that explains
  // the other one, while a retry button that cannot possibly succeed is just
  // an invitation to press it.
  if (input.paperFailed) return 'paperFailed'
  // (#533) Behind both of those. Offline explains itself and a retry cannot
  // work without a socket; a missing paper texture is the more total failure of
  // the two, since without it the engine would refuse to draw even on a room
  // that did restore.
  if (input.restoreFailure !== null) return 'restoreFailed'
  return 'loading'
}

/** (#313) A disconnected socket alone isn't enough to give up on loading —
 *  socket.io reconnects on its own, and a slow network looks identical for
 *  the first moments. Only after this grace period does a still-absent
 *  connection get reported as offline rather than as "still loading". */
export function useOfflineGrace(connected: boolean): boolean {
  const [offlineGraceElapsed, setOfflineGraceElapsed] = useState(false)
  useEffect(() => {
    if (connected) { setOfflineGraceElapsed(false); return }
    const id = window.setTimeout(() => setOfflineGraceElapsed(true), OFFLINE_OVERLAY_GRACE_MS)
    return () => window.clearTimeout(id)
  }, [connected])
  return offlineGraceElapsed
}
