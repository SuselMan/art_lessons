import { useEffect, useState } from 'react'

import { useSettingsStore } from '../stores/settingsStore'
import { compactMediaQuery, detectCompact, resolveCompact } from './deviceType'

/** (#512) Whether the editor should show its compact, annotation-only shell.
 *
 *  Live rather than measured once at load, and that is the whole reason this
 *  is a hook instead of a call to `detectCompact()` at the top of Room.
 *  `deviceType` can be settled once because the machine does not change under
 *  you; screen size does — rotating a phone, dropping an app into a split
 *  screen, dragging a desktop window narrow — and an answer frozen at mount
 *  would leave the editor in the wrong shell until the page was reloaded.
 *
 *  The stored preference wins when it is not `auto`, so someone whose device
 *  detection reads wrong (or who simply wants the full editor on a big phone)
 *  is never stuck with it. */
export function useCompactLayout(): boolean {
  const preference = useSettingsStore(s => s.compactPreference)
  const [detected, setDetected] = useState(detectCompact)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia(compactMediaQuery())
    // Re-read on subscribe as well as on change: between the initial
    // `useState` and this effect running, the viewport may already have
    // settled somewhere else (a phone that starts landscape, a PWA that gets
    // its real window size after first paint).
    setDetected(query.matches)
    const onChange = (e: MediaQueryListEvent) => setDetected(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return resolveCompact(preference, detected)
}
