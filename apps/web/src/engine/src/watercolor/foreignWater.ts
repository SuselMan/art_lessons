// #680: recorded wet contacts locate a preceding puddle; geometry comes from
// the log, never the replay client's wall clock or its live wetness field.
export interface WaterFootprint {
  x: number; y: number; radius: number; aspect: number; angle: number
}
export interface WaterSource { gesture: string; footprints: WaterFootprint[] }

function contains(d: WaterFootprint, x: number, y: number, pad = 0): boolean {
  const dx = x - d.x, dy = y - d.y, c = Math.cos(d.angle), s = Math.sin(d.angle)
  const u = (dx * c + dy * s) / Math.max(d.radius * d.aspect + pad, 0.5)
  const v = (-dx * s + dy * c) / Math.max(d.radius + pad, 0.5)
  return u * u + v * v <= 1
}

/** A small CPU-baked alpha stencil, bottom-up like a GL texture. Only source
 * gestures intersecting a RECORDED wet contact can become a wet domain. */
export function foreignWaterStencil(
  sources: readonly WaterSource[], contacts: readonly WaterFootprint[],
  rect: { x: number; y: number; w: number; h: number }, cellPx = 4,
): { width: number; height: number; pixels: Uint8Array } | null {
  if (!contacts.length || !sources.length) return null
  const selected = sources.filter(source => source.footprints.some(d =>
    contacts.some(p => contains(d, p.x, p.y, p.radius))))
  if (!selected.length) return null
  const width = Math.max(1, Math.ceil(rect.w / cellPx)), height = Math.max(1, Math.ceil(rect.h / cellPx))
  const sx = rect.w / width, sy = rect.h / height
  const pixels = new Uint8Array(width * height)
  for (const source of selected) for (const d of source.footprints) {
    // Scanline ellipse union: fill each row as one native array operation.
    // A loaded 400px brush may have thousands of dabs; walking every cell of
    // every overlapping disc would turn this small stencil into a CPU stall.
    const rx = Math.max(0.5, d.radius * d.aspect), ry = Math.max(0.5, d.radius)
    const c = Math.cos(d.angle), sin = Math.sin(d.angle)
    const a = c * c / (rx * rx) + sin * sin / (ry * ry)
    const b = c * sin * (1 / (rx * rx) - 1 / (ry * ry))
    const cc = sin * sin / (rx * rx) + c * c / (ry * ry)
    const reachY = Math.hypot(rx * sin, ry * c)
    const y0 = Math.max(0, Math.ceil((d.y - reachY - rect.y) / sy - 0.5))
    const y1 = Math.min(height - 1, Math.floor((d.y + reachY - rect.y) / sy - 0.5))
    for (let y = y0; y <= y1; y++) {
      const dy = rect.y + (y + 0.5) * sy - d.y
      const disc = b * b * dy * dy - a * (cc * dy * dy - 1)
      if (disc < 0) continue
      const root = Math.sqrt(disc)
      const x0 = Math.max(0, Math.ceil((d.x + (-b * dy - root) / a - rect.x) / sx - 0.5))
      const x1 = Math.min(width - 1, Math.floor((d.x + (-b * dy + root) / a - rect.x) / sx - 0.5))
      if (x1 >= x0) {
        const row = (height - 1 - y) * width
        pixels.fill(255, row + x0, row + x1 + 1)
      }
    }
  }
  return pixels.some(x => x !== 0) ? { width, height, pixels } : null
}
