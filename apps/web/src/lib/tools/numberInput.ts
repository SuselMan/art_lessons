import { clamp } from 'lodash-es'

/** How many steps a Shift-modified arrow key / PageUp-PageDown covers (#335:
 *  "shift + вверх/вниз прибавляет сразу 10"). Ten *steps*, not ten units —
 *  the fields this serves range from opacity (0…1, step 0.01) to size
 *  (1…120, step 1), and "+10" in raw units would jump the first one clean
 *  across its whole range while barely moving the second. */
export const BIG_STEP_MULTIPLIER = 10

/** Decimal places a step implies, so a stepped value can be shown without
 *  floating-point litter ("0.30000000000000004" after 30 × 0.01). Capped at
 *  6 — beyond that a step is finer than anything these fields display. */
function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const decimals = Math.ceil(-Math.log10(step))
  return clamp(decimals, 0, 6)
}

/** Snaps to the step grid *and* strips the float noise the multiplication
 *  itself introduces — `Math.round(v / 0.01) * 0.01` is not exactly 0.3. */
export function snapToStep(value: number, step: number, min: number, max: number): number {
  if (!Number.isFinite(step) || step <= 0) return clamp(value, min, max)
  // Snap relative to `min` rather than to zero: a range that doesn't start on
  // a step boundary (marker angle's 1/60° step) would otherwise land the grid
  // between its own endpoints.
  const snapped = min + Math.round((value - min) / step) * step
  const rounded = Number(snapped.toFixed(decimalsForStep(step)))
  return clamp(rounded, min, max)
}

/** One arrow-key / spinner press. `big` is the Shift (or PageUp/PageDown)
 *  variant. */
export function stepValue(
  value: number, direction: 1 | -1,
  { step, min, max, big = false }: { step: number; min: number; max: number; big?: boolean },
): number {
  const delta = step * (big ? BIG_STEP_MULTIPLIER : 1) * direction
  return snapToStep(value + delta, step, min, max)
}

/** Parses what someone typed into the field. Returns `null` for anything that
 *  isn't a number — the caller keeps the previous value rather than writing
 *  NaN into the tool settings.
 *
 *  Tolerates the decorations the field's own `format` puts there ("12px",
 *  "100%", "45°00′") and a comma decimal separator, because the displayed
 *  value is the natural thing to edit in place: someone selects "100%", types
 *  "80", and someone else clicks into it and edits the digits around the
 *  suffix. Percent is *not* rescaled here — opacity's format multiplies by 100
 *  for display, and undoing that is the field's own `parse` (see
 *  NumberField's `parse` prop), not this generic reader's guesswork. */
export function parseNumberInput(text: string): number | null {
  const cleaned = text.replace(',', '.').replace(/[^\d.+-]/g, '')
  if (!cleaned || !/\d/.test(cleaned)) return null
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}
