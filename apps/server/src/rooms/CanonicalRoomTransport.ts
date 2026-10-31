import { isDeepStrictEqual } from 'node:util'
import {
  STRAIGHT_ROOM_RASTER_VERSION,
  type CanonicalStrokeBegin, type CanonicalStrokeBeginResult, type CanonicalStrokeLive, type CanonicalStrokeLiveResult,
  type CanonicalStrokeOperation, type CanonicalStrokeSnapshot, type SendResult, type CanonicalRecordedAttachmentV1, prepareCanonicalRecordedAttachment,
} from '@grafetto/shared'
import { canonicalBrushStorageContext } from '../brushLibrary/storage.js'
import { prisma } from '../db/prisma.js'
import { CanonicalBrushCapabilityResolver } from './CanonicalBrushCapabilityResolver.js'
import { CanonicalStrokeAdmission, decodeTrustedCanonicalFrame, type CanonicalAdmissionIdentity, type TrustedCanonicalGesture } from './CanonicalStrokeAdmission.js'
import { CANONICAL_ROOM_EXECUTION_POLICY, freezeCanonicalAutoPolicies, type CanonicalRoomExecutionPolicy } from './canonicalExecutionPolicy.js'
import { canonicalPaintRejectReason } from './operationGate.js'
import { canonicalWriteFence, ensureCanonicalWrite, findDuplicateOperation, knownCanonicalWrite, recordOperation, updateAliveIds } from './operationLog.js'
import { canonicalOperationRowSelect, verifyCanonicalOperationRow } from './roomPersistence.js'
import { flushRoomWrites, lessonRecordOf, rooms, type RoomRecord } from './roomRegistry.js'
import { getOperationsBefore } from './snapshotStore.js'

const MAX_ROOMS = 64, MAX_GESTURES = 1024, MAX_BEGIN_JOBS = 4, PREFIX_WINDOW = 64, PREFIX_FRAMES = 32, PREFIX_BYTES = 4 * 1024 * 1024
class TransportFailure extends Error {
  constructor(readonly reason: 'invalid_operation' | 'not_joined' | 'canonical_repair_required' | 'server_error') { super(reason) }
}
function fail(reason: TransportFailure['reason']): never { throw new TransportFailure(reason) }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !v.includes('\0')
const gestureKey = (i: CanonicalAdmissionIdentity, strokeId: string) => JSON.stringify([i.roomId, i.userId, strokeId])
interface Session {
  readonly grant: TrustedCanonicalGesture
  readonly admission: CanonicalStrokeAdmission
  durableRecordedNext: number
  recordedTail?: CanonicalStrokeOperation
}
interface RoomLifetime { readonly record: RoomRecord; readonly lesson: RoomRecord; readonly sessions: Map<string, Session> }
/** Actual protocol coordinator. No author/RNG execution, second log, straight
 * room opener, or renderer activation. Async DB checks end BEFORE the existing
 * synchronous prepare -> pin -> record(seq) -> commit section. Durable ACK/relay
 * waits for the SAME write queue outcome after that section. */
export class CanonicalRoomTransport {
  private readonly policy:CanonicalRoomExecutionPolicy
  constructor(policy:CanonicalRoomExecutionPolicy=CANONICAL_ROOM_EXECUTION_POLICY){
    this.policy=Object.freeze({...policy,alphaDarkenVariants:Object.freeze([...policy.alphaDarkenVariants]),autoSources:freezeCanonicalAutoPolicies(policy.autoSources)})
  }
  private context: ReturnType<typeof canonicalBrushStorageContext>
  private binder?: CanonicalBrushCapabilityResolver
  private readonly lifetimes = new Map<string, RoomLifetime>()
  private readonly begins = new Map<string, { readonly signature: string; readonly promise: Promise<CanonicalStrokeBeginResult> }>()

  async begin(identity: CanonicalAdmissionIdentity, input: CanonicalStrokeBegin, isCurrent: () => boolean): Promise<CanonicalStrokeBeginResult> {
    try {
      const lifetime = this.authorized(identity, input?.layerId)
      const binder = this.currentBinder(), prepared = binder.prepareBeginGesture(identity, input)
      const g = prepared.grant
      input = Object.freeze({ layerId: g.layerId, brush: g.brush, strokeId: g.strokeId, pigmentRgb8: g.pigmentRgb8,
        outerResourceOpacity: g.composition.outerResourceOpacity, alphaDarken: g.composition.alphaDarken })
      const key = gestureKey(identity, input.strokeId), signature = JSON.stringify(input)
      const pending = this.begins.get(key)
      if (pending) {
        if (pending.signature !== signature) fail('invalid_operation')
        const result = await pending.promise
        if (!isCurrent()) fail('not_joined')
        this.sameLifetime(identity, input.layerId, lifetime)
        return result
      }
      if (this.begins.size >= MAX_BEGIN_JOBS) fail('canonical_repair_required')
      const promise = this.finishBegin(identity, input, lifetime, binder, prepared, isCurrent)
      this.begins.set(key, { signature, promise })
      try { return await promise } finally { if (this.begins.get(key)?.promise === promise) this.begins.delete(key) }
    } catch (error) { return { ok: false, reason: reason(error) } }
  }

  private async finishBegin(identity: CanonicalAdmissionIdentity, input: CanonicalStrokeBegin, lifetime: RoomLifetime,
    binder: CanonicalBrushCapabilityResolver, prepared: ReturnType<CanonicalBrushCapabilityResolver['prepareBeginGesture']>,
    isCurrent: () => boolean): Promise<CanonicalStrokeBeginResult> {
    const key = gestureKey(identity, input.strokeId), previous = lifetime.sessions.get(key), context = this.context!
    if (previous) {
      await this.durablePrefix(lifetime, previous)
      if (!isCurrent()) fail('not_joined')
      this.sameLifetime(identity, input.layerId, lifetime)
      if (lifetime.sessions.get(key) !== previous || this.binder !== binder) fail('canonical_repair_required')
      this.requireHealthyWrites(lifetime)
      context.storage.pin(identity.roomId, identity.userId, [prepared.grant.brush], context.operator)
      prepared.commit()
      return snapshot(previous)
    }
    const watermark = lifetime.record.nextSeq - 1
    // Drain the existing persistence queue; still cross-check resident history,
    // because a failed background DB write is not proof that a gesture is new.
    await flushRoomWrites(identity.roomId)
    this.requireHealthyWrites(lifetime)
    const count = await prisma.operation.count({ where: { roomId: identity.roomId, userId: identity.userId, type: 'canonical_stroke',
      seq: { lte: watermark }, data: { path: ['frame', 'strokeId'], equals: input.strokeId } } })
    if (!Number.isSafeInteger(count) || count < 0 || count > PREFIX_FRAMES) fail('canonical_repair_required')
    const history = count ? await getOperationsBefore(identity.roomId, watermark + 1, PREFIX_WINDOW) : []
    if (!isCurrent()) fail('not_joined')
    this.sameLifetime(identity, input.layerId, lifetime)
    if (this.binder !== binder || canonicalBrushStorageContext()?.storage !== context.storage) fail('canonical_repair_required')
    if (Buffer.byteLength(JSON.stringify(history), 'utf8') > PREFIX_BYTES) fail('canonical_repair_required')
    const prefix = history.filter(op => op.type === 'canonical_stroke' && op.userId === identity.userId && op.frame.strokeId === input.strokeId)
    const resident = lifetime.record.operations.filter(op => op.type === 'canonical_stroke' && op.userId === identity.userId && op.frame.strokeId === input.strokeId && (op.seq ?? Infinity) <= watermark)
    if (prefix.length !== count || resident.some(op => !prefix.some(p => p.id === op.id && isDeepStrictEqual(p, op)))) fail('canonical_repair_required')
    let hydrating = true
    const admission = new CanonicalStrokeAdmission({ maxGestures: 1, retainedFrames: 8, resolve: (i, s) => hydrating
      ? i.roomId === identity.roomId && i.userId === identity.userId && s.layerId === input.layerId && s.brush === input.brush && s.strokeId === input.strokeId ? prepared.grant : undefined
      : binder.resolve(i, s) })
    try {
      let lastSeq = 0
      for (const value of prefix) {
        const op = canonicalOperation(value, identity, true)
        if (!op.seq || op.seq <= lastSeq || op.seq > watermark) fail('canonical_repair_required')
        lastSeq = op.seq
        admission.prepare(identity, { type: 'canonical_stroke', id: op.id, layerId: op.layerId, frame: op.frame }).commit()
        // Reconstructed old live traffic is never relayed. Advance both lanes so
        // reconnect can start the next live ordinal without replaying old ink.
        admission.prepare(identity, { type: 'canonical_stroke_live', layerId: op.layerId, frame: op.frame }).commit()
      }
    } catch { fail('canonical_repair_required') }
    // No await or arbitrary callback after this recheck through pin/publication.
    this.sameLifetime(identity, input.layerId, lifetime)
    context.storage.pin(identity.roomId, identity.userId, [prepared.grant.brush], context.operator)
    prepared.commit(); hydrating = false
    const session: Session = { grant: prepared.grant, admission, durableRecordedNext: prefix.length }
    lifetime.sessions.set(key, session)
    return snapshot(session)
  }

  live(identity: CanonicalAdmissionIdentity, value: CanonicalStrokeLive): { readonly result: CanonicalStrokeLiveResult; readonly accepted?: CanonicalStrokeLive } {
    try {
      if (!object(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'layerId') || !Object.hasOwn(value, 'frame') || !object(value.frame)) fail('invalid_operation')
      const lifetime = this.authorized(identity, value.layerId), session = this.session(lifetime, identity, value.frame.strokeId)
      const ticket = session.admission.prepare(identity, { type: 'canonical_stroke_live', layerId: value.layerId, frame: value.frame })
      this.context!.storage.pin(identity.roomId, identity.userId, [session.grant.brush], this.context!.operator)
      ticket.commit()
      return { result: { ok: true, duplicate: ticket.duplicate }, ...(ticket.duplicate ? {} : { accepted: { layerId: ticket.value.candidate.layerId, frame: ticket.value.candidate.frame } }) }
    } catch (error) { return { result: { ok: false, reason: reason(error) } } }
  }

  async recorded(identity: CanonicalAdmissionIdentity, value: unknown, isCurrent: () => boolean): Promise<{ readonly result: SendResult; readonly accepted?: CanonicalStrokeOperation; readonly canonicalCapabilities?:CanonicalRecordedAttachmentV1 }> {
    try {
      const raw = canonicalOperation(value, identity, true), lifetime = this.authorized(identity, raw.layerId)
      const session = this.session(lifetime, identity, raw.frame.strokeId)
      const decoded = decodeTrustedCanonicalFrame(raw.frame,session.grant,raw.frame.frameOrdinal)
      const op: CanonicalStrokeOperation = Object.freeze({ type: 'canonical_stroke', id: raw.id, userId: identity.userId,
        timestamp: raw.timestamp, layerId: raw.layerId, frame: decoded.envelope, ...(raw.seq === undefined ? {} : { seq: raw.seq }) })
      let existing = findDuplicateOperation(identity.roomId, op.id)
      if (!existing) {
        // Unknown IDs may be snapshot-covered. Validate authoritative uniqueness
        // BEFORE entering the synchronous mutation section; no second journal.
        const row = await prisma.operation.findUnique({ where: { id: op.id }, select: canonicalOperationRowSelect })
        if (row) {
          if (row.roomId !== identity.roomId || row.userId !== identity.userId) fail('invalid_operation')
          const stored = canonicalOperation(row.data, identity, true)
          try { verifyCanonicalOperationRow(identity.roomId, stored, row) } catch { fail('canonical_repair_required') }
          existing = stored
        }
      }
      if (!isCurrent()) fail('not_joined')
      this.sameLifetime(identity, op.layerId, lifetime)
      if (lifetime.sessions.get(gestureKey(identity, op.frame.strokeId)) !== session || !this.binder?.resolve(identity, { layerId: op.layerId, brush: op.frame.brush, strokeId: op.frame.strokeId })) fail('canonical_repair_required')
      // Another request can have committed while the ID lookup awaited.
      existing = findDuplicateOperation(identity.roomId, op.id) ?? existing
      if (existing) return await this.durableDuplicate(identity, op, existing, lifetime, session, isCurrent)
      if (op.seq !== undefined) fail('invalid_operation')
      await this.durablePrefix(lifetime, session)
      if (!isCurrent()) fail('not_joined')
      this.sameLifetime(identity, op.layerId, lifetime)
      if (lifetime.sessions.get(gestureKey(identity, op.frame.strokeId)) !== session) fail('canonical_repair_required')
      this.requireHealthyWrites(lifetime)
      // A different socket may have appended this ID while awaiting a pending
      // prefix. Retrying enters the exact duplicate path, never allocates seq2.
      const raced = findDuplicateOperation(identity.roomId, op.id)
      if (raced) return await this.durableDuplicate(identity, op, raced, lifetime, session, isCurrent)
      const ticket = session.admission.prepare(identity, { type: 'canonical_stroke', id: op.id, layerId: op.layerId, frame: op.frame })
      if (ticket.duplicate) fail('canonical_repair_required')
      this.context!.storage.pin(identity.roomId, identity.userId, [session.grant.brush], this.context!.operator)
      const canonical: CanonicalStrokeOperation = { ...op, frame: ticket.value.candidate.frame }
      updateAliveIds(identity.roomId, canonical)
      const accepted = recordOperation(identity.roomId, canonical) as CanonicalStrokeOperation
      ticket.commit()
      session.recordedTail = accepted
      const outcome = await ensureCanonicalWrite(lifetime.record, accepted)
      if (!outcome.ok) fail('canonical_repair_required')
      session.durableRecordedNext = Math.max(session.durableRecordedNext, accepted.frame.frameOrdinal + 1)
      if (!isCurrent()) fail('not_joined')
      this.sameLifetime(identity, op.layerId, lifetime)
      if (lifetime.sessions.get(gestureKey(identity, op.frame.strokeId)) !== session) fail('canonical_repair_required')
      this.requireHealthyWrites(lifetime)
      return { result: { ok: true, seq: accepted.seq! }, accepted, ...this.recordedAttachment(accepted,session) }
    } catch (error) { return { result: { ok: false, reason: reason(error) } } }
  }

  private async durableDuplicate(identity: CanonicalAdmissionIdentity, op: CanonicalStrokeOperation, existing: unknown, lifetime: RoomLifetime, session: Session, isCurrent: () => boolean): Promise<{ readonly result: SendResult; readonly accepted?: CanonicalStrokeOperation; readonly canonicalCapabilities?:CanonicalRecordedAttachmentV1 }> {
    const stored = canonicalOperation(existing, identity, true)
    if (!stored.seq || !sameOperation(op, stored) || op.seq !== undefined && op.seq !== stored.seq) fail('invalid_operation')
    decodeTrustedCanonicalFrame(op.frame,session.grant,op.frame.frameOrdinal)
    // An equal RAM object is not proof of a successful insert. Pending
    // attempts join; a failed immutable row gets one explicit same-ID retry.
    if (lifetime.record.operationsById.get(stored.id) === existing) {
      if (!knownCanonicalWrite(stored)) fail('canonical_repair_required')
      const outcome = await ensureCanonicalWrite(lifetime.record, stored, { retryFailed: true })
      if (!outcome.ok) fail('canonical_repair_required')
    }
    if (!isCurrent()) fail('not_joined')
    this.sameLifetime(identity, op.layerId, lifetime)
    if (lifetime.sessions.get(gestureKey(identity, op.frame.strokeId)) !== session) fail('canonical_repair_required')
    this.requireHealthyWrites(lifetime)
    if (session.recordedTail === existing) session.durableRecordedNext = Math.max(session.durableRecordedNext, stored.frame.frameOrdinal + 1)
    // Repaired confirmations are at-least-once. The existing client log
    // deduplicates ID/seq; otherwise an initial failed insert loses relay.
    return { result: { ok: true, seq: stored.seq, duplicate: true }, accepted: stored, ...this.recordedAttachment(stored,session) }
  }

  /** Call ONLY after the actual accepted object's durable write succeeded or
   * the existing duplicate DB row was verified, with current session lifetime.
   * No synthetic row, reader BEGIN, new registry or extra policy lookup. */
  private recordedAttachment(op:CanonicalStrokeOperation,session:Session):{readonly canonicalCapabilities?:CanonicalRecordedAttachmentV1} {
    const g=session.grant
    // Historical V1/PNG confirmations retain their exact closed-lane shape.
    // They cannot enter the new V2-only read/renderer contract.
    if(!('version' in g.material))return {}
    const source=Object.freeze({originalUserId:g.userId,snapshot:Object.freeze({layerId:g.layerId,brush:g.brush,strokeId:g.strokeId,boardEpoch:g.boardEpoch,
      descriptorSha256:g.descriptorSha256,rasterProfile:g.rasterProfile,pigmentRgb8:g.pigmentRgb8,composition:g.composition,assets:g.material.assets,
      materialVersion:2 as const,material:g.material})})
    const canonicalCapabilities=Object.freeze({version:1 as const,roomId:g.roomId,boardEpoch:g.boardEpoch,capabilities:Object.freeze([source]),
      bindings:Object.freeze([Object.freeze({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0})])})
    try { prepareCanonicalRecordedAttachment(canonicalCapabilities,[op],{roomId:g.roomId,boardEpoch:g.boardEpoch}) }
    catch { fail('canonical_repair_required') } // durable row exists; never invite mutation as a new operation
    return {canonicalCapabilities}
  }

  private requireHealthyWrites(lifetime: RoomLifetime): void {
    if (canonicalWriteFence(lifetime.record).failed) fail('canonical_repair_required')
  }
  private async durablePrefix(lifetime: RoomLifetime, session: Session): Promise<void> {
    const tail = session.recordedTail
    if (tail && session.durableRecordedNext <= tail.frame.frameOrdinal) {
      const outcome = await ensureCanonicalWrite(lifetime.record, tail)
      if (!outcome.ok || session.recordedTail !== tail) fail('canonical_repair_required')
      session.durableRecordedNext = tail.frame.frameOrdinal + 1
    }
    if (session.durableRecordedNext !== session.admission.cursor(session.grant, session.grant.strokeId).recordedNext) fail('canonical_repair_required')
  }

  private session(lifetime: RoomLifetime, identity: CanonicalAdmissionIdentity, strokeId: unknown): Session {
    if (!text(strokeId)) fail('invalid_operation')
    const session = lifetime.sessions.get(gestureKey(identity, strokeId))
    if (!session) fail('canonical_repair_required')
    return session
  }
  private currentBinder(): CanonicalBrushCapabilityResolver {
    const context = canonicalBrushStorageContext()
    if (!context) fail('server_error')
    if (!this.binder || this.context?.storage !== context.storage || this.context.operator !== context.operator) {
      this.context = context; this.lifetimes.clear()
      this.binder = new CanonicalBrushCapabilityResolver({ storage: context.storage, operator: () => context.operator,
        ...this.policy, maxGestures: MAX_GESTURES })
    }
    return this.binder
  }
  private authorized(identity: CanonicalAdmissionIdentity, layerId: unknown): RoomLifetime {
    if (!text(identity?.roomId) || !text(identity?.userId) || !text(layerId)) fail('invalid_operation')
    const record = rooms.get(identity.roomId)
    if (!record || record.room.rasterVersion !== STRAIGHT_ROOM_RASTER_VERSION) fail('invalid_operation')
    let lesson: RoomRecord
    try { lesson = lessonRecordOf(record) } catch { fail('canonical_repair_required') }
    if (canonicalPaintRejectReason(record, lesson, identity.userId, layerId)) fail('invalid_operation')
    this.currentBinder()
    for (const [roomId, old] of this.lifetimes) {
      let sameLesson = false
      try { sameLesson = lessonRecordOf(old.record) === old.lesson } catch { /* retired lesson */ }
      if (rooms.get(roomId) !== old.record || !sameLesson) {
        this.binder!.clearRoom(roomId); this.lifetimes.delete(roomId)
      }
    }
    let lifetime = this.lifetimes.get(identity.roomId)
    if (!lifetime) {
      if (this.lifetimes.size >= MAX_ROOMS) fail('canonical_repair_required')
      lifetime = { record, lesson, sessions: new Map() }; this.lifetimes.set(identity.roomId, lifetime)
    }
    return lifetime
  }
  private sameLifetime(identity: CanonicalAdmissionIdentity, layerId: string, expected: RoomLifetime): void {
    if (this.authorized(identity, layerId) !== expected) fail('canonical_repair_required')
  }
}
function snapshot(session: Session): CanonicalStrokeBeginResult {
  const g = session.grant
  const value: CanonicalStrokeSnapshot = Object.freeze({ layerId: g.layerId, brush: g.brush, strokeId: g.strokeId, boardEpoch: g.boardEpoch,
    descriptorSha256: g.descriptorSha256, rasterProfile: g.rasterProfile, pigmentRgb8: g.pigmentRgb8, composition: g.composition, assets: g.material.assets,
    ...('version' in g.material?{materialVersion:2 as const,material:g.material}:{}) })
  return { ok: true, snapshot: value, ...session.admission.cursor(g, g.strokeId) }
}
function reason(error: unknown): TransportFailure['reason'] {
  if (error instanceof TransportFailure) return error.reason
  if (error instanceof TypeError || error instanceof RangeError || error instanceof Error
    && /^(canonical capability:|canonical admission:|canonical material:|Canonical stroke frame)/.test(error.message)) return 'invalid_operation'
  return 'server_error'
}
function canonicalOperation(value: unknown, identity: CanonicalAdmissionIdentity, allowSeq: boolean): CanonicalStrokeOperation {
  if (!object(value) || value.type !== 'canonical_stroke' || !text(value.id) || value.userId !== identity.userId
    || typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp) || value.timestamp < 0 || !text(value.layerId) || !object(value.frame)
    || Object.keys(value).some(k => !['type', 'id', 'userId', 'timestamp', 'seq', 'layerId', 'frame'].includes(k))
    || !['type', 'id', 'userId', 'timestamp', 'layerId', 'frame'].every(k => Object.hasOwn(value, k))
    || value.seq !== undefined && (!allowSeq || !Number.isSafeInteger(value.seq) || (value.seq as number) < 1)) fail('invalid_operation')
  return value as unknown as CanonicalStrokeOperation
}
function sameOperation(a: CanonicalStrokeOperation, b: CanonicalStrokeOperation): boolean {
  return a.type === b.type && a.id === b.id && a.userId === b.userId && a.timestamp === b.timestamp && a.layerId === b.layerId && isDeepStrictEqual(a.frame, b.frame)
}
