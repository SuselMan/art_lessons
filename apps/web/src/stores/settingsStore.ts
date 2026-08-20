import { create } from 'zustand'

import { isPaperType, type PaperType } from '@grafetto/shared'

import {
  IDENTITY_PRESSURE_CALIBRATION, isPressureCalibration, type PressureCalibration,
} from '../lib/pressureCalibration'

import {
  DEFAULT_COLOR_PICKER_MODE,
  isColorPickerMode,
  type ColorPickerMode,
} from '../components/ColorPicker/pickerModes'
import { detectDeviceType, isDeviceType, type DeviceType } from '../lib/deviceType'
import { getHotkeyBindings, setHotkeyBindings, type HotkeyBinding } from '../lib/hotkeys'
import {
  DEFAULT_FLOATING_PANEL_MODE, DEFAULT_MINIMAL_UI_TAP_MODE, DEFAULT_SOUND_VOLUME, clampSoundVolume,
  isFloatingPanelMode, isMinimalUiTapMode, type FloatingPanelMode, type MinimalUiTapMode,
} from '../lib/uiPreferences'
import { detectTheme, isTheme, type Theme } from '../lib/theme'
import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from '../i18n/locale'

// App-wide user preferences (#208) — settings that belong to the person, not
// to a drawing: language today, likely theme and similar later.
//
// Deliberately a *separate* store from `roomStore`, even though the project
// otherwise keeps one global store: `resetRoomStore()` replaces the whole
// room-store state on every Room mount (see its own doc comment), which
// would silently reset a preference like the chosen language every time a
// room is opened. These outlive any single room, so they need a container
// that is never reset.
//
// Same `al_` localStorage prefix as every other client-side preference in
// this app (hotkeys, panel position, one-time hints).
const LOCALE_STORAGE_KEY = 'al_locale'
const LESSONS_VIEW_STORAGE_KEY = 'al_lessons_view'
const DEVICE_TYPE_STORAGE_KEY = 'al_device_type'
const COLOR_PICKER_MODE_STORAGE_KEY = 'al_color_picker_mode'
const LAST_PAPER_TYPE_STORAGE_KEY = 'al_last_paper_type'
const SOUND_ENABLED_STORAGE_KEY = 'al_sound_enabled'
const SOUND_VOLUME_STORAGE_KEY = 'al_sound_volume'
const MINIMAL_UI_STORAGE_KEY = 'al_minimal_ui'
const MINIMAL_UI_TAP_STORAGE_KEY = 'al_minimal_ui_tap'
const FLOATING_PANEL_STORAGE_KEY = 'al_floating_panel'
const LOCK_BRUSH_ANGLE_STORAGE_KEY = 'al_lock_brush_angle'
const THEME_STORAGE_KEY = 'al_theme'
const PRESSURE_CALIBRATION_STORAGE_KEY = 'al_pressure_calibration'

function readStoredLocale(): Locale | null {
  const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
  return isLocale(raw) ? raw : null
}

/** How the My Lessons list is laid out: 'grid' = the thumbnail tiles this
 *  page has always used, 'list' = compact horizontal rows with a small
 *  preview, for scanning a long list of rooms rather than recognising one by
 *  its drawing. A per-person preference, not a per-room one, so it lives
 *  here next to the language rather than in `roomStore` (which is wiped on
 *  every Room mount). */
export type LessonsView = 'grid' | 'list'

function isLessonsView(value: unknown): value is LessonsView {
  return value === 'grid' || value === 'list'
}

function initialLessonsView(): LessonsView {
  if (typeof window === 'undefined') return 'grid'
  const raw = localStorage.getItem(LESSONS_VIEW_STORAGE_KEY)
  return isLessonsView(raw) ? raw : 'grid'
}

/** Which control scheme to lay the interface out for (#331, ADR #318): an
 *  explicit earlier choice if there is one, otherwise whatever the hardware
 *  suggests. Like the language, detection only ever decides the *first*
 *  visit — once a person has picked, nothing overrides it.
 *
 *  Stored per browser and deliberately never synced through the account: the
 *  same teacher runs a lesson from a PC and reviews the work from a tablet,
 *  so an account-wide setting would mean a choice made on one device breaks
 *  the interface on the other. This describes the hardware in front of you,
 *  not the person using it. */
function initialDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop'
  const raw = localStorage.getItem(DEVICE_TYPE_STORAGE_KEY)
  return isDeviceType(raw) ? raw : detectDeviceType()
}

/** The language to start in: an explicit earlier choice if there is one,
 *  otherwise whatever the browser asks for. Detection only ever decides the
 *  *first* visit — once a choice is stored, changing the browser's language
 *  never overrides it.
 *
 *  Unlike every other preference in this app, this one is read at module
 *  load (zustand runs the initializer immediately), and other store slices
 *  import it — which means the node-run unit tests execute this too, with no
 *  `window` in scope. Outside a browser there is neither a stored choice nor
 *  a browser language, so the default is the only honest answer. */
function initialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  return readStoredLocale() ?? detectLocale(navigator.languages ?? [navigator.language])
}

/** Which palette to start in (#426). Same rule as the language and the device
 *  type: the OS preference decides the *first* visit, a stored choice decides
 *  every one after it.
 *
 *  Per browser rather than per account, for the reason the device type gives
 *  in full: the same teacher runs a lesson from a tablet in a lit room and
 *  reviews the work from a PC in the evening, and which palette is readable is
 *  a property of the screen in front of you, not of the person. */
function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return isTheme(raw) ? raw : detectTheme()
}

/** Which shape the color picker takes (#337). A habit built over years in
 *  another editor, so it belongs to the person and outlives any room — but
 *  stored per browser rather than on the account, for the same reason the
 *  device type is: it costs a server-side user-settings model we don't have,
 *  to sync something nobody misses across devices. */
function initialColorPickerMode(): ColorPickerMode {
  if (typeof window === 'undefined') return DEFAULT_COLOR_PICKER_MODE
  const raw = localStorage.getItem(COLOR_PICKER_MODE_STORAGE_KEY)
  return isColorPickerMode(raw) ? raw : DEFAULT_COLOR_PICKER_MODE
}

/** (#345) The paper the last room this browser opened was drawn on — read at
 *  launch to decide which ~4 MB texture to start downloading before anyone
 *  has opened anything (see prefetchPaper).
 *
 *  A preference in the weak sense: nobody sets it and nobody sees it. It lives
 *  here rather than in `roomStore` for the usual reason — `resetRoomStore()`
 *  wipes that on every Room mount, and a value whose entire purpose is to
 *  outlive the room that produced it cannot live somewhere that is cleared
 *  when a room opens.
 *
 *  Seeded with CreateRoom's own default so a browser that has never opened a
 *  room still guesses the same paper a new room would be created with, rather
 *  than downloading nothing and paying full price on the first join. */
const DEFAULT_LAST_PAPER: PaperType = 'fine'

function initialLastPaperType(): PaperType {
  if (typeof window === 'undefined') return DEFAULT_LAST_PAPER
  const raw = localStorage.getItem(LAST_PAPER_TYPE_STORAGE_KEY)
  return raw !== null && isPaperType(raw) ? raw : DEFAULT_LAST_PAPER
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  return raw === 'true' ? true : raw === 'false' ? false : fallback
}

/** (#321) Sound and interface preferences, moved here out of the developer
 *  feature-flag list they grew up in: they belong to the person, apply while
 *  the app is running, and have nothing to do with the room being drawn in.
 *
 *  All of them are read through a store subscription rather than at mount, so
 *  changing one takes effect immediately — the flag list they came from needed
 *  a page reload for every change, which is exactly what made it a developer
 *  instrument rather than a setting.
 *
 *  Nothing migrates the old `featureFlag:*` / `pencilSoundVariant` keys into
 *  these. That was a deliberate call (#321): the product has no live users
 *  yet, so a migration would be code written for three of our own devices and
 *  then never removed. */
function initialSoundVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_SOUND_VOLUME
  const raw = Number(localStorage.getItem(SOUND_VOLUME_STORAGE_KEY))
  return Number.isFinite(raw) ? clampSoundVolume(raw) : DEFAULT_SOUND_VOLUME
}

function initialFloatingPanel(): FloatingPanelMode {
  if (typeof window === 'undefined') return DEFAULT_FLOATING_PANEL_MODE
  const raw = localStorage.getItem(FLOATING_PANEL_STORAGE_KEY)
  return isFloatingPanelMode(raw) ? raw : DEFAULT_FLOATING_PANEL_MODE
}

function initialMinimalUiTapMode(): MinimalUiTapMode {
  if (typeof window === 'undefined') return DEFAULT_MINIMAL_UI_TAP_MODE
  const raw = localStorage.getItem(MINIMAL_UI_TAP_STORAGE_KEY)
  return isMinimalUiTapMode(raw) ? raw : DEFAULT_MINIMAL_UI_TAP_MODE
}

/** The pen calibration stored for this browser (#475), or none.
 *
 *  Per browser rather than per account, and for a sharper version of the
 *  reason `deviceType` gives: this one describes not just the machine but the
 *  stylus plugged into it and the driver curve configured on it. The same
 *  teacher's account on a tablet and on a PC with a graphics tablet needs two
 *  different calibrations, and syncing one over the other would break the
 *  device it wasn't measured on.
 *
 *  Validated on the way out rather than trusted: this is user-writable text
 *  that survives deploys, and a NaN reaching the input path would blank the
 *  pressure of every stroke drawn afterwards. */
function initialPressureCalibration(): PressureCalibration {
  if (typeof window === 'undefined') return IDENTITY_PRESSURE_CALIBRATION
  const raw = localStorage.getItem(PRESSURE_CALIBRATION_STORAGE_KEY)
  if (raw === null) return IDENTITY_PRESSURE_CALIBRATION
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPressureCalibration(parsed) ? parsed : IDENTITY_PRESSURE_CALIBRATION
  } catch {
    return IDENTITY_PRESSURE_CALIBRATION
  }
}

export interface SettingsStore {
  locale: Locale
  setLocale: (locale: Locale) => void
  lastPaperType: PaperType
  setLastPaperType: (type: PaperType) => void
  lessonsView: LessonsView
  setLessonsView: (view: LessonsView) => void
  deviceType: DeviceType
  setDeviceType: (deviceType: DeviceType) => void
  /** (#426) Which palette the interface is painted in. See `lib/theme.ts` for
   *  why this is an accessibility setting rather than a cosmetic one. */
  theme: Theme
  setTheme: (theme: Theme) => void
  colorPickerMode: ColorPickerMode
  setColorPickerMode: (mode: ColorPickerMode) => void
  /** One switch for every sound the app makes — graphite on paper and the
   *  interface's own clicks alike (#321). They were two independent settings
   *  and nobody wants one of them. */
  soundEnabled: boolean
  setSoundEnabled: (enabled: boolean) => void
  /** 0..1, multiplied into every sound source's output gain. */
  soundVolume: number
  setSoundVolume: (volume: number) => void
  minimalUi: boolean
  setMinimalUi: (enabled: boolean) => void
  /** (#189) Whether one tap on the canvas toggles minimal UI or it takes two.
   *  Two by default — see MinimalUiTapMode for what a single tap costs. */
  minimalUiTapMode: MinimalUiTapMode
  setMinimalUiTapMode: (mode: MinimalUiTapMode) => void
  floatingPanel: FloatingPanelMode
  setFloatingPanel: (mode: FloatingPanelMode) => void
  /** (#278) Whether the marker's chisel angle is a canvas-space value that
   *  rotates with the canvas, or stays visually fixed on screen. */
  lockBrushAngleToCanvas: boolean
  setLockBrushAngleToCanvas: (enabled: boolean) => void
  /** (#475) How this device's stylus reports pressure, and how that report is
   *  shaped before any tool sees it. `IDENTITY_PRESSURE_CALIBRATION` means
   *  uncalibrated — the pre-#475 behaviour, and what every new device starts
   *  on. Pushed into the engine from `Room` (`setPressureCalibration`), which
   *  is the single place it is ever applied. */
  pressureCalibration: PressureCalibration
  setPressureCalibration: (calibration: PressureCalibration) => void
  /** (#174) Keyboard bindings by action id. The registry, the codec and the
   *  conflict rules stay in `lib/hotkeys`; this is only where the current
   *  values live, so that rebinding one reaches the editor's own keydown
   *  handler without the page reload the settings panel used to need. */
  hotkeys: Record<string, HotkeyBinding>
  setHotkeys: (bindings: Record<string, HotkeyBinding>) => void
}

export const useSettingsStore = create<SettingsStore>()(set => ({
  locale: initialLocale(),
  setLocale: locale => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
    set({ locale })
  },
  lastPaperType: initialLastPaperType(),
  setLastPaperType: type => {
    localStorage.setItem(LAST_PAPER_TYPE_STORAGE_KEY, type)
    set({ lastPaperType: type })
  },
  lessonsView: initialLessonsView(),
  setLessonsView: view => {
    localStorage.setItem(LESSONS_VIEW_STORAGE_KEY, view)
    set({ lessonsView: view })
  },
  deviceType: initialDeviceType(),
  setDeviceType: deviceType => {
    localStorage.setItem(DEVICE_TYPE_STORAGE_KEY, deviceType)
    document.documentElement.dataset.device = deviceType
    set({ deviceType })
  },
  theme: initialTheme(),
  setTheme: theme => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  colorPickerMode: initialColorPickerMode(),
  setColorPickerMode: mode => {
    localStorage.setItem(COLOR_PICKER_MODE_STORAGE_KEY, mode)
    set({ colorPickerMode: mode })
  },
  soundEnabled: readStoredBoolean(SOUND_ENABLED_STORAGE_KEY, false),
  setSoundEnabled: enabled => {
    localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(enabled))
    set({ soundEnabled: enabled })
  },
  soundVolume: initialSoundVolume(),
  setSoundVolume: volume => {
    const clamped = clampSoundVolume(volume)
    localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(clamped))
    set({ soundVolume: clamped })
  },
  minimalUi: readStoredBoolean(MINIMAL_UI_STORAGE_KEY, false),
  setMinimalUi: enabled => {
    localStorage.setItem(MINIMAL_UI_STORAGE_KEY, String(enabled))
    set({ minimalUi: enabled })
  },
  minimalUiTapMode: initialMinimalUiTapMode(),
  setMinimalUiTapMode: mode => {
    localStorage.setItem(MINIMAL_UI_TAP_STORAGE_KEY, mode)
    set({ minimalUiTapMode: mode })
  },
  floatingPanel: initialFloatingPanel(),
  setFloatingPanel: mode => {
    localStorage.setItem(FLOATING_PANEL_STORAGE_KEY, mode)
    set({ floatingPanel: mode })
  },
  lockBrushAngleToCanvas: readStoredBoolean(LOCK_BRUSH_ANGLE_STORAGE_KEY, false),
  setLockBrushAngleToCanvas: enabled => {
    localStorage.setItem(LOCK_BRUSH_ANGLE_STORAGE_KEY, String(enabled))
    set({ lockBrushAngleToCanvas: enabled })
  },
  pressureCalibration: initialPressureCalibration(),
  setPressureCalibration: calibration => {
    localStorage.setItem(PRESSURE_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration))
    set({ pressureCalibration: calibration })
  },
  // Own storage key and codec (`lib/hotkeys`), unlike the plain values above:
  // bindings are validated per action against the registry on read, so a
  // renamed or dropped action can't leave a dead entry behind.
  hotkeys: typeof window === 'undefined' ? {} : getHotkeyBindings(localStorage),
  setHotkeys: bindings => {
    setHotkeyBindings(localStorage, bindings)
    set({ hotkeys: bindings })
  },
}))

/** Puts the starting language on `<html lang>` (the index.html literal is
 *  only a static default). Called once from main.tsx rather than as a
 *  module-level side effect, so importing this store stays free of DOM
 *  writes. */
export function syncDocumentLanguage(): void {
  document.documentElement.lang = useSettingsStore.getState().locale
}

/** (#426) Writes the palette onto `<html data-theme>`, which is what every
 *  stylesheet actually branches on, and brings the browser's own UI along
 *  with it.
 *
 *  The `theme-color` meta matters more here than it looks: on an installed PWA
 *  it colours the status bar and the task-switcher card, so leaving it at
 *  index.html's static dark value would frame a light app in a dark bar — on
 *  a tablet, which is the device this app is used on. It is read back out of
 *  the stylesheet rather than repeated as a literal, so the bar cannot drift
 *  away from `--color-bg` the next time the palette is tuned.
 *
 *  Reading it back can legitimately come up empty (a stylesheet not yet
 *  applied when this runs on first load), and the fallback for that is to
 *  leave the meta alone: index.html already carries the dark default, which is
 *  the right answer whenever the question can't be asked. */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  if (bg === '') return
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

/** Puts the starting palette on `<html>` before the first paint, so nothing
 *  renders in one theme and then swaps. Same shape as the two syncs around it:
 *  called once from main.tsx, kept current afterwards by `setTheme`. */
export function syncThemeAttribute(): void {
  applyTheme(useSettingsStore.getState().theme)
}

/** Publishes the chosen control scheme as `<html data-device>` so stylesheets
 *  can branch on it (`:root[data-device='tablet'] .foo { … }`) without every
 *  component that only differs in spacing having to subscribe to the store.
 *  Components that differ in *behaviour* still read `deviceType` directly.
 *
 *  Same shape as `syncDocumentLanguage`: called once from main.tsx rather
 *  than as a module-level side effect, and kept current afterwards by
 *  `setDeviceType`. */
export function syncDeviceTypeAttribute(): void {
  document.documentElement.dataset.device = useSettingsStore.getState().deviceType
}
