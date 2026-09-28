import { useEffect, type RefObject } from 'react'

/** Cuts a hole in a tool's `.canvasCatcher` exactly over one element, so
 *  presses there reach that element instead of the catcher.
 *
 *  Exists for the note editor's `<textarea>`. The catcher sits above the whole
 *  annotation overlay in a stacking context the overlay cannot climb out of
 *  (see annotationAt), which is fine for pins and buttons — they are
 *  hit-tested from the catcher — and fatal for a text field: a caret can only
 *  be placed, dragged or given a selection by a press the field itself
 *  receives. With every press landing on the catcher, a phone could type into a
 *  note but never move the caret back to fix a typo (Ilya).
 *
 *  `clip-path` because clipped-out regions are also excluded from hit testing,
 *  and it takes the hole without restructuring who stacks above whom.
 *
 *  Measured every frame while active rather than on render: pan and pinch write
 *  the overlay's transform imperatively (useViewport's updateVp) without a
 *  React render, and a hole left where the field *was* would hand a press to
 *  the canvas under it. The field is counter-rotated to stay upright on screen,
 *  so its bounding rect is its real outline. */
export function useCatcherHole(
  catcherRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    const catcher = catcherRef.current
    if (!active || !catcher) return
    let frame = 0
    let applied = ''
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const target = targetRef.current
      let clip = ''
      if (target) {
        const c = catcher.getBoundingClientRect()
        const t = target.getBoundingClientRect()
        const l = t.left - c.left
        const r = t.right - c.left
        const top = t.top - c.top
        const b = t.bottom - c.top
        // One outer contour and one inner, and evenodd makes the inner a hole.
        clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, `
          + `${l}px ${top}px, ${r}px ${top}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${top}px)`
      }
      if (clip !== applied) {
        catcher.style.clipPath = clip
        applied = clip
      }
    }
    tick()
    return () => {
      cancelAnimationFrame(frame)
      catcher.style.clipPath = ''
    }
  }, [catcherRef, targetRef, active])
}
