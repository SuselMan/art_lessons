import { PENCIL_GRADES, DEFAULT_GRAPHITE_COLOR, LINER_SIZES_MM, type PencilGradeName, type LinerSizeMm } from '../../engine'
import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from '../../lib/roomStorage'

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
  | 'pencil' | 'colorPencil' | 'liner' | 'marker' | 'eraser' | 'smudge' | 'eyedropper' | 'ruler' | 'transform' | 'grid'

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
  name: string
  valueType: SettingValueType
  /** Which control(s) this field can render as; first is the default. */
  uiControls: readonly SettingUiControl[]
  /** Also rendered inline in the left toolbar, not just the settings tab. */
  quickAccess?: boolean
  default: number | boolean | [number, number, number] | string
}

export type ToolSchema = Record<string, SettingDescriptor>

const percentFormat = (v: number) => `${Math.round(v * 100)}%`
const pxFormat = (v: number) => `${v}px`

const pencilLikeSchema = (defaultColor: [number, number, number], defaultSize: number): ToolSchema => ({
  grade: {
    name: 'Grade',
    valueType: { kind: 'enumOptions', options: PENCIL_GRADES },
    uiControls: ['slider'],
    quickAccess: true,
    default: 'HB' satisfies PencilGradeName,
  },
  size: {
    name: 'Size',
    valueType: { kind: 'numberRange', min: 1, max: 120, step: 1, format: pxFormat },
    uiControls: ['slider', 'input'],
    quickAccess: true,
    default: defaultSize,
  },
  opacity: {
    name: 'Opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
    uiControls: ['slider'],
    quickAccess: true,
    default: 1,
  },
  color: {
    name: 'Color',
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
    name: 'Size',
    valueType: { kind: 'enumOptions', options: LINER_SIZE_LABELS },
    uiControls: ['slider'],
    quickAccess: true,
    default: String(0.3 satisfies LinerSizeMm),
  },
  opacity: {
    name: 'Opacity',
    valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
    uiControls: ['slider'],
    quickAccess: true,
    default: 1,
  },
  // ADR 003: "чёрная пигментная ручка" is the identity default, but v1
  // allows arbitrary color (same as Color pencil) rather than locking it —
  // decided explicitly, not a placeholder.
  color: {
    name: 'Color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: [0, 0, 0],
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

// Same fixed-ladder identity choice as the liner (see LINER_SIZE_LABELS'
// own comment) — real Copic-style marker nibs also come in a handful of
// discrete barrel widths, not one continuously-adjustable size. Placeholder
// mm-ish labels/px values, not yet calibrated against a real device or the
// eventual chisel aspect-ratio math (ADR 004 §1) — exact numbers are
// explicitly not load-bearing for this UI pass.
export const MARKER_SIZE_LABELS = ['2', '4', '6', '9', '12']
const MARKER_SIZE_PX: Record<string, number> = { '2': 10, '4': 18, '6': 26, '9': 36, '12': 46 }

export function markerSizeToPx(label: string): number {
  return MARKER_SIZE_PX[label] ?? MARKER_SIZE_PX[MARKER_SIZE_LABELS[0]]
}

/** Steps the marker's size one notch up/down its fixed ladder — same
 *  clamp-don't-wrap behavior as stepLinerSize, used by the same '['/']'
 *  size hotkeys. */
export function stepMarkerSize(current: string, direction: 1 | -1): string {
  const idx = MARKER_SIZE_LABELS.indexOf(current)
  const nextIdx = Math.min(MARKER_SIZE_LABELS.length - 1, Math.max(0, (idx === -1 ? 0 : idx) + direction))
  return MARKER_SIZE_LABELS[nextIdx]
}

const markerSchema = (): ToolSchema => ({
  // Bullet/chisel (ADR 004 §1) — rendered via the same enumOptions control
  // path PENCIL_GRADES/LINER_SIZE_LABELS already use (SettingField switches
  // purely on valueType.kind), not a bespoke toggle. Defaults to 'bullet':
  // the rounder, tilt/angle-independent nib is the one that already
  // resembles what the engine's current HB-preset fallback (see this
  // schema's own doc comment above) actually renders, before chisel's fixed-
  // angle hook (#249-251) exists to make chisel look like chisel.
  nib: {
    name: 'Nib',
    valueType: { kind: 'enumOptions', options: MARKER_NIB_TYPES },
    uiControls: ['slider'],
    quickAccess: true,
    default: 'bullet' satisfies MarkerNibType,
  },
  size: {
    name: 'Size',
    valueType: { kind: 'enumOptions', options: MARKER_SIZE_LABELS },
    uiControls: ['slider'],
    quickAccess: true,
    default: '6',
  },
  opacity: {
    name: 'Opacity',
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
    name: 'Color',
    valueType: { kind: 'color' },
    uiControls: ['swatch'],
    quickAccess: true,
    default: [0.95, 0.55, 0.12],
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
  liner: linerSchema(),
  marker: markerSchema(),
  eraser: {
    size: {
      name: 'Size',
      valueType: { kind: 'numberRange', min: 1, max: 120, step: 1, format: pxFormat },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 24,
    },
    opacity: {
      name: 'Opacity',
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
      name: 'Size',
      valueType: { kind: 'numberRange', min: 4, max: 160, step: 1, format: pxFormat },
      uiControls: ['slider', 'input'],
      quickAccess: true,
      default: 32,
    },
    opacity: {
      name: 'Strength',
      valueType: { kind: 'numberRange', min: 0, max: 1, step: 0.01, format: percentFormat },
      uiControls: ['slider'],
      quickAccess: true,
      default: 0.6,
    },
  },
  eyedropper: {
    addToPalette: {
      name: 'Add to palette on pick',
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
