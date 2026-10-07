import type { Dab } from '@grafetto/shared'
import type { PencilPreset } from '../presets/pencilPresets'
import type { RibbonProfile } from './ribbonProfile'
import type { WaterFootprint } from '../watercolor/foreignWater'
import { wetAt } from '../paper/paperWetness'
import { watercolorTravelQuantum } from '../presets/watercolorPresets'

export interface RibbonDrawableState {
  lastKept: Dab | undefined
  wetContacts: WaterFootprint[]
}
/** Exact production filtering; wet digits index original positions, not kept positions. */
export function prepareDrawableRibbonDabs(
 dabs:Dab[],prevDab:Dab|undefined,preset:PencilPreset,profile:RibbonProfile,state:RibbonDrawableState,wetProfile?:string,
) {
    const floorPx = profile.minHalfWidthPx
    // (#536, §17.64) Each dab's place in `dabs`, which is what the recorded
    // wet profile is indexed by - one digit per dab of the operation (or of
    // the live batch's slice). The filters below drop dabs, and reading the
    // profile by position in what is left shifted every digit after the first
    // one dropped - by how many were dropped before it in THIS call, so a live
    // stroke and its one-batch replay read different paper under the same dab.
    const wetIndex = new Map<Dab, number>()
    let drawable = floorPx === null
      ? dabs.filter((d, i) => { wetIndex.set(d, i); return d.size * 0.5 * preset.sizeMultiplier >= 0.5 })
      : dabs.map((d, i) => {
        const half = d.size * 0.5 * preset.sizeMultiplier
        const out = half >= floorPx ? d : { ...d, size: (floorPx * 2) / preset.sizeMultiplier }
        wetIndex.set(out, i)
        return out
      })
    // -1 for a dab not of this call (the bridging prevDab), as the loop below read it.
    const wetOf = (d: Dab): number => wetAt(wetProfile, wetIndex.get(d) ?? -1)
    // (§17.28) The deposit as a FILM under MAX blending - see RibbonTileScratch.strokeInk.
    // (§17.28) Only the dabs that MOVED deposit - see watercolorTravelQuantum.
    // The anchor is the last dab kept, carried on the scratch across the
    // gesture's batches so a live stroke and its replay keep the same dabs.
    if (profile.normalizeDeposit && state) {
      // …and the ribbon bridges from the last kept dab, never from a dropped
      // one, so the bands' geometry is the same set of dabs live and replayed.
      if (state.lastKept) prevDab = state.lastKept
      const kept: Dab[] = []
      let anchor = prevDab
      for (const d of drawable) {
        const q = watercolorTravelQuantum(d.size * 0.5 * preset.sizeMultiplier)
        if (!anchor || Math.hypot(d.x - anchor.x, d.y - anchor.y) >= q) { kept.push(d); anchor = d }
      }
      if (kept.length) state.lastKept = kept[kept.length - 1]
      drawable = kept
    }
    return {drawable,previous:prevDab,wetIndex,wetOf}
}
/** Kept contacts only; preserved at the existing production bookkeeping boundary. */
export function noteRibbonWetContacts(state:RibbonDrawableState,drawable:Dab[],preset:PencilPreset,wetOf:(d:Dab)=>number) {
    for (const d of drawable) if (wetOf(d) >= 0.3) state.wetContacts.push({
      x: d.x, y: d.y, radius: d.size * 0.5 * preset.sizeMultiplier,
      aspect: Math.max(1, d.aspectRatio), angle: d.angle,
    })
}

/** Production landing/dwell distance; shared by existing engine and CPU-only caller. */
export function ribbonSegmentLength(dab:Dab,prevDab:Dab|undefined,radius:number):number {
    const MARKER_FIRST_DAB_DISTANCE_FACTOR = 0.5 // uncalibrated first pass
    const MARKER_DWELL_CREEP_DISTANCE_FACTOR = 0.12 // uncalibrated first pass
    if (!prevDab) return radius * MARKER_FIRST_DAB_DISTANCE_FACTOR
    const dist = Math.hypot(dab.x - prevDab.x, dab.y - prevDab.y)
    return dist > 0.01 ? dist : radius * MARKER_DWELL_CREEP_DISTANCE_FACTOR
}
