// (#390) How a slider maps its value range onto the track, as data rather
// than a branch inside the component. A descriptor in toolSchemas.ts picks a
// scale; PrecisionSlider only ever asks it "where does this value sit" and
// "what value sits here", and never learns which one it got.

/** A pair, not a single function: the component needs both directions —
 *  value → position to place the fill/thumb and to seed a drag, position →
 *  value to read a drag back out. `min`/`max` are passed in rather than
 *  captured by a factory (`expScale(1, 400)`) because the descriptor already
 *  carries them; a scale that stored its own copy would be a second place for
 *  a range to drift out of sync with the field it belongs to. */
export interface SliderScale {
  /** Value → normalized position along the track. In range for min..max;
   *  callers clamp, because a stored value can legitimately sit outside a
   *  range that has since moved (see coerceSettingValue in toolSchemas). */
  toPosition(value: number, min: number, max: number): number
  /** Normalized position (0..1) → value. Exact inverse of `toPosition`. */
  fromPosition(position: number, min: number, max: number): number
}

/** Equal value per pixel — the right default, and what every field used
 *  before this existed. Percentages and degrees stay here: they are linear by
 *  meaning, and opacity's min of 0 rules out the logarithm anyway. */
export const linearScale: SliderScale = {
  toPosition: (value, min, max) => (max === min ? 0 : (value - min) / (max - min)),
  fromPosition: (position, min, max) => min + position * (max - min),
}

/** Equal *ratio* per pixel: each further pixel multiplies rather than adds,
 *  so the first half of the track covers 1..20px and the second 20..400px
 *  instead of spending 90% of its travel on sizes nobody draws with.
 *
 *  Needs `min > 0` (log of zero is undefined) and a non-degenerate range —
 *  every field using it today is a px size bounded below by 1, and
 *  toolSchemas.test.ts asserts that stays true. The guard falls back to
 *  linear rather than producing NaN/Infinity, so a future field that gets
 *  this wrong degrades to the old behavior instead of rendering a broken
 *  control. */
export const expScale: SliderScale = {
  toPosition(value, min, max) {
    if (min <= 0 || max <= min) return linearScale.toPosition(value, min, max)
    return Math.log(value / min) / Math.log(max / min)
  },
  fromPosition(position, min, max) {
    if (min <= 0 || max <= min) return linearScale.fromPosition(position, min, max)
    return min * (max / min) ** position
  },
}
