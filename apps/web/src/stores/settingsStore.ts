import { create } from 'zustand'

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

export interface SettingsStore {
  locale: Locale
  setLocale: (locale: Locale) => void
  lessonsView: LessonsView
  setLessonsView: (view: LessonsView) => void
}

export const useSettingsStore = create<SettingsStore>()(set => ({
  locale: initialLocale(),
  setLocale: locale => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
    set({ locale })
  },
  lessonsView: initialLessonsView(),
  setLessonsView: view => {
    localStorage.setItem(LESSONS_VIEW_STORAGE_KEY, view)
    set({ lessonsView: view })
  },
}))

/** Puts the starting language on `<html lang>` (the index.html literal is
 *  only a static default). Called once from main.tsx rather than as a
 *  module-level side effect, so importing this store stays free of DOM
 *  writes. */
export function syncDocumentLanguage(): void {
  document.documentElement.lang = useSettingsStore.getState().locale
}
