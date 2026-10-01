import type { Dab } from '@grafetto/shared'

/** Model pen-up even when the device's final pressure stays high. These dabs
 *  are painted AND recorded, just like the end-pool dabs. Never edit points
 *  already painted; carry the tip a short distance along its incoming direction.
 *  Ignore sub-pixel jitter during the pause before lift. A tap has no direction
 *  to drag along and remains a pool. */
export function appendWatercolorLift(pending: Dab[], recorded: readonly Dab[]): void {
  const last = pending.at(-1) ?? recorded.at(-1)
  if (!last) return
  const points = [...recorded, ...pending]
  const threshold = Math.max(1, last.size * 0.08)
  let dx = 0, dy = 0, length = 0
  for (let i = points.length - 2; i >= 0; i--) {
    dx = last.x - points[i].x
    dy = last.y - points[i].y
    length = Math.hypot(dx, dy)
    if (length >= threshold) break
  }
  if (length < threshold) return
  const size = last.size
  const along = (dx * Math.cos(last.angle) + dy * Math.sin(last.angle)) / length
  const across = (-dx * Math.sin(last.angle) + dy * Math.cos(last.angle)) / length
  const forwardRadius = size * 0.5 * Math.hypot(Math.max(last.aspectRatio, 1) * along, across)
  const travel = Math.max(3, forwardRadius * 0.9)
  // Continue from the actual final footprint: never re-widen a tapered tip.
  // Reach beyond the last footprint: otherwise its already-painted cap hides
  // the sparse hairs. Width still falls, so no full-size oval is attached.
  // A lift separates bundles immediately, even if hardware pressure stays high.
  // The final zero-contact dab makes this a complete lift in the stored log.
  for (let i = 1; i <= 8; i++) {
    const u = i / 8
    pending.push({ ...last, size: size * (1 - 0.55 * u), x: last.x + dx / length * travel * u,
      y: last.y + dy / length * travel * u, pressure: Math.min(last.pressure, 0.055) * (1 - u),
      t: last.t + i * 2 })
  }
}
