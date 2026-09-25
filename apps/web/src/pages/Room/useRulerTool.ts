import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { clientToRoomPoint } from './cameraMath'
import { RULER_GESTURE_CURSOR } from './cursorController'
import type { RulerPoint } from './RulerOverlay'
import { rulerGestureAt, RULER_BODY_GRAB_PX, RULER_ENDPOINT_GRAB_PX } from './rulerGesture'
import type { Viewport } from './useViewport'

export interface RulerToolDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** The viewport container — pointer positions are measured against it. */
  vpRef: RefObject<HTMLDivElement | null>
  /** The camera the pointer is read through (Room's, from useViewport). */
  vp: Viewport
  handActive: boolean
}

/** (#493) The ruler (#89, #405, #445, #448) on the Room side: whether it is
 *  on screen and snapping, the engine kept in step with exactly that, the
 *  one gesture that lays, swings or slides the line, the per-position cursor
 *  over it, and whether a measurement is being taken right now.
 *
 *  The line itself lives in the store (it outlives the tool being in hand);
 *  this is what makes and shows it. What comes back is what the markup reads. */
export function useRulerTool({ engineRef, vpRef, vp, handActive }: RulerToolDeps) {
  const config = useRoomStore(s => s.room)
  const toolSettings = useRoomStore(s => s.toolSettings)
  const rulerActive = useRoomStore(s => s.tool) === 'ruler'
  const rulerLine = useRoomStore(s => s.rulerLine)
  const setRulerLine = useRoomStore(s => s.setRulerLine)


  // (#405) The ruler's two settings, from the same TOOL_SCHEMAS store every
  // other tool's live in.
  const rulerLock = toolSettings.ruler.lock as boolean
  const rulerSnap = toolSettings.ruler.snap as boolean
  // (#445) Visibility is the selection first, the setting second: the ruler is
  // on screen while it is in hand, and `lock` only decides whether it stays
  // there under every other tool. Unlocked (the default) it behaves like a
  // straight edge laid on the paper to measure with and taken off again —
  // which is what the toggle used to get backwards, leaving the line lying
  // across the drawing until the user went back to the ruler to switch it off.
  //
  // This one boolean is the master switch the old `show` was: what is not
  // visible neither snaps (the engine sync below) nor can be grabbed (the
  // catcher), because an invisible line bending strokes is a trap.
  const rulerVisible = rulerActive || rulerLock
  // (#448) Is a ruler gesture running right now? Only the distance bubble
  // reads it: a measurement is worth showing while it is being taken and
  // nothing but clutter over the drawing afterwards. Local state rather than
  // the store because it is born and dies inside handleRulerDown's own drag —
  // nothing outside this component can observe it, and the store deliberately
  // holds no per-gesture scratch (see rulerLine's comment above for what does
  // belong there). Set twice per drag, not per move, so it costs no renders on
  // top of the ones setRulerLine already causes.
  const [rulerDragging, setRulerDragging] = useState(false)
  // Gated on the selection as well, so a flag stranded by a drag whose catcher
  // was unmounted under it (the tool switched by hotkey mid-gesture, with the
  // pen still down) cannot leave the bubble standing over a locked ruler: a
  // gesture can only run while the ruler is in hand in the first place.
  const rulerMeasuring = rulerDragging && rulerActive

  // Ruler tool (#89, #405): the engine only ever knows about the ruler as a
  // *snapping* guide, so this is where "is there a line to snap to right now"
  // is answered, once, for every way the answer can change.
  //
  // Off screen means genuinely inert, not merely invisible: the engine is
  // handed null and nothing bends. (#445) That is what makes an unlocked ruler
  // safe to leave lying in the store — pick up the pencil and the line is gone
  // from both the canvas and the snapping, so measuring costs nothing to undo.
  // Snapping off keeps the line on screen and draggable, and simply stops it
  // pulling on strokes: a straight edge to measure and align against is half
  // of what a ruler on a drawing is for.
  //
  // Deliberately an effect on the state rather than an engine call inside each
  // drag handler (which is what this replaced): "the engine's ruler is exactly
  // the visible, snapping line" is an invariant, and hand-written call sites
  // are how an invariant becomes a bug.
  useEffect(() => {
    const engine = engineRef.current
    engine?.setRuler(rulerVisible && rulerSnap ? rulerLine : null)
  }, [rulerLine, rulerVisible, rulerSnap, engineRef])

  const rulerRectRef = useRef<DOMRect | null>(null)

  // Ruler tool (#89, #405): one gesture handler for the whole tool.
  //
  // Down/move/up tracked manually via setPointerCapture + direct DOM
  // listeners, the same pattern ColorPicker's onSvDown/onHueDown use for their
  // own drag handling. Pen-only, same as the pencil itself ignores touch (see
  // PointerInput.ts) — a finger on the catcher falls straight through to
  // useViewport's own panning untouched, instead of trying to arbitrate whose
  // gesture a given touch belongs to.
  //
  // What a press means is decided by hit-testing it against the line
  // (rulerGestureAt): on an endpoint it swings that end, on the body it slides
  // the whole ruler, anywhere else it lays a brand-new one over whatever was
  // there. That is what reconciles the tool's two rules — "dragging always
  // makes a new line" and "an existing line can only be moved while the ruler
  // is selected" — and it is why this replaced a two-surface arrangement (a
  // catcher div for the first placement, then RulerOverlay's own SVG shapes
  // forever after) that could express neither: the catcher was gone by the
  // time a second line was wanted, and the SVG handles stayed draggable under
  // every other tool.
  //
  // The tolerances are screen px, divided by the zoom here so a ruler is no
  // harder to grab zoomed out than zoomed in (#394's rule for the gizmo's own
  // handles).
  //
  // Only mounted while the ruler is the selected tool — which (#445) is also
  // exactly when it is guaranteed to be on screen. A locked ruler stays
  // visible under the pencil but is not draggable there, and an unlocked one
  // is not on screen at all: nothing off screen can be grabbed any more than
  // it can snap, see the engine sync above.
  const handleRulerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    // Same precedence as everywhere else (#405): while the hand is up, a drag
    // moves the view. useViewport's own listener is on `.viewport`, an ancestor
    // of this catcher, and native listeners on an ancestor run *before* React
    // dispatches here — so without this the same drag would pan and lay a
    // ruler line at once.
    if (handActive) return
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    const overlay = e.currentTarget
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    const rect = rulerRectRef.current = el.getBoundingClientRect()
    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // what engine.setRuler's snapping (rulerSnap.ts) compares against real
    // stroke dabs there (genuine world coordinates, see setInfiniteCamera's
    // pointer transform), and what RulerOverlay's a/b props expect for
    // infinite rooms (see the render section below).
    const toPoint = (clientX: number, clientY: number): RulerPoint => clientToRoomPoint(clientX, clientY, rect, vp, config)

    const startPoint = toPoint(e.clientX, e.clientY)
    const startLine = rulerLine // frozen for the duration of this drag
    const gesture = rulerGestureAt(
      startPoint, startLine,
      RULER_ENDPOINT_GRAB_PX / vp.zoom, RULER_BODY_GRAB_PX / vp.zoom,
    )

    const computeLine = (clientX: number, clientY: number): { a: RulerPoint; b: RulerPoint } => {
      const p = toPoint(clientX, clientY)
      // A new line is anchored where the press landed and follows the pointer
      // with its far end — the same A→B drag the tool has always opened with.
      if (gesture === 'new' || !startLine) return { a: startPoint, b: p }
      if (gesture === 'a') return { a: p, b: startLine.b }
      if (gesture === 'b') return { a: startLine.a, b: p }
      const dx = p.x - startPoint.x
      const dy = p.y - startPoint.y
      return {
        a: { x: startLine.a.x + dx, y: startLine.a.y + dy },
        b: { x: startLine.b.x + dx, y: startLine.b.y + dy },
      }
    }

    // Committed on the press, not on the first move: a tap that lays a
    // zero-length line and a drag that lays a real one are the same gesture at
    // this point, and rulerSnap.ts already refuses a degenerate line rather
    // than dividing by zero (MIN_RULER_LENGTH_SQ).
    setRulerLine(computeLine(e.clientX, e.clientY))
    setRulerDragging(true)

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setRulerLine(computeLine(ev.clientX, ev.clientY))
    }
    // (#448) `end`, not `up`: a pointercancel (the browser taking the gesture
    // over) never sends pointerup, and a distance bubble left standing after
    // one would be exactly the permanent label this issue removed.
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setRulerDragging(false)
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onEnd)
      overlay.removeEventListener('pointercancel', onEnd)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onEnd)
    overlay.addEventListener('pointercancel', onEnd)
  }, [vpRef, vp, config, handActive, rulerLine, setRulerLine])

  // (#405) The catcher's own cursor, per pointer position — the one cursor in
  // the editor that cannot come from a CSS class, because which gesture is on
  // offer depends on where the pointer is relative to the line rather than on
  // any state. Written straight to the element rather than through React state
  // so a hover costs no render; the *decision* is still cursorController's
  // (RULER_GESTURE_CURSOR), which is the rule #393 exists to keep.
  const handleRulerHover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = vpRef.current
    if (!el || !config) return
    // Cached rect, same forced-reflow reasoning as the cursor broadcast's own
    // (see its comment): getBoundingClientRect is a synchronous layout read and
    // this runs on every pointermove over the canvas. Re-read on entry and on
    // every press, which is every moment it could matter; a window resize while
    // the pointer sits still leaves the *cursor* a frame stale and nothing else,
    // since the press that follows reads the rect afresh.
    const rect = rulerRectRef.current ??= el.getBoundingClientRect()
    const gesture = rulerGestureAt(
      clientToRoomPoint(e.clientX, e.clientY, rect, vp, config), rulerLine,
      RULER_ENDPOINT_GRAB_PX / vp.zoom, RULER_BODY_GRAB_PX / vp.zoom,
    )
    e.currentTarget.style.cursor = RULER_GESTURE_CURSOR[gesture]
  }, [vpRef, vp, config, rulerLine])

  // The pointer came onto the catcher: the cached rect may be stale.
  const handleRulerEnter = useCallback(() => { rulerRectRef.current = null }, [])

  return { rulerVisible, rulerMeasuring, handleRulerDown, handleRulerHover, handleRulerEnter }
}
