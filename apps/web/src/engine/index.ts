import { hasActiveWater, wetReplayOperationIds } from './src/oplog/hasActiveWater'
import { LayerCompositor, type CompositeItem, type WashReveal } from './src/raster/LayerCompositor'
export type { CompositeItem } from './src/raster/LayerCompositor'
import { pureWaterLayerProof } from './src/watercolor/pureWaterLayerProof'
import { WatercolorSettlePlan, type WatercolorSettlePreview } from './src/raster/WatercolorSettlePlan'
import { WatercolorCanonicalFIFO } from './src/watercolor/WatercolorCanonicalFIFO'
import { WatercolorSettleQueue, type WatercolorSettleLifecycle } from './src/watercolor/WatercolorSettleQueue'
import { destroyField, type SettleField } from './src/buffers/SettleField'
import { WC_HALF_RES_RADIUS_PX } from './src/watercolor/settleResolution'
import { WatercolorPasses } from './src/raster/WatercolorPasses'
import { RibbonPasses } from './src/raster/RibbonPasses'
import { RibbonStrokePainter, type RibbonLiveComposite } from './src/dabs/RibbonStrokePainter'
import { rectOnTile, ribbonWaterDelivery } from './src/dabs/ribbonStrokeMath'
import { nanoid } from 'nanoid'
import type { PaperType, Dab, ToolType, Operation, StrokeOperation, ImageImportOperation, LayerTransformMatrix, SelectionShape, ShapeGeometry, ShapeFrame, ShapeStroke, ShapeFill, LayerFilter } from '@grafetto/shared'
import { DISPLAY_VERT, PAPER_COMPOSE_FRAG, WASH_REVEAL_FRAG, SCREEN_BLIT_FRAG } from './src/raster/shaders'
import { washRevealHold, washRevealStep } from './src/raster/washReveal'
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/raster/utils'
import { PaperState } from './src/paper/PaperState'
import { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
import { CheckpointStore, type Checkpoint } from './src/oplog/checkpointStore'
import { ScratchSlot } from './src/buffers/scratchPools'
import { RibbonReplayCache, type ReplayRibbonChunk } from './src/buffers/RibbonReplayCache'
import { RibbonScratchPool } from './src/buffers/RibbonScratchPool'
import { RibbonStrokeScratch, scratchSnapshotBytes, freeScratchSnapshot, type RibbonTileScratch, type ScratchSnapshot, type RibbonCanonicalFinish } from './src/buffers/RibbonStrokeScratch'
import { SnapshotLedger } from './src/oplog/snapshotLedger'
import { SnapshotIO } from './src/oplog/SnapshotIO'
import { StructuralOps } from './src/oplog/structuralOps'
import { BlitPasses } from './src/raster/blitPasses'
import { AreaOps, asImportRecord, type AreaImage, type AreaFillRequest, type AreaFillRaster } from './src/raster/AreaOps'
import { LayerPreviews } from './src/raster/layerPreviews'
import { frameEdgeX, frameEdgeY, type CameraFrame } from './src/raster/cameraFrame'
import { Camera, translateDabs } from './src/raster/Camera'
import { ImageImport } from './src/raster/ImageImport'
import { ShapePass } from './src/raster/ShapePass'
import { FilterPass } from './src/filters/FilterPass'
import { Exporter } from './src/export/Exporter'
import { SmudgePainter } from './src/dabs/SmudgePainter'
import { BrushPainter } from './src/dabs/BrushPainter'
import { StampPainter, dabWorldHalfExtents } from './src/dabs/StampPainter'
import { bakeDabOpacity } from './src/dabs/dabOpacity'
import { codecDab } from './src/dabs/codecDab'
import { nibScallops, presetForTool, renderSizeScale, resolveGrainMode } from './src/presets/resolvePreset'
import {
  charcoalNibFromPreset, charcoalPresetString,
  CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE, CHARCOAL_GRAIN_STREAKY, isCharcoalType,
  CHARCOAL_NIBS, DEFAULT_CHARCOAL_NIB, isCharcoalNib,
  type CharcoalPreset, type CharcoalType, type CharcoalNib,
} from './src/presets/charcoalPresets'
import {
  CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS,
  type CharcoalFeelConfig,
} from './src/presets/charcoalFeel'
import { DabSystem } from './src/dabs/DabSystem'
import {
  DEFAULT_NIB_ANCHOR, NIB_ANCHORS, isNibAnchor, shapingForTool, type NibAnchor,
} from './src/presets/dabShaping'
import { tipFootprint } from './src/dabs/tipFootprint'
import { DEFAULT_DAB_SPACING_FACTOR, isFootprintSpacedTool } from './src/dabs/dabSpacing'
import {
  PENCIL_TILT, PENCIL_TILT_SLIDERS,
  type PencilTiltConfig,
} from './src/presets/pencilTilt'
import { SMUDGE_GRAIN, SMUDGE_GRAIN_SLIDERS, type SmudgeGrainConfig } from './src/presets/smudgeGrain'
import {
  DEFAULT_TILT_RESPONSE, TILT_RESPONSES, isTiltResponse, tiltResponseT, type TiltResponse,
} from './src/presets/tiltCurve'
import type { NibAngleConfig } from './src/presets/markerPresets'
import {
  OperationLog, pixelReadLayerIds, pixelWriteLayerIds, type LogEntry, type PixelOperation,
} from './src/oplog/OperationLog'
import { PointerInput, type DiagLog, type PointerData, type PressureMap } from './src/input/PointerInput'
import {
  PENCIL_PRESETS, PENCIL_GRADES, GRAPHITE_GRAIN_DEFAULT,
  type PencilGradeName, type PencilPreset,
} from './src/presets/pencilPresets'
import {
  LINER_SIZES_MM, linerTiltFlow, applyLinerEndTaper,
  dwellConfigForTool, dwellFlow,
  type DwellConfig, type LinerSizeMm,
} from './src/presets/linerPresets'
import {
  digitalBrushFromPreset, digitalBrushMixer,
  type BrushDescriptor, type BrushPressureSettings,
} from './src/presets/digitalBrushPresets'
export {
  DIGITAL_BRUSHES, DIGITAL_BRUSH_IDS, DEFAULT_DIGITAL_BRUSH, BRUSH_CATEGORIES,
  digitalBrushFromPreset, digitalBrushPreset, digitalBrushFlowFromPreset, digitalBrushPressureFromPreset,
  type BrushDescriptor, type BrushTip, type BrushCategory, type BrushPressureSettings,
} from './src/presets/digitalBrushPresets'
import { appendWatercolorLift } from './src/presets/watercolorLift'



import { PaperWetness, quantizeWet, isDryProfile, wetAt, wetPeak, WET_CELL_PX, WET_DRY_MS } from './src/paper/paperWetness'
import { wetOverlayPixels, wetOverlayWorkspace, type WetOverlayWorkspace } from './src/paper/wetOverlayPixels'

export { WATERCOLOR_ROUND } from './src/presets/watercolorPresets'

import { type WaterSource } from './src/watercolor/foreignWater'

import { isRibbonTool, ribbonProfileFor, type RibbonProfile } from './src/dabs/ribbonProfile'
import {
  applyBrushPenEndTaper,
  PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, isPressureResponse, brushPenWidth,
  type PressureResponse,
} from './src/presets/brushPenPresets'
import { applyWatercolorEndTaper, watercolorWashSignature, mottleSeedFromStrokeId, applyWatercolorPooling, watercolorBloomStrength, watercolorBloomPush, watercolorPuddleMerge, WC_RIM_BAND_PX, watercolorPaperDrained, watercolorMixFromPreset } from './src/presets/watercolorPresets'
import { HapticGrain, type HapticGrainStats } from './src/presets/HapticGrain'
import {
  applyMatrix, invertMatrix, toMat3, translationMatrix,
  IDENTITY_MATRIX, type Matrix3,
} from './src/raster/matrix'
import { snapToRuler, type RulerLine } from './src/input/rulerSnap'
import { TiledLayerBuffer, type TileRebuilder, type TileRebuildSession } from './src/buffers/TiledLayerBuffer'
import type { ILayerBuffer, PaintTarget } from './src/buffers/ILayerBuffer'
import { TILE_SIZE, tilesOverlappingRect, tileWorldRect, type WorldRect } from './src/buffers/tileMath'
import { packTilePixels, unpackTilePixels } from './src/buffers/pinnedTiles'
import type { SnapshotTile } from './src/oplog/snapshotCodec'
import type { SnapshotRestoreAudit } from './src/oplog/snapshotAudit'
import { packDabs, strokeDabs } from '@grafetto/shared'

export type { HapticGrainStats }
export type { DiagLog, PressureMap } from './src/input/PointerInput'
// (#574) What the filter dialog needs to draw a curve and to tell a no-op
// from a real change — the same functions the engine applies, so the dialog's
// graph is the curve that will actually be used.
export { curveLut, isIdentityFilter, normalizeLayerFilter } from './src/filters/layerFilters'
export type { ReviewExport } from './src/export/Exporter'
export { pixelWriteLayerIds } from './src/oplog/OperationLog'
/** Original journal fold for snapshot structure validation, without buffers. */
export function doneOperationsFromHistory(operations: readonly Operation[]): Operation[] {
  const log = new OperationLog()
  for (const op of operations) {
    log.append(op)
    if (op.type === 'operation_undo') log.applyUndo(op.targetOpId, op.userId)
    else if (op.type === 'operation_redo') log.applyRedo(op.targetOpId, op.userId)
    else if (op.type === 'operation_revoke') log.revoke(op.targetOpId)
  }
  return log.doneOperations()
}
// (#345, #493) The paper download's progress, for the room's loading overlay.
export { subscribePaperLoadProgress, type PaperLoadProgress } from './src/paper/paperLoader'
export type { Matrix3 }
export type { AreaImage, AreaFillRequest, AreaFillRaster } from './src/raster/AreaOps'
export type { RulerLine }

export { PENCIL_PRESETS, PENCIL_GRADES, GRAPHITE_GRAIN_DEFAULT, type PencilGradeName, type PencilPreset }
export { LINER_SIZES_MM, type LinerSizeMm }
export {
  CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE, CHARCOAL_GRAIN_STREAKY, isCharcoalType,
  // #501: the nib list and the string that carries it, for the settings panel
  // that offers them — same split as watercolor's below (what a nib *is*
  // belongs to the engine, how it is labelled and offered belongs to the UI).
  CHARCOAL_NIBS, DEFAULT_CHARCOAL_NIB, isCharcoalNib, charcoalNibFromPreset, charcoalPresetString,
  type CharcoalType, type CharcoalPreset, type CharcoalNib,
}
export { CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS, type CharcoalFeelConfig }
export { PENCIL_TILT, PENCIL_TILT_SLIDERS, type PencilTiltConfig }
export { SMUDGE_GRAIN, SMUDGE_GRAIN_SLIDERS, type SmudgeGrainConfig }
// #482, ADR 012 §3 — the frame a nib's angle is measured in. The UI needs the
// option list, the default and the guard for the same reasons it needs the tilt
// responses' below: what the frames *are* belongs to the engine, how they are
// labelled and offered belongs to the UI.
export { NIB_ANCHORS, DEFAULT_NIB_ANCHOR, isNibAnchor, type NibAnchor }
// #409: the UI needs the option list and its default to build the setting, the
// guard to validate a stored value, and the curve itself to draw each option's
// own graph in the picker. Deliberately the raw function rather than a
// ready-made SVG path: what a response *is* belongs to the engine, how it is
// drawn belongs to the UI.
export { TILT_RESPONSES, DEFAULT_TILT_RESPONSE, isTiltResponse, tiltResponseT, type TiltResponse }
// #454 — the brush pen's own response setting, the pressure counterpart of
// the tilt one right above. Re-exported for toolSchemas.ts, which owns the
// UI side of it.
export {
  WATERCOLOR_MIX_PRESETS, WATERCOLOR_MIX_BY_PRESET, WATERCOLOR_MIX_DEFAULT,
  watercolorPresetString, watercolorMixFromPreset, isWatercolorMixPreset,
  watercolorPigmentFromPreset,
  // #489: the nib list, for the settings panel that offers it.
  WATERCOLOR_NIBS, DEFAULT_WATERCOLOR_NIB, isWatercolorNib, watercolorNibFromPreset,
  type WatercolorMix, type WatercolorMixPreset, type WatercolorNib,
} from './src/presets/watercolorPresets'
export {
  WATERCOLOR_PIGMENTS, WATERCOLOR_PIGMENT_CODES, WATERCOLOR_PIGMENT_SWATCHES,
  DEFAULT_WATERCOLOR_PIGMENT, watercolorPigmentByCode, isWatercolorPigmentCode,
  type WatercolorPigment,
} from './src/presets/watercolorPigments'
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
  nibAngle?: NibAngleConfig,
  // #409: the same response the engine has been given, so the hover outline
  // keeps matching the mark — the cursor is how the setting is *seen* before
  // anything is drawn with it, so a preview left on the default would quietly
  // lie about the tool the moment the setting moved off it.
  tiltResponse?: TiltResponse,
  // #482: the viewport's own rotation, for the same reason DabSystem carries it
  // — the returned angle is world-space (the cursor's DOM ancestor applies the
  // viewport transform on top of it, see BrushCursor's own comment), while the
  // tilt this may be derived from is the device's reading against the screen.
  // Left defaulted so a caller with no rotation to speak of is unaffected.
  cameraAngle = 0,
): { size: number; aspectRatio: number; angle: number } {
  // #482, ADR 012: the same tipFootprint() the recorded dabs go through, not a
  // second copy of its formula. `state: null` is the honest answer for a hover
  // and not a limitation — a flexible nib is bent by being *dragged*, and a
  // pointer that is merely hovering has dragged nothing, so its rest pose is
  // round. That is also why this agrees with the first dab of a real stroke,
  // which starts from a freshly-zeroed tip state.
  const { size, aspectRatio, angle } = tipFootprint(
    shapingForTool(tool, presetName, nibAngle, tiltResponse),
    { x: 0, y: 0, pressure, tiltX, tiltY, baseSize, pathAngle, ds: 0, speed: 0, cameraAngle },
    null,
  )
  // #547: scaled by the same multiplier every paint path applies on the way to
  // the screen (`d.size * 0.5 * preset.sizeMultiplier`), which this had never
  // done — so the outline drew `Dab.size`, a number the renderer never puts on
  // the canvas unscaled.
  //
  // It went unnoticed because it was small everywhere it applied: a 6H cursor
  // was half again too wide, an ink-round one exact. The digital brush's flat
  // tip made it impossible to miss — its multiplier is 0.25, so the outline was
  // four times the mark. Fixed for every tool rather than special-cased, since
  // "the cursor is how a tool's settings are seen before a mark exists" is the
  // whole justification this function carries in its own doc comment.
  return { size: size * renderSizeScale(tool, presetName ?? ''), aspectRatio, angle }
}

/** (#470) The neutral the sheet sits on when a caller names no theme colour.
 *  Deliberately dark and desaturated: it frames the paper without competing
 *  with it, and it matches the editor's own surround so the seam between the
 *  GL canvas and the page around it is invisible. */
const DEFAULT_DESK_COLOR: [number, number, number] = [0.086, 0.086, 0.102]

export interface PencilEngineOptions {
  /** (#650) Where the engine's own diagnostic lines go — the on-device ring
   *  buffer in the app (lib/observability/diagLog). Handed in rather than
   *  imported, so engine code knows nothing of the app around it; omitted, the
   *  lines are dropped. */
  diagLog?: DiagLog
  // Infinite-canvas mode (#133 Phase 1, #142) — every room's layer storage
  // is the same TiledLayerBuffer regardless of this flag (see
  // _makeLayerBuffer); what `infinite` actually controls is the *visible*
  // window and camera: false/omitted (default) keeps a fixed, non-panning
  // canvas.width x canvas.height viewport (see Camera.visibleWorldRect)
  // with rotation handled by the DOM canvasWrap's own CSS transform; true hands the viewport to a free-roaming, rotatable
  // world-space camera (setInfiniteCamera/Camera). Fixed once at
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
  // Overrides paperColorOf(paper)'s default background RGB for this room
  // (see src/paper/PaperState.ts) —
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
  // (#480) Движок заметил, что его собственный инвариант не держится. Опцией,
  // а не импортом отчёта: engine/ не знает ни про Sentry, ни про комнату, и
  // единственное, чем он может помочь, — сказать наружу, что именно он
  // отказался делать и сколько раз подряд.
  onInvariant?: (name: string, context: Record<string, string | number>) => void
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

/** (#536, §17.22) What the watercolor performance readout shows. Windows
 *  are the last two seconds. */
export interface WatercolorPerf {
  /** Interval between displayed frames, ms: median and 95th percentile, and
   *  how many frames the window holds. */
  frameP50: number
  frameP95: number
  frames: number
  /** CPU time inside _display (compose + paper pass submission), ms, median. */
  displayMs: number
  /** Live watercolor batches painted per second, and the CPU time each took
   *  to submit, ms, median and worst. */
  batchesPerSec: number
  batchP50: number
  batchMax: number
  /** The last pen-up settle: wall time from start to landing, ms, and the
   *  number of GPU steps it ran. 0 when none yet. */
  settleMs: number
  settleOps: number
  /** (§17.70) The longest rebuild slice so far, ms (GPU included). */
  rebuildSliceMs: number
  /** GPU memory held by the tool, MB: pooled scratch tiles (live and free),
   *  the diffusion field, the reveals' kept pictures. */
  scratchLiveMB: number
  scratchFreeMB: number
  fieldMB: number
  revealMB: number
  /** Cells of the live wetness field still wet. */
  wetCells: number
}

/** (#536, §17.22) What the watercolor performance readout shows. Windows
 *  are the last two seconds. */
export interface WatercolorPerf {
  /** Interval between displayed frames, ms: median and 95th percentile, and
   *  how many frames the window holds. */
  frameP50: number
  frameP95: number
  frames: number
  /** CPU time inside _display (compose + paper pass submission), ms, median. */
  displayMs: number
  /** Live watercolor batches painted per second, and the CPU time each took
   *  to submit, ms, median and worst. */
  batchesPerSec: number
  batchP50: number
  batchMax: number
  /** The last pen-up settle: wall time from start to landing, ms, and the
   *  number of GPU steps it ran. 0 when none yet. */
  settleMs: number
  settleOps: number
  /** (§17.70) The longest rebuild slice so far, ms (GPU included). */
  rebuildSliceMs: number
  /** GPU memory held by the tool, MB: pooled scratch tiles (live and free),
   *  the diffusion field, the reveals' kept pictures. */
  scratchLiveMB: number
  scratchFreeMB: number
  fieldMB: number
  revealMB: number
  /** Cells of the live wetness field still wet. */
  wetCells: number
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
  /** (#486) Declares the restored snapshot's structure to be the whole
   *  pre-log layer set, retiring any earlier `initLayer` the snapshot has
   *  already outlived. See the implementation for what goes wrong without it. */
  setBaseLayers(ids: readonly string[]): void
  setActiveLayer(id: string): void
  /** (#520) The layers an eraser stroke goes through, on top of the active one
   *  — empty for every other tool and for an eraser with the toggle off, which
   *  is the default and restores the plain single-layer behaviour exactly.
   *
   *  A list of ids rather than a boolean on purpose: *which* layers a
   *  cross-layer erase may touch is a question about visibility, locks, folder
   *  nesting and who the room owner is — all of which live in LayerState and in
   *  the session, never in the engine (see `eraseThroughTargets` in
   *  lib/layers/layers.ts, which is the one place that rule is written down). The
   *  engine is told the answer and paints into it.
   *
   *  Read once at pen-down, like the active layer is: changing this mid-stroke
   *  never redirects a gesture already in flight. */
  setEraseThroughLayers(ids: readonly string[]): void
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
  // (#557) Narrows what *this screen* composites to the given ids, without
  // changing what the picture is. `setCompositeOrder` stays the one truth
  // about the picture — the shared visibility every participant agrees on —
  // and everything that produces the picture for someone else (exportPNG,
  // and through it the room thumbnail) keeps reading it in full. Only the
  // on-screen composite and what reads it (the "visible" fill source, whose
  // whole meaning is "what I am looking at") go through the filter. Room
  // derives the set from the layer panel's solo (lib/layers/layers.ts's
  // soloKeepSet); the engine knows nothing of folders or of why. `null`
  // clears it.
  //
  // Kept as a separate call rather than folded into setCompositeOrder's
  // argument on purpose: an export path added later cannot accidentally
  // inherit the viewer's private filter, because there is no order it could
  // read that has it applied.
  setDisplayFilter(ids: ReadonlySet<string> | null): void
  appendOperation(op: Operation, source?: OperationSource): void
  /** (#537) The server has ordered this client's own operation `opId` at
   *  `seq`. Moves it from the pending tail of the log to its place in the
   *  room's true order and, if it had been painted before operations that now
   *  sort after it, re-settles the layers where that matters. False when there
   *  was nothing to confirm (already confirmed, never pending here). */
  confirmOperation(opId: string, seq: number): boolean
  /** (#537) The server refused this client's own pending operation for good:
   *  takes it back off the canvas and out of the history, so this client does
   *  not keep showing something nobody else will ever see. False when `opId`
   *  is not a pending operation of this engine. */
  discardOperation(opId: string): boolean
  /** (#537) How many times a layer has been re-settled into true order. */
  resettleCount(): number
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
  // bound at construction (see PaperState/paperLoader.ts) — a network fetch
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
  // unable to draw (see PaperState's _loaded comment), and the only way out
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
  // (#474) What the restoreLayerFromSnapshot calls since the last drain
  // actually did — one record per call, in call order, emptied by reading.
  //
  // Draining rather than accumulating: a report is built once per restore, and
  // a record left behind would attach itself to the *next* restore (a
  // reconnect's catch-up), which is the one way this could turn into a
  // misleading report rather than a missing one.
  takeSnapshotRestoreAudit(): SnapshotRestoreAudit[]
  // (#474) What kind of GPU this is running on, for the same report. Null
  // where WEBGL_debug_renderer_info is unavailable — some browsers withhold it
  // as a fingerprinting surface, and a report that says "unknown GPU" is worth
  // more than one that refuses to be built.
  gpuInfo(): { renderer: string | null; maxTextureSize: number; contextLost: boolean }
  // (#169) Merges a batch of pre-snapshot historical operations into the
  // log for undo/redo/history purposes, WITHOUT painting anything — their
  // pixel effect is already baked into whatever restoreLayerFromSnapshot
  // restored. `ops` must be in ascending seq order and must all be older
  // than every operation already in the log (i.e. this is background
  // backfill walking backward from the snapshot point toward the room's
  // start, one page at a time — see Room's backfill orchestration). Safe to
  // call repeatedly, once per page.
  absorbHistoricalOperations(ops: Operation[]): void
  /** Inclusive snapshot prefix plus dependency source history; seeds the log
   * before tail meta-ops and rebuilds only live layers not covered by restored pixels. */
  restoreHistoricalOperations(ops: Operation[], replayStructure?: boolean): Promise<void>
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
  // lib/layers/layers.ts's replayLayerState) — after a snapshot restore, that base
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
  // #278/#489: the angle setting of whichever nib the active tool is wearing.
  // angleRadians is always canvas-space (the caller resolves the local
  // viewport's own rotation into this one number, same "engine only ever sees
  // canvas-space" boundary setViewport/PointerInput already keep for pointer
  // coordinates), and `anchor` names the frame it is read in (dabShaping.ts's
  // NIB_ANCHORS) — `canvas` being ADR 004's original fixed-angle behaviour,
  // just configurable.
  //
  // One value rather than a table keyed by tool, matching setTiltResponse's own
  // boundary: the caller pushes whichever tool is selected. The engine has no
  // business knowing that the marker and the watercolor brush each remember
  // their own angle — that is a fact about the settings panel.
  //
  // A no-op for every round nib, which has no angle to speak of.
  setNibAngle(angleRadians: number, anchor: NibAnchor): void
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
  /** #475: the person's own pressure calibration, applied to pen input before
   *  anything downstream sees it. Unlike setTiltResponse this is not per tool
   *  and not a taste about how a material behaves — it corrects what this
   *  particular stylus, driver and hand actually report, so every tool is
   *  equally wrong without it and equally right with it.
   *
   *  Takes effect on the next pointer *sample*, mid-stroke included: the
   *  settings panel's curve is meant to be dragged while drawing. Nothing about
   *  it reaches the wire — by the time a dab exists the correction is already
   *  inside its `pressure`, which is the entire point (see
   *  lib/input/pressureCalibration.ts). Takes the calibration already compiled
   *  to a raw → corrected function — the model and its compiler are the app's,
   *  not the engine's (#650). Pass null to run the uncorrected path. */
  setPressureMap(map: PressureMap | null): void
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
  // (#246) The canvas moved on screen without changing size — the page around
  // it scrolled. Every room fills a non-scrolling viewport, so resizeCanvas
  // was the only layout event there was; the landing's try-it sheet sits in a
  // scrolling page, and without this the cached rect would put every stroke
  // after a scroll exactly one scroll-distance away from the pen.
  invalidateCanvasRect(): void
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
  // (#527) The shape tool's live preview: `geometry`/`frame` drawn over
  // `layerId`'s own content without writing a pixel into it, for as long as the
  // shape is still being placed. Same lifecycle and the same
  // clearLayerTransformPreview as the three previews above — a shape session
  // and a transform session cannot both be open, since each ends when the tool
  // changes.
  //
  // Cheap enough to call per pointer move: it redraws only the tiles the shape
  // covers, and reuses the scratch buffer of every tile it covered last frame.
  previewShape(
    layerId: string, geometry: ShapeGeometry, frame: ShapeFrame,
    stroke: ShapeStroke | null, fill: ShapeFill | null,
  ): void
  // (#574) A filter's live preview: `layerId`'s content run through `filter`
  // into floating scratch tiles, without writing a pixel into the layer. Same
  // lifecycle and the same clearLayerTransformPreview as the previews above.
  // `null` drops the preview.
  //
  // Not cheap: it runs the filter itself, on the CPU, over every tile the
  // layer has content on (ADR 014). Call it when a setting settles, not per
  // pointer move.
  previewLayerFilter(layerId: string, filter: LayerFilter | null): void
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
  // now. A bounded room exports its whole sheet (#470) — see
  // Exporter.exportPNG (src/export/Exporter.ts) for the full reasoning.
  exportPNG(transparent?: boolean): Promise<Blob | null>
  exportReviewImage(): Promise<import('./src/export/Exporter').ReviewExport | null>
  /** (#536) Dev-only single-term view of the watercolor composite. */
  setWatercolorDebugView(view: 0 | 1 | 2 | 3 | 4): void
  /** (#536, §17.24) Dev-only A/B: composite spread and migration off.
   *  (§17.42) `opDry`: every operation dries on its own at pen-up (tide and
   *  fixation per operation, the r17 behaviour) instead of the wash drying
   *  as one component. */
  setWatercolorAb(ab: { noSpread: boolean; noMigrate: boolean; noDiffuse?: boolean; noCarry?: boolean; opDry?: boolean }): void
  /** (#536, §17.42) Dries every open wash NOW, as one component: the tide
   *  along the union's outer contour is laid into the wet state itself, so
   *  the next mark finds the wash dry. Returns how many washes it dried. Dev
   *  probe for the rig today; the "dry now" command's engine half later. */
  watercolorDryWash(): number
  /** (#536, §17.47/48) "Высушить всё", this client's half: the paper is dry
   *  from now on and the open wash is closed - the next stroke lands on dry
   *  paper and glazes over what is there. Run by the `paper_dry` operation
   *  (appendOperation), which is how the button reaches everyone; calling it
   *  directly dries this client alone. */
  watercolorDryAll(): void
  /** (#536, §17.49) Strokes of the history batch about to be appended that
   *  the same batch leaves undone: logged as they arrive but not painted, and
   *  their undo then needs no rebuild. `null` ends the batch. */
  setUnpaintedInBatch(ids: ReadonlySet<string> | null): void
  /** (#536, §17.22) Live performance numbers of the watercolor tool, for the
   *  dev readout — see WatercolorPerf. Cheap to call; polled a few times a
   *  second by the HUD. */
  getWatercolorPerf(): WatercolorPerf

  /** (#536, §17.73) The page is going away - maybe only into the browser's
   *  page cache, where Safari keeps it, GPU memory and all, next to the room
   *  opened after it. Lets the WebGL context go now; the engine is unusable
   *  afterwards, and a page brought back from the cache must reload. */
  releaseForPageHide(): void

  // (#595, ADR 015 §5) A small picture of the drawing for board thumbnails
  // and the class grid: the same frame and content as exportPNG() (paper
  // baked in; for an infinite room the "whole drawing" rect), shrunk on the
  // GPU so its longer side is at most `maxSide`, and encoded as WebP (PNG
  // where the browser cannot encode WebP — check `blob.type`). Only the small
  // result is ever read back, which is what makes it cheap enough to call
  // every few seconds on a tablet that is drawing. Null if encoding failed.
  bakePreview(maxSide?: number): Promise<Blob | null>
  destroy(): void
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
  /** (#468) The wash this gesture belongs to — see StrokeLiveData.washId for
   *  why it has to travel on the live stream and not only on the operation. */
  washId?: string
  /** (#536) One hex digit per dab of *this packet*, saying how wet the paper
   *  the author was painting into already was. Same reason as washId: the peer
   *  cannot derive it — its own wetness field is its own — so it travels with
   *  the dabs or the two clients draw different marks. */
  wet?: string
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
function liveStrokeKey(peerId: string, strokeId: string, layerId: string): string {
  // `|` is safe as a separator rather than merely unlikely: a userId is a UUID
  // and a strokeId is a nanoid, and neither alphabet contains it, so no pair of
  // distinct inputs can collide on one key.
  //
  // (#520) The layer is part of the key because a gesture is no longer confined
  // to one layer: an eraser set to go through layers paints one set of dabs
  // into every eligible layer, and records one operation per layer, all under
  // the same strokeId. Each of those is its own stream with its own
  // packetSeq/paintedTotal, and keying them together would make the second
  // layer's first packet look like the first layer's second — a sequence gap,
  // which desyncs the gesture and drops it back to arriving whole by operation.
  return `${peerId}|${strokeId}|${layerId}`
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
  pencilType: string
  size: number
  /** (#494) The same immutable value as PaperState.scale: the paper itself —
   *  type, colour, sheet — lives there now. Kept here only because the
   *  ribbon/wash paths read `_opts.paperScale` directly and are being edited
   *  on a live branch; fold into `_paper.scale` once that has landed. */
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
  waitingCanonical?: boolean
}

/** (#536, ADR 011 §17.53) A layer rebuild in progress: the layer's done pixel
 *  operations replayed into a FRESH buffer a slice at a time, the old buffer
 *  on screen meanwhile, swapped in whole when the replay has caught up. */
interface RebuildJob {
  layerId: string
  fresh: ILayerBuffer
  /** The job's own replay-scratch cache: live washes keep theirs. */
  chunks: Map<string, { strokeId: string; washStrokeId?: string; target: ILayerBuffer; scratch: RibbonStrokeScratch; lastDab: Dab }>
  cp: Checkpoint | null
  /** Index in the layer's ops the replay began at (the checkpoint's reach). */
  start: number
  /** Ids replayed so far, in order, from `start`. */
  applied: string[]
  timer: ReturnType<typeof setTimeout> | 0
  /** (§17.70) The watercolour stroke being replayed a slice of dabs at a time:
   *  one lesson-sized operation is up to 1.3 s of GPU in one draw on the
   *  Surface, past what a frame - or Windows' GPU watchdog - tolerates. */
  part: { opId: string; dabs: Dab[]; work: Generator<number, ReadonlyMap<Dab, number> | undefined, void> } | null
}

// Pixel snapshot of a layer after its first `opIds.length` pixel operations.
// ─── Constants ─────────────────────────────────────────────────────────────────

// Paper-grain texture: baked once, offline (see ../scripts/bakePaperTextures.ts
// and src/paperNoise.ts), identical bytes shipped to every client — see
// src/paper/PaperState.ts and paperLoader.ts. PAPER_WORLD_SIZE (imported from
// paperNoise.ts, which is also where the bake script gets it from) is the
// world-space size the baked tile repeats over, used identically by bounded
// and infinite rooms alike — see PaperState.worldSize().

export const DEFAULT_GRAPHITE_COLOR: [number, number, number] = [0.14, 0.14, 0.17]

// Undo depth is bounded by the log, not by memory: checkpoints only shorten the
// replay tail. Interval/budget are starting points to be tuned by measurement (#76).
const CHECKPOINT_INTERVAL = 20
/** (#536, §17.43) ...and every fifth while painting watercolour: see _maybeCheckpoint. */
const CHECKPOINT_INTERVAL_WATERCOLOR = 5

const CHECKPOINT_BUDGET_BYTES = 256 * 1024 * 1024
/** (#480) Сколько отказов _takeCheckpoint подряд по одному слою считаем не
 *  штатным «перо ещё внизу», а залипанием. Двадцать границ чекпойнта — это
 *  четыреста пиксельных операций по слою, за которые ни один момент не
 *  оказался чистым; на живом уроке столько не набирает даже непрерывная
 *  штриховка вдвоём. */
const CHECKPOINT_REFUSAL_ALARM = 20

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
/** (#536, §17.43) ...and a watercolour chunk is also cut by its SPAN: the
 *  settle works in a field capped at 1536 px a side (_diffuseWashOps), and a
 *  sheet-wide sweep whose chunk outgrew it settled inside a window with a
 *  wall at its edge - the front, the carry and the tide stopped at a
 *  straight line, and the paint past it never reached the dry target
 *  (Ilya's room HcpkzwNX: vertical seams through every big wash). Cut at a
 *  span that leaves room for the field's pad on both sides. */
const WC_STROKE_CHUNK_SPAN_PX = 1100

/** (#536, ADR 011 §17.12) How long the screen takes to converge on a wash's
 *  settled picture after pen-up. Presentation only: the layer holds the dry
 *  target from the first frame, this is how long the eye is shown the way
 *  there. Eased fast-then-slow, which is how Ilya described the real thing:
 *  "сначала быстро, потом замедляется". */
const WC_REVEAL_MS = 1500

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

// The marker's own ribbon constants (edge ramp, curvature tolerance, chisel
// corner radius, rim ink falloff) moved to src/dabs/ribbonProfile.ts in #454: they
// describe how the ribbon rasterizer draws one tool, and there are two such
// tools now. See that file.

/** (#468 v7, ADR 011 §7) How long a wash stays open after the brush lifts.
 *
 *  Not a drying time — nothing here models drying. It is the window in which a
 *  second band still counts as *the same wash*, and it exists because that is
 *  the only way a flat wash can be painted: bands laid inside it merge into one
 *  pool with one perimeter, bands laid after it glaze over a finished wash.
 *
 *  1.2s is generous on purpose. Someone laying a wash works continuously, and
 *  the cost of joining when they meant to glaze is small (one extra band in the
 *  pool) while the cost of splitting when they meant to join is exactly the bug
 *  this exists to fix. Wall-clock, and only ever consulted live — the answer is
 *  recorded on the operation, so replay never measures anything.
 *
 *  Any change of paint, colour, layer or tool ends the wash immediately,
 *  regardless of this. */
/** (#468 v7) How long a wash stays open. (#536) Was 1200 ms, which was picked
 *  when the only thing a wash had to survive was the gap between two adjacent
 *  bands of one flat wash. It cannot survive the sequence this tool's two axes
 *  exist for — lay clean water, turn the pigment up, take paint into it — for
 *  the simple reason that reaching for the slider takes longer than that.
 *
 *  Not a drying time: nothing dries here. It is the horizon past which a stroke
 *  is treated as a second, glazed layer over a first, and it is a *ceiling*
 *  rather than the rule — a stroke that lands away from anything this wash
 *  actually wetted starts its own wash however recent it is (see
 *  `_washOverlapsWet`), so a long horizon does not glue unrelated marks
 *  together across the sheet. */
// (s17.43) 50 s, from 25: a ceiling has to sit above the paper's own drying
// (WET_DRY_MS, 60 s now), or the wash closes while its puddle is still wet.
// (s17.47) 100 s, from 50: kept in the same proportion to the paper's
// drying, now 120 s.
const WASH_JOIN_MS = 100000

/** Under this, a stroke rejoins the open wash whatever the paper says. Covers
 *  the brush that was too dry to leave a readable trace of water and the pen
 *  lifted for an instant mid-band; it is the old, purely temporal rule kept as
 *  a floor beneath the physical one. */
const WASH_RECENT_MS = 1200
/** (#536, §17.55) Pixel operations since the layer's last usable checkpoint
 *  before a wash boundary is worth a tile copy. */
const WASH_CHECKPOINT_MIN_OPS = 3
/** (§17.58) See _checkpointBeforeWash. */
const WASH_CHECKPOINT_MIN_INTERVAL_MS = 10000
/** (§17.58) Settle entries a frame at most while a queue waits - see _tickSettle. */
const WET_SETTLE_OPS_BACKLOG_MAX = 2
/** (§17.55) How far apart two participants' clocks may be when their
 *  timestamps are compared to decide a wash can no longer be rejoined. */
const WASH_CLOCK_SKEW_MS = 10000
/** (#536, §17.56) Pixel operations since the last usable checkpoint before
 *  one carrying open washes is worth its textures. */
const WASH_STATE_CHECKPOINT_MIN_OPS = 8
/** (§17.56) The most the carried washes of one checkpoint may hold on the
 *  GPU; past it none is taken (the iPad's wash textures are near its limit). */
const WASH_STATE_CHECKPOINT_MAX_BYTES = 96 * 1024 * 1024
/** (#536, §17.57) The watercolour's GPU memory on a touch device - see
 *  PencilEngine._enforceGpuBudget. The iPad's tab died near 600 MB of it. */
const GPU_BUDGET_TOUCH_BYTES = 300 * 1024 * 1024
/** (§17.73) Past this multiple of the budget, spilled even if busy. */
const GPU_HARD_CEILING = 1.35
/** (§17.70) A rebuild's watercolour replay slice: the GPU time one aims at,
 *  and the dab counts it starts from and never grows past. */
const REBUILD_SLICE_MS = 12
/** (§17.70) The settle field's one size, px: the largest a wash's field can
 *  be (CAP in _diffuseWashOps, in field pixels). */
const WC_FIELD_PX = 1536
/** (§17.70) Ribbon band triangles per draw in a rebuild: one whole-operation
 *  band draw was 1 s of GPU on the Surface. */
const REBUILD_BAND_PIECE_TRIS = 256
/** (§17.72) How a slice of a stroke's drawing is cut: draws go in groups,
 *  each waited out on the GPU, and the slice ends once REBUILD_SLICE_MS has
 *  passed - so it overruns by one group at most, whatever the draws cost. A
 *  group that alone ran past the budget halves the group; a quick one doubles
 *  it. Limits decided up front (draws and pixels, grown on quick slices) were
 *  run through by the first heavy slice after a cheap stretch: 223 draws,
 *  0.45 s on the Surface. */
class SliceGroups {
  /** A group ends at this many draws or this many tile pixels, whichever
   *  first: draws off the tile cost next to nothing and pile up, and then
   *  one group meets the heavy ones (239 draws, 0.47 s on the Surface). */
  size = 8
  px = 1 << 18
  budgetMs = REBUILD_SLICE_MS
  /** The worst slice so far, for _wcPerf. */
  worst = { ms: 0, draws: 0, px: 0 }

  noteGroup(ms: number, byPx: boolean): void {
    if (ms > this.budgetMs) {
      this.size = Math.max(1, this.size >> 1)
      this.px = Math.max(1 << 12, this.px >> 1)
    } else if (ms < this.budgetMs / 8) {
      if (byPx) this.px = Math.min(1 << 21, this.px * 2)
      else this.size = Math.min(16, this.size * 2)
    }
  }

  noteSlice(draws: number, px: number, ms: number): void {
    if (ms > this.worst.ms) this.worst = { ms: Math.round(ms), draws, px: Math.round(px) }
  }
}
/** (§17.68) How long a wash has to rest before the budget may spill it. */
const SPILL_IDLE_MS = 8000
/** (§17.68) ...and how long the whole room has to be still first. */
const WASH_QUIET_MS = 2000

/** (#536, §17.22) How long after a settle the diffusion field is kept. */
// (§17.44) 45 s, from 8: remaking ten field buffers - a texture, an FBO
// and a GPU-stalling status check each - was a 100 ms hitch on the first
// chunk of the first stroke after any pause longer than eight seconds.
const WET_FIELD_RELEASE_MS = 45000

/** (#536, §17.56) A checkpoint's carried wash: its scratch as the replay cache
 *  would hold it at the checkpoint. */
interface CarriedWash { key: string; userId: string; washStrokeId: string | undefined; lastDab: Dab; snap: ScratchSnapshot }

// ─── Engine ────────────────────────────────────────────────────────────────────

export class PencilEngine implements PencilEngineAPI {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private _opts: EngineOpts
  private _grainMode: number | undefined
  private _charcoalGrainMode: number | undefined
  private _userId: string
  private _onLocalOperation?: (op: Operation) => void
  private _onPreviewApplied?: (op: StrokeOperation) => void
  private _onInvariant?: (name: string, context: Record<string, string | number>) => void
  // (#480) Подряд идущие отказы _takeCheckpoint по слою. Единичный отказ —
  // норма и вся суть защиты из #479: перо опущено, чекпойнт подождёт границы.
  // А вот слой, который не удаётся зачекпойнтить десятки раз кряду, означает,
  // что что-то держит его «грязным» постоянно — и тогда он остаётся без
  // чекпойнта совсем, то есть каждый undo по нему проигрывает всю историю.
  private _checkpointRefusals = new Map<string, number>()
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
  private _previewBufPool: ScratchSlot<AccumulationBuffer>

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
  private _tipBufPool: ScratchSlot<AccumulationBuffer>

  // Marker's own per-stroke, per-tile scratch (original content + this
  // stroke's accumulated coverage — see RibbonStrokeScratch's own doc
  // comment). Non-null exactly while a *local* marker stroke is in
  // progress: created in _onStart, destroyed and nulled in _onEnd. A
  // one-shot full-array _paintRibbonDabs call (replay/undo/redo/checkpoint/
  // most peer ops) never touches this field at all — it creates and tears
  // down its own throwaway instance within that single call instead (see
  // _paintRibbonDabs' own doc comment).
  private _ribbonStrokeScratch: RibbonStrokeScratch | null = null
  /** (#468 v7) The wash in progress, if any — watercolor only.
   *
   *  A wash outlives the stroke that started it: its scratch is kept between
   *  strokes so the next one accumulates into the same pool, and is only torn
   *  down when something makes the wash a different wash (a gap long enough to
   *  count as dry, a different paint, a different layer, a different tool).
   *
   *  `endedAt` is wall-clock and that is fine, because it decides the *live*
   *  grouping only. The answer is written onto the operation as `washId`, and
   *  replay reads that instead of re-deriving it — the same split `strokeId`
   *  already uses for chunking. */
  private _wash: {
    id: string
    layerId: string
    signature: string
    endedAt: number
    scratch: RibbonStrokeScratch
  } | null = null
  private _washId: string | null = null
  /** (#536) Where the paper is still wet — live, local, ephemeral, never
   *  replayed. See paperWetness.ts for why that is the design rather than a
   *  shortcut. */
  /** (#680, s17.81) Each watercolor dab's pool (its surplus over the film,
   *  0..1), by the dab object the wetness field is fed with - display only,
   *  the bead's gate. See PaperWetness's WetCell.p. */
  private readonly _dabPool = new WeakMap<Dab, number>()
  private readonly _paperWet = new PaperWetness()
  /** The quantized profile of what *this* gesture has seen so far, built as it
   *  is drawn and recorded on the operation. Read back by the painting path
   *  itself, so a live mark and its replay consume the identical numbers. */
  private _strokeWet = ''
  /** (#536) The wetness field as a coarse world-space texture for the display
   *  pass, plus the world rect it covers and when it was last rebuilt. Null
   *  rect means nothing is wet and the whole overlay is off. */
  private _wetTex: WebGLTexture | null = null
  private _wetRect: [number, number, number, number] = [0, 0, -1, -1]
  private _wetTexAt = 0
  private _wetOverlayWorkspace: WetOverlayWorkspace | null = null
  /** Texels of the wetness map, so the display pass can read its slope. */
  /** Quantized wetness the screen is currently showing, so the drying watcher
   *  can skip the frames that would look identical. -1 = nothing shown. */
  private _wetShown = -1
  /** (#536) 0 normal, 1 silhouette, 2 density, 3 pigment, 4 standing water — see setWatercolorDebugView. */
  private _wcDebugView = 0
  /** Handle of the repaint that watches the paper dry, or 0. */
  private _dryingTimer = 0
  /** The same profile for the dabs still queued for the live channel, drained
   *  with them so a packet always carries exactly its own dabs' digits. */
  private _liveWetQueue = ''
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
   *  A few slots, not one, and that changed with #468's washes. For a *gesture*
   *  one slot was right: its chunks are consecutive in the log and arrive in
   *  order, so anything interleaving started a new slot — the old behaviour, a
   *  seam, rather than a wrong result. A *wash* spans several strokes with real
   *  gaps between them, and in a room where two people paint at once the gaps
   *  routinely contain someone else's stroke. Evicting the wash there is not a
   *  seam: the rest of the wash then lands as a second glaze over the first,
   *  which measured as 100% of the mark differing from the author's.
   *
   *  Bounded and least-recently-used, because each entry holds three pooled
   *  buffers per tile it touches. Four covers a handful of people painting at
   *  once; past that the oldest wash goes back to being a seam, which is the
   *  behaviour this had for every tool before washes existed. */
  /** (§17.53) Sliced layer rebuilds in progress, by layer. */
  private _rebuildJobs = new Map<string, RebuildJob>()
  /** (#536, §17.55) Tile copies taken just before a new wash's first
   *  operation, packed into a checkpoint at the next idle moment. One per
   *  layer: a newer boundary replaces an unpacked older one, so a history
   *  batch holds a single copy, not one per wash. */
  private _washBoundaries = new Map<string, { opIds: string[]; copies: Array<{ buffer: AccumulationBuffer; originX: number; originY: number }>; washes: CarriedWash[] }>()
  private _washBoundaryScheduled = false
  private _lastBoundaryCheckpoint = new Map<string, number>()
  /** (§17.58) Settle entries a frame at most while peers' operations wait -
   *  see _tickSettle. A field, not a constant, so the device rig can compare
   *  paces without reloading every tab. */
  settleBacklogMax = WET_SETTLE_OPS_BACKLOG_MAX
  /** (#536, §17.57) See _enforceGpuBudget: a touch device's browser gives a
   *  page far less GPU memory than a desktop's. */
  // (§17.69) ...and not every touch screen is short of it: the Surface has one,
  // and paying the spill there (a readPixels stall of a second on its GPU) for
  // memory it has in plenty was a regression. Chrome reports its memory; Safari
  // does not, and the iPad is exactly the device this is for.
  private _gpuBudget = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 1
    && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0) <= 4
    ? GPU_BUDGET_TOUCH_BYTES : Infinity
  /** (§17.70) A rebuild's step is running: the cache is the job's own. */
  private _inJobStep = false

  private readonly _ribbonCache = new RibbonReplayCache({
    ribbonScratchPool: () => this._ribbonScratchPool,
    destroyed: () => this._destroyed,
    contextLost: () => this._contextLost,
    inJobStep: () => this._inJobStep,
    gpuBudget: () => this._gpuBudget,
    settlingScratch: () => this._settle?.scratch,
    completeSettle: () => this._completeSettle(),
    finishedChunk: () => [...this._replayRibbonChunks].find(([key, chunk]) => {
      const job = [...this._rebuildJobs.values()].find(j => j.fresh === chunk.target)
      if (!job) return false
      const remaining = this._log.layerPixelOps(job.layerId).slice(job.start + job.applied.length)
      return !remaining.some(op => op.type === 'stroke' && (op.washId ?? op.strokeId) === key)
    }),
    rebuildLostWash: target => this._rebuildLostWash(target),
    scheduleBudgetCheck: () => this._scheduleBudgetCheck(),
    washGpuBytes: () => this._washGpuBytes(),
  })
  private get _replayRibbonChunks() { return this._ribbonCache.chunks }
  private set _replayRibbonChunks(chunks: Map<string, ReplayRibbonChunk>) { this._ribbonCache.chunks = chunks }
  private get _chunkAuthors() { return this._ribbonCache.authors }
  private get _spilledWashes() { return this._ribbonCache.spilled }
  private get _lostWashes() { return this._ribbonCache.lost }
  private get _spillJob() { return this._ribbonCache.spillJob }
  private _retireWashesOf(op: StrokeOperation): void { this._ribbonCache.retireWashesOf(op) }
  private _replayChunkScratch(target: ILayerBuffer, strokeId: string | undefined, washId: string | undefined, dabs: Dab[], profile: RibbonProfile) {
    return this._ribbonCache.replayChunkScratch(target, strokeId, washId, dabs, profile)
  }
  private _trimChunkCache(): void { this._ribbonCache.trimChunkCache() }
  private _evictChunk(key: string, keep: boolean): void { this._ribbonCache.evictChunk(key, keep) }
  private _cancelSpillJob(): void { this._ribbonCache.cancelSpillJob() }
  private _startSpill(key: string): void { this._ribbonCache.startSpill(key) }
  private _forgetWashesOf(target: ILayerBuffer): void { this._ribbonCache.forgetWashesOf(target) }


  // (#494) Smudge and the mixer brush — their programs, scratch pool, per-user
  // imprints and replay chunks. See SmudgePainter.ts.
  private readonly _smudge: SmudgePainter
  // (#494) Pencil/eraser/liner/charcoal dab stamps, plain and instanced — see
  // StampPainter.ts. Its programs are built by _initGL, like every other one.
  private readonly _stamps: StampPainter

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
  /** (#536, §17.12) LAYER_COMPOSITE_FRAG's twin for a tile still converging on
   *  a settled wash — see WashReveal. */
  private _revealProg!: WebGLProgram
  /** (#536, §17.46) The paper composite's own copy of the screen, so a frame
   *  that changed only the brush's rect recomposes that rect alone. */
  private _screenCache: AccumulationBuffer | null = null
  private _screenBlitProg!: WebGLProgram
  private _screenBlitTexLoc: WebGLUniformLocation | null = null
  private _screenBlitPosLoc = -1
  /** World rect the live stroke changed since the last frame, and whether
   *  the next frame may recompose only it: set by the live batch path, and
   *  cleared by every other reason to draw (_displayIfNotSuspended, a
   *  camera move, a resize). */
  private _paperDamage: { minX: number; minY: number; maxX: number; maxY: number } | null = null
  private _paperPartialOK = false
  private _paperCacheKey = ''
  private _revealUni!: Record<string, WebGLUniformLocation | null>
  private _revealPosLoc = -1
  /** Keyed by the layer tile the wash settled into. Presentation state only:
   *  never read by any paint pass, never serialised, dropped with the tile. */
  private _washReveals = new Map<AccumulationBuffer, WashReveal>()
  private _revealTimer = 0
  private get _settle(): WatercolorSettleQueue['current'] { return this._settleQueue.current }
  /** (#536, §17.22) The live gesture's composite, deferred to the frame: the
   *  per-gesture scalars every batch would have passed, kept from the first
   *  deferred batch. Null while no live ribbon gesture has a rect pending.
   *
   *  Why per frame: a pen delivers 120–240 samples a second and every sample
   *  with a dab used to composite its own rect — the most expensive shader in
   *  the tool, plus the reveal's keep-fresh copies around it — while the
   *  screen shows sixty of them at most. The composite is a pure recomputation
   *  of a rect from the deposit, so the union of the batches since the last
   *  frame gives the same pixels as the batches one by one. */

  /** Preserve the next film after the preceding settle lands (ADR 011). */
  private _wcSourceFilmRebase = true
  /** Opt-in diagnostic: only proven-zero pigment contact operators. */
  private _wcZeroPigmentContacts = false

  private readonly _settlePlan = new WatercolorSettlePlan({
    gl: () => this.gl,
    fieldFor: (w, h) => this._diffuseFieldFor(w, h),
    paperWorldSize: () => this._paperWorldSize(),
    pool: () => this._ribbonScratchPool,
    minmaxExt: () => this._minmaxExt,
    ab: () => this._wcAb,
    passes: () => this._watercolorPasses,
    gradientFibres: () => this._wcGradientFibres,
    shouldPreview: () => this._settleQueue.allowProgressPreview
      && (!this._settleQueue.suppressActivePreview || !this._strokeLayerId),
  })
  /** Isolated responsiveness prototype. Not a production default. */
  private _wcAsyncFinish = false
  private _wcAsyncError: unknown = null
  private readonly _wcAsyncPeerStreams = new Map<string, {
    peerId: string; strokeId: string; layerId: string; nextPacketSeq: number; ended: boolean; cancelled: boolean;
    buf: AccumulationBuffer | null; origin: { x: number; y: number }; pending: Map<object, PeerLivePacket>;
  }>()
  private _wcAsyncLocalStroke: string | null = null
  private readonly _wcAsyncLocalTools = new Map<string, {
    layers: Map<string, { buffer: ILayerBuffer; copied: Set<string>; scratch: RibbonStrokeScratch }>
    ended: boolean; queued: number
  }>()
  private readonly _wcAsyncDryTo = new Map<RibbonStrokeScratch, number>()
  private readonly _wcAsyncOwners = new Map<RibbonStrokeScratch, number>()
  private readonly _wcAsyncPresentations = new Map<RibbonStrokeScratch, Map<number, { buf: AccumulationBuffer; origin: { x: number; y: number }; pending: Map<object, Dab[]>; preset: string; color: [number, number, number] }>>()
  private readonly _wcCanonical = new WatercolorCanonicalFIFO({
    blocked: () => !!this._settle || this._contextLost || this.gl.isContextLost(),
    advance: (work, current) => this._advanceAsyncCanonical(work, current),
    schedule: callback => requestAnimationFrame(callback),
    unschedule: handle => cancelAnimationFrame(handle),
    changed: () => this._scheduleDisplay(),
    failed: error => { this._wcAsyncError = error },
  })

  private readonly _settleQueue = new WatercolorSettleQueue({
    beforeStart: () => {
      if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }
    },
    perf: () => this._wcPerf,
    isDrawing: () => !!this._strokeLayerId,
    backlogSize: () => this._opQueue.length,
    backlogMax: () => this.settleBacklogMax,
    syncGpu: () => this.gl.finish(),
    noteActivity: now => { this._washActiveAt = now },
    scheduleFieldRelease: () => this._scheduleFieldRelease(),
  })

  private readonly _watercolorPasses = new WatercolorPasses({
    gl: () => this.gl,
    screenBuf: () => this._screenBuf,
    paperTex: () => this._paperTex,
    paperScale: () => this._opts.paperScale,
    paperWorldSize: () => this._paperWorldSize(),
    stamps: () => this._stamps,
  })

  private readonly _ribbonPasses = new RibbonPasses({
    gl: () => this.gl,
    stamps: () => this._stamps,
    paperTex: () => this._paperTex,
    quadBuf: () => this._quadBuf,
    minmaxExt: () => this._minmaxExt,
    paperFillThreshold: () => this._paperFillThreshold,
    paperFillCap: () => this._paperFillCap,
    wcDebugView: () => this._wcDebugView,
    wcAb: () => this._wcAb,
    paperScale: () => this._opts.paperScale,
    paperWorldSize: () => this._paperWorldSize(),
  })

  private readonly _ribbonPainter = new RibbonStrokePainter({
    dabPool: () => this._dabPool,
    scratchPool: () => this._ribbonScratchPool,
    resolveWaterPreset: name => this._resolvePreset('watercolor', name),
    infinite: () => this._infinite,
    minmaxExt: () => this._minmaxExt,
    setLiveComposite: value => { this._liveComposite = value },
    dabWorldHalfExtents: (d, erasing, preset, wicking) => this._dabWorldHalfExtents(d, erasing, preset, wicking),
    drawRibbonBands: (dest, tile, bands, mode, aaPx, cloud, gran, mottleSeed, washWater, waterRetain, bristleCombs, bristleInk, depthTau, poolBlot, availableWater) => this._drawRibbonBands(dest, tile, bands, mode, aaPx, cloud, gran, mottleSeed, washWater, waterRetain, bristleCombs, bristleInk, depthTau, poolBlot, availableWater),
    drawRibbonCompositeRect: (tile, bounds, preset, profile, original, coverage, inkLoad, inkColor, color, opacity, fieldSeed, spreadPx, water, migratePx, inkSmoothPx, strokeDir, bristleRadiusPx) => this._drawRibbonCompositeRect(tile, bounds, preset, profile, original, coverage, inkLoad, inkColor, color, opacity, fieldSeed, spreadPx, water, migratePx, inkSmoothPx, strokeDir, bristleRadiusPx),
    drawRibbonNibPass: (dest, tile, dab, preset, profile, inkMode, opacity, ownTarget, inkWater, acrossLocal, paperWet, inkStrength, mottleSeed, clipTo, bristleCombs, bristleInk, depthTau, puddle, poolBlot) => this._drawRibbonNibPass(dest, tile, dab, preset, profile, inkMode, opacity, ownTarget, inkWater, acrossLocal, paperWet, inkStrength, mottleSeed, clipTo, bristleCombs, bristleInk, depthTau, puddle, poolBlot),
    fieldOp: (out, a, b, mode, k, opts) => this._fieldOp(out, a, b, mode, k, opts),
    markPaperDamage: (b) => this._markPaperDamage(b),
    markerSegmentLength: (dab, prevDab, radius) => this._markerSegmentLength(dab, prevDab, radius),
    nibDrawCost: (tile, dab, preset) => this._nibDrawCost(tile, dab, preset),
    nibTouchesTile: (tile, dab, preset) => this._nibTouchesTile(tile, dab, preset),
    pageSize: () => this._pageSize(),
    paintBrushStroke: (target, dabs, preset, stamp, color, scratch, prevDab) => this._paintBrushStroke(target, dabs, preset, stamp, color, scratch, prevDab),
    resolveWithinSheet: (target, r) => this._resolveWithinSheet(target, r),
    revealAfterBatch: (tile, bounds, prev) => this._revealAfterBatch(tile, bounds, prev),
    revealBeforeBatch: (tile, bounds) => this._revealBeforeBatch(tile, bounds),
    revealRect: (tile, bounds) => this._revealRect(tile, bounds),
    wcSheetClamp: (r) => this._wcSheetClamp(r),
  })

  private _liveComposite: RibbonLiveComposite | null = null
  /** (#536, §17.22) Frees the diffusion field a while after the last settle:
   *  seven buffers of up to 1536² are a hundred megabytes a tablet should not
   *  hold between washes. */
  private _fieldReleaseTimer = 0
  /** (#536, §17.22) Rings behind getWatercolorPerf. Timestamps and costs of
   *  the last frames and batches; pruned to the window on read. */
  private readonly _wcPerf = {
    frameAt: [] as number[], frameMs: [] as number[],
    batchAt: [] as number[], batchMs: [] as number[],
    settleStart: 0, settleOps: 0, settleMs: 0,
    sliceWorst: { ms: 0, draws: 0, px: 0 },
  }
  /** (#536, §17.11) The one field the wet diffusion runs over: the wash's
   *  tiles stitched into a rect, so paint crosses tile seams as freely as any
   *  other texel. Four buffers of one size, grown to the largest wash seen and
   *  kept — see _diffuseField. */
  /** (§17.49) The settle's field: one entry, at exactly the size of the
   *  settle that asked for it last - see _diffuseFieldFor. */
  private _fieldCache: Array<SettleField> = []
  // (#494) The transform, selection and image blits — see blitPasses.ts.
  private _passes!: BlitPasses
  private _quadBuf!: WebGLBuffer
  private _screenBuf!: WebGLBuffer
  private _compositeFBO!: AccumulationBuffer
  // Layer composition reads the current buffers on every call: resize and
  // context restore replace their GL handles without changing this owner.
  private readonly _compositor: LayerCompositor


  // (#494) Where the screen is looking — the pose (world point at screen
  // centre, zoom, rotation), the cached on-screen canvas rect and every piece
  // of math derived from them. See src/raster/Camera.ts.
  private readonly _camera: Camera

  // (#147) See suspendDisplay/resumeDisplay's own doc comments.
  private _displaySuspendDepth = 0
  /** (#381) Layers whose rebuild was deferred by the current suspendDisplay
   *  batch — see _rebuildLayerOrDefer. Empty whenever the depth is 0. */
  private _pendingRebuilds = new Set<string>()
  /** (#537) Layers whose pixels were painted in an order other than the one
   *  the log now holds — an operation landed below something already painted
   *  on them, or on top of another gesture's still-unrecorded ink. Each is
   *  rebuilt from the log (which is in true order) as soon as nothing is being
   *  painted into it live: see _settleLayers. */
  private _unsettledLayers = new Set<string>()
  /** A settle put off by an open watercolor wash — retried once it can no
   *  longer be joined. */
  private _settleRetryTimer: ReturnType<typeof setTimeout> | null = null
  /** (#537) How many times a layer was re-settled into true order. For tests
   *  and diagnostics — this is the "jerk" the fix trades for convergence. */
  private _resettleCount = 0

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
  // gizmo preview is active (_previews.tiles.size > 0, #120): that path
  // can substitute scratch content for *any* layer, active or not, on every
  // drag frame, and reasoning about invalidating a persistent cache through
  // it isn't worth it — drags aren't the hot path this exists for. See
  // _runComposite.
  private _belowCache!: AccumulationBuffer
  private _aboveCache!: AccumulationBuffer

  // Infinite canvas rotation (#134) — _runComposite builds the unrotated,
  // zoom-applied composite into this buffer instead of the real (canvas-
  // sized) target for infinite rooms; _finishInfiniteComposite then does
  // exactly one final rotate blit from here into the real target. Sized
  // to Camera.renderBufferExtent() — a square big enough (canvas's own half-
  // diagonal, doubled) that any rotation of the camera still finds the
  // whole screen covered by content this buffer actually holds. Bounded
  // rooms never read/write this (their rotation is the DOM canvasWrap's
  // own CSS transform, orthogonal to this file) — allocated anyway at
  // plain canvas size for them, just to keep _initGL/resizeCanvas free of
  // a mode branch; _runComposite is what actually skips it.
  private _assemblyFBO!: AccumulationBuffer

  // (#494) Where the composite puts world space on its target — centre, scale,
  // view — is no longer a set of fields _runComposite overwrites every frame
  // (and the export used to swap out and restore): each pass builds a
  // CameraFrame value and hands it down. See src/raster/cameraFrame.ts for the
  // pixel-alignment (#134) and scale (#301) reasoning that used to live here,
  // and Camera.liveFrame (src/raster/Camera.ts) for the on-screen one.

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

  private _minmaxExt: { MAX_EXT: number } | null = null
  // (#494) The digital brush's stamp model, its tips and textures — see
  // BrushPainter.ts. Its programs are built by _initGL, like every other one.
  private readonly _brush: BrushPainter

  // (#494) Floating layer previews — the scratch tiles a gesture shows in
  // place of a layer's own while it is being placed. Written by AreaOps,
  // ShapePass and FilterPass, read by the composite; see layerPreviews.ts.
  private readonly _previews = new LayerPreviews()
  // (#494) Layer transform, selection, paste and fill — see AreaOps.ts.
  private readonly _area: AreaOps
  // (#494) Reference-image import and its decoded-image cache — see ImageImport.ts.
  private readonly _images: ImageImport
  // (#494) Shapes — see ShapePass.ts. Its program is built by _initGL.
  private readonly _shapes: ShapePass
  // (#494) Layer filters on the tiles — see FilterPass.ts.
  private readonly _filters: FilterPass
  // (#494) Export and the room thumbnail — see src/export/Exporter.ts. Its
  // programs are built by _initGL.
  private readonly _exporter: Exporter

  // (#494) The paper texture's lifecycle and the sheet's geometry — see
  // src/paper/PaperState.ts. Built once; a paper switch or context restore
  // swaps the texture inside it, so the passes hold it by reference.
  private readonly _paper: PaperState
  // (#494) Read-through for the ribbon/wash code, which is live on another
  // branch and reads these names directly — see EngineOpts.paperScale.
  private get _paperTex(): WebGLTexture { return this._paper.texture }
  private get _paperFillThreshold(): number { return this._paper.fillThreshold }
  private get _paperFillCap(): number { return this._paper.fillCap }

  // Infinite (tiled) canvas mode (#133 Phase 1) — see PencilEngineOptions.infinite.
  private readonly _infinite: boolean
  // (#650) See PencilEngineOptions.diagLog.
  private readonly _diagLog: DiagLog

  // Layer management
  private _layers: Map<string, ILayerBuffer>
  private _baseLayerIds: Set<string> // pre-log layers (background, initial layer)
  // (#373, #374, #522) Each layer's standing with the room's stored snapshot —
  // anything new to publish, what its restored pixels already contain, whether
  // it may be published at all. See snapshotLedger.ts.
  private readonly _snapshots = new SnapshotLedger()
  // (#494) Layer merge and duplicate — see structuralOps.ts.
  private readonly _structural: StructuralOps
  // (#494) Snapshot bake, restore, audit and history backfill over the ledger
  // above — see SnapshotIO.ts.
  private readonly _snapshotIO: SnapshotIO
  private _compositeOrder: CompositeItem[]
  /** (#557) See setDisplayFilter. `null` means the screen shows the whole of
   *  `_compositeOrder`. Never consulted by the export path. */
  private _displayFilter: ReadonlySet<string> | null = null
  private _activeId: string | null
  private _locked: boolean

  // WebGL context loss (#121) — true between webglcontextlost and
  // webglcontextrestored. Only gates _takeCheckpoint (see there for why);
  // everything else is a harmless no-op on a lost context per spec.
  private _contextLost = false

  // Set at the top of destroy().
  private _destroyed = false

  // Operation log — source of truth; buffers and checkpoints are derived caches
  private _log: OperationLog
  private _checkpoints: CheckpointStore

  // In-flight stroke, recorded as one StrokeOperation on pointer up
  private _strokeLayerId: string | null
  /** (#520) The *other* layers this gesture is painting into, besides
   *  `_strokeLayerId` — always empty except under an eraser with "through
   *  layers" on. Frozen at pen-down from `_eraseThroughIds`.
   *
   *  Kept as a supplement to `_strokeLayerId` rather than folding both into one
   *  list, because the two are not interchangeable everywhere: the active layer
   *  is what the preview and tip buffers, the wash bookkeeping and the split
   *  cache are all anchored to, and a list would have made every one of those
   *  ask "which of these is the real one?". Only the three places that
   *  genuinely repeat per layer — paint, live packets, recorded operations —
   *  iterate this. */
  private _strokeExtraLayerIds: string[] = []
  /** (#520) What the *next* eraser stroke will go through — see
   *  setEraseThroughLayers. Live setting, read at pen-down. */
  private _eraseThroughIds: string[] = []
  private _strokeTool: ToolType
  private _strokePreset: string
  private _strokeColor: [number, number, number]
  private _strokeDabs: Dab[]
  /** (#573) The last dab of the gesture's previous chunk, once
   *  _flushStrokeChunk has emptied _strokeDabs — so the next batch still
   *  knows its predecessor. Without it the first dab after every 800-dab
   *  boundary was painted as a stroke's *first* dab: the digital brush and the
   *  marker gave it a whole half-radius of travel (one dark stamp in the middle
   *  of the stroke), smudge restarted its smear — and only live, since replay
   *  rejoins the chunks through _replayChunkScratch, so the author and
   *  everyone else were looking at different marks. */
  private _strokeChunkTail: Dab | undefined
  /** (#536, §17.43) The current chunk's dab bounds, for the span cut - and
   *  (§17.63) its widest dab's half-size across the long axis, before the
   *  preset's size multiplier. */
  private _strokeChunkBox: { minX: number; minY: number; maxX: number; maxY: number; half: number } | null = null
  private _strokeStartTimestamp = 0 // PointerEvent.timeStamp at stroke start — Dab.t is elapsed since this

  // #278/#489: the active tool's live nib angle — canvas-space radians (the
  // caller, Room/index.tsx, resolves the local viewport's own rotation into
  // this single canvas-space number before calling setNibAngle; the engine
  // itself never needs to know about it). Read at both shapingForTool call
  // sites (_onStart and
  // _paintDwellDab) so a live change takes effect on the *next* stroke, same
  // as every other setXxx tool option — never mid-stroke (DabSystem.
  // setShaping's own doc comment: a profile change partway through an
  // in-progress _buf isn't supported).
  private _nibAngleRadians = Math.PI / 4 // ADR 004 §1 "~45°" default, matches markerPresets.ts's own fallback
  private _nibAnchor: NibAnchor = DEFAULT_NIB_ANCHOR

  // #409: the active tool's tilt→shape ramp shape, a user setting. Read at the
  // same two shapingForTool call sites _nibAngleRadians is, and for the same
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
    this._diagLog = options.diagLog ?? (() => {})
    this._infinite = options.infinite ?? false
    // (#494) The first frame's pose (centred on the sheet for a bounded room)
    // is decided inside — see Camera's constructor. The rect read is the
    // engine's own DOM call, handed in so Camera.ts stays DOM-free.
    this._camera = new Camera({
      canvas,
      infinite: this._infinite,
      pageWidth: options.pageWidth,
      pageHeight: options.pageHeight,
      measureRect: () => canvas.getBoundingClientRect(),
    })

    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl
  this._compositor = new LayerCompositor({
    gl,
    screenBuf: () => this._screenBuf,
    layers: () => this._layers,
    previews: () => this._previews,
    transientPreviews: () => this._asyncLocalPreviewTiles(),
    reveals: () => this._washReveals,
    drawReveal: (...args) => this._drawTileReveal(...args),
    activeId: () => this._activeId,
    assembly: () => this._assemblyFBO,
    below: () => this._belowCache,
    above: () => this._aboveCache,
  })
    // (#494) Built before the passes below, which hold it by reference; its
    // texture only exists once init() runs after _initGL.
    this._paper = new PaperState({
      gl,
      infinite: this._infinite,
      type: options.paper ?? 'coarse',
      color: options.paperColor,
      scale: options.paperScale ?? 1.0,
      fillThreshold: options.paperFillThreshold ?? 0,
      fillCap: options.paperFillCap ?? 0.35,
      pageWidth: options.pageWidth,
      pageHeight: options.pageHeight,
      canvas,
      onLoaded: () => this._display(),
    })
    this._ribbonScratchPool = new RibbonScratchPool(gl)

    // (#494) See scratchPools.ts. What each buffer is set up for stays with
    // the pool's owner: here for these two, AreaOps and SmudgePainter for theirs.
    this._previewBufPool = new ScratchSlot((w, h) => new AccumulationBuffer(gl, w, h))
    this._tipBufPool = new ScratchSlot((w, h) => new AccumulationBuffer(gl, w, h))
    // (#494) Layer transform, selection, paste and fill — see AreaOps.ts.
    this._area = new AreaOps({
      gl,
      infinite: this._infinite,
      previews: this._previews,
      passes: () => this._passes,
      layer: id => this._layers.get(id),
      image: src => this._images.cached(src),
      tileSize: () => this._tileSize(),
      pageSize: () => this._paper.pageSize(),
      displayOrder: () => this._displayOrder(),
      paperColor: () => this._paper.color(),
      compositeTextures: (items, fbo, w, h) => this._compositeTextures(items, fbo, w, h),
      encodePng: async (pixels, w, h) => {
        const blob = await this._pixelsToBlob(pixels, w, h)
        return blob ? blobToDataUrl(blob) : null
      },
      display: () => this._display(),
    })
    // (#494) Reference-image import — see ImageImport.ts.
    this._images = new ImageImport({
      gl,
      passes: () => this._passes,
      decode: (src, onload, onerror) => this._decodeImage(src, onload, onerror),
      drawThroughMatrix: (target, originX, originY, img, rect, matrix) =>
        this._area.drawImageThroughMatrix(target, originX, originY, img, rect, matrix),
      pageSize: () => this._paper.pageSize(),
      layerPainted: id => { if (id !== this._activeId) this._invalidateSplitCache() },
      display: () => this._display(),
      displayIfNotSuspended: () => this._displayIfNotSuspended(),
    })
    // (#494) Shapes — see ShapePass.ts. Its program is built by _initGL
    // below, like every other one.
    this._shapes = new ShapePass({
      gl,
      infinite: this._infinite,
      previews: this._previews,
      screenBuf: () => this._screenBuf,
      layer: id => this._layers.get(id),
      tileSize: () => this._tileSize(),
      pageSize: () => this._paper.pageSize(),
      layerPainted: id => { if (id !== this._activeId) this._invalidateSplitCache() },
      display: () => this._display(),
    })
    // (#494) Export and the thumbnail — see Exporter.ts. Its programs are
    // built by _initGL below, like every other one.
    this._exporter = new Exporter({
      gl,
      infinite: this._infinite,
      screenBuf: () => this._screenBuf,
      pageSize: () => this._paper.pageSize(),
      compositeOrder: () => this._compositeOrder,
      contentBounds: id => this.getContentBounds(id),
      // Export the material target, never the transient wet presentation.
      // The screen continues its reveal while the offscreen export draws.
      drawLayer: (frame, id, opacity, fbo, w, h) => this._drawCompositeItem(frame, id, opacity, fbo, w, h, false),
      composePaper: (tex, fbo, w, h, origin) => this._renderPaperComposeInto(tex, fbo, w, h, origin),
      composeScreen: () => {
        this._composeToFBO()
        return this._compositeFBO.texture
      },
      display: () => this._display(),
      canvasSize: () => ({ w: this.canvas.width, h: this.canvas.height }),
      cameraCenter: () => ({ wx: this._camera.pose.wx, wy: this._camera.pose.wy }),
      canvasBlob: () => new Promise<Blob | null>(resolve => this.canvas.toBlob(resolve, 'image/png')),
      encode: (pixels, w, h, type, quality) => this._pixelsToBlob(pixels, w, h, type, quality),
    })
    // (#494) The room snapshot in and out — see SnapshotIO.ts. The log and
    // the checkpoint store are assigned further down, hence functions.
    this._snapshotIO = new SnapshotIO({
      gl,
      infinite: this._infinite,
      ledger: this._snapshots,
      pageSize: () => this._paper.pageSize(),
      tileSize: () => this._tileSize(),
      layer: id => this._layers.get(id),
      log: () => this._log,
      checkpoints: () => this._checkpoints,
      quiet: id => this._snapshotQuiet(id),
      settled: id => this._snapshotSettled(id),
      scratchLayer: id => this._makeLayerBuffer(id),
      applyPixelOp: (buf, id, op) => this._applyPixelOp(buf, id, op),
      preloadImages: ops => { void this.preloadImages(ops) },
    })
    // (#494) Layer merge and duplicate — see structuralOps.ts. The layer map
    // and the log are assigned further down, hence functions.
    this._structural = new StructuralOps({
      ledger: this._snapshots,
      log: () => this._log,
      layer: id => this._layers.get(id),
      hasLayer: id => this._layers.has(id),
      setLayer: (id, buf) => { this._layers.set(id, buf) },
      makeLayerBuffer: id => this._makeLayerBuffer(id),
      createBuffer: id => this._createBuffer(id),
      destroyBuffer: id => this._destroyBuffer(id),
      replayInto: (buf, id, ops) => this._replayInto(buf, id, ops),
      compositeTextures: (items, fbo, w, h) => this._compositeTextures(items, fbo, w, h),
      takeCheckpoint: id => this._takeCheckpoint(id),
      invalidateSplitCache: () => this._invalidateSplitCache(),
      displayIfNotSuspended: () => this._displayIfNotSuspended(),
    })
    // (#494) Layer filters — see FilterPass.ts.
    this._filters = new FilterPass({
      gl,
      infinite: this._infinite,
      previews: this._previews,
      passes: () => this._passes,
      layer: id => this._layers.get(id),
      tileSize: () => this._tileSize(),
      pageSize: () => this._paper.pageSize(),
      layerPainted: id => { if (id !== this._activeId) this._invalidateSplitCache() },
      display: () => this._display(),
    })
    // (#494) Smudge and the mixer — see SmudgePainter.ts. Its programs are
    // built by _initGL below, like every other one.
    this._smudge = new SmudgePainter({
      gl,
      quadBuf: () => this._quadBuf,
      screenBuf: () => this._screenBuf,
      paper: this._paper,
    })
    // (#494) The dab stamps — pencil, eraser, liner, charcoal. See
    // StampPainter.ts; its programs are built by _initGL below too.
    this._stamps = new StampPainter({
      gl,
      infinite: this._infinite,
      quadBuf: () => this._quadBuf,
      paper: this._paper,
      grainMode: charcoal => this._resolveGrainMode(charcoal),
    })

    // (#494) The digital brush — see BrushPainter.ts; its programs are
    // built by _initGL below too.
    this._brush = new BrushPainter({
      gl,
      quadBuf: () => this._quadBuf,
      paper: this._paper,
      segmentLength: (dab, prev, radius) => this._markerSegmentLength(dab, prev, radius),
    })

    this.canvas.addEventListener('webglcontextlost', this._handleContextLost)
    this.canvas.addEventListener('webglcontextrestored', this._handleContextRestored)

    this._opts = {
      deskColor:     options.deskColor     ?? DEFAULT_DESK_COLOR,
      pencilType:    options.pencilType    ?? 'HB',
      size:          options.size          ?? 24,
      paperScale:    this._paper.scale,
      graphiteColor: options.graphiteColor ?? DEFAULT_GRAPHITE_COLOR,
      tool:          'pencil',
      opacity:       options.opacity       ?? 1.0,
    }
    this._userId = options.userId ?? 'local'
    this._onLocalOperation = options.onLocalOperation
    this._onPreviewApplied = options.onPreviewApplied
    this._onInvariant = options.onInvariant
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

    this._initGL()
    // Placeholder now, the real bake once it has loaded — see PaperState.init.
    this._paper.init()
    this._pointer = new PointerInput(canvas, this._diagLog)
    this._dabs    = new DabSystem()

    this._layers          = new Map()
    this._baseLayerIds    = new Set()
    this._compositeOrder  = []
    this._activeId        = null
    this._locked          = false
    this._log             = new OperationLog()
    this._checkpoints     = new CheckpointStore(CHECKPOINT_BUDGET_BYTES)
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

  /** (#486) Replaces the pre-log layer set with the one a restored snapshot
   *  describes, destroying the buffers of any layer it does not list.
   *
   *  The removal half is the whole point, and it exists because a restore
   *  starts from an engine that has *already* been told about the room's
   *  initial layers: Room's mount effect calls `initLayer` for each layer in
   *  `makeInitialLayerState()` — `layer-1` and `background` — long before it
   *  knows this room has a snapshot to restore. If `layer-1` was deleted below
   *  the snapshot's structure seq, the operation that deleted it is one the
   *  server legitimately withholds (`isCoveredBySnapshot`: the stored structure
   *  already accounts for it), so nothing in the log this client receives can
   *  ever retire that buffer, and `_syncBuffersToLog` would recreate it anyway
   *  — `_baseLayerIds` is its seed.
   *
   *  The layer is invisible, so it costs nothing anybody can see. What it costs
   *  is the room: `liveLayerIds()` keeps reporting it, and snapshotSync's
   *  #386/#462 guard reads the store's (correct) LayerState omitting it as the
   *  store being stale, and refuses the upload. Every upload, in every session,
   *  on every device — the guard's verdict is a pure function of a divergence
   *  that never heals. Room `U68gWoq-` (Ilya's homework, 22–24.08) stopped
   *  baking at seq 4100, one second after the `layer_add` that followed its
   *  last good checkpoint, and by seq 11291 its `room_state` was 43 MB of JSON
   *  — 28 MB on the wire, past what a join survives. Nothing was ever lost;
   *  the lesson simply stopped being openable.
   *
   *  Safe against false retirement by construction: at the moment a restore
   *  calls this, `_baseLayerIds` holds exactly the initial layers plus whatever
   *  a previous restore put there, and no operation has been applied yet. A
   *  layer missing from the snapshot's structure is therefore one the structure
   *  outlived, never one created after it. */
  setBaseLayers(ids: readonly string[]): void {
    this._replayRestoredStructure = false
    const next = new Set(ids)
    for (const id of this._baseLayerIds) {
      if (!next.has(id)) this._destroyBuffer(id)
    }
    this._baseLayerIds = next
    for (const id of next) this._createBuffer(id)
    // #122: the below/above split cache was built from a layer set that no
    // longer holds — same reasoning as the layer_delete branch's own call.
    this._invalidateSplitCache()
  }

  setActiveLayer(id: string): void {
    if (id !== this._activeId) this._clearWash()
    this._activeId = id
    // #122: moves the below/above split point itself.
    this._invalidateSplitCache()
  }

  /** See the PencilEngineAPI doc comment. */
  setEraseThroughLayers(ids: readonly string[]): void {
    this._eraseThroughIds = [...ids]
  }

  setLocked(locked: boolean): void {
    this._locked = locked
  }

  setPaperFillThreshold(threshold: number): void {
    this._paper.fillThreshold = threshold
  }

  setPaperFillCap(cap: number): void {
    this._paper.fillCap = cap
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
    // lib/layers/layers.ts's computeCompositeOrder) — unconditional invalidation is
    // cheap and doesn't need to reason about whether this particular call
    // actually changed anything relative to the last one.
    this._invalidateSplitCache()
    this._display()
  }

  /** See PencilEngineAPI's doc comment. */
  setDisplayFilter(ids: ReadonlySet<string> | null): void {
    this._displayFilter = ids
    // Same reasoning as setCompositeOrder: the below/above halves are baked
    // from what is on screen, and that just changed.
    this._invalidateSplitCache()
    this._display()
  }

  /** (#557) What the screen composites: `_compositeOrder` narrowed by the
   *  display filter. The picture's own order is `_compositeOrder`, and the
   *  export path reads that one directly — see setDisplayFilter. */
  private _displayOrder(): CompositeItem[] {
    const filter = this._displayFilter
    return filter ? this._compositeOrder.filter(it => filter.has(it.id)) : this._compositeOrder
  }

  // ─── Operation log API ───────────────────────────────────────────────────────

  /** See PencilEngineAPI's doc comment. */
  suspendDisplay(): void { this._flushOpQueue(); this._displaySuspendDepth++ } // (§17.58)

  /** See PencilEngineAPI's doc comment. */
  resumeDisplay(): void {
    this._displaySuspendDepth = Math.max(0, this._displaySuspendDepth - 1)
    if (this._displaySuspendDepth !== 0) return
    // (#381) Before the composite, not after: _display() reads the layer
    // buffers, and until these run they still hold whatever the batch's undos
    // left half-applied. See _rebuildLayerOrDefer.
    this._flushPendingRebuilds()
    // (#536, §17.44) A batch of history (room join, reconnect, a rebuild) is
    // over: the washes it replayed are closed - their pixels are on the
    // layer - and their scratch was holding hundreds of megabytes of GPU
    // memory on the tablet for joins that will never come. A peer's wash
    // still open would lose only its joinability, and only if a history
    // batch lands in the middle of it.
    if (this._settle) this._completeSettle() // (§17.52) before its scratch goes
    // (§17.68) ...except the ones still open: spilled, so a peer who goes on
    // painting into one is painted here as everywhere else.
    const open = new Set(this._openWashes(this._log.doneOperations(), Date.now()).open)
    for (const key of [...this._replayRibbonChunks.keys()]) this._evictChunk(key, open.has(key))
    this._ribbonScratchPool.trimFree()
    this._display()
  }

  /** See PencilEngineAPI's doc comment. */
  paperReady(): Promise<void> { return this._paper.ready() }

  /** See PencilEngineAPI's doc comment. */
  retryPaper(): Promise<void> { return this._paper.retry() }

  /** (#147) What appendOperation's own branches and _applyHistoryChange/
   *  StructuralOps call instead of `this._display()` directly — a no-op
   *  while a suspendDisplay() span is active (see its own doc comment),
   *  otherwise identical to calling _display() right there. */
  private _displayIfNotSuspended(): void {
    // (#536, §17.44) Coalesced onto the next animation frame rather than drawn
    // here and now: during a watercolour stroke this fired from the settle
    // ticks and the reveal timer on top of the move-driven frame, and the
    // GPU profile showed the paper composite - the dearest pass there is,
    // 3.5 ms a call on a desktop - running twice per frame. Nothing that
    // calls this needs the pixels before the frame; export draws for itself.
    // (§17.46) Anything that asks through here may have changed any pixel.
    this._paperPartialOK = false
    this._paperDamage = null
    if (this._displaySuspendDepth === 0) this._scheduleDisplay()
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
   *  `applyContentOp` in `lib/layers/layers.ts`, which is equally origin-agnostic —
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
    // (#536, §17.58) A peer's watercolour operation arriving while a settle is
    // still spreading over frames waits its turn instead of forcing that
    // settle to land now: on the iPad the forced landing was 85-325 ms of every
    // arrival (four participants painting). Whole - the log too - so nothing
    // sees the operation before it is painted; strictly in arrival order; and
    // everything else, and everything that reads the engine's state, lands the
    // queue first (_flushOpQueue).
    if (this._shouldQueue(op, source)) {
      this._opQueue.push({ op, source })
      this._scheduleOpDrain()
      return
    }
    this._flushOpQueue()
    this._appendOperationNow(op, source)
  }

  /** (§17.58) See appendOperation. */
  private _opQueue: Array<{ op: Operation; source: OperationSource }> = []
  private _opDrainRaf = 0

  private _shouldQueue(op: Operation, source: OperationSource): boolean {
    if (source !== 'remote' || this._displaySuspendDepth !== 0 || this._destroyed || this._contextLost) return false
    if (typeof requestAnimationFrame !== 'function') return false
    // Behind a queue, every peer operation waits - order kept without a
    // synchronous landing of everything ahead of it.
    if (this._opQueue.length > 0 || this._wcAsyncFinish && this._wcCanonical.pending) return true
    // (§17.72) Any stroke behind a settle in flight, not only watercolour:
    // landing it first was a synchronous settle, up to half a second on the
    // Surface, for a pencil line arriving at the wrong moment. The rare
    // structural operations (a dry, a layer change) still land it now.
    if (op.type !== 'stroke') return false
    return !!this._settle || (op.tool === 'watercolor' && !!this._strokeLayerId)
  }

  /** (§17.58) Applies every queued operation now, in order. */
  private _flushOpQueue(): void {
    if (this._wcAsyncFinish && this._wcCanonical.pending && !this._contextLost && !this.gl.isContextLost()) { this._scheduleOpDrain(); return }
    while (this._opQueue.length) {
      const { op, source } = this._opQueue.shift()!
      this._appendOperationNow(op, source)
    }
  }

  /** (§17.58) One queued operation per frame, and only once the settle ahead
   *  of it has landed on its own. */
  private _scheduleOpDrain(): void {
    if (this._opDrainRaf || typeof requestAnimationFrame !== 'function') return
    this._opDrainRaf = requestAnimationFrame(() => {
      this._opDrainRaf = 0
      if (!this._opQueue.length || this._destroyed) return
      // Not under this user's own pen either: a peer's operation lands in
      // 30-280 ms on the iPad, and the stroke in hand would stutter by it.
      if (!this._settle && !this._strokeLayerId && !(this._wcAsyncFinish && this._wcCanonical.pending)) {
        const { op, source } = this._opQueue.shift()!
        this._appendOperationNow(op, source)
      }
      if (this._opQueue.length) this._scheduleOpDrain()
    })
  }

  private _appendOperationNow(op: Operation, source: OperationSource, canonicalExecution = false, alreadyLogged = false): void {
    if (this._wcAsyncFinish && source === 'local' && !canonicalExecution && this._wcCanonical.pending) {
      if (op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke') this._cancelSettle()
      else if (op.type !== 'paper_dry') {
        const held = structuredClone(op)
        // Acceptance is CPU/log-only; cancelling GPU work must never erase
        // an action already sent to the server. Replay owns recovery.
        const overtaken = this._log.append(held, { pending: true })
        this._noteOvertaken(held, overtaken)
        if (held.type === 'layer_clear') this._paperWet.forgetLayer(held.layerId)
        else if (held.type === 'layer_delete') for (const id of held.layerIds) this._paperWet.forgetLayer(id)
        this._onLocalOperation?.(held)
        const owner = this
        this._wcCanonical.enqueue({ execute: function* () {
          if (owner._log.entries.some(e => e.op.id === held.id && e.state === 'done')) owner._appendOperationNow(held, source, true, true)
        }, cancel: () => {} })
        return
      }
    }
    // (#536, §17.52) A settle spread over frames (a peer's operation, or this
    // author's own) lands before the next operation touches anything: the
    // replay settles each operation before painting the next, and this keeps
    // the live picture to that order.
    const lost = this._contextLost || this.gl.isContextLost()
    if (this._settle && !lost && !(this._wcAsyncFinish && op.type === 'paper_dry')) this._completeSettle()
    // (#537) Local: the pending tail, applied ahead of the server's order.
    // Remote: already ordered, so into the confirmed region at its seq — which
    // is below any pending operation of this client's own.
    const overtaken = alreadyLogged ? [] : this._log.append(op, source === 'local' ? { pending: true } : { serverSeq: op.seq })
    // Marked before the switch below applies it, not after: a merge or a
    // duplicate checkpoints its result on the spot, and a layer already known
    // to be out of order must refuse that checkpoint (_takeCheckpoint).
    this._noteOvertaken(op, overtaken)
    // The confirmed journal keeps advancing while the GPU is unavailable.
    // Restore replays that journal; interim paint must not create dead handles.
    if (lost) {
      if (op.type === 'paper_dry') this._paperWet.clear()
      else if (op.type === 'layer_clear') this._paperWet.forgetLayer(op.layerId)
      if (op.type === 'operation_revoke') this._log.revoke(op.targetOpId)
      else if (op.type === 'operation_undo') this._log.applyUndo(op.targetOpId, op.userId)
      else if (op.type === 'operation_redo') this._log.applyRedo(op.targetOpId, op.userId)
      if (source === 'local' && !alreadyLogged) this._onLocalOperation?.(op)
      return
    }
    for (const layerId of pixelWriteLayerIds(op)) {
      if (this._foreignUnrecordedInk(layerId, op)) this._unsettledLayers.add(layerId)
    }
    switch (op.type) {
      case 'layer_add':
        this._createBuffer(op.layerId)
        break
      // (#536, §17.48) Everyone's paper dries at once - live, from a peer, and
      // on replay alike, at this point in the log order: the water of every
      // stroke before it goes, the strokes after it wet the paper again.
      case 'paper_dry':
        this.watercolorDryAll()
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
        // (#536) Clearing a layer clears its water too — see undo().
        this._paperWet.forgetLayer(op.layerId)
        const clearBuf = this._layers.get(op.layerId)
        // (#374) See the stroke branch: already in the restored pixels, so
        // re-applying it would wipe content the snapshot took *after* this
        // clear happened.
        if (clearBuf && this._snapshots.isCovered(op.layerId, op.seq)) {
          this._log.revoke(op.id)
          break
        }
        if (clearBuf) {
          clearBuf.clear()
          this._snapshots.markDirty(op.layerId)
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
        this._structural.execMerge(op) // (#374) see StructuralOps.execMerge
        break
      case 'layer_duplicate':
        this._structural.execDuplicate(op) // (#449)
        break
      case 'stroke': {
        this._retireWashesOf(op) // (§17.57)
        // (#536, §17.49) Undone later in this same history batch: logged
        // (above), not painted - see setUnpaintedInBatch.
        if (this._unpaintedInBatch?.has(op.id)) { this._skippedInBatch.add(op.id); break }
        const buf = this._layers.get(op.layerId)
        // (#374) Already in the restored pixels. The server withholds these,
        // so arriving at all means the two disagreed — a snapshot landing
        // between this client's room_state and its snapshot fetch is enough.
        // Revoked rather than merely not painted: an operation left `done` in
        // the log would be replayed on top of the pinned snapshot checkpoint
        // the next time this layer rebuilds, which is the same double-paint
        // one step later. Same treatment, and same reasoning, as a pixel op
        // whose target no longer exists.
        if (buf && this._snapshots.isCovered(op.layerId, op.seq)) {
          this._log.revoke(op.id)
          break
        }
        if (buf && source === 'remote' && op.tool === 'watercolor' && op.washId) {
          this._checkpointBeforeWash(op.layerId, op.washId, op.userId, op.timestamp, op.id)
        }
        if (buf) {
          // Smudge (#416) needs no seeding here anymore: an operation is
          // self-sufficient again, because the imprint the tool carries is
          // reset at every gesture boundary and rebuilt from this op's own
          // dabs (see SmudgePainter.resumeGesture, and
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
          // (§17.52) A peer's operation arriving live settles over frames;
          // a history batch (the display suspended) stays synchronous.
          const spread = source === 'remote' && this._displaySuspendDepth === 0
          if (spread && op.tool === 'watercolor' && dabs.length && (op.washId ?? op.strokeId)
            && typeof requestAnimationFrame === 'function') {
            this._paintOpOverFrames(buf, op, dabs) // (§17.72)
          } else {
            const standing = dabs.length
              ? this._paintDabs(buf, dabs, op.tool, op.preset, op.color, op.userId, undefined, undefined, op.strokeId, op.washId, op.wet, mottleSeedFromStrokeId(op.strokeId), spread)
              : undefined
            // (#536) The same dabs, and the same slice: whatever the live stream
            // already delivered has already wet the paper here.
            this._wetFromForeignStroke(op.layerId, op.tool, op.preset, dabs, op.timestamp, standing, op.id)
          }
          this._snapshots.markDirty(op.layerId)
          // (#468) Never mid-wash, the same rule the local path follows one
          // stroke over. A checkpoint bakes the layer's pixels, and the strokes
          // of a wash share an accumulation whose frozen base is the canvas as
          // it was *before* the wash began. Baking half of one and later
          // restoring to it hands the rest of the wash a base that already
          // contains its own beginning — the mark then differs from the
          // author's permanently, rather than until the next reload.
          //
          // Deferring costs nothing: the next operation that is not part of a
          // wash takes the checkpoint instead, and checkpoints are an
          // optimisation for undo and replay speed, never a correctness
          // requirement.
          if (!op.washId) this._maybeCheckpoint(op.layerId)
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
        if (buf && this._snapshots.isCovered(op.layerId, op.seq)) {
          this._log.revoke(op.id)
          break
        }
        if (buf) {
          this._snapshots.markDirty(op.layerId)
          // (#398) The image is already decoded on every replay path (see
          // preloadImages) — paint it here and now, so the operations after
          // it in this same loop see the pixels they were recorded against.
          if (this._images.paintDecoded(buf, op)) {
            this._maybeCheckpoint(op.layerId)
          } else {
            this._images.paint(buf, op)
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
      // (#527) A shape is the same shape of operation as the two selection ops
      // below: one layer, pixels only, nothing to decode and nothing async —
      // it is drawn from its own numbers the moment it arrives.
      // (#574) A filter too: one layer, pixels only, computed from its own
      // numbers the moment it arrives.
      case 'layer_filter':
      case 'shape':
      case 'area_transform':
      case 'area_clear': {
        const buf = this._layers.get(op.layerId)
        if (!buf) { this._log.revoke(op.id); break }
        if (this._snapshots.isCovered(op.layerId, op.seq)) { this._log.revoke(op.id); break }
        if (op.type === 'layer_filter') this._filters.apply(buf, op.filter)
        else if (op.type === 'shape') this._shapes.draw(buf, op)
        else if (op.type === 'area_transform') this._area.bakeAreaTransform(buf, op.selection, op.matrix)
        else this._area.clearArea(buf, op.selection)
        this._snapshots.markDirty(op.layerId)
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
        if (this._snapshots.isCovered(op.layerId, op.seq)) { this._log.revoke(op.id); break }
        this._snapshots.markDirty(op.layerId)
        const record = asImportRecord(op)
        const matrix = op.type === 'area_paste' ? op.matrix : undefined
        // Same decoded/late split as image_import above — see #398. A local
        // paste is always already decoded (the clipboard raster came from this
        // very engine); a peer's arrives cold and takes the async path.
        if (this._images.paintDecoded(buf, record, matrix)) {
          this._maybeCheckpoint(op.layerId)
        } else {
          this._images.paint(buf, record, matrix)
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
          if (this._snapshots.isCovered(t.layerId, op.seq)) { appliedAny = true; continue }
          this._area.bakeLayerTransform(buf, t.matrix)
          this._snapshots.markDirty(t.layerId)
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
        // (§17.49) A target this batch never painted has nothing to take out.
        // Only one it actually skipped: on a reconnect the tail can repeat a
        // stroke this engine painted before the drop, and that one must go.
        if (target && !this._skippedInBatch.has(target.id)) this._applyHistoryChange(target)
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
    this._settleLayers()
    if (source === 'local' && !alreadyLogged) this._onLocalOperation?.(op)
  }

  /** See PencilEngineAPI's doc comment. */
  confirmOperation(opId: string, seq: number): boolean {
    const confirmed = this._log.confirm(opId, seq)
    if (!confirmed) return false
    this._noteOvertaken(confirmed.op, confirmed.overtaken)
    this._settleLayers()
    return true
  }

  /** See PencilEngineAPI's doc comment. */
  discardOperation(opId: string): boolean {
    if (!this._log.isPending(opId)) return false
    const target = this._log.revoke(opId)
    if (!target) return false
    // An undo or redo put nothing on the canvas of its own — it flipped
    // another entry, and that flip is what has to come back: the server kept
    // the target as it was. (A refused revoke is left alone — it leaves its
    // target `gone`, which the log has no way to walk back.)
    if (target.type === 'operation_undo' || target.type === 'operation_redo') {
      const flipped = target.type === 'operation_undo'
        ? this._log.applyRedo(target.targetOpId, target.userId)
        : this._log.applyUndo(target.targetOpId, target.userId)
      if (flipped) this._applyHistoryChange(flipped)
      return true
    }
    // The same re-sync an undo or a teacher's revoke gets: whatever it put on
    // the canvas has to come off again, by replaying the layer without it.
    this._applyHistoryChange(target)
    return true
  }

  /** See PencilEngineAPI's doc comment. */
  resettleCount(): number {
    return this._resettleCount
  }

  /** (#537) `op` has just taken its place in the log below `overtaken` —
   *  entries that were already applied, so their pixels went down *before*
   *  `op`'s did although they come after it. Wherever the two touch the same
   *  layer, that layer's pixels are in the wrong order.
   *
   *  "Touch" includes reading: a merge or duplicate bakes its source's content
   *  as of its own place in the order, so a source that picked up something
   *  which now sorts after the merge was baked with too much in it. */
  private _noteOvertaken(op: Operation, overtaken: readonly LogEntry[]): void {
    if (!overtaken.length) return
    const writes = pixelWriteLayerIds(op)
    const reads = pixelReadLayerIds(op)
    if (!writes.length && !reads.length) return
    const touched = new Set([...writes, ...reads])
    for (const e of overtaken) {
      if (e.state !== 'done') continue
      const laterWrites = pixelWriteLayerIds(e.op)
      const laterReads = pixelReadLayerIds(e.op)
      if (laterWrites.some(id => touched.has(id))) {
        for (const id of writes) this._unsettledLayers.add(id)
        for (const id of laterWrites) this._unsettledLayers.add(id)
      } else if (laterReads.some(id => writes.includes(id))) {
        for (const id of laterWrites) this._unsettledLayers.add(id)
      }
    }
  }

  /** (#537) Whether `layerId` holds ink painted live by a gesture other than
   *  the one `op` records — this user's own gesture still under the pen, or a
   *  peer's streamed one (#429) — that no operation accounts for yet. `op`'s
   *  pixels then went down in the middle of that gesture's, which is no order
   *  at all: whichever of the two the server puts first, the layer is wrong
   *  where they overlap. */
  private _foreignUnrecordedInk(layerId: string, op: Operation): boolean {
    const strokeId = op.type === 'stroke' ? op.strokeId : undefined
    const own = (userId: string, id: string | null | undefined) => !!strokeId && userId === op.userId && id === strokeId
    if ((this._strokeLayerId === layerId || this._strokeExtraLayerIds.includes(layerId))
      && !own(this._userId, this._strokeId)) return true
    for (const live of this._peerLiveStrokes.values()) {
      if (live.layerId !== layerId || live.paintedTotal <= live.committedOffset) continue
      if (!own(live.peerId, live.strokeId)) return true
    }
    return false
  }

  /** (#537) Rebuilds every unsettled layer that can be rebuilt right now — the
   *  visible "re-settle" into true order.
   *
   *  Never while this user is drawing (#429): a rebuild is a full replay on the
   *  main thread, and the pen is the one place where a dropped frame is felt.
   *  Never a layer with unrecorded ink on it either — a replay from the log
   *  would wipe ink no operation describes yet — nor one a watercolor wash is
   *  still open on, whose next stroke pools against the content from before
   *  it began. Each of those clears on its own (pen-up, the operation
   *  arriving, the wash drying), and each of those moments calls this again. */
  private _settleLayers(): void {
    if (this._wcAsyncFinish && this._wcCanonical.pending && !this._contextLost && !this.gl.isContextLost()) { this._retrySettleIn(16); return }
    if (this._contextLost || this.gl.isContextLost()) return
    if (!this._unsettledLayers.size || this._strokeLayerId) return
    let settled = false
    for (const layerId of [...this._unsettledLayers]) {
      if (!this._layers.has(layerId)) { this._unsettledLayers.delete(layerId); continue }
      if (this._hasUnrecordedInk(layerId)) continue
      const wash = this._wash
      if (wash && wash.layerId === layerId) {
        const openFor = WASH_JOIN_MS - (performance.now() - wash.endedAt)
        if (openFor > 0) { this._retrySettleIn(openFor + 1); continue }
      }
      this._unsettledLayers.delete(layerId)
      this._resettleCount++
      this._rebuildLayerOrDefer(layerId)
      this._checkpointAfterSettle(layerId)
      settled = true
    }
    if (settled) this._displayIfNotSuspended()
  }

  private _retrySettleIn(ms: number): void {
    if (this._settleRetryTimer !== null) return
    this._settleRetryTimer = setTimeout(() => {
      this._settleRetryTimer = null
      if (!this._destroyed) this._settleLayers()
    }, ms)
  }

  /** A settle is a replay of everything since the layer's best checkpoint.
   *  On a layer two people keep drawing on at once, that tail is also what
   *  _takeCheckpoint keeps refusing to cut (there is always somebody's
   *  unrecorded ink on it), so it would only grow. A settled layer equals its
   *  replay state by construction — the one moment a checkpoint is certainly
   *  valid — so take one here once the tail is long enough to be worth it. */
  private _checkpointAfterSettle(layerId: string): void {
    const ops = this._log.layerPixelOps(layerId)
    const best = this._checkpoints.best(layerId, ops)
    if (ops.length - (best?.start ?? 0) < CHECKPOINT_INTERVAL) return
    const schedule: (fn: () => void) => void =
      typeof requestIdleCallback === 'function' ? requestIdleCallback : fn => setTimeout(fn, 0)
    schedule(() => this._takeCheckpoint(layerId))
  }

  /** Done operations in seq order — the material for LayerState derivation. */
  getOperations(): Operation[] {
    // (§17.58) Queued operations count as done - they will be, in this order -
    // but are not landed for it: the room reads this after every operation
    // (useLogDerivedState), and landing here emptied the queue each time.
    const done = this._log.doneOperations()
    return this._opQueue.length ? [...done, ...this._opQueue.map(q => q.op)] : done
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
    if (this._wcAsyncFinish && this._strokeLayerId) return null
    const target = this._log.undoTarget(this._userId)
    if (!target) return null
    // (#536) Take the paper's water with it. The wetness field is not in the
    // Operation Log and cannot be (ADR 011 §17.3), so there is nothing to
    // replay backwards — but paper that stays wet after the stroke that wet it
    // has been undone is plainly wrong, and the next stroke would go on reading
    // a puddle that no longer has a cause. Dropping the whole layer's water
    // takes other strokes' with it; that is a small over-correction on a field
    // which is ephemeral anyway and dries in seconds.
    if ('layerId' in target && typeof target.layerId === 'string') {
      this._paperWet.forgetLayer(target.layerId)
    }
    this.appendOperation({
      id: nanoid(10), type: 'operation_undo', userId: this._userId,
      timestamp: Date.now(), targetOpId: target.id,
    })
    return target
  }

  /** Symmetric with `undo()` — see its docstring. */
  redo(): Operation | null {
    if (this._wcAsyncFinish && this._strokeLayerId) return null
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
    this._paper.setType(type)
    this._display()
  }

  setPencil(type: string): void  { this._opts.pencilType = type }
  setTool(tool: ToolType): void  {
    // (#468 v7) Reaching for another tool ends the wash: whatever is on the
    // paper stops being something the next stroke can pool into.
    if (tool !== this._opts.tool) this._clearWash()
    this._opts.tool = tool
  }
  setOpacity(v: number): void    { this._opts.opacity = v }
  setSize(px: number): void      { this._opts.size = px }

  // Only the *next* stroke picks this up — _onStart() copies it into
  // _strokeColor, which gets baked into that stroke's dabs (and its recorded
  // StrokeOperation), so changing it never repaints already-drawn strokes.
  setColor(rgb: [number, number, number]): void { this._opts.graphiteColor = rgb }

  /** See PencilEngineAPI's doc comment. Only the *next* stroke picks this
   *  up (same "never mid-stroke" rule as _nibAngleRadians' own field
   *  comment) — no need to touch the in-progress DabSystem shaping here. */
  /** (#468 v7) Ends the wash in progress, if any. A wash is "several bands of
   *  the same paint on the same layer, laid before the last one dried" — so
   *  anything that changes what is in the brush, or what it is being laid on,
   *  ends it at once regardless of timing. */
  private _clearWash(land = true): void {
    // (#536, §17.47) A settle still in flight lands first. Tearing the scratch
    // down under it dropped it (_tickSettle: "nothing to land"), so switching
    // tool or layer within a second of a pen-up left the author looking at an
    // unsettled mark that every replay settles - the stroke "changed after a
    // reload". Not on engine teardown, where nothing will look again.
    if (land && this._settle && !(this._wcAsyncFinish && this._wcCanonical.pending)) this._completeSettle()
    this._retireAsyncScratch(this._wash?.scratch)
    this._wash = null
    this._washId = null
    // (#536) The paper does not un-wet itself because the tool changed, so the
    // field is *not* cleared here — only pruned of what has finished drying.
    // Switching to a pencil and back a few seconds later should still find the
    // puddle, which is what happens on a real desk.
    this._paperWet.prune(performance.now())
  }

  /** (#536) Paints the wash with one term of the composite's product instead
   *  of the product: 1 the silhouette after spreading, 2 the film's density,
   *  3 the deposit's pigment channel, 4 the standing water the wet diffusion
   *  pass gates on (§17.11).
   *
   *  Exists because "which of these fields is the blotching" was answered three
   *  times by reasoning about amplitudes and wrong every time. The terms have
   *  different spatial scales and different origins — one is the deposit, one
   *  is a blur-and-rethreshold of the silhouette — so a single look at each
   *  settles it. Dev-only, on the Debug tab. */
  /** See PencilEngineAPI's doc comment. */
  releaseForPageHide(): void {
    if (this._destroyed) return
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  getWatercolorPerf(): WatercolorPerf {
    const now = performance.now()
    const WINDOW = 2000
    const p = this._wcPerf
    const prune = (at: number[], ms: number[]): void => {
      let k = 0
      while (k < at.length && at[k] < now - WINDOW) k++
      if (k) { at.splice(0, k); ms.splice(0, k) }
    }
    prune(p.frameAt, p.frameMs)
    prune(p.batchAt, p.batchMs)
    const pct = (xs: number[], q: number): number => {
      if (!xs.length) return 0
      const s = [...xs].sort((a, b) => a - b)
      return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
    }
    const intervals: number[] = []
    for (let i = 1; i < p.frameAt.length; i++) intervals.push(p.frameAt[i] - p.frameAt[i - 1])
    const span = p.batchAt.length > 1 ? Math.max(WINDOW, now - p.batchAt[0]) : WINDOW
    const MB = 1 / (1024 * 1024)
    const pool = this._ribbonScratchPool.bytes
    let revealBytes = 0
    for (const r of this._washReveals.values()) {
      revealBytes += r.before.width * r.before.height * 4 * 4 / 3
      if (r.pending) revealBytes += r.pending.width * r.pending.height * 4 * 4 / 3
      if (r.wetMask) revealBytes += r.wetMask.width * r.wetMask.height * 4 * 4 / 3
    }
    for (const b of this._revealPool) revealBytes += b.width * b.height * 4 * 4 / 3
    return {
      frameP50: pct(intervals, 0.5), frameP95: pct(intervals, 0.95), frames: p.frameAt.length,
      displayMs: pct(p.frameMs, 0.5),
      batchesPerSec: p.batchAt.length * 1000 / span, batchP50: pct(p.batchMs, 0.5), batchMax: pct(p.batchMs, 1),
      settleMs: p.settleMs, settleOps: p.settleOps, rebuildSliceMs: p.sliceWorst.ms,
      scratchLiveMB: pool.live * MB, scratchFreeMB: pool.free * MB,
      fieldMB: this._fieldCache.reduce((n, f) => n + f.w * f.h * 4 * 10, 0) * MB,
      revealMB: revealBytes * MB,
      wetCells: this._paperWet.peak(now) > 0.01 ? this._paperWet.countWet(this._activeId ?? '', now, 0.1) : 0,
    }
  }

  setWatercolorDebugView(view: 0 | 1 | 2 | 3 | 4): void {
    this._wcDebugView = view
    this._display()
  }

  /** (#536, §17.24) Applied in _drawRibbonCompositeDab, so a replay under the
   *  switch recomposites the same deposit without the effect. */
  /** #728 diagnostic opt-in; fifth low program is warmed separately in QA. */
  private _wcGradientFibres = false
  private _wcAb = { noSpread: false, noMigrate: false, noDiffuse: false, noCarry: false, opDry: false }
  setWatercolorAb(ab: { noSpread: boolean; noMigrate: boolean; noDiffuse?: boolean; noCarry?: boolean; opDry?: boolean }): void {
    this._wcAb = { noSpread: ab.noSpread, noMigrate: ab.noMigrate, noDiffuse: !!ab.noDiffuse, noCarry: !!ab.noCarry, opDry: !!ab.opDry }
    this._display()
  }

  setNibAngle(angleRadians: number, anchor: NibAnchor): void {
    this._nibAngleRadians = angleRadians
    this._nibAnchor = anchor
  }

  /** See PencilEngineAPI's doc comment. Next stroke only, same as the marker
   *  angle above. */
  setTiltResponse(response: TiltResponse): void { this._tiltResponse = response }

  /** See PencilEngineAPI's doc comment. Straight through to PointerInput —
   *  the engine keeps no copy, because there is nothing downstream that should
   *  ever be able to ask what the calibration was: by then the number is
   *  already corrected. */
  setPressureMap(map: PressureMap | null): void {
    this._pointer.setPressureMap(map)
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
   *      every _display() call site in this file (and Exporter's transparent fallback) —
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
    const [sx, sy] = applyMatrix(invertMatrix(this._camera.screenToWorldMatrix()), canvasX, canvasY)
    const x = Math.round(sx)
    const y = Math.round(sy)
    // Off-screen is unreadable rather than wrong: the colour lives in the
    // framebuffer, and a point the camera is not currently looking at has no
    // pixel to sample. Callers already handle null (a pick that misses).
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
    // (#536, §17.46) Displays are coalesced onto the next frame now; a pick
    // right after an operation read the frame before it (the eyedropper after
    // a stroke, and every e2e probe). Land the pending one first.
    if (this._displayRafId !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._displayRafId)
      this._displayRafId = null
      this._display()
    }
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
   *  transform drags (see AreaOps.bakeLayerTransform's own docstring). Live traces
   *  showed this dominating a 22s `pointerup` INP (57% readPixels, 31%
   *  checkFramebufferStatus from the tile creation that came with it), with
   *  AreaOps.bakeLayerTransform itself barely registering. Now a plain lookup —
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
   *  also calls, per frame in some of them) nor into AreaOps.bakeLayerTransform (which
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
    // #482: same reason as setInfiniteCamera's own assignment — a bounded room
    // rotates too, and the tilt reading is against the screen either way.
    this._dabs.cameraAngle = angle
    this._pointer.setTransform(this._camera.boundedPointerTransform(cx, cy, zoom, angle))
  }

  /** See PencilEngineAPI's doc comment. The pointer transform is the exact
   *  inverse of the composite's world->screen math — see
   *  Camera.pointerTransform. */
  setInfiniteCamera(wx: number, wy: number, zoom: number, angle: number): void {
    this._camera.set(wx, wy, zoom, angle)
    // #482: the frame the device's tilt reading has to be converted out of —
    // see DabSystem.cameraAngle. Assigned here rather than at stroke start so
    // it tracks a canvas rotated with the pen still down.
    this._dabs.cameraAngle = angle
    this._pointer.setTransform(this._camera.pointerTransform())
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

  /** See PencilEngineAPI's doc comment, and Camera.canvasRect. */
  invalidateCanvasRect(): void {
    this._camera.invalidateRect()
  }

  resizeCanvas(width: number, height: number): void {
    const { gl, canvas } = this
    if (canvas.width === width && canvas.height === height) return
    this._clearAsyncPresentations(this._contextLost || gl.isContextLost())
    canvas.width = width
    canvas.height = height
    // (#155 follow-up) A genuine layout event — Camera.canvasRect's cache is
    // stale from here on until re-queried.
    this._camera.invalidateRect()
    const { w: ew, h: eh } = this._camera.renderBufferExtent()
    this._compositeFBO.destroy()
    this._belowCache.destroy()
    this._aboveCache.destroy()
    this._assemblyFBO.destroy()
    this._compositeFBO = new AccumulationBuffer(gl, width, height)
    this._belowCache = new AccumulationBuffer(gl, ew, eh)
    this._aboveCache = new AccumulationBuffer(gl, ew, eh)
    this._assemblyFBO = new AccumulationBuffer(gl, ew, eh)
    this._compositor.invalidateSplitCache()
    // The paper texture itself is NOT recreated here (unlike
    // _belowCache/_assemblyFBO/etc. above, which are genuinely canvas-size-
    // dependent) — it's a fixed, baked-offline resolution (see
    // PaperState.load/paperLoader.ts), decoupled from canvas size entirely, so
    // there's nothing for a canvas resize to invalidate.
    this._display()
  }


  /** Live gizmo-drag preview (#120) — see AreaOps.previewLayerTransform. */
  previewLayerTransform(transforms: Array<{ layerId: string; matrix: LayerTransformMatrix }>): void {
    this._area.previewLayerTransform(transforms)
  }

  /** Ends a gizmo-drag preview — see AreaOps.clearLayerTransformPreview. */
  clearLayerTransformPreview(): void {
    this._area.clearLayerTransformPreview()
  }

  /** See PencilEngineAPI's doc comment. Queues `op` for its author's reveal;
   *  starts the reveal loop immediately if this peer has nothing else in
   *  flight, otherwise it plays once the current head of the queue finishes. */
  previewOperation(op: StrokeOperation, rate = 1): void {
    if (this._contextLost || this.gl.isContextLost()) {
      // This callback commits the confirmed operation, not just its preview.
      this._onPreviewApplied?.(op)
      return
    }
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
    if (state.timer === null || state.waitingCanonical && state.queue.length === 1) {
      if (state.timer !== null) clearTimeout(state.timer)
      this._startPeerPreviewHead(op.userId)
    }
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
  appendPeerLiveDabs(peerId: string, packet: PeerLivePacket, canonicalExecution = false): void {
    if (this._contextLost || this.gl.isContextLost()) return
    if (!canonicalExecution && this._wcAsyncFinish && packet.tool !== 'watercolor' && this._wcCanonical.pending && this._queueAsyncPeerLive(peerId, packet)) return
    const key = liveStrokeKey(peerId, packet.strokeId, packet.layerId)
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

    // (#536, ADR 011 §17.51) Not painted: a peer's watercolour lands when its
    // operation does, through the replay path - one settle per operation,
    // exactly as a reload paints it. Painted here, every packet of a few dabs
    // went through that same path, and that path SETTLES after each call: a
    // full settle per packet on every watching device - 150-500 ms a packet
    // on the iPad, WebSocket handlers eating 800 ms frames on the Android,
    // the Surface's GPU reset under it - and a picture settled in
    // packet-sized steps that no reload reproduces. Nothing painted, nothing
    // claimed: the operation paints all of its dabs when it arrives.
    if (packet.tool === 'watercolor') { live.liveOffset += packet.dabs.length; return }
    // (§17.52) Other tools paint into the layer now: a spread settle lands first.
    if (this._settle) this._completeSettle()

    // This packet's dabs sit at [liveOffset, liveOffset + n) in the gesture.
    // Anything below paintedTotal is already on the layer — put there by a
    // chunk operation that overtook the stream, which happens routinely: the
    // first operation of a long gesture carries a full STROKE_DAB_CHUNK_LIMIT
    // and lands mid-stroke. Painting those again would darken exactly the
    // stretch where the two sources overlap.
    const skip = Math.min(Math.max(0, live.paintedTotal - live.liveOffset), packet.dabs.length)
    const dabs = skip ? packet.dabs.slice(skip) : packet.dabs
    // (#536) Sliced by the same amount and for the same reason: the profile is
    // one digit per dab precisely so that every place a gesture gets cut can
    // take its own piece without arithmetic.
    const wet = packet.wet && skip ? packet.wet.slice(skip) : packet.wet
    live.liveOffset += packet.dabs.length
    if (!dabs.length) return
    live.paintedTotal = Math.max(live.paintedTotal, live.liveOffset)

    // `strokeId` is what makes marker and smudge continuous across packets —
    // the same argument a chunked replay passes, reaching the same
    // _replayChunkScratch / SmudgePainter.resumeGesture bookkeeping. `prevDab` is
    // deliberately left undefined for the same reason it is on the replay
    // path: both tools recover it from their own gesture state, and passing a
    // second, independently-tracked copy is how the two get to disagree.
    const standing = this._paintDabs(
      buf, dabs, packet.tool, packet.preset, packet.color, peerId,
      undefined, undefined, packet.strokeId, packet.washId, wet,
      mottleSeedFromStrokeId(packet.strokeId),
    )
    // (#536) A peer's water reaches this client's paper as they lay it, not
    // when their operation lands — the point of the live stream is that the
    // other person's mark is there to work into while they are still drawing.
    this._wetFromForeignStroke(packet.layerId, packet.tool, packet.preset, dabs, null, standing)
    this._snapshots.markDirty(packet.layerId)
    if (packet.layerId !== this._activeId) this._invalidateSplitCache()
    this._displayIfNotSuspended()
  }

  /** See PencilEngineAPI's doc comment. */
  endPeerLiveStroke(peerId: string, strokeId?: string): number {
    for (const held of this._wcAsyncPeerStreams.values()) if (held.peerId === peerId && (!strokeId || held.strokeId === strokeId)) held.ended = true
    // With `strokeId`, exactly the gesture whose pen came up. Without it (a
    // peer leaving), every gesture of theirs that is still open.
    //
    // (#520) A filter rather than a keyed lookup even in the first case: one
    // gesture can hold several entries now, one per layer it painted into, and
    // the pen came up on all of them at once.
    const entries = strokeId
      ? [...this._peerLiveStrokes.values()].filter(e => e.peerId === peerId && e.strokeId === strokeId)
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
      if (owed === 0) this._peerLiveStrokes.delete(liveStrokeKey(live.peerId, live.strokeId, live.layerId))
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
    for (const held of this._wcAsyncPeerStreams.values()) {
      held.cancelled = true
      if (held.buf && !this._contextLost && !this.gl.isContextLost()) held.buf.destroy()
      held.buf = null
    }
    this._wcAsyncPeerStreams.clear()
    // (#699) A reset retires the pixels as well as their claims. A gesture
    // with no accepted operation never marked its layer out of order, so
    // merely clearing this map left its ink behind forever (freeze/reject,
    // disconnect or gap catch-up). Replay only layers with an unrecorded
    // tail; the accepted prefix remains in the log/checkpoint. The existing
    // settle gates protect this user's own unfinished gesture.
    for (const live of this._peerLiveStrokes.values()) {
      if (live.paintedTotal > live.committedOffset) this._unsettledLayers.add(live.layerId)
    }
    this._peerLiveStrokes.clear()
    // (#537) Nothing foreign is unrecorded now, so its settle can proceed.
    this._settleLayers()
  }

  /** (#429) How many of an arriving stroke operation's dabs are already on the
   *  layer because this client painted them live, and advances that gesture's
   *  claim by the operation's own length. Returns 0 whenever the live path
   *  isn't involved, which is every stroke in a room where nobody is streaming
   *  — including this client's own, since it never streams to itself. */
  private _claimLivePaintedDabs(op: StrokeOperation, dabCount: number): number {
    if (!op.strokeId) return 0
    const live = this._peerLiveStrokes.get(liveStrokeKey(op.userId, op.strokeId, op.layerId))
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
      this._peerLiveStrokes.delete(liveStrokeKey(op.userId, op.strokeId, op.layerId))
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
    if (this._contextLost || this.gl.isContextLost()) {
      const queued = [...state.queue]
      this._peerPreviews.delete(peerId)
      for (const head of queued) this._onPreviewApplied?.(head.op)
      return
    }
    const head = state.queue[0]
    if (!head) {
      if (state.waitingCanonical) {
        if (this._wcCanonical.pending || this._opQueue.length || this._rebuildJobs.size || this._pendingRebuilds.size) {
          state.timer = setTimeout(() => this._stepPeerPreview(peerId), 16)
        } else {
          state.timer = null; state.buf.destroy(); this._peerPreviews.delete(peerId); this._scheduleDisplay()
        }
      }
      return
    }
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
      if (this._wcAsyncFinish && op.tool === 'watercolor') {
        // Peer reveal is transient: no shared canonical scratch/solver here.
        const waterOnly = watercolorMixFromPreset(op.preset).pigment <= 0
        const marks = due.map(d => ({ ...d, opacity: d.opacity * (waterOnly ? 0.12 : 0.5) }))
        this._stamps.paint(state.buf, this._translateDabs(marks, state.origin), op.tool, op.preset, waterOnly ? [0.5, 0.5, 0.5] : op.color)
      } else this._paintDabs(state.buf, this._translateDabs(due, state.origin), op.tool, op.preset, op.color, op.userId)
      // (#697) Every peer owns a reveal timer, but all peers share one
      // screen. Coalesce their composites without delaying log commits.
      this._scheduleDisplay()
    }

    if (state.dabIdx >= dabs.length) {
      this._onPreviewApplied?.(op)
      state.queue.shift()
      const hold = this._wcAsyncFinish && (op.tool === 'watercolor' || state.waitingCanonical) && (this._wcCanonical.pending || this._opQueue.length > 0 || this._rebuildJobs.size > 0 || this._pendingRebuilds.size > 0)
      state.waitingCanonical = hold
      if (!hold) state.buf.clear()
      if (state.queue.length) this._startPeerPreviewHead(peerId)
      else if (hold) state.timer = setTimeout(() => this._stepPeerPreview(peerId), 16)
      else { state.timer = null; state.buf.destroy(); this._peerPreviews.delete(peerId); this._scheduleDisplay() }
      return
    }
    state.timer = setTimeout(() => this._stepPeerPreview(peerId), 16)
  }

  on(event: EngineEventName, fn: EngineHandler): this {
    this._handlers[event] = fn
    return this
  }

  /** See PencilEngineAPI's doc comment; the work is Exporter's (#494).
   *
   *  Awaits paperReady() first: the paper texture loads asynchronously (see
   *  PaperState.load), and an export triggered in the brief window before it
   *  resolves would otherwise bake in the flat placeholder gray instead of
   *  real paper grain. In practice this is a no-op wait almost always — the
   *  3 baked assets are small and prefetched from construction — but a
   *  slow/offline first load makes the gap real. */
  async exportPNG(transparent = false): Promise<Blob | null> {
    await this._paper.ready()
    if (this._wcAsyncFinish && (!await this._wcCanonical.ready() || this._strokeLayerId)) return null
    return this._exporter.exportPNG(transparent)
  }

  async exportReviewImage(): Promise<import('./src/export/Exporter').ReviewExport | null> {
    await this._paper.ready()
    if (this._destroyed || this._contextLost) return null
    if (this._wcAsyncFinish && (!await this._wcCanonical.ready() || this._strokeLayerId)) return null
    return this._exporter.exportReviewImage()
  }

  /** See PencilEngineAPI's doc comment, and ADR 015 §5 for why it exists;
   *  the work is Exporter's (#494). */
  async bakePreview(maxSide = 320): Promise<Blob | null> {
    await this._paper.ready()
    if (this._destroyed || this._contextLost) return null
    if (this._wcAsyncFinish && (!await this._wcCanonical.ready() || this._strokeLayerId)) return null
    return this._exporter.bakePreview(maxSide)
  }

  destroy(): void {
    this._opQueue = [] // (§17.58)
    if (this._opDrainRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._opDrainRaf)
    this._destroyed = true
    this._cancelSettle() // Close suspended drawing/auxiliary generators before their pool.
    this._cancelSpillJob()
    this._paper.destroy()
    for (const id of [...this._rebuildJobs.keys()]) this._cancelRebuildJob(id) // (§17.53)
    this._dropWashBoundaries() // (§17.55)
    // Dwell (#245): the one non-rAF timer this engine owns — must not
    // outlive destroy() (e.g. a component unmounting mid-stroke).
    if (this._dwellTimer) { clearInterval(this._dwellTimer); this._dwellTimer = null }
    if (this._settleRetryTimer !== null) { clearTimeout(this._settleRetryTimer); this._settleRetryTimer = null }
    this._unsettledLayers.clear()
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
    this._passes.destroy()
    // (#155) The pool fields are the real owners now — _previewBuf/_tipBuf
    // are just a possibly-mid-stroke alias of the same object (see
    // ScratchSlot), so destroying via the pool alone avoids a
    // double-destroy of the same GL object.
    this._previewBufPool.destroy()
    this._previewBuf = null
    this._tipBufPool.destroy()
    this._tipBuf = null
    this._area.destroy()
    this._shapes.destroy()
    this._exporter.destroy()
    this._smudge.destroy()
    this._stamps.destroy()
    this._brush.destroy()
    this._ribbonPasses.destroy()
    this._watercolorPasses.destroy()
    // (#385) These two hand their buffers back to the pool rather than to the
    // driver, so the pool has to be drained *after* them — draining first
    // would leave exactly the buffers they are still holding behind.
    this._ribbonStrokeScratch?.destroy()
    this._ribbonStrokeScratch = null
    this._clearWash(false)
    this._strokeId = null
    for (const c of this._replayRibbonChunks.values()) c.scratch.destroy()
    this._replayRibbonChunks.clear()
    for (const w of this._spilledWashes.values()) w.spill.dispose()
    this._spilledWashes.clear()
    this._lostWashes.clear()
    this._ribbonPainter.releaseWaterSources()
    this._ribbonScratchPool.destroy()
    if (this._dryingTimer) { clearTimeout(this._dryingTimer); this._dryingTimer = 0 }
    if (this._budgetTimer) { clearTimeout(this._budgetTimer); this._budgetTimer = 0 }
    if (this._wetTex) { this.gl.deleteTexture(this._wetTex); this._wetTex = null }
    this._wetOverlayWorkspace = null
    this._paperWet.clear()
    for (const { buf, timer } of this._peerPreviews.values()) {
      if (timer !== null) clearTimeout(timer)
      buf.destroy()
    }
    this._peerPreviews.clear()
    this._peerLiveStrokes.clear()
    this._previews.clear()
    this._checkpoints.clear()
    // (#381) Nothing left to rebuild into — the buffers are gone.
    this._pendingRebuilds.clear()
    // (#522) Nor is there a layer left to refuse to publish; whatever restores
    // into this engine next is what it will have to answer for.
    this._snapshots.clearRefusals()
    // (#536, §17.69) ...and the rest of what the watercolour holds on the
    // GPU. A room left without a page reload (the app's own navigation) keeps
    // the WebGL context alive until the browser collects it, and all of this
    // with it: the settle field alone is up to 90 MB. The iPad, moved from
    // room to room between test runs, died early in a run at 338 MB of this
    // engine's own textures.
    if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }
    for (const f of this._fieldCache) destroyField(f)
    this._fieldCache = []
    for (const r of this._washReveals.values()) { r.before.destroy(); r.pending?.destroy(); r.wetMask?.destroy() }
    this._washReveals.clear()
    for (const b of this._revealPool) b.destroy()
    this._revealPool = []
    this._settlePlan.destroyTextures()
    this.gl.deleteTexture(this._paperTex)
    // (#536, §17.69) And the context itself, when its canvas has already left
    // the page (the room was closed; React removes the element before the
    // engine is retired). Left to the collector, a phone moving from room to
    // room piled them up until a new engine's programs no longer linked
    // ("Program link error:" with an empty log, the Android tab after four
    // rooms). A canvas still on the page is kept: a board switch builds the
    // next engine on the same element, and a lost context would be its.
    if (this.canvas.isConnected === false) this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  // ─── History / replay ────────────────────────────────────────────────────────

  /** Re-syncs pixel state after `op` flipped between done and undone/gone. */
  private _applyHistoryChange(op: Operation): void {
    if (this._wcAsyncFinish) {
      this._cancelSettle()
      // These previews already committed their callbacks. History removes
      // their transient pixels, not their confirmed journal operations.
      for (const [peerId, state] of this._peerPreviews) if (state.waitingCanonical) {
        if (state.timer !== null) clearTimeout(state.timer)
        state.waitingCanonical = false
        if (this._contextLost || this.gl.isContextLost()) this._peerPreviews.delete(peerId)
        else if (state.queue.length) { state.buf.clear(); this._startPeerPreviewHead(peerId) }
        else { state.buf.destroy(); this._peerPreviews.delete(peerId) }
      }
    }
    if (this._contextLost || this.gl.isContextLost()) return
    switch (op.type) {
      // (#520) Every layer of the gesture, not only this operation's own:
      // undo/redo flip a whole gesture at once (OperationLog._gestureEntries),
      // and a cross-layer erase is one gesture spread over several layers. See
      // OperationLog.gestureLayerIds — which answers `[op.layerId]` for every
      // other stroke, so this is the same single rebuild it always was.
      case 'stroke':
        for (const layerId of this._log.gestureLayerIds(op)) this._rebuildLayerOrDefer(layerId)
        break
      case 'layer_clear':
      // (#446) Single-layer pixel operations, same as the two above: undoing
      // or redoing one means replaying its layer's history without (or with)
      // it. Nothing here can be derived from the operation's own effect —
      // erasing a region cannot be inverted in place, only replayed away.
      case 'area_transform':
      case 'area_clear':
      case 'area_paste':
      case 'area_fill':
      // (#527) Same reasoning for a shape: undoing one means replaying its
      // layer without it. It paints over whatever was under it and cannot be
      // subtracted in place.
      case 'shape':
      // (#574) And a filter, which reads the pixels it rewrites: the only way
      // back is the layer's history without it.
      case 'layer_filter':
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
  private _syncBuffersToLog(rebuildNewLayers = true): void {
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
      if (rebuildNewLayers) this._rebuildLayer(id)
    }
  }

  /** Restores a layer's buffer to replay state: nearest valid checkpoint plus
   *  the tail of its done pixel operations. */
  private _rebuildLayer(layerId: string): void {
    const buf = this._layers.get(layerId)
    if (!buf) return
    // (#536, §17.53) A watercolour replay settles every operation: 5 s on the
    // laptop, 22 s on the iPad for one undo in a lesson-sized room, the
    // Surface's GPU reset under it, and every participant frozen at once
    // (an undo is everyone's operation). Sliced instead, into a fresh buffer.
    const ops = this._log.layerPixelOps(layerId)
    if (this._rebuildWantsSlicing(layerId, ops)) { this._startRebuildJob(layerId); return }
    this._cancelRebuildJob(layerId)
    this._replayInto(buf, layerId, ops)
    this._noteReplayedOrder(layerId)
    // (#522) A layer whose pixels reach below the log window can only be
    // rebuilt from its snapshot checkpoint. If that is gone — evicted once the
    // layer was destroyed and unpinned — the replay above just produced a
    // knowingly incomplete layer, and this is the one place that can tell:
    // afterwards nothing distinguishes it from a layer that is simply emptier
    // than it used to be.
    if (this._snapshots.hasCoverage(layerId)
      && !this._checkpoints.hasSnapshotFor(layerId)) {
      this._snapshots.refusePublishing(layerId)
    }
    // (#373) The single choke point for undo/redo/revoke reaching pixels —
    // the case a comparison of log counts cannot see, since undoing one
    // operation and drawing another leaves every count where it was.
    this._snapshots.markDirty(layerId)
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
  /** (§17.53) Whether a rebuild replays any watercolour: only that is dear
   *  enough to slice (and needs a timer, which a test double may lack). */
  private _rebuildWantsSlicing(layerId: string, ops: PixelOperation[]): boolean {
    if (typeof setTimeout !== 'function' || this._destroyed) return false
    const best = this._checkpoints.best(layerId, ops)
    for (let i = best?.start ?? 0; i < ops.length; i++) {
      const op = ops[i]
      if (op.type === 'stroke' && op.tool === 'watercolor' && !best?.cp.covered?.has(op.id)) return true
    }
    return false
  }

  private _cancelRebuildJob(layerId: string, restarting = false): void {
    const job = this._rebuildJobs.get(layerId)
    if (!job) return
    if (job.timer) clearTimeout(job.timer)
    this._rebuildJobs.delete(layerId)
    if (this._settle && this._jobOwnsSettle(job)) this._completeSettle()
    for (const c of job.chunks.values()) c.scratch.destroy()
    this._forgetWashesOf(job.fresh) // (§17.68)
    job.fresh.destroy()
    // A restart makes its washes again straight away - from these.
    if (!restarting) this._endPoolHold()
  }

  /** (§17.70) The pool's hold for rebuilds ends with the last of them. */
  private _endPoolHold(): void {
    if (this._rebuildJobs.size || !this._ribbonScratchPool.holding) return
    this._ribbonScratchPool.holding = false
    this._ribbonScratchPool.trimToCeiling()
  }

  /** (§17.53) Starts (or restarts) the sliced rebuild of `layerId`: a fresh
   *  buffer, the best checkpoint restored into it, the replay scheduled. */
  private _startRebuildJob(layerId: string): void {
    this._cancelRebuildJob(layerId, true)
    // (§17.70) Where memory is short, the washes of the buffer being replaced
    // go now rather than at the swap, and their textures become the rebuild's:
    // holding both was the iPad making 600 tile buffers per rebuild, up to 2 s
    // each. A peer painting into one of them before the swap is painted on the
    // old buffer from a fresh start until then; the rebuild replays it right.
    const old = this._layers.get(layerId)
    if (this._gpuBudget !== Infinity && old) {
      this._ribbonScratchPool.holding = true
      for (const [k, c] of [...this._replayRibbonChunks]) {
        if (c.target !== old) continue
        if (this._settle?.scratch === c.scratch) this._completeSettle()
        c.scratch.destroy()
        this._replayRibbonChunks.delete(k)
        this._chunkAuthors.delete(k)
      }
      this._forgetWashesOf(old)
    }
    const ops = this._log.layerPixelOps(layerId)
    const fresh = this._makeLayerBuffer(layerId)
    ;(fresh instanceof TiledLayerBuffer ? fresh : null)?.suspendEviction()
    fresh.clear()
    const best = this._checkpoints.best(layerId, ops)
    if (best) {
      for (const t of best.cp.tiles) {
        const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
        const pixels = unpackTilePixels(t.packed, t.width * t.height * 4)
        for (const target of fresh.resolveForPaint(rect)) target.buffer.restorePixelsRect(t.width, t.height, pixels)
        fresh.restoreTileContent(rect, pixels)
      }
    }
    const job: RebuildJob = { layerId, fresh, chunks: new Map(), cp: best?.cp ?? null, start: best?.start ?? 0, applied: [], timer: 0, part: null }
    if (best) this._seedWashes(best.cp, fresh, job.chunks) // (§17.56)
    this._rebuildJobs.set(layerId, job)
    job.timer = setTimeout(() => this._stepRebuildJob(job), 0)
  }

  /** One slice: re-check the job still describes the log (an undo meanwhile
   *  restarts it), replay for ~12 ms, and swap once caught up. */
  private _stepRebuildJob(job: RebuildJob): void {
    job.timer = 0
    if (this._rebuildJobs.get(job.layerId) !== job || this._destroyed) return
    if (this._contextLost) { job.timer = setTimeout(() => this._stepRebuildJob(job), 100); return }
    const ops = this._log.layerPixelOps(job.layerId)
    const startNow = job.cp ? this._checkpoints.startOf(job.cp, ops) : 0
    let valid = startNow === job.start
    for (let k = 0; valid && k < job.applied.length; k++) valid = ops[job.start + k]?.id === job.applied[k]
    if (!valid) { this._startRebuildJob(job.layerId); return }
    // Never under this user's own pen: one watercolour operation replays in
    // up to 2 s of GPU on the iPad, which the stroke in hand would stutter by.
    if (this._strokeLayerId) { job.timer = setTimeout(() => this._stepRebuildJob(job), 50); return }
    // (§17.72) Nor over somebody else's settle still spreading: the next
    // operation's finish would land it here in one piece (0.5 s on the Surface).
    if (this._settle && !this._jobOwnsSettle(job)) { job.timer = setTimeout(() => this._stepRebuildJob(job), 16); return }
    // The slice is bounded in GPU time, not only CPU: one settle of a
    // lesson-sized wash is 0.6 s of GPU on the laptop, queued by a few ms of
    // script - enough, on the Surface, for Windows to reset the GPU. So the
    // settles run spread, this job drives its own entry by entry, and every
    // unit of work is waited out (gl.finish) before the clock is read.
    const gl = this.gl
    const t0 = performance.now()
    const live = this._replayRibbonChunks
    this._replayRibbonChunks = job.chunks
    this._inJobStep = true
    try {
      let i = job.start + job.applied.length
      let first = true
      while (first || performance.now() - t0 < 12) {
        first = false
        if (this._settle && this._jobOwnsSettle(job)) this._advanceSettle()
        else if (i < ops.length) {
          const op = ops[i]
          const covered = !!job.cp?.covered?.has(op.id)
          if (!covered && this._replaysInSlices(op)) {
            if (!this._replayStrokeSlice(job, op)) continue
          } else if (!covered) this._applyPixelOp(job.fresh, job.layerId, op, true)
          job.applied.push(op.id)
          i++
        } else break
        gl.finish()
      }
    } finally {
      job.chunks = this._replayRibbonChunks
      this._replayRibbonChunks = live
      this._inJobStep = false
    }
    const caughtUp = job.start + job.applied.length >= ops.length && !(this._settle && this._jobOwnsSettle(job))
    if (!caughtUp) { job.timer = setTimeout(() => this._stepRebuildJob(job), 0); return }
    this._swapRebuiltLayer(job)
  }

  /** (§17.70) A stroke a rebuild may replay in slices: watercolour, grouped
   *  by gesture (the replay cache is what carries it from slice to slice, as
   *  it carries a gesture across its chunk operations). */
  private _replaysInSlices(op: PixelOperation): op is StrokeOperation {
    return op.type === 'stroke' && op.tool === 'watercolor' && !!(op.washId ?? op.strokeId)
  }

  /** (§17.70) The next few draws of `op` into the job's buffer; true once
   *  the whole operation is on it. The draws are the one-shot replay's, in its
   *  order (see _ribbonDabsWork), so the picture is the one-shot's to the bit;
   *  only the time is spread. Each batch is waited out on the GPU before the
   *  clock is read, and sizes the next. */
  private _replayStrokeSlice(job: RebuildJob, op: StrokeOperation): boolean {
    let p = job.part
    if (!p || p.opId !== op.id) {
      this._retireWashesOf(op) // (§17.57)
      const dabs = strokeDabs(op)
      p = job.part = {
        opId: op.id, dabs,
        work: this._ribbonDabsWork(
          job.fresh, dabs, op.tool, op.preset, op.color, undefined, undefined, op.strokeId, op.washId, op.wet,
          mottleSeedFromStrokeId(op.strokeId), true, REBUILD_BAND_PIECE_TRIS,
        ),
      }
    }
    let r = this._runSlice(p.work)
    if (!r.done && r.value === -1) r = p.work.next() // the finish, in this step
    if (!r.done) return false
    this._wetFromForeignStroke(job.layerId, op.tool, op.preset, p.dabs, op.timestamp, r.value, op.id)
    job.part = null
    return true
  }

  /** (§17.70) One slice of a stroke's drawing, within _sliceLimits and waited
   *  out on the GPU; stops early at the drawing's end (a yield of -1). */
  private _runSlice(work: Generator<number, ReadonlyMap<Dab, number> | undefined, void>): IteratorResult<number, ReadonlyMap<Dab, number> | undefined> {
    const g = this._sliceLimits
    const t0 = performance.now()
    let groupAt = t0
    let draws = 0, px = 0, groupDraws = 0, groupPx = 0
    let r = work.next()
    while (!r.done && r.value >= 0) {
      draws++
      px += r.value
      groupDraws++
      groupPx += r.value
      const byPx = groupPx >= g.px
      if (byPx || groupDraws >= g.size) {
        this.gl.finish()
        const now = performance.now()
        g.noteGroup(now - groupAt, byPx)
        groupAt = now
        groupDraws = 0
        groupPx = 0
        if (now - t0 >= g.budgetMs) break
      }
      r = work.next()
    }
    this.gl.finish()
    if (draws) {
      g.noteSlice(draws, px, performance.now() - t0)
      this._wcPerf.sliceWorst = g.worst
    }
    return r
  }

  /** (§17.72) A peer's watercolour operation arriving live, drawn over frames
   *  the way a rebuild draws it: as a settle whose first entries are slices of
   *  the drawing, so everything that already waits for a settle in flight (the
   *  next operation, the author's own pen, a snapshot) waits for this too. Its
   *  landing runs the stroke's finish, which starts the operation's own settle
   *  - spread as before. One operation drawn in one piece was up to 0.94 s of
   *  GPU on the Surface. */
  private _paintOpOverFrames(buf: ILayerBuffer, op: StrokeOperation, dabs: Dab[]): void {
    const work = this._ribbonDabsWork(
      buf, dabs, op.tool, op.preset, op.color, undefined, undefined, op.strokeId, op.washId, op.wet,
      mottleSeedFromStrokeId(op.strokeId), true, REBUILD_BAND_PIECE_TRIS,
    )
    const land = (): void => {
      let r = work.next()
      while (!r.done) r = work.next()
      this._wetFromForeignStroke(op.layerId, op.tool, op.preset, dabs, op.timestamp, r.value, op.id)
    }
    const first = this._runSlice(work)
    if (first.done) { this._wetFromForeignStroke(op.layerId, op.tool, op.preset, dabs, op.timestamp, first.value, op.id); return }
    const scratch = first.value === -1 ? null : this._replayRibbonChunks.get(op.washId ?? op.strokeId ?? '')?.scratch
    if (!scratch) { land(); return }
    const ops: Array<() => void> = [() => {}]
    const step = (): void => {
      const r = this._runSlice(work)
      if (!r.done && r.value !== -1) ops.push(step)
    }
    ops.push(step)
    this._startSettle(scratch, ops, land, {
      // The first slice may be entirely auxiliary water import, before the
      // recipient owns a tile. Cache identity distinguishes this from a
      // destroyed/replaced wash without treating an empty scratch as dead.
      isAlive: () => this._replayRibbonChunks.get(op.washId ?? op.strokeId ?? '')?.scratch === scratch,
      abort: () => { work.return(undefined) },
    })
  }

  /** (§17.70) How much a rebuild's watercolour slice may draw on this
   *  device. Both limits matter and differ by device: on the iPad every draw
   *  into its own target is a render pass, a few hundred in a slice cost more
   *  than their pixels, while on a desktop GPU the pixels dominate. */
  private readonly _sliceLimits = new SliceGroups()

  /** (§17.70) The buffers rebuild jobs are about to replace. */
  private _rebuildTargets(): Set<ILayerBuffer> {
    const out = new Set<ILayerBuffer>()
    for (const j of this._rebuildJobs.values()) {
      const b = this._layers.get(j.layerId)
      if (b) out.add(b)
    }
    return out
  }

  private _jobOwnsSettle(job: RebuildJob): boolean {
    const scratch = this._settle?.scratch
    for (const c of job.chunks.values()) if (c.scratch === scratch) return true
    return false
  }

  /** The rebuilt buffer takes the old one's place, with its replay caches;
   *  everything that pointed into the old buffer's tiles is let go. */
  /** (#537) A replay leaves the layer in the log's order — settled — unless
   *  somebody's live ink was on it: the replay just wiped that, and the
   *  operation that eventually records it will skip the dabs it believes are
   *  already painted (#429's claim). Leaving the layer unsettled brings them
   *  back: the next settle, after that operation lands, replays it whole. */
  private _noteReplayedOrder(layerId: string): void {
    if (this._hasUnrecordedInk(layerId)) this._unsettledLayers.add(layerId)
    else this._unsettledLayers.delete(layerId)
  }

  private _swapRebuiltLayer(job: RebuildJob): void {
    const { layerId } = job
    if (this._settle) this._completeSettle()
    const old = this._layers.get(layerId)
    for (const [k, c] of this._replayRibbonChunks) {
      if (c.target !== old) continue
      c.scratch.destroy()
      this._replayRibbonChunks.delete(k)
    }
    if (old) this._forgetWashesOf(old) // (§17.68)
    for (const [k, c] of job.chunks) this._replayRibbonChunks.set(k, c)
    this._trimChunkCache() // (§17.68)
    // This author's open wash was painted over the old tiles.
    if (this._wash?.layerId === layerId) this._clearWash()
    this._sweepReveals(performance.now(), layerId)
    this._rebuildJobs.delete(layerId)
    this._endPoolHold()
    this._layers.set(layerId, job.fresh)
    ;(job.fresh instanceof TiledLayerBuffer ? job.fresh : null)?.resumeEviction()
    old?.destroy()
    this._noteReplayedOrder(layerId) // (#537)
    if (this._snapshots.hasCoverage(layerId) && !this._checkpoints.hasSnapshotFor(layerId)) {
      this._snapshots.refusePublishing(layerId)
    }
    this._snapshots.markDirty(layerId)
    this._invalidateSplitCache()
    this._displayIfNotSuspended()
  }

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
    this._dropCarriedGestureState(buf)
    // A synchronous undo (especially the last stroke -> empty history)
    // clears tiled buffers in place and deletes their textures. Retire the
    // presentation before that clear; its canonical target is one of those
    // tiles. Temporary export/replay buffers must not retire the live layer.
    if (this._layers.get(layerId) === buf) this._sweepReveals(performance.now(), layerId)
    tiled?.suspendEviction()
    try {
      let start = 0
      const best = this._checkpoints.best(layerId, ops)
      const cp = best?.cp
      if (best && cp) {
        buf.clear()
        for (const t of cp.tiles) {
          const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
          // (#467) Unpacked here and nowhere else, one tile at a time: the
          // whole point of holding checkpoints packed is that no two of these
          // exist at once. `pixels` dies with this iteration — do not hoist it.
          const pixels = unpackTilePixels(t.packed, t.width * t.height * 4)
          // (#425) The tile's own geometry, not the buffer's: a snapshot baked
          // after #425 clips whatever hangs off the sheet, so an edge tile's
          // payload can be smaller than the tile it restores into. A tile
          // stored before that is the same call with nothing clipped.
          for (const target of buf.resolveForPaint(rect)) target.buffer.restorePixelsRect(t.width, t.height, pixels)
          // (#155 Tier 2) Exact historical pixels, not a fresh paint — scan
          // once for the real content bbox rather than a markContentPainted
          // union (which would wrongly claim the whole tile as content).
          buf.restoreTileContent(rect, pixels)
        }
        this._seedWashes(cp, buf, this._replayRibbonChunks) // (§17.56)
        start = best.start
      } else {
        buf.clear()
      }
      for (let i = start; i < ops.length; i++) {
        // (#479) Operations a restored snapshot already holds — see
        // Checkpoint.covered. Empty for every ordinary checkpoint, whose
        // opIds are an exact prefix and so has nothing left to filter.
        if (cp?.covered?.has(ops[i].id)) continue
        this._applyPixelOp(buf, layerId, ops[i])
      }
    } finally {
      tiled?.resumeEviction()
    }
  }

  /** (#554) Forgets what the *previous* pass over the log left behind for the
   *  gestures this replay is about to paint again.
   *
   *  Both caches this drops exist to carry a gesture across the several
   *  operations it was chunked into — the ribbon's scratch and bridging
   *  `prevDab` (_replayChunkScratch), smudge's carried imprint
   *  (SmudgePainter.resumeGesture). Neither was ever evicted when a layer was rebuilt,
   *  so a replay of a gesture that had already been replayed once found *its
   *  own last dab* waiting under its own id and bridged the mark's first dab
   *  onto it: a straight hairline joining the two ends of a stroke, appearing
   *  on the second undo in a row and on nothing else. A brush pen showed it
   *  worst — its end taper makes that last dab thin, so the bridge read as a
   *  stray thread rather than as part of the mark.
   *
   *  Ribbon entries are dropped for this buffer only: another layer's replay
   *  (a merge's temp buffer, a full-replay bake) holds its own and is not this
   *  replay's business. Smudge's are per user with no target to compare, so
   *  they all go except the local gesture actually in progress — that one is
   *  still being painted live by SmudgePainter.paint and must not have its imprint
   *  reset under it by, say, a peer's undo arriving mid-stroke. */
  private _dropCarriedGestureState(buf: ILayerBuffer): void {
    if (this._settle) this._completeSettle() // (§17.52) before the scratch goes
    for (const [key, chunk] of this._replayRibbonChunks) {
      if (chunk.target !== buf) continue
      chunk.scratch.destroy()
      this._replayRibbonChunks.delete(key)
    }
    this._smudge.dropReplayChunks({ userId: this._userId, strokeId: this._strokeId })
  }

  private _applyPixelOp(buf: ILayerBuffer, layerId: string, op: PixelOperation, spreadSettle = false): void {
    switch (op.type) {
      case 'stroke': {
        this._retireWashesOf(op) // (§17.57)
        // Smudge (#416): nothing to seed — see appendOperation's own stroke
        // case for why replay/undo/redo is deterministic from the op's own
        // dabs alone now.
        //
        // Decoded once and shared: this is the hot path of every layer rebuild,
        // and strokeDabs unpacks the whole packed array each time it is called.
        const dabs = strokeDabs(op)
        const standing = this._paintDabs(buf, dabs, op.tool, op.preset, op.color, op.userId, undefined, undefined, op.strokeId, op.washId, op.wet, mottleSeedFromStrokeId(op.strokeId), spreadSettle)
        // (#536) Replaying the log restores the water too, for the handful of
        // strokes young enough to still be wet. That is what makes undo behave:
        // undo drops the layer's whole field (PaperWetness.forgetLayer, which
        // cannot be selective — the field is not in the log) and the rebuild
        // that follows puts back the water of every stroke that survived. Older
        // ones cost one subtraction each and deposit nothing.
        this._wetFromForeignStroke(layerId, op.tool, op.preset, dabs, op.timestamp, standing, op.id)
        break
      }
      case 'layer_clear':
        buf.clear()
        break
      case 'layer_merge':
        this._structural.replayMergeInto(buf, op)
        break
      case 'layer_duplicate':
        this._structural.replayDuplicateInto(buf, op)
        break
      case 'image_import':
        // (#398) Same as appendOperation's own branch, minus the late-arrival
        // repair: this one can be replaying into a throwaway scratch buffer
        // (see StructuralOps.replayMergeInto), which has no layer to rebuild. Every replay
        // that matters here reaches this with the image already decoded —
        // preloadImages on the join/reconnect paths, and the cache entry the
        // first paint left behind for undo/redo's later rebuilds.
        if (!this._images.paintDecoded(buf, op)) {
          this._images.paint(buf, op).catch(err => console.error('failed to paint imported image', err))
        }
        break
      case 'layer_transform': {
        // The one PixelOperation that can belong to several layers'
        // histories at once (#120) — layerId picks out which of its
        // `transforms` entries actually applies to the buffer being
        // rebuilt right now.
        const entry = op.transforms.find(t => t.layerId === layerId)
        if (entry) this._area.bakeLayerTransform(buf, entry.matrix)
        break
      }
      // (#446) `buf` is this operation's own layer by construction here (the
      // caller filters the log per layer), so unlike layer_transform there is
      // no entry to pick out.
      case 'area_transform':
        this._area.bakeAreaTransform(buf, op.selection, op.matrix)
        break
      case 'area_clear':
        this._area.clearArea(buf, op.selection)
        break
      case 'shape':
        this._shapes.draw(buf, op)
        break
      case 'layer_filter':
        this._filters.apply(buf, op.filter)
        break
      case 'area_paste':
      case 'area_fill': {
        const record = asImportRecord(op)
        const matrix = op.type === 'area_paste' ? op.matrix : undefined
        // Same as image_import's own branch: a rebuild reaches this with the
        // raster already decoded in almost every case, and falls back to the
        // async path rather than dropping the paste when it doesn't.
        if (!this._images.paintDecoded(buf, record, matrix)) {
          this._images.paint(buf, record, matrix)
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
   *  Camera.visibleWorldRect and _composeToFBO/_display, both
   *  unchanged in size), so this never changes what an on-page bounded room
   *  looks like. */
  /** `layerId` given: this is (or is about to become, see StructuralOps.mergeLive) a
   *  real, persistent layer buffer — wires up #144's rebuild-on-demand hook
   *  so it's eligible for byte-budget eviction (see TiledLayerBuffer's own
   *  docstring). Omitted: a short-lived scratch/temp buffer (a merge
   *  source's replay target in StructuralOps.replayMergeInto, or _makeTileRebuilder's own
   *  recovery-replay scratch below) that's destroyed the moment the one
   *  operation using it finishes and never queried again afterward — no
   *  rebuildTile is wired, which is also what keeps it from evicting at all
   *  (TiledLayerBuffer's maxResidentTiles is Infinity without one). */
  private _makeLayerBuffer(layerId?: string): ILayerBuffer {
    const { w, h } = this._tileSize()
    // (#365) The coarse level is for infinite rooms only, and only for real
    // layers: a scratch instance is read once and discarded, so it has nothing
    // to gain from one.
    //
    // (#470) The stated reason for the bounded exclusion — "a bounded room
    // never minifies its buffers, the browser scales its canvas element
    // instead" — died with viewport rendering: at 27% zoom the engine is now
    // the one shrinking the sheet, 3.7x, and a mipmapped tap off a 1024 tile
    // is visibly softer than the full-resolution downscale the compositor used
    // to do. So a pyramid is exactly what this wants.
    //
    // (#503) There used to be a paragraph here saying the pyramid was still
    // off for bounded rooms because turning it on rendered nothing. It has
    // been on for them since ad45be1 — that "renders nothing" was an artifact
    // of toggling downsampleTile at runtime, and the commit that established
    // this said the note was removed. It was not; it came back through a
    // merge and then stood for a week telling every reader the opposite of
    // what the line below does. Left as a marker rather than deleted in
    // silence: a comment that survives its own retraction is worth one line
    // of warning to whoever reads this next.
    const downsample = layerId !== undefined
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
   *  AreaOps.bakeLayerTransform/StructuralOps.replayMergeInto are inherently whole-layer, cross-tile
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
   *  destination tiles the same way AreaOps.bakeLayerTransform/TiledLayerBuffer itself
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

  // ─── Context loss (#121) ─────────────────────────────────────────────────────

  // preventDefault() is required by spec for the context to be eligible for
  // restoration at all — without it, the canvas stays dead until reload. Real
  // trigger is believed to be _takeCheckpoint's full-canvas readPixels (see
  // there) stalling the GPU pipeline long enough to trip a mobile browser's
  // watchdog, especially with several full-size layer textures resident.
  private _handleContextLost = (e: Event): void => {
    e.preventDefault()
    this._contextLost = true
    // Packed checkpoint pixels survive loss; carried wash snapshots are GL
    // buffers and cannot seed a restored context. Drop the whole mid-wash
    // checkpoint: retaining its prefix without open wash state loses the tail.
    for (const cp of [...this._checkpoints.all()]) if (cp.washes) this._checkpoints.remove(cp)
    this._flushOpQueue() // (§17.58) into the log; the restore rebuilds from it
    // A confirmed preview must not depend on its timer running before restore
    // forgets the old buffers. Detach first: commit callbacks can be reentrant.
    const previews = [...this._peerPreviews.values()]
    const confirmed = previews.flatMap(state => state.queue.map(head => head.op))
    for (const state of previews) if (state.timer !== null) clearTimeout(state.timer)
    this._peerPreviews.clear()
    for (const op of confirmed) this._onPreviewApplied?.(op)
    this._ribbonPainter.releaseWaterSources(true)
    this._settlePlan.forgetTextures() // Forget captured inputs before cancellation can release them.
    this._cancelSettle() // Auxiliary handles were forgotten; close their coroutine without resuming GL.
    this._cancelSpillJob()
  }

  // The WebGLRenderingContext object itself (`this.gl`) survives restoration
  // per spec — only the GPU-side resources it created (programs, textures,
  // framebuffers) are gone and must be recreated. The Operation Log and
  // packed checkpoints are plain JS memory; carried GL wash state is dropped
  // on loss. Recovery rebuilds GL state, drops stale buffer/preview handles, then
  // let _syncBuffersToLog do exactly what it already does for a layer
  // add/delete — recreate and replay each live layer from the log.
  private _handleContextRestored = (): void => {
    // Also forget anything an already-scheduled callback retained during loss.
    this._ribbonPainter.releaseWaterSources(true)
    this._settlePlan.forgetTextures()
    this._cancelSettle()
    // Context loss invalidates the wet overlay's GL name too. Forget it
    // before _initGL / PaperState can request the first restored display;
    // deleting the old name would operate on a dead-context resource.
    this._wetTex = null
    this._wetTexAt = 0
    this._wetRect = [0, 0, -1, -1]
    this._wetShown = -1
    // (§17.53) Their buffers died with the context; the restore rebuilds.
    for (const job of this._rebuildJobs.values()) if (job.timer) clearTimeout(job.timer)
    this._rebuildJobs.clear()
    this._washBoundaries.clear() // (§17.55) their textures went with the context
    this._contextLost = false
    this._initGL()
    // The dead context took the paper texture with it: a fresh placeholder,
    // then a re-upload from the byte cache — see PaperState.init.
    this._paper.init()
    this._layers.clear() // handles are already dead; not worth destroy()ing
    this._washReveals.clear() // same — and the pool they came from is forgotten below
    this._cancelSettle()
    if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }
    this._fieldCache = []
    this._previewBuf = null
    this._previewBufPool.forget() // (#155) pooled GL object is dead too, not worth destroy()ing
    this._tipBuf = null
    this._tipBufPool.forget()
    this._area.forget() // (#155, #446) its scratch pool and selection mask died with the context
    this._smudge.forget() // same reasoning, see #14 — its pool, imprints and replay chunks
    this._ribbonStrokeScratch?.forget() // same reasoning — pooled GL objects are dead too
    this._ribbonStrokeScratch = null
    // Context loss took the wash's buffers too; drop the handles without
    // touching the driver, same as every other pool here.
    this._wash?.scratch.forget()
    this._wash = null
    this._washId = null
    for (const c of this._replayRibbonChunks.values()) c.scratch.forget()
    this._replayRibbonChunks.clear()
    // (§17.68) Their layer buffers are remade on restore; the restore replays.
    this._spilledWashes.clear()
    this._lostWashes.clear()
    // (#385) Dropped, not released: releasing would put dead handles back in
    // the pool for the next gesture to paint through.
    this._ribbonScratchPool.forget()
    this._washReveals.clear() // same reasoning — its pooled copies are dead with the pool
    this._revealPool = [] // (§17.44) dead GL objects too
    this._screenCache = null // (§17.46) same
    this._paperCacheKey = ''
    this._cancelSettle()
    if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }
    this._fieldCache = []
    for (const { timer } of this._peerPreviews.values()) {
      if (timer !== null) clearTimeout(timer)
    }
    this._peerPreviews.clear()
    this._peerLiveStrokes.clear()
    this._previews.forget() // handles dead too; a mid-drag gizmo just loses its live preview
    // (#381) _syncBuffersToLog below replays every live layer from the log
    // outright, which is strictly more than any deferred rebuild was going to
    // do — keeping them queued would just repeat that work at the next resume.
    this._pendingRebuilds.clear()
    this._syncBuffersToLog()
    this._display()
  }

  // ─── Checkpoints ─────────────────────────────────────────────────────────────

  private _maybeCheckpoint(layerId: string): void {
    if (this._wcAsyncFinish && this._wcCanonical.pending) return
    // (#150) O(1) incremental count instead of a full `layerPixelOps(layerId)`
    // log scan on every stroke/image_import/layer_transform completion — see
    // OperationLog.pixelOpDoneCount's own doc comment. _takeCheckpoint below
    // (only reached 1-in-CHECKPOINT_INTERVAL times, and deferred off this
    // interactive path already) still does its own real scan for the actual
    // ops array, unaffected by this.
    const count = this._log.pixelOpDoneCount(layerId)
    // (#536, §17.43) A watercolour operation replays with its whole settle -
    // the front, the carry, the diffusion, the group tide, ~30 full-field
    // passes - so a rebuild from a checkpoint twenty operations back (undo,
    // redo, a revoke) took seconds on a desktop GPU and read as a hang on
    // the tablet ("undo виснет, тормозит"); a long stroke is five chunk
    // operations by itself. Checkpoints come four times as often while the
    // watercolour is what is being laid down.
    const interval = this._strokeTool === 'watercolor' ? CHECKPOINT_INTERVAL_WATERCOLOR : CHECKPOINT_INTERVAL
    if (count === 0 || count % interval !== 0) return
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

  /** (#479) Whether this layer currently holds painted dabs that no operation
   *  in the log describes yet, i.e. whether `_takeCheckpoint`'s contract
   *  ("the buffer equals replay state of the layer's done pixel ops") is
   *  temporarily false for it.
   *
   *  Two sources, and they are the only two — every other route to a layer's
   *  pixels goes through an operation:
   *
   *   - the gesture under this user's own pen. `_paintStrokeDabs` paints each
   *     batch into the layer as it is sampled; the StrokeOperation carrying
   *     those dabs is recorded at pen-up (or at a STROKE_DAB_CHUNK_LIMIT
   *     boundary), so between those moments the layer is ahead of the log.
   *   - a peer's live-streamed gesture (#429). `appendPeerLiveDabs` paints
   *     onto the layer directly, and `paintedTotal > committedOffset` is
   *     exactly that state's own statement of "painted, not yet accounted for
   *     by an operation" — the same watermark pair `_claimLivePaintedDabs`
   *     uses to decide what an arriving operation must skip.
   *
   *  Deliberately not a fixable-by-waiting condition the caller has to handle:
   *  refusing costs nothing, since `_maybeCheckpoint` comes back at the next
   *  CHECKPOINT_INTERVAL boundary, by which time the operation has landed. */
  private _hasUnrecordedInk(layerId: string): boolean {
    if (this._strokeLayerId === layerId) return true
    // (#520) A cross-layer erase is ahead of the log on every layer it is
    // going through, not only on the active one.
    if (this._strokeExtraLayerIds.includes(layerId)) return true
    for (const live of this._peerLiveStrokes.values()) {
      if (live.layerId === layerId && live.paintedTotal > live.committedOffset) return true
    }
    return false
  }

  /** Snapshots the layer's current buffer(s), which must equal replay state
   *  of its done pixel ops (true at every call site: after live paint, live
   *  merge, or a replayed apply). Budgeted in bytes: eviction makes deep
   *  undo slower (longer replay), never impossible.
   *
   *  (#137) One tile snapshot per currently-resident buffer (allResident()
   *  — a bounded layer always has exactly one; a tiled layer has one per
   *  tile touched so far). A tile created *after* this checkpoint isn't
   *  retroactively added to it — CheckpointStore.best only ever picks a
   *  checkpoint whose opIds are an exact prefix of the current done ops, so
   *  replaying that checkpoint's excluded tail is exactly what brings a
   *  later tile into existence again, the same as it did the first time. */
  /** (#536, §17.55) A watercolour wash never lets a checkpoint in: its
   *  strokes share one accumulation, so the picture halfway through it is
   *  no base to replay the rest from (#468). With the paper wet for two
   *  minutes, one participant's washes follow each other with no gap, and a
   *  layer went a whole lesson without a checkpoint - every undo replayed it
   *  all (5 s on the laptop, 22 s on the iPad, a GPU reset on the Surface).
   *
   *  The one moment between two washes is just before the new one's first
   *  operation paints. The tiles are copied on the GPU now (no stall) and
   *  packed at the next idle moment. Only when no other wash on the layer
   *  may still be open - by the operations' own timestamps, against the
   *  longest a wash can be rejoined; that is a guess, and CheckpointStore
   *  checks the log itself when the checkpoint is used (crossesWash). */
  private _checkpointBeforeWash(layerId: string, washId: string, userId: string, now: number, opId?: string): void {
    if (this._contextLost || this._destroyed) return
    if (this._wcAsyncFinish && this._wcCanonical.pending) return
    if (this._rebuildJobs.has(layerId) || this._pendingRebuilds.has(layerId)) return
    // (#537) Not a layer known to be out of the server's order: its pixels are
    // not the replay of its log, and every settle and undo would start from
    // them - the same refusal _takeCheckpoint and the snapshot bake make.
    if (this._unsettledLayers.has(layerId)) return
    const buf = this._layers.get(layerId)
    if (!buf) return
    const all = this._log.layerPixelOps(layerId)
    // The operation itself is in the log already; it must be the last one, or
    // what is on screen is not the prefix before it (#289).
    const end = opId === undefined ? all.length : all.length - 1
    if (opId !== undefined && all[end]?.id !== opId) return
    const prefix = all.slice(0, end)
    // (§17.58) At most one a layer every WASH_CHECKPOINT_MIN_INTERVAL_MS: the
    // tile copies cost the iPad 65-400 ms, and four people painting cross a
    // boundary every half second.
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (nowMs - (this._lastBoundaryCheckpoint.get(layerId) ?? -Infinity) < WASH_CHECKPOINT_MIN_INTERVAL_MS) return
    const since = prefix.length - (this._checkpoints.best(layerId, prefix)?.start ?? 0)
    if (since < WASH_CHECKPOINT_MIN_OPS) return
    // (§17.56) The washes that may still be continued past this point: the
    // one this operation joins, and any other participant's their author has
    // not left and that is young enough to be rejoined.
    const { open, lastAt } = this._openWashes(prefix, now, userId, washId)
    if (open.length && since < WASH_STATE_CHECKPOINT_MIN_OPS) return
    // (§17.58) A touch device carries no washes: a whole-sheet wash is 144 MB
    // of copies, its GPU budget would drop them again, and its undo has the
    // sliced rebuild (§17.53) to fall back on.
    if (open.length && Number.isFinite(this._gpuBudget)) return
    // At this author's own pen-down the stroke is already under way but has
    // painted nothing yet: only a peer's unrecorded ink can be on the layer.
    if (opId === undefined
      ? [...this._peerLiveStrokes.values()].some(l => l.layerId === layerId && l.paintedTotal > l.committedOffset)
      : this._hasUnrecordedInk(layerId)) return
    const washes = open.length ? this._carryWashes(layerId, buf, open, lastAt) : []
    if (!washes) return
    const pending = this._washBoundaries.get(layerId)
    if (pending) this._freeBoundary(pending)
    const copies = buf.allResident().map(t => {
      const copy = new AccumulationBuffer(this.gl, t.buffer.width, t.buffer.height, 'nearest')
      t.buffer.copyTo(copy)
      return { buffer: copy, originX: t.originX, originY: t.originY }
    })
    this._washBoundaries.set(layerId, { opIds: prefix.map(o => o.id), copies, washes })
    this._lastBoundaryCheckpoint.set(layerId, nowMs)
    if (this._washBoundaryScheduled) return
    this._washBoundaryScheduled = true
    const schedule: (fn: () => void) => void =
      typeof requestIdleCallback === 'function' ? requestIdleCallback : fn => setTimeout(fn, 0)
    schedule(() => this._packWashBoundaries())
  }

  /** (#536, §17.56, §17.59) The washes among `ops` that may still be
   *  continued after them: a wash is closed once its author strokes anything
   *  else (they can only rejoin their latest), once the paper has been dried
   *  after it (paper_dry closes every wash), or once it is older than any wash
   *  can be rejoined, by the operations' own timestamps. `joining` is the wash
   *  an operation about to be applied belongs to, by `author`. A guess only
   *  where time decides it; every use checks the log itself afterwards. */
  private _openWashes(ops: readonly Operation[], now: number, author?: string, joining?: string): {
    open: string[]; lastAt: Map<string, { at: number; user: string; op: StrokeOperation }>
  } {
    const lastAt = new Map<string, { at: number; user: string; op: StrokeOperation }>()
    const latestOf = new Map<string, string>()
    for (const o of ops) {
      if (o.type === 'paper_dry') { lastAt.clear(); latestOf.clear(); continue }
      if (o.type !== 'stroke') continue
      if (!o.washId) { latestOf.set(o.userId, ''); continue }
      lastAt.set(o.washId, { at: o.timestamp, user: o.userId, op: o })
      latestOf.set(o.userId, o.washId)
    }
    const open: string[] = []
    for (const [w, { at, user }] of lastAt) {
      if (w === joining) { open.push(w); continue }
      if (user === author || latestOf.get(user) !== w) continue
      if (now - at <= WASH_JOIN_MS + WASH_CLOCK_SKEW_MS) open.push(w)
    }
    return { open, lastAt }
  }

  /** (#536, §17.56) The open state of each of `open`, for a checkpoint inside
   *  them - or null when one cannot be had (no scratch here to take it from,
   *  a tile that cannot be named, past the memory ceiling). In the order the
   *  replay cache holds them, least recent first, so a replay seeded with
   *  them evicts as the one it stands in for would. */
  private _carryWashes(
    layerId: string, buf: ILayerBuffer, open: string[],
    lastAt: Map<string, { op: StrokeOperation }>,
  ): CarriedWash[] | null {
    const origins = new Map<AccumulationBuffer, { originX: number; originY: number }>()
    for (const t of buf.allResident()) origins.set(t.buffer, { originX: t.originX, originY: t.originY })
    const originOf = (tile: AccumulationBuffer) => origins.get(tile) ?? null
    const order = [...this._replayRibbonChunks.keys()]
    const ranked = [...open].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
    })
    const out: CarriedWash[] = []
    let bytes = 0
    const fail = (): null => { for (const w of out) freeScratchSnapshot(w.snap); return null }
    for (const w of ranked) {
      const chunk = this._replayRibbonChunks.get(w)
      const own = this._wash && this._wash.id === w && this._wash.layerId === layerId ? this._wash.scratch : null
      const scratch = chunk && chunk.target === buf ? chunk.scratch : own
      if (!scratch || scratch.diffusePending) return fail()
      const last = lastAt.get(w)?.op
      if (!last) return fail()
      const dabs = strokeDabs(last)
      const lastDab = chunk && chunk.target === buf ? chunk.lastDab : dabs[dabs.length - 1]
      if (!lastDab) return fail()
      const snap = scratch.snapshot(this.gl, originOf)
      if (!snap) return fail()
      for (const t of snap.tiles) for (const b of Object.values(t.bufs)) if (b) bytes += b.width * b.height * 4
      out.push({
        key: w, userId: last.userId,
        washStrokeId: chunk && chunk.target === buf ? chunk.washStrokeId : last.strokeId,
        lastDab,
        snap,
      })
      if (bytes > WASH_STATE_CHECKPOINT_MAX_BYTES || this._washGpuBytes() + bytes > this._gpuBudget) return fail()
    }
    return out
  }

  private _freeBoundary(b: { copies: Array<{ buffer: AccumulationBuffer }>; washes: CarriedWash[] }): void {
    if (this._contextLost) return
    for (const c of b.copies) c.buffer.destroy()
    for (const w of b.washes) freeScratchSnapshot(w.snap)
  }

  /** (#536, §17.56) Puts a checkpoint's carried washes into a replay cache,
   *  as scratches painting into `target`, before the replay's first operation
   *  - so each continues as it would have from where the checkpoint stood. */
  private _seedWashes(cp: Checkpoint, target: ILayerBuffer, chunks: PencilEngine['_replayRibbonChunks']): void {
    const carried = cp.washes as CarriedWash[] | undefined
    if (!carried) return
    for (const w of carried) {
      chunks.get(w.key)?.scratch.destroy()
      chunks.delete(w.key)
      this._chunkAuthors.set(w.key, w.userId)
      chunks.set(w.key, {
        strokeId: w.key, washStrokeId: w.washStrokeId, target,
        scratch: RibbonStrokeScratch.restore(this._ribbonScratchPool, w.snap, target), lastDab: w.lastDab,
      })
    }
  }

  private _packWashBoundaries(): void {
    this._washBoundaryScheduled = false
    const all = [...this._washBoundaries]
    this._washBoundaries.clear()
    for (const [layerId, boundary] of all) {
      const { opIds, copies, washes } = boundary
      if (!this._contextLost && !this._destroyed && copies.length) {
        const tiles = copies.map(({ buffer, originX, originY }) => ({
          originX, originY, width: buffer.width, height: buffer.height,
          packed: packTilePixels(buffer.readPixels()),
        }))
        if (washes.length) {
          // One checkpoint carrying washes per layer: the textures are dear.
          for (const cp of [...this._checkpoints.all()]) if (cp.layerId === layerId && cp.washes) this._checkpoints.remove(cp)
          this._checkpoints.add({
            layerId, opIds, tiles, washIds: washes.map(w => w.key), washes,
            dispose: () => { if (!this._contextLost) for (const w of washes) freeScratchSnapshot(w.snap) },
          })
        } else {
          this._checkpoints.add({ layerId, opIds, tiles })
        }
        if (!this._contextLost) for (const c of copies) c.buffer.destroy()
      } else {
        this._freeBoundary(boundary)
      }
    }
    if (!this._contextLost && !this._destroyed) this._enforceGpuBudget() // (§17.57)
  }

  private _dropWashBoundaries(): void {
    for (const b of this._washBoundaries.values()) this._freeBoundary(b)
    this._washBoundaries.clear()
  }

  private _takeCheckpoint(layerId: string): void {
    if (this._wcAsyncFinish && this._wcCanonical.pending) return
    // (§17.53) The old buffer on screen during a sliced rebuild still holds
    // what the log no longer has (the undone stroke): never bake it.
    if (this._rebuildJobs.has(layerId)) return
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
    // (#537) Same contract once more: an unsettled layer's pixels went down in
    // a different order from the one its op list is in.
    if (this._unsettledLayers.has(layerId)) return
    // (#479) Same contract, the other way it gets violated — and the one that
    // cost a real lesson. _maybeCheckpoint defers this to idle time (#121), so
    // by the time it runs the buffer can hold ink that no *operation* accounts
    // for yet: the local gesture still under the pen (its StrokeOperation is
    // born at pen-up), or a peer's dabs streamed straight onto the layer ahead
    // of the operation that will claim them (#429). Baking that buffer under
    // the shorter op list makes the checkpoint's pixels a superset of what its
    // opIds describe, and every later rebuild — undo, redo, revoke — then
    // restores those pixels *and* replays the operation on top, painting the
    // same dabs a second time. At low opacity with a broad brush that reads as
    // a tone shift rather than an artifact, it compounds across a session, and
    // since idle timing and stream arrival differ per client, two people in one
    // room drift apart while each stays internally consistent.
    if (this._hasUnrecordedInk(layerId)) {
      const refusals = (this._checkpointRefusals.get(layerId) ?? 0) + 1
      this._checkpointRefusals.set(layerId, refusals)
      // Порог, а не каждый отказ: отказы — штатный режим, новостью является
      // только их непрерывность. Ровно на пороге, а не после него, иначе одна
      // залипшая ситуация давала бы отчёт на каждой границе чекпойнта.
      if (refusals === CHECKPOINT_REFUSAL_ALARM) {
        this._onInvariant?.('layer never checkpointed — unrecorded ink persists', { layerId, refusals })
      }
      return
    }
    this._checkpointRefusals.delete(layerId)
    const buf = this._layers.get(layerId)
    if (!buf) return
    const ops = this._log.layerPixelOps(layerId)
    if (!ops.length) return
    // (#467) Packed on the way in, so the budget below counts what this
    // actually holds. An ordinary checkpoint is evictable and so was never the
    // memory problem a pinned one is, but there is only one Checkpoint shape
    // and giving it two would be the more expensive mistake — and a budget
    // that buys ten times the undo depth for the same bytes is worth having.
    const resident = buf.allResident()
    if (!resident.length) return
    const read = ({ buffer, originX, originY }: PaintTarget) => ({
      originX, originY, width: buffer.width, height: buffer.height,
      packed: packTilePixels(buffer.readPixels()),
    })
    const opIds = ops.map(o => o.id)
    if (resident.length === 1 || typeof document === 'undefined') {
      this._checkpoints.add({ layerId, opIds, tiles: resident.map(read) })
      return
    }
    // (§17.72) A tile a step: reading back a six-tile layer at once was a
    // half-second stall on the Surface. Given up - it is only a shortcut for
    // undo and replay - if anything touches the layer between two steps.
    const tiles: ReturnType<typeof read>[] = []
    const last = opIds[opIds.length - 1]
    const step = (): void => {
      if (this._destroyed || this._contextLost || this._layers.get(layerId) !== buf) return
      const now = this._log.layerPixelOps(layerId)
      if (now.length !== opIds.length || now[now.length - 1]?.id !== last || this._settle
        || this._washReveals.size || this._rebuildJobs.has(layerId) || this._pendingRebuilds.has(layerId)
        || this._unsettledLayers.has(layerId) || this._hasUnrecordedInk(layerId)) return
      tiles.push(read(resident[tiles.length]))
      if (tiles.length < resident.length) setTimeout(step, 16)
      else this._checkpoints.add({ layerId, opIds, tiles })
    }
    step()
  }

  // (#494) The room snapshot in and out — see SnapshotIO.ts. Whether a layer
  // may be baked right now stays here (its quiet/settled context functions):
  // that is the replay and wash machinery's question, not the snapshot's.
  bakeNetworkSnapshot(layerId: string): Uint8Array | null {
    return this._snapshotIO.bake(layerId)
  }

  /** SnapshotIO's first bake gate — pure, see SnapshotIOContext.quiet. */
  private _snapshotQuiet(layerId: string): boolean {
    // An idle bootstrap observer can run between native dab chunks. These
    // unrecorded pixels belong to no confirmed watermark yet.
    if (this._strokeLayerId || this._destroyed || this.gl.isContextLost()) return false
    // (§17.58) Not with peers' operations still queued: landing them here was a
    // multi-second hitch at every snapshot boundary; the layer stays dirty and
    // goes with the next one.
    if (this._opQueue.length) return false
    // (§17.72) Nor with an operation still being drawn or settled.
    if (this._settle) return false
    // (#536, §17.59) Never with a wash on it that may still be continued. A
    // snapshot is what a late joiner starts from, and the rest of that wash
    // would then settle over pixels that already hold its beginning - a
    // glaze instead of one wet wash, for that participant only, for good, and
    // passed on in every snapshot they bake. Refusing costs nothing: the layer
    // is left out of this upload and the server keeps serving its operations.
    const done = this._log.doneOperations()
    // A closed wash can still supply water to another gesture. Its encoded
    // donor must remain in the join tail until that ephemeral water expires.
    if (hasActiveWater(done, layerId, Date.now())) return false
    const washOps = done.filter(o => o.type === 'paper_dry' || (o.type === 'stroke' && o.layerId === layerId))
    if (this._openWashes(washOps, Date.now()).open.length) return false
    // (§17.53) Mid-rebuild the buffer is the pre-undo picture: not this time.
    // The layer stays dirty and goes with the next boundary.
    return !this._rebuildJobs.has(layerId)
  }

  /** SnapshotIO's second bake gate, reached only past the ledger's
   *  mayPublish — see SnapshotIOContext.settled. (#537) Two ways a layer here
   *  can hold something other than the room's history up to the watermark:
   *   - painted out of order and not re-settled yet (live ink in the way);
   *   - holding this client's own unconfirmed operations. Their seq is above
   *     any watermark this client can have seen, so a joiner restoring these
   *     pixels would then receive the same operations and paint them twice. */
  private _snapshotSettled(layerId: string): boolean {
    if (this._log.hasPendingPaperDry()) return false
    if (this._unsettledLayers.has(layerId)) this._settleLayers()
    if (this._unsettledLayers.has(layerId) || this._pendingRebuilds.has(layerId)) return false
    return !this._log.hasPendingPixelOps(layerId)
  }

  bakeLayerByFullReplay(layerId: string): Uint8Array | null {
    return this._snapshotIO.bakeByFullReplay(layerId)
  }

  restoreLayerFromSnapshot(layerId: string, tiles: SnapshotTile[], coveredSeq?: number): void {
    this._snapshotIO.restore(layerId, tiles, coveredSeq)
  }

  takeSnapshotRestoreAudit(): SnapshotRestoreAudit[] {
    return this._snapshotIO.takeRestoreAudit()
  }

  /** See the PencilEngineAPI doc comment.
   *
   *  `WEBGL_debug_renderer_info` is the only way to learn which GPU this is,
   *  and browsers increasingly withhold it — hence the null rather than a
   *  throw. `MAX_TEXTURE_SIZE` needs no extension and is worth having beside
   *  it: a restore that asks for tiles larger than the device allows fails for
   *  a reason no amount of memory would fix, and the two failures look
   *  identical from the outside. */
  gpuInfo(): { renderer: string | null; maxTextureSize: number; contextLost: boolean } {
    const ext = this.gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext
      ? String(this.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') || null
      : null
    return {
      renderer,
      maxTextureSize: Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) ?? 0),
      contextLost: this._contextLost,
    }
  }

  /** (#373) Whether this layer holds pixels the server does not have.
   *
   *  A layer nobody has ever painted is not dirty, which is why a room's
   *  untouched `background` never costs a bake. */
  isLayerDirty(layerId: string): boolean {
    return this._snapshots.isDirty(layerId)
  }

  /** See the PencilEngineAPI doc comment. */
  liveLayerIds(): string[] {
    return [...this._layers.keys()]
  }

  absorbHistoricalOperations(pageOps: Operation[]): void {
    this._snapshotIO.absorbHistorical(pageOps)
  }

  /** Restore dependency prefix without replaying already baked structure or
   * revoking historical strokes whose source layer has since been consumed.
   * The original prefix fold (including boundary undo) precedes tail redo. */
  private _replayRestoredStructure = false

  async restoreHistoricalOperations(ops: Operation[], replayStructure?: boolean): Promise<void> {
    const affected = new Set<string>()
    for (const op of ops) for (const id of pixelWriteLayerIds(op)) {
      if (this._layers.has(id) && !this._snapshots.isCovered(id, op.seq)) affected.add(id)
    }
    this.absorbHistoricalOperations(ops)
    // Structural seeding precedes safe blob handover. A second dependency
    // pass must mark already-seeded ids against those newly pinned snapshots.
    if (this._replayRestoredStructure) this._checkpoints.markCovered(ops)
    if (replayStructure) {
      this._replayRestoredStructure = true
      // Topology only: safe snapshots have not been handed over yet.
      this._syncBuffersToLog(false)
    }
    await this.preloadImages(ops)
    if (this._destroyed || this._contextLost) throw new Error('Historical dependency rebuild interrupted')
    if (replayStructure) return
    // Tail merge/copy reads live source buffers. Deferring these until the
    // eventual resumeDisplay would let that tail copy an empty source. Run
    // the existing rebuild machinery now, preserving its GPU slicing.
    for (const id of affected) {
      this._pendingRebuilds.delete(id)
      this._rebuildLayer(id)
    }
    while ([...affected].some(id => this._rebuildJobs.has(id))) {
      if (this._destroyed || this._contextLost) throw new Error('Historical dependency rebuild interrupted')
      await new Promise<void>(resolve => setTimeout(resolve, 16))
    }
    if (this._destroyed || this._contextLost) throw new Error('Historical dependency rebuild interrupted')
  }

  getOperationsSinceRestore(): Operation[] {
    return this._replayRestoredStructure ? this.getOperations() : this._snapshotIO.operationsSinceRestore()
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _createBuffer(id: string): void {
    if (this._layers.has(id)) return
    const buf = this._makeLayerBuffer(id)
    buf.clear()
    this._layers.set(id, buf)
  }

  private _destroyBuffer(id: string): void {
    this._cancelRebuildJob(id) // (§17.53)
    const boundary = this._washBoundaries.get(id) // (§17.55)
    if (boundary) { this._freeBoundary(boundary); this._washBoundaries.delete(id) }
    const buf = this._layers.get(id)
    if (buf) {
      this._sweepReveals(performance.now(), id)
      this._forgetWashesOf(buf) // (§17.68)
      buf.destroy()
      this._layers.delete(id)
    }
    // (#522) Unpinned, not dropped. This used to delete the snapshot
    // checkpoint outright, reasoning that a pinned one is exempt from budget
    // eviction and so would linger forever for a layer id that is gone for
    // good — ids are never reused, so nothing would ever reclaim it.
    //
    // The reclamation half of that is right; "gone for good" is not. The two
    // operations that reach here — `layer_delete` and a merge consuming its
    // sources — are both undoable, and undoing one brings the *same* id back
    // (see _syncBuffersToLog). What comes back is an empty buffer that
    // _rebuildLayer then repaints by replaying the layer's log, and the log
    // below the snapshot is exactly what this client does not have. Dropping
    // the checkpoint therefore did not free a dead layer's memory, it threw
    // away the only local copy of a live one's pixels — #287 reopened through
    // a door it never looked at.
    //
    // Clearing `pinned` keeps both properties: the checkpoint stays findable
    // if the layer is revived, and it is now an ordinary eviction candidate,
    // so a genuinely dead layer's bytes come back under memory pressure
    // instead of lingering. The sweep is immediate, so a room that deletes
    // many restored layers does not sit above budget until the next
    // checkpoint is taken.
    this._checkpoints.unpinSnapshot(id)
  }

  private _initGL(): void {
    const { gl, canvas } = this

    // (#494) The dab stamp programs, plain and instanced — see StampPainter.ts.
    // The ribbon passes draw through its plain one too (_dabProg).
    this._stamps.initGL()
    this._compositor.initProgram()
    this._revealProg          = createProgram(gl, DISPLAY_VERT, WASH_REVEAL_FRAG)
    this._watercolorPasses.initFieldPrograms()

    this._screenBlitProg      = createProgram(gl, DISPLAY_VERT, SCREEN_BLIT_FRAG)
    this._paperComposeProg    = createProgram(gl, DISPLAY_VERT, PAPER_COMPOSE_FRAG)
    // (#494) Smudge's transfer and imprint-refresh programs — see SmudgePainter.ts.
    this._smudge.initGL()
    // (#494) The shape rasterizer — see ShapePass.ts.
    this._shapes.initGL()
    // (#494) Export's transparent and thumbnail-downscale passes — see Exporter.ts.
    this._exporter.initGL()
    this._brush.initGL() // (#494) see BrushPainter.ts
    this._ribbonPasses.initProgram()
    this._watercolorPasses.initSettlePrograms()

    this._ribbonPasses.initUniforms()
    this._compositor.initUniforms()
    this._revealUni = getUniforms(gl, this._revealProg, ['u_after', 'u_before', 'u_hold', 'u_opacity', 'u_wetMask', 'u_motionGain', 'u_motionAge', 'u_texel', 'u_motionOrigin'])
    this._watercolorPasses.initFieldUniforms()

    this._paperComposeUni = getUniforms(gl, this._paperComposeProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_paperScale', 'u_paperTexSize',
      'u_dstSize', 'u_srcSize', 'u_matrixInv', 'u_screenToWorld', 'u_sharpResample',
      'u_pageRect', 'u_deskColor', 'u_wetMap', 'u_wetRect', 'u_wetPeak',
    ])

    this._compositor.initAttributes()
    this._revealPosLoc         = gl.getAttribLocation(this._revealProg, 'a_position')
    this._watercolorPasses.initFieldAttributes()

    this._screenBlitPosLoc     = gl.getAttribLocation(this._screenBlitProg, 'a_position')
    this._screenBlitTexLoc     = gl.getUniformLocation(this._screenBlitProg, 'u_tex')
    this._watercolorPasses.initDiffusionAttributes()

    this._paperComposePosLoc   = gl.getAttribLocation(this._paperComposeProg, 'a_position')

    this._ribbonPasses.initAttributes()

    this._quadBuf    = createQuadBuffer(gl)
    this._screenBuf  = createFullscreenQuad(gl)
    // (#494) The resampling blits (transform, selection, image) — see
    // blitPasses.ts. Rebuilt with everything else here on a context restore.
    this._passes = new BlitPasses(gl, this._screenBuf)
    this._ribbonPasses.initBuffer()

    // (#536, s17.28) MAX blending for the watercolor film. Without it (rare -
    // the extension is in every WebGL1 that matters) the deposit falls back
    // to the additive sum of stamps.
    this._minmaxExt = gl.getExtension('EXT_blend_minmax') as { MAX_EXT: number } | null

    this._compositeFBO = new AccumulationBuffer(gl, canvas.width, canvas.height)
    // Fresh (or, on context restore, brand-new-and-empty) GL objects — any
    // previously baked content is gone either way, so the split cache must
    // be rebuilt before its next read regardless of why _initGL() ran.
    const { w: ew, h: eh } = this._camera.renderBufferExtent()
    this._belowCache = new AccumulationBuffer(gl, ew, eh)
    this._aboveCache = new AccumulationBuffer(gl, ew, eh)
    this._assemblyFBO = new AccumulationBuffer(gl, ew, eh)
    this._compositor.invalidateSplitCache()
  }

  /** (#494) See PaperState.clampToSheet. Kept by this name for the ribbon
   *  and wash code, which is live on another branch. */
  private _wcSheetClamp(r: { minX: number; minY: number; maxX: number; maxY: number }): { minX: number; minY: number; maxX: number; maxY: number } {
    return this._paper.clampToSheet(r)
  }

  /** resolveForPaint, but nothing at all for an empty rect (a clamp can leave one). */
  private _resolveWithinSheet(target: ILayerBuffer, r: { minX: number; minY: number; maxX: number; maxY: number }): PaintTarget[] {
    return r.maxX > r.minX && r.maxY > r.minY ? target.resolveForPaint(r) : []
  }

  /** (#494) See PaperState.worldSize — kept by name like _wcSheetClamp. */
  private _paperWorldSize(): { w: number; h: number } {
    return this._paper.worldSize()
  }

  /** (#494) See PaperState.pageSize — kept by name like _wcSheetClamp. */
  private _pageSize(): { w: number; h: number } {
    return this._paper.pageSize()
  }

  /** The brush's nominal width in world units — what `setSize` was given, for
   *  every room, with no conversion at all.
   *
   *  There used to be one, for bounded rooms only:
   *
   *      size * (canvas.width / canvas.clientWidth)
   *
   *  and it made sense exactly once, before #470. Back then a bounded room's
   *  canvas *was* its sheet, at the sheet's own full resolution, so that ratio
   *  read "sheet pixels per CSS pixel" and the setting meant "N pixels on
   *  screen at fit zoom". #470 made the bounded canvas a *viewport* sized to
   *  the backing store, and the very same expression silently became
   *  `min(devicePixelRatio, sqrt(4MP / viewport CSS area))` — see
   *  cameraMath.ts's boundedBackingStoreZoom. The formula never changed; what
   *  it measured did.
   *
   *  Measured on one sheet, one slider value, three devices (room `s1i6233k`,
   *  27.08): iPad 9 painted 18.00 world px, a Tab S7+ 18.50, a Surface 12.00 —
   *  the same "9" on the slider. The teacher this was reported against, on a
   *  DPR-1 Windows laptop, got 9. Half of what her teacher's tablet drew from
   *  the identical setting.
   *
   *  Three things make that a bug rather than a per-device preference:
   *
   *  1. `Dab.size` is baked at record time and goes into the Operation Log, so
   *     the difference is permanent in the shared document and replays that way
   *     for everyone, forever. A brush size is a property of the drawing, not
   *     of the author's screen.
   *  2. The factor moves with the *window*, not just the device — the
   *     megapixel budget is a function of viewport area — so resizing, rotating
   *     a tablet or opening a panel changed the brush mid-session.
   *  3. BrushCursor is handed the raw setting and draws in world units (see its
   *     own doc comment), so the hover ring was narrower than the mark it
   *     promised by exactly this factor.
   *
   *  Infinite rooms already returned `size` untouched and were always right;
   *  this is bounded rooms joining them, which is also why the two branches
   *  collapsed into none. */
  private get _physicalSize(): number {
    return this._opts.size
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
    // (§17.58) Peers' queued watercolour stays queued: landing it here was a
    // one-second hitch on the iPad right at the pen's touch. It lands after
    // this stroke, one a frame - the same order this author already saw for
    // anything arriving mid-stroke (#289); everyone else paints by the log.
    // See PaperState's _loaded field comment: painting before the real
    // paper texture has loaded would bake in the placeholder's flat,
    // meaningless response permanently. Blocking the stroke from starting
    // at all (rather than trying to special-case the paint path) means
    // there is nothing to later "fix up" — matches how `_locked` already
    // blocks drawing for a different reason, just orthogonal to it.
    if (this._locked || this._wcAsyncFinish && this._wcAsyncError !== null || !this._paper.loaded || this._contextLost || this.gl.isContextLost()) {
      // (#517) Both refusals below are correct and both are silent, which is
      // indistinguishable from the input layer having dropped the stroke —
      // and telling those two apart is the whole question in the iPad report.
      this._diagLog('[engine] stroke start REFUSED', {
        locked: this._locked, paperTexLoaded: this._paper.loaded,
      })
      return
    }
    const layerId = this._activeId
    if (!layerId || !this._layers.has(layerId)) {
      this._diagLog('[engine] stroke start REFUSED: no drawable layer', {
        activeId: this._activeId, known: this._layers.has(this._activeId ?? ''),
      })
      return
    }
    // (#536, §17.52) Any tool: a settle spread over frames (a peer's
    // operation, or this author's own last wash) lands before this stroke
    // paints, or its copy-back would cover what the stroke lays under the
    // wash - replay order again.
    if (this._settle && !this._wcAsyncFinish) this._completeSettle()
    this._strokeLayerId = layerId
    this._strokeTool    = this._opts.tool
    // (#520) The eraser's cross-layer mode, resolved once here for the whole
    // gesture. The active layer is dropped from the list because it is already
    // `_strokeLayerId` — painting it twice would take two passes of the eraser
    // off it, so it would clear faster than every other layer, which is exactly
    // the sort of thing that reads as the tool being broken rather than as a
    // duplicate id. Ids with no buffer are dropped too: `_paintDabs` needs one,
    // and a layer that does not exist here cannot be erased anyway.
    this._strokeExtraLayerIds = this._strokeTool === 'eraser'
      ? this._eraseThroughIds.filter(id => id !== layerId && this._layers.has(id))
      : []
    // Fresh per stroke (never carried over, unlike smudge's reservoir) —
    // see RibbonStrokeScratch's own doc comment. Harmless to always create,
    // even for a non-marker stroke: nothing allocates any GL resource until
    // a marker dab's own getOrCreate() first touches a tile.
    const profile = ribbonProfileFor(this._strokeTool, this._opts.pencilType)
    // (#468 v7, ADR 011 §7) Does this stroke join the wash already on the
    // paper, or start a new one?
    //
    // Joining needs the same paint on the same layer, soon enough that the last
    // one has not dried. Change any of those and you are painting a second
    // wash over a first, which is glazing and must behave like it.
    // (#536) Watercolor answers this for itself, and the difference is the
    // point: the generic form below is the whole preset string, and for this
    // tool that string carries the mix — so moving either slider ended the
    // wash. See watercolorWashSignature.
    const washSignature = this._strokeTool === 'watercolor'
      ? watercolorWashSignature(this._opts.pencilType, this._opts.graphiteColor)
      : `${this._opts.pencilType}|${this._opts.graphiteColor.join(',')}`
    // (#536) The gesture's own record of what it painted into. Cleared here
    // rather than at pen-up so a stroke refused above cannot leave a stale
    // profile behind for the next one to inherit.
    this._strokeWet = ''
    this._liveWetQueue = ''
    this._paperWet.dropPending()
    if (profile.normalizeDeposit) {
      const now = performance.now()
      const open = this._wash
      // (#536) Joining is a physical question, not a bookkeeping one: did the
      // brush come down in something that is still wet? A pure timer answered
      // it wrongly at both ends — a second band of a flat wash laid 1.5 s later
      // started a fresh wash and drew its own seam, while a mark put down in a
      // different corner of the sheet within the window joined a wash it never
      // touched and shared its accumulation.
      //
      // The timer stays as a *ceiling* underneath the paper's own answer, which
      // matters for the case the field cannot speak to: a nearly dry brush
      // wetted almost nothing, so the wash it belongs to has to be allowed to
      // continue on recency alone.
      const landedWet = this._paperWet.anyWetNear(
        layerId, e.x, e.y, this._opts.size * 0.75, now,
      )
      // (#536) Clean water is *about* the paint already there, so it joins the
      // open wash if that wash's paper is still wet anywhere, not only if the
      // brush happened to come down on it. Read off Ilya's own log: he laid a
      // pigment spiral, then flooded it with water starting beside it, and the
      // water opened a second wash — so the spiral's pigment sat in a closed
      // accumulation the new water could never move. Pigment strokes keep the
      // landing rule: a mark set down on dry paper away from the wash is a new
      // mark, however wet the wash still is.
      const waterOnly = watercolorMixFromPreset(this._opts.pencilType).pigment <= 0
      const washStillWet = waterOnly && open !== null && this._paperWet.anyWet(open.layerId, now)
      const joins = open !== null
        && open.layerId === layerId
        && open.signature === washSignature
        && now - open.endedAt <= WASH_JOIN_MS
        && (landedWet || washStillWet || now - open.endedAt <= WASH_RECENT_MS)
      // (#536, §17.22) A settle still in flight lands first: its copy-back
      // would otherwise overwrite whatever this stroke lays meanwhile.
      // (§17.47) Also for a stroke that joins the same wash. §17.46 let the
      // settle land under the joining stroke's film instead, to spare the
      // pen-down hitch - and the live mark stopped matching its replay: a
      // zigzag with a stroke laid straight into it differed from the reload
      // in 5% of the tile against 0.35% with the settle landed here (rig
      // parityzz). The replay settles each operation before the next one
      // paints; the author has to as well.
      if (this._settle && !this._wcAsyncFinish) this._completeSettle()
      if (joins && open) {
        this._washId = open.id
        this._ribbonStrokeScratch = open.scratch
      } else {
        this._retireAsyncScratch(this._wash?.scratch)
        this._washId = nanoid(10)
        this._ribbonStrokeScratch = new RibbonStrokeScratch(this._ribbonScratchPool, profile.ink, profile.normalizeDeposit)
        this._wash = {
          id: this._washId, layerId, signature: washSignature,
          endedAt: now, scratch: this._ribbonStrokeScratch,
        }
      }
      // (§17.55/§17.56) Before this stroke paints, and before its scratch
      // starts a new gesture: a join carries the wash as it stood.
      this._checkpointBeforeWash(layerId, this._washId!, this._userId, Date.now())
      this._ribbonStrokeScratch.beginStroke()
    } else {
      this._washId = null
      this._retireAsyncScratch(this._wash?.scratch)
      this._wash = null
      this._ribbonStrokeScratch = new RibbonStrokeScratch(this._ribbonScratchPool, profile.ink, profile.normalizeDeposit)
    }
    this._strokeId = nanoid(10)
    this._wcAsyncLocalStroke = this._wcAsyncFinish && this._strokeTool !== 'watercolor' ? this._strokeId : null
    if (this._wcAsyncLocalStroke) this._wcAsyncLocalTools.set(this._wcAsyncLocalStroke, { layers: new Map(), ended: false, queued: 0 })
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
      { angle: this._nibAngleRadians, anchor: this._nibAnchor },
      this._tiltResponse,
    ))
    // #330 stage 3 — only the marker's ribbon rasterizer cares (its bands are
    // straight chords between samples); every other tool keeps its plain
    // size-proportional spacing untouched. See DabSystem.curvatureTolerancePx.
    this._dabs.curvatureTolerancePx = isRibbonTool(this._strokeTool)
      ? ribbonProfileFor(this._strokeTool, this._opts.pencilType).curvatureTolerancePx
      : null
    // #547 — the step between stamps is a property of the *brush*, not of the
    // engine, so it is latched here with everything else that is fixed for the
    // length of one stroke.
    //
    // Every brush in the set asks for a tighter step than the engine's 0.22
    // default, and that default is why: it was calibrated (#478) against tools
    // whose dabs blend through paper grain and soft graphite falloff. A digital
    // stamp has neither, so its own ripple shows several times sooner — see the
    // spacing values in digitalBrushPresets.ts.
    this._dabs.spacingFactor = this._strokeTool === 'digitalBrush'
      ? digitalBrushFromPreset(this._opts.pencilType).spacing
      : DEFAULT_DAB_SPACING_FACTOR
    // #478 — same slot and the same lifecycle: a property of the tool, latched
    // once per stroke. Dab spacing has to track the mark this tool actually
    // leaves, and `_dabSizeScale` is the multiplier between Dab.size and that
    // mark. See dabSpacing.ts for the whole argument, including which tools
    // are deliberately left on the old rule.
    // (#579) Not for a brush whose stamps are separate marks (flowPer
    // 'stamp': sponge, splatter, grass, foliage, grain). The footprint rule
    // exists to hide the stamp — to keep a hard edge from reading as a row of
    // discs — and for these the separate prints *are* the brush: a sponge
    // spaced to the footprint came out as a smooth band with no dabs in it.
    // Recorded strokes are unaffected: spacing is decided when the dabs are
    // made, and a replay paints the dabs the log holds.
    const stampBrush = this._strokeTool === 'digitalBrush'
      && digitalBrushFromPreset(this._opts.pencilType).flowPer === 'stamp'
    this._dabs.footprint = isFootprintSpacedTool(this._strokeTool) && !stampBrush
      ? {
        sizeScale: this._dabSizeScale(this._strokeTool, this._opts.pencilType),
        hardness: this._resolvePreset(this._strokeTool, this._opts.pencilType).hardness,
        // #547 — the digital brush follows its footprint at every hardness. See
        // DabFootprint.spacingStrength for why the gate the other three tools
        // use is a graphite calibration that does not carry over to a mark with
        // no paper in it.
        ...(this._strokeTool === 'digitalBrush' ? { spacingStrength: 1 } : {}),
      }
      : null
    // #489: watercolor's *elongated* nibs take the scallop bound without the
    // rest of that rule — DabSystem.nibScallop carries the whole argument,
    // including why the marker's identical 5:1 geometry is left as it is.
    //
    // Not the round nib, and that exclusion is measured rather than assumed.
    // scallopSpacingLimit's own doc says it returns Infinity for a round dab;
    // it does not — at aspect 1 it still returns sqrt(8*r), which on a 120px
    // brush is 21.9px against the nominal 26.4px and put 40% more dabs into the
    // round brush's stroke. Its deposit is normalised per unit travel so the
    // tone would have held, but the mark's fine structure would not have, and
    // that is exactly the regression #483 was filed for. This tool has shipped;
    // the flat has not.
    //
    // What that leaves knowingly unfixed: the round nib reaches 1.4:1 at full
    // tilt and does scallop a little there. Nobody has reported it, and quietly
    // re-spacing a shipped tool to chase it is a worse trade than leaving it.
    //
    // #501: and charcoal's chisel, which wants this *and* the footprint rule —
    // it is a stamped mark, so its gaps are real holes, and it is an elongated
    // nib, so its silhouette scallops. Both bounds compose in _spacingAfter.
    this._dabs.nibScallop = this._nibScallops(this._strokeTool, this._opts.pencilType)
      ? { sizeScale: this._dabSizeScale(this._strokeTool, this._opts.pencilType) }
      : null
    this._strokePreset  = this._opts.pencilType
    this._strokeColor   = this._opts.graphiteColor
    // Smudge's carried imprint resets at every gesture, but not from here:
    // SmudgePainter.paint does it off this stroke's own id, so the local and the
    // replayed path go through exactly one rule (see SmudgePainter.resumeGesture).
    this._strokeDabs    = []
    this._strokeChunkTail = undefined
    this._strokeChunkBox = null
    // #482: the running arc length and the speed-contact factor both used to
    // live here as per-stroke engine fields. They are tip state now (TipState),
    // reset by DabSystem alongside the bend and the input filters — one record
    // to reset, fork and restore instead of five parallel fields in two files.
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
      this._previewBuf = this._previewBufPool.acquire(this.canvas.width, this.canvas.height)
      this._previewBuf.clear()
      this._previewBufOrigin = this._cameraCenteredOrigin()
    }
    if (this._liveTip) {
      this._tipBuf = this._tipBufPool.acquire(this.canvas.width, this.canvas.height)
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
    const dabs = this._dabs.startStroke(x, y, e.pressure, e.tiltX, e.tiltY, this._physicalSize, e.speed)
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
    const dabs = this._dabs.continueStroke(x, y, e.pressure, e.tiltX, e.tiltY, this._physicalSize, e.speed)
    let painted = false
    if (dabs.length) {
      const t0 = performance.now()
      this._paintStrokeDabs(dabs, e.speed, e.timeStamp - this._strokeStartTimestamp)
      painted = true
      if (this._strokeTool === 'watercolor') {
        this._wcPerf.batchAt.push(t0)
        this._wcPerf.batchMs.push(performance.now() - t0)
        if (this._wcPerf.batchAt.length > 600) { this._wcPerf.batchAt.splice(0, 300); this._wcPerf.batchMs.splice(0, 300) }
      }
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
    if (this._wcAsyncLocalStroke) return
    if (!this._tipBuf) return
    this._tipBuf.clear()
    const dabs = this._dabs.peekTipDabs(this._physicalSize, speed)
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
    if (this._wcAsyncLocalStroke) return
    if (!this._strokeLayerId || !this._previewBuf) return
    this._previewBuf.clear()
    if (!samples.length) { this._scheduleDisplay(); return }

    const fork = this._dabs.forkForPreview()
    const dabs: Dab[] = []
    for (const s of samples) {
      // Ruler tool (#89): keep the speculative preview visually consistent
      // with the real path above, which snaps too.
      const { x, y } = this._snapPoint(s.x, s.y)
      dabs.push(...fork.continueStroke(x, y, s.pressure, s.tiltX, s.tiltY, this._physicalSize, s.speed))
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
    // (#517) `startStroke` always emits the touch-down dab, so every stroke
    // that reaches here has laid down at least one — which means a stroke that
    // visibly did nothing either never got here, or got here and was closed
    // almost immediately. Only the second case is worth a line, and only that
    // case is logged: an ordinary stroke says nothing, so this stays silent
    // through a normal session (and through the test suite) and speaks exactly
    // when the reported symptom happens.
    if (this._strokeDabs.length <= 2) {
      this._diagLog('[engine] stroke ended with almost no ink', {
        dabsBeforeFlush: this._strokeDabs.length, tool: this._strokeTool,
      })
    }
    // Dwell (#245): stop pooling the instant the stroke ends — real
    // movement/lift always reaches here before any next stroke's _onStart.
    if (this._dwellTimer) { clearInterval(this._dwellTimer); this._dwellTimer = null }
    this._dwellCfg = null
    const t0 = this._debug ? performance.now() : 0
    const dabs = this._dabs.endStroke(this._physicalSize, e.speed)
    if (this._strokeTool === 'liner') applyLinerEndTaper(dabs, e.speed)
    // #454: the same post-process one tool over, and far deeper — a liner
    // narrows by at most 15%, a brush pen by up to 75%, which is what turns a
    // quick flick into a point instead of a cut-off tube (ADR 009 §4).
    if (this._strokeTool === 'brushPen') applyBrushPenEndTaper(dabs, e.speed)
    // #468 — structurally identical, shallower numbers: a wet brush leaves a
    // damp streak, not a calligraphic point.
    if (this._strokeTool === 'watercolor') {
      applyWatercolorEndTaper(dabs, e.speed)
      // #468 v4, ADR 011 §4.3 — a wet brush set down and lifted slowly leaves a
      // puddle, not the round cap a swept nib gives. After the taper on
      // purpose: the repeats copy the already-tapered last dab, so the pool
      // sits at the tip's real width instead of re-widening it.
      applyWatercolorPooling(dabs, e.speed, ribbonProfileFor('watercolor', this._strokePreset).waterLevel)
      appendWatercolorLift(dabs, this._strokeChunkTail ? [this._strokeChunkTail, ...this._strokeDabs] : this._strokeDabs)
    }
    if (dabs.length) this._paintStrokeDabs(dabs, e.speed, e.timeStamp - this._strokeStartTimestamp)
    if (this._ribbonStrokeScratch && !this._wcAsyncLocalStroke) this._finishRibbonStroke(this._ribbonStrokeScratch, true)
    if (this._wash && this._wash.scratch === this._ribbonStrokeScratch) {
      // (#468 v7) A wash outlives its strokes — the paint is still on the paper
      // and still wet, so the buffers stay open for the next band to pool into.
      // Torn down in _onStart when something makes the next stroke a different
      // wash, and by _clearWash on tool/layer changes and teardown.
      this._wash.endedAt = this._dryAtPenUp ? -Infinity : performance.now()
    } else {
      this._retireAsyncScratch(this._ribbonStrokeScratch ?? undefined)
    }
    this._ribbonStrokeScratch = null
    this._dryAtPenUp = false
    // Discard the speculative preview entirely once the real stroke has
    // ended — the final _display() below must show only real content.
    // (#155) Only drops the *active* reference now, not the underlying GL
    // object — that stays alive in _previewBufPool for the next stroke to
    // reuse (see ScratchSlot). _display()'s `if (this._previewBuf)`
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
      // (#520) One operation per layer the gesture painted into — normally
      // exactly one, and several only under a cross-layer erase. They share
      // `strokeId`, which is what makes them one gesture to undo
      // (OperationLog._gestureEntries), and the packing is done once and
      // handed to all of them: a dab is ~53 packed bytes and an erase can be
      // thousands of them.
      const dabsPacked = packDabs(this._strokeDabs)
      for (const targetId of [layerId, ...this._strokeExtraLayerIds]) {
        const op: Operation = {
          id: nanoid(10), type: 'stroke', userId: this._userId,
          layerId: targetId, tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
          dabsPacked, timestamp: Date.now(),
          ...(this._strokeId ? { strokeId: this._strokeId } : {}),
          ...(this._washId ? { washId: this._washId } : {}),
          // (#536) Only when there was something to see: most strokes land on
          // dry paper, and an all-zero profile is bytes spent saying nothing.
          ...(this._strokeWet && !isDryProfile(this._strokeWet) ? { wet: this._strokeWet } : {}),
        }
        this._log.append(op, { pending: true })
        if (this._wcAsyncLocalStroke) this._queueAsyncLocalToolOp(op, this._wcAsyncLocalStroke)
        // (#537) A peer's live ink still unrecorded on this layer went down
        // interleaved with this gesture's — see _foreignUnrecordedInk.
        if (this._foreignUnrecordedInk(targetId, op)) this._unsettledLayers.add(targetId)
        // (#468 v10) Never mid-wash. A checkpoint bakes the layer's pixels, and
        // replay then starts from those instead of from the operations — but a
        // wash's strokes share one accumulation whose frozen `original` is the
        // content from *before* the wash began. Bake halfway through and that
        // content is gone: the reloaded room rebuilds the rest of the wash over
        // its own half-finished output, and the picture comes back subtly
        // different. Washes last a second or two, so this only defers.
        if (!this._wash) this._maybeCheckpoint(targetId)
        this._onLocalOperation?.(op)
      }
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
    const localHeld = this._wcAsyncLocalStroke ? this._wcAsyncLocalTools.get(this._wcAsyncLocalStroke) : undefined
    if (localHeld) localHeld.ended = true
    this._wcAsyncLocalStroke = null
    this._strokeId = null
    this._strokeLayerId = null
    this._strokeExtraLayerIds = []
    this._strokeDabs = []
    this._strokeChunkTail = undefined
    this._strokeChunkBox = null
    // (#536) …and only now may the *next* stroke read it. It has been on screen
    // since the first dab — see PaperWetness._pending on why those are two
    // different questions.
    this._paperWet.commitPending(performance.now())
    // The paper is now wetter than it was, and nothing else will ask for a
    // frame until the next stroke — so this is where watching it dry starts.
    if (this._paperWet.peak(performance.now()) > 0.01) this._scheduleDryingRepaint()
    // (#537) The pen is up: whatever was waiting for it to re-settle can now.
    this._settleLayers()
    this._handlers.strokeEnd?.(e)
  }

  /** (#494) A one-line wrapper over presetForTool (presets/resolvePreset.ts,
   *  where the marker presets named below live too); kept as a method because
   *  the ribbon paths call it by this name.
   *
   *  Resolves a StrokeOperation's (tool, preset) pair to the {opacity,
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
    return presetForTool(tool, presetName)
  }

  /** (#478) The multiplier between `Dab.size` and the mark this tool actually
   *  leaves — the single number every paint path already applies as
   *  `d.size * 0.5 * (erasing ? 1.0 : preset.sizeMultiplier)`, stated once so
   *  dab spacing can be derived from the same rule the renderer draws by.
   *
   *  The eraser's 1.0 is not a default standing in for a missing preset: it is
   *  the value the renderer uses, because an eraser is sized as it is asked to
   *  be rather than carrying a grade's own width. Spacing it off the graphite
   *  preset that happens to be selected would space it off a mark it never
   *  draws. */
  private _dabSizeScale(tool: ToolType, presetName: string): number {
    return renderSizeScale(tool, presetName)
  }

  /** (#489/#501) See nibScallops (presets/resolvePreset.ts). */
  private _nibScallops(tool: ToolType, presetName: string): boolean {
    return nibScallops(tool, presetName)
  }

  /** Which computeGrain variant (DAB_FRAG's u_grainMode) this draw should use,
   *  given this engine's two dev overrides — see resolveGrainMode
   *  (presets/resolvePreset.ts). */
  private _resolveGrainMode(charcoal: CharcoalPreset | null): number {
    return resolveGrainMode(charcoal, this._grainMode, this._charcoalGrainMode)
  }

  /** Bakes final dab opacity in place — see bakeDabOpacity (dabs/dabOpacity.ts).
   *  Shared by the real stroke path and the #92 prediction preview; tool/
   *  presetName/opacity are explicit so both callers pass their own state. */
  private _bakeDabOpacity(dabs: Dab[], speed: number, tool: ToolType, presetName: string, opacity: number): void {
    bakeDabOpacity(dabs, speed, tool, presetName, opacity, this._physicalSize, this._dabs.spacingFactor)
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
    const layerId = this._strokeLayerId
    const buf = this._layers.get(layerId)
    if (!buf) return
    this._snapshots.markDirty(this._strokeLayerId)

    this._bakeDabOpacity(dabs, speed, this._strokeTool, this._strokePreset, this._opts.opacity)
    // #454, ADR 009 §4. Before painting *and* before _strokeDabs.push below,
    // so the narrowing is baked into the dab every other route to these pixels
    // reads — the recorded StrokeOperation, the packet a peer replays, an
    // undo/redo, a snapshot rebuild. A taper applied at draw time would exist
    // only on the screen of whoever drew it, which is the exact failure #452
    // documents under linerWickPx.
    // #482, ADR 012 §8: the head taper and the speed-contact factor used to run
    // here, as two post-passes over `dab.size` for the brush pen and one for
    // watercolor. They are declared on the profile now (HeadTaperProfile,
    // SpeedContactProfile) and applied inside tipFootprint, before the nib's own
    // lag and trail are derived from that width — which is the bug this move
    // fixes, not just the shape of the code.
    //
    // The *tail* taper stays a post-pass, in _onEnd, and that is a property of
    // drawing rather than an omission: "how far until the stroke ends" does not
    // exist until the pen is lifted.
    for (const dab of dabs) dab.t = elapsedMs
    // Smudge only (#14): the dab immediately before this call's own batch,
    // read *before* pushing this call's dabs onto _strokeDabs below — a
    // fresh stroke's very first _onStart call correctly sees undefined
    // (nothing to smear from yet), and every _onMove call after that sees
    // the real previous dab regardless of where the last batch happened to
    // end, so a smudge stroke smears continuously across _onMove's own
    // internal batching instead of restarting at each call.
    // (#536) What the paper under these dabs was already carrying, resolved
    // *before* they are painted and before they wet it themselves — otherwise
    // a stroke reads its own water back and every mark believes it was laid
    // into a puddle.
    //
    // Quantized here rather than at pen-up, and that is load-bearing: the value
    // the live mark uses has to be the value replay will read, or the stroke
    // redraws itself when the room reloads. One sample per WET_SAMPLE_STRIDE
    // dabs, appended in order, so a packet already sent stays a prefix of what
    // the operation will eventually carry.
    let batchWet: string | undefined
    if (this._strokeTool === 'watercolor') {
      const now = performance.now()
      let seen = ''
      const nibMul = this._resolvePreset(this._strokeTool, this._strokePreset).sizeMultiplier
      for (const dab of dabs) seen += quantizeWet(this._paperWet.sampleUnderNib(layerId, dab.x, dab.y, dab.size * 0.5 * nibMul * Math.max(dab.aspectRatio, 1), now))
      this._strokeWet += seen
      this._liveWetQueue += seen
      batchWet = seen
    }
    const standing = this._paintDabs(
      buf, dabs, this._strokeTool, this._strokePreset, this._strokeColor, this._userId,
      this._strokeDabs.at(-1) ?? this._strokeChunkTail, this._ribbonStrokeScratch ?? undefined,
      undefined, undefined, batchWet, mottleSeedFromStrokeId(this._strokeId ?? undefined),
    )
    this._paintExtraLayers(dabs)
    // …and this stroke's own water is *queued*, not laid. It reaches the paper
    // at pen-up.
    //
    // Laying it here looked right and was wrong in a way that quietly disabled
    // the whole feature: this method runs once per pointer event, so the second
    // batch of a stroke sampled the water the first batch had just put down.
    // Every mark therefore believed it was painting into a puddle — a stroke on
    // dry paper recorded a profile like "08008000000" — and once every stroke
    // reads wet, actually laying water first stops meaning anything. Which is
    // exactly how it behaved.
    //
    // (#536, §17.21) What each dab left standing, as the ribbon build worked it
    // out (watercolorStandingWater) — the same number it wrote into the wash's
    // coverage .b, so the puddle this field draws is the puddle the diffusion
    // runs in. It used to be the nominal mix for every dab, on the argument
    // that a patch of paper barely cares which end of the stroke wetted it;
    // but the brush's water runs out along a stroke now, and a dry brush wets
    // nothing — so the sheen ran on where the record had stopped, and pigment
    // dropped into the far end of a scribbled puddle had nothing to run in.
    if (this._strokeTool === 'watercolor') {
      const now = performance.now()
      const water = watercolorMixFromPreset(this._strokePreset).water
      for (let i = 0; i < dabs.length; i++) {
        const dab = dabs[i]
        // (#536) …and takes some away first, where there was any. The brush's
        // half of this exchange is in watercolorWaterClock, back in the ribbon
        // build; this is the paper's half, and the two are deliberately not
        // derived from one another — see watercolorPaperDrained.
        //
        // Read from the digit this batch just recorded rather than from the
        // field, which is the same discipline the sampling above follows: the
        // recorded number is the one the mark was built from, so the paper and
        // the mark cannot come to different conclusions about how wet it was.
        const drained = watercolorPaperDrained(wetAt(batchWet, i), water)
        if (drained > 0) this._paperWet.drain(layerId, dab.x, dab.y, dab.size * 0.5, drained)
        this._paperWet.deposit(layerId, dab.x, dab.y, dab.size * 0.5, standing?.get(dab) ?? water, now, true, this._dabPool.get(dab) ?? 0)
      }
      this._scheduleDryingRepaint()
    }
    this._strokeDabs.push(...dabs)
    for (const d of dabs) this._noteChunkDab(d)
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
    if (this._strokeDabs.length >= STROKE_DAB_CHUNK_LIMIT || this._chunkSpanExceeded()) this._flushStrokeChunk()
  }

  /** (#520) Lays this batch of already-baked dabs into every *other* layer the
   *  gesture goes through — the eraser's cross-layer mode, and nothing else:
   *  `_strokeExtraLayerIds` is empty for every other tool.
   *
   *  The dabs are the same objects the active layer just got, deliberately.
   *  Their opacity, size and angle were baked once by `_bakeDabOpacity` from
   *  the pointer's own speed and tilt, and re-deriving them per layer would let
   *  the same pass of the eraser take different amounts off different layers.
   *  They are also the objects that go on to `_strokeDabs` and into every
   *  recorded operation, so each layer's own operation carries exactly what was
   *  painted into it.
   *
   *  Passes none of `_paintDabs`'s per-gesture extras (prevDab, ribbonScratch,
   *  strokeId, washId) because none of them exist for an eraser: its dabs are
   *  independent of one another, which is the property that makes painting one
   *  batch into N buffers correct at all rather than merely convenient. */
  private _paintExtraLayers(dabs: Dab[]): void {
    if (!this._strokeExtraLayerIds.length) return
    for (const id of this._strokeExtraLayerIds) {
      const buf = this._layers.get(id)
      if (!buf) continue
      this._paintDabs(buf, dabs, this._strokeTool, this._strokePreset, this._strokeColor, this._userId)
      this._snapshots.markDirty(id)
    }
    // #122: on every batch, not once when the gesture starts. The composite
    // keeps everything below the active layer baked into one cached texture and
    // everything above it in another, and every one of these layers is in one
    // of the two — so a cache built after the first batch survives the rest of
    // the gesture and the screen simply stops updating for them.
    //
    // Found end to end, not here: the layer buffers were correct throughout
    // (which is all a unit test against MockGL reads), the recorded operations
    // were correct, and the picture still showed ink the log said was gone —
    // until anything else forced a recomposite. Same reasoning, and the same
    // per-batch placement, as _paintStrokeDabs' own invalidate for a stroke
    // whose layer diverged from the active one.
    this._invalidateSplitCache()
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

    // #482, ADR 012 §5: the footprint comes from the same tipFootprint() every
    // other dab goes through, via the DabSystem that is already mid-stroke — so
    // this path stops being a second implementation of dab geometry. `ds = 0`
    // is what makes it a *resting* footprint: the bend filter's weight is zero
    // there, so a dwelling nib keeps exactly the bend the stroke left it with,
    // and the tip state comes back untouched.
    //
    // #278 lives on inside that shared function rather than as a branch here.
    // The old code hardcoded `angle: 0` for every tool but the marker, with the
    // reasoning that a resting liner has no path direction and its aspect
    // (1..1.15) is too mild for the angle to show. Both halves were true; the
    // branch was still a special case of one tool's geometry sitting in the
    // engine. Now a resting liner gets the same tilt-or-path angle a moving one
    // does — at 1.15:1 that moves the mark's boundary by at most a few percent
    // of its radius, and it removes the last per-tool geometry test outside the
    // tip model.
    const fp = this._dabs.restingFootprint(
      this._lastPointerX, this._lastPointerY, this._lastPointerPressure,
      this._lastPointerTiltX, this._lastPointerTiltY, this._physicalSize,
    )
    const dab: Dab = {
      x: fp.x, y: fp.y,
      pressure: this._lastPointerPressure, tiltX: this._lastPointerTiltX, tiltY: this._lastPointerTiltY,
      size: fp.size, aspectRatio: fp.aspectRatio, angle: fp.angle,
      opacity: 1, t: performance.now() - this._strokeStartTimestamp,
    }
    const preset = this._resolvePreset(this._strokeTool, this._strokePreset)
    dab.opacity = preset.opacity * this._opts.opacity * linerTiltFlow(fp.tiltMag) * dwellFlow(elapsed, cfg)

    this._paintDabs(
      buf, [dab], this._strokeTool, this._strokePreset, this._strokeColor, this._userId,
      this._strokeDabs.at(-1) ?? this._strokeChunkTail, this._ribbonStrokeScratch ?? undefined,
    )
    // (#520) A no-op today — only the liner dwells, and only the eraser goes
    // through layers — but a dwell dab is a real dab of this gesture (see the
    // live-channel note just below, which is the same argument), so it goes
    // wherever the gesture's other dabs go rather than being the one that
    // silently doesn't.
    this._paintExtraLayers([dab])
    this._strokeDabs.push(dab)
    this._noteChunkDab(dab)
    // (#429) A dwell dab is a real dab of this gesture — it goes into the
    // operation, so it has to go down the live channel too, or a peer's
    // pre-painted prefix would drift out of step with the operation's own
    // dab count and the claim would skip the wrong ones.
    if (this._onLiveStrokeDabs) { this._liveDabQueue.push(dab); this._emitLiveDabsIfDue() }
    if (this._strokeLayerId !== this._activeId) this._invalidateSplitCache()
    if (this._strokeDabs.length >= STROKE_DAB_CHUNK_LIMIT || this._chunkSpanExceeded()) this._flushStrokeChunk()
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
    // (#520) One packet per layer this gesture paints into, all carrying the
    // *same* packetSeq. The counter advances once per round, not once per
    // packet: each layer is its own stream on the receiving side (see
    // liveStrokeKey), and it has to see 0, 1, 2… of its own. A single counter
    // shared across the packets would hand layer A 0, 2, 4 and layer B 1, 3, 5,
    // and every receiver would read a gap and desync the gesture.
    const packetSeq = this._livePacketSeq++
    const dabs = this._liveDabQueue
    const wet = this._liveWetQueue
    for (const layerId of [this._strokeLayerId, ...this._strokeExtraLayerIds]) {
      this._onLiveStrokeDabs({
        strokeId: this._strokeId, layerId,
        tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
        packetSeq, dabs,
        // (#468) Decided at pen-down and constant for the gesture, so every
        // packet carries the same value the operation will.
        ...(this._washId ? { washId: this._washId } : {}),
        // (#536) Exactly this packet's dabs' worth, so the peer indexes it from
        // zero the same way a replayed operation does.
        ...(wet && !isDryProfile(wet) ? { wet } : {}),
      })
    }
    // A fresh array rather than length = 0: the packet above holds this one,
    // and the caller is free to keep it (Room packs it asynchronously).
    this._liveDabQueue = []
    this._liveWetQueue = ''
  }

  private _noteChunkDab(d: Dab): void {
    const b = this._strokeChunkBox
    const half = d.size * 0.5 * Math.max(d.aspectRatio, 1)
    if (!b) { this._strokeChunkBox = { minX: d.x, minY: d.y, maxX: d.x, maxY: d.y, half }; return }
    if (half > b.half) b.half = half
    if (d.x < b.minX) b.minX = d.x
    if (d.x > b.maxX) b.maxX = d.x
    if (d.y < b.minY) b.minY = d.y
    if (d.y > b.maxY) b.maxY = d.y
  }

  /** (#536, §17.43) Whether the watercolour chunk in progress has grown past
   *  the settle field's reach - see WC_STROKE_CHUNK_SPAN_PX. */
  private _chunkSpanExceeded(): boolean {
    const b = this._strokeChunkBox
    if (!b || this._strokeTool !== 'watercolor') return false
    // (#536, §17.63) Doubled only when the settle will really run at half
    // resolution, and that is decided by the nib the dabs drew (the settle's
    // radiusPx: size under pressure, times the preset's multiplier, along the
    // long axis) - not by the size slider. A 96 px brush at pressure 0.8 has a
    // 43 px nib: full resolution, a field capped at 1536 px, and a 2200 px chunk
    // settled in a window cut to the middle of it, a straight wall through the
    // wash (the seam §17.43 cut chunks to prevent).
    const nib = b.half * this._resolvePreset(this._strokeTool, this._strokePreset).sizeMultiplier
    const span = WC_STROKE_CHUNK_SPAN_PX * (nib >= WC_HALF_RES_RADIUS_PX ? 2 : 1)
    return Math.max(b.maxX - b.minX, b.maxY - b.minY) + this._opts.size > span
  }

  private _flushStrokeChunk(): void {
    const layerId = this._strokeLayerId
    if (!layerId || !this._strokeDabs.length) return
    // (#520) Per layer, exactly as _onEnd's own dispatch is — see its comment.
    const dabsPacked = packDabs(this._strokeDabs)
    for (const targetId of [layerId, ...this._strokeExtraLayerIds]) {
      const op: Operation = {
        id: nanoid(10), type: 'stroke', userId: this._userId,
        layerId: targetId, tool: this._strokeTool, preset: this._strokePreset, color: this._strokeColor,
        dabsPacked, timestamp: Date.now(),
        ...(this._strokeId ? { strokeId: this._strokeId } : {}),
        // (#536) The wash too, exactly as _onEnd stamps it: replay groups a
        // chunk by washId ?? strokeId, so a chunk without it landed in a
        // different scratch from the gesture's last chunk — and the halo
        // clip, the diffusion and the composite scalars then differed between
        // the author and everyone else. Read off Ilya's own log as
        // (no wash, no wash, wash) on one 1835-dab scribble.
        ...(this._washId ? { washId: this._washId } : {}),
        ...(this._strokeWet && !isDryProfile(this._strokeWet) ? { wet: this._strokeWet } : {}),
      }
      this._log.append(op, { pending: true })
      if (this._wcAsyncLocalStroke) this._queueAsyncLocalToolOp(op, this._wcAsyncLocalStroke)
      if (this._foreignUnrecordedInk(targetId, op)) this._unsettledLayers.add(targetId)
      this._maybeCheckpoint(targetId)
      this._onLocalOperation?.(op)
    }
    this._strokeChunkTail = this._strokeDabs[this._strokeDabs.length - 1]
    this._strokeDabs = []
    this._strokeChunkBox = null
    // Drained with the dabs it belongs to: the next chunk's profile starts at
    // its own first dab, exactly as a replayed operation's does.
    this._strokeWet = ''
    // (#536) Settle at the chunk boundary, exactly as a replay settles each
    // chunk operation: the diffusion inside runs once per operation, and the
    // author has to run it at the same moments the replay will, or the two
    // land on different pictures.
    // (§17.43) ...synchronously, not spread over the frames under a reveal:
    // the gesture goes on painting meanwhile, and a settle landing a few
    // frames later copied the chunk's deposit AS IT WAS over what the brush
    // had laid since - or, when the next batch's film rebuild came first,
    // never landed at all. Which of the two happened was frame timing, and
    // the replay (always synchronous) matched neither. Then a fresh film:
    // see newFilm.
    // (§17.44) ...spread over the frames again, now that a settle landing
    // under a running gesture merges rather than overwrites (the coverage by
    // max, the film's base refreshed - see _diffuseWashOps' finish): the
    // synchronous form was a hitch of tens to hundreds of milliseconds every
    // chunk on a big brush ("слишком сильно тормозит при больших штрихах").
    if (this._ribbonStrokeScratch && !this._wcAsyncLocalStroke) {
      this._finishRibbonStroke(this._ribbonStrokeScratch, true, false)
      this._ribbonStrokeScratch.newFilm()
    }
  }

  // ─── Reference image import (#88) ──────────────────────────────────────────────

  /** See the PencilEngineAPI doc comment. The decode, the cache and the blit
   *  live in ImageImport (src/raster/ImageImport.ts). */
  preloadImage(src: string): Promise<void> {
    return this._images.preloadImage(src)
  }

  /** See the PencilEngineAPI doc comment. */
  preloadImages(ops: Operation[]): Promise<void> {
    return this._images.preloadImages(ops)
  }

  /** The one DOM object image import needs, kept here so nothing under
   *  src/ constructs one — see ImageImportContext.decode. */
  private _decodeImage(src: string, onload: (img: HTMLImageElement) => void, onerror: () => void): void {
    const img = new Image()
    img.onload = () => onload(img)
    img.onerror = onerror
    img.src = src
  }

  /** (#398) An image that had to be decoded *after* its operation was
   *  applied has just landed. Anything that painted this layer in the
   *  meantime is now wrongly underneath it — a peer's stroke arriving right
   *  behind the import, or the import's own undo. The image is in
   *  ImageImport's cache now, so rebuilding replays the whole layer
   *  synchronously and in log order, putting everything back where the log
   *  says it goes.
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

  // ─── Shapes (#527) and layer filters (#574, ADR 014) ───────────────────────
  // Both live in their own files — src/raster/ShapePass.ts and
  // src/filters/FilterPass.ts; these are the PencilEngineAPI entry points.

  /** See PencilEngineAPI's doc comment. */
  previewShape(
    layerId: string, geometry: ShapeGeometry, frame: ShapeFrame,
    stroke: ShapeStroke | null, fill: ShapeFill | null,
  ): void {
    this._shapes.preview(layerId, geometry, frame, stroke, fill)
  }

  /** See PencilEngineAPI's doc comment. */
  previewLayerFilter(layerId: string, filter: LayerFilter | null): void {
    this._filters.preview(layerId, filter)
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  /** (§17.70) Rough tile pixels one ribbon nib pass of `dab` covers. */
  private _nibDrawCost(tile: PaintTarget, dab: Dab, preset: PencilPreset): number {
    const { hx, hy } = this._dabWorldHalfExtents(dab, false, preset)
    return rectOnTile(tile, { minX: dab.x - hx, minY: dab.y - hy, maxX: dab.x + hx, maxY: dab.y + hy })
  }

  /** (§17.70) Whether a ribbon nib pass of `dab` can put a fragment on
   *  `tile`. Its quad is the nib's rotated box (DAB_VERT, no wick for the
   *  ribbon), inside _dabWorldHalfExtents; one that misses the tile draws
   *  nothing, and skipping it changes no pixel. A stroke over six tiles drew
   *  every dab six times, and on the iPad each draw into its own target is a
   *  render pass whether or not it lands. */
  private _nibTouchesTile(tile: PaintTarget, dab: Dab, preset: PencilPreset): boolean {
    const { hx, hy } = this._dabWorldHalfExtents(dab, false, preset)
    const m = 2
    return dab.x + hx + m > tile.originX && dab.x - hx - m < tile.originX + tile.buffer.width
      && dab.y + hy + m > tile.originY && dab.y - hy - m < tile.originY + tile.buffer.height
  }

  /** (#494) One dab's world-space half-extents — see dabWorldHalfExtents
   *  (dabs/StampPainter.ts). Kept as a method for the ribbon paths, which
   *  resolve their tiles one dab at a time with it. */
  private _dabWorldHalfExtents(
    d: Dab, erasing: boolean, preset: PencilPreset, wicking = false,
  ): { hx: number; hy: number } {
    return dabWorldHalfExtents(d, erasing, preset, wicking)
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
   *  (SmudgePainter's imprints) these dabs exchange with — every caller already
   *  knows this (their own this._userId for a live/preview stroke, the
   *  StrokeOperation's own userId for a remote/replayed one); unused by
   *  every other tool.
   *
   *  `prevDab` (smudge only, #14): the dab immediately before `dabs[0]` in
   *  the same stroke, if any — see SmudgePainter.paint's own doc comment for
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
   *  (SmudgePainter.resumeGesture). Both are no-ops without it — a stroke recorded
   *  before strokeId existed replays as several independent operations, with
   *  a seam at each boundary. */
  private _paintDabs(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string,
    color: [number, number, number], userId: string, prevDab?: Dab, ribbonScratch?: RibbonStrokeScratch,
    strokeId?: string, washId?: string,
    /** (#536) How wet the paper already was under this stroke, as the recorded
     *  hex profile (StrokeOperation.wet). Live passes the profile it is
     *  building; replay passes the one it read. Both must be the *quantized*
     *  string, never a raw reading — see paperWetness.ts. */
    wetProfile?: string,
    /** (#536) Two floats derived from the stroke's own recorded id — this
     *  stroke's offset into the mottling field. Both the live mark and its
     *  replay must resolve it from the same id, or the two draw different
     *  texture; see mottleSeedFor. */
    strokeSeed?: [number, number],
    /** (#536, §17.52) A peer's operation arriving live: its settle may be
     *  spread over frames. Never for a history batch or a rebuild. */
    spreadSettle = false,
  ): ReadonlyMap<Dab, number> | undefined {
    if (!dabs.length) return undefined
    // Logical input remains immediate. Only isolated display copies may change
    // before the preceding canonical solver has landed.
    if (!strokeId && this._wcAsyncLocalStroke && tool !== 'watercolor') {
      const layerId = [...this._layers].find(([, buffer]) => buffer === target)?.[0]
      if (layerId) { this._paintAsyncLocalTool(layerId, dabs, tool, presetName, color, prevDab); return undefined }
    }
    if (tool === 'smudge') { this._smudge.paint(target, dabs, userId, prevDab, strokeId); return undefined }
    // #573 — the mixer brush paints through smudge's carried imprint with its
    // own colour loaded into it; every other digital brush is a ribbon-scratch
    // tool below.
    if (tool === 'digitalBrush') {
      const paint = digitalBrushMixer(presetName, color)
      if (paint) { this._smudge.paint(target, dabs, userId, prevDab, strokeId, paint); return undefined }
    }
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
    if (tool === 'watercolor' && ribbonScratch) {
      if (!this._wcAsyncFinish && this._wcSourceFilmRebase && this._settle?.scratch === ribbonScratch) {
        ribbonScratch.trackRunningSource = this._wcSourceFilmRebase
      }
      // Native input and decoded operations must enter CPU geometry at the
      // same codec precision. Keep the recorded dabs and standing keys intact.
      const canonical = dabs.map(codecDab)
      const standing = this._paintRibbonDabs(target, canonical, tool, presetName, color, ribbonScratch, prevDab ? codecDab(prevDab) : undefined, strokeId, washId, wetProfile, strokeSeed, spreadSettle)
      if (!standing) return undefined
      const originalKeys = new Map(standing)
      for (let i = 0; i < canonical.length; i++) {
        if (canonical[i] === dabs[i] || !standing.has(canonical[i])) continue
        originalKeys.delete(canonical[i])
        originalKeys.set(dabs[i], standing.get(canonical[i])!)
      }
      return originalKeys
    }
    if (isRibbonTool(tool)) return this._paintRibbonDabs(target, dabs, tool, presetName, color, ribbonScratch, prevDab, strokeId, washId, wetProfile, strokeSeed, spreadSettle)
    // Everything else is a stamp tool — pencil, eraser, liner, charcoal.
    this._stamps.paint(target, dabs, tool, presetName, color)
    return undefined
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
   *  are (see SmudgePainter.paint's own doc comment for the identical
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
    ribbonScratch?: RibbonStrokeScratch, prevDab?: Dab, strokeId?: string, washId?: string,
    wetProfile?: string,
    strokeSeed?: [number, number],
    spreadSettle = false,
  ): ReadonlyMap<Dab, number> | undefined {
    const work = this._ribbonDabsWork(target, dabs, tool, presetName, color, ribbonScratch, prevDab, strokeId, washId, wetProfile, strokeSeed, spreadSettle, 0)
    let r = work.next()
    while (!r.done) r = work.next()
    return r.value
  }

  /** (§17.70) _paintRibbonDabs as a generator that yields after every draw of
   *  the stroke, so a rebuild can spread one operation over frames. The draws
   *  keep exactly the one-shot order - the coverage record blends "over", and
   *  the halo reads the finished coverage, so cutting the operation into dab
   *  batches instead (what a live gesture does) paints a different picture.
   *  `pieceTris`: ribbon bands are drawn this many triangles at a time, in
   *  their own order (0: whole); set, each yield also says roughly how many
   *  tile pixels the draw just queued covered, which is what its GPU time
   *  follows (a dab off the tile is clipped for nothing), and a last yield of
   *  -1 comes between the drawing and the stroke's finish. */
  private *_ribbonDabsWork(
    target: ILayerBuffer | AccumulationBuffer, dabs: Dab[], tool: ToolType, presetName: string,
    color: [number, number, number],
    ribbonScratch: RibbonStrokeScratch | undefined, prevDab: Dab | undefined, strokeId: string | undefined, washId: string | undefined,
    wetProfile: string | undefined,
    strokeSeed: [number, number] | undefined,
    spreadSettle: boolean,
    pieceTris: number,
  ): Generator<number, ReadonlyMap<Dab, number> | undefined, void> {
    // Transient scratch targets (live-tip/prediction preview, a peer's
    // reveal buffer) have no resolveForPaint() (only a real ILayerBuffer
    // does — see _ribbonStrokeWork below, which needs it to find the
    // tile), so there's nothing this path can paint into there anyway —
    // same early-return SmudgePainter.paint's own doc comment documents for
    // the identical structural reason. The real dabs always paint straight
    // into the real layer regardless (see _paintDabs' own doc comment on
    // `target`).
    if (target instanceof AccumulationBuffer) return undefined
    this._washActiveAt = performance.now() // (§17.68)
    const preset = this._resolvePreset(tool, presetName)
    // (#536) The paper's own wetness where this gesture came down, read from
    // what the stroke recorded rather than from the live field: a replay has no
    // field, and a live batch must not consult a clock that has moved on since
    // the pen landed. Index 0 is the gesture's first dab on both paths — live
    // batches slice their own digits, and the batch that decides the gesture's
    // cached scalars and its final recomposite is the first one.
    const initialProfile = ribbonProfileFor(tool, presetName, wetAt(wetProfile, 0))
    const chunk = ribbonScratch ? null : this._replayChunkScratch(target, strokeId, washId, dabs, initialProfile)
    const scratch = ribbonScratch ?? chunk?.scratch ?? new RibbonStrokeScratch(this._ribbonScratchPool, initialProfile.ink, initialProfile.normalizeDeposit)
    const profile = ribbonProfileFor(tool, presetName, scratch.finishContext?.landedWet ?? wetAt(wetProfile, 0))
    if (profile.normalizeDeposit && wetPeak(wetProfile) > 0 && scratch.foreignSources === null) {
      // A prior wet region is geometry, not another pigment accumulation.
      // Keep wash ids intact; the recorded contacts alone permit entry into it.
      const entries = this._log.entries
      const own = ribbonScratch === this._ribbonStrokeScratch
      const gestureId = strokeId ?? (own ? this._strokeId : undefined)
      const sourceWashId = washId ?? (own ? this._washId : undefined)
      const current = gestureId ? entries.find(e => e.op.type === 'stroke' && e.op.strokeId === gestureId)?.op : undefined
      const layerId = current && 'layerId' in current ? current.layerId : own ? this._strokeLayerId : undefined
      const at = current?.timestamp ?? Date.now()
      const sources: WaterSource[] = []
      for (const e of entries) {
        const op = e.op
        if (gestureId && op.type === 'stroke' && op.strokeId === gestureId) break
        if (e.state !== 'done') continue
        if (op.type === 'paper_dry' || (op.type === 'layer_clear' && op.layerId === layerId)) sources.length = 0
        if (op.type !== 'stroke' || op.tool !== 'watercolor' || op.layerId !== layerId
          || op.washId === sourceWashId || at - op.timestamp > WET_DRY_MS || at < op.timestamp) continue
        const mix = watercolorMixFromPreset(op.preset)
        if (mix.water < 0.5) continue
        const mul = this._resolvePreset('watercolor', op.preset).sizeMultiplier
        const gesture = op.strokeId ?? op.id
        let source = sources.find(s => s.gesture === gesture)
        if (!source) { source = { gesture, footprints: [], chunks: [] }; sources.push(source) }
        const sourceDabs = strokeDabs(op)
        if (this._ribbonPainter.diagnosticForeignSolvent && !source.chunks?.some(c => c.id === op.id)) source.chunks?.push({ id: op.id, preset: op.preset, color: op.color, dabs: sourceDabs, wet: op.wet, seed: mottleSeedFromStrokeId(op.strokeId) })
        for (const d of sourceDabs) source.footprints.push({
          x: d.x, y: d.y, radius: d.size * 0.5 * mul, aspect: Math.max(1, d.aspectRatio), angle: d.angle,
        })
      }
      // A peer preview has no committed operation yet. Do not cache a miss:
      // its final recorded op supplies the authoritative layer and timestamp.
      if (layerId) scratch.foreignSources = sources
    }
    // `prevDab` is threaded the same way smudge threads its own
    // (SmudgePainter.paint): the dab immediately before dabs[0] may come from a
    // *previous* call in the same stroke (see _paintDabs' own doc comment on
    // ribbonScratch/prevDab), and the ribbon needs it both to bridge the two
    // batches and to compute this batch's own distance-normalized ink deposit.
    // (#536, §17.22) Only the author's own gesture (the caller-owned scratch)
    // defers its composite to the frame; a replay or a peer's packet has no
    // frame to wait for and composites as it always did.
    // (§17.52) A settle of this same wash still spread over frames lands
    // before anything is painted into it - replay order.
    if (!ribbonScratch && this._settle?.scratch === scratch) this._completeSettle()
    yield* this._ribbonStrokeWork(target, dabs, preset, presetName, profile, color, scratch, prevDab ?? chunk?.prevDab, wetProfile, strokeSeed, !!ribbonScratch, pieceTris)
    // Replay finishes the stroke inside this call as far as it can know: a
    // one-shot has painted every dab there is, a chunk every dab of its own
    // operation. Both recomposite now; a chunked gesture simply does it again,
    // over larger bounds, when the next chunk arrives — the composite is a pure
    // recomputation, so repeating it is a no-op by construction.
    if (!ribbonScratch) {
      // (§17.72) The drawing is done; what follows is the stroke's finish,
      // which may start a settle - a caller spreading the drawing over frames
      // must have closed its own spread first.
      if (pieceTris) yield -1
      this._finishRibbonStroke(scratch, false, false, spreadSettle && !!chunk)
      // (§17.43) A chunk's end is a film's end, as at the live chunk flush;
      // for a gesture's last operation the next stroke begins a new film
      // anyway, so this is only ever what the flush did.
      scratch.newFilm()
    }
    // What this batch left standing, for the caller to feed the wetness field
    // — its own copy, since a throwaway scratch is destroyed on the next line.
    const standing = scratch.standing.size ? new Map(scratch.standing) : undefined
    // The cached one belongs to the gesture, not to this call — it is released
    // when a different gesture arrives, or with the engine.
    if (!ribbonScratch && !chunk) scratch.destroy()
    return standing
  }

  /** (§17.68) A lost wash's next operation: the layer is rebuilt, which replays
   *  the wash from its first stroke. After the current operation, which is
   *  being painted the only way it can be. */
  private _rebuildLostWash(target: ILayerBuffer): void {
    for (const [id, buf] of this._layers) {
      if (buf !== target) continue
      queueMicrotask(() => { if (!this._destroyed && this._layers.get(id) === target) this._rebuildLayerOrDefer(id) })
      return
    }
    // (#701) A continuation may grow the journal while a sliced rebuild is
    // still painting its fresh buffer. That buffer is not in _layers yet;
    // restart its job too, after the current slice has relinquished it.
    for (const [id, job] of this._rebuildJobs) {
      if (job.fresh !== target) continue
      queueMicrotask(() => {
        if (!this._destroyed && (this._rebuildJobs.get(id) === job || this._layers.get(id) === target)) this._rebuildLayerOrDefer(id)
      })
      return
    }
  }
  /** Ribbon batch deposition is owned by RibbonStrokePainter. */
  private *_ribbonStrokeWork(
    target: ILayerBuffer, dabs: Dab[], preset: PencilPreset, presetName: string, profile: RibbonProfile,
    color: [number, number, number], scratch: RibbonStrokeScratch, prevDab: Dab | undefined,
    /** (#536) One hex digit per dab of `dabs`, saying how wet the paper each
     *  landed on already was — see paperWetness.ts. Sliced to this call's own
     *  dabs by the caller, so index 0 is dabs[0] on every path. */
    wetProfile?: string,
    strokeSeed?: [number, number],
    /** (#536, §17.22) See _paintRibbonDabs: the live gesture's composite waits for the frame. */
    deferComposite = false,
    /** (§17.70) See _ribbonDabsWork. */
    pieceTris = 0,
  ): Generator<number, void, void> {
    const deferred = this._wcAsyncFinish && deferComposite && scratch === this._ribbonStrokeScratch
    yield* this._ribbonPainter.paint(target, dabs, preset, presetName, profile, color, scratch, prevDab, wetProfile, strokeSeed, deferComposite, pieceTris,
      { waterOnly: false, segmented: false, ...(deferred ? { deferMaterial: request => {
        this._holdAsyncScratch(scratch)
        const presentation = this._showAsyncPresentation(scratch, request.metadata.gesture, request.presentationDabs, presetName, color)
        const owner = this
        let released = false
        const release = (lost: boolean): void => {
          if (released) return
          released = true
          owner._releaseAsyncPresentationItem(scratch, request.metadata.gesture, presentation, lost)
          owner._releaseAsyncScratch(scratch, lost)
        }
        this._wcCanonical.enqueue({
          execute: function* () { yield* request.execute(); release(false) },
          cancel: lost => { request.cancel(lost); release(lost) },
        })
      } } : {}) })
  }

  /** #573 — a digital brush stroke on the `stamp` model: see
   *  BrushPainter.paint. Kept by this name for _ribbonStrokeWork, which is
   *  live on another branch. */
  private _paintBrushStroke(
    target: ILayerBuffer, dabs: Dab[], preset: PencilPreset,
    stamp: { brush: BrushDescriptor; pressure: BrushPressureSettings },
    color: [number, number, number], scratch: RibbonStrokeScratch, prevDab: Dab | undefined,
  ): void {
    this._brush.paint(target, dabs, preset, stamp, color, scratch, prevDab)
  }

  /** (#468 v6) One composite over everything the finished gesture touched, with
   *  the buffers complete — the same thing a replay of this stroke does in a
   *  single call. See RibbonStrokeScratch's own _finish for why the incremental
   *  per-batch composites are not enough on their own. */
  /** (#536, ADR 011 §17.12) The settle is about to rewrite `tile` — keep what
   *  it shows now, so the composite can converge on the new picture instead
   *  of cutting to it. Presentation, not content: the tile itself is written
   *  with the dry target as always, the copy lives in a pooled buffer that no
   *  paint pass ever reads, and nothing about it is serialised. The jump Ilya
   *  could not judge anything through ("пока ведёшь — одно, отпустил —
   *  картинка резко меняется") was the *content* jumping in plain view; now
   *  the content jumps under a mask and the screen eases onto it.
   *
   *  A tile already converging keeps converging: the new copy is what the
   *  screen shows at this instant — the old copy mixed over the old pixels by
   *  the old hold — so the second settle continues the motion rather than
   *  restarting it from a picture the eye never saw. */
  private _revealWash(tile: PaintTarget, layer: ILayerBuffer): void {
    const { gl } = this
    const { buffer } = tile
    // Not from the ribbon pool: those are 'nearest' and cannot carry mipmaps,
    // and at a minifying zoom a nearest copy mixed with a mip-sampled tile is
    // a different picture — the tile's rect shows against its neighbours as
    // a seam for as long as the reveal runs. Same filter and mip ability as
    // the tile itself, destroyed when the reveal lets go.
    const before = this._revealPoolAcquire(buffer.width, buffer.height)
    const prev = this._washReveals.get(buffer)
    if (!prev) {
      buffer.copyTo(before)
    } else {
      before.beginReplaceDraw()
      gl.useProgram(this._revealProg)
      const u = this._revealUni
      gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
      gl.enableVertexAttribArray(this._revealPosLoc)
      gl.vertexAttribPointer(this._revealPosLoc, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, buffer.texture)
      gl.uniform1i(u.u_after, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, prev.before.texture)
      gl.uniform1i(u.u_before, 1)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1f(u.u_hold, this._revealHold(prev, performance.now()))
      gl.uniform1f(u.u_opacity, 1)
      this._setRevealMotion(prev, performance.now())
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      before.endDraw()
      this._revealPoolRelease(prev.before)
      if (prev.pending) this._revealPoolRelease(prev.pending)
      if (prev.wetMask) this._revealPoolRelease(prev.wetMask)
    }
    let layerId = ''
    for (const [id, buf] of this._layers) if (buf === layer) { layerId = id; break }
    this._washReveals.set(buffer, { layerId, before, startedAt: null })
  }

  /** How much of the kept picture still shows, 1 → 0 over WC_REVEAL_MS,
   *  fast first: the square of the time left. */
  private _revealHold(reveal: WashReveal, now: number): number {
    if (reveal.progressive) return reveal.startedAt === null || now - reveal.startedAt < (reveal.durationMs ?? 8000) ? 1 : 0
    return washRevealHold(reveal.startedAt, now, WC_REVEAL_MS)
  }

  /** A live batch just composited `bounds` into `tile`: the kept picture is
   *  refreshed there, so paint under the brush shows at once rather than
   *  fading in through a reveal that predates it. Under the brush the
   *  earlier settle therefore snaps to its dry target; everywhere else the
   *  reveal keeps running. */
  /** The rect of `bounds` inside `tile`, bottom-up GL, or null if empty. */
  private _revealRect(tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }): [number, number, number, number] | null {
    const { buffer, originX, originY } = tile
    const x0 = Math.max(Math.floor(bounds.minX), originX)
    const y0 = Math.max(Math.floor(bounds.minY), originY)
    const x1 = Math.min(Math.ceil(bounds.maxX), originX + buffer.width)
    const y1 = Math.min(Math.ceil(bounds.maxY), originY + buffer.height)
    if (x1 <= x0 || y1 <= y0) return null
    // Top-down world → bottom-up GL, as SmudgePainter.gatherPatch does it.
    return [x0 - originX, buffer.height - (y1 - originY), x1 - x0, y1 - y0]
  }

  /** A live batch is about to composite `bounds` into a tile that is still
   *  converging on a settle: keep what the tile holds there now, so the batch's
   *  CHANGE can be added to the kept picture afterwards (_revealAfterBatch).
   *  Returns the pooled copy, or null when there is no reveal to keep honest. */
  private _revealBeforeBatch(tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }): AccumulationBuffer | null {
    if (!this._washReveals.has(tile.buffer)) return null
    const rect = this._revealRect(tile, bounds)
    if (!rect) return null
    const prev = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
    tile.buffer.copyRegionInto(prev, rect[0], rect[1], rect[0], rect[1], rect[2], rect[3])
    return prev
  }

  /** …and after the composite: kept += (tile now − tile before), inside the
   *  batch's rect. The new paint shows at once under the brush while the
   *  earlier settle goes on easing in around and under it.
   *
   *  It used to copy the tile's rect over the kept picture outright, which
   *  snapped the reveal to its dry target inside the rect — and the rect is
   *  the batch's dabs padded by the composite's whole reach, most of a blot
   *  for one touch on it: "касаюсь пером — состояние всего пятна резко
   *  меняется". Adding the difference keeps the reveal's remaining delta
   *  where the batch did not paint. */
  private _revealAfterBatch(tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }, prev: AccumulationBuffer | null): void {
    if (!prev) return
    const reveal = this._washReveals.get(tile.buffer)
    const rect = this._revealRect(tile, bounds)
    if (reveal && rect) {
      const sum = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
      this._fieldOp(sum, reveal.before, tile.buffer, 3, 1, { c: prev, scissor: rect })
      sum.copyRegionInto(reveal.before, rect[0], rect[1], rect[0], rect[1], rect[2], rect[3])
      if (reveal.pending) {
        this._fieldOp(sum, reveal.pending, tile.buffer, 3, 1, { c: prev, scissor: rect })
        sum.copyRegionInto(reveal.pending, rect[0], rect[1], rect[0], rect[1], rect[2], rect[3])
      }
      this._ribbonScratchPool.release(sum)
    }
    this._ribbonScratchPool.release(prev)
  }
  private _fieldOp(
    out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, mode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20, k: number,
    opts: { c?: AccumulationBuffer; scissor?: [number, number, number, number]; dir?: [number, number]; d?: AccumulationBuffer; origin?: [number, number]; band?: [number, number]; size?: [number, number]; tau?: [number, number, number]; world?: [number, number, number] } = {},
  ): void {
    this._watercolorPasses.fieldOp(out, a, b, mode, k, opts)
  }

  /** (#536, §17.44) The reveal's copies, pooled: a new tile-sized texture per
   *  tile at every pen-up, destroyed a second and a half later, was a GPU
   *  stall per tile on the tablet (the FBO status check). Linear, mip-able,
   *  like the tiles - see _revealWash on why not the ribbon pool. */
  private _revealPool: AccumulationBuffer[] = []
  private _revealPoolAcquire(w: number, h: number): AccumulationBuffer {
    const i = this._revealPool.findIndex(b => b.width === w && b.height === h)
    if (i >= 0) return this._revealPool.splice(i, 1)[0]
    return new AccumulationBuffer(this.gl, w, h, 'linear')
  }
  private _revealPoolRelease(buf: AccumulationBuffer): void {
    if (this._revealPool.length >= 8) { buf.destroy(); return }
    this._revealPool.push(buf)
  }

  /** Follow calculated targets continuously; do not replace the visible
   * copy when a solver stage or a paused animation frame finishes. */
  private _advanceWashReveal(buffer: AccumulationBuffer, reveal: WashReveal, now: number): void {
    if (!reveal.progressive) return
    const dt = now - (reveal.frameAt ?? now)
    reveal.frameAt = now
    const target = reveal.startedAt === null ? reveal.pending : buffer
    if (!target) return
    const remaining = reveal.startedAt === null ? null : (reveal.durationMs ?? 8000) - (now - reveal.startedAt)
    const step = washRevealStep(dt, remaining)
    if (!(step > 0)) return
    const out = this._revealPoolAcquire(buffer.width, buffer.height)
    out.beginReplaceDraw()
    const gl = this.gl, u = this._revealUni
    gl.useProgram(this._revealProg)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._revealPosLoc)
    gl.vertexAttribPointer(this._revealPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, target.texture)
    gl.uniform1i(u.u_after, 0)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, reveal.before.texture)
    gl.uniform1i(u.u_before, 1)
    gl.uniform1f(u.u_hold, 1 - step); gl.uniform1f(u.u_opacity, 1)
    this._setRevealMotion(undefined, now)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    out.endDraw()
    gl.activeTexture(gl.TEXTURE0)
    this._revealPoolRelease(reveal.before)
    reveal.before = out
  }

  /** Bounded visual motion only: canonical content never samples these. */
  private _revealMotionGain(reveal: WashReveal, now: number): number {
    if (!reveal.wetMask || reveal.motionAt === undefined) return 0
    const onset = Math.min(1, Math.max(0, now - reveal.motionAt) / 250)
    return onset * this._revealMotionTail(reveal, now)
  }

  private _revealMotionTail(reveal: WashReveal, now: number): number {
    const tail = reveal.startedAt === null ? 1 : Math.max(0, 1 - (now - reveal.startedAt) / (reveal.durationMs ?? 8000))
    return tail * tail * (reveal.motionBaseGain ?? 1)
  }

  private _setRevealMotion(reveal: WashReveal | undefined, now: number): void {
    const gl = this.gl, u = this._revealUni
    const gain = reveal ? this._revealMotionGain(reveal, now) : 0
    gl.uniform1f(u.u_motionGain, gain)
    gl.uniform1i(u.u_wetMask, 0) // disabled sampler must not alias a recycled output FBO
    if (gain > 0 && reveal?.wetMask) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, reveal.wetMask.texture)
      gl.uniform1i(u.u_wetMask, 2)
      gl.uniform2f(u.u_texel, 1 / reveal.before.width, 1 / reveal.before.height)
      gl.uniform2f(u.u_motionOrigin, ...(reveal.motionOrigin ?? [0, 0]))
      gl.uniform1f(u.u_motionAge, now - (reveal.motionAt ?? now))
    }
    gl.activeTexture(gl.TEXTURE0)
  }

  /** Drops every reveal that has run out, or whose layer is gone. */
  private _sweepReveals(now: number, goneLayerId: string | null = null): void {
    for (const [buffer, reveal] of this._washReveals) {
      if (reveal.layerId !== goneLayerId) this._advanceWashReveal(buffer, reveal, now)
      if (reveal.layerId !== goneLayerId && this._revealHold(reveal, now) > 0) continue
      this._revealPoolRelease(reveal.before)
      if (reveal.pending) this._revealPoolRelease(reveal.pending)
      if (reveal.wetMask) this._revealPoolRelease(reveal.wetMask)
      this._washReveals.delete(buffer)
    }
  }

  /** _drawTileComposite for a tile that is still converging on a settled
   *  wash: same rect, same blend, but the tile's pixels are mixed with the
   *  kept picture by the reveal's current hold. */
  private _drawTileReveal(
    frame: CameraFrame, reveal: WashReveal, texture: WebGLTexture, originX: number, originY: number, bw: number, bh: number,
    opacity: number, targetFbo: WebGLFramebuffer, targetW: number, targetH: number, minifying: boolean,
  ): void {
    const { gl } = this
    // Sampled exactly as the tile is — see _revealWash on why the copy is
    // mip-capable at all.
    reveal.before.setMipSampling(minifying && reveal.before.ensureMipmaps())
    const leftEdge   = frameEdgeX(frame, originX)
    const rightEdge  = frameEdgeX(frame, originX + bw)
    const topEdge    = frameEdgeY(frame, originY)
    const bottomEdge = frameEdgeY(frame, originY + bh)

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo)
    gl.viewport(leftEdge, targetH - bottomEdge, rightEdge - leftEdge, bottomEdge - topEdge)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this._revealProg)
    const u = this._revealUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._revealPosLoc)
    gl.vertexAttribPointer(this._revealPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, reveal.startedAt === null ? reveal.pending?.texture ?? texture : texture)
    gl.uniform1i(u.u_after, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, reveal.before.texture)
    gl.uniform1i(u.u_before, 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(u.u_hold, this._revealHold(reveal, performance.now()))
    gl.uniform1f(u.u_opacity, opacity)
    this._setRevealMotion(reveal, performance.now())
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.disable(gl.BLEND)
    gl.viewport(0, 0, targetW, targetH)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
  private _diffuseWashOps(
    scratch: RibbonStrokeScratch, targets: PaintTarget[],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    /** (#536, §17.23) How strongly this operation blooms the wash under it,
     *  0..1 — watercolorBloomStrength of the paper wetness it recorded. */
    bloom = 0,
    /** The mark's radius, px: sets the rim's share and the reach of the
     *  gathering kernel — the whole interior feeds the rim, not just its
     *  neighbourhood. */
    radiusPx = 16,
    /** (§17.24) The brush's water and the wetness the mark landed in — how
     *  far its water runs past the footprint (watercolorSpreadBudget) — and
     *  the standing water the extended domain records. */
    water = 1, landedWet = 0, standing = 1,
    /** (§17.25) The wettest paper the mark ran over: how far its water
     *  joined an earlier mark's puddle (watercolorPuddleMerge). */
    wetPeak = 0,
    /** (§17.37) How long the brush stood on landing, ms: the strength of
     *  the line where its landing puddle's front met the film. */
    dwellMs = 0,
    preview?: WatercolorSettlePreview,
    finishMetadata?: RibbonCanonicalFinish,
    presentationOwnerLocked = false,
  ): { ops: Array<() => void>; finish: () => void; dispose: () => void; compositeDomain: { minX: number; minY: number; maxX: number; maxY: number } } | null {
    let skipContacts = false
    if (this._wcZeroPigmentContacts && scratch.pigmentInputsKnownZero) {
      const layerId = [...this._layers].find(([, layer]) => layer === (finishMetadata?.finish ?? scratch.finishContext)?.target)?.[0]
      skipContacts = !!layerId && pureWaterLayerProof(this._log.entries, layerId, this._snapshots.hasCoverage(layerId),
        this._strokeLayerId === layerId && (this._strokeTool !== 'watercolor' || watercolorMixFromPreset(this._opts.pencilType).pigment > 0))
    }
    return this._settlePlan.prepare(scratch, targets, bounds, bloom, radiusPx, water, landedWet, standing, wetPeak, dwellMs, preview, skipContacts, finishMetadata ? { ...finishMetadata, dryCtx: scratch.dryCtx } : undefined, presentationOwnerLocked)
  }
  private _groupTideOps(
    ops: Array<() => void>, field: SettleField, x0: number, y0: number,
    radiusPx: number, standing: number, paints: ReadonlySet<string>,
    dep: AccumulationBuffer, col: AccumulationBuffer | null, outDep: AccumulationBuffer, outCol: AccumulationBuffer,
    free: [AccumulationBuffer, AccumulationBuffer, AccumulationBuffer],
    /** (§17.44) World px per field cell; radiusPx is in cells already. */
    scale = 1,
  ): void {
    this._settlePlan.groupTideOps(ops, field, x0, y0, radiusPx, standing, paints, dep, col, outDep, outCol, free, scale)
  }

  /** (#536, §17.42) The group-dry oracle's second half: every open wash —
   *  the author's and the replayed ones — dries as ONE component. The tide
   *  is laid once, along the outer contour of the wash's whole coverage (the
   *  union of every operation's domain), out of all the paint inside, and
   *  the tiles keep the result as their settled deposit. Synchronous: this
   *  is a dev probe run by the rig after a replay, not a frame's work. */
  watercolorDryWash(): number {
    if (this._settle) this._completeSettle()
    const scratches = new Set<RibbonStrokeScratch>()
    if (this._wash) scratches.add(this._wash.scratch)
    for (const chunk of this._replayRibbonChunks.values()) scratches.add(chunk.scratch)
    let dried = 0
    for (const scratch of scratches) if (this._dryWashScratch(scratch)) dried++
    if (dried) {
      this._scheduleFieldRelease()
      this._displayIfNotSuspended()
    }
    return dried
  }

  setUnpaintedInBatch(ids: ReadonlySet<string> | null): void {
    this._unpaintedInBatch = ids && ids.size ? ids : null
    if (!ids) this._skippedInBatch.clear()
  }

  watercolorDryAll(): void {
    if (this._wcAsyncFinish && this._wcCanonical.pending) for (const scratch of this._wcAsyncOwners.keys()) this._wcAsyncDryTo.set(scratch, scratch.gesture)
    // (§17.48) The open wash closes exactly as it does when it times out: the
    // next stroke cannot join it and starts its own. Its buffers stay until
    // then, so a settle still in flight lands as it would have. Mid-stroke (a
    // peer's paper_dry arriving while this user draws) the stroke in hand
    // keeps its wash; the wash closes at its pen-up. Its later batches read
    // the paper dry and record it so - which is what a replay reads too.
    if (this._strokeLayerId) this._dryAtPenUp = true
    else if (this._wash) this._wash.endedAt = -Infinity
    const now = performance.now()
    this._sweepReveals(now)
    for (const reveal of this._washReveals.values()) if (reveal.progressive) {
      reveal.motionBaseGain = this._revealMotionTail(reveal, now)
      reveal.durationMs = 2000
      if (reveal.startedAt !== null) reveal.startedAt = now
      reveal.frameAt = now
    }
    this._paperWet.clear()
    // The sheen goes with it: the wet map is rebuilt on the next frame, not
    // after the overlay's own throttle, and the whole paper recomposes.
    this._wetTexAt = 0
    this._paperPartialOK = false
    this._displayIfNotSuspended()
  }

  private _dryWashScratch(scratch: RibbonStrokeScratch): boolean {
    const ctx = scratch.dryCtx
    if (!ctx || !scratch.live) return false
    const { target, preset, profile, color, opacity, fieldSeed, radiusPx, standing } = ctx
    // The tide's band and its gathering kernel reach about a radius from the
    // contour; the field takes the wash's bounds plus that.
    const width = Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5)))
    const pad = Math.ceil(radiusPx) + width + 2 + 4
    const bounds = { minX: ctx.bounds.minX - pad, minY: ctx.bounds.minY - pad, maxX: ctx.bounds.maxX + pad, maxY: ctx.bounds.maxY + pad }
    const targets = this._resolveWithinSheet(target, this._wcSheetClamp(bounds))
    const tiles = targets.filter(t => scratch.peek(t.buffer)?.inkLoad)
    if (!tiles.length) return false
    const CAP = 1536
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const t of tiles) {
      minX = Math.min(minX, t.originX); minY = Math.min(minY, t.originY)
      maxX = Math.max(maxX, t.originX + t.buffer.width); maxY = Math.max(maxY, t.originY + t.buffer.height)
    }
    let x0 = Math.max(minX, Math.floor(bounds.minX)), y0 = Math.max(minY, Math.floor(bounds.minY))
    let x1 = Math.min(maxX, Math.ceil(bounds.maxX)), y1 = Math.min(maxY, Math.ceil(bounds.maxY))
    if (x1 - x0 > CAP) { const c = (x0 + x1) * 0.5; x0 = Math.floor(c - CAP / 2); x1 = x0 + CAP }
    if (y1 - y0 > CAP) { const c = (y0 + y1) * 0.5; y0 = Math.floor(c - CAP / 2); y1 = y0 + CAP }
    const w = x1 - x0, h = y1 - y0
    if (w <= 0 || h <= 0) return false
    const field = this._diffuseFieldFor(w, h)
    const overlaps: Array<{ tile: PaintTarget; ox0: number; oy0: number; ox1: number; oy1: number }> = []
    for (const tile of tiles) {
      const entry = scratch.peek(tile.buffer)
      if (!entry?.inkLoad) continue
      const ox0 = Math.max(x0, tile.originX), oy0 = Math.max(y0, tile.originY)
      const ox1 = Math.min(x1, tile.originX + tile.buffer.width), oy1 = Math.min(y1, tile.originY + tile.buffer.height)
      if (ox1 <= ox0 || oy1 <= oy0) continue
      overlaps.push({ tile, ox0, oy0, ox1, oy1 })
    }
    if (!overlaps.length) return false
    scratch.noteStorageBounds({ minX: x0, minY: y0, maxX: x1, maxY: y1 })
    const colour = scratch.paints.size > 1
    // Stitch: the deposit into a, the coverage, the colour record into ca.
    field.a.clear(); field.coverage.clear(); field.ca.clear()
    for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
      const entry = scratch.peek(tile.buffer)
      if (!entry?.inkLoad) continue
      const sx = ox0 - tile.originX, sy = tile.buffer.height - (oy1 - tile.originY)
      const dx = ox0 - x0, dy = field.h - (oy1 - y0)
      entry.inkLoad.copyRegionInto(field.a, sx, sy, dx, dy, ox1 - ox0, oy1 - oy0)
      entry.coverage.copyRegionInto(field.coverage, sx, sy, dx, dy, ox1 - ox0, oy1 - oy0)
      if (colour && entry.inkColor) entry.inkColor.copyRegionInto(field.ca, sx, sy, dx, dy, ox1 - ox0, oy1 - oy0)
    }
    const ops: Array<() => void> = []
    this._groupTideOps(ops, field, x0, y0, radiusPx, standing, scratch.paints, field.a, colour ? field.ca : null, field.c, field.cc, [field.b, field.cb, field.pressure])
    for (const op of ops) op()
    const dep = field.c, col = field.cc
    // Home: the dried deposit is the tiles' deposit, their settled record and
    // their dry target all three - the wash is dry - and the composite is
    // redrawn over the wash's bounds.
    for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
      const entry = scratch.peek(tile.buffer)
      if (!entry?.inkLoad) continue
      const sx = ox0 - x0, sy = field.h - (oy1 - y0)
      const dx = ox0 - tile.originX, dy = tile.buffer.height - (oy1 - tile.originY)
      for (const to of [entry.inkLoad, entry.inkSettled, entry.inkDry]) if (to) dep.copyRegionInto(to, sx, sy, dx, dy, ox1 - ox0, oy1 - oy0)
      for (const to of [entry.inkColor, entry.colorSettled, entry.colorDry]) if (to) col.copyRegionInto(to, sx, sy, dx, dy, ox1 - ox0, oy1 - oy0)
    }
    const { spreadPx, water, migratePx, bristleRadiusPx } = scratch.compositeScalars(
      () => ({ spreadPx: 0, inkSmoothPx: 0, water: 0, migratePx: 0, fieldSeed: [0, 0] as [number, number], bristleRadiusPx: 0 }),
    )
    const dir = scratch.noteDirection(0, 0)
    for (const tile of targets) {
      const entry = scratch.peek(tile.buffer)
      if (!entry) continue
      this._drawRibbonCompositeRect(
        tile, bounds, preset, profile, entry.original, entry.coverage, entry.inkLoad, entry.inkColor, color, opacity,
        fieldSeed, spreadPx, water, migratePx, 0, dir, bristleRadiusPx,
      )
    }
    target.markContentPainted(bounds)
    return true
  }

  /** (#536, §17.22) Composites the live gesture's rects gathered since the
   *  last frame — the union per tile, each with the reveal's keep-fresh
   *  around it, exactly as a batch used to. Runs at the top of _display, and
   *  before anything that needs the tile up to date (pen-up's settle). */
  private _flushLiveComposite(): void {
    const lc = this._liveComposite
    if (!lc) return
    const { scratch } = lc
    if (scratch.pendingComposite.size === 0 || !scratch.live) { scratch.pendingComposite.clear(); this._liveComposite = null; return }
    for (const { tile, bounds } of scratch.pendingComposite.values()) {
      const entry = scratch.peek(tile.buffer)
      if (!entry) continue
      const revealPrev = this._revealBeforeBatch(tile, bounds)
      this._drawRibbonCompositeRect(
        tile, bounds, lc.preset, lc.profile, entry.original, entry.coverage, entry.inkLoad, entry.inkColor, lc.color, lc.opacity,
        lc.fieldSeed, lc.spreadPx, lc.fringeWater, lc.migratePx, lc.inkSmoothPx, lc.strokeDir, lc.bristleRadiusPx,
      )
      this._revealAfterBatch(tile, bounds, revealPrev)
    }
    scratch.pendingComposite.clear()
    this._liveComposite = null
  }
  /** (§17.46) The adaptive settle tick's clock - see _tickSettle. */
  /** (§17.49) See setUnpaintedInBatch. */
  private _unpaintedInBatch: ReadonlySet<string> | null = null
  private _skippedInBatch = new Set<string>()
  /** (§17.48) A paper_dry arrived mid-stroke: close the wash at pen-up. */
  private _dryAtPenUp = false
  private _startSettle(scratch: RibbonStrokeScratch, ops: Array<() => void>, complete: () => void, lifecycle?: WatercolorSettleLifecycle): void {
    this._settleQueue.start(scratch, ops, complete, lifecycle)
  }
  private _advanceSettle(): void {
    this._settleQueue.advance()
  }
  private _completeSettle(): void {
    this._settleQueue.complete()
  }

  /** (#536, §17.22) The diffusion field is freed WET_FIELD_RELEASE_MS after
   *  the last settle landed; the next settle simply allocates it again. */
  private _scheduleFieldRelease(): void {
    if (this._fieldReleaseTimer) clearTimeout(this._fieldReleaseTimer)
    this._scheduleBudgetCheck()
    // (§17.57) Past the device's budget the field goes now, not in 45 s.
    if (this._enforceGpuBudget()) return
    this._fieldReleaseTimer = setTimeout(() => {
      this._fieldReleaseTimer = 0
      if (this._settle) return
      for (const f of this._fieldCache) destroyField(f)
      this._fieldCache = []
    }, WET_FIELD_RELEASE_MS) as unknown as number
  }

  /** (#536, §17.68) The budget checked once more a second after the washes
   *  go quiet. The check at a settle's end finds the wash it just settled
   *  still busy, and a peer's next operation grows the cache after it: on
   *  the iPad four resting washes sat at 472 MB against a 400 MB budget with
   *  nothing left to call it. */
  private _budgetTimer = 0
  /** (§17.68) performance.now() of the last watercolour paint or settle step. */
  private _washActiveAt = 0
  private _scheduleBudgetCheck(): void {
    if (this._gpuBudget === Infinity) return
    if (this._budgetTimer) clearTimeout(this._budgetTimer)
    this._budgetTimer = setTimeout(() => {
      this._budgetTimer = 0
      if (this._destroyed || this._contextLost) return
      if ((this._settle || this._strokeLayerId) && !this._overHardCeiling()) { this._scheduleBudgetCheck(); return }
      this._enforceGpuBudget()
    }, 1000) as unknown as number
  }

  /** (§17.68) Nobody has painted watercolour or settled any for a while. The
   *  budget's spill reads a wash back and its next stroke uploads it again -
   *  hundreds of megabytes across to the GPU process each way. Both of the
   *  iPad's lost tabs died right there, a spill and its wash's unspill 50-70 ms
   *  apart in the middle of four people painting (flight recorder, vyIPuYyi,
   *  en2iozvm); twelve round trips in a quiet room cost it nothing. */
  private _washesQuiet(): boolean {
    return performance.now() - this._washActiveAt >= WASH_QUIET_MS
  }

  /** (#536, §17.57) What the watercolour holds on the GPU beyond the layers
   *  themselves: the washes' scratch (live and pooled), the settle field, and
   *  the washes carried by checkpoints. */
  private _washGpuBytes(): number {
    const pool = this._ribbonScratchPool.bytes
    let carried = 0
    for (const cp of this._checkpoints.all()) {
      for (const w of (cp.washes as CarriedWash[] | undefined) ?? []) carried += scratchSnapshotBytes(w.snap)
    }
    const field = this._fieldCache.reduce((n, f) => n + f.w * f.h * 4 * 10, 0)
    return pool.live + pool.free + field + carried
  }

  /** (#536, §17.57) Brings the watercolour's GPU memory under the device's
   *  budget with what costs nothing in the picture, cheapest first: the
   *  pool's idle buffers, the settle field (remade at the next settle, a
   *  ~100 ms hitch), the washes carried by checkpoints (an undo then replays
   *  further). What the open washes themselves hold is the one part it cannot
   *  touch. True when anything was freed. The iPad's Safari kills the tab
   *  near 600 MB of it (multitest, CJoiem15, r30) - with no warning and no
   *  event, so this has to be kept under rather than recovered from. */
  private _enforceGpuBudget(): boolean {
    if (this._washGpuBytes() <= this._gpuBudget) return false
    // (§17.70) The pool's idle buffers and the field are not let go while
    // watercolour is being painted: the next stroke only makes them again, and
    // making a tile's buffer is up to a second on the iPad once its memory is
    // full (922 of them in one rebuild, 46 s). The pool keeps at most
    // SCRATCH_POOL_FREE_BYTES idle anyway.
    // (§17.73) Past the hard ceiling these courtesies, and the ones in the
    // spill below, give way: four people painting kept every wash "recently
    // used" and a settle always in flight, the budget never acted, and the
    // iPad died at 474 MB of washes.
    const hard = this._overHardCeiling()
    const idle = hard || performance.now() - this._washActiveAt >= SPILL_IDLE_MS
    if (idle) this._ribbonScratchPool.trimFree()
    if (this._washGpuBytes() > this._gpuBudget && !this._settle && this._fieldCache.length && idle) {
      if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }
      for (const f of this._fieldCache) destroyField(f)
      this._fieldCache = []
    }
    if (this._washGpuBytes() > this._gpuBudget) {
      for (const cp of [...this._checkpoints.all()]) if (cp.washes) this._checkpoints.remove(cp)
    }
    // (§17.68) ...and last, the open washes of others that are resting, least
    // recently painted first, down to four fifths of the budget so the next
    // settle does not bring it straight back. Spilled, not dropped: the next
    // stroke restores its GPU state, bit for bit. If no compact state fits,
    // recover from the journal. Only in a
    // quiet room - see _washesQuiet; the timer comes back until it is one.
    // (§17.73) Not from inside a rebuild's step: the cache in hand is then
    // the job's, and its washes spilled into the one table the live ones use,
    // keyed by wash alone - a job's copy and the live copy of one wash could
    // take each other's place. Seen as the iPad's live picture drifting from
    // everyone else's until a reload, once the hard ceiling let it spill
    // washes just painted.
    if (this._washGpuBytes() > this._gpuBudget && !this._inJobStep) {
      // (§17.69) One wash a check while the room is busy - the check comes
      // back a second later - and as many as it takes in a quiet one.
      const quiet = this._washesQuiet()
      let spilled = 0
      for (const [key, c] of [...this._replayRibbonChunks]) {
        if (this._washGpuBytes() <= this._gpuBudget * 0.8) break
        if (!quiet && spilled >= 1) { this._scheduleBudgetCheck(); break }
        if (c.scratch === this._settle?.scratch || c.scratch.diffusePending) continue
        // Not a wash painted into in the last few seconds: its author is
        // mid-session, the next operation would bring it straight back, and
        // on the iPad the round trip was 214 ms of spill and an unspill 51 ms
        // later (flight recorder, vyIPuYyi).
        if (!hard && performance.now() - (c.usedAt ?? 0) < SPILL_IDLE_MS) continue
        const author = this._chunkAuthors.get(key)
        if (!hard && author && [...this._peerLiveStrokes.values()].some(l => l.peerId === author)) continue
        // (§17.70) A wash of a layer being rebuilt is thrown away at the swap,
        // its rebuilt twin taking its place: reading it back first (up to
        // 1.4 s on the iPad) bought nothing.
        if (this._rebuildTargets().has(c.target)) continue
        // (§17.70) Over several frames, one wash at a time; the next check
        // comes when it lands.
        // (§17.73) Over the hard ceiling at once: a wash busy enough to have
        // kept it there would abandon a spill spread over frames every time.
        if (hard || this._spillJob || typeof setTimeout !== 'function') {
          if (hard || !this._spillJob) { this._evictChunk(key, true); this._ribbonScratchPool.trimFree(); spilled++; continue }
          break
        }
        this._startSpill(key)
        break
      }
    }
    return true
  }

  /** (§17.73) Watercolour's GPU memory past GPU_HARD_CEILING of the budget. */
  private _overHardCeiling(): boolean {
    return this._gpuBudget !== Infinity && this._washGpuBytes() > this._gpuBudget * GPU_HARD_CEILING
  }
  private _cancelSettle(): void {
    this._settleQueue.cancel()
    this._wcCanonical.cancel(this._contextLost || this.gl.isContextLost())
    this._clearAsyncPresentations(this._contextLost || this.gl.isContextLost())
  }

  /** The diffusion's stitched field, at least `w` × `h`.
   *
   *  (§17.70) Always the one size, WC_FIELD_PX square: it used to grow and
   *  shrink with each wash in steps of 256, and nearly every stroke of a room
   *  with several people in it asked for a different one - ten textures of up
   *  to 9 MB freed and made again, 0.5-1.3 s each on the iPad once its memory
   *  is full (the same allocation on an idle page: 4-48 ms). The passes over
   *  it are cheap by comparison. The wash sits in the top-left corner as
   *  before; what changed is only that it now always has empty paper to its
   *  right and below, where it used to meet the texture's clamped edge
   *  whenever its span was a multiple of 256. */
  private _diffuseFieldFor(w: number, h: number): SettleField {
    // A settle still spread over frames works in the field it was handed:
    // it lands first, before the field is cleared or replaced under it.
    if (this._settle) this._completeSettle()
    const need = (n: number): number => Math.max(WC_FIELD_PX, Math.ceil(n / 256) * 256)
    const W = need(w), H = need(h)
    // (#536, ADR 011 §17.49) EXACTLY this settle's size, never a larger field
    // left by an earlier one. The passes step by the texture's own texel and
    // spread up to its edge, so the same operation settled differently in a
    // fresh field (a load) and in a big used one (an undo's rebuild, the
    // author's own session): on Ilya's H_mYrMTv an undo changed the whole
    // sky. Same size and handed out clean, a settle depends on its own
    // inputs alone. (Scissoring one big field to the settle's extent was
    // tried and still differed - the dependence is not only at the edge.)
    // (§17.70) That now holds by every client using the one size, handed out
    // clean. Scissoring the passes to the wash's corner of it was tried
    // again: cheaper, but the fields with a non-zero background met the
    // scissor's edge as a wall, and the front ran in from it (up to 127
    // levels off, along a straight line).
    const cur = this._fieldCache[0]
    if (cur && cur.w === W && cur.h === H) {
      for (const b of [cur.a, cur.b, cur.c, cur.coverage, cur.ca, cur.cb, cur.cc, cur.mask, cur.pressure, cur.band]) b.clear()
      return cur
    }
    if (cur) destroyField(cur)
    this._fieldCache = []
    const { gl } = this
    const field = {
      w: W, h: H,
      a: new AccumulationBuffer(gl, W, H, 'nearest'),
      b: new AccumulationBuffer(gl, W, H, 'nearest'),
      c: new AccumulationBuffer(gl, W, H, 'nearest'),
      coverage: new AccumulationBuffer(gl, W, H, 'nearest'),
      ca: new AccumulationBuffer(gl, W, H, 'nearest'),
      cb: new AccumulationBuffer(gl, W, H, 'nearest'),
      cc: new AccumulationBuffer(gl, W, H, 'nearest'),
      // (#536, §17.23) The operation's footprint and the pressure dome over
      // it, for the bloom and the tideline. Linear: the dome is read at
      // warped positions.
      mask: new AccumulationBuffer(gl, W, H, 'linear'),
      pressure: new AccumulationBuffer(gl, W, H, 'linear'),
      band: new AccumulationBuffer(gl, W, H, 'nearest'),
    }
    this._fieldCache.push(field)
    return field
  }

  private _holdAsyncScratch(scratch: RibbonStrokeScratch): void {
    this._wcAsyncOwners.set(scratch, (this._wcAsyncOwners.get(scratch) ?? 0) + 1)
  }
  private _releaseAsyncScratch(scratch: RibbonStrokeScratch, lost: boolean): void {
    const next = (this._wcAsyncOwners.get(scratch) ?? 1) - 1
    if (next > 0) { this._wcAsyncOwners.set(scratch, next); return }
    this._wcAsyncOwners.delete(scratch)
    this._wcAsyncDryTo.delete(scratch)
    if (scratch !== this._wash?.scratch && scratch !== this._ribbonStrokeScratch) {
      if (lost) scratch.forget(); else scratch.destroy()
    }
  }
  private _retireAsyncScratch(scratch: RibbonStrokeScratch | undefined): void {
    if (scratch && !this._wcAsyncOwners.has(scratch)) scratch.destroy()
  }
  private _asyncLocalPreviewTiles(): ReadonlyMap<string, readonly { buffer: AccumulationBuffer; originX: number; originY: number }[]> {
    const result = new Map<string, readonly { buffer: AccumulationBuffer; originX: number; originY: number }[]>()
    for (const held of this._wcAsyncLocalTools.values()) for (const [id, layer] of held.layers) {
      const tiles = new Map((result.get(id) ?? []).map(t => [`${t.originX},${t.originY}`, t]))
      for (const tile of layer.buffer.allResident()) tiles.set(`${tile.originX},${tile.originY}`, tile)
      result.set(id, [...tiles.values()])
    }
    return result
  }
  private _releaseAsyncLocalTool(id: string, lost: boolean): void {
    const held = this._wcAsyncLocalTools.get(id)
    if (!held) return
    this._wcAsyncLocalTools.delete(id)
    this._smudge.releaseGesture(this._userId + ':async-preview', id + ':preview', lost)
    for (const layer of held.layers.values()) {
      if (!lost) layer.buffer.destroy()
      if (lost) layer.scratch.forget(); else layer.scratch.destroy()
    }
    this._invalidateSplitCache()
    this._scheduleDisplay()
  }
  private _queueAsyncLocalToolOp(op: Operation & { type: 'stroke' }, id: string): void {
    const held = this._wcAsyncLocalTools.get(id)
    if (!held) return
    const immutable = structuredClone(op), owner = this
    held.queued++
    this._wcCanonical.enqueue({ execute: function* () {
      // The operation is already in the journal and already dispatched once.
      const entry = owner._log.entries.find(e => e.op.id === immutable.id)
      const layer = owner._layers.get(immutable.layerId)
      if (entry?.state === 'done' && layer) {
        owner._applyPixelOp(layer, immutable.layerId, immutable)
        owner._snapshots.markDirty(immutable.layerId)
        owner._invalidateSplitCache()
      }
      held.queued--
      if (held.ended && !held.queued) owner._releaseAsyncLocalTool(id, false)
      owner._scheduleDisplay()
    }, cancel: lost => owner._releaseAsyncLocalTool(id, lost) })
  }
  private _resolveAsyncLocalTargets(id: string, layerId: string, buffer: ILayerBuffer, rect: WorldRect): PaintTarget[] {
    const held = this._wcAsyncLocalTools.get(id), layer = held?.layers.get(layerId)
    const canonical = this._layers.get(layerId)
    if (!held || !layer || !canonical || this._contextLost || this.gl.isContextLost()) return []
    const { w, h } = this._tileSize(), cells = tilesOverlappingRect(rect, w, h)
    let used = 0
    for (const owner of this._wcAsyncLocalTools.values()) for (const clone of owner.layers.values()) used += clone.copied.size * w * h * 4 * 8
    for (const films of this._wcAsyncPresentations.values()) for (const film of films.values()) used += film.buf.width * film.buf.height * 4
    for (const peer of this._wcAsyncPeerStreams.values()) if (peer.buf) used += peer.buf.width * peer.buf.height * 4
    const missing = cells.filter(c => !layer.copied.has(`${c.tileX},${c.tileY}`)).length
    // Conservative allowance includes up to eight ribbon buffers per tile.
    // Reaching the presentation cap never drops logical dabs or forces a drain.
    if (used + missing * w * h * 4 * 8 > 64 * 1024 * 1024) return []
    for (const c of cells) {
      const key = `${c.tileX},${c.tileY}`
      if (layer.copied.has(key)) continue
      const tileRect = tileWorldRect(c.tileX, c.tileY, w, h)
      const target = buffer.resolveForPaint(tileRect)[0]
      const previous = [...this._wcAsyncLocalTools.values()].filter(owner => owner !== held).reverse().map(owner => owner.layers.get(layerId)?.buffer.resolveVisible(tileRect).find(t => t.originX === tileRect.minX && t.originY === tileRect.minY)).find(Boolean)
      const source = previous ?? canonical.resolveVisible(tileRect).find(t => t.originX === tileRect.minX && t.originY === tileRect.minY)
      if (source) source.buffer.copyTo(target.buffer)
      layer.copied.add(key)
    }
    return buffer.resolveForPaint(rect)
  }
  private _paintAsyncLocalTool(layerId: string, dabs: Dab[], tool: ToolType, preset: string, color: [number, number, number], prev?: Dab): void {
    const id = this._wcAsyncLocalStroke!, held = this._wcAsyncLocalTools.get(id)
    const canonical = this._layers.get(layerId)
    if (!held || !canonical || this._contextLost || this.gl.isContextLost()) return
    let layer = held.layers.get(layerId)
    if (!layer) {
      const profile = ribbonProfileFor(tool, preset), real = this._makeLayerBuffer(), owner = this
      // Intercept the painter's real patch rect, including smudge's pickup
      // margin. Never allocate or read back a canonical target on this route.
      const buffer = new Proxy(real, { get(target, key) {
        if (key === 'resolveForPaint') return (rect: WorldRect) => owner._resolveAsyncLocalTargets(id, layerId, real, rect)
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      } })
      layer = { buffer, copied: new Set(), scratch: new RibbonStrokeScratch(this._ribbonScratchPool, profile.ink, profile.normalizeDeposit) }
      held.layers.set(layerId, layer)
    }
    this._paintDabs(layer.buffer, dabs, tool, preset, color, this._userId + ':async-preview', prev, layer.scratch, id + ':preview')
    this._invalidateSplitCache()
    this._scheduleDisplay()
  }

  /** Provisional stamps are presentation only. The actual source commands
   * are queued separately and never sample this buffer. */
  private _showAsyncPresentation(scratch: RibbonStrokeScratch, gesture: number, dabs: readonly Dab[], preset: string, color: [number, number, number]): object | null {
    const bytes = this.canvas.width * this.canvas.height * 4
    let used = 0
    for (const films of this._wcAsyncPresentations.values()) for (const held of films.values()) used += held.buf.width * held.buf.height * 4
    for (const held of this._wcAsyncPeerStreams.values()) if (held.buf) used += held.buf.width * held.buf.height * 4
    let films = this._wcAsyncPresentations.get(scratch)
    if (!films) { films = new Map(); this._wcAsyncPresentations.set(scratch, films) }
    let held = films.get(gesture)
    if (!held) {
      if (used + bytes > 64 * 1024 * 1024) {
        if (!films.size) this._wcAsyncPresentations.delete(scratch)
        return null
      }
      const buf = new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height)
      buf.clear()
      held = { buf, origin: this._cameraCenteredOrigin(), pending: new Map(), preset, color: [...color] }
      films.set(gesture, held)
    }
    const key = {}
    const waterOnly = watercolorMixFromPreset(preset).pigment <= 0
    const marks = dabs.map(d => ({ ...d, opacity: d.opacity * (waterOnly ? 0.12 : 0.5) }))
    held.pending.set(key, marks)
    this._stamps.paint(held.buf, this._translateDabs(marks, held.origin), 'watercolor', preset, waterOnly ? [0.5, 0.5, 0.5] : color)
    this._scheduleDisplay()
    return key
  }
  private _releaseAsyncPresentationItem(scratch: RibbonStrokeScratch, gesture: number, key: object | null, lost: boolean): void {
    const held = this._wcAsyncPresentations.get(scratch)?.get(gesture)
    if (!held || !key) return
    held.pending.delete(key)
    if (lost || !held.pending.size) { this._releaseAsyncPresentation(scratch, gesture, lost); return }
    held.buf.clear()
    const waterOnly = watercolorMixFromPreset(held.preset).pigment <= 0
    for (const marks of held.pending.values()) this._stamps.paint(held.buf, this._translateDabs(marks, held.origin), 'watercolor', held.preset, waterOnly ? [0.5, 0.5, 0.5] : held.color)
  }
  private _releaseAsyncPresentation(scratch: RibbonStrokeScratch, gesture: number, lost: boolean): void {
    const films = this._wcAsyncPresentations.get(scratch), held = films?.get(gesture)
    if (!held) return
    films!.delete(gesture)
    if (!films!.size) this._wcAsyncPresentations.delete(scratch)
    if (!lost) held.buf.destroy()
  }
  /** Unrecorded foreign live packets must not drain the canonical solver.
   * Their original watermark advances only after queued physical execution. */
  private _advanceAsyncCanonical(work: Generator<number, void, void>, current: () => boolean): IteratorResult<number, void> {
    const start = performance.now()
    let step: IteratorResult<number, void>
    do {
      step = work.next()
      // Loss can synchronously cancel the request from inside a continuation.
      // Never fence a dead context or keep using a cancelled generator.
      if (!current() || this._contextLost || this.gl.isContextLost()) return step
      this.gl.finish()
      // A finish continuation may have started a solver. Its next step waits
      // for that solver, so only the ordinary settle scheduler may resume it.
      if (step.done || this._settle) return step
    } while (performance.now() - start < this._sliceLimits.budgetMs)
    return step
  }

  private _queueAsyncPeerLive(peerId: string, packet: PeerLivePacket): boolean {
    const key = liveStrokeKey(peerId, packet.strokeId, packet.layerId)
    let held = this._wcAsyncPeerStreams.get(key)
    const live = this._peerLiveStrokes.get(key)
    if (!held) {
      // Unknown/gapped streams take the existing CPU-only desync path.
      if (live?.desynced || packet.packetSeq !== (live?.nextPacketSeq ?? 0)) return false
      let bytes = 0
      for (const films of this._wcAsyncPresentations.values()) for (const h of films.values()) bytes += h.buf.width * h.buf.height * 4
      for (const h of this._wcAsyncPeerStreams.values()) if (h.buf) bytes += h.buf.width * h.buf.height * 4
      const requested = this.canvas.width * this.canvas.height * 4
      const buf = bytes + requested <= 64 * 1024 * 1024 ? new AccumulationBuffer(this.gl, this.canvas.width, this.canvas.height) : null
      buf?.clear()
      held = { peerId, strokeId: packet.strokeId, layerId: packet.layerId, nextPacketSeq: packet.packetSeq,
        ended: false, cancelled: false, buf, origin: this._cameraCenteredOrigin(), pending: new Map() }
      this._wcAsyncPeerStreams.set(key, held)
    }
    if (held.cancelled || packet.packetSeq !== held.nextPacketSeq) {
      held.cancelled = true
      held.buf?.destroy(); held.buf = null
      this._scheduleDisplay()
      if (live) live.desynced = true
      return true
    }
    held.nextPacketSeq++
    const owned = structuredClone(packet), token = {}
    held.pending.set(token, owned)
    if (held.buf) this._stamps.paint(held.buf, this._translateDabs(owned.dabs, held.origin), owned.tool, owned.preset, owned.color)
    this._scheduleDisplay()
    const owner = this, state = held
    let released = false
    const release = (lost: boolean): void => {
      if (released) return
      released = true
      state.pending.delete(token)
      if (!state.pending.size) {
        if (state.buf && !lost) state.buf.destroy()
        state.buf = null
        if (owner._wcAsyncPeerStreams.get(key) === state) owner._wcAsyncPeerStreams.delete(key)
      } else if (state.buf && !lost && !state.cancelled) {
        state.buf.clear()
        for (const p of state.pending.values()) owner._stamps.paint(state.buf, owner._translateDabs(p.dabs, state.origin), p.tool, p.preset, p.color)
      }
      owner._scheduleDisplay()
    }
    this._wcCanonical.enqueue({ execute: function* () {
      if (!state.cancelled) {
        owner.appendPeerLiveDabs(peerId, owned, true)
        if (state.ended) { const physical = owner._peerLiveStrokes.get(key); if (physical) physical.ended = true }
      }
      release(false)
    }, cancel: lost => {
      state.cancelled = true
      const physical = owner._peerLiveStrokes.get(key)
      if (physical && physical.paintedTotal > physical.committedOffset) owner._unsettledLayers.add(physical.layerId)
      owner._peerLiveStrokes.delete(key)
      release(lost)
    } })
    return true
  }

  private _clearAsyncPresentations(lost: boolean): void {
    for (const id of [...this._wcAsyncLocalTools.keys()]) this._releaseAsyncLocalTool(id, lost)
    if (this._wcAsyncLocalStroke) {
      this._wcAsyncLocalStroke = null
      this._strokeLayerId = null; this._strokeId = null; this._strokeDabs = []
    }
    for (const held of this._wcAsyncPeerStreams.values()) {
      if (held.buf && !lost) held.buf.destroy()
      held.buf = null
    }
    for (const [scratch, films] of this._wcAsyncPresentations) for (const gesture of [...films.keys()]) this._releaseAsyncPresentation(scratch, gesture, lost)
  }

  private _finishRibbonStroke(
    scratch: RibbonStrokeScratch,
    /** (#536, §17.12) True for the author's own gesture: keep what the screen
     *  showed and converge on the settled picture over WC_REVEAL_MS. A replay
     *  settles silently — the picture it builds is already the dry target. */
    reveal = false,
    /** (§17.44) Whether the settle is spread over frames under a REVEAL (the
     *  fade from the live picture to the settled one). A chunk boundary in
     *  the middle of a gesture spreads its settle but does not reveal: the
     *  brush is still painting there, and the fade redrew every tile of the
     *  chunk thirty times a second for a second and a half - 1555 draw
     *  calls on one zigzag on the tablet. The pen-up reveals the lot. */
    fade = reveal,
    /** (#536, §17.52) Spread over frames without a reveal: a peer's
     *  operation arriving live. The same computation as the synchronous
     *  replay, landed before anything else touches the wash or the field. */
    spread = false,
    /** Owned logical boundary, used only by the opt-in canonical FIFO. */
    owned?: RibbonCanonicalFinish,
  ): void {
    if (this._wcAsyncFinish && !owned && scratch === this._ribbonStrokeScratch) {
      const finish = scratch.captureCanonicalFinish()
      if (!finish) return
      if (this._dryAtPenUp) this._wcAsyncDryTo.set(scratch, finish.gesture)
      this._holdAsyncScratch(scratch)
      const owner = this
      let released = false
      const release = (lost: boolean): void => {
        if (released) return
        released = true
        owner._releaseAsyncScratch(scratch, lost)
      }
      this._wcCanonical.enqueue({
        execute: function* () {
          owner._finishRibbonStroke(scratch, reveal, fade, spread, finish)
          // Hold the physical owner until its solver really lands.
          while (owner._settle?.scratch === scratch) yield 0
          owner._releaseAsyncPresentation(scratch, finish.gesture, false)
          release(false)
        },
        cancel: lost => { owner._releaseAsyncPresentation(scratch, finish.gesture, lost); release(lost) },
      })
      return
    }
    // (#536, §17.22) Whatever the last batches left for the frame lands now,
    // for every ribbon tool: the marker's scratch is torn down right after
    // this, and for watercolor the settle below is spread over frames while
    // the tile must already show the whole mark.
    if (this._liveComposite?.scratch === scratch) this._flushLiveComposite()
    const ctx = owned?.finish ?? scratch.finishContext
    if (!ctx || !ctx.profile.normalizeDeposit) return
    // (§17.44) Which film this settle consumes - see releaseFilm.
    const settledGesture = owned?.gesture ?? scratch.gesture
    const { target, preset, profile, color, opacity, bounds, fieldSeed } = ctx
    const targets = this._resolveWithinSheet(target, profile.normalizeDeposit ? this._wcSheetClamp(bounds) : bounds)
    if (!targets.length) return
    if (reveal && fade) for (const tile of targets) this._revealWash(tile, target)
    // Own these copies, not a later reveal over the same tile. An older
    // settle may complete while this stroke is starting its next one.
    const revealCopies = reveal && fade ? targets.flatMap(tile => {
      const held = this._washReveals.get(tile.buffer)
      const entry = scratch.peek(tile.buffer)
      if (held && entry) {
        if (held.wetMask) this._revealPoolRelease(held.wetMask)
        held.wetMask = this._revealPoolAcquire(tile.buffer.width, tile.buffer.height)
        entry.coverage.copyTo(held.wetMask)
        held.progressive = true
        if (owned && owned.gesture <= (this._wcAsyncDryTo.get(scratch) ?? -1)) held.durationMs = 2000
        held.frameAt = held.motionAt = performance.now()
        held.motionOrigin = [tile.originX, tile.originY]
      }
      return held ? [{ buffer: tile.buffer, held }] : []
    }) : []
    const startReveal = (): void => {
      if (!revealCopies.length) return
      const now = performance.now()
      for (const { buffer, held } of revealCopies) {
        if (this._washReveals.get(buffer) === held) {
          held.startedAt = now
          if (held.pending) {
            this._revealPoolRelease(held.pending)
            held.pending = undefined
          }
        }
      }
      this._displayIfNotSuspended()
    }
    const { spreadPx, water, migratePx, bristleRadiusPx } = owned?.composite ?? scratch.compositeScalars(
      () => ({
        spreadPx: 0, inkSmoothPx: 0, water: 0, migratePx: 0,
        fieldSeed: [0, 0] as [number, number], bristleRadiusPx: 0,
      }),
    )
    if (!owned) scratch.noteDabSpacing(0)
    const dir = owned?.direction ?? scratch.noteDirection(0, 0)
    // (§17.44) A tile under a newer, still-running film shows the wet deposit
    // (settled base + that film), not the dry target, which has no film in it.
    const runningFilm = (entry: RibbonTileScratch): boolean => entry.filmGesture !== settledGesture && entry.filmGesture === scratch.materialGesture && !!entry.strokeInk
    // The job exposes the exact domain it writes in the existing resident
    // targets. Source bounds alone can cut off pigment moved into a puddle.
    let compositeBounds = bounds
    const composite = (): void => {
      // (#700) The final settle can land several frames after targets were
      // first resolved. A live frame may already have folded their coarse
      // copies; resolve again at this write so the next frame folds anew.
      for (const tile of this._resolveWithinSheet(target, profile.normalizeDeposit ? this._wcSheetClamp(compositeBounds) : compositeBounds)) {
        const entry = scratch.peek(tile.buffer)
        if (!entry) continue
        // (§17.23) No deposit smoothing at the settle: the live batches
        // average the deposit over a dab spacing to hide the dab pitch, but
        // the settle's diffusion has smoothed the pitch far past that, and the
        // rim it lays is a few pixels wide — the average would take it away.
        // (§17.42) The provisional dry target where the settle built one.
        this._drawRibbonCompositeRect(
          tile, compositeBounds, preset, profile, entry.original, entry.coverage,
          runningFilm(entry) ? entry.inkLoad : entry.inkDry ?? entry.inkLoad, runningFilm(entry) ? entry.inkColor : entry.colorDry ?? entry.inkColor, color, opacity,
          fieldSeed, spreadPx, water, migratePx, 0, dir, bristleRadiusPx,
        )
      }
      target.markContentPainted(compositeBounds)
    }
    // (#536, ADR 011 §17.11) The mobile phase. Pigment laid into standing
    // water keeps moving after the brush has gone; this is where it moves —
    // once per operation, before the composite reads the result, and only
    // here: the live batches composite what the brush laid, and the settle at
    // each operation boundary is what carries the paint. See diffusePending on
    // why once, and wetDiffusion.ts for what one step is.
    //
    // (§17.22) For the author's own pen-up the steps are spread over the next
    // frames under the reveal (_startSettle) and the composite follows them;
    // the tile meanwhile shows what the live batches painted, which is what
    // the reveal starts from anyway. A replay settles in one go: it is
    // building the dry target and nobody is watching it happen.
    if (owned?.diffusePending ?? scratch.diffusePending) {
      if (!owned) scratch.diffusePending = false
      if (this._settle) this._completeSettle()
      // (§17.26) …and a loaded brush pushes the wash under it less than a
      // brush of clean water: its own paint lands where the water goes.
      const bloom = watercolorBloomStrength(ctx.landedWet, profile.pigmentLevel) * watercolorBloomPush(profile.pigmentLevel)
      // Dev probe for the rig: what this settle was given.
      Object.assign(globalThis, { __wcSettle: { bloom, radiusPx: ctx.radiusPx, landedWet: ctx.landedWet, wetPeak: ctx.wetPeak, merge: watercolorPuddleMerge(ctx.wetPeak), reveal } })
      const delivery = ribbonWaterDelivery(profile)
      const standing = delivery.water * (delivery.retain + (1 - delivery.retain) * Math.min(1, ctx.landedWet))
      // (§17.42) ...and what the group tide will need, should the wash dry
      // as one component.
      const prevDry = scratch.dryCtx
      scratch.dryCtx = {
        target, preset, profile, color, opacity, fieldSeed,
        bounds: prevDry ? {
          minX: Math.min(prevDry.bounds.minX, bounds.minX), minY: Math.min(prevDry.bounds.minY, bounds.minY),
          maxX: Math.max(prevDry.bounds.maxX, bounds.maxX), maxY: Math.max(prevDry.bounds.maxY, bounds.maxY),
        } : { ...bounds },
        radiusPx: Math.max(prevDry?.radiusPx ?? 0, ctx.radiusPx),
        standing: Math.max(prevDry?.standing ?? 0, standing),
      }
      const job = this._diffuseWashOps(
        scratch, targets, bounds, bloom, ctx.radiusPx,
        profile.waterLevel, ctx.landedWet, standing,
        ctx.wetPeak, ctx.dwellMs,
        reveal && fade ? (tile, pigment, chroma, coverage) => {
          const owned = revealCopies.find(copy => copy.buffer === tile.buffer)
          if (!owned || this._washReveals.get(tile.buffer) !== owned.held || this._strokeLayerId) return
          const entry = scratch.peek(tile.buffer)
          if (!entry) return
          if (owned.held.wetMask) coverage.copyTo(owned.held.wetMask)
          if (!owned.held.pending) {
            owned.held.pending = this._revealPoolAcquire(tile.buffer.width, tile.buffer.height)
            owned.held.before.copyTo(owned.held.pending)
            owned.held.progressive = true
            owned.held.frameAt = performance.now()
          }
          this._drawRibbonCompositeRect(
            { ...tile, buffer: owned.held.pending }, compositeBounds, preset, profile,
            entry.original, coverage, pigment, chroma, color, opacity,
            fieldSeed, spreadPx, water, migratePx, 0, dir, bristleRadiusPx,
          )
          this._invalidateSplitCache()
          this._displayIfNotSuspended()
        } : undefined,
        owned,
        this._wcAsyncFinish && !!owned && this._wcAsyncOwners.has(scratch),
      )
      if (job) {
        compositeBounds = job.compositeDomain
        const complete = (): void => {
          job.finish()
          composite()
          // (§17.44) Not the author's open wash: its next gesture takes the same
          // film buffers straight back (filmBuffers reuses them), and giving
          // them to the pool made it destroy the overflow and remake it on
          // the next gesture - a GPU-stalling FBO check per buffer.
          // (§17.50) The author's too, now that the FBO check is once per
          // context: four tile-sized textures per tile the wash covers, held
          // for its whole life (up to 100 s) - 16 MB a tile, 160 MB on a
          // page-wide wash, and the iPad's tab was killed for memory with
          // four people painting. The film is only read between a gesture's
          // first batch and its settle; the next gesture acquires a new one.
          scratch.releaseFilm(settledGesture)
          if (reveal && fade) {
            // The settle lands now, so the reveal eases in from now — not
            // from the pen-up a few frames ago, which would show a slice of
            // the change at once.
            startReveal()
          }
        }
        if ((reveal || spread) && typeof requestAnimationFrame === 'function') {
          // (§17.53) A sliced rebuild's buffer is not on screen yet: nothing to redraw.
          const shown = [...this._layers.values()].includes(target)
          this._startSettle(scratch, job.ops, spread && !reveal && shown ? () => { complete(); this._displayIfNotSuspended() } : complete, { isAlive: () => scratch.live, abort: job.dispose })
          return
        }
        try {
          for (const op of job.ops) op()
          complete()
        } finally { job.dispose() }
        this._scheduleFieldRelease()
        return
      }
    }
    composite()
    startReveal()
    // (§17.44) Not the author's open wash: its next gesture takes the same
          // film buffers straight back (filmBuffers reuses them), and giving
          // them to the pool made it destroy the overflow and remake it on
          // the next gesture - a GPU-stalling FBO check per buffer.
          if (scratch !== this._wash?.scratch) scratch.releaseFilm(settledGesture)
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
  private _drawRibbonNibPass(
    dest: AccumulationBuffer, tile: PaintTarget, dab: Dab, preset: PencilPreset,
    profile: RibbonProfile, inkMode: 6 | 7 | 10, opacity: number, ownTarget = true,
    /** (#468 v4) How wet the brush was for *this* dab, written into the deposit
     *  texture's colour channels so the composite can recover a per-pixel water
     *  level (ADR 011 §4.1). 0 for every tool with no water model, which leaves
     *  those channels at zero and the ratio unread. */
    inkWater = 0,
    /** (#536) Which way "across the brush" points for this dab, as a unit
     *  vector in the nib's own local axes. The stamps must agree with the bands
     *  about this or the hair comb would soften at every stamp, i.e. ripple at
     *  the dab pitch. Defaults to the nib's minor axis, which for a round nib
     *  whose angle follows the path is already the perpendicular of travel. */
    acrossLocal: [number, number] = [0, 1],
    /** (#536) How wet the paper under this dab already was, from the stroke's
     *  own recorded profile. Written into the deposit texture's green channel
     *  so the composite can tell it apart from the brush's own water. */
    paperWet = 0,
    /** (#536) How strong the paint in the brush is for this stroke. */
    inkStrength = 1,
    /** (#536) This stroke's own offset into the mottling field — see wcCloud. */
    mottleSeed: [number, number] = [0, 0],
    /** (#536) Land this ink only where `clipTo` already has coverage, scaled
     *  by it — the halo's way of never leaving the puddle. See u_inkClip. */
    clipTo: AccumulationBuffer | null = null,
    /** (#536, s17.13) Ink mode only: the hairs, laid into the deposit. */
    bristleCombs = 0, bristleInk = 0,
    /** (#536, s17.19) Ink mode into the colour record: the paint's absorption
     *  per channel; null writes the deposit as always. */
    depthTau: readonly [number, number, number] | null = null,
    /** (s17.27) How deep the water stands under this dab — see
     *  watercolorPuddleDepth. The coverage stamp reads it, and (s17.79) the
     *  watercolor's ink stamp where poolBlot is on. */
    puddle = 1,
    /** (#680, s17.79) Break the brush's surplus into blots (wcPoolBlot):
     *  the watercolor's own ink stamps only. */
    poolBlot = 0,
  ): void {
    this._ribbonPasses.drawRibbonNibPass(dest, tile, dab, preset, profile, inkMode, opacity, ownTarget, inkWater, acrossLocal, paperWet, inkStrength, mottleSeed, clipTo, bristleCombs, bristleInk, depthTau, puddle, poolBlot)
  }
  private _drawRibbonBands(
    dest: AccumulationBuffer, tile: PaintTarget, bands: Float32Array, mode: 'coverage' | 'ink' | 'ink-max', aaPx: number,
    cloud = 0, gran = 0, mottleSeed: [number, number] = [0, 0],
    /** (#536, s17.11/13) Coverage mode only: the water the stroke delivers
     *  and what dry paper keeps of it, into .b together with each band's
     *  recorded paper wetness. See u_washWater. */
    washWater = 0, waterRetain = 0,
    /** (#536, s17.13) Ink mode only: the hairs, laid into the deposit. */
    bristleCombs = 0, bristleInk = 0,
    /** (#536, s17.19) Ink mode into the colour record — see _drawRibbonNibPass. */
    depthTau: readonly [number, number, number] | null = null,
    /** (#680, s17.79) See _drawRibbonNibPass's poolBlot. */
    poolBlot = 0, availableWater: AccumulationBuffer | null = null,
  ): void {
    this._ribbonPasses.drawRibbonBands(dest, tile, bands, mode, aaPx, cloud, gran, mottleSeed, washWater, waterRetain, bristleCombs, bristleInk, depthTau, poolBlot, availableWater)
  }
  private _drawRibbonCompositeRect(
    tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number },
    preset: PencilPreset, profile: RibbonProfile,
    original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer | null,
    inkColor: AccumulationBuffer | null,
    color: [number, number, number], opacity: number,
    fieldSeed: [number, number], spreadPx: number, water: number, migratePx: number,
    inkSmoothPx: number, strokeDir: [number, number],
    /** (#536) Half-width of this gesture's mark, px — what the hair count is
     *  derived from. */
    bristleRadiusPx = 0,
  ): void {
    this._ribbonPasses.drawRibbonCompositeRect(tile, bounds, preset, profile, original, coverage, inkLoad, inkColor, color, opacity, fieldSeed, spreadPx, water, migratePx, inkSmoothPx, strokeDir, bristleRadiusPx)
  }
  /** Delegates layer composition to LayerCompositor. */
  private _compositeTextures(
    items: Array<{ texture: WebGLTexture; opacity: number }>,
    targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void { this._compositor.compositeTextures(items, targetFbo, targetW, targetH) }
  /** Delegates layer composition to LayerCompositor. */
  private _invalidateSplitCache(): void { this._compositor.invalidateSplitCache() }
  /** Delegates layer composition to LayerCompositor. */
  private _drawCompositeItem(
    frame: CameraFrame, id: string, opacity: number, targetFbo: WebGLFramebuffer,
    targetW: number, targetH: number,
    includeWashReveal = true,
  ): void { this._compositor.drawCompositeItem(frame, id, opacity, targetFbo, targetW, targetH, includeWashReveal) }

  /** (#138) See Camera.centeredOrigin. Kept by this name for the stroke
   *  lifecycle code, which is live on another branch. */
  private _cameraCenteredOrigin(): { x: number; y: number } {
    return this._camera.centeredOrigin()
  }

  /** (#138) See translateDabs (src/raster/Camera.ts). Kept by this name for
   *  the same reason as _cameraCenteredOrigin. */
  private _translateDabs(dabs: Dab[], origin: { x: number; y: number }): Dab[] {
    return translateDabs(dabs, origin)
  }
  /** Delegates layer composition to LayerCompositor. */
  private _downsampleTileInto(
    source: AccumulationBuffer, dest: AccumulationBuffer,
    x: number, y: number, w: number, h: number,
  ): void { this._compositor.downsampleTileInto(source, dest, x, y, w, h) }
  /** Delegates layer composition to LayerCompositor. */
  private _drawTileComposite(
    frame: CameraFrame, texture: WebGLTexture, originX: number, originY: number, bw: number, bh: number,
    opacity: number, targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void { this._compositor.drawTileComposite(frame, texture, originX, originY, bw, bh, opacity, targetFbo, targetW, targetH) }
  /** Delegates layer composition to LayerCompositor. */
  private _runComposite(
    frame: CameraFrame, items: CompositeItem[],
    partialWorld: { minX: number; minY: number; maxX: number; maxY: number } | null = null,
  ): void { this._compositor.runComposite(frame, items, partialWorld) }

  /** (#134) The one place camera rotation actually applies for infinite
   *  rooms — a no-op for bounded rooms (angle is always 0 there for the
   *  engine's whole lifetime, and they never populate _assemblyFBO to
   *  begin with; the early return just skips a redundant identity blit).
   *  Blits _assemblyFBO (unrotated, zoom-applied, centered on the same
   *  world point as the real camera, just padded bigger — see its field
   *  comment) into the real `targetFbo`, rotating by -angle: forward,
   *  screen = canvasCenter + R(angle)*(assemblyPx - assemblyCenter) is the
   *  same world->screen convention frameEdgeX/Y and the old
   *  (pre-#136) _worldToScreenTransform used (scale baked in via zoom,
   *  here already applied when the assembly buffer itself was drawn, so
   *  only the rotation is left) — this needs that mapping's inverse,
   *  which for a pure rotation is just negating the angle, no matrix
   *  inversion required. */
  private _finishInfiniteComposite(targetFbo: WebGLFramebuffer): void {
    const { canvas } = this
    this._passes.transform(
      this._assemblyFBO, this._camera.rotateMatrixInv(), canvas.width, canvas.height, targetFbo,
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
   *  BlitPasses.transform there's nothing underneath for it to blend against
   *  and no need to pre-clear the screen. */
  /** (#536) Rebuilds the display-side wetness texture, at most a few times a
   *  second — the field changes slowly and this runs inside the frame loop.
   *
   *  One texel per wetness cell, capped: past the cap the same rect is covered
   *  by fewer, larger texels rather than the map being cropped, because a
   *  cropped one would show a hard edge where the overlay stopped and that is
   *  far more visible than a coarse one. */
  /** (#536) Repaints while the paper dries.
   *
   *  Needed because the wetness overlay is the one thing on screen that changes
   *  with no input at all: without this the sheet would stay visibly damp until
   *  the next stroke happened to trigger a frame, which is worse than not
   *  showing wetness — it would be showing it *wrong*.
   *
   *  Deliberately slow. Six frames a second is far more than enough for
   *  something that fades over twenty-five seconds, and it stops when the paper
   *  is dry rather than running for the life of the session. */
  /** (#536, ADR 011 §17.8) Water a stroke this client did not paint leaves on
   *  this client's paper.
   *
   *  Without this the field only ever knew about the local hand, so a teacher
   *  laying a puddle and a student painting into it was the one thing the whole
   *  wetness model exists for and the one thing it could not do: the water was
   *  on the student's screen as pixels and absent from their paper.
   *
   *  Timestamped by the operation rather than by arrival, which is what makes it
   *  idempotent and makes replay need no special case at all. A stroke from an
   *  hour ago deposits nothing because the age check drops it; one from three
   *  seconds ago deposits water that is already three seconds into drying,
   *  whether this client is seeing it live, receiving it late, or replaying the
   *  log after a reload. `deposit` takes the max, so applying the same stroke
   *  twice — live packet then operation, or a rebuild after undo — lands on the
   *  same field.
   *
   *  The author's clock, with all the skew that implies. Deliberately tolerated:
   *  this field is causal and ephemeral, never content (ADR 011 §17.3), so the
   *  worst a wrong clock buys is a sheen that lingers or arrives already dry on
   *  one participant's screen. What the *marks* look like is decided by what
   *  each author recorded seeing, and that is not derived here. */
  private _wetReplayRevision = -1
  private _wetReplayIds = new Set<string>()

  private _wetFromForeignStroke(
    layerId: string, tool: ToolType, preset: string, dabs: Dab[], atMs: number | null,
    /** (#536, §17.21) What the ribbon build just worked out each dab left
     *  standing (_paintDabs' return) — the mix is only the fallback for a dab
     *  it did not paint. */
    standing?: ReadonlyMap<Dab, number>, opId?: string,
  ): void {
    if (opId) {
      if (this._wetReplayRevision !== this._log.revision) {
        this._wetReplayIds = wetReplayOperationIds(this._log.doneOperations())
        this._wetReplayRevision = this._log.revision
      }
      if (!this._wetReplayIds.has(opId)) return
    }
    if (tool !== 'watercolor' || !dabs.length) return
    // A null timestamp is a live packet: it is happening now, by definition.
    const age = atMs === null ? 0 : Math.min(Math.max(Date.now() - atMs, 0), WET_DRY_MS)
    if (age >= WET_DRY_MS) return
    const now = performance.now() - age
    const water = watercolorMixFromPreset(preset).water
    // The nib's own radius, as the ribbon lays it (size x sizeMultiplier),
    // not the brush's nominal one: the wet map draws the standing water's
    // meniscus at the wet patch's edge, and at the nominal radius that bead
    // sat ten pixels outside the paint at every stroke end - a thin grey
    // arc off each cap that read as an outline of nothing.
    const sizeMul = this._resolvePreset(tool, preset).sizeMultiplier
    for (const dab of dabs) {
      this._paperWet.deposit(layerId, dab.x, dab.y, dab.size * 0.5 * sizeMul * Math.max(dab.aspectRatio, 1), standing?.get(dab) ?? water, now, false, this._dabPool.get(dab) ?? 0)
    }
    this._scheduleDryingRepaint()
  }

  private _scheduleDryingRepaint(): void {
    if (this._dryingTimer) return
    const tick = (): void => {
      this._dryingTimer = 0
      const now = performance.now()
      const peak = this._paperWet.peak(now)
      if (peak <= 0.01) {
        this._paperWet.prune(now)
        this._wetShown = -1
        // (#536) …and one last frame on the way out. Without it the watcher
        // stopped with whatever it had drawn a quarter-second earlier still on
        // screen — the final, faintest state of the puddle — and nothing was
        // left running to replace it. It sat there until the next thing that
        // happened to cause a frame, which is "лужа остаётся на последнем шаге,
        // пока не тапнешь по экрану": the last drop hanging on a tap.
        //
        // Cheap, and exactly once per drying: everything above has already
        // returned by the time the paper is dry.
        this._wetTexAt = 0
        this._displayIfNotSuspended()
        return
      }
      // Repaint only when the *visible* wetness has actually moved a step.
      // Twenty-five seconds at four ticks a second is a hundred frames of
      // which about a dozen differ; drawing the other eighty-eight is work
      // nobody can see, and the first thing it did was make unrelated engine
      // tests time out.
      // (#536) 128 steps rather than 16 since the sheen stopped being the only
      // thing that moves: the paint relaxing outward as it dries (WC_WET_RELAX)
      // is an animation, and at sixteen steps over a minute it arrived in
      // visible jumps. It got worse rather than better when the relaxation was
      // sped up, because the same motion now has to fit into the first half of
      // the drying. 128 is about two repaints a second, which is what this
      // timer's own 250 ms tick can deliver anyway — past this the tick is the
      // limit, not the quantisation.
      const step = Math.round(peak * 128)
      // (§17.46) Not while the pen is down: the brush's own frames redraw
      // what it touches, and a full repaint for the sheen fading elsewhere
      // cost a frame every quarter second of a big stroke on the tablet.
      // The step is left unrecorded, so the first tick after pen-up draws it.
      if (step !== this._wetShown && !this._strokeLayerId) {
        this._wetShown = step
        this._wetTexAt = 0 // the field decayed although nothing was drawn
        this._displayIfNotSuspended()
      }
      this._dryingTimer = setTimeout(tick, 250) as unknown as number
    }
    // Plain setTimeout, never window.setTimeout: the engine suite runs with no
    // DOM at all, and a `window.` here typechecks perfectly and then kills
    // every engine test the moment this line is reached.
    this._dryingTimer = setTimeout(tick, 250) as unknown as number
  }

  private _updateWetTexture(now: number): void {
    if (now - this._wetTexAt < 120) return
    this._wetTexAt = now
    // O(1) before the O(cells) walk: a dry sheet is the common case and must
    // not pay for the overlay at all.
    if (this._paperWet.peak(now) <= 0.01) { this._wetRect = [0, 0, -1, -1]; return }
    const b = this._paperWet.bounds(now)
    if (!b) { this._wetRect = [0, 0, -1, -1]; return }
    const CAP = 160
    const cols = b.maxCx - b.minCx + 1
    const rows = b.maxCy - b.minCy + 1
    const step = Math.max(1, Math.ceil(Math.max(cols, rows) / CAP))
    const inW = Math.ceil(cols / step), inH = Math.ceil(rows / step)
    // One texel of zero all the way round, so the linear filter has something
    // to fade into at the border. Padding the *rect* instead — which is what
    // the first pass did — stretches the map over more world than it describes
    // and shifts every texel off the cell it stands for, which is how the
    // overlay ended up both wider than the brush and blocky.
    const w = inW + 2, h = inH + 2
    // (§17.44) One pass over the field, then the two filters separably: the
    // 5x5 max of the body as two 5-tap passes, the tent as it was.
    const raster = this._paperWet.raster(b.minCx, b.minCy, step, inW, inH, now)
    const cells = new Float32Array(w * h)
    for (let ty = 0; ty < inH; ty++) cells.set(raster.subarray(ty * inW, ty * inW + inW), (ty + 1) * w + 1)
    // (#680, s17.81) The pool share, for the pool's tone (s17.83).
    const poolRaster = this._paperWet.rasterPool(b.minCx, b.minCy, step, inW, inH, now)
    const pools = new Float32Array(w * h)
    for (let ty = 0; ty < inH; ty++) pools.set(poolRaster.subarray(ty * inW, ty * inW + inW), (ty + 1) * w + 1)
    if (!this._wetOverlayWorkspace || this._wetOverlayWorkspace.rgba.length !== w * h * 4) {
      this._wetOverlayWorkspace = wetOverlayWorkspace(w * h)
    }
    const data = wetOverlayPixels(cells, pools, w, h, this._wetOverlayWorkspace)
    const { gl } = this
    if (!this._wetTex) this._wetTex = gl.createTexture()
    // TEXTURE2 explicitly, and it is not defensive tidiness. Without it this
    // binds onto whichever unit happened to be active — which, called from
    // inside the compose pass, was unit 1 with the paper height map on it. The
    // paper then sampled *this* texture instead of itself and the whole sheet
    // went flat grey, the texParameteri calls below landed on the paper's
    // binding, and the whole thing came and went with the throttle, so it read
    // as flicker that zooming sometimes cleared.
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this._wetTex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
    // Bilinear and clamped: the map is deliberately coarse, and the one thing
    // it must not do is show its own texels as squares of wet paper.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    // Exactly the world the texture describes, border texels included, so a
    // texel centre lands on the centre of the cells it was built from. Any
    // other rect displaces the whole map — see the padding note above.
    const cell = WET_CELL_PX * step
    this._wetRect = [
      b.minCx * WET_CELL_PX - cell, b.minCy * WET_CELL_PX - cell,
      b.minCx * WET_CELL_PX + (inW + 1) * cell, b.minCy * WET_CELL_PX + (inH + 1) * cell,
    ]
    // Back to the unit every other path in this engine assumes is active.
    gl.activeTexture(gl.TEXTURE0)
  }

  /** (#536, §17.46) Adds a world rect to what the next frame must recompose. */
  private _markPaperDamage(b: { minX: number; minY: number; maxX: number; maxY: number }): void {
    const d = this._paperDamage
    if (!d) { this._paperDamage = { ...b }; this._paperPartialOK = true; return }
    d.minX = Math.min(d.minX, b.minX); d.minY = Math.min(d.minY, b.minY)
    d.maxX = Math.max(d.maxX, b.maxX); d.maxY = Math.max(d.maxY, b.maxY)
  }

  /** (#536, §17.46) The screen rect (GL, bottom-up) a world rect covers, padded. */
  private _damageScreenRect(b: { minX: number; minY: number; maxX: number; maxY: number }): [number, number, number, number] | null {
    const { canvas } = this
    const m = invertMatrix(this._camera.screenToWorldMatrix())
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [wx, wy] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]] as const) {
      const [sx, sy] = applyMatrix(m, wx, wy)
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy)
    }
    const pad = 6
    const gx0 = Math.max(0, Math.floor(x0) - pad), gx1 = Math.min(canvas.width, Math.ceil(x1) + pad)
    const top = Math.max(0, Math.floor(y0) - pad), bottom = Math.min(canvas.height, Math.ceil(y1) + pad)
    if (gx1 <= gx0 || bottom <= top) return null
    return [gx0, canvas.height - bottom, gx1 - gx0, bottom - top]
  }

  /** (§17.46) Whether this frame may recompose only the live stroke's rect,
   *  and which: the world rect when the only change since the last frame is
   *  the stroke's (and the camera and canvas are where they were), else null.
   *  Consumes the damage either way, and keeps the screen cache sized. */
  private _takePaperPartial(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const { gl, canvas } = this
    if (!this._screenCache || this._screenCache.width !== canvas.width || this._screenCache.height !== canvas.height) {
      this._screenCache?.destroy()
      this._screenCache = new AccumulationBuffer(gl, canvas.width, canvas.height, 'nearest')
      this._paperCacheKey = ''
    }
    // The wet texture is global: its decay, drainage and changing raster
    // bounds affect more than the rectangle under the current brush. Upload
    // it before choosing the scissor and include both its old and new extent.
    const previousWetRect = this._wetRect
    const previousWetAt = this._wetTexAt
    this._updateWetTexture(performance.now())
    if (this._paperPartialOK && this._paperDamage && previousWetAt !== this._wetTexAt) {
      for (const rect of [previousWetRect, this._wetRect]) {
        if (rect[2] > rect[0] && rect[3] > rect[1]) {
          this._markPaperDamage({ minX: rect[0], minY: rect[1], maxX: rect[2], maxY: rect[3] })
        }
      }
    }
    const cam = this._camera.pose
    const key = `${cam.wx},${cam.wy},${cam.zoom},${cam.angle},${canvas.width},${canvas.height}`
    const partial = this._paperPartialOK && this._paperDamage && key === this._paperCacheKey ? this._paperDamage : null
    this._paperPartialOK = false
    this._paperDamage = null
    this._paperCacheKey = key
    return partial
  }

  private _composePaperToScreen(partialWorld: { minX: number; minY: number; maxX: number; maxY: number } | null = null): void {
    const { gl, canvas } = this
    const ext = this._assemblyFBO.width // square: width === height

    // (#536, §17.46) Composed into the screen cache, and then copied to the
    // canvas. A frame whose only change is the live stroke's rect (and the
    // camera is where it was) recomposes that rect alone: the paper pass is
    // the dearest in the frame, and on the tablet paper + the live
    // composite together overran the frame budget on every third frame of
    // a big stroke, while either alone fitted.
    if (!this._screenCache) this._takePaperPartial()
    const partial = partialWorld ? this._damageScreenRect(partialWorld) : null
    this._screenCache!.beginReplaceDraw()
    if (partial) { gl.enable(gl.SCISSOR_TEST); gl.scissor(partial[0], partial[1], partial[2], partial[3]) }
    gl.disable(gl.BLEND)
    gl.useProgram(this._paperComposeProg)
    const u = this._paperComposeUni

    // (#536) Rebuilt *before* anything else is bound: it uploads a texture, and
    // doing that in the middle of a pass whose other textures are already bound
    // is how the paper map got clobbered once already.
    this._updateWetTexture(performance.now())

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._assemblyFBO.texture)
    gl.uniform1i(u.u_accumulation, 0)
    this._paper.bindForCompose(this._paper.texelsPerPixel(this._camera.pose.zoom))
    gl.uniform1i(u.u_paperMap, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this._wetTex)
    gl.uniform1i(u.u_wetMap, 2)
    gl.uniform4fv(u.u_wetRect, this._wetRect)
    // (#536) What the rim bands are measured against — see WC_DARK_MID. Floored
    // so a nearly-dry sheet cannot divide the bands down to nothing.
    gl.uniform1f(u.u_wetPeak, Math.max(this._paperWet.peak(performance.now()), 0.05))
    gl.activeTexture(gl.TEXTURE0)

    gl.uniform3fv(u.u_paperColor, this._paper.color())
    gl.uniform2f(u.u_paperScale, this._paper.scale, this._paper.scale)
    const { w: paperTexW, h: paperTexH } = this._paper.worldSize()
    gl.uniform2f(u.u_paperTexSize, paperTexW, paperTexH)
    gl.uniform2f(u.u_dstSize, canvas.width, canvas.height)
    gl.uniform2f(u.u_srcSize, ext, ext)
    gl.uniformMatrix3fv(u.u_matrixInv, false, toMat3(this._camera.rotateMatrixInv()))
    gl.uniformMatrix3fv(u.u_screenToWorld, false, toMat3(this._camera.screenToWorldMatrix()))
    // Catmull-Rom only when this pass genuinely resamples. An unrotated
    // camera at or below zoom 1 maps screen pixels onto assembly texels one
    // for one, offset by an exact integer (that integer-ness is what
    // Camera.assemblyPad/CameraFrame.centerX exist to guarantee) — a plain bilinear
    // tap is then already lossless and 9x cheaper. See PAPER_COMPOSE_FRAG.
    const resamples = this._camera.pose.angle !== 0 || this._camera.residualScale() !== 1
    gl.uniform1f(u.u_sharpResample, resamples ? 1 : 0)
    gl.uniform4fv(u.u_pageRect, this._paper.pageRect())
    gl.uniform3fv(u.u_deskColor, this._opts.deskColor)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._paperComposePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this._paper.releaseFromCompose()
    if (partial) gl.disable(gl.SCISSOR_TEST)
    this._screenCache!.endDraw()
    // The copy to the canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.useProgram(this._screenBlitProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._screenCache!.texture)
    gl.uniform1i(this._screenBlitTexLoc, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._screenBlitPosLoc)
    gl.vertexAttribPointer(this._screenBlitPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /** See PencilEngineAPI's doc comment. */
  previewAreaPaste(
    layerId: string, image: string,
    rect: { x: number; y: number; width: number; height: number },
    wireMatrix: LayerTransformMatrix,
  ): void {
    this._area.previewAreaPaste(layerId, image, rect, wireMatrix)
  }

  /** See PencilEngineAPI's doc comment. */
  previewAreaTransform(layerId: string, selection: SelectionShape, matrix: LayerTransformMatrix): void {
    this._area.previewAreaTransform(layerId, selection, matrix)
  }

  /** See PencilEngineAPI's doc comment. */
  readAreaImage(layerId: string, selection: SelectionShape): Promise<AreaImage | null> {
    return this._area.readAreaImage(layerId, selection)
  }

  /** See PencilEngineAPI's doc comment. */
  computeAreaFill(request: AreaFillRequest): Promise<AreaFillRaster | null> {
    return this._area.computeAreaFill(request)
  }

  /** Rebuilds `_compositeFBO` from every live layer plus whatever preview
   *  buffers are currently active (live-tip, speculative-prediction, peer
   *  reveals) — the shared first half of both `_display()` (paper-blended,
   *  drawn to the visible canvas) and Exporter's transparent fallback (#15,
   *  no paper). Stores premultiplied graphite color in `.rgb`, coverage in
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
  private _composeToFBO(needCompositeFBO = true, partialWorld: { minX: number; minY: number; maxX: number; maxY: number } | null = null): void {
    const { gl, canvas } = this
    const w = canvas.width, h = canvas.height
    // (#301) An infinite room's on-screen path never reads _compositeFBO —
    // _composePaperToScreen goes straight from _assemblyFBO to the screen,
    // and the only consumers of the rotated, unblended canvas-sized copy
    // (Exporter's transparent empty-drawing fallback) ask for it
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

    // (#557) The on-screen composite is the one place the display filter
    // applies; Exporter.buildContentComposite walks _compositeOrder itself.
    const frame = this._camera.liveFrame()
    this._runComposite(frame, this._displayOrder(), needCompositeFBO ? null : partialWorld)

    const buildFbo = this._assemblyFBO.fbo
    const buildW   = this._assemblyFBO.width
    const buildH   = this._assemblyFBO.height

    // Camera-relative blend of one preview buffer, world rect [origin,
    // origin+(w,h)] — see this method's own doc comment above.
    const blendPreview = (texture: WebGLTexture, origin: { x: number; y: number }): void => {
      this._drawTileComposite(frame, texture, origin.x, origin.y, w, h, 1, buildFbo, buildW, buildH)
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
    for (const films of this._wcAsyncPresentations.values()) for (const held of films.values()) blendPreview(held.buf.texture, held.origin)
    for (const held of this._wcAsyncPeerStreams.values()) if (held.buf) blendPreview(held.buf.texture, held.origin)

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
    if (this._contextLost || this.gl.isContextLost()) return
    // (#470) One path for both kinds of room. A bounded room used to take a
    // screen-locked DISPLAY_FRAG pass over a sheet-sized _compositeFBO, which
    // only worked because its canvas *was* the sheet; now that the camera
    // decides what is on screen, the world-space paper pass an infinite room
    // already used is the correct one for both, and the sheet is expressed to
    // it as a rectangle (see PaperState.pageRect).
    // (#536, §17.12) Reveals that ran out go before the frame, not after: the
    // frame that ends one draws the tile plain.
    const perfT0 = performance.now()
    // (#536, §17.22) The live watercolor gesture's composite, once per frame.
    this._flushLiveComposite()
    if (this._washReveals.size) this._sweepReveals(perfT0)
    // (§17.46) One decision per frame: the live stroke's rect alone, or all.
    const partialWorld = this._takePaperPartial()
    this._composeToFBO(false, partialWorld)
    // _composePaperToScreen manages its own framebuffer/viewport/blend state,
    // mirroring _runComposite/_finishInfiniteComposite's division of labor, so
    // nothing needs setting up here first.
    this._composePaperToScreen(partialWorld)
    this._wcPerf.frameAt.push(perfT0)
    this._wcPerf.frameMs.push(performance.now() - perfT0)
    if (this._wcPerf.frameAt.length > 600) { this._wcPerf.frameAt.splice(0, 300); this._wcPerf.frameMs.splice(0, 300) }
    // …and while any reveal is still running, the next frame is owed — at
    // thirty a second, not every vsync: a full recomposite per frame for a
    // second and a half after every stroke was most of "всё это дело
    // притормаживает" on the tablet, and the eye cannot tell 30 from 60 on a
    // fade.
    if (this._washReveals.size && !this._revealTimer) {
      this._revealTimer = setTimeout(() => {
        this._revealTimer = 0
        // (§17.46) While the pen is down the reveal of an earlier mark keeps
        // its clock but not its frames: thirty full repaints a second on top
        // of the brush's own. It is drawn wherever the brush draws, and in
        // full again from the first frame after pen-up.
        if (this._strokeLayerId) { this._revealTimer = setTimeout(() => { this._revealTimer = 0; this._displayIfNotSuspended() }, 33) as unknown as number; return }
        this._displayIfNotSuspended()
      }, 33) as unknown as number
    }
  }

  /** Paper-baked export variant (#145) — the same PAPER_COMPOSE_FRAG the
   *  live screen pass uses, just pointed at an arbitrary source/target
   *  instead of _assemblyFBO/the screen — Exporter's context `composePaper`
   *  (#494). The exactFrame Exporter.buildContentComposite draws through is never
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
    // 1:1 — an export is never minified, so the chain is never wanted here.
    this._paper.bindForCompose(this._paper.texelsPerPixel(1))
    gl.uniform1i(u.u_paperMap, 1)

    gl.uniform3fv(u.u_paperColor, this._paper.color())
    gl.uniform2f(u.u_paperScale, this._paper.scale, this._paper.scale)
    const { w: paperTexW, h: paperTexH } = this._paper.worldSize()
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
    // (#536) And no wetness: an export is the finished sheet. Whether the
    // artist's own paper happened to be damp at the moment they pressed the
    // button is not a property of the drawing.
    gl.uniform4f(u.u_wetRect, 0, 0, -1, -1)
    gl.uniform1f(u.u_wetPeak, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    const posLoc = this._paperComposePosLoc
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this._paper.releaseFromCompose()

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Hand-builds an image Blob from raw RGBA8 bytes read back via
   *  gl.readPixels — needed because the export render targets are never the
   *  real on-screen canvas (see Exporter.exportPNG's doc comment for why), so
   *  there's no canvas.toBlob() of the GL canvas to lean on. Stays in the
   *  engine because it needs the DOM; Exporter and AreaOps get it through
   *  their contexts.
   *  gl.readPixels' rows come out GL/window-bottom-first (the same convention
   *  getContentBounds' own doc comment explains and corrects for) — flipped
   *  here so row 0 of the image is the visual top.
   *
   *  Every caller hands it opaque or straight-alpha bytes (PAPER_COMPOSE_FRAG
   *  writes alpha 1, DISPLAY_TRANSPARENT_FRAG un-premultiplies), which is what
   *  putImageData expects — no premultiplication step belongs here.
   *
   *  (#595) `type` other than PNG is a request, not a guarantee: a browser
   *  that cannot encode it (Safari and WebP) hands back a PNG instead, which
   *  is accepted as is. Anything else — or a null from an encoder that
   *  refused outright — falls back to an explicit PNG. */
  private async _pixelsToBlob(
    pixels: Uint8Array, width: number, height: number, type = 'image/png', quality?: number,
  ): Promise<Blob | null> {
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
    if (!ctx) return null
    ctx.putImageData(new ImageData(flipped, width, height), 0, 0)
    const encode = (t: string, q?: number) => new Promise<Blob | null>(resolve => out.toBlob(resolve, t, q))
    const blob = await encode(type, quality)
    if (type === 'image/png' || (blob && (blob.type === type || blob.type === 'image/png'))) return blob
    return encode('image/png')
  }
}
