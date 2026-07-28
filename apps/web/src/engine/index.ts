import { nanoid } from 'nanoid'
import type { PaperType, Dab, ToolType, Operation, StrokeOperation, LayerMergeOperation, ImageImportOperation } from '@grafetto/shared'
import { DAB_VERT, DAB_VERT_INSTANCED, DAB_FRAG, RIBBON_VERT, RIBBON_FRAG, SMUDGE_TRANSFER_FRAG, SMUDGE_COMPUTE_FRAG, DISPLAY_VERT, DISPLAY_FRAG, DISPLAY_TRANSPARENT_FRAG, PAPER_COMPOSE_FRAG, LAYER_COMPOSITE_FRAG, IMAGE_BLIT_FRAG, TRANSFORM_BLIT_FRAG } from './src/shaders'
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/utils'
import { PAPER_WORLD_SIZE } from './src/paperNoise'
import {
  createPlaceholderPaperTexture, getPaperBytes, uploadPaperTexture,
} from './src/paperLoader'
import { AccumulationBuffer } from './src/AccumulationBuffer'
import {
  charcoalPresetFor, CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE, CHARCOAL_GRAIN_STREAKY,
  type CharcoalPreset, type CharcoalType,
} from './src/charcoalPresets'
import {
  CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS, charcoalBroadness, charcoalBroadDensity,
  type CharcoalFeelConfig,
} from './src/charcoalFeel'
import { DabSystem } from './src/DabSystem'
import { shapingForTool } from './src/dabShaping'
import type { MarkerAngleConfig } from './src/markerPresets'
import { OperationLog, type PixelOperation } from './src/OperationLog'
import { PointerInput, type PointerData } from './src/PointerInput'
import {
  PENCIL_PRESETS, PENCIL_GRADES, GRAPHITE_GRAIN_DEFAULT, isPencilGrade,
  type PencilGradeName, type PencilPreset,
} from './src/pencilPresets'
import {
  LINER_PRESET, LINER_SIZES_MM, linerSpeedFlow, linerTiltFlow, applyLinerEndTaper,
  dwellConfigForTool, dwellFlow, type DwellConfig, type LinerSizeMm,
} from './src/linerPresets'
import { markerNibFromPreset, markerPressureFlow } from './src/markerPresets'
import { buildRibbonBands, RIBBON_FLOATS_PER_VERTEX, type NibShape } from './src/markerRibbon'
import { HapticGrain, type HapticGrainStats } from './src/HapticGrain'
import {
  applyAffine, composeAffine, invertAffine, scaleRotateMatrix, toMat3, translationMatrix,
  IDENTITY_MATRIX, type AffineMatrix,
} from './src/affine'
import { snapToRuler, type RulerLine } from './src/rulerSnap'
import { TiledLayerBuffer, type TileRebuilder, type TileRebuildSession } from './src/TiledLayerBuffer'
import type { ILayerBuffer, PaintTarget } from './src/ILayerBuffer'
import { TILE_SIZE, tileWorldRect, tilesOverlappingRect, type WorldRect } from './src/tileMath'
import { encodeLayerTiles, type SnapshotTile } from './src/snapshotCodec'
import { paperCoarsenessOf } from '@grafetto/shared'
import type { PaperCoarseness } from '@grafetto/shared'

export type { HapticGrainStats }
export type { AffineMatrix }
export type { RulerLine }

export { PENCIL_PRESETS, PENCIL_GRADES, GRAPHITE_GRAIN_DEFAULT, type PencilGradeName, type PencilPreset }
export { LINER_SIZES_MM, type LinerSizeMm }
export {
  CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE, CHARCOAL_GRAIN_STREAKY,
  type CharcoalType, type CharcoalPreset,
}
export { CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS, type CharcoalFeelConfig }

/** Pure dab-shape query for UI overlays (brush cursor) — mirrors
 *  DabSystem._makeDab's own geometry formula (tiltMag/tiltNorm ->
 *  size/aspect/angle) exactly, but as a standalone function so a hover
 *  preview can read a tool's current dab shape without spinning up a real
 *  DabSystem/stroke or touching any GL state. `baseSize` is caller-supplied
 *  physical px (same units engine.setSize already takes — see Room's own
 *  sizePx computation). `pathAngle` defaults to 0: a hover has no stroke
 *  path yet to derive a tangent from, and tiltOrPathAngle only falls back to
 *  it when tilt is below the 15deg trust threshold, so this just means an
 *  untilted mouse hover previews angle 0 rather than an arbitrary direction. */
export function previewDabShape(
  tool: ToolType, presetName: string | undefined,
  baseSize: number, pressure: number, tiltX: number, tiltY: number, pathAngle = 0,
  markerAngle?: MarkerAngleConfig,
): { size: number; aspectRatio: number; angle: number } {
  const shaping = shapingForTool(tool, presetName, markerAngle)
  const tiltMag = Math.sqrt(tiltX * tiltX + tiltY * tiltY)
  const tiltNorm = tiltMag / 90
  return {
    size: baseSize * shaping.size(pressure, tiltNorm),
    aspectRatio: shaping.aspect(tiltNorm),
    angle: shaping.angle(tiltMag, tiltX, tiltY, pathAngle),
  }
}

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
  // Infinite-canvas mode (#133 Phase 1, #142) — every room's layer storage
  // is the same TiledLayerBuffer regardless of this flag (see
  // _makeLayerBuffer); what `infinite` actually controls is the *visible*
  // window and camera: false/omitted (default) keeps a fixed, non-panning
  // canvas.width x canvas.height viewport (see _visibleWorldRect's bounded
  // branch) with rotation handled by the DOM canvasWrap's own CSS
  // transform; true hands the viewport to a free-roaming, rotatable
  // world-space camera (setInfiniteCamera/_infiniteCamera). Fixed once at
  // construction — an engine instance never switches modes mid-life.
  infinite?: boolean
  paper?: PaperType
  // Overrides paperColorOf(paper)'s default background RGB for this room —
  // set from the creator's own pick (Room.paperColor, hex, converted via
  // hexToRgb) when present; omit to use the plain per-texture default.
  paperColor?: [number, number, number]
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
  // Dev-only grain A/B (see DAB_FRAG's computeGrain and SettingsPanel's two
  // "grain variant" controls) — omitted means "use that material's own shipped
  // default" (GRAPHITE_GRAIN_DEFAULT / CHARCOAL_PRESETS.grain), 0-10 override
  // it with a specific variant. Separate per material (#304 follow-up): their
  // defaults differ, and auditioning one must not disturb the other. Applies
  // to every paper type; the grain term has nothing paper-type-specific
  // about it.
  grainMode?: number
  charcoalGrainMode?: number
  // Dev-only live tuning, initial value only — see PencilEngineAPI's
  // setPaperFillThreshold for the runtime setter a debug-overlay slider
  // actually drags. Defaults to 0 when omitted — see the shader-side
  // comment for why that ended up being the tuned value, not a "feature
  // off" placeholder.
  paperFillThreshold?: number
  // Dev-only live tuning, initial value only — see PencilEngineAPI's
  // setPaperFillCap. Defaults to 0.35 when omitted.
  paperFillCap?: number
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
  // Real requestAnimationFrame-anchored latency: PointerEvent.timeStamp of
  // the last move sample that fed a given _scheduleDisplay() coalesced
  // batch → performance.now() at the top of that batch's rAF callback,
  // right before _display() actually runs. rAF callbacks fire immediately
  // before the browser's next paint for that frame, so this is the
  // closest proxy to real screen latency available without a forced
  // gl.finish()/readPixels stall — unlike avgE2eLatencyMs/avgTipLatencyMs
  // (which only measure up to the moment JS finished *submitting* GL
  // commands, not when the GPU/compositor actually presented anything),
  // this also covers whatever queues up between submission and the
  // browser's next paint. Still doesn't cover actual GPU execution time or
  // OS-level compositor/vsync after the rAF callback returns — the true
  // photon-to-photon number needs hardware most users can't measure with
  // either. 0 if no move produced a coalesced display this stroke (e.g. a
  // single-dab tap, which paints via the direct _onStart/_onEnd _display()
  // calls this metric doesn't cover).
  avgFrameLatencyMs: number
  maxFrameLatencyMs: number
}

type EngineEventName = 'strokeStart' | 'strokeEnd' | 'pointer'
type EngineHandler = (data: PointerData) => void

// 'local' (default) — a genuinely local action; triggers onLocalOperation for
// broadcast. 'remote' — applying an operation that arrived from another
// participant (room_state replay, peer_operation); must not be re-broadcast.
export type OperationSource = 'local' | 'remote'

// (#263) See PencilEngineAPI.peekUndo/peekRedo's own doc comments.
export interface StructuralUndoRedoPeek {
  // One of the layer ids the pending undo/redo would affect. layer_add and
  // layer_merge each target exactly one; layer_delete's layerIds may list
  // several — the first is reported here, but hasOtherContent already
  // reflects the whole set, not just this one id.
  layerId: string
  // True if ANY of the targeted layer(s) currently carry done pixel content
  // from any author — the whole point being to warn about content that
  // isn't only the current user's own (see #263's issue body).
  hasOtherContent: boolean
}

export interface PencilEngineAPI {
  initLayer(id: string): void
  setActiveLayer(id: string): void
  setLocked(locked: boolean): void
  // Dev-only live tuning (see DAB_FRAG's paperFillThreshold uniform and its
  // own comment) — the pressure smoothstep() lower bound above which a
  // single dab starts crushing graphite into the paper's own low spots.
  // Applied on the very next paint call, no engine restart/reload needed —
  // meant for a debug-overlay slider to drag in real time and feel out.
  setPaperFillThreshold(threshold: number): void
  // Dev-only live tuning (see DAB_FRAG's u_paperFillCap and its own
  // comment) — hard ceiling on how far toward 1.0 a single dab's own fill
  // term can ever push paperCatch, regardless of pressure. Applied on the
  // very next paint call, same as setPaperFillThreshold.
  setPaperFillCap(cap: number): void
  // Dev-only live tuning of charcoal's tilt ladder (#305, ADR 005) — the
  // thresholds depend on how a particular hand holds a particular stylus, so
  // they're calibrated by dragging sliders on the tablet rather than agreed as
  // numbers up front. Mutates the shared CHARCOAL_FEEL in place, so it takes
  // effect on the next *stroke*, not retroactively: shape is baked into each
  // Dab at record time, which is exactly what keeps already-drawn and replayed
  // marks stable while a slider moves.
  setCharcoalFeel(patch: Partial<CharcoalFeelConfig>): void
  getCharcoalFeel(): CharcoalFeelConfig
  setCompositeOrder(items: CompositeItem[]): void
  appendOperation(op: Operation, source?: OperationSource): void
  // (#147) Suspends the _display() (full composite + paper-blend) call that
  // several appendOperation branches (stroke/layer_clear/layer_delete/
  // layer_transform/layer_merge, and undo/redo/revoke's own history-change
  // path) would otherwise make on *every single* applied operation, until a
  // matching resumeDisplay() — which then does exactly one. Meant for a
  // caller replaying many historical operations in a row (initial room join,
  // reconnect) so that doesn't pay one full-canvas composite per operation,
  // only once at the end. Counter, not boolean depth (nothing currently
  // nests these, but same defensive reasoning as TiledLayerBuffer's
  // suspendEviction/resumeEviction). A no-op outside such a batch — ordinary
  // one-at-a-time local/remote operations are unaffected either way.
  suspendDisplay(): void
  resumeDisplay(): void
  // Resolves once the real paper-grain texture has replaced the placeholder
  // bound at construction (see _initPaper/paperLoader.ts) — a network fetch
  // + decompress, not instant. A caller about to replay a batch of
  // historical stroke operations (initial room join, reconnect — see
  // suspendDisplay's own doc comment for the same batch) should await this
  // first: appendOperation paints dabs into a layer's accumulation buffer
  // immediately and permanently — a stroke painted before this resolves
  // would bake in the placeholder's flat response forever, with no later
  // re-paint once the real texture arrives (only the *display*/composite
  // step re-runs on demand, not already-applied pixel operations).
  paperReady(): Promise<void>
  // (#149 epic) Raw (uncompressed) tile payload for this layer's current
  // resident content — the same allResident() gather _takeCheckpoint already
  // does for local undo checkpoints, just serialized for network upload
  // instead of kept in memory. Null when the layer has no pixel content yet
  // (nothing to snapshot) — mirrors _takeCheckpoint's own early-return.
  // Bundling several layers together, compressing, and uploading is the
  // caller's job (Room's snapshot orchestration), not the engine's — the
  // engine only knows about one layer at a time.
  bakeNetworkSnapshot(layerId: string): Uint8Array | null
  // (#169) Restores a layer's pixel content wholesale from a downloaded
  // network snapshot — the layer must already exist (via initLayer) with an
  // empty buffer; this is the fast-join counterpart to a live stroke replay,
  // skipping straight to the end result instead of repainting every
  // historical dab. Same tile-restore primitive local checkpoint restore
  // already uses (resolveForPaint + AccumulationBuffer.restorePixels +
  // ILayerBuffer.restoreTileContent).
  restoreLayerFromSnapshot(layerId: string, tiles: SnapshotTile[]): void
  // (#169) Merges a batch of pre-snapshot historical operations into the
  // log for undo/redo/history purposes, WITHOUT painting anything — their
  // pixel effect is already baked into whatever restoreLayerFromSnapshot
  // restored. `ops` must be in ascending seq order and must all be older
  // than every operation already in the log (i.e. this is background
  // backfill walking backward from the snapshot point toward the room's
  // start, one page at a time — see Room's backfill orchestration). Safe to
  // call repeatedly, once per page.
  absorbHistoricalOperations(ops: Operation[]): void
  // (#289 epic, reliable history spec v0.2 §13) Bakes the same bytes
  // bakeNetworkSnapshot would, but reached by a deliberately *independent*
  // route: a scratch buffer replayed from zero through every one of this
  // layer's done pixel operations, never consulting `_checkpoints` and
  // never reading the live layer buffer. Comparing the two is what turns
  // "the incremental/checkpoint path agrees with itself" into a real check.
  //
  // This is the oracle that would have caught #287: there, the *live*
  // buffer held snapshot-restored pixels that the checkpoint machinery
  // couldn't see, so an undo silently rebuilt the layer from an
  // incomplete log — while every client, running that same buggy path,
  // agreed with every other client. Two clients comparing hashes prove
  // nothing about a bug they both execute identically; a second, simpler
  // path within one client does.
  //
  // Returns null on the same conditions bakeNetworkSnapshot does (unknown
  // layer, no pixel ops, nothing resident) so the two are directly
  // comparable — a caller checks `bake === null && verify === null` as
  // agreement too. Deliberately expensive (full from-scratch replay): for
  // background verification, never the live path.
  bakeLayerByFullReplay(layerId: string): Uint8Array | null
  getOperations(): Operation[]
  // (#169) Same as getOperations(), but excludes whatever
  // absorbHistoricalOperations has merged in so far. Room's LayerState is
  // derived by replaying done operations over a base (see
  // lib/layers.ts's replayLayerState) — after a snapshot restore, that base
  // is the snapshot's own `layerState` (already reflecting every structural
  // op through the snapshot's seq), so replaying the *historical* prefix on
  // top of it again would double-apply it. This is what lets Room keep
  // deriving LayerState correctly through the entire window between
  // restoring a snapshot and background backfill completing (and
  // afterward — the restored base stays the permanent LayerState-derivation
  // anchor for this session; only undo/redo need the full historical log,
  // via getOperations()/undo()/redo() themselves, not this).
  getOperationsSinceRestore(): Operation[]
  undo(): Operation | null
  redo(): Operation | null
  // (#263) Read-only peek at what undo()/redo() would act on *without*
  // applying it — null unless the target is a structural op that would
  // actually *remove* content from any author, not just the one about to
  // undo/redo: peekUndo only flags layer_add/layer_merge (undoing
  // layer_delete just restores a layer, never destructive); peekRedo only
  // flags layer_delete and layer_merge (redoing layer_add just re-creates).
  // See _peekStructuralTarget's own doc comment for the full reasoning —
  // getting a direction backwards here would warn "this removes content" on
  // a call that's actually restoring it. Callers (Room's handleUndo/
  // handleRedo) use this to gate a confirm() in front of the real undo()/
  // redo() call, the same shape as the existing Clear-layer confirm (#171)
  // — never mutates the log itself, same contract as OperationLog's own
  // undoTarget/redoTarget it wraps.
  peekUndo(): StructuralUndoRedoPeek | null
  peekRedo(): StructuralUndoRedoPeek | null
  clear(): void
  setUserId(id: string): void
  setPaper(type: PaperType): void
  setPencil(type: string): void
  setTool(tool: ToolType): void
  setOpacity(v: number): void
  setSize(px: number): void
  setColor(rgb: [number, number, number]): void
  // #278: marker chisel nib's angle setting — angleRadians is always
  // canvas-space (the caller is responsible for resolving the "lock to
  // canvas" checkbox and the local viewport's own rotation into this one
  // number, same "engine only ever sees canvas-space" boundary
  // setViewport/PointerInput already keep for pointer coordinates).
  // followStrokeDirection selects between the two chiselDabShaping modes
  // (see markerPresets.ts) — false: angleRadians is the nib's absolute
  // angle (ADR 004's original fixed-angle behavior, just configurable);
  // true: angleRadians is an offset added to the stroke's own path-tangent
  // angle. Has no effect on the bullet nib (round, angle-independent).
  setMarkerAngle(angleRadians: number, followStrokeDirection: boolean): void
  /** Ruler tool (#89): sets (or clears, with null) the straight-edge guide
   *  that live pointer input snaps to before it ever reaches DabSystem —
   *  see rulerSnap.ts's snapToRuler and the private _snapPoint/_onStart/
   *  _onMove/_onPredict below. Like previewLayerTransform, this is
   *  local-only UI-tool state, never an Operation: the ruler itself is
   *  never drawn into the canvas or written to the log (same "not part of
   *  the drawing" principle as the grid/measure overlays, called out in
   *  #89's own issue body) — only its effect on a *real* stroke's recorded
   *  dab positions is ever persisted, and that arrives already-snapped as
   *  an ordinary `stroke` Operation, so replay/undo/a peer's copy all see
   *  the same straightened geometry without needing to know a ruler was
   *  ever involved. */
  setRuler(line: RulerLine | null): void
  pickColor(canvasX: number, canvasY: number): [number, number, number] | null
  // Bounding box of a layer's actual painted content, canvas-pixel space —
  // see the implementation's docstring for cost/call-frequency notes (#120).
  getContentBounds(layerId: string): { x: number; y: number; width: number; height: number } | null
  // (#263) O(1) read-only check: does this layer currently have any done
  // pixel operations (stroke/clear/merge/image_import/layer_transform),
  // from any author? Thin wrapper over OperationLog.pixelOpDoneCount, the
  // same incremental counter _maybeCheckpoint already uses — see its own
  // doc comment. Used by LayerPanel's delete confirm (mirrors Clear layer's
  // existing confirm, #171) to skip the dialog for a genuinely empty layer.
  hasLayerContent(layerId: string): boolean
  setViewport(cx: number, cy: number, zoom: number, angle: number): void
  // Infinite canvas (#133 Phase 1) — camera-relative on-screen rendering.
  // (wx, wy) is the world point currently at screen center (unlike
  // setViewport's (cx, cy), a screen-space canvas-center position — there's
  // no fixed canvas rect to recenter around here). Meaningless/never read
  // for a bounded-canvas engine. Also updates the pointer transform, same
  // as setViewport does, so drawing and camera movement share one call.
  setInfiniteCamera(wx: number, wy: number, zoom: number, angle: number): void
  // Resizes the canvas backing buffer itself (infinite-canvas rooms only —
  // the canvas element IS the viewport there, so it must track the
  // viewport container's size; a bounded-canvas room's canvas size is
  // fixed for the room's lifetime and never calls this). Recreates every
  // canvas-size-dependent GL resource (_compositeFBO/_belowCache/
  // _aboveCache), same as context-restore already does for _initGL.
  resizeCanvas(width: number, height: number): void
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
  // `rate` (#108) scales that pacing — 2 plays the dabs twice as fast, 0.5
  // half as fast; defaults to 1 (real recorded speed, what the live-room
  // peer-reveal path above always uses). Captured once per queued op, not
  // live-adjustable mid-reveal — see PeerPreviewState's own doc comment.
  previewOperation(op: StrokeOperation, rate?: number): void
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
  // Exports the canvas exactly as displayed (paper texture baked in) by
  // default. Pass `transparent: true` for a second variant with no paper —
  // just the graphite/ink content, transparent where nothing is drawn (#15).
  //
  // #145: for an infinite-canvas room there's no fixed "whole drawing" rect
  // the way a bounded room's canvas.width x canvas.height already is one —
  // so this exports the tightest rect containing every layer's actual
  // painted content (getContentBounds's own union, at exactly 1 world unit
  // = 1 pixel) instead of whatever the camera happens to be looking at right
  // now. A bounded room's export is completely unaffected by this — see
  // _exportInfinitePNG's own doc comment for the full reasoning.
  exportPNG(transparent?: boolean): Promise<Blob | null>
  destroy(): void
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface EngineOpts {
  paper: PaperType
  paperColor?: [number, number, number]
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
  // `rate` travels with each queued op (not the peer state as a whole): the
  // lesson-replay player (#108) can change its global speed between two
  // strokes by the same author queued back-to-back, and each should play at
  // whatever rate was requested when *it* was queued, not retroactively
  // affect one already animating — see previewOperation's own doc comment.
  queue: Array<{ op: StrokeOperation; rate: number }>
  buf: AccumulationBuffer
  // (#138) World point this buffer's own pixel (0,0) represents — see
  // PencilEngine._cameraCenteredOrigin's doc comment for why this has to be
  // snapshotted once (at previewOperation's first queued op for this peer)
  // rather than re-derived from the live camera at every _composeToFBO
  // call: the buffer's actual painted pixels are already fixed relative to
  // whatever the camera was at paint time, in _stepPeerPreview.
  origin: { x: number; y: number }
  dabIdx: number
  startTime: number
  timer: ReturnType<typeof setTimeout> | null
}

// One scratch tile of a live gizmo-drag preview (#120/#139) — shaped exactly
// like a real PaintTarget (see ILayerBuffer.ts) so _drawCompositeItem can
// draw it through the same _drawTileComposite call a real resident tile
// goes through, just reading `buffer` instead of a real layer's own.
interface PreviewTile {
  originX: number
  originY: number
  buffer: AccumulationBuffer
}

// Pixel snapshot of a layer after its first `opIds.length` pixel operations.
// Valid only while those exact operations are still the layer's done prefix —
// checked at lookup time, so undo/redo never has to invalidate anything.
// One entry per buffer the layer held at snapshot time (#137: bounded layers
// always have exactly one, at origin (0,0); tiled layers have one per tile
// resident then — a tile not yet resident at snapshot time simply has no
// entry, same as it has no content, and restore leaves it absent rather than
// materializing an empty tile).
interface CheckpointTile {
  originX: number
  originY: number
  width: number
  height: number
  pixels: Uint8Array
}
interface Checkpoint {
  layerId: string
  opIds: string[]
  tiles: CheckpointTile[]
  // (#287) Set only for the synthetic checkpoint restoreLayerFromSnapshot
  // seeds — see its own doc comment for why this one must never be evicted
  // by the byte budget below the way an ordinary checkpoint can be.
  pinned?: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────────

// Default per-texture background, used when a room has no explicit
// PencilEngineOptions.paperColor override (see EngineOpts.paperColor below).
// Kept numerically identical to @grafetto/shared's DEFAULT_PAPER_COLORS
// (hex there, since CreateRoom's color picker needs a hex/RGB string; RGB
// float triple here, since that's what the shader uniform wants) — update
// both together if these defaults ever change.
// (#300) Keyed by coarseness, matching DEFAULT_PAPER_COLORS in shared —
// the tint tracks how coarse the stock is, not its fibre character.
const PAPER_COLORS_BY_COARSENESS: Record<PaperCoarseness, [number, number, number]> = {
  coarse: [0.96, 0.94, 0.90],
  medium: [0.97, 0.97, 0.96],
  fine:   [0.99, 0.99, 0.98],
}

function paperColorOf(type: PaperType): [number, number, number] {
  const coarseness = paperCoarsenessOf(type)
  return coarseness ? PAPER_COLORS_BY_COARSENESS[coarseness] : PAPER_COLORS_BY_COARSENESS.fine
}

// Paper-grain texture: baked once, offline (see ../scripts/bakePaperTextures.ts
// and src/paperNoise.ts), identical bytes shipped to every client — see
// _initPaper/paperLoader.ts. PAPER_WORLD_SIZE (imported from paperNoise.ts,
// which is also where the bake script gets it from) is the world-space size
// the baked tile repeats over, used identically by bounded and infinite
// rooms alike — see _paperWorldSize().

// #145: hard clamp (per axis) on exportPNG's infinite-room "whole drawing"
// render target — see _buildContentComposite's own doc comment for why this
// is a fixed constant rather than a live gl.MAX_TEXTURE_SIZE query. Every
// real device this app targets supports textures far bigger than this
// already; a drawing that legitimately spans more than ~8 tiles across in
// one axis (TILE_SIZE is 1024) is the one case this clips to a smaller rect,
// anchored at the content bounds' own top-left, rather than exporting in
// full — a known, deliberately-accepted limitation, not attempted here.
const MAX_EXPORT_DIMENSION_PX = 8192

export const DEFAULT_GRAPHITE_COLOR: [number, number, number] = [0.14, 0.14, 0.17]

// Undo depth is bounded by the log, not by memory: checkpoints only shorten the
// replay tail. Interval/budget are starting points to be tuned by measurement (#76).
const CHECKPOINT_INTERVAL = 20
const CHECKPOINT_BUDGET_BYTES = 256 * 1024 * 1024

// A single StrokeOperation's JSON size is unbounded in principle — a long
// fill/scribble held down for a while can reach thousands of dabs, and a
// production room hit strokes over 1MB (~4000 dabs) this way. That's large
// enough to silently fail to reach the server at all (past nginx's/Socket.IO's
// buffer limits — both default to ~1MB, and every proxy in between has its
// own such ceiling somewhere), which is a real, observed cause of "I drew
// something and it was gone after reload, undo/redo couldn't get it back" —
// the operation never made it into the log in the first place. 800 dabs is
// ~200KB at the byte-per-dab rate observed in that room's data, comfortably
// under any of those ceilings even before accounting for the safety margin
// raising them separately (see apps/server/src/index.ts's maxHttpBufferSize)
// already buys. See _flushStrokeChunk's own comment for the mechanism.
const STROKE_DAB_CHUNK_LIMIT = 800

// Smudge (#14) tuning constants — picked by eye, not yet exposed as
// settings (the tool's user-facing knobs are just size/pressure/opacity,
// reusing the existing dab fields — see toolSchemas.ts's smudge entry and
// _bakeDabOpacity's own smudge branch). See _paintOneSmudgeDab for how each
// is used.
//
// Reworked (#14 round 2) around a small graphite reservoir the tool itself
// carries (this._smudgeToolLoad) that exchanges with the paper at two
// separate contact points per dab, instead of copying a patch of pixels
// straight from one spot to another. That earlier patch-copy version had
// two reported problems no amount of tuning could fix, because they were
// baked into its shape: (1) a source patch, once sampled, was gone —
// nothing ever wrote a reduced value back to it, so a small mark could be
// smudged into full transparency by repeatedly working it against
// untouched neighboring paper (not how a real blending stump behaves — it
// can soften and spread a mark, never fully evacuate one), and (2) each
// dab pulled the destination toward its own separately-sampled patch via
// mix(), which doesn't accumulate across densely-overlapping dabs the way
// normal alpha "over" compositing does (what makes overlapping pencil dabs
// read as one continuous line) — so a slow stroke showed as a visible
// chain of separately-mixed circles.
//
// How far behind a dab (in dab radii) its pickup contact is sampled from —
// higher drags graphite further per dab; lower keeps the smear tighter/
// closer to a soft local blur.
const SMUDGE_OFFSET_FACTOR = 0.8
// Dab radius relative to Dab.size — matches pencil's own sizeMultiplier
// scale (see PENCIL_PRESETS) rather than a from-scratch tuning.
const SMUDGE_SIZE_MULTIPLIER = 1.0
// Fixed edge softness (DAB_FRAG/SMUDGE_TRANSFER_FRAG's u_hardness) — smudge
// has no per-grade preset the way pencil does to pull this from.
const SMUDGE_HARDNESS = 0.5
// Scratch-patch size rounding, in px — a smudge stroke normally keeps a
// constant brush size, so rounding to a coarse grid here means every dab
// after the first reuses the same pooled buffer instead of reallocating.
const SMUDGE_PATCH_GRANULARITY = 8
// Hard ceiling on the scratch patch's own side length, regardless of how
// large a brush size requests — bounds a single dab's worst-case GPU
// texture allocation.
const SMUDGE_MAX_PATCH_SIZE = 512
// Three contact points per dab (round 3, on real-artist feedback): a real
// fingertip/stump doesn't just skim one point behind the dab and stamp one
// point ahead of it — the whole contact area participates at once, with the
// trailing edge mostly picking up, the leading edge mostly laying down, and
// the center doing both plus pressing graphite into the paper's own low
// spots ("embedding" — see u_embed in SMUDGE_TRANSFER_FRAG). All three use
// the exact same _smudgeContact exchange formula (paper-vs-reservoir
// difference, both directions), just at different offsets along the dab's
// direction of travel and with different rates — see _paintOneSmudgeDab.
//
// Fraction of the difference between the paper's own graphite level (at a
// contact) and the tool's current reservoir that changes hands on a single
// dab, before the pressure/paperCatch/shape weighting SMUDGE_TRANSFER_FRAG
// applies per-fragment. Symmetric per contact: the same rate governs
// paper->tool pickup and tool->paper deposit there (see _smudgeContact) —
// which direction wins is just the sign of that contact's own difference.
const SMUDGE_REAR_RATE = 0.6
// Center contact: gentler than rear (it's not the primary transport, more
// "working the material in place"), plus the only one of the three with
// u_embed on — see that uniform's own comment.
const SMUDGE_CENTER_RATE = 0.35
// Front contact: forward of the dab (see SMUDGE_FRONT_OFFSET_FACTOR) —
// mostly ends up depositing in practice (fresh/lighter territory ahead
// means the reservoir is usually darker than what's there), without being
// hard-coded deposit-only the way this contact used to be.
const SMUDGE_FRONT_RATE = 0.4
// How far ahead of the dab (in dab radii) the front contact sits — smaller
// than SMUDGE_OFFSET_FACTOR's rear offset (0.8): the leading edge of a real
// fingertip anticipates less than the trailing edge trails.
const SMUDGE_FRONT_OFFSET_FACTOR = 0.5
// Hard per-dab cap on how much this._smudgeToolLoad can change from either
// exchange (pickup or deposit) — without this, a dead-center dab against a
// fully loaded/fully empty difference could transfer near-100% in one hop,
// the same "one hop nearly replaces everything" failure mode the old
// MAX_TRANSFER constant guarded against.
//
// Also, separately, what bounds how hard the first few dabs of a *genuinely
// fresh* reservoir (a user's very first-ever smudge touch, or a legacy
// stroke recorded before smudgeLoadAtStart existed) can bite: round 1 found
// that working a blending stump back and forth *within* one already-solid,
// heavily-pressed area still visibly lightened it, because pickup at a
// contact is a plain proportional reduction with no equivalent to deposit's
// natural ceiling (an "over" blend onto already-near-opaque content is
// close to a no-op, but erasing from it is not) — a fresh reservoir's own
// ramp-up phase eroded a real, visible amount before it caught up, even
// though the eventual redeposit mostly couldn't show up against content
// that dark already.
//
// That first fix lowered this from 0.3 to 0.08, which also turned out to
// quietly cap how strong smudging could ever feel: rate*pressure*opacity
// (up to ~0.6 at full Strength) almost always exceeded 0.08 once there was
// any real paper-vs-reservoir difference to work with, so this constant —
// not the Strength slider — was the actual ceiling on every dab regardless
// of setting (reported: "even at 100% it feels weak"). Round 3's other
// fixes (three contacts sharing one exchange formula, headroom-aware
// deposit accounting, a per-user reservoir that persists across strokes
// instead of ramping up from empty every time) already address the
// original round-1 bug through different, sturdier mechanisms than a tiny
// cap ever did, so this can afford to be far less conservative now — the
// "fresh reservoir bites too hard" case is also just much rarer post-
// persistence (a user's very first touch, not every single stroke).
const SMUDGE_MAX_STEP = 0.75
// paperCatch floor below which SMUDGE_TRANSFER_FRAG's pickup branch
// contributes ~zero, regardless of pressure/rate or how many separate
// strokes have already worked the spot — see that shader's own comment for
// why a plain per-dab rate penalty (paperCatch as a multiplier) still let a
// mark be smudged into full invisibility given enough repeated strokes, and
// why a real per-pixel ceiling was needed instead.
//
// Lowered from 0.4 (reported smudging still felt weak even at max Strength
// and a raised SMUDGE_MAX_STEP): 0.4 meant a sizeable share of the paper's
// own texture — everywhere its paperCatch sits below that — never gave up
// any graphite at all, on top of every other rate limit. The floor's own
// job (a spot's paper grain can leave *some* of it permanently unreachable
// — see SMUDGE_PICKUP_FLOOR's file-level comment above) is still intact at
// a lower value, just covering a narrower share of the paper's own texture
// (its deepest valleys, not its whole lower half).
const SMUDGE_PICKUP_FLOOR = 0.25

// Marker (#250, ADR 004; split per-nib in "Ревизия v1.5" — #268): a real
// marker has no hardness *scale* the way graphite's grades do (same
// reasoning LINER_PRESET's own comment gives: one physical material, not a
// per-grade spread), but bullet and chisel are still two different
// physical tips, not just two dab shapes — a chisel's own wider contact
// area means the same opacity number would read as darker per pass than
// bullet's, purely from covering more area per dab, not from actually
// being "more marker." Still uncalibrated first-pass numbers (same "verify
// by eye and retune" status every other first-pass constant in this
// codebase carries):
//  - opacity: moderate for both, well under liner's near-saturated 0.95 —
//    ADR 004 §5 deliberately relies on the composite's own asymptotic
//    darkening ("2-3 passes darkens toward a limit") rather than a single
//    stroke reaching full coverage the way a fineliner's first pass does.
//    Chisel's is lower than bullet's — same "wider contact, lower local
//    dose" reasoning as MARKER_CHISEL_ASPECT_RATIO's own effect on area.
//  - hardness: inert since #330. The marker's edge is geometry now, resolved
//    over a fixed canvas-pixel ramp (MARKER_EDGE_AA_PX), so no branch it
//    reaches ever reads this; PencilPreset simply requires the field.
//  - sizeMultiplier: 1 for both — no calibrated size step to derive this
//    from yet, same "no fudge factor" reasoning as LINER_PRESET's own.
const MARKER_BULLET_PRESET: PencilPreset = { opacity: 0.45, hardness: 0.78, sizeMultiplier: 1.0 }
const MARKER_CHISEL_PRESET: PencilPreset  = { opacity: 0.36, hardness: 0.68, sizeMultiplier: 1.0 }

// #330 stage 2: width of the marker's edge ramp, in canvas pixels — the one
// number that decides how crisp the tool reads, and deliberately an absolute
// one. The profile it replaces spent a fixed *fraction* of the dab on its
// falloff (36-40% of the mark's half-width at every size), so a 120px brush
// came out with a ~44px gradient; a real felt/alcohol tip has an edge whose
// width is a property of the tip, not of how wide the tip is.
//
// Canvas pixels, not screen pixels: dabs are baked into the layer's own
// world-space buffer and the viewport transform is applied later at display
// time, so a screen-space width would make the same Operation Log render
// differently at different zoom — see .claude/rules.md on cross-device
// determinism for why that class of dependency is not acceptable here.
//
// 1.0 is the natural starting point (one pixel of ramp is what a hard edge
// costs to antialias at all); this is an uncalibrated first pass like every
// other marker constant, and the paper-driven bleed that used to hide inside
// the old falloff is deliberately not folded back in yet — stage 3.
const MARKER_EDGE_AA_PX = 1.0

// #330 stage 3: how far the ribbon's straight chords may deviate from the curve
// they approximate before sampling gets denser (DabSystem.curvatureTolerancePx).
//
// 0.15px, not the half pixel this started at. The first value was picked
// against the path's own sagitta alone and left visible rounded scalloping on
// turns with a wide nib: the dominant error is the nib's *reach* amplifying the
// turn (see DabSystem.curvatureTolerancePx), and against a 1px edge ramp a
// periodic 0.5px wobble is roughly half the boundary pixel's alpha — plainly
// visible now that nothing blurs it. A fraction of the ramp width is the right
// scale for this; sample count only grows with sqrt(1/tol), so tightening it
// this far costs ~1.8x the samples on the curves where it binds at all, and
// nothing on straight strokes.
const MARKER_CURVATURE_TOLERANCE_PX = 0.15

// #330 stage 3, ADR 004 §1 revisited: the chisel nib is a rounded rectangle,
// not an ellipse. A flat felt tip really does have parallel sides and a short
// rounded end; an ellipse tapers all the way along its length, which reads as a
// calligraphy pen and never produces the flat broad band a chisel marker is
// bought for. Only reachable now that the ribbon makes the union exact for any
// convex nib — as a *stamp* shape a rounded box was measurably worse than the
// ellipse (26.3px of scalloping against 21.0px at the same spacing), because a
// flat side translates as a whole.
//
// Corner radius as a fraction of the nib's short half-axis; the expert's
// suggested range was 0.20-0.35 and this sits in the middle. Uncalibrated first
// pass like every other marker constant.
const MARKER_CHISEL_CORNER_FRACTION = 0.28

// #330 stage 3: how much less ink the nib lays down right at its rim than at
// its centre. Deliberately shallow — a marker's mark is close to uniform across
// the tip, and the old soft profile (which tapered all the way to zero) is what
// made a light touch read as an airbrush instead of a marker. The silhouette's
// crispness now comes from geometry, so this term no longer has to double as an
// edge; it only keeps the mark from looking mechanically flat.
const MARKER_INK_EDGE_FALLOFF = 0.9

/** Per-marker-stroke, per-tile scratch state (follow-up to #250: the
 *  original per-dab patch-copy-then-multiply design compounded darker at
 *  every dab overlap, since it multiplied whatever the *previous dab of
 *  this same stroke* had already written — and multiply has no natural
 *  ceiling the way normal "over" accumulation does, so a dense, heavily-
 *  overlapping stroke showed regular dark banding/chevrons at the dab-
 *  spacing interval, worst on the elongated chisel nib. See #251/QA — real
 *  reproduction on both desktop and a tablet). Fixed by separating two
 *  concerns that used to be conflated into one "read the live layer" step:
 *
 *  - `original`: this tile's content exactly as it was *before* this stroke
 *    touched it, frozen the first time the stroke reaches this tile and
 *    never updated again for the rest of the stroke.
 *  - `coverage`: this stroke's silhouette/alpha only — how much of the tile
 *    this stroke has visually touched so far, a perfectly ordinary
 *    saturating "over" splat (DAB_FRAG's u_inkMode>2.5 branch), so densely
 *    overlapping dabs converge to one smooth flat value instead of
 *    compounding.
 *  - `inkLoad` (ADR 004 "Ревизия v1.5"): how much ink this stroke has
 *    actually *deposited* so far — accumulated *additively*
 *    (AccumulationBuffer.beginAdditiveDraw, no per-splat ceiling), by
 *    `dab.opacity * segmentLength` per dab (distance-normalized — see
 *    _paintMarkerRibbon), not a flat per-dab amount. Deliberately separate
 *    from `coverage`: conflating the two into one saturating value (v1's
 *    own design) meant a spot that had already reached full coverage
 *    stopped darkening on further overlapping passes within the same
 *    stroke — wrong, a real marker keeps darkening (toward its own
 *    asymptote) if you scribble back over the same spot without lifting.
 *
 *  DAB_FRAG's u_inkMode>1.5 branch multiplies `original` by a darkness
 *  derived from the *total* accumulated `inkLoad` (saturating only at read
 *  time, `1 - exp(-inkLoad*rate)`) every time it redraws a dab's footprint,
 *  and separately blends alpha toward 1 by `coverage` — always against the
 *  same frozen base, never the previous dab's own already-multiplied
 *  output.
 *
 *  Lives for exactly one stroke, never reused across strokes (unlike
 *  smudge's own per-user reservoir, a real carried physical resource) —
 *  see engine._onStart/_onEnd for the live-drawing lifecycle, and
 *  _paintMarkerDabs' own doc comment for the one-shot-replay case (which
 *  just creates and destroys its own throwaway instance within one call,
 *  needing no cross-call lifecycle at all). */
class MarkerStrokeScratch {
  private _tiles = new Map<AccumulationBuffer, { original: AccumulationBuffer; coverage: AccumulationBuffer; inkLoad: AccumulationBuffer }>()
  private readonly gl: WebGLRenderingContext

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
  }

  /** Keyed by the tile's own AccumulationBuffer identity — stable across
   *  repeated resolveForPaint calls for the same resident tile (see
   *  TiledLayerBuffer.getOrCreateTile), so no tile-coordinate bookkeeping is
   *  needed here. 'nearest' filtering: all three buffers are always sampled
   *  1:1 (same size and pixel alignment as the tile they mirror — see
   *  DAB_FRAG's own u_original/u_strokeCoverage/u_inkLoad comment), so
   *  'linear' would buy nothing and 'nearest' keeps this deterministic
   *  across GPU vendors, same reasoning every other scratch-texture pool in
   *  this file already follows (paper grain's own hard-won lesson — see
   *  .claude/rules.md).
   *
   *  v1 accepted gap: if this tile gets evicted (TiledLayerBuffer's memory
   *  budget) mid-stroke and later recovered as a *new* AccumulationBuffer
   *  instance, this map won't recognize it as the same tile and will
   *  silently re-snapshot — a fresh (still correct, just not maximally
   *  "original") base rather than a crash or a wrong result. Not worth
   *  guarding against for v1: a single marker gesture spans very few tiles,
   *  nowhere near what it'd take to force an eviction on its own. */
  getOrCreate(tile: AccumulationBuffer): { original: AccumulationBuffer; coverage: AccumulationBuffer; inkLoad: AccumulationBuffer } {
    let entry = this._tiles.get(tile)
    if (!entry) {
      const original = new AccumulationBuffer(this.gl, tile.width, tile.height, 'nearest')
      tile.copyTo(original)
      const coverage = new AccumulationBuffer(this.gl, tile.width, tile.height, 'nearest')
      coverage.clear()
      const inkLoad = new AccumulationBuffer(this.gl, tile.width, tile.height, 'nearest')
      inkLoad.clear()
      entry = { original, coverage, inkLoad }
      this._tiles.set(tile, entry)
    }
    return entry
  }

  destroy(): void {
    for (const { original, coverage, inkLoad } of this._tiles.values()) {
      original.destroy(); coverage.destroy(); inkLoad.destroy()
    }
    this._tiles.clear()
  }
}

function clampNum(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class PencilEngine implements PencilEngineAPI {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private _opts: EngineOpts
  private _grainMode: number | undefined
  private _charcoalGrainMode: number | undefined
  private _paperFillThreshold: number
  private _paperFillCap: number
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
  // rAF-anchored display latency — see StrokeDebugStats.avgFrameLatencyMs.
  // Pending is the timestamp of the latest move sample not yet consumed by
  // a _scheduleDisplay() rAF firing; null when there's nothing outstanding
  // (just reset, or already consumed) so that rAF callback knows not to
  // double-count a frame no new input actually fed.
  private _dbgPendingFrameTimestamp: number | null = null
  private _dbgFrameSum = 0
  private _dbgFrameCount = 0
  private _dbgMaxFrame = 0

  // Pointer-prediction preview (#92) — all no-ops unless _predictPointer is
  // true. _previewBuf is a dedicated, stroke-scoped AccumulationBuffer (not
  // any layer's real buffer): created on stroke start, repainted from scratch
  // on every real move, and destroyed on stroke end, so a wrong prediction
  // never survives past the stroke it was guessed for and never touches
  // permanent pixel state.
  //
  // (#138) _previewBufOrigin is the world point this buffer's own pixel
  // (0,0) represents, snapshotted once at stroke start via
  // _cameraCenteredOrigin() — see that method's doc comment for why a fixed
  // canvas-sized scratch buffer needs *some* origin at all for infinite
  // rooms, and why it's captured once rather than re-derived from the live
  // camera on every repaint/composite.
  private _predictPointer: boolean
  private _previewBuf: AccumulationBuffer | null = null
  private _previewBufOrigin = { x: 0, y: 0 }
  // (#155) Backing GL object for _previewBuf, kept alive across strokes —
  // see _acquirePreviewBuf's own comment for why. null exactly when
  // _previewBuf has never been created yet or was invalidated by context
  // loss; _previewBuf itself is still nulled every stroke end (see _onEnd)
  // so _display()'s `if (this._previewBuf)` blend-skip is unaffected.
  private _previewBufPool: AccumulationBuffer | null = null

  // Live-tip segment preview (#104) — all no-ops unless _liveTip is true.
  // _tipBuf is a dedicated, stroke-scoped AccumulationBuffer, same lifecycle
  // pattern as _previewBuf: created on stroke start, cleared and repainted
  // from scratch on every real move (never accumulated), destroyed on stroke
  // end. See DabSystem.peekTipDabs() and _refreshTip() below.
  //
  // (#138) _tipBufOrigin: see _previewBufOrigin just above — same purpose,
  // captured at the same time (stroke start), for this buffer instead.
  private _liveTip: boolean
  private _tipBuf: AccumulationBuffer | null = null
  private _tipBufOrigin = { x: 0, y: 0 }
  // (#155) Same pooling as _previewBufPool above, see _acquireTipBuf.
  private _tipBufPool: AccumulationBuffer | null = null

  // (#155) Scratch buffers for _bakeTransform's per-destination-tile pass —
  // unlike _tipBufPool/_previewBufPool (always exactly one buffer, canvas-
  // sized), a single bake can need many alive at once (one per destination
  // tile, see _bakeTransform's own docstring on why they can't be freed
  // until every one has finished rendering). Kept as a size-keyed free list
  // instead: idle between commits, reused instead of reallocated (and
  // re-paying _makeFBO's checkFramebufferStatus GPU sync) on the next one.
  // Every tile a single bake touches is the same size (a room's tile grid
  // never changes shape after construction — see _tileSize), so in practice
  // this settles into a pool of uniformly-sized buffers after the first bake.
  private _transformScratchPool: AccumulationBuffer[] = []

  // Smudge scratch patches (#14) — a small size-keyed free list, same
  // pooling shape as _transformScratchPool above (see
  // _acquireSmudgeScratchBuf/_releaseSmudgeScratchBuf), kept deliberately
  // separate from it rather than sharing it: transform's scratch buffers
  // are always LINEAR-filtered (its resample relies on that), smudge's are
  // always NEAREST (see AccumulationBuffer's own 'nearest' filter comment
  // for why) — sharing one pool would risk handing either caller a buffer
  // filtered the wrong way for what it's about to do with it.
  private _smudgeScratchPool: AccumulationBuffer[] = []

  // Marker's own per-stroke, per-tile scratch (original content + this
  // stroke's accumulated coverage — see MarkerStrokeScratch's own doc
  // comment). Non-null exactly while a *local* marker stroke is in
  // progress: created in _onStart, destroyed and nulled in _onEnd. A
  // one-shot full-array _paintMarkerDabs call (replay/undo/redo/checkpoint/
  // most peer ops) never touches this field at all — it creates and tears
  // down its own throwaway instance within that single call instead (see
  // _paintMarkerDabs' own doc comment).
  private _markerStrokeScratch: MarkerStrokeScratch | null = null
  // The gesture this stroke belongs to (StrokeOperation.strokeId) — one id
  // from pen-down to pen-up, stamped on every chunk _flushStrokeChunk emits
  // along the way as well as on the final op.
  private _strokeId: string | null = null
  /** Replay-side counterpart of _markerStrokeScratch: keeps one gesture's
   *  scratch alive across the several operations it was chunked into.
   *
   *  Live, every chunk of a gesture paints through the same scratch, so the
   *  layer content the marker multiplies is frozen once, at pen-down. Replay
   *  gave each operation a throwaway scratch instead, which froze the content
   *  *including whatever the previous chunk had just painted* — so the second
   *  chunk multiplied over the first one's output and left a nib-shaped dark
   *  band across the stroke at every boundary. It also had no previous dab to
   *  hand the ribbon, so no band bridged the two chunks.
   *
   *  One slot, not a map: a gesture's chunks are consecutive in the log and
   *  arrive in order, so anything else interleaving simply starts a new slot —
   *  which is the old behaviour, a seam, rather than a wrong result. */
  private _replayMarkerChunk:
    | { strokeId: string; target: ILayerBuffer; scratch: MarkerStrokeScratch; lastDab: Dab }
    | null = null

  // Smudge's own carried-graphite reservoir (#14 round 4), keyed by userId —
  // "the tool belongs to whoever's holding it": two users smudging at the
  // same time in the same room must never share one reservoir (an earlier,
  // single-scalar version of this field could get clobbered mid-stroke by a
  // remote peer's own smudge operation arriving through the same paint path
  // — see _smudgeContact's own comment). Missing entry == an empty/never-
  // touched reservoir, same as a fresh 0. No entry is ever deleted — a
  // user's reservoir persists across separate strokes/gestures now (see
  // _onStart no longer resetting it), which is the whole point: a real
  // fingertip/stump doesn't get wiped clean just because you lifted it for
  // a second between passes. What each *recorded* StrokeOperation captures
  // (see StrokeOperation.smudgeLoadAtStart/End in packages/shared) is what
  // makes this still deterministic under replay/remote application despite
  // persisting: every op says exactly what the reservoir was before/after
  // it ran, so applying it always reproduces the same result regardless of
  // whatever this map happened to hold a moment before (see _applyPixelOp's
  // and appendOperation's own stroke cases, which seed this map from the
  // op's own smudgeLoadAtStart before painting).
  //
  // Round 4: lives entirely on the GPU now, not as a JS number/color pair —
  // a 1x1 AccumulationBuffer pair per user (rgb=carried color, a=load),
  // ping-ponged (WebGL1 forbids reading and writing the same texture in one
  // draw call, same reasoning every other scratch-then-copy two-phase
  // commit in this file already follows). Reported after round 3 shipped:
  // rooms with a lot of smudging in their history took noticeably longer to
  // (re)join — every exchange used to read the patch average back to the
  // CPU via gl.readPixels, a genuine GPU/CPU sync stall invisible spread
  // across interactive drawing (one dab per pointer move) but very much not
  // replaying a history tail dab-by-dab in a tight loop on join (#149's
  // snapshot+tail-replay design). An earlier fix cut 3 reads/dab to 2 (by
  // interpolating the center contact); this redesign cuts it to *zero*
  // per-dab reads — the whole exchange (SMUDGE_COMPUTE_FRAG) and paint
  // (SMUDGE_TRANSFER_FRAG) now run without the CPU ever seeing the
  // reservoir's numeric value, except once per stroke/chunk (not per dab)
  // to bake StrokeOperation.smudgeLoadAtStart/End — see _smudgeCaptureLoad. */
  private _smudgeReservoirs = new Map<string, { bufs: [AccumulationBuffer, AccumulationBuffer]; current: 0 | 1 }>()
  // Single reusable 1x1 scratch for SMUDGE_COMPUTE_FRAG's own u_outputMode=1
  // output (this contact's pickup/deposit amounts) — never needs pooling by
  // size the way _smudgeScratchPool does (always exactly 1x1), and only one
  // contact's compute is ever in flight at a time (dabs, and each dab's
  // three contacts, are processed strictly sequentially).
  private _smudgeTransferScratch: AccumulationBuffer | null = null
  // This stroke/chunk's own "reservoir level before its first dab" — see
  // StrokeOperation.smudgeLoadAtStart's own comment. Captured at _onStart
  // (true stroke start) and refreshed at the top of the *next* chunk right
  // after _flushStrokeChunk records the previous one, so a stroke long
  // enough to span multiple recorded chunks still gives each chunk its own
  // correct starting value instead of every chunk after the first claiming
  // the whole gesture's original starting point.
  private _smudgeChunkLoadAtStart = 0

  // Haptic grain experiment (see HapticGrain.ts) — null unless opted in.
  private _haptic: HapticGrain | null
  private _hapticX = 0
  private _hapticY = 0

  // Ruler tool (#89) — local-only guide state (never an Operation, same
  // status as the grid/measure overlays), consulted by _onStart/_onMove/
  // _onPredict via _snapPoint() to project a raw pointer position onto the
  // ruler's line before it ever reaches DabSystem. null = no ruler placed,
  // or the tool is off. See setRuler()/rulerSnap.ts.
  private _ruler: RulerLine | null = null

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
  // Transparent-export variant of _dispProg (#15) — see DISPLAY_TRANSPARENT_
  // FRAG's comment for why this needs its own tiny program rather than a
  // branch inside DISPLAY_FRAG.
  private _dispTransparentProg!: WebGLProgram
  private _compositeProg!: WebGLProgram
  private _blitProg!: WebGLProgram
  private _transformProg!: WebGLProgram
  // Smudge (#14) — paired with the existing DAB_VERT (see SMUDGE_TRANSFER_
  // FRAG's own doc comment for why it never uses DAB_VERT_INSTANCED).
  private _smudgeProg!: WebGLProgram
  // The GPU-resident exchange compute pass (#14 round 4) — paired with
  // DISPLAY_VERT (a plain full-screen quad; its own 1x1 target doesn't need
  // dab-quad geometry) rather than DAB_VERT.
  private _smudgeComputeProg!: WebGLProgram
  // Marker ribbon (#330 stage 2) — the bands between consecutive nib stamps
  // (markerRibbon.ts). Its own tiny program: unlike every other dab draw, the
  // vertices arrive already positioned by the CPU and carry a per-vertex
  // distance-to-edge, so neither DAB_VERT's uniforms nor DAB_FRAG's branches
  // apply.
  private _ribbonProg!: WebGLProgram
  private _ribbonUni!: Record<string, WebGLUniformLocation | null>
  private _ribbonPosLoc!: number
  private _ribbonEdgeLoc!: number
  private _ribbonInkLoc!: number
  private _ribbonBuf!: WebGLBuffer
  private _dabUni!: Record<string, WebGLUniformLocation | null>
  private _dispUni!: Record<string, WebGLUniformLocation | null>
  private _dispTransparentUni!: Record<string, WebGLUniformLocation | null>
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _blitUni!: Record<string, WebGLUniformLocation | null>
  private _transformUni!: Record<string, WebGLUniformLocation | null>
  private _smudgeUni!: Record<string, WebGLUniformLocation | null>
  private _smudgeComputeUni!: Record<string, WebGLUniformLocation | null>
  private _dabPosLoc!: number
  private _dispPosLoc!: number
  private _dispTransparentPosLoc!: number
  private _compositePosLoc!: number
  private _blitPosLoc!: number
  private _transformPosLoc!: number
  // Attribute locations are per-*program*, not per-shader-source — even
  // though _smudgeProg shares DAB_VERT's exact source with _dabProg, it's a
  // separately linked program, so 'a_position' can land at a different
  // location number in it and _dabPosLoc must not be reused here.
  private _smudgePosLoc!: number
  private _smudgeComputePosLoc!: number
  private _quadBuf!: WebGLBuffer
  private _screenBuf!: WebGLBuffer
  private _compositeFBO!: AccumulationBuffer

  // Infinite canvas (#133 Phase 1) — camera-relative on-screen rendering.
  // _drawTileComposite draws one tile at its correct screen position (see
  // its own comment); _infiniteCamera is the current world point at screen
  // center, zoom, and rotation — set via setInfiniteCamera(), meaningless
  // (never read) for a bounded-canvas engine. Unlike setViewport()'s
  // {cx,cy}, which is a screen-space canvas-center position for the CSS-
  // panned bounded-canvas path, this is a direct world-space reference
  // point — there's no fixed canvas rect to recenter around once the
  // canvas element itself just is "the viewport."
  private _infiniteCamera = { wx: 0, wy: 0, zoom: 1, angle: 0 }

  // (#155 follow-up) Cached canvas.getBoundingClientRect() for
  // setInfiniteCamera's pointer-transform closure — see _getCanvasRect's own
  // doc comment for why this is safe to cache and what invalidates it.
  private _canvasRectCache: DOMRect | null = null

  // (#147) See suspendDisplay/resumeDisplay's own doc comments.
  private _displaySuspendDepth = 0

  // Below/above split-composite cache (#122) — _runComposite normally
  // re-blits every visible layer/folder-child from _compositeOrder into
  // _compositeFBO on every call, which is the thing this whole cache exists
  // to avoid: cost scales linearly with layer count even though a painted
  // move-event only ever changes the *active* layer's own texture. Instead,
  // _belowCache holds every _compositeOrder entry strictly below the active
  // layer pre-blended into one buffer, _aboveCache the same for entries
  // strictly above it; the active layer's own (always-current) texture is
  // composited between them fresh each frame. Neither cache ever contains
  // the active layer's own pixels, so repainting it (the hot path — see
  // _paintStrokeDabs) never has to invalidate anything here.
  //
  // _splitCacheDirty is the single source of truth for staleness — see
  // _invalidateSplitCache(). It must flip true on *every* event that can
  // change what's baked into either half: _compositeOrder or _activeId
  // themselves changing (setCompositeOrder/setActiveLayer), or any pixel
  // mutation landing on a layer other than the current active one (remote
  // stroke/layer_clear/image_import, layer_transform bake — #120 — merge,
  // structural undo/redo replay, context restore). Grep this file for
  // `_invalidateSplitCache(` for the exhaustive list of call sites; each is
  // commented with why it must invalidate. Deliberately conservative: when
  // in doubt a call site invalidates rather than trying to prove it's safe
  // not to, since a missed invalidation would silently composite stale
  // pixels (wrong blend order can look almost-right — see the issue).
  //
  // Bypassed entirely (not read, not written) whenever a layer-transform
  // gizmo preview is active (_transformPreview.size > 0, #120): that path
  // can substitute scratch content for *any* layer, active or not, on every
  // drag frame, and reasoning about invalidating a persistent cache through
  // it isn't worth it — drags aren't the hot path this exists for. See
  // _runComposite.
  private _belowCache!: AccumulationBuffer
  private _aboveCache!: AccumulationBuffer
  private _splitCacheDirty = true

  // Infinite canvas rotation (#134) — _runComposite builds the unrotated,
  // zoom-applied composite into this buffer instead of the real (canvas-
  // sized) target for infinite rooms; _finishInfiniteComposite then does
  // exactly one final rotate blit from here into the real target. Sized
  // to _renderBufferExtent() — a square big enough (canvas's own half-
  // diagonal, doubled) that any rotation of the camera still finds the
  // whole screen covered by content this buffer actually holds. Bounded
  // rooms never read/write this (their rotation is the DOM canvasWrap's
  // own CSS transform, orthogonal to this file) — allocated anyway at
  // plain canvas size for them, just to keep _initGL/resizeCanvas free of
  // a mode branch; _runComposite is what actually skips it.
  private _assemblyFBO!: AccumulationBuffer

  // #134-follow-up: the pixel position within the *current* composite
  // target (the real canvas for bounded rooms; _assemblyFBO for infinite
  // ones) that the camera's own world point (wx, wy) maps to — what
  // _worldToScreenEdgeX/Y actually center on. Set once per _runComposite
  // call, read by every _drawTileComposite call within it (all of them
  // originate from that one _runComposite, synchronously, so this is safe
  // shared state, same pattern _infiniteCamera itself already is).
  //
  // For a bounded room (or a canvas-sized buildFbo target generally) this
  // is trivially canvas.width/2, canvas.height/2. For infinite rooms it is
  // NOT _assemblyFBO's own half-size (ext/2) — that was the pre-fix bug:
  // ext/2 - canvas.width/2 is only an integer by luck (ext and canvas.width
  // rarely share the same parity), so the final rotate blit
  // (_finishInfiniteComposite) was translating by a fractional pixel at
  // *every* zoom/angle, even angle=0 — bilinear-resampling (bilinear is
  // AccumulationBuffer's fixed filter mode) every single pixel against its
  // neighbors on every frame, a constant, uniform softening any infinite
  // room's whole image had that a bounded room's direct-to-screen
  // _drawTileComposite path never does. Padding to _assemblyPad()'s
  // *rounded* half-difference instead keeps the offset between this and
  // canvas.width/2 an exact integer, so the angle=0 case (by far the
  // common one) is a lossless, pixel-aligned copy — only an actively
  // rotated camera still resamples, which is expected and unavoidable
  // there regardless.
  private _compositeCenterX = 0
  private _compositeCenterY = 0

  // (#301) Composite-target pixels per world unit — the scale
  // _worldToScreenEdgeX/Y place tiles at, set alongside _compositeCenterX/Y
  // and read by the same callers under the same "one _runComposite, all
  // synchronous" contract.
  //
  // NOT simply the camera's zoom for an infinite room: it's min(1, zoom),
  // with whatever's left over (zoom / this) applied by the single screen
  // pass at the end instead. Above zoom 1 that's the difference between one
  // resample and two. The old assembly-at-zoom arrangement magnified tiles
  // into the assembly buffer (resample #1) and then rotated that (resample
  // #2), and two chained bilinear passes over pencil texture visibly mush
  // it. Drawing the assembly at world resolution instead makes the first
  // step an exact 1:1 texel copy — tile origins are integers, so every
  // rounded edge in _worldToScreenEdgeX/Y lands exactly on a texel boundary
  // — leaving exactly one resample, in _composePaperToScreen, the same
  // count a bounded room's CSS-transformed canvas has always had.
  //
  // Capped at 1 rather than following zoom upward because there is no
  // information above world resolution to preserve: strokes are stored in
  // world-space tiles, so an assembly buffer denser than that would just be
  // an early magnification of the same texels. Below zoom 1 it does follow
  // zoom (the screen genuinely holds fewer pixels than the world does), so
  // that case keeps its existing behavior exactly.
  //
  // Costs nothing in memory: the assembly buffer stays its fixed
  // half-diagonal square (see _renderBufferExtent) and a zoomed-in camera
  // simply needs less of it — no reallocation on zoom, which would be GPU
  // alloc churn on the one gesture that can least afford it.
  private _compositeScale = 1

  // #141: infinite-only, camera-relative "paper peeking through" pass —
  // see PAPER_COMPOSE_FRAG's own comment for the full pipeline reasoning.
  // (#301) One pass, straight from _assemblyFBO to the screen: it applies
  // the camera's rotation *and* samples paper at the resulting world
  // position, so the grain is generated per screen pixel and never
  // resampled. The separate pre-rotation blend buffer this used to need is
  // gone entirely.
  private _paperComposeProg!: WebGLProgram
  private _paperComposeUni!: Record<string, WebGLUniformLocation | null>
  private _paperComposePosLoc!: number

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

  // Live layer-transform gizmo preview (#120, generalized to multiple tiles
  // by #139) — one or more scratch tiles per layer currently being dragged,
  // keyed by layerId. Same non-destructive pattern as _previewBuf/_tipBuf:
  // the real layer buffer is never touched until the gizmo is released and
  // a real layer_transform op lands via appendOperation —
  // _drawCompositeItem substitutes these in for their layerId's real
  // tile(s) while present. A layer spread across (or, post-transform,
  // spread across) more than one tile needs more than one scratch buffer,
  // each positioned like a real PaintTarget — see PreviewTile and
  // previewLayerTransform/clearLayerTransformPreview.
  private _transformPreview = new Map<string, PreviewTile[]>()

  // Reference-image import (#88) — keyed by the op's own data URL, so
  // replaying the same room twice (e.g. undo/redo rebuilding a layer) never
  // redecodes an image it's already decoded once this session.
  private _imageCache = new Map<string, HTMLImageElement>()

  // Paper texture — a placeholder set synchronously in the constructor (and
  // on context-restore), swapped for the real baked texture once _initPaper's
  // async load resolves. _paperReady lets a caller (tests, Room.tsx's
  // history-replay sites) await that swap deterministically instead of
  // guessing tick counts.
  private _paperTex!: WebGLTexture
  private _paperReady: Promise<void> = Promise.resolve()
  // True once the real (non-placeholder) paper texture has loaded at least
  // once — false right after construction and right after a context-restore
  // (both rebind a genuinely-meaningless placeholder), but never reset by a
  // later setPaper() type switch: that swaps between two already-loaded real
  // textures (the previous type stays bound and valid until the new one is
  // ready — see _initPaper), so there's nothing invalid to guard against
  // there. Gates _onStart below: a stroke painted against the placeholder
  // would bake in its flat, meaningless response permanently, with nothing
  // later to re-paint it once the real texture arrives (only the display/
  // composite step re-runs on demand, not already-applied pixel operations)
  // — a real bug this closes, found via a live cross-device paper-grain
  // comparison where the very first strokes of a freshly-opened room came
  // out wrong on whichever device's network happened to be slower to load
  // the (multi-MB) paper asset. Deliberately separate from `_locked` (a
  // public, user-controlled room-lock feature) rather than reusing it —
  // conflating the two would risk this auto-clearing a lock the user
  // explicitly asked for.
  private _paperTexLoaded = false

  // Infinite (tiled) canvas mode (#133 Phase 1) — see PencilEngineOptions.infinite.
  private readonly _infinite: boolean

  // Layer management
  private _layers: Map<string, ILayerBuffer>
  private _baseLayerIds: Set<string> // pre-log layers (background, initial layer)
  private _compositeOrder: CompositeItem[]
  private _activeId: string | null
  private _locked: boolean

  // WebGL context loss (#121) — true between webglcontextlost and
  // webglcontextrestored. Only gates _takeCheckpoint (see there for why);
  // everything else is a harmless no-op on a lost context per spec.
  private _contextLost = false

  // Set at the top of destroy() — guards _initPaper's async continuation
  // (its getPaperBytes() await can still resolve after destroy() ran) from
  // touching a dead gl context.
  private _destroyed = false

  // Operation log — source of truth; buffers and checkpoints are derived caches
  private _log: OperationLog
  private _checkpoints: Checkpoint[]
  private _checkpointBytes: number
  // (#169) Running total of entries absorbHistoricalOperations has ever
  // prepended — see getOperationsSinceRestore's own doc comment. Entries at
  // local seq < this value are the historical prefix; renumbering on every
  // OperationLog.prependHistorical call keeps that boundary meaningful even
  // across several backfill pages.
  private _historicalEntryCount = 0

  // In-flight stroke, recorded as one StrokeOperation on pointer up
  private _strokeLayerId: string | null
  private _strokeTool: ToolType
  private _strokePreset: string
  private _strokeColor: [number, number, number]
  private _strokeDabs: Dab[]
  private _strokeStartTimestamp = 0 // PointerEvent.timeStamp at stroke start — Dab.t is elapsed since this

  // #278: marker chisel nib's live angle setting — canvas-space radians
  // (the caller, Room/index.tsx, resolves the "lock to canvas" checkbox and
  // the local viewport's own rotation into this single canvas-space number
  // before calling setMarkerAngle; the engine itself never needs to know
  // about either). Read at both shapingForTool call sites (_onStart and
  // _paintDwellDab) so a live change takes effect on the *next* stroke, same
  // as every other setXxx tool option — never mid-stroke (DabSystem.
  // setShaping's own doc comment: a profile change partway through an
  // in-progress _buf isn't supported).
  private _markerAngleRadians = Math.PI / 4 // ADR 004 §1 "~45°" default, matches markerPresets.ts's own fallback
  private _markerFollowStroke = false

  // Dwell (#245, ADR 003 §3/§9 revised): while the active tool has a
  // DwellConfig (currently only liner) and the pointer sits within
  // stillThresholdPx of _dwellAnchorX/Y, _dwellTimer periodically paints an
  // extra "pooling" dab at the last known real position via
  // _paintDwellDab — real ink continuing to flow into one spot the longer
  // the stylus rests there, capped by dwellFlow's own saturating ramp.
  // _lastPointer* is updated on every real _onStart/_onMove regardless of
  // whether DabSystem itself produced a new spline dab (it doesn't, once
  // movement drops under DabSystem's own ~0.5px threshold — see its
  // continueStroke), so this timer is the only place a stationary stylus
  // ever paints anything.
  private _lastPointerX = 0
  private _lastPointerY = 0
  private _lastPointerPressure = 0
  private _lastPointerTiltX = 0
  private _lastPointerTiltY = 0
  private _dwellCfg: DwellConfig | null = null
  private _dwellAnchorX = 0
  private _dwellAnchorY = 0
  private _dwellAnchorTimestamp = 0
  private _dwellTimer: ReturnType<typeof setInterval> | null = null

  private _handlers: Partial<Record<EngineEventName, EngineHandler>>
  private _raf: number
  // (#155) Coalesces high-frequency _display() calls (every real pointer
  // move, every predicted sample) to at most one per animation frame. Each
  // WebGL draw call is asynchronous — issuing it doesn't wait for the GPU —
  // so calling the full multi-pass _display() (composeToFBO + infinite
  // rooms' extra applyPaperBlend/finishPaperBlend passes) synchronously on
  // every move let JS queue GPU work faster than the GPU could drain it
  // during a long/fast stroke; by the time the pointer lifted, the GPU still
  // had a growing backlog of stale frames to work through before it could
  // present the current one, which is what a multi-hundred-ms-to-multi-
  // second "presentation delay" (measured via Chrome's own Interaction-to-
  // Next-Paint breakdown, not this engine's own JS-only timing — see chat)
  // actually was. Painting itself (_paintStrokeDabs et al) stays fully
  // synchronous and per-event — only *presenting* the result is throttled;
  // by the next rAF tick, every dab painted in between is already baked
  // into the layer's real tile buffers, so nothing is visually lost, only
  // coalesced. Every OTHER _display() call site (undo/redo, layer ops,
  // stroke end, exports, etc.) stays a direct, immediate call — those are
  // one-shot, not a per-move flood, and some (exportPNG) need the frame
  // actually composited before a synchronous readPixels.
  private _displayRafId: number | null = null
  private _pointer: PointerInput
  private _dabs: DabSystem

  constructor(canvas: HTMLCanvasElement, options: PencilEngineOptions = {}) {
    this.canvas = canvas
    this._infinite = options.infinite ?? false
    // Bounded rooms never call setInfiniteCamera (only Room's infinite-mode
    // viewport-sync effect does) — #136: the below/above split-cache and
    // main composite now always go through the camera-relative tile-draw
    // path (_drawTileComposite), so a bounded room needs a fixed "identity"
    // camera here so world space (== canvas-pixel space for bounded rooms,
    // see tileMath.ts) maps 1:1 onto screen space, matching the plain
    // fullscreen-quad blit this replaces. Canvas size is fixed for a bounded
    // room's lifetime (unlike infinite rooms' resizeCanvas), so this is the
    // only assignment it ever needs.
    this._infiniteCamera = { wx: canvas.width / 2, wy: canvas.height / 2, zoom: 1, angle: 0 }

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
      paper:         options.paper         ?? 'coarse-streak',
      paperColor:    options.paperColor,
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
    // Fixed for this engine instance's whole lifetime (like _debug/
    // _predictPointer above) rather than folded into EngineOpts/_opts —
    // unlike `paper`, this never changes via a public setter, so it doesn't
    // belong in the "live, mutable tool state" struct _opts represents.
    this._grainMode = options.grainMode
    this._charcoalGrainMode = options.charcoalGrainMode
    this._paperFillThreshold = options.paperFillThreshold ?? 0
    this._paperFillCap = options.paperFillCap ?? 0.35

    this._initGL()
    // A flat mid-gray texture bound immediately so every paint call between
    // now and the real bake finishing loading still has something valid to
    // sample — see paperLoader.ts's createPlaceholderPaperTexture.
    this._paperTex = createPlaceholderPaperTexture(this.gl)
    this._paperReady = this._initPaper(this._opts.paper)
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
    // #122: moves the below/above split point itself.
    this._invalidateSplitCache()
  }

  setLocked(locked: boolean): void {
    this._locked = locked
  }

  setPaperFillThreshold(threshold: number): void {
    this._paperFillThreshold = threshold
  }

  setPaperFillCap(cap: number): void {
    this._paperFillCap = cap
  }

  setCharcoalFeel(patch: Partial<CharcoalFeelConfig>): void {
    Object.assign(CHARCOAL_FEEL, patch)
  }

  getCharcoalFeel(): CharcoalFeelConfig {
    return { ...CHARCOAL_FEEL }
  }

  setCompositeOrder(items: CompositeItem[]): void {
    this._compositeOrder = items
    // #122: order/opacity/visibility/add/delete/merge/reorder all funnel
    // through here (the caller always pushes a freshly computed array — see
    // lib/layers.ts's computeCompositeOrder) — unconditional invalidation is
    // cheap and doesn't need to reason about whether this particular call
    // actually changed anything relative to the last one.
    this._invalidateSplitCache()
    this._display()
  }

  // ─── Operation log API ───────────────────────────────────────────────────────

  /** See PencilEngineAPI's doc comment. */
  suspendDisplay(): void { this._displaySuspendDepth++ }

  /** See PencilEngineAPI's doc comment. */
  resumeDisplay(): void {
    this._displaySuspendDepth = Math.max(0, this._displaySuspendDepth - 1)
    if (this._displaySuspendDepth === 0) this._display()
  }

  /** See PencilEngineAPI's doc comment. */
  paperReady(): Promise<void> { return this._paperReady }

  /** (#147) What appendOperation's own branches and _applyHistoryChange/
   *  _execMergeLive call instead of `this._display()` directly — a no-op
   *  while a suspendDisplay() span is active (see its own doc comment),
   *  otherwise identical to calling _display() right there. */
  private _displayIfNotSuspended(): void {
    if (this._displaySuspendDepth === 0) this._display()
  }

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
        // #122: removes entries from what the below/above cache was built
        // from — unconditional, not worth checking whether any deleted id
        // happened to already be excluded (e.g. hidden).
        this._invalidateSplitCache()
        this._displayIfNotSuspended()
        break
      case 'layer_clear': {
        const clearBuf = this._layers.get(op.layerId)
        if (clearBuf) {
          clearBuf.clear()
          // #122: a remote layer_clear (or this client's own, via clear())
          // can target any layer, not necessarily this client's active one —
          // only invalidate when it lands on a layer the cache actually
          // holds baked pixels for.
          if (op.layerId !== this._activeId) this._invalidateSplitCache()
          this._displayIfNotSuspended()
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
          // Smudge only (#14): this op's own author's reservoir must match
          // whatever it was on the client that originally recorded it, not
          // whatever this._smudgeReservoirs happens to hold for that userId
          // right now (leftover from an unrelated earlier op, or nothing at
          // all) — see StrokeOperation.smudgeLoadAtStart's own comment.
          if (op.tool === 'smudge') this._smudgeSeedReservoir(op.userId, op.smudgeLoadAtStart ?? 0)
          this._paintDabs(buf, op.dabs, op.tool, op.preset, op.color, op.userId, undefined, undefined, op.strokeId)
          this._maybeCheckpoint(op.layerId)
          // #122: this branch is only reached for strokes this engine
          // instance didn't itself just paint (remote peer strokes, or
          // replay) — a remote author's active layer can easily differ from
          // this client's own, so their stroke can land on a layer this
          // client's cache has baked into below/above.
          if (op.layerId !== this._activeId) this._invalidateSplitCache()
          this._displayIfNotSuspended()
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
          // #122: layer_transform is pixel-only — it never changes
          // LayerState/_compositeOrder, so (unlike stroke/clear/merge) Room
          // never calls setCompositeOrder in reaction to it. Each transformed
          // entry that isn't the active layer must invalidate here directly,
          // or a below/above layer could get baked into a new position/
          // orientation with the cache never finding out.
          if (t.layerId !== this._activeId) this._invalidateSplitCache()
          appliedAny = true
        }
        if (appliedAny) this._displayIfNotSuspended()
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

  /** Shared by peekUndo/peekRedo: reduces a candidate target op (already
   *  read via undoTarget/redoTarget, never mutated) down to the
   *  StructuralUndoRedoPeek callers actually need — null for anything that
   *  isn't actually about to *remove* content.
   *
   *  Direction matters here, not just op type: undoing layer_add/layer_merge
   *  removes the layer they created, but undoing layer_delete only ever
   *  *restores* one — never destructive, regardless of what's on it.
   *  Symmetrically for redo: redoing layer_delete removes the layer(s)
   *  again, but redoing layer_add only ever re-creates. layer_merge redo is
   *  its own case — it re-consumes `sources`, not `layerId` (the merge
   *  *result*, which redo is simply re-creating, same as layer_add); the
   *  content actually at risk is whatever's been repainted onto a source
   *  layer while the merge sat undone. Getting this backwards would show a
   *  "this will remove content" warning on a redo that's actually
   *  *restoring* the very content #263 exists to protect. */
  private _peekStructuralTarget(target: Operation | null, direction: 'undo' | 'redo'): StructuralUndoRedoPeek | null {
    if (!target) return null
    let layerIds: string[]
    if (direction === 'undo') {
      switch (target.type) {
        case 'layer_add':
        case 'layer_merge':
          layerIds = [target.layerId]
          break
        default:
          return null
      }
    } else {
      switch (target.type) {
        case 'layer_delete':
          layerIds = target.layerIds
          break
        case 'layer_merge':
          layerIds = target.sources.map(s => s.id)
          break
        default:
          return null
      }
    }
    const hasOtherContent = layerIds.some(id => this._log.pixelOpDoneCount(id) > 0)
    return { layerId: layerIds[0], hasOtherContent }
  }

  /** See PencilEngineAPI's own doc comment. */
  peekUndo(): StructuralUndoRedoPeek | null {
    return this._peekStructuralTarget(this._log.undoTarget(this._userId), 'undo')
  }

  /** See PencilEngineAPI's own doc comment. */
  peekRedo(): StructuralUndoRedoPeek | null {
    return this._peekStructuralTarget(this._log.redoTarget(this._userId), 'redo')
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
    this._paperReady = this._initPaper(type)
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

  /** See PencilEngineAPI's doc comment. Only the *next* stroke picks this
   *  up (same "never mid-stroke" rule as _markerAngleRadians' own field
   *  comment) — no need to touch the in-progress DabSystem shaping here. */
  setMarkerAngle(angleRadians: number, followStrokeDirection: boolean): void {
    this._markerAngleRadians = angleRadians
    this._markerFollowStroke = followStrokeDirection
  }

  /** See PencilEngineAPI's doc comment. */
  setRuler(line: RulerLine | null): void { this._ruler = line }

  /** Samples the currently-displayed pixel color at canvas-pixel coordinates
   *  (same space as Dab.x/y — see pointerTransform.ts's clientToCanvas), for
   *  an eyedropper tool. Reads whatever's actually on screen (paper or
   *  graphite, post-composite) via the default framebuffer, which _display()
   *  always leaves bound to the real canvas after its last draw call — so
   *  this only gives a meaningful result once at least one frame has been
   *  displayed. Returns null for out-of-bounds coordinates.
   *
   *  #145 investigation: this stays screen-space-only for infinite rooms too
   *  — deliberately, not as an oversight. Two things make that already
   *  correct rather than "only correct for the visible-content case":
   *   1. The caller (Room's handleEyedropperPick, via clientToCanvas) can
   *      only ever produce a coordinate the user actually clicked on screen
   *      — the (x < 0 || ... >= canvas.width/height) guard above is the
   *      whole possible input range; there's no "pick a world point that
   *      isn't currently on screen" call shape to support in the first
   *      place, unlike exportPNG's genuinely camera-independent "whole
   *      drawing" scope.
   *   2. There's no separate render loop that could leave the on-screen
   *      framebuffer stale relative to engine state at call time: _display()
   *      runs synchronously at the end of every state-changing call that can
   *      affect what's shown (paint — _paintStrokeDabs; camera moves —
   *      setInfiniteCamera; resizeCanvas; setCompositeOrder; history replay —
   *      _applyHistoryChange; setPaper), and JS is single-threaded, so by the
   *      time a pointerdown handler can call pickColor the visible canvas
   *      already reflects the very last of those calls. Confirmed by reading
   *      every _display()/_displayTransparent() call site in this file —
   *      none of them defer to a rAF loop (the constructor's own
   *      requestAnimationFrame call is a one-time kickoff, not a per-frame
   *      loop). No code change needed here — see #145's issue thread for the
   *      export-side fix, which *does* need one. */
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
   *  exist.
   *
   *  (#155 Tier 2) Used to be a full readPixels + per-pixel CPU scan of
   *  every resident tile, on every call — cheap for a single-tile bounded
   *  room, but its cost scaled with resident tile count for an infinite
   *  room, and that count only ever grew across repeated non-tile-aligned
   *  transform drags (see _bakeTransform's own docstring). Live traces
   *  showed this dominating a 22s `pointerup` INP (57% readPixels, 31%
   *  checkFramebufferStatus from the tile creation that came with it), with
   *  _bakeTransform itself barely registering. Now a plain lookup —
   *  ILayerBuffer tracks each tile's real content bbox incrementally as it's
   *  painted/baked (see TiledLayerBuffer's contentRects), so this is a cheap
   *  union over however many tiles this layer has ever held content on, no
   *  GPU readback at all. */
  getContentBounds(layerId: string): { x: number; y: number; width: number; height: number } | null {
    const layerBuf = this._layers.get(layerId)
    if (!layerBuf) return null
    const rect = layerBuf.getContentBoundsWorld()
    if (!rect) return null
    return { x: rect.minX, y: rect.minY, width: rect.maxX - rect.minX, height: rect.maxY - rect.minY }
  }

  /** See PencilEngineAPI's own doc comment. */
  hasLayerContent(layerId: string): boolean {
    return this._log.pixelOpDoneCount(layerId) > 0
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

  /** (#155 follow-up) `canvas.getBoundingClientRect()`, cached — a real
   *  synchronous layout read (a forced reflow if anything invalidated
   *  layout earlier in the same task), and setInfiniteCamera's pointer-
   *  transform closure below used to call it fresh on *every* real pointer
   *  sample during a stroke (a fast stylus easily produces dozens of
   *  coalesced samples per animation frame). Live profiling during a
   *  drawing session confirmed this as the single largest actual
   *  app-attributable CPU cost, and chrome-devtools-mcp's own
   *  ForcedReflow insight independently named this exact call path
   *  (`_handleMove` → `_extract` → this transform closure) as the top
   *  forced-reflow culprit.
   *
   *  The canvas element's on-screen rect only changes on a genuine layout
   *  event (window/container resize — see resizeCanvas, which invalidates
   *  this), never merely from panning or drawing (a camera move
   *  re-renders *content*, it never repositions the canvas element itself
   *  — see setInfiniteCamera's own doc comment), so caching indefinitely
   *  between resizes is safe. */
  private _getCanvasRect(): DOMRect {
    return this._canvasRectCache ??= this.canvas.getBoundingClientRect()
  }

  /** See PencilEngineAPI's doc comment. The pointer transform here is the
   *  exact inverse of _worldToScreenTransform's world->screen math (solved
   *  by hand, not matrix-inverted at runtime, since it's cheap and fixed
   *  shape) — a raw client pointer event must land on the same world point
   *  a tile rendered at (wx,wy,zoom,angle) currently shows there. Unlike
   *  setViewport, this reads the canvas element's own on-screen rect
   *  (via _getCanvasRect(), see its own doc comment) rather than trusting a
   *  separate (cx,cy) screen-position parameter — infinite mode's canvas
   *  has no CSS pan transform of its own (see resizeCanvas), it's simply
   *  positioned to fill the viewport, so this is the same client->canvas-
   *  local math PointerInput's own untransformed fallback already does,
   *  composed with the inverse camera rotation/zoom on top. */
  setInfiniteCamera(wx: number, wy: number, zoom: number, angle: number): void {
    this._infiniteCamera = { wx, wy, zoom, angle }
    const { canvas } = this
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // hw/hh must be read live inside the closure (like
    // _worldToScreenTransform does), not captured here: resizeCanvas() can
    // change canvas.width/height afterwards (the ResizeObserver's first
    // firing normally lands after this is first called, while the canvas is
    // still at its default 300x150) without this ever being called again,
    // which left pointer input reading a stale size while every render used
    // the live one — dabs landed tens/hundreds of px off from the visible
    // stroke.
    this._pointer.setTransform((clientX, clientY) => {
      const rect = this._getCanvasRect()
      const scaleX = canvas.width / (rect.width || canvas.width)
      const scaleY = canvas.height / (rect.height || canvas.height)
      const screenX = (clientX - rect.left) * scaleX
      const screenY = (clientY - rect.top) * scaleY
      const hw = canvas.width / 2
      const hh = canvas.height / 2
      const sx = (screenX - hw) / zoom
      const sy = (screenY - hh) / zoom
      return { x: wx + sx * cos + sy * sin, y: wy - sx * sin + sy * cos }
    })
    // Unlike setViewport (bounded mode pans via a CSS transform the caller
    // owns — the engine's own pixels never change), a camera move here
    // genuinely changes what belongs on screen, so the engine must
    // re-render itself; there's no separate "just move the DOM" path.
    //
    // (#136) The below/above split-cache now bakes each tile's *screen*
    // position (via _drawTileComposite) at rebuild time, not just its
    // content — a camera move invalidates that positioning even though no
    // layer's actual content changed, so this must mark the cache dirty
    // too, unlike every other _invalidateSplitCache() call site (which are
    // all genuine content changes). No perf cliff in practice: panning and
    // painting are mutually exclusive gestures (see useViewport), so a full
    // rebuild on every camera-move frame only ever happens while nothing is
    // actively being painted — the case #122 doesn't need to optimize.
    this._invalidateSplitCache()
    this._display()
  }

  /** See PencilEngineAPI's doc comment. */
  resizeCanvas(width: number, height: number): void {
    if (!this._infinite) return
    const { gl, canvas } = this
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
    // (#155 follow-up) A genuine layout event — _getCanvasRect's cache is
    // stale from here on until re-queried.
    this._canvasRectCache = null
    const { w: ew, h: eh } = this._renderBufferExtent()
    this._compositeFBO.destroy()
    this._belowCache.destroy()
    this._aboveCache.destroy()
    this._assemblyFBO.destroy()
    this._compositeFBO = new AccumulationBuffer(gl, width, height)
    this._belowCache = new AccumulationBuffer(gl, ew, eh)
    this._aboveCache = new AccumulationBuffer(gl, ew, eh)
    this._assemblyFBO = new AccumulationBuffer(gl, ew, eh)
    this._splitCacheDirty = true
    // The paper texture itself is NOT recreated here (unlike
    // _belowCache/_assemblyFBO/etc. above, which are genuinely canvas-size-
    // dependent) — it's a fixed, baked-offline resolution (see
    // _initPaper/paperLoader.ts), decoupled from canvas size entirely, so
    // there's nothing for a canvas resize to invalidate.
    this._display()
  }

  /** Pixel size for _belowCache/_aboveCache/_assemblyFBO — always
   *  canvas-sized for bounded rooms (unchanged from before #134), but a
   *  square padded to the canvas's own half-diagonal for infinite rooms:
   *  big enough that any camera rotation still finds the whole screen
   *  covered once _finishInfiniteComposite crops/rotates it back down to
   *  the real canvas size. See _assemblyFBO's field comment. */
  private _renderBufferExtent(): { w: number; h: number } {
    const { canvas } = this
    if (!this._infinite) return { w: canvas.width, h: canvas.height }
    const halfDiag = Math.sqrt((canvas.width / 2) ** 2 + (canvas.height / 2) ** 2)
    const extent = Math.ceil(halfDiag * 2)
    return { w: extent, h: extent }
  }

  /** How much bigger _assemblyFBO is than the real canvas,
   *  split (roughly) evenly on each side, *rounded to the nearest whole
   *  pixel* — see _compositeCenterX/Y's own field comment for why this
   *  integer-ness is exactly the fix for infinite rooms always looking
   *  faintly softer than bounded ones. Zero for bounded rooms (their
   *  render-buffer extent is exactly canvas size — see _renderBufferExtent
   *  — so there's nothing to pad). */
  private _assemblyPad(): { padX: number; padY: number } {
    const { canvas } = this
    if (!this._infinite) return { padX: 0, padY: 0 }
    const { w: ew, h: eh } = this._renderBufferExtent()
    return { padX: Math.round((ew - canvas.width) / 2), padY: Math.round((eh - canvas.height) / 2) }
  }

  /** (#301) The scale _runComposite draws the assembly buffer at — see
   *  _compositeScale's own field comment for the full reasoning. A bounded
   *  room's camera zoom is the constructor's fixed 1 for the engine's whole
   *  lifetime (its real zoom is the DOM canvasWrap's CSS transform), so the
   *  min() below leaves that path at exactly 1, unchanged. */
  private _infiniteCompositeScale(): number {
    return Math.min(1, this._infiniteCamera.zoom)
  }

  /** (#301) How much magnification the final screen pass still has to apply
   *  on top of what the assembly buffer was already drawn at — 1 whenever
   *  the camera is at or below zoom 1, and the zoom itself above that (the
   *  assembly caps at world resolution). Also the flag for whether that pass
   *  resamples at all: combined with a nonzero angle it decides between
   *  Catmull-Rom and a plain bilinear tap (see PAPER_COMPOSE_FRAG). */
  private _residualScale(): number {
    return this._infiniteCamera.zoom / this._infiniteCompositeScale()
  }

  /** Live gizmo-drag preview (#120) — renders each entry's *current* layer
   *  content through the requested transform into one or more scratch tiles
   *  that _drawCompositeItem substitutes in for the real one, called on
   *  every drag frame. Never touches the real layer buffer — the actual
   *  bake only happens once via a real `layer_transform` op through
   *  appendOperation (see clearLayerTransformPreview, which the caller must
   *  call right after committing that op, so the now-stale preview doesn't
   *  keep shadowing the freshly baked real buffer).
   *
   *  #139: generalized to multiple source/destination tiles — same shape as
   *  _bakeTransform (read its docstring first): resolve the transformed
   *  content's world bounds from every source tile's corners, then stitch
   *  each overlapping destination tile from every overlapping source tile,
   *  one alpha-blended _runTransformBlit pass per pair.
   *
   *  #142: every room (bounded or infinite) is backed by TiledLayerBuffer
   *  now, so this is the same code path for both — a bounded layer just
   *  usually has fewer resident tiles (often exactly one, for a canvas
   *  smaller than TILE_SIZE in both dimensions) rather than a structurally
   *  different single-buffer type. Dragging a bounded layer's content past
   *  its visible canvas edge previews (and, on release, actually bakes)
   *  correctly into whichever tile it now covers, the same #133 guarantee
   *  infinite rooms already had — nothing is silently clipped.
   *
   *  Two differences from the real bake, both because this is a
   *  non-destructive per-frame preview rather than a one-shot commit:
   *  destination tiles are plain scratch AccumulationBuffers computed
   *  straight from tileMath, never layerBuf.resolveForPaint() (which would
   *  create real, permanent tiles on the *actual* layer just from a preview
   *  reading it — leaking empty tiles into the layer's real tile map on
   *  every drag frame, including ones the drag never ends up committing);
   *  and there's no swap-into-the-real-tile second phase — the scratch tile
   *  *is* the whole result, read directly by _drawCompositeItem. */
  /** #142-follow-up perf fix: this runs on every single pointermove during a
   *  gizmo drag — often well over 60/s, especially on a pen/touch
   *  digitizer. The tile SET a drag touches is almost always identical
   *  frame-to-frame (you only cross a tile boundary occasionally), so
   *  destroying and recreating every scratch AccumulationBuffer (a real GPU
   *  texture + framebuffer allocation, up to a full page's worth of bytes
   *  for a bounded room — see _tileSize) on *every* frame, as this used to,
   *  was the actual cause of the severe drag-stutter/hang reported testing
   *  on a Surface: GPU alloc/dealloc churn at pointer-event frequency.
   *  Instead this now keys the previous frame's tiles by world origin and
   *  reuses (just gl.clear()s) any buffer whose tile is still needed this
   *  frame — only genuinely new/vacated tiles allocate or free anything,
   *  which is the rare case, not the every-frame one. */
  previewLayerTransform(transforms: Array<{ layerId: string; matrix: AffineMatrix }>): void {
    for (const { layerId, matrix } of transforms) {
      const source = this._layers.get(layerId)
      if (!source) continue
      const sourceTiles = source.allResident()
      const oldByOrigin = new Map(
        (this._transformPreview.get(layerId) ?? []).map(t => [`${t.originX},${t.originY}`, t]),
      )

      if (!sourceTiles.length) {
        // Nothing to preview (e.g. an empty layer) — drop any stale tiles
        // from a previous frame rather than leaving them showing.
        for (const t of oldByOrigin.values()) t.buffer.destroy()
        this._transformPreview.delete(layerId)
        continue
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      // (#155 Tier 2) Each source tile's own transformed world-space AABB —
      // see _bakeTransform's identical precompute (and its doc comment on
      // why this now uses each tile's real tracked contentRect, not its
      // whole tileW x tileH extent) for the full reasoning; must stay in
      // lockstep with it for the live preview to stay pixel-identical to
      // what committing the drag will actually bake (reused below to skip
      // (dest, src) pairs that can't overlap; this method runs every
      // animation frame for the whole duration of a live drag, so avoiding
      // that O(destTiles x sourceTiles) waste matters even more here).
      const srcRects: Array<WorldRect | null> = []
      for (const { contentRect } of sourceTiles) {
        if (!contentRect) { srcRects.push(null); continue }
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity
        const corners: Array<[number, number]> = [
          [contentRect.minX, contentRect.minY], [contentRect.maxX, contentRect.minY],
          [contentRect.minX, contentRect.maxY], [contentRect.maxX, contentRect.maxY],
        ]
        for (const [x, y] of corners) {
          const [tx, ty] = applyAffine(matrix, x, y)
          minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
          minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
          sMinX = Math.min(sMinX, tx); sMaxX = Math.max(sMaxX, tx)
          sMinY = Math.min(sMinY, ty); sMaxY = Math.max(sMaxY, ty)
        }
        srcRects.push({ minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY })
      }

      if (maxX <= minX || maxY <= minY) {
        // Degenerate (zero-scale transform, or every source tile empty) —
        // content collapses to nothing, same as _bakeTransform's own
        // degenerate-transform branch.
        for (const t of oldByOrigin.values()) t.buffer.destroy()
        this._transformPreview.delete(layerId)
        continue
      }

      // #142: every room is tile-backed now, so this always resolves
      // whichever tiles the transformed content actually lands in — a
      // bounded room's live preview can show content dragged past its
      // visible canvas edge just like the real bake (_bakeTransform)
      // already could, instead of only ever previewing a single canvas-
      // sized destination rect. Must use this room's own tile size (see
      // _tileSize) — the default (TILE_SIZE) is only correct for infinite
      // rooms; a bounded room's tiles are its own canvas size.
      const { w: tw, h: th } = this._tileSize()
      const destRects: WorldRect[] =
        tilesOverlappingRect({ minX, minY, maxX, maxY }, tw, th)
          .map(({ tileX, tileY }) => tileWorldRect(tileX, tileY, tw, th))

      const matrixInv = invertAffine(matrix)
      const tiles: PreviewTile[] = []
      const reused = new Set<string>()
      for (const rect of destRects) {
        const dw = rect.maxX - rect.minX
        const dh = rect.maxY - rect.minY
        const key = `${rect.minX},${rect.minY}`
        const old = oldByOrigin.get(key)
        // Same tile size is guaranteed for every reused key: a room's tile
        // grid (_tileSize) never changes after construction, so an origin
        // that existed last frame always had — and still needs — the same
        // dw/dh here.
        const scratch = old ? old.buffer : new AccumulationBuffer(this.gl, dw, dh)
        scratch.clear()
        if (old) reused.add(key)
        sourceTiles.forEach((srcTile, i) => {
          // (#155) Skip pairs whose transformed bounding boxes don't
          // overlap at all (including a source with no real content,
          // srcRects[i] === null) — see _bakeTransform's identical check
          // for why.
          const r = srcRects[i]
          if (!r || r.maxX <= rect.minX || r.minX >= rect.maxX || r.maxY <= rect.minY || r.minY >= rect.maxY) return
          // dest-tile-local -> world (rect's own origin) -> source world
          // (the transform's inverse) -> src-tile-local (srcTile's own
          // origin) — exactly _bakeTransform's own composition; see there.
          const toWorld = translationMatrix(rect.minX, rect.minY)
          const toSrcLocal = translationMatrix(-srcTile.originX, -srcTile.originY)
          const mc = composeAffine(toSrcLocal, composeAffine(matrixInv, toWorld))
          this._runTransformBlit(
            srcTile.buffer.texture, mc, dw, dh, srcTile.buffer.width, srcTile.buffer.height, scratch.fbo,
          )
        })
        tiles.push({ originX: rect.minX, originY: rect.minY, buffer: scratch })
      }
      // Anything from last frame that isn't part of this frame's tile set
      // (a real, occasional event — the drag crossed a tile boundary) is
      // genuinely done and must still be freed.
      for (const [key, t] of oldByOrigin) {
        if (!reused.has(key)) t.buffer.destroy()
      }
      this._transformPreview.set(layerId, tiles)
    }
    this._display()
  }

  /** Ends a gizmo-drag preview — on commit (a real op just landed and
   *  rebuilt the actual buffers) or on cancel (e.g. Escape, switching tools
   *  mid-drag without releasing). */
  clearLayerTransformPreview(): void {
    for (const tiles of this._transformPreview.values()) {
      for (const { buffer } of tiles) buffer.destroy()
    }
    this._transformPreview.clear()
    this._display()
  }

  /** See PencilEngineAPI's doc comment. Queues `op` for its author's reveal;
   *  starts the reveal loop immediately if this peer has nothing else in
   *  flight, otherwise it plays once the current head of the queue finishes. */
  previewOperation(op: StrokeOperation, rate = 1): void {
    let state = this._peerPreviews.get(op.userId)
    if (!state) {
      state = {
        queue: [], dabIdx: 0, startTime: 0, timer: null,
        buf: new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height),
        // #138: see _cameraCenteredOrigin's doc comment — snapshotted once
        // here (this peer's first queued op) for this buffer's whole
        // lifetime, same as _tipBufOrigin/_previewBufOrigin.
        origin: this._cameraCenteredOrigin(),
      }
      state.buf.clear()
      this._peerPreviews.set(op.userId, state)
    }
    state.queue.push({ op, rate })
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
      const idx = state.queue.findIndex(item => item.op.id === opId)
      if (idx === -1) continue
      const [removed] = state.queue.splice(idx, 1)
      if (idx === 0) {
        // It was the one actually animating — stop it and either move on to
        // whatever's queued behind it or tear this peer down entirely.
        if (state.timer !== null) clearTimeout(state.timer)
        state.buf.clear()
        if (state.queue.length) this._startPeerPreviewHead(peerId)
        else { state.buf.destroy(); this._peerPreviews.delete(peerId); this._display() }
      }
      return removed.op
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
    return state.queue.map(item => item.op)
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
    const head = state.queue[0]
    if (!head) return
    const { op, rate } = head

    const elapsed = (performance.now() - state.startTime) * rate
    const due: Dab[] = []
    while (state.dabIdx < op.dabs.length && op.dabs[state.dabIdx].t <= elapsed) {
      due.push(op.dabs[state.dabIdx])
      state.dabIdx++
    }
    if (due.length) {
      // #138: translated into this peer's buffer's own local space (see
      // _cameraCenteredOrigin/_translateDabs) — a no-op for bounded rooms.
      this._paintDabs(state.buf, this._translateDabs(due, state.origin), op.tool, op.preset, op.color, op.userId)
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

  /** See PencilEngineAPI's doc comment. `canvas.toBlob()` snapshots the
   *  drawing buffer synchronously at call time (encoding happens async, but
   *  the pixels it encodes are fixed the moment it's called) — same
   *  assumption the pre-existing paper variant already relied on by calling
   *  `_display()` right before `toBlob()`. That's what makes it safe to
   *  restore the normal on-screen paper view immediately after kicking off
   *  toBlob() for the transparent variant, without waiting for its callback:
   *  the visible canvas (this.canvas is the real, on-screen WebGL canvas —
   *  there's no separate offscreen render target) never has to sit showing
   *  the transparent frame past this synchronous call.
   *
   *  #145: this camera-viewport path is exactly right for a bounded room
   *  (unchanged below) but is handed off to _exportInfinitePNG for an
   *  infinite one instead — see that method's own doc comment.
   *
   *  Awaits _paperReady first: the paper texture loads asynchronously (see
   *  _initPaper), and an export triggered in the brief window before it
   *  resolves would otherwise bake in the flat placeholder gray instead of
   *  real paper grain. In practice this is a no-op wait almost always — the
   *  3 baked assets are small and prefetched from construction — but a
   *  slow/offline first load makes the gap real. */
  async exportPNG(transparent = false): Promise<Blob | null> {
    await this._paperReady
    if (this._infinite) return this._exportInfinitePNG(transparent)
    if (transparent) this._displayTransparent()
    else this._display()
    const blob = new Promise<Blob | null>(resolve => this.canvas.toBlob(resolve, 'image/png'))
    if (transparent) this._display()
    return blob
  }

  destroy(): void {
    this._destroyed = true
    // Dwell (#245): the one non-rAF timer this engine owns — must not
    // outlive destroy() (e.g. a component unmounting mid-stroke).
    if (this._dwellTimer) { clearInterval(this._dwellTimer); this._dwellTimer = null }
    cancelAnimationFrame(this._raf)
    if (this._displayRafId !== null) cancelAnimationFrame(this._displayRafId)
    this.canvas.removeEventListener('webglcontextlost', this._handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this._handleContextRestored)
    this._pointer.destroy()
    this._layers.forEach(buf => buf.destroy())
    this._compositeFBO.destroy()
    this._belowCache.destroy()
    this._aboveCache.destroy()
    this._assemblyFBO.destroy()
    // (#155) The pool fields are the real owners now — _previewBuf/_tipBuf
    // are just a possibly-mid-stroke alias of the same object (see
    // _acquirePooledBuf), so destroying via the pool alone avoids a
    // double-destroy of the same GL object.
    this._previewBufPool?.destroy()
    this._previewBufPool = null
    this._previewBuf = null
    this._tipBufPool?.destroy()
    this._tipBufPool = null
    this._tipBuf = null
    for (const b of this._transformScratchPool) b.destroy()
    this._transformScratchPool = []
    for (const b of this._smudgeScratchPool) b.destroy()
    this._smudgeScratchPool = []
    this._markerStrokeScratch?.destroy()
    this._markerStrokeScratch = null
    this._strokeId = null
    this._replayMarkerChunk?.scratch.destroy()
    this._replayMarkerChunk = null
    for (const { bufs } of this._smudgeReservoirs.values()) { bufs[0].destroy(); bufs[1].destroy() }
    this._smudgeReservoirs.clear()
    this._smudgeTransferScratch?.destroy()
    this._smudgeTransferScratch = null
    for (const { buf, timer } of this._peerPreviews.values()) {
      if (timer !== null) clearTimeout(timer)
      buf.destroy()
    }
    this._peerPreviews.clear()
    for (const tiles of this._transformPreview.values()) {
      for (const { buffer } of tiles) buffer.destroy()
    }
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
    this._displayIfNotSuspended()
  }

  /** A buffer should exist iff the layer is alive in the done history: created
   *  (base init or a done layer_add/layer_merge) and not destroyed (listed in a
   *  done layer_delete or consumed as a done merge source). Ids are never
   *  reused, so no ordering analysis is needed. */
  private _syncBuffersToLog(): void {
    // #122: called for undo/redo/revoke of layer_add/layer_delete/
    // layer_merge and from context restore — both can create/destroy an
    // arbitrary set of layers relative to what the cache last saw.
    // Unconditional: cheap, and simpler than working out in advance whether
    // any of the (possibly several) affected ids matter to the cache.
    this._invalidateSplitCache()
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
    // #122: single choke point for all three callers (undo/redo/revoke of a
    // stroke/layer_clear/layer_transform, and _syncBuffersToLog's own replay
    // of a freshly-recreated layer) — whichever layer this rebuild just
    // touched, invalidate unless it's the one layer the cache doesn't cache.
    if (layerId !== this._activeId) this._invalidateSplitCache()
  }

  /** (#137) Restoring a checkpoint's tiles goes through resolveForPaint with
   *  each tile's own exact (tile-aligned) rect rather than writing straight
   *  to allResident() — for a bounded layer this is a no-op distinction (its
   *  one buffer always exists already), but for a tiled layer it recreates
   *  whichever tiles the checkpoint recorded that aren't currently resident
   *  (e.g. right after _syncBuffersToLog hands _replayInto a brand-new empty
   *  TiledLayerBuffer with zero tiles). Same generic path for both modes —
   *  no instanceof branch needed, unlike the old bounded-only fast path. */
  private _replayInto(buf: ILayerBuffer, layerId: string, ops: PixelOperation[]): void {
    // #144: `buf`'s own tile count while this method is repopulating it is a
    // meaningless, in-flux intermediate value (e.g. restoring a checkpoint's
    // tiles can momentarily exceed what the final done-history actually
    // needs, before later tail ops make some of them irrelevant again) —
    // eviction firing mid-replay would be wasted work at best, and at worst
    // (a later tail op needing a tile evicted moments earlier by *this same
    // replay*) would trigger a nested rebuildTile whose own separate replay
    // wouldn't reflect this replay's own later ops still to come. Suspended
    // for the whole repopulation, swept once after against the final,
    // settled tile count instead — see TiledLayerBuffer.suspendEviction.
    const tiled = buf instanceof TiledLayerBuffer ? buf : null
    tiled?.suspendEviction()
    try {
      let start = 0
      const cp = this._bestCheckpoint(layerId, ops)
      if (cp) {
        buf.clear()
        for (const t of cp.tiles) {
          const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
          for (const target of buf.resolveForPaint(rect)) target.buffer.restorePixels(t.pixels)
          // (#155 Tier 2) Exact historical pixels, not a fresh paint — scan
          // once for the real content bbox rather than a markContentPainted
          // union (which would wrongly claim the whole tile as content).
          buf.restoreTileContent(rect, t.pixels)
        }
        start = cp.opIds.length
      } else {
        buf.clear()
      }
      for (let i = start; i < ops.length; i++) this._applyPixelOp(buf, layerId, ops[i])
    } finally {
      tiled?.resumeEviction()
    }
  }

  private _applyPixelOp(buf: ILayerBuffer, layerId: string, op: PixelOperation): void {
    switch (op.type) {
      case 'stroke':
        // Smudge only (#14): see appendOperation's own stroke case for why
        // this seed (not whatever's currently in _smudgeReservoirs) is what
        // keeps replay/undo/redo deterministic regardless of processing
        // order or what ran before this op.
        if (op.tool === 'smudge') this._smudgeSeedReservoir(op.userId, op.smudgeLoadAtStart ?? 0)
        this._paintDabs(buf, op.dabs, op.tool, op.preset, op.color, op.userId, undefined, undefined, op.strokeId)
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

  /** Constructs a fresh, empty ILayerBuffer — the one place that happens,
   *  so merge/replay scratch buffers and real layer buffers (_createBuffer)
   *  never drift out of sync with each other.
   *
   *  #142: every room now gets a TiledLayerBuffer, bounded or infinite —
   *  BoundedLayerBuffer (a single fixed-size buffer that silently clipped
   *  anything a transform moved past the canvas edge) is gone. Its tile
   *  size is what actually differs by mode: infinite rooms get the fixed,
   *  square TILE_SIZE (tileMath.ts) every tile always had; a bounded room's
   *  tile size is instead its *own* canvas.width x canvas.height — its
   *  "tile grid" has cells the size of its own visible page, rooted at
   *  world origin, so a layer that never grows past that one page (the
   *  common case) still resolves to exactly one resident tile, same size
   *  and pixel indexing as the old BoundedLayerBuffer's single buffer
   *  byte-for-byte. What changes: a layer_transform that drags content past
   *  that visible page's edge now creates an *adjacent*, identically-sized
   *  tile to hold it rather than clipping it away — content isn't lost,
   *  the same #133 guarantee infinite rooms already had — and transforming
   *  it back later recovers it correctly. The room's *visible/exported*
   *  extent is still exactly canvas.width x canvas.height regardless (see
   *  _visibleWorldRect's bounded branch and _composeToFBO/_display, both
   *  unchanged in size), so this never changes what an on-page bounded room
   *  looks like. */
  /** `layerId` given: this is (or is about to become, see _execMergeLive) a
   *  real, persistent layer buffer — wires up #144's rebuild-on-demand hook
   *  so it's eligible for byte-budget eviction (see TiledLayerBuffer's own
   *  docstring). Omitted: a short-lived scratch/temp buffer (a merge
   *  source's replay target in _replayMergeInto, or _makeTileRebuilder's own
   *  recovery-replay scratch below) that's destroyed the moment the one
   *  operation using it finishes and never queried again afterward — no
   *  rebuildTile is wired, which is also what keeps it from evicting at all
   *  (TiledLayerBuffer's maxResidentTiles is Infinity without one). */
  private _makeLayerBuffer(layerId?: string): ILayerBuffer {
    const { w, h } = this._tileSize()
    return new TiledLayerBuffer(this.gl, w, h, layerId !== undefined ? this._makeTileRebuilder(layerId) : undefined)
  }

  /** #144: the rebuild-on-demand hook a real layer's TiledLayerBuffer calls
   *  when it needs an evicted tile's content back. TiledLayerBuffer only
   *  knows *that* a tile is safely recoverable, never *how* — that needs the
   *  Operation Log and checkpoint/replay machinery, both private to this
   *  class, hence the dependency-injection seam here rather than teaching
   *  TiledLayerBuffer about either.
   *
   *  Recovering one specific tile in isolation, without replaying (and
   *  therefore fully recreating, defeating eviction's own point) every
   *  *other* tile the layer has ever touched, isn't possible in general:
   *  _bakeTransform/_replayMergeInto are inherently whole-layer, cross-tile
   *  operations (a bake's destination tile can draw from any source tile;
   *  a merge composites every one of a source layer's tiles) — replaying
   *  the tail of pixel ops into anything less than a real, full multi-tile
   *  scratch buffer (mirroring exactly what _rebuildLayer/_replayInto
   *  already do for a whole-layer rebuild) would silently drop whatever
   *  cross-tile content those ops needed. So each call here pays for one
   *  full _replayInto of the layer (checkpoint plus tail — the same cost a
   *  plain undo/redo already accepts, not full from-scratch-op-zero
   *  replay), into a fresh scratch instance with no rebuildTile of its own
   *  (so it can never itself evict/recurse), then hands back a session that
   *  reads whichever tiles the caller actually asks for out of that one
   *  replay before the scratch is discarded — one replay recovers as many
   *  evicted tiles as the caller needs in a single recoverTiles batch (see
   *  TiledLayerBuffer.recoverTiles), not one replay per tile. */
  private _makeTileRebuilder(layerId: string): TileRebuilder {
    return (): TileRebuildSession => {
      const scratch = this._makeLayerBuffer()
      this._replayInto(scratch, layerId, this._log.layerPixelOps(layerId))
      return {
        readPixels: rect => {
          const found = scratch.resolveVisible(rect)[0]
          return found ? found.buffer.readPixels() : null
        },
        destroy: () => scratch.destroy(),
      }
    }
  }

  /** This room's own tile dimensions — see _makeLayerBuffer's docstring for
   *  the full reasoning. Also used by previewLayerTransform, which resolves
   *  destination tiles the same way _bakeTransform/TiledLayerBuffer itself
   *  do and must agree with them on tile size. */
  private _tileSize(): { w: number; h: number } {
    return this._infinite ? { w: TILE_SIZE, h: TILE_SIZE } : { w: this.canvas.width, h: this.canvas.height }
  }

  /** Composites every buffer `source` currently holds into the
   *  corresponding buffer(s) of `dest` at the same world position, at
   *  `opacity` — the tile-generalized form of a single
   *  `_compositeTextures([{texture: source.texture, opacity}], dest.fbo)`
   *  call. Bounded mode: source/dest each have exactly one buffer at origin
   *  (0,0), so this reduces to exactly that one call. Infinite mode: each
   *  of source's resident tiles lands on the one dest tile at the same
   *  world position (both use the same TILE_SIZE grid rooted at the same
   *  origin, so tile boundaries always line up — no cross-tile blending
   *  needed here, unlike a transform bake). */
  private _compositeLayerInto(source: ILayerBuffer, dest: ILayerBuffer, opacity: number): void {
    for (const src of source.allResident()) {
      const rect: WorldRect = {
        minX: src.originX, minY: src.originY,
        maxX: src.originX + src.buffer.width, maxY: src.originY + src.buffer.height,
      }
      for (const destTarget of dest.resolveForPaint(rect)) {
        this._compositeTextures(
          [{ texture: src.buffer.texture, opacity }], destTarget.buffer.fbo,
          destTarget.buffer.width, destTarget.buffer.height,
        )
      }
      // (#155 Tier 2) Same grid, same origin (see this method's own doc
      // comment) — src's real content rect lands on dest at the exact same
      // world coordinates, no transform to reason about. null (src tile
      // fully empty) means nothing to mark, same as skipping the composite
      // itself would (the blend above is just a no-op in that case).
      if (src.contentRect) dest.markContentPainted(src.contentRect)
    }
  }

  /** Replays a merge: rebuilds each source as it was just before the merge
   *  (done ops with lower seq) into a temp buffer and composites bottom→top
   *  with the opacities captured in the operation. Recursive when a source is
   *  itself a merge result. */
  private _replayMergeInto(buf: ILayerBuffer, op: LayerMergeOperation): void {
    buf.clear()
    for (const src of op.sources) {
      const temp = this._makeLayerBuffer()
      this._replayInto(temp, src.id, this._log.layerPixelOps(src.id, op.seq))
      this._compositeLayerInto(temp, buf, src.opacity)
      temp.destroy()
    }
  }

  /** Live merge fast path: sources' buffers already hold replay state, so
   *  composite them directly instead of rebuilding. The immediate checkpoint
   *  spares the recursive source rebuild on any later undo above this layer. */
  private _execMergeLive(op: LayerMergeOperation): void {
    // #122: sources are destroyed and a new target buffer object takes their
    // place — always structural, regardless of whether any of the ids
    // involved happen to be the active layer.
    this._invalidateSplitCache()
    const target = this._makeLayerBuffer(op.layerId)
    target.clear()
    for (const s of op.sources) {
      const buf = this._layers.get(s.id)
      if (buf) this._compositeLayerInto(buf, target, s.opacity)
    }
    this._layers.set(op.layerId, target)
    for (const s of op.sources) this._destroyBuffer(s.id)
    this._takeCheckpoint(op.layerId)
    this._displayIfNotSuspended()
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
    // The dead gl context already took the previous _paperTex (placeholder
    // or real) with it — rebind a fresh placeholder immediately, same as
    // the constructor does, then re-upload from the byte cache (paperLoader
    // caches by PaperType, not by gl context, so this never re-fetches over
    // the network — see getPaperBytes).
    this._paperTex = createPlaceholderPaperTexture(this.gl)
    this._paperTexLoaded = false
    this._paperReady = this._initPaper(this._opts.paper)
    this._layers.clear() // handles are already dead; not worth destroy()ing
    this._previewBuf = null
    this._previewBufPool = null // (#155) pooled GL object is dead too, not worth destroy()ing
    this._tipBuf = null
    this._tipBufPool = null
    this._transformScratchPool = [] // (#155) pooled GL objects are dead too, not worth destroy()ing
    this._smudgeScratchPool = [] // same reasoning, see #14
    this._markerStrokeScratch = null // same reasoning — pooled GL objects are dead too
    this._replayMarkerChunk = null
    this._smudgeReservoirs.clear() // same reasoning — pooled GL objects are dead too
    this._smudgeTransferScratch = null
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
    // (#150) O(1) incremental count instead of a full `layerPixelOps(layerId)`
    // log scan on every stroke/image_import/layer_transform completion — see
    // OperationLog.pixelOpDoneCount's own doc comment. _takeCheckpoint below
    // (only reached 1-in-CHECKPOINT_INTERVAL times, and deferred off this
    // interactive path already) still does its own real scan for the actual
    // ops array, unaffected by this.
    const count = this._log.pixelOpDoneCount(layerId)
    if (count === 0 || count % CHECKPOINT_INTERVAL !== 0) return
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

  /** Snapshots the layer's current buffer(s), which must equal replay state
   *  of its done pixel ops (true at every call site: after live paint, live
   *  merge, or a replayed apply). Budgeted in bytes: eviction makes deep
   *  undo slower (longer replay), never impossible.
   *
   *  (#137) One tile snapshot per currently-resident buffer (allResident()
   *  — a bounded layer always has exactly one; a tiled layer has one per
   *  tile touched so far). A tile created *after* this checkpoint isn't
   *  retroactively added to it — _bestCheckpoint only ever picks a
   *  checkpoint whose opIds are an exact prefix of the current done ops, so
   *  replaying that checkpoint's excluded tail is exactly what brings a
   *  later tile into existence again, the same as it did the first time. */
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
    const tiles = buf.allResident().map(({ buffer, originX, originY }) => ({
      originX, originY, width: buffer.width, height: buffer.height, pixels: buffer.readPixels(),
    }))
    if (!tiles.length) return
    this._checkpoints.push({ layerId, opIds: ops.map(o => o.id), tiles })
    this._checkpointBytes += tiles.reduce((sum, t) => sum + t.pixels.byteLength, 0)
    this._evictCheckpointsOverBudget()
  }

  /** Evicts the oldest *unpinned* checkpoints (in insertion order) until
   *  either the byte budget is satisfied or nothing evictable is left.
   *  Pinned checkpoints (#287 — see restoreLayerFromSnapshot) are never
   *  touched: unlike an ordinary checkpoint, whose eviction only makes the
   *  next undo/redo/revoke replay fall back to a slower-but-still-correct
   *  full from-log replay, a pinned one is the *only* record of a layer's
   *  pre-snapshot content — evicting it would silently wipe real content on
   *  the next replay instead. If every remaining checkpoint is pinned, this
   *  simply stops rather than exceeding the budget, same "never impossible,
   *  just slower/bigger" philosophy CHECKPOINT_BUDGET_BYTES's own doc
   *  comment already commits to for the unpinned case. */
  private _evictCheckpointsOverBudget(): void {
    while (this._checkpointBytes > CHECKPOINT_BUDGET_BYTES) {
      const index = this._checkpoints.findIndex(cp => !cp.pinned)
      if (index === -1) break
      const [evicted] = this._checkpoints.splice(index, 1)
      this._checkpointBytes -= evicted.tiles.reduce((sum, t) => sum + t.pixels.byteLength, 0)
    }
  }

  /** See the PencilEngineAPI doc comment. Same allResident() gather as
   *  _takeCheckpoint, just serialized (encodeLayerTiles) instead of kept as
   *  an in-memory Checkpoint — this is for network upload (#149 epic), a
   *  parallel, independent mechanism from the local checkpoint list above,
   *  not a replacement for it. No _contextLost guard needed here the way
   *  _takeCheckpoint has one: a caller only reaches this from Room's own
   *  orchestration on a live seq boundary, never from a code path that could
   *  race a context loss the way idle-scheduled local checkpointing can. */
  bakeNetworkSnapshot(layerId: string): Uint8Array | null {
    const buf = this._layers.get(layerId)
    if (!buf) return null
    const ops = this._log.layerPixelOps(layerId)
    if (!ops.length) return null
    const tiles = buf.allResident().map(({ buffer, originX, originY }) => ({
      originX, originY, width: buffer.width, height: buffer.height, pixels: buffer.readPixels(),
    }))
    if (!tiles.length) return null
    return encodeLayerTiles(tiles)
  }

  /** See the PencilEngineAPI doc comment for the full reasoning on why this
   *  exists alongside bakeNetworkSnapshot rather than sharing its code.
   *
   *  The independence is the entire point, so this deliberately does NOT
   *  route through `_replayInto` (which consults `_bestCheckpoint` and would
   *  reintroduce exactly the shared machinery being checked) — it walks the
   *  done pixel ops itself, from an empty scratch buffer, applying each via
   *  the same `_applyPixelOp` primitive a first-ever paint would. Any future
   *  optimization added here would silently destroy its value as an oracle;
   *  keep it dumb. */
  bakeLayerByFullReplay(layerId: string): Uint8Array | null {
    if (!this._layers.has(layerId)) return null
    const ops = this._log.layerPixelOps(layerId)
    if (!ops.length) return null

    const scratch = this._makeLayerBuffer(layerId)
    try {
      scratch.clear()
      for (const op of ops) this._applyPixelOp(scratch, layerId, op)
      const tiles = scratch.allResident().map(({ buffer, originX, originY }) => ({
        originX, originY, width: buffer.width, height: buffer.height, pixels: buffer.readPixels(),
      }))
      if (!tiles.length) return null
      return encodeLayerTiles(tiles)
    } finally {
      scratch.destroy()
    }
  }

  /** See the PencilEngineAPI doc comment. Mirrors _replayInto's own
   *  checkpoint-restore branch exactly (resolveForPaint + restorePixels +
   *  restoreTileContent) — a network snapshot's tiles are structurally the
   *  same kind of "exact historical pixels, not a fresh paint" data a local
   *  checkpoint's tiles are, just sourced from the server instead of memory.
   *
   *  (#287) Also seeds a *pinned* local checkpoint from these same tiles —
   *  without it, this layer's pre-snapshot content exists only in the buffer
   *  itself, invisible to `_bestCheckpoint`/`_rebuildLayer`. The very next
   *  undo/redo/revoke of a stroke/layer_clear/layer_transform on this layer
   *  (this client's own, or any peer's — every replica applies the same
   *  meta-op) would then find no matching checkpoint, `buf.clear()`, and
   *  replay only whatever pixel ops this client's own OperationLog happens
   *  to know about — the live tail plus whatever background backfill has
   *  absorbed so far, which after a room-idle prune (rooms.ts's
   *  pruneOperationsBeforeSnapshot) can permanently exclude everything this
   *  snapshot was restoring in the first place. Pinning this exact state as
   *  a checkpoint with an empty `opIds` prefix makes it the correct fallback
   *  instead: `_bestCheckpoint` matches it trivially against any current
   *  `ops` (an empty array prefixes anything), so replay restores these
   *  tiles and then re-applies only the pixel ops this client actually
   *  knows happened since — exactly what already happens for an ordinary
   *  local checkpoint, just sourced from the network instead of a live
   *  paint. Naturally superseded (never has to be invalidated by hand) once
   *  real historical ops eventually get backfilled in front of it: their
   *  presence shifts the current `ops` prefix, and the id-based prefix
   *  match in `_bestCheckpoint` stops matching this checkpoint on its own. */
  restoreLayerFromSnapshot(layerId: string, tiles: SnapshotTile[]): void {
    const buf = this._layers.get(layerId)
    if (!buf) return
    for (const t of tiles) {
      const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
      for (const target of buf.resolveForPaint(rect)) target.buffer.restorePixels(t.pixels)
      buf.restoreTileContent(rect, t.pixels)
    }
    this._pinSnapshotCheckpoint(layerId, tiles)
  }

  /** See restoreLayerFromSnapshot's own doc comment for why this exists.
   *  Replaces (rather than adds to) any pinned checkpoint this layer already
   *  had — only relevant if restoreLayerFromSnapshot is ever called twice
   *  for the same layer in one engine lifetime (e.g. a reconnect re-restoring
   *  a still-mounted engine); the newer restore is always a superset, and
   *  `_bestCheckpoint`'s "first checkpoint of the longest matching length
   *  wins" tie-break would otherwise let a stale one linger and win ties
   *  against the newer, more complete one at the same (empty) opIds length. */
  private _pinSnapshotCheckpoint(layerId: string, tiles: SnapshotTile[]): void {
    if (!tiles.length) return
    for (let i = this._checkpoints.length - 1; i >= 0; i--) {
      const cp = this._checkpoints[i]
      if (cp.pinned && cp.layerId === layerId) {
        this._checkpointBytes -= cp.tiles.reduce((sum, t) => sum + t.pixels.byteLength, 0)
        this._checkpoints.splice(i, 1)
      }
    }
    this._checkpoints.push({ layerId, opIds: [], tiles, pinned: true })
    this._checkpointBytes += tiles.reduce((sum, t) => sum + t.pixels.byteLength, 0)
    this._evictCheckpointsOverBudget()
  }

  /** See the PencilEngineAPI doc comment and OperationLog.prependHistorical's
   *  own doc comment for the full reasoning. Replays `ops` through a
   *  throwaway scratch log using its normal public append/applyUndo/
   *  applyRedo/revoke methods — exactly the same log-bookkeeping sequence
   *  appendOperation's switch below drives for a live operation, just
   *  without ever touching a buffer — so the resulting entries' done/undone/
   *  gone states come from the exact same state machine, then merges them
   *  into the real log in one step. */
  absorbHistoricalOperations(ops: Operation[]): void {
    const scratch = new OperationLog()
    for (const op of ops) {
      scratch.append(op)
      if (op.type === 'operation_undo') scratch.applyUndo(op.targetOpId, op.userId)
      else if (op.type === 'operation_redo') scratch.applyRedo(op.targetOpId, op.userId)
      else if (op.type === 'operation_revoke') scratch.revoke(op.targetOpId)
    }
    this._log.prependHistorical(scratch.entries)
    this._historicalEntryCount += scratch.entries.length
  }

  /** See the PencilEngineAPI doc comment. */
  getOperationsSinceRestore(): Operation[] {
    return this._log.doneOperations().filter(op => (op.seq ?? 0) >= this._historicalEntryCount)
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
    if (this._layers.has(id)) return
    const buf = this._makeLayerBuffer(id)
    buf.clear()
    this._layers.set(id, buf)
  }

  private _destroyBuffer(id: string): void {
    const buf = this._layers.get(id)
    if (buf) {
      buf.destroy()
      this._layers.delete(id)
    }
    // (#287) A pinned checkpoint (see restoreLayerFromSnapshot) is exempt
    // from budget eviction, so unlike an ordinary one it would otherwise
    // linger forever for a layer id that's gone for good (ids are never
    // reused — see _syncBuffersToLog's own doc comment) instead of ever
    // being reclaimed.
    for (let i = this._checkpoints.length - 1; i >= 0; i--) {
      const cp = this._checkpoints[i]
      if (cp.pinned && cp.layerId === id) {
        this._checkpointBytes -= cp.tiles.reduce((sum, t) => sum + t.pixels.byteLength, 0)
        this._checkpoints.splice(i, 1)
      }
    }
  }

  private _initGL(): void {
    const { gl, canvas } = this

    this._dabProg             = createProgram(gl, DAB_VERT, DAB_FRAG)
    this._dabProgInstanced    = createProgram(gl, DAB_VERT_INSTANCED, DAB_FRAG)
    this._dispProg            = createProgram(gl, DISPLAY_VERT, DISPLAY_FRAG)
    this._dispTransparentProg = createProgram(gl, DISPLAY_VERT, DISPLAY_TRANSPARENT_FRAG)
    this._compositeProg       = createProgram(gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG)
    this._blitProg            = createProgram(gl, DISPLAY_VERT, IMAGE_BLIT_FRAG)
    this._transformProg       = createProgram(gl, DISPLAY_VERT, TRANSFORM_BLIT_FRAG)
    this._paperComposeProg    = createProgram(gl, DISPLAY_VERT, PAPER_COMPOSE_FRAG)
    this._smudgeProg          = createProgram(gl, DAB_VERT, SMUDGE_TRANSFER_FRAG)
    this._smudgeComputeProg   = createProgram(gl, DISPLAY_VERT, SMUDGE_COMPUTE_FRAG)
    this._ribbonProg          = createProgram(gl, RIBBON_VERT, RIBBON_FRAG)

    this._dabUni  = getUniforms(gl, this._dabProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
      'u_resolution', 'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_pressure', 'u_tiltX', 'u_tiltY', 'u_hardness', 'u_opacity',
      'u_eraseMode', 'u_color', 'u_grainMode', 'u_paperFillThreshold', 'u_paperFillCap', 'u_inkMode',
      // Charcoal only (#304, ADR 005) — per-preset, so needed by both this
      // program and the instanced one below (unlike marker's three samplers,
      // which never draw through the batched path).
      'u_charcoalTooth', 'u_charcoalCrumble', 'u_charcoalDust',
      'u_charcoalBroadAspect', 'u_charcoalBroadGrain',
      'u_charcoalPressFloor', 'u_charcoalPressGamma', 'u_charcoalSkipFloor', 'u_charcoalGateRelief', 'u_charcoalGrainDepth',
      // Marker only (#250, follow-up) — only ever set by
      // the marker's own draws, which always use this non-instanced program;
      // not added to _dabInstUni below since nothing ever draws marker
      // through it.
      'u_original', 'u_strokeCoverage', 'u_inkLoad',
      // #330 stage 2/3 — the marker nib's own geometry: edge ramp width in canvas
      // px, which outline the nib is, its corner radius, and how much the ink
      // eases off at the rim.
      'u_aaPx', 'u_nibShape', 'u_nibCorner', 'u_inkEdge',
    ])
    this._ribbonUni = getUniforms(gl, this._ribbonProg, ['u_resolution', 'u_aaPx', 'u_mode'])
    this._dabInstUni = getUniforms(gl, this._dabProgInstanced, [
      'u_resolution', 'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_hardness', 'u_eraseMode', 'u_color', 'u_grainMode', 'u_paperFillThreshold', 'u_paperFillCap', 'u_inkMode',
      'u_charcoalTooth', 'u_charcoalCrumble', 'u_charcoalDust',
      'u_charcoalBroadAspect', 'u_charcoalBroadGrain',
      'u_charcoalPressFloor', 'u_charcoalPressGamma', 'u_charcoalSkipFloor', 'u_charcoalGateRelief', 'u_charcoalGrainDepth',
    ])
    this._dispUni = getUniforms(gl, this._dispProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_paperScale',
    ])
    this._dispTransparentUni = getUniforms(gl, this._dispTransparentProg, ['u_accumulation'])
    this._compositeUni = getUniforms(gl, this._compositeProg, ['u_layer', 'u_opacity'])
    this._blitUni = getUniforms(gl, this._blitProg, ['u_image', 'u_bufferSize', 'u_imageRect'])
    this._transformUni = getUniforms(gl, this._transformProg, ['u_source', 'u_dstSize', 'u_srcSize', 'u_matrixInv'])
    this._paperComposeUni = getUniforms(gl, this._paperComposeProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_paperScale', 'u_paperTexSize',
      'u_dstSize', 'u_srcSize', 'u_matrixInv', 'u_screenToWorld', 'u_sharpResample',
    ])
    this._smudgeUni = getUniforms(gl, this._smudgeProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio', 'u_resolution',
      'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_hardness', 'u_transferTex', 'u_reservoirTex', 'u_mode', 'u_pickupFloor',
      'u_pressure', 'u_paperFillThreshold', 'u_paperFillCap', 'u_embed',
    ])
    this._smudgeComputeUni = getUniforms(gl, this._smudgeComputeProg, [
      'u_patch', 'u_oldReservoir', 'u_rate', 'u_pressure', 'u_opacity', 'u_maxStep', 'u_outputMode',
    ])

    this._dabPosLoc            = gl.getAttribLocation(this._dabProg, 'a_position')
    this._dispPosLoc           = gl.getAttribLocation(this._dispProg, 'a_position')
    this._dispTransparentPosLoc = gl.getAttribLocation(this._dispTransparentProg, 'a_position')
    this._compositePosLoc      = gl.getAttribLocation(this._compositeProg, 'a_position')
    this._blitPosLoc           = gl.getAttribLocation(this._blitProg, 'a_position')
    this._transformPosLoc      = gl.getAttribLocation(this._transformProg, 'a_position')
    this._paperComposePosLoc   = gl.getAttribLocation(this._paperComposeProg, 'a_position')
    this._smudgePosLoc         = gl.getAttribLocation(this._smudgeProg, 'a_position')
    this._smudgeComputePosLoc  = gl.getAttribLocation(this._smudgeComputeProg, 'a_position')

    this._instPosLoc     = gl.getAttribLocation(this._dabProgInstanced, 'a_position')
    this._instALoc       = gl.getAttribLocation(this._dabProgInstanced, 'a_instA')
    this._instBLoc       = gl.getAttribLocation(this._dabProgInstanced, 'a_instB')
    this._instOpacityLoc = gl.getAttribLocation(this._dabProgInstanced, 'a_opacity')

    this._ribbonPosLoc  = gl.getAttribLocation(this._ribbonProg, 'a_position')
    this._ribbonEdgeLoc = gl.getAttribLocation(this._ribbonProg, 'a_edge')
    this._ribbonInkLoc  = gl.getAttribLocation(this._ribbonProg, 'a_ink')

    this._quadBuf    = createQuadBuffer(gl)
    this._screenBuf  = createFullscreenQuad(gl)
    this._dabInstBuf = gl.createBuffer()!
    this._ribbonBuf  = gl.createBuffer()!

    this._instancedArraysExt = gl.getExtension('ANGLE_instanced_arrays') as InstancedArraysExt | null

    this._compositeFBO = new AccumulationBuffer(gl, canvas.width, canvas.height)
    // Fresh (or, on context restore, brand-new-and-empty) GL objects — any
    // previously baked content is gone either way, so the split cache must
    // be rebuilt before its next read regardless of why _initGL() ran.
    const { w: ew, h: eh } = this._renderBufferExtent()
    this._belowCache = new AccumulationBuffer(gl, ew, eh)
    this._aboveCache = new AccumulationBuffer(gl, ew, eh)
    this._assemblyFBO = new AccumulationBuffer(gl, ew, eh)
    this._splitCacheDirty = true
  }

  // Awaits the shared byte cache (getPaperBytes — a network fetch only on
  // the very first call for a given PaperType, an already-resolved promise
  // on every later one, see paperLoader.ts), then uploads and swaps in the
  // real texture, replacing whatever placeholder or previous paper texture
  // was bound before. Guarded by _destroyed since the await can still
  // resolve after destroy() ran. Both bounded and infinite rooms go through
  // this same path and end up with the exact same 2048px REPEAT texture —
  // see _paperWorldSize()'s own comment for why unifying them is safe.
  private async _initPaper(type: PaperType): Promise<void> {
    const bytes = await getPaperBytes(type)
    if (this._destroyed) return
    const gl = this.gl
    const newTex = uploadPaperTexture(gl, bytes)
    const old = this._paperTex
    this._paperTex = newTex
    this._paperTexLoaded = true
    gl.deleteTexture(old)
    this._display()
  }

  /** World-space size the baked paper texture repeats over — see
   *  paperNoise.ts's PAPER_WORLD_SIZE for the full reasoning (coprimality
   *  with TILE_SIZE, etc.). Both kinds of room read the exact same
   *  fixed-resolution, offline-baked REPEAT texture (see _initPaper); they
   *  differ only in how far it is stretched.
   *
   *  A bounded room maps the tile across its sheet exactly once, because
   *  that is what DISPLAY_FRAG has always done for the blank-paper tint
   *  (`paperUV = v_uv`, no repeat) and the two must agree: with the tile
   *  repeating every PAPER_WORLD_SIZE (157) here while the tint spanned the
   *  whole sheet, the grain a stroke bit into was an order of magnitude
   *  finer than the grain visible underneath it — the same sheet rendered
   *  at two different scales, which is exactly what it looked like.
   *
   *  Safe for cross-device determinism (the property .claude/rules.md guards
   *  and #162/#165 were about) specifically because a bounded room's canvas
   *  is fixed by its paper format — A2 is 2480x3508 on every device, never
   *  DPR-scaled, unlike an infinite room's backing store (see cameraMath's
   *  deviceNativeZoom). Two clients therefore derive the identical UV for
   *  the identical buffer pixel, which is what feeds real dab deposit. An
   *  infinite room has no sheet to span, so it keeps the world-space repeat.
   *
   *  Note this is not square for a bounded room: the square tile takes the
   *  sheet's aspect ratio, so the grain stretches with it. That is inherited
   *  from the tint's own mapping rather than chosen, and matching it is the
   *  entire point here. */
  private _paperWorldSize(): { w: number; h: number } {
    if (this._infinite) return { w: PAPER_WORLD_SIZE, h: PAPER_WORLD_SIZE }
    return { w: this.canvas.width, h: this.canvas.height }
  }

  private get _physicalSize(): number {
    return this._toPhysicalSize(this._opts.size)
  }

  // CSS-px → canvas-physical-px conversion for this user's own brush size —
  // factored out of _physicalSize only because it reads _opts.size, which a
  // getter can't parameterize.
  private _toPhysicalSize(size: number): number {
    // Infinite rooms: brush size is in world units (device-independent —
    // peers replay the same dab sizes), and dabs render into world-
    // resolution tiles, so no conversion applies. The canvas backing store
    // is DPR-scaled relative to its CSS size there (see Room's
    // ResizeObserver), which must scale display, never the brush — before
    // the DPR-sized backing this ratio happened to be 1 for infinite rooms,
    // so this branch preserves, not changes, their brush semantics.
    if (this._infinite) return size
    return size * (this.canvas.width / (this.canvas.clientWidth || this.canvas.width))
  }

  // ─── Stroke input ────────────────────────────────────────────────────────────

  // Ruler tool (#89): projects (x, y) onto the active ruler's line when
  // within tolerance (see rulerSnap.ts), or returns it unchanged when no
  // ruler is set. Called from _onStart/_onMove (the real recorded path)
  // and _onPredict (#92's speculative preview, for visual consistency with
  // the real path) — never needed in _onEnd, which only ever extrapolates
  // a ghost point from already-buffered (already-snapped, if applicable)
  // real points, so there's no new raw (x, y) there to snap.
  private _snapPoint(x: number, y: number): { x: number; y: number } {
    return this._ruler ? snapToRuler(x, y, this._ruler) : { x, y }
  }

  private _onStart(e: PointerData): void {
    // See _paperTexLoaded's own field comment: painting before the real
    // paper texture has loaded would bake in the placeholder's flat,
    // meaningless response permanently. Blocking the stroke from starting
    // at all (rather than trying to special-case the paint path) means
    // there is nothing to later "fix up" — matches how `_locked` already
    // blocks drawing for a different reason, just orthogonal to it.
    if (this._locked || !this._paperTexLoaded) return
    const layerId = this._activeId
    if (!layerId || !this._layers.has(layerId)) return
    this._strokeLayerId = layerId
    this._strokeTool    = this._opts.tool
    // Fresh per stroke (never carried over, unlike smudge's reservoir) —
    // see MarkerStrokeScratch's own doc comment. Harmless to always create,
    // even for a non-marker stroke: nothing allocates any GL resource until
    // a marker dab's own getOrCreate() first touches a tile.
    this._markerStrokeScratch = new MarkerStrokeScratch(this.gl)
    this._strokeId = nanoid(10)
    // #251: this._strokePreset isn't assigned until the next line — pass the
    // raw incoming preset (this._opts.pencilType) directly so a marker
    // stroke's bullet/chisel dispatch (shapingForTool -> markerPresets.ts's
    // shapingForMarkerPreset) sees this stroke's actual nib, not whatever
    // preset the *previous* stroke left in _strokePreset.
    this._dabs.setShaping(shapingForTool(
      this._strokeTool, this._opts.pencilType,
      { angle: this._markerAngleRadians, followStrokeDirection: this._markerFollowStroke },
    ))
    // #330 stage 3 — only the marker's ribbon rasterizer cares (its bands are
    // straight chords between samples); every other tool keeps its plain
    // size-proportional spacing untouched. See DabSystem.curvatureTolerancePx.
    this._dabs.curvatureTolerancePx =
      this._strokeTool === 'marker' ? MARKER_CURVATURE_TOLERANCE_PX : null
    this._strokePreset  = this._opts.pencilType
    this._strokeColor   = this._opts.graphiteColor
    // Smudge's reservoir now persists across separate strokes (see
    // _smudgeReservoirs' own field comment) — no reset here. Just capture
    // this stroke's own starting level (for StrokeOperation.smudgeLoadAtStart,
    // baked in by _onEnd/_flushStrokeChunk) — harmless to do unconditionally
    // even for a non-smudge stroke, since nothing reads it outside those two.
    this._smudgeChunkLoadAtStart = this._smudgeCaptureLoad(this._userId)
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
      this._dbgPendingFrameTimestamp = null
      this._dbgFrameSum = 0
      this._dbgFrameCount = 0
      this._dbgMaxFrame = 0
    }
    if (this._predictPointer) {
      this._previewBuf = this._acquirePooledBuf('_previewBufPool')
      this._previewBuf.clear()
      this._previewBufOrigin = this._cameraCenteredOrigin()
    }
    if (this._liveTip) {
      this._tipBuf = this._acquirePooledBuf('_tipBufPool')
      this._tipBuf.clear()
      this._tipBufOrigin = this._cameraCenteredOrigin()
    }
    // Ruler tool (#89): snap before the haptic tracker and DabSystem ever
    // see this point, so both "feel" and paint the same (possibly
    // straightened) position as what ends up recorded.
    const { x, y } = this._snapPoint(e.x, e.y)
    if (this._haptic) {
      this._haptic.reset()
      this._hapticX = x
      this._hapticY = y
    }
    this._lastPointerX = x; this._lastPointerY = y
    this._lastPointerPressure = e.pressure
    this._lastPointerTiltX = e.tiltX; this._lastPointerTiltY = e.tiltY
    // Dwell (#245): fresh anchor for this stroke, timer only runs for tools
    // that opt in (see dwellConfigForTool). Defensive clear first — a
    // previous stroke's _onEnd always clears its own timer, but a stray
    // leftover must never carry into a new stroke's anchor/state.
    if (this._dwellTimer) { clearInterval(this._dwellTimer); this._dwellTimer = null }
    this._dwellCfg = dwellConfigForTool(this._strokeTool)
    this._dwellAnchorX = x; this._dwellAnchorY = y; this._dwellAnchorTimestamp = performance.now()
    if (this._dwellCfg) {
      const cfg = this._dwellCfg
      this._dwellTimer = setInterval(() => this._paintDwellDab(cfg), cfg.intervalMs)
    }
    const dabs = this._dabs.startStroke(x, y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
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
    const { x, y } = this._snapPoint(e.x, e.y)
    if (this._haptic) {
      this._haptic.sample(this._hapticX, this._hapticY, x, y)
      this._hapticX = x
      this._hapticY = y
    }
    this._lastPointerX = x; this._lastPointerY = y
    this._lastPointerPressure = e.pressure
    this._lastPointerTiltX = e.tiltX; this._lastPointerTiltY = e.tiltY
    // Dwell (#245): real movement past the still-threshold resets the
    // anchor/clock — only genuinely resting near one spot (including
    // moving very slowly, which naturally stays under threshold between
    // consecutive samples) lets _paintDwellDab's elapsed-time ramp grow.
    if (this._dwellCfg) {
      const dx = x - this._dwellAnchorX, dy = y - this._dwellAnchorY
      if (Math.hypot(dx, dy) > this._dwellCfg.stillThresholdPx) {
        this._dwellAnchorX = x; this._dwellAnchorY = y; this._dwellAnchorTimestamp = performance.now()
      }
    }
    const dabs = this._dabs.continueStroke(x, y, e.pressure, e.tiltX, e.tiltY, this._physicalSize)
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
    if (painted) {
      if (this._debug) this._dbgPendingFrameTimestamp = e.timeStamp
      this._scheduleDisplay()
    }
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
      // #138: translated into _tipBuf's own local space (see
      // _cameraCenteredOrigin/_translateDabs) — a no-op for bounded rooms.
      this._paintDabs(
        this._tipBuf, this._translateDabs(dabs, this._tipBufOrigin), this._strokeTool, this._strokePreset,
        this._strokeColor, this._userId,
      )
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
    if (!samples.length) { this._scheduleDisplay(); return }

    const fork = this._dabs.forkForPreview()
    const dabs: Dab[] = []
    for (const s of samples) {
      // Ruler tool (#89): keep the speculative preview visually consistent
      // with the real path above, which snaps too.
      const { x, y } = this._snapPoint(s.x, s.y)
      dabs.push(...fork.continueStroke(x, y, s.pressure, s.tiltX, s.tiltY, this._physicalSize))
    }
    if (dabs.length) {
      this._bakeDabOpacity(dabs, samples[samples.length - 1].speed, this._strokeTool, this._strokePreset, this._opts.opacity)
      // #138: translated into _previewBuf's own local space (see
      // _cameraCenteredOrigin/_translateDabs) — a no-op for bounded rooms.
      this._paintDabs(
        this._previewBuf, this._translateDabs(dabs, this._previewBufOrigin), this._strokeTool, this._strokePreset,
        this._strokeColor, this._userId,
      )
    }
    this._scheduleDisplay()
  }

  private _onEnd(e: PointerData): void {
    const layerId = this._strokeLayerId
    if (!layerId) return
    // Dwell (#245): stop pooling the instant the stroke ends — real
    // movement/lift always reaches here before any next stroke's _onStart.
    if (this._dwellTimer) { clearInterval(this._dwellTimer); this._dwellTimer = null }
    this._dwellCfg = null
    const t0 = this._debug ? performance.now() : 0
    const dabs = this._dabs.endStroke(this._physicalSize)
    if (this._strokeTool === 'liner') applyLinerEndTaper(dabs, e.speed)
    if (dabs.length) this._paintStrokeDabs(dabs, e.speed, e.timeStamp - this._strokeStartTimestamp)
    // Torn down after this stroke's very last dabs are painted above — a
    // fresh MarkerStrokeScratch gets created for the *next* stroke in
    // _onStart, never carried over (see its own doc comment).
    this._markerStrokeScratch?.destroy()
    this._markerStrokeScratch = null
    // Discard the speculative preview entirely once the real stroke has
    // ended — the final _display() below must show only real content.
    // (#155) Only drops the *active* reference now, not the underlying GL
    // object — that stays alive in _previewBufPool for the next stroke to
    // reuse (see _acquirePooledBuf). _display()'s `if (this._previewBuf)`
    // blend-skip is keyed on this reference, not the pool, so behavior here
    // is identical to the old destroy(); only the GL object's lifetime
    // changed.
    this._previewBuf = null
    // Same for the live-tip scratch buffer: endStroke() above just painted
    // the exact same final segment (pixel-identical, same math minus the
    // `_remainder` mutation — see peekTipDabs()) into the real buffer, so
    // there is nothing left for the tip preview to show.
    this._tipBuf = null
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
        avgFrameLatencyMs: this._dbgFrameCount > 0 ? this._dbgFrameSum / this._dbgFrameCount : 0,
        maxFrameLatencyMs: this._dbgMaxFrame,
      })
    }

    if (this._strokeDabs.length) {
      const op: Operation = {
        id: nanoid(10), type: 'stroke', userId: this._userId,
        layerId, tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
        dabs: this._strokeDabs, timestamp: Date.now(),
        ...(this._strokeId ? { strokeId: this._strokeId } : {}),
        ...this._smudgeOpLoadFields(),
      }
      this._log.append(op)
      this._maybeCheckpoint(layerId)
      this._onLocalOperation?.(op)
    }
    // Only now: the operation built just above still needed it, and _onEnd
    // tears the marker scratch down well before reaching here.
    this._strokeId = null
    this._strokeLayerId = null
    this._strokeDabs = []
    this._handlers.strokeEnd?.(e)
  }

  /** Resolves a StrokeOperation's (tool, preset) pair to the {opacity,
   *  hardness, sizeMultiplier} triple that drives both opacity baking
   *  (_bakeDabOpacity) and rendering (_paintDabs/_dabWorldHalfExtents). Liner has
   *  no hardness scale (see LINER_PRESET's own comment) — every calibrated
   *  width/free size resolves to the one flat preset regardless of
   *  `presetName`'s actual value. pencil/eraser/smudge keep the exact
   *  pre-existing fallback-to-HB behavior for an unrecognized presetName.
   *  Marker (#250, ADR 004; split per-nib in "Ревизия v1.5" — see
   *  MARKER_BULLET_PRESET/MARKER_CHISEL_PRESET's own comment) reuses the
   *  same nib token dabShaping.ts's shapingForTool already parses out of
   *  `presetName` (e.g. "bullet:0.3") for dab shape/angle — this is a
   *  separate path keyed off the same string, not a shared cache.
   *  Charcoal (#304, ADR 005) resolves one of its three types (vine/willow/
   *  compressed) out of `presetName`, falling back to willow — see
   *  charcoalPresetFor. Its CharcoalPreset carries three extra fields on top
   *  of PencilPreset, read only by _charcoalPresetFor's own callers below;
   *  everything that just needs {opacity, hardness, sizeMultiplier} (opacity
   *  baking, dab extents) works off it unchanged through this return type. */
  private _resolvePreset(tool: ToolType, presetName: string): PencilPreset {
    if (tool === 'liner') return LINER_PRESET
    if (tool === 'marker') return markerNibFromPreset(presetName) === 'chisel' ? MARKER_CHISEL_PRESET : MARKER_BULLET_PRESET
    if (tool === 'charcoal') return charcoalPresetFor(presetName)
    return isPencilGrade(presetName) ? PENCIL_PRESETS[presetName] : PENCIL_PRESETS['HB']
  }

  /** Which computeGrain variant (DAB_FRAG's u_grainMode) this draw should use.
   *
   *  Each material carries its own shipped default — GRAPHITE_GRAIN_DEFAULT
   *  (10, "Solid") for graphite, CHARCOAL_PRESETS.grain (3, "Streaky") per
   *  charcoal type — and each has its own independent dev override
   *  (`grainMode` / `charcoalGrainMode`), which is `undefined` when that
   *  selector sits at "default". Two separate overrides rather than one shared
   *  flag specifically so auditioning a variant on one material doesn't
   *  disturb the other (#304 follow-up). */
  private _resolveGrainMode(charcoal: CharcoalPreset | null): number {
    return charcoal
      ? this._charcoalGrainMode ?? charcoal.grain
      : this._grainMode ?? GRAPHITE_GRAIN_DEFAULT
  }

  /** Bakes final dab opacity (preset × user opacity × speed) in place. Shared
   *  by the real stroke path and the #92 prediction preview, so predicted
   *  dabs render with visually consistent opacity to real ones. tool/
   *  presetName/opacity are explicit params (rather than always reading this
   *  user's own _strokeTool/_strokePreset/_opts.opacity) purely so both
   *  callers can pass their own state through one shared implementation. */
  private _bakeDabOpacity(dabs: Dab[], speed: number, tool: ToolType, presetName: string, opacity: number): void {
    const preset      = this._resolvePreset(tool, presetName)
    const speedFactor = Math.max(0.7, 1.0 - speed * 0.15)
    // Marker (#250, ADR 004 §2) shares liner's exact speed-flow curve —
    // "minimal influence" is the same physical justification ADR 004 gives
    // (a real ink/dye tip doesn't compress the way graphite does), and
    // reusing linerSpeedFlow rather than inventing a separate marker curve
    // keeps this v1/uncalibrated (ADR 004 MVP scope) without adding a new
    // unverified formula on top of an already-uncalibrated one.
    const inkSpeed = (tool === 'liner' || tool === 'marker') ? linerSpeedFlow(speed) : 0
    for (const dab of dabs) {
      if (tool === 'eraser') dab.opacity = opacity
      // Smudge (#14) has no pencil preset to draw an opacity from (the
      // opacity slider here is repurposed as "strength" — see toolSchemas'
      // own smudge entry) — same speedFactor as pencil though: moving
      // slower still means a firmer, more thorough blend, matching how a
      // real blending stump behaves.
      else if (tool === 'smudge') dab.opacity = opacity * speedFactor
      // Liner (#241, ADR 003 §2-3, §7): pressure's own contribution to flow
      // lives entirely in DabShapingProfile.depositPressure (dabShaping.ts),
      // baked into dab.pressure before this ever runs — see linerPresets.ts's
      // own comment on why it isn't re-derived here. Speed and tilt are the
      // only two factors this branch adds on top of the flat preset opacity.
      else if (tool === 'liner') {
        const tiltDeg = Math.sqrt(dab.tiltX * dab.tiltX + dab.tiltY * dab.tiltY)
        dab.opacity = preset.opacity * opacity * inkSpeed * linerTiltFlow(tiltDeg)
      }
      // Marker (#250, ADR 004 §2; explicit pressureFactor added in "Ревизия
      // v1.5" §1 — the expert's own proposed
      // `deposit = flowPerDistance * segmentLength * pressureFactor` names
      // it as its own term rather than folding it silently into "flow"):
      // same speed/tilt shape as liner (shared inkSpeed above), plus a mild
      // markerPressureFlow term liner doesn't have. `dab.opacity` here is
      // *not yet* the final ink deposit — _paintMarkerRibbon multiplies it
      // by this dab's own segmentLength at paint time (distance-
      // normalization can't happen here: this function only ever sees one
      // dab at a time, with no notion of "distance since the previous
      // one" — see _markerSegmentLength).
      else if (tool === 'marker') {
        const tiltDeg = Math.sqrt(dab.tiltX * dab.tiltX + dab.tiltY * dab.tiltY)
        dab.opacity = preset.opacity * opacity * inkSpeed * linerTiltFlow(tiltDeg) * markerPressureFlow(dab.pressure)
      }
      // Charcoal (#304 §3, plus #305's broad-side lightening): shares pencil's
      // speed curve deliberately — "slower stroke -> denser deposit" is equally
      // true of both materials — and adds one term graphite has no analogue
      // for. Laid on its broad side, the stick spreads the same pressure over a
      // far larger contact patch, so it must deposit lighter; without this, the
      // broad regime just paints a much bigger *and* equally dark mark, which
      // reads as a fat marker rather than a stick on its side. Derived from the
      // dab's own baked aspectRatio rather than re-running the ladder on tilt,
      // so it can't disagree with the geometry actually being drawn (see
      // charcoalBroadness' own comment).
      else if (tool === 'charcoal') {
        const broadness = charcoalBroadness(dab.aspectRatio)
        dab.opacity = preset.opacity * opacity * speedFactor * charcoalBroadDensity(broadness)
      }
      else dab.opacity = preset.opacity * opacity * speedFactor
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
    // Smudge only (#14): the dab immediately before this call's own batch,
    // read *before* pushing this call's dabs onto _strokeDabs below — a
    // fresh stroke's very first _onStart call correctly sees undefined
    // (nothing to smear from yet), and every _onMove call after that sees
    // the real previous dab regardless of where the last batch happened to
    // end, so a smudge stroke smears continuously across _onMove's own
    // internal batching instead of restarting at each call.
    this._paintDabs(
      buf, dabs, this._strokeTool, this._strokePreset, this._strokeColor, this._userId,
      this._strokeDabs.at(-1), this._markerStrokeScratch ?? undefined,
    )
    this._strokeDabs.push(...dabs)
    // #122: this is the hot path the split cache exists to keep off — a
    // stroke normally targets _strokeLayerId, captured as _activeId at
    // _onStart, and stays there for the stroke's whole duration, so this is
    // deliberately *not* an unconditional invalidate. Defensive check only:
    // if the active layer was switched mid-stroke (setActiveLayer already
    // invalidated for that), _strokeLayerId can still legitimately diverge
    // from _activeId for the rest of this stroke, and every further dab
    // painted into it must keep invalidating too, not just the first one.
    if (this._strokeLayerId !== this._activeId) this._invalidateSplitCache()
    // A stroke held down long enough (a big fill, a slow scribble) can
    // accumulate dabs indefinitely — see STROKE_DAB_CHUNK_LIMIT's own
    // comment on why that's a real problem, not just a memory nicety.
    if (this._strokeDabs.length >= STROKE_DAB_CHUNK_LIMIT) this._flushStrokeChunk()
  }

  /** Dwell tick (#245, ADR 003 §3/§9): paints one extra dab at the stylus's
   *  last known resting position, its opacity driven by dwellFlow's own
   *  saturating ramp over how long that spot has been the current dwell
   *  anchor — real ink continuing to pool the longer the stylus rests,
   *  bounded so it never runs away past cfg.maxFlow. Called on cfg's own
   *  setInterval (see _onStart) — every tick while the stroke is open, but
   *  only actually paints once elapsed time past the anchor clears
   *  cfg.minDwellMs, so a normal stroke's brief pauses (corners, direction
   *  changes) don't start pooling ink the instant movement merely slows.
   *
   *  Bypasses _bakeDabOpacity/_paintStrokeDabs on purpose: those bake
   *  opacity from *speed*, meaningless for a dab with no real movement
   *  behind it — this dab's opacity comes from elapsed dwell time instead,
   *  via the exact same preset/user-opacity/tilt factors _bakeDabOpacity's
   *  liner branch already applies, just swapping linerSpeedFlow(speed) for
   *  dwellFlow(elapsedMs). Otherwise mirrors _paintStrokeDabs exactly
   *  (paint, stamp Dab.t, push onto _strokeDabs, split-cache/chunk-limit
   *  bookkeeping) so this dab replays identically to any other one — it's
   *  baked into the recorded Operation the same way, nothing about replay
   *  needs to know a timer produced it. */
  private _paintDwellDab(cfg: DwellConfig): void {
    if (!this._strokeLayerId) return
    const elapsed = performance.now() - this._dwellAnchorTimestamp
    if (elapsed < cfg.minDwellMs) return
    const buf = this._layers.get(this._strokeLayerId)
    if (!buf) return

    // #251: mid-stroke here, so _strokePreset is already this stroke's own
    // preset (unlike _onStart's call site above) — safe to read directly.
    const shaping = shapingForTool(
      this._strokeTool, this._strokePreset,
      { angle: this._markerAngleRadians, followStrokeDirection: this._markerFollowStroke },
    )
    const tiltMag = Math.hypot(this._lastPointerTiltX, this._lastPointerTiltY)
    const tiltNorm = tiltMag / 90
    const dab: Dab = {
      x: this._lastPointerX, y: this._lastPointerY,
      pressure: this._lastPointerPressure, tiltX: this._lastPointerTiltX, tiltY: this._lastPointerTiltY,
      size: this._physicalSize * shaping.size(this._lastPointerPressure, tiltNorm),
      aspectRatio: shaping.aspect(tiltNorm),
      // #278: used to be hardcoded 0 for every tool ("no path direction
      // while resting — liner's own aspect response is mild enough this
      // doesn't matter") — true for liner (kept at 0 below, unchanged), but
      // not for marker's chisel nib: its angle is now a real user setting
      // and its aspect is highly elongated (~5:1), so a resting dwell dab
      // must still render at the configured angle, not always horizontal.
      // pathAngle 0 is passed (no path while resting, same as before) —
      // chisel's fixed/offset shaping ignores it anyway; bullet's
      // tiltOrPathAngle still falls back to it exactly as liner's dwell did.
      angle: this._strokeTool === 'marker' ? shaping.angle(tiltMag, this._lastPointerTiltX, this._lastPointerTiltY, 0) : 0,
      opacity: 1, t: performance.now() - this._strokeStartTimestamp,
    }
    const preset = this._resolvePreset(this._strokeTool, this._strokePreset)
    const tiltDeg = Math.hypot(this._lastPointerTiltX, this._lastPointerTiltY)
    dab.opacity = preset.opacity * this._opts.opacity * linerTiltFlow(tiltDeg) * dwellFlow(elapsed, cfg)

    this._paintDabs(
      buf, [dab], this._strokeTool, this._strokePreset, this._strokeColor, this._userId,
      this._strokeDabs.at(-1), this._markerStrokeScratch ?? undefined,
    )
    this._strokeDabs.push(dab)
    if (this._strokeLayerId !== this._activeId) this._invalidateSplitCache()
    if (this._strokeDabs.length >= STROKE_DAB_CHUNK_LIMIT) this._flushStrokeChunk()
    this._scheduleDisplay()
  }

  /** Flushes the in-progress stroke's accumulated dabs as a complete
   *  StrokeOperation without ending the stroke itself — same Operation
   *  shape _onEnd's own dispatch builds, just none of _onEnd's stroke
   *  teardown (_strokeLayerId/_previewBuf/_tipBuf/_display() are all still
   *  legitimately mid-stroke and untouched here; the pointer is still
   *  down, painting continues into the same buffer right after this
   *  returns). See STROKE_DAB_CHUNK_LIMIT's own comment for why this
   *  exists. Guarded by `_strokeDabs.length` the same way _onEnd's own
   *  dispatch is — never called with nothing to flush. */
  private _flushStrokeChunk(): void {
    const layerId = this._strokeLayerId
    if (!layerId || !this._strokeDabs.length) return
    const op: Operation = {
      id: nanoid(10), type: 'stroke', userId: this._userId,
      layerId, tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
      dabs: this._strokeDabs, timestamp: Date.now(),
      ...(this._strokeId ? { strokeId: this._strokeId } : {}),
      ...this._smudgeOpLoadFields(),
    }
    this._log.append(op)
    this._maybeCheckpoint(layerId)
    this._onLocalOperation?.(op)
    this._strokeDabs = []
    // This chunk's own start/end reservoir levels are now baked into `op`
    // above — refresh the marker for whatever chunk comes next in this same
    // still-in-progress gesture (see _smudgeChunkLoadAtStart's own comment).
    this._smudgeChunkLoadAtStart = this._smudgeCaptureLoad(this._userId)
  }

  /** StrokeOperation.smudgeLoadAtStart/End for the op _onEnd/_flushStrokeChunk
   *  are about to build — {} (no fields at all) for every tool but smudge,
   *  so a non-smudge op's shape is unaffected. See those fields' own
   *  comment in packages/shared/src/index.ts. The _smudgeCaptureLoad() call
   *  below is the one gl.readPixels this whole redesign didn't eliminate —
   *  see that method's own comment for why once per recorded op (not per
   *  dab) is fine. */
  private _smudgeOpLoadFields(): { smudgeLoadAtStart?: number; smudgeLoadAtEnd?: number } {
    if (this._strokeTool !== 'smudge') return {}
    return {
      smudgeLoadAtStart: this._smudgeChunkLoadAtStart,
      smudgeLoadAtEnd: this._smudgeCaptureLoad(this._userId),
    }
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
  private async _paintImage(layerBuf: ILayerBuffer, op: ImageImportOperation): Promise<void> {
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

    // Fixed-canvas rooms (op.x/op.y absent): unchanged fit-center-within-
    // the-canvas behavior. Infinite-canvas rooms (op.x/op.y present, world-
    // space top-left — see the shared type's doc comment): natural size,
    // placed wherever the caller chose (current camera center at import
    // time, today) — there's no fixed rect to fit-center within.
    let drawX: number, drawY: number, drawW: number, drawH: number
    if (op.x !== undefined && op.y !== undefined) {
      drawX = op.x; drawY = op.y; drawW = op.width; drawH = op.height
    } else {
      const scale = Math.min(canvas.width / op.width, canvas.height / op.height)
      drawW = op.width * scale
      drawH = op.height * scale
      drawX = (canvas.width - drawW) / 2
      drawY = (canvas.height - drawH) / 2
    }

    const worldRect: WorldRect = { minX: drawX, minY: drawY, maxX: drawX + drawW, maxY: drawY + drawH }
    for (const { buffer, originX, originY } of layerBuf.resolveForPaint(worldRect)) {
      buffer.beginDraw()
      gl.useProgram(this._blitProg)
      const u = this._blitUni
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(u.u_image, 0)
      gl.uniform2f(u.u_bufferSize, buffer.width, buffer.height)
      gl.uniform4f(u.u_imageRect, drawX - originX, drawY - originY, drawW, drawH)
      gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
      const posLoc = this._blitPosLoc
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      buffer.endDraw()
    }
    // (#155 Tier 2) See _paintDabs' identical call for why.
    layerBuf.markContentPainted(worldRect)

    gl.deleteTexture(texture)
    // #122: single choke point for both callers (appendOperation's live
    // path and _applyPixelOp's replay path) — an image_import can target
    // any layer, so only invalidate when it isn't the active one.
    if (op.layerId !== this._activeId) this._invalidateSplitCache()
    this._display()
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  /** Conservative world-space AABB covering every dab's full painted extent
   *  (center +/- radius, padded for aspect ratio so an elongated/rotated
   *  dab is never under-covered) — the rect whose overlapping tile(s) this
   *  batch must be resolved against.
   *
   *  #142: clamped to the visible page for a bounded room (never for an
   *  infinite one). A bounded room's tile size is its own canvas size (see
   *  _makeLayerBuffer), so an *unclamped* rect here would resolve — and
   *  lazily create — a whole extra full-page-sized adjacent tile for every
   *  ordinary stroke whose brush radius merely overlaps the page edge by a
   *  few pixels (extremely common: any stroke drawn near the border), each
   *  one wasted memory that can never become visible again through normal
   *  use. Real, deliberate off-page content only ever gets there through a
   *  layer_transform (_bakeTransform/previewLayerTransform, both compute
   *  their own unclamped rect straight from the transformed content's
   *  actual bounds, independent of this method) — clamping here doesn't
   *  lose anything a user could otherwise reach: pointer input can't even
   *  put a dab's *center* past the visible canvas element's own edge,
   *  same as a real sheet of paper — ink can bleed to the very edge, not
   *  past it. */
  private _dabsWorldBounds(dabs: Dab[], erasing: boolean, preset: PencilPreset): WorldRect {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const d of dabs) {
      const { hx, hy } = this._dabWorldHalfExtents(d, erasing, preset)
      minX = Math.min(minX, d.x - hx); maxX = Math.max(maxX, d.x + hx)
      minY = Math.min(minY, d.y - hy); maxY = Math.max(maxY, d.y + hy)
    }
    if (this._infinite) return { minX, minY, maxX, maxY }
    return {
      minX: Math.max(minX, 0), minY: Math.max(minY, 0),
      maxX: Math.min(maxX, this.canvas.width), maxY: Math.min(maxY, this.canvas.height),
    }
  }

  /** One dab's exact world-space half-extents (an axis-aligned box around
   *  everything that dab can possibly rasterize) — the same per-dab quantity
   *  `_dabsWorldBounds` unions across a whole batch, factored out so
   *  `_paintDabs`'s per-tile filter (see its own comment) and marker's own
   *  per-batch tile resolution (_paintMarkerRibbon) can apply it to one dab at
   *  a time without duplicating the math.
   *
   *  Derived straight from DAB_VERT/DAB_VERT_INSTANCED's own geometry, which
   *  is the true clipping envelope no matter what DAB_FRAG's `discard` does
   *  inside it: the unit quad spans ±0.5, gets stretched by `aspectRatio`
   *  along local X, rotated by `angle`, then scaled by `dabRadius * 2` — so
   *  the footprint is a rotated rectangle with half-extents
   *  (aspectRatio * baseR, baseR), whose AABB is what's computed below.
   *
   *  This used to pad by `max(1, 1/aspectRatio)` instead, i.e. it padded for
   *  the one direction aspect *doesn't* stretch in and ignored the one it
   *  does. Harmless while aspectRatio was pencil/liner-only (1..1.15, a few
   *  px of under-padding at most), but marker's chisel nib is a fixed 5:1
   *  (MARKER_CHISEL_ASPECT_RATIO) at up to 120px width: a dab whose center
   *  sat 60-300px from a tile boundary resolved only its own tile, so the
   *  rest of the nib mark was clipped away by that tile's viewport and the
   *  stroke visibly broke off along the tile edge (and, because the missing
   *  side never accumulated into `coverage`/`inkLoad` either, resumed at a
   *  different darkness on the far side once a later dab's center crossed
   *  over). */
  private _dabWorldHalfExtents(d: Dab, erasing: boolean, preset: PencilPreset): { hx: number; hy: number } {
    const baseR = d.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier)
    // Rotated-rect AABB, not a `baseR * aspectRatio` circle: a 5:1 chisel dab
    // is long *along the nib only*, and inflating the short axis to match
    // would resolve (and so lazily create — 4MB each) whole tiles the dab
    // never actually reaches.
    const halfLong = baseR * Math.max(1, d.aspectRatio)
    const c = Math.abs(Math.cos(d.angle)), s = Math.abs(Math.sin(d.angle))
    return { hx: halfLong * c + baseR * s, hy: halfLong * s + baseR * c }
  }

  /** `target` is usually a real layer's `ILayerBuffer`, but a few callers
   *  (the stroke-scoped live-tip/pointer-prediction scratch buffers, and a
   *  peer's live-stroke reveal buffer) paint into a plain, single, always-
   *  viewport/canvas-sized `AccumulationBuffer` instead — those never need
   *  tile resolution (see their own field comments: transient, visual-only,
   *  never outlive "what's on screen right now"), so they're painted at a
   *  fixed origin (0,0) covering that one buffer, same as before this
   *  method was generalized for tiling.
   *
   *  `userId` (smudge only, #14): whose own carried-graphite reservoir
   *  (this._smudgeReservoirs) these dabs exchange with — every caller already
   *  knows this (their own this._userId for a live/preview stroke, the
   *  StrokeOperation's own userId for a remote/replayed one); unused by
   *  every other tool.
   *
   *  `prevDab` (smudge only, #14): the dab immediately before `dabs[0]` in
   *  the same stroke, if any — see _paintSmudgeDabs' own doc comment for
   *  why this is the one extra piece of context smudge needs that pencil/
   *  eraser don't (every other tool's dabs are independent of each other;
   *  smudge's aren't).
   *
   *  `markerScratch` (marker only, follow-up to #250): the *live, local*
   *  stroke's own MarkerStrokeScratch (this._markerStrokeScratch), so
   *  incremental calls across one in-progress stroke (_paintStrokeDabs,
   *  the dwell tick) keep multiplying against the *same* frozen original
   *  content and the *same* running coverage — omitted by every other
   *  caller (one-shot full-array replay/undo/redo/checkpoint/peer-op
   *  application), which gets a correct, throwaway per-call instance
   *  instead (see _paintMarkerDabs' own doc comment). Unused by every tool
   *  but marker. */
  private _paintDabs(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string,
    color: [number, number, number], userId: string, prevDab?: Dab, markerScratch?: MarkerStrokeScratch,
    strokeId?: string,
  ): void {
    if (!dabs.length) return
    if (tool === 'smudge') { this._paintSmudgeDabs(target, dabs, userId, prevDab); return }
    // Marker (#250, ADR 004 §3; distance-normalized deposit added in
    // "Ревизия v1.5"): each dab needs its own coverage/inkLoad/composite
    // round trip (see _paintMarkerDabs' own doc comment) — self-contained
    // per stroke via markerScratch, no reservoir the way smudge needs, but
    // *does* need prevDab now (§1.5's inkLoad deposit is
    // `dab.opacity * segmentLength`, and segmentLength needs the previous
    // dab's own position) — unlike the smudge branch above, userId is still
    // unused (no per-user state).
    if (tool === 'marker') { this._paintMarkerDabs(target, dabs, presetName, color, markerScratch, prevDab, strokeId); return }
    const erasing = tool === 'eraser'
    // DAB_FRAG's own u_inkMode (see its doc comment there for the full value
    // table). Resolved once here as a number rather than one boolean flag per
    // tool — #304 would otherwise have added a second `charcoalMode` boolean
    // alongside `linerMode` and threaded both through the two paint methods
    // below, which is exactly how two flags for one mutually-exclusive
    // switch drift out of sync.
    const inkMode = tool === 'liner' ? 1.0 : tool === 'charcoal' ? 5.0 : 0.0
    // Charcoal's own three extra preset fields (#304) — null for every other
    // tool, in which case the paint methods below leave their uniforms at 0
    // (never read outside DAB_FRAG's u_inkMode>4.5 branch).
    const charcoal: CharcoalPreset | null = tool === 'charcoal' ? charcoalPresetFor(presetName) : null
    const preset  = this._resolvePreset(tool, presetName)
    const worldBounds = this._dabsWorldBounds(dabs, erasing, preset)
    const targets: PaintTarget[] = target instanceof AccumulationBuffer
      ? [{ buffer: target, originX: 0, originY: 0, contentRect: null }]
      : target.resolveForPaint(worldBounds)

    for (const { buffer, originX, originY } of targets) {
      // A stroke's dab batch is resolved against every tile its *union*
      // bounding box overlaps (resolveForPaint), but an individual dab
      // rarely overlaps every one of those tiles itself — e.g. an infinite
      // room's tile grid is rooted at world (0,0), exactly where the
      // default camera centers the visible page, so ordinary drawing near
      // the middle routinely resolves 2-4 tiles at once even though any
      // given ~8px dab only ever lands in one of them. Before this filter,
      // every target got the *entire* batch re-uploaded and redrawn
      // (`_paintDabsInstanced`'s bufferData + drawArraysInstancedANGLE),
      // regardless of overlap — harmless for final pixels (dabs outside a
      // tile's viewport just get clipped by the rasterizer) but multiplied
      // real GPU submission cost by the tile count on every pointermove.
      // Skipped for the single-target case (the overwhelming common case:
      // every bounded room, and most infinite strokes) to avoid the filter
      // allocation on the hot path where it can only ever keep everything.
      const tileDabs = targets.length === 1 ? dabs : dabs.filter(d => {
        const { hx, hy } = this._dabWorldHalfExtents(d, erasing, preset)
        return d.x + hx > originX && d.x - hx < originX + buffer.width &&
               d.y + hy > originY && d.y - hy < originY + buffer.height
      })
      if (!tileDabs.length) continue

      if (erasing) buffer.beginErase()
      else buffer.beginDraw()

      // #123: batch every dab in this call into one instanced draw call when
      // the extension is available (effectively always, in practice) — see
      // _paintDabsInstanced's docstring for why this preserves the exact
      // sequential per-dab blend order the fallback loop below relies on.
      if (this._instancedArraysExt) {
        this._paintDabsInstanced(tileDabs, erasing, inkMode, charcoal, preset, color, buffer.width, buffer.height, originX, originY)
      } else {
        this._paintDabsUniform(tileDabs, erasing, inkMode, charcoal, preset, color, buffer.width, buffer.height, originX, originY)
      }

      buffer.endDraw()
    }
    // (#155 Tier 2) A plain AccumulationBuffer (live-tip/prediction/peer
    // reveal) is transient/visual-only and never queried for content bounds
    // — nothing to track. A real ILayerBuffer target tracks it so
    // getContentBounds() never has to fall back to a readPixels scan.
    if (!(target instanceof AccumulationBuffer)) target.markContentPainted(worldBounds)
  }

  /** Fallback path for a WebGL1 context without ANGLE_instanced_arrays: one
   *  gl.drawArrays + ~9 gl.uniform* calls per dab, kept exactly as it was
   *  before #123 (same shader math via DAB_VERT, same GL call count/order) —
   *  the safety net on the rare device that lacks the extension.
   *  `resW/resH` is the actual target buffer's size (bounded: canvas size,
   *  same as before; tiled: one tile's TILE_SIZE) and `originX/originY`
   *  translates each dab's world-space center into that buffer's local
   *  space (bounded: always (0,0), so this is a no-op there). */
  private _paintDabsUniform(
    dabs: Dab[], erasing: boolean, inkMode: number, charcoal: CharcoalPreset | null,
    preset: PencilPreset, color: [number, number, number],
    resW: number, resH: number, originX: number, originY: number,
  ): void {
    const { gl } = this
    gl.useProgram(this._dabProg)
    const u = this._dabUni

    gl.uniform2f(u.u_resolution, resW, resH)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    // #141: world-space paper sampling — see DAB_FRAG's own comment. Y is
    // negated (defensively normalized away from -0 with `|| 0`, since
    // JSON/toEqual-style equality checks — see this fix's own tests — can
    // otherwise trip on -0 !== 0): DAB_VERT's own clip.y flip means a
    // dab-buffer's local gl_FragCoord.y runs opposite to the tile origin's
    // top-down world-Y convention, so origin must be *subtracted* (not
    // added) there for the two to agree at every shared tile edge — see
    // this fix's own tests for the boundary derivation. originX/Y are
    // always (0,0) for a bounded room, so this is (0,0) there regardless.
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperOrigin, originX, -originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.uniform1f(u.u_hardness, erasing ? 0.85 : preset.hardness)
    gl.uniform1f(u.u_eraseMode, erasing ? 1.0 : 0.0)
    gl.uniform3fv(u.u_color, color)
    gl.uniform1i(u.u_grainMode, this._resolveGrainMode(charcoal))
    gl.uniform1f(u.u_paperFillThreshold, this._paperFillThreshold)
    gl.uniform1f(u.u_paperFillCap, this._paperFillCap)
    gl.uniform1f(u.u_inkMode, inkMode)
    gl.uniform1f(u.u_charcoalTooth,   charcoal?.tooth   ?? 0)
    gl.uniform1f(u.u_charcoalCrumble, charcoal?.crumble ?? 0)
    gl.uniform1f(u.u_charcoalDust,    charcoal?.dust    ?? 0)
    // #305: read live off CHARCOAL_FEEL (the debug overlay mutates it in
    // place), not captured once — same reason CHARCOAL_DAB_SHAPING's own
    // tiltSmoothing is a getter.
    gl.uniform1f(u.u_charcoalBroadAspect, charcoal ? CHARCOAL_FEEL.broadAspect : 0)
    gl.uniform1f(u.u_charcoalBroadGrain,  charcoal ? CHARCOAL_FEEL.broadGrainBoost : 0)
    gl.uniform1f(u.u_charcoalPressFloor,  charcoal ? CHARCOAL_FEEL.pressureFloor : 0)
    gl.uniform1f(u.u_charcoalPressGamma,  charcoal ? CHARCOAL_FEEL.pressureGamma : 1)
    gl.uniform1f(u.u_charcoalSkipFloor,   charcoal ? CHARCOAL_FEEL.skipFloor : 1)
    gl.uniform1f(u.u_charcoalGateRelief,  charcoal ? CHARCOAL_FEEL.gateRelief : 0)
    gl.uniform1f(u.u_charcoalGrainDepth,  charcoal ? CHARCOAL_FEEL.grainDepth : 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    const posLoc = this._dabPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    for (const dab of dabs) {
      gl.uniform2f(u.u_dabCenter, dab.x - originX, dab.y - originY)
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
    dabs: Dab[], erasing: boolean, inkMode: number, charcoal: CharcoalPreset | null,
    preset: PencilPreset, color: [number, number, number],
    resW: number, resH: number, originX: number, originY: number,
  ): void {
    const { gl } = this
    const ext = this._instancedArraysExt
    if (!ext) return // only called when present; guards the type narrowing below
    const u = this._dabInstUni

    gl.useProgram(this._dabProgInstanced)
    gl.uniform2f(u.u_resolution, resW, resH)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    // #141: see _paintDabsUniform's own comment for the world-space-paper /
    // origin-sign reasoning — identical here, just for the batched path.
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperOrigin, originX, -originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.uniform1f(u.u_hardness, erasing ? 0.85 : preset.hardness)
    gl.uniform1f(u.u_eraseMode, erasing ? 1.0 : 0.0)
    gl.uniform3fv(u.u_color, color)
    gl.uniform1i(u.u_grainMode, this._resolveGrainMode(charcoal))
    gl.uniform1f(u.u_paperFillThreshold, this._paperFillThreshold)
    gl.uniform1f(u.u_paperFillCap, this._paperFillCap)
    gl.uniform1f(u.u_inkMode, inkMode)
    gl.uniform1f(u.u_charcoalTooth,   charcoal?.tooth   ?? 0)
    gl.uniform1f(u.u_charcoalCrumble, charcoal?.crumble ?? 0)
    gl.uniform1f(u.u_charcoalDust,    charcoal?.dust    ?? 0)
    // #305: read live off CHARCOAL_FEEL (the debug overlay mutates it in
    // place), not captured once — same reason CHARCOAL_DAB_SHAPING's own
    // tiltSmoothing is a getter.
    gl.uniform1f(u.u_charcoalBroadAspect, charcoal ? CHARCOAL_FEEL.broadAspect : 0)
    gl.uniform1f(u.u_charcoalBroadGrain,  charcoal ? CHARCOAL_FEEL.broadGrainBoost : 0)
    gl.uniform1f(u.u_charcoalPressFloor,  charcoal ? CHARCOAL_FEEL.pressureFloor : 0)
    gl.uniform1f(u.u_charcoalPressGamma,  charcoal ? CHARCOAL_FEEL.pressureGamma : 1)
    gl.uniform1f(u.u_charcoalSkipFloor,   charcoal ? CHARCOAL_FEEL.skipFloor : 1)
    gl.uniform1f(u.u_charcoalGateRelief,  charcoal ? CHARCOAL_FEEL.gateRelief : 0)
    gl.uniform1f(u.u_charcoalGrainDepth,  charcoal ? CHARCOAL_FEEL.grainDepth : 0)

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
      data[o + 0] = d.x - originX
      data[o + 1] = d.y - originY
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

  /** See _paintOneSmudgeDab's own doc comment for the algorithm and
   *  _paintDabs' doc comment for `prevDab`. Never batched (unlike pencil/
   *  eraser's _paintDabsInstanced): each dab's own pickup contact has to
   *  sample whatever the *previous* dab (in this same call, or — courtesy
   *  of `prevDab` — the previous _paintDabs call in this stroke) already
   *  left there, and this._smudgeReservoirs' own per-user texture is a
   *  single running (ping-ponged) value threaded dab-to-dab — so dab N+1
   *  can't be submitted until dab N's own GPU passes have actually been
   *  issued in order. A real cost pencil/eraser don't pay (their own dabs
   *  are independent, safely batched), but smudge strokes are a deliberate,
   *  comparatively low-frequency gesture (blending a shaded area), not fast
   *  scribbling — not the same hot path #123 batched. */
  private _paintSmudgeDabs(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], userId: string, prevDab: Dab | undefined,
  ): void {
    // Transient scratch targets (live-tip/prediction preview, a peer's
    // reveal buffer) are a single un-tiled buffer, freshly cleared before
    // every refresh — nothing meaningful to pick up, and reading it back
    // while it's also the render target would need the same same-texture
    // read+write WebGL1 forbids. A harmless no-op: the real dabs below
    // always paint straight into the real layer regardless (see
    // _paintDabs' own doc comment on this parameter).
    if (target instanceof AccumulationBuffer) return
    let prev = prevDab
    for (const dab of dabs) {
      if (prev) this._paintOneSmudgeDab(target, prev, dab, userId)
      prev = dab
    }
  }

  /** One smudge dab: three separate exchange contacts with
   *  this._smudgeToolLoad, the tool's own small carried-graphite reservoir
   *  (see that field's own comment) — not a direct patch-copy the way this
   *  used to work, and not just a rear/front pair either (see
   *  SMUDGE_REAR_RATE's own comment for why a third, center contact was
   *  added). All three trade the *difference* between the paper's own
   *  graphite level there and the reservoir's current level, in whichever
   *  direction it points — paper darker than the tool: pickup (erase-style,
   *  weighted by SMUDGE_TRANSFER_FRAG's paperCatch pickup floor — see that
   *  shader's own comment for why a spot's own paper grain can leave it
   *  partly unreachable no matter how many passes); tool darker than the
   *  paper: deposit instead (normal alpha-over, not the old mix() — this is
   *  what makes densely-overlapping dabs blend into a continuous stroke
   *  instead of a chain of circles).
   *
   *   - rear (behind `dab`, opposite its direction of travel from `prev`):
   *     the primary transport contact, usually pickup-dominant since it's
   *     revisiting where the tool just came from. Reads the paper for real
   *     (_smudgeReadContact).
   *   - front (ahead of `dab`, same direction): usually deposit-dominant,
   *     since the territory ahead is typically lighter than the reservoir.
   *     Also reads the paper for real.
   *   - center (`dab`'s own position): gentler exchange, plus "embedding"
   *     — pressing graphite into the paper's own low spots under pressure,
   *     the same fill mechanic pencil dabs already get (see u_embed). Does
   *     *not* read the paper on its own — center sits directly between rear
   *     and front along the stroke's own direction of travel, close enough
   *     that a distance-weighted blend of their two already-fetched
   *     averages (_lerpSmudgeAvg) is a good stand-in for a third real read.
   *     Reported after this design first shipped: rooms with a lot of
   *     smudging in their history took noticeably longer to (re)join —
   *     gl.readPixels is a real GPU/CPU sync stall, invisible spread across
   *     interactive drawing but very much not when replaying a history tail
   *     dab-by-dab in a tight loop on join (see #149's snapshot+tail-replay
   *     design). Three real reads per dab meant three stalls per dab;
   *     cutting one of three (rear/front stay exact, since they're what the
   *     "reads real paper, not an approximation" guarantee most needs to
   *     hold) measured as the difference between a room settling in ~3.85s
   *     vs ~1.06s at ~900 smudge dabs of history — center falling back to
   *     interpolation only when both neighbors have a real reading to blend
   *     (see below) keeps that same real-vs-approximated tradeoff, just
   *     with one fewer stall paid for it.
   *
   *  v1 scope: skips a contact entirely (rather than clipping or attempting
   *  cross-tile compositing) whenever its patch doesn't fit fully inside a
   *  single resident/creatable tile — an infinite room's tile grid means a
   *  smudge stroke crossing a tile boundary currently just has a gap there.
   *  Acceptable for now (typical brush sizes are far smaller than
   *  TILE_SIZE, so this only bites right at a boundary) — full cross-tile
   *  sampling would need the same multi-source-tile treatment
   *  _bakeTransform already has, not yet ported here. */
  private _paintOneSmudgeDab(target: ILayerBuffer, prev: Dab, dab: Dab, userId: string): void {
    const radius = dab.size * 0.5 * SMUDGE_SIZE_MULTIPLIER
    if (radius < 0.5) return

    const dx = dab.x - prev.x
    const dy = dab.y - prev.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-3) return // no direction to smear from (a stationary/duplicate sample)
    const dirX = dx / len
    const dirY = dy / len
    const rearOffset = radius * SMUDGE_OFFSET_FACTOR
    const frontOffset = radius * SMUDGE_FRONT_OFFSET_FACTOR

    this._smudgeContact(target, dab.x - dirX * rearOffset, dab.y - dirY * rearOffset, radius, SMUDGE_REAR_RATE, dab, userId, false)
    this._smudgeContact(target, dab.x, dab.y, radius, SMUDGE_CENTER_RATE, dab, userId, true)
    this._smudgeContact(target, dab.x + dirX * frontOffset, dab.y + dirY * frontOffset, radius, SMUDGE_FRONT_RATE, dab, userId, false)
  }

  /** One exchange contact for smudge, entirely GPU-resident (#14 round 4 —
   *  see this._smudgeReservoirs' own field comment for why): copies the
   *  patch behind this contact (as before), then runs SMUDGE_COMPUTE_FRAG
   *  twice against `userId`'s own current reservoir texture — once to
   *  produce the *new* reservoir (ping-ponged into the other of the pair),
   *  once to produce this contact's own pickup/deposit amounts (a small
   *  scratch texture) — and finally always issues both a pickup-mode and a
   *  deposit-mode SMUDGE_TRANSFER_FRAG draw, each sampling its own amount
   *  out of that scratch texture rather than being told a JS-computed
   *  number. Exactly one of the two draws ever has a nonzero amount (the
   *  compute shader's pickupAmount/depositAmount are the max(x,0)/
   *  max(-x,0) split of one signed difference, same as the old JS branch's
   *  `if (raw > 0) {...} else {...}` did) — the "wrong" direction's draw is
   *  a harmless no-op, the price of never knowing on the CPU which
   *  direction it turned out to be (that's the whole point: nothing here
   *  ever needs the exchange's numeric result back on the CPU). `rate` is
   *  this contact's own share of the difference per dab. `embed` enables
   *  the deposit draw's fill mechanic (see SMUDGE_TRANSFER_FRAG's own
   *  u_embed comment) — center contact only.
   *
   *  v1 scope: skips a contact entirely (rather than clipping or attempting
   *  cross-tile compositing) whenever its patch doesn't fit fully inside a
   *  single resident/creatable tile — an infinite room's tile grid means a
   *  smudge stroke crossing a tile boundary currently just has a gap there
   *  (unchanged from earlier rounds). */
  private _smudgeContact(
    target: ILayerBuffer, cx: number, cy: number, radius: number, rate: number, dab: Dab, userId: string, embed: boolean,
  ): void {
    const patchWorld = Math.ceil(radius * 2)
    const patchSize = Math.min(SMUDGE_MAX_PATCH_SIZE, Math.ceil(patchWorld / SMUDGE_PATCH_GRANULARITY) * SMUDGE_PATCH_GRANULARITY)
    if (patchSize < 1) return
    const half = patchSize / 2

    const targets = target.resolveForPaint({ minX: cx - half, minY: cy - half, maxX: cx + half, maxY: cy + half })
    if (targets.length !== 1) return // spans more than one tile (or none) — see this method's own doc comment
    const tile = targets[0]
    const localX = Math.round(cx - half - tile.originX)
    const localY = Math.round(cy - half - tile.originY)
    if (localX < 0 || localY < 0
      || localX + patchSize > tile.buffer.width || localY + patchSize > tile.buffer.height) return

    // App-space (top-down, like every Dab.x/y) -> GL framebuffer space
    // (bottom-up) — same flip every other app-space/GL boundary in this
    // file applies (DAB_VERT's clip.y flip, pickColor) — see
    // copyRegionTo's own doc comment.
    const patch = this._acquireSmudgeScratchBuf(patchSize)
    const glY = tile.buffer.height - localY - patchSize
    tile.buffer.copyRegionTo(patch, localX, glY, patchSize, patchSize)

    const reservoir = this._smudgeGetReservoir(userId)
    const oldBuf = reservoir.bufs[reservoir.current]
    const newIdx: 0 | 1 = reservoir.current === 0 ? 1 : 0
    const newBuf = reservoir.bufs[newIdx]
    const transferBuf = this._smudgeGetTransferScratch()

    // Both compute passes read the *same* old reservoir (oldBuf) — order
    // between them doesn't matter, since neither is fed by the other's
    // output.
    this._smudgeRunCompute(patch, oldBuf, newBuf, rate, dab, 0)
    this._smudgeRunCompute(patch, oldBuf, transferBuf, rate, dab, 1)
    reservoir.current = newIdx
    this._releaseSmudgeScratchBuf(patch)

    this._drawSmudgeTransferDab(tile, cx, cy, radius, transferBuf, newBuf, 'pickup', dab.pressure, false)
    this._drawSmudgeTransferDab(tile, cx, cy, radius, transferBuf, newBuf, 'deposit', dab.pressure, embed)

    target.markContentPainted({ minX: cx - radius, minY: cy - radius, maxX: cx + radius, maxY: cy + radius })
  }

  /** `userId`'s own reservoir texture pair, creating it (cleared to (0,0,0,0)
   *  — an empty reservoir, same default the old JS Map's `?? 0`/`?? graphite
   *  Color` fallbacks gave) on first use. Never removed once created — see
   *  this._smudgeReservoirs' own field comment for why that's fine (tiny,
   *  1x1 GPU textures, mirrors _peerPreviews' own no-explicit-cleanup
   *  precedent). */
  private _smudgeGetReservoir(userId: string): { bufs: [AccumulationBuffer, AccumulationBuffer]; current: 0 | 1 } {
    let r = this._smudgeReservoirs.get(userId)
    if (!r) {
      const a = new AccumulationBuffer(this.gl, 1, 1, 'nearest')
      const b = new AccumulationBuffer(this.gl, 1, 1, 'nearest')
      a.clear()
      b.clear()
      r = { bufs: [a, b], current: 0 }
      this._smudgeReservoirs.set(userId, r)
    }
    return r
  }

  private _smudgeGetTransferScratch(): AccumulationBuffer {
    if (!this._smudgeTransferScratch) this._smudgeTransferScratch = new AccumulationBuffer(this.gl, 1, 1, 'nearest')
    return this._smudgeTransferScratch
  }

  /** Directly writes `load` (and the current graphite color, since a
   *  recorded StrokeOperation only ever bakes the load number — see
   *  StrokeOperation.smudgeLoadAtStart's own comment) into `userId`'s
   *  *current* reservoir texture via AccumulationBuffer.restorePixels — a
   *  plain CPU->GPU texture upload, not a readback, so this costs nothing
   *  like gl.readPixels does. Used to seed the reservoir from a recorded/
   *  incoming op's own smudgeLoadAtStart before applying its dabs (see
   *  appendOperation's and _applyPixelOp's own stroke cases) — the
   *  deterministic-replay counterpart to _smudgeCaptureLoad. */
  private _smudgeSeedReservoir(userId: string, load: number): void {
    const reservoir = this._smudgeGetReservoir(userId)
    const color = this._opts.graphiteColor
    const pixels = new Uint8Array([
      Math.round(clampNum(color[0], 0, 1) * 255),
      Math.round(clampNum(color[1], 0, 1) * 255),
      Math.round(clampNum(color[2], 0, 1) * 255),
      Math.round(clampNum(load, 0, 1) * 255),
    ])
    reservoir.bufs[reservoir.current].restorePixels(pixels)
  }

  /** Reads `userId`'s current reservoir load back to the CPU — the one
   *  gl.readPixels this redesign didn't eliminate, and deliberately so: it
   *  only ever runs once per recorded StrokeOperation (at _onEnd/
   *  _flushStrokeChunk, to bake smudgeLoadAtStart/End — see those methods'
   *  own comments), never per dab, so it's nowhere near the replay-tail hot
   *  path that motivated moving everything else off the CPU. Returns 0 for
   *  a user with no reservoir yet (never smudged this session), same
   *  default _smudgeGetReservoir itself starts from. */
  private _smudgeCaptureLoad(userId: string): number {
    const r = this._smudgeReservoirs.get(userId)
    if (!r) return 0
    return r.bufs[r.current].readPixels()[3] / 255
  }

  /** One SMUDGE_COMPUTE_FRAG draw call, rendering into `target` (always a
   *  1x1 buffer). `outputMode` 0 writes the new reservoir (rgb=color,
   *  a=load) into `target`; 1 writes this contact's own pickup/deposit
   *  amounts (r/g) into `target` instead — see that shader's own file
   *  comment. GL blending must stay disabled: this is a straight compute
   *  write, not something accumulating over prior content the way a real
   *  paint dab does. */
  private _smudgeRunCompute(
    patch: AccumulationBuffer, oldReservoir: AccumulationBuffer, target: AccumulationBuffer,
    rate: number, dab: Dab, outputMode: 0 | 1,
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.width, target.height)
    gl.disable(gl.BLEND)
    gl.useProgram(this._smudgeComputeProg)
    const u = this._smudgeComputeUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, patch.texture)
    gl.uniform1i(u.u_patch, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, oldReservoir.texture)
    gl.uniform1i(u.u_oldReservoir, 1)
    gl.uniform1f(u.u_rate, rate)
    // dab.opacity is the UI's "Strength" slider (see _bakeDabOpacity's own
    // smudge branch) — applies to both directions equally, same as pressure.
    gl.uniform1f(u.u_pressure, dab.pressure)
    gl.uniform1f(u.u_opacity, dab.opacity)
    gl.uniform1f(u.u_maxStep, SMUDGE_MAX_STEP)
    gl.uniform1f(u.u_outputMode, outputMode)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    gl.enableVertexAttribArray(this._smudgeComputePosLoc)
    gl.vertexAttribPointer(this._smudgeComputePosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** One SMUDGE_TRANSFER_FRAG draw call — either a `pickup` (erase-style,
   *  beginErase()'s (ZERO, ONE_MINUS_SRC_ALPHA) blend) or a `deposit`
   *  (over-style, beginDraw()'s (ONE, ONE_MINUS_SRC_ALPHA) blend, colored
   *  from `reservoirTex`) at world position (cx, cy) — see _smudgeContact
   *  for the call site. `transferTex`/`reservoirTex` are 1x1 textures
   *  (SMUDGE_COMPUTE_FRAG's own two outputs), sampled by the shader itself
   *  rather than passed as JS-computed uniforms — see SMUDGE_TRANSFER_FRAG's
   *  own file comment for why. */
  private _drawSmudgeTransferDab(
    tile: PaintTarget, cx: number, cy: number, radius: number,
    transferTex: AccumulationBuffer, reservoirTex: AccumulationBuffer, mode: 'pickup' | 'deposit',
    pressure: number, embed: boolean,
  ): void {
    const { gl } = this
    const { buffer } = tile
    if (mode === 'deposit') buffer.beginDraw()
    else buffer.beginErase()

    gl.useProgram(this._smudgeProg)
    const u = this._smudgeUni
    gl.uniform2f(u.u_resolution, buffer.width, buffer.height)
    // Same world-space paper sampling every other dab shader uses — see
    // DAB_FRAG's own #141 comment for the origin-sign/world-size reasoning.
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, transferTex.texture)
    gl.uniform1i(u.u_transferTex, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, reservoirTex.texture)
    gl.uniform1i(u.u_reservoirTex, 2)
    gl.uniform1f(u.u_hardness, SMUDGE_HARDNESS)
    gl.uniform1f(u.u_mode, mode === 'deposit' ? 1.0 : 0.0)
    gl.uniform1f(u.u_pickupFloor, SMUDGE_PICKUP_FLOOR)
    gl.uniform1f(u.u_pressure, pressure)
    gl.uniform1f(u.u_paperFillThreshold, this._paperFillThreshold)
    gl.uniform1f(u.u_paperFillCap, this._paperFillCap)
    gl.uniform1f(u.u_embed, embed ? 1.0 : 0.0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    gl.enableVertexAttribArray(this._smudgePosLoc)
    gl.vertexAttribPointer(this._smudgePosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, cx - tile.originX, cy - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, 0)
    gl.uniform1f(u.u_aspectRatio, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    buffer.endDraw()
  }

  private _acquireSmudgeScratchBuf(size: number): AccumulationBuffer {
    const pool = this._smudgeScratchPool
    const idx = pool.findIndex(b => b.width === size && b.height === size)
    if (idx !== -1) return pool.splice(idx, 1)[0]
    return new AccumulationBuffer(this.gl, size, size, 'nearest')
  }

  private _releaseSmudgeScratchBuf(buf: AccumulationBuffer): void {
    this._smudgeScratchPool.push(buf)
  }

  // ─── Marker (#250, ADR 004 §3; compositing redesigned in a follow-up —
  // see MarkerStrokeScratch's own doc comment) ────────────────────────────

  /** Marker: each dab is a two-pass draw against this stroke's own
   *  MarkerStrokeScratch — a coverage pass (this dab's own contribution,
   *  saturating into the stroke's running total) followed by a composite
   *  draw (multiplies the tile's *original*, pre-stroke content by that
   *  running total) — see MarkerStrokeScratch's own doc comment for why
   *  this replaced the original single-pass patch-copy-then-multiply
   *  design. Still not batchable the way pencil/eraser's independent dabs
   *  are (see _paintSmudgeDabs' own doc comment for the identical
   *  justification: marker strokes are a comparatively low-frequency
   *  "shading pass" gesture, not fast scribbling, so paying two draw
   *  calls' worth of overhead per dab is an accepted cost, not a
   *  regression).
   *
   *  `markerScratch` omitted means this call is the *entire* stroke's dabs
   *  in one shot (replay/undo/redo/checkpoint bake/most peer-op
   *  application) — a throwaway instance scoped to just this call is
   *  exactly correct there (every dab of the stroke is handled within this
   *  one call, so "first touch" and "running coverage" both start fresh at
   *  the top and never need to survive past the end of it). Provided means
   *  this is one incremental slice of an in-progress *local* stroke
   *  (_paintStrokeDabs, the dwell tick) — the caller (engine._onStart/
   *  _onEnd) owns that instance's lifetime across every slice. */
  private _paintMarkerDabs(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], presetName: string, color: [number, number, number],
    markerScratch?: MarkerStrokeScratch, prevDab?: Dab, strokeId?: string,
  ): void {
    // Transient scratch targets (live-tip/prediction preview, a peer's
    // reveal buffer) have no resolveForPaint() (only a real ILayerBuffer
    // does — see _paintMarkerRibbon below, which needs it to find the
    // tile), so there's nothing this path can paint into there anyway —
    // same early-return _paintSmudgeDabs' own doc comment documents for
    // the identical structural reason. The real dabs always paint straight
    // into the real layer regardless (see _paintDabs' own doc comment on
    // `target`).
    if (target instanceof AccumulationBuffer) return
    const preset = this._resolvePreset('marker', presetName)
    const chunk = markerScratch ? null : this._replayChunkScratch(target, strokeId, dabs)
    const scratch = markerScratch ?? chunk?.scratch ?? new MarkerStrokeScratch(this.gl)
    // `prevDab` is threaded the same way smudge threads its own
    // (_paintSmudgeDabs): the dab immediately before dabs[0] may come from a
    // *previous* call in the same stroke (see _paintDabs' own doc comment on
    // markerScratch/prevDab), and the ribbon needs it both to bridge the two
    // batches and to compute this batch's own distance-normalized ink deposit.
    this._paintMarkerRibbon(target, dabs, preset, color, scratch, prevDab ?? chunk?.prevDab, presetName)
    // The cached one belongs to the gesture, not to this call — it is released
    // when a different gesture arrives, or with the engine.
    if (!markerScratch && !chunk) scratch.destroy()
  }

  /** The scratch this replayed operation should paint through, given the
   *  gesture it belongs to — see _replayMarkerChunk. Returns null for an
   *  operation with no gesture id (a stroke recorded before strokeId existed),
   *  which then falls back to a throwaway scratch, exactly as before. */
  private _replayChunkScratch(
    target: ILayerBuffer, strokeId: string | undefined, dabs: Dab[],
  ): { scratch: MarkerStrokeScratch; prevDab?: Dab } | null {
    if (!strokeId || !dabs.length) return null
    const cached = this._replayMarkerChunk
    if (cached && cached.strokeId === strokeId && cached.target === target) {
      const prevDab = cached.lastDab
      cached.lastDab = dabs[dabs.length - 1]
      return { scratch: cached.scratch, prevDab }
    }
    cached?.scratch.destroy()
    const scratch = new MarkerStrokeScratch(this.gl)
    this._replayMarkerChunk = { strokeId, target, scratch, lastDab: dabs[dabs.length - 1] }
    return { scratch }
  }

  /** #330 — the marker's rasterizer: the stroke as one connected swept figure.
   *
   *  Three fields (coverage / inkLoad / composite, see MarkerStrokeScratch):
   *
   *  - **coverage** is plain geometry, not an accumulation of soft profiles: a
   *    nib stamp at every sample (DAB_FRAG's u_inkMode=6, an analytic in-pixel
   *    distance to the nib's outline) plus the bands between consecutive
   *    samples (markerRibbon.ts + RIBBON_FRAG). Both resolve their edge over a
   *    fixed ~1 canvas px ramp, so the mark's edge no longer widens with the
   *    brush — the complaint that started all of this. Their union is exact:
   *    for a convex nib, sweeping it along a segment is precisely the convex
   *    hull of its two endpoint copies, which stamp+band+stamp reproduces with
   *    nothing missing and nothing extra (see markerRibbon.ts, including what
   *    it does when the nib also turns between samples).
   *  - **inkLoad** rides the *same* geometry, both the stamps (u_inkMode=7) and
   *    the ribbon (RIBBON_FRAG's ink mode), each carrying half the deposit.
   *    Splatting it only at the stamps is what left rounded white notches on
   *    turns: between stamps the ribbon still made the mark opaque, but with no
   *    ink there the composite multiplied by nothing and the paper showed
   *    through.
   *  - **composite** runs *once per batch* over the batch's own dirty rect
   *    rather than once per dab. It was always a pure recomputation from
   *    (original, coverage, inkLoad); with coverage now coming from geometry
   *    that reaches between the dabs, a per-dab quad would no longer cover
   *    everything the other two passes just wrote.
   *
   *  Blending for coverage stays the ordinary saturating "over" rather than
   *  needing EXT_blend_minmax: interior coverage here is a flat 1.0, and
   *  over(x, 1) == 1, so a stamp's antialiased rim landing inside a band (or
   *  vice versa) resolves to solid either way. The two only ever meet at a
   *  tangent point, where both are ramping, and the difference between max and
   *  over there is a fraction of one pixel. */
  private _paintMarkerRibbon(
    target: ILayerBuffer, dabs: Dab[], preset: PencilPreset, color: [number, number, number],
    scratch: MarkerStrokeScratch, prevDab: Dab | undefined, presetName: string,
  ): void {
    const drawable = dabs.filter(d => d.size * 0.5 * preset.sizeMultiplier >= 0.5)
    if (!drawable.length) return

    // #330 stage 3: the chisel is a rounded rectangle, the bullet an ellipse —
    // see MARKER_CHISEL_CORNER_FRACTION. Resolved once per call and threaded
    // through both the CPU-side band builder and the shader, which must agree
    // on the outline or the bands would connect a different shape than the
    // stamps they sit between.
    const chisel = markerNibFromPreset(presetName) === 'chisel'
    const nibShape: NibShape = chisel ? 'roundedBox' : 'ellipse'
    const cornerFraction = chisel ? MARKER_CHISEL_CORNER_FRACTION : 0

    // One bounds box for the whole batch: the tiles to paint, and the rect the
    // single composite pass covers. Padded per dab by the same half-extents the
    // ordinary graphite path uses, so a chisel nib's 5x reach is accounted for.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const d of prevDab ? [prevDab, ...drawable] : drawable) {
      const { hx, hy } = this._dabWorldHalfExtents(d, false, preset)
      minX = Math.min(minX, d.x - hx); maxX = Math.max(maxX, d.x + hx)
      minY = Math.min(minY, d.y - hy); maxY = Math.max(maxY, d.y + hy)
    }
    const bounds = { minX, minY, maxX, maxY }
    const targets = target.resolveForPaint(bounds)
    if (!targets.length) return

    const bands = buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, MARKER_EDGE_AA_PX)

    for (const tile of targets) {
      const { original, coverage, inkLoad } = scratch.getOrCreate(tile.buffer)

      for (const dab of drawable) this._drawMarkerNibPass(coverage, tile, dab, preset, nibShape, cornerFraction, 6, 0)
      if (bands.length) this._drawMarkerBands(coverage, tile, bands, 'coverage')

      // Ink follows the *same* figure as the silhouette. Depositing it only at
      // the sample stamps is what produced the rounded white notches on turns:
      // between stamps the ribbon still made the mark fully opaque, but with an
      // ink load of zero the composite multiplies by nothing and the paper
      // shows straight through. Both halves carry half a dose each (see
      // buildRibbonBands) so their overlap sums to the calibrated amount.
      let prev = prevDab
      for (const dab of drawable) {
        const radius = dab.size * 0.5 * preset.sizeMultiplier
        const deposit = dab.opacity * this._markerSegmentLength(dab, prev, radius) * 0.5
        inkLoad.beginAdditiveDraw()
        this._drawMarkerNibPass(inkLoad, tile, dab, preset, nibShape, cornerFraction, 7, deposit, false)
        inkLoad.endDraw()
        prev = dab
      }
      if (bands.length) this._drawMarkerBands(inkLoad, tile, bands, 'ink')

      this._drawMarkerCompositeRect(tile, bounds, preset, original, coverage, inkLoad, color)
    }

    target.markContentPainted(bounds)
  }

  /** ADR 004 "Ревизия v1.5" §2: how far this dab travelled since the
   *  previous one, in world px — the quantity that makes ink deposition
   *  distance-normalized (`inkDeposit = dab.opacity * segmentLength`)
   *  instead of "a flat amount per dab," which would otherwise make total
   *  ink laid down over a stroke depend on dab *count* (itself a function
   *  of dab spacing, which scales with radius, which varies with pressure —
   *  see this method's own two special cases below) rather than on the
   *  actual distance traveled.
   *
   *  Two cases where there's no real distance to measure, both given a
   *  small nominal one instead of zero (a literal 0 would mean "no ink
   *  deposited at all," which is wrong for both):
   *  - No `prevDab` at all — this is the very first dab of a stroke (a
   *    quick tap with no drag). A nominal fraction of this dab's own radius
   *    stands in for "how far a deliberate touch would reasonably smear."
   *  - `prevDab` at the *exact same position* — DabSystem never emits a new
   *    dab for a pointer that hasn't moved past its own >0.5px threshold
   *    (continueStroke), so the only way this happens is the synthetic
   *    dwell-tick dab (engine._paintDwellDab), which is deliberately
   *    stamped at the resting point over and over. A nominal "creep per
   *    tick" distance is what turns a resting tip into a slowly, continuously
   *    darkening spot instead of a dab that silently deposits nothing —
   *    the same "same idea, taken to the limit of speed→0" unification
   *    ADR 003 already established for liner's own dwell/speed relationship. */
  private _markerSegmentLength(dab: Dab, prevDab: Dab | undefined, radius: number): number {
    const MARKER_FIRST_DAB_DISTANCE_FACTOR = 0.5 // uncalibrated first pass
    const MARKER_DWELL_CREEP_DISTANCE_FACTOR = 0.12 // uncalibrated first pass
    if (!prevDab) return radius * MARKER_FIRST_DAB_DISTANCE_FACTOR
    const dist = Math.hypot(dab.x - prevDab.x, dab.y - prevDab.y)
    return dist > 0.01 ? dist : radius * MARKER_DWELL_CREEP_DISTANCE_FACTOR
  }

  /** #330 stage 2/3: one nib stamp drawn from its own analytic in-pixel outline
   *  — the coverage pass (`inkMode` 6, the ribbon's caps) and the ink pass
   *  (`inkMode` 7) are the same geometry and differ only in what they write, so
   *  they share one method. That sharing is the point: silhouette and pigment
   *  cannot disagree about where the nib ended.
   *
   *  Sets none of the paper/hardness/grain uniforms a soft dab profile needs —
   *  neither branch reads them. The three samplers still need *something* bound
   *  (WebGL validates every active sampler in a linked program, not just the
   *  branch that runs) and must not be the render target itself, which would be
   *  a feedback loop, and that fails the draw call outright with
   *  GL_INVALID_OPERATION whether or not the live branch ever samples it.
   *  Found the hard way: every marker dab silently no-opped with error 1282
   *  until it was caught.
   *
   *  `ownTarget` false leaves framebuffer/blend setup to the caller, which the
   *  ink pass needs (it accumulates additively, not "over"). */
  private _drawMarkerNibPass(
    dest: AccumulationBuffer, tile: PaintTarget, dab: Dab, preset: PencilPreset,
    nibShape: NibShape, cornerFraction: number, inkMode: 6 | 7, opacity: number, ownTarget = true,
  ): void {
    const { gl } = this
    if (ownTarget) dest.beginDraw()

    gl.useProgram(this._dabProg)
    const u = this._dabUni
    gl.uniform2f(u.u_resolution, dest.width, dest.height)
    for (const [unit, loc] of [[0, u.u_paperHeightMap], [1, u.u_original], [2, u.u_strokeCoverage], [3, u.u_inkLoad]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
      gl.uniform1i(loc, unit)
    }
    const radius = dab.size * 0.5 * preset.sizeMultiplier
    gl.uniform1f(u.u_eraseMode, 0.0)
    gl.uniform1i(u.u_grainMode, 0)
    gl.uniform1f(u.u_inkMode, inkMode)
    gl.uniform1f(u.u_aaPx, MARKER_EDGE_AA_PX)
    gl.uniform1f(u.u_nibShape, nibShape === 'roundedBox' ? 1 : 0)
    gl.uniform1f(u.u_nibCorner, radius * cornerFraction)
    gl.uniform1f(u.u_inkEdge, MARKER_INK_EDGE_FALLOFF)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    gl.enableVertexAttribArray(this._dabPosLoc)
    gl.vertexAttribPointer(this._dabPosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, dab.x - tile.originX, dab.y - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, dab.angle)
    gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
    gl.uniform1f(u.u_opacity, opacity)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    if (ownTarget) dest.endDraw()
  }

  /** #330 stage 2, coverage pass part 2: every band of this batch in one draw
   *  (markerRibbon.ts built them; RIBBON_FRAG turns each vertex's carried
   *  distance-to-edge into coverage). Positions are world-space, shifted into
   *  this tile's own pixel space here — the only per-tile work, which is why
   *  the geometry itself is built once for the whole batch rather than per
   *  tile. */
  private _drawMarkerBands(dest: AccumulationBuffer, tile: PaintTarget, bands: Float32Array, mode: 'coverage' | 'ink'): void {
    const { gl } = this
    const local = new Float32Array(bands.length)
    for (let i = 0; i < bands.length; i += RIBBON_FLOATS_PER_VERTEX) {
      local[i]     = bands[i]     - tile.originX
      local[i + 1] = bands[i + 1] - tile.originY
      local[i + 2] = bands[i + 2]
      local[i + 3] = bands[i + 3]
    }

    if (mode === 'ink') dest.beginAdditiveDraw(); else dest.beginDraw()
    gl.useProgram(this._ribbonProg)
    gl.uniform2f(this._ribbonUni.u_resolution, dest.width, dest.height)
    gl.uniform1f(this._ribbonUni.u_aaPx, MARKER_EDGE_AA_PX)
    gl.uniform1f(this._ribbonUni.u_mode, mode === 'ink' ? 1 : 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._ribbonBuf)
    gl.bufferData(gl.ARRAY_BUFFER, local, gl.STREAM_DRAW)
    const stride = RIBBON_FLOATS_PER_VERTEX * 4
    gl.enableVertexAttribArray(this._ribbonPosLoc)
    gl.vertexAttribPointer(this._ribbonPosLoc, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this._ribbonEdgeLoc)
    gl.vertexAttribPointer(this._ribbonEdgeLoc, 1, gl.FLOAT, false, stride, 8)
    gl.enableVertexAttribArray(this._ribbonInkLoc)
    gl.vertexAttribPointer(this._ribbonInkLoc, 1, gl.FLOAT, false, stride, 12)

    gl.drawArrays(gl.TRIANGLES, 0, local.length / RIBBON_FLOATS_PER_VERTEX)

    // Leaving these enabled would make the *next* program's draw read a stale
    // per-vertex stream for whatever attribute index happens to collide with
    // them (these slots are not reserved across programs).
    gl.disableVertexAttribArray(this._ribbonEdgeLoc)
    gl.disableVertexAttribArray(this._ribbonInkLoc)
    dest.endDraw()
  }

  /** #330 stage 2, composite pass: the same DAB_FRAG u_inkMode=2 branch the
   *  every other tool's dabs feed, but drawn once over the whole batch's dirty
   *  rect instead of once per dab — see _paintMarkerRibbon's own doc comment for why a
   *  per-dab quad no longer covers what the coverage pass wrote.
   *
   *  The rect is covered by a circumscribing dab quad (aspect 1, angle 0,
   *  radius = half the diagonal) rather than a new full-rect program: DAB_FRAG
   *  discards outside `dist > 1`, and a circle through the rect's corners
   *  contains every pixel of it. The extra fragments cost nothing — the branch
   *  discards any pixel this stroke hasn't covered anyway. */
  private _drawMarkerCompositeRect(
    tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }, preset: PencilPreset,
    original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer, color: [number, number, number],
  ): void {
    const cx = (bounds.minX + bounds.maxX) * 0.5
    const cy = (bounds.minY + bounds.maxY) * 0.5
    const radius = 0.5 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
    const rectDab: Dab = {
      x: cx, y: cy, pressure: 1, tiltX: 0, tiltY: 0,
      size: radius * 2, aspectRatio: 1, angle: 0, opacity: 1, t: 0,
    }
    this._drawMarkerCompositeDab(tile, rectDab, radius, preset, original, coverage, inkLoad, color)
  }

  /** The marker's multiply-with-darkness composite (DAB_FRAG's u_inkMode>1.5
   *  branch), reading `original`/`coverage`/`inkLoad` as plain full-tile
   *  textures (sampled via gl_FragCoord/u_resolution — no patch-relative
   *  origin/size uniforms needed, since all three are already 1:1-aligned
   *  with the tile this draws into) instead of a small per-dab copied
   *  patch. */
  private _drawMarkerCompositeDab(
    tile: PaintTarget, dab: Dab, radius: number, preset: PencilPreset,
    original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer, color: [number, number, number],
  ): void {
    const { gl } = this
    const { buffer } = tile
    // Overwrite, not "over" (#330) — this branch recomputes the finished pixel
    // from scratch every time, so blending it into its own previous output
    // compounded alpha once per dab. See beginReplaceDraw's own comment.
    buffer.beginReplaceDraw()

    gl.useProgram(this._dabProg)
    const u = this._dabUni
    gl.uniform2f(u.u_resolution, buffer.width, buffer.height)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    // #141: world-space paper sampling — see DAB_FRAG's own comment. Marker
    // never actually reads u_paperHeightMap in *this* branch (ADR 004 §8 —
    // the composite itself has no paper interaction, only the coverage
    // splat's edge bleed does), but every uniform this shared program
    // declares still needs a value bound each draw the way every other
    // caller of _dabProg already does, so this mirrors _paintDabsUniform's
    // own setup exactly rather than skipping it.
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 0)
    // The actual multiply-compositing inputs (ADR 004 §3, redesigned in
    // "Ревизия v1.5" — see MarkerStrokeScratch's own doc comment): this
    // tile's frozen pre-stroke content, this stroke's own running coverage
    // (silhouette/alpha) and running inkLoad (darkness) — both just updated
    // by the two splat passes above, same quad, moments ago. No paper-color
    // uniform any more: DAB_FRAG's own effectiveBase now falls back to a
    // flat vec3(1.0) for an untouched spot, not this room's actual paper
    // tone — a fully built-up marker mark on blank layer content multiplies
    // out to exactly the picked swatch color that way (1.0 * color =
    // color), while still correctly darkening toward whatever's *really*
    // underneath (a pencil line, say) wherever this layer isn't blank.
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, original.texture)
    gl.uniform1i(u.u_original, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, coverage.texture)
    gl.uniform1i(u.u_strokeCoverage, 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, inkLoad.texture)
    gl.uniform1i(u.u_inkLoad, 3)
    gl.uniform1f(u.u_hardness, preset.hardness)
    gl.uniform1f(u.u_eraseMode, 0.0)
    gl.uniform3fv(u.u_color, color)
    // No graphite grain dither for marker — same reasoning liner's own
    // branch gives (a completely different deposit formula, not a
    // "graphite variant"); DAB_FRAG's marker branch never calls
    // computeGrain at all, so this value is inert, but every _dabProg
    // caller sets it (see _paintDabsUniform) so this stays consistent.
    gl.uniform1i(u.u_grainMode, 0)
    gl.uniform1f(u.u_paperFillThreshold, this._paperFillThreshold)
    gl.uniform1f(u.u_paperFillCap, this._paperFillCap)
    gl.uniform1f(u.u_inkMode, 2.0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    gl.enableVertexAttribArray(this._dabPosLoc)
    gl.vertexAttribPointer(this._dabPosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, dab.x - tile.originX, dab.y - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, dab.angle)
    gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
    gl.uniform1f(u.u_pressure, dab.pressure)
    gl.uniform1f(u.u_tiltX, dab.tiltX)
    gl.uniform1f(u.u_tiltY, dab.tiltY)
    gl.uniform1f(u.u_opacity, dab.opacity)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    buffer.endDraw()
  }

  private _compositeTextures(
    items: Array<{ texture: WebGLTexture; opacity: number }>,
    targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void {
    const { gl } = this

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, targetW, targetH)
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

  /** Marks the below/above split cache (#122 — see the field comment on
   *  _belowCache/_aboveCache) stale. Idempotent and cheap: safe to call from
   *  any site that isn't sure whether it actually needs to. The very next
   *  _runComposite() call rebuilds both halves from current buffer state
   *  before reading either. */
  private _invalidateSplitCache(): void {
    this._splitCacheDirty = true
  }

  /** Draws one CompositeItem's live content into `targetFbo` — a layer
   *  mid-gizmo-drag (#120) composites its scratch transform-preview tile(s)
   *  instead of its real, untouched buffer (see previewLayerTransform);
   *  otherwise every one of its resident/visible tiles goes through
   *  _drawTileComposite (#136 — this used to special-case BoundedLayerBuffer
   *  with a plain fullscreen-quad blit and just skip TiledLayerBuffer
   *  entirely; a bounded room's fixed identity camera, see the constructor,
   *  makes that plain-blit shortcut and the tile-relative draw produce the
   *  same pixels, so there's no reason to keep both paths). #139: a preview
   *  tile is shaped exactly like a real PaintTarget (own originX/originY,
   *  own size — see PreviewTile), so it goes through the exact same
   *  _drawTileComposite loop as a real tile rather than a separate
   *  fullscreen-blit path — that's what makes a multi-tile preview (an
   *  infinite-canvas layer spanning, or transformed to span, more than one
   *  tile) composite correctly instead of only ever showing one tile's
   *  worth. */
  private _drawCompositeItem(
    id: string, opacity: number, targetFbo: WebGLFramebuffer, viewRect: WorldRect,
    targetW: number, targetH: number,
  ): void {
    const preview = this._transformPreview.get(id)
    if (preview) {
      for (const { originX, originY, buffer } of preview) {
        this._drawTileComposite(
          buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
        )
      }
      return
    }
    const buf = this._layers.get(id)
    if (!buf) return
    for (const { buffer, originX, originY } of buf.resolveVisible(viewRect)) {
      this._drawTileComposite(
        buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
      )
    }
  }

  /** Rebuilds both cache halves from scratch iff _splitCacheDirty — see the
   *  _belowCache/_aboveCache field comment for what "dirty" tracks. Only
   *  ever called with _transformPreview empty (_runComposite bypasses this
   *  entirely otherwise), so _drawCompositeItem always resolves to a real
   *  layer's own current buffer here, never a scratch preview. */
  private _rebuildSplitCacheIfDirty(
    belowItems: CompositeItem[], aboveItems: CompositeItem[], viewRect: WorldRect,
    targetW: number, targetH: number,
  ): void {
    if (!this._splitCacheDirty) return
    this._rebuildCacheHalf(this._belowCache, belowItems, viewRect, targetW, targetH)
    this._rebuildCacheHalf(this._aboveCache, aboveItems, viewRect, targetW, targetH)
    this._splitCacheDirty = false
  }

  private _rebuildCacheHalf(
    target: AccumulationBuffer, items: CompositeItem[], viewRect: WorldRect, targetW: number, targetH: number,
  ): void {
    target.clear()
    for (const { id, opacity } of items) this._drawCompositeItem(id, opacity, target.fbo, viewRect, targetW, targetH)
  }

  /** #122: normally recomposites *every* visible layer/folder-child from
   *  `items` into `targetFbo` on every call — cost scaling linearly with
   *  layer count even though a painted move-event only ever changes the
   *  active layer's own texture (see _paintStrokeDabs). Instead, splits
   *  `items` around the active layer and composites:
   *
   *    [ below-cache (opacity 1) ] → [ active layer (its own opacity) ] → [ above-cache (opacity 1) ]
   *
   *  where below-cache/above-cache are the pre-blended result of every
   *  entry strictly below/above the active layer (rebuilt only when
   *  _splitCacheDirty — see _invalidateSplitCache's call sites). Porter-Duff
   *  "over" is associative, so grouping contiguous runs into one
   *  already-composited texture and blending *that* at opacity 1 produces
   *  the exact same result as blending every entry individually in order —
   *  same technique this file already uses for layer_merge
   *  (_execMergeLive/_replayMergeInto).
   *
   *  Bypassed entirely whenever a layer-transform gizmo preview (#120) is
   *  active: previewLayerTransform can substitute scratch content for *any*
   *  layer, active or not, on every drag frame, and that's rare enough
   *  (drags, not paint dabs) that reasoning about invalidating a persistent
   *  cache through it isn't worth it — this falls back to exactly the old
   *  (pre-#122) per-frame full recompute for as long as any preview exists.
   *
   *  (#136) Same split-cache technique now backs both bounded and infinite
   *  rooms — see _drawCompositeItem and the constructor's _infiniteCamera
   *  init. No per-mode branch left here. */
  /** The world-space rect currently visible on screen — what determines
   *  which tiles resolveVisible()/composite bother reading (never creates
   *  them, so a few extra out-of-view tiles considered here costs a bit of
   *  redundant compositing, never correctness).
   *
   *  #142: a bounded room's viewport is exactly its fixed canvas.width x
   *  canvas.height, full stop — its rotation is the DOM canvasWrap's own
   *  CSS transform, never this camera's `angle` (always 0 for it, see the
   *  constructor), so there's no rotated footprint to pad for the way an
   *  infinite room's camera-relative view needs. Padding it anyway would
   *  cost real, needless compositing work on every frame (large canvas
   *  presets like A4 already span several tiles) for tiles that can never
   *  actually be visible.
   *
   *  An infinite room's camera can point anywhere and rotate freely, so
   *  this generously pads to an axis-aligned bounding box of the (rotated)
   *  viewport rect — tightening this to the exact rotated quad instead of
   *  its bounding box is a nicety, not a correctness fix. */
  private _visibleWorldRect(): WorldRect {
    const { canvas } = this
    if (!this._infinite) return { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }
    const { wx, wy, zoom } = this._infiniteCamera
    const halfW = canvas.width / 2 / zoom
    const halfH = canvas.height / 2 / zoom
    const halfDiag = Math.sqrt(halfW * halfW + halfH * halfH)
    return { minX: wx - halfDiag, minY: wy - halfDiag, maxX: wx + halfDiag, maxY: wy + halfDiag }
  }

  /** (#155) Returns this[poolField], creating or recreating it first if it's
   *  missing or the wrong size (canvas.width x canvas.height, which changes
   *  on infinite-room resizeCanvas). Fixes a real stall: _onStart used to
   *  `new AccumulationBuffer(...)` a fresh _tipBuf/_previewBuf on *every*
   *  single stroke — a full GL texture + framebuffer allocation, capped off
   *  by AccumulationBuffer's own checkFramebufferStatus call (a known
   *  GPU-sync point on some drivers) — then destroy it again at stroke end.
   *  Harmless for a bounded room (buffer size = the room's fixed page size),
   *  but for an infinite room this is sized to the DPR-scaled *viewport*
   *  (see #154) — multi-megapixel on a real tablet — so every single
   *  pointerdown paid a real allocation + sync stall. Measured on-device via
   *  Chrome's own Interaction-to-Next-Paint breakdown: ~1s presentation
   *  delay on a `pointerdown`, with JS-side processing under 20ms — exactly
   *  a GPU-side stall the engine's own JS-timing stats (StrokeDebugStats)
   *  can't see, since they only time the per-move paint path, not stroke
   *  start. Fastest to notice writing short strokes quickly (many
   *  pointerdowns in a row), which is exactly what surfaced this.
   *
   *  Reusing the same GL object across strokes (only reallocating on an
   *  actual size change) turns that into a no-op after the first stroke.
   *  The pool field stays alive across strokes; the *active* _tipBuf/
   *  _previewBuf reference is still nulled at stroke end (see _onEnd) so
   *  _display()'s `if (this._tipBuf)` blend-skip when idle is unaffected —
   *  only the underlying GL object's lifetime changed, not the preview's own
   *  visibility semantics. */
  private _acquirePooledBuf(poolField: '_tipBufPool' | '_previewBufPool'): AccumulationBuffer {
    const { canvas } = this
    const existing = this[poolField]
    if (existing && existing.width === canvas.width && existing.height === canvas.height) return existing
    existing?.destroy()
    const fresh = new AccumulationBuffer(this.gl, canvas.width, canvas.height)
    this[poolField] = fresh
    return fresh
  }

  // (#155) _transformScratchPool's acquire/release pair — see the field's
  // own comment for why this is a free list rather than a single slot.
  private _acquireScratchBuf(width: number, height: number): AccumulationBuffer {
    const pool = this._transformScratchPool
    const idx = pool.findIndex(b => b.width === width && b.height === height)
    if (idx !== -1) return pool.splice(idx, 1)[0]
    return new AccumulationBuffer(this.gl, width, height)
  }

  private _releaseScratchBuf(buf: AccumulationBuffer): void {
    this._transformScratchPool.push(buf)
  }

  /** (#138) World point that a live-tip/predicted/peer-reveal preview
   *  buffer's own pixel (0,0) represents. These buffers are always plain,
   *  fixed-size (canvas.width x canvas.height) AccumulationBuffers — unlike
   *  a real layer's tiles, which resolveForPaint() dynamically positions to
   *  cover wherever a batch of dabs actually falls, these never grow or
   *  move once created, so *some* origin has to be chosen up front for
   *  their dabs (genuine world coordinates for infinite rooms, arbitrarily
   *  far from world origin depending on where the camera happens to be) to
   *  land inside their fixed small pixel range at all.
   *
   *  Centering on the current camera's own world position is the natural
   *  choice: the whole point of these previews is to show something
   *  happening on screen right now, and (per _invalidateSplitCache's own
   *  note on setInfiniteCamera) panning and painting are mutually exclusive
   *  gestures in this app, so the camera is guaranteed not to move for as
   *  long as a single stroke/prediction/reveal buffer stays alive — one
   *  snapshot at creation time (stroke start / previewOperation's first
   *  queued op for a peer) stays valid for that buffer's whole lifetime.
   *
   *  Reduces to exactly (0,0) for a bounded room: its _infiniteCamera is
   *  the constructor's fixed {wx: canvas.width/2, wy: canvas.height/2}
   *  identity (see its own comment), so this cancels out — the plain
   *  (0,0)-anchored behavior every one of these buffers already had before
   *  #138 is preserved exactly. */
  private _cameraCenteredOrigin(): { x: number; y: number } {
    const { wx, wy } = this._infiniteCamera
    return { x: wx - this.canvas.width / 2, y: wy - this.canvas.height / 2 }
  }

  /** (#138) Translates `dabs` from world coordinates into one of the
   *  preview buffers' own local coordinate space (buffer pixel (0,0) ==
   *  world `origin` — see _cameraCenteredOrigin), mirroring what
   *  ILayerBuffer.resolveForPaint's originX/originY subtraction already
   *  does for a real tile in _paintDabs. Never mutates its input: dabs may
   *  still be read afterward by their real caller (_strokeDabs, in
   *  particular, must keep the untranslated *world* coordinates for the
   *  eventual recorded Operation). A no-op array identity when `origin` is
   *  exactly (0,0) (every bounded-room call, see _cameraCenteredOrigin) —
   *  skips the allocation on the hot path that never needed it. */
  private _translateDabs(dabs: Dab[], origin: { x: number; y: number }): Dab[] {
    if (origin.x === 0 && origin.y === 0) return dabs
    return dabs.map(d => ({ ...d, x: d.x - origin.x, y: d.y - origin.y }))
  }

  /** Infinite canvas (#133 Phase 1) — draws one tile's texture into
   *  `targetFbo` at its camera-relative screen position, blended over
   *  whatever's already there (same (ONE, ONE_MINUS_SRC_ALPHA) "over" every
   *  other composite pass in this file uses) — the tile-aware counterpart
   *  to _compositeTextures' fullscreen-quad draw.
   *
   *  Positions the tile via gl.viewport() instead of a per-tile clip-space
   *  computation in a shader — deliberately, and not for simplicity: an
   *  earlier version computed each tile's destination quad and/or source-UV
   *  sub-rect in the shader (a uniform mat3, a dynamically-reuploaded vertex
   *  buffer, even a compile-time constant — every variant tried), and
   *  reproducibly sampled as fully transparent black on a real ANGLE/D3D
   *  backend (confirmed: Chrome/Windows) — but *only* on some draws, not
   *  others, in a pattern that tracked draw-call position within the
   *  composite pass rather than which values were used (bisection ruled out
   *  clip-space magnitude, branching, uniform-vs-attribute-vs-constant, and
   *  program identity in turn). Whatever the underlying driver quirk is,
   *  routing the tile's position through gl.viewport — ordinary WebGL state,
   *  not a shader computation — sidesteps it entirely: this reuses
   *  _compositeProg/DISPLAY_VERT completely unmodified (the same program
   *  every *other* composite pass in this file already relies on) with its
   *  plain full quad, and lets the fixed-function rasterizer do the
   *  positioning instead. Verified stable across a full stroke crossing all
   *  four tile boundaries — no dropout, no seam.
   *
   *  Doesn't itself account for camera rotation (_infiniteCamera.angle) —
   *  the viewport is always an axis-aligned rect, so a rotated view would
   *  misplace tiles if this drew straight to the real screen. It doesn't:
   *  for infinite rooms _runComposite always targets the unrotated
   *  _assemblyFBO here (see targetW/targetH, always that buffer's own
   *  size in that case) and _finishInfiniteComposite applies the actual
   *  rotation exactly once, afterwards, on the assembled result — see its
   *  own comment (#134).
   *
   *  Rounds each of the tile's four EDGES individually (via
   *  _worldToScreenEdgeX/Y below), rather than rounding a position and a
   *  size independently — two tiles sharing a world-space edge (adjacent
   *  tile origins are always exactly TILE_SIZE apart) compute that shared
   *  edge from the exact same formula and thus the exact same rounded
   *  pixel, however the camera/zoom fraction falls. Rounding position and
   *  size separately (the pre-#140 version of this method) doesn't have
   *  that guarantee — `round(pos) + round(size)` and `round(pos + size)`
   *  disagree for plenty of real zoom/pan combinations (confirmed: e.g.
   *  zoom 1.01 with the camera offset a few hundred world units from a
   *  tile boundary), producing a 1px transparent gap or a 1px overlap
   *  right at the seam — see index.tiledDisplay.test.ts's fractional-zoom
   *  case for a concrete reproduction.
   *
   *  Centers on _compositeCenterX/Y — the current composite target's own
   *  pixel position for the camera's world point — rather than this
   *  target's own half-size (targetW/2): see that field's own comment for
   *  why the two aren't the same thing for infinite rooms, and why that
   *  distinction is what keeps an unrotated infinite-room frame pixel-
   *  aligned (no blur) instead of resampled through a fractional offset.
   *
   *  (#301) Scales by _compositeScale, not the camera's raw zoom — above
   *  zoom 1 the two differ, and the leftover magnification is applied later,
   *  by the same pass that applies the rotation. See that field's comment. */
  private _worldToScreenEdgeX(worldX: number): number {
    const { wx } = this._infiniteCamera
    return Math.round((worldX - wx) * this._compositeScale + this._compositeCenterX)
  }

  private _worldToScreenEdgeY(worldY: number): number {
    const { wy } = this._infiniteCamera
    return Math.round((worldY - wy) * this._compositeScale + this._compositeCenterY)
  }

  private _drawTileComposite(
    texture: WebGLTexture, originX: number, originY: number, bw: number, bh: number,
    opacity: number, targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void {
    const { gl } = this
    const leftEdge   = this._worldToScreenEdgeX(originX)
    const rightEdge  = this._worldToScreenEdgeX(originX + bw)
    const topEdge    = this._worldToScreenEdgeY(originY)
    const bottomEdge = this._worldToScreenEdgeY(originY + bh)
    const glX = leftEdge
    // gl.viewport's y is measured from the bottom of the target, unlike the
    // top-down (topEdge, bottomEdge) this file uses everywhere else.
    const glY = targetH - bottomEdge

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(glX, glY, rightEdge - leftEdge, bottomEdge - topEdge)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this._compositeProg)
    const u = this._compositeUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._compositePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u.u_layer, 0)
    gl.uniform1f(u.u_opacity, opacity)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.disable(gl.BLEND)
    gl.viewport(0, 0, targetW, targetH)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** For infinite rooms, every draw in this method (tiles, split-cache
   *  halves, active layer) targets _assemblyFBO — unrotated, zoom-applied,
   *  world-centered — instead of the real (canvas-sized) `targetFbo`
   *  directly. Bounded rooms skip all of that (their rotation is the DOM
   *  canvasWrap's own CSS transform, never this camera's `angle`, which
   *  stays 0 for them for the engine's whole lifetime) and draw straight
   *  into `targetFbo`, exactly as before #134.
   *
   *  Unlike before #138, this no longer calls _finishInfiniteComposite
   *  itself: _composeToFBO (the only caller) still has the live-tip/
   *  predicted/peer-reveal preview buffers to blend in after real layer
   *  content but *before* the camera's rotation is baked in — those
   *  previews need the exact same unrotated `_assemblyFBO` this method
   *  leaves populated, so _composeToFBO now owns the single call to
   *  _finishInfiniteComposite once everything (real content + previews) is
   *  in place. Bounded rooms are unaffected either way (_finishInfinite
   *  Composite is a no-op for them). */
  private _runComposite(items: CompositeItem[], targetFbo: WebGLFramebuffer): void {
    const viewRect = this._visibleWorldRect()
    const buildFbo = this._infinite ? this._assemblyFBO.fbo    : targetFbo
    const targetW  = this._infinite ? this._assemblyFBO.width  : this.canvas.width
    const targetH  = this._infinite ? this._assemblyFBO.height : this.canvas.height
    const { padX, padY } = this._assemblyPad()
    this._compositeCenterX = this.canvas.width / 2 + padX
    this._compositeCenterY = this.canvas.height / 2 + padY
    this._compositeScale = this._infiniteCompositeScale()
    if (this._infinite) this._assemblyFBO.clear()

    if (this._transformPreview.size > 0) {
      for (const { id, opacity } of items) this._drawCompositeItem(id, opacity, buildFbo, viewRect, targetW, targetH)
      return
    }

    const idx = this._activeId !== null ? items.findIndex(it => it.id === this._activeId) : -1
    // idx === -1 (no active layer, or it's not currently composited — e.g.
    // hidden): treat everything as "below" and composite no separate active
    // entry, exactly matching what a plain full recompute of `items` would
    // have produced (the active id, absent from `items`, was never going to
    // be drawn either way).
    const belowItems  = idx === -1 ? items : items.slice(0, idx)
    const activeItem  = idx === -1 ? null  : items[idx]
    const aboveItems  = idx === -1 ? []    : items.slice(idx + 1)

    this._rebuildSplitCacheIfDirty(belowItems, aboveItems, viewRect, targetW, targetH)

    if (belowItems.length) {
      this._compositeTextures([{ texture: this._belowCache.texture, opacity: 1 }], buildFbo, targetW, targetH)
    }
    if (activeItem) {
      this._drawCompositeItem(activeItem.id, activeItem.opacity, buildFbo, viewRect, targetW, targetH)
    }
    if (aboveItems.length) {
      this._compositeTextures([{ texture: this._aboveCache.texture, opacity: 1 }], buildFbo, targetW, targetH)
    }
  }

  /** (#134) The one place camera rotation actually applies for infinite
   *  rooms — a no-op for bounded rooms (angle is always 0 there for the
   *  engine's whole lifetime, and they never populate _assemblyFBO to
   *  begin with; the early return just skips a redundant identity blit).
   *  Blits _assemblyFBO (unrotated, zoom-applied, centered on the same
   *  world point as the real camera, just padded bigger — see its field
   *  comment) into the real `targetFbo`, rotating by -angle: forward,
   *  screen = canvasCenter + R(angle)*(assemblyPx - assemblyCenter) is the
   *  same world->screen convention _worldToScreenEdgeX/Y and the old
   *  (pre-#136) _worldToScreenTransform used (scale baked in via zoom,
   *  here already applied when the assembly buffer itself was drawn, so
   *  only the rotation is left) — this needs that mapping's inverse,
   *  which for a pure rotation is just negating the angle, no matrix
   *  inversion required. */
  private _finishInfiniteComposite(targetFbo: WebGLFramebuffer): void {
    if (!this._infinite) return
    const { canvas } = this
    const ext = this._assemblyFBO.width // square: width === height
    this._runTransformBlit(
      this._assemblyFBO.texture, this._infiniteRotateMatrixInv(), canvas.width, canvas.height, ext, ext, targetFbo,
    )
  }

  /** The destination(canvas)->source(assembly) matrix _finishInfiniteComposite
   *  rotates through — factored out so the on-screen pass
   *  (_composePaperToScreen, #301) can apply the exact same rotation
   *  without duplicating the math.
   *
   *  Uses _assemblyPad()'s *rounded* half-difference as the assembly
   *  buffer's own center, not its literal half-size (ext/2) — see
   *  _compositeCenterX/Y's field comment for why that distinction is what
   *  keeps an unrotated (angle 0, by far the common case) frame an exact,
   *  lossless pixel copy instead of a permanently-blurred bilinear
   *  resample.
   *
   *  (#301) Carries the residual magnification too, not just the rotation:
   *  above zoom 1 the assembly buffer is drawn at world resolution rather
   *  than at zoom, and this pass is where the rest of the zoom gets applied
   *  — which is the point, since doing both here means one resample instead
   *  of two. At or below zoom 1 the residual is exactly 1 and this reduces
   *  to the pure rotation it has always been. */
  private _infiniteRotateMatrixInv(): AffineMatrix {
    const { canvas } = this
    const { angle } = this._infiniteCamera
    const { padX, padY } = this._assemblyPad()
    return composeAffine(
      translationMatrix(canvas.width / 2 + padX, canvas.height / 2 + padY),
      composeAffine(
        scaleRotateMatrix(1 / this._residualScale(), -angle),
        translationMatrix(-canvas.width / 2, -canvas.height / 2),
      ),
    )
  }

  /** Screen(canvas)-pixel -> world-unit mapping for the live camera — the
   *  full inverse of the forward chain the composite actually draws
   *  through, carried one step further than _infiniteRotateMatrixInv (which
   *  stops at assembly pixels). Forward, that chain is
   *  screenPx = canvasCenter + R(angle) * (world - camera) * zoom
   *  — composed of _worldToScreenEdgeX/Y (world -> assembly px, zoom and
   *  _compositeCenterX/Y) and _infiniteRotateMatrixInv (assembly px ->
   *  screen px, rotation about canvasCenter); the assembly buffer's own
   *  padding cancels out between the two, which is why it doesn't appear
   *  here at all. Inverting gives world = camera + R(-angle) * (screenPx -
   *  canvasCenter) / zoom, i.e. exactly the composition below.
   *
   *  (#301) What lets PAPER_COMPOSE_FRAG sample paper at a screen pixel's
   *  true world position *after* the rotation instead of before it — see
   *  that shader's own comment for why doing it after is the whole point. */
  private _screenToWorldMatrix(): AffineMatrix {
    const { canvas } = this
    const { wx, wy, zoom, angle } = this._infiniteCamera
    return composeAffine(
      translationMatrix(wx, wy),
      composeAffine(scaleRotateMatrix(1 / zoom, -angle), translationMatrix(-canvas.width / 2, -canvas.height / 2)),
    )
  }

  /** (#301) The entire infinite-room display pass: rotates _assemblyFBO
   *  (raw, unblended accumulation — see its own field comment) down onto
   *  the real screen and blends paper into it in the same draw, sampling
   *  the grain at each *screen* pixel's world position (see
   *  PAPER_COMPOSE_FRAG's comment for why that ordering is what keeps a
   *  rotated canvas sharp). Replaces the old _applyPaperBlend +
   *  _finishPaperBlend pair — one pass, one buffer less.
   *
   *  Writes opaque paper everywhere (alpha 1.0, blending off), so unlike
   *  _runTransformBlit there's nothing underneath for it to blend against
   *  and no need to pre-clear the screen. */
  private _composePaperToScreen(): void {
    const { gl, canvas } = this
    const ext = this._assemblyFBO.width // square: width === height

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.useProgram(this._paperComposeProg)
    const u = this._paperComposeUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._assemblyFBO.texture)
    gl.uniform1i(u.u_accumulation, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperMap, 1)

    gl.uniform3fv(u.u_paperColor, this._opts.paperColor ?? paperColorOf(this._opts.paper))
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_dstSize, canvas.width, canvas.height)
    gl.uniform2f(u.u_srcSize, ext, ext)
    gl.uniformMatrix3fv(u.u_matrixInv, false, toMat3(this._infiniteRotateMatrixInv()))
    gl.uniformMatrix3fv(u.u_screenToWorld, false, toMat3(this._screenToWorldMatrix()))
    // Catmull-Rom only when this pass genuinely resamples. An unrotated
    // camera at or below zoom 1 maps screen pixels onto assembly texels one
    // for one, offset by an exact integer (that integer-ness is what
    // _assemblyPad/_compositeCenterX exist to guarantee) — a plain bilinear
    // tap is then already lossless and 9x cheaper. See PAPER_COMPOSE_FRAG.
    const resamples = this._infiniteCamera.angle !== 0 || this._residualScale() !== 1
    gl.uniform1f(u.u_sharpResample, resamples ? 1 : 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._paperComposePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** Low-level transform-blit draw call — renders `sourceTex` (sized
   *  `srcW x srcH`) through `matrixInv` (already inverted: maps destination
   *  buffer-local px to source buffer-local px, both top-down) into
   *  `targetFbo` (sized `dstW x dstH`) — source and destination sizes are
   *  independent (#134: the final rotate blit reads the padded, bigger
   *  _assemblyFBO and writes the real, smaller canvas-sized target; every
   *  other caller happens to pass matching sizes, which this reduces to
   *  exactly as before). Always blends (ONE, ONE_MINUS_SRC_ALPHA) rather
   *  than plain-replacing: every caller's target is freshly cleared
   *  (transparent) immediately before its first (possibly only) draw here,
   *  and blending a straight replace onto an all-zero destination gives the
   *  exact same result as a true replace would — so this one code path
   *  serves the live gizmo preview's several passes per destination tile
   *  (`previewLayerTransform`), the tile-aware bake's several passes per
   *  destination tile (`_bakeTransform` — a destination tile's content can
   *  come from more than one source tile when the transform includes
   *  rotation/scale; each pass is transparent everywhere outside its own
   *  source tile's mapped region, so blending — not replacing — is what
   *  lets a later pass avoid wiping out an earlier one's already-valid
   *  pixels), and the export/transparent path's rotate blit
   *  (`_finishInfiniteComposite`). Every caller targets a scratch buffer
   *  another pass reads from afterwards — since #301 the frame's last
   *  drawing step is _composePaperToScreen, which writes the screen through
   *  its own program rather than this one. */
  private _runTransformBlit(
    sourceTex: WebGLTexture, matrixInv: AffineMatrix,
    dstW: number, dstH: number, srcW: number, srcH: number, targetFbo: WebGLFramebuffer | null,
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, dstW, dstH)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this._transformProg)
    const tu = this._transformUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._transformPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(tu.u_source, 0)
    gl.uniform2f(tu.u_dstSize, dstW, dstH)
    gl.uniform2f(tu.u_srcSize, srcW, srcH)
    gl.uniformMatrix3fv(tu.u_matrixInv, false, toMat3(matrixInv))
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Bakes a transform into a layer's content, in place (#133 fix) —
   *  destination tiles are resolved from the *transformed* content's world
   *  bounds and created on demand, so content moved/scaled past wherever
   *  its old tile(s) ended is never clipped the way a single fixed-size
   *  buffer would clip it — it simply lands on whichever tile(s) now cover
   *  it. Bounded mode (single tile at origin (0,0), both before and after)
   *  reduces to exactly the old single-buffer bake.
   *
   *  Two-phase to stay WebGL1-safe (can't read and write the same texture
   *  in one draw call, same reasoning AccumulationBuffer.copyTo's read-
   *  into-temp-then-copy pattern exists for — see _execMergeLive/
   *  _replayMergeInto): every destination tile that overlaps at least one
   *  source tile's transformed bounds is rendered into its own fresh scratch
   *  buffer first, reading only from the untouched original source tiles
   *  (one pass per overlapping source tile, alpha-blended — see
   *  _runTransformBlit — since a destination tile's content can come from
   *  more than one source tile when the transform includes rotation/scale);
   *  only once every scratch is fully rendered are the original source tiles
   *  cleared and the scratches copied into their real destination tiles
   *  (which can safely be the very same tile objects — the scratch render
   *  already finished reading from them by then). A vacated source tile
   *  stays resident-but-empty rather than being dropped from the tile map —
   *  #155 tried dropping provably-empty tiles here to bound resident count
   *  for a room dragged across a wide area, but reverted it: resolveForPaint
   *  resolves destinations from each source tile's *whole* tileW x tileH
   *  extent rather than its real content, so a realistic non-tile-aligned
   *  drag already spills into several tiles nothing was ever painted on —
   *  dropping only genuinely-empty ones barely reduced growth in practice,
   *  and interacted badly with #144's own eviction/recovery replay cost once
   *  a repeated-drag session crossed the eviction budget. Bounding this for
   *  real needs resolveForPaint (or _bakeTransform's own bounds math) to
   *  work from real content, not full-tile extent — left as a follow-up. */
  private _bakeTransform(layerBuf: ILayerBuffer, matrix: AffineMatrix): void {
    const sourceTiles = layerBuf.allResident()
    if (!sourceTiles.length) return

    // (#155) Suspended for the whole bake, same hazard and same fix as
    // _replayInto's own suspendEviction (see its doc comment): resolveForPaint
    // below can create several new destination tiles in one call, pushing
    // this layer's resident count over budget mid-bake — without suspending,
    // its own evictIfOverBudget could then destroy a tile still captured in
    // `sourceTiles` above, moments before the blit loop reads
    // srcTile.buffer.texture from it (a real, reproducible "attempt to use a
    // deleted object" GPU error → silently-wrong/missing pixels, not a
    // thrown exception, so it fails silently rather than loudly). Swept once
    // at the end against the final, settled tile count instead.
    const tiled = layerBuf instanceof TiledLayerBuffer ? layerBuf : null
    tiled?.suspendEviction()
    try {
      this._bakeTransformUnsuspended(layerBuf, matrix, sourceTiles)
    } finally {
      tiled?.resumeEviction()
    }
  }

  private _bakeTransformUnsuspended(layerBuf: ILayerBuffer, matrix: AffineMatrix, sourceTiles: PaintTarget[]): void {
    // (#155 Tier 2) Every source tile's buffer is unconditionally cleared at
    // the end of this method (see below) regardless of whether it ends up
    // rewritten as a destination — reset tracked content up front so it
    // can never fall out of sync with that real GPU clear. `contentRect`
    // was already captured above (in `sourceTiles`, from allResident()) at
    // this call's start, so resetting the live tracking now doesn't affect
    // the srcRects computation just below. Any tile that *does* end up a
    // destination gets its real post-bake content re-established via
    // markContentPainted further down, layered on top of this empty
    // baseline.
    for (const s of sourceTiles) layerBuf.clearContentAt(s.originX, s.originY)

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    // (#155 Tier 2) Each source tile's own transformed world-space AABB,
    // computed once here alongside the overall bounding box below — reused
    // in the destTargets loop to skip (dest, src) pairs that can't possibly
    // overlap, instead of unconditionally blitting every combination. Built
    // from each source's *real tracked content* (contentRect), not its
    // whole tileW x tileH extent — a tile that's been fully vacated by an
    // earlier bake (contentRect null) contributes nothing here and is
    // skipped entirely (srcRects[i] stays null), rather than forever
    // dragging the overall bounds (and therefore resident tile footprint)
    // wider on every subsequent drag — see _bakeTransform's own docstring
    // for the growing-footprint bug this fixes.
    const srcRects: Array<WorldRect | null> = []
    for (const { contentRect } of sourceTiles) {
      if (!contentRect) { srcRects.push(null); continue }
      let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity
      const corners: Array<[number, number]> = [
        [contentRect.minX, contentRect.minY], [contentRect.maxX, contentRect.minY],
        [contentRect.minX, contentRect.maxY], [contentRect.maxX, contentRect.maxY],
      ]
      for (const [x, y] of corners) {
        const [tx, ty] = applyAffine(matrix, x, y)
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
        sMinX = Math.min(sMinX, tx); sMaxX = Math.max(sMaxX, tx)
        sMinY = Math.min(sMinY, ty); sMaxY = Math.max(sMaxY, ty)
      }
      srcRects.push({ minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY })
    }
    if (maxX <= minX || maxY <= minY) {
      // Degenerate (zero-scale transform, or every source tile empty) —
      // content collapses to nothing.
      for (const s of sourceTiles) s.buffer.clear()
      return
    }

    const destTargets = layerBuf.resolveForPaint({ minX, minY, maxX, maxY })
    const matrixInv = invertAffine(matrix)
    const scratches: Array<{ target: PaintTarget; scratch: AccumulationBuffer }> = []
    for (const destTarget of destTargets) {
      const destMinX = destTarget.originX, destMinY = destTarget.originY
      const destMaxX = destMinX + destTarget.buffer.width, destMaxY = destMinY + destTarget.buffer.height
      // (#155) resolveForPaint resolves every tile touching the *union* of
      // every source tile's own real-content transformed bounds — for a
      // scale/rotate that union can span tiles no individual source tile's
      // content ever actually reaches (its own transformed rect just
      // happens to pass near, not through, that particular cell). Checking
      // for any overlap at all before acquiring a scratch, rather than after
      // finding none of the per-tile blits below fired, means a destination
      // like that never gets a scratch (or a wasted GPU copy) in the first
      // place — it's already a blank tile fresh out of resolveForPaint, so
      // skipping straight past it leaves it exactly as correct as copying an
      // all-transparent scratch onto it would have.
      if (!srcRects.some(r => r && !(r.maxX <= destMinX || r.minX >= destMaxX || r.maxY <= destMinY || r.minY >= destMaxY))) continue
      // (#155) Pooled rather than `new AccumulationBuffer` + destroy() every
      // commit — see _transformScratchPool's own comment. A bake that
      // touches N tiles otherwise pays N fresh _makeFBO calls (each a real
      // checkFramebufferStatus GPU sync) on every single commit, which
      // dominated an 8s pointerup INP on a room with ~20 resident tiles.
      const scratch = this._acquireScratchBuf(destTarget.buffer.width, destTarget.buffer.height)
      scratch.clear()
      sourceTiles.forEach((srcTile, i) => {
        // (#155) Skip pairs whose transformed bounding boxes don't overlap
        // at all (including a source with no real content, srcRects[i] ===
        // null) — TRANSFORM_BLIT_FRAG would just sample out-of-[0,1] UV and
        // draw fully transparent for every fragment in that case, so the
        // blit call itself is pure waste. Left unconditional, this is
        // O(destTiles x sourceTiles) real GPU draw calls every bake — fine
        // for a fresh layer (usually 1 tile each side) but blows up as a
        // room accumulates more resident tiles from repeated far-off drags:
        // measured a 5.6s `pointerup` INP from exactly this (see #155).
        const r = srcRects[i]
        if (!r || r.maxX <= destMinX || r.minX >= destMaxX || r.maxY <= destMinY || r.minY >= destMaxY) return
        // dest-tile-local -> world (destTarget's own origin) -> source
        // world (the transform's inverse) -> src-tile-local (srcTile's own
        // origin). Bounded mode: both origins are (0,0), so this reduces to
        // exactly matrixInv, unchanged from before this was generalized.
        const toWorld = translationMatrix(destTarget.originX, destTarget.originY)
        const toSrcLocal = translationMatrix(-srcTile.originX, -srcTile.originY)
        const mc = composeAffine(toSrcLocal, composeAffine(matrixInv, toWorld))
        this._runTransformBlit(
          srcTile.buffer.texture, mc,
          destTarget.buffer.width, destTarget.buffer.height,
          srcTile.buffer.width, srcTile.buffer.height,
          scratch.fbo,
        )
        // (#155 Tier 2) The real content this pair just contributed to
        // destTarget is exactly r (the source's transformed content AABB)
        // intersected with destTarget's own world rect — mark it so
        // getContentBounds() reflects reality without ever reading pixels
        // back. Unioned across every contributing source (markContentPainted
        // is monotonic), so call order/count doesn't matter.
        layerBuf.markContentPainted({
          minX: Math.max(r.minX, destMinX), minY: Math.max(r.minY, destMinY),
          maxX: Math.min(r.maxX, destMaxX), maxY: Math.min(r.maxY, destMaxY),
        })
      })
      scratches.push({ target: destTarget, scratch })
    }

    // (#155 follow-up: dropTile was tried here and reverted — see its own
    // removal note below the class for why) — every source tile is cleared
    // once every scratch has finished reading from it, same as before this
    // whole optimization pass; a tile that's *also* a destination target
    // gets fully overwritten by scratch.copyTo right after anyway (a full
    // replace, not a blend), so clearing it first is harmless, just as it
    // always was.
    for (const s of sourceTiles) s.buffer.clear()
    for (const { target, scratch } of scratches) {
      scratch.copyTo(target.buffer)
      this._releaseScratchBuf(scratch)
    }
  }

  /** Rebuilds `_compositeFBO` from every live layer plus whatever preview
   *  buffers are currently active (live-tip, speculative-prediction, peer
   *  reveals) — the shared first half of both `_display()` (paper-blended,
   *  drawn to the visible canvas) and `_displayTransparent()` (#15, no
   *  paper). Stores premultiplied graphite color in `.rgb`, coverage in
   *  `.a` (see DISPLAY_FRAG's comment) — neither downstream pass re-renders
   *  any dab or layer, they only differ in how they read this buffer back.
   *
   *  (#138) The live-tip/predicted/peer-reveal preview buffers are always
   *  plain, fixed-size (canvas.width x canvas.height) AccumulationBuffers —
   *  their dabs are pre-translated (see _translateDabs) into that fixed
   *  buffer's own local space before painting, relative to a world origin
   *  snapshotted once at creation time (_cameraCenteredOrigin — see its own
   *  doc comment for why once, and why centered on the camera). In other
   *  words each one is exactly a "tile" whose world origin is that
   *  snapshotted point and whose size is the canvas's own (w, h). A bounded
   *  room's fixed identity camera (see the constructor) makes that origin
   *  exactly (0,0) always, so it still gets a plain full-buffer blit here,
   *  unchanged from before #138. An infinite room's camera can be anywhere,
   *  so its previews now go through _drawTileComposite exactly like a real
   *  tile at that same world rect — into the still-unrotated `_assemblyFBO`
   *  _runComposite above just populated, *before* _finishInfiniteComposite's
   *  single rotate blit at the bottom applies the camera's actual rotation
   *  to everything (real content and previews alike) at once. */
  private _composeToFBO(needCompositeFBO = true): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height
    // (#301) An infinite room's on-screen path never reads _compositeFBO —
    // _composePaperToScreen goes straight from _assemblyFBO to the screen,
    // and the only consumers of the rotated, unblended canvas-sized copy
    // (_displayTransparent, which is bounded-only in practice) ask for it
    // explicitly. So for the every-frame display case this skips both a
    // full-canvas clear and the rotate blit at the bottom of this method —
    // two screen-sized passes per frame that were being rendered and thrown
    // away. Bounded rooms are unaffected: _compositeFBO *is* their composite
    // target, so `needCompositeFBO` is meaningless for them and the flag
    // only ever gates infinite-room work.
    const skipCompositeFBO = this._infinite && !needCompositeFBO

    if (!skipCompositeFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._compositeFBO.fbo)
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    this._runComposite(this._compositeOrder, this._compositeFBO.fbo)

    const buildFbo = this._infinite ? this._assemblyFBO.fbo   : this._compositeFBO.fbo
    const buildW   = this._infinite ? this._assemblyFBO.width : w
    const buildH   = this._infinite ? this._assemblyFBO.height : h

    // Camera-relative blend of one preview buffer, world rect [origin,
    // origin+(w,h)] — see this method's own doc comment above.
    const blendPreview = (texture: WebGLTexture, origin: { x: number; y: number }): void => {
      if (this._infinite) {
        this._drawTileComposite(texture, origin.x, origin.y, w, h, 1, buildFbo, buildW, buildH)
      } else {
        this._compositeTextures([{ texture, opacity: 1 }], buildFbo, buildW, buildH)
      }
    }

    // #104 live-tip preview: blended in before the #92 preview below so the
    // (mutually-exclusive-in-practice, but not enforced) predicted preview
    // stays visually on top if both experiments are ever enabled together.
    // Same (ONE, ONE_MINUS_SRC_ALPHA) blend as AccumulationBuffer.beginDraw()
    // — visual only, never written into any layer's real buffer.
    if (this._tipBuf) blendPreview(this._tipBuf.texture, this._tipBufOrigin)

    // #92 speculative preview: blended on top of the real composite, same
    // (ONE, ONE_MINUS_SRC_ALPHA) blend as AccumulationBuffer.beginDraw() —
    // visual only, never written into any layer's real buffer.
    if (this._previewBuf) blendPreview(this._previewBuf.texture, this._previewBufOrigin)

    // Live remote-stroke reveals (#37 follow-up v2): one per peer currently
    // replaying a stroke, same blend, on top of everything else — see
    // previewOperation. Order among multiple simultaneous peers is arbitrary
    // (Map insertion order); their strokes are independent so this never
    // matters visually.
    for (const { buf, origin } of this._peerPreviews.values()) blendPreview(buf.texture, origin)

    // (#138) The one place camera rotation is applied for infinite rooms —
    // now runs once, after both real content and every preview buffer are
    // in `_assemblyFBO`, rather than from inside _runComposite. No-op for
    // bounded rooms (see _finishInfiniteComposite's own comment), and
    // skipped entirely for an infinite room's on-screen frames (#301 — see
    // `skipCompositeFBO` above): the screen pass rotates _assemblyFBO
    // itself, so doing it a second time here would only be building a copy
    // nobody reads.
    if (!skipCompositeFBO) this._finishInfiniteComposite(this._compositeFBO.fbo)
  }

  /** (#155) See _displayRafId's own doc comment for why this exists. Safe to
   *  call redundantly — a call while one's already pending is a no-op, so
   *  every real move during a fast stroke can call this unconditionally
   *  without building up a queue of redundant rAF callbacks. */
  private _scheduleDisplay(): void {
    if (this._displayRafId !== null) return
    this._displayRafId = requestAnimationFrame(() => {
      this._displayRafId = null
      const pendingTs = this._debug ? this._dbgPendingFrameTimestamp : null
      this._dbgPendingFrameTimestamp = null
      this._display()
      // See StrokeDebugStats.avgFrameLatencyMs. gl.finish() — debug-only,
      // never called otherwise (see the field's own comment on why) —
      // blocks until every GL command _display() just queued, *and* any
      // backlog already sitting in the GPU's command queue from earlier
      // frames, has actually finished executing. Measuring before this call
      // (the first version of this metric) only proved the rAF callback
      // fired on schedule and JS kept submitting work — not that the GPU
      // was keeping up — so it badly under-reported lag under real
      // fill-rate pressure: confirmed on-device reading ~18ms average here
      // while the felt lag was severe (same tablet, same room, DPR-uncapped
      // for the test). gl.finish() itself stalls the pipeline, so debug-mode
      // numbers run somewhat pessimistic vs. real (no-stall) production
      // timing — an accepted tradeoff for a number that's supposed to catch
      // exactly this kind of GPU backlog.
      if (this._debug && pendingTs !== null) {
        this.gl.finish()
        const frameLatency = performance.now() - pendingTs
        this._dbgFrameSum += frameLatency
        this._dbgFrameCount++
        if (frameLatency > this._dbgMaxFrame) this._dbgMaxFrame = frameLatency
      }
    })
  }

  private _display(): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height

    this._composeToFBO(!this._infinite)

    if (this._infinite) {
      // #141: paper must pan/zoom with the world for an infinite room, so
      // this can't use the screen-locked DISPLAY_FRAG pass bounded rooms
      // use below — it recovers each screen pixel's true world position
      // instead (see PAPER_COMPOSE_FRAG's own comment). (#301) That's now
      // one pass doing the camera's rotation and the paper blend together,
      // straight from _assemblyFBO to the screen; _compositeFBO isn't
      // written at all on this path (see _composeToFBO's own comment).
      // _composePaperToScreen manages its own framebuffer/viewport/blend
      // state, mirroring _runComposite/_finishInfiniteComposite's division
      // of labor, so nothing needs setting up here first.
      this._composePaperToScreen()
      return
    }

    const paperColor = this._opts.paperColor ?? paperColorOf(this._opts.paper)

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

  /** Transparent-background export variant (#15) — draws to the same visible
   *  canvas as `_display()` (there's no separate offscreen target), but
   *  through DISPLAY_TRANSPARENT_FRAG instead of the paper-blend DISPLAY_
   *  FRAG: un-premultiplies `_compositeFBO`'s stored color and writes
   *  coverage straight through as alpha, so untouched canvas is transparent
   *  rather than opaque paper. Only ever called from exportPNG(true), which
   *  restores the normal paper view via `_display()` right after grabbing
   *  the blob (see its docstring). */
  private _displayTransparent(): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height

    this._composeToFBO()

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)

    gl.useProgram(this._dispTransparentProg)
    const u = this._dispTransparentUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._compositeFBO.texture)
    gl.uniform1i(u.u_accumulation, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._dispTransparentPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  // ─── Infinite-room export (#145) ───────────────────────────────────────────
  //
  // exportPNG's camera-viewport path (_display()/_displayTransparent() +
  // canvas.toBlob(), above) is exactly right for a bounded room — its canvas
  // literally is the whole drawing — but for an infinite room "whatever the
  // camera currently frames" isn't "the whole drawing" at all, just an
  // arbitrary crop. The methods below build a *second*, camera-independent
  // render of the tightest rect containing every layer's actual content
  // (getContentBounds's own union, at 1 world unit = 1 pixel) and read that
  // back directly, rather than reusing _compositeFBO/the real canvas (both
  // are fixed at canvas.width x canvas.height, which has no necessary
  // relationship to the content bounds' own size).

  /** Union of getContentBounds() across every layer currently in
   *  _compositeOrder — i.e. every layer that actually participates in the
   *  on-screen composite right now, same set _runComposite itself draws
   *  (a hidden layer's content is no more "part of the drawing" here than
   *  it is on screen). The tightest world-space rect containing all of it;
   *  null if every one of them is empty (or there are no layers at all).
   *  Used by _buildContentComposite for exportPNG's infinite-room path. */
  private _allVisibleContentBounds(): { x: number; y: number; width: number; height: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const { id } of this._compositeOrder) {
      const b = this.getContentBounds(id)
      if (!b) continue
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
    }
    if (maxX <= minX) return null
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  /** Builds one unblended (premultiplied-color/coverage-alpha — exactly
   *  _compositeFBO's own convention, see _composeToFBO's doc comment)
   *  accumulation buffer covering every layer's ENTIRE resident content,
   *  positioned by a synthetic, fixed (zoom 1, angle 0) camera centered on
   *  the union content bounds instead of the live, on-screen
   *  `_infiniteCamera`.
   *
   *  Reuses _drawCompositeItem/_drawTileComposite completely unmodified
   *  rather than inventing a second rendering path to keep in sync with the
   *  real one: passing a viewRect that exactly encloses the whole target
   *  buffer makes resolveVisible() return every resident tile anyway (a
   *  tile only gets excluded if it falls entirely outside viewRect — see
   *  ILayerBuffer's own doc comment), and _drawTileComposite's screen-
   *  position math only ever reads `this._infiniteCamera` and the target
   *  size/fbo it's given — nothing specific to the real on-screen canvas —
   *  so temporarily swapping the camera field is enough to retarget the
   *  exact same drawing code at an arbitrary offscreen buffer instead of the
   *  screen. This runs fully synchronously (no draw call here can yield to
   *  other engine code), so the swap is safe without any observer noticing
   *  the camera "moved"; the try/finally is just cheap insurance against a
   *  thrown error leaving it swapped.
   *
   *  Content bounds are integers (see getContentBounds), so this camera
   *  placement makes every tile origin land on an exact integer screen
   *  position with zero rounding — no seam risk the way a fractional-zoom
   *  on-screen camera has (see _drawTileComposite's own docstring).
   *
   *  Clamped to MAX_EXPORT_DIMENSION_PX per axis — see that constant's own
   *  comment. Caller owns the returned buffer's lifetime (destroy() once
   *  read). Returns null if every layer is empty — see exportPNG's own
   *  fallback for that case. */
  private _buildContentComposite(): { bounds: { x: number; y: number; width: number; height: number }; buffer: AccumulationBuffer } | null {
    const raw = this._allVisibleContentBounds()
    if (!raw) return null

    const width  = Math.min(Math.ceil(raw.width),  MAX_EXPORT_DIMENSION_PX)
    const height = Math.min(Math.ceil(raw.height), MAX_EXPORT_DIMENSION_PX)
    const bounds = { x: raw.x, y: raw.y, width, height }

    const { gl } = this
    const buffer = new AccumulationBuffer(gl, width, height)
    buffer.clear()

    const savedCamera = this._infiniteCamera
    const savedCenterX = this._compositeCenterX
    const savedCenterY = this._compositeCenterY
    const savedScale = this._compositeScale
    this._infiniteCamera = { wx: bounds.x + width / 2, wy: bounds.y + height / 2, zoom: 1, angle: 0 }
    // #134-follow-up: _drawTileComposite/_worldToScreenEdgeX/Y center on
    // _compositeCenterX/Y, not this target's own half-size, since #136 —
    // this buffer is a plain, direct 1:1 target (no assembly-buffer padding
    // concept applies here at all), so that center is simply its own
    // width/2, height/2, exactly matching the synthetic camera above.
    this._compositeCenterX = width / 2
    this._compositeCenterY = height / 2
    // (#301) Same story for the scale those two are paired with: this target
    // is 1 world unit = 1 pixel by construction (see the synthetic camera's
    // zoom above), which is what min(1, zoom) yields here anyway — set
    // explicitly rather than left at whatever the last on-screen frame used,
    // since nothing calls _runComposite on this path to refresh it.
    this._compositeScale = 1
    const viewRect: WorldRect = { minX: bounds.x, minY: bounds.y, maxX: bounds.x + width, maxY: bounds.y + height }
    try {
      for (const { id, opacity } of this._compositeOrder) {
        this._drawCompositeItem(id, opacity, buffer.fbo, viewRect, width, height)
      }
    } finally {
      this._infiniteCamera = savedCamera
      this._compositeCenterX = savedCenterX
      this._compositeCenterY = savedCenterY
      this._compositeScale = savedScale
    }

    return { bounds, buffer }
  }

  /** Transparent-export variant (#15/#145) of DISPLAY_TRANSPARENT_FRAG,
   *  parameterized to read an arbitrary source texture into an arbitrary
   *  target instead of hardcoding _compositeFBO -> the real canvas the way
   *  _displayTransparent() does — the un-premultiply math itself is
   *  unchanged, just retargeted. See _displayTransparent's own comment for
   *  what this shader does and why. */
  private _renderDisplayTransparentInto(sourceTex: WebGLTexture, targetFbo: WebGLFramebuffer, w: number, h: number): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)

    gl.useProgram(this._dispTransparentProg)
    const u = this._dispTransparentUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(u.u_accumulation, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._dispTransparentPosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Paper-baked export variant (#145) — the same PAPER_COMPOSE_FRAG the
   *  live screen pass uses, just pointed at an arbitrary source/target
   *  instead of _assemblyFBO/the screen, like _renderDisplayTransparentInto
   *  above. The export camera _buildContentComposite sets up is never
   *  rotated and always renders at exactly 1 world unit = 1 pixel, so both
   *  of that shader's mappings degenerate here: the accumulation lookup is
   *  the identity (source and target are the same size, pixel for pixel),
   *  and screen->world is a pure translation by the content bounds' origin.
   *  (#301) Sharing one shader between the two paths is also what stops the
   *  exported image and the on-screen one from drifting apart — this used to
   *  be a hand-synced copy of PAPER_BLEND_FRAG's math (no #include in GLSL
   *  ES1.0/WebGL1, so a second shader would have to be kept in step by
   *  hand; DISPLAY_FRAG, the bounded-room path, still is). */
  private _renderPaperComposeInto(
    sourceTex: WebGLTexture, targetFbo: WebGLFramebuffer, w: number, h: number,
    bounds: { x: number; y: number },
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)
    gl.useProgram(this._paperComposeProg)
    const u = this._paperComposeUni

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(u.u_accumulation, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperMap, 1)

    gl.uniform3fv(u.u_paperColor, this._opts.paperColor ?? paperColorOf(this._opts.paper))
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_dstSize, w, h)
    gl.uniform2f(u.u_srcSize, w, h)
    gl.uniformMatrix3fv(u.u_matrixInv, false, toMat3(IDENTITY_MATRIX))
    gl.uniformMatrix3fv(u.u_screenToWorld, false, toMat3(translationMatrix(bounds.x, bounds.y)))
    // Identity mapping — nothing to reconstruct, so the plain tap is both
    // cheaper and exactly correct here.
    gl.uniform1f(u.u_sharpResample, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._paperComposePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Hand-builds a PNG Blob from raw RGBA8 bytes read back via
   *  gl.readPixels — needed because _exportInfinitePNG's render target is
   *  never the real on-screen canvas (see its own doc comment for why), so
   *  there's no canvas.toBlob() to lean on the way every other export path
   *  in this file does. gl.readPixels' rows come out GL/window-bottom-
   *  first (the same convention getContentBounds' own doc comment explains
   *  and corrects for) — flipped here so row 0 of the PNG is the visual
   *  top, matching what canvas.toBlob() already gives for free via the
   *  browser's own canvas-paint step. */
  private _pixelsToPngBlob(pixels: Uint8Array, width: number, height: number): Promise<Blob | null> {
    const flipped = new Uint8ClampedArray(pixels.length)
    const rowBytes = width * 4
    for (let row = 0; row < height; row++) {
      const srcStart = row * rowBytes
      const dstStart = (height - 1 - row) * rowBytes
      flipped.set(pixels.subarray(srcStart, srcStart + rowBytes), dstStart)
    }
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    if (!ctx) return Promise.resolve(null)
    ctx.putImageData(new ImageData(flipped, width, height), 0, 0)
    return new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'))
  }

  /** exportPNG's infinite-room path (#145) — see PencilEngineAPI.exportPNG's
   *  own doc comment. A bounded room's canvas literally *is* the whole
   *  drawing, so the plain camera-viewport `_display()`/`_displayTransparent()`
   *  + `canvas.toBlob()` path (still used verbatim for bounded rooms, and as
   *  this method's own empty-drawing fallback below) is already exactly
   *  right there. An infinite room has no such fixed rect — "export the
   *  current camera viewport" is what the pre-#145 code did (it never had a
   *  tile-aware alternative), and is no more useful for an infinite canvas
   *  than a screenshot: whatever isn't currently on screen just isn't in the
   *  file. This instead exports the tightest rect containing every layer's
   *  actual painted content (see _buildContentComposite/
   *  _allVisibleContentBounds), rendered at exactly 1 world unit = 1 pixel —
   *  "give me my whole drawing" being a far more useful default for a real
   *  user than "give me whatever I happened to be looking at," and the
   *  tightest-bbox framing (rather than e.g. padding to some arbitrary
   *  margin) needs no further judgment call about how much blank space to
   *  include.
   *
   *  Renders through an *offscreen* framebuffer sized to the content bounds
   *  rather than resizing the real on-screen canvas to match (which would
   *  briefly glitch the live view, or race a concurrent ResizeObserver-
   *  driven resizeCanvas() call) — gl.readPixels works against whichever
   *  framebuffer is currently bound, not just the canvas's own default one,
   *  so there's no need to touch `this.canvas` at all. The visible on-screen
   *  frame is never disturbed by any of this — unlike the bounded/transparent
   *  path above, there's nothing to restore via _display() afterward. */
  private _exportInfinitePNG(transparent: boolean): Promise<Blob | null> {
    const composite = this._buildContentComposite()
    if (!composite) {
      // Nothing painted on any layer — no content rect to speak of. Falls
      // back to the plain camera-viewport export (blank paper, or fully
      // transparent either way) rather than producing a 0x0 image; this is
      // the one case where "export the current view" and "export the whole
      // drawing" agree — there's no drawing either way.
      if (transparent) this._displayTransparent()
      else this._display()
      const blob = new Promise<Blob | null>(resolve => this.canvas.toBlob(resolve, 'image/png'))
      if (transparent) this._display()
      return blob
    }

    const { bounds, buffer } = composite
    const { gl } = this
    const { width: w, height: h } = buffer

    const out = new AccumulationBuffer(gl, w, h)
    if (transparent) this._renderDisplayTransparentInto(buffer.texture, out.fbo, w, h)
    else this._renderPaperComposeInto(buffer.texture, out.fbo, w, h, bounds)

    const pixels = out.readPixels()
    buffer.destroy()
    out.destroy()

    return this._pixelsToPngBlob(pixels, w, h)
  }
}
