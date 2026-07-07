import { nanoid } from 'nanoid'
import type { PaperType, Dab, ToolType, Operation, StrokeOperation, LayerMergeOperation, ImageImportOperation } from '@art-lessons/shared'
import { DAB_VERT, DAB_VERT_INSTANCED, DAB_FRAG, DISPLAY_VERT, DISPLAY_FRAG, LAYER_COMPOSITE_FRAG, IMAGE_BLIT_FRAG, TRANSFORM_BLIT_FRAG } from './src/shaders'
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/utils'
import { createPaperTexture } from './src/PaperTexture'
import { AccumulationBuffer } from './src/AccumulationBuffer'
import { DabSystem } from './src/DabSystem'
import { OperationLog, type PixelOperation } from './src/OperationLog'
import { PointerInput, type PointerData } from './src/PointerInput'
import { PENCIL_PRESETS, PENCIL_GRADES, isPencilGrade, type PencilGradeName, type PencilPreset } from './src/pencilPresets'
import { HapticGrain, type HapticGrainStats } from './src/HapticGrain'
import { invertAffine, toMat3, type AffineMatrix } from './src/affine'

export type { HapticGrainStats }
export type { AffineMatrix }

export { PENCIL_PRESETS, PENCIL_GRADES, type PencilGradeName, type PencilPreset }

// Minimal surface of the ANGLE_instanced_arrays extension _paintDabsInstanced
// uses (#123) — not in lib.dom.d.ts's WebGLRenderingContext, so this is typed
// by hand instead of relying on an ambient DOM type.
interface InstancedArraysExt {
  vertexAttribDivisorANGLE(index: number, divisor: number): void
  drawArraysInstancedANGLE(mode: number, first: number, count: number, primcount: number): void
}

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
  // Fired once a peer's stroke reveal (previewOperation, #37 follow-up v2)
  // has finished playing back every dab — the caller must appendOperation it
  // ('remote') and re-sync derived state at that point, not on arrival, so
  // the log/layer-thumbnail state matches what's actually visible on screen.
  onPreviewApplied?: (op: StrokeOperation) => void
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
  // Experimental "for fun" prototype (see HapticGrain.ts) — vibrates in a
  // fixed hash-grid pattern over the paper as the stroke crosses it, to try
  // simulating paper grain via touch. Off by default; Android Chrome only.
  hapticGrain?: boolean
  onHapticGrainStats?: (stats: HapticGrainStats) => void
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
  setColor(rgb: [number, number, number]): void
  pickColor(canvasX: number, canvasY: number): [number, number, number] | null
  // Bounding box of a layer's actual painted content, canvas-pixel space —
  // see the implementation's docstring for cost/call-frequency notes (#120).
  getContentBounds(layerId: string): { x: number; y: number; width: number; height: number } | null
  setViewport(cx: number, cy: number, zoom: number, angle: number): void
  // Live gizmo-drag preview (#120): renders each layer's *current* content
  // through the given transform into a scratch buffer composited in place
  // of the real one — never mutates the real layer buffer. Call on every
  // drag frame; call clearLayerTransformPreview() once a real
  // `layer_transform` op has been appended (commit) or the drag is
  // abandoned (cancel).
  previewLayerTransform(transforms: Array<{ layerId: string; matrix: AffineMatrix }>): void
  clearLayerTransformPreview(): void
  // Live remote-stroke reveal (#37 follow-up v2): call when a peer's finished
  // StrokeOperation arrives. Plays its dabs back into a dedicated per-peer
  // preview buffer (composited on top in _display(), never written into any
  // real layer) at their original recorded pacing (Dab.t), queueing if that
  // peer already has one in flight. Fires onPreviewApplied with the exact
  // same op once every dab has played, so the caller can commit it for real.
  previewOperation(op: StrokeOperation): void
  // Cancels a specific peer stroke's reveal *animation* before it's fully
  // played — used when an operation_undo/operation_revoke targets it before
  // it ever finished appearing, so its reveal is skipped rather than run to
  // completion first. Returns the operation itself (or null if it wasn't
  // pending): the caller must still appendOperation it immediately, right
  // before the undo/revoke that targets it — dropping the data outright
  // would leave a later redo with nothing to restore.
  dropPendingPreview(opId: string): StrokeOperation | null
  // Cancels a peer's in-flight reveal without discarding data (peer_left):
  // returns their still-pending ops, in order, so the caller can
  // appendOperation each immediately instead of losing the peer's last
  // stroke(s) because they left mid-reveal.
  flushPeerPreview(peerId: string): StrokeOperation[]
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

// One peer's live-stroke reveal state (#37 follow-up v2, see
// PencilEngineAPI.previewOperation). `queue[0]` is the op currently being
// revealed; `dabIdx` is how many of its dabs have been painted into `buf` so
// far; `startTime` is performance.now() when that op's reveal began, the
// reference point Dab.t is measured against. Scheduled with setTimeout, not
// requestAnimationFrame: rAF fully stops firing in a hidden/backgrounded tab
// (e.g. a student who alt-tabbed away), which would leave the underlying
// operation permanently uncommitted — since onPreviewApplied only fires once
// the reveal finishes — until they come back. setTimeout is still throttled
// while hidden but never fully suspended, so the reveal (and the commit
// after it) always eventually completes regardless of tab visibility.
interface PeerPreviewState {
  queue: StrokeOperation[]
  buf: AccumulationBuffer
  dabIdx: number
  startTime: number
  timer: ReturnType<typeof setTimeout> | null
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

export const DEFAULT_GRAPHITE_COLOR: [number, number, number] = [0.14, 0.14, 0.17]

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
  private _onPreviewApplied?: (op: StrokeOperation) => void

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

  // Haptic grain experiment (see HapticGrain.ts) — null unless opted in.
  private _haptic: HapticGrain | null
  private _hapticX = 0
  private _hapticY = 0

  // Live remote-stroke reveal (#37 follow-up v2) — one dedicated preview
  // AccumulationBuffer + FIFO queue of not-yet-committed StrokeOperations per
  // peer, keyed by userId. Never accumulated into any real layer: the queue
  // head's dabs are painted progressively at their recorded pacing (Dab.t)
  // by _stepPeerPreview, and only handed to onPreviewApplied — for the
  // caller to actually commit — once every dab has played. See
  // previewOperation/dropPendingPreview/flushPeerPreview below.
  private _peerPreviews = new Map<string, PeerPreviewState>()

  // WebGL programs and uniforms — assigned in _initGL()
  private _dabProg!: WebGLProgram
  private _dispProg!: WebGLProgram
  private _compositeProg!: WebGLProgram
  private _blitProg!: WebGLProgram
  private _transformProg!: WebGLProgram
  private _dabUni!: Record<string, WebGLUniformLocation | null>
  private _dispUni!: Record<string, WebGLUniformLocation | null>
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _blitUni!: Record<string, WebGLUniformLocation | null>
  private _transformUni!: Record<string, WebGLUniformLocation | null>
  private _dabPosLoc!: number
  private _dispPosLoc!: number
  private _compositePosLoc!: number
  private _blitPosLoc!: number
  private _transformPosLoc!: number
  private _quadBuf!: WebGLBuffer
  private _screenBuf!: WebGLBuffer
  private _compositeFBO!: AccumulationBuffer

  // Batched dab rendering (#123) — one instanced draw call per _paintDabs
  // invocation instead of one gl.drawArrays + ~9 gl.uniform* calls per dab.
  // _instancedArraysExt is null on the (today, vanishingly rare) WebGL1
  // context without ANGLE_instanced_arrays, in which case _paintDabs falls
  // back to the original per-dab-uniform loop via _dabProg/DAB_VERT
  // unchanged. See _paintDabsInstanced for the correctness reasoning re:
  // preserving sequential per-dab blend order.
  private _dabProgInstanced!: WebGLProgram
  private _dabInstUni!: Record<string, WebGLUniformLocation | null>
  private _instPosLoc!: number
  private _instALoc!: number
  private _instBLoc!: number
  private _instOpacityLoc!: number
  private _dabInstBuf!: WebGLBuffer
  private _instancedArraysExt: InstancedArraysExt | null = null
  // Reused/grown scratch buffer for the per-dab instance data upload — no
  // per-stroke-segment allocation, same pattern as DabSystem's #125 fix.
  private _dabInstScratch: Float32Array = new Float32Array(0)

  // Live layer-transform gizmo preview (#120) — one scratch buffer per
  // layer currently being dragged, keyed by layerId. Same non-destructive
  // pattern as _previewBuf/_tipBuf: the real layer buffer is never touched
  // until the gizmo is released and a real layer_transform op lands via
  // appendOperation — _runComposite substitutes these in for their layerId
  // while present. See previewLayerTransform/clearLayerTransformPreview.
  private _transformPreview = new Map<string, AccumulationBuffer>()

  // Reference-image import (#88) — keyed by the op's own data URL, so
  // replaying the same room twice (e.g. undo/redo rebuilding a layer) never
  // redecodes an image it's already decoded once this session.
  private _imageCache = new Map<string, HTMLImageElement>()

  // Paper texture — assigned in _initPaper()
  private _paperTex!: WebGLTexture

  // Layer management
  private _layers: Map<string, AccumulationBuffer>
  private _baseLayerIds: Set<string> // pre-log layers (background, initial layer)
  private _compositeOrder: CompositeItem[]
  private _activeId: string | null
  private _locked: boolean

  // WebGL context loss (#121) — true between webglcontextlost and
  // webglcontextrestored. Only gates _takeCheckpoint (see there for why);
  // everything else is a harmless no-op on a lost context per spec.
  private _contextLost = false

  // Operation log — source of truth; buffers and checkpoints are derived caches
  private _log: OperationLog
  private _checkpoints: Checkpoint[]
  private _checkpointBytes: number

  // In-flight stroke, recorded as one StrokeOperation on pointer up
  private _strokeLayerId: string | null
  private _strokeTool: ToolType
  private _strokePreset: string
  private _strokeColor: [number, number, number]
  private _strokeDabs: Dab[]
  private _strokeStartTimestamp = 0 // PointerEvent.timeStamp at stroke start — Dab.t is elapsed since this

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

    this.canvas.addEventListener('webglcontextlost', this._handleContextLost)
    this.canvas.addEventListener('webglcontextrestored', this._handleContextRestored)

    this._opts = {
      paper:         options.paper         ?? 'rough',
      pencilType:    options.pencilType    ?? 'HB',
      size:          options.size          ?? 24,
      paperScale:    options.paperScale    ?? 1.0,
      graphiteColor: options.graphiteColor ?? DEFAULT_GRAPHITE_COLOR,
      tool:          'pencil',
      opacity:       options.opacity       ?? 1.0,
    }
    this._userId = options.userId ?? 'local'
    this._onLocalOperation = options.onLocalOperation
    this._onPreviewApplied = options.onPreviewApplied
    this._debug = options.debug ?? false
    this._onStrokeDebugStats = options.onStrokeDebugStats
    this._predictPointer = options.predictPointer ?? false
    this._liveTip = options.liveTipSegment ?? true
    this._haptic = options.hapticGrain ? new HapticGrain(10, 0.35, 16, options.onHapticGrainStats, 40) : null

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
    this._strokeColor     = this._opts.graphiteColor
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
          this._paintDabs(buf, op.dabs, op.tool, op.preset, op.color)
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
      case 'image_import': {
        const buf = this._layers.get(op.layerId)
        if (buf) {
          this._paintImage(buf, op).then(() => this._maybeCheckpoint(op.layerId))
            .catch(err => console.error('failed to paint imported image', err))
        } else {
          this._log.revoke(op.id)
        }
        break
      }
      case 'layer_transform': {
        // Unlike stroke/clear above, a missing target here doesn't
        // necessarily mean the whole op had no effect — one operation can
        // touch several layers (#120), so only revoke if *none* of them
        // exist; individual missing entries (e.g. a layer deleted
        // concurrently) are just skipped, same reasoning as image_import's
        // per-layer check applied per-entry instead of per-op.
        let appliedAny = false
        for (const t of op.transforms) {
          const buf = this._layers.get(t.layerId)
          if (!buf) continue
          this._bakeTransform(buf, t.matrix)
          this._maybeCheckpoint(t.layerId)
          appliedAny = true
        }
        if (appliedAny) this._display()
        else this._log.revoke(op.id)
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

  // Only the *next* stroke picks this up — _onStart() copies it into
  // _strokeColor, which gets baked into that stroke's dabs (and its recorded
  // StrokeOperation), so changing it never repaints already-drawn strokes.
  setColor(rgb: [number, number, number]): void { this._opts.graphiteColor = rgb }

  /** Samples the currently-displayed pixel color at canvas-pixel coordinates
   *  (same space as Dab.x/y — see pointerTransform.ts's clientToCanvas), for
   *  an eyedropper tool. Reads whatever's actually on screen (paper or
   *  graphite, post-composite) via the default framebuffer, which _display()
   *  always leaves bound to the real canvas after its last draw call — so
   *  this only gives a meaningful result once at least one frame has been
   *  displayed. Returns null for out-of-bounds coordinates. */
  pickColor(canvasX: number, canvasY: number): [number, number, number] | null {
    const { gl, canvas } = this
    const x = Math.round(canvasX)
    const y = Math.round(canvasY)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
    const pixel = new Uint8Array(4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    // WebGL reads bottom-up; canvasX/Y are top-down like the rest of the app.
    gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    return [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255]
  }

  /** Bounding box of the layer's actually-painted (non-transparent) pixels,
   *  in canvas-pixel space (same convention as Dab.x/y) — used by the
   *  transform gizmo (#120) so it hugs the real content instead of the
   *  whole canvas. `null` if the layer is fully transparent or doesn't
   *  exist. A full readPixels + CPU scan, same cost profile as
   *  _takeCheckpoint's — meant to be called once when the tool activates
   *  or the target selection changes, not per drag frame. */
  getContentBounds(layerId: string): { x: number; y: number; width: number; height: number } | null {
    const buf = this._layers.get(layerId)
    if (!buf) return null
    const { width, height } = buf
    const pixels = buf.readPixels()
    let minX = width, maxX = -1, minRow = height, maxRow = -1
    for (let row = 0; row < height; row++) {
      const base = row * width
      for (let x = 0; x < width; x++) {
        if (pixels[(base + x) * 4 + 3] === 0) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (row < minRow) minRow = row
        if (row > maxRow) maxRow = row
      }
    }
    if (maxX < minX) return null
    // gl.readPixels' rows are bottom-up (row 0 = GL/window bottom), but every
    // other buffer-pixel value in this engine is app-space top-down (y=0 at
    // the top, matching Dab.x/y and clientToCanvas) — same gap DAB_VERT
    // bridges when painting (`clip.y = -clip.y`) and TRANSFORM_BLIT_FRAG
    // bridges when baking a transform. Flip once here so every caller gets
    // an app-space rect for free, instead of a mirrored one that happened
    // to go unnoticed until something asymmetric (the gizmo) depended on it.
    const minY = height - 1 - maxRow
    const maxY = height - 1 - minRow
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  }

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

  /** Live gizmo-drag preview (#120) — renders each entry's *current* layer
   *  content through the requested transform into a scratch buffer that
   *  _runComposite substitutes in for the real one, called on every drag
   *  frame. Never touches the real layer buffer — the actual bake only
   *  happens once via a real `layer_transform` op through appendOperation
   *  (see clearLayerTransformPreview, which the caller must call right
   *  after committing that op, so the now-stale preview doesn't keep
   *  shadowing the freshly baked real buffer). */
  previewLayerTransform(transforms: Array<{ layerId: string; matrix: AffineMatrix }>): void {
    for (const { layerId, matrix } of transforms) {
      const source = this._layers.get(layerId)
      if (!source) continue
      let preview = this._transformPreview.get(layerId)
      if (!preview) {
        preview = new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height)
        this._transformPreview.set(layerId, preview)
      } else {
        preview.clear()
      }
      this._drawTransformBlit(source.texture, matrix, preview.fbo)
    }
    this._display()
  }

  /** Ends a gizmo-drag preview — on commit (a real op just landed and
   *  rebuilt the actual buffers) or on cancel (e.g. Escape, switching tools
   *  mid-drag without releasing). */
  clearLayerTransformPreview(): void {
    for (const buf of this._transformPreview.values()) buf.destroy()
    this._transformPreview.clear()
    this._display()
  }

  /** See PencilEngineAPI's doc comment. Queues `op` for its author's reveal;
   *  starts the reveal loop immediately if this peer has nothing else in
   *  flight, otherwise it plays once the current head of the queue finishes. */
  previewOperation(op: StrokeOperation): void {
    let state = this._peerPreviews.get(op.userId)
    if (!state) {
      state = {
        queue: [], dabIdx: 0, startTime: 0, timer: null,
        buf: new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height),
      }
      state.buf.clear()
      this._peerPreviews.set(op.userId, state)
    }
    state.queue.push(op)
    if (state.timer === null) this._startPeerPreviewHead(op.userId)
  }

  /** See PencilEngineAPI's doc comment. Searches every peer's queue (not
   *  just the animating head) since a fast undo can target one still
   *  waiting behind another still-drawing peer op. Returns the op itself
   *  (not just whether one was found) — an undo/revoke racing a reveal must
   *  still commit the underlying stroke to the log (just without animating
   *  it), or a later redo would find nothing to bring back. Cancelling the
   *  reveal only ever affects the animation, never the operation data. */
  dropPendingPreview(opId: string): StrokeOperation | null {
    for (const [peerId, state] of this._peerPreviews) {
      const idx = state.queue.findIndex(op => op.id === opId)
      if (idx === -1) continue
      const [op] = state.queue.splice(idx, 1)
      if (idx === 0) {
        // It was the one actually animating — stop it and either move on to
        // whatever's queued behind it or tear this peer down entirely.
        if (state.timer !== null) clearTimeout(state.timer)
        state.buf.clear()
        if (state.queue.length) this._startPeerPreviewHead(peerId)
        else { state.buf.destroy(); this._peerPreviews.delete(peerId); this._display() }
      }
      return op
    }
    return null
  }

  /** See PencilEngineAPI's doc comment. */
  flushPeerPreview(peerId: string): StrokeOperation[] {
    const state = this._peerPreviews.get(peerId)
    if (!state) return []
    if (state.timer !== null) clearTimeout(state.timer)
    state.buf.destroy()
    this._peerPreviews.delete(peerId)
    this._display()
    return state.queue
  }

  // Starts (or restarts, for the next queued op) animating peerId's queue
  // head from its first dab.
  private _startPeerPreviewHead(peerId: string): void {
    const state = this._peerPreviews.get(peerId)
    if (!state) return
    state.dabIdx = 0
    state.startTime = performance.now()
    state.timer = setTimeout(() => this._stepPeerPreview(peerId), 16)
  }

  // One reveal tick for a peer: paints every not-yet-painted dab of the
  // queue head whose recorded `t` has now elapsed, in original pacing. Once
  // the whole op is painted, reports it via onPreviewApplied (the caller
  // commits it for real) and either starts the next queued op or, if the
  // queue's empty, tears this peer's buffer down. setTimeout (not rAF, see
  // PeerPreviewState) so this always finishes even in a backgrounded tab.
  private _stepPeerPreview(peerId: string): void {
    const state = this._peerPreviews.get(peerId)
    if (!state) return
    const op = state.queue[0]
    if (!op) return

    const elapsed = performance.now() - state.startTime
    const due: Dab[] = []
    while (state.dabIdx < op.dabs.length && op.dabs[state.dabIdx].t <= elapsed) {
      due.push(op.dabs[state.dabIdx])
      state.dabIdx++
    }
    if (due.length) {
      this._paintDabs(state.buf, due, op.tool, op.preset, op.color)
      this._display()
    }

    if (state.dabIdx >= op.dabs.length) {
      this._onPreviewApplied?.(op)
      state.queue.shift()
      state.buf.clear()
      if (state.queue.length) this._startPeerPreviewHead(peerId)
      else { state.timer = null; state.buf.destroy(); this._peerPreviews.delete(peerId); this._display() }
      return
    }
    state.timer = setTimeout(() => this._stepPeerPreview(peerId), 16)
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
    this.canvas.removeEventListener('webglcontextlost', this._handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this._handleContextRestored)
    this._pointer.destroy()
    this._layers.forEach(buf => buf.destroy())
    this._compositeFBO.destroy()
    this._previewBuf?.destroy()
    this._previewBuf = null
    this._tipBuf?.destroy()
    this._tipBuf = null
    for (const { buf, timer } of this._peerPreviews.values()) {
      if (timer !== null) clearTimeout(timer)
      buf.destroy()
    }
    this._peerPreviews.clear()
    for (const buf of this._transformPreview.values()) buf.destroy()
    this._transformPreview.clear()
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
      case 'layer_transform':
        for (const t of op.transforms) this._rebuildLayer(t.layerId)
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
    for (let i = start; i < ops.length; i++) this._applyPixelOp(buf, layerId, ops[i])
  }

  private _applyPixelOp(buf: AccumulationBuffer, layerId: string, op: PixelOperation): void {
    switch (op.type) {
      case 'stroke':
        this._paintDabs(buf, op.dabs, op.tool, op.preset, op.color)
        break
      case 'layer_clear':
        buf.clear()
        break
      case 'layer_merge':
        this._replayMergeInto(buf, op)
        break
      case 'image_import':
        this._paintImage(buf, op).catch(err => console.error('failed to paint imported image', err))
        break
      case 'layer_transform': {
        // The one PixelOperation that can belong to several layers'
        // histories at once (#120) — layerId picks out which of its
        // `transforms` entries actually applies to the buffer being
        // rebuilt right now.
        const entry = op.transforms.find(t => t.layerId === layerId)
        if (entry) this._bakeTransform(buf, entry.matrix)
        break
      }
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

  // ─── Context loss (#121) ─────────────────────────────────────────────────────

  // preventDefault() is required by spec for the context to be eligible for
  // restoration at all — without it, the canvas stays dead until reload. Real
  // trigger is believed to be _takeCheckpoint's full-canvas readPixels (see
  // there) stalling the GPU pipeline long enough to trip a mobile browser's
  // watchdog, especially with several full-size layer textures resident.
  private _handleContextLost = (e: Event): void => {
    e.preventDefault()
    this._contextLost = true
  }

  // The WebGLRenderingContext object itself (`this.gl`) survives restoration
  // per spec — only the GPU-side resources it created (programs, textures,
  // framebuffers) are gone and must be recreated. The Operation Log and
  // checkpoints are plain JS memory, never touched by context loss, so
  // recovery is: rebuild GL state, drop stale buffer/preview handles, then
  // let _syncBuffersToLog do exactly what it already does for a layer
  // add/delete — recreate and replay each live layer from the log.
  private _handleContextRestored = (): void => {
    this._contextLost = false
    this._initGL()
    this._initPaper(this._opts.paper)
    this._layers.clear() // handles are already dead; not worth destroy()ing
    this._previewBuf = null
    this._tipBuf = null
    for (const { timer } of this._peerPreviews.values()) {
      if (timer !== null) clearTimeout(timer)
    }
    this._peerPreviews.clear()
    this._transformPreview.clear() // handles dead too; a mid-drag gizmo just loses its live preview
    this._syncBuffersToLog()
    this._display()
  }

  // ─── Checkpoints ─────────────────────────────────────────────────────────────

  private _maybeCheckpoint(layerId: string): void {
    const ops = this._log.layerPixelOps(layerId)
    if (ops.length === 0 || ops.length % CHECKPOINT_INTERVAL !== 0) return
    // Deferred off the stroke-completion path (#121): a full-canvas
    // readPixels right as the pointer lifts can stall the GPU pipeline long
    // enough to trip a mobile browser's context-loss watchdog. Idle time
    // moves the same cost off the moment the user is actively interacting.
    // _takeCheckpoint re-reads the log fresh rather than trusting this
    // closure's op count, so a checkpoint taken slightly late just captures
    // a bit more history — never something incorrect.
    const schedule: (fn: () => void) => void =
      typeof requestIdleCallback === 'function' ? requestIdleCallback : fn => setTimeout(fn, 0)
    schedule(() => this._takeCheckpoint(layerId))
  }

  /** Snapshots the layer's current buffer, which must equal replay state of its
   *  done pixel ops (true at every call site: after live paint, live merge, or
   *  a replayed apply). Budgeted in bytes: eviction makes deep undo slower
   *  (longer replay), never impossible. */
  private _takeCheckpoint(layerId: string): void {
    // A lost context's readPixels returns stale/zeroed data (spec no-op),
    // which would silently bake a blank snapshot into undo history — skip
    // rather than corrupt; _handleContextRestored rebuilds from the log
    // directly instead, which never depended on this checkpoint existing.
    if (this._contextLost) return
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

    this._dabProg          = createProgram(gl, DAB_VERT, DAB_FRAG)
    this._dabProgInstanced = createProgram(gl, DAB_VERT_INSTANCED, DAB_FRAG)
    this._dispProg      = createProgram(gl, DISPLAY_VERT, DISPLAY_FRAG)
    this._compositeProg = createProgram(gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG)
    this._blitProg      = createProgram(gl, DISPLAY_VERT, IMAGE_BLIT_FRAG)
    this._transformProg = createProgram(gl, DISPLAY_VERT, TRANSFORM_BLIT_FRAG)

    this._dabUni  = getUniforms(gl, this._dabProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
      'u_resolution', 'u_paperHeightMap', 'u_paperScale',
      'u_pressure', 'u_tiltX', 'u_tiltY', 'u_hardness', 'u_opacity',
      'u_paperRoughness', 'u_eraseMode', 'u_color',
    ])
    this._dabInstUni = getUniforms(gl, this._dabProgInstanced, [
      'u_resolution', 'u_paperHeightMap', 'u_paperScale',
      'u_hardness', 'u_paperRoughness', 'u_eraseMode', 'u_color',
    ])
    this._dispUni = getUniforms(gl, this._dispProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_paperScale',
    ])
    this._compositeUni = getUniforms(gl, this._compositeProg, ['u_layer', 'u_opacity'])
    this._blitUni = getUniforms(gl, this._blitProg, ['u_image', 'u_bufferSize', 'u_imageRect'])
    this._transformUni = getUniforms(gl, this._transformProg, ['u_source', 'u_bufferSize', 'u_matrixInv'])

    this._dabPosLoc       = gl.getAttribLocation(this._dabProg, 'a_position')
    this._dispPosLoc      = gl.getAttribLocation(this._dispProg, 'a_position')
    this._compositePosLoc = gl.getAttribLocation(this._compositeProg, 'a_position')
    this._blitPosLoc      = gl.getAttribLocation(this._blitProg, 'a_position')
    this._transformPosLoc = gl.getAttribLocation(this._transformProg, 'a_position')

    this._instPosLoc     = gl.getAttribLocation(this._dabProgInstanced, 'a_position')
    this._instALoc       = gl.getAttribLocation(this._dabProgInstanced, 'a_instA')
    this._instBLoc       = gl.getAttribLocation(this._dabProgInstanced, 'a_instB')
    this._instOpacityLoc = gl.getAttribLocation(this._dabProgInstanced, 'a_opacity')

    this._quadBuf    = createQuadBuffer(gl)
    this._screenBuf  = createFullscreenQuad(gl)
    this._dabInstBuf = gl.createBuffer()!

    this._instancedArraysExt = gl.getExtension('ANGLE_instanced_arrays') as InstancedArraysExt | null

    this._compositeFBO = new AccumulationBuffer(gl, canvas.width, canvas.height)
  }

  private _initPaper(type: PaperType): void {
    const { gl, canvas } = this
    if (this._paperTex) gl.deleteTexture(this._paperTex)
    this._paperTex = createPaperTexture(gl, type, canvas.width, canvas.height)
  }

  private get _physicalSize(): number {
    return this._toPhysicalSize(this._opts.size)
  }

  // CSS-px → canvas-physical-px conversion for this user's own brush size —
  // factored out of _physicalSize only because it reads _opts.size, which a
  // getter can't parameterize.
  private _toPhysicalSize(size: number): number {
    return size * (this.canvas.width / (this.canvas.clientWidth || this.canvas.width))
  }

  // ─── Stroke input ────────────────────────────────────────────────────────────

  private _onStart(e: PointerData): void {
    if (this._locked) return
    const layerId = this._activeId
    if (!layerId || !this._layers.has(layerId)) return
    this._strokeLayerId = layerId
    this._strokeTool    = this._opts.tool
    this._strokePreset  = this._opts.pencilType
    this._strokeColor   = this._opts.graphiteColor
    this._strokeDabs    = []
    this._strokeStartTimestamp = e.timeStamp
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
    if (this._haptic) {
      this._haptic.reset()
      this._hapticX = e.x
      this._hapticY = e.y
    }
    const dabs = this._dabs.startStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
    this._paintStrokeDabs(dabs, e.speed, 0)
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
    if (this._haptic) {
      this._haptic.sample(this._hapticX, this._hapticY, e.x, e.y)
      this._hapticX = e.x
      this._hapticY = e.y
    }
    const dabs = this._dabs.continueStroke(e.x, e.y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
    let painted = false
    if (dabs.length) {
      const t0 = this._debug ? performance.now() : 0
      this._paintStrokeDabs(dabs, e.speed, e.timeStamp - this._strokeStartTimestamp)
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
      this._bakeDabOpacity(dabs, speed, this._strokeTool, this._strokePreset, this._opts.opacity)
      this._paintDabs(this._tipBuf, dabs, this._strokeTool, this._strokePreset, this._strokeColor)
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
      this._bakeDabOpacity(dabs, samples[samples.length - 1].speed, this._strokeTool, this._strokePreset, this._opts.opacity)
      this._paintDabs(this._previewBuf, dabs, this._strokeTool, this._strokePreset, this._strokeColor)
    }
    this._display()
  }

  private _onEnd(e: PointerData): void {
    const layerId = this._strokeLayerId
    if (!layerId) return
    const t0 = this._debug ? performance.now() : 0
    const dabs = this._dabs.endStroke(this._physicalSize)
    if (dabs.length) this._paintStrokeDabs(dabs, e.speed, e.timeStamp - this._strokeStartTimestamp)
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
        layerId, tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
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
   *  dabs render with visually consistent opacity to real ones. tool/
   *  presetName/opacity are explicit params (rather than always reading this
   *  user's own _strokeTool/_strokePreset/_opts.opacity) purely so both
   *  callers can pass their own state through one shared implementation. */
  private _bakeDabOpacity(dabs: Dab[], speed: number, tool: ToolType, presetName: string, opacity: number): void {
    const erasing     = tool === 'eraser'
    const preset      = isPencilGrade(presetName) ? PENCIL_PRESETS[presetName] : PENCIL_PRESETS['HB']
    const speedFactor = Math.max(0.7, 1.0 - speed * 0.15)
    for (const dab of dabs) {
      dab.opacity = erasing
        ? opacity
        : preset.opacity * opacity * speedFactor
    }
  }

  /** Bakes final dab opacity, stamps Dab.t, paints, and buffers the dabs for
   *  the StrokeOperation recorded on pointer up. Live strokes and replay
   *  share _paintDabs, so replay is pixel-identical. Real dabs only — #92's
   *  predicted dabs go through _onPredict → _previewBuf instead and must
   *  never reach this method (that's what keeps them out of _strokeDabs).
   *  `elapsedMs` is this call's dabs' distance from _strokeStartTimestamp —
   *  a peer's live-stroke reveal (previewOperation) plays them back at this
   *  pacing. */
  private _paintStrokeDabs(dabs: Dab[], speed: number, elapsedMs: number): void {
    if (!dabs.length || !this._strokeLayerId) return
    const buf = this._layers.get(this._strokeLayerId)
    if (!buf) return

    this._bakeDabOpacity(dabs, speed, this._strokeTool, this._strokePreset, this._opts.opacity)
    for (const dab of dabs) dab.t = elapsedMs
    this._paintDabs(buf, dabs, this._strokeTool, this._strokePreset, this._strokeColor)
    this._strokeDabs.push(...dabs)
  }

  // ─── Reference image import (#88) ──────────────────────────────────────────────

  private _loadImage(src: string): Promise<HTMLImageElement> {
    const cached = this._imageCache.get(src)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => { this._imageCache.set(src, img); resolve(img) }
      img.onerror = () => reject(new Error('failed to decode imported image'))
      img.src = src
    })
  }

  /** Paints a reference image into `buf`, fit-centered ("contain") so the
   *  whole image stays visible, letterboxed if its aspect ratio doesn't
   *  match the canvas's. Async (image decode) — unlike every other pixel
   *  op, this doesn't land synchronously within appendOperation/
   *  _applyPixelOp; both callers fire it and move on. In practice this is
   *  fine: `image_import` only ever targets a layer created moments earlier
   *  by its own `layer_add` (see the shared type's doc comment), so nothing
   *  else is normally racing to paint the same layer while this decodes.
   *  The one real gap: replaying a room whose reference layer already has
   *  strokes on top of it — those strokes are synchronous and can finish
   *  painting before this image lands, and AccumulationBuffer's "over"
   *  blend always draws on top regardless of seq order, so the image could
   *  render over strokes meant to be on top of it. Not worth solving until
   *  it's an actual reported problem — the fix (only this file's replay
   *  loop, `_replayInto`) would mean threading async through undo/redo's
   *  buffer-rebuild path too. */
  private async _paintImage(buf: AccumulationBuffer, op: ImageImportOperation): Promise<void> {
    const img = await this._loadImage(op.image)
    const { gl, canvas } = this

    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const scale = Math.min(canvas.width / op.width, canvas.height / op.height)
    const drawW = op.width * scale
    const drawH = op.height * scale

    buf.beginDraw()
    gl.useProgram(this._blitProg)
    const u = this._blitUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u.u_image, 0)
    gl.uniform2f(u.u_bufferSize, canvas.width, canvas.height)
    gl.uniform4f(u.u_imageRect, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._blitPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    buf.endDraw()

    gl.deleteTexture(texture)
    this._display()
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  private _paintDabs(
    buf: AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string,
    color: [number, number, number],
  ): void {
    const erasing = tool === 'eraser'
    const preset  = isPencilGrade(presetName) ? PENCIL_PRESETS[presetName] : PENCIL_PRESETS['HB']

    if (erasing) {
      buf.beginErase()
    } else {
      buf.beginDraw()
    }

    // #123: batch every dab in this call into one instanced draw call when
    // the extension is available (effectively always, in practice) — see
    // _paintDabsInstanced's docstring for why this preserves the exact
    // sequential per-dab blend order the fallback loop below relies on.
    if (this._instancedArraysExt) {
      this._paintDabsInstanced(dabs, erasing, preset, color)
    } else {
      this._paintDabsUniform(dabs, erasing, preset, color)
    }

    buf.endDraw()
  }

  /** Fallback path for a WebGL1 context without ANGLE_instanced_arrays: one
   *  gl.drawArrays + ~9 gl.uniform* calls per dab, kept exactly as it was
   *  before #123 (same shader math via DAB_VERT, same GL call count/order) —
   *  the safety net on the rare device that lacks the extension. */
  private _paintDabsUniform(
    dabs: Dab[], erasing: boolean, preset: PencilPreset, color: [number, number, number],
  ): void {
    const { gl, canvas } = this
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
    gl.uniform3fv(u.u_color, color)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    const posLoc = this._dabPosLoc
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
  }

  /** Batched hot path (#123): one interleaved instance-data upload + one
   *  drawArraysInstancedANGLE call per _paintDabs invocation, replacing what
   *  used to be one gl.drawArrays + ~9 gl.uniform* calls PER DAB (a fast/long
   *  stroke can produce dozens of dabs from a single move-event).
   *
   *  Correctness constraint this must preserve exactly: dabs are NOT
   *  independent/order-insensitive when they overlap — e.g. an eraser dab
   *  must still correctly interact with ink laid down by an earlier dab in
   *  the same batch. AccumulationBuffer.beginDraw()/beginErase() blend every
   *  dab draw call (ONE, ONE_MINUS_SRC_ALPHA or ZERO, ONE_MINUS_SRC_ALPHA)
   *  onto the accumulation of every previous one, so the per-dab paint order
   *  is directly observable in the resulting pixels. ANGLE_instanced_arrays
   *  processes instance 0, 1, 2, ... in strict submission order through the
   *  same fixed-function blend stage a sequence of separate draw calls
   *  would use — this is the same ordering guarantee every sorted-
   *  transparency instancing technique (particle systems, decal stacks)
   *  already depends on, so batching here doesn't change the accumulated
   *  result. The fragment shader itself is completely unchanged (DAB_FRAG is
   *  shared with the uniform path) — only how each dab's parameters reach
   *  the shader changed, from one gl.uniform* call per dab to one instanced
   *  vertex attribute read per dab out of a single buffer uploaded once. */
  private _paintDabsInstanced(
    dabs: Dab[], erasing: boolean, preset: PencilPreset, color: [number, number, number],
  ): void {
    const { gl, canvas } = this
    const ext = this._instancedArraysExt
    if (!ext) return // only called when present; guards the type narrowing below
    const u = this._dabInstUni

    gl.useProgram(this._dabProgInstanced)
    gl.uniform2f(u.u_resolution, canvas.width, canvas.height)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.uniform1f(u.u_hardness, erasing ? 0.85 : preset.hardness)
    gl.uniform1f(u.u_paperRoughness, PAPER_ROUGHNESS[this._opts.paper] ?? 1.0)
    gl.uniform1f(u.u_eraseMode, erasing ? 1.0 : 0.0)
    gl.uniform3fv(u.u_color, color)

    // Shared unit quad, divisor 0 — same 6 vertices/2 triangles per instance
    // as the uniform path's per-dab quad.
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    gl.enableVertexAttribArray(this._instPosLoc)
    gl.vertexAttribPointer(this._instPosLoc, 2, gl.FLOAT, false, 0, 0)
    ext.vertexAttribDivisorANGLE(this._instPosLoc, 0)

    // Interleaved per-dab instance data — stride 9 floats:
    // [cx, cy, radius, angle, aspectRatio, pressure, tiltX, tiltY, opacity].
    // Packed into 2 vec4 + 1 float attributes (see DAB_VERT_INSTANCED) to
    // stay well within WebGL1's guaranteed minimum of 8 vertex attributes.
    // Reused/grown scratch array — no per-stroke-segment allocation.
    const STRIDE = 9
    const need = dabs.length * STRIDE
    if (this._dabInstScratch.length < need) {
      this._dabInstScratch = new Float32Array(Math.max(need, this._dabInstScratch.length * 2, 256))
    }
    const data = this._dabInstScratch
    for (let i = 0; i < dabs.length; i++) {
      const d = dabs[i]
      const o = i * STRIDE
      data[o + 0] = d.x
      data[o + 1] = d.y
      data[o + 2] = d.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier)
      data[o + 3] = d.angle
      data[o + 4] = d.aspectRatio
      data[o + 5] = d.pressure
      data[o + 6] = d.tiltX
      data[o + 7] = d.tiltY
      data[o + 8] = d.opacity
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this._dabInstBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, need), gl.DYNAMIC_DRAW)

    const STRIDE_BYTES = STRIDE * 4
    gl.enableVertexAttribArray(this._instALoc)
    gl.vertexAttribPointer(this._instALoc, 4, gl.FLOAT, false, STRIDE_BYTES, 0)
    ext.vertexAttribDivisorANGLE(this._instALoc, 1)

    gl.enableVertexAttribArray(this._instBLoc)
    gl.vertexAttribPointer(this._instBLoc, 4, gl.FLOAT, false, STRIDE_BYTES, 16)
    ext.vertexAttribDivisorANGLE(this._instBLoc, 1)

    gl.enableVertexAttribArray(this._instOpacityLoc)
    gl.vertexAttribPointer(this._instOpacityLoc, 1, gl.FLOAT, false, STRIDE_BYTES, 32)
    ext.vertexAttribDivisorANGLE(this._instOpacityLoc, 1)

    ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, dabs.length)

    // Defensive: divisor state belongs to WebGL1's one implicit vertex array
    // (global, not per-program) — reset before any other program potentially
    // reuses these location indices, so a leftover divisor=1 can never
    // silently collapse an unrelated draw call onto a single instance.
    ext.vertexAttribDivisorANGLE(this._instALoc, 0)
    ext.vertexAttribDivisorANGLE(this._instBLoc, 0)
    ext.vertexAttribDivisorANGLE(this._instOpacityLoc, 0)
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
    const posLoc = this._compositePosLoc
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
      // A layer mid-gizmo-drag composites its live preview instead of its
      // real (untouched) buffer — see previewLayerTransform.
      const buf = this._transformPreview.get(id) ?? this._layers.get(id)
      if (buf) entries.push({ texture: buf.texture, opacity })
    }
    this._compositeTextures(entries, targetFbo)
  }

  /** Renders `sourceTex` through the (inverse of the) given transform into
   *  `targetFbo` — the shared draw call behind both the live gizmo preview
   *  and a committed bake (see _bakeTransform, which additionally copies
   *  the result back into its source buffer). */
  private _drawTransformBlit(sourceTex: WebGLTexture, matrix: AffineMatrix, targetFbo: WebGLFramebuffer): void {
    const { gl, canvas } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND) // full replace, not accumulate — target is a fresh/cleared buffer
    gl.useProgram(this._transformProg)
    const tu = this._transformUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._transformPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(tu.u_source, 0)
    gl.uniform2f(tu.u_bufferSize, canvas.width, canvas.height)
    gl.uniformMatrix3fv(tu.u_matrixInv, false, toMat3(invertAffine(matrix)))
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Bakes a transform into `buf`'s own content, in place — object identity
   *  preserved, since every caller (_replayInto's loop, appendOperation's
   *  live case) holds a stable reference and expects in-place mutation like
   *  every other pixel op. WebGL1 can't safely read and write the same
   *  texture in one draw call, so this renders into a temp buffer via
   *  _drawTransformBlit, then copies the temp buffer back — the same
   *  read-into-temp-then-copyTo pattern AccumulationBuffer.copyTo exists
   *  for already (see _execMergeLive/_replayMergeInto). */
  private _bakeTransform(buf: AccumulationBuffer, matrix: AffineMatrix): void {
    const temp = new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height)
    temp.clear()
    this._drawTransformBlit(buf.texture, matrix, temp.fbo)
    temp.copyTo(buf)
    temp.destroy()
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

    // Live remote-stroke reveals (#37 follow-up v2): one per peer currently
    // replaying a stroke, same blend, on top of everything else — see
    // previewOperation. Order among multiple simultaneous peers is arbitrary
    // (Map insertion order); their strokes are independent so this never
    // matters visually.
    for (const { buf } of this._peerPreviews.values()) {
      this._compositeTextures([{ texture: buf.texture, opacity: 1 }], this._compositeFBO.fbo)
    }

    const paperColor = PAPER_COLORS[this._opts.paper]

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

    gl.uniform3fv(u.u_paperColor, paperColor)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._dispPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
}
