import type { Dab } from '@grafetto/shared'
import type { PencilPreset } from '../presets/pencilPresets'
import type { RibbonProfile } from '../dabs/ribbonProfile'
import { WATERCOLOR_SPREAD } from '../dabs/ribbonProfile'
import { watercolorHalo,WATERCOLOR_HALO_PAST_BLOOM,WATERCOLOR_HALO_DRAWN } from '../presets/watercolorPresets'
import { dabWorldHalfExtents } from '../dabs/dabWorldHalfExtents'
import { canonicalMajorRadius } from '../watercolor/canonicalRadius'
import type { CanonicalStrokeChunkState } from '../dabs/canonicalStrokeChunk'
import { wetAt } from '../paper/paperWetness'
export interface CanonicalSourceGeometryCache {dabSpacing:number}
/** Exact production source bounds/padding only; delivery already advanced once. */
export function canonicalSourceGeometry(drawable:Dab[],prevDab:Dab|undefined,preset:PencilPreset,profile:RibbonProfile,wetProfile:string|undefined,state:CanonicalStrokeChunkState,cache:CanonicalSourceGeometryCache,sheetSize:{w:number;h:number},canonicalRadius:boolean) {
 if(drawable.length!==1)throw new Error('Native source geometry requires one prepared canonical segment')
 const wetOf=(dab:Dab)=>dab===drawable[0]?wetAt(wetProfile,0):0
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const haloBound = (d: Dab): number =>
      profile.normalizeDeposit ? watercolorHalo(wetOf(d), 1).scale : 1
    const haloPast = (d: Dab): number =>
      profile.normalizeDeposit && wetOf(d) > 0
        ? WATERCOLOR_HALO_PAST_BLOOM * WATERCOLOR_SPREAD.cap : 0
    let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity
    const sheet = sheetSize
    for (const d of prevDab ? [prevDab, ...drawable] : drawable) {
      const { hx, hy } = dabWorldHalfExtents(d, false, preset)
      const g = haloBound(d), past = haloPast(d)
      if (sheet && (d.x + hx * g + past <= 0 || d.y + hy * g + past <= 0
        || d.x - hx * g - past >= sheet.w || d.y - hy * g - past >= sheet.h)) continue
      rMinX = Math.min(rMinX, d.x - hx * g - past); rMaxX = Math.max(rMaxX, d.x + hx * g + past)
      rMinY = Math.min(rMinY, d.y - hy * g - past); rMaxY = Math.max(rMaxY, d.y + hy * g + past)
      const pg = WATERCOLOR_HALO_DRAWN ? g : 1, pp = WATERCOLOR_HALO_DRAWN ? past : 0
      minX = Math.min(minX, d.x - hx * pg - pp); maxX = Math.max(maxX, d.x + hx * pg + pp)
      minY = Math.min(minY, d.y - hy * pg - pp); maxY = Math.max(maxY, d.y + hy * pg + pp)
    }
    const bounds = { minX, minY, maxX, maxY }
    const reachRect = { minX: rMinX, minY: rMinY, maxX: rMaxX, maxY: rMaxY }

 const firstGap=drawable.length>=2?Math.hypot(drawable[1].x-drawable[0].x,drawable[1].y-drawable[0].y):(prevDab?Math.hypot(drawable[0].x-prevDab.x,drawable[0].y-prevDab.y):0)
 if(cache.dabSpacing===0&&firstGap>0.01)cache.dabSpacing=firstGap
 const scalars=state.gestureScalars!
 let nibRadius=0
 for(const d of drawable)nibRadius=Math.max(nibRadius,canonicalRadius?canonicalMajorRadius(d.size,d.aspectRatio,preset.sizeMultiplier):d.size*0.5*preset.sizeMultiplier*Math.max(d.aspectRatio,1))
 const pad=scalars.spreadPx>0?Math.ceil(scalars.spreadPx*2+profile.wetEdgeRadiusPx+cache.dabSpacing+scalars.migratePx+profile.aaPx)+1:0
 const compositeBounds=pad>0?{minX:bounds.minX-pad,minY:bounds.minY-pad,maxX:bounds.maxX+pad,maxY:bounds.maxY+pad}:bounds
 const reachBounds={minX:reachRect.minX-pad,minY:reachRect.minY-pad,maxX:reachRect.maxX+pad,maxY:reachRect.maxY+pad}
 return{bounds:reachBounds,compositeBounds,nibRadius,scalars}
}
