import { readRoomSettings, writeRoomSettings, type KeyValueStorage } from './roomStorage'
import type { TranslationKey } from '../i18n'

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
  /** KeyboardEvent.code — the *physical* key position (e.g. 'KeyZ',
   *  'BracketLeft', 'Digit1'), not KeyboardEvent.key. Layout-independent:
   *  `code` names which key was pressed regardless of the OS input
   *  language, whereas `key` names the character that layout produces —
   *  matching on `key` meant Ctrl+Z only worked while a Latin layout was
   *  active (a Cyrillic layout puts 'я' on that same physical key, so
   *  Ctrl+Z became literal "Ctrl+Я"). See MDN's KeyboardEvent.code table
   *  for the full physical-key list. */
  code: string
  /** Ctrl on Windows/Linux, Cmd on Mac — one modifier with two spellings,
   *  resolved per platform by `platformMod` rather than by accepting either
   *  everywhere (which made Win+Z undo on Windows — the Windows key reports
   *  as `metaKey`, and Win+Z is the OS's own snap-layouts shortcut). */
  mod: boolean
  shift: boolean
}

// Alt is deliberately not part of the vocabulary above, and every match below
// requires it to be *up*. Two reasons, and the second is the load-bearing one:
// no default needs it, and on Windows/Linux AltGr reports as Ctrl+Alt — so
// without this, AltGr+Z (a plain character on Polish, Croatian, Turkish and a
// dozen other layouts) was indistinguishable from Ctrl+Z and silently undid
// the last stroke while someone typed. On macOS the same key is Option, which
// composes characters rather than modifying commands.

/** macOS (including iPadOS, which reports as a Mac and takes Cmd from an
 *  attached keyboard). Read once — the platform cannot change mid-session —
 *  and injectable as the last argument of everything below, so the tests can
 *  exercise both platforms without touching globals. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  // navigator.userAgentData is Chromium-only and not in TS's DOM lib; read it
  // structurally rather than casting (project rule), falling back to the
  // deprecated-but-universal navigator.platform.
  const uaData: unknown = Reflect.get(navigator, 'userAgentData')
  const platform = uaData !== null && typeof uaData === 'object' && 'platform' in uaData
    && typeof uaData.platform === 'string'
    ? uaData.platform
    : navigator.platform
  return /mac|iphone|ipad|ipod/i.test(platform ?? '')
}

const IS_MAC = isMacPlatform()

/** Whether this event holds down the platform's command modifier, and whether
 *  it holds the *other* platform's — which must be up. Ctrl+Z on a Mac is not
 *  undo (it's the shell's suspend), and Win+E on Windows belongs to Explorer,
 *  not to our eraser. */
function modifierState(e: KeyboardEvent, mac: boolean): { mod: boolean; foreign: boolean } {
  return mac
    ? { mod: e.metaKey, foreign: e.ctrlKey }
    : { mod: e.ctrlKey, foreign: e.metaKey }
}

export interface HotkeyActionDef {
  id: string
  /** Translation key for the action's name (#208) — this registry is data
   *  shared by the keydown handler, the tooltips and the rebind UI, so it
   *  carries the key and each consumer resolves it in the active language. */
  labelKey: TranslationKey
  default: HotkeyBinding
}

export const HOTKEY_ACTIONS: readonly HotkeyActionDef[] = [
  { id: 'undo', labelKey: 'hotkey.undo', default: { code: 'KeyZ', mod: true, shift: false } },
  { id: 'redo', labelKey: 'hotkey.redo', default: { code: 'KeyZ', mod: true, shift: true } },
  { id: 'toggleEraser', labelKey: 'hotkey.toggleEraser', default: { code: 'KeyE', mod: false, shift: false } },
  { id: 'toggleSmudge', labelKey: 'hotkey.toggleSmudge', default: { code: 'KeyS', mod: false, shift: false } },
  { id: 'toggleCharcoal', labelKey: 'hotkey.toggleCharcoal', default: { code: 'KeyC', mod: false, shift: false } },
  { id: 'toggleLiner', labelKey: 'hotkey.toggleLiner', default: { code: 'KeyL', mod: false, shift: false } },
  { id: 'toggleMarker', labelKey: 'hotkey.toggleMarker', default: { code: 'KeyM', mod: false, shift: false } },
  // B for brush — the letter the tool is named after, and free (see the list
  // above: A/C/E/G/H/I/L/M/R/S/T/U/Z were taken, B was not).
  { id: 'toggleBrushPen', labelKey: 'hotkey.toggleBrushPen', default: { code: 'KeyB', mod: false, shift: false } },
  // #468 — W for watercolor. B was already spent on the brush pen, and of what
  // is still free (D/F/J/K/N/O/P/Q/V/W/X/Y) it is the only letter the tool is
  // actually named after in either language the app ships.
  { id: 'toggleWatercolor', labelKey: 'hotkey.toggleWatercolor', default: { code: 'KeyW', mod: false, shift: false } },
  // (#405) The four tools that used to be modes laid over a drawing tool are
  // ordinary members of the selection now, so they belong in this registry
  // like every other tool rather than in a branch of their own — that is what
  // makes them rebindable, and what puts them in the hotkeys tab next to the
  // pencil. They toggle the same way the eraser does: pressing the key again
  // hands the canvas back to the drawing tool that was in hand.
  //
  // Esc and Enter are deliberately NOT here, for the same reason hold-to-pan
  // isn't (see toggleHand below): they are the platform's own cancel and
  // confirm, every layer of the UI already answers to them, and a rebind UI
  // able to move them could leave an open transform session with no way out.
  { id: 'toggleEyedropper', labelKey: 'hotkey.toggleEyedropper', default: { code: 'KeyI', mod: false, shift: false } },
  { id: 'toggleRuler', labelKey: 'hotkey.toggleRuler', default: { code: 'KeyU', mod: false, shift: false } },
  { id: 'toggleTransform', labelKey: 'hotkey.toggleTransform', default: { code: 'KeyT', mod: false, shift: false } },
  // (#446) 'A' for area — 'M' (the marquee key everywhere else) is the marker
  // here, and the marker is a tool someone reaches for far more often.
  { id: 'toggleSelection', labelKey: 'hotkey.toggleSelection', default: { code: 'KeyA', mod: false, shift: false } },
  { id: 'toggleGrid', labelKey: 'hotkey.toggleGrid', default: { code: 'KeyG', mod: false, shift: false } },
  { id: 'resetRotation', labelKey: 'hotkey.resetRotation', default: { code: 'KeyR', mod: false, shift: false } },
  // Only the *toggle* is an action and therefore rebindable. Hold-to-pan
  // (Space) isn't in this registry at all: it has no keyup half here, and a
  // registry entry for it would be a binding the rebind UI could break into
  // a state the person can never leave (see Room's own Space effect, #319).
  { id: 'toggleHand', labelKey: 'hotkey.toggleHand', default: { code: 'KeyH', mod: false, shift: false } },
  { id: 'decreaseSize', labelKey: 'hotkey.decreaseSize', default: { code: 'BracketLeft', mod: false, shift: false } },
  { id: 'increaseSize', labelKey: 'hotkey.increaseSize', default: { code: 'BracketRight', mod: false, shift: false } },
  { id: 'rotateCCW', labelKey: 'hotkey.rotateCCW', default: { code: 'BracketLeft', mod: false, shift: true } },
  { id: 'rotateCW', labelKey: 'hotkey.rotateCW', default: { code: 'BracketRight', mod: false, shift: true } },
  // Grade steps along the full 6H..6B ladder, one notch per press — replacing
  // five digit keys that jumped to five hand-picked grades (1..5 → H, HB, 2B,
  // 4B, 6B). Nine of the fourteen grades had no key at all, and which five did
  // was a judgement call baked into the keyboard; stepping needs two keys, is
  // the same gesture as ['/']' on size, and reaches every grade.
  //
  // ','/'.' rather than something mnemonic: '['/']' are taken by size, and
  // these two sit right next to them with the same left=less/right=more
  // reading — the same pair Photoshop and Krita step brushes with.
  { id: 'gradeHarder', labelKey: 'hotkey.gradeHarder', default: { code: 'Comma', mod: false, shift: false } },
  { id: 'gradeSofter', labelKey: 'hotkey.gradeSofter', default: { code: 'Period', mod: false, shift: false } },
  // Zoom, taken off the browser (#440). The two step keys are bound to the
  // browser's own zoom combo on purpose: the point is that Ctrl/Cmd +/- moves
  // *our* camera instead of scaling the page. See browserZoomIntent for the
  // other spellings of the same press, which are suppressed whatever these
  // are rebound to.
  //
  // Reset is a bare '0', not Ctrl+0: Ctrl+0 is the only way back from a
  // browser zoom that already drifted (from a menu, or a Ctrl+wheel on
  // another page), we cannot reset that from script, and taking the key would
  // leave someone stuck at 150% with no way out.
  { id: 'zoomIn', labelKey: 'hotkey.zoomIn', default: { code: 'Equal', mod: true, shift: false } },
  { id: 'zoomOut', labelKey: 'hotkey.zoomOut', default: { code: 'Minus', mod: true, shift: false } },
  { id: 'zoomReset', labelKey: 'hotkey.zoomReset', default: { code: 'Digit0', mod: false, shift: false } },
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
    && typeof (v as HotkeyBinding).code === 'string' && (v as HotkeyBinding).code.length > 0
    && typeof (v as HotkeyBinding).mod === 'boolean'
    && typeof (v as HotkeyBinding).shift === 'boolean'
}

export function bindingsEqual(a: HotkeyBinding, b: HotkeyBinding): boolean {
  return a.code === b.code && a.mod === b.mod && a.shift === b.shift
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

const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight',
])

/** True if `e` matches `binding` — compares the physical key (`code`)
 *  exactly and modifiers exactly, so the result is the same regardless of
 *  which input language/layout is currently active. */
export function matchesHotkey(e: KeyboardEvent, binding: HotkeyBinding, mac = IS_MAC): boolean {
  const { mod, foreign } = modifierState(e, mac)
  return e.code === binding.code
    && mod === binding.mod
    && !foreign
    && !e.altKey
    && e.shiftKey === binding.shift
}

/** Captures a binding from a live keydown event, for the rebind UI. Returns
 *  null for a press that cannot become a binding, and the caller should keep
 *  listening: a bare modifier (Ctrl/Shift/Meta/Alt alone, before the real key
 *  lands), the foreign platform modifier, or anything with Alt held — Alt is
 *  outside the vocabulary (see the note above HotkeyBinding), so accepting it
 *  here would record a combo `matchesHotkey` can never fire on. */
export function captureHotkeyBinding(e: KeyboardEvent, mac = IS_MAC): HotkeyBinding | null {
  if (MODIFIER_CODES.has(e.code)) return null
  if (e.altKey) return null
  const { mod, foreign } = modifierState(e, mac)
  if (foreign) return null
  return { code: e.code, mod, shift: e.shiftKey }
}

// Combos the browser or the OS keeps for itself: the keypress either never
// reaches the page at all, or reaches it already committed to closing the tab.
// A rebind onto one of these is not a shortcut that merely collides with
// something — it is a shortcut that silently does nothing, which is why the UI
// refuses it rather than saving it (#440).
//
// Kept to the ones that are non-negotiable across Chrome/Firefox/Safari rather
// than every combo any browser has ever claimed: over-refusing costs real
// keys, and the ones left out (Ctrl+S, Ctrl+P, Ctrl+F…) are genuinely
// preventable and therefore genuinely bindable.
const RESERVED_MOD_CODES = new Set(['KeyW', 'KeyN', 'KeyT', 'KeyQ', 'Tab'])

/** Whether the browser/OS owns this combo outright, so binding it would
 *  produce a key that appears broken. Only ever true with `mod` held — a bare
 *  'W' is ours like any other letter. */
export function isReservedCombo(binding: HotkeyBinding): boolean {
  return binding.mod && RESERVED_MOD_CODES.has(binding.code)
}

// The browser's own zoom, in every spelling it answers to (#440).
//
// Matching here is looser than anywhere else in this file, and deliberately
// so: `code` is the right key for our own shortcuts (a physical position,
// stable across layouts — see HotkeyBinding), but the browser binds *its*
// zoom to the produced character. On a German layout '+' is the key at
// `BracketRight`; on French AZERTY '-' is at `Digit6`. Matching only `Equal`/
// `Minus` there would leave the page zooming out from under the canvas on
// exactly the layouts that need this most. So: physical positions for the
// US/Cyrillic case, characters for everyone else, and both numpad keys.
const ZOOM_IN_CODES  = new Set(['Equal', 'NumpadAdd'])
const ZOOM_OUT_CODES = new Set(['Minus', 'NumpadSubtract'])
const ZOOM_IN_KEYS   = new Set(['+', '='])
const ZOOM_OUT_KEYS  = new Set(['-', '_'])

/** Which way the browser would zoom on this keypress, or null if it wouldn't.
 *
 *  Ctrl/Cmd+0 is deliberately absent: it is the only way back from a browser
 *  zoom that has already drifted, and script cannot reset one — see the
 *  zoomReset entry in HOTKEY_ACTIONS. */
export function browserZoomIntent(e: KeyboardEvent, mac = IS_MAC): 'in' | 'out' | null {
  const { mod, foreign } = modifierState(e, mac)
  if (!mod || foreign || e.altKey) return null
  if (ZOOM_IN_CODES.has(e.code)  || ZOOM_IN_KEYS.has(e.key))  return 'in'
  if (ZOOM_OUT_CODES.has(e.code) || ZOOM_OUT_KEYS.has(e.key)) return 'out'
  return null
}

// Display label for a physical key `code`, independent of the active input
// layout — always shown as if a US QWERTY layout were active (the de facto
// convention for on-screen shortcut hints, same as most desktop apps), even
// though matching itself works under any layout. Extend if a future default
// binds a code outside this list.
const CODE_LABELS: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Equal: '=',
  Minus: '-',
}

function codeLabel(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code]
  if (code.startsWith('Key')) return code.slice('Key'.length)
  if (code.startsWith('Digit')) return code.slice('Digit'.length)
  return code
}

/** Human-readable label, e.g. "Ctrl+Shift+Z", "E", "Shift+[" — and "⌘⇧Z" on
 *  a Mac, where the symbols and the no-separator spelling are the platform
 *  convention rather than a decoration.
 *
 *  This used to print "Ctrl" everywhere on the grounds that the matcher
 *  accepted both. It no longer does — `mod` resolves to exactly one physical
 *  key per platform (see modifierState) — so a Mac label reading "Ctrl+Z"
 *  named a combo that genuinely does nothing there. */
export function formatHotkeyLabel(binding: HotkeyBinding, mac = IS_MAC): string {
  const parts: string[] = []
  if (binding.mod) parts.push(mac ? '⌘' : 'Ctrl')
  if (binding.shift) parts.push(mac ? '⇧' : 'Shift')
  parts.push(codeLabel(binding.code))
  return parts.join(mac ? '' : '+')
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
