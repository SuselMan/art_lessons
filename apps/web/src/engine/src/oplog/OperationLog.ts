import type {CanonicalRecordedInput,CanonicalAcceptedCut} from './CanonicalRecordedDelivery'
// Append-only operation log — the source of truth for canvas content (ADR 002).
// Undo/redo never rewrites history: entries flip between three states and
// replay simply skips everything that is not `done`.
//
//   done   — applied, visible on canvas
//   undone — reverted by its author, eligible for redo
//   gone   — unreachable history branch (author acted after undo, or a teacher
//            revoked it); new redo selection excludes it. Previously accepted
//            canonical historical redo remains replay-valid.

import type {
  Operation, StrokeOperation, CanonicalStrokeOperation, LayerClearOperation, LayerMergeOperation, LayerDuplicateOperation,
  ImageImportOperation, LayerTransformOperation, AreaTransformOperation, AreaClearOperation,
  AreaPasteOperation, AreaFillOperation, ShapeOperation, LayerFilterOperation,
} from '@grafetto/shared'
import { transitionCanonicalHistoryGesture, captureCanonicalFullHistoryMetadata, parseCanonicalStrokeCloseOperation, operationLayerIds, prepareCanonicalRecordedAttachment,prepareCanonicalRecordedAttachmentV8, type CanonicalPreparedRecordedOperationV8 as CanonicalPreparedRecordedOperation } from '@grafetto/shared'

/** Restore only the authoritative sequence, preserving every own descriptor so
 * the shared closed parser still rejects hidden extras and accessors. */
function captureCloseForPlacement(op: Operation, serverSeq: number | undefined): Operation {
  const keys = Reflect.ownKeys(op)
  if (keys.length !== 12) throw new TypeError('Invalid canonical stroke close metadata')
  const descriptors = Object.getOwnPropertyDescriptors(op)
  if (keys.some(key => !Object.hasOwn(descriptors[key as string], 'value')))
    throw new TypeError('Invalid canonical stroke close metadata')
  if (serverSeq !== undefined) descriptors.seq = {value: serverSeq, enumerable: true}
  return parseCanonicalStrokeCloseOperation(Object.create(null, descriptors))
}

/** Compare bounded metadata after restoring only its authoritative sequence. */
function captureMetadataForPlacement(op:Operation,serverSeq:number|undefined){
  const descriptors=Object.getOwnPropertyDescriptors(op)
  if(Reflect.ownKeys(op).some(key=>!Object.hasOwn(descriptors[key as string],'value')))throw new TypeError('Invalid canonical history metadata')
  if(serverSeq!==undefined)descriptors.seq={value:serverSeq,enumerable:true}
  return captureCanonicalFullHistoryMetadata(Object.create(null,descriptors))
}

export type OperationState = 'done' | 'undone' | 'gone'
function canonicalStateAfter(state:OperationState,action:Parameters<typeof transitionCanonicalHistoryGesture>[1]):OperationState {
  const next=transitionCanonicalHistoryGesture({visible:state==='done',redoable:state!=='gone'},action)
  return next.visible?'done':next.redoable?'undone':'gone'
}
export type CanonicalLogRead = NonNullable<CanonicalPreparedRecordedOperation['read']>

export interface LogEntry {
  op: Operation
  state: OperationState
  /** (#537) This client's own operation, applied optimistically and not yet
   *  confirmed by the server. Pending entries always form the log's tail —
   *  see OperationLog's own doc comment on the two regions. */
  pending?: boolean
  /** (#537) The server's seq, once known: set on every confirmed entry that
   *  arrived with one. Absent on pending entries and on backfilled history
   *  (which is older than everything else anyway). */
  serverSeq?: number
  /** Read authority stays with this history entry, outside operation JSON.
   * Captured delivery lifetime must still be current at rendering time. */
  canonicalRead?: CanonicalLogRead
  /** Exact local delivery resource; nonenumerable, never operation JSON. */
  readonly canonicalInput?:CanonicalRecordedInput
}

/** (#537) Where `append` puts an operation. */
export type Placement =
  /** This client's own operation, applied before the server has ordered it:
   *  goes on the very end, in the pending tail. */
  | { pending: true }
  /** An operation the server has already ordered: goes into the confirmed
   *  region at its seq, below every pending entry. */
  | { pending?: false; serverSeq?: number; canonicalRead?: CanonicalLogRead;canonicalInput?:CanonicalRecordedInput }

/** Capture once, before any spread could invoke an authority accessor. */
function canonicalInputOf(holder:object):CanonicalRecordedInput|undefined {
  const descriptor=Object.getOwnPropertyDescriptor(holder,'canonicalInput')
  if(!descriptor){if('canonicalInput' in holder)throw new TypeError('Inherited canonical delivery resource');return undefined}
  if(!Object.hasOwn(descriptor,'value'))throw new TypeError('Canonical delivery accessor is unsupported')
  return descriptor.value
}
function retainCanonicalInput(entry:LogEntry,input:CanonicalRecordedInput|undefined):LogEntry {
  if(input)Object.defineProperty(entry,'canonicalInput',{value:input,enumerable:false,writable:false,configurable:false})
  return entry
}
function copyLogEntry(entry:LogEntry,patch:Partial<LogEntry>={},input=canonicalInputOf(entry)):LogEntry {
  // Copy known journal fields, never re-read/spread a caller-owned proof.
  const {op,state,pending,serverSeq,canonicalRead}=entry
  return retainCanonicalInput({op,state,...pending===undefined?{}:{pending},...serverSeq===undefined?{}:{serverSeq},...canonicalRead===undefined?{}:{canonicalRead},...patch},input)
}

/** Operations that change a layer's pixel buffer (as opposed to structure). */
export type PixelOperation = StrokeOperation | CanonicalStrokeOperation | LayerClearOperation | LayerMergeOperation
  | LayerDuplicateOperation | ImageImportOperation | LayerTransformOperation
  | AreaTransformOperation | AreaClearOperation | AreaPasteOperation | AreaFillOperation
  | ShapeOperation | LayerFilterOperation

export function isPixelOperation(op: Operation): op is PixelOperation {
  return op.type === 'stroke' || op.type === 'canonical_stroke' || op.type === 'layer_clear' || op.type === 'layer_merge'
    || op.type === 'layer_duplicate' || op.type === 'image_import' || op.type === 'layer_transform'
    // (#446) The selection operations paint one layer and change nothing
    // else, which is what "pixel operation" means here — they belong in
    // checkpoint counting, per-layer replay and undo exactly like a stroke.
    || op.type === 'area_transform' || op.type === 'area_clear' || op.type === 'area_paste'
    // (#453) The fill, for the same reason: one layer, pixels and nothing else.
    || op.type === 'area_fill'
    // (#527) And a shape, which is the same thing drawn from parameters
    // instead of from a raster.
    || op.type === 'shape'
    // (#574) And a filter: one layer, pixels only, replayed from its numbers.
    || op.type === 'layer_filter'
}

/** (#537) The layers whose pixels `op` writes. Empty for anything that is not
 *  a pixel operation — including undo/redo/revoke, which rebuild their
 *  target's layers themselves. */
export function pixelWriteLayerIds(op: Operation): string[] {
  if (!isPixelOperation(op)) return []
  return op.type === 'layer_transform' ? op.transforms.map(t => t.layerId) : [op.layerId]
}

/** (#537) The layers whose pixels `op` reads without writing: a merge's sources
 *  and a duplicate's source. Their content at the operation's place in the
 *  order is baked into its result, so something landing on them *earlier* in
 *  the order changes that result. */
export function pixelReadLayerIds(op: Operation): string[] {
  if (op.type === 'layer_merge') return op.sources.map(s => s.id)
  if (op.type === 'layer_duplicate') return [op.sourceId]
  return []
}

/** Every PixelOperation but layer_transform targets exactly one layer via its
 *  own `layerId`. layer_transform (#120) is the one exception — a single
 *  operation can bake a matrix into several layers at once (see its
 *  docstring in packages/shared), so membership has to check its
 *  `transforms` array instead of a single field.
 *
 *  (#449) `layer_duplicate` names two layers but belongs to exactly one
 *  history: the copy's, via `layerId`. Its `sourceId` is read, not written —
 *  the source is not changed by being copied. Counting it under `sourceId` as
 *  well would put it in `layerPixelOps(sourceId)`, so any later rebuild of the
 *  source would replay the duplicate into the source's own buffer and paint the
 *  layer onto itself. */
function pixelOpTargetsLayer(op: PixelOperation, layerId: string): boolean {
  return op.type === 'layer_transform'
    ? op.transforms.some(t => t.layerId === layerId)
    : op.layerId === layerId
}

/** Continuous opacity-slider input arrives as a burst of operations; collapse
 *  the burst into one log entry so a single Ctrl+Z reverts the whole slide.
 *
 *  (#412) The slider can now drive several layers at once, so "same target"
 *  is a set comparison rather than one id. Order is not normalised on purpose:
 *  a single slide always emits the same list in the same order (it comes from
 *  one unchanged selection), and two *different* selections that happen to
 *  hold the same layers are still two different gestures a user would expect
 *  to undo separately. */
function coalesces(prev: Operation, next: Operation): boolean {
  if (prev.type !== 'layer_opacity' || next.type !== 'layer_opacity') return false
  if (prev.userId !== next.userId) return false
  const a = operationLayerIds(prev)
  const b = operationLayerIds(next)
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Meta-operations that only ever move *another* entry between states —
 *  they never represent undoable content themselves. Excluded from
 *  undo/redo candidate scans (#103): without this, a second Ctrl+Z would
 *  find the operation_undo entry the first Ctrl+Z just appended and try to
 *  "undo the undo" instead of reaching further back into real content. */
//  (#536, §17.48) `paper_dry` rides along: it is not undoable (there is no
//  "wet it again"), so a Ctrl+Z must reach past it to the stroke before, and
//  pressing it is not "doing something new" that should cost the redo stack.
const META_OP_TYPES = new Set<Operation['type']>(['operation_revoke', 'operation_undo', 'operation_redo', 'paper_dry', 'canonical_stroke_close'])

/** (#537) The log holds two regions, in this order:
 *
 *   - **confirmed** — every operation the server has ordered, sorted by the
 *     server's seq. The room's true history, identical on every client.
 *   - **pending** — this client's own operations, applied the moment they were
 *     made and not yet confirmed, in the order they were made.
 *
 *  That is the order the room *will* have: the stream of confirmations is
 *  ordered, so anything confirmed from now on either is one of the pending
 *  entries or has a seq below all of them. A peer's operation is therefore
 *  inserted below the pending tail rather than appended after it, and an own
 *  operation moves from the tail to its seq when its confirmation arrives.
 *
 *  Pixels are painted when an operation is applied, which is not always in
 *  this order — that is what `append` and `confirm` report back as
 *  `overtaken`: the entries now *after* the operation that were painted
 *  *before* it. The engine re-settles the layers where that matters.
 *
 *  Local `seq` still means "array index" (see append()); every move
 *  renumbers the entries it shifted. */
export interface CanonicalIndexedDerivedCounts {
 readonly throughSeq:number
 readonly operationCount:number
 readonly visibleFrameCounts:readonly {readonly layerId:string;readonly count:number}[]
}
export interface CanonicalCutPublication {
 assertCurrent():void
 publish():void
 cancel():void
}
export class OperationLog {
  private _entries: LogEntry[] = []
  private _canonicalAcceptedCut:CanonicalAcceptedCut|null=null
  get canonicalAcceptedCut():CanonicalAcceptedCut|null{return this._canonicalAcceptedCut}
  get canonicalRetainedSuffix():readonly LogEntry[]{return this._entries}
  /** Prepare all source callbacks/copies before SAME log publication. The
   * ticket's final publish performs pure CAS only, immediately before map swap. */
  prepareCanonicalCutPublication(cut:CanonicalAcceptedCut,derived:CanonicalIndexedDerivedCounts,expectedRevision:number):CanonicalCutPublication {
    const entries=this._entries,previous=this._canonicalAcceptedCut,counts=new Map<string,number>()
    const throughSeq=cut.throughSeq,operationCount=cut.operationCount
    if(!Number.isSafeInteger(throughSeq)||throughSeq<0||operationCount!==throughSeq||derived.throughSeq!==throughSeq||derived.operationCount!==operationCount||!Array.isArray(derived.visibleFrameCounts)||derived.visibleFrameCounts.length>2)throw new TypeError('Invalid canonical indexed cut')
    for(const {layerId,count}of derived.visibleFrameCounts){if(typeof layerId!=='string'||!layerId.length||!Number.isSafeInteger(count)||count<0||count>operationCount||counts.has(layerId))throw new TypeError('Invalid canonical indexed counts');counts.set(layerId,count)}
    let active=true
    const pure=()=>{if(!active||this._revision!==expectedRevision||this._entries!==entries||this._canonicalAcceptedCut!==previous)throw new Error('Canonical indexed journal changed')}
    const current=()=>{cut.assertCurrent(cut);if(cut.lifetime.assertCurrent()!==cut.scope)throw new Error('Canonical indexed origin changed');pure()}
    current()
    const log=this,ticket:CanonicalCutPublication={
      assertCurrent(){if(this!==ticket)throw new Error('Foreign canonical cut ticket');current()},
      publish(){if(this!==ticket)throw new Error('Foreign canonical cut ticket');pure();active=false;log._canonicalAcceptedCut=cut;log._entries=[];log._confirmedCount=0;log._nextSeq=0;log._pixelOpDoneCount=counts;log._revision=expectedRevision+1},
      cancel(){if(this!==ticket)throw new Error('Foreign canonical cut ticket');active=false},
    }
    return Object.freeze(ticket)
  }
  /** Adopt only a dense, genuinely confirmed bounded continuation. */
  prepareCanonicalContinuationPublication(expected:CanonicalAcceptedCut,next:CanonicalAcceptedCut):CanonicalCutPublication {
    const revision=this._revision,entries=this._entries,originalInputs=Object.freeze(this._entries.map(entry=>entry.canonicalInput)),originalOperations=Object.freeze(this._entries.map(entry=>entry.op)),originalReads=Object.freeze(this._entries.map(entry=>entry.canonicalRead))
    if(this._canonicalAcceptedCut!==expected||next.lifetime!==expected.lifetime||next.throughSeq<=expected.throughSeq||next.throughSeq-expected.throughSeq>64||next.operationCount!==next.throughSeq||entries.length!==next.throughSeq-expected.throughSeq)throw new Error('Invalid canonical continuation cut')
    const pure=()=>{
      if(this._canonicalAcceptedCut!==expected||this._revision!==revision||this._entries!==entries)throw new Error('Canonical continuation journal changed')
      for(let i=0;i<entries.length;i++){const entry=entries[i],input=entry.canonicalInput;if(!input||input!==originalInputs[i]||entry.op!==originalOperations[i]||entry.canonicalRead!==originalReads[i]||entry.pending||entry.state!=='done'||entry.serverSeq!==expected.throughSeq+i+1||input.operation.seq!==entry.serverSeq||input.delivery.lifetime!==expected.lifetime||(input.operation.type!=='canonical_stroke'&&input.operation.type!=='canonical_stroke_close'))throw new Error('Canonical continuation is not dense original history')}
    }
    let active=true
    const current=()=>{expected.assertCurrent(expected);next.assertCurrent(next);for(const input of originalInputs)input!.delivery.assertCurrent(input!);if(!active)throw new Error('Canonical continuation ticket retired');pure()}
    current()
    const log=this,ticket:CanonicalCutPublication={
      assertCurrent(){if(this!==ticket)throw new Error('Foreign canonical continuation ticket');current()},
      publish(){if(this!==ticket||!active)throw new Error('Canonical continuation ticket retired');pure();active=false;log._canonicalAcceptedCut=next;log._entries=[];log._confirmedCount=0;log._nextSeq=0;log._revision=revision+1},
      cancel(){if(this!==ticket)throw new Error('Foreign canonical continuation ticket');active=false},
    }
    return Object.freeze(ticket)
  }
  private _revision = 0

  /** Changes whenever journal order or entry state may change. */
  get revision(): number { return this._revision }
  private _nextSeq = 0
  /** (#537) Entries [0, _confirmedCount) are the confirmed region; the rest
   *  are the pending tail. */
  private _confirmedCount = 0
  // (#150) Per-layer count of currently-`done` pixel ops, maintained
  // incrementally alongside every state transition that can change it
  // (append/applyUndo/applyRedo/revoke below) — `_maybeCheckpoint`
  // (engine/index.ts) used to call `layerPixelOps(layerId).length` on
  // *every* stroke/image_import/layer_transform completion just to check
  // "is this a checkpoint-interval multiple," a full O(log length) scan on
  // an interactive path whose cost only grows with session length. This
  // gives the same number in O(targeted layers) instead — `layerPixelOps`
  // itself is untouched and still used wherever the real ops array (not
  // just its count) is actually needed, which is naturally rare (checkpoint
  // taking itself is throttled to 1-in-CHECKPOINT_INTERVAL, replay/rebuild
  // paths aren't on the per-stroke hot path).
  private _pixelOpDoneCount = new Map<string, number>()

  get entries(): readonly LogEntry[] {
    return this._entries
  }

  /** See _pixelOpDoneCount's own field comment. O(1), never scans the log. */
  pixelOpDoneCount(layerId: string): number {
    return this._pixelOpDoneCount.get(layerId) ?? 0
  }

  private _bumpPixelOpCount(op: Operation, delta: number): void {
    if (!isPixelOperation(op)) return
    const layerIds = op.type === 'layer_transform' ? op.transforms.map(t => t.layerId) : [op.layerId]
    for (const layerId of layerIds) {
      this._pixelOpDoneCount.set(layerId, (this._pixelOpDoneCount.get(layerId) ?? 0) + delta)
    }
  }

  /** Prepare before any revision/state/order mutation. Reuse the shared
   * attachment validator; no independent source schema or capability registry. */
  private _prepareCanonicalRead(op: Operation, serverSeq: number | undefined, read: CanonicalLogRead | undefined, entries: readonly LogEntry[] = this._entries): CanonicalLogRead | undefined {
    if (!read) return undefined
    if (op.type !== 'canonical_stroke' || serverSeq !== read.sequence || read.operationId !== op.id)
      throw new TypeError('Canonical history read does not match authoritative placement')
    const prepare=(read.capability.snapshot.materialVersion===8||read.capability.snapshot.materialVersion===2)?prepareCanonicalRecordedAttachmentV8:prepareCanonicalRecordedAttachment
    const prepared = prepare({ version: 1, roomId: read.roomId, boardEpoch: read.boardEpoch,
      capabilities: [read.capability], bindings: [{ operationId: op.id, sequence: serverSeq,
        originalUserId: op.userId, capability: 0 }] }, [{ ...op, seq: serverSeq }],
      { roomId: read.roomId, boardEpoch: read.boardEpoch, rasterProfile: read.rasterProfile })[0].read!
    const previous = entries.find(e => e.canonicalRead
      && e.op.type === 'canonical_stroke' && e.op.userId === op.userId && e.op.frame.strokeId === op.frame.strokeId)?.canonicalRead
    if (!previous) return prepared
    if (previous.roomId !== prepared.roomId || previous.boardEpoch !== prepared.boardEpoch
      || JSON.stringify(previous.capability) !== JSON.stringify(prepared.capability))
      throw new TypeError('Canonical gesture history read changed; authoritative refresh required')
    return Object.freeze({ ...prepared, capability: previous.capability })
  }

  /** Validate under the original local owner, never a scope reconstructed
   * from retained read metadata. Local journal seq is replaced only for the
   * SAME shared bounded projection comparison. */
  private _prepareCanonicalInput(op:Operation,serverSeq:number|undefined,input:CanonicalRecordedInput|undefined,retained?:CanonicalRecordedInput,basis:readonly LogEntry[]=this._entries):CanonicalRecordedInput|undefined {
    if(!input)return undefined
    const validate=(candidate:CanonicalRecordedInput)=>{
      candidate.delivery.assertCurrent(candidate)
      const lifetime=candidate.delivery.lifetime,scope=lifetime.assertCurrent(),original=candidate.operation
      if(original.seq!==serverSeq||original.id!==op.id||original.type!==op.type)throw new TypeError('Canonical delivery placement changed')
      if(original.type==='canonical_stroke'){
        const read=candidate.read
        if(!read||read.operationId!==original.id||read.sequence!==serverSeq)throw new TypeError('Canonical delivery read missing')
        const prepare=(read.capability.snapshot.materialVersion===8||read.capability.snapshot.materialVersion===2)?prepareCanonicalRecordedAttachmentV8:prepareCanonicalRecordedAttachment
        const normalize=(operation:Operation)=>prepare({version:1,roomId:read.roomId,boardEpoch:read.boardEpoch,
          capabilities:[read.capability],bindings:[{operationId:original.id,sequence:serverSeq!,originalUserId:original.userId,capability:0}]},[{...operation,seq:serverSeq}],scope)[0]
        const normalized=normalize(original)
        if(read.rasterProfile!==normalized.read!.rasterProfile||JSON.stringify(normalized.operation)!==JSON.stringify(normalize(op).operation))throw new TypeError('Canonical delivery body changed')
      }else if(original.type==='canonical_stroke_close'){
        if(candidate.read||JSON.stringify(parseCanonicalStrokeCloseOperation(original))!==JSON.stringify(captureCloseForPlacement(op,serverSeq)))throw new TypeError('Canonical close delivery changed')
      }else if(original.type==='operation_undo'||original.type==='operation_redo'){
        if(candidate.read||JSON.stringify(captureCanonicalFullHistoryMetadata(original))!==JSON.stringify(captureMetadataForPlacement(op,serverSeq)))throw new TypeError('Canonical history metadata delivery changed')
      }else throw new TypeError('Unsupported canonical delivery operation')
      candidate.delivery.assertCurrent(candidate)
      if(lifetime.assertCurrent()!==scope)throw new TypeError('Canonical delivery scope replaced')
      return {lifetime,scope}
    }
    const origin=validate(input)
    const identity=(operation:Operation)=>operation.type==='canonical_stroke'?[operation.userId,operation.frame.strokeId]:operation.type==='canonical_stroke_close'?[operation.targetUserId,operation.strokeId]:undefined
    const target=identity(input.operation)
    for(const entry of basis){
      const previous=canonicalInputOf(entry)
      if(!previous)continue
      const key=identity(previous.operation)
      if(!target||!key||key[0]!==target[0]||key[1]!==target[1])continue
      previous.delivery.assertCurrent(previous)
      if(previous.delivery.lifetime!==origin.lifetime||previous.delivery.lifetime.assertCurrent()!==origin.scope)throw new TypeError('Canonical gesture lifetime refresh requires authoritative rebuild')
    }
    if(retained){
      const previous=validate(retained)
      if(origin.lifetime!==previous.lifetime||origin.scope!==previous.scope)throw new TypeError('Canonical delivery lifetime refresh requires authoritative rebuild')
      return retained
    }
    return input
  }

  private _prepareCanonicalReadAndInput(op:Operation,serverSeq:number|undefined,read:CanonicalLogRead|undefined,input:CanonicalRecordedInput|undefined,basis:readonly LogEntry[]=this._entries):CanonicalLogRead|undefined {
    const prepared=this._prepareCanonicalRead(op,serverSeq,read??input?.read,basis)
    if(input?.read&&read&&JSON.stringify(prepared)!==JSON.stringify(this._prepareCanonicalRead(op,serverSeq,input.read,basis)))throw new TypeError('Canonical input and read disagree')
    return prepared
  }

  /** Appends a new operation. The author's `undone` entries become `gone`:
   *  a linear log cannot express history branching, so a new action makes the
   *  undone branch unreachable and redo past it impossible.
   *
   *  Meta-ops (operation_undo/redo/revoke, #103) are exempt from this: they
   *  aren't "the user did something new" in the sense this rule guards
   *  against — appending an `operation_redo` (now itself logged/broadcast so
   *  every replica converges, not just a direct in-memory mutation) must not
   *  nuke the very entries it and its siblings are about to flip back to
   *  `done`, or a multi-step redo would wipe its own remaining redo stack
   *  after the first step. */
  /**
   *  (#537) Returns the entries that now come *after* `op` although they were
   *  already applied — empty in the common case, where `op` lands on the end
   *  of its region with nothing painted above it. See the class doc comment. */
  append(op: Operation, placement: Placement = {}, beforePublish?: () => undefined): LogEntry[] {
    if (beforePublish !== undefined) return this._appendRecordedGuarded(op,placement,beforePublish)
    const originalInput=canonicalInputOf(placement)
    if(placement.pending&&('canonicalInput' in placement||'canonicalRead' in placement))throw new TypeError('Pending history cannot carry recorded authority')
    if(originalInput&&originalInput.operation!==op)throw new TypeError('Canonical append requires original operation pointer')
    const canonicalInput=this._prepareCanonicalInput(op,placement.pending?undefined:placement.serverSeq,originalInput)
    if (op.type === 'canonical_stroke_close') {
      if (placement.pending) throw new TypeError('Canonical close requires recorded placement')
      op = captureCloseForPlacement(op,placement.serverSeq)
    }
    if (placement.pending && 'canonicalRead' in placement) throw new TypeError('Pending history cannot carry recorded read authority')
    const canonicalRead = this._prepareCanonicalReadAndInput(op, placement.pending ? undefined : placement.serverSeq,
      placement.pending ? undefined : placement.canonicalRead,canonicalInput)
    this._revision++
    if (!META_OP_TYPES.has(op.type)) {
      const fresh=op.type!=='canonical_stroke'||!this._entries.some(e=>e.op.type==='canonical_stroke'&&e.op.userId===op.userId&&e.op.frame.strokeId===op.frame.strokeId)
      for (const e of this._entries) {
        if (e.state === 'undone' && e.op.userId === op.userId) {
          if(op.type!=='canonical_stroke'||e.op.type!=='canonical_stroke')e.state='gone'
          else if(fresh)e.state=canonicalStateAfter(e.state,'new-own-gesture')
        }
      }
    }

    if (placement.pending) {
      // Coalesced only into another pending entry: folding an unconfirmed
      // operation into a confirmed one would leave that entry claiming a
      // confirmation it no longer has.
      const last = this._entries[this._entries.length - 1]
      if (last && last.pending && last.state === 'done' && coalesces(last.op, op)) {
        last.op = { ...op, seq: last.op.seq }
        return []
      }
      this._entries.push({ op: { ...op, seq: this._nextSeq++ }, state: 'done', pending: true })
      this._bumpPixelOpCount(op, 1)
      return []
    }

    const at = this._confirmedSlot(placement.serverSeq)
    const prev = this._entries[at - 1]
    if (prev && !prev.pending && prev.state === 'done' && coalesces(prev.op, op)) {
      prev.op = { ...op, seq: prev.op.seq }
      if (placement.serverSeq !== undefined) prev.serverSeq = placement.serverSeq
      return this._entries.slice(at)
    }
    const entry: LogEntry = retainCanonicalInput({ op: { ...op, seq: at }, state: 'done' },canonicalInput)
    if (canonicalRead) entry.canonicalRead = canonicalRead
    if (placement.serverSeq !== undefined) entry.serverSeq = placement.serverSeq
    this._entries.splice(at, 0, entry)
    this._confirmedCount++
    this._nextSeq++
    this._renumber(at + 1, this._entries.length)
    this._bumpPixelOpCount(op, 1)
    return this._entries.slice(at + 1)
  }

  /** Narrow recorded-only publication. No owner callback or caller-field read
   * may remain after the final journal comparison. Legacy append is unchanged. */
  private _appendRecordedGuarded(op:Operation,placement:Placement,beforePublish:()=>undefined):LogEntry[] {
    const revision=this._revision,entries=this._entries,length=entries.length,confirmed=this._confirmedCount,nextSeq=this._nextSeq,states=entries.map(entry=>entry.state)
    const assertJournal=()=>{
      if(this._revision!==revision||this._entries!==entries||this._entries.length!==length
        ||this._confirmedCount!==confirmed||this._nextSeq!==nextSeq||entries.some((entry,i)=>entry.state!==states[i]||entry.pending))throw new Error('Recorded append journal changed')
    }
    if(typeof beforePublish!=='function')throw new TypeError('Recorded publication validator must be a function')
    const keys=Reflect.ownKeys(placement)
    if(keys.length>4||keys.some(key=>typeof key!=='string'||!['pending','serverSeq','canonicalRead','canonicalInput'].includes(key)))throw new TypeError('Invalid guarded recorded placement')
    const data=(key:string)=>{
      const descriptor=Object.getOwnPropertyDescriptor(placement,key)
      if(!descriptor){if(key in placement)throw new TypeError('Inherited guarded placement');return undefined}
      if(!Object.hasOwn(descriptor,'value'))throw new TypeError('Guarded placement accessor is unsupported')
      return descriptor.value
    }
    const pending=data('pending'),serverSeq=data('serverSeq'),read=data('canonicalRead'),originalInput=canonicalInputOf(placement)
    if(this._canonicalAcceptedCut){
      const cut=this._canonicalAcceptedCut;cut.assertCurrent(cut)
      if(serverSeq!==(entries.at(-1)?.serverSeq??cut.throughSeq)+1)throw new Error('Canonical indexed suffix placement changed')
      if(length>=1024)throw new RangeError('Canonical indexed suffix requires a new original cut')
    }
    if(pending!==undefined&&pending!==false||(op.type!=='canonical_stroke'&&op.type!=='canonical_stroke_close')||!originalInput
      ||originalInput.operation!==op||!Number.isSafeInteger(serverSeq)||serverSeq<1
      ||confirmed!==length||entries.some(entry=>entry.pending)||length>0&&(entries[length-1].serverSeq===undefined||entries[length-1].serverSeq!>=serverSeq)
      ||entries.some(entry=>entry.op.id===op.id))throw new TypeError('Guarded append requires original confirmed canonical input at journal end')
    const canonicalInput=this._prepareCanonicalInput(op,serverSeq,originalInput)
    if(entries.some(entry=>entry.state!=='done')){
      // Only the original complete baseline may account for existing hidden
      // frames. An arbitrary undone live journal still requires its own rebuild.
      const lifetime=originalInput.delivery.lifetime as Partial<import('./CanonicalRecordedDelivery').CanonicalRecordedEmptyRoomRead>
      if(!lifetime.assertFullHistoryBase||!lifetime.tailOperations)throw new TypeError('Guarded append requires an original full history for hidden frames')
      const full=lifetime.assertFullHistoryBase(lifetime.tailOperations),hidden=new Set(full.gestures.filter(g=>!g.visible).flatMap(g=>g.frameOperationIds))
      if(entries.some(entry=>entry.state!=='done'&&((entry.state!=='undone'&&entry.state!=='gone')||!hidden.has(entry.op.id)||entry.canonicalInput?.delivery.lifetime!==lifetime)))throw new TypeError('Guarded append cannot account for hidden frames')
    }
    const canonicalRead=this._prepareCanonicalReadAndInput(op,serverSeq,read,canonicalInput)
    const candidate=retainCanonicalInput({op:{...op,seq:length},state:'done',serverSeq,canonicalRead},canonicalInput)
    const counts=new Map(this._pixelOpDoneCount),layerId=op.layerId
    if(op.type==='canonical_stroke')counts.set(layerId,(counts.get(layerId)??0)+1)
    const fresh=op.type==='canonical_stroke'&&!entries.some(entry=>entry.op.type==='canonical_stroke'&&entry.op.userId===op.userId&&entry.op.frame.strokeId===op.frame.strokeId)
    const nextEntries=entries.map(entry=>{
      if(!fresh||entry.op.type!=='canonical_stroke'||entry.op.userId!==op.userId)return entry
      const state=canonicalStateAfter(entry.state,'new-own-gesture')
      return state===entry.state?entry:copyLogEntry(entry,{state})
    }),overtaken:LogEntry[]=[]
    nextEntries.push(candidate)
    assertJournal()
    if(beforePublish()!==undefined)throw new TypeError('Publication validator must be synchronous and return undefined')
    assertJournal()
    // All copies, authority callbacks and count derivation finished above.
    this._entries=nextEntries
    this._revision=revision+1
    this._confirmedCount=confirmed+1
    this._nextSeq=nextSeq+1
    this._pixelOpDoneCount=counts
    return overtaken
  }

  /** (#537) The server has ordered one of this client's pending operations at
   *  `serverSeq`: moves it out of the pending tail to its place in the
   *  confirmed region. Returns the entry's operation and the entries it moved
   *  below, or null when there is nothing to confirm — an id that was never
   *  pending here, was already confirmed (the ack and the broadcast both
   *  report it), or was coalesced into a later entry. */
  confirm(opId: string, serverSeq: number, read?: CanonicalLogRead, input?:CanonicalRecordedInput): { op: Operation; overtaken: LogEntry[] } | null {
    const existing = read||input ? this._entries.find(e => e.op.id === opId) : undefined
    if ((read||input) && !existing) throw new TypeError('Canonical read requires an existing history entry')
    if (existing && !existing.pending && existing.serverSeq !== serverSeq)
      throw new TypeError('Canonical confirmation sequence changed')
    const retainedInput=existing?canonicalInputOf(existing):undefined
    const canonicalInput=existing?this._prepareCanonicalInput(existing.op,serverSeq,input,retainedInput):undefined
    const canonicalRead = existing ? this._prepareCanonicalReadAndInput(existing.op, serverSeq, read,canonicalInput) : undefined
    this._revision++
    let from = -1
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      if (this._entries[i].op.id === opId) { from = i; break }
    }
    if (from === -1) {
      if(canonicalInput&&existing&&!retainedInput)retainCanonicalInput(existing,canonicalInput)
      if (canonicalRead && existing) {
        existing.canonicalRead = canonicalRead
      }
      return null
    }
    const [entry] = this._entries.splice(from, 1)
    const at = this._confirmedSlot(serverSeq)
    this._entries.splice(at, 0, entry)
    if(canonicalInput&&!retainedInput)retainCanonicalInput(entry,canonicalInput)
    entry.pending = false
    entry.serverSeq = serverSeq
    if (canonicalRead) entry.canonicalRead = canonicalRead
    this._confirmedCount++
    this._renumber(at, from + 1)
    return { op: entry.op, overtaken: this._entries.slice(at + 1, from + 1) }
  }

  /** (#537) Whether `opId` is one of this client's still-unconfirmed entries. */
  isPending(opId: string): boolean {
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      if (this._entries[i].op.id === opId) return true
    }
    return false
  }

  /** (#537) Whether any still-`done`, unconfirmed entry writes this layer's
   *  pixels — i.e. whether the layer shows something the room's own history
   *  does not have yet. O(pending tail). */
  hasPendingPixelOps(layerId: string): boolean {
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      const e = this._entries[i]
      if (e.state === 'done' && pixelWriteLayerIds(e.op).includes(layerId)) return true
    }
    return false
  }

  /** A local dry changes wet-state and canonical pixels on every layer.
   * It cannot be published under the watermark before its confirmation. */
  hasPendingPaperDry(): boolean {
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      const entry = this._entries[i]
      if (entry.state === 'done' && entry.op.type === 'paper_dry') return true
    }
    return false
  }

  /** Where a confirmed operation with this seq belongs: after every confirmed
   *  entry with a lower (or unknown) seq. Scans back from the region's end,
   *  which is where it almost always goes — the stream is ordered. */
  private _confirmedSlot(serverSeq: number | undefined): number {
    let at = this._confirmedCount
    if (serverSeq === undefined) return at
    while (at > 0) {
      const prevSeq = this._entries[at - 1].serverSeq
      if (prevSeq === undefined || prevSeq <= serverSeq) break
      at--
    }
    return at
  }

  /** Local seq is the array index; re-stamps [from, to) after a move. */
  private _renumber(from: number, to: number): void {
    for (let i = from; i < to; i++) {
      const e = this._entries[i]
      if (e.op.seq !== i) e.op = { ...e.op, seq: i }
    }
  }

  /** Read-only: the user's latest `done` op eligible for undo (excludes
   *  meta-ops — see META_OP_TYPES). Doesn't mutate anything — the caller
   *  (PencilEngine#undo, #103) wraps the result's id into a broadcastable
   *  `operation_undo` and applies it via `applyUndo()` below, so the
   *  author's own client converges through the exact same path as every
   *  peer instead of mutating state ahead of the network. */
  undoTarget(userId: string): Operation | null {
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i]
      if (e.state === 'done' && e.op.userId === userId && !META_OP_TYPES.has(e.op.type)) return e.op
    }
    return null
  }

  /** Read-only symmetric counterpart: the user's earliest `undone` op (undo
   *  always takes the highest-seq `done` entry, so a user's undone entries
   *  form a suffix of their history — the redo target is the lowest-seq
   *  one). */
  redoTarget(userId: string): Operation | null {
    for (const e of this._entries) {
      if (e.state === 'undone' && e.op.userId === userId && !META_OP_TYPES.has(e.op.type)) return e.op
    }
    return null
  }

  /** Flips one specific entry (addressed by id, not "whichever is latest")
   *  from `done` to `undone`. This is what every replica actually calls —
   *  the author's own client picked the id once via `undoTarget()` and
   *  broadcasts it in an `operation_undo`; every peer (and the author's own
   *  log, applied through the same `appendOperation` path) flips the exact
   *  same entry, so there's no scan to keep in sync across clients (#103).
   *  Guards `op.userId` against the target's own author: even without real
   *  auth (#41) yet, a client can never undo an op it didn't author. */
  applyUndo(targetOpId: string, userId: string): Operation | null {
    this._revision++
    const target = this._entries.find(e => e.op.id === targetOpId && e.state === 'done' && e.op.userId === userId)
    if (!target || target.op.type === 'canonical_stroke_close') return null
    for (const e of this._gestureEntries(target, 'done')) {
      e.state = e.op.type==='canonical_stroke'?canonicalStateAfter(e.state,'undo'):'undone'
      this._bumpPixelOpCount(e.op, -1)
    }
    return target.op
  }

  /** Every entry that belongs to the same gesture as `target` and is currently
   *  in `state` — which is just `[target]` for anything that isn't part of a
   *  multi-operation stroke.
   *
   *  A stroke longer than the engine's dab-chunk limit is recorded as several
   *  operations (see StrokeOperation.strokeId). They are one pen-down-to-pen-up
   *  movement as far as the person drawing is concerned, so one Ctrl+Z has to
   *  take all of them: otherwise a long line needs several presses and stands
   *  there cut short in between, and a marker one comes back seamed, since its
   *  chunks composite as a unit (see the engine's _replayMarkerChunk).
   *
   *  Resolved here rather than by broadcasting several operation_undo ops:
   *  every replica already applies the same single id through this method, so
   *  expanding the id to its gesture keeps them converging on exactly the same
   *  set with nothing added to the wire. Strokes recorded before strokeId
   *  existed carry none, and undo one operation at a time as they always did. */
  private _gestureEntries(target: LogEntry, state: OperationState): LogEntry[] {
    const { op } = target
    const strokeId = op.type === 'stroke' ? op.strokeId : op.type === 'canonical_stroke' ? op.frame.strokeId : undefined
    if (!strokeId) return [target]
    return this._entries.filter(e =>
      e.state === state && e.op.type === op.type && e.op.userId === op.userId && (e.op.type === 'stroke' ? e.op.strokeId : e.op.type === 'canonical_stroke' ? e.op.frame.strokeId : undefined) === strokeId)
  }

  /** (#520) Every layer the gesture `op` belongs to has pixels on — `op`'s own
   *  layer alone for anything that isn't part of a multi-operation stroke.
   *
   *  Whoever flips a gesture's state has to rebuild all of them, and until an
   *  eraser could go through layers that was the same thing as rebuilding one:
   *  a chunked stroke's operations all sit on the layer it was drawn on. A
   *  cross-layer erase is one gesture spread over several, so undoing it while
   *  rebuilding only the target's layer brings the ink back on that one layer
   *  and leaves every other one erased — with the log now saying the erase never
   *  happened anywhere, which the next rebuild of those layers would agree with.
   *  A picture that repairs itself only when something unrelated forces a
   *  rebuild is the worst version of this bug, so it is fixed at the source.
   *
   *  Reads entries in *any* state on purpose: the caller has already flipped
   *  them, and which side of the flip they are on says nothing about which
   *  layers need redrawing. */
  gestureLayerIds(op: Operation): string[] {
    const strokeId = op.type === 'stroke' ? op.strokeId : op.type === 'canonical_stroke' ? op.frame.strokeId : undefined
    // `typeof` and not just `in`: on the operations #412 gave a `layerIds`
    // list to, `layerId` is still declared, optional, and absent — so the
    // property test alone answers `string | undefined`.
    const own = 'layerId' in op && typeof op.layerId === 'string' ? [op.layerId] : []
    if (!strokeId) return own
    const ids = new Set(own)
    for (const e of this._entries) {
      if (e.op.type === op.type && e.op.userId === op.userId && (e.op.type === 'stroke' || e.op.type === 'canonical_stroke')
        && (e.op.type === 'stroke' ? e.op.strokeId : e.op.frame.strokeId) === strokeId) ids.add(e.op.layerId)
    }
    return [...ids]
  }

  /** Symmetric with `applyUndo`: undone → done for one specific entry. */
  applyRedo(targetOpId: string, userId: string): Operation | null {
    this._revision++
    const target = this._entries.find(e => e.op.id === targetOpId && (e.state === 'undone'||e.op.type==='canonical_stroke'&&e.state==='gone') && e.op.userId === userId)
    if (!target || target.op.type === 'canonical_stroke_close') return null
    const hidden=[...this._gestureEntries(target,'undone'),...(target.op.type==='canonical_stroke'?this._gestureEntries(target,'gone'):[])]
    for (const e of hidden) {
      if(e.state==='done')continue
      e.state = e.op.type==='canonical_stroke'?canonicalStateAfter(e.state,'redo'):'done'
      this._bumpPixelOpCount(e.op, 1)
    }
    return target.op
  }

  /** Convenience: find-then-flip in one call, for callers that don't need
   *  the id split out (e.g. direct, non-networked use of the log). Not used
   *  by PencilEngine's undo()/redo() (#103) — those need the id up front to
   *  build the broadcastable operation, and apply it via `applyUndo`/
   *  `applyRedo` like any other operation. */
  undo(userId: string): Operation | null {
    const target = this.undoTarget(userId)
    return target ? this.applyUndo(target.id, userId) : null
  }

  /** Convenience counterpart to `undo()` — see its docstring. */
  redo(userId: string): Operation | null {
    const target = this.redoTarget(userId)
    return target ? this.applyRedo(target.id, userId) : null
  }

  /** Privileged removal of someone else's operation (teacher). The target goes
   *  straight to `gone` — no redo, the author's own undo stack is untouched. */
  revoke(targetOpId: string): Operation | null {
    this._revision++
    for (const e of this._entries) {
      if (e.op.id === targetOpId && e.op.type !== 'canonical_stroke_close' && e.state !== 'gone') {
        // Only a still-`done` entry was ever counted (an `undone` one
        // already wasn't) — revoking that one is the only case that changes
        // the count.
        if (e.state === 'done') this._bumpPixelOpCount(e.op, -1)
        e.state = 'gone'
        return e.op
      }
    }
    return null
  }

  /** Prepends already-resolved historical entries — #169's background
   *  backfill of pre-snapshot history, older than the live tail applied right
   *  after a network-snapshot restore. Not necessarily absent from it, though:
   *  a layer with no pixel snapshot gets its whole history in that tail
   *  (#372), so the caller drops whatever this log already holds (#536,
   *  §17.61) — this method trusts it and does not check. `entries` must arrive with correct
   *  done/undone/gone states already resolved — see
   *  engine/index.ts's absorbHistoricalOperations, the one caller, which
   *  builds them by replaying the historical ops through a scratch
   *  OperationLog's normal append/applyUndo/applyRedo/revoke so their
   *  states come from the exact same state machine live entries do.
   *
   *  Deliberately bypasses append()'s own logic entirely — in particular
   *  its "mark my undone entries gone" side effect, which is meant for a
   *  user genuinely taking a new action, not history arriving late. This
   *  is the reason this exists as its own method rather than teaching
   *  append() to insert: append() stays exactly as it is for every live
   *  call site, and this only ever runs on the background backfill path.
   *
   *  Renumbers every entry's local `seq` to its final array position
   *  afterward. `entries` arrives with its own independent local numbering
   *  (the scratch log's own counter also starts at 0) that would otherwise
   *  collide with this log's existing entries' numbering once merged —
   *  local seq has always meant "array index" (see append()), this keeps
   *  that invariant true across the splice. O(n) in the log's total size;
   *  fine for a background, few-times-per-session operation. */
  prependHistorical(entries: readonly LogEntry[], expectedEmptyRevision?: number, beforePublish?: () => undefined): void {
    if (beforePublish !== undefined && (typeof beforePublish !== 'function' || expectedEmptyRevision === undefined))
      throw new TypeError('A publication validator requires the empty-journal precondition')
    // Local publication precondition, NOT source/read authority. An initial
    // baseline may publish only into the SAME still-empty journal it captured.
    // Delivery validation below can call an original owner's lifetime callback.
    const assertExpectedJournal = () => {
      if (expectedEmptyRevision !== undefined && (!Number.isSafeInteger(expectedEmptyRevision)
        || expectedEmptyRevision < 0 || this._revision !== expectedEmptyRevision || this._entries.length !== 0))
        throw new Error('Historical baseline journal changed')
    }
    assertExpectedJournal()
    // Capture close metadata before splice; local op.seq is an array ordinal.
    let inputBasis:LogEntry[]|undefined
    entries = entries.map(entry => {
      const input=canonicalInputOf(entry)
      if(input)inputBasis??=[...this._entries]
      if(entry.pending&&input)throw new TypeError('Pending history cannot carry recorded authority')
      this._prepareCanonicalInput(entry.op,entry.serverSeq,input,undefined,inputBasis??this._entries)
      const copy=copyLogEntry(entry,entry.op.type==='canonical_stroke_close'?{op:captureCloseForPlacement(entry.op,entry.serverSeq)}:{},input)
      inputBasis?.push(copy)
      return copy
    })
    let prepared: readonly LogEntry[] = entries
    if (entries.some(entry => entry.canonicalRead||canonicalInputOf(entry)?.read)) {
      const basis: LogEntry[] = [...this._entries]
      prepared = entries.map(entry => {
        const read = this._prepareCanonicalReadAndInput(entry.op, entry.serverSeq, entry.canonicalRead,canonicalInputOf(entry), basis)
        const copy = copyLogEntry(entry,read?{canonicalRead:read}:{})
        basis.push(copy)
        return copy
      })
    }
    const incoming = [...prepared.map(entry => copyLogEntry(entry,{pending:false})), ...this._entries]
    // A repair may fill a hole inside the known snapshot prefix, rather than
    // merely prepend an older page. Original server order is authoritative;
    // legacy seq-less callers keep their established prepend contract.
    if (incoming.every(e => e.pending || e.serverSeq !== undefined)) {
      incoming.sort((a, b) => a.pending ? (b.pending ? 0 : 1) : b.pending ? -1 : a.serverSeq! - b.serverSeq!)
    }
    const merged = incoming.map((e, i) => copyLogEntry(e,{op:{...e.op,seq:i}}))
    // The guarded initial branch prepares counters too: publication must not
    // call an operation getter or authority callback after its final comparison.
    const initialPixelCounts = expectedEmptyRevision === undefined ? undefined : new Map<string, number>()
    if (initialPixelCounts) for (const {op, state} of merged) {
      if (state !== 'done' || !isPixelOperation(op)) continue
      const layerIds = op.type === 'layer_transform' ? op.transforms.map(t => t.layerId) : [op.layerId]
      for (const layerId of layerIds) initialPixelCounts.set(layerId, (initialPixelCounts.get(layerId) ?? 0) + 1)
    }
    // Recheck the caller-owned candidate AFTER original delivery callbacks.
    // The validator must finish with pure layer/context/job checks. It may
    // throw before publication; its own reentry cannot bypass the final CAS.
    if (beforePublish && beforePublish() !== undefined) throw new TypeError('Publication validator must be synchronous and return undefined')
    // No callbacks/copies remain between this comparison and publication.
    assertExpectedJournal()
    this._revision++
    this._entries = merged
    this._nextSeq = merged.length
    this._confirmedCount += entries.length
    if (initialPixelCounts) this._pixelOpDoneCount = initialPixelCounts
    else for (const e of entries) {
      if (e.state === 'done') this._bumpPixelOpCount(e.op, 1)
    }
  }

  /** All `done` operations in seq order. */
  doneOperations(): Operation[] {
    const out: Operation[] = []
    for (const e of this._entries) {
      if (e.state === 'done') out.push(e.op)
    }
    return out
  }

  /** `done` pixel operations targeting the given layer, optionally only those
   *  ordered strictly before `beforeSeq` (used to reconstruct a merge source
   *  as it was at merge time). */
  layerPixelOps(layerId: string, beforeSeq?: number): PixelOperation[] {
    const out: PixelOperation[] = []
    for (const e of this._entries) {
      if (e.state !== 'done') continue
      const { op } = e
      if (!isPixelOperation(op) || !pixelOpTargetsLayer(op, layerId)) continue
      if (beforeSeq !== undefined && (op.seq ?? 0) >= beforeSeq) continue
      out.push(op)
    }
    return out
  }
}
