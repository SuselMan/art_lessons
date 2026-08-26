/** Marks a committed note in the DOM so Room's catcher can hit-test presses
 *  against the real, already-laid-out box. Written by AnnotationOverlay, read
 *  by `annotationTextAt` — in its own module so neither the component file nor
 *  Room owns a constant the other depends on. */
export const ANNOTATION_ID_ATTR = 'data-annotation-id'

/** Which committed note is under a screen point, topmost first.
 *
 *  This exists because a note can never be the event target. The annotation
 *  layer lives inside `.worldOverlayWrap`, whose own `transform` makes it a
 *  stacking context, and the tool's `.canvasCatcher` sits above the whole
 *  thing at z-index 4 inside `.viewport` — so no z-index in the overlay can
 *  climb out to meet a press. Hit-testing from the catcher instead is the
 *  arrangement the ruler already uses, for the same reason.
 *
 *  Measures the notes as laid out rather than recomputing their boxes from
 *  text length and wrap width: the browser has already done that arithmetic,
 *  and a second version of it would be a second answer that drifts from what
 *  is on screen. Iterated last-to-first because the last note in `order` is
 *  drawn on top, and a press should reach what the eye sees.
 *
 *  `getBoundingClientRect` reports an axis-aligned box, so on a rotated canvas
 *  the hit area is a note's bounding box rather than its rotated rectangle.
 *  Deliberately accepted: the error shows only at large rotations, it can only
 *  ever make a note *easier* to hit, and the alternative is inverting the
 *  viewport matrix here to re-derive geometry the DOM already knows. */
export function annotationTextAt(root: HTMLElement | null, clientX: number, clientY: number): string | null {
  if (!root) return null
  const nodes = root.querySelectorAll<HTMLElement>(`[${ANNOTATION_ID_ATTR}]`)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const rect = nodes[i].getBoundingClientRect()
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return nodes[i].getAttribute(ANNOTATION_ID_ATTR)
    }
  }
  return null
}
