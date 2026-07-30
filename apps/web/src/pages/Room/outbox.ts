import type { Operation, SendResult } from '@grafetto/shared'
import type { OutboxEntry, OutboxStorage } from './outboxStorage'

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

// (#298) How many operations may be on the wire at once. Previously
// unbounded: resendAll fired an attempt for every queued entry
// simultaneously, so a backlog of 384 strokes serialized ~55 MB of JSON into
// the socket in one go, every retry round. That is what drove the renderer's
// 275 MB -> 512 MB sawtooth on a tablet until the low-memory killer shot it.
// Small on purpose — a backlog is by definition not latency-sensitive, and
// the live path (one stroke at a time) never reaches this limit anyway.
const MAX_CONCURRENT_SENDS = 2

// (#298) After this many consecutive failures an entry stops retrying on its
// own. It is NOT discarded — it stays queued and persisted, and the next
// resendAll (a reconnect, or rejoining the room) re-arms it. The point is
// only to stop an entry that cannot currently succeed from retrying forever
// in the background; losing the drawing instead would be the worse failure.
const MAX_ATTEMPTS = 12

export interface OutboxDeps {
  storage: OutboxStorage
  // (#358) The room this queue belongs to. One Outbox serves exactly one
  // room: it stamps every entry with this id and only ever loads entries
  // carrying it. Without that, the durable half of the queue was shared by
  // every room in the browser profile, and `hydrate`/`resendAll` pulled all of
  // it into whichever room happened to be open — see OutboxEntry.roomId.
  roomId: string
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
  // (#298) Whether the socket is in a state where an operation can actually
  // be recorded — i.e. create_room/join_room has completed. Without this the
  // queue drained on *connect*, before the socket had joined anything, and
  // the server has no room to record against: every one of those sends was
  // guaranteed to fail. Returning false parks the queue instead; the next
  // resendAll (called once the join succeeds) releases it.
  canSend?: () => boolean
  // Fires when an entry hits MAX_ATTEMPTS and stops retrying on its own. The
  // operation is still queued and persisted — this is a "stuck, tell the
  // user" signal, not a discard.
  onStalled?: (op: Operation) => void
  // (#201) Fires whenever the queue's size changes, so the UI can say how
  // much work is not yet saved. Before this, the queue was completely
  // invisible: a user who drew through a long drop had no way to tell
  // whether any of it had survived, which is the difference between "I lost
  // an hour" and "the app knows about my 43 strokes".
  onPendingChange?: (pending: number, stalled: number) => void
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
 *  One instance serves one room, in memory and in storage alike (#358) — see
 *  OutboxDeps.roomId.
 *
 *  Deliberately does not try to prevent an overlapping retry from double-
 *  sending the same operation — the server already dedups by
 *  `Operation.id` (see rooms.ts's findDuplicateOperation), so a harmless
 *  duplicate send just comes back `{ ok: true, duplicate: true }` instead
 *  of needing its own client-side guard. */
export class Outbox {
  private readonly storage: OutboxStorage
  private readonly roomId: string
  private readonly send: (op: Operation) => Promise<SendResult>
  private readonly onSettled?: (op: Operation, result: SendResult) => void
  private readonly canSend?: () => boolean
  private readonly onStalled?: (op: Operation) => void
  private readonly onPendingChange?: (pending: number, stalled: number) => void
  private readonly now: () => number
  private readonly schedule: (fn: () => void, delayMs: number) => void
  // Ids waiting for a send slot, oldest first — see MAX_CONCURRENT_SENDS.
  private readonly waiting: string[] = []
  // Ids that hit MAX_ATTEMPTS and stopped retrying until the next resendAll.
  private readonly stalled = new Set<string>()
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
  // (#358) Set by dispose(): this queue's room is behind us and nothing it
  // still holds may reach the wire or the UI. See dispose's own comment.
  private disposed = false

  constructor(deps: OutboxDeps) {
    this.storage = deps.storage
    this.roomId = deps.roomId
    this.send = deps.send
    this.onSettled = deps.onSettled
    this.canSend = deps.canSend
    this.onStalled = deps.onStalled
    this.onPendingChange = deps.onPendingChange
    this.now = deps.now ?? Date.now
    this.schedule = deps.schedule ?? ((fn, ms) => { setTimeout(fn, ms) })
  }

  /** How many operations are queued but not yet confirmed, and how many of
   *  those have stopped retrying on their own (#201). */
  get pendingCount(): number { return this.pending.size }
  get stalledCount(): number { return this.stalled.size }

  /** (#358) Retires this queue when its room is left. After this nothing it
   *  holds is sent, and none of its callbacks fire again.
   *
   *  Scoping storage by room was only half of "one room's unsent work stays
   *  out of the next room". Room builds one Outbox per room id but never
   *  unmounts between rooms (`/room/:id` is one route, one component), so
   *  without this the previous room's instance stayed alive with its retry
   *  timers armed — and its `send` closes over the *shared* socket ref, which
   *  by then has joined the next room. An operation carries no room of its
   *  own, so the server recorded whatever arrived against the room the socket
   *  was in: the original bug, reached through the live queue instead of
   *  through IndexedDB.
   *
   *  The work is not lost and is deliberately not flushed here — every entry
   *  is already persisted under its own `roomId`, so opening that room again
   *  loads and sends it (see loadPersisted). Timers are not cancelled either,
   *  because `schedule` is a seam with no handle to cancel: the callbacks
   *  still fire and `attempt` turns them into no-ops, which costs one dead
   *  function call per stranded entry and keeps the seam a one-liner.
   *
   *  `onPendingChange` must stop firing too, not merely stop being useful:
   *  it drives the "N unsent" counter of whichever room is now on screen, so
   *  a retiring queue reporting its own leftovers would make the new room
   *  claim work it never had. */
  dispose(): void {
    this.disposed = true
    this.waiting.length = 0
    this.pending.clear()
    this.stalled.clear()
  }

  /** Queues `op` and makes the first send attempt immediately. Persisting it
   *  is best-effort and never gates the send (#296). */
  async enqueue(op: Operation): Promise<void> {
    if (this.disposed) return
    const entry: OutboxEntry = { op, roomId: this.roomId, attempts: 0, nextRetryAt: this.now() }
    this.pending.set(op.id, entry)
    this.onPendingChange?.(this.pending.size, this.stalled.size)
    await this.persist(entry)
    this.attempt(op.id)
  }

  /** (#313) Pulls a previous page load's unconfirmed work into the live
   *  queue *without* attempting to send any of it.
   *
   *  `resendAll` already does this as a side effect, but it may only run
   *  once a join has succeeded (#298's canSend gate) — and the moment the
   *  count matters most is exactly when that hasn't happened and can't:
   *  opening a room with no connection. Separating the load lets the offline
   *  screen say how much work is waiting instead of leaving the user to
   *  guess whether any of it survived. */
  async hydrate(): Promise<void> {
    await this.loadPersisted()
    if (this.disposed) return
    this.onPendingChange?.(this.pending.size, this.stalled.size)
  }

  private async loadPersisted(): Promise<void> {
    // Checked again *after* the read below, not only here: a room switch is
    // exactly the kind of thing that happens while an IndexedDB read is in
    // flight, and repopulating `pending` after dispose would undo it (#358).
    if (this.disposed) return
    try {
      // Scoped to this room (#358). Everything queued for a *different* room
      // stays exactly where it is — durable, unsent, and waiting for that room
      // to be opened again, which is the only place it can legally go.
      const persisted = await this.storage.getAll(this.roomId)
      if (this.disposed) return
      for (const entry of persisted) {
        if (!this.pending.has(entry.op.id)) this.pending.set(entry.op.id, entry)
      }
    } catch (err) {
      // Nothing to recover from a broken store, but everything queued in
      // this session still has to go out.
      console.error('outbox: could not read persisted queue', err)
    }
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
    await this.loadPersisted()
    if (this.disposed) return
    // Re-arms anything that gave up: a reconnect (or a completed join) is
    // exactly the change of circumstances that could make it succeed now.
    this.stalled.clear()
    for (const entry of this.pending.values()) entry.attempts = 0
    this.onPendingChange?.(this.pending.size, this.stalled.size)
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
    // Where a scheduled retry of a retired queue dies (#358) — see dispose on
    // why the timers themselves are left to fire.
    if (this.disposed) return
    if (this.inFlight.has(opId) || this.stalled.has(opId)) return
    if (!this.waiting.includes(opId)) this.waiting.push(opId)
    this.pump()
  }

  /** Starts as many queued attempts as MAX_CONCURRENT_SENDS allows. Parks
   *  the whole queue while `canSend` says the socket cannot record anything
   *  yet — entries stay in `waiting`, and the resendAll that follows a
   *  successful join releases them. */
  private pump(): void {
    if (this.disposed) return
    while (this.inFlight.size < MAX_CONCURRENT_SENDS && this.waiting.length > 0) {
      if (this.canSend && !this.canSend()) return
      const opId = this.waiting.shift()!
      if (!this.pending.has(opId) || this.inFlight.has(opId)) continue
      this.inFlight.add(opId)
      void this.runAttempt(opId)
    }
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
        // (#358) The room was left while this was on the wire. Whatever the
        // server made of it, this queue no longer speaks for anybody: don't
        // clear the durable copy and don't report a settlement to a UI that
        // has moved to another room. The entry stays persisted under its own
        // roomId and goes out again — deduped by id — when that room is next
        // opened.
        if (this.disposed) return
        // (#298) `not_joined` is the one rejection that isn't a verdict on
        // the operation — the socket simply hadn't joined a room yet, which
        // the canSend gate should already prevent. Treat it exactly like a
        // timeout: back off and try again, rather than discarding work over
        // a race the user had no part in.
        if (!result.ok && result.reason === 'not_joined') throw new Error('not_joined')
        this.pending.delete(opId)
        this.onPendingChange?.(this.pending.size, this.stalled.size)
        try {
          await this.storage.delete(opId)
        } catch (err) {
          // Worst case a settled operation is re-sent after a reload and the
          // server dedups it by id — see the class doc comment.
          console.error('outbox: could not clear persisted operation', opId, err)
        }
        this.onSettled?.(entry.op, result)
      } catch {
        if (this.disposed) return
        entry.attempts += 1
        await this.persist(entry)
        if (entry.attempts >= MAX_ATTEMPTS) {
          // Stop retrying on our own — but keep it queued and persisted, so
          // the next reconnect/join gets to try again rather than the work
          // being thrown away. See MAX_ATTEMPTS.
          this.stalled.add(opId)
          this.onPendingChange?.(this.pending.size, this.stalled.size)
          this.onStalled?.(entry.op)
          return
        }
        const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** (entry.attempts - 1), MAX_BACKOFF_MS)
        entry.nextRetryAt = this.now() + delay
        this.schedule(() => this.attempt(opId), delay)
      }
    } finally {
      this.inFlight.delete(opId)
      this.pump()
    }
  }
}
