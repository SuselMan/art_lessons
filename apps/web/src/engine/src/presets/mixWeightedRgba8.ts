/** Straight RGBA8 weighted mixing with alpha-aware integer rounding.
 * Coordinates, source lifetime and color-profile conversion belong to callers.
 * The normalizer is explicit: a sampled footprint supplies its actual weight
 * sum, while background mixing can deliberately use 255 with weights totaling 254.
 * Source-law witness: Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f,
 * libs/pigment/KoMixColorsOpImpl.h (8-bit integer color-space trait).
 */
export type Rgba8 = readonly [number, number, number, number]

export function mixWeightedRgba8(pixels: readonly Rgba8[], weights: readonly number[], normalizer: number): Rgba8 {
  if (!pixels.length || pixels.length > 65535 || pixels.length !== weights.length
    || !Number.isInteger(normalizer) || normalizer < 1 || normalizer > 0x7fffffff)
    throw new RangeError('Invalid weighted color mixture')
  let alpha = 0, red = 0, green = 0, blue = 0
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i], weight = weights[i]
    if (p.length !== 4 || p.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)
      || !Number.isInteger(weight) || weight < 0 || weight > 32767)
      throw new RangeError('Invalid RGBA8 sample or nonnegative integer weight')
    const contribution = p[3] * weight
    alpha += contribution
    red += p[0] * contribution
    green += p[1] * contribution
    blue += p[2] * contribution
  }
  // These input bounds keep every accumulated integer exact in a JS number.
  // The transparent case deliberately removes hidden RGB from zero-alpha input.
  if (!alpha) return [0, 0, 0, 0]
  const rounded = (sum: number, divisor: number) => Math.min(255, Math.floor((sum + Math.floor(divisor / 2)) / divisor))
  return [rounded(red, alpha), rounded(green, alpha), rounded(blue, alpha), rounded(alpha, normalizer)]
}
