/** Axis-aligned world bounds of the complete rotated dab quad, including
 * bitmap corners. An ellipse fits inside the same quad, so these bounds also
 * safely contain procedural round tips and bounded edge diffusion.
 *
 * `radius` is the final local Y half-size after geometry expansion (for example
 * Bleed padding); local X half-size is radius * aspect. `pad` adds world-space
 * clearance after rotation, useful for antialiasing or composite edge kernels.
 * Invalid/empty geometry returns null rather than creating tiles at a fallback
 * origin or handing nonfinite extents to tile enumeration.
 */
export interface BrushFootprintBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function brushFootprintBounds(
  x: number, y: number, radius: number, aspect: number, angle: number, pad = 0,
): BrushFootprintBounds | null {
  if (![x, y, radius, aspect, angle, pad].every(Number.isFinite) || radius <= 0 || aspect <= 0 || pad < 0)
    return null
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
  const halfX = radius * aspect
  const extentX = cos * halfX + sin * radius + pad
  const extentY = sin * halfX + cos * radius + pad
  const bounds = { minX: x - extentX, minY: y - extentY, maxX: x + extentX, maxY: y + extentY }
  return Object.values(bounds).every(Number.isFinite) ? bounds : null
}
