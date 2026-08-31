import { useEffect } from 'react'

import { TapTracker } from './tapTracker'

/** Controls that float *inside* `.viewport` and must not double as "a tap on
 *  the canvas" (#362). The listeners here sit on `.viewport` itself, which is
 *  an ancestor of the room's two notice columns, so without this a single tap
 *  on a banner's button both pressed the button and toggled the chrome — true
 *  already for ClosedBanner's "Reopen" and LostWorkBanner's dismiss, and
 *  unavoidable for the zoom/rotation strip's reset, which exists only while the
 *  chrome is hidden and would therefore always bring it straight back.
 *
 *  Matched by role rather than by a marker attribute on each strip: "the tap
 *  landed on something meant to be pressed" is the actual rule, and a marker
 *  would have to be remembered by every future control added inside the
 *  viewport. Note this cannot be done with `stopPropagation` from React
 *  handlers — these are raw native listeners on an ancestor, so they fire
 *  during native bubbling before React dispatches anything (the same ordering
 *  that useViewport's `toolActive` check exists to work around).
 *
 *  (#519) Lives here rather than in useTapToggle, where it was written, since
 *  it is now the shared half of two different questions: it answers "did this
 *  touch land on the canvas", which every reader of a canvas tap has to ask
 *  before deciding what the tap meant. */
export const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

/** One short, stationary, single-finger touch on the canvas — and nothing
 *  else: not a drag, not one finger of a pinch, not a press that landed on a
 *  control floating over the viewport.
 *
 *  This is useTapToggle (#99) with its double-tap run taken off, extracted
 *  (#519) when a second caller needed the same recognition and a different
 *  consequence: the selection tool reads a tap on the canvas as "put this
 *  selection down". useTapToggle keeps its own wiring rather than being
 *  rebuilt on this — it carries the tap-run state machine and the per-device
 *  diagnostics that exist precisely because that gesture is the one people
 *  report as not working.
 *
 *  Touch-only, like every other tap this canvas reads: the pen is the drawing
 *  hand, and its own stationary presses already mean something to whichever
 *  tool is in hand.
 *
 *  Observes only — no `preventDefault`, no pointer capture — so it layers over
 *  useViewport's pan/pinch on the same element without arbitrating anything: a
 *  real pan never satisfies the movement threshold, and a second finger
 *  disqualifies the gesture as a pinch rather than a tap. */
export function useCanvasTap(el: HTMLElement | null, onTap: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !el) return

    const tracker = new TapTracker()
    // Pointers whose *down* landed on a control (see INTERACTIVE_SELECTOR).
    // Recorded at down rather than tested again at up, because pointer capture
    // can retarget the up elsewhere entirely; the pointer is still fed to
    // TapTracker as normal, so its idea of how many fingers are down stays
    // true — only the resulting `onTap` is withheld.
    const onControl = new Set<number>()

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) {
        onControl.add(e.pointerId)
      }
      tracker.down(e.pointerId, e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      tracker.move(e.pointerId, e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const wasTap = tracker.up(e.pointerId)
      const startedOnControl = onControl.delete(e.pointerId)
      if (wasTap && !startedOnControl) onTap()
    }
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      tracker.cancel(e.pointerId)
      onControl.delete(e.pointerId)
    }
    // The same defensive reset useTapToggle carries, for the same reason: a
    // pointerup that never arrives (app backgrounded mid-touch, an OS gesture
    // taking the sequence over) leaves a stale entry in TapTracker, whose tap
    // test requires the pointer to be the only one down — so one lost up
    // silently disqualifies every tap afterwards.
    const resetAll = () => { tracker.reset(); onControl.clear() }

    document.addEventListener('visibilitychange', resetAll)
    window.addEventListener('blur', resetAll)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)

    return () => {
      document.removeEventListener('visibilitychange', resetAll)
      window.removeEventListener('blur', resetAll)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [el, onTap, enabled])
}
