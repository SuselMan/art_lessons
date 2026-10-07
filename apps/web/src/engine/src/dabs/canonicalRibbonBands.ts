import type { Dab } from '@grafetto/shared'
import type { RibbonProfile } from './ribbonProfile'
import { buildRibbonBands } from './markerRibbon'
import { WC_FILM_DOSE, watercolorTravelRadius } from '../presets/watercolorPresets'

/** Existing production delivery maps, never a second brush dose model. */
export interface CanonicalRibbonDelivery {
  water: ReadonlyMap<Dab, number>
  pigment: ReadonlyMap<Dab, number>
  excess: ReadonlyMap<Dab, number>
  haloShed: ReadonlyMap<Dab, number>
  paperWet: ReadonlyMap<Dab, number>
  puddle: ReadonlyMap<Dab, number>
  pigmentPool: ReadonlyMap<Dab, number>
}
export interface CanonicalRibbonPreparation {
  dabs: Dab[]
  previous?: Dab
  sizeMultiplier: number
  profile: RibbonProfile
  film: boolean
  segmented: boolean
  solventField: boolean
  delivery: CanonicalRibbonDelivery
  wetOf(dab: Dab): number
}
/** Pure band seam only. Caps, delivery clocks and uniforms remain owned by production. */
export function prepareCanonicalRibbonBands(input: CanonicalRibbonPreparation) {
  const { dabs, previous, sizeMultiplier, profile, film, segmented, solventField, delivery, wetOf } = input
  if (!profile.normalizeDeposit) throw new Error('Canonical watercolour preparation requires production normalized profile')
  const inkStrength = profile.pigmentStrength
  const inkFor = (d0: Dab, d1: Dab, travel: number) => {
    const minor = d1.size * 0.5 * sizeMultiplier
    const bdx = d1.x - d0.x
    const bdy = d1.y - d0.y
    const bandAngle = Math.hypot(bdx, bdy) > 0.01 ? Math.atan2(bdy, bdx) : null
    const radius = Math.max(watercolorTravelRadius(
      minor * Math.max(d1.aspectRatio, 1), minor, d1.angle, bandAngle,
    ), 0.5)
    return {
      ink: (film
        ? (profile.depositPerRadius * 0.5) * WC_FILM_DOSE * 2
        : (profile.depositPerRadius * 0.5) * (travel / radius) * 0.5 * ((1 - profile.stampInkShare) * 2))
        * (delivery.pigment.get(d1) ?? 1)
        * (delivery.excess.get(d1) ?? 1)
        * (1 - (delivery.haloShed.get(d1) ?? 0)),
      water: delivery.water.get(d1) ?? 0,
      paperWet: delivery.paperWet.get(d1) ?? 0,
      strength: Math.hypot(bdx, bdy) > 0.2 * minor ? inkStrength : -inkStrength,
      puddle: delivery.puddle.get(d1) ?? 1,
      pigmentPool: delivery.pigmentPool.get(d1) ?? 0.5,
    }
  }
  const build = (material: Parameters<typeof buildRibbonBands>[6]) => profile.stampsOnly ? new Float32Array(0) : buildRibbonBands(
    dabs, sizeMultiplier, previous, profile.nibShape, profile.cornerFraction, profile.aaPx, material, film,
  )
  const bands = build(inkFor)
  const waterBands = segmented ? build((d0, d1, travel) => ({ ...inkFor(d0, d1, travel), paperWet: wetOf(d1) })) : bands
  const solventBands = segmented && solventField ? build((_d0, d1) => ({
    ink: (delivery.water.get(d1) ?? 0) / 4, water: 1, paperWet: 0,
    strength: 0, puddle: 0, pigmentPool: 0,
  })) : new Float32Array(0)
  return { bands, waterBands, solventBands, inkFor }
}
