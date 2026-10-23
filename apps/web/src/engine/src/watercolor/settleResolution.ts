
/** (#536, §17.44) From this brush radius up the settle runs at half
 *  resolution (_diffuseWashOps), and its window - and the chunk span with
 *  it - is twice as wide in the world. */
export const WC_HALF_RES_RADIUS_PX = 48

/** (#536, §17.44) ...and a settle window wider than this. */
export const WC_HALF_RES_SPAN_PX = 1024

/** v1 moved even small marks to a half-resolution transport grid. On dry
 * paper that grid coarsens the silhouette. v2 keeps the original resolution
 * thresholds while retaining the eight-cell front and compact large fields. */
export function watercolorSettleScale(radius: number, span: number,
  model: 'legacy' | 'front8-v1' | 'front8-v2', diagnosticCoarse = false): 1 | 2 {
  const coarse = model === 'front8-v1' || (model === 'legacy' && diagnosticCoarse)
  return (radius >= WC_HALF_RES_RADIUS_PX && span > WC_HALF_RES_SPAN_PX)
    || (coarse && radius >= 8 && span > 128) ? 2 : 1
}
