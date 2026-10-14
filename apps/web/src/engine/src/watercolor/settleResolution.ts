
/** (#536, §17.44) From this brush radius up the settle runs at half
 *  resolution (_diffuseWashOps), and its window - and the chunk span with
 *  it - is twice as wide in the world. */
export const WC_HALF_RES_RADIUS_PX = 48

/** (#536, §17.44) ...and a settle window wider than this. */
export const WC_HALF_RES_SPAN_PX = 1024

/** Material-version policy, using the clipped world window before allocation. */
export function watercolorSettleScale(radiusPx: number, spanPx: number,
  policy: 'native' | 'coarse' | 'fine-large'): 1 | 2 {
  if (radiusPx >= WC_HALF_RES_RADIUS_PX && spanPx > WC_HALF_RES_SPAN_PX) return 2
  if (policy === 'coarse' && radiusPx >= 8 && spanPx > 128) return 2
  if (policy === 'fine-large' && radiusPx >= WC_HALF_RES_RADIUS_PX && spanPx > 512) return 2
  return 1
}
