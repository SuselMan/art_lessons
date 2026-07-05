import { nanoid } from 'nanoid'
import type { PaperType, Dab, ToolType, Operation, LayerMergeOperation } from '@art-lessons/shared'
import { DAB_VERT, DAB_FRAG, DISPLAY_VERT, DISPLAY_FRAG, LAYER_COMPOSITE_FRAG } from './src/shaders'
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/utils'
import { createPaperTexture } from './src/PaperTexture'
import { AccumulationBuffer } from './src/AccumulationBuffer'
import { DabSystem } from './src/DabSystem'
import { OperationLog, type PixelOperation } from './src/OperationLog'
import { PointerInput, type PointerData } from './src/PointerInput'
import { PENCIL_PRESETS, PENCIL_GRADES, isPencilGrade, type PencilGradeName, type PencilPreset } from './src/pencilPresets'

export { PENCIL_PRESETS, PENCIL_GRADES, type PencilGradeName, type PencilPreset }

// ─── Public types ──────────────────────────────────────────────────────────────

export interface CompositeItem {
  id: string
  opacity: number
}

export interface PencilEngineOptions {
  paper?: PaperType
  pencilType?: string
  size?: number
  opacity?: number
  paperScale?: number
  graphiteColor?: [number, number, number]
  userId?: string
  // Fired for operations genuinely originated by this engine instance: both
  // appendOperation(op) calls made with the default 'local' source (layer-panel
  // actions, clear()) and the stroke recorded internally on pointer up. Never
  // fired for 'remote' appends. Lets the caller (Room) broadcast local actions
  // over the socket from one place instead of every local call site having to
  // remember to.
  onLocalOperation?: (op: Operation) => void
  // When true, tracks per-stroke input/render timing (real pointermove/
  // coalesced-event count and gaps, WebGL paint duration) and reports it via
  // onStrokeDebugStats after each stroke. Off by default — the timing calls
  // themselves have a small cost, so this must not run during normal use.
  // Diagnostic only, for device performance investigation (e.g. #91).
  debug?: boolean
  onStrokeDebugStats?: (stats: StrokeDebugStats) => void
  // Speculative preview of PointerEvent.getPredictedEvents() samples (#92):
  // when true, forecasted dabs are painted into a separate, stroke-scoped
  // preview buffer that's blended on top of the real composite in
  // _display() — purely visual, to reduce perceived pen lag on devices with
  // a low pointer-sampling rate. Predictions are fed through a non-mutating
  // fork of the live DabSystem (DabSystem.forkForPreview()) and are never
  // appended to _strokeDabs / the recorded Operation and never reach
  // onLocalOperation — a wrong prediction must never corrupt this user's
  // stroke history or be broadcast to peers. Off by default: mirrors the
  // `debug` option's guard pattern exactly, so this is zero-cost when off
  // (PointerInput never even calls getPredictedEvents() unless this is
  // enabled — see the constructor).
  predictPointer?: boolean
  // Live-tip segment preview (#104): paints the newest not-yet-tangent-
  // finalized segment immediately, using an extrapolated tangent, into a
  // small stroke-scoped scratch buffer that's cleared and repainted on
  // every real move (DabSystem.peekTipDabs()) — rather than always waiting
  // for the *next* real event to supply a proper tangent (DabSystem's
  // normal "1-event lag", see its file-level comment). Unlike
  // predictPointer, this never guesses a future *position* — both
  // endpoints of the previewed segment are real, already-sampled points;
  // only the curvature at the tip is an estimate, and it's fully replaced
  // (never left behind, never double-inked — see AccumulationBuffer's
  // "over" blend) once the next real point arrives and the same segment is
  // painted for real into the layer's own buffer. On by default — real-
  // hardware feel-testing (Samsung Galaxy Tab S7+, Surface Pro) confirmed
  // it reduces felt lag without the misdraw risk predictPointer had, so
  // unlike predictPointer this graduated straight to the default rather
  // than staying behind a Settings toggle. Kept as an explicit option
  // (rather than hardcoded) only so it can still be forced off if a future
  // device shows a regression.
  liveTipSegment?: boolean
}

export interface StrokeDebugStats {
  moveEvents: number      // real pointer samples (post-getCoalescedEvents) in this stroke
  durationMs: number      // wall-clock stroke length, pointerdown to pointerup
  avgGapMs: number        // average time between consecutive move samples
  maxGapMs: number        // largest gap between consecutive move samples (spikes = stalls/drops)
  dabCount: number        // dabs painted this stroke
  renderMsTotal: number   // total time spent in _paintDabs + _display across the stroke
  avgRenderMsPerDab: number
  // #104: real end-to-end latency, PointerEvent.timeStamp of the sample
  // whose position was just painted → performance.now() right after that
  // paint. Always reflects DabSystem's normal 1-event-lag path (the
  // committed segment painted into the real layer buffer), regardless of
  // liveTipSegment.
  avgE2eLatencyMs: number
  maxE2eLatencyMs: number
  // #104: same measurement, but for the liveTipSegment scratch preview
  // (PointerEvent.timeStamp of the *current* sample → its own paint) — runs
  // roughly one inter-event gap below avgE2eLatencyMs/maxE2eLatencyMs,
  // since it skips the "wait for the next event's tangent" step entirely.
  // 0 if liveTipSegment was explicitly forced off.
  avgTipLatencyMs: number
  maxTipLatencyMs: number
}

type EngineEventName = 'strokeStart' | 'strokeEnd' | 'pointer'
type EngineHandler = (data: PointerData) => void

// 'local' (default) — a genuinely local action; triggers onLocalOperation for
// broadcast. 'remote' — applying an operation that arrived from another
// participant (room_state replay, peer_operation); must not be re-broadcast.
export type OperationSource = 'local' | 'remote'

export interface PencilEngineAPI {
  initLayer(id: string): void
  setActiveLayer(id: string): void
  setLocked(locked: boolean): void
  setCompositeOrder(items: CompositeItem[]): void
  appendOperation(op: Operation, source?: OperationSource): void
  getOperations(): Operation[]
  undo(): Operation | null
  redo(): Operation | null
  clear(): void
  setUserId(id: string): void
  setPaper(type: PaperType): void
  setPencil(type: string): void
  setTool(tool: ToolType): void
  setOpacity(v: number): void
  setSize(px: number): void
  setViewport(cx: number, cy: number, zoom: number, angle: number): void
  on(event: EngineEventName, fn: EngineHandler): this
  exportPNG(): Promise<Blob | null>
  destroy(): void
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface EngineOpts {
  paper: PaperType
  pencilType: string
  size: number
  paperScale: number
  graphiteColor: [number, number, number]
  tool: ToolType
  opacity: number
}

// Pixel snapshot of a layer after its first `opIds.length` pixel operations.
// Valid only while those exact operations are still the layer's done prefix —
// checked at lookup time, so undo/redo never has to invalidate anything.
interface Checkpoint {
  layerId: string
  opIds: string[]
  pixels: Uint8Array
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAPER_COLORS: Record<PaperType, [number, number, number]> = {
  rough:   [0.96, 0.94, 0.90],
  smooth:  [0.97, 0.97, 0.96],
  bristol: [0.99, 0.99, 0.98],
}

// Drives how much the pencil itself "feels" the paper grain while drawing —
// see DAB_FRAG's normalScale/floor_/power (shaders.ts), all mix()'d by this
// over a 0..1 range (0 = bristol-like uniform fill, 1 = max tooth) —
// independent of PaperTexture.ts's CONFIGS, which only shape how the blank
// paper looks.
//
// Careful: below ~0.02 this range is visually flat — mix(2.0,10.0,r) etc.
// are already within a couple percent of their r=0 floor there, so e.g.
// 0.0001 vs 0.002 vs 0.02 all look identical. Stay above that if a tier is
// meant to have *some* perceptible tooth; use 0 outright for "none".
//
// Third follow-up: current bristol is the new reference for "roughest" —
// but bristol's old value (0.002) was already deep in that flat zone, i.e.
// functionally "no tooth". So the honest reading of "make rough feel like
// that" is: give rough a small-but-actually-perceptible tooth (not the old
// number verbatim, which wouldn't read as anything), and drop smooth/
// bristol to barely-there / none.
const PAPER_ROUGHNESS: Record<PaperType, number> = {
  rough:   0.05,
  smooth:  0.02,
  bristol: 0,
}

// Undo depth is bounded by the log, not by memory: checkpoints only shorten the
// replay tail. Interval/budget are starting points to be tuned by measurement (#76).
const CHECKPOINT_INTERVAL = 20
const CHECKPOINT_BUDGET_BYTES = 256 * 1024 * 1024

// ─── Engine ────────────────────────────────────────────────────────────────────

export class PencilEngine implements PencilEngineAPI {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private _opts: EngineOpts
  private _userId: string
  private _onLocalOperation?: (op: Operation) => void

  // Debug instrumentation (#91 device investigation) — all no-ops unless
  // _debug is true, so this costs nothing in normal use.
  private _debug: boolean
  private _onStrokeDebugStats?: (stats: StrokeDebugStats) => void
  private _dbgMoveEvents = 0
  private _dbgStrokeStart = 0
  private _dbgLastMoveT = 0
  private _dbgGapSum = 0
  private _dbgMaxGap = 0
  private _dbgDabCount = 0
  private _dbgRenderMs = 0
  // #104 end-to-end latency tracking — see StrokeDebugStats' avgE2eLatencyMs.
  private _dbgPrevMoveTimestamp = 0
  private _dbgE2eSum = 0
  private _dbgE2eCount = 0
  private _dbgMaxE2e = 0
  private _dbgTipSum = 0
  private _dbgTipCount = 0
  private _dbgMaxTip = 0

  // Pointer-prediction preview (#92) — all no-ops unless _predictPointer is
  // true. _previewBuf is a dedicated, stroke-scoped AccumulationBuffer (not
  // any layer's real buffer): created on stroke start, repainted from scratch
  // on every real move, and destroyed on stroke end, so a wrong prediction
  // never survives past the stroke it was guessed for and never touches
  // permanent pixel state.
  private _predictPointer: boolean
  private _previewBuf: AccumulationBuffer | null = null

  // Live-tip segment preview (#104) — all no-ops unless _liveTip is true.
  // _tipBuf is a dedicated, stroke-scoped AccumulationBuffer, same lifecycle
  // pattern as _previewBuf: created on stroke start, cleared and repainted
  // from scratch on every real move (never accumulated), destroyed on stroke
  // end. See DabSystem.peekTipDabs() and _refreshTip() below.
  private _liveTip: boolean
  private _tipBuf: AccumulationBuffer | null = null

  // WebGL programs and uniforms — assigned in _initGL()
  private _dabProg!: WebGLProgram
  private _dispProg!: WebGLProgram
  private _compositeProg!: WebGLProgram
  private _dabUni!: Record<string, WebGLUniformLocation | null>
  private _dispUni!: Record<string, WebGLUniformLocation | null>
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _quadBuf!: WebGLBuffer
  private _screenBuf!: WebGLBuffer
  private _compositeFBO!: AccumulationBuffer

  // Paper texture — assigned in _initPaper()
  private _paperTex!: WebGLTexture

  // Layer management
  private _layers: Map<string, AccumulationBuffer>
  private _baseLayerIds: Set<string> // pre-log layers (background, initial layer)
  private _compositeOrder: CompositeItem[]
  private _activeId: string | null
  private _locked: boolean

  // Operation log — source of truth; buffers and checkpoints are derived caches
  private _log: OperationLog
  private _checkpoints: Checkpoint[]
  private _checkpointBytes: number

  // In-flight stroke, recorded as one StrokeOperation on pointer up
  private _strokeLayerId: string | null
  private _strokeTool: ToolType
  private _strokePreset: string
  private _strokeDabs: Dab[]

  private _handlers: Partial<Record<EngineEventName, EngineHandler>>
  private _raf: number
  private _pointer: PointerInput
  private _dabs: DabSystem

  constructor(canvas: HTMLCanvasElement, options: PencilEngineOptions = {}) {
    this.canvas = canvas

    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl

    this._opts = {
      paper:         options.paper         ?? 'rough',
      pencilType:    options.pencilType    ?? 'HB',
      size:          options.size          ?? 24,
      paperScale:    options.paperScale    ?? 1.0,
      graphiteColor: options.graphiteColor ?? [0.14, 0.14, 0.17],
      tool:          'pencil',
      opacity:       options.opacity       ?? 1.0,
    }
    this._userId = options.userId ?? 'local'
    this._onLocalOperation = options.onLocalOperation
    this._debug = options.debug ?? false
    this._onStrokeDebugStats = options.onStrokeDebugStats
    this._predictPointer = options.predictPointer ?? false
    this._liveTip = options.liveTipSegment ?? true

    this._initGL()
    this._initPaper(this._opts.paper)
    this._pointer = new PointerInput(canvas)
    this._dabs    = new DabSystem()

    this._layers          = new Map()
    this._baseLayerIds    = new Set()
    this._compositeOrder  = []
    this._activeId        = null
    this._locked          = false
    this._log             = new OperationLog()
    this._checkpoints     = []
    this._checkpointBytes = 0
    this._strokeLayerId   = null
    this._strokeTool      = 'pencil'
    this._strokePreset    = this._opts.pencilType
    this._strokeDabs      = []
    this._handlers        = {}

    this._pointer
      .on('start', e => this._onStart(e))
      .on('move',  e => this._onMove(e))
      .on('end',   e => this._onEnd(e))

    // Only registered when enabled — PointerInput never calls
    // getPredictedEvents() unless a 'predict' handler exists (see
    // PointerInput._handleMove), so this is zero-cost when off.
    if (this._predictPointer) {
      this._pointer.onPredict(samples => this._onPredict(samples))
    }

    this._raf = requestAnimationFrame(() => this._display())
  }

  // ─── Layer API ───────────────────────────────────────────────────────────────

  /** Registers a pre-log base layer (background, initial layer). Layers created
   *  during the session enter through `layer_add` / `layer_merge` operations. */
  initLayer(id: string): void {
    this._baseLayerIds.add(id)
    this._createBuffer(id)
  }

  setActiveLayer(id: string): void {
    this._activeId = id
  }

  setLocked(locked: boolean): void {
    this._locked = locked
  }

  setCompositeOrder(items: CompositeItem[]): void {
    this._compositeOrder = items
    this._display()
  }

  // ─── Operation log API ───────────────────────────────────────────────────────

  /** Appends any externally built operation — from the layer panel, or from
   *  another participant once #31/network wiring lands (`peer_operation` /
   *  `room_state.operations`, see `packages/shared`) — and applies its
   *  pixel/buffer side effects. This *is* #33's `applyOperation`: every
   *  `Operation` variant is handled generically here regardless of who
   *  authored it or where it came from, so a hand-built op that simulates a
   *  peer's message applies exactly like one built locally. Local strokes are
   *  recorded internally on pointer up and must not be passed here.
   *
   *  This method only maintains pixel/buffer state. The structural half
   *  (LayerState: which layers/folders exist, their order, opacity, etc.) is
   *  a pure derivation from `getOperations()` — see `replayLayerState` /
   *  `applyContentOp` in `lib/layers.ts`, which is equally origin-agnostic —
   *  and is re-run by the caller after appending (see Room's `syncFromLog`).
   *
   *  Ops that reference a not-yet-known layer/folder id (e.g. a `stroke`
   *  before its `layer_add`, or a `layer_merge` source with no buffer) are
   *  silently skipped rather than throwing: correctness here assumes the log
   *  is applied in its true total order (the server-assigned `seq`), which
   *  ordered delivery guarantees; out-of-order delivery is a transport
   *  concern for the networking layer, not this method.
   *
   *  `source` (default 'local') controls whether `onLocalOperation` fires
   *  after applying — see `PencilEngineOptions.onLocalOperation`. Callers
   *  applying a `room_state` snapshot or a `peer_operation` must pass
   *  'remote' so the op is not echoed back to the server. */
  appendOperation(op: Operation, source: OperationSource = 'local'): void {
    this._log.append(op)
    switch (op.type) {
      case 'layer_add':
        this._createBuffer(op.layerId)
        break
      case 'layer_delete':
        for (const id of op.layerIds) this._destroyBuffer(id)
        this._display()
        break
      case 'layer_clear': {
        const clearBuf = this._layers.get(op.layerId)
        if (clearBuf) {
          clearBuf.clear()
          this._display()
        } else {
          // Target layer doesn't currently exist — e.g. this clear raced a
          // layer_delete/layer_merge over the network and lost (arrived
          // after, in true seq order). It had no visible effect just now and
          // never legitimately can: seq order can't later distinguish "was
          // in flight when deleted" from "authored after a resurrection", so
          // permanently revoke it rather than leaving it `done` — otherwise
          // it would silently reappear if the delete/merge is later undone
          // and this layer's buffer gets recreated and replayed (#101).
          this._log.revoke(op.id)
        }
        break
      }
      case 'layer_merge':
        this._execMergeLive(op)
        break
      case 'stroke': {
        const buf = this._layers.get(op.layerId)
        if (buf) {
          this._paintDabs(buf, op.dabs, op.tool, op.preset)
          this._maybeCheckpoint(op.layerId)
          this._display()
        } else {
          // See the layer_clear branch above: a pixel op with no live
          // target never had an effect and never legitimately can again —
          // revoke it so it can't resurface on a later undo (#101).
          this._log.revoke(op.id)
        }
        break
      }
      case 'operation_revoke': {
        const target = this._log.revoke(op.targetOpId)
        if (target) this._applyHistoryChange(target)
        break
      }
      // #103: broadcastable, addressed by id (not "whichever op is latest")
      // so every replica — including the author's own client, which applies
      // this exact same op rather than mutating ahead of the network —
      // converges on flipping the identical entry. See undo()/redo() below
      // for how the author picks `targetOpId`, and OperationLog.applyUndo/
      // applyRedo for the per-author guard.
      case 'operation_undo': {
        const target = this._log.applyUndo(op.targetOpId, op.userId)
        if (target) this._applyHistoryChange(target)
        break
      }
      case 'operation_redo': {
        const target = this._log.applyRedo(op.targetOpId, op.userId)
        if (target) this._applyHistoryChange(target)
        break
      }
      default:
        // structure-only (move/opacity/visibility/rename/folder_add):
        // the UI owns LayerState and pushes the new composite order itself
        break
    }
    if (source === 'local') this._onLocalOperation?.(op)
  }

  /** Done operations in seq order — the material for LayerState derivation. */
  getOperations(): Operation[] {
    return this._log.doneOperations()
  }

  /** Undoes this user's own latest done operation — and, unlike before #103,
   *  broadcasts it: wraps the target's id in an `operation_undo` and runs it
   *  through the normal `appendOperation` path (so `onLocalOperation` fires,
   *  same as any other local action), instead of mutating `_log` directly.
   *  That's what makes undo visible to every participant rather than just
   *  this client — a plain local mutation here would silently desync
   *  everyone else's canvas from this one. Returns the affected operation
   *  (e.g. the stroke), same contract as before. */
  undo(): Operation | null {
    const target = this._log.undoTarget(this._userId)
    if (!target) return null
    this.appendOperation({
      id: nanoid(10), type: 'operation_undo', userId: this._userId,
      timestamp: Date.now(), targetOpId: target.id,
    })
    return target
  }

  /** Symmetric with `undo()` — see its docstring. */
  redo(): Operation | null {
    const target = this._log.redoTarget(this._userId)
    if (!target) return null
    this.appendOperation({
      id: nanoid(10), type: 'operation_redo', userId: this._userId,
      timestamp: Date.now(), targetOpId: target.id,
    })
    return target
  }

  /** Clears the active layer — a logged, undoable operation. */
  clear(): void {
    const id = this._activeId
    if (!id || this._locked || !this._layers.has(id)) return
    this.appendOperation({
      id: nanoid(10), type: 'layer_clear', userId: this._userId,
      layerId: id, timestamp: Date.now(),
    })
  }

  /** Updates the identity used to scope undo/redo and to stamp the internally
   *  recorded local stroke (see `_onEnd`). Needed because the server assigns
   *  the real per-participant id (its socket id) only once the socket
   *  connects — after the engine (and any pre-connection local drawing) may
   *  already exist (#41 will replace this with real auth identity). */
  setUserId(id: string): void {
    this._userId = id
  }

  // ─── Tool API ────────────────────────────────────────────────────────────────

  setPaper(type: PaperType): void {
    this._opts.paper = type
    this._initPaper(type)
    this._display()
  }

  setPencil(type: string): void  { this._opts.pencilType = type }
  setTool(tool: ToolType): void  { this._opts.tool = tool }
  setOpacity(v: number): void    { this._opts.opacity = v }
  setSize(px: number): void      { this._opts.size = px }

  setViewport(cx: number, cy: number, zoom: number, angle: number): void {
    const { canvas } = this
    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)
    const hw  = canvas.width  / 2
    const hh  = canvas.height / 2
    this._pointer.setTransform((clientX, clientY) => {
      const dx = clientX - cx
      const dy = clientY - cy
      const rx = dx * cos - dy * sin
      const ry = dx * sin + dy * cos
      return { x: rx / zoom + hw, y: ry / zoom + hh }
    })
  }

  on(event: EngineEventName, fn: EngineHandler): this {
    this._handlers[event] = fn
    return this
  }

  exportPNG(): Promise<Blob | null> {
    this._display()
    return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'))
  }

  destroy(): void {
    cancelAnimationFrame(this._raf)
    this._pointer.destroy()
    this._layers.forEach(buf => buf.destroy())
    this._compositeFBO.destroy()
    this._previewBuf?.destroy()
    this._previewBuf = null
    this._tipBuf?.destroy()
    this._tipBuf = null
    this._checkpoints = []
    this._checkpointBytes = 0
  }

  // ─── History / replay ────────────────────────────────────────────────────────

  /** Re-syncs pixel state after `op` flipped between done and undone/gone. */
  private _applyHistoryChange(op: Operation): void {
    switch (op.type) {
      case 'stroke':
      case 'layer_clear':
        this._rebuildLayer(op.layerId)
        break
      case 'layer_add':
      case 'layer_delete':
      case 'layer_merge':
        this._syncBuffersToLog()
        break
      default:
        // structure-only; the UI re-derives LayerState and pushes composite order
        break
    }
    this._display()
  }

  /** A buffer should exist iff the layer is alive in the done history: created
   *  (base init or a done layer_add/layer_merge) and not destroyed (listed in a
   *  done layer_delete or consumed as a done merge source). Ids are never
   *  reused, so no ordering analysis is needed. */
  private _syncBuffersToLog(): void {
    const created   = new Set(this._baseLayerIds)
    const destroyed = new Set<string>()
    for (const op of this._log.doneOperations()) {
      switch (op.type) {
        case 'layer_add':
          created.add(op.layerId)
          break
        case 'layer_merge':
          created.add(op.layerId)
          for (const s of op.sources) destroyed.add(s.id)
          break
        case 'layer_delete':
          for (const id of op.layerIds) destroyed.add(id)
          break
      }
    }
    for (const id of [...this._layers.keys()]) {
      if (!created.has(id) || destroyed.has(id)) this._destroyBuffer(id)
    }
    for (const id of created) {
      if (destroyed.has(id) || this._layers.has(id)) continue
      this._createBuffer(id)
      this._rebuildLayer(id)
    }
  }

  /** Restores a layer's buffer to replay state: nearest valid checkpoint plus
   *  the tail of its done pixel operations. */
  private _rebuildLayer(layerId: string): void {
    const buf = this._layers.get(layerId)
    if (!buf) return
    this._replayInto(buf, layerId, this._log.layerPixelOps(layerId))
  }

  private _replayInto(buf: AccumulationBuffer, layerId: string, ops: PixelOperation[]): void {
    let start = 0
    const cp = this._bestCheckpoint(layerId, ops)
    if (cp) {
      buf.restorePixels(cp.pixels)
      start = cp.opIds.length
    } else {
      buf.clear()
    }
    for (let i = start; i < ops.length; i++) this._applyPixelOp(buf, ops[i])
  }

  private _applyPixelOp(buf: AccumulationBuffer, op: PixelOperation): void {
    switch (op.type) {
      case 'stroke':
        this._paintDabs(buf, op.dabs, op.tool, op.preset)
        break
      case 'layer_clear':
        buf.clear()
        break
      case 'layer_merge':
        this._replayMergeInto(buf, op)
        break
    }
  }

  /** Replays a merge: rebuilds each source as it was just before the merge
   *  (done ops with lower seq) into a temp buffer and composites bottom→top
   *  with the opacities captured in the operation. Recursive when a source is
   *  itself a merge result. */
  private _replayMergeInto(buf: AccumulationBuffer, op: LayerMergeOperation): void {
    const { gl, canvas } = this
    buf.clear()
    for (const src of op.sources) {
      const temp = new AccumulationBuffer(gl, canvas.width, canvas.height)
      this._replayInto(temp, src.id, this._log.layerPixelOps(src.id, op.seq))
      this._compositeTextures([{ texture: temp.texture, opacity: src.opacity }], buf.fbo)
      temp.destroy()
    }
  }

  /** Live merge fast path: sources' buffers already hold replay state, so
   *  composite them directly instead of rebuilding. The immediate checkpoint
   *  spares the recursive source rebuild on any later undo above this layer. */
  private _execMergeLive(op: LayerMergeOperation): void {
    const { gl, canvas } = this
    const target = new AccumulationBuffer(gl, canvas.width, canvas.height)
    target.clear()
    const entries: Array<{ texture: WebGLTexture; opacity: number }> = []
    for (const s of op.sources) {
      const buf = this._layers.get(s.id)
      if (buf) entries.push({ texture: buf.texture, opacity: s.opacity })
    }
    this._compositeTextures(entries, target.fbo)
    this._layers.set(op.layerId, target)
    for (const s of op.sources) this._destroyBuffer(s.id)
    this._takeCheckpoint(op.layerId)
    this._display()
  }

  // ─── Checkpoints ─────────────────────────────────────────────────────────────

  private _maybeCheckpoint(layerId: string): void {
    const ops = this._log.layerPixelOps(layerId)
    if (ops.length > 0 && ops.length % CHECKPOINT_INTERVAL === 0) this._takeCheckpoint(layerId)
  }

  /** Snapshots the layer's current buffer, which must equal replay state of its
   *  done pixel ops (true at every call site: after live paint, live merge, or
   *  a replayed apply). Budgeted in bytes: eviction makes deep undo slower
   *  (longer replay), never impossible. */
  private _takeCheckpoint(layerId: string): void {
    const buf = this._layers.get(layerId)
    if (!buf) return
    const ops = this._log.layerPixelOps(layerId)
    if (!ops.length) return
    const pixels = buf.readPixels()
    this._checkpoints.push({ layerId, opIds: ops.map(o => o.id), pixels })
    this._checkpointBytes += pixels.byteLength
    while (this._checkpointBytes > CHECKPOINT_BUDGET_BYTES && this._checkpoints.length > 1) {
      const evicted = this._checkpoints.shift()
      if (evicted) this._checkpointBytes -= evicted.pixels.byteLength
    }
  }

  /** Deepest checkpoint whose baked operations are exactly the current done
   *  prefix of `ops` (compared by id — undone/redone/revoked ops shift the
   *  prefix and silently disqualify stale snapshots). */
  private _bestCheckpoint(layerId: string, ops: PixelOperation[]): Checkpoint | null {
    let best: Checkpoint | null = null
    for (const cp of this._checkpoints) {
      if (cp.layerId !== layerId) continue
      if (best && cp.opIds.length <= best.opIds.length) continue
      if (cp.opIds.length > ops.length) continue
      if (cp.opIds.every((id, i) => ops[i].id === id)) best = cp
    }
    return best
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _createBuffer(id: string): void {
    const { gl, canvas } = this
    if (this._layers.has(id)) return
    const buf = new AccumulationBuffer(gl, canvas.width, canvas.height)
    buf.clear()
    this._layers.set(id, buf)
  }

  private _destroyBuffer(id: string): void {
    const buf = this._layers.get(id)
    if (buf) {
      buf.destroy()
      this._layers.delete(id)
    }
  }

  private _initGL(): void {
    const { gl, canvas } = this

    this._dabProg       = createProgram(gl, DAB_VERT, DAB_FRAG)
    this._dispProg      = createProgram(gl, DISPLAY_VERT, DISPLAY_FRAG)
    this._compositeProg = createProgram(gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG)

    this._dabUni  = getUniforms(gl, this._dabProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
      'u_resolution', 'u_paperHeightMap', 'u_paperScale',
      'u_pressure', 'u_tiltX', 'u_tiltY', 'u_hardness', 'u_opacity',
      'u_paperRoughness', 'u_eraseMode',
    ])
    this._dispUni = getUniforms(gl, this._dispProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_graphiteColor', 'u_paperScale',
    ])
    this._compositeUni = getUniforms(gl, this._compositeProg, ['u_layer', 'u_opacity'])

    this._quadBuf   = createQuadBuffer(gl)
    this._screenBuf = createFullscreenQuad(gl)

    this._compositeFBO = new AccumulationBuffer(gl, canvas.width, canvas.height)
  }

  private _initPaper(type: PaperType): void {
    const { gl, canvas } = this
    if (this._paperTex) gl.deleteTexture(this._paperTex)
    this._paperTex = createPaperTexture(gl, type, canvas.width, canvas.height)
  }

  private get _physicalSize(): number {
    return this._opts.size * (this.canvas.width / (this.canvas.clientWidth || this.canvas.width))
  }

  // ─── Stroke input ────────────────────────────────────────────────────────────

  private _onStart(e: PointerData): void {
    if (this._locked) return
    const layerId = this._activeId
    if (!layerId || !this._layers.has(layerId)) return
    this._strokeLayerId = layerId
    this._strokeTool    = this._opts.tool
    this._strokePreset  = this._opts.pencilType
    this._strokeDabs    = []
    if (this._debug) {
      const now = performance.now()
      this._dbgMoveEvents = 0
      this._dbgStrokeStart = now
      this._dbgLastMoveT = now
      this._dbgGapSum = 0
      this._dbgMaxGap = 0
      this._dbgDabCount = 0
      this._dbgRenderMs = 0
      this._dbgPrevMoveTimestamp = e.timeStamp
      this._dbgE2eSum = 0
      this._dbgE2eCount = 0
      this._dbgMaxE2e = 0
      this._dbgTipSum = 0
      this._dbgTipCount = 0
      this._dbgMaxTip = 0
    }
    if (this._predictPointer) {
      this._previewBuf = new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height)
      this._previewBuf.clear()
    }
    if (this._liveTip) {
      this._tipBuf = new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height)
      this._tipBuf.clear()
    }
    const dabs = this._dabs.startStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
    this._paintStrokeDabs(dabs, e.speed)
    this._display()
    this._handlers.strokeStart?.(e)
  }

  private _onMove(e: PointerData): void {
    this._handlers.pointer?.(e)
    if (!this._strokeLayerId) return
    if (this._debug) {
      const now = performance.now()
      const gap = now - this._dbgLastMoveT
      this._dbgLastMoveT = now
      this._dbgMoveEvents++
      this._dbgGapSum += gap
      if (gap > this._dbgMaxGap) this._dbgMaxGap = gap
    }
    // #104: captured before continueStroke() so it reflects the *previous*
    // real sample — DabSystem's 1-event lag means the segment painted below
    // (if any) ends at that previous point, not at `e` (see continueStroke's
    // docstring). `e.timeStamp` itself is saved for the next call's use at
    // the bottom of this method.
    const prevMoveTimestamp = this._dbgPrevMoveTimestamp
    const dabs = this._dabs.continueStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
    let painted = false
    if (dabs.length) {
      const t0 = this._debug ? performance.now() : 0
      this._paintStrokeDabs(dabs, e.speed)
      painted = true
      if (this._debug) {
        const paintedAt = performance.now()
        this._dbgRenderMs += paintedAt - t0
        this._dbgDabCount += dabs.length
        const e2e = paintedAt - prevMoveTimestamp
        this._dbgE2eSum += e2e
        this._dbgE2eCount++
        if (e2e > this._dbgMaxE2e) this._dbgMaxE2e = e2e
      }
    }
    if (this._liveTip) {
      this._refreshTip(e.speed)
      painted = true
      if (this._debug) {
        const tipLatency = performance.now() - e.timeStamp
        this._dbgTipSum += tipLatency
        this._dbgTipCount++
        if (tipLatency > this._dbgMaxTip) this._dbgMaxTip = tipLatency
      }
    }
    if (painted) this._display()
    if (this._debug) this._dbgPrevMoveTimestamp = e.timeStamp
  }

  // Refreshes the live-tip scratch buffer (#104) with the newest segment's
  // provisional rendering — cleared and repainted from scratch every call
  // (never accumulated), same non-destructive pattern as _onPredict's
  // _previewBuf below, so a since-superseded tangent estimate never lingers
  // or double-inks the real buffer.
  private _refreshTip(speed: number): void {
    if (!this._tipBuf) return
    this._tipBuf.clear()
    const dabs = this._dabs.peekTipDabs(this._physicalSize)
    if (dabs.length) {
      this._bakeDabOpacity(dabs, speed)
      this._paintDabs(this._tipBuf, dabs, this._strokeTool, this._strokePreset)
    }
  }

  // Speculative pointer-prediction preview (#92). Fires at most once per
  // native pointermove, after the real move handler above has already run
  // for that event (see PointerInput._handleMove) — so `this._dabs` already
  // reflects the latest *real* point by the time we fork it here. Forks
  // fresh from the real DabSystem every call and discards the fork
  // afterwards: predicted points are fed through the fork's continueStroke
  // so they get the same spline/spacing treatment as real dabs, but the
  // fork's mutations (its own scratch `_buf`/`_remainder`) never reach the
  // real `this._dabs`. Painted into `_previewBuf` only — never into any
  // layer's real buffer, never appended to `_strokeDabs`, so predictions can
  // never reach the recorded Operation or onLocalOperation/broadcast.
  private _onPredict(samples: PointerData[]): void {
    if (!this._strokeLayerId || !this._previewBuf) return
    this._previewBuf.clear()
    if (!samples.length) { this._display(); return }

    const fork = this._dabs.forkForPreview()
    const dabs: Dab[] = []
    for (const s of samples) {
      dabs.push(...fork.continueStroke(s.x, s.y, s.pressure, s.tiltX, s.tiltY, this._physicalSize))
    }
    if (dabs.length) {
      this._bakeDabOpacity(dabs, samples[samples.length - 1].speed)
      this._paintDabs(this._previewBuf, dabs, this._strokeTool, this._strokePreset)
    }
    this._display()
  }

  private _onEnd(e: PointerData): void {
    const layerId = this._strokeLayerId
    if (!layerId) return
    const t0 = this._debug ? performance.now() : 0
    const dabs = this._dabs.endStroke(this._physicalSize)
    if (dabs.length) this._paintStrokeDabs(dabs, e.speed)
    // Discard the speculative preview entirely once the real stroke has
    // ended — the final _display() below must show only real content.
    if (this._previewBuf) {
      this._previewBuf.destroy()
      this._previewBuf = null
    }
    // Same for the live-tip scratch buffer: endStroke() above just painted
    // the exact same final segment (pixel-identical, same math minus the
    // `_remainder` mutation — see peekTipDabs()) into the real buffer, so
    // there is nothing left for the tip preview to show.
    if (this._tipBuf) {
      this._tipBuf.destroy()
      this._tipBuf = null
    }
    this._display()
    if (this._debug) {
      this._dbgRenderMs += performance.now() - t0
      this._dbgDabCount += dabs.length
      const durationMs = performance.now() - this._dbgStrokeStart
      this._onStrokeDebugStats?.({
        moveEvents:        this._dbgMoveEvents,
        durationMs,
        avgGapMs:          this._dbgMoveEvents > 0 ? this._dbgGapSum / this._dbgMoveEvents : 0,
        maxGapMs:          this._dbgMaxGap,
        dabCount:          this._dbgDabCount,
        renderMsTotal:     this._dbgRenderMs,
        avgRenderMsPerDab: this._dbgDabCount > 0 ? this._dbgRenderMs / this._dbgDabCount : 0,
        avgE2eLatencyMs:   this._dbgE2eCount > 0 ? this._dbgE2eSum / this._dbgE2eCount : 0,
        maxE2eLatencyMs:   this._dbgMaxE2e,
        avgTipLatencyMs:   this._dbgTipCount > 0 ? this._dbgTipSum / this._dbgTipCount : 0,
        maxTipLatencyMs:   this._dbgMaxTip,
      })
    }

    if (this._strokeDabs.length) {
      const op: Operation = {
        id: nanoid(10), type: 'stroke', userId: this._userId,
        layerId, tool: this._strokeTool, preset: this._strokePreset,
        dabs: this._strokeDabs, timestamp: Date.now(),
      }
      this._log.append(op)
      this._maybeCheckpoint(layerId)
      this._onLocalOperation?.(op)
    }
    this._strokeLayerId = null
    this._strokeDabs = []
    this._handlers.strokeEnd?.(e)
  }

  /** Bakes final dab opacity (preset × user opacity × speed) in place. Shared
   *  by the real stroke path and the #92 prediction preview, so predicted
   *  dabs render with visually consistent opacity to real ones. */
  private _bakeDabOpacity(dabs: Dab[], speed: number): void {
    const erasing     = this._strokeTool === 'eraser'
    const preset      = isPencilGrade(this._strokePreset) ? PENCIL_PRESETS[this._strokePreset] : PENCIL_PRESETS['HB']
    const speedFactor = Math.max(0.7, 1.0 - speed * 0.15)
    for (const dab of dabs) {
      dab.opacity = erasing
        ? this._opts.opacity
        : preset.opacity * this._opts.opacity * speedFactor
    }
  }

  /** Bakes final dab opacity, paints, and buffers the dabs for the
   *  StrokeOperation recorded on pointer up. Live strokes and replay share
   *  _paintDabs, so replay is pixel-identical. Real dabs only — #92's
   *  predicted dabs go through _onPredict → _previewBuf instead and must
   *  never reach this method (that's what keeps them out of _strokeDabs). */
  private _paintStrokeDabs(dabs: Dab[], speed: number): void {
    if (!dabs.length || !this._strokeLayerId) return
    const buf = this._layers.get(this._strokeLayerId)
    if (!buf) return

    this._bakeDabOpacity(dabs, speed)
    this._paintDabs(buf, dabs, this._strokeTool, this._strokePreset)
    this._strokeDabs.push(...dabs)
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  private _paintDabs(buf: AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string): void {
    const { gl, canvas } = this
    const erasing = tool === 'eraser'
    const preset  = isPencilGrade(presetName) ? PENCIL_PRESETS[presetName] : PENCIL_PRESETS['HB']

    if (erasing) {
      buf.beginErase()
    } else {
      buf.beginDraw()
    }

    gl.useProgram(this._dabProg)
    const u = this._dabUni

    gl.uniform2f(u.u_resolution, canvas.width, canvas.height)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.uniform1f(u.u_hardness, erasing ? 0.85 : preset.hardness)
    gl.uniform1f(u.u_paperRoughness, PAPER_ROUGHNESS[this._opts.paper] ?? 1.0)
    gl.uniform1f(u.u_eraseMode, erasing ? 1.0 : 0.0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    const posLoc = gl.getAttribLocation(this._dabProg, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    for (const dab of dabs) {
      gl.uniform2f(u.u_dabCenter, dab.x, dab.y)
      gl.uniform1f(u.u_dabRadius, dab.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier))
      gl.uniform1f(u.u_angle,      dab.angle)
      gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
      gl.uniform1f(u.u_pressure,   dab.pressure)
      gl.uniform1f(u.u_tiltX,      dab.tiltX)
      gl.uniform1f(u.u_tiltY,      dab.tiltY)
      gl.uniform1f(u.u_opacity,    dab.opacity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    buf.endDraw()
  }

  private _compositeTextures(
    items: Array<{ texture: WebGLTexture; opacity: number }>,
    targetFbo: WebGLFramebuffer,
  ): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, w, h)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this._compositeProg)
    const cu = this._compositeUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = gl.getAttribLocation(this._compositeProg, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    for (const { texture, opacity } of items) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(cu.u_layer, 0)
      gl.uniform1f(cu.u_opacity, opacity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private _runComposite(items: CompositeItem[], targetFbo: WebGLFramebuffer): void {
    const entries: Array<{ texture: WebGLTexture; opacity: number }> = []
    for (const { id, opacity } of items) {
      const buf = this._layers.get(id)
      if (buf) entries.push({ texture: buf.texture, opacity })
    }
    this._compositeTextures(entries, targetFbo)
  }

  private _display(): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._compositeFBO.fbo)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    this._runComposite(this._compositeOrder, this._compositeFBO.fbo)

    // #104 live-tip preview: blended in before the #92 preview below so the
    // (mutually-exclusive-in-practice, but not enforced) predicted preview
    // stays visually on top if both experiments are ever enabled together.
    // Same (ONE, ONE_MINUS_SRC_ALPHA) blend as AccumulationBuffer.beginDraw()
    // — visual only, never written into any layer's real buffer.
    if (this._tipBuf) {
      this._compositeTextures([{ texture: this._tipBuf.texture, opacity: 1 }], this._compositeFBO.fbo)
    }

    // #92 speculative preview: blended on top of the real composite, same
    // (ONE, ONE_MINUS_SRC_ALPHA) blend as AccumulationBuffer.beginDraw() —
    // visual only, never written into any layer's real buffer.
    if (this._previewBuf) {
      this._compositeTextures([{ texture: this._previewBuf.texture, opacity: 1 }], this._compositeFBO.fbo)
    }

    const paperColor    = PAPER_COLORS[this._opts.paper]
    const graphiteColor = this._opts.graphiteColor

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)

    gl.useProgram(this._dispProg)
    const u = this._dispUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._compositeFBO.texture)
    gl.uniform1i(u.u_accumulation, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperMap, 1)

    gl.uniform3fv(u.u_paperColor,    paperColor)
    gl.uniform3fv(u.u_graphiteColor, graphiteColor)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = gl.getAttribLocation(this._dispProg, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
}
