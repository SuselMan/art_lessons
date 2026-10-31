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
const ticketBrand: unique symbol = Symbol('replay-gate-ticket')
const deliveryBrand: unique symbol = Symbol('replay-gate-delivery')
/** Internal local identities; neither token is wire data or transferable authority. */
export interface ReplayGateTicket { readonly [ticketBrand]: true }
export interface ReplayGateDelivery { readonly [deliveryBrand]: true }

export interface ReplayGate<T> {
  /** Replace the restore owner and shut the existing gate. */
  begin(): ReplayGateTicket
  /** A release token bypasses only this gate's current synchronous delivery,
   * exactly once. Ordinary arrivals stay queued throughout a release. */
  hold(payload: T, delivery?: ReplayGateDelivery): boolean
  /** Only the current restore can release; nested/stale attempts return false. */
  end(ticket: ReplayGateTicket): boolean
  setHandler(handler: ((payload: T, delivery?: ReplayGateDelivery) => void) | null): void
}

export function createReplayGate<T>(): ReplayGate<T> {
  let shut = false
  const held: T[] = []
  let handler: ((payload: T, delivery?: ReplayGateDelivery) => void) | null = null
  let owner: ReplayGateTicket | null = null
  let draining = false
  let inflight: { payload: T; token: ReplayGateDelivery; ticket: ReplayGateTicket; used: boolean } | null = null
  return {
    begin() {
      owner = Object.freeze({ [ticketBrand]: true as const })
      shut = true
      return owner
    },
    hold(payload, delivery) {
      if (delivery !== undefined) {
        if (!inflight || inflight.token !== delivery || inflight.payload !== payload
          || inflight.used || owner !== inflight.ticket) throw new Error('Invalid replay delivery')
        inflight.used = true
        return false
      }
      if (!shut) return false
      held.push(payload)
      return true
    },
    end(ticket) {
      if (!ticket || ticket !== owner || draining) return false
      const release = handler
      let completed = false
      let consumed = 0
      draining = true
      // Keep one queue and a scalar cursor. Reentrant arrivals append after
      // the old remainder; trim the consumed prefix once, including on throw.
      try {
        while (consumed < held.length) {
          if (owner !== ticket || handler !== release) return false
          if (!release) throw new Error('Missing replay handler')
          const payload = held[consumed++]
          const token = Object.freeze({ [deliveryBrand]: true as const })
          inflight = { payload, token, ticket, used: false }
          try { release(payload, token) } finally { inflight = null }
          // The attempted event is consumed even if the handler throws: it
          // may already have applied pixels. Never retry it implicitly.
        }
        if (owner !== ticket || handler !== release) return false
        owner = null
        shut = false
        completed = true
        return true
      } finally {
        held.splice(0, consumed)
        inflight = null
        draining = false
        if (!completed) {
          shut = true
          if (owner === ticket) owner = null
        }
      }
    },
    setHandler(next) { handler = next },
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
