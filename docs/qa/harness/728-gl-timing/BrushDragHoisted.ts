import type { BrushTravel } from '../../../../apps/web/src/engine/src/watercolor/brushDrag'
/** CPU-only unconnected prototype; preserve original FP expression order. */
export function brushDragFieldHoisted(travel: readonly BrushTravel[], rect: { x: number; y: number; w: number; h: number }, cellPx = 4) {
  if (!travel.length) return null
  const width = Math.ceil(rect.w / cellPx), height = Math.ceil(rect.h / cellPx)
  const sx = rect.w / width, sy = rect.h / height
  const [vx, vy, weight] = [new Float32Array(width * height), new Float32Array(width * height), new Float32Array(width * height)]
  for (const d of travel) {
    const length = Math.hypot(d.dx, d.dy)
    if (length < 0.01 || d.water <= 0) continue
    const rx = Math.max(d.radius * d.aspect, 0.5), ry = Math.max(d.radius, 0.5)
    const c = Math.cos(d.angle), s = Math.sin(d.angle)
    const ex = Math.hypot(rx * c, ry * s), ey = Math.hypot(rx * s, ry * c)
    const x0 = Math.max(0, Math.floor((d.x - ex - rect.x) / sx)), x1 = Math.min(width - 1, Math.ceil((d.x + ex - rect.x) / sx))
    const y0 = Math.max(0, Math.floor((d.y - ey - rect.y) / sy)), y1 = Math.min(height - 1, Math.ceil((d.y + ey - rect.y) / sy))
    const decay = -length / ry * d.water, dirX = d.dx / length, dirY = d.dy / length
    for (let y = y0; y <= y1; y++) {
      const py = rect.y + (y + 0.5) * sy - d.y, row = (height - 1 - y) * width
      for (let x = x0; x <= x1; x++) {
      const px = rect.x + (x + 0.5) * sx - d.x
      const r2 = ((px * c + py * s) / rx) ** 2 + ((-px * s + py * c) / ry) ** 2
      if (r2 >= 1) continue
      const a = 1 - Math.exp(decay * (1 - r2))
      const i = row + x
      vx[i] = vx[i] * (1 - a) + dirX * a
      vy[i] = vy[i] * (1 - a) - dirY * a
      weight[i] = weight[i] + (1 - weight[i]) * a
      }
    }
  }
  // RG is the contact-weighted mean direction, B the contact strength.
  // Keeping the unnormalised sum in RG multiplied contact twice in flux.
  // Divide by accumulated weight, never by vector length: returning passes
  // still cancel rather than turning a tiny residual into a unit velocity.
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < weight.length; i++) {
    pixels[i * 4] = Math.round(127.5 + 127.5 * (weight[i] > 0 ? vx[i] / weight[i] : 0))
    pixels[i * 4 + 1] = Math.round(127.5 + 127.5 * (weight[i] > 0 ? vy[i] / weight[i] : 0))
    pixels[i * 4 + 2] = Math.round(255 * weight[i])
    pixels[i * 4 + 3] = 255
  }
  return { width, height, pixels }
}
