import { useEffect, useState } from 'react'

/** Everything the header's save indicator depends on. */
export interface SyncStatusInput {
  /** Socket is connected right now. */
  connected: boolean
  /** Operations queued but not yet confirmed by the server. */
  pending: number
}

/** Two states on purpose — the indicator answers exactly one question ("is
 *  what I drew on the server yet?"). *Why* it isn't is the banners' job:
 *  ConnectionBanner still explains a dropped socket and work that gave up
 *  retrying, and those are real problems rather than a number ticking. */
export type SyncStatus = 'saved' | 'syncing'

export function syncStatus({ connected, pending }: SyncStatusInput): SyncStatus {
  return connected && pending === 0 ? 'saved' : 'syncing'
}

/** How long the queue has to stay non-empty before the indicator admits it.
 *
 *  (#376) The thing this replaced was a toast that came and went on every
 *  stroke, and a dot that flips yellow-green-yellow at the same rate is the
 *  same annoyance in a smaller box. On a healthy connection an operation is
 *  acknowledged in tens of milliseconds, so nothing under this threshold is
 *  news: it says "saved" throughout ordinary drawing and only turns yellow
 *  once the queue is actually failing to drain. */
export const SYNC_SETTLE_MS = 600

/** `syncStatus`, with the settle delay applied to the transition *into*
 *  syncing. The way back is immediate and deliberately so — the good news is
 *  worth showing the moment it is true, and holding it would mean the
 *  indicator says "syncing" about an empty queue. */
export function useSyncStatus(input: SyncStatusInput): SyncStatus {
  const busy = syncStatus(input) === 'syncing'
  // Starts optimistic rather than at `busy`: `connected` is false on every
  // room mount until the handshake completes, and seeding from it would open
  // the room on a yellow dot for the one moment nothing is wrong yet.
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!busy) {
      setSettled(false)
      return
    }
    const handle = setTimeout(() => setSettled(true), SYNC_SETTLE_MS)
    return () => clearTimeout(handle)
  }, [busy])

  return settled ? 'syncing' : 'saved'
}
