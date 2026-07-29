import { create } from 'zustand'

import { isPaperType, type PaperType } from '@grafetto/shared'

import {
  DEFAULT_COLOR_PICKER_MODE,
  isColorPickerMode,
  type ColorPickerMode,
} from '../components/ColorPicker/pickerModes'
import { detectDeviceType, isDeviceType, type DeviceType } from '../lib/deviceType'
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
 *  launch to decide which ~7.4 MB texture to start downloading before anyone
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
const DEFAULT_LAST_PAPER: PaperType = 'coarse'

function initialLastPaperType(): PaperType {
  if (typeof window === 'undefined') return DEFAULT_LAST_PAPER
  const raw = localStorage.getItem(LAST_PAPER_TYPE_STORAGE_KEY)
  return raw !== null && isPaperType(raw) ? raw : DEFAULT_LAST_PAPER
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
  colorPickerMode: ColorPickerMode
  setColorPickerMode: (mode: ColorPickerMode) => void
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
  colorPickerMode: initialColorPickerMode(),
  setColorPickerMode: mode => {
    localStorage.setItem(COLOR_PICKER_MODE_STORAGE_KEY, mode)
    set({ colorPickerMode: mode })
  },
}))

/** Puts the starting language on `<html lang>` (the index.html literal is
 *  only a static default). Called once from main.tsx rather than as a
 *  module-level side effect, so importing this store stays free of DOM
 *  writes. */
export function syncDocumentLanguage(): void {
  document.documentElement.lang = useSettingsStore.getState().locale
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
