import { useEffect, useState } from 'react'

/** Everything the header's save indicator depends on. */
export interface SyncStatusInput {
  /** Socket is connected right now. */
  connected: boolean
  /** Operations queued but not yet confirmed by the server. */
  pending: number
}

/** The indicator answers one question — "is what I drew on the server?" —
 *  and `offline` is there because "no, and it can't be right now" is a
 *  materially different answer from "no, give it a moment". Detail beyond
 *  that (how many strokes, whether they gave up retrying, that we are
 *  reconnecting) stays with ConnectionBanner, which has room for a sentence. */
export type SyncStatus = 'saved' | 'syncing' | 'offline'

export function syncStatus({ connected, pending }: SyncStatusInput): SyncStatus {
  if (!connected) return 'offline'
  return pending === 0 ? 'saved' : 'syncing'
}

/** How long the indicator has to be unhappy before it says so.
 *
 *  (#376) The thing this replaced was a toast that came and went on every
 *  stroke, and a dot that flips colour at the same rate is the same annoyance
 *  in a smaller box. On a healthy connection an operation is acknowledged in
 *  tens of milliseconds, so nothing under this threshold is news: it says
 *  "saved" throughout ordinary drawing and only leaves green once the queue
 *  is actually failing to drain. It also covers the room's opening handshake,
 *  during which `connected` is false and nothing is wrong yet. */
export const SYNC_SETTLE_MS = 600

/** `syncStatus`, with the settle delay applied to leaving `saved`. The way
 *  back is immediate and deliberately so — the good news is worth showing the
 *  moment it is true, and holding it would mean the indicator reports unsent
 *  work about an empty queue. */
export function useSyncStatus(input: SyncStatusInput): SyncStatus {
  const live = syncStatus(input)
  const busy = live !== 'saved'
  // Starts optimistic rather than at `busy`: `connected` is false on every
  // room mount until the handshake completes, and seeding from it would open
  // every room on a red dot for the one moment nothing is wrong yet.
  const [settled, setSettled] = useState(false)

  // Deliberately keyed on `busy` and not on `live`: syncing and offline are
  // both "not saved", and a queue that goes unsent *because* the socket
  // dropped would otherwise restart the delay at the exact moment the news
  // got worse.
  useEffect(() => {
    if (!busy) {
      setSettled(false)
      return
    }
    const handle = setTimeout(() => setSettled(true), SYNC_SETTLE_MS)
    return () => clearTimeout(handle)
  }, [busy])

  return settled ? live : 'saved'
}
