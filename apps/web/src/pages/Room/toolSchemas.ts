import {
  PENCIL_GRADES, DEFAULT_GRAPHITE_COLOR, LINER_SIZES_MM, CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE,
  TILT_RESPONSES, DEFAULT_TILT_RESPONSE, PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE,
  WATERCOLOR_MIX_PRESETS, WATERCOLOR_MIX_DEFAULT,
  WATERCOLOR_PIGMENT_CODES, WATERCOLOR_PIGMENT_SWATCHES, DEFAULT_WATERCOLOR_PIGMENT,
  WATERCOLOR_PIGMENTS,
  type PencilGradeName, type LinerSizeMm, type CharcoalType, type TiltResponse, type PressureResponse,
  type WatercolorMixPreset,
  WATERCOLOR_NIBS, DEFAULT_WATERCOLOR_NIB, type WatercolorNib,
  CHARCOAL_NIBS, DEFAULT_CHARCOAL_NIB, type CharcoalNib,
  NIB_ANCHORS, type NibAnchor,
} from '../../engine'
import { parseNumberInput } from '../../components/NumberField/numberField'
import { expScale, type SliderScale } from '../../components/PrecisionSlider/sliderScale'
import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../lib/roomStorage'
import { CHARCOAL_TYPE_IMAGES, MARKER_NIB_ICONS, PENCIL_GRADE_IMAGES } from './toolTypeImages'
import { CHARCOAL_TILT_CURVES, GRAPHITE_TILT_CURVES } from './tiltResponseCurves'
import { PRESSURE_RESPONSE_CURVES } from './pressureResponseCurves'
import { TRANSFORM_MODES, type TransformMode } from './transformMath'
import { SELECTION_SHAPES, type SelectionShapeKind } from './selectionGesture'
import type { TranslationKey } from '../../i18n'
import type { IconName } from '../../icons/iconNames'

// Unified, extensible tool-settings registry (#196). Replaces the old
// hand-typed `RoomToolSettings{pencil,eraser}` (toolSettings.ts) — adding a
// new tool or a new setting to an existing tool is a data change here, not a
// new interface + a new save/load function + a new settings component.
//
// UI-level tool identity, deliberately distinct from the shared `ToolType`
// ('pencil'|'eraser'|'smudge' in @grafetto/shared) — once Color Pencil
// ships it's a separate toolbar entry with its own remembered settings, but
// still emits `tool: 'pencil'` at the Operation/protocol level. Mapping one
// to the other happens only at the moment of emitting a stroke, not here.
//
// (#405) This is also the widest of the two lists the store's `EditorTool`
// (toolSlice.ts) is built from: everything selectable is a UiToolId, so the
// selected tool always has a schema to show, but not every UiToolId is
// selectable (colorPencil has a schema and no toolbar slot yet — #188).
export type UiToolId =
  | 'pencil' | 'colorPencil' | 'charcoal' | 'liner' | 'marker' | 'brushPen' | 'watercolor'
  | 'eraser' | 'smudge' | 'eyedropper' | 'ruler' | 'transform' | 'selection' | 'grid' | 'hand' | 'fill'
  // (#509, #510) The two annotation tools. They are UiToolIds and deliberately
  // not ToolTypes: neither emits a StrokeOperation, and neither puts anything
  // in a layer — see packages/shared's annotation contract.
  | 'annotateText' | 'annotatePen'

export type SettingValueType =
  | {
      kind: 'numberRange'; min: number; max: number; step: number
      format?: (v: number) => string
      /** (#335) Reads a typed string back into a raw value, inverting
       *  `format` — needed once these fields became directly editable
       *  (NumberField). Only formats that *change* the number need one:
       *  'px'/plain degrees just decorate it and fall back to a plain number
       *  read, while percent rescales it and degrees+minutes has two
       *  components. */
      parse?: (text: string) => number | null
      /** (#390) How the slider spreads this range over its track. Omit for
       *  linear — the default, and correct for anything linear by meaning
       *  (percent, degrees). Only px sizes set it, to `expScale`; see
       *  sliderScale.ts. Data on the descriptor rather than a branch inside
       *  PrecisionSlider, so a new field picks a scale without the component
       *  learning about it. */
      scale?: SliderScale
    }
  | { kind: 'boolean' }
  | { kind: 'color' }
  | { kind: 'enumOptions'; options: readonly string[] }

export type SettingUiControl = 'slider' | 'input' | 'toggle' | 'swatch' | 'select'

/** `default`'s type isn't derived per-descriptor via a conditional type — the
 *  `as const`-per-field boilerplate that'd require wasn't worth it for a
 *  handful of fields; every consumer narrows via `descriptor.valueType.kind`
 *  at the point of use instead (see SettingField). */
export interface SettingDescriptor {
  /** Translation key for this field's label (#208) — the schema is data, so
   *  it carries the key rather than a language-specific string; SettingField
   *  resolves it at render time. */
  nameKey: TranslationKey
  valueType: SettingValueType
  /** Translation keys for individual `enumOptions` values, where the option
   *  is a word rather than notation. Grades ('HB', '2B') and liner widths
   *  ('0.3') are international pencil/pen markings and stay as they are; a
   *  marker nib or a charcoal type is an ordinary noun and gets translated.
   *  An option missing from this map renders as its own raw value. */
  optionLabelKeys?: Readonly<Record<string, TranslationKey>>
  /** (#468) Literal display names, for options that are *products* rather than
   *  UI copy. Pigments carry Colour Index names — "Cobalt Blue", "PB28" — which
   *  are the same in every language and would be actively wrong to translate,
   *  the same call the codebase already makes for pencil grades and liner
   *  widths by falling through to the raw value. Prefer optionLabelKeys for
   *  anything a translator should see. */
  optionLabels?: Readonly<Record<string, string>>
  /** (#335) Sample-stroke image per `enumOptions` value, for the 'select'
   *  control — what a grade or a charcoal type actually lays down, which is
   *  the entire basis for choosing one and which no amount of labelling
   *  conveys. Keyed by option value; see toolTypeImages.ts. */
  optionImages?: Readonly<Record<string, string>>
  /** (#335) Icon name per `enumOptions` value, for options whose difference is
   *  a *shape* rather than a tone — the marker's two nibs. Mutually exclusive
   *  with `optionImages` in practice; a descriptor carrying both would render
   *  the icon. */
  optionIcons?: Readonly<Record<string, IconName>>
  /** (#409) A small line graph per `enumOptions` value: normalized 0..1
   *  samples, evenly spaced along the x axis, drawn in the same preview slot a
   *  sample stroke or an icon would take.
   *
   *  The third kind of preview because the tilt response is the third kind of
   *  option. A grade is a tone (photograph it), a nib is a shape (draw its
   *  glyph), and a response is a *function* — what it picks is how fast the dab
   *  answers the stylus as the pen goes over, and the only faithful picture of
   *  that is its curve. Naming the three alone would be the worst of both: they
   *  differ in a way no adjective pins down, which is exactly the complaint
   *  that produced this setting. */
  optionCurves?: Readonly<Record<string, readonly number[]>>
  /** Which control(s) this field can render as; first is the default. */
  uiControls: readonly SettingUiControl[]
  /** Also rendered inline in the left toolbar, not just the settings tab. */
  quickAccess?: boolean
  /** (#391) Opts this one field out of per-room persistence: it is never
   *  written to localStorage and always starts a room at its `default`,
   *  while every other field of the same tool keeps being remembered.
   *
   *  Persisting a setting is the right default — it's how a tool stays *your*
   *  tool between visits. It is wrong for a field that describes a temporary
   *  mode of working rather than a preference, where the remembered value is
   *  something the user set once, half an hour ago, for one specific edit: the
   *  transform tool's own `mode` (a room re-entered in Rotate & Skew reads as
   *  a broken gizmo, since the same edge handles now shear instead of
   *  stretching) and its `keepProportions`, which is reset with it so the tool
   *  has exactly one known starting state rather than two independent ones to
   *  reason about.
   *
   *  Deliberately a property of the descriptor, not a list of exempt keys kept
   *  somewhere else: the reason a field is transient belongs next to the
   *  field, and a new one opts out by saying so here — nothing to remember to
   *  update in loadToolSettings/saveToolSettings, which both simply honour the
   *  flag. */
  transient?: true
  default: number | boolean | [number, number, number] | string
  /** #278: gates rendering on this tool's *other* current field values (e.g.
   *  marker's chisel-only `angle`/`anchor` — bullet is round,
   *  so an angle control would do nothing visible for it). Takes this
   *  tool's own ToolSettingsValue, not the whole ToolSettingsMap — a
   *  descriptor never depends on a *different* tool's settings. Omit for a
   *  field that's always shown once its tool is active (every existing
   *  field before #278). */
  visibleWhen?: (values: ToolSettingsValue) => boolean
}

export type ToolSchema = Record<string, SettingDescriptor>

const percentFormat = (v: number) => `${Math.round(v * 100)}%`
const pxFormat = (v: number) => `${v}px`

/** Inverse of `percentFormat` — the field is edited in the units it displays,
 *  so "80" typed over "100%" means 0.8, not 80. */
const percentParse = (text: string): number | null => {
  const n = parseNumberInput(text)
  return n === null ? null : n / 100
}

/** Inverse of `formatDegreesMinutes`. Accepts what that function produces
 *  ("45°30′") and what someone is likelier to type instead ("45", "45.5") —
 *  a bare number is degrees, and a second number after the degree mark is
 *  arc-minutes. */
export const degreesMinutesParse = (text: string): number | null => {
  const [degPart, minPart] = text.split(/[°º]/)
  const deg = parseNumberInput(degPart ?? '')
  if (deg === null) return null
  const min = minPart === undefined ? null : parseNumberInput(minPart)
  return min === null ? deg : deg + Math.sign(deg || 1) * (min / 60)
}

/** #336: the upper bound of every continuous px size slider (pencil, color
 *  pencil, charcoal, marker, eraser, smudge), in one place so it stays one
 *  edit to move. Was 120 (160 for smudge, arbitrarily) — far too small for
 *  the broad tonal work charcoal and a chisel marker are for, on a canvas
 *  that is already thousands of px wide. Deliberately shared rather than
 *  per-tool: nothing about a specific tool argues for a different ceiling,
 *  and a split would just be a number to forget when this one moves again.
 *  Liner is not affected — its size is a fixed mm ladder (ADR 003), not a
 *  slider. */
export const MAX_TOOL_SIZE_PX = 400

// #278/#277: degrees+arc-minutes, matching the radial dial's own 1' minimum
// step (RadialDial's own doc comment) — plain toFixed(2) degrees would round
// away exactly the precision the dial is built to offer. Rounds to the
// nearest whole minute rather than truncating, and normalizes a 60' rollover
// (e.g. 44.999...°) back to the next whole degree so it never displays "44°60′".
export function formatDegreesMinutes(v: number): string {
  const wrapped = ((v % 360) + 360) % 360
  let deg = Math.floor(wrapped)
  let min = Math.round((wrapped - deg) * 60)
  if (min === 60) { min = 0; deg = (deg + 1) % 360 }
  return `${deg}°${String(min).padStart(2, '0')}′`
}

// #409: the tilt→shape response, offered by every tool whose dab geometry
// actually reads the tilt curve — pencil and color pencil, eraser and smudge
// (which ride graphite's own profile, see dabShaping.ts), and charcoal.
// Deliberately *not* liner or marker: neither consults the curve at all, so the
// control would be inert, and an inert control reads as a broken tool (the same
// call #278 made for the bullet nib's angle).
//
// Not `quickAccess` (Ilya, 07.08): unlike grade or size, this is set once when
// the tool is first made to feel right and then left alone for months. The
// quick column is for what changes during a drawing.
const TILT_RESPONSE_LABEL_KEYS = {
  restrained: 'tool.tiltResponse.restrained',
  smooth: 'tool.tiltResponse.smooth',
  linear: 'tool.tiltResponse.linear',
} as const satisfies Record<TiltResponse, TranslationKey>

const tiltResponseField = (
  curves: Readonly<Record<TiltResponse, readonly number[]>>,
  defaultResponse: TiltResponse = DEFAULT_TILT_RESPONSE,
): SettingDescriptor => ({
  nameKey: 'tool.field.tiltResponse',
  valueType: { kind: 'enumOptions', options: TILT_RESPONSES },
  optionLabelKeys: TILT_RESPONSE_LABEL_KEYS,
  optionCurves: curves,
  uiControls: ['select'],
  default: defaultResponse,
})

const pencilLikeSchema = (defaultColor: [number, number, number], defaultSize: number): ToolSchema => ({
  // (#335) A picker showing each grade's own sample stroke, not a slider over
  // notation: "6H vs 2B" is a question about how dark and how soft the mark
  // comes out, and the swatch answers it directly.
  grade: {
    nameKey: 'tool.field.grade',
    valueType: { kind: 'enumOptions', options: PENCIL_GRADES },
    optionImages: PENCIL_GRADE_IMAGES,
    uiControls: ['select'],
    quickAccess: true,
    default: 'HB' satisfies PencilGradeName,
  },
  // (#390) `expScale` here and on every other continuous px size: with 1..400
  // spread linearly, the 1..20px range people actually draw lines with lived
  // in the first 5% of the track, and the remaining 95% picked between sizes
  // that differ by less than they look. Equal ratio per pixel puts 1..20 in
  // the first half. Opacity and angle stay linear — see sliderScale.ts.
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: MAX_TOOL_SIZE_PX, step: 1, format: pxFormat, scale: expScale },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    default: defaultSize,
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 1,
  },
  color: {
    nameKey: 'tool.field.color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: defaultColor,
  },
  // The one tool that does *not* ship on DEFAULT_TILT_RESPONSE (Ilya, 18.08):
  // a pencil starts on 'restrained', i.e. the pre-#389 graphite ramp — cubed,
  // against a 90° no stylus reaches — so an ordinary working grip keeps a
  // near-round point instead of opening into a broad flat. That is what a
  // graphite pencil is expected to do out of the box; 'smooth' is still one
  // pick away in the same select, and stays the default everywhere the field
  // is offered on a material that was calibrated for it.
  tiltResponse: tiltResponseField(GRAPHITE_TILT_CURVES, 'restrained'),
})

// Liner (#243, ADR 003): fixed calibrated width steps are the primary
// identity of a real fineliner set ("rOtring выпускает Isograph в наборе
// определённых line widths, а не как один непрерывно регулируемый
// наконечник" — ADR 003's own Technical Pen section) — modeled as
// enumOptions (same rendering path PENCIL_GRADES already uses), not a
// continuous numberRange slider like pencil/eraser/smudge's own 'size'.
// A free/advanced size override is explicitly listed in the ADR as a v2
// nice-to-have, not part of this pass — deferred, not silently dropped.
export const LINER_SIZE_LABELS = LINER_SIZES_MM.map(String)

// mm labels are branding/identity (matching how a real fineliner package is
// marked), not a calibrated physical-to-screen DPI conversion — this app has
// no such system anywhere else either (pencil's own 'size' field is already
// just a plain px diameter, see pencilLikeSchema above). First-pass values,
// not yet tuned against a real device (same caveat as PENCIL_PRESETS' own
// interpolation comment).
const LINER_SIZE_PX: Record<string, number> = { '0.1': 2, '0.2': 3, '0.3': 4, '0.5': 6, '0.8': 9 }

export function linerSizeToPx(label: string): number {
  return LINER_SIZE_PX[label] ?? LINER_SIZE_PX[String(LINER_SIZES_MM[0])]
}

/** Steps one notch along an `enumOptions` ladder, for the hotkeys that walk a
 *  fixed list rather than a continuous range — the liner's widths and the
 *  pencil's grades (#440). Clamps at either end rather than wrapping: both
 *  ladders run soft→hard / thin→thick, and rolling 6B back round to 6H on one
 *  extra press is a jump, not a step. An unrecognized current value (stale
 *  storage, a since-renamed option) starts from the first entry rather than
 *  throwing. */
export function stepEnumOption(options: readonly string[], current: string, direction: 1 | -1): string {
  const idx = options.indexOf(current)
  const nextIdx = Math.min(options.length - 1, Math.max(0, (idx === -1 ? 0 : idx) + direction))
  return options[nextIdx]
}

/** Steps the liner's size one notch up/down its fixed ladder (ADR 003) —
 *  used by the '['/']' size hotkeys, which otherwise assume a continuous
 *  numeric 'size' field (see Room/index.tsx's keydown handler). */
export function stepLinerSize(current: string, direction: 1 | -1): string {
  return stepEnumOption(LINER_SIZE_LABELS, current, direction)
}

const linerSchema = (): ToolSchema => ({
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'enumOptions', options: LINER_SIZE_LABELS },
    uiControls: ['slider'],
    quickAccess: true,
    default: String(0.3 satisfies LinerSizeMm),
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 1,
  },
  // ADR 003: "чёрная пигментная ручка" is the identity default, but v1
  // allows arbitrary color (same as Color pencil) rather than locking it —
  // decided explicitly, not a placeholder.
  color: {
    nameKey: 'tool.field.color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: [0, 0, 0],
  },
})

// Brush pen (#454, ADR 009 §11). Deliberately the smallest schema of any
// drawing tool: size, colour, opacity, and one named pressure feel.
//
// Not a size ladder like the liner's. That ladder is justified by real
// capillary pens being sold in calibrated steps (ADR 003); a brush nib has no
// such calibration — its width is a property of the nib and the hand, so a
// continuous slider is the honest control.
const brushPenSchema = (): ToolSchema => ({
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: MAX_TOOL_SIZE_PX, step: 1, format: pxFormat, scale: expScale },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    // The width at full pressure. A light touch runs at 0.15 of it (ADR 009
    // §2), so 12 spans roughly 2-12px — the range line art and lettering
    // actually live in.
    default: 12,
  },
  // ADR 009 §11: the *only* setting beyond size and colour, and it is offered
  // as three named feels rather than a curve editor — how fast a nib should
  // open up under a given hand is a preference, not a fact to be discovered.
  // Same reasoning, and the same shape of control, as the tilt response #409
  // added for graphite and charcoal.
  //
  // Not in quick access: it is picked once to suit a hand and then left alone,
  // unlike size and colour.
  pressureResponse: {
    nameKey: 'tool.field.pressureResponse',
    valueType: { kind: 'enumOptions', options: PRESSURE_RESPONSES },
    optionLabelKeys: {
      soft: 'tool.pressureResponse.soft',
      normal: 'tool.pressureResponse.normal',
      firm: 'tool.pressureResponse.firm',
    },
    optionCurves: PRESSURE_RESPONSE_CURVES,
    uiControls: ['select'],
    quickAccess: false,
    default: DEFAULT_PRESSURE_RESPONSE satisfies PressureResponse,
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 1,
  },
  // Black ink is the identity, but arbitrary colour is allowed — same call the
  // liner made, and for the same reason (coloured ink is a real thing, and
  // locking it would buy nothing).
  color: {
    nameKey: 'tool.field.color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: [0, 0, 0],
  },
})

// Watercolor (#468, ADR 011 §5). The same three-control shape the brush pen
// settled on, and for the same reason: the tool's identity is a material, not a
// parameter set, so anything beyond size, colour and how the brush answers the
// hand belongs in the model rather than on a slider.
//
// Notably absent, and deliberately: wetness, drying time, flow, pigment
// granularity, edge darkening. Those are the parameters a fluid simulation
// would expose, and there is no fluid simulation here (ADR 011 §2). Exposing
// them as sliders over a per-stroke approximation would be a UI that promises
// physics the engine does not have.
const watercolorSchema = (): ToolSchema => ({
  // #489: which brush, before anything about what is in it. The glyphs are the
  // marker's own nib icons for the two shapes it already has — after #482 a nib
  // is a shape a tool wears, and drawing the same shape twice would say the
  // opposite. `brush` stands for the flexible round, which is the brush pen's
  // tip wet and carries that tool's own icon for the same reason.
  nib: {
    nameKey: 'tool.field.nib',
    valueType: { kind: 'enumOptions', options: WATERCOLOR_NIBS },
    optionLabelKeys: {
      round: 'tool.nib.round',
      chisel: 'tool.nib.chisel',
      flex: 'tool.nib.flex',
    },
    optionIcons: {
      round: MARKER_NIB_ICONS.bullet,
      chisel: MARKER_NIB_ICONS.chisel,
      flex: 'brush',
    },
    uiControls: ['select'],
    quickAccess: true,
    // The brush as it shipped, and the one every stroke recorded before #489
    // replays as. A new nib should not change what the tool does to someone who
    // never asked for one.
    default: DEFAULT_WATERCOLOR_NIB satisfies WatercolorNib,
  },
  // Three named states, and they are what most users will ever touch: the two
  // sliders exist so that these can mean something, not so that everyone has to
  // tune them. Picking one writes both sliders (see Room's own handler).
  mix: {
    nameKey: 'tool.field.mix',
    valueType: { kind: 'enumOptions', options: WATERCOLOR_MIX_PRESETS },
    optionLabelKeys: {
      dry: 'tool.watercolorMix.dry',
      damp: 'tool.watercolorMix.damp',
      wet: 'tool.watercolorMix.wet',
    },
    optionIcons: {
      dry: 'humidity_low',
      damp: 'humidity_mid',
      wet: 'humidity_high',
    },
    uiControls: ['select'],
    quickAccess: true,
    default: 'damp' satisfies WatercolorMixPreset,
  },
  // #468 v5, ADR 011 §5 — which paint, as distinct from how much of it.
  //
  // A colour picker cannot express this and never could: French Ultramarine and
  // a phthalo blue can be set to the same RGB and still behave nothing alike —
  // one granulates heavily and lifts off the paper, the other lays flat and
  // stains. Picking a tube is also how the choice is actually made at a real
  // desk; nobody mixes a hex value.
  //
  // The swatches are generated from each paint's own colour rather than being
  // photographed marks like the pencil grades', because what distinguishes one
  // tube from the next here *is* the colour — see WATERCOLOR_PIGMENT_SWATCHES.
  pigmentCode: {
    nameKey: 'tool.field.pigmentCode',
    valueType: { kind: 'enumOptions', options: WATERCOLOR_PIGMENT_CODES },
    optionLabels: Object.fromEntries(WATERCOLOR_PIGMENTS.map(p => [p.code, p.name])),
    optionImages: WATERCOLOR_PIGMENT_SWATCHES,
    uiControls: ['select'],
    quickAccess: true,
    default: DEFAULT_WATERCOLOR_PIGMENT,
  },
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: MAX_TOOL_SIZE_PX, step: 1, format: pxFormat, scale: expScale },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    // Well above the brush pen's 12: a wash brush is bought broad, and the
    // tool's whole point is covering area. A light touch runs at 0.32 of this
    // (WATERCOLOR_WIDTH_FLOOR), so 32 spans roughly 10-32px.
    default: 32,
  },
  // Same three named feels the brush pen offers, riding the same free preset
  // slot (watercolorPresets.ts's watercolorResponseFromPreset). Not in quick
  // access: picked once to suit a hand, then left alone.
  pressureResponse: {
    nameKey: 'tool.field.pressureResponse',
    valueType: { kind: 'enumOptions', options: PRESSURE_RESPONSES },
    optionLabelKeys: {
      soft: 'tool.pressureResponse.soft',
      normal: 'tool.pressureResponse.normal',
      firm: 'tool.pressureResponse.firm',
    },
    optionCurves: PRESSURE_RESPONSE_CURVES,
    uiControls: ['select'],
    quickAccess: false,
    default: DEFAULT_PRESSURE_RESPONSE satisfies PressureResponse,
  },
  // #489: the flat's angle and the frame it is held in — the same two controls
  // the marker's chisel has, deliberately spelled the same way rather than
  // given this tool's own vocabulary. Hidden for the round and flexible nibs,
  // which have no angle to set: a round footprint would show nothing, and a
  // flexible one is pointed by the drag (tipFootprint.ts's bend), so a dial
  // here would be a control that visibly does nothing.
  //
  // Default 45deg matches the marker's and the engine's own fallback. The
  // anchor defaults to `screen` for the reason the marker's does — a nib that
  // stays put on the screen is what shipped, and someone rotating the paper
  // under their hand is not asking their brush to turn with it.
  angle: {
    nameKey: 'tool.field.angle',
    valueType: { kind: 'numberRange', min: 0, max: 360, step: 1 / 60, format: formatDegreesMinutes, parse: degreesMinutesParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 45,
    visibleWhen: v => v.nib === 'chisel',
  },
  anchor: {
    nameKey: 'tool.field.anchor',
    valueType: { kind: 'enumOptions', options: NIB_ANCHORS },
    optionLabelKeys: {
      canvas: 'tool.anchor.canvas',
      screen: 'tool.anchor.screen',
      barrel: 'tool.anchor.barrel',
    },
    optionIcons: {
      canvas: 'grid_on',
      screen: 'screen_rotation_alt',
      barrel: 'stylus',
    },
    uiControls: ['select'],
    default: 'screen' satisfies NibAnchor,
    visibleWhen: v => v.nib === 'chisel',
  },
  // #468 v4, ADR 011 §4 — the two quantities the brush actually carries, and
  // deliberately *two* rather than one "wetness" slider. The interesting states
  // are not on a line: little water with much pigment is a dry brush, much
  // water with little pigment is a pale flood, and no single control can reach
  // both.
  //
  // There is no opacity slider here on purpose. Pigment *is* how strong the
  // paint is; a second control for the same axis would be two knobs fighting
  // over one quantity, and it is exactly what let earlier versions read as an
  // opacity brush with texture on it.
  water: {
    nameKey: 'tool.field.water',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: WATERCOLOR_MIX_DEFAULT.water,
  },
  pigment: {
    nameKey: 'tool.field.pigment',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: WATERCOLOR_MIX_DEFAULT.pigment,
  },
  // Unlike the ink tools, black is a poor identity default here — watercolor is
  // a colour medium first, and a black wash is the one thing watercolourists
  // are taught to avoid. A mid blue is the honest "this is paint" swatch.
  color: {
    nameKey: 'tool.field.color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: [0.22, 0.35, 0.62],
  },
})

// Charcoal (#304, ADR 005 §1): the three real charcoal types ride the same
// enumOptions control PENCIL_GRADES already uses — one toolbar slot with a
// type selector, deliberately not three separate tools (see the ADR for why
// three toolbar buttons for one material would fight the manifesto, and why
// hiding the choice in a settings tab would be equally wrong).
const charcoalSchema = (): ToolSchema => ({
  // #501: which stick, before which charcoal it is made of — the same `nib`
  // field the marker and the watercolor brush already wear, on the same two
  // glyphs, because after #482 a nib is a shape a tool wears and drawing the
  // round stick's own icon would say the opposite.
  //
  // Defaults to bullet, which is the stick exactly as it shipped: a new nib
  // must not change what the tool does to someone who never asked for one, and
  // every stroke recorded before this issue replays as it (charcoalPresets.ts's
  // charcoalNibFromPreset).
  nib: {
    nameKey: 'tool.field.nib',
    valueType: { kind: 'enumOptions', options: CHARCOAL_NIBS },
    optionLabelKeys: {
      bullet: 'tool.nib.bullet',
      chisel: 'tool.nib.chisel',
    },
    optionIcons: MARKER_NIB_ICONS,
    uiControls: ['select'],
    quickAccess: true,
    default: DEFAULT_CHARCOAL_NIB satisfies CharcoalNib,
  },
  type: {
    nameKey: 'tool.field.type',
    valueType: { kind: 'enumOptions', options: CHARCOAL_TYPES },
    optionLabelKeys: {
      vine: 'tool.charcoalType.vine',
      willow: 'tool.charcoalType.willow',
      compressed: 'tool.charcoalType.compressed',
    },
    optionImages: CHARCOAL_TYPE_IMAGES,
    uiControls: ['select'],
    quickAccess: true,
    default: DEFAULT_CHARCOAL_TYPE satisfies CharcoalType,
  },
  // Default size well above pencil's 4px: a charcoal stick's contact patch is
  // broad even at a light touch (the same physical fact CHARCOAL_DAB_SHAPING's
  // own raised width floor encodes), and the upper bound matches every other
  // px-slider tool's.
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: MAX_TOOL_SIZE_PX, step: 1, format: pxFormat, scale: expScale },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    default: 18,
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 1,
  },
  // Charcoal is black by definition, but the color stays editable rather than
  // locked — same v1 decision liner made (see linerSchema's own comment), and
  // white/sanguine charcoal on toned paper is a real academic technique, not a
  // hypothetical. Default is a near-black rather than pure [0,0,0]: real
  // charcoal reads slightly warm-grey at full density, and DEFAULT_GRAPHITE_
  // COLOR would make it indistinguishable from the pencil at a glance.
  color: {
    nameKey: 'tool.field.color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: [0.09, 0.08, 0.08],
  },
  // #501: the cut edge's angle and the frame it is held in — the marker's two
  // controls, spelled the same way here as they are there and on the watercolor
  // flat, rather than given this tool its own vocabulary for the same thing.
  // Hidden for the round stick, which has no angle to set.
  //
  // Anchor defaults to `screen` for the reason the other two do: someone
  // rotating the paper under their hand is not asking the stick in it to turn.
  angle: {
    nameKey: 'tool.field.angle',
    valueType: { kind: 'numberRange', min: 0, max: 360, step: 1 / 60, format: formatDegreesMinutes, parse: degreesMinutesParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 45,
    visibleWhen: v => v.nib === 'chisel',
  },
  anchor: {
    nameKey: 'tool.field.anchor',
    valueType: { kind: 'enumOptions', options: NIB_ANCHORS },
    optionLabelKeys: {
      canvas: 'tool.anchor.canvas',
      screen: 'tool.anchor.screen',
      barrel: 'tool.anchor.barrel',
    },
    optionIcons: {
      canvas: 'grid_on',
      screen: 'screen_rotation_alt',
      barrel: 'stylus',
    },
    uiControls: ['select'],
    default: 'screen' satisfies NibAnchor,
    visibleWhen: v => v.nib === 'chisel',
  },
  // Charcoal's own curves, not graphite's: same three shapes, plotted against
  // this material's fullDeg/aspectMax (charcoalFeel.ts).
  //
  // #501: and only for the round stick. The chisel's geometry does not read
  // tilt at all (dabShaping.ts's charcoalChiselShaping), so a response curve
  // there would be a control that provably does nothing — the same rule that
  // hides the angle for the bullet, and that keeps the setting off liner and
  // marker entirely.
  tiltResponse: { ...tiltResponseField(CHARCOAL_TILT_CURVES), visibleWhen: v => v.nib !== 'chisel' },
})

// Marker (#252, ADR 004 §7/MVP-scope): UI/toolbar plumbing only — the actual
// dab shaping (bullet vs. chisel geometry, fixed angle-mode hook) and
// multiply-with-coverage compositing are #249/#250/#251, separate in-flight
// engine work this schema deliberately does not depend on. Until those land,
// `_resolvePreset` in engine/index.ts has no 'marker' branch of its own (only
// 'liner' gets one) — an unrecognized presetName for any other tool falls
// back to PENCIL_PRESETS['HB'], so a marker stroke renders as a flat HB
// pencil dab for now. That's the expected, explicitly-fine placeholder
// behavior per the issue, not a bug to work around here.
export const MARKER_NIB_TYPES = ['bullet', 'chisel'] as const
export type MarkerNibType = (typeof MARKER_NIB_TYPES)[number]

const markerSchema = (): ToolSchema => ({
  // Bullet/chisel (ADR 004 §1) — rendered via the same enumOptions control
  // path PENCIL_GRADES already uses (SettingField switches purely on
  // valueType.kind), not a bespoke toggle. Defaults to 'chisel' — the
  // nib that actually looks like a marker (flat, angle-dependent edge);
  // 'bullet' remains available as the round alternative.
  nib: {
    nameKey: 'tool.field.nib',
    valueType: { kind: 'enumOptions', options: MARKER_NIB_TYPES },
    optionLabelKeys: {
      bullet: 'tool.nib.bullet',
      chisel: 'tool.nib.chisel',
    },
    // Icons rather than sample strokes (#335): a bullet and a chisel mark
    // differ in the shape of the tip, and the tip is what the glyph draws.
    optionIcons: MARKER_NIB_ICONS,
    uiControls: ['select'],
    quickAccess: true,
    default: 'chisel' satisfies MarkerNibType,
  },
  // Plain px width of the mark, same continuous slider as pencil/eraser/
  // smudge's own 'size' field (pencilLikeSchema above) — not a fixed label
  // ladder like the liner's (ADR 003's calibrated-pen-set reasoning doesn't
  // apply here). For the chisel nib that's the *broad* edge, the way a real
  // chisel marker is sold and thought of (#336 — see chiselDabShaping).
  //
  // Default raised from 10 with that same fix: 10 used to mean a 50px mark
  // (the engine multiplied it by the 5:1 nib elongation), and a marker whose
  // default lays a 10px line is a fineliner, not the tool ADR 004 describes
  // as the one for "заливку крупных форм".
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: MAX_TOOL_SIZE_PX, step: 1, format: pxFormat, scale: expScale },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    default: 50,
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 1,
  },
  // One independent color slot (own tool, not shared with pencil/color
  // pencil/liner — ADR 004 §7: "один инструмент-слот", switched via
  // ColorPicker + palette swatches, not several parallel marker slots the
  // way pencil/color pencil are #188). Defaults to a warm marker-ish orange
  // so it reads as visibly distinct from pencil's graphite and liner's
  // black at a glance — not calibrated to any real Copic swatch.
  color: {
    nameKey: 'tool.field.color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: [0.95, 0.55, 0.12],
  },
  // #278: chisel's nib angle used to be a hardcoded ~45° engine constant
  // (ADR 004 §1) — now a real user setting. `visibleWhen` hides both this
  // and `anchor` for the bullet nib, which is round enough
  // that an angle control would visibly do nothing (same reasoning
  // MARKER_BULLET_DAB_SHAPING's own tiltOrPathAngle default already relies
  // on). Step is 1 arc-minute (1/60°) — the radial dial's (#277) own
  // minimum step; the plain slider rendering (SettingField/PrecisionSlider)
  // shares the same descriptor, so it gets the same fine-grained step too,
  // just via drag/arrow-key increments instead of the dial's ring gesture.
  angle: {
    nameKey: 'tool.field.angle',
    valueType: { kind: 'numberRange', min: 0, max: 360, step: 1 / 60, format: formatDegreesMinutes, parse: degreesMinutesParse },
    uiControls: ['slider'],
    quickAccess: true,
    default: 45,
    visibleWhen: v => v.nib === 'chisel',
  },
  // #482, ADR 012 §3. Replaces two controls that between them offered these
  // frames without naming any of them: this tool's own `followStrokeDirection`
  // boolean and a *global* app setting, "lock brush angle to the canvas", which
  // existed solely to switch this same nib between canvas and screen by
  // pre-subtracting the viewport rotation up in Room. One per-tool control says
  // all of it, and `barrel` — the angle a real marker actually keeps, fixed to
  // its own body — was not expressible at all before.
  //
  // Default is `screen`, which is what shipped: the global lock defaulted to
  // off, and off meant "stay visually fixed on screen".
  anchor: {
    nameKey: 'tool.field.anchor',
    valueType: { kind: 'enumOptions', options: NIB_ANCHORS },
    optionLabelKeys: {
      canvas: 'tool.anchor.canvas',
      screen: 'tool.anchor.screen',
      barrel: 'tool.anchor.barrel',
    },
    // Chosen from the already-baked icon subset (icons/iconNames.ts) rather
    // than drawn for this: `stylus` and `screen_rotation_alt` are close to
    // exact, and `grid_on` stands for the sheet. If these ever get proper
    // artwork it belongs in toolTypeImages.ts alongside the pencil grades, the
    // way #335 did it there.
    optionIcons: {
      canvas: 'grid_on',
      screen: 'screen_rotation_alt',
      barrel: 'stylus',
    },
    uiControls: ['select'],
    default: 'screen' satisfies NibAnchor,
    visibleWhen: v => v.nib === 'chisel',
  },
})

/** (#391/#392) One glyph per transform mode. All three are hand-drawn custom
 *  icons (assets/icons/*.svg, listed in icons/iconNames.ts) rather than
 *  Material Symbols: a mode is a *gesture on a frame*, and the shipped subset
 *  has nothing that reads as "shear this rectangle" or "drag that corner
 *  alone" — the nearest Material names were a generic transform glyph and a
 *  rotate arrow, which said the same thing for two different modes. */
const TRANSFORM_MODE_ICONS = {
  free: 'free-transform',
  rotateSkew: 'skew-and-rotate',
  distort: 'distort',
} as const satisfies Record<TransformMode, IconName>

export const TOOL_SCHEMAS: Record<UiToolId, ToolSchema> = {
  // Color is a fully editable per-tool field here, same as before this
  // schema existed — today only 'pencil' has a toolbar slot wired up (#188,
  // a second independent Color Pencil slot, is a separate not-yet-built
  // issue). 'colorPencil' already has a real schema entry so #188 is purely
  // UI wiring when it lands, not a data-model change.
  pencil: pencilLikeSchema(DEFAULT_GRAPHITE_COLOR, 4),
  // Colors are [0,1] floats (WebGL convention), not 0-255 — see lib/color.ts.
  colorPencil: pencilLikeSchema([0.86, 0.16, 0.16], 4),
  charcoal: charcoalSchema(),
  liner: linerSchema(),
  marker: markerSchema(),
  brushPen: brushPenSchema(),
  watercolor: watercolorSchema(),
  eraser: {
    size: {
      nameKey: 'tool.field.size',
      valueType: { kind: 'numberRange', min: 1, max: MAX_TOOL_SIZE_PX, step: 1, format: pxFormat, scale: expScale },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 24,
    },
    opacity: {
      nameKey: 'tool.field.opacity',
      valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
      uiControls: ['slider'],
      quickAccess: true,
      default: 1,
    },
    // The eraser has its own opacity but not its own geometry — it rides
    // PENCIL_DAB_SHAPING, so its tilt response is graphite's and gets the same
    // three shapes. Offering it here rather than silently inheriting whatever
    // the pencil is set to: they are separate tools with separate settings
    // everywhere else, and a hidden coupling would be the surprise.
    tiltResponse: tiltResponseField(GRAPHITE_TILT_CURVES),
  },
  // Растушёвка/smudge (#14): redistributes graphite already on the layer,
  // so there's no color field (unlike pencil/colorPencil) — 'opacity' is
  // relabeled 'Strength' here, feeding the same Dab.opacity field
  // pencil/eraser already use (see _bakeDabOpacity's own smudge branch in
  // engine/index.ts), just interpreted as "how much of what's picked up
  // gets redeposited" rather than "how much new graphite". Default size is
  // bigger than a pencil's own (a blending stump covers more area than a
  // pencil point).
  //
  // Default strength is 10% (was 60%, #416): with the raster imprint the
  // slider scales a per-pixel lerp between the canvas and what the stump
  // carries, so it now governs how much of a mark one pass actually lifts
  // — and at 60% a single pass took off far more graphite than a real
  // blending stump does (Ilya, on the deployed build). The knob still
  // reaches its old range; this is where a stroke starts.
  smudge: {
    size: {
      nameKey: 'tool.field.size',
      valueType: { kind: 'numberRange', min: 4, max: MAX_TOOL_SIZE_PX, step: 1, format: pxFormat, scale: expScale },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 32,
    },
    opacity: {
      nameKey: 'tool.field.strength',
      valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
      uiControls: ['slider'],
      quickAccess: true,
      default: 0.1,
    },
    // Same graphite geometry as the eraser above, for the same reason.
    tiltResponse: tiltResponseField(GRAPHITE_TILT_CURVES),
  },
  eyedropper: {
    addToPalette: {
      nameKey: 'tool.field.addToPalette',
      valueType: { kind: 'boolean' },
      uiControls: ['toggle'],
      default: false,
    },
  },
  // Selection (#446, ADR 008). One tool with three ways to draw a region
  // rather than three toolbar buttons: they differ only in how the points are
  // collected, they produce the same polygon, and the toolbar is already the
  // most crowded column on a tablet.
  //
  // Not `transient`, unlike the transform tool's mode next door: which lasso
  // someone reaches for is a working habit rather than a temporary mode of one
  // edit, so it is worth remembering between rooms — and unlike a stale
  // transform mode, a remembered lasso cannot make the tool read as broken.
  selection: {
    shape: {
      nameKey: 'tool.field.selectionShape',
      valueType: { kind: 'enumOptions', options: SELECTION_SHAPES },
      optionLabelKeys: {
        rectangle: 'tool.selectionShape.rectangle',
        polygon: 'tool.selectionShape.polygon',
        freehand: 'tool.selectionShape.freehand',
      },
      // Hand-drawn glyphs (Ilya, 13.08), the same way the transform modes
      // have them: a way of drawing is a gesture, not a material, so there is
      // nothing to photograph — and the quick-panel button is preview-only.
      // Custom rather than Material because the nearest symbols there were a
      // generic dashed square, a polyline diagram and a scribble, which share
      // no visual language with each other; these three are one family, and
      // each says what the gesture *is*: a marquee, a chain of vertices, a
      // loop drawn by hand.
      optionIcons: {
        rectangle: 'rectangle-lasso',
        polygon: 'point-lasso',
        freehand: 'freehand-lasso',
      },
      uiControls: ['select'],
      quickAccess: true,
      default: 'rectangle' satisfies SelectionShapeKind,
    },
  },
  // Layer transform (#120), its three modes (#391, #392) and the proportions
  // lock (#391).
  // Both fields are `transient` — see that flag's own comment for why a
  // remembered transform mode is a trap rather than a convenience.
  transform: {
    mode: {
      nameKey: 'tool.field.mode',
      valueType: { kind: 'enumOptions', options: TRANSFORM_MODES },
      optionLabelKeys: {
        free: 'tool.transformMode.free',
        rotateSkew: 'tool.transformMode.rotateSkew',
        distort: 'tool.transformMode.distort',
      },
      // Icons, not sample strokes: a mode isn't a material, so there is
      // nothing to photograph — and the quick-panel button is preview-only,
      // so without one it would be an empty square. The popup and the panel
      // row spell the name out next to the glyph, which is where the meaning
      // actually lives.
      optionIcons: TRANSFORM_MODE_ICONS,
      uiControls: ['select'],
      quickAccess: true,
      transient: true,
      default: 'free' satisfies TransformMode,
    },
    // #132: the tablet-friendly answer to Shift-to-constrain, which a pen and
    // a finger have no way to press. It governs the four *corner* handles and
    // nothing else: on (the default, i.e. what a corner did before it could do
    // anything else) both axes share one factor, off they are measured
    // independently.
    //
    // Edge handles are outside its reach in every mode, and that is a decision
    // rather than an omission. In Free transform an edge always stretches its
    // one axis — an edge that preserved the aspect ratio would have nothing
    // left to do, and since this toggle defaults to on, letting it reach the
    // edges made plain single-axis stretch unreachable without first turning
    // something off. In Rotate & Skew an edge shears, and a shear has no
    // proportions to keep in the first place.
    keepProportions: {
      nameKey: 'tool.field.keepProportions',
      valueType: { kind: 'boolean' },
      uiControls: ['toggle'],
      quickAccess: true,
      transient: true,
      default: true,
      // Hidden in Distort (#392) rather than shown and inert: there the four
      // corners each go wherever they are dragged, so there is no second axis
      // for a ratio to be kept against, and the edges never consulted this
      // toggle in any mode. A control that provably cannot change anything is
      // worse than no control — it invites the user to try it and conclude the
      // tool is broken. Same mechanism the marker's chisel-only angle uses
      // (#278).
      visibleWhen: v => v.mode !== 'distort',
    },
  },
  // Ruler (#89, #405). Both fields are quick-access: they are the only
  // controls this tool has, so an empty quick column beside a selected ruler
  // would read as a tool that forgot to load.
  ruler: {
    // (#445) Not "show" any more. Visibility is answered by the selection
    // first — the ruler is on screen while the ruler tool is in hand — and
    // this field only decides whether it *stays* there once another tool is
    // picked up. The old `show: true` made the common case the awkward one:
    // measure a distance, go back to the pencil, and the line is still lying
    // across the drawing, still bending strokes, and the only way to remove it
    // is to reselect the ruler in order to switch it off.
    //
    // Off by default, so the ruler behaves like a straight edge laid on the
    // paper and taken off again; locking it is the deliberate act, for when the
    // line is there to be drawn along. Unlocking never clears the line — the
    // same straight edge is back the moment the ruler is selected again.
    //
    // Whatever is invisible is also inert: it does not snap and cannot be
    // dragged (see Room's ruler engine sync and its pointer catcher), because
    // a line quietly bending strokes with nothing on screen to explain it is a
    // trap rather than a feature.
    lock: {
      nameKey: 'tool.field.lockRuler',
      valueType: { kind: 'boolean' },
      uiControls: ['toggle'],
      quickAccess: true,
      default: false,
    },
    // Snapping used to be unconditional: any placed ruler bent every stroke
    // that came near it (engine.setRuler → rulerSnap.ts). That makes the ruler
    // unusable as a plain measuring/reference line, which is half of what a
    // straight edge on a drawing is for — so it is a setting now, defaulting
    // to on because guiding strokes is still the primary use.
    snap: {
      nameKey: 'tool.field.rulerSnap',
      valueType: { kind: 'boolean' },
      uiControls: ['toggle'],
      quickAccess: true,
      default: true,
    },
  },
  // Construction grid (#89, #405). The toolbar button selects the grid *tool*
  // now rather than toggling the overlay; visibility is this setting, which is
  // what lets the grid stay on screen under every other tool — the thing a
  // construction grid is for.
  //
  // One field is the whole schema on purpose: the grid has no gesture of its
  // own yet, so "selected" currently means nothing more than "its settings are
  // the ones on screen, and nothing paints". That is a deliberate interim
  // state, not an oversight — moving and rotating the grid by gesture is #406,
  // and that is what will give the selection something to do.
  grid: {
    // Off by default. It was on in #405 so that picking up the grid tool did
    // something observable — the grid has no gesture of its own until #406, so
    // an off default made its first press look broken. But this setting is the
    // overlay's visibility under *every* tool, not just its own, so an on
    // default meant a construction grid across the paper from the first stroke
    // of every room, for every drawing that never asked for one. A tool whose
    // first press only lights the quick toggle is the smaller cost.
    show: {
      nameKey: 'tool.field.showGrid',
      valueType: { kind: 'boolean' },
      uiControls: ['toggle'],
      quickAccess: true,
      default: false,
    },
  },
  // Hand (#443). The only empty schema in the registry, and it stays empty:
  // panning has nothing to configure. It is here because everything selectable
  // must be a UiToolId (Room's `settingsToolId` is the selection, unwidened),
  // not because the hand is waiting for fields.
  //
  // The visible consequence is that the quick-settings column empties while
  // the hand is in hand, and the tool-settings tab shows `room.noToolSettings`.
  // That is the honest answer rather than a gap: before #443 the hand was a
  // modifier laid over a drawing tool, so the column kept showing *that* tool's
  // fields — settings for something the next press would not touch.
  hand: {},
  // Fill (#453, ADR 010). Four knobs, and each exists because a bucket on a
  // *drawn* boundary — as opposed to a vector or a hard-edged digital one —
  // fails in a specific way without it.
  fill: {
    color: {
      nameKey: 'tool.field.color',
      valueType: { kind: 'color' },
      uiControls: ['swatch'],
      quickAccess: true,
      default: [0.85, 0.85, 0.85],
    },
    // Which pixels the boundary is read from. Quick-access and deliberately
    // first among the non-colour fields: it is the one setting that changes
    // what the same tap *means*, and the lineart-above/colour-below workflow
    // it exists for is the main reason to reach for a bucket at all.
    //
    // A toggle here and a *named mode* on the wire (`FillSourceMode`), which
    // is a deliberate mismatch rather than an oversight. On screen this is one
    // binary capability — the same shape as the grid's `show` — and a two-item
    // picker would need two glyphs standing for "all visible layers" and "this
    // layer only", which no icon says without a caption. In the operation log,
    // which is permanent and read as a dataset (#375), a boolean named after
    // today's two choices is the thing that ages badly: "sample everything
    // including hidden layers" or "sample the layer below" are ordinary paint-
    // app modes, and each would arrive as a second boolean contradicting the
    // first. Mapped in one place, where the operation is built.
    allLayers: {
      nameKey: 'tool.field.fillSource',
      valueType: { kind: 'boolean' },
      uiControls: ['toggle'],
      quickAccess: true,
      default: true,
    },
    // 5%, and low on purpose (Ilya, 13.08, after filling a real sketch). The
    // number says how far from the tapped pixel still counts as the same area,
    // so a *high* tolerance is what leaks: a pencil line drawn at light
    // pressure lays graphite at maybe a tenth of full coverage, which sits
    // about 27/255 away from blank paper — inside the 15% this used to
    // default to, and the fill ran straight through the line. Liner ink is
    // opaque and never showed it.
    //
    // Almost nothing argues for a high default in the other direction, either.
    // Blank paper is *exactly* uniform in a layer buffer (the grain lives in
    // the display pass, not in the pixels), so there is no noise for a tight
    // threshold to trip over — tolerance only really earns its range when
    // filling over colour that is already down.
    tolerance: {
      nameKey: 'tool.field.tolerance',
      valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat, parse: percentParse },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 0.05,
    },
    // A graphite line is laid through the paper's grain and is full of holes
    // (see DAB_FRAG's paper modulation), so an outline that looks closed
    // usually is not. Without this the fill escapes through a 1px hole and
    // covers the page — which is why it defaults to on rather than to zero.
    gapClose: {
      nameKey: 'tool.field.gapClose',
      valueType: { kind: 'numberRange', min: 0, max: 3, step: 1, format: pxFormat },
      uiControls: ['slider', 'input'],
      default: 1,
    },
    // Slides the paint under the line it stopped at. Without it every filled
    // shape wears a pale outline where the antialiased edge of the ink and the
    // antialiased edge of the fill fail to meet — the single most visible
    // difference between a bucket that looks finished and one that does not.
    expand: {
      nameKey: 'tool.field.fillExpand',
      valueType: { kind: 'numberRange', min: 0, max: 3, step: 1, format: pxFormat },
      uiControls: ['slider', 'input'],
      default: 1,
    },
  },
  // Annotation tools (#509/#510, эпик #87). Two knobs each and no more: an
  // annotation is a remark, not a mark — there is no pressure, no tilt, no
  // paper and no preset to choose, which is exactly what lets a finger draw
  // one. Colour is `[r, g, b]` here like every other tool's, so the existing
  // swatch and palette work unchanged, and is converted to the hex the
  // operation carries at the one place the operation is built (see the
  // annotation contract's note on why the two forms differ).
  annotateText: {
    color: {
      nameKey: 'tool.field.color',
      valueType: { kind: 'color' },
      uiControls: ['swatch'],
      quickAccess: true,
      // Red by default, and this is the one place a tool's default colour is
      // chosen to *not* look like the drawing: a remark that reads as graphite
      // is a remark the student mistakes for their own line.
      default: [0.9, 0.28, 0.30],
    },
    // Font size in canvas units, so a note keeps its size relative to the
    // drawing rather than to the screen — the same rule the note's position
    // follows. The range starts well above a UI font size because canvas units
    // are not screen ones: on an A3 sheet, 16 of them is a speck.
    size: {
      nameKey: 'tool.field.size',
      valueType: { kind: 'numberRange', min: 12, max: 200, step: 1, format: pxFormat, scale: expScale },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 48,
    },
  },
  annotatePen: {
    color: {
      nameKey: 'tool.field.color',
      valueType: { kind: 'color' },
      uiControls: ['swatch'],
      quickAccess: true,
      default: [0.9, 0.28, 0.30],
    },
    size: {
      nameKey: 'tool.field.size',
      valueType: { kind: 'numberRange', min: 1, max: 60, step: 1, format: pxFormat, scale: expScale },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 8,
    },
  },
}

export type ToolSettingsValue = Record<string, SettingDescriptor['default']>
export type ToolSettingsMap = Record<UiToolId, ToolSettingsValue>

/** Bounds of a tool's continuous px `size` field, or null for a tool whose
 *  size isn't a plain number (liner's mm ladder, ADR 003) or that has no size
 *  at all (ruler/grid/…). The '['/']' size hotkeys clamp through this instead
 *  of repeating literals that drift from the schema — they used to hardcode
 *  `Math.min(120, …)`/`Math.max(1, …)`, which both survived past the smudge
 *  tool getting its own 4..160 range and would have survived #336's move to
 *  MAX_TOOL_SIZE_PX too. */
export function toolSizeRange(toolId: UiToolId): { min: number; max: number } | null {
  const valueType = TOOL_SCHEMAS[toolId].size?.valueType
  return valueType?.kind === 'numberRange' ? { min: valueType.min, max: valueType.max } : null
}

/** The hardness ladder of a tool that has one — pencil and color pencil, both
 *  built from `pencilLikeSchema` — or null for every other tool. Read off the
 *  schema for the same reason `toolSizeRange` is (#440): the grade hotkeys
 *  step this list, and a hardcoded copy of PENCIL_GRADES here would be a
 *  second place to update when the ladder or its owners change.
 *
 *  Charcoal is deliberately not included even though it also picks a
 *  material: its field is `type` (vine/willow/compressed), a set of three
 *  different sticks rather than a run from hard to soft, so "one notch
 *  harder" has nothing to mean there. */
export function toolGradeOptions(toolId: UiToolId): readonly string[] | null {
  const valueType = TOOL_SCHEMAS[toolId].grade?.valueType
  return valueType?.kind === 'enumOptions' ? valueType.options : null
}

// ── "has a color" as its own tool capability ────────────────────────────────
// Deliberately NOT the same concept as toolSlice's PrimaryDrawingTool, even
// though today the two lists happen to hold the same members: "lays ink /
// is something to return to when the eraser is toggled off" and "owns an
// editable color field the eyedropper/ColorPicker/palette can write into"
// are different questions, and they come apart as soon as either side grows
// — colorPencil (#188) is already color-capable here while not being a
// selectable drawing tool yet, and a future fill/text tool would be
// color-capable without being a stroke tool at all (just as eraser/smudge
// are stroke tools with no color).
//
// The list is written out rather than derived from TOOL_SCHEMAS at runtime
// so it carries a real union type; `toolSchemas.test.ts` asserts it matches
// exactly the set of schemas that actually declare a `color` field, so the
// two can't silently drift when a tool is added.
export const COLOR_CAPABLE_TOOLS = [
  'pencil', 'colorPencil', 'charcoal', 'liner', 'marker', 'brushPen', 'watercolor', 'fill',
  // (#509/#510) The annotation tools carry a colour like any other, and being
  // here is what gives them the swatch, the palette and the eyedropper for
  // free. That the colour ends up on the wire as hex rather than as a triple
  // is a fact about the annotation operation, not about the tool.
  'annotateText', 'annotatePen',
] as const satisfies readonly UiToolId[]

export type ColorCapableTool = (typeof COLOR_CAPABLE_TOOLS)[number]

export function isColorCapableTool(toolId: UiToolId): toolId is ColorCapableTool {
  return (COLOR_CAPABLE_TOOLS as readonly UiToolId[]).includes(toolId)
}

/** The single place the `color` field's stored value gets narrowed back to an
 *  RGB triple — every consumer (engine sync, ColorPicker, eyedropper,
 *  palette) goes through here instead of casting `ToolSettingsValue`'s union
 *  at its own call site. Takes a ColorCapableTool, so "does this tool even
 *  have a color?" is answered by the type system (or `isColorCapableTool`),
 *  never by a null check further down. */
export function getToolColor(settings: ToolSettingsMap, toolId: ColorCapableTool): [number, number, number] {
  const value = settings[toolId].color
  return Array.isArray(value) ? value : (TOOL_SCHEMAS[toolId].color.default as [number, number, number])
}

export function defaultToolSettings(): ToolSettingsMap {
  const map = {} as ToolSettingsMap
  for (const toolId of Object.keys(TOOL_SCHEMAS) as UiToolId[]) {
    const values: ToolSettingsValue = {}
    for (const [key, descriptor] of Object.entries(TOOL_SCHEMAS[toolId])) {
      values[key] = descriptor.default
    }
    map[toolId] = values
  }
  return map
}

/** Validates one stored field value against its descriptor — same spirit as
 *  the old toolSettings.ts's clampToolConfig, generalized to every
 *  valueType.kind instead of hand-written per field, so a corrupted/
 *  hand-edited localStorage value (or one from a schema version that no
 *  longer matches, e.g. an enum option that got removed) falls back to the
 *  descriptor's own default rather than reaching the engine unchecked. */
function coerceSettingValue(descriptor: SettingDescriptor, value: unknown): SettingDescriptor['default'] {
  const { valueType } = descriptor
  if (valueType.kind === 'numberRange') {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(valueType.max, Math.max(valueType.min, value))
      : descriptor.default
  }
  if (valueType.kind === 'boolean') {
    return typeof value === 'boolean' ? value : descriptor.default
  }
  if (valueType.kind === 'enumOptions') {
    return typeof value === 'string' && (valueType.options as readonly string[]).includes(value)
      ? value : descriptor.default
  }
  // color — [0,1] floats (WebGL convention, see lib/color.ts), clamped same
  // as a numberRange field would be, not just type-checked.
  return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number')
    ? (value.map(n => Math.min(1, Math.max(0, n))) as [number, number, number])
    : descriptor.default
}

interface StoredToolSettings {
  toolSettings?: Partial<Record<UiToolId, Partial<Record<string, unknown>>>>
}

/** Loads this room's last-used tool settings, validated field-by-field
 *  against TOOL_SCHEMAS and falling back to defaults for anything missing/
 *  invalid/added-since-last-visit — never a blind trust of stored JSON.
 *  A `transient` field (#391) ignores whatever is stored and starts at its
 *  default, so a value written by an older build (or by a field that only
 *  became transient later) can't come back either. */
export function loadToolSettings(storage: KeyValueStorage, roomId: string): ToolSettingsMap {
  const stored = readRoomSettings<StoredToolSettings>(storage, roomId)?.toolSettings
  const map = {} as ToolSettingsMap
  for (const toolId of Object.keys(TOOL_SCHEMAS) as UiToolId[]) {
    const values: ToolSettingsValue = {}
    for (const [key, descriptor] of Object.entries(TOOL_SCHEMAS[toolId])) {
      const storedValue = descriptor.transient ? undefined : stored?.[toolId]?.[key]
      values[key] = storedValue === undefined ? descriptor.default : coerceSettingValue(descriptor, storedValue)
    }
    map[toolId] = values
  }
  // #482: one targeted legacy read, because the generic loop above can only
  // fall back to a default and that would silently drop a choice someone made.
  // The marker's frame used to be spelled by two booleans — this tool's
  // `followStrokeDirection` and the global "lock brush angle to the canvas".
  //
  // `followStrokeDirection: true` used to select the `stroke` frame, which was
  // withdrawn (see dabShaping.ts's NIB_ANCHORS). It is deliberately not
  // remapped onto a surviving frame: nothing else means what it meant, and the
  // generic loop above already coerces the dead value to the default. The read
  // stays only to document that this is a choice and not an oversight.
  const legacy = stored?.marker as Record<string, unknown> | undefined
  if (legacy && legacy.followStrokeDirection === true) { /* withdrawn: falls back to the default */ }
  else if (legacyGlobalAngleLock(storage)) map.marker.anchor = 'canvas'
  return map
}

/** The removed app-level toggle, read once at load so a room that had it on
 *  keeps behaving the way it did. Nothing writes this key any more. */
function legacyGlobalAngleLock(storage: KeyValueStorage): boolean {
  try {
    return storage.getItem('al_lock_brush_angle') === 'true'
  } catch {
    return false
  }
}

/** Writes every field back except the `transient` ones (#391) — those are
 *  dropped here as well as ignored on load, so nothing stale is left sitting
 *  in localStorage waiting for the flag to be removed. */
export function saveToolSettings(storage: KeyValueStorage, roomId: string, settings: ToolSettingsMap): void {
  const persisted = {} as ToolSettingsMap
  for (const toolId of Object.keys(TOOL_SCHEMAS) as UiToolId[]) {
    const values: ToolSettingsValue = {}
    for (const [key, descriptor] of Object.entries(TOOL_SCHEMAS[toolId])) {
      if (descriptor.transient) continue
      values[key] = settings[toolId][key]
    }
    persisted[toolId] = values
  }
  writeRoomSettings(storage, roomId, { toolSettings: persisted })
}
