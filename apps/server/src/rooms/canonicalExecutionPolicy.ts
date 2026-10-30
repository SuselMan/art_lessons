import type { CanonicalDefaultAutoExecutionPolicy } from './CanonicalBrushCapabilityResolver.js'
import { CANONICAL_STROKE_RASTER_PROFILE } from '@grafetto/shared'
/** Server execution/config policy, not a client capability claim or KPP default.
 * This does NOT open straight rooms or switch any renderer. */
export interface CanonicalRoomExecutionPolicy {
 readonly rasterProfile:typeof CANONICAL_STROKE_RASTER_PROFILE
 readonly alphaDarkenVariants:readonly('creamy'|'hard')[]
 readonly defaultAuto?:CanonicalDefaultAutoExecutionPolicy|false
}
export const CANONICAL_ROOM_EXECUTION_POLICY:CanonicalRoomExecutionPolicy = Object.freeze({ rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
  alphaDarkenVariants: Object.freeze(['creamy'] as const),defaultAuto:false })
