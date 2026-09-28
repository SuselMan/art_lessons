import { useEffect, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'

import { syncServerClock } from '../../lib/serverClock'

// A route can change under a long lesson (wifi to mobile, a VPN coming up),
// and with it the offset; a sync is five tiny round trips, so it is repeated
// rather than trusted for the whole session.
const RESYNC_MS = 60_000
const PING_TIMEOUT_MS = 5_000

/** (#432) Keeps serverClock in step while the socket is up: one sync on every
 *  (re)connect, then once a minute. A failed round is dropped silently — the
 *  meter simply goes on with the last good estimate, or measures nothing, and
 *  neither is worth a notice to anyone. */
export function useServerClockSync(
  socketRef: RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null>, connected: boolean,
): void {
  useEffect(() => {
    const socket = socketRef.current
    if (!connected || !socket) return
    const ping = () => new Promise<number>((resolve, reject) => {
      socket.timeout(PING_TIMEOUT_MS).emit('clock_sync', (err: Error | null, serverNow: number) => {
        if (err) reject(err)
        else resolve(serverNow)
      })
    })
    const run = () => { syncServerClock(ping).catch(() => {}) }
    run()
    const timer = setInterval(run, RESYNC_MS)
    return () => clearInterval(timer)
  }, [connected, socketRef])
}
