/** Source-informed SSE reciprocal/Newton arithmetic. Backend estimates are inputs
 * with independent ISA provenance, never inferred from the executing device or
 * fitted to brush images. This is not an ARM FRECPS/FRECPE refinement law. */
export type SourceImageReciprocalEstimate = (alpha: number) => number

export function sourceImageSseReciprocal(alpha: number, estimate: number): number {
  if (!Number.isInteger(alpha) || alpha < 1 || alpha > 65535 || !Number.isFinite(estimate)
    || estimate <= 0 || Math.fround(estimate) !== estimate || Math.abs(estimate * alpha - 1) > 1.5 / 4096) {
    throw new RangeError('Invalid source reciprocal estimate')
  }
  const twice = Math.fround(estimate + estimate)
  const product = Math.fround(estimate * Math.fround(estimate * alpha))
  return Math.fround(twice - product)
}

/** Finite source color/intermediate, with native nearest-even conversion.
 * Euclidean parity also handles negative half ties used by compositor packing. */
export function sourceImageRoundEven(value: number): number {
  const floor = Math.floor(value), fraction = value - floor
  return fraction < .5 ? floor : fraction > .5 ? floor + 1 : floor + (floor - 2 * Math.floor(floor / 2))
}
