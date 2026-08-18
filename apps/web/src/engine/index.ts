import { nanoid } from 'nanoid'
import type { PaperType, Dab, ToolType, Operation, StrokeOperation, LayerMergeOperation, LayerDuplicateOperation, ImageImportOperation, LayerTransformMatrix, SelectionShape, AreaPasteOperation, AreaFillOperation, FillSourceMode } from '@grafetto/shared'
import { DAB_VERT, DAB_VERT_INSTANCED, DAB_FRAG, RIBBON_VERT, RIBBON_FRAG, SMUDGE_TRANSFER_FRAG, SMUDGE_PICKUP_FRAG, DISPLAY_VERT, DISPLAY_TRANSPARENT_FRAG, PAPER_COMPOSE_FRAG, LAYER_COMPOSITE_FRAG, IMAGE_BLIT_FRAG, TRANSFORM_BLIT_FRAG, AREA_TRANSFORM_FRAG, AREA_MASK_FRAG } from './src/shaders'
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/utils'
import { PAPER_WORLD_SIZE } from './src/paperConstants'
import {
  createPlaceholderPaperTexture, generatePaperMipmaps, getPaperBytes, uploadPaperTexture,
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
import {
  PENCIL_TILT, PENCIL_TILT_SLIDERS, pencilTiltness, pencilTiltDensity,
  type PencilTiltConfig,
} from './src/pencilTilt'
import { SMUDGE_GRAIN, SMUDGE_GRAIN_SLIDERS, smudgeGrainRelief, type SmudgeGrainConfig } from './src/smudgeGrain'
import { tiltMagnitudeDeg } from './src/tiltMath'
import {
  DEFAULT_TILT_RESPONSE, TILT_RESPONSES, isTiltResponse, tiltResponseT, type TiltResponse,
} from './src/tiltCurve'
import type { MarkerAngleConfig } from './src/markerPresets'
import { OperationLog, type PixelOperation } from './src/OperationLog'
import { PointerInput, type PointerData } from './src/PointerInput'
import {
  PENCIL_PRESETS, PENCIL_GRADES, GRAPHITE_GRAIN_DEFAULT, isPencilGrade,
  type PencilGradeName, type PencilPreset,
} from './src/pencilPresets'
import {
  LINER_PRESET, LINER_SIZES_MM, linerSpeedFlow, linerTiltFlow, applyLinerEndTaper,
  dwellConfigForTool, dwellFlow, linerWickPx,
  LINER_WICK_PX, LINER_WICK_RADIUS_CAP,
  type DwellConfig, type LinerSizeMm,
} from './src/linerPresets'
import { markerNibFromPreset, markerPressureFlow } from './src/markerPresets'
import { buildRibbonBands, RIBBON_FLOATS_PER_VERTEX } from './src/markerRibbon'
import { isRibbonTool, ribbonProfileFor, type RibbonProfile } from './src/ribbonProfile'
import {
  BRUSH_PEN_PRESET, applyBrushPenEndTaper, applyBrushPenHeadTaper,
  PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, isPressureResponse, brushPenWidth,
  type PressureResponse,
} from './src/brushPenPresets'
import { HapticGrain, type HapticGrainStats } from './src/HapticGrain'
import {
  applyMatrix, composeMatrix, invertMatrix, scaleRotateMatrix, toMat3, translationMatrix,
  IDENTITY_MATRIX, type Matrix3,
} from './src/matrix'
import { snapToRuler, type RulerLine } from './src/rulerSnap'
import { buildSelectionMask } from './src/selectionMask'
import { computeFill, coverageToRgba, FILL_MAX_DIM } from './src/floodFill'
import { TiledLayerBuffer, type TileRebuilder, type TileRebuildSession } from './src/TiledLayerBuffer'
import type { ILayerBuffer, PaintTarget } from './src/ILayerBuffer'
import { TILE_SIZE, coarseFactorFor, tileWorldRect, tilesOverlappingRect, type WorldRect } from './src/tileMath'
import { isFullyTransparent, retileSnapshotTiles } from './src/retileSnapshot'
import { encodeLayerTiles, type SnapshotTile } from './src/snapshotCodec'
import { defaultPaperColor, packDabs, strokeDabs, toHomography } from '@grafetto/shared'

export type { HapticGrainStats }
export type { Matrix3 }
export type { RulerLine }

export { PENCIL_PRESETS, PENCIL_GRADES, GRAPHITE_GRAIN_DEFAULT, type PencilGradeName, type PencilPreset }
export { LINER_SIZES_MM, type LinerSizeMm }
export {
  CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE, CHARCOAL_GRAIN_STREAKY,
  type CharcoalType, type CharcoalPreset,
}
export { CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS, type CharcoalFeelConfig }
export { PENCIL_TILT, PENCIL_TILT_SLIDERS, type PencilTiltConfig }
export { SMUDGE_GRAIN, SMUDGE_GRAIN_SLIDERS, type SmudgeGrainConfig }
// #409: the UI needs the option list and its default to build the setting, the
// guard to validate a stored value, and the curve itself to draw each option's
// own graph in the picker. Deliberately the raw function rather than a
// ready-made SVG path: what a response *is* belongs to the engine, how it is
// drawn belongs to the UI.
export { TILT_RESPONSES, DEFAULT_TILT_RESPONSE, isTiltResponse, tiltResponseT, type TiltResponse }
// #454 — the brush pen's own response setting, the pressure counterpart of
// the tilt one right above. Re-exported for toolSchemas.ts, which owns the
// UI side of it.
export { PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, isPressureResponse, brushPenWidth, type PressureResponse }

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
  // #409: the same response the engine has been given, so the hover outline
  // keeps matching the mark — the cursor is how the setting is *seen* before
  // anything is drawn with it, so a preview left on the default would quietly
  // lie about the tool the moment the setting moved off it.
  tiltResponse?: TiltResponse,
): { size: number; aspectRatio: number; angle: number } {
  const shaping = shapingForTool(tool, presetName, markerAngle, tiltResponse)
  const tiltMag = tiltMagnitudeDeg(tiltX, tiltY)
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

/** (#470) The neutral the sheet sits on when a caller names no theme colour.
 *  Deliberately dark and desaturated: it frames the paper without competing
 *  with it, and it matches the editor's own surround so the seam between the
 *  GL canvas and the page around it is invisible. */
const DEFAULT_DESK_COLOR: [number, number, number] = [0.086, 0.086, 0.102]

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
  /** (#470) The sheet's size in world units, for a bounded room.
   *
   *  New with viewport rendering, and it has to be passed rather than read off
   *  the canvas: the canvas element used to *be* the sheet, so `canvas.width`
   *  was the sheet's width by construction. It is the viewport now, and the
   *  two are unrelated — a 900px-tall window showing a 3508-unit page. Omitted
   *  for an infinite room, which has no sheet. Defaults to the canvas size so
   *  a caller that has not been updated still gets the old geometry rather
   *  than a zero-sized page. */
  pageWidth?: number
  pageHeight?: number
  /** (#470) What surrounds the sheet on screen, 0-1 per channel. There was no
   *  such place before viewport rendering — the canvas element was the sheet,
   *  so every pixel the engine drew was paper. Defaults to the app's own dark
   *  surround; passed in so a theme can decide it rather than the engine. */
  deskColor?: [number, number, number]
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
  // (#429) Fires while the pen is still down, carrying the dabs painted since
  // the last time it fired — the sending half of the live stroke channel. The
  // caller puts these on the wire; peers hand them straight to
  // appendPeerLiveDabs. Never fires for a stroke this engine is replaying or
  // receiving, only for one being drawn here and now.
  //
  // These are the *same* dab objects the gesture's StrokeOperation will carry:
  // the engine bakes a dab once, at paint time, and both paths read that one
  // result. It is what makes the handoff from streamed ink to committed ink
  // exact rather than approximate — the property the abandoned #37 attempt
  // lacked, and the reason this is worth doing at all.
  onLiveStrokeDabs?: (packet: PeerLivePacket) => void
  // (#429) The pen came up on a locally-drawn stroke. Peers use it to close
  // their bookkeeping for the gesture without waiting for the operation, which
  // arrives later and, for a frozen or rejected author, may never arrive.
  onLiveStrokeEnd?: (strokeId: string) => void
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
  // One of the layer ids the pending undo/redo would affect. layer_add,
  // layer_merge and layer_duplicate each target exactly one; layer_delete's
  // layerIds may list
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
  // Dev-only live tuning of charcoal's tilt curve (#305, ADR 005; #403) — the
  // thresholds depend on how a particular hand holds a particular stylus, so
  // they're calibrated by dragging sliders on the tablet rather than agreed as
  // numbers up front. Mutates the shared CHARCOAL_FEEL in place, so it takes
  // effect on the next *stroke*, not retroactively: shape is baked into each
  // Dab at record time, which is exactly what keeps already-drawn and replayed
  // marks stable while a slider moves.
  setCharcoalFeel(patch: Partial<CharcoalFeelConfig>): void
  getCharcoalFeel(): CharcoalFeelConfig
  // (#389) The same dev-only live tuning for graphite's tilt curve, and the
  // same "next stroke, not retroactively" semantics — see setCharcoalFeel.
  setPencilTilt(patch: Partial<PencilTiltConfig>): void
  getPencilTilt(): PencilTiltConfig
  // The same dev-only live tuning for how the smudge tool's imprint settles
  // into the paper's tooth (smudgeGrain.ts). Unlike the two above, this one
  // *is* read at paint time rather than baked into the Dab, so it takes
  // effect on the next dab and a replay of an old stroke re-renders under
  // whatever the knobs say now — fine for a dev knob, and the reason it has
  // to be settled before any of it ships as a constant.
  setSmudgeGrain(patch: Partial<SmudgeGrainConfig>): void
  getSmudgeGrain(): SmudgeGrainConfig
  setCompositeOrder(items: CompositeItem[]): void
  appendOperation(op: Operation, source?: OperationSource): void
  // (#398) Decodes the reference image of every `image_import` among `ops`
  // into the engine's image cache, so that applying those operations
  // afterwards paints them *synchronously*, in log order, like every other
  // pixel operation.
  //
  // Decoding an image is the one step in applying an operation that cannot
  // happen inline, and `appendOperation` has no asynchronous boundary to hang
  // it on. Without this, a replay walks straight past an `image_import` and
  // applies everything after it to a still-empty layer — a `layer_transform`
  // bakes nothing and the image then lands, undisplaced, at its original
  // position (the reported #398 symptom: a moved reference photo jumps back on
  // rejoin), a stroke meant to sit on top of the photo ends up under it, and a
  // `layer_clear` clears a layer the image is about to appear on.
  //
  // A caller replaying a batch of operations (initial room join, reconnect —
  // the same batch suspendDisplay/paperReady below are about) awaits this
  // first. Failures are swallowed: one undecodable image must not abandon the
  // replay, and the operation itself then behaves exactly as it did before
  // (painted late, or not at all, and logged). Already-cached images cost
  // nothing, so calling it repeatedly across pages is fine.
  preloadImages(ops: Operation[]): Promise<void>
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
  // (#346) Starts the same load again after `paperReady()` rejected, and
  // returns the new attempt. A failed texture leaves the engine permanently
  // unable to draw (see _paperTexLoaded's own comment), and the only way out
  // used to be reloading the page — which for a room means throwing away
  // whatever the reload happens to catch mid-flight. The caches underneath
  // already evict a rejection rather than memoize it (see paperLoader's
  // cacheEvictingRejection and getPaperManifest), so this genuinely re-fetches
  // instead of handing back the same failure; all that was missing was
  // something allowed to pull the trigger. A no-op once the texture is loaded.
  retryPaper(): Promise<void>
  // (#149 epic) Raw (uncompressed) tile payload for this layer's current
  // resident content — the same allResident() gather _takeCheckpoint already
  // does for local undo checkpoints, just serialized for network upload
  // instead of kept in memory. Null when the layer has no pixel content yet
  // (nothing to snapshot) — mirrors _takeCheckpoint's own early-return.
  // Bundling several layers together, compressing, and uploading is the
  // caller's job (Room's snapshot orchestration), not the engine's — the
  // engine only knows about one layer at a time.
  bakeNetworkSnapshot(layerId: string): Uint8Array | null
  // (#373) Whether this layer holds pixels the server does not have — what
  // lets a bake carry only the layers that changed instead of re-reading every
  // layer in the room. False for a layer nobody has ever painted, so an
  // untouched `background` never costs a readback.
  isLayerDirty(layerId: string): boolean
  // (#386) Every layer this engine currently holds a pixel buffer for.
  //
  // Exists for exactly one caller — the snapshot uploader, which is handed a
  // LayerState by Room and has no other way to notice that it was handed a
  // stale one. Both are derivations of the same log (see appendOperation's own
  // doc comment on the structural/pixel split), so a live buffer whose id is
  // absent from that LayerState means one of the two is out of date, and
  // uploading the pair would store a structure that contradicts the pixels.
  // Deliberately narrow rather than a general layer listing: LayerState is
  // where layers live, and this must not become a second source of truth for
  // what a room contains.
  liveLayerIds(): string[]
  // (#169) Restores a layer's pixel content wholesale from a downloaded
  // network snapshot — the layer must already exist (via initLayer) with an
  // empty buffer; this is the fast-join counterpart to a live stroke replay,
  // skipping straight to the end result instead of repainting every
  // historical dab. Same tile-restore primitive local checkpoint restore
  // already uses (resolveForPaint + AccumulationBuffer.restorePixels +
  // ILayerBuffer.restoreTileContent).
  // (#374) `coveredSeq` is the room seq those tiles were baked at. Operations
  // at or below it that paint this layer are already in the pixels, so the
  // engine must not paint them again — see `appendOperation`'s layer_merge,
  // layer_duplicate and layer_transform branches, the only ones that can still
  // arrive covered (the server withholds pure pixel operations it can account
  // for, but a merge or a duplicate also carries structure and a transform can
  // name several layers, so those always come through — see rooms.ts's
  // isCoveredBySnapshot).
  // Omit it and nothing is treated as covered, which is what every caller
  // outside the snapshot-restore path wants.
  restoreLayerFromSnapshot(layerId: string, tiles: SnapshotTile[], coveredSeq?: number): void
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
  // undo/redo: peekUndo only flags layer_add/layer_merge/layer_duplicate
  // (undoing layer_delete just restores a layer, never destructive); peekRedo
  // only flags layer_delete and layer_merge (redoing layer_add or
  // layer_duplicate just re-creates).
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
  /** #409: which of the three tilt→shape ramp shapes the next stroke uses —
   *  a user setting, per tool, resolved by the caller before it gets here
   *  (the engine holds one active response, not a table keyed by tool, for
   *  the same reason setPencil takes one preset string rather than every
   *  tool's). Affects only the tools whose dab shape reads the tilt curve at
   *  all: pencil, eraser, smudge and charcoal — see shapingForTool.
   *
   *  Nothing about it reaches the wire. Dab geometry is baked at record time
   *  and serialized per dab (size/aspectRatio, dabCodec.ts), so a peer
   *  replays the shape this user actually drew without ever learning which
   *  response produced it — and a stroke drawn under one response keeps its
   *  geometry when the setting later changes, same as every other tool
   *  option. */
  setTiltResponse(response: TiltResponse): void
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
  // (#421) Re-derives this layer's tracked content bounds from its real
  // pixels, so the next getContentBounds hugs the drawing instead of the
  // conservative box repeated transform bakes inflate — see ILayerBuffer's
  // tightenContentRects for what it costs and when it may be called.
  tightenContentBounds(layerId: string): void
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
  // Resizes the canvas backing buffer itself — the canvas element IS the
  // viewport, so it must track the viewport container's size. (#470) Both
  // kinds of room: a bounded room's canvas used to be its sheet, fixed for
  // the room's lifetime, which is exactly what made a big sheet cost a
  // sheet-sized set of buffers. Recreates every canvas-size-dependent GL
  // resource (_compositeFBO/_belowCache/_aboveCache), same as context-restore
  // already does for _initGL.
  resizeCanvas(width: number, height: number): void
  // Live gizmo-drag preview (#120): renders each layer's *current* content
  // through the given transform into a scratch buffer composited in place
  // of the real one — never mutates the real layer buffer. Call on every
  // drag frame; call clearLayerTransformPreview() once a real
  // `layer_transform` op has been appended (commit) or the drag is
  // abandoned (cancel).
  //
  // (#392) Takes the wire union — six numbers for an affine gesture, nine for
  // a Distort — exactly as it would arrive on a layer_transform op, so a
  // caller never has to decide which form to hand over. Widened once inside;
  // everything past that point is 3x3.
  previewLayerTransform(transforms: Array<{ layerId: string; matrix: LayerTransformMatrix }>): void
  clearLayerTransformPreview(): void
  // (#446) The selection-scoped twin of previewLayerTransform: previews an
  // `area_transform` — the masked region lifted out of the layer, leaving a
  // hole, and stamped down through `matrix`. Same lifecycle as the whole-layer
  // preview, and cleared by the same clearLayerTransformPreview(), because a
  // drag is either one or the other and never both.
  //
  // Unlike the whole-layer preview, this one only shadows the tiles it
  // actually touches — the rest of the layer keeps drawing from its real
  // buffer (see _drawCompositeItem). A whole-layer preview can replace the
  // layer wholesale because every pixel of it moved; here most of the layer
  // is standing still.
  previewAreaTransform(layerId: string, selection: SelectionShape, matrix: LayerTransformMatrix): void
  // (#446) The paste half of a floating selection: shows `image` sitting above
  // `layerId` at `rect`, moved by `matrix`, without writing a single pixel
  // into the layer. What makes a pasted piece a *float* — the layer keeps its
  // own content until the piece is dropped, so dragging moves the pasted
  // pixels alone and never the drawing that happens to be under them.
  //
  // Same lifecycle and the same clearLayerTransformPreview as the two previews
  // above; the drop is an `area_paste` carrying that same matrix.
  //
  // The raster must already be decoded (preloadImages) — a float is dragged at
  // pointer rate and cannot wait on an image decode per frame. Silently draws
  // nothing until it is, which for a locally-copied selection never happens.
  previewAreaPaste(
    layerId: string, image: string,
    rect: { x: number; y: number; width: number; height: number },
    matrix: LayerTransformMatrix,
  ): void
  // (#446) Decodes one raster into the same cache preloadImages fills, so the
  // float above can draw it on the very first frame. preloadImages takes whole
  // operations, and a floating paste has no operation yet — that is the point
  // of it.
  preloadImage(src: string): Promise<void>
  // (#446) The selected pixels of one layer as a PNG data URL plus the world
  // rect they came from — what "copy" puts on the clipboard and what a later
  // `area_paste` carries. Everything outside the selection is transparent, so
  // pasting a lasso'd shape does not drop a rectangle of background around it.
  // Null when the selection has no inside or the layer is empty there.
  readAreaImage(layerId: string, selection: SelectionShape): Promise<AreaImage | null>
  // (#453) Works out what one tap of the fill tool covers, and returns it as a
  // raster ready to become an `AreaFillOperation` — nothing is painted and no
  // operation is emitted here.
  //
  // The whole of the algorithm lives on this side of the wire on purpose: the
  // region is derived from pixels that came off *this* GPU, which is not a
  // thing another participant can reproduce (see AreaFillOperation's own
  // docstring). What travels is the answer.
  //
  // Cost is real and paid on the main thread: a readback of the fill's domain
  // plus a scan of it, i.e. tens of milliseconds on a small canvas and a
  // noticeable pause on a large one. Callers are expected to put something on
  // screen before awaiting it.
  computeAreaFill(request: AreaFillRequest): Promise<AreaFillRaster | null>
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
  // (#429) Paints one packet of a peer's still-in-progress stroke straight
  // into the real layer, exactly as a local stroke paints itself while the
  // pen is down — not into a preview buffer composited on top.
  //
  // That distinction is the whole design. Marker multiplies the layer's own
  // content frozen at pen-down, and smudge reads and redistributes it;
  // neither is expressible in a detached transparent buffer, which is why
  // previewOperation's reveal path cannot double as the live path. Painting
  // into the layer also means the gesture's stateful machinery — the marker's
  // per-gesture scratch, the smudge imprint, the previous dab across a packet
  // seam — is reached through `strokeId` exactly the way a chunked replay
  // already reaches it, with no second implementation of any of it.
  //
  // The pixels this leaves are provisional in bookkeeping only: the
  // StrokeOperation(s) that follow are still the record, and appendOperation
  // recognises the dabs already painted here rather than painting them twice
  // (see _peerLiveStrokes).
  appendPeerLiveDabs(peerId: string, packet: PeerLivePacket): void
  // (#429) The peer's pen came up, they left, or their stream broke. Ends the
  // bookkeeping for that gesture; the ink stays, because the operations that
  // own it are already on their way. Returns how many of this gesture's dabs
  // were painted live but not yet claimed by an operation — non-zero means a
  // gesture ended without ever being recorded, and the layer needs repairing
  // from the log rather than being left with ink nothing owns.
  endPeerLiveStroke(peerId: string, strokeId?: string): number
  // (#429) Forgets every peer's live bookkeeping at once — for a full resync,
  // where the layers are rebuilt from the log and any pre-painted ink ceases
  // to exist along with the claims against it.
  resetPeerLiveStrokes(): void
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

/** (#446) A copied selection: the pixels, and where on the canvas they were.
 *  Shaped to drop straight into an `area_paste` operation — paste in place is
 *  the default (ADR 008), so the rect travels with the raster rather than
 *  being recomputed from wherever the camera happens to be. */
export interface AreaImage {
  image: string
  x: number
  y: number
  width: number
  height: number
}

/** (#453) What the caller asks a fill for. Coordinates are layer space (canvas
 *  pixels for a bounded room, world units for an infinite one), the same space
 *  `Dab.x/y` and `SelectionShape.points` already use; `color` is 0–1 per
 *  channel like every other tool colour. */
export interface AreaFillRequest {
  layerId: string
  seedX: number
  seedY: number
  color: [number, number, number]
  /** 0–1. How far from the tapped pixel still counts as the same area. */
  tolerance: number
  /** 0–3 px of gap closing — see floodFill.ts. */
  gapClose: number
  /** 0–3 px the paint creeps under the line it stopped at. */
  expand: number
  /** Read boundaries from the target layer alone, or from the composite of
   *  every visible layer (paint still lands only in the target). */
  source: FillSourceMode
}

/** (#453) A computed fill: the raster and where it goes, shaped to drop
 *  straight into an `AreaFillOperation`. */
export type AreaFillRaster = AreaImage

/** (#453) How far past the outermost mark an infinite room's fill domain
 *  reaches. Enough that paint can spread around a drawing rather than stopping
 *  on its bounding box, small enough that it does not meaningfully grow the
 *  readback. */
const INFINITE_FILL_MARGIN = 256

/** (#446) A selection's coverage mask on the GPU, with the world rect it
 *  spans — everything the two mask shaders need to place it. */
interface MaskTexture {
  tex: WebGLTexture
  rect: WorldRect
}

/** Straight-alpha copy of premultiplied RGBA8 bytes. Layer buffers store
 *  colour premultiplied by coverage; PNG (and `<img>` decoding on the way back
 *  in) is straight alpha. Skipping this on the way out darkens every partly
 *  transparent pixel, which for a copied selection is precisely its
 *  antialiased rim — a dark outline that appears on paste and nowhere else. */
function unpremultiply(pixels: Uint8Array): Uint8Array {
  const out = new Uint8Array(pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]
    out[i + 3] = a
    if (a === 0) continue
    // Rounded, and clamped because a premultiplied buffer can hold rgb
    // marginally above its own alpha after repeated blending.
    out[i] = Math.min(255, Math.round(pixels[i] * 255 / a))
    out[i + 1] = Math.min(255, Math.round(pixels[i + 1] * 255 / a))
    out[i + 2] = Math.min(255, Math.round(pixels[i + 2] * 255 / a))
  }
  return out
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

/** (#429) One packet of a peer's in-progress stroke, as
 *  PencilEngineAPI.appendPeerLiveDabs takes it. Mirrors the wire's
 *  StrokeLiveData with the dabs already decoded — the engine deals in Dab[]
 *  everywhere else, and keeping the unpacking at the socket seam means a test
 *  can drive this without going through the codec. */
export interface PeerLivePacket {
  strokeId: string
  layerId: string
  tool: ToolType
  preset: string
  color: [number, number, number]
  packetSeq: number
  dabs: Dab[]
}

// ─── Internal types ────────────────────────────────────────────────────────────

/** (#429) How much of one peer's gesture is already on this client's layer,
 *  and how far each of the two sources delivering it has got.
 *
 *  A gesture arrives twice over, and — this is the part that is easy to get
 *  wrong — the two are *interleaved*, not sequential. Live packets stream while
 *  the pen is down; operations are dispatched at every
 *  STROKE_DAB_CHUNK_LIMIT boundary as well as at pen-up, so an operation
 *  routinely lands mid-gesture. Either source can therefore be ahead of the
 *  other at any moment: the live stream normally leads, but the first chunk
 *  operation carries a round 800 dabs and can easily overtake a stream that has
 *  delivered 791.
 *
 *  So the state is one watermark and two cursors:
 *
 *  - `paintedTotal` — dabs of this gesture on the layer, from whichever source
 *    put them there. The single source of truth about what is already drawn.
 *  - `liveOffset` — dabs the live stream has delivered. Packets are contiguous
 *    (painting stops at the first gap rather than skipping it), so a packet's
 *    dabs occupy exactly [liveOffset, liveOffset + n).
 *  - `committedOffset` — dabs the operations have accounted for, the same way.
 *
 *  Each source paints only what lies beyond `paintedTotal`, whichever it is.
 *  That symmetry is the whole correctness argument: dab painting accumulates,
 *  so a dab painted twice is visibly darker, and an overlap in *either*
 *  direction leaves part of the mark a different shade from the rest.
 *
 *  `desynced` latches on a packet-sequence gap. Inside one socket connection a
 *  gap cannot happen, so it means the connection broke — the stream stops being
 *  trusted from there on, while `paintedTotal` stays valid and the operations
 *  simply paint the rest. `ended` records that the author's pen came up, so the
 *  entry can be disposed once the operations have caught up to what was painted
 *  rather than at pen-up, when they are still in flight. */
interface PeerLiveStroke {
  peerId: string
  strokeId: string
  layerId: string
  paintedTotal: number
  liveOffset: number
  committedOffset: number
  nextPacketSeq: number
  desynced: boolean
  ended: boolean
}

/** (#429) Key for _peerLiveStrokes: one entry per *gesture*, not per peer.
 *
 *  Per peer was the obvious shape and it was wrong, which a tablet-to-desktop
 *  pass caught and no single-stroke test could. A gesture's last operation is
 *  dispatched at pen-up and travels through the Outbox, which persists to
 *  IndexedDB before it sends; the live channel is a bare emit. So when someone
 *  draws quickly — short strokes one after another, which is most real drawing
 *  — the next gesture's first packet routinely overtakes the previous
 *  gesture's final operation. Keyed by peer, that packet evicted the entry the
 *  operation still in flight was about to claim against, and the operation
 *  repainted the whole streamed stroke on top of itself.
 *
 *  Isolated tools all measured clean; twenty-seven strokes drawn briskly did
 *  not. The difference was never the tool. */
function liveStrokeKey(peerId: string, strokeId: string): string {
  // `|` is safe as a separator rather than merely unlikely: a userId is a UUID
  // and a strokeId is a nanoid, and neither alphabet contains it, so no pair of
  // distinct inputs can collide on one key.
  return `${peerId}|${strokeId}`
}

/** How many finished-but-unsettled gestures to keep per peer. Entries are
 *  normally disposed the moment their operations catch up; this only bounds
 *  the pathological case where an operation never arrives at all (author
 *  frozen mid-gesture, rejected, or gone), so nothing accumulates for a whole
 *  lesson. Comfortably more than the handful of gestures that can plausibly be
 *  in flight at once. */
const MAX_LIVE_GESTURES_PER_PEER = 8

interface EngineOpts {
  deskColor: [number, number, number]
  /** (#470) The sheet's world size for a bounded room — see
   *  PencilEngineOptions.pageWidth for why it cannot be read off the canvas
   *  any more. Undefined for an infinite room. */
  pageWidth?: number
  pageHeight?: number
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
  // (#366) `dabs` is decoded from the operation once, when it joins the
  // queue — this is walked on every timer tick as the reveal plays out, and
  // unpacking the whole array per tick would turn a cheap read into real work
  // proportional to the stroke's length.
  queue: Array<{ op: StrokeOperation; rate: number; dabs: Dab[] }>
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
// (#426) Derived from shared's hex rather than kept as a second hand-written
// table, which is what this was. The comment above it said "update both
// together if these defaults ever change" — and by the time anyone read that,
// they already disagreed: 0.90 against 230/255 = 0.902, and the same rounding
// on the other five channels. Nothing failed, because nothing compared them;
// the shader just rendered a slightly different paper than the colour picker
// previewed. One source of truth removes the class of bug rather than fixing
// this instance of it.
//
// Safe under the cross-device determinism rule (.claude/rules.md): this is a
// constant converted by exact integer arithmetic on every client, not a value
// computed per-device on the GPU.
function paperColorOf(type: PaperType): [number, number, number] {
  const hex = defaultPaperColor(type)
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
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

// (#429) How long dabs may sit in the live queue before going out as a packet.
//
// The trade is direct and both ends of it are real. Lower means less of the
// latency budget spent buffering, but more packets, and #424 established that
// a drawing room's ceiling is the server's CPU and that the walk from "48 ms"
// to "seconds" spans only a few percent of load — so packet count is not free.
// Higher means fewer, fatter packets and a peer who is always a little further
// behind the pen.
//
// 60 ms is a starting point, not a measured optimum: at a normal drawing speed
// it carries a handful of dabs, and it is comfortably under the 200 ms
// pen-to-peer-ink budget §11 of the release track asks for while leaving most
// of that budget to the network. #432 is the issue that will replace this
// guess with a number — it builds the instrument that can tell whether this
// wants to be 40 or 120.
const LIVE_STROKE_EMIT_INTERVAL_MS = 60

// Smudge (#14) tuning constants — picked by eye, not exposed as settings
// (the tool's user-facing knobs are just size/pressure/strength, reusing the
// existing dab fields — see toolSchemas.ts's smudge entry and
// _bakeDabOpacity's own smudge branch). See _paintOneSmudgeDab for how each
// is used, and SMUDGE_TRANSFER_FRAG's own file comment in shaders.ts for the
// algorithm they tune: as of #416 the stump carries a raster imprint of what
// it picked up, and every dab is a per-pixel lerp of the canvas toward that
// imprint.
//
// Dab radius relative to Dab.size — matches pencil's own sizeMultiplier
// scale (see PENCIL_PRESETS) rather than a from-scratch tuning.
const SMUDGE_SIZE_MULTIPLIER = 1.0
// Fixed edge softness (DAB_FRAG/SMUDGE_TRANSFER_FRAG's u_hardness) — smudge
// has no per-grade preset the way pencil does to pull this from.
const SMUDGE_HARDNESS = 0.5
// Scratch-patch size rounding, in px — a smudge stroke normally keeps a
// constant brush size, so rounding to a coarse grid here means every dab
// after the first reuses the same pooled buffers (the copied patch and,
// since #416, the carried imprint, which is sized to match it) instead of
// reallocating.
const SMUDGE_PATCH_GRANULARITY = 8
// Hard ceiling on the scratch patch's own side length, regardless of how
// large a brush size requests — bounds a single dab's worst-case GPU
// texture allocation.
const SMUDGE_MAX_PATCH_SIZE = 512
// How much of the carried imprint one dab refreshes from the canvas under
// it, per brush radius travelled (see `travel` in _paintOneSmudgeDab — both
// rates are scaled that way so what a stroke leaves behind depends on how
// far it went, not on how many samples the tablet happened to report along
// the way, the same report-rate independence #303 established for graphite
// deposition). This is also what bounds how far graphite is dragged: the
// imprint's own content decays by (1 - rate) per dab, so a lower value
// smears further and a higher one keeps the blend local.
const SMUDGE_PICKUP_RATE = 0.5
// The lerp weight one dab applies at its own center, per brush radius
// travelled, before the pressure / Strength-slider / shape / paper-catch
// weighting SMUDGE_TRANSFER_FRAG applies per fragment. Above 1 because
// every one of those terms is a fraction in practice (default Strength is
// 0.6, pen pressure rarely sits at full) — at the shipped defaults this
// lands near 0.35 at a dab's own center.
const SMUDGE_DEPOSIT_RATE = 2.0

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

// The marker's own ribbon constants (edge ramp, curvature tolerance, chisel
// corner radius, rim ink falloff) moved to src/ribbonProfile.ts in #454: they
// describe how the ribbon rasterizer draws one tool, and there are two such
// tools now. See that file.

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
 *    _paintRibbonStroke), not a flat per-dab amount. Deliberately separate
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
 *  _paintRibbonDabs' own doc comment for the one-shot-replay case (which
 *  just creates and destroys its own throwaway instance within one call,
 *  needing no cross-call lifecycle at all). */
/** (#385) Free list for RibbonStrokeScratch's buffers, so a gesture ending and
 *  the next one starting reuses GL objects instead of deleting three and
 *  allocating three more.
 *
 *  Not a micro-optimisation — it is what makes a long room openable at all. The
 *  scratch is three buffers *the size of the tile it mirrors*, and a bounded
 *  room's "tile" is the whole canvas: on A2 that is 3 × 34.8 MB per marker
 *  gesture. Replaying a real 2001-operation room churned 166 such textures
 *  through the driver in one batch, and the 167th allocation failed with
 *  `Framebuffer incomplete` — not from volume (live texture memory peaked at
 *  281 MB, and 2.1 GB allocates fine from cold) but from the churn itself:
 *  deleted textures stay charged to the context until the GPU service side
 *  processes them, which it does not do in the middle of one synchronous
 *  replay. Forcing a gl.finish() after every marker stroke also made the room
 *  open, which is what identified churn rather than size as the cause; pooling
 *  removes the churn instead of waiting on it.
 *
 *  Every other scratch in this engine is already pooled for its own reasons
 *  (_previewBufPool, _tipBufPool, _transformScratchPool, _smudgeScratchPool) —
 *  the marker's was the one that was not.
 *
 *  Capped per size rather than unbounded: an infinite room's gesture can span
 *  several tiles at once, and holding every tile a session ever touched would
 *  trade this bug for a memory one. Over the cap, release really does delete.
 *  Six is two tiles' worth, which covers a bounded room (always exactly one
 *  tile) with room to spare. */
const MARKER_SCRATCH_POOL_PER_SIZE = 6

class RibbonScratchPool {
  private _free = new Map<string, AccumulationBuffer[]>()
  private readonly gl: WebGLRenderingContext

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
  }

  acquire(width: number, height: number): AccumulationBuffer {
    const list = this._free.get(`${width}x${height}`)
    const reused = list?.pop()
    // 'nearest' matches what RibbonStrokeScratch has always asked for — see
    // its getOrCreate comment. The pool must never hand back a buffer built
    // with a different filter, which is why it is keyed by size alone and
    // used by this one caller.
    return reused ?? new AccumulationBuffer(this.gl, width, height, 'nearest')
  }

  release(buf: AccumulationBuffer): void {
    const key = `${buf.width}x${buf.height}`
    const list = this._free.get(key)
    if (!list) { this._free.set(key, [buf]); return }
    if (list.length >= MARKER_SCRATCH_POOL_PER_SIZE) { buf.destroy(); return }
    list.push(buf)
  }

  destroy(): void {
    for (const list of this._free.values()) for (const b of list) b.destroy()
    this._free.clear()
  }

  /** Context loss took every GL object with it — drop the handles without
   *  calling destroy() on them, same as every other pool in this file does. */
  forget(): void {
    this._free.clear()
  }
}

/** One tile's worth of a ribbon stroke's scratch state. `inkLoad` is null for a
 *  tool whose composite doesn't read one — see RibbonStrokeScratch's ctor. */
interface RibbonTileScratch {
  original: AccumulationBuffer
  coverage: AccumulationBuffer
  inkLoad: AccumulationBuffer | null
}

class RibbonStrokeScratch {
  private _tiles = new Map<AccumulationBuffer, RibbonTileScratch>()
  private readonly pool: RibbonScratchPool
  private readonly needsInk: boolean

  /** `needsInk` false skips the third buffer entirely (#454): a covering,
   *  source-over ink has no per-pixel pigment quantity for the composite to
   *  read, so allocating and clearing one per tile would be a buffer and two
   *  draw calls spent on a value nothing samples. See RibbonProfile.ink. */
  constructor(pool: RibbonScratchPool, needsInk = true) {
    this.pool = pool
    this.needsInk = needsInk
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
  getOrCreate(tile: AccumulationBuffer): RibbonTileScratch {
    let entry = this._tiles.get(tile)
    if (!entry) {
      // (#385) From the pool, and every one of them is fully written before it
      // is read — copyTo overwrites `original` outright, the others are
      // cleared — so a reused buffer carries nothing of whatever gesture had
      // it last.
      const original = this.pool.acquire(tile.width, tile.height)
      tile.copyTo(original)
      const coverage = this.pool.acquire(tile.width, tile.height)
      coverage.clear()
      let inkLoad: AccumulationBuffer | null = null
      if (this.needsInk) {
        inkLoad = this.pool.acquire(tile.width, tile.height)
        inkLoad.clear()
      }
      entry = { original, coverage, inkLoad }
      this._tiles.set(tile, entry)
    }
    return entry
  }

  /** Ends this gesture's use of its buffers. Named as it always was, and it
   *  still means "this scratch is finished with" — what changed (#385) is that
   *  the buffers go back to the pool instead of to the driver. */
  destroy(): void {
    for (const { original, coverage, inkLoad } of this._tiles.values()) {
      this.pool.release(original); this.pool.release(coverage)
      if (inkLoad) this.pool.release(inkLoad)
    }
    this._tiles.clear()
  }

  /** Context loss: the GL objects are already dead, so neither release nor
   *  destroy is meaningful — just let go of them. */
  forget(): void {
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
  // (#429) Sending half of the live stroke channel. Dabs painted since the
  // last packet went out, plus when that was and how many packets this gesture
  // has sent — all three reset at pen-down.
  private _onLiveStrokeDabs?: (packet: PeerLivePacket) => void
  private _onLiveStrokeEnd?: (strokeId: string) => void
  private _liveDabQueue: Dab[] = []
  private _liveLastEmitAt = 0
  private _livePacketSeq = 0

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
  // stroke's accumulated coverage — see RibbonStrokeScratch's own doc
  // comment). Non-null exactly while a *local* marker stroke is in
  // progress: created in _onStart, destroyed and nulled in _onEnd. A
  // one-shot full-array _paintRibbonDabs call (replay/undo/redo/checkpoint/
  // most peer ops) never touches this field at all — it creates and tears
  // down its own throwaway instance within that single call instead (see
  // _paintRibbonDabs' own doc comment).
  private _ribbonStrokeScratch: RibbonStrokeScratch | null = null
  /** (#385) Shared free list behind every RibbonStrokeScratch this engine
   *  builds — see RibbonScratchPool's own doc comment for why the marker path
   *  cannot allocate per gesture. Assigned in the constructor, right after
   *  `gl`. */
  private _ribbonScratchPool: RibbonScratchPool
  // The gesture this stroke belongs to (StrokeOperation.strokeId) — one id
  // from pen-down to pen-up, stamped on every chunk _flushStrokeChunk emits
  // along the way as well as on the final op.
  private _strokeId: string | null = null
  /** Replay-side counterpart of _ribbonStrokeScratch: keeps one gesture's
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
  private _replayRibbonChunk:
    | { strokeId: string; target: ILayerBuffer; scratch: RibbonStrokeScratch; lastDab: Dab }
    | null = null

  // Smudge's own carried imprint (#14; a raster texture per user since
  // #416 — see SMUDGE_TRANSFER_FRAG's own file comment for what replaced the
  // single carried scalar and why), keyed by userId — "the tool belongs to
  // whoever's holding it": two users smudging at the same time in the same
  // room must never share one imprint (an earlier, single-scalar version of
  // this field could get clobbered mid-stroke by a remote peer's own smudge
  // operation arriving through the same paint path).
  //
  // `buf` is the imprint itself: premultiplied RGBA covering the dab's own
  // patch square, always the same side length as the patch this stroke
  // copies (so it is pooled through _acquireSmudgeScratchBuf alongside the
  // patches themselves, and a stroke that changes brush size resamples it
  // through SMUDGE_PICKUP_FRAG's own normalized uv rather than needing a
  // separate resize path). Null means "not primed yet" — the next dab
  // copies the canvas under it wholesale instead of blending toward it, so
  // a stroke never starts by laying a faded ghost of nothing over the
  // canvas.
  //
  // `strokeId` is which gesture that imprint belongs to. A stump does not
  // carry an imprint between gestures the way the old scalar carried a
  // level: an imprint is *positional*, so re-using one across a pen-up
  // would stamp a ghost of the previous stroke's content wherever the next
  // one happens to start. Resetting at every gesture is also what makes a
  // recorded operation self-sufficient again — replay reproduces a smudge
  // stroke from its own dabs alone, with no cross-operation state to carry,
  // which is why StrokeOperation.smudgeLoadAtStart/End stopped being
  // written (see that field's own comment in packages/shared).
  private _smudgeImprints = new Map<string, { buf: AccumulationBuffer | null; strokeId: string | null }>()
  // The dab a replayed chunk should treat as its predecessor, per user: a
  // gesture long enough to be split across several operations (see
  // _flushStrokeChunk) must not restart its imprint at every chunk
  // boundary, and the later chunks arrive with no prevDab of their own.
  // Keyed by user (unlike marker's single _replayRibbonChunk slot) because
  // smudge state is per-user by construction — two peers' chunked strokes
  // interleaving in the log would otherwise each reset the other.
  private _smudgeReplayChunks = new Map<string, { strokeId: string; lastDab: Dab }>()

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
  // (#429) One entry per peer with a stroke currently under their pen — see
  // PeerLiveStroke. At most one per peer by construction: a person draws one
  // stroke at a time, and a packet carrying a new strokeId retires the old
  // entry.
  private _peerLiveStrokes = new Map<string, PeerLiveStroke>()

  // WebGL programs and uniforms — assigned in _initGL()
  private _dabProg!: WebGLProgram
  // Transparent-export variant of _dispProg (#15) — see DISPLAY_TRANSPARENT_
  // FRAG's comment for why this needs its own tiny program rather than a
  // branch inside DISPLAY_FRAG.
  private _dispTransparentProg!: WebGLProgram
  private _compositeProg!: WebGLProgram
  private _blitProg!: WebGLProgram
  private _transformProg!: WebGLProgram
  // Selection (#446) — the masked transform blit and the one-shader-two-blend-
  // modes mask pass (see AREA_TRANSFORM_FRAG/AREA_MASK_FRAG). Separate
  // programs rather than branches inside the existing transform blit: the
  // whole-layer path runs on every gizmo drag frame of every transform there
  // has ever been, and a mask sampler it never uses has no business in it.
  private _areaTransformProg!: WebGLProgram
  private _areaMaskProg!: WebGLProgram
  // Smudge (#14) — paired with the existing DAB_VERT (see SMUDGE_TRANSFER_
  // FRAG's own doc comment for why it never uses DAB_VERT_INSTANCED).
  private _smudgeProg!: WebGLProgram
  // The imprint-refresh pass (#416) — paired with DISPLAY_VERT (a plain
  // full-screen quad over the imprint texture; it needs no dab-quad
  // geometry, only the patch's own normalized square) rather than DAB_VERT.
  private _smudgePickupProg!: WebGLProgram
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
  private _dispTransparentUni!: Record<string, WebGLUniformLocation | null>
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _blitUni!: Record<string, WebGLUniformLocation | null>
  private _transformUni!: Record<string, WebGLUniformLocation | null>
  private _areaTransformUni!: Record<string, WebGLUniformLocation | null>
  private _areaMaskUni!: Record<string, WebGLUniformLocation | null>
  private _smudgeUni!: Record<string, WebGLUniformLocation | null>
  private _smudgePickupUni!: Record<string, WebGLUniformLocation | null>
  private _dabPosLoc!: number
  private _dispTransparentPosLoc!: number
  private _compositePosLoc!: number
  private _blitPosLoc!: number
  private _transformPosLoc!: number
  private _areaTransformPosLoc!: number
  private _areaMaskPosLoc!: number
  // Attribute locations are per-*program*, not per-shader-source — even
  // though _smudgeProg shares DAB_VERT's exact source with _dabProg, it's a
  // separately linked program, so 'a_position' can land at a different
  // location number in it and _dabPosLoc must not be reused here.
  private _smudgePosLoc!: number
  private _smudgePickupPosLoc!: number
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
  /** (#381) Layers whose rebuild was deferred by the current suspendDisplay
   *  batch — see _rebuildLayerOrDefer. Empty whenever the depth is 0. */
  private _pendingRebuilds = new Set<string>()

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
  // duplicate, structural undo/redo replay, context restore). Grep this file for
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
  // (#446) Which of those previews are *selection* previews. The distinction
  // matters exactly once, in _drawCompositeItem: a whole-layer preview is the
  // entire layer and replaces it, while a selection preview covers only the
  // tiles the selection passes through and the rest of the layer must keep
  // drawing from its real buffer. A Set rather than a field on PreviewTile
  // because it is a property of the gesture, not of any one tile.
  private _areaPreviewLayers = new Set<string>()
  // (#446) The one uploaded selection mask, cached by the identity of the
  // selection it was built from — see _acquireMask.
  private _maskCache: { selection: SelectionShape; mask: MaskTexture } | null = null

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
  // (#365) Whether _paperTex currently carries a mip chain, i.e. whether the
  // infinite-room display pass may switch to a mip filter for it. Re-decided
  // every time _paperTex is replaced (initial placeholder, real bake, context
  // restore) and never assumed — see generatePaperMipmaps for why a driver
  // can legitimately refuse.
  private _paperMipsReady = false

  // Infinite (tiled) canvas mode (#133 Phase 1) — see PencilEngineOptions.infinite.
  private readonly _infinite: boolean

  // Layer management
  private _layers: Map<string, ILayerBuffer>
  private _baseLayerIds: Set<string> // pre-log layers (background, initial layer)
  // (#374) layerId -> the room seq this layer's restored pixels reach. Written
  // only by restoreLayerFromSnapshot, read only by _isCoveredByRestore.
  private readonly _snapshotCoverage = new Map<string, number>()
  // (#373) Monotonic per-layer "the pixels changed" counter, and the value it
  // held when this layer's current pixels last became known to the server.
  // Equal means there is nothing new to send.
  //
  // A counter rather than a comparison of the log: undo changes pixels without
  // adding an operation, and "undid one, drew one" leaves every count in the
  // log exactly where it was. Bumped by `_markLayerDirty` from every path that
  // can change a layer's pixels — `index.snapshotDirty.test.ts` exists to hold
  // that list complete, since a path that forgets to bump produces a snapshot
  // that is silently stale rather than one that is obviously missing.
  private readonly _layerRevision = new Map<string, number>()
  private readonly _bakedRevision = new Map<string, number>()
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
  /** Arc length (world px) travelled by this stroke so far — brush pen only,
   *  for the head taper (#454). Reset in _onStart, advanced in
   *  _paintStrokeDabs; meaningless for every other tool, which never reads
   *  it. */
  private _strokeArcLen = 0
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

  // #409: the active tool's tilt→shape ramp shape, a user setting. Read at the
  // same two shapingForTool call sites _markerAngleRadians is, and for the same
  // reason: a profile swap partway through an in-progress stroke isn't
  // supported (DabSystem.setShaping), so a live change lands on the next
  // stroke. One value rather than one per tool — the caller pushes whichever
  // tool's setting is currently selected, exactly as it does for the preset
  // string.
  private _tiltResponse: TiltResponse = DEFAULT_TILT_RESPONSE

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
    // (#470) Centred on the sheet, not on the canvas: the canvas is the
    // viewport now and its centre is an arbitrary corner of the page. The
    // caller drives the camera from its own viewport state within a frame or
    // two, so this only decides what the very first frame shows — but a first
    // frame looking at the wrong place is a visible flash.
    this._infiniteCamera = options.infinite
      ? { wx: canvas.width / 2, wy: canvas.height / 2, zoom: 1, angle: 0 }
      : { wx: (options.pageWidth ?? canvas.width) / 2, wy: (options.pageHeight ?? canvas.height) / 2, zoom: 1, angle: 0 }

    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl
    this._ribbonScratchPool = new RibbonScratchPool(gl)

    this.canvas.addEventListener('webglcontextlost', this._handleContextLost)
    this.canvas.addEventListener('webglcontextrestored', this._handleContextRestored)

    this._opts = {
      deskColor:     options.deskColor     ?? DEFAULT_DESK_COLOR,
      pageWidth:     options.pageWidth,
      pageHeight:    options.pageHeight,
      paper:         options.paper         ?? 'coarse',
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
    this._onLiveStrokeDabs = options.onLiveStrokeDabs
    this._onLiveStrokeEnd = options.onLiveStrokeEnd
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
    this._paperMipsReady = generatePaperMipmaps(this.gl, this._paperTex)
    this._startPaperLoad(this._opts.paper)
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

  setPencilTilt(patch: Partial<PencilTiltConfig>): void {
    Object.assign(PENCIL_TILT, patch)
  }

  getPencilTilt(): PencilTiltConfig {
    return { ...PENCIL_TILT }
  }

  setSmudgeGrain(patch: Partial<SmudgeGrainConfig>): void {
    Object.assign(SMUDGE_GRAIN, patch)
  }

  getSmudgeGrain(): SmudgeGrainConfig {
    return { ...SMUDGE_GRAIN }
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
    if (this._displaySuspendDepth !== 0) return
    // (#381) Before the composite, not after: _display() reads the layer
    // buffers, and until these run they still hold whatever the batch's undos
    // left half-applied. See _rebuildLayerOrDefer.
    this._flushPendingRebuilds()
    this._display()
  }

  /** See PencilEngineAPI's doc comment. */
  paperReady(): Promise<void> { return this._paperReady }

  /** See PencilEngineAPI's doc comment. */
  retryPaper(): Promise<void> {
    // Not merely an optimization: re-running the load for a texture that is
    // already bound would swap a live texture out from under whatever is
    // mid-composite, to arrive at exactly the state it is already in.
    if (this._paperTexLoaded) return this._paperReady
    return this._startPaperLoad(this._opts.paper)
  }

  /** The one place `_paperReady` is assigned. Keeps a no-op handler attached
   *  to every attempt: the real consumers (Room's replay sites) await it,
   *  but they attach *later* — a creator's own await does not happen until a
   *  socket round-trip has completed — and a rejection with no handler yet
   *  attached is reported as an unhandled rejection, i.e. as a crash in
   *  Sentry rather than as the handled failure it is. The returned promise is
   *  the original, so every real caller still sees the rejection. */
  private _startPaperLoad(type: PaperType): Promise<void> {
    this._paperReady = this._initPaper(type)
    void this._paperReady.catch(() => {})
    return this._paperReady
  }

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
        // (#374) See the stroke branch: already in the restored pixels, so
        // re-applying it would wipe content the snapshot took *after* this
        // clear happened.
        if (clearBuf && this._isCoveredByRestore(op.layerId, op.seq)) {
          this._log.revoke(op.id)
          break
        }
        if (clearBuf) {
          clearBuf.clear()
          this._markLayerDirty(op.layerId)
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
        // (#374) A merge that a restored snapshot already accounts for still
        // has to happen structurally — the result layer exists, its sources
        // do not — but must not composite anything: the result's pixels came
        // back from the snapshot, and `_execMergeLive` would replace that
        // buffer with a freshly composited one, discarding them.
        if (this._isCoveredByRestore(op.layerId, op.seq)) this._execMergeStructuralOnly(op)
        else this._execMergeLive(op)
        break
      case 'layer_duplicate':
        // (#449) Same two-way split as layer_merge above and for the same
        // reason: the copy's pixels can already have come back from a restored
        // snapshot, and re-copying the source over them would be wrong twice —
        // it discards whatever was painted on the copy after the duplicate, and
        // the source itself has moved on since.
        if (this._isCoveredByRestore(op.layerId, op.seq)) this._execDuplicateStructuralOnly(op)
        else this._execDuplicateLive(op)
        break
      case 'stroke': {
        const buf = this._layers.get(op.layerId)
        // (#374) Already in the restored pixels. The server withholds these,
        // so arriving at all means the two disagreed — a snapshot landing
        // between this client's room_state and its snapshot fetch is enough.
        // Revoked rather than merely not painted: an operation left `done` in
        // the log would be replayed on top of the pinned snapshot checkpoint
        // the next time this layer rebuilds, which is the same double-paint
        // one step later. Same treatment, and same reasoning, as a pixel op
        // whose target no longer exists.
        if (buf && this._isCoveredByRestore(op.layerId, op.seq)) {
          this._log.revoke(op.id)
          break
        }
        if (buf) {
          // Smudge (#416) needs no seeding here anymore: an operation is
          // self-sufficient again, because the imprint the tool carries is
          // reset at every gesture boundary and rebuilt from this op's own
          // dabs (see _smudgeResumeGesture, and
          // StrokeOperation.smudgeLoadAtStart's own comment for what the
          // scalar it replaced had to carry across operations).
          //
          // (#429) …except for the part of this operation this client already
          // painted from the author's live stream, which is skipped here. Not
          // an optimisation: dab painting accumulates, so painting the same
          // dabs a second time makes the mark visibly darker than the author's
          // own. This is the peer-side counterpart of the author never
          // repainting their own operation when it loops back confirmed.
          const allDabs = strokeDabs(op)
          const skip = this._claimLivePaintedDabs(op, allDabs.length)
          const dabs = skip ? allDabs.slice(skip) : allDabs
          if (dabs.length) {
            this._paintDabs(buf, dabs, op.tool, op.preset, op.color, op.userId, undefined, undefined, op.strokeId)
          }
          this._markLayerDirty(op.layerId)
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
        // (#374) See the stroke branch.
        if (buf && this._isCoveredByRestore(op.layerId, op.seq)) {
          this._log.revoke(op.id)
          break
        }
        if (buf) {
          this._markLayerDirty(op.layerId)
          // (#398) The image is already decoded on every replay path (see
          // preloadImages) — paint it here and now, so the operations after
          // it in this same loop see the pixels they were recorded against.
          if (this._paintDecodedImage(buf, op)) {
            this._maybeCheckpoint(op.layerId)
          } else {
            this._paintImage(buf, op)
              .then(() => { this._settleLateImage(op); this._maybeCheckpoint(op.layerId) })
              .catch(err => console.error('failed to paint imported image', err))
          }
        } else {
          this._log.revoke(op.id)
        }
        break
      }
      // (#446) The three selection operations. Each targets exactly one layer
      // and paints nothing else, so they follow stroke/image_import's shape
      // exactly: covered by a restore means already in the restored pixels
      // (skip), no live target means it can never take effect again (revoke).
      case 'area_transform':
      case 'area_clear': {
        const buf = this._layers.get(op.layerId)
        if (!buf) { this._log.revoke(op.id); break }
        if (this._isCoveredByRestore(op.layerId, op.seq)) { this._log.revoke(op.id); break }
        if (op.type === 'area_transform') this._bakeAreaTransform(buf, op.selection, op.matrix)
        else this._clearArea(buf, op.selection)
        this._markLayerDirty(op.layerId)
        this._maybeCheckpoint(op.layerId)
        if (op.layerId !== this._activeId) this._invalidateSplitCache()
        this._displayIfNotSuspended()
        break
      }
      // (#453) A fill is a paste of a raster it computed itself: same
      // straight-alpha PNG, same world rect, same decode-and-blit. Its own
      // parameters (seed, tolerance, gap closing) are recorded but never read
      // here — replaying them would mean re-deriving the region from this
      // device's pixels, which is the one thing the raster exists to avoid.
      case 'area_paste':
      case 'area_fill': {
        const buf = this._layers.get(op.layerId)
        if (!buf) { this._log.revoke(op.id); break }
        if (this._isCoveredByRestore(op.layerId, op.seq)) { this._log.revoke(op.id); break }
        this._markLayerDirty(op.layerId)
        const record = this._asImportRecord(op)
        const matrix = op.type === 'area_paste' ? op.matrix : undefined
        // Same decoded/late split as image_import above — see #398. A local
        // paste is always already decoded (the clipboard raster came from this
        // very engine); a peer's arrives cold and takes the async path.
        if (this._paintDecodedImage(buf, record, matrix)) {
          this._maybeCheckpoint(op.layerId)
        } else {
          this._paintImage(buf, record, matrix)
            .then(() => { this._settleLateImage(record); this._maybeCheckpoint(op.layerId) })
            .catch(err => console.error('failed to paint pasted image', err))
        }
        if (op.layerId !== this._activeId) this._invalidateSplitCache()
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
          // (#374) Per entry, because coverage is per layer: one transform can
          // name a layer restored past it and another that wasn't, and baking
          // the matrix again into the first would move content that already
          // moved. Counts as applied either way — the operation did take
          // effect on this layer, just earlier, and revoking it here would
          // make a later undo unable to take it back off the layers it
          // genuinely still applies to.
          if (this._isCoveredByRestore(t.layerId, op.seq)) { appliedAny = true; continue }
          this._bakeTransform(buf, t.matrix)
          this._markLayerDirty(t.layerId)
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
   *  Direction matters here, not just op type: undoing layer_add/layer_merge/
   *  layer_duplicate removes the layer they created, but undoing layer_delete
   *  only ever
   *  *restores* one — never destructive, regardless of what's on it.
   *  Symmetrically for redo: redoing layer_delete removes the layer(s)
   *  again, but redoing layer_add only ever re-creates. layer_merge redo is
   *  its own case — it re-consumes `sources`, not `layerId` (the merge
   *  *result*, which redo is simply re-creating, same as layer_add); the
   *  content actually at risk is whatever's been repainted onto a source
   *  layer while the merge sat undone. Getting this backwards would show a
   *  "this will remove content" warning on a redo that's actually
   *  *restoring* the very content #263 exists to protect.
   *
   *  (#449) layer_duplicate sits with layer_add on both sides, not with
   *  layer_merge: undoing one removes the copy (which anyone may have painted
   *  on since), redoing one only ever re-creates it. Its `sourceId` never
   *  appears here in either direction — the source is not touched by the
   *  duplicate existing, so neither direction puts it at risk. */
  private _peekStructuralTarget(target: Operation | null, direction: 'undo' | 'redo'): StructuralUndoRedoPeek | null {
    if (!target) return null
    let layerIds: string[]
    if (direction === 'undo') {
      switch (target.type) {
        case 'layer_add':
        case 'layer_merge':
        case 'layer_duplicate':
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
    this._startPaperLoad(type)
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

  /** See PencilEngineAPI's doc comment. Next stroke only, same as the marker
   *  angle above. */
  setTiltResponse(response: TiltResponse): void { this._tiltResponse = response }

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
    // (#470) The arguments are world units (canvas pixels for a bounded room,
    // which used to be the same thing as screen pixels and is not any more).
    // The screen is what holds the composited colour, so the point has to be
    // taken through the camera first; reading it as a screen pixel picked
    // whatever happened to be at that spot in the window — the desk, usually.
    if (!this._infinite) {
      const { w: pageW, h: pageH } = this._pageSize()
      if (canvasX < 0 || canvasY < 0 || canvasX >= pageW || canvasY >= pageH) return null
    }
    const [sx, sy] = applyMatrix(invertMatrix(this._screenToWorldMatrix()), canvasX, canvasY)
    const x = Math.round(sx)
    const y = Math.round(sy)
    // Off-screen is unreadable rather than wrong: the colour lives in the
    // framebuffer, and a point the camera is not currently looking at has no
    // pixel to sample. Callers already handle null (a pick that misses).
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
    const pixel = new Uint8Array(4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    // WebGL reads bottom-up; screen coords here are top-down like the rest of
    // the app.
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
   *  GPU readback at all.
   *
   *  (#421) That tracker only ever grows, and a transform bake feeds it the
   *  axis-aligned box of rotated content, so this drifts wider across
   *  repeated rotations until something re-derives it from pixels — see
   *  tightenContentBounds, which the transform gizmo calls before reading
   *  this. */
  getContentBounds(layerId: string): { x: number; y: number; width: number; height: number } | null {
    const layerBuf = this._layers.get(layerId)
    if (!layerBuf) return null
    const rect = layerBuf.getContentBoundsWorld()
    if (!rect) return null
    return { x: rect.minX, y: rect.minY, width: rect.maxX - rect.minX, height: rect.maxY - rect.minY }
  }

  /** (#421) See ILayerBuffer.tightenContentRects — this is the public door
   *  to it, and the transform gizmo is its only caller. Deliberately not
   *  folded into getContentBounds (which every export/fit-to-content path
   *  also calls, per frame in some of them) nor into _bakeTransform (which
   *  runs on every peer's transform during replay): both would put a
   *  synchronous GPU readback somewhere it must not be. A missing layer is a
   *  no-op, same as getContentBounds returning null for one. */
  tightenContentBounds(layerId: string): void {
    this._layers.get(layerId)?.tightenContentRects()
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

  /** Pixel size for _belowCache/_aboveCache/_assemblyFBO: a square padded to
   *  the canvas's own half-diagonal, big enough that any camera rotation
   *  still finds the whole screen covered once _finishInfiniteComposite
   *  crops/rotates it back down to the real canvas size.
   *
   *  (#470) The same for both kinds of room now. A bounded room used to size
   *  these to its *sheet*, because its canvas element was the sheet and the
   *  browser did the panning with a CSS transform — so every buffer here grew
   *  with the paper rather than with the screen. On a 4096x4096 sheet that was
   *  four full-sheet buffers, 256 MiB, allocated before a single stroke, and
   *  it killed the tab on an iPad. Now the sheet is a rectangle in the world
   *  and these are all screen-sized, so the cost of a big sheet is nothing. */
  private _renderBufferExtent(): { w: number; h: number } {
    const { canvas } = this
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
   *  — so there's nothing to pad).
   *
   *  (#470) That last sentence stopped being true when bounded rooms started
   *  rendering through the camera: their extent is the same padded square now,
   *  so they pad exactly like an infinite room and the early return that used
   *  to sit here would have put every bounded frame half a buffer off. */
  private _assemblyPad(): { padX: number; padY: number } {
    const { canvas } = this
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
  previewLayerTransform(transforms: Array<{ layerId: string; matrix: LayerTransformMatrix }>): void {
    for (const { layerId, matrix: wireMatrix } of transforms) {
      // (#392) The one widening, at the boundary — see LayerTransformMatrix's
      // docstring in packages/shared for why no consumer branches on length.
      const matrix = toHomography(wireMatrix)
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
          const [tx, ty] = applyMatrix(matrix, x, y)
          minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
          minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
          sMinX = Math.min(sMinX, tx); sMaxX = Math.max(sMaxX, tx)
          sMinY = Math.min(sMinY, ty); sMaxY = Math.max(sMaxY, ty)
        }
        srcRects.push({ minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY })
      }

      if (maxX <= minX || maxY <= minY || !Number.isFinite(minX + minY + maxX + maxY)) {
        // Degenerate (zero-scale transform, or every source tile empty) —
        // content collapses to nothing, same as _bakeTransform's own
        // degenerate-transform branch. The finiteness half is (#392): a
        // homography sends the vanishing line to infinity, so a corner landing
        // on it makes these bounds Infinity/NaN, and an infinite rect handed
        // to tilesOverlappingRect below is not a wrong picture but a hang.
        // Room never builds such a matrix (isFrameInFront), so this only
        // guards a replayed op from somewhere else.
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

      const matrixInv = invertMatrix(matrix)
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
          const mc = composeMatrix(toSrcLocal, composeMatrix(matrixInv, toWorld))
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
    this._areaPreviewLayers.clear()
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
    state.queue.push({ op, rate, dabs: strokeDabs(op) })
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

  /** See PencilEngineAPI's doc comment. */
  appendPeerLiveDabs(peerId: string, packet: PeerLivePacket): void {
    const key = liveStrokeKey(peerId, packet.strokeId)
    let live = this._peerLiveStrokes.get(key)
    if (!live) {
      this._pruneLiveGestures(peerId)
      // Mid-gesture arrival (this client joined, or resynced, while someone
      // was already drawing) starts desynced on purpose: the dabs before this
      // packet were never painted here, so the counters would claim ink that
      // is not on the layer and the operations would then skip painting it.
      // Better to let this gesture arrive the old way, whole, and stream the
      // next one.
      live = {
        peerId, strokeId: packet.strokeId, layerId: packet.layerId,
        paintedTotal: 0, liveOffset: 0, committedOffset: 0, nextPacketSeq: 0,
        desynced: packet.packetSeq !== 0, ended: false,
      }
      this._peerLiveStrokes.set(key, live)
    }
    if (live.desynced) return
    if (packet.packetSeq !== live.nextPacketSeq) { live.desynced = true; return }
    live.nextPacketSeq++

    const buf = this._layers.get(packet.layerId)
    // No such layer here yet (their layer_add hasn't been applied, or it was
    // deleted): drop the packet and stop trusting the stream for this gesture
    // rather than silently losing dabs the watermark would still count.
    if (!buf) { live.desynced = true; return }

    // This packet's dabs sit at [liveOffset, liveOffset + n) in the gesture.
    // Anything below paintedTotal is already on the layer — put there by a
    // chunk operation that overtook the stream, which happens routinely: the
    // first operation of a long gesture carries a full STROKE_DAB_CHUNK_LIMIT
    // and lands mid-stroke. Painting those again would darken exactly the
    // stretch where the two sources overlap.
    const skip = Math.min(Math.max(0, live.paintedTotal - live.liveOffset), packet.dabs.length)
    const dabs = skip ? packet.dabs.slice(skip) : packet.dabs
    live.liveOffset += packet.dabs.length
    if (!dabs.length) return
    live.paintedTotal = Math.max(live.paintedTotal, live.liveOffset)

    // `strokeId` is what makes marker and smudge continuous across packets —
    // the same argument a chunked replay passes, reaching the same
    // _replayChunkScratch / _smudgeResumeGesture bookkeeping. `prevDab` is
    // deliberately left undefined for the same reason it is on the replay
    // path: both tools recover it from their own gesture state, and passing a
    // second, independently-tracked copy is how the two get to disagree.
    this._paintDabs(
      buf, dabs, packet.tool, packet.preset, packet.color, peerId,
      undefined, undefined, packet.strokeId,
    )
    this._markLayerDirty(packet.layerId)
    if (packet.layerId !== this._activeId) this._invalidateSplitCache()
    this._displayIfNotSuspended()
  }

  /** See PencilEngineAPI's doc comment. */
  endPeerLiveStroke(peerId: string, strokeId?: string): number {
    // With `strokeId`, exactly the gesture whose pen came up. Without it (a
    // peer leaving), every gesture of theirs that is still open.
    const entries = strokeId
      ? [this._peerLiveStrokes.get(liveStrokeKey(peerId, strokeId))].filter((e): e is PeerLiveStroke => !!e)
      : [...this._peerLiveStrokes.values()].filter(e => e.peerId === peerId)
    let outstanding = 0
    for (const live of entries) {
      live.ended = true
      const owed = Math.max(0, live.paintedTotal - live.committedOffset)
      outstanding += owed
      // Kept, not deleted, while operations are still owed: the operation that
      // records the end of a gesture is dispatched at pen-up and arrives after
      // this does, and it still has to be able to recognise what was already
      // painted. Once the operations have caught up, the entry has no job left.
      if (owed === 0) this._peerLiveStrokes.delete(liveStrokeKey(live.peerId, live.strokeId))
    }
    return outstanding
  }

  /** Drops this peer's settled gestures, and — only if something pathological
   *  has left entries that will never settle — the oldest of what remains.
   *  Map iteration is insertion-ordered, so "oldest" needs no timestamp. */
  private _pruneLiveGestures(peerId: string): void {
    const mine = [...this._peerLiveStrokes.entries()].filter(([, v]) => v.peerId === peerId)
    for (const [k, v] of mine) {
      if (v.ended && v.committedOffset >= v.paintedTotal) this._peerLiveStrokes.delete(k)
    }
    const left = mine.filter(([k]) => this._peerLiveStrokes.has(k))
    for (let i = 0; i < left.length - MAX_LIVE_GESTURES_PER_PEER; i++) {
      this._peerLiveStrokes.delete(left[i][0])
    }
  }

  /** See PencilEngineAPI's doc comment. */
  resetPeerLiveStrokes(): void {
    this._peerLiveStrokes.clear()
  }

  /** (#429) How many of an arriving stroke operation's dabs are already on the
   *  layer because this client painted them live, and advances that gesture's
   *  claim by the operation's own length. Returns 0 whenever the live path
   *  isn't involved, which is every stroke in a room where nobody is streaming
   *  — including this client's own, since it never streams to itself. */
  private _claimLivePaintedDabs(op: StrokeOperation, dabCount: number): number {
    if (!op.strokeId) return 0
    const live = this._peerLiveStrokes.get(liveStrokeKey(op.userId, op.strokeId))
    // Deliberately still claims for a desynced gesture. `desynced` stops
    // *further* live painting, and painting stops at the first missing packet
    // rather than skipping it, so `paintedTotal` always describes a contiguous
    // prefix of the gesture. Ignoring it because the stream later broke would
    // repaint that prefix on top of itself and leave the first part of the
    // mark darker than the rest.
    if (!live) return 0
    // Mirror image of the live path: this operation's dabs sit at
    // [committedOffset, committedOffset + dabCount), and whatever of that is
    // below paintedTotal is already drawn.
    const skip = Math.min(Math.max(0, live.paintedTotal - live.committedOffset), dabCount)
    live.committedOffset += dabCount
    live.paintedTotal = Math.max(live.paintedTotal, live.committedOffset)
    if (live.ended && live.committedOffset >= live.paintedTotal) {
      this._peerLiveStrokes.delete(liveStrokeKey(op.userId, op.strokeId))
    }
    return skip
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
    const { op, rate, dabs } = head

    const elapsed = (performance.now() - state.startTime) * rate
    const due: Dab[] = []
    while (state.dabIdx < dabs.length && dabs[state.dabIdx].t <= elapsed) {
      due.push(dabs[state.dabIdx])
      state.dabIdx++
    }
    if (due.length) {
      // #138: translated into this peer's buffer's own local space (see
      // _cameraCenteredOrigin/_translateDabs) — a no-op for bounded rooms.
      this._paintDabs(state.buf, this._translateDabs(due, state.origin), op.tool, op.preset, op.color, op.userId)
      this._display()
    }

    if (state.dabIdx >= dabs.length) {
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
    // (#470) Both kinds of room render offscreen now. A bounded room used to
    // export by calling _display() and grabbing canvas.toBlob(), which was
    // exact only because its canvas *was* the sheet at 1:1; the canvas is the
    // viewport now, so that would export whatever happened to be on screen,
    // at whatever zoom, with the desk around it. The sheet's own rect through
    // the offscreen path gives back exactly the old image.
    const rect = this._infinite ? null : (() => {
      const { w, h } = this._pageSize()
      return { x: 0, y: 0, width: w, height: h }
    })()
    return this._exportOffscreenPNG(transparent, rect)
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
    // (#385) These two hand their buffers back to the pool rather than to the
    // driver, so the pool has to be drained *after* them — draining first
    // would leave exactly the buffers they are still holding behind.
    this._ribbonStrokeScratch?.destroy()
    this._ribbonStrokeScratch = null
    this._strokeId = null
    this._replayRibbonChunk?.scratch.destroy()
    this._replayRibbonChunk = null
    this._ribbonScratchPool.destroy()
    // A live imprint's buffer was spliced *out* of the scratch pool drained
    // above and is held only here, so it needs destroying on its own.
    for (const imprint of this._smudgeImprints.values()) imprint.buf?.destroy()
    this._smudgeImprints.clear()
    this._smudgeReplayChunks.clear()
    for (const { buf, timer } of this._peerPreviews.values()) {
      if (timer !== null) clearTimeout(timer)
      buf.destroy()
    }
    this._peerPreviews.clear()
    this._peerLiveStrokes.clear()
    for (const tiles of this._transformPreview.values()) {
      for (const { buffer } of tiles) buffer.destroy()
    }
    this._transformPreview.clear()
    this._areaPreviewLayers.clear()
    this._checkpoints = []
    this._checkpointBytes = 0
    // (#381) Nothing left to rebuild into — the buffers are gone.
    this._pendingRebuilds.clear()
  }

  // ─── History / replay ────────────────────────────────────────────────────────

  /** Re-syncs pixel state after `op` flipped between done and undone/gone. */
  private _applyHistoryChange(op: Operation): void {
    switch (op.type) {
      case 'stroke':
      case 'layer_clear':
      // (#446) Single-layer pixel operations, same as the two above: undoing
      // or redoing one means replaying its layer's history without (or with)
      // it. Nothing here can be derived from the operation's own effect —
      // erasing a region cannot be inverted in place, only replayed away.
      case 'area_transform':
      case 'area_clear':
      case 'area_paste':
      case 'area_fill':
        this._rebuildLayerOrDefer(op.layerId)
        break
      case 'layer_add':
      case 'layer_delete':
      case 'layer_merge':
      case 'layer_duplicate':
        // Deliberately *not* deferred, unlike the pixel cases above: this one
        // creates and destroys buffers, and appendOperation silently skips any
        // op whose target layer has no buffer (see its own doc comment). Defer
        // it and the very next stroke in the batch can land on a layer that
        // does not exist yet and be dropped for good. It is also the cheap
        // case — 31 of these in a 2001-operation room measured 1 ms in total.
        this._syncBuffersToLog()
        break
      case 'layer_transform':
        for (const t of op.transforms) this._rebuildLayerOrDefer(t.layerId)
        break
      default:
        // structure-only; the UI re-derives LayerState and pushes composite order
        break
    }
    this._displayIfNotSuspended()
  }

  /** (#381) A layer rebuild is a full replay of that layer's done pixel ops
   *  from its best checkpoint. One at a time, interactively, that is the
   *  intended cost. Inside a suspendDisplay batch it is the wrong cost
   *  entirely: every `operation_undo` in a replayed history triggers one, each
   *  replaying more of the history than the last, and every one of them is
   *  thrown away by the next.
   *
   *  Measured on a real room (729 operations, 146 889 dabs, A3): 72 undos cost
   *  2541 ms of the join's 3418 ms — 74% of the whole replay, against 875 ms
   *  for painting all 146 889 dabs once. The last few undos cost over 330 ms
   *  each on their own.
   *
   *  So inside a batch the rebuild is recorded and run once per layer at
   *  resumeDisplay instead. Correctness comes from what a rebuild *is*: it
   *  replays the layer's done ops from scratch, so its result depends only on
   *  the log's final done/undone state, never on how many times it ran on the
   *  way there. The intermediate buffer contents are wrong until the flush —
   *  which is exactly what suspendDisplay already promises about the composite,
   *  and why _takeCheckpoint refuses to run against a layer with a rebuild
   *  still pending. */
  private _rebuildLayerOrDefer(layerId: string): void {
    if (this._displaySuspendDepth === 0) { this._rebuildLayer(layerId); return }
    this._pendingRebuilds.add(layerId)
  }

  /** Runs the rebuilds `_rebuildLayerOrDefer` recorded during a batch. Called
   *  from resumeDisplay *before* its own _display(), so the composite it paints
   *  is of settled buffers. */
  private _flushPendingRebuilds(): void {
    if (this._pendingRebuilds.size === 0) return
    const pending = [...this._pendingRebuilds]
    // Cleared first: _rebuildLayer runs with the depth already back at 0, and
    // nothing it calls should be able to re-enter this set and rebuild twice.
    this._pendingRebuilds.clear()
    for (const layerId of pending) this._rebuildLayer(layerId)
  }

  /** A buffer should exist iff the layer is alive in the done history: created
   *  (base init or a done layer_add/layer_merge/layer_duplicate) and not
   *  destroyed (listed in a done layer_delete or consumed as a done merge
   *  source). Ids are never reused, so no ordering analysis is needed. */
  private _syncBuffersToLog(): void {
    // #122: called for undo/redo/revoke of layer_add/layer_delete/
    // layer_merge/layer_duplicate and from context restore — both can create/destroy an
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
        // (#449) Creates, destroys nothing — `sourceId` is read, not consumed.
        case 'layer_duplicate':
          created.add(op.layerId)
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
    // (#373) The single choke point for undo/redo/revoke reaching pixels —
    // the case a comparison of log counts cannot see, since undoing one
    // operation and drawing another leaves every count where it was.
    this._markLayerDirty(layerId)
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
        // Smudge (#416): nothing to seed — see appendOperation's own stroke
        // case for why replay/undo/redo is deterministic from the op's own
        // dabs alone now.
        this._paintDabs(buf, strokeDabs(op), op.tool, op.preset, op.color, op.userId, undefined, undefined, op.strokeId)
        break
      case 'layer_clear':
        buf.clear()
        break
      case 'layer_merge':
        this._replayMergeInto(buf, op)
        break
      case 'layer_duplicate':
        this._replayDuplicateInto(buf, op)
        break
      case 'image_import':
        // (#398) Same as appendOperation's own branch, minus the late-arrival
        // repair: this one can be replaying into a throwaway scratch buffer
        // (see _replayMergeInto), which has no layer to rebuild. Every replay
        // that matters here reaches this with the image already decoded —
        // preloadImages on the join/reconnect paths, and the cache entry the
        // first paint left behind for undo/redo's later rebuilds.
        if (!this._paintDecodedImage(buf, op)) {
          this._paintImage(buf, op).catch(err => console.error('failed to paint imported image', err))
        }
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
      // (#446) `buf` is this operation's own layer by construction here (the
      // caller filters the log per layer), so unlike layer_transform there is
      // no entry to pick out.
      case 'area_transform':
        this._bakeAreaTransform(buf, op.selection, op.matrix)
        break
      case 'area_clear':
        this._clearArea(buf, op.selection)
        break
      case 'area_paste':
      case 'area_fill': {
        const record = this._asImportRecord(op)
        const matrix = op.type === 'area_paste' ? op.matrix : undefined
        // Same as image_import's own branch: a rebuild reaches this with the
        // raster already decoded in almost every case, and falls back to the
        // async path rather than dropping the paste when it doesn't.
        if (!this._paintDecodedImage(buf, record, matrix)) {
          this._paintImage(buf, record, matrix)
            .catch(err => console.error('failed to paint pasted image', err))
        }
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
    // (#365) The coarse level is for infinite rooms only, and only for real
    // layers: a bounded room never minifies its buffers (the browser scales
    // its canvas element instead), and a scratch instance is read once and
    // discarded, so neither has anything to gain from one.
    const downsample = this._infinite && layerId !== undefined
      ? (src: AccumulationBuffer, dst: AccumulationBuffer, x: number, y: number, w2: number, h2: number) =>
        this._downsampleTileInto(src, dst, x, y, w2, h2)
      : undefined
    return new TiledLayerBuffer(
      this.gl, w, h,
      layerId !== undefined ? this._makeTileRebuilder(layerId) : undefined,
      undefined, downsample,
    )
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
   *  do and must agree with them on tile size.
   *
   *  (#469) The same square TILE_SIZE for both kinds of room now. It used to
   *  hand a bounded room its whole page as a single tile, which was tidy —
   *  one tile, byte-identical indexing to the pre-#142 single buffer — and
   *  turned out to be what made big pages impossible on a tablet: one texture
   *  of canvas.width x canvas.height per layer, allocated whole whether or not
   *  anything was ever drawn on it. A2 — the largest preset, 2480x3508 — is
   *  33 MiB a layer, and a custom 4096x4096 is 64 MiB, so an iPad's tab was
   *  killed by the system before a stroke was drawn. Every readback of such a
   *  tile (a snapshot bake, tightenContentRects) allocated another one that
   *  size in JS on top.
   *
   *  Tiles a page no longer fills exactly do cost some padding — a 2480x3508
   *  page covers a 3x4 grid of 1024 tiles, 48 MiB if every one of them is
   *  painted, against the old 33 MiB. That trade is worth taking twice over:
   *  a tile is only created when something paints into it, so an untouched
   *  layer now costs nothing at all instead of a full page, and residency is
   *  finally bounded by TILE_BUDGET_BYTES rather than being one tile that no
   *  budget could ever evict.
   *
   *  Capped at the page rather than fixed at TILE_SIZE, so a page *smaller*
   *  than a tile keeps exactly the shape it had before this change: one tile,
   *  page-sized, no padding. Rounding a 64x64 page up to a 1024 tile would
   *  turn 16 KiB into 4 MiB and make the small case pay for the large one's
   *  fix. Only a page bigger than TILE_SIZE on an axis is subdivided along
   *  it, which is precisely the case that was breaking.
   *
   *  (#470) Capped against the *page*, not the canvas — and that distinction
   *  only came into existence with viewport rendering. While the canvas was
   *  the sheet the two were the same number; once it became the viewport,
   *  reading it here sized every tile to whatever the window happened to be
   *  when the layer was created (300x150, the element's default, if the
   *  layer was built before the first resize landed). Storage geometry must
   *  not depend on the size of the window looking at it. */
  private _tileSize(): { w: number; h: number } {
    if (this._infinite) return { w: TILE_SIZE, h: TILE_SIZE }
    const { w, h } = this._pageSize()
    return { w: Math.min(TILE_SIZE, w), h: Math.min(TILE_SIZE, h) }
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

  /** (#449) Replays a duplicate: rebuilds the source as it was just before the
   *  duplicate (done ops with lower seq) into a temp buffer and copies it in.
   *  Recursive when the source is itself a merge or duplicate result.
   *
   *  Composited at 1, not at the source's opacity: the copy carries that
   *  opacity as its own layer property (see applyContentOp's layer_duplicate
   *  case), so applying it to the pixels as well would show it twice — a copy
   *  of a 50% layer would land at 25%. This is the one place a duplicate
   *  deliberately differs from a merge, which has no layer of its own left to
   *  hold the source opacities and must bake them. */
  private _replayDuplicateInto(buf: ILayerBuffer, op: LayerDuplicateOperation): void {
    buf.clear()
    const temp = this._makeLayerBuffer()
    this._replayInto(temp, op.sourceId, this._log.layerPixelOps(op.sourceId, op.seq))
    this._compositeLayerInto(temp, buf, 1)
    temp.destroy()
  }

  /** (#374) The structural half of a merge, for one whose pixel result a
   *  restored snapshot already holds.
   *
   *  Deliberately keeps the existing target buffer rather than making a new
   *  one: that buffer is what `restoreLayerFromSnapshot` filled, and it is the
   *  merge's result, arrived by a shorter route. Sources still have to go —
   *  a merge consumes them, and leaving them alive would show every merged
   *  layer twice, once inside the result and once beside it.
   *
   *  No checkpoint is taken: the restore already pinned one holding exactly
   *  these pixels. */
  private _execMergeStructuralOnly(op: LayerMergeOperation): void {
    this._invalidateSplitCache()
    if (!this._layers.has(op.layerId)) this._createBuffer(op.layerId)
    for (const s of op.sources) this._destroyBuffer(s.id)
    this._displayIfNotSuspended()
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
    this._markLayerDirty(op.layerId)
    for (const s of op.sources) this._destroyBuffer(s.id)
    this._takeCheckpoint(op.layerId)
    this._displayIfNotSuspended()
  }

  /** (#449) The structural half of a duplicate whose pixel result a restored
   *  snapshot already holds — the copy is a layer in its own right by then,
   *  restored like any other, so there is nothing left to copy into it.
   *
   *  Shorter than its merge counterpart because a duplicate consumes nothing:
   *  no sources to destroy, and the source layer is meant to still be there. */
  private _execDuplicateStructuralOnly(op: LayerDuplicateOperation): void {
    this._invalidateSplitCache()
    if (!this._layers.has(op.layerId)) this._createBuffer(op.layerId)
    this._displayIfNotSuspended()
  }

  /** Live duplicate fast path, the counterpart of _execMergeLive: the source's
   *  buffer already holds replay state, so copy it directly instead of
   *  rebuilding its whole history into a scratch buffer.
   *
   *  A missing source buffer produces an empty copy rather than a refusal.
   *  Operations apply in true seq order, and the server rejects a duplicate
   *  naming a dead id (rooms.ts's getOperationRejectReason), so the only way to
   *  reach that is a source this client has not built yet — the same condition
   *  every other pixel branch here treats as "skip, the log is the truth" (see
   *  appendOperation's own doc comment).
   *
   *  The immediate checkpoint matters more here than it does for a merge: a
   *  duplicate's replay is a full from-scratch rebuild of *another* layer's
   *  entire history into a temp buffer, which the checkpoint spares every
   *  later undo above this one. */
  private _execDuplicateLive(op: LayerDuplicateOperation): void {
    this._invalidateSplitCache()
    const target = this._makeLayerBuffer(op.layerId)
    target.clear()
    const source = this._layers.get(op.sourceId)
    // Opacity 1 — see _replayDuplicateInto for why the source's own opacity
    // must not be baked into the pixels here.
    if (source) this._compositeLayerInto(source, target, 1)
    this._layers.set(op.layerId, target)
    this._markLayerDirty(op.layerId)
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
    this._paperMipsReady = generatePaperMipmaps(this.gl, this._paperTex)
    this._paperTexLoaded = false
    this._startPaperLoad(this._opts.paper)
    this._layers.clear() // handles are already dead; not worth destroy()ing
    this._previewBuf = null
    this._previewBufPool = null // (#155) pooled GL object is dead too, not worth destroy()ing
    this._tipBuf = null
    this._tipBufPool = null
    this._transformScratchPool = [] // (#155) pooled GL objects are dead too, not worth destroy()ing
    this._smudgeScratchPool = [] // same reasoning, see #14
    this._ribbonStrokeScratch?.forget() // same reasoning — pooled GL objects are dead too
    this._ribbonStrokeScratch = null
    this._replayRibbonChunk?.scratch.forget()
    this._replayRibbonChunk = null
    // (#385) Dropped, not released: releasing would put dead handles back in
    // the pool for the next gesture to paint through.
    this._ribbonScratchPool.forget()
    this._smudgeImprints.clear() // same reasoning — pooled GL objects are dead too
    this._smudgeReplayChunks.clear()
    for (const { timer } of this._peerPreviews.values()) {
      if (timer !== null) clearTimeout(timer)
    }
    this._peerPreviews.clear()
    this._peerLiveStrokes.clear()
    this._transformPreview.clear() // handles dead too; a mid-drag gizmo just loses its live preview
    this._areaPreviewLayers.clear()
    // (#446) The mask texture died with the context. Dropping the cache entry
    // rather than deleting the texture is the point: deleting a name from a
    // lost context is meaningless, and *keeping* the entry would hand the
    // first selection gesture after the restore a texture that no longer
    // exists.
    this._maskCache = null
    // (#381) _syncBuffersToLog below replays every live layer from the log
    // outright, which is strictly more than any deferred rebuild was going to
    // do — keeping them queued would just repeat that work at the next resume.
    this._pendingRebuilds.clear()
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
    // (#381) This method's own contract is that the buffer equals replay state
    // of the layer's done pixel ops. A layer with a deferred rebuild pending
    // does not — that is the whole point of deferring — so checkpointing it
    // here would bake a half-applied buffer under a complete op list, and an
    // undo restoring that checkpoint later would show content that never
    // existed. Skipping costs nothing: _maybeCheckpoint fires again on the
    // next boundary, past the flush.
    if (this._pendingRebuilds.has(layerId)) return
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
    // (#373) Content is judged from the buffer, never from the log. It used to
    // bail on `layerPixelOps(layerId).length === 0`, reading "no operations of
    // mine mention this layer" as "this layer is empty" — but the log is a
    // bounded window (HISTORY_BACKFILL_DEPTH), so a layer whose strokes had
    // scrolled out of it, or that was restored from a snapshot rather than
    // painted, looked empty while holding a full drawing. It was then left out
    // of the snapshot entirely, and the next client to restore that snapshot
    // saw a blank layer. That is #369, and this line is where it started.
    const tiles = buf.allResident().map(({ buffer, originX, originY }) => ({
      originX, originY, width: buffer.width, height: buffer.height, pixels: buffer.readPixels(),
    }))
    if (!tiles.length) return null
    // (#373) Whatever the caller does with these bytes, this layer's current
    // pixels have now left the engine — anything that changes them after this
    // point is what makes it dirty again.
    this._bakedRevision.set(layerId, this._layerRevision.get(layerId) ?? 0)
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
  restoreLayerFromSnapshot(layerId: string, tiles: SnapshotTile[], coveredSeq?: number): void {
    const buf = this._layers.get(layerId)
    if (!buf) return
    // (#469) A snapshot baked before bounded rooms were subdivided carries one
    // page-sized tile; this room's buffer now wants TILE_SIZE ones. Re-slicing
    // is not optional — uploading a 2480-wide array into a 1024-wide texture
    // is silent corruption, not a near miss. Tiles already on the grid (every
    // infinite room, and every bake after the change) pass through untouched.
    const { w: tw, h: th } = this._tileSize()
    const retiled = retileSnapshotTiles(tiles, tw, th)
    // Re-slicing a mostly-empty page yields tiles carrying nothing, and each
    // would cost 4 MiB of texture to say exactly what an absent tile already
    // says. Only a re-sliced set can contain them — identity means every tile
    // came off a real bake, which never stores a tile it did not paint — so
    // the alpha scan stays off the path taken by every current snapshot.
    const painted = retiled === tiles
      ? retiled
      : retiled.filter(t => !isFullyTransparent(t.pixels))
    // Blank tiles are dropped from the upload only while the layer is
    // genuinely empty. Restoring onto a live buffer — a reconnect re-restoring
    // an engine that already holds pixels — is the one case where an
    // all-transparent tile is *doing* something: clearing what is under it.
    // Nothing clears the layer ahead of this, so that distinction is ours to
    // make, and one cheap check makes it without asking per tile.
    const uploads = buf.allResident().length === 0 ? painted : retiled
    for (const t of uploads) {
      const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
      for (const target of buf.resolveForPaint(rect)) target.buffer.restorePixels(t.pixels)
      buf.restoreTileContent(rect, t.pixels)
    }
    if (coveredSeq !== undefined) this._snapshotCoverage.set(layerId, coveredSeq)
    // (#373) These pixels *are* what the server already stores, so the layer
    // is marked changed (it is — the buffer was empty a moment ago) and
    // immediately marked as known to the server. Otherwise every joining
    // client would re-bake and re-upload the whole room it just downloaded.
    this._markLayerDirty(layerId)
    this._bakedRevision.set(layerId, this._layerRevision.get(layerId)!)
    // The *painted* set, not what arrived: a checkpoint restore clears the
    // buffer before replaying its tiles (see _rebuildLayerFromLog), so a blank
    // tile there can only ever cost memory, never carry meaning.
    this._pinSnapshotCheckpoint(layerId, painted)
  }

  /** (#373) Records that this layer's pixels changed. Cheap enough to call
   *  from anywhere that might have changed them, and that is how it should be
   *  called — the cost of an unnecessary bump is one redundant bake, the cost
   *  of a missing one is a stored snapshot that quietly no longer matches the
   *  layer it claims to be. */
  private _markLayerDirty(layerId: string): void {
    this._layerRevision.set(layerId, (this._layerRevision.get(layerId) ?? 0) + 1)
  }

  /** (#373) Whether this layer holds pixels the server does not have.
   *
   *  A layer nobody has ever painted is not dirty, which is why a room's
   *  untouched `background` never costs a bake. */
  isLayerDirty(layerId: string): boolean {
    const revision = this._layerRevision.get(layerId) ?? 0
    return revision !== 0 && revision !== this._bakedRevision.get(layerId)
  }

  /** See the PencilEngineAPI doc comment. */
  liveLayerIds(): string[] {
    return [...this._layers.keys()]
  }

  /** (#374) Whether this layer's restored pixels already account for an
   *  operation at `seq`.
   *
   *  Compared against the *room* seq the operation arrived with, not the log's
   *  own numbering — `OperationLog.append` renumbers entries to their array
   *  index, so only the copy the caller still holds carries the server's. Every
   *  caller therefore has to ask this before appending, which is why the checks
   *  sit in `appendOperation` rather than deeper down. */
  private _isCoveredByRestore(layerId: string, seq: number | undefined): boolean {
    const covered = this._snapshotCoverage.get(layerId)
    return covered !== undefined && seq !== undefined && seq <= covered
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
    // (#398) Nothing is painted here — but an undo/redo later rebuilds a
    // layer from exactly these operations, and that rebuild is synchronous.
    // Decoding in the background now is what lets it find the image ready;
    // deliberately not awaited, since backfill itself never blocks anything.
    void this.preloadImages(ops)
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
    this._dispTransparentProg = createProgram(gl, DISPLAY_VERT, DISPLAY_TRANSPARENT_FRAG)
    this._compositeProg       = createProgram(gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG)
    this._blitProg            = createProgram(gl, DISPLAY_VERT, IMAGE_BLIT_FRAG)
    this._transformProg       = createProgram(gl, DISPLAY_VERT, TRANSFORM_BLIT_FRAG)
    this._areaTransformProg   = createProgram(gl, DISPLAY_VERT, AREA_TRANSFORM_FRAG)
    this._areaMaskProg        = createProgram(gl, DISPLAY_VERT, AREA_MASK_FRAG)
    this._paperComposeProg    = createProgram(gl, DISPLAY_VERT, PAPER_COMPOSE_FRAG)
    this._smudgeProg          = createProgram(gl, DAB_VERT, SMUDGE_TRANSFER_FRAG)
    this._smudgePickupProg    = createProgram(gl, DISPLAY_VERT, SMUDGE_PICKUP_FRAG)
    this._ribbonProg          = createProgram(gl, RIBBON_VERT, RIBBON_FRAG)

    this._dabUni  = getUniforms(gl, this._dabProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio',
      'u_resolution', 'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_pressure', 'u_tiltX', 'u_tiltY', 'u_hardness', 'u_opacity',
      'u_eraseMode', 'u_color', 'u_grainMode', 'u_paperFillThreshold', 'u_paperFillCap', 'u_inkMode',
      // Liner only (#452, ADR 003 §4) — how far past its own radius a dab's
      // quad is grown so the absorbed band has somewhere to land, and the cap
      // on that. Set to 0 by every other draw through this program (marker's
      // two passes included), not just left unset: a program's uniforms
      // persist across draws, so a liner stroke would otherwise leak its band
      // into whatever drew next.
      'u_wickPx', 'u_wickCap',
      // Charcoal only (#304, ADR 005) — per-preset, so needed by both this
      // program and the instanced one below (unlike marker's three samplers,
      // which never draw through the batched path).
      'u_charcoalTooth', 'u_charcoalCrumble', 'u_charcoalDust',
      'u_charcoalBroadAspect', 'u_charcoalBroadGrain',
      'u_charcoalPressFloor', 'u_charcoalPressGamma', 'u_charcoalSkipFloor', 'u_charcoalGateRelief', 'u_charcoalGrainDepth',
      // Ribbon tools only (#250, follow-up; #454 widened this from "marker" to
      // "marker and brush pen") — only ever set by their own draws, which
      // always use this non-instanced program; not added to _dabInstUni below
      // since nothing ever draws a ribbon stroke through it.
      'u_original', 'u_strokeCoverage', 'u_inkLoad',
      // #330 stage 2/3 — the ribbon nib's own geometry: edge ramp width in canvas
      // px, which outline the nib is, its corner radius, and how much the ink
      // eases off at the rim. #454: plus how far paper grain bites into the
      // brush pen's rim.
      'u_aaPx', 'u_nibShape', 'u_nibCorner', 'u_inkEdge', 'u_paperEdge',
    ])
    this._ribbonUni = getUniforms(gl, this._ribbonProg, ['u_resolution', 'u_aaPx', 'u_mode'])
    this._dabInstUni = getUniforms(gl, this._dabProgInstanced, [
      'u_resolution', 'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_hardness', 'u_eraseMode', 'u_color', 'u_grainMode', 'u_paperFillThreshold', 'u_paperFillCap', 'u_inkMode',
      'u_wickPx', 'u_wickCap', // #452 — see _dabUni's own comment
      'u_charcoalTooth', 'u_charcoalCrumble', 'u_charcoalDust',
      'u_charcoalBroadAspect', 'u_charcoalBroadGrain',
      'u_charcoalPressFloor', 'u_charcoalPressGamma', 'u_charcoalSkipFloor', 'u_charcoalGateRelief', 'u_charcoalGrainDepth',
    ])
    this._dispTransparentUni = getUniforms(gl, this._dispTransparentProg, ['u_accumulation'])
    this._compositeUni = getUniforms(gl, this._compositeProg, ['u_layer', 'u_opacity'])
    this._blitUni = getUniforms(gl, this._blitProg, ['u_image', 'u_bufferSize', 'u_imageRect'])
    this._transformUni = getUniforms(gl, this._transformProg, ['u_source', 'u_dstSize', 'u_srcSize', 'u_matrixInv'])
    this._areaTransformUni = getUniforms(gl, this._areaTransformProg, [
      'u_source', 'u_mask', 'u_dstSize', 'u_srcSize', 'u_srcOrigin', 'u_maskRect', 'u_matrixInv',
    ])
    this._areaMaskUni = getUniforms(gl, this._areaMaskProg, ['u_mask', 'u_dstSize', 'u_dstOrigin', 'u_maskRect'])
    this._paperComposeUni = getUniforms(gl, this._paperComposeProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_paperScale', 'u_paperTexSize',
      'u_dstSize', 'u_srcSize', 'u_matrixInv', 'u_screenToWorld', 'u_sharpResample',
      'u_pageRect', 'u_deskColor',
    ])
    this._smudgeUni = getUniforms(gl, this._smudgeProg, [
      'u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio', 'u_resolution',
      'u_paperHeightMap', 'u_paperScale', 'u_paperOrigin', 'u_paperTexSize',
      'u_hardness', 'u_carried', 'u_patchOrigin', 'u_patchSize', 'u_mode', 'u_grainRelief',
      'u_strength', 'u_pressure', 'u_paperFillThreshold', 'u_paperFillCap',
    ])
    this._smudgePickupUni = getUniforms(gl, this._smudgePickupProg, [
      'u_patch', 'u_carried', 'u_rate',
    ])

    this._dabPosLoc            = gl.getAttribLocation(this._dabProg, 'a_position')
    this._dispTransparentPosLoc = gl.getAttribLocation(this._dispTransparentProg, 'a_position')
    this._compositePosLoc      = gl.getAttribLocation(this._compositeProg, 'a_position')
    this._blitPosLoc           = gl.getAttribLocation(this._blitProg, 'a_position')
    this._transformPosLoc      = gl.getAttribLocation(this._transformProg, 'a_position')
    this._areaTransformPosLoc  = gl.getAttribLocation(this._areaTransformProg, 'a_position')
    this._areaMaskPosLoc       = gl.getAttribLocation(this._areaMaskProg, 'a_position')
    this._paperComposePosLoc   = gl.getAttribLocation(this._paperComposeProg, 'a_position')
    this._smudgePosLoc         = gl.getAttribLocation(this._smudgeProg, 'a_position')
    this._smudgePickupPosLoc   = gl.getAttribLocation(this._smudgePickupProg, 'a_position')

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
    const mipsReady = generatePaperMipmaps(gl, newTex)
    const old = this._paperTex
    this._paperTex = newTex
    this._paperMipsReady = mipsReady
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
  /** (#470) The sheet, in world units — or a degenerate rect for an infinite
   *  room, which has no sheet and whose paper therefore covers the screen
   *  edge to edge. The shader reads the degenerate case as "paper everywhere",
   *  which is exactly what an infinite room did before there was a rect at
   *  all. */
  private _pageRect(): [number, number, number, number] {
    if (this._infinite) return [0, 0, -1, -1]
    const { w, h } = this._pageSize()
    return [0, 0, w, h]
  }

  private _paperWorldSize(): { w: number; h: number } {
    if (this._infinite) return { w: PAPER_WORLD_SIZE, h: PAPER_WORLD_SIZE }
    return this._pageSize()
  }

  /** The sheet's size in world units. Falls back to the canvas for a caller
   *  that never passed one — which is exactly the pre-#470 geometry, since
   *  back then the canvas was the sheet. */
  private _pageSize(): { w: number; h: number } {
    return {
      w: this._opts.pageWidth ?? this.canvas.width,
      h: this._opts.pageHeight ?? this.canvas.height,
    }
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
    // see RibbonStrokeScratch's own doc comment. Harmless to always create,
    // even for a non-marker stroke: nothing allocates any GL resource until
    // a marker dab's own getOrCreate() first touches a tile.
    this._ribbonStrokeScratch = new RibbonStrokeScratch(
      this._ribbonScratchPool, ribbonProfileFor(this._strokeTool, this._opts.pencilType).ink,
    )
    this._strokeId = nanoid(10)
    // (#429) `_liveLastEmitAt = 0` on purpose, not `performance.now()`: it
    // makes the first packet of a gesture go out with the first dabs painted
    // rather than one interval later, so a peer sees the stroke begin as
    // early as the channel allows. Only the packets after it are paced.
    this._liveDabQueue = []
    this._liveLastEmitAt = 0
    this._livePacketSeq = 0
    // #251: this._strokePreset isn't assigned until the next line — pass the
    // raw incoming preset (this._opts.pencilType) directly so a marker
    // stroke's bullet/chisel dispatch (shapingForTool -> markerPresets.ts's
    // shapingForMarkerPreset) sees this stroke's actual nib, not whatever
    // preset the *previous* stroke left in _strokePreset.
    this._dabs.setShaping(shapingForTool(
      this._strokeTool, this._opts.pencilType,
      { angle: this._markerAngleRadians, followStrokeDirection: this._markerFollowStroke },
      this._tiltResponse,
    ))
    // #330 stage 3 — only the marker's ribbon rasterizer cares (its bands are
    // straight chords between samples); every other tool keeps its plain
    // size-proportional spacing untouched. See DabSystem.curvatureTolerancePx.
    this._dabs.curvatureTolerancePx = isRibbonTool(this._strokeTool)
      ? ribbonProfileFor(this._strokeTool, this._opts.pencilType).curvatureTolerancePx
      : null
    this._strokePreset  = this._opts.pencilType
    this._strokeColor   = this._opts.graphiteColor
    // Smudge's carried imprint resets at every gesture, but not from here:
    // _paintSmudgeDabs does it off this stroke's own id, so the local and the
    // replayed path go through exactly one rule (see _smudgeResumeGesture).
    this._strokeDabs    = []
    // #454: the brush pen's head taper ramps over arc length travelled since
    // the stroke began (ADR 009 §4 — the one quantity that is known live and
    // needs nothing from the future), so it needs its own running total across
    // this gesture's batches.
    this._strokeArcLen  = 0
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
    // #454: the same post-process one tool over, and far deeper — a liner
    // narrows by at most 15%, a brush pen by up to 75%, which is what turns a
    // quick flick into a point instead of a cut-off tube (ADR 009 §4).
    if (this._strokeTool === 'brushPen') applyBrushPenEndTaper(dabs, e.speed)
    if (dabs.length) this._paintStrokeDabs(dabs, e.speed, e.timeStamp - this._strokeStartTimestamp)
    // Torn down after this stroke's very last dabs are painted above — a
    // fresh RibbonStrokeScratch gets created for the *next* stroke in
    // _onStart, never carried over (see its own doc comment).
    this._ribbonStrokeScratch?.destroy()
    this._ribbonStrokeScratch = null
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
        dabsPacked: packDabs(this._strokeDabs), timestamp: Date.now(),
        ...(this._strokeId ? { strokeId: this._strokeId } : {}),
        }
      this._log.append(op)
      this._maybeCheckpoint(layerId)
      this._onLocalOperation?.(op)
    }
    // (#429) Deliberately no final flush of the live queue: whatever is still
    // sitting in it is carried by the operation dispatched just above, which
    // reaches peers through the ordered stream at the same time. Sending it
    // twice would buy nothing and cost a packet at the busiest moment of the
    // gesture. Peers paint the streamed prefix, the operation paints the tail
    // — see _claimLivePaintedDabs.
    if (this._strokeId) this._onLiveStrokeEnd?.(this._strokeId)
    this._liveDabQueue = []
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
    // #454, ADR 009 §9: near-opaque covering ink. One flat preset for the tool
    // — its presetName slot carries the pressure response, not a nib or a
    // grade, so there is nothing here to branch on (brushPenPresets.ts).
    if (tool === 'brushPen') return BRUSH_PEN_PRESET
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
        const tiltDeg = tiltMagnitudeDeg(dab.tiltX, dab.tiltY)
        dab.opacity = preset.opacity * opacity * inkSpeed * linerTiltFlow(tiltDeg)
      }
      // Marker (#250, ADR 004 §2; explicit pressureFactor added in "Ревизия
      // v1.5" §1 — the expert's own proposed
      // `deposit = flowPerDistance * segmentLength * pressureFactor` names
      // it as its own term rather than folding it silently into "flow"):
      // same speed/tilt shape as liner (shared inkSpeed above), plus a mild
      // markerPressureFlow term liner doesn't have. `dab.opacity` here is
      // *not yet* the final ink deposit — _paintRibbonStroke multiplies it
      // by this dab's own segmentLength at paint time (distance-
      // normalization can't happen here: this function only ever sees one
      // dab at a time, with no notion of "distance since the previous
      // one" — see _markerSegmentLength).
      else if (tool === 'marker') {
        const tiltDeg = tiltMagnitudeDeg(dab.tiltX, dab.tiltY)
        dab.opacity = preset.opacity * opacity * inkSpeed * linerTiltFlow(tiltDeg) * markerPressureFlow(dab.pressure)
      }
      // Brush pen (#454, ADR 009 §5/§9): flat. Not "not tuned yet" — flat on
      // purpose, and in two directions.
      //
      // No pressure term, because a tool where pressure moves width *and*
      // alpha together reads as an airbrush rather than a pen; ADR 009 §9
      // makes width the only thing pressure drives. No speed or tilt term
      // either: the liner's inkSpeed models ink leaving a capillary tip at a
      // rate per unit *time*, which is a fineliner's physics, not a flexing
      // brush nib's — what speed does to this tool is sharpen the tail
      // (applyBrushPenEndTaper), and that is the whole of it in v1.
      //
      // The flatness is also load-bearing downstream, not merely tidy: every
      // dab of the stroke carrying the same opacity is exactly what lets the
      // source-over composite reconstruct the finished pixel from a coverage
      // buffer and one scalar (DAB_FRAG's u_inkMode=8 branch). A per-dab
      // opacity could not be expressed there at all.
      else if (tool === 'brushPen') dab.opacity = preset.opacity * opacity
      // Charcoal (#304 §3, plus #305's broad-side lightening): shares pencil's
      // speed curve deliberately — "slower stroke -> denser deposit" is equally
      // true of both materials — and adds one term graphite has no analogue
      // for. Laid on its broad side, the stick spreads the same pressure over a
      // far larger contact patch, so it must deposit lighter; without this, the
      // broad regime just paints a much bigger *and* equally dark mark, which
      // reads as a fat marker rather than a stick on its side. Derived from the
      // dab's own baked aspectRatio rather than re-running the curve on tilt,
      // so it can't disagree with the geometry actually being drawn (see
      // charcoalBroadness' own comment).
      else if (tool === 'charcoal') {
        const broadness = charcoalBroadness(dab.aspectRatio)
        dab.opacity = preset.opacity * opacity * speedFactor * charcoalBroadDensity(broadness)
      }
      // Graphite (#389). The tilt term is the counterpart of charcoal's
      // broad-side lightening just above, and arrives here the same way: from
      // the dab's own baked aspectRatio, not by re-running the curve on tilt,
      // so a slider moved between record time and here can't make the deposit
      // disagree with the geometry it's shading (see pencilTiltness). Reduces
      // to exactly the old expression when PENCIL_TILT.lightening is 0.
      //
      // Eraser and smudge share the tilt *geometry* but not this: their
      // branches above never had a preset opacity to scale, and "erases less
      // when tilted" is a change to how erasing works rather than a
      // consequence of spreading graphite over more paper.
      else dab.opacity = preset.opacity * opacity * speedFactor * pencilTiltDensity(pencilTiltness(dab.aspectRatio))
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
    this._markLayerDirty(this._strokeLayerId)

    this._bakeDabOpacity(dabs, speed, this._strokeTool, this._strokePreset, this._opts.opacity)
    // #454, ADR 009 §4. Before painting *and* before _strokeDabs.push below,
    // so the narrowing is baked into the dab every other route to these pixels
    // reads — the recorded StrokeOperation, the packet a peer replays, an
    // undo/redo, a snapshot rebuild. A taper applied at draw time would exist
    // only on the screen of whoever drew it, which is the exact failure #452
    // documents under linerWickPx.
    if (this._strokeTool === 'brushPen') {
      this._strokeArcLen = applyBrushPenHeadTaper(dabs, this._strokeDabs.at(-1), this._strokeArcLen)
    }
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
      this._strokeDabs.at(-1), this._ribbonStrokeScratch ?? undefined,
    )
    this._strokeDabs.push(...dabs)
    // (#429) Same dab objects, queued for the live channel — see
    // onLiveStrokeDabs on why both paths must read the one baked result.
    if (this._onLiveStrokeDabs) { this._liveDabQueue.push(...dabs); this._emitLiveDabsIfDue() }
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
      this._tiltResponse,
    )
    const tiltMag = tiltMagnitudeDeg(this._lastPointerTiltX, this._lastPointerTiltY)
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
    dab.opacity = preset.opacity * this._opts.opacity * linerTiltFlow(tiltMag) * dwellFlow(elapsed, cfg)

    this._paintDabs(
      buf, [dab], this._strokeTool, this._strokePreset, this._strokeColor, this._userId,
      this._strokeDabs.at(-1), this._ribbonStrokeScratch ?? undefined,
    )
    this._strokeDabs.push(dab)
    // (#429) A dwell dab is a real dab of this gesture — it goes into the
    // operation, so it has to go down the live channel too, or a peer's
    // pre-painted prefix would drift out of step with the operation's own
    // dab count and the claim would skip the wrong ones.
    if (this._onLiveStrokeDabs) { this._liveDabQueue.push(dab); this._emitLiveDabsIfDue() }
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
  /** (#429) Sends the dabs queued since the last packet, if enough time has
   *  passed. Called from every path that paints a dab of a local stroke, so
   *  the queue drains on drawing activity rather than on a timer — a stroke
   *  that is not moving has nothing to send, and one that stops for good ends
   *  via _onEnd, so no interval needs to exist for this.
   *
   *  Sends nothing when there is no handler wired (every non-room use of the
   *  engine: tests, the lesson-replay player, the paper-bake harness), which
   *  is also why none of them pay for the queue. */
  private _emitLiveDabsIfDue(): void {
    if (!this._onLiveStrokeDabs || !this._strokeId || !this._strokeLayerId) return
    if (!this._liveDabQueue.length) return
    const now = performance.now()
    if (now - this._liveLastEmitAt < LIVE_STROKE_EMIT_INTERVAL_MS) return
    this._liveLastEmitAt = now
    this._onLiveStrokeDabs({
      strokeId: this._strokeId, layerId: this._strokeLayerId,
      tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
      packetSeq: this._livePacketSeq++, dabs: this._liveDabQueue,
    })
    // A fresh array rather than length = 0: the packet above holds this one,
    // and the caller is free to keep it (Room packs it asynchronously).
    this._liveDabQueue = []
  }

  private _flushStrokeChunk(): void {
    const layerId = this._strokeLayerId
    if (!layerId || !this._strokeDabs.length) return
    const op: Operation = {
      id: nanoid(10), type: 'stroke', userId: this._userId,
      layerId, tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
      dabsPacked: packDabs(this._strokeDabs), timestamp: Date.now(),
      ...(this._strokeId ? { strokeId: this._strokeId } : {}),
    }
    this._log.append(op)
    this._maybeCheckpoint(layerId)
    this._onLocalOperation?.(op)
    this._strokeDabs = []
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

  /** See the PencilEngineAPI doc comment. */
  async preloadImage(src: string): Promise<void> {
    await this._loadImage(src).catch(
      // Same reasoning as preloadImages': a raster that will not decode is not
      // a reason to throw at the caller, it is a float that draws nothing.
      err => { console.error('failed to decode pasted image', err) },
    )
  }

  /** See the PencilEngineAPI doc comment. */
  async preloadImages(ops: Operation[]): Promise<void> {
    const sources = new Set<string>()
    // (#446) `area_paste` carries a raster for the same reason image_import
    // does, so it must be decoded ahead of a replay for the same reason too —
    // an operation painted after its own async decode lands on top of
    // whatever was drawn in the meantime.
    for (const op of ops) {
      if (op.type === 'image_import' || op.type === 'area_paste' || op.type === 'area_fill') sources.add(op.image)
    }
    if (sources.size === 0) return
    await Promise.all([...sources].map(src => this._loadImage(src).catch(
      // Deliberately not rethrown: this is a preparation step for a replay,
      // and an image that cannot be decoded is not a reason to abandon
      // everything else the room drew. The operation itself falls through to
      // the async path and fails there exactly as it did before.
      err => { console.error('failed to decode imported image', err) },
    )))
  }

  /** (#398) Paints `op` immediately if its image is already decoded, leaving
   *  the pixels in `buf` by the time this returns — which is what lets a
   *  replay apply the operations that follow it against the content they
   *  were recorded against. False means nothing was painted and the caller
   *  must fall back to the async path. */
  private _paintDecodedImage(
    buf: ILayerBuffer, op: ImageImportOperation, matrix?: LayerTransformMatrix,
  ): boolean {
    const img = this._imageCache.get(op.image)
    if (!img) return false
    this._blitImage(buf, op, img, matrix)
    this._displayIfNotSuspended()
    return true
  }

  /** (#398) An image that had to be decoded *after* its operation was
   *  applied has just landed. Anything that painted this layer in the
   *  meantime is now wrongly underneath it — a peer's stroke arriving right
   *  behind the import, or the import's own undo. The image is in
   *  `_imageCache` now, so rebuilding replays the whole layer synchronously
   *  and in log order, putting everything back where the log says it goes.
   *
   *  Skipped in the ordinary case — an import that is still the newest pixel
   *  operation on its layer (a local import, a peer's with nothing behind
   *  it) is already correct, and must not pay for a rebuild. */
  private _settleLateImage(op: ImageImportOperation): void {
    const ops = this._log.layerPixelOps(op.layerId)
    if (ops.length > 0 && ops[ops.length - 1].id === op.id) return
    this._rebuildLayer(op.layerId)
    this._displayIfNotSuspended()
  }

  /** Paints a reference image into `buf`, fit-centered ("contain") so the
   *  whole image stays visible, letterboxed if its aspect ratio doesn't
   *  match the canvas's. The decode is the only asynchronous step, and it is
   *  the reason `preloadImages` exists: with the image already in
   *  `_imageCache`, callers reach `_blitImage` below directly and this
   *  operation lands synchronously like every other pixel op. This wrapper
   *  is what remains for the cases where it cannot — a genuinely new import
   *  (local, or a peer's arriving live), where nothing had a chance to
   *  decode it in advance. */
  private async _paintImage(
    layerBuf: ILayerBuffer, op: ImageImportOperation, matrix?: LayerTransformMatrix,
  ): Promise<void> {
    const img = await this._loadImage(op.image)
    this._blitImage(layerBuf, op, img, matrix)
    // Unconditional, unlike _paintDecodedImage's: whatever suspendDisplay
    // span was open when this operation was applied is long closed by the
    // time a decode resolves, so there is nothing left to repaint later.
    this._display()
  }

  private _blitImage(
    layerBuf: ILayerBuffer, op: ImageImportOperation, img: HTMLImageElement,
    // (#446) Where the raster was moved to before it was dropped — see
    // AreaPasteOperation.matrix. Absent (every image_import, and a paste
    // dropped where it landed) takes the plain axis-aligned path below,
    // byte-for-byte as before.
    wireMatrix?: LayerTransformMatrix,
  ): void {
    const { gl } = this

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
      // (#470) Fit-centred within the sheet, which is what this always meant
      // — it read the canvas only because the canvas was the sheet.
      const { w: pageW, h: pageH } = this._pageSize()
      const scale = Math.min(pageW / op.width, pageH / op.height)
      drawW = op.width * scale
      drawH = op.height * scale
      drawX = (pageW - drawW) / 2
      drawY = (pageH - drawH) / 2
    }

    if (wireMatrix) {
      const matrix = toHomography(wireMatrix)
      const rect = { x: drawX, y: drawY, width: drawW, height: drawH }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [cx, cy] of [
        [drawX, drawY], [drawX + drawW, drawY], [drawX, drawY + drawH], [drawX + drawW, drawY + drawH],
      ] as Array<[number, number]>) {
        const [tx, ty] = applyMatrix(matrix, cx, cy)
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
      }
      if (Number.isFinite(minX + minY + maxX + maxY) && maxX > minX && maxY > minY) {
        const moved: WorldRect = { minX, minY, maxX, maxY }
        for (const { buffer, originX, originY } of layerBuf.resolveForPaint(moved)) {
          this._drawImageThroughMatrix(buffer, originX, originY, img, rect, matrix)
        }
        layerBuf.markContentPainted(moved)
      }
      gl.deleteTexture(texture)
      if (op.layerId !== this._activeId) this._invalidateSplitCache()
      return
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
  private _dabsWorldBounds(dabs: Dab[], erasing: boolean, preset: PencilPreset, wicking = false): WorldRect {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const d of dabs) {
      const { hx, hy } = this._dabWorldHalfExtents(d, erasing, preset, wicking)
      minX = Math.min(minX, d.x - hx); maxX = Math.max(maxX, d.x + hx)
      minY = Math.min(minY, d.y - hy); maxY = Math.max(maxY, d.y + hy)
    }
    if (this._infinite) return { minX, minY, maxX, maxY }
    // (#470) The *sheet*, not the canvas. These were the same number while the
    // canvas was the sheet; once it became the viewport this clamped every
    // stroke to the window's own size, so on a 4096 page nothing below the
    // window's height painted at all — the dab's rect came back empty and no
    // tile was ever resolved.
    const { w: pageW, h: pageH } = this._pageSize()
    return {
      minX: Math.max(minX, 0), minY: Math.max(minY, 0),
      maxX: Math.min(maxX, pageW), maxY: Math.min(maxY, pageH),
    }
  }

  /** One dab's exact world-space half-extents (an axis-aligned box around
   *  everything that dab can possibly rasterize) — the same per-dab quantity
   *  `_dabsWorldBounds` unions across a whole batch, factored out so
   *  `_paintDabs`'s per-tile filter (see its own comment) and marker's own
   *  per-batch tile resolution (_paintRibbonStroke) can apply it to one dab at
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
  private _dabWorldHalfExtents(
    d: Dab, erasing: boolean, preset: PencilPreset, wicking = false,
  ): { hx: number; hy: number } {
    const baseR = d.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier)
    // #452: the liner's absorbed band lives *outside* baseR, so it has to be
    // padded in here too — this box picks which tiles a batch resolves and
    // which rect gets marked dirty, and a band left out of it is a halo
    // sheared off at a tile boundary (exactly the failure #330 hit with the
    // chisel nib, described in this method's own doc comment above). Same
    // absolute-with-a-cap rule the vertex shader applies per dab
    // (WICK_EXPAND_GLSL); linerWickPx is the single statement of it, so the
    // two can't drift apart. 0 for every other tool.
    const r = baseR + (wicking ? linerWickPx(baseR) : 0)
    // Rotated-rect AABB, not a `baseR * aspectRatio` circle: a 5:1 chisel dab
    // is long *along the nib only*, and inflating the short axis to match
    // would resolve (and so lazily create — 4MB each) whole tiles the dab
    // never actually reaches.
    const halfLong = r * Math.max(1, d.aspectRatio)
    const c = Math.abs(Math.cos(d.angle)), s = Math.abs(Math.sin(d.angle))
    return { hx: halfLong * c + r * s, hy: halfLong * s + r * c }
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
   *  `userId` (smudge only, #14): whose own carried imprint
   *  (this._smudgeImprints) these dabs exchange with — every caller already
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
   *  `ribbonScratch` (marker only, follow-up to #250): the *live, local*
   *  stroke's own RibbonStrokeScratch (this._ribbonStrokeScratch), so
   *  incremental calls across one in-progress stroke (_paintStrokeDabs,
   *  the dwell tick) keep multiplying against the *same* frozen original
   *  content and the *same* running coverage — omitted by every other
   *  caller (one-shot full-array replay/undo/redo/checkpoint/peer-op
   *  application), which gets a correct, throwaway per-call instance
   *  instead (see _paintRibbonDabs' own doc comment). Unused by every tool
   *  but marker.
   *
   *  `strokeId` (marker and smudge): which gesture these dabs belong to.
   *  Marker uses it to rejoin a chunked stroke's scratch (_replayChunkScratch);
   *  smudge, to decide whether the carried imprint continues or resets
   *  (_smudgeResumeGesture). Both are no-ops without it — a stroke recorded
   *  before strokeId existed replays as several independent operations, with
   *  a seam at each boundary. */
  private _paintDabs(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string,
    color: [number, number, number], userId: string, prevDab?: Dab, ribbonScratch?: RibbonStrokeScratch,
    strokeId?: string,
  ): void {
    if (!dabs.length) return
    if (tool === 'smudge') { this._paintSmudgeDabs(target, dabs, userId, prevDab, strokeId); return }
    // Marker (#250, ADR 004 §3; distance-normalized deposit added in
    // "Ревизия v1.5"): each dab needs its own coverage/inkLoad/composite
    // round trip (see _paintRibbonDabs' own doc comment) — self-contained
    // per stroke via ribbonScratch, no reservoir the way smudge needs, but
    // *does* need prevDab now (§1.5's inkLoad deposit is
    // `dab.opacity * segmentLength`, and segmentLength needs the previous
    // dab's own position) — unlike the smudge branch above, userId is still
    // unused (no per-user state).
    // #454: two tools now, dispatched by isRibbonTool rather than by name —
    // the brush pen needs the identical stroke-scoped coverage/composite
    // structure and differs only in its RibbonProfile.
    if (isRibbonTool(tool)) { this._paintRibbonDabs(target, dabs, tool, presetName, color, ribbonScratch, prevDab, strokeId); return }
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
    // #452 (ADR 003 §4): only the liner's dabs are grown past their own radius
    // to hold the band of ink absorbed into the paper around the mark. Derived
    // from `tool` alone rather than passed in by the caller, deliberately —
    // see linerPresets.ts's note under linerWickPx on what happened to the
    // version of this that carried a live per-draw multiplier.
    const wicking = tool === 'liner'
    const worldBounds = this._dabsWorldBounds(dabs, erasing, preset, wicking)
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
        const { hx, hy } = this._dabWorldHalfExtents(d, erasing, preset, wicking)
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
        this._paintDabsInstanced(tileDabs, erasing, inkMode, charcoal, preset, color, buffer.width, buffer.height, originX, originY, wicking)
      } else {
        this._paintDabsUniform(tileDabs, erasing, inkMode, charcoal, preset, color, buffer.width, buffer.height, originX, originY, wicking)
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
    resW: number, resH: number, originX: number, originY: number, wicking: boolean,
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
    // #452: the shader applies the cap itself, per dab, because only it knows
    // each dab's own radius on the batched path — these two carry the rule,
    // linerWickPx() states the same one CPU-side for the dirty rect, and they
    // must not drift. Both 0 for a non-liner draw, which makes the shader's
    // wickExpand() return exactly 1.0 and this whole path a no-op.
    gl.uniform1f(u.u_wickPx,  wicking ? LINER_WICK_PX : 0)
    gl.uniform1f(u.u_wickCap, wicking ? LINER_WICK_RADIUS_CAP : 0)
    gl.uniform1f(u.u_charcoalTooth,   charcoal?.tooth   ?? 0)
    gl.uniform1f(u.u_charcoalCrumble, charcoal?.crumble ?? 0)
    gl.uniform1f(u.u_charcoalDust,    charcoal?.dust    ?? 0)
    // #305: read live off CHARCOAL_FEEL (the debug overlay mutates it in
    // place), not captured once — same reason CHARCOAL_DAB_SHAPING's own
    // tiltSmoothing is a getter.
    gl.uniform1f(u.u_charcoalBroadAspect, charcoal ? CHARCOAL_FEEL.aspectMax : 0)
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
    resW: number, resH: number, originX: number, originY: number, wicking: boolean,
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
    // #452: the shader applies the cap itself, per dab, because only it knows
    // each dab's own radius on the batched path — these two carry the rule,
    // linerWickPx() states the same one CPU-side for the dirty rect, and they
    // must not drift. Both 0 for a non-liner draw, which makes the shader's
    // wickExpand() return exactly 1.0 and this whole path a no-op.
    gl.uniform1f(u.u_wickPx,  wicking ? LINER_WICK_PX : 0)
    gl.uniform1f(u.u_wickCap, wicking ? LINER_WICK_RADIUS_CAP : 0)
    gl.uniform1f(u.u_charcoalTooth,   charcoal?.tooth   ?? 0)
    gl.uniform1f(u.u_charcoalCrumble, charcoal?.crumble ?? 0)
    gl.uniform1f(u.u_charcoalDust,    charcoal?.dust    ?? 0)
    // #305: read live off CHARCOAL_FEEL (the debug overlay mutates it in
    // place), not captured once — same reason CHARCOAL_DAB_SHAPING's own
    // tiltSmoothing is a getter.
    gl.uniform1f(u.u_charcoalBroadAspect, charcoal ? CHARCOAL_FEEL.aspectMax : 0)
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
   *  _paintDabs' doc comment for `prevDab`/`strokeId`. Never batched (unlike
   *  pencil/eraser's _paintDabsInstanced): every dab both reads the canvas
   *  under it and writes to it, through an imprint threaded dab-to-dab, so
   *  dab N+1's own passes can't be submitted until dab N's have actually
   *  been issued in order. A real cost pencil/eraser don't pay (their dabs
   *  are independent, safely batched), but smudge strokes are a deliberate,
   *  comparatively low-frequency gesture (blending a shaded area), not fast
   *  scribbling — not the same hot path #123 batched. */
  private _paintSmudgeDabs(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], userId: string, prevDab: Dab | undefined,
    strokeId: string | undefined,
  ): void {
    // Transient scratch targets (live-tip/prediction preview, a peer's
    // reveal buffer) are a single un-tiled buffer, freshly cleared before
    // every refresh — nothing meaningful to pick up, and reading it back
    // while it's also the render target would need the same same-texture
    // read+write WebGL1 forbids. A harmless no-op: the real dabs below
    // always paint straight into the real layer regardless (see
    // _paintDabs' own doc comment on this parameter).
    if (target instanceof AccumulationBuffer) return
    // An explicit prevDab means the caller *is* the continuation (the live
    // stroke's own next incremental batch), and nothing needs resolving.
    let prev = prevDab ?? this._smudgeResumeGesture(userId, strokeId, dabs)
    for (const dab of dabs) {
      // No predecessor: this is the gesture's first dab, so there is no
      // travel to smear along yet — it only primes the imprint with what
      // sits under it (see _smudgeApplyDab's `priming` branch), which is
      // also why a one-dab smudge stroke leaves the canvas untouched.
      if (prev) this._paintOneSmudgeDab(target, prev, dab, userId)
      else this._smudgeApplyDab(target, dab, 0, userId)
      prev = dab
    }
  }

  /** Resolves what the first dab of this call should treat as its
   *  predecessor, and resets the imprint when this call starts a *new*
   *  gesture (see _smudgeImprints' own field comment for why an imprint
   *  never crosses a pen-up).
   *
   *  The continuation case is a gesture long enough to have been recorded
   *  as several operations (_flushStrokeChunk): live, they were one
   *  unbroken run of dabs through one imprint, and replay has to rejoin
   *  them or every chunk boundary would restart the smear from scratch —
   *  visible as a seam. Both halves of the check matter: the imprint must
   *  still belong to this gesture *and* a previous chunk of it must have
   *  gone through here, so an operation arriving on its own (a peer's
   *  stroke, a replay that begins mid-gesture because the earlier chunk is
   *  already inside a restored snapshot) correctly starts clean instead of
   *  smearing from wherever this user's tool last happened to be. */
  private _smudgeResumeGesture(userId: string, strokeId: string | undefined, dabs: Dab[]): Dab | undefined {
    const imprint = this._smudgeImprintFor(userId)
    const chunk = strokeId ? this._smudgeReplayChunks.get(userId) : undefined
    const continuing = !!strokeId && chunk?.strokeId === strokeId && imprint.strokeId === strokeId
    if (!continuing) {
      if (imprint.buf) this._releaseSmudgeScratchBuf(imprint.buf)
      imprint.buf = null
    }
    imprint.strokeId = strokeId ?? null
    if (strokeId) this._smudgeReplayChunks.set(userId, { strokeId, lastDab: dabs[dabs.length - 1] })
    else this._smudgeReplayChunks.delete(userId)
    return continuing ? chunk?.lastDab : undefined
  }

  /** One smudge dab (#416): the canvas under it is blended toward the
   *  imprint the stump carries, and the imprint is blended toward the
   *  canvas — both per pixel, both in the same dab. See
   *  SMUDGE_TRANSFER_FRAG's own file comment in shaders.ts for the full
   *  algorithm and for what this replaced (a single carried scalar, which
   *  forced every dab to be *either* a pickup or a deposit across its whole
   *  footprint and left a scrubbed-clean halo around every line it worked).
   *
   *  There are no separate rear/center/front contacts anymore. The imprint
   *  is anchored to the dab's own position in normalized patch space, so it
   *  travels with the brush by construction and the offset between
   *  consecutive dabs is itself the smear — the thing three hand-offset
   *  contacts were approximating.
   *
   *  `travel` (distance since the previous dab, in brush radii) scales both
   *  rates so a stroke's result follows how far it went rather than how
   *  many samples arrived along the way — see SMUDGE_PICKUP_RATE. It also
   *  makes standing still a true no-op rather than something that slowly
   *  eats the drawing. */
  private _paintOneSmudgeDab(target: ILayerBuffer, prev: Dab, dab: Dab, userId: string): void {
    const radius = dab.size * 0.5 * SMUDGE_SIZE_MULTIPLIER
    if (radius < 0.5) return

    const len = Math.hypot(dab.x - prev.x, dab.y - prev.y)
    if (len < 1e-3) return // stationary/duplicate sample — nothing moved, so nothing smears
    this._smudgeApplyDab(target, dab, clampNum(len / radius, 0, 1), userId)
  }

  /** The two GPU phases of one smudge dab, against `userId`'s own imprint:
   *  copy the canvas patch under the dab, refresh the imprint from it
   *  (SMUDGE_PICKUP_FRAG), then lay the imprint back down as a per-pixel
   *  lerp (two SMUDGE_TRANSFER_FRAG draws — see that shader's own comment
   *  for why the pair is exactly `dst*(1-a) + carried*a` and why both must
   *  keep computing `a` identically).
   *
   *  `travel` of 0 means there is no imprint to lay down yet: the dab only
   *  primes it (rate 1 — take the canvas wholesale rather than blending
   *  toward it from nothing, which would otherwise lay a faded ghost of the
   *  canvas over itself on the gesture's first dab) and paints nothing.
   *  Same branch covers an imprint that never got primed because an earlier
   *  dab bailed out below.
   *
   *  v1 scope: skips the dab entirely (rather than clipping or attempting
   *  cross-tile compositing) whenever its patch doesn't fit fully inside a
   *  single resident/creatable tile — an infinite room's tile grid means a
   *  smudge stroke crossing a tile boundary currently just has a gap there.
   *  Acceptable for now (typical brush sizes are far smaller than
   *  TILE_SIZE, so this only bites right at a boundary) — full cross-tile
   *  sampling would need the same multi-source-tile treatment
   *  _bakeTransform already has, not yet ported here. */
  private _smudgeApplyDab(target: ILayerBuffer, dab: Dab, travel: number, userId: string): void {
    const radius = dab.size * 0.5 * SMUDGE_SIZE_MULTIPLIER
    if (radius < 0.5) return
    const patchWorld = Math.ceil(radius * 2)
    const patchSize = Math.min(SMUDGE_MAX_PATCH_SIZE, Math.ceil(patchWorld / SMUDGE_PATCH_GRANULARITY) * SMUDGE_PATCH_GRANULARITY)
    if (patchSize < 1) return
    const half = patchSize / 2

    const targets = target.resolveForPaint({ minX: dab.x - half, minY: dab.y - half, maxX: dab.x + half, maxY: dab.y + half })
    if (targets.length !== 1) return // spans more than one tile (or none) — see this method's own doc comment
    const tile = targets[0]
    const localX = Math.round(dab.x - half - tile.originX)
    const localY = Math.round(dab.y - half - tile.originY)
    if (localX < 0 || localY < 0
      || localX + patchSize > tile.buffer.width || localY + patchSize > tile.buffer.height) return

    // App-space (top-down, like every Dab.x/y) -> GL framebuffer space
    // (bottom-up) — same flip every other app-space/GL boundary in this
    // file applies (DAB_VERT's clip.y flip, pickColor) — see
    // copyRegionTo's own doc comment. The *rounded* rect below is also what
    // the transfer draws map back from (u_patchOrigin), so the imprint and
    // the canvas stay aligned to the texel rather than to the dab's own
    // fractional center.
    const patch = this._acquireSmudgeScratchBuf(patchSize)
    const glY = tile.buffer.height - localY - patchSize
    tile.buffer.copyRegionTo(patch, localX, glY, patchSize, patchSize)

    const imprint = this._smudgeImprintFor(userId)
    const priming = imprint.buf === null
    const rate = priming ? 1 : clampNum(SMUDGE_PICKUP_RATE * travel, 0, 1)
    // Ping-pong rather than in-place: WebGL1 forbids reading and writing the
    // same texture in one draw, the same two-phase commit every other
    // scratch-then-copy in this file already follows. Priming has no
    // previous imprint to read, so it reads the patch on both inputs —
    // mix(patch, patch, 1) is the patch either way.
    const next = this._acquireSmudgeScratchBuf(patchSize)
    this._smudgeRunPickup(patch, imprint.buf ?? patch, next, rate)
    this._releaseSmudgeScratchBuf(patch)
    if (imprint.buf) this._releaseSmudgeScratchBuf(imprint.buf)
    imprint.buf = next
    if (priming) return

    // dab.opacity is the UI's "Strength" slider for this tool (see
    // _bakeDabOpacity's own smudge branch); pressure and travel are the two
    // physical terms on top of it.
    const strength = SMUDGE_DEPOSIT_RATE * travel * dab.pressure * dab.opacity
    if (strength <= 0) return
    this._drawSmudgeTransferDab(tile, dab, radius, next, localX, glY, patchSize, 'clear', strength)
    this._drawSmudgeTransferDab(tile, dab, radius, next, localX, glY, patchSize, 'lay', strength)

    target.markContentPainted({ minX: dab.x - radius, minY: dab.y - radius, maxX: dab.x + radius, maxY: dab.y + radius })
  }

  /** `userId`'s own imprint slot, created empty (never primed) on first use.
   *  Never removed once created — the entry itself is two fields and a
   *  possibly-null buffer handle, and the buffer goes back to the shared
   *  pool at every gesture boundary (see _smudgeResumeGesture), so a room
   *  full of people who each smudged once holds nothing but map entries. */
  private _smudgeImprintFor(userId: string): { buf: AccumulationBuffer | null; strokeId: string | null } {
    let entry = this._smudgeImprints.get(userId)
    if (!entry) {
      entry = { buf: null, strokeId: null }
      this._smudgeImprints.set(userId, entry)
    }
    return entry
  }

  /** One SMUDGE_PICKUP_FRAG draw: writes `mix(carried, patch, rate)` into
   *  `target`, per texel. GL blending must stay disabled — this replaces
   *  the imprint outright rather than accumulating onto whatever the pooled
   *  buffer happened to hold before. */
  private _smudgeRunPickup(
    patch: AccumulationBuffer, carried: AccumulationBuffer, target: AccumulationBuffer, rate: number,
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.width, target.height)
    gl.disable(gl.BLEND)
    gl.useProgram(this._smudgePickupProg)
    const u = this._smudgePickupUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, patch.texture)
    gl.uniform1i(u.u_patch, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, carried.texture)
    gl.uniform1i(u.u_carried, 1)
    gl.uniform1f(u.u_rate, rate)

    // _screenBuf, not _quadBuf: this pass runs DISPLAY_VERT, whose "quad"
    // convention is the -1..1 fullscreen one, while _quadBuf is DAB_VERT's
    // own -0.5..0.5 dab quad. Handing DAB_VERT's buffer to DISPLAY_VERT
    // covered only the imprint's middle quarter (and sampled the patch's
    // middle half, magnified), so the imprint's outer ring kept whatever
    // stale patch the pooled buffer last held and got laid straight back
    // onto the canvas — the square blocks a wide smudge stroke used to
    // stamp out (see index.smudge.test.ts's own square-block test).
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._smudgePickupPosLoc)
    gl.vertexAttribPointer(this._smudgePickupPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** One half of a smudge dab's transfer — `clear` is `dst *= (1-a)` under
   *  beginErase()'s (ZERO, ONE_MINUS_SRC_ALPHA), `lay` is
   *  `dst += carried*a*tooth` under beginAdditiveDraw()'s (ONE, ONE). Issued
   *  as a pair, with identical uniforms apart from u_mode, so the two
   *  together are exactly `dst' = dst*(1-a) + carried*a*tooth` — a plain
   *  lerp wherever the deposit's own grain term is neutral (see
   *  SMUDGE_TRANSFER_FRAG's own file comment and smudgeGrain.ts). `patchX`/`patchGlY`/`patchSize` are the copied patch's own
   *  rect in this tile's GL pixel space, which is how a fragment finds
   *  itself in the imprint. */
  private _drawSmudgeTransferDab(
    tile: PaintTarget, dab: Dab, radius: number, carried: AccumulationBuffer,
    patchX: number, patchGlY: number, patchSize: number, mode: 'clear' | 'lay', strength: number,
  ): void {
    const { gl } = this
    const { buffer } = tile
    if (mode === 'lay') buffer.beginAdditiveDraw()
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
    gl.bindTexture(gl.TEXTURE_2D, carried.texture)
    gl.uniform1i(u.u_carried, 1)
    gl.uniform2f(u.u_patchOrigin, patchX, patchGlY)
    gl.uniform1f(u.u_patchSize, patchSize)
    gl.uniform1f(u.u_hardness, SMUDGE_HARDNESS)
    gl.uniform1f(u.u_mode, mode === 'lay' ? 1.0 : 0.0)
    gl.uniform1f(u.u_strength, strength)
    gl.uniform1f(u.u_pressure, dab.pressure)
    gl.uniform1f(u.u_paperFillThreshold, this._paperFillThreshold)
    gl.uniform1f(u.u_paperFillCap, this._paperFillCap)
    // Both halves of the lerp read the same value, like every other uniform
    // here — see this method's own doc comment on why they must agree.
    gl.uniform1f(u.u_grainRelief, smudgeGrainRelief(dab.pressure))

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    gl.enableVertexAttribArray(this._smudgePosLoc)
    gl.vertexAttribPointer(this._smudgePosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, dab.x - tile.originX, dab.y - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, 0)
    gl.uniform1f(u.u_aspectRatio, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    buffer.endDraw()
  }

  /** Smudge's own size-keyed free list (patches *and* imprints — both are
   *  square, patch-sized and LINEAR-filtered, and a stroke cycles two or
   *  three of them per dab). Kept separate from _transformScratchPool so
   *  neither caller can be handed a buffer set up for the other's sampling. */
  private _acquireSmudgeScratchBuf(size: number): AccumulationBuffer {
    const pool = this._smudgeScratchPool
    const idx = pool.findIndex(b => b.width === size && b.height === size)
    if (idx !== -1) return pool.splice(idx, 1)[0]
    return new AccumulationBuffer(this.gl, size, size, 'linear')
  }

  private _releaseSmudgeScratchBuf(buf: AccumulationBuffer): void {
    this._smudgeScratchPool.push(buf)
  }

  // ─── Marker (#250, ADR 004 §3; compositing redesigned in a follow-up —
  // see RibbonStrokeScratch's own doc comment) ────────────────────────────

  /** Marker: each dab is a two-pass draw against this stroke's own
   *  RibbonStrokeScratch — a coverage pass (this dab's own contribution,
   *  saturating into the stroke's running total) followed by a composite
   *  draw (multiplies the tile's *original*, pre-stroke content by that
   *  running total) — see RibbonStrokeScratch's own doc comment for why
   *  this replaced the original single-pass patch-copy-then-multiply
   *  design. Still not batchable the way pencil/eraser's independent dabs
   *  are (see _paintSmudgeDabs' own doc comment for the identical
   *  justification: marker strokes are a comparatively low-frequency
   *  "shading pass" gesture, not fast scribbling, so paying two draw
   *  calls' worth of overhead per dab is an accepted cost, not a
   *  regression).
   *
   *  `ribbonScratch` omitted means this call is the *entire* stroke's dabs
   *  in one shot (replay/undo/redo/checkpoint bake/most peer-op
   *  application) — a throwaway instance scoped to just this call is
   *  exactly correct there (every dab of the stroke is handled within this
   *  one call, so "first touch" and "running coverage" both start fresh at
   *  the top and never need to survive past the end of it). Provided means
   *  this is one incremental slice of an in-progress *local* stroke
   *  (_paintStrokeDabs, the dwell tick) — the caller (engine._onStart/
   *  _onEnd) owns that instance's lifetime across every slice. */
  private _paintRibbonDabs(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string,
    color: [number, number, number],
    ribbonScratch?: RibbonStrokeScratch, prevDab?: Dab, strokeId?: string,
  ): void {
    // Transient scratch targets (live-tip/prediction preview, a peer's
    // reveal buffer) have no resolveForPaint() (only a real ILayerBuffer
    // does — see _paintRibbonStroke below, which needs it to find the
    // tile), so there's nothing this path can paint into there anyway —
    // same early-return _paintSmudgeDabs' own doc comment documents for
    // the identical structural reason. The real dabs always paint straight
    // into the real layer regardless (see _paintDabs' own doc comment on
    // `target`).
    if (target instanceof AccumulationBuffer) return
    const preset = this._resolvePreset(tool, presetName)
    const profile = ribbonProfileFor(tool, presetName)
    const chunk = ribbonScratch ? null : this._replayChunkScratch(target, strokeId, dabs, profile)
    const scratch = ribbonScratch ?? chunk?.scratch ?? new RibbonStrokeScratch(this._ribbonScratchPool, profile.ink)
    // `prevDab` is threaded the same way smudge threads its own
    // (_paintSmudgeDabs): the dab immediately before dabs[0] may come from a
    // *previous* call in the same stroke (see _paintDabs' own doc comment on
    // ribbonScratch/prevDab), and the ribbon needs it both to bridge the two
    // batches and to compute this batch's own distance-normalized ink deposit.
    this._paintRibbonStroke(target, dabs, preset, profile, color, scratch, prevDab ?? chunk?.prevDab)
    // The cached one belongs to the gesture, not to this call — it is released
    // when a different gesture arrives, or with the engine.
    if (!ribbonScratch && !chunk) scratch.destroy()
  }

  /** The scratch this replayed operation should paint through, given the
   *  gesture it belongs to — see _replayRibbonChunk. Returns null for an
   *  operation with no gesture id (a stroke recorded before strokeId existed),
   *  which then falls back to a throwaway scratch, exactly as before. */
  private _replayChunkScratch(
    target: ILayerBuffer, strokeId: string | undefined, dabs: Dab[], profile: RibbonProfile,
  ): { scratch: RibbonStrokeScratch; prevDab?: Dab } | null {
    if (!strokeId || !dabs.length) return null
    const cached = this._replayRibbonChunk
    if (cached && cached.strokeId === strokeId && cached.target === target) {
      const prevDab = cached.lastDab
      cached.lastDab = dabs[dabs.length - 1]
      return { scratch: cached.scratch, prevDab }
    }
    cached?.scratch.destroy()
    const scratch = new RibbonStrokeScratch(this._ribbonScratchPool, profile.ink)
    this._replayRibbonChunk = { strokeId, target, scratch, lastDab: dabs[dabs.length - 1] }
    return { scratch }
  }

  /** #330 — the marker's rasterizer: the stroke as one connected swept figure.
   *
   *  Three fields (coverage / inkLoad / composite, see RibbonStrokeScratch):
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
  private _paintRibbonStroke(
    target: ILayerBuffer, dabs: Dab[], preset: PencilPreset, profile: RibbonProfile,
    color: [number, number, number], scratch: RibbonStrokeScratch, prevDab: Dab | undefined,
  ): void {
    // Two different treatments of a dab too thin to resolve, and which one a
    // tool gets is the whole of RibbonProfile.minHalfWidthPx (#454). The
    // marker drops it: a sub-half-pixel marker dab is degenerate. The brush
    // pen widens it to the floor instead, because for a tool whose width
    // floor is 0.15 of a size the user may set to 3px, "drop it" means
    // deleting the thin end of every stroke — the first thing ADR 009 asks
    // the tool to be able to draw.
    //
    // Copies rather than mutating: these Dab objects are the ones recorded on
    // the StrokeOperation and streamed to peers, and a draw-time clamp must
    // not rewrite what the operation says. Being a pure function of dab.size,
    // it lands identically on every replay anyway.
    const floorPx = profile.minHalfWidthPx
    const drawable = floorPx === null
      ? dabs.filter(d => d.size * 0.5 * preset.sizeMultiplier >= 0.5)
      : dabs.map(d => {
        const half = d.size * 0.5 * preset.sizeMultiplier
        return half >= floorPx ? d : { ...d, size: (floorPx * 2) / preset.sizeMultiplier }
      })
    if (!drawable.length) return

    const { nibShape, cornerFraction } = profile

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

    const bands = buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx)

    for (const tile of targets) {
      const { original, coverage, inkLoad } = scratch.getOrCreate(tile.buffer)

      for (const dab of drawable) this._drawRibbonNibPass(coverage, tile, dab, preset, profile, 6, 0)
      if (bands.length) this._drawRibbonBands(coverage, tile, bands, 'coverage', profile.aaPx)

      // Ink follows the *same* figure as the silhouette. Depositing it only at
      // the sample stamps is what produced the rounded white notches on turns:
      // between stamps the ribbon still made the mark fully opaque, but with an
      // ink load of zero the composite multiplies by nothing and the paper
      // shows straight through. Both halves carry half a dose each (see
      // buildRibbonBands) so their overlap sums to the calibrated amount.
      //
      // Skipped entirely for a covering ink, which has no such quantity — see
      // RibbonProfile.ink.
      if (inkLoad) {
        let prev = prevDab
        for (const dab of drawable) {
          const radius = dab.size * 0.5 * preset.sizeMultiplier
          const deposit = dab.opacity * this._markerSegmentLength(dab, prev, radius) * 0.5
          inkLoad.beginAdditiveDraw()
          this._drawRibbonNibPass(inkLoad, tile, dab, preset, profile, 7, deposit, false)
          inkLoad.endDraw()
          prev = dab
        }
        if (bands.length) this._drawRibbonBands(inkLoad, tile, bands, 'ink', profile.aaPx)
      }

      // `drawable[0].opacity` rather than a per-dab value: only a tool whose
      // dabs all share one opacity can be composited from a coverage buffer at
      // all, which for the brush pen is guaranteed by _bakeDabOpacity (ADR 009
      // §9 — pressure drives width, never alpha). The marker's branch ignores
      // this argument entirely and reads its own inkLoad texture instead.
      this._drawRibbonCompositeRect(
        tile, bounds, preset, profile, original, coverage, inkLoad, color, drawable[0].opacity,
      )
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
  private _drawRibbonNibPass(
    dest: AccumulationBuffer, tile: PaintTarget, dab: Dab, preset: PencilPreset,
    profile: RibbonProfile, inkMode: 6 | 7, opacity: number, ownTarget = true,
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
    // #452: cleared, not merely unset — a liner stroke drawn a moment ago left
    // its own band on this same program (_dabProg is shared), and the marker's
    // nib geometry is sized off the quad it gets handed.
    gl.uniform1f(u.u_wickPx, 0)
    gl.uniform1f(u.u_wickCap, 0)
    gl.uniform1f(u.u_aaPx, profile.aaPx)
    gl.uniform1f(u.u_nibShape, profile.nibShape === 'roundedBox' ? 1 : 0)
    gl.uniform1f(u.u_nibCorner, radius * profile.cornerFraction)
    gl.uniform1f(u.u_inkEdge, profile.inkEdgeFalloff)

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
  private _drawRibbonBands(
    dest: AccumulationBuffer, tile: PaintTarget, bands: Float32Array, mode: 'coverage' | 'ink', aaPx: number,
  ): void {
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
    gl.uniform1f(this._ribbonUni.u_aaPx, aaPx)
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
   *  rect instead of once per dab — see _paintRibbonStroke's own doc comment for why a
   *  per-dab quad no longer covers what the coverage pass wrote.
   *
   *  The rect is covered by a circumscribing dab quad (aspect 1, angle 0,
   *  radius = half the diagonal) rather than a new full-rect program: DAB_FRAG
   *  discards outside `dist > 1`, and a circle through the rect's corners
   *  contains every pixel of it. The extra fragments cost nothing — the branch
   *  discards any pixel this stroke hasn't covered anyway. */
  private _drawRibbonCompositeRect(
    tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number },
    preset: PencilPreset, profile: RibbonProfile,
    original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer | null,
    color: [number, number, number], opacity: number,
  ): void {
    const cx = (bounds.minX + bounds.maxX) * 0.5
    const cy = (bounds.minY + bounds.maxY) * 0.5
    const radius = 0.5 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
    const rectDab: Dab = {
      x: cx, y: cy, pressure: 1, tiltX: 0, tiltY: 0,
      size: radius * 2, aspectRatio: 1, angle: 0, opacity, t: 0,
    }
    this._drawRibbonCompositeDab(tile, rectDab, radius, preset, profile, original, coverage, inkLoad, color)
  }

  /** The marker's multiply-with-darkness composite (DAB_FRAG's u_inkMode>1.5
   *  branch), reading `original`/`coverage`/`inkLoad` as plain full-tile
   *  textures (sampled via gl_FragCoord/u_resolution — no patch-relative
   *  origin/size uniforms needed, since all three are already 1:1-aligned
   *  with the tile this draws into) instead of a small per-dab copied
   *  patch. */
  private _drawRibbonCompositeDab(
    tile: PaintTarget, dab: Dab, radius: number, preset: PencilPreset, profile: RibbonProfile,
    original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer | null,
    color: [number, number, number],
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
    // "Ревизия v1.5" — see RibbonStrokeScratch's own doc comment): this
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
    // Bound even when this tool has no ink load: WebGL validates every active
    // sampler in a linked program, not only the branch that runs, and an
    // unbound one fails the draw outright (see _drawRibbonNibPass's own note
    // on the 1282 that cost an afternoon). The paper texture stands in — the
    // source-over branch never samples it, and it is guaranteed not to be the
    // render target, which would be a feedback loop.
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, inkLoad ? inkLoad.texture : this._paperTex)
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
    gl.uniform1f(u.u_inkMode, profile.compositeInkMode)
    // #454: how hard paper grain bites the brush pen's rim, read only by the
    // u_inkMode=8 branch — and set on every composite draw, not just that
    // tool's, for the same reason u_wickPx is cleared below: uniforms persist
    // across draws on a shared program.
    gl.uniform1f(u.u_paperEdge, profile.paperEdge)
    // #452 — see _drawRibbonNibPass's own comment on why this is cleared here.
    gl.uniform1f(u.u_wickPx, 0)
    gl.uniform1f(u.u_wickCap, 0)

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
    // (#365) Whether this pass is shrinking tiles on the way to its target.
    // Only then is a mip chain worth having: at or above 1:1 the base level
    // is already the right size, and generating levels nobody samples would
    // be pure cost on the one path (drawing at 100%) that must stay fast.
    // The export path sets _compositeScale to exactly 1 for the same reason
    // — see _buildContentComposite.
    const minifying = this._compositeScale < 1

    const preview = this._transformPreview.get(id)
    // (#446) A selection preview shadows only the tiles it holds — the rest of
    // the layer is standing still and must still be drawn. A whole-layer
    // preview keeps the original behaviour of replacing the layer outright:
    // every pixel of it moved, so there is nothing left to draw underneath.
    const areaPreview = preview ? this._areaPreviewLayers.has(id) : false
    if (preview) {
      for (const { originX, originY, buffer } of preview) {
        buffer.setMipSampling(minifying && buffer.ensureMipmaps())
        this._drawTileComposite(
          buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
        )
      }
      if (!areaPreview) return
    }
    const buf = this._layers.get(id)
    if (!buf) return

    if (areaPreview) {
      // Deliberately the fine tiles, never resolveCoarse: the coarse pyramid
      // has no idea a preview is shadowing anything, so a zoomed-out frame
      // would draw the pre-drag content of the very tiles being previewed,
      // right on top of the preview. A drag is transient; one frame at fine
      // resolution is the cheaper mistake.
      const shadowed = new Set((preview ?? []).map(t => `${t.originX},${t.originY}`))
      for (const { buffer, originX, originY } of buf.resolveVisible(viewRect)) {
        if (shadowed.has(`${originX},${originY}`)) continue
        buffer.setMipSampling(minifying && buffer.ensureMipmaps())
        this._drawTileComposite(
          buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
        )
      }
      return
    }

    // (#365) Which pyramid level this frame should draw, or null for the fine
    // tiles — see coarseFactorFor. The level is never more than a factor of
    // two off 1:1, so the visible tile count stays flat (~9-16 per layer)
    // across the whole zoom range instead of spiking just above a single
    // level's threshold, which is what made one specific zoom freeze: the
    // fine tiles it fell back to had been evicted while the coarse level was
    // on screen, and recovering hundreds of them at once costs an Operation
    // Log replay plus a readback and re-upload each.
    const factor = coarseFactorFor(this._compositeScale)
    const coarse = factor === null ? null : buf.resolveCoarse(viewRect, factor)
    if (coarse && factor !== null) {
      const { w: coarseW, h: coarseH } = buf.coarseWorldSize(factor)
      for (const { buffer, originX, originY } of coarse) {
        buffer.setMipSampling(buffer.ensureMipmaps())
        this._drawTileComposite(
          buffer.texture, originX, originY, coarseW, coarseH, opacity, targetFbo, targetW, targetH,
        )
      }
      return
    }

    for (const { buffer, originX, originY } of buf.resolveVisible(viewRect)) {
      buffer.setMipSampling(minifying && buffer.ensureMipmaps())
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
    // (#470) Camera-derived for a bounded room too: what is on screen is now
    // decided by where the camera is, not by the sheet being the canvas.
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

  /** (#365) Draws one fine tile, shrunk, into its slot of a coarse tile —
   *  the TileDownsampler TiledLayerBuffer is handed so it can keep its coarse
   *  level current without owning a shader.
   *
   *  Positions the slot with gl.viewport for the same reason
   *  _drawTileComposite does (see its comment on the ANGLE/D3D dropout), and
   *  refreshes the source's mip chain first so shrinking 1024 texels into 128
   *  reads filtered levels rather than one texel in sixty-four — without that
   *  the coarse level would be built out of exactly the aliasing it exists to
   *  avoid.
   *
   *  Replaces rather than blends: a slot is one fine tile's whole content,
   *  including its transparency, so blending "over" would keep whatever that
   *  tile used to hold before it was erased. */
  private _downsampleTileInto(
    source: AccumulationBuffer, dest: AccumulationBuffer,
    x: number, y: number, w: number, h: number,
  ): void {
    const { gl } = this
    // Always minifying by COARSE_FACTOR here, so this wants filtered levels
    // regardless of what the camera is doing.
    source.setMipSampling(source.ensureMipmaps())

    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo)
    // gl.viewport's y is bottom-up; slot coordinates are top-down like every
    // other buffer-pixel value in this file.
    gl.viewport(x, dest.height - (y + h), w, h)
    gl.disable(gl.BLEND)

    gl.useProgram(this._compositeProg)
    const u = this._compositeUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._compositePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, source.texture)
    gl.uniform1i(u.u_layer, 0)
    gl.uniform1f(u.u_opacity, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    // Left on a plain filter: the fold runs on every write, at every zoom,
    // so leaving mip sampling on here would quietly make the 1:1 on-screen
    // composite trilinear too — where it is meant to be an exact texel copy.
    source.setMipSampling(false)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
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

  /** Every draw in this method (tiles, split-cache halves, active layer)
   *  targets _assemblyFBO — unrotated, zoom-applied, world-centered —
   *  instead of the real (canvas-sized) `targetFbo` directly.
   *
   *  (#470) Both kinds of room, now that a bounded one is drawn through the
   *  camera too. It used to draw straight into `targetFbo` because its
   *  rotation and zoom were the DOM canvasWrap's CSS transform rather than
   *  this camera's, and its canvas was the whole sheet.
   *
   *  Unlike before #138, this no longer calls _finishInfiniteComposite
   *  itself: _composeToFBO (the only caller) still has the live-tip/
   *  predicted/peer-reveal preview buffers to blend in after real layer
   *  content but *before* the camera's rotation is baked in — those
   *  previews need the exact same unrotated `_assemblyFBO` this method
   *  leaves populated, so _composeToFBO now owns the single call to
   *  _finishInfiniteComposite once everything (real content + previews) is
   *  in place. */
  private _runComposite(items: CompositeItem[]): void {
    const viewRect = this._visibleWorldRect()
    const buildFbo = this._assemblyFBO.fbo
    const targetW  = this._assemblyFBO.width
    const targetH  = this._assemblyFBO.height
    const { padX, padY } = this._assemblyPad()
    this._compositeCenterX = this.canvas.width / 2 + padX
    this._compositeCenterY = this.canvas.height / 2 + padY
    this._compositeScale = this._infiniteCompositeScale()
    this._assemblyFBO.clear()

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
  private _infiniteRotateMatrixInv(): Matrix3 {
    const { canvas } = this
    const { angle } = this._infiniteCamera
    const { padX, padY } = this._assemblyPad()
    return composeMatrix(
      translationMatrix(canvas.width / 2 + padX, canvas.height / 2 + padY),
      composeMatrix(
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
  private _screenToWorldMatrix(): Matrix3 {
    const { canvas } = this
    const { wx, wy, zoom, angle } = this._infiniteCamera
    return composeMatrix(
      translationMatrix(wx, wy),
      composeMatrix(scaleRotateMatrix(1 / zoom, -angle), translationMatrix(-canvas.width / 2, -canvas.height / 2)),
    )
  }

  /** (#365) Binds the paper texture to TEXTURE1 for a PAPER_COMPOSE_FRAG
   *  draw, switching it to a mip filter for the duration.
   *
   *  The baked grain is ~13 texels per world unit (PAPER_BAKE_RESOLUTION over
   *  PAPER_WORLD_SIZE), and this shader takes one tap per output pixel at
   *  that pixel's world position — so it reads a single texel out of a
   *  ~13-wide footprint even at 1 world unit = 1 pixel, and out of a
   *  hundreds-wide one when the camera is zoomed out. That is the grain
   *  crawl that makes an infinite room read worse than a bounded one at the
   *  same on-screen size.
   *
   *  Switched per draw rather than set once at load because this texture is
   *  shared with the paint path (DAB_FRAG), where mip levels must never be
   *  used: level selection is implementation-defined, graphite deposit
   *  depends on the grain, and that deposit is baked into content every
   *  participant sees. See .claude/rules.md, "Cross-device pixel
   *  determinism". Callers must pair this with _releasePaperFromCompose.
   *
   *  Applied to the export path as well as the live one, both of which go
   *  through this shader: filtering only the screen would leave an exported
   *  image visibly grainier than the room it was exported from.
   *
   *  Bounded rooms never reach either path — they display through
   *  DISPLAY_FRAG (see _display) and are scaled by the browser's compositor,
   *  so their paper is untouched by all of this. */
  private _bindPaperForCompose(): void {
    const { gl } = this
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    if (this._paperMipsReady) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  }

  /** Restores the plain LINEAR filter the paint path requires — see
   *  _bindPaperForCompose. Must run after the draw that used it, before any
   *  dab can sample this texture again. */
  private _releasePaperFromCompose(): void {
    const { gl } = this
    if (!this._paperMipsReady) return
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
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
    this._bindPaperForCompose()
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
    gl.uniform4fv(u.u_pageRect, this._pageRect())
    gl.uniform3fv(u.u_deskColor, this._opts.deskColor)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._paperComposePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this._releasePaperFromCompose()
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
    sourceTex: WebGLTexture, matrixInv: Matrix3,
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
  private _bakeTransform(layerBuf: ILayerBuffer, wireMatrix: LayerTransformMatrix): void {
    // (#392) Widened here, once, for the same reason previewLayerTransform
    // does it: the two must stay pixel-identical, and a bake that read the
    // six-number form differently from the preview would show one thing during
    // the drag and another after it.
    const matrix = toHomography(wireMatrix)
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

  private _bakeTransformUnsuspended(layerBuf: ILayerBuffer, matrix: Matrix3, sourceTiles: PaintTarget[]): void {
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
        const [tx, ty] = applyMatrix(matrix, x, y)
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
        sMinX = Math.min(sMinX, tx); sMaxX = Math.max(sMaxX, tx)
        sMinY = Math.min(sMinY, ty); sMaxY = Math.max(sMaxY, ty)
      }
      srcRects.push({ minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY })
    }
    if (maxX <= minX || maxY <= minY || !Number.isFinite(minX + minY + maxX + maxY)) {
      // Degenerate (zero-scale transform, or every source tile empty) —
      // content collapses to nothing. See previewLayerTransform's identical
      // check for why non-finite bounds are refused here too (#392).
      for (const s of sourceTiles) s.buffer.clear()
      return
    }

    const destTargets = layerBuf.resolveForPaint({ minX, minY, maxX, maxY })
    const matrixInv = invertMatrix(matrix)
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
        const mc = composeMatrix(toSrcLocal, composeMatrix(matrixInv, toWorld))
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

  // ─── Selection (#446) ────────────────────────────────────────────────────────

  /** Uploads a selection's coverage mask (selectionMask.ts) as an ALPHA
   *  texture, with a one-entry cache keyed by the *identity* of the selection
   *  object.
   *
   *  The cache is what makes a gizmo drag affordable: previewAreaTransform
   *  runs on every pointer move, the selection does not change during a drag,
   *  and rasterizing a canvas-sized lasso is milliseconds of CPU that would
   *  otherwise be spent per frame. Room holds the selection in the store, so
   *  every frame of one drag really does pass the same object; a replayed
   *  operation brings its own, which correctly misses and is released as soon
   *  as the next caller arrives.
   *
   *  Null when the selection has no inside (a tap, a zero-width drag) — every
   *  caller treats that as "nothing to do" rather than as an error, which is
   *  also what makes a stray tap with the selection tool harmless. */
  private _acquireMask(selection: SelectionShape): MaskTexture | null {
    if (this._maskCache && this._maskCache.selection === selection) return this._maskCache.mask
    this._releaseMask()
    const built = buildSelectionMask(selection)
    if (!built) return null

    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // Rows are single-byte and the width is whatever the selection happened to
    // be, so the default 4-byte row alignment would shear every mask whose
    // width isn't a multiple of four — a diagonal tear that looks like a
    // rasterizer bug and isn't one.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.ALPHA, built.width, built.height, 0, gl.ALPHA, gl.UNSIGNED_BYTE, built.data,
    )
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const mask: MaskTexture = { tex, rect: built.rect }
    this._maskCache = { selection, mask }
    return mask
  }

  private _releaseMask(): void {
    if (!this._maskCache) return
    this.gl.deleteTexture(this._maskCache.mask.tex)
    this._maskCache = null
  }

  /** One AREA_MASK_FRAG pass over a whole buffer — see that shader's comment
   *  for why the two modes are one program: 'erase' punches the selection out
   *  (`dst *= 1 - coverage`), 'keep' throws away everything outside it
   *  (`dst *= coverage`). `originX/originY` is the target's world origin, so
   *  the caller never has to translate the mask. */
  private _runAreaMaskPass(
    target: AccumulationBuffer, originX: number, originY: number, mask: MaskTexture, mode: 'erase' | 'keep',
  ): void {
    const { gl } = this
    if (mode === 'erase') target.beginErase()
    else target.beginKeepDraw()
    gl.useProgram(this._areaMaskProg)
    const u = this._areaMaskUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, mask.tex)
    gl.uniform1i(u.u_mask, 0)
    gl.uniform2f(u.u_dstSize, target.width, target.height)
    gl.uniform2f(u.u_dstOrigin, originX, originY)
    gl.uniform4f(
      u.u_maskRect, mask.rect.minX, mask.rect.minY,
      mask.rect.maxX - mask.rect.minX, mask.rect.maxY - mask.rect.minY,
    )
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._areaMaskPosLoc)
    gl.vertexAttribPointer(this._areaMaskPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** The masked twin of _runTransformBlit: draws one source tile's *selected*
   *  pixels through `matrixInv` into `targetFbo`, composited over whatever is
   *  already there ("over", not replace — a destination tile can receive
   *  content from several source tiles, and it already holds the part of the
   *  layer that isn't moving). */
  private _runAreaTransformBlit(
    sourceTex: WebGLTexture, srcOriginX: number, srcOriginY: number, matrixInv: Matrix3, mask: MaskTexture,
    dstW: number, dstH: number, srcW: number, srcH: number, targetFbo: WebGLFramebuffer,
  ): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(0, 0, dstW, dstH)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this._areaTransformProg)
    const u = this._areaTransformUni

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._areaTransformPosLoc)
    gl.vertexAttribPointer(this._areaTransformPosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(u.u_source, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, mask.tex)
    gl.uniform1i(u.u_mask, 1)
    gl.activeTexture(gl.TEXTURE0)

    gl.uniform2f(u.u_dstSize, dstW, dstH)
    gl.uniform2f(u.u_srcSize, srcW, srcH)
    gl.uniform2f(u.u_srcOrigin, srcOriginX, srcOriginY)
    gl.uniform4f(
      u.u_maskRect, mask.rect.minX, mask.rect.minY,
      mask.rect.maxX - mask.rect.minX, mask.rect.maxY - mask.rect.minY,
    )
    gl.uniformMatrix3fv(u.u_matrixInv, false, toMat3(matrixInv))
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** The whole of an `area_transform`, rendered into scratch tiles — shared
   *  verbatim by the live drag preview and the committed bake, which is the
   *  point: what you see while dragging and what lands when you let go are
   *  the same pixels because they are the same code, not two implementations
   *  kept in step by hand (the failure #392 called out for the whole-layer
   *  path).
   *
   *  Each scratch is one tile of the layer's own grid, holding that tile as it
   *  will look afterwards: its current content, minus the selection (the hole
   *  the lift leaves), plus whatever part of the lifted region lands in it.
   *  Tiles that neither region touches are not built at all — the caller draws
   *  them from the real layer.
   *
   *  Every read happens before any write: the scratches are computed from the
   *  untouched layer, and only the bake copies them back afterwards. Same
   *  two-phase shape as _bakeTransformUnsuspended, and for the same WebGL1
   *  reason — a texture cannot be read and written in one draw. */
  private _composeAreaTiles(
    layerBuf: ILayerBuffer, mask: MaskTexture, matrix: Matrix3,
    tileRects: WorldRect[], acquire: (w: number, h: number) => AccumulationBuffer,
  ): Array<{ rect: WorldRect; scratch: AccumulationBuffer }> {
    const src = mask.rect
    const corners: Array<[number, number]> = [
      [src.minX, src.minY], [src.maxX, src.minY], [src.minX, src.maxY], [src.maxX, src.maxY],
    ]
    let dstMinX = Infinity, dstMinY = Infinity, dstMaxX = -Infinity, dstMaxY = -Infinity
    for (const [x, y] of corners) {
      const [tx, ty] = applyMatrix(matrix, x, y)
      dstMinX = Math.min(dstMinX, tx); dstMaxX = Math.max(dstMaxX, tx)
      dstMinY = Math.min(dstMinY, ty); dstMaxY = Math.max(dstMaxY, ty)
    }
    // A degenerate or projectively-inverted matrix collapses the selection to
    // nothing — the lift still happens (the hole is real), only nothing lands.
    // Same reasoning as _bakeTransform's own degenerate branch, including the
    // finiteness half (#392: a homography can send a corner to infinity, and
    // an infinite rect is a hang, not a wrong picture).
    const lands = Number.isFinite(dstMinX + dstMinY + dstMaxX + dstMaxY) && dstMaxX > dstMinX && dstMaxY > dstMinY
    const dst = { minX: dstMinX, minY: dstMinY, maxX: dstMaxX, maxY: dstMaxY }

    // Read-only: the source tiles the selection actually covers. Never
    // resolveForPaint — lifting reads, and a read must not create tiles.
    const sourceTiles = layerBuf.resolveVisible(src)
    const matrixInv = invertMatrix(matrix)
    const out: Array<{ rect: WorldRect; scratch: AccumulationBuffer }> = []

    for (const rect of tileRects) {
      const overlapsSrc = !(src.maxX <= rect.minX || src.minX >= rect.maxX || src.maxY <= rect.minY || src.minY >= rect.maxY)
      const overlapsDst = lands
        && !(dst.maxX <= rect.minX || dst.minX >= rect.maxX || dst.maxY <= rect.minY || dst.minY >= rect.maxY)
      if (!overlapsSrc && !overlapsDst) continue

      const w = rect.maxX - rect.minX
      const h = rect.maxY - rect.minY
      const scratch = acquire(w, h)
      const existing = this._tileBufferAt(layerBuf, rect)
      if (existing) existing.copyTo(scratch)
      else scratch.clear()

      if (overlapsSrc) this._runAreaMaskPass(scratch, rect.minX, rect.minY, mask, 'erase')
      if (overlapsDst) {
        for (const srcTile of sourceTiles) {
          const toWorld = translationMatrix(rect.minX, rect.minY)
          const toSrcLocal = translationMatrix(-srcTile.originX, -srcTile.originY)
          const mc = composeMatrix(toSrcLocal, composeMatrix(matrixInv, toWorld))
          this._runAreaTransformBlit(
            srcTile.buffer.texture, srcTile.originX, srcTile.originY, mc, mask,
            w, h, srcTile.buffer.width, srcTile.buffer.height, scratch.fbo,
          )
        }
      }
      out.push({ rect, scratch })
    }
    return out
  }

  /** The resident buffer whose world origin is this tile rect's, or null.
   *  resolveVisible is already "never create", so this is only picking the one
   *  exact tile out of what it returns. */
  private _tileBufferAt(layerBuf: ILayerBuffer, rect: WorldRect): AccumulationBuffer | null {
    for (const t of layerBuf.resolveVisible(rect)) {
      if (t.originX === rect.minX && t.originY === rect.minY) return t.buffer
    }
    return null
  }

  /** Every tile of this room's grid that the selection, or where it is going,
   *  touches. */
  private _areaTileRects(mask: MaskTexture, matrix: Matrix3): WorldRect[] {
    const { w: tw, h: th } = this._tileSize()
    const r = mask.rect
    const corners: Array<[number, number]> = [
      [r.minX, r.minY], [r.maxX, r.minY], [r.minX, r.maxY], [r.maxX, r.maxY],
    ]
    let minX = r.minX, minY = r.minY, maxX = r.maxX, maxY = r.maxY
    for (const [x, y] of corners) {
      const [tx, ty] = applyMatrix(matrix, x, y)
      if (Number.isFinite(tx) && Number.isFinite(ty)) {
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
      }
    }
    return tilesOverlappingRect({ minX, minY, maxX, maxY }, tw, th)
      .map(({ tileX, tileY }) => tileWorldRect(tileX, tileY, tw, th))
  }

  /** Bakes an `area_transform` into a layer for real. Mirrors _bakeTransform's
   *  eviction suspension for the same reason: resolveForPaint below can create
   *  several tiles at once and push this layer over its resident budget
   *  mid-bake, and an eviction firing then could destroy a tile the blit loop
   *  is still reading from — a silent GPU error, not a thrown one. */
  private _bakeAreaTransform(layerBuf: ILayerBuffer, selection: SelectionShape, wireMatrix: LayerTransformMatrix): void {
    const mask = this._acquireMask(selection)
    if (!mask) return
    const matrix = toHomography(wireMatrix)
    const tiled = layerBuf instanceof TiledLayerBuffer ? layerBuf : null
    tiled?.suspendEviction()
    try {
      const rects = this._areaTileRects(mask, matrix)
      // resolveForPaint per rect rather than once over the union: the union of
      // "where it was" and "where it went" can cover tiles neither region
      // actually reaches (a long diagonal drag), and creating those would leak
      // permanently empty tiles into the layer.
      for (const rect of rects) layerBuf.resolveForPaint(rect)
      const composed = this._composeAreaTiles(
        layerBuf, mask, matrix, rects, (w, h) => this._acquireScratchBuf(w, h),
      )
      for (const { rect, scratch } of composed) {
        const target = this._tileBufferAt(layerBuf, rect)
        if (target) {
          scratch.copyTo(target)
          // Conservative, like every other tracker update here: the moved
          // content's own AABB clipped to this tile. The hole the lift leaves
          // is deliberately not subtracted — markContentPainted only ever
          // grows, and tightenContentRects (#421) is what corrects it, on the
          // transform gizmo's own schedule.
          layerBuf.markContentPainted(rect)
        }
        this._releaseScratchBuf(scratch)
      }
    } finally {
      tiled?.resumeEviction()
    }
  }

  /** `area_clear`: erases the selection from a layer, touching only the tiles
   *  it covers. No scratch and no two-phase dance — nothing is read from the
   *  layer here, every pixel is multiplied in place. */
  private _clearArea(layerBuf: ILayerBuffer, selection: SelectionShape): void {
    const mask = this._acquireMask(selection)
    if (!mask) return
    for (const target of layerBuf.resolveVisible(mask.rect)) {
      this._runAreaMaskPass(target.buffer, target.originX, target.originY, mask, 'erase')
    }
  }

  /** Draws a decoded raster into `target` — whose world origin is
   *  (originX, originY) — placed at `rect` and then moved by `matrix`.
   *
   *  Two passes rather than one, and the intermediate buffer is the reason:
   *  the image arrives with straight alpha and everything downstream works in
   *  premultiplied, so it goes through IMAGE_BLIT_FRAG (which premultiplies)
   *  into a scratch the size of its own rect, and only then through the
   *  ordinary transform blit, which resamples premultiplied content correctly.
   *  Sampling the raw image through the transform blit directly would blend
   *  straight-alpha texels at every filtered edge — a dark rim around
   *  everything pasted, which is precisely what un-premultiplied filtering
   *  looks like. */
  private _drawImageThroughMatrix(
    target: AccumulationBuffer, originX: number, originY: number,
    img: HTMLImageElement, rect: { x: number; y: number; width: number; height: number },
    matrix: Matrix3,
  ): void {
    const { gl } = this
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    const scratch = this._acquireScratchBuf(w, h)
    scratch.clear()

    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    scratch.beginDraw()
    gl.useProgram(this._blitProg)
    const u = this._blitUni
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u.u_image, 0)
    gl.uniform2f(u.u_bufferSize, w, h)
    gl.uniform4f(u.u_imageRect, 0, 0, w, h)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._blitPosLoc)
    gl.vertexAttribPointer(this._blitPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    scratch.endDraw()
    gl.deleteTexture(texture)

    // target-local -> world -> pre-matrix world -> scratch-local (the rect's
    // own origin). Same composition the masked transform builds, with the
    // raster's rect standing in for a source tile.
    const toWorld = translationMatrix(originX, originY)
    const toRectLocal = translationMatrix(-rect.x, -rect.y)
    const mc = composeMatrix(toRectLocal, composeMatrix(invertMatrix(matrix), toWorld))
    this._runTransformBlit(scratch.texture, mc, target.width, target.height, w, h, target.fbo)
    this._releaseScratchBuf(scratch)
  }

  /** See PencilEngineAPI's doc comment. */
  previewAreaPaste(
    layerId: string, image: string,
    rect: { x: number; y: number; width: number; height: number },
    wireMatrix: LayerTransformMatrix,
  ): void {
    const layerBuf = this._layers.get(layerId)
    const img = this._imageCache.get(image)
    const oldByOrigin = new Map(
      (this._transformPreview.get(layerId) ?? []).map(t => [`${t.originX},${t.originY}`, t]),
    )
    if (!layerBuf || !img) {
      for (const t of oldByOrigin.values()) t.buffer.destroy()
      this._transformPreview.delete(layerId)
      this._areaPreviewLayers.delete(layerId)
      this._display()
      return
    }

    const matrix = toHomography(wireMatrix)
    // Which tiles the piece covers *now* — its rect through the matrix. The
    // layer's own content is untouched by a paste, so unlike the lift there is
    // no second region (the hole) to account for.
    const { w: tw, h: th } = this._tileSize()
    const corners: Array<[number, number]> = [
      [rect.x, rect.y], [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
    ]
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of corners) {
      const [tx, ty] = applyMatrix(matrix, x, y)
      minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
      minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
    }
    if (!(maxX > minX) || !(maxY > minY) || !Number.isFinite(minX + minY + maxX + maxY)) {
      for (const t of oldByOrigin.values()) t.buffer.destroy()
      this._transformPreview.delete(layerId)
      this._areaPreviewLayers.delete(layerId)
      this._display()
      return
    }

    const tiles: PreviewTile[] = []
    const reused = new Set<string>()
    for (const { tileX, tileY } of tilesOverlappingRect({ minX, minY, maxX, maxY }, tw, th)) {
      const tileRect = tileWorldRect(tileX, tileY, tw, th)
      const key = `${tileRect.minX},${tileRect.minY}`
      const old = oldByOrigin.get(key)
      const scratch = old ? old.buffer : new AccumulationBuffer(this.gl, tw, th)
      if (old) reused.add(key)
      const existing = this._tileBufferAt(layerBuf, tileRect)
      if (existing) existing.copyTo(scratch)
      else scratch.clear()
      this._drawImageThroughMatrix(scratch, tileRect.minX, tileRect.minY, img, rect, matrix)
      tiles.push(old ?? { originX: tileRect.minX, originY: tileRect.minY, buffer: scratch })
    }
    for (const [key, t] of oldByOrigin) {
      if (!reused.has(key)) t.buffer.destroy()
    }

    this._transformPreview.set(layerId, tiles)
    this._areaPreviewLayers.add(layerId)
    this._display()
  }

  /** An `area_paste` in `image_import` clothing. Paste and import differ in
   *  where the pixels come from and what they are allowed to land on — not in
   *  how a straight-alpha raster becomes premultiplied layer content, nor in
   *  what has to happen when its decode finishes after the operations behind
   *  it were already applied. So the whole decoded/undecoded/late-arrival
   *  dance (#398: _paintDecodedImage, _paintImage, _settleLateImage) is
   *  reused as-is rather than reimplemented for a second raster operation.
   *
   *  Placement rides the `x`/`y` fields image_import added for infinite rooms:
   *  present means "natural size at this world position", which is exactly
   *  what paste-in-place means. */
  private _asImportRecord(op: AreaPasteOperation | AreaFillOperation): ImageImportOperation {
    return {
      id: op.id, userId: op.userId, timestamp: op.timestamp, seq: op.seq,
      type: 'image_import', layerId: op.layerId, image: op.image,
      x: op.x, y: op.y, width: op.width, height: op.height,
    }
  }

  /** See PencilEngineAPI's doc comment. Same lifecycle as
   *  previewLayerTransform — call per drag frame, then
   *  clearLayerTransformPreview once the operation is appended or the drag is
   *  abandoned.
   *
   *  The tile buffers here are plain AccumulationBuffers keyed by origin and
   *  reused between frames, exactly as the whole-layer preview does it and for
   *  the same measured reason: allocating a tile-sized texture + FBO per
   *  pointer move is what made dragging stutter on a Surface (#142
   *  follow-up). */
  previewAreaTransform(layerId: string, selection: SelectionShape, matrix: LayerTransformMatrix): void {
    const layerBuf = this._layers.get(layerId)
    const mask = layerBuf ? this._acquireMask(selection) : null
    const oldByOrigin = new Map(
      (this._transformPreview.get(layerId) ?? []).map(t => [`${t.originX},${t.originY}`, t]),
    )
    if (!layerBuf || !mask) {
      for (const t of oldByOrigin.values()) t.buffer.destroy()
      this._transformPreview.delete(layerId)
      this._areaPreviewLayers.delete(layerId)
      this._display()
      return
    }

    const reused = new Set<string>()
    const composed = this._composeAreaTiles(
      layerBuf, mask, toHomography(matrix), this._areaTileRects(mask, toHomography(matrix)),
      (w, h) => {
        // Keyed on size alone would be wrong if a room could change its tile
        // grid mid-session; it cannot (see _tileSize), so the origin key below
        // is enough and this only has to hand back *a* buffer of the right
        // size. The origin match happens in the loop that consumes this.
        void w; void h
        return new AccumulationBuffer(this.gl, w, h)
      },
    )

    // The acquire callback above cannot see which origin it is being called
    // for, so reuse is settled here: a tile that existed last frame keeps its
    // buffer and the freshly allocated one is thrown away. Wasteful only on
    // the frames where nothing changed — and those are precisely the frames
    // where the *content* changed, which is why the buffer has to be redrawn
    // anyway.
    const tiles: PreviewTile[] = []
    for (const { rect, scratch } of composed) {
      const key = `${rect.minX},${rect.minY}`
      const old = oldByOrigin.get(key)
      if (old) {
        scratch.copyTo(old.buffer)
        scratch.destroy()
        reused.add(key)
        tiles.push(old)
      } else {
        tiles.push({ originX: rect.minX, originY: rect.minY, buffer: scratch })
      }
    }
    for (const [key, t] of oldByOrigin) {
      if (!reused.has(key)) t.buffer.destroy()
    }

    this._transformPreview.set(layerId, tiles)
    // The flag that makes _drawCompositeItem draw the rest of this layer from
    // its real tiles instead of treating the preview as the whole layer.
    this._areaPreviewLayers.add(layerId)
    this._display()
  }

  /** See PencilEngineAPI's doc comment.
   *
   *  Flattens the selection's bounding box out of the layer's tiles into one
   *  patch, cuts it down to the selection's own shape (AREA_MASK_FRAG in
   *  'keep' mode), un-premultiplies on the way out and encodes a PNG. The
   *  un-premultiply is not optional: layer buffers store premultiplied colour
   *  and PNG is straight alpha, so skipping it would darken every partly
   *  transparent pixel — i.e. exactly the antialiased rim of every lasso. */
  async readAreaImage(layerId: string, selection: SelectionShape): Promise<AreaImage | null> {
    const layerBuf = this._layers.get(layerId)
    if (!layerBuf) return null
    const mask = this._acquireMask(selection)
    if (!mask) return null

    const { gl } = this
    const { minX, minY, maxX, maxY } = mask.rect
    const w = maxX - minX, h = maxY - minY
    if (w <= 0 || h <= 0) return null

    const patch = new AccumulationBuffer(gl, w, h)
    patch.clear()
    // Straight world-aligned copies rather than _drawTileComposite, which
    // reads the live camera (and would need _buildContentComposite's whole
    // save/override/restore dance to be told to ignore it). A pure
    // translation through the transform blit is the same pixels with none of
    // that: patch-local (0,0) is world (minX, minY) by construction.
    for (const { buffer, originX, originY } of layerBuf.resolveVisible(mask.rect)) {
      this._runTransformBlit(
        buffer.texture, translationMatrix(minX - originX, minY - originY),
        w, h, buffer.width, buffer.height, patch.fbo,
      )
    }
    this._runAreaMaskPass(patch, minX, minY, mask, 'keep')

    const pixels = patch.readPixels()
    patch.destroy()
    const blob = await this._pixelsToPngBlob(unpremultiply(pixels), w, h)
    if (!blob) return null
    const image = await blobToDataUrl(blob)
    return image ? { image, x: minX, y: minY, width: w, height: h } : null
  }

  /** (#453) The rect a fill is allowed to spread over.
   *
   *  A flood fill needs an edge to stop at, and on this canvas that is not a
   *  given: layer storage is a sparse map of tiles that come into existence
   *  when something is painted on them, so "outward from an untouched pixel"
   *  has no end. A room with a canvas has the obvious answer and uses it — the
   *  canvas, exactly as a bucket behaves in every editor with a page. An
   *  infinite room (#436 took those off the create screen, but rooms made
   *  before it are still in production) has no page, so the drawing itself
   *  stands in for one: the content bounds of whatever the fill is reading,
   *  with a margin so paint can spread a little past the outermost mark.
   *
   *  Capped to a `FILL_MAX_DIM` box centred on the seed in both cases. That
   *  cap is a real limit on what a single fill can cover, and it is deliberate
   *  rather than defensive: the alternative on a drawing spanning tens of
   *  thousands of world units is a readback and a scan nobody's tablet
   *  finishes. A fill poured into an outline that is not closed stops at the
   *  cap rather than at the drawing, and that is the intended behaviour: it
   *  fills, and the way back is undo. */
  private _fillDomain(items: CompositeItem[], seedX: number, seedY: number): WorldRect {
    const half = FILL_MAX_DIM / 2
    const cap: WorldRect = {
      minX: Math.floor(seedX - half), minY: Math.floor(seedY - half),
      maxX: Math.ceil(seedX + half), maxY: Math.ceil(seedY + half),
    }
    let rect: WorldRect
    if (!this._infinite) {
      rect = { minX: 0, minY: 0, maxX: this.canvas.width, maxY: this.canvas.height }
    } else {
      // Union of what the source layers actually hold. Tracked per tile and
      // never read back from the GPU (see ILayerBuffer.getContentBoundsWorld),
      // so this costs nothing even on a long room.
      let union: WorldRect | null = null
      for (const { id } of items) {
        const bounds = this._layers.get(id)?.getContentBoundsWorld()
        if (!bounds) continue
        union = union === null ? bounds : {
          minX: Math.min(union.minX, bounds.minX), minY: Math.min(union.minY, bounds.minY),
          maxX: Math.max(union.maxX, bounds.maxX), maxY: Math.max(union.maxY, bounds.maxY),
        }
      }
      // A tap outside the drawing (or on a blank canvas) still has to fill
      // *something*, so the seed's own neighbourhood joins the domain rather
      // than the fill silently doing nothing.
      const margin = INFINITE_FILL_MARGIN
      rect = union === null ? cap : {
        minX: Math.min(union.minX - margin, seedX - margin), minY: Math.min(union.minY - margin, seedY - margin),
        maxX: Math.max(union.maxX + margin, seedX + margin), maxY: Math.max(union.maxY + margin, seedY + margin),
      }
    }
    return {
      minX: Math.max(Math.floor(rect.minX), cap.minX), minY: Math.max(Math.floor(rect.minY), cap.minY),
      maxX: Math.min(Math.ceil(rect.maxX), cap.maxX), maxY: Math.min(Math.ceil(rect.maxY), cap.maxY),
    }
  }

  /** (#453) Flattens `items` (bottom→top, each at its own effective opacity)
   *  over `rect` into one premultiplied RGBA8 buffer — the pixels a fill reads
   *  its boundaries from.
   *
   *  World-aligned blits rather than the real composite path, for the reason
   *  readAreaImage gives: `_runComposite` is written against the live camera,
   *  and a fill's domain has nothing to do with where the camera is looking.
   *  It also must not include the paper pass — paper is composited at display
   *  time and is not in any layer, and sampling it back in would hand the fill
   *  the grain as if it were drawing, which is exactly how a naive bucket
   *  shatters a region into islands.
   *
   *  Rows come back in GL order (bottom-up); see computeAreaFill for where
   *  that is undone. */
  private _readFillSource(rect: WorldRect, items: CompositeItem[]): Uint8Array | null {
    const { gl } = this
    const w = rect.maxX - rect.minX
    const h = rect.maxY - rect.minY
    if (w <= 0 || h <= 0) return null

    const patch = new AccumulationBuffer(gl, w, h)
    patch.clear()
    const single = items.length === 1 && items[0].opacity >= 1
    const layerPatch = single ? null : new AccumulationBuffer(gl, w, h)
    for (const { id, opacity } of items) {
      const layerBuf = this._layers.get(id)
      if (!layerBuf || opacity <= 0) continue
      // One layer at full opacity is the common case (filling against the
      // active layer alone) and needs no intermediate at all.
      const dest = layerPatch ?? patch
      if (layerPatch) layerPatch.clear()
      for (const { buffer, originX, originY } of layerBuf.resolveVisible(rect)) {
        this._runTransformBlit(
          buffer.texture, translationMatrix(rect.minX - originX, rect.minY - originY),
          w, h, buffer.width, buffer.height, dest.fbo,
        )
      }
      if (layerPatch) this._compositeTextures([{ texture: layerPatch.texture, opacity }], patch.fbo, w, h)
    }
    const pixels = patch.readPixels()
    patch.destroy()
    layerPatch?.destroy()
    return pixels
  }

  /** See PencilEngineAPI's doc comment. */
  async computeAreaFill(request: AreaFillRequest): Promise<AreaFillRaster | null> {
    const { layerId, seedX, seedY, color, tolerance, gapClose, expand, source } = request
    if (!this._layers.has(layerId)) return null
    // 'visible' reads the composite of every visible layer — lineart on top,
    // colour going into the layer underneath, which is the whole reason the
    // mode exists (ADR 010). 'layer' reads only the target.
    const items = source === 'visible'
      ? this._compositeOrder.filter(it => this._layers.has(it.id))
      : [{ id: layerId, opacity: 1 }]
    if (items.length === 0) return null

    const rect = this._fillDomain(items, seedX, seedY)
    const w = rect.maxX - rect.minX
    const h = rect.maxY - rect.minY
    if (w <= 0 || h <= 0) return null
    const pixels = this._readFillSource(rect, items)
    if (!pixels) return null

    // readPixels hands back rows bottom-up, and flipping a domain-sized buffer
    // to fix that would be a pointless copy of up to 64 MB: the fill itself is
    // orientation-blind, so it runs in GL rows and only the two y coordinates
    // that leave this method are converted back. `_pixelsToPngBlob` flips on
    // the way out, so the cropped raster is already in the order it wants.
    const seedCol = Math.floor(seedX) - rect.minX
    const seedRow = (h - 1) - (Math.floor(seedY) - rect.minY)
    const paper = this._opts.paperColor ?? paperColorOf(this._opts.paper)
    const result = computeFill(
      {
        pixels, width: w, height: h,
        background: [
          Math.round(paper[0] * 255), Math.round(paper[1] * 255), Math.round(paper[2] * 255),
        ],
      },
      { seedX: seedCol, seedY: seedRow, tolerance, gapClose, expand },
    )
    if (!result.bounds) return null

    const rgb: [number, number, number] = [
      Math.round(color[0] * 255), Math.round(color[1] * 255), Math.round(color[2] * 255),
    ]
    const cropped = coverageToRgba(result.coverage, w, result.bounds, rgb)
    const blob = await this._pixelsToPngBlob(cropped.pixels, cropped.width, cropped.height)
    if (!blob) return null
    const image = await blobToDataUrl(blob)
    if (!image) return null
    return {
      image,
      x: rect.minX + result.bounds.minX,
      // GL rows counted from the bottom of the domain, world y counted from
      // its top: the crop's *last* row is the one nearest the top edge.
      y: rect.minY + (h - result.bounds.maxY),
      width: cropped.width,
      height: cropped.height,
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
    // (#470) No longer gated on room kind: every room composites through the
    // assembly buffer now, so _compositeFBO is only built when a caller
    // genuinely wants the rotated canvas-sized copy (the transparent export).
    const skipCompositeFBO = !needCompositeFBO

    if (!skipCompositeFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._compositeFBO.fbo)
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    this._runComposite(this._compositeOrder)

    const buildFbo = this._assemblyFBO.fbo
    const buildW   = this._assemblyFBO.width
    const buildH   = this._assemblyFBO.height

    // Camera-relative blend of one preview buffer, world rect [origin,
    // origin+(w,h)] — see this method's own doc comment above.
    const blendPreview = (texture: WebGLTexture, origin: { x: number; y: number }): void => {
      this._drawTileComposite(texture, origin.x, origin.y, w, h, 1, buildFbo, buildW, buildH)
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
    // (#470) One path for both kinds of room. A bounded room used to take a
    // screen-locked DISPLAY_FRAG pass over a sheet-sized _compositeFBO, which
    // only worked because its canvas *was* the sheet; now that the camera
    // decides what is on screen, the world-space paper pass an infinite room
    // already used is the correct one for both, and the sheet is expressed to
    // it as a rectangle (see _pageRect).
    this._composeToFBO(false)
    // _composePaperToScreen manages its own framebuffer/viewport/blend state,
    // mirroring _runComposite/_finishInfiniteComposite's division of labor, so
    // nothing needs setting up here first.
    this._composePaperToScreen()
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
  private _buildContentComposite(
    rect: { x: number; y: number; width: number; height: number } | null = null,
  ): { bounds: { x: number; y: number; width: number; height: number }; buffer: AccumulationBuffer } | null {
    // (#470) An explicit rect is the bounded room's sheet — export it whole,
    // blank margins and all, because the sheet's own edges are part of the
    // picture there. Without one (an infinite room) the drawing's content
    // bounds are the only rect that means anything.
    const raw = rect ?? this._allVisibleContentBounds()
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
   *  hand). */
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
    this._bindPaperForCompose()
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
    // No desk on an export: the target *is* the sheet (or, for an infinite
    // room, the drawing's own bounds), so every pixel of it is paper. Saying
    // "no page" here is what keeps a stray edge fade out of the exported
    // image.
    gl.uniform4f(u.u_pageRect, 0, 0, -1, -1)
    gl.uniform3fv(u.u_deskColor, this._opts.deskColor)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._paperComposePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this._releasePaperFromCompose()

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
  private _exportOffscreenPNG(
    transparent: boolean, rect: { x: number; y: number; width: number; height: number } | null,
  ): Promise<Blob | null> {
    const composite = this._buildContentComposite(rect)
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
