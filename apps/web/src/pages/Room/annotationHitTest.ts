/** What a press on an annotation was aimed at. Written onto the overlay's own
 *  elements and read back by Room's catcher — see `annotationAt`. */
export const ANNOTATION_ID_ATTR = 'data-annotation-id'
export const ANNOTATION_PART_ATTR = 'data-annotation-part'

/** Which piece of an annotation a press landed on. The three are genuinely
 *  different actions, which is why the overlay marks them rather than leaving
 *  Room to infer one from coordinates:
 *   - `pin`    — the marker stuck in the drawing: folds the note down or opens
 *                it back up;
 *   - `bubble` — the note itself: opens it for editing;
 *   - `delete` — the bin inside an open note;
 *   - `ink`    — a pen mark, which only the eraser has anything to do with. */
export type AnnotationPart = 'pin' | 'bubble' | 'delete' | 'ink'

export interface AnnotationHit {
  annotationId: string
  part: AnnotationPart
}

function isPart(value: string | null): value is AnnotationPart {
  return value === 'pin' || value === 'bubble' || value === 'delete' || value === 'ink'
}

/** Which annotation — and which part of it — is under a screen point.
 *
 *  This exists because an annotation can never be the event target itself. The
 *  overlay lives inside `.worldOverlayWrap`, whose own `transform` makes it a
 *  stacking context, and the tool's `.canvasCatcher` sits above the whole thing
 *  at z-index 4 inside `.viewport` — so no z-index in the overlay can climb out
 *  to meet a press. Hit-testing from the catcher instead is the arrangement the
 *  ruler already uses, for the same reason.
 *
 *  `elementsFromPoint` rather than walking the annotations and comparing
 *  rectangles, which is what this did first. Three things fall out of using the
 *  browser's own hit test:
 *   - a bin icon 20px across is hit exactly, where a bounding-box test would
 *     have needed its own geometry;
 *   - an ink mark is hit along its actual stroke instead of across the whole
 *     box its path happens to span — a diagonal scribble's box is mostly empty;
 *   - rotation and zoom are already accounted for, because the browser is
 *     testing the elements as drawn rather than as they would be at zoom 1.
 *
 *  The overlay's elements are `pointer-events: none` unless an annotation tool
 *  is in hand (see AnnotationOverlay's `interactive`), and `elementsFromPoint`
 *  honours that — so under the pencil this returns null for everything and a
 *  stroke aimed at the paper is never eaten by a note lying on it. */
export function annotationAt(clientX: number, clientY: number): AnnotationHit | null {
  if (typeof document === 'undefined') return null
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const part = el.getAttribute(ANNOTATION_PART_ATTR)
    const annotationId = el.getAttribute(ANNOTATION_ID_ATTR)
    // Topmost first, and the loop stops at the first annotation piece it finds:
    // the note drawn on top is the one the eye sees, so it is the one a press
    // should reach.
    if (annotationId && isPart(part)) return { annotationId, part }
  }
  return null
}
