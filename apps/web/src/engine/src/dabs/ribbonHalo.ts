import type { Dab } from '@grafetto/shared'
import type { prepareRibbonDelivery } from './ribbonDelivery'
import { watercolorHalo, WATERCOLOR_HALO_PAST_BLOOM } from '../presets/watercolorPresets'
type HaloDelivery = Pick<ReturnType<typeof prepareRibbonDelivery>, 'waterByDab'|'pigmentByDab'|'pigmentPoolByDab'|'excessByDab'|'puddleByDab'|'paperWetByDab'|'acrossByDab'>
/** The unchanged production halo data preparation; no textures or GPU execution. */
export function prepareRibbonHalo(drawable:Dab[],spreadPx:number,normalizeDeposit:boolean,delivery:HaloDelivery) {
  const {waterByDab,pigmentByDab,pigmentPoolByDab,excessByDab,puddleByDab,paperWetByDab,acrossByDab}=delivery
    const haloDabs: Dab[] = []
    const haloDoseByDab = new Map<Dab, number>()
    /** What each ORIGINAL dab gave up to its halo, so the core is laid lighter
     *  by exactly that share — conservation, and the "dissolves in water" feel. */
    const haloShedByDab = new Map<Dab, number>()
    let anyHalo = false
    // A flat disc, not the tool's cone. The ink stamp is a cone that is zero at
    // the nib's rim (inkEdgeFalloff 0 — see the shader's mix(u_inkEdge, 1, depth)),
    // so a stamp merely made wider puts only the cone's outer slope over the
    // ring that is the halo: measured on a replay of Ilya's own stroke through
    // the density view, a halo 2.9x wider at nearly full dose registered at a
    // few per cent of the core. The halo is a plateau of migrated pigment, and
    // a plateau is what this profile lays.
    if (normalizeDeposit) {
      for (const dab of drawable) {
        const { scale, shed, wet } = watercolorHalo(paperWetByDab.get(dab) ?? 0, waterByDab.get(dab) ?? 0)
        // Past the composite's bloom, not merely past the dab — see
        // WATERCOLOR_HALO_PAST_BLOOM. spreadPx is the gesture's reach in world
        // px and dab.size is a diameter, hence the factor of two.
        const grown: Dab = { ...dab, size: dab.size * scale + 2 * WATERCOLOR_HALO_PAST_BLOOM * spreadPx * wet }
        haloDabs.push(grown)
        // The shed share as the halo stamp's dose, un-compensated for the wider
        // radius on purpose — see watercolorHalo on why per pixel it comes out
        // as shed / scale, a ring's worth rather than a disc's.
        haloDoseByDab.set(grown, shed)
        haloShedByDab.set(dab, shed)
        if (shed > 0) anyHalo = true
        const across = acrossByDab.get(dab)
        if (across) acrossByDab.set(grown, across)
        waterByDab.set(grown, waterByDab.get(dab) ?? 0)
        pigmentByDab.set(grown, pigmentByDab.get(dab) ?? 1)
        pigmentPoolByDab.set(grown, pigmentPoolByDab.get(dab) ?? 0.5)
        excessByDab.set(grown, excessByDab.get(dab) ?? 1)
        puddleByDab.set(grown, puddleByDab.get(dab) ?? 1)
        paperWetByDab.set(grown, paperWetByDab.get(dab) ?? 0)
      }
    }

  return {haloDabs,haloDoseByDab,haloShedByDab,anyHalo}
}
