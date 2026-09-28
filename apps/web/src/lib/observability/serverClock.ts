/** (#432) This client's estimate of the server's clock.
 *
 *  The latency meter has to compare a moment on the author's machine with a
 *  moment on a peer's, and the two clocks are not in step — a laptop and a
 *  tablet routinely disagree by seconds. Neither needs to agree with the
 *  other, though, only with the server: each estimates its own offset to the
 *  server, and both then speak server time.
 *
 *  One estimate is one round trip. `clock_sync` is answered with the server's
 *  Date.now(), and the answer is assumed to have been taken halfway through
 *  the trip — so the offset is known to within half the round trip, whichever
 *  way the asymmetry went. A few rounds are taken and the *fastest* kept: a
 *  slow round is slow because it waited somewhere, and waiting is exactly what
 *  makes the halfway assumption wrong (the NTP rule, in miniature). */

export interface ClockSample {
  /** Server clock minus local clock, ms. */
  offset: number
  /** The round trip it was taken over, ms — twice the worst-case error. */
  rtt: number
}

/** One round: local time before sending, the server's answer, local time on
 *  receipt. */
export function sampleFromRound(sentAt: number, serverNow: number, receivedAt: number): ClockSample {
  return { offset: serverNow - (sentAt + receivedAt) / 2, rtt: receivedAt - sentAt }
}

export interface ServerClock {
  /** Offer a round; kept only if it is the fastest of this sync. */
  add(sample: ClockSample): void
  /** Start a fresh sync: forget the kept round. A reconnect may have moved
   *  both the route and the offset, and a fast round from the old route would
   *  otherwise never be displaced. */
  reset(): void
  /** Now, on the server's clock; null until one round has been kept. */
  serverNow(): number | null
  /** Half the kept round trip — how far `serverNow` can be off. */
  uncertainty(): number | null
}

export function createServerClock(now: () => number = Date.now): ServerClock {
  let best: ClockSample | null = null
  return {
    add(sample) {
      if (sample.rtt < 0) return
      if (best === null || sample.rtt < best.rtt) best = sample
    },
    reset() { best = null },
    serverNow() { return best === null ? null : now() + best.offset },
    uncertainty() { return best === null ? null : best.rtt / 2 },
  }
}

/** The one clock the room's socket keeps in step. Module-level on purpose, as
 *  instrumentation rather than room state: the sender stamps packets with it
 *  and the receiver reads it, and neither is a React concern. */
export const serverClock = createServerClock()

/** Runs one sync: `rounds` round trips, one after another, keeping the
 *  fastest. `ping` resolves with the server's answer. */
export async function syncServerClock(
  ping: () => Promise<number>, rounds = 5, clock: ServerClock = serverClock, now: () => number = Date.now,
): Promise<void> {
  clock.reset()
  for (let i = 0; i < rounds; i++) {
    const sentAt = now()
    const serverNow = await ping()
    clock.add(sampleFromRound(sentAt, serverNow, now()))
  }
}
