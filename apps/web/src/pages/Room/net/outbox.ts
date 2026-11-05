import { isTransientReject } from '@grafetto/shared'
import type { Operation, SendResult } from '@grafetto/shared'
import type { LocalDeliveryLane, OutboxEntry, OutboxStorage } from './outboxStorage'

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

/** Ordering metadata only, never material/source/append authority. Inspect own
 * scalar data without invoking an accessor from a malformed persisted record. */
type CanonicalOrder={readonly key?:string;readonly kind:'frame'|'close'|'invalid';readonly ordinal?:number}
function canonicalOrder(op:Operation):CanonicalOrder|undefined {
  const data=(value:unknown,key:string):unknown=>{
    if(!value||typeof value!=='object')return undefined
    const descriptor=Object.getOwnPropertyDescriptor(value,key)
    return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined
  }
  const type=data(op,'type')
  if(type!=='canonical_stroke'&&type!=='canonical_stroke_close')return type===undefined?{kind:'invalid'}:undefined
  const frame=data(op,'frame'),user=data(op,type==='canonical_stroke'?'userId':'targetUserId'),layer=data(op,'layerId'),stroke=data(type==='canonical_stroke'?frame:op,'strokeId')
  const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
  if(!text(user)||!text(layer)||!text(stroke))return{kind:'invalid'}
  const key=JSON.stringify([user,layer,stroke]),ordinal=data(type==='canonical_stroke'?frame:op,type==='canonical_stroke'?'frameOrdinal':'recordedNext')
  if(typeof ordinal!=='number'||!Number.isSafeInteger(ordinal)||ordinal<(type==='canonical_stroke'?0:1))return{key,kind:'invalid'}
  return{key,kind:type==='canonical_stroke'?'frame':'close',ordinal}
}

/** Scheduling lineage only, never read/append authority. */
export interface CanonicalSendLineage {
  readonly socket: object
  readonly connectionId: string
  readonly boardId: string
  readonly originalRead: object
}
export interface OutboxDeliveryContext {
  readonly roomId:string
  readonly deliveryLane?:LocalDeliveryLane
  readonly lineage?:CanonicalSendLineage
  readonly invalidLocalDelivery?:true
}
/** Bounded local classification capture, not a server/read validator. */
function captureControl(op:Operation):Operation {
  const keys=Reflect.ownKeys(op),allowed=['id','type','userId','timestamp','targetOpId','seq']
  if(keys.length>6||keys.some(k=>typeof k!=='string'||!allowed.includes(k)))throw new TypeError('Invalid canonical control body')
  const descriptors=Object.getOwnPropertyDescriptors(op)
  if(keys.some(k=>!Object.hasOwn(descriptors[k as string],'value')))throw new TypeError('Canonical control accessors unavailable')
  const data=(key:string):unknown=>descriptors[key]?.value
  const text=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
  if((data('type')!=='operation_undo'&&data('type')!=='operation_redo')||!text(data('id'))||!text(data('userId'))||!text(data('targetOpId'))||typeof data('timestamp')!=='number'||!Number.isFinite(data('timestamp'))||Number(data('timestamp'))<0||(data('seq')!==undefined&&(!Number.isSafeInteger(data('seq'))||Number(data('seq'))<1)))throw new TypeError('Invalid canonical control body')
  return Object.freeze(Object.defineProperties({},descriptors)) as Operation
}
function captureLane(options:unknown):LocalDeliveryLane|undefined {
  if(options===undefined)return undefined
  if(!options||typeof options!=='object')throw new TypeError('Invalid local delivery lane')
  const keys=Reflect.ownKeys(options),descriptor=Object.getOwnPropertyDescriptor(options,'deliveryLane')
  if(keys.length!==1||keys[0]!=='deliveryLane'||!descriptor||!Object.hasOwn(descriptor,'value')||descriptor.value!=='canonical-control-v1')throw new TypeError('Invalid local delivery lane')
  return descriptor.value
}
const sameControl=(a:Operation,b:Operation)=>['id','type','userId','timestamp','targetOpId','seq'].every(k=>Object.is(Object.getOwnPropertyDescriptor(a,k)?.value,Object.getOwnPropertyDescriptor(b,k)?.value))
type PendingEntry=OutboxEntry&{invalidLocalDelivery?:true;invalidDeliveryNotified?:true;canonicalSerialOnly?:true;canonicalFreshStart?:true;canonicalPredecessor?:CanonicalSendLineage}
type Attempt={readonly entry:PendingEntry;phase:'reserved'|'emitted'|'settling';lineage?:CanonicalSendLineage;pipeline:boolean;canonicalSerialOnly?:true}
const sameLineage=(a:CanonicalSendLineage|undefined,b:CanonicalSendLineage|undefined)=>!!a&&!!b&&a.socket===b.socket&&a.connectionId===b.connectionId&&a.boardId===b.boardId&&a.originalRead===b.originalRead

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
  send: (op: Operation, onEmitted?: () => void) => Promise<SendResult>
  getCanonicalSendLineage?: () => CanonicalSendLineage | undefined
  /** Scheduling ceiling only; every extra slot still requires an actual
   * contiguous emit on the same original gesture/connection lineage. */
  canonicalPipelineWindow?: 2 | 4
  // Fires exactly once per operation, the moment it gets a real SendResult
  // (never for a timeout/retry) — Room/index.tsx uses this for the same
  // watermark/pendingIds/confirmation bookkeeping onLocalOperation's ack
  // callback always did, now shared by both the always-optimistic and the
  // deferred (requires_confirmation) dispatch paths.
  onSettled?: (op: Operation, result: SendResult, context?:OutboxDeliveryContext) => void
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
  onStalled?: (op: Operation, context?:OutboxDeliveryContext) => void
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
 *  only a timeout/network failure is — and the transient rejections, which
 *  are neither (#298, #495: see TRANSIENT_REJECT_REASONS, and runAttempt for
 *  where they rejoin the retry path).
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
  private readonly send: OutboxDeps['send']
  private readonly getCanonicalSendLineage?: OutboxDeps['getCanonicalSendLineage']
  private readonly canonicalPipelineWindow: 2 | 4
  private readonly onSettled?: (op: Operation, result: SendResult, context?:OutboxDeliveryContext) => void
  private readonly canSend?: () => boolean
  private readonly onStalled?: (op: Operation, context?:OutboxDeliveryContext) => void
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
  private readonly inFlight = new Map<string,Attempt>()
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
  private readonly pending = new Map<string, PendingEntry>()
  // (#358) Set by dispose(): this queue's room is behind us and nothing it
  // still holds may reach the wire or the UI. See dispose's own comment.
  private disposed = false

  constructor(deps: OutboxDeps) {
    const canonicalWindow = deps.canonicalPipelineWindow ?? 2
    if (canonicalWindow !== 2 && canonicalWindow !== 4) throw new TypeError('Invalid canonical pipeline window')
    this.canonicalPipelineWindow = canonicalWindow
    this.storage = deps.storage
    this.roomId = deps.roomId
    this.send = deps.send
    this.getCanonicalSendLineage = deps.getCanonicalSendLineage
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

  /** (#176, ADR 014 §4) Resolves once nothing is still trying to go out —
   *  every entry either confirmed or stalled — or after `timeoutMs`,
   *  whichever comes first. A page turn waits on this before it asks the
   *  server to move the socket: an operation carries no board of its own, so
   *  one still on the wire when the socket moves would be recorded against
   *  the *next* board.
   *
   *  Bounded on purpose. With the connection down the queue never drains, and
   *  a person who wants the next page should not be held on this one for it:
   *  once this instance is disposed its entries stay persisted under their
   *  own board and go out the next time that board is opened (see dispose),
   *  so switching with work still queued delays it rather than losing it.
   *  Stalled entries count as settled for the same reason — they are not going
   *  anywhere until a resendAll, and that is a reconnect's business. */
  whenIdle(timeoutMs: number): Promise<void> {
    if (this.isIdle()) return Promise.resolve()
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.idleWaiters.delete(finish); resolve() }, timeoutMs)
      const finish = () => { clearTimeout(timer); resolve() }
      this.idleWaiters.add(finish)
    })
  }

  private isIdle(): boolean {
    return this.disposed || this.pending.size === this.stalled.size
  }

  private readonly idleWaiters = new Set<() => void>()

  /** Called wherever the pending/stalled counts move — the same moments
   *  `onPendingChange` fires. */
  private settleIdleWaiters(): void {
    if (!this.isIdle() || this.idleWaiters.size === 0) return
    const waiters = [...this.idleWaiters]
    this.idleWaiters.clear()
    for (const finish of waiters) finish()
  }

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
    this.settleIdleWaiters()
  }

  /** Queues `op` and makes the first send attempt immediately. Persisting it
   *  is best-effort and never gates the send (#296). */
  async enqueue(op: Operation, options?:{readonly deliveryLane:LocalDeliveryLane}): Promise<void> {
    if (this.disposed) return
    const lane=captureLane(options)
    if(lane)op=captureControl(op)
    const previous=this.pending.get(op.id)??this.inFlight.get(op.id)?.entry
    if(previous&&(lane||previous.deliveryLane||previous.invalidLocalDelivery)){
      if(!previous.invalidLocalDelivery&&lane===previous.deliveryLane&&sameControl(previous.op,op))return
      throw new TypeError('Conflicting local delivery identity')
    }
    const order=canonicalOrder(op),entry:PendingEntry={op,roomId:this.roomId,attempts:0,nextRetryAt:this.now()}
    if(lane)entry.deliveryLane=lane
    if(order?.kind==='frame'&&order.ordinal===0&&!this.pending.has(op.id))entry.canonicalFreshStart=true
    if(order?.key&&[...this.pending.values(),...Array.from(this.inFlight.values(),a=>a.entry)].some(e=>e.canonicalSerialOnly&&canonicalOrder(e.op)?.key===order.key))entry.canonicalSerialOnly=true
    if(order?.kind==='frame'&&!entry.canonicalSerialOnly){
      const lineage=this.currentLineage()
      const prior=Array.from(this.inFlight.values()).find(a=>{const o=canonicalOrder(a.entry.op);return o?.kind==='frame'&&o.key===order.key&&o.ordinal===order.ordinal!-1&&a.phase==='emitted'&&a.pipeline&&!a.canonicalSerialOnly&&!a.entry.canonicalSerialOnly&&sameLineage(a.lineage,lineage)})
      if(prior&&lineage)entry.canonicalPredecessor=lineage
    }
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
        if (!this.pending.has(entry.op.id)&&!this.inFlight.has(entry.op.id)) {
          const restored:PendingEntry={op:entry.op,roomId:entry.roomId,attempts:entry.attempts,nextRetryAt:entry.nextRetryAt,canonicalSerialOnly:true}
          const laneDescriptor=Object.getOwnPropertyDescriptor(entry,'deliveryLane')
          if(laneDescriptor){
            try{
              if(!Object.hasOwn(laneDescriptor,'value'))throw new TypeError('Invalid persisted delivery accessor')
              restored.deliveryLane=captureLane({deliveryLane:laneDescriptor.value});restored.op=captureControl(entry.op)
            }catch{restored.invalidLocalDelivery=true}
          }
          this.pending.set(restored.op.id,restored)
        }
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

  private deliveryContext(entry:OutboxEntry,lineage?:CanonicalSendLineage):OutboxDeliveryContext|undefined {
    const invalid=(entry as PendingEntry).invalidLocalDelivery
    return entry.deliveryLane||invalid?Object.freeze({roomId:entry.roomId,...(entry.deliveryLane?{deliveryLane:entry.deliveryLane}:{}),...(lineage?{lineage}:{}),...(invalid?{invalidLocalDelivery:true as const}:{})}):undefined
  }

  private async persist(entry: PendingEntry): Promise<void> {
    if(entry.invalidLocalDelivery)return
    try {
      await this.storage.put({op:entry.op,roomId:entry.roomId,attempts:entry.attempts,nextRetryAt:entry.nextRetryAt,...(entry.deliveryLane?{deliveryLane:entry.deliveryLane}:{})})
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
  /** Transient analysis of SAME pending entries, never a second retained queue.
   * A non-waiting head still blocks its gesture during persistence/backoff/stall. */
  private canonicalHeads():{eligible:Set<string>;invalid:OutboxEntry[]} {
    const eligible=new Set<string>(),invalid:OutboxEntry[]=[]
    const groups=new Map<string,{entries:PendingEntry[];ordinals:Set<number>;head?:PendingEntry;minimum:number;close?:OutboxEntry;closeNext?:number;bad:boolean}>()
    for(const entry of this.pending.values()){
      if(entry.invalidLocalDelivery){invalid.push(entry);continue}
      const order=canonicalOrder(entry.op)
      if(!order){eligible.add(entry.op.id);continue}
      if(!order.key){invalid.push(entry);continue}
      let group=groups.get(order.key)
      if(!group){group={entries:[],ordinals:new Set(),minimum:Infinity,bad:false};groups.set(order.key,group)}
      group.entries.push(entry)
      if(order.kind==='invalid'){group.bad=true;continue}
      if(order.kind==='close'){
        if(group.close)group.bad=true
        group.close=entry;group.closeNext=order.ordinal!;continue
      }
      if(group.ordinals.has(order.ordinal!))group.bad=true
      group.ordinals.add(order.ordinal!)
      if(order.ordinal!<group.minimum){group.minimum=order.ordinal!;group.head=entry}
    }
    for(const group of groups.values()){
      if(group.closeNext!==undefined&&[...group.ordinals].some(ordinal=>ordinal>=group.closeNext!))group.bad=true
      if(group.bad)invalid.push(...group.entries)
      else if(group.head){
        eligible.add(group.head.op.id)
        const lineage=this.currentLineage()
        let previous=group.head
        for(let slot=1;slot<this.canonicalPipelineWindow;slot++){
          const attempt=this.inFlight.get(previous.op.id),order=canonicalOrder(previous.op)
          if(attempt?.phase!=='emitted'||!attempt.pipeline||attempt.canonicalSerialOnly||attempt.entry.canonicalSerialOnly||!sameLineage(attempt.lineage,lineage))break
          const next=group.entries.find(e=>{const o=canonicalOrder(e.op);return o?.kind==='frame'&&o.ordinal===order!.ordinal!+1})
          if(!next||next.canonicalSerialOnly||next.attempts&&!this.inFlight.has(next.op.id))break
          eligible.add(next.op.id);previous=next
        }
      }
      else if(group.close)eligible.add(group.close.op.id)
    }
    return{eligible,invalid}
  }

  private stallEntries(entries:readonly OutboxEntry[],lineage?:CanonicalSendLineage):boolean {
    const notices:OutboxEntry[]=[]
    let classified=0
    // Classify the whole ambiguous group before any external UI callback.
    for(const entry of entries)if(!this.disposed&&this.pending.get(entry.op.id)===entry&&!this.stalled.has(entry.op.id)){
      this.stalled.add(entry.op.id);classified++
      const pending=entry as PendingEntry
      if(!pending.invalidLocalDelivery||!pending.invalidDeliveryNotified){notices.push(entry);if(pending.invalidLocalDelivery)pending.invalidDeliveryNotified=true}
    }
    if(classified)this.onPendingChange?.(this.pending.size,this.stalled.size)
    for(const entry of notices)if(!this.disposed&&this.pending.get(entry.op.id)===entry&&this.stalled.has(entry.op.id)){const context=this.deliveryContext(entry,lineage);if(context)this.onStalled?.(entry.op,context);else this.onStalled?.(entry.op)}
    this.settleIdleWaiters()
    return classified>0
  }

  private pump(): void {
    if (this.disposed) return
    // Late scheduled retries can outlive a terminal resend. Compact this SAME
    // array in linear time, preserving valid blocked heads and their order.
    let write=0
    for(const id of this.waiting)if(this.pending.has(id)&&!this.inFlight.has(id))this.waiting[write++]=id
    this.waiting.length=write
    while (this.inFlight.size < this.canonicalPipelineWindow && this.waiting.length > 0) {
      const {eligible,invalid}=this.canonicalHeads()
      const notified=this.stallEntries(invalid)
      // Stall callbacks can reenter. Recompute from the actual pending owner.
      if(notified)continue
      if (this.canSend && !this.canSend() || this.disposed) return
      const at=this.waiting.findIndex(id=>this.pending.has(id)&&!this.inFlight.has(id)&&!this.stalled.has(id)&&eligible.has(id)&&this.hasSendCapacity(this.pending.get(id)!))
      if(at<0)return
      const [opId]=this.waiting.splice(at,1)
      const entry=this.pending.get(opId)!,order=canonicalOrder(entry.op),lineage=this.currentLineage()
      if(this.disposed||this.pending.get(opId)!==entry||this.inFlight.has(opId))continue
      if(this.inFlight.size>=MAX_CONCURRENT_SENDS&&(!lineage||!this.hasSendCapacity(entry,lineage))){this.waiting.unshift(opId);return}
      const prior=order?.kind==='frame'&&order.key?Array.from(this.inFlight.values()).find(a=>{const o=canonicalOrder(a.entry.op);return o?.kind==='frame'&&o.key===order.key&&o.ordinal===order.ordinal!-1&&a.phase==='emitted'&&a.pipeline&&!a.canonicalSerialOnly&&sameLineage(a.lineage,lineage)}):undefined
      const attempt:Attempt={entry,phase:'reserved',lineage,pipeline:!!lineage&&!entry.canonicalSerialOnly&&(!!entry.canonicalFreshStart||sameLineage(entry.canonicalPredecessor,lineage)||!!prior),canonicalSerialOnly:entry.canonicalSerialOnly}
      this.inFlight.set(opId,attempt)
      void this.runAttempt(opId,attempt)
    }
  }

  /** Extra capacity belongs only to one actually emitted canonical chain.
   * Legacy, controls, mixed gestures, retries and storage settlement retain2. */
  private hasSendCapacity(entry:PendingEntry,lineage?:CanonicalSendLineage):boolean {
    if(this.inFlight.size<MAX_CONCURRENT_SENDS)return true
    if(this.inFlight.size>=this.canonicalPipelineWindow)return false
    const order=canonicalOrder(entry.op)
    if(order?.kind!=='frame'||!order.key||entry.canonicalSerialOnly)return false
    return [...this.inFlight.values()].every(attempt=>{
      const active=canonicalOrder(attempt.entry.op)
      return active?.kind==='frame'&&active.key===order.key&&attempt.phase==='emitted'&&attempt.pipeline&&!attempt.canonicalSerialOnly&&!attempt.entry.canonicalSerialOnly&&(!lineage||sameLineage(attempt.lineage,lineage))
    })
  }

  private currentLineage():CanonicalSendLineage|undefined {
    try{const value=this.getCanonicalSendLineage?.();return value&&value.boardId===this.roomId&&value.connectionId?Object.freeze({socket:value.socket,connectionId:value.connectionId,boardId:value.boardId,originalRead:value.originalRead}):undefined}catch{return undefined}
  }
  private serialOnly(entry:PendingEntry):void {
    const key=canonicalOrder(entry.op)?.key
    if(!key)return
    for(const e of this.pending.values())if(canonicalOrder(e.op)?.key===key){e.canonicalSerialOnly=true;delete e.canonicalPredecessor}
    for(const a of this.inFlight.values())if(canonicalOrder(a.entry.op)?.key===key){a.canonicalSerialOnly=true;a.entry.canonicalSerialOnly=true;delete a.entry.canonicalPredecessor;a.pipeline=false}
  }
  private async runAttempt(opId: string,attempt:Attempt): Promise<void> {
    // `inFlight` must stay set for this entry's entire attempt duration —
    // the (potentially slow) send, and settling — not just the initial
    // lookup: clearing it any earlier would let resendAll (or another
    // enqueue racing it) start a fully redundant second send while the
    // first is still genuinely in flight, not just "not yet started".
    try {
      const entry = this.pending.get(opId)
      if (!entry||entry!==attempt.entry) return // already settled (by this attempt's own earlier sibling, or resendAll racing enqueue)

      try {
        const result = await this.send(entry.op,()=>{
          if(this.disposed||this.inFlight.get(opId)!==attempt||this.pending.get(opId)!==entry||attempt.phase!=='reserved')return
          const lineage=this.currentLineage()
          // The getter can reenter: never revive a retired or faulted attempt.
          if(this.disposed||this.inFlight.get(opId)!==attempt||this.pending.get(opId)!==entry||attempt.phase!=='reserved')return
          attempt.phase='emitted'
          if(!sameLineage(attempt.lineage,lineage)||attempt.canonicalSerialOnly||entry.canonicalSerialOnly)attempt.pipeline=false
          if(attempt.pipeline&&lineage){
            const order=canonicalOrder(entry.op)
            if(order?.kind==='frame')for(const next of this.pending.values()){
              const target=canonicalOrder(next.op)
              if(target?.kind==='frame'&&target.key===order.key&&target.ordinal===order.ordinal!+1&&!next.canonicalSerialOnly)next.canonicalPredecessor=lineage
            }
          }
          this.pump()
        })
        attempt.phase='settling'
        // (#358) The room was left while this was on the wire. Whatever the
        // server made of it, this queue no longer speaks for anybody: don't
        // clear the durable copy and don't report a settlement to a UI that
        // has moved to another room. The entry stays persisted under its own
        // roomId and goes out again — deduped by id — when that room is next
        // opened.
        if (this.disposed||this.inFlight.get(opId)!==attempt||this.pending.get(opId)!==entry) return
        // (#298, #495) Some rejections aren't verdicts on the operation —
        // the socket hadn't joined yet, or the server threw while recording.
        // Treat those exactly like a timeout: back off and try again, rather
        // than discarding work over a failure the user had no part in.
        //
        // (#495) The list is the contract's, not ours: which rejections are
        // final is a property of the reason, and keeping the judgement here
        // is how the next transient reason gets silently treated as final and
        // costs somebody a stroke.
        if (!result.ok && isTransientReject(result.reason)) throw new Error(result.reason)
        if(!result.ok)this.serialOnly(entry)
        const context=this.deliveryContext(entry,attempt.lineage)
        this.pending.delete(opId)
        this.stalled.delete(opId) // a conflict may have classified an already in-flight head
        this.onPendingChange?.(this.pending.size, this.stalled.size)
        this.settleIdleWaiters()
        try {
          await this.storage.delete(opId)
        } catch (err) {
          // Worst case a settled operation is re-sent after a reload and the
          // server dedups it by id — see the class doc comment.
          console.error('outbox: could not clear persisted operation', opId, err)
        }
        // ACK cleanup can outlive a board switch. The entry was deliberately
        // removed above, so revalidate the attempt rather than pending identity.
        if(this.disposed||this.inFlight.get(opId)!==attempt)return
        if(context)this.onSettled?.(entry.op,result,context)
        else this.onSettled?.(entry.op, result)
      } catch {
        if (this.disposed||this.inFlight.get(opId)!==attempt||this.pending.get(opId)!==entry) return
        this.serialOnly(entry)
        entry.attempts += 1
        await this.persist(entry)
        if (entry.attempts >= MAX_ATTEMPTS) {
          // Stop retrying on our own — but keep it queued and persisted, so
          // the next reconnect/join gets to try again rather than the work
          // being thrown away. See MAX_ATTEMPTS.
          this.stallEntries([entry],attempt.lineage)
          return
        }
        const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** (entry.attempts - 1), MAX_BACKOFF_MS)
        entry.nextRetryAt = this.now() + delay
        this.schedule(() => this.attempt(opId), delay)
      }
    } finally {
      if(this.inFlight.get(opId)===attempt)this.inFlight.delete(opId)
      if(!this.disposed)this.pump()
    }
  }
}
