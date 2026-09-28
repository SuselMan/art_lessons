// (#466) The Fullscreen API, through one seam, because Safari below 16.4 only
// has the `webkit`-prefixed half of it.
//
// Same version boundary as #464's gzip work, and found the same way — on a
// borrowed iPad running iPadOS 16.3. Safari shipped the unprefixed API
// (`requestFullscreen`, `exitFullscreen`, `fullscreenElement`,
// `fullscreenEnabled`, `fullscreenchange`) in 16.4. Before that every one of
// those is `undefined`, and the prefixed spellings are the only ones that
// exist — so the room's fullscreen button did not merely fail on tap, it was
// never rendered: `document.fullscreenEnabled` being undefined read as "this
// browser cannot do fullscreen at all". It can. On a tablet, where fullscreen
// is how people actually work, that is not a cosmetic loss.
//
// Written as free functions over `document` rather than a React hook: the
// caller already owns the state and the effect, and a hook here would move
// that ownership for no gain.

/** The prefixed members WebKit has and lib.dom does not declare. All optional,
 *  which is what lets a plain `Document` be assigned to this without a cast —
 *  the project would rather widen a type than reach for `as any`. */
interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function doc(): WebkitDocument | null {
  return typeof document === 'undefined' ? null : document
}

/** Whether this browser can put an element fullscreen at all.
 *
 *  Worth keeping as a real check rather than assuming yes: iPhone Safari
 *  genuinely cannot (only <video> goes fullscreen there), and a button that
 *  does nothing is worse than no button. The caller hides the control on
 *  false. */
export function isFullscreenSupported(): boolean {
  const d = doc()
  if (!d) return false
  return Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled)
}

/** Whether something is fullscreen right now.
 *
 *  Returns a real boolean, which the old inline `document.fullscreenElement
 *  !== null` did not: on a browser without the unprefixed API that property is
 *  `undefined`, and `undefined !== null` is `true` — so the icon would have
 *  claimed fullscreen was on the moment anything called it. */
export function isFullscreen(): boolean {
  const d = doc()
  if (!d) return false
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement)
}

/** Enters fullscreen, or leaves it if anything already is.
 *
 *  Always `document.documentElement`, and deliberately not a parameter. #357
 *  is the whole reason: fullscreening the editor element instead made every
 *  portal — layer menus, modals, the notice stack, the tool pickers — a
 *  sibling of the fullscreen element rather than a descendant, so they held
 *  state and passed `checkVisibility()` while being neither visible nor
 *  clickable. On a tablet that was half the interface. Taking the target as an
 *  argument would put that mistake back within reach of the next caller.
 *
 *  Resolves to whether the request was honoured. A rejection here is ordinary
 *  rather than exceptional — the spec lets a browser refuse (no user gesture,
 *  an iframe without `allow="fullscreen"`, a device that simply declines) —
 *  and the caller's own listener is what updates the icon either way, so there
 *  is nothing for a thrown error to do but become an unhandled rejection.
 *
 *  The prefixed calls return `undefined` rather than a promise on older
 *  WebKit, which is why both are funnelled through `Promise.resolve` instead
 *  of being awaited directly. */
export async function toggleFullscreen(): Promise<boolean> {
  const d = doc()
  if (!d) return false
  const target: WebkitElement = d.documentElement
  try {
    if (isFullscreen()) {
      const exit = d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen?.bind(d)
      if (!exit) return false
      await Promise.resolve(exit())
    } else {
      const request = target.requestFullscreen?.bind(target)
        ?? target.webkitRequestFullscreen?.bind(target)
      if (!request) return false
      await Promise.resolve(request())
    }
    return true
  } catch {
    return false
  }
}

/** Subscribes to fullscreen entering/leaving from any cause — the button, Esc,
 *  a system gesture — and returns an unsubscribe.
 *
 *  Both event names are always registered rather than picking one by feature
 *  detection. They are two names for the same event, no browser fires both,
 *  and a listener for an event that never arrives costs nothing — whereas
 *  choosing wrong costs the icon being stuck. */
export function subscribeFullscreenChange(onChange: (fullscreen: boolean) => void): () => void {
  const d = doc()
  if (!d) return () => {}
  const handler = () => { onChange(isFullscreen()) }
  d.addEventListener('fullscreenchange', handler)
  d.addEventListener('webkitfullscreenchange', handler)
  return () => {
    d.removeEventListener('fullscreenchange', handler)
    d.removeEventListener('webkitfullscreenchange', handler)
  }
}
