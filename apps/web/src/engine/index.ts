import { nanoid } from 'nanoid'
import type { PaperType, Dab, ToolType, Operation, StrokeOperation, ImageImportOperation, LayerTransformMatrix, SelectionShape, ShapeGeometry, ShapeFrame, ShapeStroke, ShapeFill, LayerFilter } from '@grafetto/shared'
import { RIBBON_VERT, RIBBON_FRAG, DISPLAY_VERT, PAPER_COMPOSE_FRAG, LAYER_COMPOSITE_FRAG, WC_DIFFUSE_FRAG, WASH_REVEAL_FRAG, WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG, WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_CARRY_COLOUR_FRAG, WC_WATER_FRONT_FRAG, WC_BRUSH_DRAG_FRAG, WC_RESAMPLE_FRAG, SCREEN_BLIT_FRAG } from './src/raster/shaders'
import { createProgram, getUniforms, createQuadBuffer, createFullscreenQuad } from './src/raster/utils'
import { PaperState } from './src/paper/PaperState'
import { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
import { CheckpointStore, type Checkpoint } from './src/oplog/checkpointStore'
import { ScratchSlot } from './src/buffers/scratchPools'
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
import { buildRibbonBands, nibGeometry, RIBBON_FLOATS_PER_VERTEX } from './src/dabs/markerRibbon'
import { markerThinNibInkGain } from './src/dabs/markerInkGain'

/** #547 — the band vertex array a stamps-only tool hands the two band passes,
 *  which both no-op on a zero length. Shared and frozen in size rather than a
 *  fresh `new Float32Array(0)` per batch: this is on the per-pointer-event path. */
const EMPTY_BANDS = new Float32Array(0)
import { WATERCOLOR_BRISTLE_BUNDLE_PX } from './src/dabs/ribbonProfile'
import { PaperWetness, quantizeWet, isDryProfile, wetAt, wetPeak, WET_CELL_PX, WET_DRY_MS } from './src/paper/paperWetness'
import { WET_DIFFUSE_D, WET_DIFFUSE_B, WET_DIFFUSE_SCHEDULE, WET_DIFFUSE_PUDDLE_SCHEDULE, WET_DIFFUSE_REACH, WET_DIFFUSE_MOBILE, watercolorPuddleSettleWeights, WET_SETTLE_SMOOTH, WET_SETTLE_FIBRE_FROM, type WetDiffuseStep } from './src/watercolor/wetDiffusion'
export { WATERCOLOR_ROUND } from './src/presets/watercolorPresets'
import { brushDragField, type BrushTravel } from './src/watercolor/brushDrag'
import { foreignWaterStencil, type WaterFootprint, type WaterSource } from './src/watercolor/foreignWater'
import { pigmentAbsorption } from './src/watercolor/pigmentOptics'
import { isRibbonTool, ribbonProfileFor, WATERCOLOR_MIGRATION, WATERCOLOR_SPREAD, type RibbonProfile } from './src/dabs/ribbonProfile'
import {
  applyBrushPenEndTaper,
  PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, isPressureResponse, brushPenWidth,
  type PressureResponse,
} from './src/presets/brushPenPresets'
import {
  applyWatercolorEndTaper, watercolorWashSignature, watercolorFerrulePx, mottleSeedFromStrokeId,
  applyWatercolorPooling, watercolorWaterLoad, watercolorStandingWater, watercolorBrushRunsDry,
  watercolorBloomStrength, watercolorBloomPush, watercolorDampOver, watercolorWetPull, watercolorPuddleDepth, watercolorTravelQuantum, WC_FILM_DOSE, watercolorPuddleMerge, watercolorRimShare, WC_BLOOM_SHARE, WC_TIDE_STANDING_FULL, WC_TIDE_RIM, WC_RIM_BAND_PX, WC_REMOB_DOME,
  watercolorSpreadBudget, watercolorCarryStrides, watercolorFrontSteps, WC_CARRY_RATE, WC_CARRY_POW, WC_CARRY_TRAVEL, watercolorDwellWater, watercolorDwellPigment, WC_DWELL_RADIUS, watercolorTrailDwell, WC_DWELL_FLOOR_MS, WC_TRAIL_LEN, watercolorSurplus, watercolorExcessFromSurplus, watercolorPuddleFromSurplus, watercolorSlowdown, watercolorBrakeSurplus, watercolorTurnLoad, WC_SLOW_GAIN, WC_POOL_STREAK, WC_SPEED_TAU_MS, WC_PEAK_FADE_MS, WC_START_EXCESS_RADII, WC_PUDDLE_RADII, type WcTrailDab, WC_FRONT_CLIMB, WC_FRONT_FLOOR, WC_FRONT_CLIMB_IN, WC_FRONT_FLOOR_IN, WC_FRONT_DRY_COST, WC_FRONT_DRY_SHARE, watercolorPigmentLoad, watercolorPigmentRate, watercolorWaterRetention, watercolorWaterStep, watercolorWaterClock, watercolorPaperDrained, watercolorHalo, WATERCOLOR_HALO_PAST_BLOOM, WATERCOLOR_HALO_DRAWN,
  watercolorTravelRadius, watercolorSpreadRadius,
  watercolorMixFromPreset,
} from './src/presets/watercolorPresets'
import { HapticGrain, type HapticGrainStats } from './src/presets/HapticGrain'
import {
  applyMatrix, invertMatrix, toMat3, translationMatrix,
  IDENTITY_MATRIX, type Matrix3,
} from './src/raster/matrix'
import { snapToRuler, type RulerLine } from './src/input/rulerSnap'
import { TiledLayerBuffer, type TileRebuilder, type TileRebuildSession } from './src/buffers/TiledLayerBuffer'
import type { ILayerBuffer, PaintTarget } from './src/buffers/ILayerBuffer'
import { TILE_SIZE, coarseFactorFor } from './src/buffers/tileMath'
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
export { pixelWriteLayerIds } from './src/oplog/OperationLog'
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

/** (#536) The settle's working textures - see PencilEngine._diffuseFieldFor. */
type SettleField = {
  w: number; h: number
  a: AccumulationBuffer; b: AccumulationBuffer; c: AccumulationBuffer; coverage: AccumulationBuffer
  /** (#536, §17.19) The colour record's own trio, moved by the same gate. */
  ca: AccumulationBuffer; cb: AccumulationBuffer; cc: AccumulationBuffer
    mask: AccumulationBuffer; pressure: AccumulationBuffer
    band: AccumulationBuffer
}


function destroyField(f: SettleField): void {
  for (const b of [f.a, f.b, f.c, f.coverage, f.ca, f.cb, f.cc, f.mask, f.pressure, f.band]) b.destroy()
}

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
/** (#536, §17.44) From this brush radius up the settle runs at half
 *  resolution (_diffuseWashOps), and its window - and the chunk span with
 *  it - is twice as wide in the world. */
const WC_HALF_RES_RADIUS_PX = 48
/** (#536, §17.44) ...and a settle window wider than this. */
const WC_HALF_RES_SPAN_PX = 1024

/** (#536, ADR 011 §17.12) How long the screen takes to converge on a wash's
 *  settled picture after pen-up. Presentation only: the layer holds the dry
 *  target from the first frame, this is how long the eye is shown the way
 *  there. Eased fast-then-slow, which is how Ilya described the real thing:
 *  "сначала быстро, потом замедляется". */
const WC_REVEAL_MS = 1500

/** One layer tile whose wash just settled (see _revealWash). `before` is a
 *  pooled copy of what the tile showed at that moment; the composite mixes it
 *  back over the tile's real pixels by a hold that runs 1 → 0. */
interface WashReveal {
  layerId: string
  before: AccumulationBuffer
  startedAt: number
}

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

function rectOnTile(tile: PaintTarget, r: { minX: number; minY: number; maxX: number; maxY: number }): number {
  const w = Math.min(r.maxX, tile.originX + tile.buffer.width) - Math.max(r.minX, tile.originX)
  const h = Math.min(r.maxY, tile.originY + tile.buffer.height) - Math.max(r.minY, tile.originY)
  return w > 0 && h > 0 ? w * h : 0
}

/** (§17.70) Tile pixels one piece of ribbon bands covers, counting overlap:
 *  the triangles whose box meets the tile, by area. 0 means none of them can
 *  put a fragment on it (a box ending at the tile's edge covers no pixel
 *  centre of it). */
function ribbonBandPieceCost(piece: Float32Array, tile: PaintTarget): number {
  const x0 = tile.originX, y0 = tile.originY, x1 = x0 + tile.buffer.width, y1 = y0 + tile.buffer.height
  const V = RIBBON_FLOATS_PER_VERTEX
  let px = 0
  for (let i = 0; i + 3 * V <= piece.length; i += 3 * V) {
    const ax = piece[i], ay = piece[i + 1], bx = piece[i + V], by = piece[i + V + 1], cx = piece[i + 2 * V], cy = piece[i + 2 * V + 1]
    if (Math.max(ax, bx, cx) <= x0 || Math.min(ax, bx, cx) >= x1 || Math.max(ay, by, cy) <= y0 || Math.min(ay, by, cy) >= y1) continue
    px += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5
  }
  return px
}

/** (§17.70) `bands` as consecutive whole-triangle pieces of `tris` triangles
 *  (0: the whole array). Drawn in order they blend exactly as one draw does -
 *  blending follows primitive order either way. */
function ribbonBandPieces(bands: Float32Array, tris: number): Float32Array[] {
  const step = tris * 3 * RIBBON_FLOATS_PER_VERTEX
  if (tris <= 0 || bands.length <= step) return [bands]
  const out: Float32Array[] = []
  for (let i = 0; i < bands.length; i += step) out.push(bands.subarray(i, Math.min(bands.length, i + step)))
  return out
}

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
 *    _ribbonStrokeWork), not a flat per-dab amount. Deliberately separate
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
 *  (_previewBufPool, _tipBufPool, AreaOps' scratchPool, SmudgePainter's scratchPool) —
 *  the marker's was the one that was not.
 *
 *  Capped per size rather than unbounded: an infinite room's gesture can span
 *  several tiles at once, and holding every tile a session ever touched would
 *  trade this bug for a memory one. Over the cap, release really does delete.
 *  Six is two tiles' worth, which covers a bounded room (always exactly one
 *  tile) with room to spare. */
/** (#468) How many ribbon gestures/washes the replay side keeps open at once.
 *
 *  Four, because each holds three pooled buffers per tile it touches, and
 *  because the thing it has to survive is other people painting between two
 *  strokes of one wash. Past that the oldest goes back to being a seam. */
const REPLAY_RIBBON_CHUNK_SLOTS = 4
/** #702: compact GPU states retain the former spill storage cap, and also
 *  count towards the device GPU budget. No cache or memory limit is raised. */
const SPILLED_WASHES_MAX_BYTES = 128 * 1024 * 1024
/** (§17.68) How long a wash has to rest before the budget may spill it. */
const SPILL_IDLE_MS = 8000
/** (§17.68) ...and how long the whole room has to be still first. */
const WASH_QUIET_MS = 2000

/** (#536) Hair bundles across the mark, from the mark's own half-width, so a
 *  hair stays a fixed few pixels wide whatever brush is held — see
 *  WATERCOLOR_BRISTLE_BUNDLE_PX. The coordinate this scales runs -1..+1 across
 *  the whole width, so the count of bundles laid across the mark is twice this.
 *  One function for the ink pass (§17.13, where the hairs vary the delivery)
 *  and the composite (where they break the contact dry), so both count the
 *  same hair. */
function ribbonBristleCombs(profile: RibbonProfile, bristleRadiusPx: number): number {
  return profile.bristleCombs > 0
    ? Math.max(1.5, Math.min(50, bristleRadiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX))
    : 0
}

/** (#536, ADR 011 §17.11/13) The water a stroke delivers to the sheet — its
 *  nominal mix water — and how much of it dry paper keeps standing. See
 *  watercolorWaterRetention, and u_washWater in RIBBON_FRAG for how the two
 *  become the wash's standing-water record; watercolorStandingWater is the
 *  same rule on the CPU, feeding the live wetness field (§17.21). */
function ribbonWaterDelivery(profile: RibbonProfile): { water: number; retain: number } {
  if (!profile.normalizeDeposit) return { water: 0, retain: 0 }
  // The nominal mix for every stroke — a long puddle laid from a depleting
  // load read patchy, and a pigment stroke's own puddle read far weaker than
  // a clean one's — kept whole for clean water and by the load's retention
  // for pigment; the shader cuts it only where the brush has run dry.
  return {
    water: profile.waterLevel,
    retain: profile.pigmentStrength <= 0 ? 1 : watercolorWaterRetention(profile.waterLevel),
  }
}

// (#536, §17.44) 14, from 6: the half-resolution settle takes and gives back
// a snapshot pair and a temporary per tile of a big wash (six tiles on a
// sheet) around every chunk, and past six free the pool destroyed them and
// made them again - a texture, an FBO and a framebuffer-status check that
// stalls the tablet's GPU, 430 ms of a zigzag's CPU time.
const MARKER_SCRATCH_POOL_PER_SIZE = 24
/** (#536, §17.50) Ceiling on idle pooled scratch, all sizes. */
const SCRATCH_POOL_FREE_BYTES = 64 * 1024 * 1024
/** (#536, §17.22) How long after a settle the diffusion field is kept. */
// (§17.44) 45 s, from 8: remaking ten field buffers - a texture, an FBO
// and a GPU-stalling status check each - was a 100 ms hitch on the first
// chunk of the first stroke after any pause longer than eight seconds.
const WET_FIELD_RELEASE_MS = 45000

class RibbonScratchPool {
  private _free = new Map<string, AccumulationBuffer[]>()
  private readonly gl: WebGLRenderingContext
  /** (#536, §17.22) Bytes of every buffer this pool has created and not yet
   *  destroyed, and of those, the ones sitting free — for the perf readout. */
  private _allocatedBytes = 0
  private _freeBytes = 0

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
  }

  /** Live (handed out) and free bytes. */
  get bytes(): { live: number; free: number } {
    return { live: this._allocatedBytes - this._freeBytes, free: this._freeBytes }
  }

  acquire(width: number, height: number): AccumulationBuffer {
    const list = this._free.get(`${width}x${height}`)
    const reused = list?.pop()
    if (reused) { this._freeBytes -= width * height * 4; return reused }
    // 'nearest' matches what RibbonStrokeScratch has always asked for — see
    // its getOrCreate comment. The pool must never hand back a buffer built
    // with a different filter, which is why it is keyed by size alone and
    // used by this one caller.
    this._allocatedBytes += width * height * 4
    return new AccumulationBuffer(this.gl, width, height, 'nearest')
  }

  /** (§17.70) While set, released buffers are all kept: a rebuild on a
   *  low-memory device lets go of the rebuilt layer's old washes so that its
   *  own can be made from them, not from new textures. */
  holding = false

  /** (§17.70) Back to the usual ceilings once `holding` ends. */
  trimToCeiling(): void {
    for (const [key, list] of this._free) {
      while (list.length && (list.length > MARKER_SCRATCH_POOL_PER_SIZE || this._freeBytes > SCRATCH_POOL_FREE_BYTES)) {
        const b = list.pop()!
        const bytes = b.width * b.height * 4
        b.destroy()
        this._freeBytes -= bytes
        this._allocatedBytes -= bytes
      }
      if (!list.length) this._free.delete(key)
    }
  }

  release(buf: AccumulationBuffer): void {
    const key = `${buf.width}x${buf.height}`
    const bytes = buf.width * buf.height * 4
    const list = this._free.get(key)
    if (this.holding) {
      if (list) list.push(buf); else this._free.set(key, [buf])
      this._freeBytes += bytes
      return
    }
    if (!list && this._freeBytes + bytes > SCRATCH_POOL_FREE_BYTES) { buf.destroy(); this._allocatedBytes -= bytes; return }
    if (!list) { this._free.set(key, [buf]); this._freeBytes += bytes; return }
    // (#536, ADR 011 §17.50) ...and never more than SCRATCH_POOL_FREE_BYTES
    // held idle in all: on the iPad (Safari, 3 GB) 151 MB of idle buffers on
    // top of the live wash was enough for the tab to be killed and reloaded
    // at the next stroke.
    if (list.length >= MARKER_SCRATCH_POOL_PER_SIZE || this._freeBytes + bytes > SCRATCH_POOL_FREE_BYTES) { buf.destroy(); this._allocatedBytes -= bytes; return }
    list.push(buf)
    this._freeBytes += bytes
  }

  destroy(): void {
    for (const list of this._free.values()) for (const b of list) b.destroy()
    this._free.clear()
    this._allocatedBytes = 0
    this._freeBytes = 0
  }

  /** (#536, §17.57) Gives every idle buffer back to the driver. */
  trimFree(): void {
    for (const list of this._free.values()) for (const b of list) b.destroy()
    this._free.clear()
    this._allocatedBytes -= this._freeBytes
    this._freeBytes = 0
  }

  /** Context loss took every GL object with it — drop the handles without
   *  calling destroy() on them, same as every other pool in this file does. */
  forget(): void {
    this._free.clear()
    this._allocatedBytes = 0
    this._freeBytes = 0
  }
}

/** One tile's worth of a ribbon stroke's scratch state. `inkLoad` is null for a
 *  tool whose composite doesn't read one — see RibbonStrokeScratch's ctor. */
interface RibbonTileScratch {
  original: AccumulationBuffer
  coverage: AccumulationBuffer
  inkLoad: AccumulationBuffer | null
  /** (#536, §17.17) The deposit as it stood after the wash's last settle —
   *  the FIXED paint. What the diffusion moves is inkLoad minus this: the
   *  paint laid since, and only that. Null when inkLoad is. */
  inkSettled: AccumulationBuffer | null
  /** (#536, §17.19) The optical depth of the paint per texel, .rgb, and its
   *  mass in .a — the wash's colour record (pigmentOptics.ts). Written by the
   *  ink pass beside inkLoad, moved by the diffusion by the same fractions. */
  inkColor: AccumulationBuffer | null
  /** Its settled counterpart, as inkSettled is to inkLoad. */
  colorSettled: AccumulationBuffer | null
  /** (#536, s17.28) The gesture's FILM: its stamps and bands under MAX, so a
   *  texel holds the thickest thing the brush left there and never the
   *  count of overlapping stamps. inkLoad is rebuilt per batch as
   *  inkBase + strokeInk, inkBase being the wash as it stood when this
   *  gesture began (refreshed on the first batch of each gesture). The
   *  colour record has the same pair. Null until a gesture with film draws. */
  strokeInk: AccumulationBuffer | null
  inkBase: AccumulationBuffer | null
  strokeColor: AccumulationBuffer | null
  colorBase: AccumulationBuffer | null
  /** Which gesture the film buffers belong to (RibbonStrokeScratch.gesture). */
  filmGesture: number
  /** (#536, §17.42) The wash's PROVISIONAL DRY TARGET: inkLoad - the wet
   *  state, which is what the next operation of the wash starts from - with
   *  the one tide laid along the outer contour of the wash's whole coverage,
   *  recomputed at every pen-up. The composite reads this, never inkLoad,
   *  once it exists; the live batches composite inkLoad (wet plus film), so
   *  a brush touching the wash shows it wet again until the pen lifts. Null
   *  under the per-operation drying A/B (wcOpDry). */
  inkDry: AccumulationBuffer | null
  colorDry: AccumulationBuffer | null
}

/** Parked state is zero-padded in full, regardless of a display's scissor. */
function clearParkedBuffer(buffer: AccumulationBuffer): void {
  const gl = buffer.gl, scissor = gl.isEnabled(gl.SCISSOR_TEST)
  if (scissor) gl.disable(gl.SCISSOR_TEST)
  buffer.clear()
  if (scissor) gl.enable(gl.SCISSOR_TEST)
}

type ScratchBounds = { minX: number; minY: number; maxX: number; maxY: number }

class RibbonStrokeScratch {
  // #702: every rectangle written to the non-original buffers, including
  // diffusion's halo. Undefined means an older carried state has no proof
  // of its empty exterior and must be kept whole.
  private _storageBounds: ScratchBounds | null | undefined = null

  noteStorageBounds(bounds: ScratchBounds): void {
    const old = this._storageBounds
    if (old === undefined) return
    this._storageBounds = old ? {
      minX: Math.min(old.minX, bounds.minX), minY: Math.min(old.minY, bounds.minY),
      maxX: Math.max(old.maxX, bounds.maxX), maxY: Math.max(old.maxY, bounds.maxY),
    } : { ...bounds }
  }
  private _tiles = new Map<AccumulationBuffer, RibbonTileScratch>()
  private readonly pool: RibbonScratchPool
  /** (#536, §17.19) Whether tiles carry inkColor — watercolor only. */
  private readonly needsColor: boolean
  /** (#536, §17.20) Every paint laid into this wash, as colour keys. While it
   *  is one paint, the colour record is the deposit times one absorption and
   *  the diffusion need not carry it — see _diffuseWash. */
  readonly paints = new Set<string>()
  /** (#536, §17.21) What each dab of the batch just painted left standing on
   *  the sheet (watercolorStandingWater) — the ribbon build writes it, and
   *  whoever feeds the live wetness field reads it, so the field and the
   *  wash's coverage .b are fed one number. Cleared per batch; the keys are
   *  the batch's own dab objects. */
  readonly standing = new Map<Dab, number>()
  /** (#536, §17.22) Live batches no longer composite one by one: each adds
   *  its rect here, and the engine composites the union once per displayed
   *  frame (_flushLiveComposite). Keyed by tile buffer. */
  readonly pendingComposite = new Map<AccumulationBuffer, { tile: PaintTarget; bounds: { minX: number; minY: number; maxX: number; maxY: number } }>()
  private readonly needsInk: boolean
  /** (#468 v3) How much of the brush's load this gesture has spent so far,
   *  measured in brush radii of travel (ADR 011 §3.8).
   *
   *  Lives on the scratch rather than on the engine because that is the one
   *  object all three paths already share for the length of exactly one
   *  gesture: a live stroke's batches, a one-shot replay's single call, and a
   *  chunked replay's several operations. Put it on the engine and replay would
   *  either carry it between unrelated strokes or reset it at every chunk
   *  boundary — and a seam in the depletion is a visible band across the mark. */
  private _waterUsed = 0
  /** (#536, ADR 011 §17.11) Whether deposit has been laid since the wash's
   *  pigment was last diffused. The diffusion is the one pass in this tool
   *  that is *not* idempotent — every run is N more steps — so it may run
   *  exactly once per operation, on every path alike: a live chunk flush, the
   *  pen-up, a replayed chunk, a peer's operation. This flag is what makes
   *  that true whichever path calls _finishRibbonStroke and however often. */
  diffusePending = false
  /** (#536) The same clock for pigment, and the reason it is a second number
   *  rather than the same one is the brush drinking from wet paper.
   *
   *  Picking up water rewinds the water clock (watercolorWaterClock). Pigment
   *  must not come back with it: dragging a brush through a puddle of clean
   *  water does not reload it with paint, it dilutes what is left. So travel
   *  advances both, and only water is ever given back.
   *
   *  On dry paper the two are the same number to the last bit, which is what
   *  keeps every stroke that never meets water behaving exactly as it did. */
  private _pigmentUsed = 0

  /** (#468 v6) The composite's scalar uniforms, fixed for the whole gesture.
   *
   *  They cannot be per batch. The composite is a *recomputation* over a whole
   *  rect, so whichever batch wrote a pixel last decides its scalars — and with
   *  per-batch values that showed up immediately as rectangular tone blocks
   *  along a live stroke, one per pointer event, which is precisely what
   *  "штрих постоянно странно меняется" was.
   *
   *  Derived from the gesture's *first* dab, which is the one thing a live
   *  stroke and a replay of it are guaranteed to agree on: live sees it as the
   *  first dab of its first batch, a one-shot replay as the first dab of the
   *  only batch. Anything averaged over a batch would differ between the two. */
  private _composite: {
    spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; bristleRadiusPx: number
    /** (#468 v10) Where the noise fields are anchored.
     *
     *  A constant of the gesture, and that is a bug fix rather than tidiness.
     *  It used to be *this batch's* first dab, so the whole texture shifted by
     *  a few pixels on every pointer event — the mark's grain visibly crawled
     *  backwards under the pen as it was drawn, and then landed somewhere else
     *  again at pen-up, because the final pass anchored on the gesture's first
     *  dab instead. On a long straight stroke the same shifting showed up as a
     *  row of discs at the batch pitch. */
    fieldSeed: [number, number]
  } | null = null

  compositeScalars(make: () => { spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; fieldSeed: [number, number]; bristleRadiusPx: number }): { spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; fieldSeed: [number, number]; bristleRadiusPx: number } {
    if (!this._composite) this._composite = make()
    return this._composite
  }

  /** (#468 v6) The gesture's dab spacing, cached the first time two consecutive
   *  dabs are actually available.
   *
   *  Measured rather than derived, because what it has to match is
   *  DabSystem's `baseSize * spacingFactor` — and `baseSize` is the tool's
   *  *nominal* size, which no operation records: dabs carry their post-pressure,
   *  post-taper sizes instead. The distance between the stroke's own first two
   *  dabs is that spacing, and it is the same pair of dabs whether they arrive
   *  in one replayed batch or across two live ones (the second case reaches
   *  them through prevDab), so both paths measure the identical number.
   *
   *  Zero until a pair exists — a first batch of exactly one dab covers a few
   *  px at the stroke's start, and the next batch's padded rect recomposites it
   *  anyway. */
  private _dabSpacing = 0
  /** (#468 v6) Everything the gesture's final recomposite needs, plus the union
   *  of every batch's bounds.
   *
   *  It exists because reasoning about whether the incremental per-batch
   *  composites are *sufficient* turned out to be a trap: three plausible
   *  arguments that they were, and a measured 26% of the mark still differing
   *  between a live stroke and a replay of it. So the last thing a gesture does
   *  is now exactly what a replay does — one composite over the whole mark with
   *  the finished buffers — and the two agree by construction rather than by
   *  argument.
   *
   *  This is not the old settle pass. That one *introduced* terms the live
   *  batches had switched off, and re-read scalars from the first batch, which
   *  is why the mark jumped at pen-up. Every scalar here is already a constant
   *  of the gesture, so the final pass recomputes the same values the batches
   *  did — it only fixes pixels that were composited before all their ink had
   *  arrived. */
  private _finish: {
    target: ILayerBuffer; preset: PencilPreset; profile: RibbonProfile
    color: [number, number, number]; opacity: number
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    fieldSeed: [number, number]
    /** (#536, §17.23) The recorded wetness of the paper where this operation
     *  LANDED — its first dab's digit — so the settle can tell a drop into a
     *  damp wash (a bloom) from one into a wet or a dry one. The first dab,
     *  as everything else the gesture decides once (see _paintRibbonDabs):
     *  it is the one sample a live stroke and its replay are sure to share,
     *  and the profile after it is strided and trimmed. */
    landedWet: number
    /** (#536, §17.25) The wettest paper the operation ran over (wetPeak):
     *  whether its water joined a puddle already there. */
    wetPeak: number
    /** (#536, §17.23) The widest dab radius of the operation, px. */
    radiusPx: number
    /** (#536, §17.37) How long the brush stood on landing, ms. */
    dwellMs: number
  } | null = null

  /** (#536, §17.42) What the group tide needs when the wash dries as one
   *  component (watercolorDryWash): the composite's constants from the LAST
   *  settled operation, the widest radius and the wettest standing level
   *  of any, and the union of every settle's bounds. Set by the settle. */
  dryCtx: {
    target: ILayerBuffer; preset: PencilPreset; profile: RibbonProfile
    color: [number, number, number]; opacity: number; fieldSeed: [number, number]
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    radiusPx: number; standing: number
  } | null = null

  noteFinish(ctx: NonNullable<RibbonStrokeScratch['_finish']>): void {
    this.noteStorageBounds(ctx.bounds)
    const prev = this._finish
    if (!prev) { this._finish = ctx; return }
    prev.dwellMs = Math.max(prev.dwellMs, ctx.dwellMs)
    prev.bounds = {
      minX: Math.min(prev.bounds.minX, ctx.bounds.minX),
      minY: Math.min(prev.bounds.minY, ctx.bounds.minY),
      maxX: Math.max(prev.bounds.maxX, ctx.bounds.maxX),
      maxY: Math.max(prev.bounds.maxY, ctx.bounds.maxY),
    }
    prev.radiusPx = Math.max(prev.radiusPx, ctx.radiusPx)
    // A stroke can enter a puddle after its first live batch. Retain the
    // wettest landing across every batch, just as a single-batch replay does.
    prev.wetPeak = Math.max(prev.wetPeak, ctx.wetPeak)
  }

  get finishContext(): RibbonStrokeScratch['_finish'] {
    return this._finish
  }

  /** The scratch this tile already has, or null — deliberately not getOrCreate:
   *  a tile inside the gesture's bounding box that its dabs never reached has
   *  nothing to recomposite, and snapshotting one would spend three pooled
   *  buffers writing it back unchanged. */
  peek(tile: AccumulationBuffer): RibbonTileScratch | null {
    return this._tiles.get(tile) ?? null
  }

  /** (#579) The digital watercolor's wet-edge reach, fixed by the gesture's
   *  first dab — the same "first dab is what live and replay agree on" rule
   *  as the spacing below. A per-batch value would draw a rim of a different
   *  width across every batch boundary. */
  private _brushEdgePx = 0

  noteBrushEdgePx(px: number): number {
    if (this._brushEdgePx === 0 && px > 0) this._brushEdgePx = px
    return this._brushEdgePx
  }

  noteDabSpacing(gap: number): number {
    if (this._dabSpacing === 0 && gap > 0.01) this._dabSpacing = gap
    return this._dabSpacing
  }

  /** (#468 v8) The gesture's opening direction, cached the first time a real
   *  segment exists. Same first-two-dabs rule the spacing follows, and for the
   *  same reason: it is the one measurement a live stroke and a replay of it
   *  are guaranteed to agree on. */
  private _dir: [number, number] = [1, 0]
  private _dirSet = false

  noteDirection(dx: number, dy: number): [number, number] {
    if (!this._dirSet) {
      const len = Math.hypot(dx, dy)
      if (len > 0.01) { this._dir = [dx / len, dy / len]; this._dirSet = true }
    }
    return this._dir
  }

  get waterUsed(): number {
    return this._waterUsed
  }

  get pigmentUsed(): number {
    return this._pigmentUsed
  }

  advanceWater(water: number, pigment: number): void {
    this._waterUsed = water
    this._pigmentUsed = pigment
  }

  /** (#468 v7) A new stroke joins this wash. Only the brush's own load resets —
   *  lifting the brush and putting it back down means a freshly charged brush,
   *  but the paint already on the paper is still there and still wet.
   *
   *  Everything else deliberately survives: the frozen pre-wash content, the
   *  accumulated coverage and deposit, the noise field's seed and the composite
   *  scalars. That is what makes a second band laid beside the first merge with
   *  it instead of arriving as another mark on top — the two share one
   *  silhouette, so there is no boundary between them to draw, and only the
   *  outer perimeter of the whole wash gets a tideline. */
  /** (§17.28) The last dab that deposited — the anchor the travel quantum
   *  measures from (watercolorTravelQuantum). Per gesture. */
  lastKept: Dab | undefined = undefined
  /** (§17.28) Counts the gestures of this wash; the film buffers of a tile
   *  are refreshed when a batch arrives from a gesture they were not made for. */
  gesture = 0
  /** (#536, §17.37) The gesture's landing: where the nib came down and its
   *  radius there, and how long it stood within WC_DWELL_RADIUS of it before
   *  moving on (the dabs' own clock, Dab.t). Frozen once a dab leaves. Per
   *  gesture, and a pure function of the operation's dabs, so a replay
   *  counts the same dwell to the millisecond. */
  landing: { x: number; y: number; r: number; t: number } | null = null
  dwellMs = 0
  dwellDone = false
  /** (#680, §17.74) The gesture's recent kept dabs (oldest first, at most
   *  WC_TRAIL_LEN), the dwell at every dab is read back over; and the brush's
   *  surplus the slowdowns left - pigment and water - with the pigment clock
   *  it was last carried to. Per gesture, a pure function of its dabs. */
  turnOffset: [number, number] = [0, 0]
  turnDirection: [number, number] | null = null
  brushTravel: BrushTravel[] = []
  foreignSources: WaterSource[] | null = null
  wetContacts: WaterFootprint[] = []
  trail: WcTrailDab[] = []
  /** (#680) The pen's smoothed speed (px/ms) and its recent peak. */
  speed = 0
  speedPeak = 0
  speedAt = -1
  speedTravel = 0
  brakePigment = 0
  surplusPigment = 0
  surplusWater = 0
  surplusAt = 0
  /** (#536, §17.43) Ends the gesture's FILM without ending the gesture: the
   *  next batch starts a fresh film over the wash as the settle just left
   *  it. Called at a chunk boundary, live and on replay alike, right after
   *  the chunk's settle has landed — the film's base is refreshed from
   *  inkLoad on the next batch (filmBuffers), so the settled chunk is what
   *  the rest of the stroke paints over. Without this the next batch rebuilt
   *  inkLoad as the PRE-gesture base plus the whole film and threw the
   *  chunk's settle away — live only sometimes, by frame timing, so a long
   *  stroke came back different after a reload. */
  newFilm(): void {
    this.brushTravel = []
    this.gesture++
  }

  /** (#536, §17.43) Gives the film buffers back once a settle has landed:
   *  four tile-sized textures per tile that are only read between the first
   *  batch of a gesture and its settle, and were held for the life of the
   *  wash - with the replay cache's four washes that was 384 MB of scratch
   *  on a two-tile layer, and the rebuild behind an undo on top of it. The
   *  next gesture (or chunk) acquires them again from the pool. */
  releaseFilm(gesture = this.gesture): void {
    for (const entry of this._tiles.values()) {
      // Only the film the landed settle consumed: a chunk's settle lands
      // while the next chunk's film is being painted.
      if (entry.filmGesture !== gesture) continue
      for (const b of [entry.strokeInk, entry.inkBase, entry.strokeColor, entry.colorBase]) if (b) this.pool.release(b)
      entry.strokeInk = null; entry.inkBase = null; entry.strokeColor = null; entry.colorBase = null
      entry.filmGesture = -1
    }
  }

  beginStroke(): void {
    this.lastKept = undefined
    this.gesture++
    this.turnOffset = [0, 0]
    this.turnDirection = null
    this.landing = null
    this.dwellMs = 0
    this.dwellDone = false
    this.trail = []
    this.speed = 0
    this.speedPeak = 0
    this.speedAt = -1
    this.speedTravel = 0
    this.brushTravel = []
    this.foreignSources = null
    this.wetContacts = []
    this.brakePigment = 0
    this.surplusPigment = 0
    this.surplusWater = 0
    this.surplusAt = 0
    this._waterUsed = 0
    // (#536) Including everything the brush drank from the paper last stroke.
    // The exchange is intra-stroke by decision — see watercolorWaterClock's own
    // note on why the brush is not allowed hidden state that outlives a mark.
    this._pigmentUsed = 0
    // (#536, §17.23) The finish context is the GESTURE's: its bounds, its
    // landing wetness, its radius. It used to outlive the stroke, so every
    // pen-up of a wash recomposited the union of every stroke so far and
    // read the first stroke's landing for the bloom of the last.
    this._finish = null
  }

  /** `needsInk` false skips the third buffer entirely (#454): a covering,
   *  source-over ink has no per-pixel pigment quantity for the composite to
   *  read, so allocating and clearing one per tile would be a buffer and two
   *  draw calls spent on a value nothing samples. See RibbonProfile.ink. */
  constructor(pool: RibbonScratchPool, needsInk = true, needsColor = false) {
    this.pool = pool
    this.needsInk = needsInk
    this.needsColor = needsColor
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
  /** (§17.28) The gesture's film buffers for a tile, made or refreshed for
   *  the current gesture: the base is the deposit as it stands now, the film
   *  starts empty. */
  filmBuffers(tile: AccumulationBuffer): { strokeInk: AccumulationBuffer; inkBase: AccumulationBuffer; strokeColor: AccumulationBuffer | null; colorBase: AccumulationBuffer | null } | null {
    const entry = this.getOrCreate(tile)
    if (!entry.inkLoad) return null
    if (entry.filmGesture !== this.gesture) {
      entry.strokeInk ??= this.pool.acquire(tile.width, tile.height)
      entry.inkBase ??= this.pool.acquire(tile.width, tile.height)
      entry.strokeInk.clear()
      entry.inkLoad.copyTo(entry.inkBase)
      if (entry.inkColor) {
        entry.strokeColor ??= this.pool.acquire(tile.width, tile.height)
        entry.colorBase ??= this.pool.acquire(tile.width, tile.height)
        entry.strokeColor.clear()
        entry.inkColor.copyTo(entry.colorBase)
      }
      entry.filmGesture = this.gesture
    }
    return { strokeInk: entry.strokeInk!, inkBase: entry.inkBase!, strokeColor: entry.strokeColor, colorBase: entry.colorBase }
  }

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
      let inkColor: AccumulationBuffer | null = null
      if (this.needsInk) {
        inkLoad = this.pool.acquire(tile.width, tile.height)
        inkLoad.clear()
        if (this.needsColor) {
          inkColor = this.pool.acquire(tile.width, tile.height)
          inkColor.clear()
        }
      }
      // The settled pair is taken on the first settle, by the pass that needs
      // it — a marker gesture never does, and three buffers a tile was already
      // the churn #385 is about.
      entry = { original, coverage, inkLoad, inkSettled: null, inkColor, colorSettled: null, strokeInk: null, inkBase: null, strokeColor: null, colorBase: null, filmGesture: -1, inkDry: null, colorDry: null }
      this._tiles.set(tile, entry)
    }
    return entry
  }

  /** Ends this gesture's use of its buffers. Named as it always was, and it
   *  still means "this scratch is finished with" — what changed (#385) is that
   *  the buffers go back to the pool instead of to the driver. */
  destroy(): void {
    this._storageBounds = null
    this._waterUsed = 0
    this._pigmentUsed = 0
    this.diffusePending = false
    this.pendingComposite.clear()
    this._composite = null
    this._dabSpacing = 0
    this._brushEdgePx = 0
    this._dirSet = false
    this._dir = [1, 0]
    this._finish = null
    for (const { original, coverage, inkLoad, inkSettled, inkColor, colorSettled, strokeInk, inkBase, strokeColor, colorBase, inkDry, colorDry } of this._tiles.values()) {
      for (const b of [strokeInk, inkBase, strokeColor, colorBase, inkDry, colorDry]) if (b) this.pool.release(b)
      this.pool.release(original); this.pool.release(coverage)
      if (inkLoad) this.pool.release(inkLoad)
      if (inkSettled) this.pool.release(inkSettled)
      if (inkColor) this.pool.release(inkColor)
      if (colorSettled) this.pool.release(colorSettled)
    }
    this._tiles.clear()
  }

  /** Context loss: the GL objects are already dead, so neither release nor
   *  destroy is meaningful — just let go of them. */
  forget(): void {
    this._tiles.clear()
    this.pendingComposite.clear()
  }

  /** (#536, §17.22) Whether this scratch still holds its tiles — false once
   *  destroyed or forgotten, which is how a settle in flight learns that the
   *  wash it was settling is gone. */
  get live(): boolean {
    return this._tiles.size > 0
  }

  /** (#536, §17.56) The wash as the next operation of it will find it, at an
   *  operation boundary: every texture that outlives a gesture's film, copied
   *  into buffers of its own (the checkpoint keeps them; this scratch goes on
   *  being painted), and every number the next operation reads. The film is
   *  not taken — at a boundary it is released or about to be refreshed for a
   *  new gesture (filmBuffers), so the restored tile starts without one.
   *  `originOf` names each tile by its place on the sheet: the replay that
   *  restores this paints into another buffer. */
  snapshot(gl: WebGLRenderingContext, originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): ScratchSnapshot | null {
    const tiles: ScratchSnapshot['tiles'] = []
    for (const [tile, entry] of this._tiles) {
      const at = originOf(tile)
      if (!at) return null
      const bufs: ScratchSnapshot['tiles'][number]['bufs'] = {}
      for (const k of SNAPSHOT_TILE_BUFFERS) {
        const b = entry[k]
        if (!b) continue
        const copy = new AccumulationBuffer(gl, b.width, b.height, 'nearest')
        b.copyTo(copy)
        bufs[k] = copy
      }
      tiles.push({ ...at, width: tile.width, height: tile.height, bufs })
    }
    return { ...this._scalars(), tiles }
  }

  /** Every number the next operation of this wash reads - see snapshot. */
  private _scalars(): ScratchScalars {
    return {
      needsInk: this.needsInk, needsColor: this.needsColor,
      storageBounds: this._storageBounds ? { ...this._storageBounds } : this._storageBounds,
      paints: [...this.paints], waterUsed: this._waterUsed, pigmentUsed: this._pigmentUsed,
      composite: this._composite ? { ...this._composite, fieldSeed: [...this._composite.fieldSeed] } : null,
      dabSpacing: this._dabSpacing, brushEdgePx: this._brushEdgePx, dir: [...this._dir], dirSet: this._dirSet,
      finish: this._finish ? { ...this._finish, bounds: { ...this._finish.bounds }, fieldSeed: [...this._finish.fieldSeed] } : null,
      dryCtx: this.dryCtx ? { ...this.dryCtx, bounds: { ...this.dryCtx.bounds }, fieldSeed: [...this.dryCtx.fieldSeed] } : null,
      lastKept: this.lastKept ? { ...this.lastKept } : undefined, gesture: this.gesture,
      landing: this.landing ? { ...this.landing } : null, dwellMs: this.dwellMs, dwellDone: this.dwellDone,
      turnOffset: [...this.turnOffset], turnDirection: this.turnDirection ? [...this.turnDirection] : null, brushTravel: this.brushTravel.map(d => ({ ...d })), foreignSources: this.foreignSources, wetContacts: this.wetContacts.map(d => ({ ...d })),
      trail: this.trail.map(d => ({ ...d })), speed: this.speed, speedPeak: this.speedPeak, speedAt: this.speedAt, speedTravel: this.speedTravel, brakePigment: this.brakePigment, surplusPigment: this.surplusPigment, surplusWater: this.surplusWater, surplusAt: this.surplusAt,
    }
  }

  private _applyScalars(snap: ScratchScalars, target: ILayerBuffer): void {
    this._storageBounds = snap.storageBounds ? { ...snap.storageBounds } : snap.storageBounds
    for (const p of snap.paints) this.paints.add(p)
    this._waterUsed = snap.waterUsed
    this._pigmentUsed = snap.pigmentUsed
    this._composite = snap.composite ? { ...snap.composite, fieldSeed: [...snap.composite.fieldSeed] } : null
    this._dabSpacing = snap.dabSpacing
    this._brushEdgePx = snap.brushEdgePx
    this._dir = [snap.dir[0], snap.dir[1]]
    this._dirSet = snap.dirSet
    this._finish = snap.finish ? { ...snap.finish, target, bounds: { ...snap.finish.bounds }, fieldSeed: [...snap.finish.fieldSeed] } : null
    this.dryCtx = snap.dryCtx ? { ...snap.dryCtx, target, bounds: { ...snap.dryCtx.bounds }, fieldSeed: [...snap.dryCtx.fieldSeed] } : null
    this.lastKept = snap.lastKept ? { ...snap.lastKept } : undefined
    this.gesture = snap.gesture
    this.landing = snap.landing ? { ...snap.landing } : null
    this.dwellMs = snap.dwellMs
    this.dwellDone = snap.dwellDone
    this.turnOffset = [...snap.turnOffset]
    this.turnDirection = snap.turnDirection ? [...snap.turnDirection] : null
    this.brushTravel = snap.brushTravel.map(d => ({ ...d }))
    this.foreignSources = snap.foreignSources
    this.wetContacts = snap.wetContacts.map(d => ({ ...d }))
    this.trail = snap.trail.map(d => ({ ...d }))
    this.speed = snap.speed
    this.speedPeak = snap.speedPeak
    this.speedAt = snap.speedAt
    this.speedTravel = snap.speedTravel
    this.brakePigment = snap.brakePigment
    this.surplusPigment = snap.surplusPigment
    this.surplusWater = snap.surplusWater
    this.surplusAt = snap.surplusAt
  }

  /** #702: park a resting wash in compact GPU buffers. CPU readback waits
   * for the whole context's queue, even for 1x1, so it cannot be a background
   * memory operation. Keep original whole: a continuation may enter a new
   * area whose pre-wash picture must still be the same. Other buffers start
   * clear and only receive writes inside storageBounds. GPU sub-rect copies
   * preserve every byte; unpark clears the missing exterior. */
  spill(originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): SpilledScratch | null {
    const work = this.spillWork(originOf)
    let r = work.next()
    while (!r.done) r = work.next()
    return r.value
  }

  *spillWork(originOf: (tile: AccumulationBuffer) => { originX: number; originY: number } | null): Generator<void, SpilledScratch | null, void> {
    if (this.diffusePending || this.pendingComposite.size) return null
    const tiles: SpilledScratch['tiles'] = []
    const owned = new Set<AccumulationBuffer>(), moved = new Set<AccumulationBuffer>()
    let bytes = 0, committed = false
    const takeBuffer = (b: AccumulationBuffer): void => { owned.delete(b) }
    const releaseBuffer = (b: AccumulationBuffer): void => { if (owned.delete(b)) this.pool.release(b) }
    const dispose = (): void => { for (const b of owned) this.pool.release(b); owned.clear() }
    try {
      for (const [tile, entry] of this._tiles) {
        if (entry.strokeInk || entry.inkBase || entry.strokeColor || entry.colorBase) return null
        const at = originOf(tile)
        if (!at) return null
        const bufs: SpilledScratch['tiles'][number]['bufs'] = {}
        const whole = (b: AccumulationBuffer): ParkedScratchBuffer => {
          moved.add(b); bytes += b.width * b.height * 4
          return { buffer: b, glX: 0, glY: 0, srcX: 0, srcY: 0, w: b.width, h: b.height, whole: true }
        }
        bufs.original = whole(entry.original)
        const parts = SPILL_TILE_BUFFERS.filter(k => k !== 'original' && entry[k])
        const bounds = this._storageBounds
        const x0 = bounds ? Math.max(0, Math.floor(bounds.minX - at.originX)) : 0
        const y0 = bounds ? Math.max(0, Math.floor(bounds.minY - at.originY)) : 0
        const x1 = bounds ? Math.min(tile.width, Math.ceil(bounds.maxX - at.originX)) : tile.width
        const y1 = bounds ? Math.min(tile.height, Math.ceil(bounds.maxY - at.originY)) : tile.height
        const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0)
        const columns = Math.max(1, Math.floor(tile.width / w)), rows = Math.max(1, Math.floor(tile.height / h))
        const capacity = columns * rows
        const atlasCount = Math.ceil(parts.length / capacity)
        // Tile-sized atlases reuse the film's released buffers. Arbitrarily
        // sized small textures were themselves 100ms allocations on Safari.
        // When packing saves no memory, move the original buffers instead.
        if (atlasCount >= parts.length) {
          for (const k of parts) bufs[k] = whole(entry[k]!)
        } else {
          let atlas: AccumulationBuffer | undefined
          for (const [i, k] of parts.entries()) {
            if (i % capacity === 0) {
              atlas = this.pool.acquire(tile.width, tile.height)
              owned.add(atlas); bytes += tile.width * tile.height * 4
            }
            const srcX = (i % capacity % columns) * w, srcY = Math.floor(i % capacity / columns) * h
            const glX = Math.min(tile.width - 1, x0), glY = Math.min(tile.height - 1, Math.max(0, tile.height - y1))
            if (x1 > x0 && y1 > y0) entry[k]!.copyRegionInto(atlas!, glX, glY, srcX, srcY, w, h)
            else {
              // A present-but-empty field must remain present after restore.
              // Empty intersects are rare, so a full clear is safe and cheap.
              clearParkedBuffer(atlas!)
            }
            bufs[k] = { buffer: atlas!, glX, glY, srcX, srcY, w, h, whole: false }
            yield
          }
        }
        tiles.push({ ...at, width: tile.width, height: tile.height, bufs })
      }
      const result = { ...this._scalars(), tiles, bytes, dispose, takeBuffer, releaseBuffer }
      // Ownership moves only on successful completion. Until now the active
      // scratch was untouched and cancellation can simply release its copies.
      for (const b of moved) owned.add(b)
      for (const entry of this._tiles.values()) for (const k of SPILL_TILE_BUFFERS) {
        const b = entry[k]
        if (b && !moved.has(b)) this.pool.release(b)
      }
      this._tiles.clear()
      committed = true
      return result
    } finally { if (!committed) dispose() }
  }

  /** A parked wash back in full-sized, zero-padded scratch buffers. */
  static unspill(pool: RibbonScratchPool, sp: SpilledScratch, target: ILayerBuffer): RibbonStrokeScratch | null {
    const s = new RibbonStrokeScratch(pool, sp.needsInk, sp.needsColor)
    s._applyScalars(sp, target)
    const references = new Map<AccumulationBuffer, number>()
    for (const t of sp.tiles) for (const p of Object.values(t.bufs)) if (p) {
      references.set(p.buffer, (references.get(p.buffer) ?? 0) + 1)
    }
    try {
      for (const t of sp.tiles) {
        const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
        const tile = target.resolveForPaint(rect).find(r => r.originX === t.originX && r.originY === t.originY)?.buffer
        if (!tile) { s.destroy(); return null }
        const take = (p: ParkedScratchBuffer | undefined): AccumulationBuffer | null => {
          if (!p) return null
          if (p.whole) { sp.takeBuffer(p.buffer); return p.buffer }
          const own = pool.acquire(t.width, t.height)
          clearParkedBuffer(own)
          p.buffer.copyRegionInto(own, p.srcX, p.srcY, p.glX, p.glY, p.w, p.h)
          const left = references.get(p.buffer)! - 1
          references.set(p.buffer, left)
          // Reuse a consumed atlas for later full-sized fields rather than
          // allocating a texture while continuing the wash.
          if (left === 0) sp.releaseBuffer(p.buffer)
          return own
        }
        const original = take(t.bufs.original), coverage = take(t.bufs.coverage)
        if (!original || !coverage) { if (original) pool.release(original); if (coverage) pool.release(coverage); s.destroy(); return null }
        s._tiles.set(tile, {
          original, coverage, inkLoad: take(t.bufs.inkLoad), inkSettled: take(t.bufs.inkSettled),
          inkColor: take(t.bufs.inkColor), colorSettled: take(t.bufs.colorSettled),
          strokeInk: null, inkBase: null, strokeColor: null, colorBase: null, filmGesture: -1,
          inkDry: take(t.bufs.inkDry), colorDry: take(t.bufs.colorDry),
        })
      }
      return s
    } finally { sp.dispose() }
  }

  /** (#536, §17.56) A scratch as `snap` describes it, its tiles copied into
   *  pooled buffers and keyed by `target`'s own tiles at the same places. */
  static restore(pool: RibbonScratchPool, snap: ScratchSnapshot, target: ILayerBuffer): RibbonStrokeScratch {
    const s = new RibbonStrokeScratch(pool, snap.needsInk, snap.needsColor)
    s._applyScalars(snap, target)
    for (const t of snap.tiles) {
      const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
      const tile = target.resolveForPaint(rect).find(r => r.originX === t.originX && r.originY === t.originY)?.buffer
      if (!tile) continue
      const take = (b: AccumulationBuffer | undefined): AccumulationBuffer | null => {
        if (!b) return null
        const own = pool.acquire(b.width, b.height)
        b.copyTo(own)
        return own
      }
      const original = take(t.bufs.original), coverage = take(t.bufs.coverage)
      if (!original || !coverage) continue
      s._tiles.set(tile, {
        original, coverage, inkLoad: take(t.bufs.inkLoad), inkSettled: take(t.bufs.inkSettled),
        inkColor: take(t.bufs.inkColor), colorSettled: take(t.bufs.colorSettled),
        strokeInk: null, inkBase: null, strokeColor: null, colorBase: null, filmGesture: -1,
        inkDry: null, colorDry: null,
      })
    }
    return s
  }
}

/** (#536, §17.56) The tile textures of a wash that outlive a gesture. Not
 *  the provisional dry picture (inkDry/colorDry): the next operation's settle
 *  lays it again before the composite reads it, and leaving it out was the
 *  same to a level on the devices and a quarter less memory (80 MB of
 *  carried washes on the iPad instead of 96). */
const SNAPSHOT_TILE_BUFFERS = ['original', 'coverage', 'inkLoad', 'inkSettled', 'inkColor', 'colorSettled'] as const

/** (#536, §17.56) A checkpoint's carried wash: its scratch as the replay cache
 *  would hold it at the checkpoint. */
interface CarriedWash { key: string; userId: string; washStrokeId: string | undefined; lastDab: Dab; snap: ScratchSnapshot }

function scratchSnapshotBytes(snap: ScratchSnapshot): number {
  let n = 0
  for (const t of snap.tiles) for (const b of Object.values(t.bufs)) if (b) n += b.width * b.height * 4
  return n
}

function freeScratchSnapshot(snap: ScratchSnapshot): void {
  for (const t of snap.tiles) for (const b of Object.values(t.bufs)) b?.destroy()
}

/** (#536, §17.56) Every number of a RibbonStrokeScratch the next operation
 *  of its wash reads. */
interface ScratchScalars {
  storageBounds?: ScratchBounds | null
  needsInk: boolean; needsColor: boolean
  paints: string[]; waterUsed: number; pigmentUsed: number
  composite: { spreadPx: number; inkSmoothPx: number; water: number; migratePx: number; bristleRadiusPx: number; fieldSeed: [number, number] } | null
  dabSpacing: number; brushEdgePx: number; dir: [number, number]; dirSet: boolean
  finish: Omit<NonNullable<RibbonStrokeScratch['finishContext']>, 'target'> | null
  dryCtx: Omit<NonNullable<RibbonStrokeScratch['dryCtx']>, 'target'> | null
  lastKept: Dab | undefined; gesture: number
  landing: { x: number; y: number; r: number; t: number } | null; dwellMs: number; dwellDone: boolean
  turnOffset: [number, number]; turnDirection: [number, number] | null; brushTravel: BrushTravel[]; foreignSources: WaterSource[] | null; wetContacts: WaterFootprint[]
  trail: WcTrailDab[]; speed: number; speedPeak: number; speedAt: number; speedTravel: number; brakePigment: number; surplusPigment: number; surplusWater: number; surplusAt: number
}

/** (#536, §17.56) See RibbonStrokeScratch.snapshot. */
interface ScratchSnapshot extends ScratchScalars {
  tiles: Array<{ originX: number; originY: number; width: number; height: number; bufs: Partial<Record<typeof SNAPSHOT_TILE_BUFFERS[number], AccumulationBuffer>> }>
}

/** (#536, §17.68) Every tile buffer of an open wash at rest. */
const SPILL_TILE_BUFFERS = ['original', 'coverage', 'inkLoad', 'inkSettled', 'inkColor', 'colorSettled', 'inkDry', 'colorDry'] as const

/** (§17.68) See RibbonStrokeScratch.spill. */
interface ParkedScratchBuffer { buffer: AccumulationBuffer; glX: number; glY: number; srcX: number; srcY: number; w: number; h: number; whole: boolean }
interface SpilledScratch extends ScratchScalars {
  tiles: Array<{ originX: number; originY: number; width: number; height: number; bufs: Partial<Record<typeof SPILL_TILE_BUFFERS[number], ParkedScratchBuffer>> }>
  bytes: number
  dispose(): void
  takeBuffer(buffer: AccumulationBuffer): void
  releaseBuffer(buffer: AccumulationBuffer): void
}

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
  /** (#536, §17.57) Who painted each replay-cache key - see _retireWashesOf. */
  private _chunkAuthors = new Map<string, string>()
  /** (#702) Resting washes parked in compact GPU buffers. Their bytes are
   *  included in the same pool/device budget as active scratch. The next
   *  operation restores zero padding and continues the exact stored state.
   *  Keyed as the cache is; `target` is the layer buffer it mirrors. */
  private _spilledWashes = new Map<string, {
    target: ILayerBuffer; userId: string | undefined; washStrokeId?: string; lastDab: Dab; spill: SpilledScratch
  }>()
  /** (§17.68) Open washes whose state could be neither kept nor spilled. Their
   *  next operation cannot be painted as everyone else paints it - so it
   *  rebuilds the layer instead, which replays the wash from its start. */
  private _lostWashes = new Map<string, ILayerBuffer>()
  /** (§17.70) The spill in progress, a buffer per step, and the washes the
   *  cache's slots are waiting to see spilled after it. */
  private _spillJob: { work: Generator<void, SpilledScratch | null, void>; key: string; scratch: RibbonStrokeScratch; usedAt: number; timer: ReturnType<typeof setTimeout> | 0 } | null = null
  private _spillPumpTimer: ReturnType<typeof setTimeout> | 0 = 0
  /** (§17.70) A rebuild's step is running: the cache is the job's own. */
  private _inJobStep = false
  private _replayRibbonChunks = new Map<string, {
    /** The grouping key: a wash id where the stroke has one, its gesture id
     *  otherwise (#468 v7). */
    strokeId: string
    /** Which *gesture* the last chunk belonged to, so a wash can tell one of
     *  its strokes ending from a gesture's chunk boundary. */
    washStrokeId?: string
    target: ILayerBuffer
    scratch: RibbonStrokeScratch
    lastDab: Dab
    /** (§17.68) performance.now() of its last operation - see _enforceGpuBudget. */
    usedAt?: number
  }>()

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

  // WebGL programs and uniforms — assigned in _initGL()
  /** (#494) The plain dab program — StampPainter owns it (it is the stamps'
   *  uniform fallback); the ribbon passes draw through it by these names. */
  private get _dabProg(): WebGLProgram { return this._stamps.program }
  private get _dabUni(): Record<string, WebGLUniformLocation | null> { return this._stamps.uniforms }
  private get _dabPosLoc(): number { return this._stamps.positionLoc }
  private _compositeProg!: WebGLProgram
  /** (#536, §17.12) LAYER_COMPOSITE_FRAG's twin for a tile still converging on
   *  a settled wash — see WashReveal. */
  private _revealProg!: WebGLProgram
  /** (#536, §17.17) WC_FIELD_OP_FRAG — the diffusion's fixed/mobile split. */
  private _fieldOpProg!: WebGLProgram
  private _fieldOpUni!: Record<string, WebGLUniformLocation | null>
  /** (#685) Modes 10-20 except the carry (15/16), linked separately. */
  private _fieldOpHighProg!: WebGLProgram
  private _fieldOpHighUni!: Record<string, WebGLUniformLocation | null>
  private _fieldOpHighPosLoc!: number
  private _fieldOpCarryProg!: WebGLProgram
  private _fieldOpCarryUni!: Record<string, WebGLUniformLocation | null>
  private _fieldOpCarryPosLoc!: number
  private _fieldOpCarryColourProg!: WebGLProgram
  private _fieldOpCarryColourUni!: Record<string, WebGLUniformLocation | null>
  private _fieldOpCarryColourPosLoc!: number
  private _fieldOpPosLoc = -1
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
  /** (#536, §17.44) WC_RESAMPLE_FRAG - tile <-> half-resolution settle field. */
  private _resampleProg!: WebGLProgram
  private _resampleUni!: Record<string, WebGLUniformLocation | null>
  private _resamplePosLoc = -1
  private _revealUni!: Record<string, WebGLUniformLocation | null>
  private _revealPosLoc = -1
  /** Keyed by the layer tile the wash settled into. Presentation state only:
   *  never read by any paint pass, never serialised, dropped with the tile. */
  private _washReveals = new Map<AccumulationBuffer, WashReveal>()
  private _revealTimer = 0
  /** (#536, §17.22) The author's pen-up settle in flight: the diffusion's
   *  GPU steps, run a few per animation frame under the reveal instead of
   *  all at once — 89 ms in one go for a 400 px brush on a desktop GPU, a
   *  visible hitch at every pen-up on a tablet. One at a time, by design:
   *  the steps run over the shared _diffuseField, so anything that needs the
   *  field (another settle, a replay's) drains this one first. */
  private _settle: {
    scratch: RibbonStrokeScratch
    ops: Array<() => void>
    next: number
    complete: () => void
    raf: number
  } | null = null
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
  private _liveComposite: {
    scratch: RibbonStrokeScratch
    preset: PencilPreset
    profile: RibbonProfile
    color: [number, number, number]
    opacity: number
    fieldSeed: [number, number]
    spreadPx: number
    fringeWater: number
    migratePx: number
    inkSmoothPx: number
    strokeDir: [number, number]
    bristleRadiusPx: number
  } | null = null
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
  // Marker ribbon (#330 stage 2) — the bands between consecutive nib stamps
  // (markerRibbon.ts). Its own tiny program: unlike every other dab draw, the
  // vertices arrive already positioned by the CPU and carry a per-vertex
  // distance-to-edge, so neither DAB_VERT's uniforms nor DAB_FRAG's branches
  // apply.
  private _ribbonProg!: WebGLProgram
  private _ribbonUni!: Record<string, WebGLUniformLocation | null>
  /** (#536) One step of pigment diffusion in standing water — see
   *  WC_DIFFUSE_FRAG and wetDiffusion.ts. */
  private _diffuseProg!: WebGLProgram
  /** (#536, §17.24) The water front's relaxation — see WC_WATER_FRONT_FRAG. */
  private _brushFlowTex: WebGLTexture | null = null
  private _brushDragProg!: WebGLProgram
  private _brushDragUni!: Record<string, WebGLUniformLocation | null>
  private _brushDragPosLoc = -1
  private _foreignWaterTex: WebGLTexture | null = null
  private _waterFrontProg!: WebGLProgram
  private _waterFrontUni!: Record<string, WebGLUniformLocation | null>
  private _waterFrontPosLoc = -1
  private _diffuseUni!: Record<string, WebGLUniformLocation | null>
  private _diffusePosLoc = -1
  private _ribbonPosLoc!: number
  private _ribbonEdgeLoc!: number
  private _ribbonInkLoc!: number
  private _ribbonInkWaterLoc!: number
  private _ribbonAcrossLoc!: number
  private _ribbonInkWetLoc!: number
  private _ribbonInkStrengthLoc!: number
  private _ribbonPuddleLoc!: number
  private _ribbonBuf!: WebGLBuffer
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _compositePosLoc!: number
  private _quadBuf!: WebGLBuffer
  private _screenBuf!: WebGLBuffer
  private _compositeFBO!: AccumulationBuffer

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
  private _splitCacheDirty = true

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
      drawLayer: (frame, id, opacity, fbo, w, h) => this._drawCompositeItem(frame, id, opacity, fbo, w, h),
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
    if (this._opQueue.length > 0) return true
    // (§17.72) Any stroke behind a settle in flight, not only watercolour:
    // landing it first was a synchronous settle, up to half a second on the
    // Surface, for a pencil line arriving at the wrong moment. The rare
    // structural operations (a dry, a layer change) still land it now.
    if (op.type !== 'stroke') return false
    return !!this._settle || (op.tool === 'watercolor' && !!this._strokeLayerId)
  }

  /** (§17.58) Applies every queued operation now, in order. */
  private _flushOpQueue(): void {
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
      if (!this._settle && !this._strokeLayerId) {
        const { op, source } = this._opQueue.shift()!
        this._appendOperationNow(op, source)
      }
      if (this._opQueue.length) this._scheduleOpDrain()
    })
  }

  private _appendOperationNow(op: Operation, source: OperationSource): void {
    // (#536, §17.52) A settle spread over frames (a peer's operation, or this
    // author's own) lands before the next operation touches anything: the
    // replay settles each operation before painting the next, and this keeps
    // the live picture to that order.
    if (this._settle) this._completeSettle()
    // (#537) Local: the pending tail, applied ahead of the server's order.
    // Remote: already ordered, so into the confirmed region at its seq — which
    // is below any pending operation of this client's own.
    const overtaken = this._log.append(op, source === 'local' ? { pending: true } : { serverSeq: op.seq })
    // Marked before the switch below applies it, not after: a merge or a
    // duplicate checkpoints its result on the spot, and a layer already known
    // to be out of order must refuse that checkpoint (_takeCheckpoint).
    this._noteOvertaken(op, overtaken)
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
            this._wetFromForeignStroke(op.layerId, op.tool, op.preset, dabs, op.timestamp, standing)
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
    if (source === 'local') this._onLocalOperation?.(op)
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
    if (land && this._settle) this._completeSettle()
    this._wash?.scratch.destroy()
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
    for (const r of this._washReveals.values()) revealBytes += r.before.width * r.before.height * 4 * 4 / 3
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
    this._splitCacheDirty = true
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
      // (#697) Every peer owns a reveal timer, but all peers share one
      // screen. Coalesce their composites without delaying log commits.
      this._scheduleDisplay()
    }

    if (state.dabIdx >= dabs.length) {
      this._onPreviewApplied?.(op)
      state.queue.shift()
      state.buf.clear()
      if (state.queue.length) this._startPeerPreviewHead(peerId)
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
    return this._exporter.exportPNG(transparent)
  }

  /** See PencilEngineAPI's doc comment, and ADR 015 §5 for why it exists;
   *  the work is Exporter's (#494). */
  async bakePreview(maxSide = 320): Promise<Blob | null> {
    await this._paper.ready()
    if (this._destroyed || this._contextLost) return null
    return this._exporter.bakePreview(maxSide)
  }

  destroy(): void {
    this._opQueue = [] // (§17.58)
    if (this._opDrainRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._opDrainRaf)
    this._destroyed = true
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
    this._ribbonScratchPool.destroy()
    if (this._dryingTimer) { clearTimeout(this._dryingTimer); this._dryingTimer = 0 }
    if (this._budgetTimer) { clearTimeout(this._budgetTimer); this._budgetTimer = 0 }
    if (this._wetTex) { this.gl.deleteTexture(this._wetTex); this._wetTex = null }
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
    for (const r of this._washReveals.values()) r.before.destroy()
    this._washReveals.clear()
    for (const b of this._revealPool) b.destroy()
    this._revealPool = []
    this.gl.deleteTexture(this._brushFlowTex)
    this.gl.deleteTexture(this._foreignWaterTex)
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
    this._wetFromForeignStroke(job.layerId, op.tool, op.preset, p.dabs, op.timestamp, r.value)
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
      this._wetFromForeignStroke(op.layerId, op.tool, op.preset, dabs, op.timestamp, r.value)
    }
    const first = this._runSlice(work)
    if (first.done) { this._wetFromForeignStroke(op.layerId, op.tool, op.preset, dabs, op.timestamp, first.value); return }
    const scratch = first.value === -1 ? null : this._replayRibbonChunks.get(op.washId ?? op.strokeId ?? '')?.scratch
    if (!scratch) { land(); return }
    const ops: Array<() => void> = [() => {}]
    const step = (): void => {
      const r = this._runSlice(work)
      if (!r.done && r.value !== -1) ops.push(step)
    }
    ops.push(step)
    this._startSettle(scratch, ops, land)
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
        this._wetFromForeignStroke(layerId, op.tool, op.preset, dabs, op.timestamp, standing)
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
    this._flushOpQueue() // (§17.58) into the log; the restore rebuilds from it
    this._brushFlowTex = null
    this._foreignWaterTex = null
    this._contextLost = true
    this._cancelSpillJob()
  }

  // The WebGLRenderingContext object itself (`this.gl`) survives restoration
  // per spec — only the GPU-side resources it created (programs, textures,
  // framebuffers) are gone and must be recreated. The Operation Log and
  // checkpoints are plain JS memory, never touched by context loss, so
  // recovery is: rebuild GL state, drop stale buffer/preview handles, then
  // let _syncBuffersToLog do exactly what it already does for a layer
  // add/delete — recreate and replay each live layer from the log.
  private _handleContextRestored = (): void => {
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
    const washOps = this._log.doneOperations().filter(o => o.type === 'paper_dry' || (o.type === 'stroke' && o.layerId === layerId))
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

  getOperationsSinceRestore(): Operation[] {
    return this._snapshotIO.operationsSinceRestore()
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
    this._compositeProg       = createProgram(gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG)
    this._revealProg          = createProgram(gl, DISPLAY_VERT, WASH_REVEAL_FRAG)
    this._fieldOpProg         = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_FRAG)
    this._fieldOpHighProg     = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_HIGH_FRAG)
    this._fieldOpCarryProg    = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_CARRY_FRAG)
    this._fieldOpCarryColourProg = createProgram(gl, DISPLAY_VERT, WC_FIELD_OP_CARRY_COLOUR_FRAG)
    this._resampleProg        = createProgram(gl, DISPLAY_VERT, WC_RESAMPLE_FRAG)
    this._screenBlitProg      = createProgram(gl, DISPLAY_VERT, SCREEN_BLIT_FRAG)
    this._paperComposeProg    = createProgram(gl, DISPLAY_VERT, PAPER_COMPOSE_FRAG)
    // (#494) Smudge's transfer and imprint-refresh programs — see SmudgePainter.ts.
    this._smudge.initGL()
    // (#494) The shape rasterizer — see ShapePass.ts.
    this._shapes.initGL()
    // (#494) Export's transparent and thumbnail-downscale passes — see Exporter.ts.
    this._exporter.initGL()
    this._brush.initGL() // (#494) see BrushPainter.ts
    this._ribbonProg          = createProgram(gl, RIBBON_VERT, RIBBON_FRAG)
    this._diffuseProg         = createProgram(gl, DISPLAY_VERT, WC_DIFFUSE_FRAG)
    this._brushDragProg = createProgram(gl, DISPLAY_VERT, WC_BRUSH_DRAG_FRAG)
    this._brushDragUni = getUniforms(gl, this._brushDragProg, ['u_paint', 'u_flow', 'u_water', 'u_pigment', 'u_base', 'u_step', 'u_mode'])
    this._brushDragPosLoc = gl.getAttribLocation(this._brushDragProg, 'a_position')
    this._waterFrontProg      = createProgram(gl, DISPLAY_VERT, WC_WATER_FRONT_FRAG)

    this._ribbonUni = getUniforms(gl, this._ribbonProg, [
      'u_wcNoiseTex', 'u_resolution', 'u_aaPx', 'u_mode', 'u_worldOrigin', 'u_mottleSeed', 'u_cloudDeposit', 'u_granDeposit', 'u_poolBlot',
      'u_washWater', 'u_waterRetain', 'u_bristleCombs', 'u_bristleInk', 'u_depthWrite', 'u_tau',
    ])
    this._compositeUni = getUniforms(gl, this._compositeProg, ['u_layer', 'u_opacity'])
    this._revealUni = getUniforms(gl, this._revealProg, ['u_after', 'u_before', 'u_hold', 'u_opacity'])
    this._fieldOpUni = getUniforms(gl, this._fieldOpProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_origin', 'u_size', 'u_band', 'u_world'])
    this._fieldOpHighUni = getUniforms(gl, this._fieldOpHighProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_origin', 'u_size', 'u_band', 'u_world'])
    this._fieldOpCarryUni = getUniforms(gl, this._fieldOpCarryProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_origin', 'u_size', 'u_band', 'u_world'])
    this._fieldOpCarryColourUni = getUniforms(gl, this._fieldOpCarryColourProg, ['u_a', 'u_b', 'u_c', 'u_k', 'u_mode', 'u_tau', 'u_dir', 'u_d', 'u_origin', 'u_size', 'u_band', 'u_world'])
    this._resampleUni = getUniforms(gl, this._resampleProg, ['u_src', 'u_old', 'u_base', 'u_srcSize', 'u_baseSize', 'u_dstOrigin', 'u_srcOrigin', 'u_ratio', 'u_mode', 'u_clamp'])
    this._waterFrontUni = getUniforms(gl, this._waterFrontProg, [
      'u_wcNoiseTex', 'u_cost', 'u_paperHeightMap', 'u_resolution', 'u_paperOrigin', 'u_paperTexSize', 'u_paperScale',
      'u_climb', 'u_floor', 'u_costMax', 'u_film', 'u_dryCost', 'u_stride', 'u_foreignFilm', 'u_foreignWet',
    ])
    this._diffuseUni = getUniforms(gl, this._diffuseProg, [
      'u_ink', 'u_coverage', 'u_paperHeightMap', 'u_resolution',
      'u_paperOrigin', 'u_paperTexSize', 'u_paperScale', 'u_d', 'u_b', 'u_radius', 'u_stencil',
    ])
    this._paperComposeUni = getUniforms(gl, this._paperComposeProg, [
      'u_accumulation', 'u_paperMap', 'u_paperColor', 'u_paperScale', 'u_paperTexSize',
      'u_dstSize', 'u_srcSize', 'u_matrixInv', 'u_screenToWorld', 'u_sharpResample',
      'u_pageRect', 'u_deskColor', 'u_wetMap', 'u_wetRect', 'u_wetPeak',
    ])

    this._compositePosLoc      = gl.getAttribLocation(this._compositeProg, 'a_position')
    this._revealPosLoc         = gl.getAttribLocation(this._revealProg, 'a_position')
    this._fieldOpPosLoc        = gl.getAttribLocation(this._fieldOpProg, 'a_position')
    this._fieldOpHighPosLoc    = gl.getAttribLocation(this._fieldOpHighProg, 'a_position')
    this._fieldOpCarryPosLoc   = gl.getAttribLocation(this._fieldOpCarryProg, 'a_position')
    this._fieldOpCarryColourPosLoc = gl.getAttribLocation(this._fieldOpCarryColourProg, 'a_position')
    this._resamplePosLoc       = gl.getAttribLocation(this._resampleProg, 'a_position')
    this._screenBlitPosLoc     = gl.getAttribLocation(this._screenBlitProg, 'a_position')
    this._screenBlitTexLoc     = gl.getUniformLocation(this._screenBlitProg, 'u_tex')
    this._diffusePosLoc        = gl.getAttribLocation(this._diffuseProg, 'a_position')
    this._waterFrontPosLoc     = gl.getAttribLocation(this._waterFrontProg, 'a_position')
    this._paperComposePosLoc   = gl.getAttribLocation(this._paperComposeProg, 'a_position')

    this._ribbonPosLoc  = gl.getAttribLocation(this._ribbonProg, 'a_position')
    this._ribbonEdgeLoc = gl.getAttribLocation(this._ribbonProg, 'a_edge')
    this._ribbonInkLoc  = gl.getAttribLocation(this._ribbonProg, 'a_ink')
    this._ribbonInkWaterLoc = gl.getAttribLocation(this._ribbonProg, 'a_inkWater')
    this._ribbonAcrossLoc = gl.getAttribLocation(this._ribbonProg, 'a_across')
    this._ribbonInkWetLoc = gl.getAttribLocation(this._ribbonProg, 'a_inkWet')
    this._ribbonInkStrengthLoc = gl.getAttribLocation(this._ribbonProg, 'a_inkStrength')
    this._ribbonPuddleLoc = gl.getAttribLocation(this._ribbonProg, 'a_contact')

    this._quadBuf    = createQuadBuffer(gl)
    this._screenBuf  = createFullscreenQuad(gl)
    // (#494) The resampling blits (transform, selection, image) — see
    // blitPasses.ts. Rebuilt with everything else here on a context restore.
    this._passes = new BlitPasses(gl, this._screenBuf)
    this._ribbonBuf  = gl.createBuffer()!

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
    this._splitCacheDirty = true
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
    if (this._locked || !this._paper.loaded) {
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
    if (this._settle) this._completeSettle()
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
      if (this._settle) this._completeSettle()
      if (joins && open) {
        this._washId = open.id
        this._ribbonStrokeScratch = open.scratch
      } else {
        this._wash?.scratch.destroy()
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
      this._wash?.scratch.destroy()
      this._wash = null
      this._ribbonStrokeScratch = new RibbonStrokeScratch(this._ribbonScratchPool, profile.ink, profile.normalizeDeposit)
    }
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
    if (this._ribbonStrokeScratch) this._finishRibbonStroke(this._ribbonStrokeScratch, true)
    if (this._wash && this._wash.scratch === this._ribbonStrokeScratch) {
      // (#468 v7) A wash outlives its strokes — the paint is still on the paper
      // and still wet, so the buffers stay open for the next band to pool into.
      // Torn down in _onStart when something makes the next stroke a different
      // wash, and by _clearWash on tool/layer changes and teardown.
      this._wash.endedAt = this._dryAtPenUp ? -Infinity : performance.now()
    } else {
      this._ribbonStrokeScratch?.destroy()
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
    if (this._ribbonStrokeScratch) {
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
        if (!source) { source = { gesture, footprints: [] }; sources.push(source) }
        for (const d of strokeDabs(op)) source.footprints.push({
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

  /** The scratch this replayed operation should paint through, given the
   *  gesture it belongs to — see _replayRibbonChunk. Returns null for an
   *  operation with no gesture id (a stroke recorded before strokeId existed),
   *  which then falls back to a throwaway scratch, exactly as before. */
  /** (#536, §17.57) A participant's stroke closes every wash and gesture of
   *  theirs but its own: a wash is only ever joined by its author's NEXT
   *  stroke (the author's single open `_wash`), and a gesture's chunks are
   *  that author's consecutive operations. So the cache entries of their
   *  earlier washes can never be read again, and they go now instead of when
   *  the LRU gets to them - four whole-sheet washes held that way were most
   *  of the 600 MB the iPad died at (multitest, CJoiem15). A fact of the log
   *  order, the same live and on every replay, so what is painted does not
   *  change - only an open wash is no longer evicted to make room for them. */
  private _retireWashesOf(op: StrokeOperation): void {
    const key = op.washId ?? op.strokeId
    for (const [k, chunk] of this._replayRibbonChunks) {
      if (k === key || this._chunkAuthors.get(k) !== op.userId) continue
      if (this._settle?.scratch === chunk.scratch) this._completeSettle()
      chunk.scratch.destroy()
      this._replayRibbonChunks.delete(k)
      this._chunkAuthors.delete(k)
    }
    // (§17.68) ...and the ones spilled or lost: closed just the same.
    for (const [k, w] of this._spilledWashes) {
      if (k !== key && w.userId === op.userId) { w.spill.dispose(); this._spilledWashes.delete(k); this._lostWashes.delete(k) }
    }
    for (const k of [...this._lostWashes.keys()]) {
      if (k !== key && this._chunkAuthors.get(k) === op.userId) { this._lostWashes.delete(k); this._chunkAuthors.delete(k) }
    }
    if (key) this._chunkAuthors.set(key, op.userId)
  }

  private _replayChunkScratch(
    target: ILayerBuffer, strokeId: string | undefined, washId: string | undefined,
    dabs: Dab[], profile: RibbonProfile,
  ): { scratch: RibbonStrokeScratch; prevDab?: Dab } | null {
    // (#468 v7) A wash groups more strongly than a gesture: several strokes
    // share one accumulation, so the key is the wash where there is one and the
    // gesture otherwise. Grouping by the recorded id rather than by anything
    // measured here is what keeps replay a pure function of the log — the live
    // client already decided, using wall-clock timing replay must never see.
    const key = washId ?? strokeId
    if (!key || !dabs.length) return null
    const cached = this._replayRibbonChunks.get(key)
    if (cached && cached.target === target) {
      // `prevDab` bridges the ribbon across a *gesture's* chunks. Across two
      // strokes of one wash there is nothing to bridge — the brush was lifted —
      // so the band builder must not stitch them into one swept figure.
      const sameGesture = cached.washStrokeId === strokeId
      const prevDab = washId && !sameGesture ? undefined : cached.lastDab
      cached.lastDab = dabs[dabs.length - 1]
      cached.washStrokeId = strokeId
      // Only when a *new* stroke of the wash starts. This read the flag it had
      // just overwritten, so it fired on every operation — including the chunks
      // one long gesture is split into, which live never does. The brush was
      // getting recharged mid-stroke on replay and not while drawing, so a long
      // enough stroke came back different after a reload.
      if (washId && !sameGesture) cached.scratch.beginStroke()
      // Re-inserted so the map's own order is least-recently-used: the eviction
      // below takes the front, and a wash still being painted into must not be
      // the one thrown away.
      this._replayRibbonChunks.delete(key)
      this._replayRibbonChunks.set(key, cached)
      cached.usedAt = performance.now()
      return { scratch: cached.scratch, prevDab }
    }
    // A stale entry under the same key but a *different* layer buffer is not a
    // hit — the scratch mirrors the tiles of one target and nothing else.
    if (cached && this._settle?.scratch === cached.scratch) this._completeSettle() // (§17.52)
    cached?.scratch.destroy()
    this._replayRibbonChunks.delete(key)
    // #702: an open wash this client parked on the GPU, continued as a hit.
    const spilled = this._spilledWashes.get(key)
    if (spilled && spilled.target !== target) { spilled.spill.dispose(); this._spilledWashes.delete(key) }
    if (spilled && spilled.target === target) {
      this._spilledWashes.delete(key)
      const back = RibbonStrokeScratch.unspill(this._ribbonScratchPool, spilled.spill, target)
      if (back) {
        this._replayRibbonChunks.set(key, { strokeId: key, washStrokeId: spilled.washStrokeId, target, scratch: back, lastDab: spilled.lastDab })
        if (spilled.userId) this._chunkAuthors.set(key, spilled.userId)
        this._trimChunkCache()
        return this._replayChunkScratch(target, strokeId, washId, dabs, profile)
      }
      this._lostWashes.set(key, target)
    }
    if (this._lostWashes.get(key) === target) {
      this._lostWashes.delete(key)
      this._rebuildLostWash(target)
    }
    const scratch = new RibbonStrokeScratch(this._ribbonScratchPool, profile.ink, profile.normalizeDeposit)
    scratch.beginStroke()
    this._replayRibbonChunks.set(key, {
      strokeId: key, washStrokeId: strokeId, target, scratch, lastDab: dabs[dabs.length - 1], usedAt: performance.now(),
    })
    this._trimChunkCache()
    this._scheduleBudgetCheck()
    return { scratch }
  }

  /** (§17.68) The cache back to REPLAY_RIBBON_CHUNK_SLOTS, least recently used
   *  first - spilled, not destroyed: a fifth participant's wash used to push
   *  out an open one, whose next stroke then started over in a fresh scratch
   *  on this client only. */
  private _trimChunkCache(): void {
    // #702: park resting washes in slices. The cache may temporarily
    // exceed its slot count while copies are queued.
    if (this._replayRibbonChunks.size > REPLAY_RIBBON_CHUNK_SLOTS && !this._inJobStep && typeof setTimeout === 'function') {
      this._pumpSpills()
      return
    }
    while (this._replayRibbonChunks.size > REPLAY_RIBBON_CHUNK_SLOTS) {
      if (this._inJobStep) {
        // (#701) A sliced rebuild already knows which gestures its remaining
        // journal continues. Reading a finished one back only to evict it can
        // block a frame for seconds. Keep the existing lost-wash fallback for
        // any continuation that arrives later, outside this known history.
        const finished = [...this._replayRibbonChunks].find(([key, chunk]) => {
          const job = [...this._rebuildJobs.values()].find(j => j.fresh === chunk.target)
          if (!job) return false
          const remaining = this._log.layerPixelOps(job.layerId).slice(job.start + job.applied.length)
          return !remaining.some(op => op.type === 'stroke' && (op.washId ?? op.strokeId) === key)
        })
        if (finished) {
          const [key, chunk] = finished
          if (this._settle?.scratch === chunk.scratch) this._completeSettle()
          this._replayRibbonChunks.delete(key)
          this._lostWashes.set(key, chunk.target)
          chunk.scratch.destroy()
          continue
        }
      }
      this._evictChunk(this._replayRibbonChunks.keys().next().value as string, true)
    }
  }

  /** (#702) Removes cache entry `key` from active scratch. `keep`: the wash may still
   *  be joined, so it is spilled - or, where it cannot be (mid-gesture, past
   *  the memory cap), marked lost. */
  private _evictChunk(key: string, keep: boolean): void {
    const c = this._replayRibbonChunks.get(key)
    if (!c) return
    if (this._settle?.scratch === c.scratch) this._completeSettle() // (§17.52)
    if (this._spillJob?.key === key) this._cancelSpillJob()
    this._replayRibbonChunks.delete(key)
    if (keep) {
      const origins = new Map<AccumulationBuffer, { originX: number; originY: number }>()
      for (const t of c.target.allResident()) origins.set(t.buffer, { originX: t.originX, originY: t.originY })
      const spill = c.scratch.spill(tile => origins.get(tile) ?? null)
      if (spill) {
        this._spilledWashes.get(key)?.spill.dispose()
        this._spilledWashes.set(key, { target: c.target, userId: this._chunkAuthors.get(key), washStrokeId: c.washStrokeId, lastDab: c.lastDab, spill })
      } else {
        this._lostWashes.set(key, c.target)
      }
    }
    c.scratch.destroy()
    this._trimSpilled()
  }

  /** #702: cancelling a park returns its partial GPU copies to the pool. */
  private _cancelSpillJob(): void {
    const job = this._spillJob
    if (!job) return
    this._spillJob = null
    if (job.timer) clearTimeout(job.timer)
    job.work.return(null)
  }

  /** GPU copies over frames; no readPixels or GPU fence in this job. */
  private _startSpill(key: string): void {
    const c = this._replayRibbonChunks.get(key)
    if (!c) return
    const origins = new Map<AccumulationBuffer, { originX: number; originY: number }>()
    for (const t of c.target.allResident()) origins.set(t.buffer, { originX: t.originX, originY: t.originY })
    const work = c.scratch.spillWork(tile => origins.get(tile) ?? null)
    const job = { work, key, scratch: c.scratch, usedAt: c.usedAt ?? 0, timer: 0 as ReturnType<typeof setTimeout> | 0 }
    this._spillJob = job
    const step = (): void => {
      job.timer = 0
      if (this._spillJob !== job) return
      const now = this._replayRibbonChunks.get(key)
      if (this._destroyed || this._contextLost || now !== c || (c.usedAt ?? 0) !== job.usedAt
        || c.scratch.diffusePending || this._settle?.scratch === c.scratch) { work.return(null); this._spillJob = null; this._pumpSpillsLater(); return }
      const t0 = performance.now()
      let r = work.next()
      while (!r.done && performance.now() - t0 < 4) r = work.next()
      if (!r.done) { job.timer = setTimeout(step, 16); return }
      this._spillJob = null
      this._replayRibbonChunks.delete(key)
      if (r.value) {
        this._spilledWashes.get(key)?.spill.dispose()
        this._spilledWashes.set(key, { target: c.target, userId: this._chunkAuthors.get(key), washStrokeId: c.washStrokeId, lastDab: c.lastDab, spill: r.value })
      } else {
        this._lostWashes.set(key, c.target)
      }
      c.scratch.destroy()
      this._trimSpilled()
      if (this._gpuBudget !== Infinity) this._ribbonScratchPool.trimFree()
      this._scheduleBudgetCheck()
      this._pumpSpillsLater()
    }
    job.timer = setTimeout(step, 0)
  }

  /** (§17.70) While the cache is over its slots and nothing is being
   *  spilled, spills the least recently used wash that is at rest (the map's
   *  order is its use order). One busy just now is tried again a little later. */
  private _pumpSpills(): void {
    if (this._destroyed || this._spillJob || this._inJobStep) return
    if (this._replayRibbonChunks.size <= REPLAY_RIBBON_CHUNK_SLOTS) return
    for (const [key, c] of this._replayRibbonChunks) {
      if (c.scratch.diffusePending || this._settle?.scratch === c.scratch) continue
      this._startSpill(key)
      return
    }
    this._pumpSpillsLater()
  }

  private _pumpSpillsLater(): void {
    if (this._spillPumpTimer || this._destroyed) return
    this._spillPumpTimer = setTimeout(() => { this._spillPumpTimer = 0; this._pumpSpills() }, 100)
  }

  /** #702: parked GPU storage is bounded by the existing 128 MiB cap AND
   *  the device budget. Past either, the existing journal-rebuild fallback
   *  replaces the oldest parked state. */
  private _trimSpilled(): void {
    // Release idle allocations before sacrificing any recoverable wash.
    if (this._washGpuBytes() > this._gpuBudget) this._ribbonScratchPool.trimFree()
    let bytes = 0
    for (const w of this._spilledWashes.values()) bytes += w.spill.bytes
    for (const [k, w] of this._spilledWashes) {
      if (bytes <= SPILLED_WASHES_MAX_BYTES && this._washGpuBytes() <= this._gpuBudget) break
      bytes -= w.spill.bytes
      w.spill.dispose()
      this._ribbonScratchPool.trimFree()
      this._spilledWashes.delete(k)
      this._lostWashes.set(k, w.target)
    }
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

  /** (§17.68) Spilled and lost washes of `target` are about a buffer that is
   *  going away. */
  private _forgetWashesOf(target: ILayerBuffer): void {
    for (const [k, w] of this._spilledWashes) if (w.target === target) { w.spill.dispose(); this._spilledWashes.delete(k) }
    for (const [k, t] of this._lostWashes) if (t === target) this._lostWashes.delete(k)
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
    // (#536, §17.64) Each dab's place in `dabs`, which is what the recorded
    // wet profile is indexed by - one digit per dab of the operation (or of
    // the live batch's slice). The filters below drop dabs, and reading the
    // profile by position in what is left shifted every digit after the first
    // one dropped - by how many were dropped before it in THIS call, so a live
    // stroke and its one-batch replay read different paper under the same dab.
    const wetIndex = new Map<Dab, number>()
    let drawable = floorPx === null
      ? dabs.filter((d, i) => { wetIndex.set(d, i); return d.size * 0.5 * preset.sizeMultiplier >= 0.5 })
      : dabs.map((d, i) => {
        const half = d.size * 0.5 * preset.sizeMultiplier
        const out = half >= floorPx ? d : { ...d, size: (floorPx * 2) / preset.sizeMultiplier }
        wetIndex.set(out, i)
        return out
      })
    // -1 for a dab not of this call (the bridging prevDab), as the loop below read it.
    const wetOf = (d: Dab): number => wetAt(wetProfile, wetIndex.get(d) ?? -1)
    // (§17.28) The deposit as a FILM under MAX blending - see RibbonTileScratch.strokeInk.
    const film = profile.normalizeDeposit && !!this._minmaxExt && !!scratch
    // (§17.28) Only the dabs that MOVED deposit - see watercolorTravelQuantum.
    // The anchor is the last dab kept, carried on the scratch across the
    // gesture's batches so a live stroke and its replay keep the same dabs.
    if (profile.normalizeDeposit && scratch) {
      // …and the ribbon bridges from the last kept dab, never from a dropped
      // one, so the bands' geometry is the same set of dabs live and replayed.
      if (scratch.lastKept) prevDab = scratch.lastKept
      const kept: Dab[] = []
      let anchor = prevDab
      for (const d of drawable) {
        const q = watercolorTravelQuantum(d.size * 0.5 * preset.sizeMultiplier)
        if (!anchor || Math.hypot(d.x - anchor.x, d.y - anchor.y) >= q) { kept.push(d); anchor = d }
      }
      if (kept.length) scratch.lastKept = kept[kept.length - 1]
      drawable = kept
    }
    if (!drawable.length) return
    // #573 — a digital brush on the stamp model keeps this machinery's scratch
    // (the frozen layer, the stroke's coverage) and nothing else of it.
    if (profile.brushStamp) {
      this._paintBrushStroke(target, drawable, preset, profile.brushStamp, color, scratch, prevDab)
      return
    }

    const { nibShape, cornerFraction } = profile

    // One bounds box for the whole batch: the tiles to paint, and the rect the
    // single composite pass covers. Padded per dab by the same half-extents the
    // ordinary graphite path uses, so a chisel nib's 5x reach is accounted for.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    // (#536) …and by the halo a wet-paper dab lays around itself, at the widest
    // it can be for that wetness — this is a bound, and erring outward is the
    // cheap direction. See watercolorHalo.
    const haloBound = (d: Dab): number =>
      profile.normalizeDeposit ? watercolorHalo(wetOf(d), 1).scale : 1
    // …and the reach the halo is allowed past the bloom, at the cap: the
    // gesture's own spread is not resolved until further down, and this is a
    // bound, so the ceiling stands in.
    const haloPast = (d: Dab): number =>
      profile.normalizeDeposit && wetOf(d) > 0
        ? WATERCOLOR_HALO_PAST_BLOOM * WATERCOLOR_SPREAD.cap : 0
    // (§17.46) Two rects. The REACH (halo bound included) is what the gesture
    // hands its settle as the window the wet-in-wet may move paint in - cut
    // to the dabs, the settle's field ended at the brush's own footprint and
    // left hard straight edges through the wash (replay of HcpkzwNX). The
    // PAINT rect - tiles, film rebuild, live composite - only needs what is
    // actually laid, and with the halo stamp off (WATERCOLOR_HALO_DRAWN) that
    // is the dabs: the reach made a big brush in its own wet wash repaint and
    // recomposite three to four times the area every frame, the tablet's one
    // dropped frame in six.
    let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity
    // (#536, §17.65) A dab whose reach misses the sheet adds nothing to either
    // rect. Judged per dab, so how the gesture was cut into batches cannot
    // matter: a live batch off the sheet contributed nothing (it paints
    // nothing), while a replay's one batch stretched its rect - and the settle
    // window after it - over the whole off-sheet run. A tail drawn down past
    // the sheet's right edge pulled the window 900 px lower, past the field's
    // cap, and the crop left the wash's own top out of the dry tide.
    const sheet = profile.normalizeDeposit && !this._infinite ? this._pageSize() : null
    for (const d of prevDab ? [prevDab, ...drawable] : drawable) {
      const { hx, hy } = this._dabWorldHalfExtents(d, false, preset)
      const g = haloBound(d), past = haloPast(d)
      if (sheet && (d.x + hx * g + past <= 0 || d.y + hy * g + past <= 0
        || d.x - hx * g - past >= sheet.w || d.y - hy * g - past >= sheet.h)) continue
      rMinX = Math.min(rMinX, d.x - hx * g - past); rMaxX = Math.max(rMaxX, d.x + hx * g + past)
      rMinY = Math.min(rMinY, d.y - hy * g - past); rMaxY = Math.max(rMaxY, d.y + hy * g + past)
      const pg = WATERCOLOR_HALO_DRAWN ? g : 1, pp = WATERCOLOR_HALO_DRAWN ? past : 0
      minX = Math.min(minX, d.x - hx * pg - pp); maxX = Math.max(maxX, d.x + hx * pg + pp)
      minY = Math.min(minY, d.y - hy * pg - pp); maxY = Math.max(maxY, d.y + hy * pg + pp)
    }
    const bounds = { minX, minY, maxX, maxY }
    // The tiles over the REACH, as before: a tile the settle is to spread
    // into needs its wash entry, and the paint rect alone left a drop across
    // the bounded room's x=1024 seam unable to run into the next tile. Per
    // tile, the film rebuild and composite are cut to the paint rect.
    const reachRect = { minX: rMinX, minY: rMinY, maxX: rMaxX, maxY: rMaxY }
    const targets = this._resolveWithinSheet(target, profile.normalizeDeposit ? this._wcSheetClamp(reachRect) : reachRect)
    // (#536, §17.63) Not yet: a batch with nothing on the sheet still spends
    // the gesture's brush - see the return after the deposit loop.

    // (#468 v2/v4, ADR 011 §3.5) The stroke's typical radius decides how far its
    // water carries. Mean rather than max: one heavy dab at the end of an
    // otherwise light stroke should not widen the whole mark's boundary
    // treatment.
    // (#468 v6) The deposit's ripple has exactly the dab spacing for a period,
    // so that is what it must be read back over. The first attempt guessed it
    // from the first dab's radius and landed at a quarter of the true value —
    // the ring came out 3.8px wide against a 15.4px period and cancelled
    // essentially nothing, which is why the circles survived the first fix.
    const firstGap = drawable.length >= 2
      ? Math.hypot(drawable[1].x - drawable[0].x, drawable[1].y - drawable[0].y)
      : (prevDab ? Math.hypot(drawable[0].x - prevDab.x, drawable[0].y - prevDab.y) : 0)
    const dabSpacing = scratch.noteDabSpacing(firstGap)
    const dirFrom = drawable.length >= 2 ? drawable[0] : prevDab
    const dirTo = drawable.length >= 2 ? drawable[1] : drawable[0]
    const strokeDir = scratch.noteDirection(
      dirFrom ? dirTo.x - dirFrom.x : 0, dirFrom ? dirTo.y - dirFrom.y : 0,
    )
    // (#536) How wet the paper was where this gesture came down. Read once,
    // above everything that needs it — the composite's cached scalars want it
    // as much as the deposit does.
    // Landing belongs to the gesture, not to the next pointer batch.
    const landedWet = scratch.finishContext?.landedWet ?? wetAt(wetProfile, 0)
    const wetPeakHere = wetPeak(wetProfile)
    for (const d of drawable) if (wetOf(d) >= 0.3) scratch.wetContacts.push({
      x: d.x, y: d.y, radius: d.size * 0.5 * preset.sizeMultiplier,
      aspect: Math.max(1, d.aspectRatio), angle: d.angle,
    })
    const { spreadPx, water: fringeWater, migratePx, fieldSeed, bristleRadiusPx } = scratch.compositeScalars(() => {
      // #489: the bloom is isotropic, so a nib that is not round is measured by
      // the circle with its area rather than by either axis. Identical to the
      // old `size * 0.5` for a round nib.
      const first = drawable[0]
      const firstMinor = first.size * 0.5 * preset.sizeMultiplier
      const firstRadius = Math.max(
        watercolorSpreadRadius(firstMinor * Math.max(first.aspectRatio, 1), firstMinor), 0.5,
      )
      return {
        // (#536) No longer gated by the wetness under the landing point, and
        // that gate was the single worst thing about wet-in-wet.
        //
        // The bloom used to be baked into this gesture-wide number out of the
        // one digit under the first dab. So a brush set down *in* a puddle
        // spread three times as far for the whole of its travel, including the
        // dry paper it went on to cross, and a brush that started on dry paper
        // and ran through the puddle got no bloom anywhere — "если веду с
        // сухого через лужу на сухое, штрих ложится полностью сухим". Worse, at
        // a 16 px cell the first dab landing in a wet cell or a dry one near the
        // edge is close to a coin toss, which is the "иногда" in every one of
        // those reports.
        //
        // The bloom is now applied per pixel in the composite, off the deposit's
        // own record of what the paper under it was carrying (DAB_FRAG's
        // paperWetHere). This stays the *dry* reach, i.e. the ceiling the
        // shader scales up from where the paper was actually wet — so a stroke
        // blooms in the puddle and stays tight either side of it, inside one
        // mark.
        spreadPx: profile.spreadPx > 0 && profile.spreadOfRadius > 0
          ? Math.min(
            profile.spreadPx,
            Math.max(WATERCOLOR_SPREAD.min, firstRadius * profile.spreadOfRadius),
          )
          : 0,
        inkSmoothPx: 0, // resolved separately, see noteDabSpacing
        // (#468 v11) How far one exchange moves pigment. A constant of the
        // gesture for exactly the reason every other scalar here is one: the
        // composite recomputes whole rects, so whichever batch wrote a pixel
        // last would otherwise decide how far its paint had travelled.
        migratePx: profile.migrate > 0 && profile.migrateOfRadius > 0
          ? Math.min(
            WATERCOLOR_MIGRATION.maxPx,
            Math.max(WATERCOLOR_MIGRATION.minPx, firstRadius * profile.migrateOfRadius),
          )
          : 0,
        // The fallback the composite uses outside the mark, where there is no
        // deposit to read a per-pixel level from. The stroke's starting load,
        // not its current one, for the same no-seams reason.
        water: profile.waterLevel,
        fieldSeed: [drawable[0].x, drawable[0].y],
        // (#536) A constant of the gesture like every other scalar here, so
        // the hair does not change frequency between a live batch and the
        // final recomposite.
        // The nib's *long* axis, not the equal-area radius. A flat brush is a
        // row of hairs held in a ferrule, and the ferrule's width is the long
        // axis: measured by area it came out as a couple of bundles and read
        // as broad waves rather than as hair, which is what "на chisel не вижу
        // щетинки" was. For a round nib the two are the same number.
        //
        // (#536) …and the ferrule, not this footprint: the first dab of a
        // gesture carries both the pressure it was begun with and the head
        // taper, and on a small brush those two together cost most of the hair.
        // See watercolorFerrulePx.
        bristleRadiusPx: watercolorFerrulePx(
          firstMinor, first.aspectRatio, first.pressure, presetName,
        ),
      }
    })

    // (#468 v4, ADR 011 §4.4) The composite rect a *live* batch redraws, padded
    // past the dabs it just painted.
    //
    // v2 and v3 ran the spread and the tideline only at pen-up, because both
    // read a neighbourhood the moving brush front has not finished writing. The
    // cost was a visible jump: the artist drew one shape and watched it become
    // another the instant the stylus lifted. Correct by the model, and bad —
    // real paint keeps moving, it does not swap geometry in a single frame.
    //
    // The fix is that both terms are *local*: they reach at most spread +
    // tideline radius from any pixel. So a batch that recomposites its own
    // dabs plus that much margin fixes up everything the previous batch could
    // only guess at, and the only region still provisional is the margin around
    // the live front — which is where the brush is, and which the next batch
    // corrects. The settle pass at pen-up then has nothing left to do but the
    // final margin, so the mark barely changes when the pen comes up.
    //
    // Costs a larger rect per batch. Bounded by the padding, not by the stroke:
    // this stays proportional to what the batch painted, unlike recompositing
    // the whole stroke every event, which is what made deferral necessary in
    // the first place.
    // The pad has to cover *everything that can still change this pixel*, and
    // that is not just how far the composite reaches sideways — it is also how
    // long the brush keeps depositing into a pixel it has already passed.
    //
    // Ink and coverage keep arriving until the nib has travelled a full radius
    // beyond a spot. Pad by less than that and a live batch composites from an
    // inkLoad that is still missing the dabs behind the front, and no later
    // batch's rect ever reaches back to correct it. Replay, which composites
    // once with the whole stroke in the buffers, has no such gap — so the two
    // disagreed, and a reload silently redrew the stroke differently. Measured
    // at 26% of the mark's area before this, 9% of it strongly.
    //
    // That is a determinism bug, not a cosmetic one: two people in one room
    // were looking at different pictures.
    let maxRadius = 0
    // #489: the nib's *reach*, not its short axis — this term is a bound, and a
    // flat nib deposits a long semi-axis past a spot rather than a short one.
    // Erring outward costs a slightly larger rect; erring inward composites
    // from buffers that are still filling, which is the determinism bug this
    // whole block exists to prevent.
    // (§17.23) …and the nib's own radius, without the halo's bound: what the
    // rim is scaled by.
    let nibRadius = 0
    for (const d of drawable) {
      const minor = d.size * 0.5 * preset.sizeMultiplier
      maxRadius = Math.max(maxRadius, minor * Math.max(d.aspectRatio, 1) * haloBound(d) + haloPast(d))
      nibRadius = Math.max(nibRadius, minor * Math.max(d.aspectRatio, 1))
    }
    // Everything that can still change this pixel, **summed** rather than
    // maxed — each term is a separate hop outward and they compose:
    //
    //   maxRadius   the nib keeps depositing into a spot until it has travelled
    //               its own radius past it;
    //   spreadPx    the boundary is decided from a blur of coverage that far away;
    //   wetEdge     the tideline reads the same blur;
    //   dabSpacing  the deposit is read back averaged over one spacing, so a
    //               pixel's value depends on its neighbours' deposits too;
    //   migratePx   (#468 v11) pigment is exchanged with a ring that far out,
    //               so a pixel's tone depends on deposits that far away — and
    //               unlike the terms above this one is symmetric, since paint
    //               arriving is as much a change as paint leaving.
    //
    // Getting this wrong does not merely blur something: a live batch then
    // composites from buffers that are still filling, no later batch's rect
    // reaches back to correct it, and the mark ends up different from what a
    // replay of the same operation produces.
    // (#536) Twice the reach, because the mark can end up that much wider than
    // the brush: the re-threshold displaces the boundary outward by about
    // 2 * reach * push, and push is capped at WC_WET_PUSH, which is 0.5. Under-
    // padding here does not soften a mark, it cuts it off square at the rect's
    // edge — so this is a bound, not an estimate.
    //
    // It used to pad for the bloom multiplied into the *radius*. That factor is
    // gone (see the reach's own note in DAB_FRAG: an eighty-pixel radius on a
    // twelve-tap ring is not a blur), and padding for it was costing two and a
    // half times the composite fill it needed.
    // (#536, §17.22) No maxRadius here any more: `bounds` is built from the
    // dabs' world half-extents (and the previous dab's), so the nib's own
    // radius is already inside it, and adding it again put a 400 px brush's
    // rect at 1136 px a side where 740 would do — 2.4 times the fill. The
    // pad is the composite's READ reach only, plus the stamps' edge AA.
    const compositePad = spreadPx > 0
      ? Math.ceil(
        spreadPx * 2 + profile.wetEdgeRadiusPx + dabSpacing + migratePx + profile.aaPx,
      ) + 1
      : 0
    const compositeBounds = compositePad > 0
      ? {
        minX: bounds.minX - compositePad, minY: bounds.minY - compositePad,
        maxX: bounds.maxX + compositePad, maxY: bounds.maxY + compositePad,
      }
      : bounds
    const reachBounds = {
      minX: rMinX - compositePad, minY: rMinY - compositePad,
      maxX: rMaxX + compositePad, maxY: rMaxY + compositePad,
    }

    // (#468 v3, ADR 011 §3.8) Every dab's ink deposit, resolved once for the
    // batch — *before* the tile loop, because the depletion clock must advance
    // once per batch and not once per tile a batch happens to straddle.
    //
    // Two things happen here that did not before, both watercolor-only:
    //
    //  - the deposit is divided by the dab's own radius, turning it from a
    //    quantity per unit *length* into one per unit *area*. Unnormalized it
    //    scaled with brush size and saturated the 8-bit inkLoad buffer on the
    //    first dab of any real wash, which pinned the composite's saturation
    //    curve at 1 and made `density` dead code (see normalizeDeposit);
    //  - it decays as the brush unloads along the stroke, which is only
    //    expressible *because* of the normalization above.
    //
    // The marker takes neither and must not: its strokes are permanent and its
    // constants were calibrated against the old scale. What it does take
    // (#559) is a gain of >= 1 on that same legacy deposit wherever the nib is
    // too thin along the travel to have reached the film's knee at all — see
    // markerInkGain.ts. Exactly 1 for every nib that saturated already.
    // (#468 v4, ADR 011 §4) Water and pigment run down at *different* rates,
    // and that difference is the whole behaviour: water soaks away fast while
    // pigment stays on the hairs, so one long stroke walks itself from a wet
    // saturated start, through an ordinary middle, to a dry but still strongly
    // coloured end — and finally to a broken dry-brush tail. A single "wetness"
    // scalar cannot produce that arc at all.
    const deposits: number[] = []
    const waterByDab = new Map<Dab, number>()
    const pigmentByDab = new Map<Dab, number>()
    const delivery = ribbonWaterDelivery(profile)
    scratch.standing.clear()
    // (#536) Which way "across the brush" points for each dab, in the nib's own
    // local axes — the stamps' half of the hair comb. Filled in the same loop
    // that already resolves each dab's travel direction, so there is exactly
    // one reading of it and the stamps cannot disagree with the bands.
    const acrossByDab = new Map<Dab, [number, number]>()
    // (#680, s17.84) The dabs whose direction is the travel's - see below.
    const movingByDab = new Set<Dab>()
    // (#536) …and how wet the paper under each dab already was. Straight out of
    // the recorded profile, indexed by position within this call's own dabs —
    // which is why the profile is one digit per dab and why every place a
    // gesture is cut takes its own substring (paperWetness.ts).
    const paperWetByDab = new Map<Dab, number>()
    // (#536) The touch-down surplus, per dab — see watercolorStartExcess. Gated
    // by the wetness under the gesture's *landing point*, not per dab: a brush
    // dumps its load when it is set down, so what matters is what was under it
    // then, not what it has run over since.
    // (#536) How strong this stroke's paint is, on the deposit rather than on
    // the composite's single opacity — see _bakeDabOpacity's own note.
    const inkStrength = profile.normalizeDeposit ? profile.pigmentStrength : 1
    const mottleSeed = strokeSeed ?? [0, 0]
    const excessByDab = new Map<Dab, number>()
    const puddleByDab = new Map<Dab, number>()
    // #559 — how much to raise this dab's deposit for being dragged thin-side
    // first. Shared by the stamps and the bands, which must agree: the two
    // overlap almost everywhere, and a band on a different scale from the
    // stamps it connects would show as a seam at every sample.
    const thinNibGain = (dab: Dab, fromX: number, fromY: number): number => profile.thinNibInkRefPx > 0
      ? markerThinNibInkGain(
        nibGeometry(dab, preset.sizeMultiplier, nibShape, cornerFraction),
        dab.x - fromX, dab.y - fromY, profile.thinNibInkRefPx,
      )
      : 1
    {
      let prev = prevDab
      let used = scratch.waterUsed
      let pigUsed = scratch.pigmentUsed
      for (const dab of drawable) {
        const wetHere = wetOf(dab)
        paperWetByDab.set(dab, wetHere)
        // #489: travel measured in *this* nib's units, which for a flat one
        // depends on which way it is being dragged (watercolorTravelRadius).
        // `prev` is undefined on the stroke's first dab and sits at the same
        // point for a dwell tick — both are "no direction", and both are what
        // the null branch answers.
        const minor = dab.size * 0.5 * preset.sizeMultiplier
        // (§17.37) The landing dwell: the time the nib has stayed within
        // WC_DWELL_RADIUS of where it came down, on the dabs' own clock.
        // Read per dab as it stands so far, so a live stroke's landing
        // dabs and a replay's see the same values in the same order.
        if (!scratch.landing) scratch.landing = { x: dab.x, y: dab.y, r: minor * Math.max(dab.aspectRatio, 1), t: dab.t }
        else if (!scratch.dwellDone) {
          const L = scratch.landing
          if (Math.hypot(dab.x - L.x, dab.y - L.y) <= WC_DWELL_RADIUS * L.r) scratch.dwellMs = Math.max(scratch.dwellMs, dab.t - L.t)
          else scratch.dwellDone = true
        }
        const dx = prev ? dab.x - prev.x : 0
        const dy = prev ? dab.y - prev.y : 0
        const travelAngle = Math.hypot(dx, dy) > 0.01 ? Math.atan2(dy, dx) : null
        const radius = Math.max(watercolorTravelRadius(
          minor * Math.max(dab.aspectRatio, 1), minor, dab.angle, travelAngle,
        ), 0.5)
        // (#680, s17.84) A dab that really moved (a fifth of its radius): its
        // direction is the travel's. The last dabs before a lift move by a
        // pixel or less and their direction jitters - combed along it, the
        // pool's streaks came out as arcs and waves at every stroke's end.
        if (Math.hypot(dx, dy) > 0.2 * minor) movingByDab.add(dab)
        if (travelAngle !== null) {
          // Perpendicular of travel, rotated out of world space into the nib's
          // frame. Null travel is a tap or a dwell tick with no direction to
          // speak of; the minor axis is the isotropic answer and is what the
          // uniform already defaults to.
          const la = travelAngle + Math.PI / 2 - dab.angle
          acrossByDab.set(dab, [Math.cos(la), Math.sin(la)])
        }
        const seg = this._markerSegmentLength(dab, prev, radius)
        if (profile.waterDepletion) {
          const step = watercolorWaterStep(seg, radius)
          // (#536) Travel spends both clocks; only water is ever given back,
          // and only by paper this stroke *recorded* as wet. See
          // watercolorWaterClock, and RibbonStrokeScratch._pigmentUsed on why
          // the two are separate numbers at all.
          pigUsed += step
          used = watercolorWaterClock(used, step, wetHere)
        }
        // The profile's levels are the *initial* load; the two curves say how
        // much of each is left after that much travel. depositPerRadius already
        // carries the nominal pigment setting, so only the remaining *fraction*
        // multiplies it here.
        // (#536, §17.21) …and a clean-water brush does not run down at all.
        const load = profile.waterDepletion && watercolorBrushRunsDry(profile.pigmentStrength) ? watercolorWaterLoad(used) : 1
        const water = profile.waterDepletion ? profile.waterLevel * load : 1
        // (#536, §17.14) …by the brush's water: a wet brush spends the same
        // finite budget further along the path. See PIGMENT_RUN_DRY_RADII.
        // (§17.26) …and a wet sheet pulls more of it out (watercolorWetPull).
        const pigmentLeft = profile.waterDepletion
          ? watercolorPigmentLoad(pigUsed, profile.waterLevel) * watercolorPigmentRate(profile.waterLevel) * watercolorWetPull(wetHere)
          : 1
        // The gesture's own travel clock, carried on the scratch, so this decays
        // from the *stroke's* start rather than from each batch's. The pigment
        // one: a brush that drank from a puddle halfway along has not gone back
        // to being freshly set down, and the touch-down surplus is about the
        // moment of landing.
        // (#680, §17.74) The dwell at THIS dab, not only at the landing: a
        // stop, a sharp turn, a turn-back unload the reservoir the same way,
        // and the surplus is spent over the travel after it.
        const tau = Math.max(0, watercolorTrailDwell(scratch.trail, dab.x, dab.y, dab.t, WC_DWELL_RADIUS * minor * Math.max(dab.aspectRatio, 1)) - WC_DWELL_FLOOR_MS)
        const gateHere = 1 - Math.min(Math.max(wetHere, 0), 1)
        const pigmentGate = 0.45 + 0.55 * gateHere
        // …and the slowdown relative to this stroke's own pace (watercolorSlowdown).
        const last = scratch.trail.length ? scratch.trail[scratch.trail.length - 1] : null
        let slow = 0
        let speedElapsed = 0
        if (scratch.speedAt < 0) scratch.speedAt = dab.t
        if (last) {
          scratch.speedTravel += Math.hypot(dab.x - last.x, dab.y - last.y)
          const dt = dab.t - scratch.speedAt
          if (dt > 0) {
            // One pointer batch gives several dabs the same timestamp. Keep
            // their travel until the next real time interval; dt=1 invented
            // high speeds and a braking pool at the next batch boundary.
            const v = scratch.speedTravel / dt
            const a = 1 - Math.exp(-dt / WC_SPEED_TAU_MS)
            scratch.speed += (v - scratch.speed) * a
            scratch.speedPeak = Math.max(scratch.speed, scratch.speedPeak * Math.exp(-dt / WC_PEAK_FADE_MS))
            scratch.speedAt = dab.t
            scratch.speedTravel = 0
            speedElapsed = dt
          }
          slow = watercolorSlowdown(scratch.speed, scratch.speedPeak)
        }
        const spent = pigUsed - scratch.surplusAt
        // Two reservoirs, spent at their own lengths: a stop's (the dwell) lays
        // the landing's long pool, a braking's a compact one (WC_SLOW_RUN_RADII).
        scratch.surplusPigment = watercolorSurplus(scratch.surplusPigment, spent, watercolorDwellPigment(tau) * pigmentGate, WC_START_EXCESS_RADII)
        scratch.surplusWater = watercolorSurplus(scratch.surplusWater, spent, watercolorDwellWater(tau) * gateHere, WC_PUDDLE_RADII)
        scratch.brakePigment = watercolorBrakeSurplus(scratch.brakePigment, spent, WC_SLOW_GAIN * slow * pigmentGate, speedElapsed)
        scratch.turnOffset[0] += dx; scratch.turnOffset[1] += dy
        if (Math.hypot(...scratch.turnOffset) >= Math.max(1.5, minor * 0.12)) {
          scratch.brakePigment = Math.min(1.5, scratch.brakePigment + 0.55 * watercolorTurnLoad(scratch.turnDirection, ...scratch.turnOffset) * pigmentGate)
          const direction = scratch.turnOffset
          scratch.turnDirection = [...direction]
          scratch.turnOffset = [0, 0]
        }
        scratch.surplusAt = pigUsed
        scratch.trail.push({ x: dab.x, y: dab.y, t: dab.t })
        if (scratch.trail.length > WC_TRAIL_LEN) scratch.trail.shift()
        const excess = profile.waterDepletion ? watercolorExcessFromSurplus(pigUsed, landedWet, Math.max(scratch.surplusPigment, scratch.brakePigment)) : 1
        excessByDab.set(dab, excess)
        // (#680, s17.79) ...and the landing's own surplus, which needs no dwell:
        // the touch-down's pool is a pool too, broken into blots like the others.
        const landingPool = (1 - Math.min(Math.max(landedWet, 0), 1)) * Math.exp(-pigUsed / WC_START_EXCESS_RADII)
        // Braking pigment is not extra water: a sharp turn must not invent a
        // deep visible puddle merely because it unloads a little more colour.
        const waterPool = Math.max(scratch.surplusWater, landingPool)
        puddleByDab.set(dab, profile.waterDepletion ? watercolorPuddleFromSurplus(waterPool, wetHere) : watercolorPuddleDepth(pigUsed, landedWet, wetHere, scratch.dwellMs))
        if (profile.waterDepletion) this._dabPool.set(dab, Math.min(waterPool, 1))
        if (profile.normalizeDeposit && Math.hypot(dx, dy) > 0.01 && water > 0.1) scratch.brushTravel.push({
          x: dab.x, y: dab.y, radius: minor, aspect: Math.max(1, dab.aspectRatio), angle: dab.angle, dx, dy, water,
        })
        waterByDab.set(dab, water)
        pigmentByDab.set(dab, pigmentLeft)
        if (profile.normalizeDeposit) scratch.standing.set(dab, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load))
        // The stamps' share of the dose, doubled back up because the legacy
        // formula's 0.5 assumed an even split with the bands.
        const stampShare = profile.stampInkShare > 0 ? profile.stampInkShare * 2 : 1
        // (§17.28) Under MAX the stamp's value IS the film: spacing-free.
        deposits.push(profile.normalizeDeposit
          ? (film
            ? profile.depositPerRadius * WC_FILM_DOSE * pigmentLeft * excess
            : profile.depositPerRadius * (seg / radius) * 0.5 * stampShare * pigmentLeft * excess)
          : dab.opacity * seg * 0.5 * thinNibGain(dab, prev?.x ?? dab.x, prev?.y ?? dab.y))
        prev = dab
      }
      scratch.advanceWater(used, pigUsed)
    }
    // (#536, §17.63) Only now. Everything above is the gesture's bookkeeping -
    // the brush's water and pigment clocks, the landing and its dwell, the dab
    // spacing, the direction, the composite's scalars from the first dab - and
    // it has to advance per dab whether or not the batch lands on the sheet.
    // Returning before it made the result depend on how the gesture was cut
    // into batches: the author's live batches off the sheet spent nothing, and
    // the brush came onto the paper fully loaded; a replay paints the operation
    // as one batch that does reach the sheet, and it came on already spent -
    // 30-40 % lighter over the whole mark (a V begun off the page at 32 %).
    if (!targets.length) return

    // (#536, ADR 011 §17.10) The halo: a second, wider, weaker stamp for every
    // dab that landed on wet paper, into the same coverage and deposit buffers.
    // This is where wet-in-wet growth lives now, and the reason it lives here
    // rather than in the composite is spelled out at watercolorHalo. Grown
    // copies carry over every per-dab reading of the original, so the bands
    // and stamps of the halo agree with the mark's own about water, hair
    // direction and paper.
    const haloDabs: Dab[] = []
    const haloDoseByDab = new Map<Dab, number>()
    /** What each ORIGINAL dab gave up to its halo, so the core is laid lighter
     *  by exactly that share — conservation, and the "dissolves in water" feel. */
    const haloShedByDab = new Map<Dab, number>()
    let anyHalo = false
    // A flat disc, not the tool's cone. The ink stamp is a cone that is zero at
    // the nib's rim (inkEdgeFalloff 0 — see the shader's mix(u_inkEdge, 1, depth)),
    // so a stamp merely made wider puts only the cone's outer slope over the
    // ring that is the halo: measured on a replay of Ilya's own stroke through
    // the density view, a halo 2.9x wider at nearly full dose registered at a
    // few per cent of the core. The halo is a plateau of migrated pigment, and
    // a plateau is what this profile lays.
    const haloProfile: RibbonProfile = { ...profile, inkEdgeFalloff: 1 }
    if (profile.normalizeDeposit) {
      for (const dab of drawable) {
        const { scale, shed, wet } = watercolorHalo(paperWetByDab.get(dab) ?? 0, waterByDab.get(dab) ?? 0)
        // Past the composite's bloom, not merely past the dab — see
        // WATERCOLOR_HALO_PAST_BLOOM. spreadPx is the gesture's reach in world
        // px and dab.size is a diameter, hence the factor of two.
        const grown: Dab = { ...dab, size: dab.size * scale + 2 * WATERCOLOR_HALO_PAST_BLOOM * spreadPx * wet }
        haloDabs.push(grown)
        // The shed share as the halo stamp's dose, un-compensated for the wider
        // radius on purpose — see watercolorHalo on why per pixel it comes out
        // as shed / scale, a ring's worth rather than a disc's.
        haloDoseByDab.set(grown, shed)
        haloShedByDab.set(dab, shed)
        if (shed > 0) anyHalo = true
        const across = acrossByDab.get(dab)
        if (across) acrossByDab.set(grown, across)
        waterByDab.set(grown, waterByDab.get(dab) ?? 0)
        pigmentByDab.set(grown, pigmentByDab.get(dab) ?? 1)
        excessByDab.set(grown, excessByDab.get(dab) ?? 1)
        puddleByDab.set(grown, puddleByDab.get(dab) ?? 1)
        paperWetByDab.set(grown, paperWetByDab.get(dab) ?? 0)
      }
    }

    // Bands share the stamps' scale, or they would swamp it: the two overlap
    // almost everywhere and each carries half a dose, so a band still on the
    // legacy scale would drown whatever the normalized stamps expressed.
    // Omitting the callback leaves buildRibbonBands' own formula untouched,
    // which is what the brush pen gets. The marker (#559) passes that same
    // formula back in with the thin-nib gain on it, so its bands and stamps
    // stay on one scale — a gain of 1 reproduces the omitted case exactly.
    const inkFor = profile.thinNibInkRefPx > 0 && !profile.normalizeDeposit
      ? (d0: Dab, d1: Dab, travel: number): { ink: number; water: number; paperWet: number; strength: number; puddle: number } => ({
        ink: d1.opacity * travel * 0.5 * thinNibGain(d1, d0.x, d0.y),
        water: 0, paperWet: 0, strength: 0, puddle: 1,
      })
      : profile.normalizeDeposit
      ? (d0: Dab, d1: Dab, travel: number): { ink: number; water: number; paperWet: number; strength: number; puddle: number } => {
        // #489: same measure the stamps use, and it has to be the same one —
        // the bands overlap the stamps almost everywhere, so two different
        // readings of "how far in nib units" would show up as a seam.
        const minor = d1.size * 0.5 * preset.sizeMultiplier
        const bdx = d1.x - d0.x
        const bdy = d1.y - d0.y
        const bandAngle = Math.hypot(bdx, bdy) > 0.01 ? Math.atan2(bdy, bdx) : null
        const radius = Math.max(watercolorTravelRadius(
          minor * Math.max(d1.aspectRatio, 1), minor, d1.angle, bandAngle,
        ), 0.5)
        // Per segment, not per batch: the water weighting rides the vertex now
        // (markerRibbon.ts's FLOATS_PER_VERTEX) precisely so that how the
        // stroke was cut into pointer events cannot change the result.
        return {
          ink: (film
            ? profile.depositPerRadius * WC_FILM_DOSE * 2
            : profile.depositPerRadius * (travel / radius) * 0.5 * ((1 - profile.stampInkShare) * 2))
            * (pigmentByDab.get(d1) ?? 1)
            * (excessByDab.get(d1) ?? 1)
            // (#536) …less what this dab shed into standing water — see the
            // halo, which is made of exactly this share.
            * (1 - (haloShedByDab.get(d1) ?? 0)),
          water: waterByDab.get(d1) ?? 0,
          paperWet: paperWetByDab.get(d1) ?? 0,
          // (#680, s17.84) Negative on a segment the brush barely moved
          // along: its direction jitters, and the coverage pass leaves the
          // pool mark (.g) off there - see movingByDab. The ink pass reads
          // the magnitude.
          strength: Math.hypot(bdx, bdy) > 0.2 * minor ? inkStrength : -inkStrength,
          puddle: puddleByDab.get(d1) ?? 1,
        }
      }
      : undefined
    // #547 — not merely unused for a stamps-only tool but not built at all:
    // the band builder walks every consecutive pair and allocates a vertex
    // buffer per segment, which on a densely-spaced brush stroke is the larger
    // half of the CPU work in this method.
    const bands = profile.stampsOnly ? EMPTY_BANDS : buildRibbonBands(
      drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, inkFor, film,
    )

    // (#536, s17.13) The hairs' bundle count, for the ink pass below and the
    // composite alike - see ribbonBristleCombs.
    const combs = ribbonBristleCombs(profile, bristleRadiusPx)
    // (#536, §17.19) This stroke's paint as absorption, for the colour record.
    const tau = pigmentAbsorption(color)
    scratch.paints.add(color.join(','))

    // #547 — flow, normalized against how far the brush travelled between
    // stamps, computed once for the batch rather than per tile.
    //
    // Why it has to be normalized at all, and this is the correction to the
    // first version: the coverage buffer accumulates as plain "over", and the
    // stamps of this tool are spaced a *twentieth* of the footprint apart. A
    // pixel is therefore under ~20 of them in a single pass, so even a flow of
    // 0.12 reaches 1 - 0.88^20 = 0.92 — and every brush, at every pressure, came
    // out at full density. The setting existed and could not be seen ("нажим
    // меняет плотность вообще не работает, всё время максимальная плотность").
    //
    // The fix makes `flow` mean what a painter means by it: **how much one full
    // pass of the brush lays down**, rather than how much one stamp does. Per
    // stamp that is
    //
    //     f' = 1 - (1 - f) ^ (travel / diameter)
    //
    // so that after travelling one diameter — i.e. after the ~diameter/travel
    // stamps that cover a given pixel — the accumulated coverage is exactly f,
    // whatever the spacing. Two consequences worth naming: the density stops
    // depending on how fast the stroke was drawn (fast strokes used to be
    // sparser and therefore paler), and it stops depending on the brush's
    // authored spacing, which is now free to be chosen for smoothness alone.
    const stampFlows = profile.stampFlow
      ? drawable.map((dab, i) => {
        const prevOne = i === 0 ? prevDab : drawable[i - 1]
        const diameter = Math.max(dab.size * preset.sizeMultiplier, 0.5)
        const travel = this._markerSegmentLength(dab, prevOne, diameter * 0.5)
        const full = profile.stampFlow!(dab.pressure)
        if (full >= 1) return 1
        return Math.max(0, Math.min(1, 1 - Math.pow(1 - full, Math.min(travel / diameter, 1))))
      })
      : null



    for (const tile of targets) {
      const { original, coverage, inkLoad, inkColor } = scratch.getOrCreate(tile.buffer)

      // #547, ADR 013 §3 — the stamp's own `opacity` argument is this dab's
      // **flow** for the digital brush, and a plain 0 for the three tools whose
      // coverage pass only needs a silhouette (their mode-6 branch ignores it).
      // (#536, s17.11) For the watercolor the recorded paper wetness rides
      // along into the coverage stamp too: its .b is the standing-water
      // record the diffusion pass gates on. See u_washWater.
      for (let i = 0; i < drawable.length; i++) {
        const dab = drawable[i]
        if (!this._nibTouchesTile(tile, dab, preset)) continue // (§17.70)
        this._drawRibbonNibPass(
          coverage, tile, dab, preset, profile, profile.coverageInkMode,
          stampFlows ? stampFlows[i] : 0, true, waterByDab.get(dab) ?? 0, acrossByDab.get(dab) ?? [0, 1],
          paperWetByDab.get(dab) ?? 0, 1, [0, 0], null, combs, 0, null, puddleByDab.get(dab) ?? 1,
          // (s17.84) ...and the pool share into the coverage's .g - where
          // the brush was moving: a standing dab has no direction to comb
          // along (its across is the default, not the travel's).
          profile.waterDepletion && movingByDab.has(dab) ? 1 : 0,
        )
        yield pieceTris ? this._nibDrawCost(tile, dab, preset) : 0
      }
      // #547 — a brush's mark is a repeated stamp, not a swept smear, so the
      // bands that fill between samples are switched off for it (ADR 013 §4).
      // The three older tools keep them: on a turn the bands reach places the
      // stamps miss, and with nothing there the composite paints bare paper.
      if (!profile.stampsOnly && bands.length) {
        for (const piece of ribbonBandPieces(bands, pieceTris)) {
          const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0
          if (pieceTris && !px) continue // (§17.70) nothing of it on this tile
          this._drawRibbonBands(
            coverage, tile, piece, 'coverage', profile.aaPx, 0, 0, [0, 0],
            ribbonWaterDelivery(profile).water, ribbonWaterDelivery(profile).retain,
            combs, 0, null, profile.waterDepletion ? 1 : 0,
          )
          yield px
        }
      }

      // Ink follows the *same* figure as the silhouette. Depositing it only at
      // the sample stamps is what produced the rounded white notches on turns:
      // between stamps the ribbon still made the mark fully opaque, but with an
      // ink load of zero the composite multiplies by nothing and the paper
      // shows straight through. Both halves carry half a dose each (see
      // buildRibbonBands) so their overlap sums to the calibrated amount.
      //
      // Skipped entirely for a covering ink, which has no such quantity — see
      // RibbonProfile.ink.
      // (§17.28) With the film on, the stamps and bands go into the gesture's
      // own buffers under MAX and inkLoad/inkColor are rebuilt as base + film
      // over the batch's rect; without it, straight into inkLoad additively.
      const fb = film && inkLoad ? scratch.filmBuffers(tile.buffer) : null
      const inkDest = fb ? fb.strokeInk : inkLoad
      const colorDest = fb ? fb.strokeColor : inkColor
      const beginInk = (buf: AccumulationBuffer): void => { if (fb) buf.beginMaxDraw(this._minmaxExt!); else buf.beginAdditiveDraw() }
      const bandMode = fb ? 'ink-max' as const : 'ink' as const
      // (#680, s17.79) The watercolor's surplus lies in blots — see wcPoolBlot.
      const poolBlot = profile.waterDepletion ? 1 : 0
      if (inkDest) {
        for (let i = 0; i < drawable.length; i++) {
          if (!this._nibTouchesTile(tile, drawable[i], preset)) continue // (§17.70)
          beginInk(inkDest)
          this._drawRibbonNibPass(
            inkDest, tile, drawable[i], preset, profile, 7,
            deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false,
            waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1],
            paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, null, combs, profile.bristleInk,
            null, puddleByDab.get(drawable[i]) ?? 1, poolBlot,
          )
          inkDest.endDraw()
          yield pieceTris ? this._nibDrawCost(tile, drawable[i], preset) : 0
        }
        if (bands.length) {
          for (const piece of ribbonBandPieces(bands, pieceTris)) {
            const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0
            if (pieceTris && !px) continue
            this._drawRibbonBands(
              inkDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed,
              0, 0, combs, profile.bristleInk, null, poolBlot,
            )
            yield px
          }
        }
        // (#536, §17.19) …and the same figure once more, into the colour
        // record: the paint's optical depth per texel. Same dose, same hairs,
        // same mottling, so depth and deposit agree to the texel.
        if (colorDest) {
          for (let i = 0; i < drawable.length; i++) {
            if (!this._nibTouchesTile(tile, drawable[i], preset)) continue // (§17.70)
            beginInk(colorDest)
            this._drawRibbonNibPass(
              colorDest, tile, drawable[i], preset, profile, 7,
              deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false,
              waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1],
              paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, null, combs, profile.bristleInk, tau,
              puddleByDab.get(drawable[i]) ?? 1, poolBlot,
            )
            colorDest.endDraw()
            yield pieceTris ? this._nibDrawCost(tile, drawable[i], preset) : 0
          }
          if (bands.length) {
            for (const piece of ribbonBandPieces(bands, pieceTris)) {
              const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0
              if (pieceTris && !px) continue
              this._drawRibbonBands(
                colorDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed,
                0, 0, combs, profile.bristleInk, tau, poolBlot,
              )
              yield px
            }
          }
        }
      }

      if (inkLoad && profile.normalizeDeposit) scratch.diffusePending = true
      // (#536, ADR 011 §17.10) The halo, after the mark itself: ink only, and
      // only where the wash already has coverage. The pigment a wet-in-wet dab
      // sheds travels as far as the standing water and no further, and the
      // water is this wash's own silhouette — the puddle is a stroke of the
      // same wash — so clipping the stamp by the coverage buffer is what keeps
      // a halo from ever leaving the puddle ("пигмент за пределы лужи может
      // уйти, такого быть не может"). No coverage stamp for the halo for the
      // same reason: it must not grow the silhouette. Skipped outright on dry
      // paper: no wet dab, no second pass, no cost.
      if (anyHalo && inkDest) {
        for (let i = 0; i < haloDabs.length; i++) {
          const dose = haloDoseByDab.get(haloDabs[i]) ?? 0
          if (dose <= 0 || !this._nibTouchesTile(tile, haloDabs[i], preset)) continue // (§17.70)
          beginInk(inkDest)
          this._drawRibbonNibPass(
            inkDest, tile, haloDabs[i], preset, haloProfile, 7, deposits[i] * dose, false,
            waterByDab.get(haloDabs[i]) ?? 0, acrossByDab.get(haloDabs[i]) ?? [0, 1],
            paperWetByDab.get(haloDabs[i]) ?? 0, inkStrength, mottleSeed, coverage, combs, profile.bristleInk,
          )
          inkDest.endDraw()
          yield pieceTris ? this._nibDrawCost(tile, haloDabs[i], preset) : 0
        }
      }
      // (§17.28) The deposit the composite and the settle read: the wash as it
      // stood before this gesture plus the gesture's film, over this batch's
      // rect (the film outside it is unchanged since the last batch).
      if (fb && inkLoad) {
        const rect = this._revealRect(tile, compositeBounds)
        if (rect) {
          this._fieldOp(inkLoad, fb.inkBase, fb.strokeInk, 1, 1, { scissor: rect })
          if (inkColor && fb.strokeColor && fb.colorBase) this._fieldOp(inkColor, fb.colorBase, fb.strokeColor, 1, 1, { scissor: rect })
        }
      }

      // `drawable[0].opacity` rather than a per-dab value: only a tool whose
      // dabs all share one opacity can be composited from a coverage buffer at
      // all, which for the brush pen is guaranteed by _bakeDabOpacity (ADR 009
      // §9 — pressure drives width, never alpha). The marker's branch ignores
      // this argument entirely and reads its own inkLoad texture instead.
      if (deferComposite) {
        // (#536, §17.22) The live gesture: the rect joins this frame's union
        // and the composite runs once, in _display, before the frame is drawn.
        const pending = scratch.pendingComposite.get(tile.buffer)
        if (pending) {
          pending.bounds.minX = Math.min(pending.bounds.minX, compositeBounds.minX)
          pending.bounds.minY = Math.min(pending.bounds.minY, compositeBounds.minY)
          pending.bounds.maxX = Math.max(pending.bounds.maxX, compositeBounds.maxX)
          pending.bounds.maxY = Math.max(pending.bounds.maxY, compositeBounds.maxY)
        } else {
          scratch.pendingComposite.set(tile.buffer, { tile, bounds: { ...compositeBounds } })
        }
        // Every coalesced batch grows both the layer and paper damage, even
        // when this tile already has a pending composite for the frame.
        this._markPaperDamage(compositeBounds)
        this._liveComposite = {
          scratch, preset, profile, color, opacity: drawable[0].opacity, fieldSeed, spreadPx, fringeWater, migratePx,
          inkSmoothPx: profile.normalizeDeposit ? dabSpacing : 0, strokeDir, bristleRadiusPx,
        }
        continue
      }
      const revealPrev = this._revealBeforeBatch(tile, compositeBounds)
      this._drawRibbonCompositeRect(
        tile, compositeBounds, preset, profile, original, coverage, inkLoad, inkColor, color, drawable[0].opacity,
        fieldSeed, spreadPx, fringeWater, migratePx,
        profile.normalizeDeposit ? dabSpacing : 0, strokeDir, bristleRadiusPx,
      )
      this._revealAfterBatch(tile, compositeBounds, revealPrev)
      yield pieceTris ? rectOnTile(tile, compositeBounds) : 0
    }

    scratch.noteFinish({
      target, preset, profile, color, opacity: drawable[0].opacity,
      bounds: reachBounds, fieldSeed, landedWet, wetPeak: wetPeakHere, radiusPx: nibRadius, dwellMs: scratch.dwellMs,
    })

    target.markContentPainted(compositeBounds)
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
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      before.endDraw()
      this._revealPoolRelease(prev.before)
    }
    let layerId = ''
    for (const [id, buf] of this._layers) if (buf === layer) { layerId = id; break }
    this._washReveals.set(buffer, { layerId, before, startedAt: performance.now() })
  }

  /** How much of the kept picture still shows, 1 → 0 over WC_REVEAL_MS,
   *  fast first: the square of the time left. */
  private _revealHold(reveal: WashReveal, now: number): number {
    const left = 1 - (now - reveal.startedAt) / WC_REVEAL_MS
    return left <= 0 ? 0 : left * left
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
      this._ribbonScratchPool.release(sum)
    }
    this._ribbonScratchPool.release(prev)
  }

  /** One WC_FIELD_OP_FRAG step between same-sized buffers — see the shader
   *  for the modes. `c` is mode 3's third input; `scissor` (bottom-up GL
   *  pixels) limits the write to a rect, everything outside it untouched. */
  private _fieldOp(
    out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, mode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20, k: number,
    opts: { c?: AccumulationBuffer; scissor?: [number, number, number, number]; dir?: [number, number]; d?: AccumulationBuffer; origin?: [number, number]; band?: [number, number]; size?: [number, number]; tau?: [number, number, number]; world?: [number, number, number] } = {},
  ): void {
    const { gl } = this
    out.beginReplaceDraw()
    if (opts.scissor) {
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(opts.scissor[0], opts.scissor[1], opts.scissor[2], opts.scissor[3])
    }
    // (#685) Carry modes must never enter the bookkeeping program: its
    // combined control flow crashes the Galaxy Tab's Adreno linker.
    const high = mode >= 10
    const prog = mode === 15 ? this._fieldOpCarryProg : mode === 16 ? this._fieldOpCarryColourProg : high ? this._fieldOpHighProg : this._fieldOpProg
    const u = mode === 15 ? this._fieldOpCarryUni : mode === 16 ? this._fieldOpCarryColourUni : high ? this._fieldOpHighUni : this._fieldOpUni
    const pos = mode === 15 ? this._fieldOpCarryPosLoc : mode === 16 ? this._fieldOpCarryColourPosLoc : high ? this._fieldOpHighPosLoc : this._fieldOpPosLoc
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, a.texture)
    gl.uniform1i(u.u_a, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b.texture)
    gl.uniform1i(u.u_b, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, (opts.c ?? b).texture)
    gl.uniform1i(u.u_c, 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, (opts.d ?? b).texture)
    gl.uniform1i(u.u_d, 3)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(u.u_k, k)
    gl.uniform1f(u.u_mode, mode)
    gl.uniform2f(u.u_dir, opts.dir ? opts.dir[0] / out.width : 0, opts.dir ? opts.dir[1] / out.height : 0)
    gl.uniform2f(u.u_origin, opts.origin ? opts.origin[0] : 0, opts.origin ? opts.origin[1] : 0)
    gl.uniform2f(u.u_size, opts.size ? opts.size[0] : out.width, opts.size ? opts.size[1] : out.height)
    gl.uniform2f(u.u_band, opts.band ? opts.band[0] : 0, opts.band ? opts.band[1] : 0)
    gl.uniform3fv(u.u_tau, opts.tau ?? [0, 0, 0])
    gl.uniform3fv(u.u_world, opts.world ?? [0, 0, 0])
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    if (opts.scissor) gl.disable(gl.SCISSOR_TEST)
    out.endDraw()
  }

  /** (#536, §17.24) One relaxation step of the water front's cost (WC_WATER_FRONT_FRAG)
   *  over a settle field whose top-left is at world (x0, y0): src → dst. Shared by
   *  the settle's outward and inward passes and the group tide's inward one. */
  private _waterFrontStep(
    field: SettleField, x0: number, y0: number, dryCost: number,
    src: AccumulationBuffer, dst: AccumulationBuffer, max: number, climb: number, floor: number, stride = 1,
    /** (§17.44) World px per field cell. */
    scale = 1, foreignWater: WebGLTexture | null = null,
  ): void {
    const { gl } = this
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    dst.beginReplaceDraw()
    gl.useProgram(this._waterFrontProg)
    this._stamps.bindNoise(this._waterFrontUni.u_wcNoiseTex)
    const u = this._waterFrontUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._waterFrontPosLoc)
    gl.vertexAttribPointer(this._waterFrontPosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src.texture)
    gl.uniform1i(u.u_cost, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
    gl.uniform1i(u.u_paperHeightMap, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, field.coverage.texture)
    gl.uniform1i(u.u_film, 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, foreignWater ?? this._paperTex)
    gl.uniform1i(u.u_foreignFilm, 3)
    gl.uniform1f(u.u_foreignWet, foreignWater ? 1 : 0)
    gl.uniform1f(u.u_dryCost, dryCost)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform2f(u.u_resolution, field.w, field.h)
    gl.uniform2f(u.u_paperOrigin, x0 / scale, -(y0 / scale + field.h))
    gl.uniform2f(u.u_paperTexSize, paperTexW / scale, paperTexH / scale)
    gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
    gl.uniform1f(u.u_climb, climb)
    gl.uniform1f(u.u_floor, floor)
    gl.uniform1f(u.u_costMax, max)
    gl.uniform1f(u.u_stride, stride)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    dst.endDraw()
  }

  /** (#536, §17.44) One WC_RESAMPLE_FRAG draw into `dst` over the GL rect
   *  (dx, dy, dw, dh). Mode 0 averages `src` down (ratio 2), mode 1 writes
   *  base + up(src) - up(old), mode 2 max(base, up(src)) (ratio 1/2). `dst`
   *  must not be `base`: modes 1 and 2 go through a temporary. */
  private _wcResample(
    dst: AccumulationBuffer, dx: number, dy: number, dw: number, dh: number,
    src: AccumulationBuffer, sx: number, sy: number, ratio: number, mode: 0 | 1 | 2,
    old: AccumulationBuffer | null = null, base: AccumulationBuffer | null = null,
    /** The source texels the draw may read: [x0, y0, x1, y1). The whole source by default. */
    clampRect: [number, number, number, number] | null = null,
  ): void {
    if (dw <= 0 || dh <= 0) return
    const { gl } = this
    dst.beginReplaceDraw()
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(dx, dy, dw, dh)
    gl.useProgram(this._resampleProg)
    const u = this._resampleUni
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
    gl.enableVertexAttribArray(this._resamplePosLoc)
    gl.vertexAttribPointer(this._resamplePosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.texture); gl.uniform1i(u.u_src, 0)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (old ?? src).texture); gl.uniform1i(u.u_old, 1)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, (base ?? src).texture); gl.uniform1i(u.u_base, 2)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform2f(u.u_srcSize, src.width, src.height)
    gl.uniform2f(u.u_baseSize, (base ?? dst).width, (base ?? dst).height)
    gl.uniform2f(u.u_dstOrigin, dx, dy)
    gl.uniform2f(u.u_srcOrigin, sx, sy)
    gl.uniform1f(u.u_ratio, ratio)
    gl.uniform1f(u.u_mode, mode)
    const cr = clampRect ?? [0, 0, src.width, src.height]
    gl.uniform4f(u.u_clamp, cr[0], cr[1], cr[2], cr[3])
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disable(gl.SCISSOR_TEST)
    dst.endDraw()
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

  /** Drops every reveal that has run out, or whose layer is gone. */
  private _sweepReveals(now: number, goneLayerId: string | null = null): void {
    for (const [buffer, reveal] of this._washReveals) {
      if (reveal.layerId !== goneLayerId && this._revealHold(reveal, now) > 0) continue
      this._revealPoolRelease(reveal.before)
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
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u.u_after, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, reveal.before.texture)
    gl.uniform1i(u.u_before, 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(u.u_hold, this._revealHold(reveal, performance.now()))
    gl.uniform1f(u.u_opacity, opacity)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.disable(gl.BLEND)
    gl.viewport(0, 0, targetW, targetH)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** (#536, ADR 011 §17.11, §17.17) The wet diffusion: what THIS operation
   *  laid (the deposit less what was settled before it) is split into a
   *  fixed and a mobile share (WET_DIFFUSE_MOBILE); the mobile share runs
   *  WET_DIFFUSE_RADII steps of WC_DIFFUSE_FRAG, ping-ponged; and the sum —
   *  settled + fixed + moved — goes back to the tiles and becomes the new
   *  settled deposit.
   *
   *  Only this operation's paint, deliberately. The first version moved the
   *  whole wash at every settle, so the first stroke of a wash was diffused
   *  again by every later stroke in it — thinner each time — while the
   *  latest sat where it was laid: "пигмента в луже катастрофически мало, а
   *  повторный штрих ложится слишком сильно". Paint moves once, at the
   *  settle that laid it, then it is fixed; lifting fixed paint with clean
   *  water is the remobilization round (§17.9). The flux is linear in the
   *  concentration for a given gate, so moving the mobile share of the new
   *  paint alone is exact, and each part is conserved on its own.
   *
   *  Over ONE field, not per tile. Per tile, everything off the tile was dry
   *  paper, so a puddle across x = 1024 kept its paint on each side — a
   *  straight seam, visible the moment the reveal let go ("при высыхании я
   *  вижу линии склейки тайлов"). The wash's tiles are stitched into a rect —
   *  the settle bounds padded by the schedule's whole reach, so no texel with
   *  paint can ever see the rect's edge — and copied back. The paper's height
   *  is sampled at the WORLD position, so where the rect starts (a live
   *  gesture's bounds and a replay's differ by a batch's padding) cannot move
   *  a pit. Nothing here reads a clock; the schedule is a constant of the
   *  tool, and the eight-bit write between steps is the one measured leak. */
  /** (#536, ADR 011 §17.11, §17.22) The wet diffusion over this wash's
   *  tiles stitched into one field, as a list of GPU steps plus the copy-back
   *  — a list so that the author's pen-up can spread it over frames under
   *  the reveal (see _startSettle) while a replay runs it in one go. Null
   *  when the wash holds no deposit here. */
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
  ): { ops: Array<() => void>; finish: () => void } | null {
    const { gl } = this
    const tiles = targets.filter(t => scratch.peek(t.buffer)?.inkLoad)
    if (!tiles.length) return null
    // The rect: the settle's bounds plus the reach, clipped to the tiles that
    // actually hold this wash. Capped — a wash wider than the cap diffuses
    // in a window around its centre and sees a wall at the window's edge.
    // (#536, §17.22) 1536, from 2048: seven buffers of 2048² are 117 MB, which
    // a tablet does not have to spare; at 1536 the field is 66 MB and a 400 px
    // brush's whole gesture still fits it with its reach.
    // (§17.44) A big brush settles at HALF resolution: every pass of the
    // settle over a field a quarter the size, and a window twice as wide in
    // the world. The field holds cells of S px; what goes back to the tiles
    // is the field's change, brought up and added to the full-resolution
    // record (_wcResample), so the grain and the brush's texture are the
    // tile's own and only the movement is coarse. On the tablet a 400 px
    // zigzag's settle was 70 ms an entry and ~40 entries a chunk.
    // ...and only a big mark over a big window: a drop into a puddle or a
    // patch of a few hundred pixels settles in a small field anyway, and at
    // half resolution its paint spread softer and paler than it does.
    let S = 1
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const t of tiles) {
      minX = Math.min(minX, t.originX); minY = Math.min(minY, t.originY)
      maxX = Math.max(maxX, t.originX + t.buffer.width); maxY = Math.max(maxY, t.originY + t.buffer.height)
    }
    // (§17.38) ...padded by the further of the diffusion's reach and the
    // water front's run: the front's budget is in cost units and a cell
    // costs at least WC_FRONT_FLOOR, so budget / floor px is the furthest
    // the domain can lie past the footprint. With the diffusion trimmed
    // to a few texels the pad shrank to six, a flooded landing's front
    // (budget up to 160) ran into the field's edge, and the domain - and
    // the coverage it extends - came out cut to the rect: a wash on the
    // rig turned into a lopsided polygon.
    const frontReachPx = Math.ceil(watercolorSpreadBudget(radiusPx, water, Math.max(landedWet, wetPeak)) / WC_FRONT_FLOOR)
    // (§17.42) ...plus, when the wash dries as one component, the margin
    // the group tide needs around what changed: its band is read off an
    // inward relaxation of `inSteps` cells from the coverage's edge and its
    // kernel gathers about a radius, so a texel closer than that to the
    // field's edge could be missing a contour that lies just outside the
    // field. The dry target is copied back over the field LESS this margin;
    // the wet state over all of it.
    const groupDry = !this._wcAb.opDry
    const dryMargin = groupDry ? Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) + 2 + Math.ceil(radiusPx) + 2 : 0
    const pad = Math.max(WET_DIFFUSE_REACH, frontReachPx) + 1 + dryMargin
    let x0 = Math.max(minX, Math.floor(bounds.minX) - pad), y0 = Math.max(minY, Math.floor(bounds.minY) - pad)
    let x1 = Math.min(maxX, Math.ceil(bounds.maxX) + pad), y1 = Math.min(maxY, Math.ceil(bounds.maxY) + pad)
    if (radiusPx >= WC_HALF_RES_RADIUS_PX && Math.max(x1 - x0, y1 - y0) > WC_HALF_RES_SPAN_PX) S = 2
    const CAP = 1536 * S
    if (x1 - x0 > CAP) { const c = (x0 + x1) * 0.5; x0 = Math.floor(c - CAP / 2); x1 = x0 + CAP }
    if (y1 - y0 > CAP) { const c = (y0 + y1) * 0.5; y0 = Math.floor(c - CAP / 2); y1 = y0 + CAP }
    if (S > 1) {
      // Cell-aligned: tile edges are multiples of 1024, so a rect on even
      // coordinates maps every tile overlap onto whole cells.
      x0 = Math.max(minX, Math.floor(x0 / S) * S); y0 = Math.max(minY, Math.floor(y0 / S) * S)
      x1 = Math.min(maxX, Math.ceil(x1 / S) * S); y1 = Math.min(maxY, Math.ceil(y1 / S) * S)
      // (§17.49) ...and back under the cap: the alignment could push a capped
      // window one field texel past it - 1537, which the field rounds up to
      // the next size, so a big wash's chunk settle (1536) and its pen-up
      // settle (1537) re-made the whole field in turn, every stroke.
      if (x1 - x0 > CAP) x1 = x0 + CAP
      if (y1 - y0 > CAP) y1 = y0 + CAP
    }
    const w = x1 - x0, h = y1 - y0
    if (w <= 0 || h <= 0) return null
    scratch.noteStorageBounds({ minX: x0, minY: y0, maxX: x1, maxY: y1 })
    const field = this._diffuseFieldFor(w / S, h / S)
    const { w: paperTexW, h: paperTexH } = this._paperWorldSize()
    // (§17.44) At half resolution what goes home is the SETTLED wash at full
    // resolution plus the field's result less its own settled part: the
    // wash already on the paper keeps its grain and texture to the pixel,
    // and the operation's own wet paint comes back from the field whole -
    // smoothed, as wet paint is. Returning the whole deposit plus the
    // field's change kept the new film's one-pixel edge, which the half-
    // resolution field cannot see, and every pass of a big brush left a
    // thin line where its edge had been. So: the settled part in the field
    // (b0, cb0) and at full resolution per tile (snapshots, taken at the
    // stitch - a running gesture's next batch refreshes the film's base).
    const a0 = S > 1 ? this._ribbonScratchPool.acquire(field.w, field.h) : null
    const ca0 = S > 1 ? this._ribbonScratchPool.acquire(field.w, field.h) : null
    const snapshots = new Map<AccumulationBuffer, { ink: AccumulationBuffer; color: AccumulationBuffer | null }>()
    // The settle's rect in the field's GL cells, for the interpolation's clamp.
    const fieldRect: [number, number, number, number] = [0, field.h - h / S, w / S, field.h]
    // A world rect of a tile into the field (S = 1: a copy; else the 2x2 mean).
    const toField = (src: AccumulationBuffer, tile: PaintTarget, wx0: number, wy0: number, wx1: number, wy1: number, dst: AccumulationBuffer): void => {
      const tx = wx0 - tile.originX, ty = tile.buffer.height - (wy1 - tile.originY)
      const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S
      if (S === 1) src.copyRegionInto(dst, tx, ty, fx, fy, wx1 - wx0, wy1 - wy0)
      else this._wcResample(dst, fx, fy, (wx1 - wx0) / S, (wy1 - wy0) / S, src, tx, ty, S, 0)
    }
    // ...and back: S = 1, the field's value; else base + up(new - old). The
    // target may be the base: the draw goes through a pooled temporary.
    const fromField = (fNew: AccumulationBuffer, fOld: AccumulationBuffer | null, tile: PaintTarget, wx0: number, wy0: number, wx1: number, wy1: number, target: AccumulationBuffer, base: AccumulationBuffer): void => {
      const tx = wx0 - tile.originX, ty = tile.buffer.height - (wy1 - tile.originY)
      const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S
      if (S === 1 || !fOld) { fNew.copyRegionInto(target, fx, fy, tx, ty, wx1 - wx0, wy1 - wy0); return }
      const tmp = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
      this._wcResample(tmp, tx, ty, wx1 - wx0, wy1 - wy0, fNew, fx, fy, 1 / S, 1, fOld, base, fieldRect)
      tmp.copyRegionInto(target, tx, ty, tx, ty, wx1 - wx0, wy1 - wy0)
      this._ribbonScratchPool.release(tmp)
    }

    // Every tile's overlap with the rect, and the settled records the tiles
    // still lack — acquired now so the steps below can assume them.
    const overlaps: Array<{ tile: PaintTarget; ox0: number; oy0: number; ox1: number; oy1: number }> = []
    for (const tile of tiles) {
      const entry = scratch.peek(tile.buffer)
      if (!entry?.inkLoad) continue
      // (§17.44) The settled records are only needed without the film: with
      // it, the film's base (inkBase/colorBase, refreshed on the gesture's
      // first batch) IS the wash as it stood before the operation, and a
      // second pair of tile-sized textures per tile holding the same thing
      // was a quarter of the gigabyte of scratch the tablet carried.
      if (!this._minmaxExt && !entry.inkSettled) {
        entry.inkSettled = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
        entry.inkSettled.clear()
      }
      if (!this._minmaxExt && entry.inkColor && !entry.colorSettled) {
        entry.colorSettled = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
        entry.colorSettled.clear()
      }
      const ox0 = Math.max(x0, tile.originX), oy0 = Math.max(y0, tile.originY)
      const ox1 = Math.min(x1, tile.originX + tile.buffer.width), oy1 = Math.min(y1, tile.originY + tile.buffer.height)
      if (ox1 <= ox0 || oy1 <= oy0) continue
      overlaps.push({ tile, ox0, oy0, ox1, oy1 })
    }
    if (!overlaps.length) return null

    const foreign = foreignWaterStencil(scratch.foreignSources ?? [], scratch.wetContacts,
      { x: x0, y: y0, w: field.w * S, h: field.h * S })
    const flow = brushDragField(scratch.brushTravel, { x: x0, y: y0, w: field.w * S, h: field.h * S })
    let flowTexture: WebGLTexture | null = null
    let foreignTexture: WebGLTexture | null = null
    const ops: Array<() => void> = []
    if (flow) ops.push(() => {
      this._brushFlowTex ??= gl.createTexture()
      flowTexture = this._brushFlowTex
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, flowTexture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, flow.width, flow.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, flow.pixels)
    })
    if (foreign) ops.push(() => {
      this._foreignWaterTex ??= gl.createTexture()
      foreignTexture = this._foreignWaterTex
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, foreignTexture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, foreign.width, foreign.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, foreign.pixels)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    })
    // (§17.44) The gesture whose film this settle consumes, fixed now: a
    // chunk's settle may land after the next chunk's film has begun.
    const gesture = scratch.gesture
    // Stitch: every tile's overlap with the rect, top-down world → bottom-up
    // GL on both sides, exactly as SmudgePainter.gatherPatch does it. `a` takes the
    // deposit, `b` what was settled, `coverage` the silhouette.
    ops.push(() => {
      field.a.clear()
      field.b.clear()
      field.coverage.clear()
      field.ca.clear()
      field.cb.clear()
      for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
        const entry = scratch.peek(tile.buffer)
        if (!entry?.inkLoad) continue
        // The settled wash: the film's base where this operation's gesture
        // laid paint on the tile, the deposit itself where it did not (no new
        // paint there, nothing mobile), the old record without a film.
        const settledInk = (entry.filmGesture === gesture ? entry.inkBase : null) ?? entry.inkSettled ?? entry.inkLoad
        toField(entry.inkLoad, tile, ox0, oy0, ox1, oy1, field.a)
        toField(settledInk, tile, ox0, oy0, ox1, oy1, field.b)
        if (S > 1) {
          const tx = ox0 - tile.originX, ty = tile.buffer.height - (oy1 - tile.originY)
          const ink = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
          settledInk.copyRegionInto(ink, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0)
          let color: AccumulationBuffer | null = null
          if (entry.inkColor) {
            const sc = (entry.filmGesture === gesture ? entry.colorBase : null) ?? entry.colorSettled ?? entry.inkColor
            color = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
            sc.copyRegionInto(color, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0)
          }
          snapshots.set(tile.buffer, { ink, color })
        }
        toField(entry.coverage, tile, ox0, oy0, ox1, oy1, field.coverage)
        if (entry.inkColor) {
          const settledColor = (entry.filmGesture === gesture ? entry.colorBase : null) ?? entry.colorSettled ?? entry.inkColor
          toField(entry.inkColor, tile, ox0, oy0, ox1, oy1, field.ca)
          toField(settledColor, tile, ox0, oy0, ox1, oy1, field.cb)
        }
      }
      if (a0) field.b.copyTo(a0)
      if (ca0) field.cb.copyTo(ca0)
    })

    const fieldOp = (out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, mode: 0 | 1, k: number): void =>
      this._fieldOp(out, a, b, mode, k)
    const diffuseStep = (src: AccumulationBuffer, dst: AccumulationBuffer, radius: number, knight: boolean, gate: AccumulationBuffer = field.coverage): void => {
      dst.beginReplaceDraw()
      gl.useProgram(this._diffuseProg)
      const u = this._diffuseUni
      gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
      gl.enableVertexAttribArray(this._diffusePosLoc)
      gl.vertexAttribPointer(this._diffusePosLoc, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, src.texture)
      gl.uniform1i(u.u_ink, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, gate.texture)
      gl.uniform1i(u.u_coverage, 1)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, this._paperTex)
      gl.uniform1i(u.u_paperHeightMap, 2)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform2f(u.u_resolution, field.w, field.h)
      // The paper at the world position of a texel. A tile passes
      // (originX, -originY) and lets its height of 1024 fold into the paper's
      // period; a rect of any height has to say where its bottom row is.
      gl.uniform2f(u.u_paperOrigin, x0 / S, -(y0 / S + field.h))
      gl.uniform2f(u.u_paperTexSize, paperTexW / S, paperTexH / S)
      gl.uniform2f(u.u_paperScale, this._opts.paperScale, this._opts.paperScale)
      gl.uniform1f(u.u_d, WET_DIFFUSE_D)
      gl.uniform1f(u.u_b, WET_DIFFUSE_B)
      gl.uniform1f(u.u_radius, Math.max(1, Math.round(radius / S)))
      gl.uniform1f(u.u_stencil, knight ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      dst.endDraw()
    }
    // (§17.23) The operation's footprint — where its own deposit lies, which
    // is the mobile field before anything moves — and the dome over it: the
    // mask blurred at falling strides, 1 deep inside, 0.5 on the edge, 0
    // outside. Then the band just inside the edge, blurred by the rim's
    // kernel, kept in `mask` for both rims below. Once per settle.
    // (§17.24) The water front, once per settle: the operation's footprint
    // (its mobile deposit before anything moves) seeds a cost field, the
    // relaxation runs it out over the paper, and the texels within the
    // budget are the domain the water wets. From the cost: the band texture
    // (r the last `width` cells inside the front, g the domain), and the
    // stitched coverage extended over the domain, so the silhouette and the
    // diffusion's gate reach as far as the water did. Then the band
    // gathered by the rim's kernel, kept in `mask`.
    // (§17.29) ...by the WETTEST paper the mark ran over, not where it
    // landed: Ilya's series 5 lays the second stroke from dry paper into
    // the first, and its front has to run where the first stroke is.
    const runWet = Math.max(landedWet, wetPeak)
    // (§17.44) In the field's cells from here on: budget and radius over S.
    const budgetPx = watercolorSpreadBudget(radiusPx, water, runWet) / S
    const radiusC = radiusPx / S
    const costMax = budgetPx + 4
    // (§17.27) …plus the mark's radius: the puddle's front starts inside
    // the footprint and has to cross it before it runs its budget into the
    // film. At nine steps for a 6 px budget it stopped a third of the way
    // across a 20 px puddle and the backrun never reached the film.
    const frontSteps = watercolorFrontSteps(budgetPx, radiusC, runWet)
    // A fifth of the radius (the photo's ring: FWHM 0.2 R_front), capped:
    // the mass sits at the front, the tail behind it is what the valleys
    // carry, so the band's depth is what survives a blur, not its darkness.
    // (§17.44) The band's width is a WORLD width (a fifth of the radius, at
    // most WC_RIM_BAND_PX px), in cells: capped in cells, a half-resolution
    // band was twice as wide, the tide took twice the share, and every big
    // mark dried paler with a heavier rim.
    const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) / S))
    // The band is the last `width` cells inside the front, measured by a
    // second relaxation run INWARD from everything past the budget, over the
    // same paper: a band from the outward cost alone cannot reach into the
    // footprint, whose cost is zero throughout. Its own scale, so the 8 bits
    // resolve a cell.
    const costMaxIn = width + 3
    const inSteps = width + 2
    const merge = watercolorPuddleMerge(wetPeak)
    // (§17.26) A mark laid over an earlier mark that was still damp has no
    // dry paper to stop at there: its own tideline stands down over it (the
    // bloom ring is the edge), fully on wet.
    const damp = watercolorDampOver(wetPeak)
    // …and a rim wants free water to dry out of: none from a brush that
    // carried none.
    const tideWater = Math.min(1, standing / WC_TIDE_STANDING_FULL)
    // (§17.27) Dyadic strides, 1, 2, 4, 8… up to the mark's radius: a 3x3
    // binomial at each is the à-trous B-spline, a smooth kernel of reach
    // ~radius. The old r/2, r/4, r/8, 1 was the same reach with a bumpy
    // kernel, and on a band one or two texels wide the bumps of the
    // gathered band divided the moved paint into DOTS along the line.
    const gather: Array<[number, number]> = []
    for (let st = 1; st <= Math.max(1, radiusC / 2) && gather.length < 6; st *= 2) gather.push([st, st])
    // (s17.40) The dry cost never less than a share of the budget: a stroke
    // that lands in a puddle carries the puddle's budget (up to 160) out
    // onto dry paper, and at a flat 24 a cell its front ran four cells past
    // the brush there - Ilya's "рваный край вне лужи". At half the budget
    // a cell, the run on dry paper is two cells whatever the budget.
    const dryCost = Math.max(WC_FRONT_DRY_COST, budgetPx * WC_FRONT_DRY_SHARE)
    const frontStep = (src: AccumulationBuffer, dst: AccumulationBuffer, max: number, climb = WC_FRONT_CLIMB, floor = WC_FRONT_FLOOR, stride = 1): void =>
      this._waterFrontStep(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, S, foreignTexture)
    // The front as entries of `ops`, a few relaxation steps per entry so no
    // frame runs the whole field thirty times: the outward cost from the
    // footprint into `pressure`, the inward cost from past-the-budget into
    // `mask`, then the band texture, the coverage extended over the domain,
    // and the band gathered into `mask` for the rims.
    const frontOps = (mobile: AccumulationBuffer, tmp: AccumulationBuffer): void => {
      const pp = { src: field.pressure, dst: tmp }
      const run = (steps: number, max: number, home: AccumulationBuffer, climb: number, floor: number, strides?: readonly number[]): void => {
        const list = strides ?? Array.from({ length: steps }, () => 1)
        for (let i = 0; i < list.length; i += 4) {
          const chunk = list.slice(i, i + 4)
          const last = i + chunk.length >= list.length
          ops.push(() => {
            for (const st of chunk) { frontStep(pp.src, pp.dst, max, climb, floor, st); const t = pp.src; pp.src = pp.dst; pp.dst = t }
            if (last && pp.src !== home) this._fieldOp(home, pp.src, pp.src, 1, 0)
          })
        }
      }
      ops.push(() => { this._fieldOp(field.pressure, mobile, field.coverage, 10, 0.003, { band: [1 / costMax, standing], size: [(budgetPx - 1) / costMax, 0] }); pp.src = field.pressure; pp.dst = tmp })
      // (§17.44) Jumps, then unit passes - see WC_WATER_FRONT_FRAG's u_stride.
      // (§17.44) Unit passes: the dyadic jumps (watercolorFrontStrides) were
      // six times cheaper and measurably wrong - a jump sums the climb along
      // its path but loses the per-cell floor, so the cost came out low, the
      // puddles ran wider and every drop dried paler (124 -> 133 of 255 on
      // Ilya's circles). The big sweeps get their speed from the
      // half-resolution field instead, exactly.
      run(frontSteps, costMax, field.pressure, WC_FRONT_CLIMB, WC_FRONT_FLOOR)
      ops.push(() => { this._fieldOp(field.mask, field.pressure, field.pressure, 12, budgetPx / costMax, { d: field.band }); pp.src = field.mask; pp.dst = tmp })
      // Inward over a gentler relief: the band's inner edge follows the
      // valleys a few cells in (the photo's streaks pointing into the light
      // centre), not a third of the way to the middle.
      // The first two cells in from the front flat, so the sharp peak of
      // the deposition profile (mode 6) is a continuous line along the
      // front - with the relief from the first cell it broke into dots
      // (the photographs' tideline is a thin unbroken line); the tail
      // behind it takes the relief and its fingers.
      run(2, costMaxIn, field.mask, 0, 1)
      run(inSteps - 2, costMaxIn, field.mask, WC_FRONT_CLIMB_IN, WC_FRONT_FLOOR_IN)
      ops.push(() => {
        this._fieldOp(tmp, field.coverage, field.coverage, 11, standing, { d: field.pressure, band: [budgetPx / costMax, 0], size: [1 / costMax, 1] })
        this._fieldOp(field.coverage, tmp, tmp, 1, 0)
        this._fieldOp(field.band, field.pressure, field.coverage, 6, merge, { c: field.mask, d: field.pressure, band: [budgetPx / costMax, width / costMaxIn], size: [1 / costMax, 1 / costMaxIn], origin: [standing, damp], dir: [1, 1], tau: [watercolorDwellWater(dwellMs), 0, 0], world: [x0 / S, -(y0 / S + field.h), S] })
        this._fieldOp(tmp, field.band, field.band, 5, 0, { dir: gather[0] })
        let gs = tmp, gd = field.mask
        for (let i = 1; i < gather.length; i++) { this._fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] }); const t = gs; gs = gd; gd = t }
        if (gs !== field.mask) this._fieldOp(field.mask, gs, gs, 1, 0)
      })
    }
    // (§17.23) The rim: `share` of `paint` inside the footprint goes to the
    // band. Two free buffers; the result lands in `t2`.
    const rim = (paint: AccumulationBuffer, share: number, t1: AccumulationBuffer, t2: AccumulationBuffer, tide = false): void => {
      // (s17.30) The bloom lifts the wash's paint by the DOME over the drop
      // (band .a: all of it under the centre, none at the front), the tide
      // the mark's own paint over the whole domain (band .g). A uniform lift
      // left a hard-edged hole the size of the drop's footprint - Ilya's
      // "слишком резко обеляет лужу в месте касания".
      this._fieldOp(t1, paint, paint, tide ? 7 : 9, share, { d: field.band })
      let gs = t1, gd = t2
      for (let i = 0; i < gather.length; i++) { this._fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] }); const t = gs; gs = gd; gd = t }
      // The gathered paint is in gs; the sum lands in t2, so the other is
      // its scratch.
      if (gs === t2) { this._fieldOp(t1, gs, gs, 1, 0); gs = t1 }
      this._fieldOp(t2, paint, gs, tide ? 14 : 8, share, { c: field.mask, d: field.band })
    }
    // One record: c = mobile share of (laid − settled); b = laid − c, the part
    // that stays put (settled paint plus the fixed share of the new); the
    // schedule over c; the sum back into whichever of the pair is free.
    // The gate is the coverage alone (wcWaterAt), so the deposit and its
    // colour record — two records, one suspension — move by identical
    // fractions, to the bit. Each step is one entry of `ops`.
    const diffuseSteps: readonly WetDiffuseStep[] = this._wcAb.noDiffuse ? [] : WET_DIFFUSE_SCHEDULE
    // (§17.29) The colour record, when there is one (two paints or more),
    // is split and carried in LOCKSTEP with the deposit inside the
    // deposit's own settle: the carry's fractions depend on the deposit's
    // mobile and fixed amounts at every step, so the colour cannot be
    // carried on its own afterwards. `follow` is the colour settle that
    // then runs the rest (bloom, diffusion, tide) on the carried record.
    const colour = scratch.paints.size > 1 ? { a: field.ca, b: field.cb, c: field.cc } : null
    const singlePaint = [...scratch.paints][0]
    const singleTau: [number, number, number] = !colour && singlePaint ? pigmentAbsorption(singlePaint.split(',').map(Number) as [number, number, number]) : [0, 0, 0]
    // (§17.42) The wash dries as ONE component: nothing of an operation is
    // fixed at its pen-up - the whole of its paint is mobile, the earlier
    // paint under the dome all of it too, and no tide is laid into the wet
    // state; the tide goes, once, along the outer contour of the wash's
    // whole coverage, into the PROVISIONAL dry target (inkDry) the
    // composite shows, recomputed at every pen-up (_groupTideOps below).
    // The design thread's diagnosis of the wet-on-wet pairs: each operation
    // dried to the end before the next arrived, and no re-mobilisation
    // turns "dry A, then dissolve A with B" into "wet A + wet B, dried
    // together". The r17 behaviour stays as the wcOpDry A/B.
    const mobileShare = groupDry ? 1 : WET_DIFFUSE_MOBILE
    // (#680, s17.84) The pool's paint combed along the travel by the hairs,
    // over the settled result (the settle erases it from the dose): through
    // `free` and back into `paint`. The factor comes from the coverage
    // alone, so the deposit and the colour record take the same one.
    const streakCombs = Math.max(1.5, Math.min(50, radiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX))
    const poolStreaks = (paint: AccumulationBuffer, free: AccumulationBuffer): void => {
      if (!(WC_POOL_STREAK > 0)) return
      this._fieldOp(free, paint, paint, 1, 1, { c: field.coverage, world: [x0 / S, -(y0 / S + field.h), S], size: [streakCombs, 0], origin: [WC_POOL_STREAK, 0], dir: [1, 1] })
      fieldOp(paint, free, free, 1, 0)
    }
    const settle = (a: AccumulationBuffer, b: AccumulationBuffer, c: AccumulationBuffer, first: boolean, spare: AccumulationBuffer, follow = false): { out: AccumulationBuffer } => {
      const st = { src: c, dst: a, out: a }
      if (!follow) ops.push(() => {
        fieldOp(c, a, b, 0, mobileShare)
        // (§17.25) A mark that landed in a puddle wets the paint already
        // lying under its footprint: that paint is as mobile as the new -
        // it never dried - so the same mobile share of it joins c and runs,
        // settles and relocates with the new paint, to the MERGED front.
        // Without this the earlier pass's tideline stayed put under the
        // next pass, and a flat wash came out as a ladder of inner rims.
        // (§17.41) ...and it happens AFTER the front is known, over the
        // dome of the puddle the landing joined - see below.
        // Where earlier marks' SETTLED deposit lies, before b is overwritten
        // with the fixed part - kept in `band` until the front reads it: the
        // puddle this mark's water may have joined.
        if (first) this._fieldOp(field.band, b, b, 4, 0.002)
        fieldOp(b, a, c, 1, -1)
        // The colour record's split, by the same gate.
        if (colour && first) {
          fieldOp(colour.c, colour.a, colour.b, 0, mobileShare)
          fieldOp(colour.b, colour.a, colour.c, 1, -1)
        }
      })
      // The water front, its band and the extended coverage come from the
      // deposit's mobile field, once; the colour record rides the same.
      if (first) frontOps(c, a)
      // (§17.29) The front carries the paint: the mobile field runs along
      // the front's cost, from the footprint out to where the water
      // stopped, in strided steps of WC_FIELD_OP_FRAG's mode 15 - so a
      // loaded mark into a wet wash sends its own pigment into the wash in
      // the fingers the front cut, at near the body's density (Ilya's
      // series 5), instead of leaving it inside its own contour with only
      // the water gone on. The film's own contour ring (the last cell and
      // a half of the budget) is left out of the domain here: on dry paper
      // the whole film sits one cell short of its budget, and with the
      // ring in, every stroke piled its outer texels into a hard line.
      // What the flow equalises is the TOTAL pigment - mobile plus fixed
      // (b): the wash's settled paint lying in the domain counts, or a
      // mark over a wet wash sent its own paint and the re-mobilised wash
      // under it out into fingers denser than its body, and the body went
      // pale. The deposit ping-pongs c and a; the colour record cc and ca,
      // in lockstep, taking the deposit's fractions (mode 16).
      if (first && !this._wcAb.noCarry) {
        const carry = watercolorCarryStrides(budgetPx)
        let src = c, dst = a
        let csrc = colour?.c, cdst = colour?.a
        for (let i = 0; i < carry.length; i += 4) {
          const n = Math.min(4, carry.length - i)
          const plan: Array<{ s: number; src: AccumulationBuffer; dst: AccumulationBuffer; csrc?: AccumulationBuffer; cdst?: AccumulationBuffer }> = []
          for (let j = 0; j < n; j++) {
            plan.push({ s: carry[i + j], src, dst, csrc, cdst })
            const t = src; src = dst; dst = t
            const ct = csrc; csrc = cdst; cdst = ct
          }
          ops.push(() => {
            for (const p of plan) {
              const opts = { d: field.pressure, dir: [p.s, p.s] as [number, number], band: [(budgetPx - 1.5) / costMax, 0] as [number, number], size: [WC_CARRY_POW, costMax] as [number, number], origin: [p.s, WC_CARRY_TRAVEL] as [number, number] }
              if (p.csrc && p.cdst) this._fieldOp(p.cdst, p.csrc, b, 16, WC_CARRY_RATE, { ...opts, c: p.src })
              this._fieldOp(p.dst, p.src, b, 15, WC_CARRY_RATE, opts)
            }
          })
        }
        if (src !== c) { const from = src; ops.push(() => fieldOp(c, from, from, 1, 0)) }
        if (colour && csrc && csrc !== colour.c) { const from = csrc, to = colour.c; ops.push(() => fieldOp(to, from, from, 1, 0)) }
      }
      // (§17.41) The wet landing re-mobilises the earlier paint over the
      // DOME of the puddle it joined (band .a, from the front just run),
      // (§17.43) AFTER the carry: re-mobilised before it, the earlier paint
      // rode the new paint's front out of the footprint and piled in a line
      // at the domain's edge; now only the new paint travels with the
      // front, and the two paints mix by the puddle diffusion below, both
      // ways and without a direction.
      // not only under its footprint: the two paints then mix both ways in
      // the puddle diffusion below. The moved share leaves the fixed field
      // (b) as it joins the mobile one (c), for the deposit and the colour
      // record alike. `a` and `spare` are the temporaries.
      const remobFloor = groupDry ? 1 : WC_REMOB_DOME
      if (first && merge > 0) ops.push(() => {
        this._fieldOp(a, c, b, 18, merge, { d: field.band, origin: [remobFloor, 0] })
        this._fieldOp(spare, b, c, 3, 0, { c: a })
        fieldOp(c, a, a, 1, 0)
        fieldOp(b, spare, spare, 1, 0)
        if (colour) {
          this._fieldOp(a, colour.c, colour.b, 18, merge, { d: field.band, origin: [remobFloor, 0] })
          this._fieldOp(spare, colour.b, colour.c, 3, 0, { c: a })
          fieldOp(colour.c, a, a, 1, 0)
          fieldOp(colour.b, spare, spare, 1, 0)
        }
      })
      // (§17.40) The puddle MIXES: on a wet landing the mark's footprint
      // and the wash under it are one liquid, and the paint in it - the
      // new, and the wash's re-mobilised under it - evens out across the
      // footprint over tens of texels, as the coarse diffusion did for
      // every mark before §17.29 took it out (it erased the fingers at the
      // front). Back for the wet landing only, gated by the DOME over the
      // footprint (band .a: full inside, none at the front), so the fingers
      // the carry cut past the footprint keep their edges. Without it the
      // earlier mark's paint stopped at its own contour under the new mark
      // - Ilya's "жёлтый проникает ровной линией" - and the new mark's
      // footprint over the wash stayed a paler band where the carry had
      // taken from it ("область между штрихом и рваным краем"). The gate
      // texture is built once into `pressure`, free after the carry.
      if (first && merge > 0) ops.push(() => this._fieldOp(field.pressure, field.coverage, field.coverage, 17, 0, { d: field.band }))
      // (§17.23) The bloom: the wash's SETTLED paint inside this operation's
      // footprint goes to the footprint's edge — the light patch with the
      // dark ragged ring. Only as much as the recorded wetness says the wash
      // was damp (watercolorBloomStrength); `a` and `spare` are free here.
      // (#680, §17.78) BEFORE the puddle settles into `b`: after it, the
      // bloom took this mark's own settled core out to the footprint's edge
      // too and left a light ring in the middle of the drop.
      if (bloom > 0) {
        ops.push(() => {
          rim(b, WC_BLOOM_SHARE * bloom, a, spare)
          fieldOp(b, spare, spare, 1, 0)
        })
      }
      // (#680, §17.78) ...and it SETTLES as it mixes: a share of the paint
      // grips the paper before the puddle moves it at all (the core), and of
      // what is still afloat a share more after every step - so the paint
      // that settles late has gone far and is little. A core, a nearer halo,
      // a wide faint one (Ilya: "белое пятно почти без размытия, градиент
      // побольше и прозрачнее, и огромный очень прозрачный"), where the
      // schedule alone evened the whole of it out into one pale cloud.
      // The diffusion is linear in the paint for a given gate, so the
      // mobile field is left undepleted and each step's slice is added to
      // the fixed one at its weight (watercolorPuddleSettleWeights); the
      // rest is scaled down once at the end. The fixed field ping-pongs
      // with `spare`, free here, and comes back into `b` before the bloom.
      const puddleSteps = merge > 0 && !this._wcAb.noDiffuse ? WET_DIFFUSE_PUDDLE_SCHEDULE : []
      if (puddleSteps.length) {
        const w = watercolorPuddleSettleWeights(puddleSteps.length)
        const acc = { fixed: b, free: spare }
        // (§17.82) The far slices - settled after the long steps, the faint
        // outer halo - go down through the paper's fibres (wcFibre).
        const fibreFrom = WET_SETTLE_FIBRE_FROM
        const world: [number, number, number] = [x0 / S, -(y0 / S + field.h), S]
        const settleSlice = (k: number): void => {
          if (!(w.slices[k] > 0)) return
          if (k >= fibreFrom) this._fieldOp(acc.free, acc.fixed, st.src, 1, w.slices[k], { world, d: field.band, dir: [1, 1] })
          else fieldOp(acc.free, acc.fixed, st.src, 1, w.slices[k])
          const t = acc.fixed; acc.fixed = acc.free; acc.free = t
        }
        // The core is taken off a SMOOTHED field: straight after the carry
        // the mobile paint has a pale line along the footprint's contour (the
        // carry leaves the film's own contour ring out), which the whole
        // schedule used to even out - settled raw, it stayed as a light ring
        // round the middle of every drop. Two fine steps, gated by the
        // coverage and not the dome (the line IS the dome's edge), an even
        // count so the pair's parity stays.
        for (const [radius, knight] of WET_SETTLE_SMOOTH) {
          ops.push(() => {
            diffuseStep(st.src, st.dst, radius, knight)
            const t = st.src; st.src = st.dst; st.dst = t
          })
        }
        ops.push(() => settleSlice(0))
        puddleSteps.forEach(({ radius, knight }, i) => {
          ops.push(() => {
            diffuseStep(st.src, st.dst, radius, knight, field.pressure)
            const t = st.src; st.src = st.dst; st.dst = t
            settleSlice(i + 1)
          })
        })
        ops.push(() => {
          if (acc.fixed !== b) fieldOp(b, acc.fixed, acc.fixed, 1, 0)
          // What is still afloat, at its weight: into the free one of the
          // pair and back, so the pair's parity (which the colour settle's
          // spare is chosen by) does not change.
          fieldOp(st.dst, st.src, st.src, 1, w.afloat - 1)
          fieldOp(st.src, st.dst, st.dst, 1, 0)
        })
      }
      for (const { radius, knight } of diffuseSteps) {
        ops.push(() => {
          diffuseStep(st.src, st.dst, radius, knight)
          const t = st.src; st.src = st.dst; st.dst = t
        })
      }
      // (§17.23) The tideline: after the paint has run, its puddle carries a
      // share of it to the rim as it dries. The moved field lands in `dst`,
      // the sum with the fixed paint in `src`.
      // (§17.42) ...or not: under the group-dry oracle the tide waits for
      // the whole wash (watercolorDryWash), and the operation's result is
      // its moved paint over the fixed field, all of it still mobile.
      ops.push(() => {
        if (groupDry) {
          // Through the spare and back, so the result lands where the rim's
          // would (st.src): the colour settle's spare is chosen by that.
          fieldOp(spare, b, st.src, 1, 1)
          fieldOp(st.src, spare, spare, 1, 0)
          st.out = st.src
          poolStreaks(st.src, spare)
          return
        }
        rim(st.src, watercolorRimShare(WC_TIDE_RIM, radiusC, width) * tideWater, st.dst, spare, true)
        st.out = st.src
        fieldOp(st.out, b, spare, 1, 1)
        poolStreaks(st.out, spare)
      })
      return st
    }
    // The deposit's settle borrows a colour buffer as its spare; the colour
    // settle, when it runs, borrows a deposit one (both are done by then).
    // The deposit's spare: the colour record's deposit buffer once the
    // record is split (its mobile part lives in cc from the first op on),
    // else the unused cc.
    const dep = settle(field.a, field.b, field.c, true, colour ? field.ca : field.cc)
    // (#536, §17.20) One paint so far: its colour record is its deposit's
    // mass times one absorption everywhere, so it is rebuilt from the moved
    // deposit in a single pass instead of carried through the schedule
    // again — half the settle's cost, which was "всё это дело притормаживает".
    let col: { out: AccumulationBuffer }
    if (scratch.paints.size <= 1) {
      const only = [...scratch.paints][0]
      const tau = only ? pigmentAbsorption(only.split(',').map(Number) as [number, number, number]) : [0, 0, 0]
      col = { out: field.cc }
      ops.push(() => {
        const outColor = field.cc
        outColor.beginReplaceDraw()
        gl.useProgram(this._fieldOpProg)
        const fu = this._fieldOpUni
        gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
        gl.enableVertexAttribArray(this._fieldOpPosLoc)
        gl.vertexAttribPointer(this._fieldOpPosLoc, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, dep.out.texture)
        gl.uniform1i(fu.u_a, 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, dep.out.texture)
        gl.uniform1i(fu.u_b, 1)
        // Units 2 and 3 too: the program samples u_c and u_d, and whatever
        // the last field op left on those units — the rim's spare buffer,
        // which is this very output — would be a feedback loop.
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, dep.out.texture)
        gl.uniform1i(fu.u_c, 2)
        gl.activeTexture(gl.TEXTURE3)
        gl.bindTexture(gl.TEXTURE_2D, dep.out.texture)
        gl.uniform1i(fu.u_d, 3)
        gl.activeTexture(gl.TEXTURE0)
        gl.uniform1f(fu.u_k, 1)
        gl.uniform1f(fu.u_mode, 2)
        gl.uniform3fv(fu.u_tau, [tau[0], tau[1], tau[2]])
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        outColor.endDraw()
      })
    } else {
      // Its spare is whichever deposit buffer the deposit's settle will NOT
      // leave its result in: the schedule ping-pongs c and a, so an even
      // count of steps (none, under the wcNoDiffuse A/B) lands in c. Read
      // at plan time, dep.out is still its initial value - that was a
      // settle with no steps copying the colour rim over its own deposit.
      // (s17.43) ...counting the puddle schedule only when it runs: under
      // wcNoDiffuse it is skipped, and counting it anyway picked the buffer
      // holding the deposit's result as the colour's spare - the A/B render
      // came out with the colour record and the deposit out of step.
      col = settle(field.ca, field.cb, field.cc, false, (diffuseSteps.length + (merge > 0 && !this._wcAb.noDiffuse ? WET_DIFFUSE_PUDDLE_SCHEDULE.length : 0)) % 2 === 0 ? field.a : field.c, true)
    }

    // #680: split the concentration surplus once, then carry that field.
    // The surrounding coat stays fixed; colour uses the same dose fraction.
    // All temporaries are existing settle fields, free after both settles.
    const brushPass = (source: AccumulationBuffer, out: AccumulationBuffer,
      pigment: AccumulationBuffer, base: AccumulationBuffer, mode: number): void => {
      if (!flowTexture) return
      out.beginReplaceDraw()
      gl.useProgram(this._brushDragProg)
      const u = this._brushDragUni
      gl.bindBuffer(gl.ARRAY_BUFFER, this._screenBuf)
      gl.enableVertexAttribArray(this._brushDragPosLoc)
      gl.vertexAttribPointer(this._brushDragPosLoc, 2, gl.FLOAT, false, 0, 0)
      const textures = [source.texture, flowTexture, field.coverage.texture, pigment.texture, base.texture]
      const names = ['u_paint', 'u_flow', 'u_water', 'u_pigment', 'u_base']
      for (let j = 0; j < textures.length; j++) {
        gl.activeTexture(gl.TEXTURE0 + j); gl.bindTexture(gl.TEXTURE_2D, textures[j]); gl.uniform1i(u[names[j]], j)
      }
      const step = Math.max(1, Math.round(radiusPx * 0.2 / S))
      gl.uniform2f(u.u_step, step / field.w, step / field.h)
      gl.uniform1f(u.u_mode, mode)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      out.endDraw(); gl.activeTexture(gl.TEXTURE0)
    }
    if (flow) {
      let fixedInk = field.c, fixedColour = field.cc
      ops.push(() => {
        fixedInk = dep.out === field.a ? field.c : field.a
        fixedColour = col.out === field.ca ? field.cc : field.ca
        brushPass(col.out, field.cb, dep.out, dep.out, 1)
        brushPass(dep.out, field.b, dep.out, dep.out, 1)
        fieldOp(fixedInk, dep.out, field.b, 1, -1)
        fieldOp(fixedColour, col.out, field.cb, 1, -1)
      })
      for (let i = 0; i < 12; i++) ops.push(() => {
        brushPass(field.cb, field.band, field.b, fixedInk, 0)
        brushPass(field.b, field.pressure, field.b, fixedInk, 0)
        fieldOp(field.b, field.pressure, field.pressure, 1, 0)
        fieldOp(field.cb, field.band, field.band, 1, 0)
      })
      ops.push(() => {
        fieldOp(dep.out, fixedInk, field.b, 1, 1)
        fieldOp(col.out, fixedColour, field.cb, 1, 1)
      })
    }

    // (§17.42) The provisional dry target: the wet result with the one tide
    // along the whole wash's contour, into the deposit and colour buffers
    // the settle left free. The wash's own standing level and radius are
    // the widest and wettest of its operations (dryCtx), not this one's.
    let dry: { dep: AccumulationBuffer; col: AccumulationBuffer } | null = null
    if (groupDry) {
      const dryDep = dep.out === field.a ? field.c : field.a
      const dryCol = col.out === field.ca ? field.cc : field.ca
      const dc = scratch.dryCtx
      this._groupTideOps(
        ops, field, x0, y0, Math.max(radiusPx, dc?.radiusPx ?? 0) / S, Math.max(standing, dc?.standing ?? 0), scratch.paints,
        dep.out, colour ? col.out : null, dryDep, dryCol, [field.b, field.cb, field.pressure], S,
      )
      dry = { dep: dryDep, col: dryCol }
    }

    // …and home, tile by tile — and this is the new settled deposit.
    const finish = (): void => {
      // (§17.43) The dry target first catches up with the deposit over the
      // WHOLE gesture, window or no window: a stroke wider than the field
      // (a replayed sheet-wide sweep from before the span cut) has paint
      // outside the rect that no settle touched, and the composite reads
      // the dry target - that paint had simply vanished from the picture.
      if (groupDry) {
        const bx0 = Math.floor(bounds.minX) - pad, by0 = Math.floor(bounds.minY) - pad
        const bx1 = Math.ceil(bounds.maxX) + pad, by1 = Math.ceil(bounds.maxY) + pad
        for (const tile of targets) {
          const entry = scratch.peek(tile.buffer)
          if (!entry?.inkLoad) continue
          const rx0 = Math.max(bx0, tile.originX), ry0 = Math.max(by0, tile.originY)
          const rx1 = Math.min(bx1, tile.originX + tile.buffer.width), ry1 = Math.min(by1, tile.originY + tile.buffer.height)
          if (rx1 <= rx0 || ry1 <= ry0) continue
          const tx = rx0 - tile.originX, ty = tile.buffer.height - (ry1 - tile.originY)
          if (!entry.inkDry) { entry.inkDry = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height); entry.inkLoad.copyTo(entry.inkDry) }
          else entry.inkLoad.copyRegionInto(entry.inkDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0)
          if (entry.inkColor) {
            if (!entry.colorDry) { entry.colorDry = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height); entry.inkColor.copyTo(entry.colorDry) }
            else entry.inkColor.copyRegionInto(entry.colorDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0)
          }
        }
      }
      for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
        const entry = scratch.peek(tile.buffer)
        if (!entry?.inkLoad) continue
        const tx = ox0 - tile.originX, ty = tile.buffer.height - (oy1 - tile.originY), tw = ox1 - ox0, th = oy1 - oy0
        // (§17.44) A film that began while the settle ran (the next chunk's,
        // see newFilm) sits on a base copied before it landed: the settled
        // result goes onto that BASE, and the deposit is rebuilt as base +
        // film below - or the next chunk's paint vanished from the overlap
        // until the gesture ended. Otherwise it goes onto the deposit.
        const runningFilm = entry.filmGesture !== gesture && entry.filmGesture === scratch.gesture && !!entry.strokeInk && !!entry.inkBase
        const settledInk = runningFilm ? entry.inkBase! : entry.inkLoad
        const snap = snapshots.get(tile.buffer)
        fromField(dep.out, a0, tile, ox0, oy0, ox1, oy1, settledInk, snap?.ink ?? settledInk)
        if (entry.inkSettled) settledInk.copyRegionInto(entry.inkSettled, tx, ty, tx, ty, tw, th)
        // (§17.24) …and the coverage the water front extended - MERGED by
        // max (§17.44): the gesture may have gone on stamping the next
        // chunk's coverage while the settle ran.
        if (S === 1) {
          const sx = ox0 - x0, sy = field.h - (oy1 - y0)
          entry.coverage.copyRegionInto(field.mask, tx, ty, sx, sy, tw, th)
          this._fieldOp(field.band, field.coverage, field.mask, 20, 0)
          field.band.copyRegionInto(entry.coverage, sx, sy, tx, ty, tw, th)
        } else {
          const tmp = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height)
          this._wcResample(tmp, tx, ty, tw, th, field.coverage, (ox0 - x0) / S, field.h - (oy1 - y0) / S, 1 / S, 2, null, entry.coverage, fieldRect)
          tmp.copyRegionInto(entry.coverage, tx, ty, tx, ty, tw, th)
          this._ribbonScratchPool.release(tmp)
        }
        const settledColor = entry.inkColor ? (runningFilm && entry.colorBase ? entry.colorBase : entry.inkColor) : null
        // (§17.44) One paint: its colour record is the deposit times one
        // absorption (§17.20), rebuilt at FULL resolution from the deposit
        // just brought home - the field's rebuilt record and the recorded one
        // are not the same quantity, and a change between them came back as
        // a paler, washed-out mark.
        const rebuildColour = (to: AccumulationBuffer, from: AccumulationBuffer): void =>
          this._fieldOp(to, from, from, 2, 1, { c: from, d: from, tau: singleTau, scissor: [tx, ty, tw, th] })
        if (settledColor) {
          if (S > 1 && !colour) rebuildColour(settledColor, settledInk)
          else fromField(col.out, ca0, tile, ox0, oy0, ox1, oy1, settledColor, snap?.color ?? settledColor)
          if (entry.colorSettled) settledColor.copyRegionInto(entry.colorSettled, tx, ty, tx, ty, tw, th)
        }
        if (runningFilm) {
          const rect: [number, number, number, number] = [tx, ty, tw, th]
          this._fieldOp(entry.inkLoad, entry.inkBase!, entry.strokeInk!, 1, 1, { scissor: rect })
          if (entry.inkColor && entry.colorBase && entry.strokeColor) this._fieldOp(entry.inkColor, entry.colorBase, entry.strokeColor, 1, 1, { scissor: rect })
        }
        if (dry) {
          // (§17.43) First the settled wet state over the whole of this
          // tile's part of the field (the field is capped; past the window
          // the dry target keeps up with the deposit), then the dry result
          // over the field less its margin - the tide's change on top.
          if (!entry.inkDry) { entry.inkDry = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height); settledInk.copyTo(entry.inkDry) }
          else settledInk.copyRegionInto(entry.inkDry, tx, ty, tx, ty, tw, th)
          if (settledColor) {
            if (!entry.colorDry) { entry.colorDry = this._ribbonScratchPool.acquire(tile.buffer.width, tile.buffer.height); settledColor.copyTo(entry.colorDry) }
            else settledColor.copyRegionInto(entry.colorDry, tx, ty, tx, ty, tw, th)
          }
          // Where the field was clipped by the tile's own edge there is no
          // margin to leave, the tile ends there.
          const ix0 = ox0 === x0 && x0 > minX ? ox0 + dryMargin : ox0, iy0 = oy0 === y0 && y0 > minY ? oy0 + dryMargin : oy0
          const ix1 = ox1 === x1 && x1 < maxX ? ox1 - dryMargin : ox1, iy1 = oy1 === y1 && y1 < maxY ? oy1 - dryMargin : oy1
          if (ix1 <= ix0 || iy1 <= iy0) continue
          fromField(dry.dep, dep.out, tile, ix0, iy0, ix1, iy1, entry.inkDry, entry.inkDry)
          if (entry.colorDry) {
            if (S > 1 && !colour) rebuildColour(entry.colorDry, entry.inkDry)
            else fromField(dry.col, col.out, tile, ix0, iy0, ix1, iy1, entry.colorDry, entry.colorDry)
          }
        }
      }
      if (a0) this._ribbonScratchPool.release(a0)
      if (ca0) this._ribbonScratchPool.release(ca0)
      for (const snap of snapshots.values()) { this._ribbonScratchPool.release(snap.ink); if (snap.color) this._ribbonScratchPool.release(snap.color) }
    }
    return { ops, finish }
  }

  /** (#536, §17.42) The group tide as entries of `ops`: over a settle field
   *  whose coverage holds the wash's whole coverage (the union of every
   *  operation's domain), the wet deposit `dep` and its colour record `col`
   *  (null with one paint: rebuilt from the dried deposit) get the ONE tide
   *  along the coverage's outer contour, into `outDep` and `outCol`. `free`
   *  is three buffers the routine may scribble on; `mask`, `pressure` and
   *  `band` it takes for itself. The band is what the settle's own tide used
   *  (mode 6), read off an inward relaxation seeded from outside the
   *  coverage (mode 19) - no backrun, no "earlier mark", the whole union one
   *  domain with the dome full throughout. */
  private _groupTideOps(
    ops: Array<() => void>, field: SettleField, x0: number, y0: number,
    radiusPx: number, standing: number, paints: ReadonlySet<string>,
    dep: AccumulationBuffer, col: AccumulationBuffer | null, outDep: AccumulationBuffer, outCol: AccumulationBuffer,
    free: [AccumulationBuffer, AccumulationBuffer, AccumulationBuffer],
    /** (§17.44) World px per field cell; radiusPx is in cells already. */
    scale = 1,
  ): void {
    // (§17.44) A world width in cells - see the settle's own `width`.
    const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx * scale / 5))) / scale))
    const costMaxIn = width + 3
    const inSteps = width + 2
    const [t1, t2, t3] = free
    // The seeds from the coverage (mode 19): the inward pass's into `mask`
    // (inside unreached, outside the source), a stand-in outward cost into
    // `pressure` (0 inside, 1 outside); then the inward relaxation over the
    // relief as the settle runs it, the first two cells flat so the peak is
    // a continuous line. `band` is the relaxation's ping-pong partner until
    // it is written.
    ops.push(() => {
      this._fieldOp(field.mask, field.coverage, field.coverage, 19, 0.002, { dir: [1, 0] })
      this._fieldOp(field.pressure, field.coverage, field.coverage, 19, 0.002)
    })
    const pp = { src: field.mask, dst: field.band }
    for (let i = 0; i < inSteps; i += 4) {
      const n = Math.min(4, inSteps - i)
      ops.push(() => {
        for (let j = 0; j < n; j++) {
          const flat = i + j < 2
          this._waterFrontStep(field, x0, y0, WC_FRONT_DRY_COST, pp.src, pp.dst, costMaxIn, flat ? 0 : WC_FRONT_CLIMB_IN, flat ? 1 : WC_FRONT_FLOOR_IN, 1, scale)
          const t = pp.src; pp.src = pp.dst; pp.dst = t
        }
        if (i + n >= inSteps && pp.src !== field.mask) this._fieldOp(field.mask, pp.src, pp.src, 1, 0)
      })
    }
    const gather: Array<[number, number]> = []
    for (let st = 1; st <= Math.max(1, radiusPx / 2) && gather.length < 6; st *= 2) gather.push([st, st])
    // A 3x3 binomial at each stride of `gather`, `from` untouched, the result
    // in `out` (which may be one of the temporaries).
    const blurTo = (out: AccumulationBuffer, from: AccumulationBuffer, tmpA: AccumulationBuffer, tmpB: AccumulationBuffer): void => {
      let gs = from, gd = tmpA
      for (let i = 0; i < gather.length; i++) {
        this._fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] })
        const next = gd === tmpA ? tmpB : tmpA
        gs = gd; gd = next
      }
      if (gs !== out) this._fieldOp(out, gs, gs, 1, 0)
    }
    const tideWater = Math.min(1, standing / WC_TIDE_STANDING_FULL)
    const share = watercolorRimShare(WC_TIDE_RIM, radiusPx, width) * tideWater
    const costMax = 8
    ops.push(() => {
      // The band (mode 6) over the whole union: costOut 0 inside the
      // coverage so `inside` and the dome are 1 throughout, no backrun (tau
      // 0), no "earlier mark" (the seed's .b is empty), the stood record
      // from the coverage against the wash's wettest standing level. Then
      // the band gathered by the rim's kernel, into `mask`.
      this._fieldOp(field.band, field.pressure, field.coverage, 6, 0, {
        c: field.mask, d: field.pressure, band: [0.5, width / costMaxIn], size: [1 / costMax, 1 / costMaxIn],
        origin: [standing, 0], dir: [1, 1], tau: [0, 0, 0], world: [x0 / scale, -(y0 / scale + field.h), scale],
      })
      blurTo(field.mask, field.band, t1, t3)
    })
    // The tide: `share` of ALL the paint inside (mode 7 by band .g, the whole
    // union) gathered onto the band (mode 14) - the deposit and, with two
    // paints or more, the colour record by the same fractions.
    const tide = (paint: AccumulationBuffer, out: AccumulationBuffer): void => {
      this._fieldOp(t1, paint, paint, 7, share, { d: field.band })
      blurTo(t2, t1, t2, t3)
      this._fieldOp(out, paint, t2, 14, share, { c: field.mask, d: field.band })
    }
    ops.push(() => tide(dep, outDep))
    if (col) {
      ops.push(() => tide(col, outCol))
    } else {
      const only = [...paints][0]
      const tau = only ? pigmentAbsorption(only.split(',').map(Number) as [number, number, number]) : [0, 0, 0]
      ops.push(() => this._fieldOp(outCol, outDep, outDep, 2, 1, { c: outDep, d: outDep, tau: [tau[0], tau[1], tau[2]] }))
    }
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
    // (§17.48) The open wash closes exactly as it does when it times out: the
    // next stroke cannot join it and starts its own. Its buffers stay until
    // then, so a settle still in flight lands as it would have. Mid-stroke (a
    // peer's paper_dry arriving while this user draws) the stroke in hand
    // keeps its wash; the wash closes at its pen-up. Its later batches read
    // the paper dry and record it so - which is what a replay reads too.
    if (this._strokeLayerId) this._dryAtPenUp = true
    else if (this._wash) this._wash.endedAt = -Infinity
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

  /** (#536, §17.22) How many of a settle's GPU steps run per animation frame
   *  when it is spread out. Two: a step is one full-field pass, ~8 ms for a
   *  400 px brush on a desktop GPU, and the whole list is 15–27 entries, so
   *  the settle lands within the first quarter of the reveal.
   *  (§17.46) One: on the tablet two entries a frame made four to six frames
   *  of 50-67 ms after every big stroke's pen-up, one made none, for a settle
   *  of 1.07 s instead of 0.76 s - still inside the reveal. */
  private static readonly WET_SETTLE_OPS_PER_TICK = 1
  /** (§17.46) The adaptive settle tick's clock - see _tickSettle. */
  /** (§17.49) See setUnpaintedInBatch. */
  private _unpaintedInBatch: ReadonlySet<string> | null = null
  private _skippedInBatch = new Set<string>()
  /** (§17.48) A paper_dry arrived mid-stroke: close the wash at pen-up. */
  private _dryAtPenUp = false
  private _settleTickAt = 0
  private _settleSkipped = 0

  /** Begins running `ops` a few per frame, then `complete`. Drains a settle
   *  already in flight first: both use the one _diffuseField. */
  private _startSettle(scratch: RibbonStrokeScratch, ops: Array<() => void>, complete: () => void): void {
    if (this._settle) this._completeSettle()
    if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }
    this._settle = { scratch, ops, next: 0, complete, raf: 0 }
    // (§17.44) The stitch - the settle's first entry, copies only - runs NOW:
    // it captures the deposit and its settled base as they stand at this
    // boundary, before the next chunk's batches rebuild them. The dear
    // passes are what gets spread over the frames.
    if (ops.length) { ops[0](); this._settle.next = 1 }
    this._wcPerf.settleStart = performance.now()
    this._wcPerf.settleOps = ops.length
    this._scheduleSettleTick()
  }

  private _scheduleSettleTick(): void {
    const s = this._settle
    if (!s || s.raf) return
    s.raf = requestAnimationFrame(() => {
      s.raf = 0
      this._tickSettle()
    })
  }

  private _tickSettle(): void {
    const s = this._settle
    if (!s) return
    // The wash was torn down under it (undo, a new wash): nothing to land.
    if (!s.scratch.live) { this._settle = null; return }
    // (§17.44) One entry a frame while the pen is still down (a chunk's
    // settle under a running gesture): the frame also has the brush's own
    // batches to draw, and two entries made the tablet's P95 frame 110-150 ms.
    // (§17.46) ...and only in a frame that follows an on-time one: a wet-on-
    // wet chunk's entries (the puddle's coarse diffusion, the re-mobilisation)
    // on top of the brush's own work dropped a frame in eight on the tablet.
    // Never more than three frames without one, or the settle stalls.
    const nowT = performance.now()
    const late = this._settleTickAt > 0 && nowT - this._settleTickAt > 20
    this._settleTickAt = nowT
    if (this._strokeLayerId && late && this._settleSkipped < 3) {
      this._settleSkipped++
      this._scheduleSettleTick()
      return
    }
    this._settleSkipped = 0
    // (§17.58) ...and more a frame while peers' operations wait behind it and
    // nobody is drawing here: one a frame is 0.5-1 s an operation on the
    // iPad, and with three others painting their marks arrived up to ten
    // seconds late.
    // Only after an on-time frame, the same gate as the pen's: a late one means
    // the device is already behind.
    const perTick = this._strokeLayerId || late ? 1
      : Math.min(this.settleBacklogMax, PencilEngine.WET_SETTLE_OPS_PER_TICK + this._opQueue.length)
    for (let k = 0; k < perTick && this._settle === s; k++) this._advanceSettle()
    if (this._settle === s) this._scheduleSettleTick()
  }

  /** Runs the next entry of the settle in flight; lands it after the last. */
  private _advanceSettle(): void {
    const s = this._settle
    if (!s) return
    this._washActiveAt = performance.now() // (§17.68)
    if (!s.scratch.live) { this._settle = null; return }
    if (s.next < s.ops.length) s.ops[s.next++]()
    if (s.next < s.ops.length) return
    this._settle = null
    if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
    s.complete()
    this._wcPerf.settleMs = performance.now() - this._wcPerf.settleStart
    this._scheduleFieldRelease()
  }

  /** Runs whatever is left of the settle in flight, now. Called before
   *  anything that would paint into the wash or reuse the field: the
   *  copy-back at the end writes the deposit as it was when the settle began,
   *  so paint laid meanwhile would be lost. */
  private _completeSettle(): void {
    const s = this._settle
    if (!s) return
    this._settle = null
    if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
    if (!s.scratch.live) return
    for (; s.next < s.ops.length; s.next++) s.ops[s.next]()
    s.complete()
    this._wcPerf.settleMs = performance.now() - this._wcPerf.settleStart
    this._scheduleFieldRelease()
    // (§17.72) A peer's operation drawn over frames lands by finishing its
    // stroke, which starts that stroke's own settle: "nothing in flight" is
    // what every caller of this is after.
    if (this._settle) this._completeSettle()
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

  /** Drops the settle in flight without landing it — the field is gone. */
  private _cancelSettle(): void {
    const s = this._settle
    if (!s) return
    this._settle = null
    if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
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
  ): void {
    // (#536, §17.22) Whatever the last batches left for the frame lands now,
    // for every ribbon tool: the marker's scratch is torn down right after
    // this, and for watercolor the settle below is spread over frames while
    // the tile must already show the whole mark.
    if (this._liveComposite?.scratch === scratch) this._flushLiveComposite()
    const ctx = scratch.finishContext
    if (!ctx || !ctx.profile.normalizeDeposit) return
    // (§17.44) Which film this settle consumes - see releaseFilm.
    const settledGesture = scratch.gesture
    const { target, preset, profile, color, opacity, bounds, fieldSeed } = ctx
    const targets = this._resolveWithinSheet(target, profile.normalizeDeposit ? this._wcSheetClamp(bounds) : bounds)
    if (!targets.length) return
    if (reveal && fade) for (const tile of targets) this._revealWash(tile, target)
    const { spreadPx, water, migratePx, bristleRadiusPx } = scratch.compositeScalars(
      () => ({
        spreadPx: 0, inkSmoothPx: 0, water: 0, migratePx: 0,
        fieldSeed: [0, 0] as [number, number], bristleRadiusPx: 0,
      }),
    )
    scratch.noteDabSpacing(0)
    const dir = scratch.noteDirection(0, 0)
    // (§17.44) A tile under a newer, still-running film shows the wet deposit
    // (settled base + that film), not the dry target, which has no film in it.
    const runningFilm = (entry: RibbonTileScratch): boolean => entry.filmGesture !== settledGesture && entry.filmGesture === scratch.gesture && !!entry.strokeInk
    const composite = (): void => {
      // (#700) The final settle can land several frames after targets were
      // first resolved. A live frame may already have folded their coarse
      // copies; resolve again at this write so the next frame folds anew.
      for (const tile of this._resolveWithinSheet(target, profile.normalizeDeposit ? this._wcSheetClamp(bounds) : bounds)) {
        const entry = scratch.peek(tile.buffer)
        if (!entry) continue
        // (§17.23) No deposit smoothing at the settle: the live batches
        // average the deposit over a dab spacing to hide the dab pitch, but
        // the settle's diffusion has smoothed the pitch far past that, and the
        // rim it lays is a few pixels wide — the average would take it away.
        // (§17.42) The provisional dry target where the settle built one.
        this._drawRibbonCompositeRect(
          tile, bounds, preset, profile, entry.original, entry.coverage,
          runningFilm(entry) ? entry.inkLoad : entry.inkDry ?? entry.inkLoad, runningFilm(entry) ? entry.inkColor : entry.colorDry ?? entry.inkColor, color, opacity,
          fieldSeed, spreadPx, water, migratePx, 0, dir, bristleRadiusPx,
        )
      }
      target.markContentPainted(bounds)
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
    if (scratch.diffusePending) {
      scratch.diffusePending = false
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
      )
      if (job) {
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
            const now = performance.now()
            for (const tile of targets) {
              const r = this._washReveals.get(tile.buffer)
              if (r) r.startedAt = now
            }
            this._displayIfNotSuspended()
          }
        }
        if ((reveal || spread) && typeof requestAnimationFrame === 'function') {
          // (§17.53) A sliced rebuild's buffer is not on screen yet: nothing to redraw.
          const shown = [...this._layers.values()].includes(target)
          this._startSettle(scratch, job.ops, spread && !reveal && shown ? () => { complete(); this._displayIfNotSuspended() } : complete)
          return
        }
        for (const op of job.ops) op()
        complete()
        this._scheduleFieldRelease()
        return
      }
    }
    composite()
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
    const { gl } = this
    if (ownTarget) dest.beginDraw()

    gl.useProgram(this._dabProg)
    this._stamps.bindNoise(this._dabUni.u_wcNoiseTex)
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
    // #547: set explicitly rather than left wherever the last draw put it —
    // _dabProg is shared with the graphite path, which writes this uniform on
    // every dab, so the digital brush's stamp (u_inkMode=10) would otherwise
    // take its edge softness from whatever pencil grade was last drawn. Modes 6
    // and 7 never read it, so this is inert for the three older ribbon tools.
    gl.uniform1f(u.u_hardness, preset.hardness)
    gl.uniform1f(u.u_nibShape, profile.nibShape === 'roundedBox' ? 1 : 0)
    gl.uniform1f(u.u_nibCorner, radius * profile.cornerFraction)
    gl.uniform1f(u.u_inkEdge, profile.inkEdgeFalloff)
    if (clipTo) {
      // Unit 2 is u_strokeCoverage — bound to the paper placeholder above, as
      // for every stamp, and replaced here with the wash's real coverage.
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, clipTo.texture)
      gl.activeTexture(gl.TEXTURE0)
    }
    gl.uniform1f(u.u_inkClip, clipTo ? 1 : 0)
    // (#536) Where on the sheet this tile is — the deposit's own mottling is a
    // world-space field and must land in the same place for a stamp as it does
    // for a band. Set here rather than inherited: this pass did not set it at
    // all before, so it was reading whatever the previous draw happened to
    // leave, which is fine for a value nothing used and a silent seam once
    // something did.
    gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
    gl.uniform1f(u.u_cloudDeposit, profile.cloud)
    gl.uniform1f(u.u_granDeposit, profile.granulation)
    gl.uniform2f(u.u_mottleSeed, mottleSeed[0], mottleSeed[1])

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf)
    gl.enableVertexAttribArray(this._dabPosLoc)
    gl.vertexAttribPointer(this._dabPosLoc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(u.u_dabCenter, dab.x - tile.originX, dab.y - tile.originY)
    gl.uniform1f(u.u_dabRadius, radius)
    gl.uniform1f(u.u_angle, dab.angle)
    gl.uniform1f(u.u_aspectRatio, dab.aspectRatio)
    gl.uniform1f(u.u_pressure, dab.pressure)
    gl.uniform1f(u.u_opacity, opacity)
    // #468 v4 — weights the deposit written into the texture's colour channels.
    gl.uniform1f(u.u_inkWater, inkWater)
    gl.uniform2f(u.u_acrossLocal, acrossLocal[0], acrossLocal[1])
    gl.uniform1f(u.u_paperWet, paperWet)
    gl.uniform1f(u.u_puddle, puddle)
    gl.uniform1f(u.u_poolBlot, poolBlot)
    // (#536, s17.11/13) What this stroke delivers and what dry paper keeps of
    // it — the mix's water, not this dab's depleted load — into the record of
    // standing water the diffusion pass gates on. See u_washWater.
    const delivery = ribbonWaterDelivery(profile)
    gl.uniform1f(u.u_washWater, delivery.water)
    gl.uniform1f(u.u_waterRetain, delivery.retain)
    gl.uniform1f(u.u_inkStrength, inkStrength)
    gl.uniform1f(u.u_bristleCombs, bristleCombs)
    gl.uniform1f(u.u_bristleInk, bristleInk)
    gl.uniform1f(u.u_depthWrite, depthTau ? 1 : 0)
    gl.uniform3fv(u.u_tau, depthTau ? [depthTau[0], depthTau[1], depthTau[2]] : [0, 0, 0])
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
    poolBlot = 0,
  ): void {
    const { gl } = this
    const local = bands.slice()
    for (let i = 0; i < bands.length; i += RIBBON_FLOATS_PER_VERTEX) {
      local[i]     = bands[i]     - tile.originX
      local[i + 1] = bands[i + 1] - tile.originY

    }

    if (mode === 'ink-max') dest.beginMaxDraw(this._minmaxExt!); else if (mode === 'ink') dest.beginAdditiveDraw(); else dest.beginDraw()
    gl.useProgram(this._ribbonProg)
    this._stamps.bindNoise(this._ribbonUni.u_wcNoiseTex)
    gl.uniform2f(this._ribbonUni.u_resolution, dest.width, dest.height)
    gl.uniform1f(this._ribbonUni.u_aaPx, aaPx)
    gl.uniform1f(this._ribbonUni.u_mode, mode === 'coverage' ? 0 : 1)
    gl.uniform2f(this._ribbonUni.u_worldOrigin, tile.originX, -tile.originY || 0)
    gl.uniform1f(this._ribbonUni.u_cloudDeposit, cloud)
    gl.uniform1f(this._ribbonUni.u_granDeposit, gran)
    gl.uniform1f(this._ribbonUni.u_poolBlot, poolBlot)
    gl.uniform2f(this._ribbonUni.u_mottleSeed, mottleSeed[0], mottleSeed[1])
    gl.uniform1f(this._ribbonUni.u_washWater, washWater)
    gl.uniform1f(this._ribbonUni.u_waterRetain, waterRetain)
    gl.uniform1f(this._ribbonUni.u_bristleCombs, bristleCombs)
    gl.uniform1f(this._ribbonUni.u_bristleInk, bristleInk)
    gl.uniform1f(this._ribbonUni.u_depthWrite, depthTau ? 1 : 0)
    gl.uniform3fv(this._ribbonUni.u_tau, depthTau ? [depthTau[0], depthTau[1], depthTau[2]] : [0, 0, 0])

    gl.bindBuffer(gl.ARRAY_BUFFER, this._ribbonBuf)
    gl.bufferData(gl.ARRAY_BUFFER, local, gl.STREAM_DRAW)
    const stride = RIBBON_FLOATS_PER_VERTEX * 4
    gl.enableVertexAttribArray(this._ribbonPosLoc)
    gl.vertexAttribPointer(this._ribbonPosLoc, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this._ribbonEdgeLoc)
    gl.vertexAttribPointer(this._ribbonEdgeLoc, 1, gl.FLOAT, false, stride, 8)
    gl.enableVertexAttribArray(this._ribbonInkWaterLoc)
    gl.vertexAttribPointer(this._ribbonInkWaterLoc, 1, gl.FLOAT, false, stride, 16)
    gl.enableVertexAttribArray(this._ribbonInkLoc)
    gl.vertexAttribPointer(this._ribbonInkLoc, 1, gl.FLOAT, false, stride, 12)
    gl.enableVertexAttribArray(this._ribbonAcrossLoc)
    gl.vertexAttribPointer(this._ribbonAcrossLoc, 1, gl.FLOAT, false, stride, 20)
    gl.enableVertexAttribArray(this._ribbonInkWetLoc)
    gl.vertexAttribPointer(this._ribbonInkWetLoc, 1, gl.FLOAT, false, stride, 24)
    gl.enableVertexAttribArray(this._ribbonInkStrengthLoc)
    gl.vertexAttribPointer(this._ribbonInkStrengthLoc, 1, gl.FLOAT, false, stride, 28)
    gl.enableVertexAttribArray(this._ribbonPuddleLoc)
    gl.vertexAttribPointer(this._ribbonPuddleLoc, 2, gl.FLOAT, false, stride, 32)

    gl.drawArrays(gl.TRIANGLES, 0, local.length / RIBBON_FLOATS_PER_VERTEX)

    // Leaving these enabled would make the *next* program's draw read a stale
    // per-vertex stream for whatever attribute index happens to collide with
    // them (these slots are not reserved across programs).
    gl.disableVertexAttribArray(this._ribbonEdgeLoc)
    gl.disableVertexAttribArray(this._ribbonInkWaterLoc)
    gl.disableVertexAttribArray(this._ribbonInkLoc)
    gl.disableVertexAttribArray(this._ribbonAcrossLoc)
    gl.disableVertexAttribArray(this._ribbonInkWetLoc)
    gl.disableVertexAttribArray(this._ribbonInkStrengthLoc)
    dest.endDraw()
  }

  /** #330 stage 2, composite pass: the same DAB_FRAG u_inkMode=2 branch the
   *  every other tool's dabs feed, but drawn once over the whole batch's dirty
   *  rect instead of once per dab — see _ribbonStrokeWork's own doc comment for why a
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
    inkColor: AccumulationBuffer | null,
    color: [number, number, number], opacity: number,
    fieldSeed: [number, number], spreadPx: number, water: number, migratePx: number,
    inkSmoothPx: number, strokeDir: [number, number],
    /** (#536) Half-width of this gesture's mark, px — what the hair count is
     *  derived from. */
    bristleRadiusPx = 0,
  ): void {
    // (#536, §17.22) The rect itself, as a dab whose aspect is the rect's:
    // DAB_VERT scales the unit quad by (aspect, 1) * radius * 2, so a "dab"
    // of size H and aspect W/H covers exactly W x H. It used to be a round
    // dab of the rect's half-DIAGONAL, which the composite branch (pure
    // gl_FragCoord, no dab geometry) filled corner to corner — twice the
    // rect's area of the most expensive shader in the tool, for nothing.
    // One pixel of margin so a fractional edge cannot leave a column out.
    const minX = Math.floor(bounds.minX) - 1, minY = Math.floor(bounds.minY) - 1
    const maxX = Math.ceil(bounds.maxX) + 1, maxY = Math.ceil(bounds.maxY) + 1
    const w = maxX - minX, h = maxY - minY
    if (w <= 0 || h <= 0) return
    const rectDab: Dab = {
      x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5, pressure: 1, tiltX: 0, tiltY: 0,
      size: h, aspectRatio: w / h, angle: 0, opacity, t: 0,
    }
    this._drawRibbonCompositeDab(tile, rectDab, h * 0.5, preset, profile, original, coverage, inkLoad, inkColor, color, fieldSeed, spreadPx, water, migratePx, inkSmoothPx, strokeDir, bristleRadiusPx)
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
    inkColor: AccumulationBuffer | null,
    color: [number, number, number], fieldSeed: [number, number], spreadPx: number, water: number,
    migratePx: number, inkSmoothPx: number, strokeDir: [number, number],
    /** (#536) Half-width of this gesture's mark, px — what the hair count is
     *  derived from. */
    bristleRadiusPx = 0,
  ): void {
    const { gl } = this
    const { buffer } = tile
    if (this._wcAb.noSpread) spreadPx = 0
    if (this._wcAb.noMigrate) migratePx = 0
    // Overwrite, not "over" (#330) — this branch recomputes the finished pixel
    // from scratch every time, so blending it into its own previous output
    // compounded alpha once per dab. See beginReplaceDraw's own comment.
    buffer.beginReplaceDraw()

    gl.useProgram(this._dabProg)
    this._stamps.bindNoise(this._dabUni.u_wcNoiseTex)
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
    // (#536, §17.19) The colour record on its own unit for this draw. Every
    // other user of the program leaves the sampler at unit 0 (the paper,
    // always bound), and it is put back there below, so no draw ever finds
    // it pointing at a unit nothing is bound to.
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, inkColor ? inkColor.texture : this._paperTex)
    gl.uniform1i(u.u_inkColor, 4)
    gl.activeTexture(gl.TEXTURE0)
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
    // #454: how strongly paper grain acts on a ribbon tool's rim — read by the
    // u_inkMode=8 and =9 branches, in opposite directions (RibbonProfile
    // .paperRim) — and set on every composite draw, not just those tools', for
    // the same reason u_wickPx is cleared below: uniforms persist across draws
    // on a shared program.
    gl.uniform1f(u.u_paperRim, profile.paperRim)
    // #468, ADR 011 §3 — watercolor's four, set on every ribbon composite (not
    // just watercolor's) for the same uniforms-persist reason u_wickPx is
    // cleared below. Every other profile carries zeros, which makes each term
    // in the u_inkMode=9 branch vanish identically.
    //
    // (#468 v4) No live/settle split any more — every term runs on every
    // composite, and the settle pass differs only in the rect it covers. See
    // _ribbonStrokeWork's compositeBounds for why that became possible, and
    // what the split cost perceptually while it lasted.
    gl.uniform1f(u.u_wetEdge, profile.wetEdge)
    gl.uniform1f(u.u_wetEdgeRadiusPx, profile.wetEdgeRadiusPx)
    // (#536) Bundles from the mark's own half-width, so a hair stays a fixed
    // few pixels wide whatever brush is held — see
    // WATERCOLOR_BRISTLE_BUNDLE_PX. The coordinate this scales runs -1..+1
    // across the whole width, so the count of bundles laid across the mark is
    // twice this.
    const combs = ribbonBristleCombs(profile, bristleRadiusPx)
    gl.uniform1f(u.u_granulation, profile.granulation)
    gl.uniform1f(u.u_bristleCombs, combs)
    gl.uniform1f(u.u_bristleInk, profile.bristleInk)
    gl.uniform1f(u.u_wcDebugView, this._wcDebugView)
    // (#536) The fallback where there is no deposit to read a per-pixel value
    // from — the spread fringe, which is about to be decided by it.
    gl.uniform1f(u.u_inkStrength, profile.pigmentStrength)
    gl.uniform1f(u.u_saturateInk, profile.saturateInk)
    // #468 v2 — split by *what the term depends on*, not by taste. The spread
    // rewrites the mark's silhouette and so cannot be evaluated before the
    // stroke is finished, exactly like the wet edge above it. The cloud field
    // is a per-place value owing nothing to the silhouette, so it runs on every
    // batch — deferring it would only make a wash visibly change tone at
    // pen-up, buying nothing.
    gl.uniform1f(u.u_spreadPx, spreadPx)
    gl.uniform1f(u.u_cloud, profile.cloud)
    gl.uniform2f(u.u_fieldOffset, fieldSeed[0], fieldSeed[1])
    // #468 v4 — the brush model (ADR 011 §4). u_water is the fallback the
    // composite uses outside the mark, where there is no deposit to read a
    // per-pixel level from.
    gl.uniform1f(u.u_water, water)
    gl.uniform1f(u.u_dryContact, profile.dryContact)
    gl.uniform1f(u.u_edgeSoft, profile.edgeSoft)
    gl.uniform1f(u.u_edgeWander, profile.edgeWander)
    gl.uniform2f(u.u_strokeDir, strokeDir[0], strokeDir[1])
    gl.uniform1f(u.u_tideLo, profile.tideLo)
    gl.uniform1f(u.u_tideHi, profile.tideHi)
    gl.uniform1f(u.u_pigmentOpacity, profile.pigmentOpacity)
    gl.uniform1f(u.u_inkSmoothPx, profile.normalizeDeposit ? inkSmoothPx : 0)
    // #468 v11 — pigment transport (ADR 011 §11). A zero gain switches the
    // block off outright rather than scaling its result to nothing, which
    // matters here in a way it does not for the terms above: this one costs 52
    // texture reads per fragment, and every marker and brush-pen composite goes
    // through the same program.
    gl.uniform1f(u.u_migrate, migratePx > 0 ? profile.migrate : 0)
    gl.uniform1f(u.u_migratePx, migratePx)
    gl.uniform1f(u.u_migrateLo, profile.migrateLo)
    gl.uniform1f(u.u_migrateHi, profile.migrateHi)
    gl.uniform1f(u.u_inkWater, 0)
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
    // (§17.62) The whole quad, corners included - see u_rectComposite.
    gl.uniform1f(u.u_rectComposite, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.uniform1f(u.u_rectComposite, 0)
    gl.uniform1i(u.u_inkColor, 0)

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
    frame: CameraFrame, id: string, opacity: number, targetFbo: WebGLFramebuffer,
    targetW: number, targetH: number,
  ): void {
    const viewRect = frame.view
    // (#365) Whether this pass is shrinking tiles on the way to its target.
    // Only then is a mip chain worth having: at or above 1:1 the base level
    // is already the right size, and generating levels nobody samples would
    // be pure cost on the one path (drawing at 100%) that must stay fast.
    // The export's frame is exactly 1:1 for the same reason — see
    // exactFrame.
    const minifying = frame.scale < 1

    const preview = this._previews.tiles.get(id)
    // (#446) A selection preview shadows only the tiles it holds — the rest of
    // the layer is standing still and must still be drawn. A whole-layer
    // preview keeps the original behaviour of replacing the layer outright:
    // every pixel of it moved, so there is nothing left to draw underneath.
    const areaPreview = preview ? this._previews.areaLayers.has(id) : false
    if (preview) {
      for (const { originX, originY, buffer } of preview) {
        buffer.setMipSampling(minifying && buffer.ensureMipmaps())
        this._drawTileComposite(
          frame, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
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
          frame, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
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
    const factor = coarseFactorFor(frame.scale)
    const coarse = factor === null ? null : buf.resolveCoarse(viewRect, factor)
    // (#503) `coarse.length`, not just `coarse`: an empty array is truthy, so
    // a level holding nothing here used to end the draw outright — the layer
    // vanished at this zoom and came back on zooming in. That state is
    // unreachable while every write marks its tiles (which is what the rest of
    // #503 is about), so this is a guard, not a fix for a seen bug. It is
    // worth having anyway because of the asymmetry: falling through costs one
    // resolveVisible over a region that by construction holds no tiles, while
    // not falling through costs a layer.
    if (coarse?.length && factor !== null) {
      const { w: coarseW, h: coarseH } = buf.coarseWorldSize(factor)
      for (const { buffer, originX, originY } of coarse) {
        buffer.setMipSampling(false)
        this._drawTileComposite(
          frame, buffer.texture, originX, originY, coarseW, coarseH, opacity, targetFbo, targetW, targetH,
        )
      }
      return
    }

    for (const { buffer, originX, originY } of buf.resolveVisible(viewRect)) {
      buffer.setMipSampling(minifying && buffer.ensureMipmaps())
      // (#536, §17.12) A tile still converging on a settled wash draws through
      // the reveal — same rect, same blend, its pixels mixed with the kept
      // picture. The coarse levels above draw plain: at that zoom the motion
      // is under a pixel.
      const reveal = this._washReveals.get(buffer)
      if (reveal) {
        this._drawTileReveal(
          frame, reveal, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
          minifying,
        )
        continue
      }
      this._drawTileComposite(
        frame, buffer.texture, originX, originY, buffer.width, buffer.height, opacity, targetFbo, targetW, targetH,
      )
    }
  }

  /** Rebuilds both cache halves from scratch iff _splitCacheDirty — see the
   *  _belowCache/_aboveCache field comment for what "dirty" tracks. Only
   *  ever called with _previews empty (_runComposite bypasses this
   *  entirely otherwise), so _drawCompositeItem always resolves to a real
   *  layer's own current buffer here, never a scratch preview. */
  private _rebuildSplitCacheIfDirty(
    frame: CameraFrame, belowItems: CompositeItem[], aboveItems: CompositeItem[],
    targetW: number, targetH: number,
  ): void {
    if (!this._splitCacheDirty) return
    this._rebuildCacheHalf(frame, this._belowCache, belowItems, targetW, targetH)
    this._rebuildCacheHalf(frame, this._aboveCache, aboveItems, targetW, targetH)
    this._splitCacheDirty = false
  }

  private _rebuildCacheHalf(
    frame: CameraFrame, target: AccumulationBuffer, items: CompositeItem[], targetW: number, targetH: number,
  ): void {
    target.clear()
    for (const { id, opacity } of items) this._drawCompositeItem(frame, id, opacity, target.fbo, targetW, targetH)
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
   *  (StructuralOps.mergeLive/replayMergeInto).
   *
   *  Bypassed entirely whenever a layer-transform gizmo preview (#120) is
   *  active: previewLayerTransform can substitute scratch content for *any*
   *  layer, active or not, on every drag frame, and that's rare enough
   *  (drags, not paint dabs) that reasoning about invalidating a persistent
   *  cache through it isn't worth it — this falls back to exactly the old
   *  (pre-#122) per-frame full recompute for as long as any preview exists.
   *
   *  (#136) Same split-cache technique now backs both bounded and infinite
   *  rooms — see _drawCompositeItem and Camera's constructor
   *  pose. No per-mode branch left here. */
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

    // A partial screen composite may have a screen-space scissor active.
    // Coarse-cache slots have their own coordinates; folding must replace
    // the whole slot before restoring the caller's clipping state.
    const scissored = gl.isEnabled(gl.SCISSOR_TEST)
    if (scissored) gl.disable(gl.SCISSOR_TEST)

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

    if (scissored) gl.enable(gl.SCISSOR_TEST)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
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
   *  Doesn't itself account for camera rotation (Camera.pose.angle) —
   *  the viewport is always an axis-aligned rect, so a rotated view would
   *  misplace tiles if this drew straight to the real screen. It doesn't:
   *  for infinite rooms _runComposite always targets the unrotated
   *  _assemblyFBO here (see targetW/targetH, always that buffer's own
   *  size in that case) and _finishInfiniteComposite applies the actual
   *  rotation exactly once, afterwards, on the assembled result — see its
   *  own comment (#134).
   *
   *  Rounds each of the tile's four EDGES individually (via
   *  frameEdgeX/Y, src/raster/cameraFrame.ts), rather than rounding a position and a
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
   *  Centers on `frame`'s centerX/Y — the current composite target's own
   *  pixel position for the camera's world point — rather than this
   *  target's own half-size (targetW/2): see CameraFrame.centerX for
   *  why the two aren't the same thing for infinite rooms, and why that
   *  distinction is what keeps an unrotated infinite-room frame pixel-
   *  aligned (no blur) instead of resampled through a fractional offset.
   *
   *  (#301) Scales by frame.scale, not the camera's raw zoom — above
   *  zoom 1 the two differ, and the leftover magnification is applied later,
   *  by the same pass that applies the rotation. See CameraFrame.scale. */
  private _drawTileComposite(
    frame: CameraFrame, texture: WebGLTexture, originX: number, originY: number, bw: number, bh: number,
    opacity: number, targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void {
    const { gl } = this
    const leftEdge   = frameEdgeX(frame, originX)
    const rightEdge  = frameEdgeX(frame, originX + bw)
    const topEdge    = frameEdgeY(frame, originY)
    const bottomEdge = frameEdgeY(frame, originY + bh)
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
  private _runComposite(
    frame: CameraFrame, items: CompositeItem[],
    partialWorld: { minX: number; minY: number; maxX: number; maxY: number } | null = null,
  ): void {
    const buildFbo = this._assemblyFBO.fbo
    const targetW  = this._assemblyFBO.width
    const targetH  = this._assemblyFBO.height

    const idx = this._activeId !== null ? items.findIndex(it => it.id === this._activeId) : -1
    // idx === -1 (no active layer, or it's not currently composited — e.g.
    // hidden): treat everything as "below" and composite no separate active
    // entry, exactly matching what a plain full recompute of `items` would
    // have produced (the active id, absent from `items`, was never going to
    // be drawn either way).
    const belowItems  = idx === -1 ? items : items.slice(0, idx)
    const activeItem  = idx === -1 ? null  : items[idx]
    const aboveItems  = idx === -1 ? []    : items.slice(idx + 1)
    // (§17.46) The split caches are rebuilt (in full) before any scissor.
    if (this._previews.tiles.size === 0) this._rebuildSplitCacheIfDirty(frame, belowItems, aboveItems, targetW, targetH)
    // (§17.46) A frame whose only change is the live stroke reassembles only
    // its rect (unrotated camera: the assembly is then the screen, padded):
    // clearing and redrawing the whole assembly - the caches and every
    // resident tile of the active layer - was the second-dearest thing in a
    // big stroke's frame on the tablet.
    let scissored = false
    if (partialWorld && frame.angle === 0 && this._previews.tiles.size === 0) {
      const pad = 8
      const x0 = Math.max(0, frameEdgeX(frame, partialWorld.minX) - pad)
      const x1 = Math.min(targetW, frameEdgeX(frame, partialWorld.maxX) + pad)
      const top = Math.max(0, frameEdgeY(frame, partialWorld.minY) - pad)
      const bottom = Math.min(targetH, frameEdgeY(frame, partialWorld.maxY) + pad)
      if (x1 > x0 && bottom > top) {
        this.gl.enable(this.gl.SCISSOR_TEST)
        this.gl.scissor(x0, targetH - bottom, x1 - x0, bottom - top)
        scissored = true
      }
    }
    this._assemblyFBO.clear()

    if (this._previews.tiles.size > 0) {
      for (const { id, opacity } of items) this._drawCompositeItem(frame, id, opacity, buildFbo, targetW, targetH)
      return
    }

    if (belowItems.length) {
      this._compositeTextures([{ texture: this._belowCache.texture, opacity: 1 }], buildFbo, targetW, targetH)
    }
    if (activeItem) {
      this._drawCompositeItem(frame, activeItem.id, activeItem.opacity, buildFbo, targetW, targetH)
    }
    if (aboveItems.length) {
      this._compositeTextures([{ texture: this._aboveCache.texture, opacity: 1 }], buildFbo, targetW, targetH)
    }
    if (scissored) this.gl.disable(this.gl.SCISSOR_TEST)
  }

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
  private _wetFromForeignStroke(
    layerId: string, tool: ToolType, preset: string, dabs: Dab[], atMs: number | null,
    /** (#536, §17.21) What the ribbon build just worked out each dab left
     *  standing (_paintDabs' return) — the mix is only the fallback for a dab
     *  it did not paint. */
    standing?: ReadonlyMap<Dab, number>,
  ): void {
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
    const poolAt = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : pools[y * w + x]
    const data = new Uint8Array(w * h * 4)
    const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : cells[y * w + x]
    const rowMax = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0
        for (let i = -2; i <= 2; i++) { const v = at(x + i, y); if (v > m) m = v }
        rowMax[y * w + x] = m
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tent = (
          at(x, y) * 4
          + (at(x, y + 1) + at(x, y - 1) + at(x + 1, y) + at(x - 1, y)) * 2
          + at(x + 1, y + 1) + at(x - 1, y + 1) + at(x + 1, y - 1) + at(x - 1, y - 1)
        ) * 0.0625
        let body = 0
        for (let j = -2; j <= 2; j++) { const yy = y + j; if (yy < 0 || yy >= h) continue; const v = rowMax[yy * w + x]; if (v > body) body = v }
        // The pool as the tint's own tent, not the body's 5x5 max: the pool is
        // drawn as a tone now (s17.83), and its edge must be the grey's.
        const pool = (
          poolAt(x, y) * 4
          + (poolAt(x, y + 1) + poolAt(x, y - 1) + poolAt(x + 1, y) + poolAt(x - 1, y)) * 2
          + poolAt(x + 1, y + 1) + poolAt(x - 1, y + 1) + poolAt(x + 1, y - 1) + poolAt(x - 1, y - 1)
        ) * 0.0625
        const o = (y * w + x) * 4
        data[o] = data[o + 2] = Math.round(Math.min(tent, 1) * 255)
        data[o + 1] = Math.round(Math.min(pool, 1) * 255)
        data[o + 3] = Math.round(Math.min(body, 1) * 255)
      }
    }
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
