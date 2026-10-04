import { RIBBON_FLOATS_PER_VERTEX } from '../dabs/markerRibbon'
import { WATERCOLOR_BRISTLE_BUNDLE_PX } from '../dabs/ribbonProfile'
import { type RibbonProfile } from '../dabs/ribbonProfile'
import { watercolorWaterRetention } from '../presets/watercolorPresets'
import type { PaintTarget } from '../buffers/ILayerBuffer'


/** #547 — the band vertex array a stamps-only tool hands the two band passes,
 *  which both no-op on a zero length. Shared and frozen in size rather than a
 *  fresh `new Float32Array(0)` per batch: this is on the per-pointer-event path. */
export const EMPTY_BANDS = new Float32Array(0)


export function rectOnTile(tile: PaintTarget, r: { minX: number; minY: number; maxX: number; maxY: number }): number {
  const w = Math.min(r.maxX, tile.originX + tile.buffer.width) - Math.max(r.minX, tile.originX)
  const h = Math.min(r.maxY, tile.originY + tile.buffer.height) - Math.max(r.minY, tile.originY)
  return w > 0 && h > 0 ? w * h : 0
}


/** (§17.70) Tile pixels one piece of ribbon bands covers, counting overlap:
 *  the triangles whose box meets the tile, by area. 0 means none of them can
 *  put a fragment on it (a box ending at the tile's edge covers no pixel
 *  centre of it). */
export function ribbonBandPieceCost(piece: Float32Array, tile: PaintTarget): number {
  const x0 = tile.originX, y0 = tile.originY, x1 = x0 + tile.buffer.width, y1 = y0 + tile.buffer.height
  const V = RIBBON_FLOATS_PER_VERTEX
  let px = 0
  for (let i = 0; i + 3 * V <= piece.length; i += 3 * V) {
    const ax = piece[i], ay = piece[i + 1], bx = piece[i + V], by = piece[i + V + 1], cx = piece[i + 2 * V], cy = piece[i + 2 * V + 1]
    if (Math.max(ax, bx, cx) <= x0 || Math.min(ax, bx, cx) >= x1 || Math.max(ay, by, cy) <= y0 || Math.min(ay, by, cy) >= y1) continue
    px += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5
  }
  return px
}


/** (§17.70) `bands` as consecutive whole-triangle pieces of `tris` triangles
 *  (0: the whole array). Drawn in order they blend exactly as one draw does -
 *  blending follows primitive order either way. */
export function ribbonBandPieces(bands: Float32Array, tris: number): Float32Array[] {
  const step = tris * 3 * RIBBON_FLOATS_PER_VERTEX
  if (tris <= 0 || bands.length <= step) return [bands]
  const out: Float32Array[] = []
  for (let i = 0; i < bands.length; i += step) out.push(bands.subarray(i, Math.min(bands.length, i + step)))
  return out
}


/** (#536) Hair bundles across the mark, from the mark's own half-width, so a
 *  hair stays a fixed few pixels wide whatever brush is held — see
 *  WATERCOLOR_BRISTLE_BUNDLE_PX. The coordinate this scales runs -1..+1 across
 *  the whole width, so the count of bundles laid across the mark is twice this.
 *  One function for the ink pass (§17.13, where the hairs vary the delivery)
 *  and the composite (where they break the contact dry), so both count the
 *  same hair. */
export function ribbonBristleCombs(profile: RibbonProfile, bristleRadiusPx: number): number {
  return profile.bristleCombs > 0
    ? Math.max(1.5, Math.min(50, bristleRadiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX))
    : 0
}


/** (#536, ADR 011 §17.11/13) The water a stroke delivers to the sheet — its
 *  nominal mix water — and how much of it dry paper keeps standing. See
 *  watercolorWaterRetention, and u_washWater in RIBBON_FRAG for how the two
 *  become the wash's standing-water record; watercolorStandingWater is the
 *  same rule on the CPU, feeding the live wetness field (§17.21). */
export function ribbonWaterDelivery(profile: RibbonProfile): { water: number; retain: number } {
  if (!profile.normalizeDeposit) return { water: 0, retain: 0 }
  // The nominal mix for every stroke — a long puddle laid from a depleting
  // load read patchy, and a pigment stroke's own puddle read far weaker than
  // a clean one's — kept whole for clean water and by the load's retention
  // for pigment; the shader cuts it only where the brush has run dry.
  return {
    water: profile.waterLevel,
    retain: profile.pigmentStrength <= 0 ? 1 : watercolorWaterRetention(profile.waterLevel),
  }
}
