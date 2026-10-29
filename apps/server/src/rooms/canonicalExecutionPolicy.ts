import { CANONICAL_STROKE_RASTER_PROFILE } from '@grafetto/shared'
/** Server execution/config policy, not a client capability claim or KPP default.
 * This does NOT open straight rooms or switch any renderer. */
export const CANONICAL_ROOM_EXECUTION_POLICY = Object.freeze({ rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
  alphaDarkenVariants: Object.freeze(['creamy'] as const) })
