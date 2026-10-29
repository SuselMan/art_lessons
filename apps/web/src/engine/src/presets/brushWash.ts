/** Independent normalized reference for creamy alpha-darken.
 * Source behavior: Krita bd6e8d0 KoAlphaDarkenParamsWrapper.h,
 * KoCompositeOpAlphaDarken.h and KisPainter::blendAverageOpacity.
 * No vendor implementation is copied. RGBA8 intermediate rounding is not modeled.
 * Ordered opacity history does retain the source's float exponent and qreal
 * arithmetic; the later ParameterInfo float narrowing is a separate boundary.
 */
export interface WashOpacityState { average: number; maximum: number }
export interface WashOpacityStep { average: number; maxPrev: number; canBlend: boolean }
export type WashPixel = [number, number, number, number]
const sourceAverageExponent = Math.fround(.1)

/** qreal opacity/average with a float32 exponent, as in KisPainter. Rounding the
 * average to float at each step or using double constants .1/.9 changes history.
 * Call once per ordered actual dab; packet/tile boundaries never reset it. */
export function sourceBlendAverageOpacity(opacity: number, average: number): number {
  return average < opacity ? opacity : sourceAverageExponent * opacity + (1 - sourceAverageExponent) * average
}

/** Update once per ordered placed dab, outside tile/pixel loops. Inputs are 0..1. */
export function advanceWashOpacity(state: WashOpacityState, opacity: number): WashOpacityStep {
  const maxPrev = state.maximum
  const average = sourceBlendAverageOpacity(opacity, state.average)
  state.average = average
  state.maximum = Math.max(maxPrev, opacity)
  // Earlier scratch alpha is bounded by the previous maximum opacity. Only
  // this gate permits a blend-factor implementation of the alpha equation.
  return { average, maxPrev, canBlend: average >= maxPrev }
}

/** Previous storage is premultiplied; source RGB is straight, in stored color space.
 * Mask includes source/selection alpha. Flow affects alpha, never RGB's lerp.
 * Caller supplies normalized finite inputs; this helper adds no gamma conversion.
 */
export function creamyWash(previous: WashPixel, source: [number, number, number], mask: number, opacity: number, flow: number, average: number): WashPixel {
  const destination = previous[3]
  const coverage = mask * opacity
  const fullFlow = average > opacity
    ? average > destination ? coverage + (average - coverage) * destination / average : destination
    : opacity > destination ? destination + (opacity - destination) * mask : destination
  const alpha = destination + flow * (fullFlow - destination)
  const channel = (index: 0 | 1 | 2): number => {
    const straight = destination > 0
      ? previous[index] / destination * (1 - coverage) + source[index] * coverage
      : source[index]
    return straight * alpha
  }
  return [channel(0), channel(1), channel(2), alpha]
}
