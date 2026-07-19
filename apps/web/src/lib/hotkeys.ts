import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from './roomStorage'

// Single source of truth for desktop keyboard shortcuts (#174): one registry
// drives keydown handling, the hotkey hint shown in each tool's tooltip, and
// the rebind UI in Settings — replacing what used to be a flat if-chain in
// Room/index.tsx's keydown handler plus a handful of independently
// hand-typed "Ctrl+Z"-style strings in `title` attributes, free to drift out
// of sync with the actual handler and with each other.
//
// Desktop-only by design: touch devices have no keyboard, so hotkeys are
// never wired up there in the first place (see #173, "Раздельные интерфейсы
// для планшета и ПК").
//
// Stored per-browser, not per-room (unlike toolSettings.ts/panelPosition.ts)
// — a rebound key is a habit of the person typing, not a property of the
// drawing they're working on.

export interface HotkeyBinding {
  /** KeyboardEvent.key of the *unshifted* key, e.g. 'z', 'e', '[', ']', '1'.
   *  Shifted symbols (e.g. Shift+[ producing '{') are normalized back to
   *  their base key by captureHotkeyBinding/matchesHotkey below, so 'shift'
   *  is the only place that information lives — matches this project's
   *  existing "Shift+[" style tooltip wording. */
  key: string
  /** Ctrl on Windows/Linux, Cmd on Mac — treated as one modifier. */
  mod: boolean
  shift: boolean
}

export interface HotkeyActionDef {
  id: string
  label: string
  default: HotkeyBinding
}

export const HOTKEY_ACTIONS: readonly HotkeyActionDef[] = [
  { id: 'undo', label: 'Undo', default: { key: 'z', mod: true, shift: false } },
  { id: 'redo', label: 'Redo', default: { key: 'z', mod: true, shift: true } },
  { id: 'toggleEraser', label: 'Toggle eraser / pencil', default: { key: 'e', mod: false, shift: false } },
  { id: 'resetRotation', label: 'Reset rotation to 0°', default: { key: 'r', mod: false, shift: false } },
  { id: 'decreaseSize', label: 'Decrease brush size', default: { key: '[', mod: false, shift: false } },
  { id: 'increaseSize', label: 'Increase brush size', default: { key: ']', mod: false, shift: false } },
  { id: 'rotateCCW', label: 'Rotate view −15°', default: { key: '[', mod: false, shift: true } },
  { id: 'rotateCW', label: 'Rotate view +15°', default: { key: ']', mod: false, shift: true } },
  { id: 'gradeH', label: 'Pencil grade: H (quick pick)', default: { key: '1', mod: false, shift: false } },
  { id: 'gradeHB', label: 'Pencil grade: HB (quick pick)', default: { key: '2', mod: false, shift: false } },
  { id: 'grade2B', label: 'Pencil grade: 2B (quick pick)', default: { key: '3', mod: false, shift: false } },
  { id: 'grade4B', label: 'Pencil grade: 4B (quick pick)', default: { key: '4', mod: false, shift: false } },
  { id: 'grade6B', label: 'Pencil grade: 6B (quick pick)', default: { key: '5', mod: false, shift: false } },
]

// roomStorage.ts's key format is `al_room_settings:<roomId>` — reusing it
// under one fixed, non-room "scope" string gets hotkeys the same versioned
// envelope + corrupt-data fallback handling as every per-room setting, for
// a value that isn't actually per-room. `readRoomSettings`/`writeRoomSettings`
// don't care what the scope string means, only that it's stable.
const GLOBAL_SCOPE = 'global'

interface StoredHotkeys {
  hotkeys: Record<string, HotkeyBinding>
}

function isValidBinding(v: unknown): v is HotkeyBinding {
  return !!v && typeof v === 'object'
    && typeof (v as HotkeyBinding).key === 'string' && (v as HotkeyBinding).key.length > 0
    && typeof (v as HotkeyBinding).mod === 'boolean'
    && typeof (v as HotkeyBinding).shift === 'boolean'
}

export function bindingsEqual(a: HotkeyBinding, b: HotkeyBinding): boolean {
  return a.key.toLowerCase() === b.key.toLowerCase() && a.mod === b.mod && a.shift === b.shift
}

/** Every action's current binding — a stored override where present and
 *  valid, the action's own default otherwise. Never throws on missing or
 *  corrupt storage (same fallback-to-default spirit as roomStorage.ts). */
export function getHotkeyBindings(storage: KeyValueStorage): Record<string, HotkeyBinding> {
  const bindings: Record<string, HotkeyBinding> = {}
  for (const action of HOTKEY_ACTIONS) bindings[action.id] = action.default

  const stored = readRoomSettings<StoredHotkeys>(storage, GLOBAL_SCOPE)?.hotkeys
  if (!stored) return bindings
  for (const action of HOTKEY_ACTIONS) {
    const candidate = stored[action.id]
    if (isValidBinding(candidate)) bindings[action.id] = candidate
  }
  return bindings
}

export function setHotkeyBindings(storage: KeyValueStorage, bindings: Record<string, HotkeyBinding>): void {
  writeRoomSettings<StoredHotkeys>(storage, GLOBAL_SCOPE, { hotkeys: bindings })
}

// Shifted punctuation this app currently binds hotkeys to, mapped back to
// the physical (unshifted) key that produces it on a standard US layout —
// so a binding's `key` field always names the physical key, and `shift` is
// the only place "was shift held" lives. Extend if a future default binds
// another shifted symbol.
const SHIFTED_SYMBOL_TO_BASE: Record<string, string> = { '{': '[', '}': ']' }

function normalizeKey(rawKey: string, shiftHeld: boolean): string {
  return shiftHeld && SHIFTED_SYMBOL_TO_BASE[rawKey] ? SHIFTED_SYMBOL_TO_BASE[rawKey] : rawKey
}

/** True if `e` matches `binding`. Key compared case-insensitively (some
 *  platforms report an uppercase KeyboardEvent.key for Ctrl+Shift combos,
 *  others don't) after normalizing away shifted-symbol substitution;
 *  modifiers compared exactly. */
export function matchesHotkey(e: KeyboardEvent, binding: HotkeyBinding): boolean {
  const key = normalizeKey(e.key, e.shiftKey)
  return key.toLowerCase() === binding.key.toLowerCase()
    && (e.ctrlKey || e.metaKey) === binding.mod
    && e.shiftKey === binding.shift
}

/** Captures a binding from a live keydown event, for the rebind UI. A bare
 *  modifier keypress (Ctrl/Shift/Meta/Alt alone, before the real key lands)
 *  never resolves to a binding — the caller should keep listening. */
export function captureHotkeyBinding(e: KeyboardEvent): HotkeyBinding | null {
  if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift' || e.key === 'Alt') return null
  return { key: normalizeKey(e.key, e.shiftKey), mod: e.ctrlKey || e.metaKey, shift: e.shiftKey }
}

/** Human-readable label, e.g. "Ctrl+Shift+Z", "E", "Shift+[". Always shows
 *  "Ctrl" (never "⌘") even on Mac, matching this project's pre-existing
 *  tooltip convention — both Ctrl and Cmd are accepted at match time
 *  regardless of what the label says. */
export function formatHotkeyLabel(binding: HotkeyBinding): string {
  const parts: string[] = []
  if (binding.mod) parts.push('Ctrl')
  if (binding.shift) parts.push('Shift')
  parts.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key)
  return parts.join('+')
}

/** The other action already bound to `binding`, if any — used by the rebind
 *  UI to reject a collision instead of silently making two actions share a
 *  key. `bindings` is the caller's in-progress draft, not necessarily what's
 *  currently saved, so a conflict against an as-yet-unsaved rebind of a
 *  third action is caught too. */
export function findHotkeyConflict(
  actionId: string,
  binding: HotkeyBinding,
  bindings: Record<string, HotkeyBinding>,
): HotkeyActionDef | null {
  for (const action of HOTKEY_ACTIONS) {
    if (action.id === actionId) continue
    if (bindingsEqual(bindings[action.id], binding)) return action
  }
  return null
}
