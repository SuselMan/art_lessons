/** (#536, ADR 011 §17.49) Holds the room's confirmed-operation stream while a
 *  restore is replaying its tail, and lets it through in order afterwards.
 *
 *  Why a restore needs one now: the tail replay yields to the event loop
 *  (restoreRoomState's REPLAY_YIELD_MS). It used to run in one piece, and a
 *  watercolour room made that piece 44 s long on a tablet - every operation
 *  replays its whole settle - so the socket missed its pings, the server
 *  dropped it (ping timeout), the reconnect started the same replay again,
 *  and the room never came back ("зависла комната, ничего не работало").
 *  Yielding keeps the socket alive, but it also lets `operation_confirmed`
 *  events in between two tail operations - and an operation newer than the
 *  tail applied before the rest of the tail is out of the log's order. So
 *  while the gate is shut they wait here, and the handler gets them, in
 *  arrival order, the moment the tail is done. */
export interface ReplayGate<T> {
  /** Shut the gate: arrivals are held from now on. */
  begin(): void
  /** True (and the payload kept) while the gate is shut; false otherwise, and
   *  the caller handles the payload itself as it always did. */
  hold(payload: T): boolean
  /** Open the gate and hand every held payload to the handler, in order. */
  end(): void
  /** The handler held payloads are released to. */
  setHandler(handler: ((payload: T) => void) | null): void
}

export function createReplayGate<T>(): ReplayGate<T> {
  let shut = false
  let held: T[] = []
  let handler: ((payload: T) => void) | null = null
  return {
    begin() { shut = true },
    hold(payload) {
      if (!shut) return false
      held.push(payload)
      return true
    },
    end() {
      shut = false
      const out = held
      held = []
      for (const p of out) handler?.(p)
    },
    setHandler(h) { handler = h },
  }
}

/** Resolves on the next macrotask: long enough for the socket's ping, a
 *  pinch and a paint to get through, and no longer.
 *
 *  Not `setTimeout`: Chrome throttles timers in a hidden tab to one a second
 *  and, after a few minutes, to one a minute, so a room loading behind
 *  another tab would crawl at one slice per tick. `scheduler.yield` (Chrome
 *  129+) and a MessageChannel message are not timers. */
export function yieldToEventLoop(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (typeof sched?.yield === 'function') return sched.yield()
  if (typeof MessageChannel === 'function') {
    return new Promise(resolve => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => { ch.port1.close(); resolve() }
      ch.port2.postMessage(null)
    })
  }
  return new Promise(resolve => setTimeout(resolve, 0))
}
