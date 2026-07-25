import type { Operation, SendResult } from '@art-lessons/shared'
import type { OutboxStorage } from './outboxStorage'

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

export interface OutboxDeps {
  storage: OutboxStorage
  // Resolves with the server's verdict, or rejects/never settles on a
  // network failure/timeout — the caller (Room/index.tsx) wraps
  // socket.emit('operation', ...) with its own timeout, since a bare
  // socket.io ack has none. See sendOperationWithTimeout.
  send: (op: Operation) => Promise<SendResult>
  // Fires exactly once per operation, the moment it gets a real SendResult
  // (never for a timeout/retry) — Room/index.tsx uses this for the same
  // watermark/pendingIds/noteLayerSeq bookkeeping onLocalOperation's ack
  // callback always did, now shared by both the always-optimistic and the
  // deferred (requires_confirmation) dispatch paths.
  onSettled?: (op: Operation, result: SendResult) => void
  now?: () => number
  schedule?: (fn: () => void, delayMs: number) => void
}

/** Persistent send queue for operations this client has generated but the
 *  server hasn't yet given a definitive verdict on (reliable history spec
 *  v0.2 §9). Survives reload/crash via `storage` (real usage: IndexedDB,
 *  see outboxStorage.ts) — an operation only ever leaves the queue once it
 *  gets an actual `SendResult`, `ok` or `rejected`; a rejection is final and
 *  is never retried (see SendResult's own doc comment in packages/shared),
 *  only a timeout/network failure is.
 *
 *  Deliberately does not try to prevent an overlapping retry from double-
 *  sending the same operation — the server already dedups by
 *  `Operation.id` (see rooms.ts's findDuplicateOperation), so a harmless
 *  duplicate send just comes back `{ ok: true, duplicate: true }` instead
 *  of needing its own client-side guard. */
export class Outbox {
  private readonly storage: OutboxStorage
  private readonly send: (op: Operation) => Promise<SendResult>
  private readonly onSettled?: (op: Operation, result: SendResult) => void
  private readonly now: () => number
  private readonly schedule: (fn: () => void, delayMs: number) => void
  // opIds with a runAttempt currently in flight — purely to avoid piling up
  // redundant concurrent attempts for the same entry (e.g. resendAll()
  // called again before an earlier attempt's timeout has even settled), not
  // a correctness requirement (see the class doc comment on duplicates).
  private readonly inFlight = new Set<string>()

  constructor(deps: OutboxDeps) {
    this.storage = deps.storage
    this.send = deps.send
    this.onSettled = deps.onSettled
    this.now = deps.now ?? Date.now
    this.schedule = deps.schedule ?? ((fn, ms) => { setTimeout(fn, ms) })
  }

  /** Persists `op` and makes the first send attempt immediately. */
  async enqueue(op: Operation): Promise<void> {
    await this.storage.put({ op, attempts: 0, nextRetryAt: this.now() })
    this.attempt(op.id)
  }

  /** Re-attempts every operation still in the queue — call once on every
   *  reconnect (a fresh socket connection means any attempt in flight on
   *  the old one is moot, whether or not it actually reached the server;
   *  the dedup check above is exactly what makes resending safe). */
  async resendAll(): Promise<void> {
    const entries = await this.storage.getAll()
    for (const entry of entries) this.attempt(entry.op.id)
  }

  private attempt(opId: string): void {
    if (this.inFlight.has(opId)) return
    this.inFlight.add(opId)
    void this.runAttempt(opId)
  }

  private async runAttempt(opId: string): Promise<void> {
    // `inFlight` must stay set for this entry's *entire* duration — getAll,
    // the (potentially slow) send, and settling — not just the initial
    // lookup: clearing it any earlier would let resendAll (or another
    // enqueue racing it) start a fully redundant second send while the
    // first is still genuinely in flight, not just "not yet started".
    try {
      const entries = await this.storage.getAll()
      const entry = entries.find(e => e.op.id === opId)
      if (!entry) return // already settled (by this attempt's own earlier sibling, or resendAll racing enqueue)

      try {
        const result = await this.send(entry.op)
        await this.storage.delete(opId)
        this.onSettled?.(entry.op, result)
      } catch {
        const attempts = entry.attempts + 1
        const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS)
        await this.storage.put({ op: entry.op, attempts, nextRetryAt: this.now() + delay })
        this.schedule(() => this.attempt(opId), delay)
      }
    } finally {
      this.inFlight.delete(opId)
    }
  }
}
