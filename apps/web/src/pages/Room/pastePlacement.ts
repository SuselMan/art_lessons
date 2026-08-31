import type { ClipboardMeta } from '../../lib/clipboardStorage'

/** Where a pasted raster's top-left corner goes, in the layer space of the
 *  room being pasted *into*. */
export interface PasteRect {
  x: number
  y: number
}

/** (#521) Paste in place, unless "in place" is meaningless.
 *
 *  Within one room, paste lands exactly where it was copied from — that is
 *  ADR 008's rule, it is what makes "copy this, paste it onto the layer below"
 *  line the two up pixel for pixel, and nothing here changes it.
 *
 *  Across rooms it cannot hold, because the coordinates stop meaning the same
 *  thing. A world rect is only interpretable against the room it was measured
 *  in: the next room may be a different size, or infinite, or the same size
 *  with the drawing somewhere else entirely. Pasting the numbers verbatim puts
 *  the piece at a spot nobody chose and, for a small sheet after a big one,
 *  frequently off the sheet altogether — where it is invisible, and where the
 *  gizmo that would rescue it is off-screen too.
 *
 *  So a cross-room paste centres on the view instead. That is the one place
 *  guaranteed to be both on-screen and deliberate: it is where the person is
 *  looking at the moment they press the key. They land on the transform tool
 *  holding a float (ADR 008, "Плавающее выделение"), so the first thing they
 *  can do is drag it wherever they actually meant — which is the correct thing
 *  to optimise for, since across rooms there is no "where it was" to restore.
 *
 *  `viewCentre` is the world point at the centre of the viewport, or null if
 *  it cannot be measured. Null falls back to the copied coordinates: they are
 *  a poor answer in another room, but they are a real place, and the
 *  alternative would be pasting at `NaN`. */
export function pastePlacement(
  meta: Pick<ClipboardMeta, 'roomId' | 'x' | 'y' | 'width' | 'height'>,
  roomId: string | undefined,
  viewCentre: { x: number; y: number } | null,
): PasteRect {
  if (roomId !== undefined && meta.roomId === roomId) return { x: meta.x, y: meta.y }
  if (!viewCentre) return { x: meta.x, y: meta.y }
  // The rect keeps its natural size — a paste is never resampled, here no more
  // than in `area_paste` itself — so centring is a pure translation.
  return {
    x: viewCentre.x - meta.width / 2,
    y: viewCentre.y - meta.height / 2,
  }
}
