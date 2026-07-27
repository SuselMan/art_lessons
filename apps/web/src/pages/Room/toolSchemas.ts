import {
  PENCIL_GRADES, DEFAULT_GRAPHITE_COLOR, LINER_SIZES_MM, CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE,
  type PencilGradeName, type LinerSizeMm, type CharcoalType,
} from '../../engine'
import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../lib/roomStorage'
import type { TranslationKey } from '../../i18n'

// Unified, extensible tool-settings registry (#196). Replaces the old
// hand-typed `RoomToolSettings{pencil,eraser}` (toolSettings.ts) — adding a
// new tool or a new setting to an existing tool is a data change here, not a
// new interface + a new save/load function + a new settings component.
//
// UI-level tool identity, deliberately distinct from the shared `ToolType`
// ('pencil'|'eraser'|'smudge' in @art-lessons/shared) — once Color Pencil
// ships it's a separate toolbar entry with its own remembered settings, but
// still emits `tool: 'pencil'` at the Operation/protocol level. Mapping one
// to the other happens only at the moment of emitting a stroke, not here.
export type UiToolId =
  | 'pencil' | 'colorPencil' | 'charcoal' | 'liner' | 'marker'
  | 'eraser' | 'smudge' | 'eyedropper' | 'ruler' | 'transform' | 'grid'

export type SettingValueType =
  | { kind: 'numberRange'; min: number; max: number; step: number; format?: (v: number) => string }
  | { kind: 'boolean' }
  | { kind: 'color' }
  | { kind: 'enumOptions'; options: readonly string[] }

export type SettingUiControl = 'slider' | 'input' | 'toggle' | 'swatch'

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
  /** Which control(s) this field can render as; first is the default. */
  uiControls: readonly SettingUiControl[]
  /** Also rendered inline in the left toolbar, not just the settings tab. */
  quickAccess?: boolean
  default: number | boolean | [number, number, number] | string
  /** #278: gates rendering on this tool's *other* current field values (e.g.
   *  marker's chisel-only `angle`/`followStrokeDirection` — bullet is round,
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

const pencilLikeSchema = (defaultColor: [number, number, number], defaultSize: number): ToolSchema => ({
  grade: {
    nameKey: 'tool.field.grade',
    valueType: { kind: 'enumOptions', options: PENCIL_GRADES },
    uiControls: ['slider'],
    quickAccess: true,
    default: 'HB' satisfies PencilGradeName,
  },
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: 120, step: 1, format: pxFormat },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    default: defaultSize,
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
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

/** Steps the liner's size one notch up/down its fixed ladder (ADR 003) —
 *  used by the '['/']' size hotkeys, which otherwise assume a continuous
 *  numeric 'size' field (see Room/index.tsx's keydown handler). Clamps at
 *  either end rather than wrapping. */
export function stepLinerSize(current: string, direction: 1 | -1): string {
  const idx = LINER_SIZE_LABELS.indexOf(current)
  const nextIdx = Math.min(LINER_SIZE_LABELS.length - 1, Math.max(0, (idx === -1 ? 0 : idx) + direction))
  return LINER_SIZE_LABELS[nextIdx]
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
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
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

// Charcoal (#304, ADR 005 §1): the three real charcoal types ride the same
// enumOptions control PENCIL_GRADES already uses — one toolbar slot with a
// type selector, deliberately not three separate tools (see the ADR for why
// three toolbar buttons for one material would fight the manifesto, and why
// hiding the choice in a settings tab would be equally wrong).
const charcoalSchema = (): ToolSchema => ({
  type: {
    nameKey: 'tool.field.type',
    valueType: { kind: 'enumOptions', options: CHARCOAL_TYPES },
    optionLabelKeys: {
      vine: 'tool.charcoalType.vine',
      willow: 'tool.charcoalType.willow',
      compressed: 'tool.charcoalType.compressed',
    },
    uiControls: ['slider'],
    quickAccess: true,
    default: DEFAULT_CHARCOAL_TYPE satisfies CharcoalType,
  },
  // Default size well above pencil's 4px: a charcoal stick's contact patch is
  // broad even at a light touch (the same physical fact CHARCOAL_DAB_SHAPING's
  // own raised width floor encodes), and the upper bound matches every other
  // px-slider tool's.
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: 120, step: 1, format: pxFormat },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    default: 18,
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
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
    uiControls: ['slider'],
    quickAccess: true,
    default: 'chisel' satisfies MarkerNibType,
  },
  // Plain px diameter, same continuous slider as pencil/eraser/smudge's own
  // 'size' field (pencilLikeSchema above) — not a fixed label ladder like
  // the liner's (ADR 003's calibrated-pen-set reasoning doesn't apply here).
  size: {
    nameKey: 'tool.field.size',
    valueType: { kind: 'numberRange', min: 1, max: 120, step: 1, format: pxFormat },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    default: 10,
  },
  opacity: {
    nameKey: 'tool.field.opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
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
  // and `followStrokeDirection` for the bullet nib, which is round enough
  // that an angle control would visibly do nothing (same reasoning
  // MARKER_BULLET_DAB_SHAPING's own tiltOrPathAngle default already relies
  // on). Step is 1 arc-minute (1/60°) — the radial dial's (#277) own
  // minimum step; the plain slider rendering (SettingField/PrecisionSlider)
  // shares the same descriptor, so it gets the same fine-grained step too,
  // just via drag/arrow-key increments instead of the dial's ring gesture.
  angle: {
    nameKey: 'tool.field.angle',
    valueType: { kind: 'numberRange', min: 0, max: 360, step: 1 / 60, format: formatDegreesMinutes },
    uiControls: ['slider'],
    quickAccess: true,
    default: 45,
    visibleWhen: v => v.nib === 'chisel',
  },
  // Off by default: preserves ADR 004's original "angle is a fixed property
  // of the tool, not the stroke" behavior unless explicitly turned on.
  followStrokeDirection: {
    nameKey: 'tool.field.followStroke',
    valueType: { kind: 'boolean' },
    uiControls: ['toggle'],
    default: false,
    visibleWhen: v => v.nib === 'chisel',
  },
})

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
  eraser: {
    size: {
      nameKey: 'tool.field.size',
      valueType: { kind: 'numberRange', min: 1, max: 120, step: 1, format: pxFormat },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 24,
    },
    opacity: {
      nameKey: 'tool.field.opacity',
      valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
      uiControls: ['slider'],
      quickAccess: true,
      default: 1,
    },
  },
  // Растушёвка/smudge (#14): redistributes graphite already on the layer,
  // so there's no color field (unlike pencil/colorPencil) — 'opacity' is
  // relabeled 'Strength' here, feeding the same Dab.opacity field
  // pencil/eraser already use (see _bakeDabOpacity's own smudge branch in
  // engine/index.ts), just interpreted as "how much of what's picked up
  // gets redeposited" rather than "how much new graphite". Default size is
  // bigger than a pencil's own (a blending stump covers more area than a
  // pencil point); default strength held below 1 so a light stroke reads
  // as a gradual blend rather than an instant full-opacity smear.
  smudge: {
    size: {
      nameKey: 'tool.field.size',
      valueType: { kind: 'numberRange', min: 4, max: 160, step: 1, format: pxFormat },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 32,
    },
    opacity: {
      nameKey: 'tool.field.strength',
      valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
      uiControls: ['slider'],
      quickAccess: true,
      default: 0.6,
    },
  },
  eyedropper: {
    addToPalette: {
      nameKey: 'tool.field.addToPalette',
      valueType: { kind: 'boolean' },
      uiControls: ['toggle'],
      default: false,
    },
  },
  // Honest empty schemas — these tools have no settings yet, not stubs
  // waiting to be filled with guessed-at fields.
  ruler: {},
  transform: {},
  grid: {},
}

export type ToolSettingsValue = Record<string, SettingDescriptor['default']>
export type ToolSettingsMap = Record<UiToolId, ToolSettingsValue>

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
export const COLOR_CAPABLE_TOOLS = ['pencil', 'colorPencil', 'charcoal', 'liner', 'marker'] as const satisfies readonly UiToolId[]

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
 *  invalid/added-since-last-visit — never a blind trust of stored JSON. */
export function loadToolSettings(storage: KeyValueStorage, roomId: string): ToolSettingsMap {
  const stored = readRoomSettings<StoredToolSettings>(storage, roomId)?.toolSettings
  const map = {} as ToolSettingsMap
  for (const toolId of Object.keys(TOOL_SCHEMAS) as UiToolId[]) {
    const values: ToolSettingsValue = {}
    for (const [key, descriptor] of Object.entries(TOOL_SCHEMAS[toolId])) {
      const storedValue = stored?.[toolId]?.[key]
      values[key] = storedValue === undefined ? descriptor.default : coerceSettingValue(descriptor, storedValue)
    }
    map[toolId] = values
  }
  return map
}

export function saveToolSettings(storage: KeyValueStorage, roomId: string, settings: ToolSettingsMap): void {
  writeRoomSettings(storage, roomId, { toolSettings: settings })
}
