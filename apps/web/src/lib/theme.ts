/** Which palette the interface is painted in (#426).
 *
 *  Not a style preference. The task exists because a teacher from the target
 *  audience — an adult, ready to run lessons — could not read the interface
 *  on the dark palette. That is what fixes the requirement below, and it is
 *  the reason `light` is not simply `dark` inverted: see the contrast note in
 *  styles/tokens.css.
 *
 *  Dark stays the default. The canvas is a sheet of near-white paper, and a
 *  neutral dark surround is what lets you judge the drawing's tone against
 *  nothing in particular — that is why drawing editors ship dark by default,
 *  and it is still true. Light is a choice for the people who need it, not a
 *  replacement for the people who don't. */
export type Theme = 'dark' | 'light'

export const THEMES: readonly Theme[] = ['dark', 'light']

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

/** The palette to start in for a browser that has never chosen one.
 *
 *  Reads the OS-level preference, the same way `initialLocale()` reads the
 *  browser's languages: detection decides the *first* visit only. Once a
 *  choice is stored, flipping the OS to light mode never overrides it — a
 *  person who deliberately picked dark inside a light-themed OS meant it.
 *
 *  `prefers-color-scheme` defaults to `light` in browsers that don't report
 *  one, which would be the wrong default for this app, so this asks the dark
 *  question specifically and treats "no answer" as dark. */
export function detectTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
