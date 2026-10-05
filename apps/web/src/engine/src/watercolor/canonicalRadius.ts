/** Diagnostic solver geometry only: use the float32 size/aspect that the
 * existing dab codec actually records. Source nib geometry stays untouched. */
export function canonicalMinorRadius(size: number, multiplier: number): number {
  return Math.fround(size) * 0.5 * multiplier
}
export function canonicalMajorRadius(size: number, aspect: number, multiplier: number): number {
  return canonicalMinorRadius(size, multiplier) * Math.max(1, Math.fround(aspect))
}
