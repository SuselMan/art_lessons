/** Which palette the interface is painted in (#426).
 *
 *  Not a style preference. The task exists because a teacher from the target
 *  audience — an adult, ready to run lessons — could not read the interface
 *  on the dark palette. That is what fixes the requirement below, and it is
 *  the reason `light` is not simply `dark` inverted: see the contrast note in
 *  styles/tokens.css.
 *
 *  Dark is the *designed* default, in the sense that the canvas is a sheet of
 *  near-white paper and a neutral dark surround is what lets you judge the
 *  drawing's tone against nothing in particular — which is why drawing editors
 *  ship dark. It is not, however, what a first-time visitor necessarily gets:
 *  the starting palette follows the operating system, so most people whose
 *  system is light land on light. See `detectTheme()` for why that is the
 *  behaviour we want rather than an accident. */
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
 *  There is no third answer to fall back on, and an earlier version of this
 *  comment claimed otherwise: it said the query was phrased to treat "no
 *  preference" as dark. It isn't, and it can't be. The `no-preference` value
 *  was dropped from the spec in 2020, so every browser reports either `light`
 *  or `dark`, and `light` is what it reports when the person has never set
 *  anything. The rule this line actually implements is therefore: dark only
 *  when the system explicitly asks for dark, light in every other case.
 *
 *  Kept that way deliberately (Ilya, 11.08) rather than forced to dark. The
 *  person this theme was added for — a teacher who could not read the dark
 *  palette — is exactly the person whose system is already set to light, and
 *  following it hands them the readable theme on the first load without their
 *  having to find a setting on a palette they cannot see. Starting everyone in
 *  dark would put that discovery step in front of the one user the theme
 *  exists for. Note the consequence when reading the two branches: "light" here
 *  covers both a deliberate light system and an untouched one, because nothing
 *  in the platform distinguishes them. */
export function detectTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
