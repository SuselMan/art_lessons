// (#409) Geometry for a PickerOption's little line graph — the polyline points
// for normalized 0..1 samples inside a box of the given size.
//
// Its own module, away from the component, because it is the only part of the
// graph that can be wrong in a way a screenshot doesn't show: an off-by-one on
// the last sample silently drops the right edge of the curve, which is exactly
// where the three tilt responses differ most.

/** Breathing room inside the box, so a curve that sits at 0 or at 1 still draws
 *  a visible line rather than merging into the border. */
export const CURVE_GRAPH_PADDING = 4

/** `points` for an SVG polyline: samples spread evenly across the width, with
 *  0 at the bottom and 1 at the top (SVG's y grows downward, so this flips).
 *  Returns '' for anything with fewer than two samples — a single point is not
 *  a curve, and a caller handing one over should draw nothing rather than a
 *  dot the user would read as data. */
export function curveGraphPoints(
  curve: readonly number[], width: number, height: number, padding = CURVE_GRAPH_PADDING,
): string {
  if (curve.length < 2) return ''
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  return curve
    .map((y, i) => {
      const px = padding + (i / (curve.length - 1)) * innerW
      const py = padding + (1 - y) * innerH
      return `${px.toFixed(2)},${py.toFixed(2)}`
    })
    .join(' ')
}
