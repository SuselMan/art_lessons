import type { WaterFootprint } from './foreignWater'

/** Recorded motion only; retained between pointer batches, consumed by settle. */
export interface BrushTravel extends WaterFootprint {
  dx: number; dy: number; water: number
  /** Optional diagnostic solver radius; flow field geometry uses radius. */
  settleRadius?: number
}

/** Synchronous producer scratch only; returned RGBA payloads never alias it. */
export class BrushDragRasterWorkspace {
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private weight = new Float32Array(0)
  allocations = 0
  reuses = 0
  bytesAllocated = 0
  bytesRequested = 0
  take(size: number): [Float32Array, Float32Array, Float32Array] {
    this.bytesRequested += size * 12
    if (size > this.vx.length) {
      this.vx = new Float32Array(size); this.vy = new Float32Array(size); this.weight = new Float32Array(size)
      this.allocations += 3; this.bytesAllocated += size * 12
    } else this.reuses++
    const views: [Float32Array, Float32Array, Float32Array] = [this.vx.subarray(0, size), this.vy.subarray(0, size), this.weight.subarray(0, size)]
    for (const view of views) view.fill(0)
    return views
  }
}

/** Local recent brush velocity, RG signed direction, B contact strength.
 * Bottom-up for GL. Travel weights keep resampling density from changing flow. */
export function brushDragField(travel: readonly BrushTravel[], rect: { x: number; y: number; w: number; h: number }, cellPx = 4, workspace?: BrushDragRasterWorkspace) {
  if (!travel.length) return null
  const width = Math.ceil(rect.w / cellPx), height = Math.ceil(rect.h / cellPx)
  const sx = rect.w / width, sy = rect.h / height
  const [vx, vy, weight] = workspace?.take(width * height) ?? [new Float32Array(width * height), new Float32Array(width * height), new Float32Array(width * height)]
  for (const d of travel) {
    const length = Math.hypot(d.dx, d.dy)
    if (length < 0.01 || d.water <= 0) continue
    const rx = Math.max(d.radius * d.aspect, 0.5), ry = Math.max(d.radius, 0.5)
    const c = Math.cos(d.angle), s = Math.sin(d.angle)
    const ex = Math.hypot(rx * c, ry * s), ey = Math.hypot(rx * s, ry * c)
    const x0 = Math.max(0, Math.floor((d.x - ex - rect.x) / sx)), x1 = Math.min(width - 1, Math.ceil((d.x + ex - rect.x) / sx))
    const y0 = Math.max(0, Math.floor((d.y - ey - rect.y) / sy)), y1 = Math.min(height - 1, Math.ceil((d.y + ey - rect.y) / sy))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = rect.x + (x + 0.5) * sx - d.x, py = rect.y + (y + 0.5) * sy - d.y
      const r2 = ((px * c + py * s) / rx) ** 2 + ((-px * s + py * c) / ry) ** 2
      if (r2 >= 1) continue
      const a = 1 - Math.exp(-length / ry * d.water * (1 - r2))
      const i = (height - 1 - y) * width + x
      vx[i] = vx[i] * (1 - a) + d.dx / length * a
      vy[i] = vy[i] * (1 - a) - d.dy / length * a
      weight[i] = weight[i] + (1 - weight[i]) * a
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

/** Sweep contacts in recorded order. An average over the entire zigzag loses
 * the fact that the return pass crossed and displaced the previous pass. */
export function brushDragContactGroups(travel: readonly BrushTravel[], rect: { x: number; y: number; w: number; h: number }) {
  const contacts: Array<{ rect: typeof rect; travel: readonly BrushTravel[]; radius: number }> = []
  let group: BrushTravel[] = [], distance = 0
  const flush = () => {
    if (!group.length) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, radius = 0
    for (const d of group) {
      const rx = d.radius * d.aspect, c = Math.cos(d.angle), s = Math.sin(d.angle)
      const ex = Math.hypot(rx * c, d.radius * s), ey = Math.hypot(rx * s, d.radius * c)
      x0 = Math.min(x0, d.x - ex); x1 = Math.max(x1, d.x + ex)
      y0 = Math.min(y0, d.y - ey); y1 = Math.max(y1, d.y + ey)
      radius = Math.max(radius, d.settleRadius ?? d.radius)
    }
    x0 = Math.max(rect.x, Math.floor(x0) - 4); y0 = Math.max(rect.y, Math.floor(y0) - 4)
    x1 = Math.min(rect.x + rect.w, Math.ceil(x1) + 4); y1 = Math.min(rect.y + rect.h, Math.ceil(y1) + 4)
    if (x1 > x0 && y1 > y0) {
      const bounds = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      contacts.push({ rect: bounds, travel: group, radius })
    }
    group = []; distance = 0
  }
  for (const d of travel) {
    if (d.water <= 0 || Math.hypot(d.dx, d.dy) < 0.01) continue
    group.push(d); distance += Math.hypot(d.dx, d.dy)
    if (distance >= Math.max(1, d.radius * 0.5)) flush()
  }
  flush()
  return contacts
}

/** Existing eager API; descriptors preserve its exact grouping and fields. */
export function brushDragContacts(travel: readonly BrushTravel[], rect: { x: number; y: number; w: number; h: number }, workspace?: BrushDragRasterWorkspace) {
  return brushDragContactGroups(travel, rect).map(group => ({
    rect: group.rect, radius: group.radius, field: brushDragField(group.travel, group.rect, 4, workspace)!,
  }))
}

/** The exposure transform is monotone on encoded contact bytes. Taking the
 * maximum byte first preserves the exact original winning transform and avoids
 * evaluating log once per field cell. Zero keeps the original positive zero. */
export function brushDragMaxExposure(pixels: Uint8Array): number {
  let peak = 0
  for (let i = 2; i < pixels.length; i += 4) peak = Math.max(peak, pixels[i])
  return peak === 0 ? 0 : -Math.log(Math.max(1 - peak / 255, 1 / 255))
}
