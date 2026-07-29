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
 *  part is not the markup, it is which of four states a given (connected,
 *  everConnected, pending, stalled) tuple is — including the two that must
 *  stay silent. That is worth a test; a `<Notice>` with an icon is not.
 */
export function connectionNotice(
  { connected, everConnected, pending, stalled }: ConnectionNoticeInput,
): { key: TranslationKey; n: number } | null {
  // Nothing queued and a live socket: the ordinary state, and the whole point
  // of the banner is that it is absent then.
  if (connected && pending === 0) return null

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
  return stalled > 0
    ? { key: 'room.connection.stalled', n: stalled }
    : { key: 'room.connection.syncing', n: pending }
}
