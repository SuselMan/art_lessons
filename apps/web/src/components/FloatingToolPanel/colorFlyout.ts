// Pure geometry for the palette flyout that fans out from the floating
// panel's center color dot — framework/DOM-free (like cameraMath.ts,
// clampPanelPosition, etc.) so the angle math is unit-testable without a
// real DOM.
//
// The panel is user-draggable and can end up anywhere, including hard
// against an edge/corner of its container. Rather than picking one "best"
// direction to fan into (which still has to cut off somewhere once there
// are enough colors), this casts a fixed ring of rays out from the panel's
// center in every direction at once, then walks each ray outward ring by
// ring, stacking colors along whichever rays still have room — a ray
// pointed at open space just keeps stacking rings; one pointed at a nearby
// edge stops after however many rings actually fit before its next ring's
// swatch would cross the container bounds. Colors are handed out
// round-robin across rays, one full ring at a time, so the flyout fills
// outward as a set of concentric layers rather than exhausting one ray
// before moving to the next.

export interface RayLayoutConfig {
  /** Distance (px) from the panel's center to a ring-1 swatch center. */
  baseRadius: number
  /** Radial distance (px) between consecutive rings along the same ray. */
  ringSpacing: number
  /** Arc distance (px) to keep between neighboring rays' ring-1 swatches —
   *  only used to derive how many rays fit around the ring-1 circle. */
  raySpacing: number
  /** Swatch radius (px), used for the container-bounds fit check. */
  swatchRadius: number
}

const MIN_RAYS = 4
// Hard ceiling on how deep any single ray is walked while probing for its
// max ring count — just a sanity backstop against an unbounded loop; no
// real container is ever going to fit this many rings along one ray.
const MAX_RINGS_PROBE = 64

/** How many rays fit evenly around the ring-1 circle (circumference /
 *  raySpacing) without crowding each other, at least MIN_RAYS. */
export function computeRayCount(baseRadius: number, raySpacing: number): number {
  const circumference = 2 * Math.PI * baseRadius
  return Math.max(MIN_RAYS, Math.floor(circumference / raySpacing))
}

/** Ray angles in degrees (standard math convention: 0 = right, 90 = up,
 *  positive counterclockwise), evenly spaced starting straight up and
 *  going clockwise — an arbitrary but fixed, deterministic order (matters
 *  for `assignRingsRoundRobin` below, which fills ray 0 first each round). */
export function computeRayAngles(rayCount: number): number[] {
  return Array.from({ length: rayCount }, (_, i) => 90 - (360 / rayCount) * i)
}

function toXY(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: radius * Math.cos(rad), y: -radius * Math.sin(rad) }
}

/** How many rings fit along a single ray before the next one's swatch
 *  would cross `container`'s bounds — monotonic (moving further out along
 *  a fixed direction only ever gets closer to some edge, never back away
 *  from all of them), so this can just walk outward until the first ring
 *  that doesn't fit. `panelCenter` and `container` share the same
 *  coordinate space (both relative to the container's own top-left). */
export function maxRingsForRay(
  angleDeg: number,
  panelCenter: { x: number; y: number },
  container: { width: number; height: number },
  config: Pick<RayLayoutConfig, 'baseRadius' | 'ringSpacing' | 'swatchRadius'>,
): number {
  let fitCount = 0
  for (let ring = 1; ring <= MAX_RINGS_PROBE; ring++) {
    const radius = config.baseRadius + (ring - 1) * config.ringSpacing
    const { x, y } = toXY(angleDeg, radius)
    const cx = panelCenter.x + x
    const cy = panelCenter.y + y
    const fits = cx - config.swatchRadius >= 0 && cx + config.swatchRadius <= container.width
      && cy - config.swatchRadius >= 0 && cy + config.swatchRadius <= container.height
    if (!fits) break
    fitCount = ring
  }
  return fitCount
}

/** Hands out `itemCount` slots across rays, one full ring at a time (ring 1
 *  for every ray that has it, then ring 2 for every ray that has it, ...),
 *  skipping a ray for the rest of the layout once it runs out of rings.
 *  Returns one `{ray, ring}` per item, in the same order the items were
 *  requested (item 0 gets the first slot handed out, etc). Stops early
 *  (returning fewer than itemCount entries) if every ray runs out of room
 *  before itemCount slots exist — the caller (palette bigger than the
 *  flyout can physically hold near this screen edge) just shows fewer. */
export function assignRingsRoundRobin(itemCount: number, rayCount: number, maxRingsPerRay: number[]): Array<{ ray: number; ring: number }> {
  const slots: Array<{ ray: number; ring: number }> = []
  for (let ring = 1; slots.length < itemCount; ring++) {
    let placedThisRing = false
    for (let ray = 0; ray < rayCount && slots.length < itemCount; ray++) {
      if (maxRingsPerRay[ray] >= ring) { slots.push({ ray, ring }); placedThisRing = true }
    }
    if (!placedThisRing) break
  }
  return slots
}

/** Full pipeline: given how many items need placing and the panel's
 *  current position within its container, returns one {x, y} CSS-px offset
 *  (from the panel's own center) per item, in request order. */
export function layoutFlyoutItems(
  itemCount: number,
  panelCenter: { x: number; y: number },
  container: { width: number; height: number },
  config: RayLayoutConfig,
): Array<{ x: number; y: number }> {
  if (itemCount <= 0) return []
  const rayCount = computeRayCount(config.baseRadius, config.raySpacing)
  const rayAngles = computeRayAngles(rayCount)
  const maxRingsPerRay = rayAngles.map(angle => maxRingsForRay(angle, panelCenter, container, config))
  const slots = assignRingsRoundRobin(itemCount, rayCount, maxRingsPerRay)
  return slots.map(({ ray, ring }) => toXY(rayAngles[ray], config.baseRadius + (ring - 1) * config.ringSpacing))
}
