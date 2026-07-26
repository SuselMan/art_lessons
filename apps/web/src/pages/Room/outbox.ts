import type { Operation, SendResult } from '@art-lessons/shared'
import type { OutboxEntry, OutboxStorage } from './outboxStorage'

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
  // (#296) The queue itself. `storage` is now *only* a durability mirror —
  // it exists so a reload or crash doesn't lose unconfirmed work, and
  // nothing on the send path reads from it.
  //
  // It used to be the other way round: enqueue awaited storage.put before
  // attempting a send, and runAttempt looked the operation up via
  // storage.getAll(). One IndexedDB failure therefore meant the operation
  // was never sent at all — it painted locally and silently never left the
  // device. Reported from a real Android tablet on 2026-07-26: strokes drawn
  // there never reached the server or any peer, while the same room worked
  // from desktop. A crashed tab is a very ordinary way to leave IndexedDB
  // unopenable, so this failed exactly when it was needed most.
  private readonly pending = new Map<string, OutboxEntry>()

  constructor(deps: OutboxDeps) {
    this.storage = deps.storage
    this.send = deps.send
    this.onSettled = deps.onSettled
    this.now = deps.now ?? Date.now
    this.schedule = deps.schedule ?? ((fn, ms) => { setTimeout(fn, ms) })
  }

  /** Queues `op` and makes the first send attempt immediately. Persisting it
   *  is best-effort and never gates the send (#296). */
  async enqueue(op: Operation): Promise<void> {
    const entry: OutboxEntry = { op, attempts: 0, nextRetryAt: this.now() }
    this.pending.set(op.id, entry)
    await this.persist(entry)
    this.attempt(op.id)
  }

  /** Re-attempts every operation still in the queue — call once on every
   *  reconnect (a fresh socket connection means any attempt in flight on
   *  the old one is moot, whether or not it actually reached the server;
   *  the dedup check above is exactly what makes resending safe).
   *
   *  Also the point where a previous page load's unconfirmed work is
   *  recovered from storage: anything durable that this instance doesn't
   *  already know about joins the queue. */
  async resendAll(): Promise<void> {
    try {
      for (const entry of await this.storage.getAll()) {
        if (!this.pending.has(entry.op.id)) this.pending.set(entry.op.id, entry)
      }
    } catch (err) {
      // Nothing to recover from a broken store, but everything queued in
      // this session still has to go out.
      console.error('outbox: could not read persisted queue', err)
    }
    for (const opId of [...this.pending.keys()]) this.attempt(opId)
  }

  private async persist(entry: OutboxEntry): Promise<void> {
    try {
      await this.storage.put(entry)
    } catch (err) {
      // Durability across reloads is lost for this operation; delivery is
      // not. Never rethrow — see `pending`'s doc comment.
      console.error('outbox: could not persist operation', entry.op.id, err)
    }
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
      const entry = this.pending.get(opId)
      if (!entry) return // already settled (by this attempt's own earlier sibling, or resendAll racing enqueue)

      try {
        const result = await this.send(entry.op)
        this.pending.delete(opId)
        try {
          await this.storage.delete(opId)
        } catch (err) {
          // Worst case a settled operation is re-sent after a reload and the
          // server dedups it by id — see the class doc comment.
          console.error('outbox: could not clear persisted operation', opId, err)
        }
        this.onSettled?.(entry.op, result)
      } catch {
        entry.attempts += 1
        const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** (entry.attempts - 1), MAX_BACKOFF_MS)
        entry.nextRetryAt = this.now() + delay
        await this.persist(entry)
        this.schedule(() => this.attempt(opId), delay)
      }
    } finally {
      this.inFlight.delete(opId)
    }
  }
}
