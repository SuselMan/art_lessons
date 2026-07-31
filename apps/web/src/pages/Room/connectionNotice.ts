import type { TranslationKey } from '../../i18n'

/** Everything the connection notice's wording depends on. */
export interface ConnectionNoticeInput {
  /** Socket is connected right now. */
  connected: boolean
  /** The socket has completed a connection at least once on this mount.
   *  False only during a room's very first handshake. */
  everConnected: boolean
  /** Operations queued but not yet confirmed by the server. */
  pending: number
  /** How many of those have stopped retrying on their own (#298's
   *  MAX_ATTEMPTS) — still queued and persisted, but no longer trying. */
  stalled: number
}

/** Which message ConnectionBanner shows, or null for "say nothing".
 *
 *  Its own module rather than inline in the component because the interesting
 *  part is not the markup, it is which state a given (connected,
 *  everConnected, pending, stalled) tuple is — including the ones that must
 *  stay silent. That is worth a test; a `<Notice>` with an icon is not.
 */
export function connectionNotice(
  { connected, everConnected, pending, stalled }: ConnectionNoticeInput,
): { key: TranslationKey; n: number } | null {
  // A live socket: the banner has nothing left to say about a queue that is
  // simply draining. (#376) It used to report exactly that — "Saving N
  // strokes…" — which meant a banner appearing and leaving on every single
  // stroke, and a message that was gone again before it could be read. That
  // state moved to the header's permanent indicator (SyncIndicator.tsx), where
  // a steady fact belongs. What is left here are the two cases that are not
  // a fact but a problem: a socket that is down, and work that has stopped
  // retrying — neither of which resolves itself in a moment.
  if (connected && stalled === 0) return null

  // A socket that has not connected *yet* is not a socket that has dropped.
  // `connected` starts false on every room mount, so without this the room's
  // own opening sequence announced "No connection — reconnecting…" for the
  // length of the handshake, on top of the loading preloader, every single
  // time a room was opened — the alarm firing hardest at the one moment
  // nothing is actually wrong.
  //
  // Only the empty-queue case goes quiet. Work carried over from a previous
  // visit (hydrated from IndexedDB before any connection exists — see #313)
  // is still reported immediately, because that message is about the work,
  // not about the socket. And a room that genuinely cannot connect is not
  // left unexplained: OfflineRoomOverlay takes the whole screen once the
  // grace period passes with no socket (see showOfflineOverlay in
  // Room/index.tsx).
  if (!connected && !everConnected && pending === 0) return null

  if (!connected) {
    return pending > 0
      ? { key: 'room.connection.offlineWithPending', n: pending }
      : { key: 'room.connection.offline', n: 0 }
  }
  return { key: 'room.connection.stalled', n: stalled }
}
