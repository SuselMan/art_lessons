// (#321) Whether the developer half of the settings panel is offered at all.
//
// It used to be the whole panel, in English, in front of every teacher who
// opened settings looking for the sound. Now it is one tab behind this key —
// still reachable on a real device against production, which is the only
// reason it isn't simply `import.meta.env.DEV`: most measurements happen on
// Ilya's tablet, against the deployed app, where there is no DevTools console
// to set a key from. Hence the URL switch: `?debug=1` turns it on for this
// browser and `?debug=0` off again, and nothing else in the app has to know.

const DEBUG_TOOLS_STORAGE_KEY = 'al_debug_tools'

/** The `debug` query parameter as an intent: `true`/`false` when present and
 *  understood, `null` when absent (leave the stored value alone). Exported for
 *  its own test — the parsing is the part with edge cases, not the storage. */
export function readDebugParam(search: string): boolean | null {
  const raw = new URLSearchParams(search).get('debug')
  if (raw === null) return null
  if (raw === '0' || raw === 'false' || raw === 'off') return false
  return true
}

/** Applies `?debug=…` to the stored flag. Called once at startup, before the
 *  tree mounts, so the first render already knows. The parameter is left in
 *  the address bar on purpose: it is how the state is explained to whoever is
 *  looking at the device. */
export function syncDebugToolsFromUrl(search: string): void {
  const intent = readDebugParam(search)
  if (intent === null) return
  if (intent) localStorage.setItem(DEBUG_TOOLS_STORAGE_KEY, 'true')
  else localStorage.removeItem(DEBUG_TOOLS_STORAGE_KEY)
}

export function isDebugToolsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(DEBUG_TOOLS_STORAGE_KEY) === 'true'
}
