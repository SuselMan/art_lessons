import { isDeepStrictEqual } from 'node:util'
import {randomUUID} from 'node:crypto'
import {
  STRAIGHT_ROOM_RASTER_VERSION,CANONICAL_STROKE_RASTER_PROFILE,
  parseCanonicalStrokeCloseRequest,verifyCanonicalRecordedClose,type CanonicalStrokeCloseRequest,type RecordedCanonicalStrokeCloseOperation,parseCanonicalStrokeCloseOperation,parseCanonicalEmptyHistoryBase,parseCanonicalFullHistoryBase,verifyCanonicalFullHistoryBase,type CanonicalFullHistoryBaseV2,type CanonicalEmptyHistoryBaseV1, verifyCanonicalRecordedPrefix, type CanonicalStrokeBegin, type CanonicalStrokeBeginResult, type CanonicalStrokeLive, type CanonicalStrokeLiveResult,
  type CanonicalStrokeOperation, type CanonicalStrokeSnapshot, type SendResult, type CanonicalRecordedAttachmentV1, type CanonicalRecordedReadScope, type CanonicalRecordedHistoryPage, type Operation, CANONICAL_RECORDED_ATTACHMENT_LIMITS, prepareCanonicalRecordedAttachment,
} from '@grafetto/shared'
import { canonicalBrushStorageContext } from '../brushLibrary/storage.js'
import { prisma } from '../db/prisma.js'
import { CanonicalBrushCapabilityResolver } from './CanonicalBrushCapabilityResolver.js'
import { CanonicalStrokeAdmission, decodeTrustedCanonicalFrame, type CanonicalAdmissionIdentity, type TrustedCanonicalGesture } from './CanonicalStrokeAdmission.js'
import { CANONICAL_ROOM_EXECUTION_POLICY, freezeCanonicalSeededDefaultAutoPolicies,freezeCanonicalPrimaryImagePolicy,freezeCanonicalImagePipePolicies,freezeCanonicalAutoPolicies,freezeCanonicalRasterPolicy,freezeCanonicalFullHistoryFormat, type CanonicalRoomExecutionPolicy } from './canonicalExecutionPolicy.js'
import { assertPreparedAuthorizedJoinRead,type PreparedAuthorizedJoin } from './roomAccess.js'
import {captureEmptyBoardSeats,assertCurrentRoomSeat,type PreparedRoomDisconnect} from './rooms.js'
import { mayReadBoardContent } from './boardContentAccess.js'
import { hasKnownOperationDiscriminant } from './operationAdmissionShape.js'
import { canonicalPaintRejectReason } from './operationGate.js'
import { canonicalWriteFence, ensureCanonicalWrite, findDuplicateOperation, knownCanonicalWrite, hasSucceededCanonicalWrite,recordOperation,recordCanonicalCloseOperation, recordCanonicalMetadataOperation,getOperationRejectReason,updateAliveIds } from './operationLog.js'
import { captureCanonicalMetadata,verifyCanonicalMetadataRow,verifyIndexedOperationRow,projectCanonicalIndexedOperation,projectCanonicalIndexedCloseOperation,type CanonicalMetadataOperation,canonicalOperationRowSelect, verifyCanonicalOperationRow,type CanonicalStoredOperationRow } from './roomPersistence.js'
import { flushRoomWrites, lessonRecordOf, rooms, type RoomRecord } from './roomRegistry.js'
import type {CanonicalPrefixPreparer,CanonicalFullHistoryReceipt} from './snapshotReplayLoader.js'
import { getCanonicalFullHistoryWithRows,CanonicalGesturePrefixError, getCanonicalGesturePrefixWithRows,visitCanonicalGesturePrefixRows } from './snapshotStore.js'

const fullHistoryAuthority:unique symbol=Symbol('canonical-full-history-owner')
type OwnedFullHistory=CanonicalFullHistoryReceipt&{readonly [fullHistoryAuthority]:(candidate:unknown,owner:object,operations:readonly Operation[])=>void}
const MAX_ROOMS = 64, MAX_GESTURES = 1024, MAX_BEGIN_JOBS = 4
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
type DisconnectedCloseInput=Omit<CanonicalStrokeCloseRequest,'expectedRecordedNext'|'expectedLastFrameOpId'>&{readonly capturedSession:Session}
type OrphanCloseInput=Omit<CanonicalStrokeCloseRequest,'expectedRecordedNext'|'expectedLastFrameOpId'>&{readonly orphan:{readonly record:RoomRecord;readonly boardEpoch:number;assertCurrent():void;beforeAppend(op:RecordedCanonicalStrokeCloseOperation):void;appended():void}}
export interface PreparedCanonicalDisconnect {
  assertCurrent(this:PreparedCanonicalDisconnect):void
  finish(this:PreparedCanonicalDisconnect):Promise<readonly RecordedCanonicalStrokeCloseOperation[]>
}
interface RoomLifetime { readonly record: RoomRecord; readonly lesson: RoomRecord; readonly sessions: Map<string, Session> }
/** Actual protocol coordinator. No author/RNG execution, second log, straight
 * room opener, or renderer activation. Async DB checks end BEFORE the existing
 * synchronous prepare -> pin -> record(seq) -> commit section. Durable ACK/relay
 * waits for the SAME write queue outcome after that section. */
export class CanonicalRoomTransport {
  private readonly policy:CanonicalRoomExecutionPolicy
  constructor(policy:CanonicalRoomExecutionPolicy=CANONICAL_ROOM_EXECUTION_POLICY){
    this.policy=Object.freeze({...freezeCanonicalSeededDefaultAutoPolicies(policy),...freezeCanonicalImagePipePolicies(policy),primaryImageSource:freezeCanonicalPrimaryImagePolicy(policy.primaryImageSource),fullHistoryFormat:freezeCanonicalFullHistoryFormat(policy.fullHistoryFormat),...freezeCanonicalRasterPolicy(policy),alphaDarkenVariants:Object.freeze([...policy.alphaDarkenVariants]),autoSources:freezeCanonicalAutoPolicies(policy.autoSources)})
  }
  get fullHistoryFormat():'frames-v1'|'mixed-v2'{return this.policy.fullHistoryFormat??'frames-v1'}
  private context: ReturnType<typeof canonicalBrushStorageContext>
  private binder?: CanonicalBrushCapabilityResolver
  private readonly lifetimes = new Map<string, RoomLifetime>()
  private readonly begins = new Map<string, { readonly signature: string; readonly promise: Promise<CanonicalStrokeBeginResult> }>()

  async begin(identity: CanonicalAdmissionIdentity, input: CanonicalStrokeBegin, isCurrent: () => boolean): Promise<CanonicalStrokeBeginResult> {
    try {
      const lifetime = this.authorized(identity, input?.layerId)
      const binder = this.currentBinder()
      input = binder.captureBeginInput(identity,input)
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
      const promise = this.finishBegin(identity, input, lifetime, binder, isCurrent)
      this.begins.set(key, { signature, promise })
      try { return await promise } finally { if (this.begins.get(key)?.promise === promise) this.begins.delete(key) }
    } catch (error) { return { ok: false, reason: reason(error) } }
  }

  private async finishBegin(identity: CanonicalAdmissionIdentity, input: CanonicalStrokeBegin, lifetime: RoomLifetime,
    binder: CanonicalBrushCapabilityResolver,
    isCurrent: () => boolean): Promise<CanonicalStrokeBeginResult> {
    const key = gestureKey(identity, input.strokeId), previous = lifetime.sessions.get(key), context = this.context!
    if(lifetime.record.operations.some(op=>op.type==='canonical_stroke_close'&&op.targetUserId===identity.userId&&op.strokeId===input.strokeId))fail('canonical_repair_required')
    if (previous) {
      await this.durablePrefix(lifetime, previous)
      if (!isCurrent()) fail('not_joined')
      this.sameLifetime(identity, input.layerId, lifetime)
      if (lifetime.sessions.get(key) !== previous || this.binder !== binder) fail('canonical_repair_required')
      this.requireHealthyWrites(lifetime)
      const prepared=binder.prepareBeginGesture(identity,input)
      context.storage.pin(identity.roomId, identity.userId, [prepared.grant.brush], context.operator)
      prepared.commit()
      return snapshot(previous)
    }
    const watermark = lifetime.record.nextSeq - 1
    // Drain the existing persistence queue; still cross-check resident history,
    // because a failed background DB write is not proof that a gesture is new.
    await flushRoomWrites(identity.roomId)
    this.requireHealthyWrites(lifetime)
    const resident = lifetime.record.operations.filter((op):op is CanonicalStrokeOperation=>op.type === 'canonical_stroke' && op.userId === identity.userId && op.frame.strokeId === input.strokeId && (op.seq ?? Infinity) <= watermark)
    const anchor=resident.reduce<CanonicalStrokeOperation|undefined>((last,op)=>!last||op.seq!>last.seq!?op:last,undefined)
    const historyPage=await getCanonicalGesturePrefixWithRows(identity.roomId,{userId:identity.userId,strokeId:input.strokeId},watermark,anchor)
    const prefix=historyPage.operations
    if (!isCurrent()) fail('not_joined')
    this.sameLifetime(identity, input.layerId, lifetime)
    if (this.binder !== binder || canonicalBrushStorageContext()?.storage !== context.storage) fail('canonical_repair_required')
    if(historyPage.close)fail('canonical_repair_required') // C owner/live-only reconciliation is not active.
    const byId=new Map(prefix.map(op=>[op.id,op]))
    if (resident.some(op => !isDeepStrictEqual(byId.get(op.id),op))) fail('canonical_repair_required')
    const prepared=prefix.length?binder.prepareResumeGesture(identity,input,{operations:prefix,rows:historyPage.canonicalRows}):binder.prepareBeginGesture(identity,input)
    let hydrating = true
    const admission = new CanonicalStrokeAdmission({ maxGestures: 1, retainedFrames: 8, resolve: (i, s) => hydrating
      ? i.roomId === identity.roomId && i.userId === identity.userId && s.layerId === input.layerId && s.brush === input.brush && s.strokeId === input.strokeId ? prepared.grant : undefined
      : binder.resolve(i, s) })
    try {
      let lastSeq = 0
      const verified=[]
      for (const value of prefix) {
        const op = canonicalOperation(value, identity, true)
        if (!op.seq || op.seq <= lastSeq || op.seq > watermark) fail('canonical_repair_required')
        lastSeq = op.seq
        const accepted=admission.prepare(identity, { type: 'canonical_stroke', id: op.id, layerId: op.layerId, frame: op.frame })
        verified.push({operationId:op.id,sequence:op.seq!,frameOrdinal:op.frame.frameOrdinal,decoded:{entry:accepted.value.decoded.entry,fences:accepted.value.decoded.fences}})
        accepted.commit()
        // Reconstructed old live traffic is never relayed. Advance both lanes so
        // reconnect can start the next live ordinal without replaying old ink.
        admission.prepare(identity, { type: 'canonical_stroke_live', layerId: op.layerId, frame: op.frame }).commit()
      }
      if(verified.length){
        const checked=verifyCanonicalRecordedPrefix(verified),cursor=admission.cursor(identity,input.strokeId)
        if(checked.recordedNext!==cursor.recordedNext||checked.ended!==cursor.ended)fail('canonical_repair_required')
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

  /** Two-phase reader preparation. Caller awaits BEFORE channel join, then
   * calls finish(snapshot.tailOperations) synchronously before join+state emit.
   * No await/queue/registry survives finish; no paint permission is inferred. */
  prepareReadDelivery(identity:CanonicalAdmissionIdentity,isCurrent:()=>boolean):Promise<{readonly scope:CanonicalRecordedReadScope;readonly fullHistoryFormat:'frames-v1'|'mixed-v2';readonly preparePrefix:CanonicalPrefixPreparer;readonly prepareFullHistory:(input:{readonly throughSeq:number;readonly floor:number})=>Promise<CanonicalFullHistoryReceipt>;readonly finish:(operations:readonly Operation[],rows?:readonly CanonicalStoredOperationRow[],fullHistory?:CanonicalFullHistoryReceipt)=>{readonly canonicalReadScope:CanonicalRecordedReadScope;readonly canonicalAuthorRasterProfile?:import('@grafetto/shared').CanonicalStrokeRasterProfile;readonly canonicalCapabilities?:CanonicalRecordedAttachmentV1;readonly canonicalHistoryBase?:Readonly<CanonicalEmptyHistoryBaseV1|CanonicalFullHistoryBaseV2>}}> {
    const captured={roomId:identity.roomId,userId:identity.userId}
    return this.prepareReadContext(captured,isCurrent,()=>mayReadBoardContent(captured.roomId,captured.userId,this.fullHistoryFormat),()=>{})
  }

  /** Genuine prepared join can read its exact target BEFORE membership exists.
   * Its private lexical proof comes from the same block/password/invite gate;
   * no caller ok:true object or fabricated durable participation is accepted. */
  prepareJoinReadDelivery(preparation:PreparedAuthorizedJoin,isCurrent:()=>boolean):Promise<{readonly scope:CanonicalRecordedReadScope;readonly fullHistoryFormat:'frames-v1'|'mixed-v2';readonly preparePrefix:CanonicalPrefixPreparer;readonly prepareFullHistory:(input:{readonly throughSeq:number;readonly floor:number})=>Promise<CanonicalFullHistoryReceipt>;readonly finish:(operations:readonly Operation[],rows?:readonly CanonicalStoredOperationRow[],fullHistory?:CanonicalFullHistoryReceipt)=>{readonly canonicalReadScope:CanonicalRecordedReadScope;readonly canonicalAuthorRasterProfile?:import('@grafetto/shared').CanonicalStrokeRasterProfile;readonly canonicalCapabilities?:CanonicalRecordedAttachmentV1;readonly canonicalHistoryBase?:Readonly<CanonicalEmptyHistoryBaseV1|CanonicalFullHistoryBaseV2>}}> {
    const identity={roomId:preparation.roomId,userId:preparation.userId}
    const assert=()=>assertPreparedAuthorizedJoinRead(preparation,identity.roomId,identity.userId)
    assert()
    return this.recoverOrphanedPrefixes(preparation,isCurrent).then(()=>this.prepareReadContext(identity,isCurrent,async()=>{assert();return true},assert))
  }

  /** First authorized pre-seat join may close historical ink only while the
   * SAME board is provably empty. Original rows authorize material, not seats. */
  private async recoverOrphanedPrefixes(preparation:PreparedAuthorizedJoin,isCurrent:()=>boolean):Promise<void> {
    if(this.fullHistoryFormat!=='mixed-v2')return
    const absence=captureEmptyBoardSeats(preparation.roomId)
    if(!absence)return // A live peer may still be drawing; preserve OPEN read.
    const record=absence.assertCurrent(),lesson=lessonRecordOf(record),binder=this.currentBinder(),context=this.context!,scope=binder.captureReadScope(preparation.roomId)
    let cut=record.nextSeq-1,historyBytes=0,nextCloseBytes=0
    const current=()=>{
      assertPreparedAuthorizedJoinRead(preparation,record.room.id,preparation.userId)
      for(const key of this.begins.keys())if(JSON.parse(key)[0]===record.room.id)fail('canonical_repair_required')
      const actual=canonicalBrushStorageContext()
      if(!isCurrent()||absence.assertCurrent()!==record||rooms.get(record.room.id)!==record||lessonRecordOf(record)!==lesson
        ||this.binder!==binder||actual?.storage!==context.storage||actual.operator!==context.operator
        ||binder.captureReadScope(record.room.id).boardEpoch!==scope.boardEpoch||record.nextSeq-1!==cut
        ||record.layerStateSeq!==null||record.coveredSeqByLayer.size)fail('canonical_repair_required')
    }
    current();await flushRoomWrites(record.room.id);current()
    if(canonicalWriteFence(record).pending)fail('canonical_repair_required')
    const orphan={record,boardEpoch:scope.boardEpoch,assertCurrent:current,beforeAppend:(op:RecordedCanonicalStrokeCloseOperation)=>{current();nextCloseBytes=Buffer.byteLength(JSON.stringify(op),'utf8');if(cut>=CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||historyBytes+nextCloseBytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)fail('canonical_repair_required')},appended:()=>{if(record.nextSeq-1!==cut+1)fail('canonical_repair_required');cut++;historyBytes+=nextCloseBytes;nextCloseBytes=0;current()}}
    // A known resident failed close already owns its original ID. Repair that
    // receipt first; otherwise a new read could neither prove nor replace it.
    for(const op of record.operations){
      if(op.type!=='canonical_stroke_close'||!knownCanonicalWrite(op)||knownCanonicalWrite(op)!.status==='succeeded')continue
      current()
      const result=await this.closeBound({roomId:record.room.id,userId:op.targetUserId},{operationId:op.id,layerId:op.layerId,targetUserId:op.targetUserId,strokeId:op.strokeId,disposition:'commitPartial',orphan},()=>{current();return true})
      current();if(!result.result.ok)fail('canonical_repair_required')
    }
    if(canonicalWriteFence(record).failed)fail('canonical_repair_required')
    const full=await getCanonicalFullHistoryWithRows(record.room.id,cut,async()=>{current()},'mixed-v2');current()
    const attachment=binder.prepareMixedRecordedAttachment({roomId:record.room.id,boardEpoch:scope.boardEpoch,operations:full.operations,rows:full.canonicalRows})
    const verified=verifyCanonicalFullHistoryBase({kind:'full-room-prefix-v2',roomId:record.room.id,boardEpoch:scope.boardEpoch,throughSeq:cut,operationCount:full.operations.length},prepareCanonicalRecordedAttachment(attachment,full.operations,scope),scope)
    const open=verified.gestures.filter(gesture=>!gesture.ended&&!gesture.sealed)
    if(full.operations.length+open.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('canonical_repair_required')
    historyBytes=full.operations.reduce((bytes,op)=>bytes+Buffer.byteLength(JSON.stringify(op),'utf8'),0)
    for(const gesture of open){
      current()
      const result=await this.closeBound({roomId:record.room.id,userId:gesture.userId},{operationId:randomUUID(),layerId:gesture.layerId,targetUserId:gesture.userId,strokeId:gesture.strokeId,disposition:'commitPartial',orphan},()=>{current();return true})
      current();if(!result.result.ok)fail('canonical_repair_required')
    }
    current()
  }

  private async prepareReadContext(identity:CanonicalAdmissionIdentity,isCurrent:()=>boolean,authorize:()=>Promise<boolean>,assertAuthorization:()=>void):Promise<{readonly scope:CanonicalRecordedReadScope;readonly fullHistoryFormat:'frames-v1'|'mixed-v2';readonly preparePrefix:CanonicalPrefixPreparer;readonly prepareFullHistory:(input:{readonly throughSeq:number;readonly floor:number})=>Promise<CanonicalFullHistoryReceipt>;readonly finish:(operations:readonly Operation[],rows?:readonly CanonicalStoredOperationRow[],fullHistory?:CanonicalFullHistoryReceipt)=>{readonly canonicalReadScope:CanonicalRecordedReadScope;readonly canonicalAuthorRasterProfile?:import('@grafetto/shared').CanonicalStrokeRasterProfile;readonly canonicalCapabilities?:CanonicalRecordedAttachmentV1;readonly canonicalHistoryBase?:Readonly<CanonicalEmptyHistoryBaseV1|CanonicalFullHistoryBaseV2>}}> {
    if(!text(identity?.roomId)||!text(identity.userId))fail('not_joined')
    const {roomId}=identity
    const record=rooms.get(roomId)
    if(!record||record.room.rasterVersion!==STRAIGHT_ROOM_RASTER_VERSION)fail('invalid_operation')
    const lesson=lessonRecordOf(record),binder=this.currentBinder(),context=this.context!
    const current=()=>{
      const actual=canonicalBrushStorageContext()
      if(!isCurrent())fail('not_joined')
      assertAuthorization()
      if(rooms.get(roomId)!==record||lessonRecordOf(record)!==lesson||this.binder!==binder||actual?.storage!==context.storage||actual?.operator!==context.operator)fail('canonical_repair_required')
      if(canonicalWriteFence(record).failed)fail('canonical_repair_required')
      if(this.policy.fullHistoryFormat!=='mixed-v2'&&record.operations.some(op=>op.type==='canonical_stroke_close'))fail('canonical_repair_required')
    }
    if(!await authorize())fail('not_joined')
    current()
    const scope=binder.captureReadScope(roomId)
    const frameCurrent=()=>{current();if(record.operations.some(op=>op.type==='canonical_stroke_close'))fail('canonical_repair_required')}
    const preparePrefix:CanonicalPrefixPreparer=async input=>{
      frameCurrent()
      if(input.purpose!=='read'&&input.purpose!=='undo-redo')fail('invalid_operation')
      if(!Number.isSafeInteger(input.throughSeq)||input.throughSeq<1||input.throughSeq>=record.nextSeq)fail('canonical_repair_required')
      if(input.row)binder.readRecordedCapability({roomId,boardEpoch:scope.boardEpoch,operation:input.anchor,row:input.row})
      else binder.readResidentRecordedCapability({roomId,boardEpoch:scope.boardEpoch,operation:input.anchor})
      await flushRoomWrites(roomId);frameCurrent()
      const prefix=await getCanonicalGesturePrefixWithRows(roomId,{userId:input.anchor.userId,strokeId:input.anchor.frame.strokeId},input.throughSeq,input.anchor)
      if(!await authorize())fail('not_joined')
      frameCurrent()
      if(prefix.close)fail('canonical_repair_required') // Keep close-bearing execution reads OFF until C pairing.
      const summary=binder.readRecordedPrefix({roomId,boardEpoch:scope.boardEpoch,anchor:input.anchor,row:input.row,operations:prefix.operations,rows:prefix.canonicalRows,purpose:input.purpose})
      frameCurrent()
      return Object.freeze({...prefix,summary})
    }
    const fullOwner=Object.freeze({})
    const prepareFullHistory=async(input:{readonly throughSeq:number;readonly floor:number}):Promise<CanonicalFullHistoryReceipt>=>{
      const cut=input.throughSeq,floor=input.floor
      const fullCurrent=(allowPending=false)=>{
        current()
        if(!allowPending&&canonicalWriteFence(record).pending)fail('canonical_repair_required')
        if(floor!==0||!Number.isSafeInteger(cut)||cut<0||record.nextSeq-1!==cut||record.layerStateSeq!==null||record.coveredSeqByLayer.size)fail('canonical_repair_required')
      }
      const afterRead=async()=>{if(!await authorize())fail('not_joined');fullCurrent()}
      fullCurrent(true);await flushRoomWrites(roomId);await afterRead()
      const full=this.policy.fullHistoryFormat==='mixed-v2'?await getCanonicalFullHistoryWithRows(roomId,cut,afterRead,'mixed-v2'):await getCanonicalFullHistoryWithRows(roomId,cut,afterRead)
      fullCurrent()
      const groups=new Map<string,{operations:CanonicalStrokeOperation[];rows:CanonicalStoredOperationRow[]}>()
      for(let n=0;n<full.operations.length;n++){
        const op=full.operations[n]
        if(op.type!=='canonical_stroke')continue
        const key=JSON.stringify([op.userId,op.frame.strokeId]),group=groups.get(key)??{operations:[],rows:[]}
        group.operations.push(op);group.rows.push('orderedRows'in full?full.orderedRows[n]:full.canonicalRows[n]);groups.set(key,group)
      }
      for(const group of groups.values()){
        const anchor=group.operations.at(-1)!
        const closeIndex=full.operations.findIndex(op=>op.type==='canonical_stroke_close'&&op.targetUserId===anchor.userId&&op.strokeId===anchor.frame.strokeId)
        const closeOperation=full.operations[closeIndex]
        const close=closeOperation?.type==='canonical_stroke_close'&&'orderedRows'in full?{operation:parseCanonicalStrokeCloseOperation(closeOperation),row:full.orderedRows[closeIndex]}:undefined
        binder.readRecordedPrefix({roomId,boardEpoch:scope.boardEpoch,anchor,row:group.rows.at(-1),operations:group.operations,rows:group.rows,purpose:'read',...close?{close}:{}})
      }
      if('kind'in full){
        const attachment=binder.prepareMixedRecordedAttachment({roomId,boardEpoch:scope.boardEpoch,operations:full.operations,rows:full.canonicalRows})
        verifyCanonicalFullHistoryBase({kind:'full-room-prefix-v2',roomId,boardEpoch:scope.boardEpoch,throughSeq:cut,operationCount:full.operations.length},prepareCanonicalRecordedAttachment(attachment,full.operations,scope),scope)
      }
      fullCurrent()
      let receipt:OwnedFullHistory
      receipt=Object.freeze({...full,assertCurrent(this:CanonicalFullHistoryReceipt){if(this!==receipt)fail('canonical_repair_required');fullCurrent()},
        [fullHistoryAuthority]:(candidate:unknown,owner:object,operations:readonly Operation[])=>{
          if(candidate!==receipt||owner!==fullOwner||operations.length!==full.operations.length||operations.some((op,n)=>op!==full.operations[n]))fail('canonical_repair_required')
          fullCurrent()
        }})
      return receipt
    }
    return Object.freeze({scope,fullHistoryFormat:this.fullHistoryFormat,preparePrefix,prepareFullHistory,finish:(operations:readonly Operation[],rows:readonly CanonicalStoredOperationRow[]=[],fullHistory?:CanonicalFullHistoryReceipt)=>{
      current()
      if(fullHistory){
        const descriptor=Object.getOwnPropertyDescriptor(fullHistory,fullHistoryAuthority)
        const verify=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined
        if(typeof verify!=='function')fail('canonical_repair_required')
        verify(fullHistory,fullOwner,operations)
      }
      if(!Array.isArray(operations)||operations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)fail('canonical_repair_required')
      if(!Array.isArray(rows)||rows.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings||(!operations.some(op=>op.type==='canonical_stroke')&&rows.length))fail('canonical_repair_required')
      const mixed=fullHistory&&'kind'in fullHistory&&fullHistory.kind==='mixed-canonical-history-v2'
      if(!mixed&&(record.operations.some(op=>op.type==='canonical_stroke_close')||operations.some(op=>op.type==='canonical_stroke_close')))fail('canonical_repair_required')
      // Material codec version, independently of the raster envelope version.
      // Historical V1 remains its old closed lane; a mixed V1/V2 batch goes
      // through whole-batch V2 preparation and is refused atomically.
      const canonical=operations.some(op=>op.type==='canonical_stroke'&&!op.frame.materialPacked.startsWith('1|'))
      const canonicalCapabilities=canonical?binder.prepareMixedRecordedAttachment({roomId:scope.roomId,boardEpoch:scope.boardEpoch,operations,rows}):undefined
      current()
      const canonicalHistoryBase=fullHistory?(mixed?parseCanonicalFullHistoryBase({kind:'full-room-prefix-v2',roomId:scope.roomId,boardEpoch:scope.boardEpoch,throughSeq:fullHistory.throughSeq,operationCount:operations.length}):parseCanonicalEmptyHistoryBase({kind:'empty-room-prefix-v1',roomId:scope.roomId,boardEpoch:scope.boardEpoch,throughSeq:fullHistory.throughSeq,operationCount:operations.length})):undefined
      if(fullHistory){
        const verify=Object.getOwnPropertyDescriptor(fullHistory,fullHistoryAuthority)!.value as OwnedFullHistory[typeof fullHistoryAuthority]
        verify(fullHistory,fullOwner,operations)
      }
      current()
      return Object.freeze({...canonicalHistoryBase?{canonicalHistoryBase}:{},canonicalReadScope:scope,...this.policy.authorRasterProfile===CANONICAL_STROKE_RASTER_PROFILE?{}:{canonicalAuthorRasterProfile:this.policy.authorRasterProfile},...canonicalCapabilities?{canonicalCapabilities}:{}})
    }})
  }

  /** Same owner/epoch as room_state; actual query rows supply only read
   * provenance. The route must capture its lifetime before its awaited query. */
  async prepareHistoryPage(identity:CanonicalAdmissionIdentity,page:{readonly operations:Operation[];readonly canonicalRows:readonly CanonicalStoredOperationRow[]},isCurrent:()=>boolean):Promise<CanonicalRecordedHistoryPage> {
    const read=await this.prepareReadDelivery(identity,isCurrent)
    const fields=read.finish(page.operations,page.canonicalRows)
    if(!fields.canonicalCapabilities)fail('invalid_operation')
    return Object.freeze({operations:[...page.operations],canonicalCapabilities:fields.canonicalCapabilities})
  }

  live(identity: CanonicalAdmissionIdentity, value: CanonicalStrokeLive): { readonly result: CanonicalStrokeLiveResult; readonly accepted?: CanonicalStrokeLive } {
    try {
      if (!object(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'layerId') || !Object.hasOwn(value, 'frame') || !object(value.frame)) fail('invalid_operation')
      const lifetime = this.authorized(identity, value.layerId), session = this.session(lifetime, identity, value.frame.strokeId)
      this.requireUnsealedOrdinal(lifetime,identity,value.frame.strokeId,value.frame.frameOrdinal)
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
      this.requireUnsealedOrdinal(lifetime,identity,op.frame.strokeId,op.frame.frameOrdinal)
      await this.durablePrefix(lifetime, session)
      if (!isCurrent()) fail('not_joined')
      this.sameLifetime(identity, op.layerId, lifetime)
      if (lifetime.sessions.get(gestureKey(identity, op.frame.strokeId)) !== session) fail('canonical_repair_required')
      this.requireHealthyWrites(lifetime)
      // A different socket may have appended this ID while awaiting a pending
      // prefix. Retrying enters the exact duplicate path, never allocates seq2.
      const raced = findDuplicateOperation(identity.roomId, op.id)
      if (raced) return await this.durableDuplicate(identity, op, raced, lifetime, session, isCurrent)
      this.requireUnsealedOrdinal(lifetime,identity,op.frame.strokeId,op.frame.frameOrdinal)
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

  /** Internal disconnect cleanup over existing admitted sessions only. The
   * actual seat remains owned by the caller until its existing finally-leave. */
  prepareDisconnectedClose(seat:PreparedRoomDisconnect,isCurrent:()=>boolean):PreparedCanonicalDisconnect|undefined {
    const scope=assertCurrentRoomSeat(seat),identity={roomId:scope.roomId,userId:scope.userId}
    const lifetime=this.lifetimes.get(identity.roomId),binder=this.binder,context=this.context
    if(!lifetime||!binder||!context)return undefined
    const sessions=[...lifetime.sessions.entries()].filter(([,session])=>session.grant.roomId===identity.roomId&&session.grant.userId===identity.userId&&'version'in session.grant.material&&session.grant.material.version===2)
      .map(([key,session])=>Object.freeze({key,session,operationId:randomUUID()}))
    if(!sessions.length)return undefined
    const current=()=>{
      if(!isCurrent())fail('not_joined')
      let actual:PreparedRoomDisconnect
      try{actual=assertCurrentRoomSeat(seat)}catch{fail('not_joined')}
      const storage=canonicalBrushStorageContext()
      if(actual!==scope||rooms.get(identity.roomId)!==lifetime.record||lessonRecordOf(lifetime.record)!==lifetime.lesson
        ||this.lifetimes.get(identity.roomId)!==lifetime||this.binder!==binder||this.context!==context
        ||storage?.storage!==context.storage||storage.operator!==context.operator
        ||sessions.some(({key,session})=>lifetime.sessions.get(key)!==session))fail('canonical_repair_required')
    }
    current()
    let used=false,ticket:PreparedCanonicalDisconnect
    ticket=Object.freeze({assertCurrent(this:PreparedCanonicalDisconnect){if(this!==ticket)fail('canonical_repair_required');current()},finish:async function(this:PreparedCanonicalDisconnect){
      if(this!==ticket||used)fail('canonical_repair_required')
      used=true;current()
      const accepted:RecordedCanonicalStrokeCloseOperation[]=[]
      // Repair already resident close receipts before fresh closes inspect the
      // room's failed-write fence. This is session work order, not row proof.
      const residentClose=(session:Session)=>lifetime.record.operations.find(op=>op.type==='canonical_stroke_close'&&op.targetUserId===identity.userId&&op.strokeId===session.grant.strokeId)
      const ordered=[...sessions].sort((a,b)=>Number(!!residentClose(b.session))-Number(!!residentClose(a.session)))
      for(const captured of ordered){
        current()
        const session=captured.session,previous=residentClose(session)
        if(thisTransport.authorized(identity,session.grant.layerId)!==lifetime)fail('canonical_repair_required')
        if(!previous){
          await thisTransport.durablePrefix(lifetime,session);current()
          const cursor=session.admission.cursor(identity,session.grant.strokeId)
          if(cursor.recordedNext===0||cursor.ended){thisTransport.requireHealthyWrites(lifetime);continue}
        }
        const input:DisconnectedCloseInput={operationId:previous?.id??captured.operationId,layerId:session.grant.layerId,targetUserId:identity.userId,
          strokeId:session.grant.strokeId,disposition:'commitPartial',capturedSession:session}
        const result=await thisTransport.closeBound(identity,input,()=>{current();return true})
        current()
        if(!result.result.ok)fail(result.result.reason==='not_joined'?'not_joined':'canonical_repair_required')
        if(!result.accepted)fail('canonical_repair_required')
        accepted.push(result.accepted)
      }
      current();return Object.freeze(accepted)
    }})
    const thisTransport=this
    return ticket
  }

  /** Typed own-session metadata writer. No listener/producer is activated. */
  async close(identity:CanonicalAdmissionIdentity,value:CanonicalStrokeCloseRequest,isCurrent:()=>boolean):Promise<{readonly result:SendResult;readonly accepted?:RecordedCanonicalStrokeCloseOperation}>{
    try{
      const input=parseCanonicalStrokeCloseRequest(value)
      return await this.closeBound(identity,input,isCurrent)
    }catch(error){return{result:{ok:false,reason:reason(error)}}}
  }
  private async closeBound(identity:CanonicalAdmissionIdentity,input:CanonicalStrokeCloseRequest|DisconnectedCloseInput|OrphanCloseInput,isCurrent:()=>boolean):Promise<{readonly result:SendResult;readonly accepted?:RecordedCanonicalStrokeCloseOperation}>{
    try{
      if(input.targetUserId!==identity.userId)fail('invalid_operation')
      const orphan='orphan'in input?input.orphan:undefined
      const lifetime=orphan?undefined:this.authorized(identity,input.layerId),session=lifetime?this.session(lifetime,identity,input.strokeId):undefined
      const record=orphan?.record??lifetime!.record,binder=this.currentBinder(),context=this.context!
      if('capturedSession'in input&&input.capturedSession!==session)fail('canonical_repair_required')
      if(session&&(session.grant.layerId!==input.layerId||!('version'in session.grant.material)||session.grant.material.version!==2))fail('invalid_operation')
      const current=()=>{
        if(!isCurrent())fail('not_joined')
        if(orphan)orphan.assertCurrent()
        else{this.sameLifetime(identity,input.layerId,lifetime!);if(lifetime!.sessions.get(gestureKey(identity,input.strokeId))!==session)fail('canonical_repair_required')}
        if(this.binder!==binder||this.context!==context)fail('canonical_repair_required')
        if(record.operations.some(op=>op.type==='canonical_stroke_close'&&op.targetUserId===identity.userId&&op.strokeId===input.strokeId&&op.id!==input.operationId))fail('canonical_repair_required')
      }
      const matches=(op:RecordedCanonicalStrokeCloseOperation)=>op.id===input.operationId&&op.userId===identity.userId&&op.layerId===input.layerId&&op.targetUserId===input.targetUserId&&op.strokeId===input.strokeId&&op.disposition===input.disposition&&(!('expectedRecordedNext'in input)||op.recordedNext===input.expectedRecordedNext&&op.lastFrameOpId===input.expectedLastFrameOpId)
      current()
      let existing=findDuplicateOperation(identity.roomId,input.operationId)
      let indexed:CanonicalStoredOperationRow|null=null
      if(!existing){
        indexed=await prisma.operation.findUnique({where:{id:input.operationId},select:canonicalOperationRowSelect});current()
        if(indexed)existing=projectCanonicalIndexedCloseOperation(identity.roomId,indexed).operation
      }
      current();existing=findDuplicateOperation(identity.roomId,input.operationId)??existing
      let previous:RecordedCanonicalStrokeCloseOperation|undefined
      if(existing){
        previous=parseCanonicalStrokeCloseOperation(existing)
        if(!matches(previous))fail('invalid_operation')
        if(knownCanonicalWrite(existing)){
          const outcome=await ensureCanonicalWrite(record,existing,{retryFailed:true});current()
          if(!outcome.ok)fail('canonical_repair_required')
        }else{
          indexed=indexed??await prisma.operation.findUnique({where:{id:input.operationId},select:canonicalOperationRowSelect});current()
          if(!indexed||!isDeepStrictEqual(projectCanonicalIndexedCloseOperation(identity.roomId,indexed).operation,previous))fail('canonical_repair_required')
        }
      }else{
        if(lifetime&&session)await this.durablePrefix(lifetime,session);current()
      }
      await flushRoomWrites(identity.roomId);current();if(canonicalWriteFence(record).failed)fail('canonical_repair_required')
      const cut=record.nextSeq-1
      const fold=binder.createRecordedPrefixFold({roomId:identity.roomId,boardEpoch:session?.grant.boardEpoch??orphan!.boardEpoch,...session?.recordedTail?{anchor:session.recordedTail}:{},purpose:'read'})
      const prefix=await visitCanonicalGesturePrefixRows(identity.roomId,{userId:identity.userId,strokeId:input.strokeId},cut,{requiredFrame:session?.recordedTail,
        afterRead:async()=>{current();if(record.nextSeq-1!==cut)fail('canonical_repair_required')},
        visit(operation,row){current();fold.accept(operation,row);return undefined}})
      current()
      if(record.nextSeq-1!==cut)fail('canonical_repair_required')
      const summary=fold.finish()
      if('expectedRecordedNext'in input&&(summary.recordedNext!==input.expectedRecordedNext||summary.lastOperationId!==input.expectedLastFrameOpId))fail('invalid_operation')
      const raced=findDuplicateOperation(identity.roomId,input.operationId)
      if(raced&&(!previous||!isDeepStrictEqual(parseCanonicalStrokeCloseOperation(raced),previous)))fail('canonical_repair_required')
      if(prefix.close&&(!previous||!isDeepStrictEqual(prefix.close.operation,previous)))fail('canonical_repair_required')
      const candidate=previous??parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:input.operationId,userId:identity.userId,timestamp:Date.now(),seq:record.nextSeq,layerId:input.layerId,targetUserId:identity.userId,strokeId:input.strokeId,disposition:'commitPartial',recordedNext:summary.recordedNext,firstFrameOpId:summary.firstOperationId,lastFrameOpId:summary.lastOperationId})
      const seal=verifyCanonicalRecordedClose(summary,{userId:identity.userId,layerId:input.layerId,strokeId:input.strokeId},candidate)
      const cursor=session?.admission.cursor(identity,input.strokeId)
      if(cursor&&(cursor.recordedNext!==seal.recordedNext||!previous&&cursor.ended))fail('canonical_repair_required')
      current()
      if(record.nextSeq-1!==cut)fail('canonical_repair_required')
      const ticket=session&&cursor&&!cursor.ended?session.admission.prepareRecordedClose(identity,input.strokeId,seal):undefined
      // All async checks precede this same-turn append/seal section. An actual
      // resident close also fences new frames if an unexpected commit fault occurs.
      let accepted=candidate
      if(!previous){orphan?.beforeAppend(candidate);const {seq:_seq,...draft}=candidate;accepted=recordCanonicalCloseOperation(identity.roomId,draft);orphan?.appended()}
      ticket?.commit()
      const retained=previous&&existing?existing:accepted
      if(!previous||knownCanonicalWrite(retained)){
        const outcome=await ensureCanonicalWrite(record,retained,{retryFailed:true})
        current();if(!outcome.ok)fail('canonical_repair_required')
        if(record.operationsById.get(retained.id)!==retained)fail('canonical_repair_required')
      }
      current();if(canonicalWriteFence(record).failed)fail('canonical_repair_required')
      return{result:{ok:true,seq:accepted.seq,...previous?{duplicate:true}:{}},accepted}
    }catch(error){return{result:{ok:false,reason:reason(error)}}}
  }

  /** Existing operation event, canonical metadata lane only. Explicit legacy is
   * returned solely after a proven legacy terminal; unknown is never fallback. */
  async metadata(identity:CanonicalAdmissionIdentity,value:unknown,isCurrent:()=>boolean):Promise<
    {readonly legacy:true}|{readonly result:SendResult;readonly accepted?:CanonicalMetadataOperation}> {
   try {
    const request=captureCanonicalMetadata(value,true)
    const {seq:requestedSeq,...body}=request,input=captureCanonicalMetadata(body)
    if(input.userId!==identity.userId)fail('invalid_operation')
    const record=rooms.get(identity.roomId)
    if(!record)fail('not_joined')
    const lesson=lessonRecordOf(record),context=canonicalBrushStorageContext()
    const residentChain:{operation:Operation;snapshot:CanonicalMetadataOperation}[]=[]
    let targetLayer:string|undefined
    const current=()=>{
     const actual=canonicalBrushStorageContext()
     if(!isCurrent()||!lesson.participants.has(identity.userId))fail('not_joined')
     if(rooms.get(identity.roomId)!==record||lessonRecordOf(record)!==lesson||actual?.storage!==context?.storage||actual?.operator!==context?.operator)fail('canonical_repair_required')
     if(getOperationRejectReason(identity.roomId,identity.userId,input)||targetLayer!==undefined&&canonicalPaintRejectReason(record,lesson,identity.userId,targetLayer))fail('invalid_operation')
     for(const member of residentChain)if(record.operationsById.get(member.operation.id)!==member.operation||!isDeepStrictEqual(captureCanonicalMetadata(member.operation,true),member.snapshot))fail('canonical_repair_required')
    }
    current()
    const same=(op:Operation)=>(requestedSeq===undefined||requestedSeq===op.seq)&&op.type===input.type&&isDeepStrictEqual(captureCanonicalMetadata(op,true),{...input,seq:op.seq})
    const durable=async(op:Operation,duplicate:boolean)=>{
     if(!same(op))fail('invalid_operation')
     const outcome=await ensureCanonicalWrite(record,op,{retryFailed:duplicate})
     if(!outcome.ok)fail('canonical_repair_required')
     current()
     if(canonicalWriteFence(record).failed)fail('canonical_repair_required')
     return {result:{ok:true as const,seq:op.seq!,...duplicate?{duplicate:true}:{}},accepted:op as CanonicalMetadataOperation}
    }
    let existing=findDuplicateOperation(identity.roomId,input.id)
    // SAME-ID receipts precede ANY legacy classification/duplicate success.
    const tracked=existing&&knownCanonicalWrite(existing)?existing:undefined
    if(tracked&&!same(tracked))fail('invalid_operation')
    if(record.room.rasterVersion!==STRAIGHT_ROOM_RASTER_VERSION){if(tracked)fail('canonical_repair_required');return {legacy:true}}
    const cut=record.nextSeq-1
    let existingRow:CanonicalStoredOperationRow|null=null
    if(!existing){
     existingRow=await prisma.operation.findUnique({where:{id:input.id},select:canonicalOperationRowSelect})
     if(existingRow){
      const op=captureCanonicalMetadata(existingRow.data,true)
      try{verifyCanonicalMetadataRow(identity.roomId,op,existingRow)}catch{fail('canonical_repair_required')};existing=op
     }
    }
    current()
    if(existing&&!same(existing))fail('invalid_operation')
    if(existing&&(!Number.isSafeInteger(existing.seq)||existing.seq!<1||existing.seq!>cut))fail('canonical_repair_required')
    let id=input.targetOpId,lastSeq=existing?.seq??cut+1
    const seen=new Set<string>()
    let anchor:CanonicalStrokeOperation|undefined,anchorRow:CanonicalStoredOperationRow|undefined
    for(let hop=0;hop<64;hop++){
     if(seen.has(id))fail('canonical_repair_required');seen.add(id)
     let op=record.operationsById.get(id),row:CanonicalStoredOperationRow|null=null
     if(!op){
      row=await prisma.operation.findUnique({where:{id},select:canonicalOperationRowSelect});current()
      if(!row)fail('canonical_repair_required')
      op=row.data as Operation
      if(!op||typeof op!=='object'||op.id!==id)fail('canonical_repair_required')
      try{verifyIndexedOperationRow(identity.roomId,op,row)}catch{fail('canonical_repair_required')}
     }
     if(!Number.isSafeInteger(op.seq)||op.seq!<1||op.seq!>=lastSeq||op.seq!>cut||op.userId!==identity.userId)fail('canonical_repair_required')
     lastSeq=op.seq!
     if(op.type==='operation_undo'||op.type==='operation_redo'){
      const metadata=captureCanonicalMetadata(op,true)
      if(row)try{verifyCanonicalMetadataRow(identity.roomId,metadata,row)}catch{fail('canonical_repair_required')}
      else{
       residentChain.push({operation:op,snapshot:metadata})
       if(knownCanonicalWrite(op)){
        const outcome=await ensureCanonicalWrite(record,op);current()
        if(!outcome.ok)fail('canonical_repair_required')
       }else{
        const actual=await prisma.operation.findUnique({where:{id:metadata.id},select:canonicalOperationRowSelect});current()
        try{verifyCanonicalMetadataRow(identity.roomId,metadata,actual)}catch{fail('canonical_repair_required')}
       }
      }
      id=metadata.targetOpId;continue
     }
     if(op.type==='canonical_stroke'){
      if(typeof op.frame?.materialPacked!=='string')fail('canonical_repair_required')
      if(op.frame.materialPacked.startsWith('1|')){if(tracked)fail('canonical_repair_required');return {legacy:true}}
      anchor=row?projectCanonicalIndexedOperation(identity.roomId,row).operation:op
      anchorRow=row??undefined;break
     }
     if(!hasKnownOperationDiscriminant(op)||tracked)fail('canonical_repair_required')
     return {legacy:true}
    }
    if(!anchor)fail('canonical_repair_required')
    targetLayer=anchor.layerId;current()
    // Cold resident copies intentionally have no adopted receipt. Obtain the
    // actual indexed row before either fresh prefix proof or SAME-ID repair.
    if(!anchorRow&&!hasSucceededCanonicalWrite(record,anchor)){
     const residentAnchor=anchor
     const row=await prisma.operation.findUnique({where:{id:anchor.id},select:canonicalOperationRowSelect});current()
     if(record.operationsById.get(residentAnchor.id)!==residentAnchor)fail('canonical_repair_required')
     try{verifyCanonicalOperationRow(identity.roomId,residentAnchor,row)}catch{fail('canonical_repair_required')}
     if(!row)fail('canonical_repair_required')
     anchor=projectCanonicalIndexedOperation(identity.roomId,row).operation;anchorRow=row
    }
    if(tracked){
     // Original acceptance proved the complete ended prefix. Only its exact
     // receipt is repaired; current target/layer authority is checked again.
     return await durable(tracked,true)
    }
    let assertPrefixCurrent:()=>void
    if(this.fullHistoryFormat==='mixed-v2'){
      // Existing metadata must be justified by history BEFORE its actual seq,
      // never by a close/end appended later in the room's current tail.
      let prefixCut=cut
      if(existing){
        existingRow=existingRow??await prisma.operation.findUnique({where:{id:input.id},select:canonicalOperationRowSelect});current()
        const captured=captureCanonicalMetadata(existing,true)
        try{verifyCanonicalMetadataRow(identity.roomId,captured,existingRow)}catch{fail('canonical_repair_required')}
        prefixCut=captured.seq!-1
      }
      assertPrefixCurrent=await this.prepareMetadataPrefix(identity,anchor,anchorRow,prefixCut,current)
    }else{
      const read=await this.prepareReadDelivery(identity,isCurrent)
      try{await read.preparePrefix({anchor,row:anchorRow,throughSeq:cut,purpose:'undo-redo'})}
      catch(error){if(error instanceof TransportFailure)throw error;fail('canonical_repair_required')}
      assertPrefixCurrent=()=>{current();read.finish([],[])}
    }
    assertPrefixCurrent()
    const raced=findDuplicateOperation(identity.roomId,input.id)
    if(raced&&knownCanonicalWrite(raced))return await durable(raced,true)
    existing=raced??existing
    if(existing){
     if(!same(existing))fail('invalid_operation')
     // Untracked resident equality is not durable proof: read its actual row.
     const row=existingRow??await prisma.operation.findUnique({where:{id:input.id},select:canonicalOperationRowSelect})
     assertPrefixCurrent()
     if(!same(existing))fail('canonical_repair_required')
     try{verifyCanonicalMetadataRow(identity.roomId,captureCanonicalMetadata(existing,true),row)}catch{fail('canonical_repair_required')}
     return {result:{ok:true,seq:existing.seq!,duplicate:true},accepted:captureCanonicalMetadata(existing,true)}
    }
    if(requestedSeq!==undefined)fail('invalid_operation')
    let assertRedoCut:undefined|(()=>void)
    if(input.type==='operation_redo'&&this.fullHistoryFormat==='mixed-v2'){
     // Prospective command policy only. Already accepted historical redo and
     // SAME-ID repairs above retain their original durable meaning.
     let redoable:boolean
     try{
      const read=await this.prepareReadDelivery(identity,isCurrent)
      // Prefix authority stays at its original cut; only the prospective
      // whole-history decision starts at the latest completed room cut.
      const redoCut=record.nextSeq-1
      const full=await read.prepareFullHistory({throughSeq:redoCut,floor:0})
      const envelope=read.finish(full.operations,full.canonicalRows,full)
      if(!envelope.canonicalHistoryBase||!envelope.canonicalCapabilities)fail('canonical_repair_required')
      const folded=verifyCanonicalFullHistoryBase(envelope.canonicalHistoryBase,prepareCanonicalRecordedAttachment(envelope.canonicalCapabilities,full.operations,read.scope),read.scope)
      const targetId=anchor.id,target=folded.gestures.find(group=>group.userId===identity.userId&&group.frameOperationIds.includes(targetId))
      if(!target)fail('canonical_repair_required')
      redoable=target.redoable
      assertRedoCut=()=>{current();full.assertCurrent()}
     }catch(error){
      // A concurrent identical command may itself have moved the read cut.
      // Its receipt must be repaired before any new-command branch decision.
      const duplicate=findDuplicateOperation(identity.roomId,input.id)
      if(duplicate&&knownCanonicalWrite(duplicate))return await durable(duplicate,true)
      throw error
     }
     const duplicate=findDuplicateOperation(identity.roomId,input.id)
     if(duplicate&&knownCanonicalWrite(duplicate))return await durable(duplicate,true)
     assertPrefixCurrent();assertRedoCut()
     if(!redoable)fail('invalid_operation')
    }
    // No await between last authority checks, mirror update and SAME receipt.
    assertPrefixCurrent();assertRedoCut?.()
    updateAliveIds(identity.roomId,input)
    const accepted=recordCanonicalMetadataOperation(identity.roomId,input)
    return await durable(accepted,false)
   }catch(error){return {result:{ok:false,reason:reason(error)}}}
  }

  /** Private write-purpose proof; never widens generic reader/suffix grants. */
  private async prepareMetadataPrefix(identity:CanonicalAdmissionIdentity,anchor:CanonicalStrokeOperation,row:CanonicalStoredOperationRow|undefined,cut:number,assertActor:()=>void):Promise<()=>void>{
    const binder=this.currentBinder(),context=this.context!,record=rooms.get(identity.roomId),format=this.fullHistoryFormat
    if(!record)fail('not_joined')
    const scope=binder.captureReadScope(identity.roomId)
    const current=()=>{
      assertActor()
      const actual=canonicalBrushStorageContext()
      if(!actual||rooms.get(identity.roomId)!==record||this.binder!==binder||actual.storage!==context.storage||actual.operator!==context.operator||canonicalWriteFence(record).failed)fail('canonical_repair_required')
    }
    const authorize=async()=>{if(!await mayReadBoardContent(identity.roomId,identity.userId,format))fail('not_joined');current()}
    current();await authorize()
    if(row)binder.readRecordedCapability({roomId:identity.roomId,boardEpoch:scope.boardEpoch,operation:anchor,row})
    else binder.readResidentRecordedCapability({roomId:identity.roomId,boardEpoch:scope.boardEpoch,operation:anchor})
    await flushRoomWrites(identity.roomId);current()
    try{
      const fold=binder.createRecordedPrefixFold({roomId:identity.roomId,boardEpoch:scope.boardEpoch,anchor,row,purpose:'undo-redo'})
      await visitCanonicalGesturePrefixRows(identity.roomId,{userId:anchor.userId,strokeId:anchor.frame.strokeId},cut,{requiredFrame:anchor,afterRead:authorize,
        visit(operation,actualRow){current();fold.accept(operation,actualRow);return undefined}})
      current();await authorize();fold.finish()
    }catch(error){if(error instanceof TransportFailure)throw error;fail('canonical_repair_required')}
    current();return current
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
    try { prepareCanonicalRecordedAttachment(canonicalCapabilities,[op],{roomId:g.roomId,boardEpoch:g.boardEpoch,allowedRasterProfiles:this.policy.allowedRecordedRasterProfiles}) }
    catch { fail('canonical_repair_required') } // durable row exists; never invite mutation as a new operation
    return {canonicalCapabilities}
  }

  private requireUnsealedOrdinal(lifetime:RoomLifetime,identity:CanonicalAdmissionIdentity,strokeId:string,ordinal:number):void {
    if(lifetime.record.operations.some(op=>op.type==='canonical_stroke_close'&&op.targetUserId===identity.userId&&op.strokeId===strokeId&&ordinal>=op.recordedNext))fail('canonical_repair_required')
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
  if(!('version'in g.material)&&g.rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE)fail('invalid_operation')
  const common={ layerId: g.layerId, brush: g.brush, strokeId: g.strokeId, boardEpoch: g.boardEpoch,
    descriptorSha256:g.descriptorSha256,pigmentRgb8:g.pigmentRgb8,composition:g.composition,assets:g.material.assets}
  const value:CanonicalStrokeSnapshot='version'in g.material?Object.freeze({...common,rasterProfile:g.rasterProfile,materialVersion:2 as const,material:g.material}):Object.freeze({...common,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE})
  return { ok: true, snapshot: value, ...session.admission.cursor(g, g.strokeId) }
}
function reason(error: unknown): TransportFailure['reason'] {
  if (error instanceof TransportFailure) return error.reason
  if (error instanceof CanonicalGesturePrefixError) return 'canonical_repair_required'
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
