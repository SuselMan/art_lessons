import { useEffect, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { backingStoreZoom, viewCentreWorld } from './viewport/cameraMath'
import type { Viewport } from './viewport/useViewport'

export interface CanvasViewportInput {
  engineRef: RefObject<PencilEngineAPI | null>
  /** The gesture layer's live viewport — see useViewport. */
  vp: Viewport
  /** The same element the gestures are measured against. */
  vpRef: RefObject<HTMLDivElement | null>
  /** …and as state, which is what the size observer has to key on. */
  vpEl: HTMLDivElement | null
  infinite: boolean
  /** The sheet's size in world units; `undefined` for an infinite room. */
  pageW: number | undefined
  pageH: number | undefined
}

/** (#493) The two effects that keep the engine's camera and backing store in
 *  step with the element the gestures happen on.
 *
 *  They belong together and nowhere else: both exist because #470 stopped
 *  moving a bounded room's canvas with a CSS transform and started moving a
 *  camera inside the engine instead. One tells the engine where to look, the
 *  other how big the surface it is looking through is, and getting the two
 *  out of step is exactly the bug where the camera and the canvas disagree
 *  about how big a world unit is.
 *
 *  Takes an options object rather than seven arguments because that is what it
 *  honestly needs: this is a join between the gesture layer, the room's
 *  configuration and the engine, and pretending otherwise would only hide the
 *  seam it is being pulled through.
 *
 *  **Do not act on `exhaustive-deps` here.** It asks for `engineRef.current`,
 *  `infinite`, `pageW` and `pageH` in the arrays below, and every one of those
 *  requests is wrong. The three values describe the room and cannot change
 *  while it is open — listing them says otherwise and invites a reader to
 *  wonder what happens when they do. `engineRef.current` is worse: the engine
 *  is created after this hook first runs, so a dependency on the instance
 *  would rebuild the resize observer the moment it appeared, and both effects
 *  read it at call time precisely so its identity never matters. The rule only
 *  loses track of this because the ref is a parameter rather than a `useRef`
 *  it can see; the arrays are unchanged from when these effects lived in
 *  Room. */
export function useCanvasViewport(
  { engineRef, vp, vpRef, vpEl, infinite, pageW, pageH }: CanvasViewportInput,
): void {
  useEffect(() => {
    const el = vpRef.current; if (!el) return
    {
      // (#470) Both kinds of room take this path now — a bounded room is
      // drawn through the same camera, so the CSS transform that used to move
      // its canvas element is gone and the engine is told where to look
      // instead. (vp.cx, vp.cy) is the gesture
      // layer's own convention — screen position (relative to the
      // viewport's own top-left, not window-absolute) of whatever world
      // point currently sits under it — same tracked-by-delta state
      // useViewport already produces for the bounded/CSS-pan path, just
      // reinterpreted rather than fed through transformFor's CSS string
      // (see useViewport's own comment). setInfiniteCamera wants the
      // inverse: the world point at screen CENTER — see cameraMath.ts's
      // screenToWorld (#143 factored this out of an inline hand-solved
      // version so the overlay components below could share the exact
      // same conversion instead of re-deriving it).
      // (#521) `viewCentreWorld` now owns the half-a-sheet correction that
      // used to sit here as a hand-written addition after `screenToWorld`:
      // a paste carried in from another room aims at the same world point the
      // camera does, and two hand-rolled copies of that correction is how the
      // two come to disagree.
      const { x, y } = viewCentreWorld(el.clientWidth, el.clientHeight, vp, pageW, pageH)
      const nz = backingStoreZoom(infinite, el.clientWidth, el.clientHeight)
      engineRef.current?.setInfiniteCamera(x, y, vp.zoom / nz, vp.angle)
    }
  }, [vp, vpRef])

  // The canvas element tracks the viewport container's own size (#133 Phase 1
  // for infinite rooms, every room since #470: a bounded room's canvas used to
  // be its sheet, fixed for the room's lifetime, and that is exactly what made
  // a big sheet unaffordable).
  useEffect(() => {
    // (#470) `vpEl` (state), not `vpRef.current`: the ref is still empty when
    // this runs on mount, and the deps below no longer change when the room's
    // config arrives, so a ref read here would early-return once and never be
    // retried — leaving the backing store at the element's default 300x150
    // while CSS stretched it across the viewport.
    const el = vpEl
    if (!el) return
    // Read through the ref inside the callback rather than captured at
    // attach time: this effect now runs on mount for every room, and the
    // engine is created by a later effect, so a captured null would leave the
    // backing store at the element's default 300x150 forever — the canvas
    // stretched by CSS over a viewport it never actually rendered.
    const applySize = (width: number, height: number): void => {
      const engine = engineRef.current
      if (!engine) return
      // Backing store at physical-device resolution (contentRect is CSS px),
      // so at the device-native zoom the UI calls 100% one tile texel lands
      // on exactly one physical pixel — see deviceNativeZoom's doc comment.
      // The element's own CSS size is set separately (width/height: 100%).
      const nz = backingStoreZoom(infinite, width, height)
      if (width > 0 && height > 0) {
        engine.resizeCanvas(Math.round(width / nz), Math.round(height / nz))
      }
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      applySize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(el)
    // And once the engine exists, since the observer's own first callback has
    // very likely already come and gone by then.
    const engineArrived = window.setInterval(() => {
      if (!engineRef.current) return
      window.clearInterval(engineArrived)
      const rect = el.getBoundingClientRect()
      applySize(rect.width, rect.height)
    }, 50)
    return () => { observer.disconnect(); window.clearInterval(engineArrived) }
  }, [vpEl])
}
