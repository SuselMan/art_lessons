import type { Rgba8 } from './mixWeightedRgba8'

/** Pure straight RGBA8 operations in the already selected RGB color space.
 * No profile conversion, linear-light conversion, path rasterization or GPU
 * blend assumption is implicit. Scalar source law is pinned in native fixtures.
 */
const f = Math.fround
const clamp = (v: number): number => Math.max(0, Math.min(1, v))
export function validateRgba8Pixel(p: Rgba8): void {
  if (p.length !== 4 || p.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw new RangeError('Invalid RGBA8 pixel')
}
function unit(v: number): void {
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError('Expected a finite unit control')
}
const floatByte = (v: number): number => Math.trunc(f(f(clamp(v) * 255) + .5))
const opacityByte = (v: number): number => floatByte(f(v))
const multiply = (a: number, b: number): number => {
  const c = a * b + 128
  return ((c >>> 8) + c) >>> 8
}
const multiply3 = (a: number, b: number, c: number): number => {
  const t = a * b * c + 32603
  return ((t >>> 7) + t) >>> 16
}
const divide = (a: number, b: number): number => Math.trunc((a * 255 + Math.trunc(b / 2)) / b)
const blend = (src: number, dst: number, alpha: number): number => {
  const c = (src - dst) * alpha + 128
  return (((c >> 8) + c) >> 8) + dst
}

/** KoColor's qreal alpha setter rounds a double; painter opacity is a separate
 * float parameter. Applying the same random control at both stages is not one
 * equivalent alpha multiplier after quantization. Alpha replaces, not scales.
 */
export function setRgba8Opacity(source: Rgba8, opacity: number): Rgba8 {
  validateRgba8Pixel(source); unit(opacity)
  return [source[0], source[1], source[2], Math.trunc(opacity * 255 + .5)]
}

/** Compatibility HSL adjustment. Signed hue spans half a turn; saturation is
 * multiplicative and signed lightness approaches white/black. This is NOT the
 * newer HSV/chroma adjustment used by brushBehavior.hsvAdjustColor.
 * Source byte conversions and intermediate float assignments are explicit.
 */
export function adjustHslCompatibilityRgba8(source: Rgba8, hue: number, saturation: number, lightness: number): Rgba8 {
  validateRgba8Pixel(source)
  for (const v of [hue, saturation, lightness]) if (!Number.isFinite(v) || v < -1 || v > 1) throw new RangeError('Invalid signed HSL control')
  const r = f(source[0] / 255), g = f(source[1] / 255), b = f(source[2] / 255)
  const v = Math.max(r, g, b), m = Math.min(r, g, b), chroma = f(v - m)
  let l = f(f(m + v) / 2), h = -1, s = chroma
  if (l <= 0) s = 0
  else if (chroma > 0) {
    s = f(s / (l <= .5 ? f(v + m) : 2 - v - m))
    const r2 = f(f(v - r) / chroma), g2 = f(f(v - g) / chroma), b2 = f(f(v - b) / chroma)
    h = r === v ? f(g === m ? 5 + b2 : 1 - g2) : g === v ? f(b === m ? 1 + r2 : 3 - b2) : f(r === m ? 3 + g2 : 5 - r2)
    h = f(f(h * 60) % 360)
  }
  h = f(h + hue * 180)
  if (h < 0) h = f(360 + h % 360)
  if (h >= 360) h = f(h % 360)
  s = f(s * (saturation + 1))
  l = f(lightness < 0 ? l * (lightness + 1) : l + lightness * (1 - l))
  const maximum = f(l <= .5 ? l * (1 + s) : f(l + s) - f(l * s))
  if (maximum <= 0) return [0, 0, 0, source[3]]
  const minimum = f(f(l + l) - maximum), relative = f(f(maximum - minimum) / maximum)
  h = f(h % 360); h = f(h / 60)
  const sextant = Math.trunc(h), fraction = f(h - sextant)
  const rise = f(f(maximum * relative) * fraction)
  const up = f(minimum + rise), down = f(maximum - rise)
  const rgb = sextant === 0 ? [maximum, up, minimum] : sextant === 1 ? [down, maximum, minimum]
    : sextant === 2 ? [minimum, maximum, up] : sextant === 3 ? [minimum, down, maximum]
      : sextant === 4 ? [up, minimum, maximum] : [maximum, minimum, down]
  return [floatByte(rgb[0]), floatByte(rgb[1]), floatByte(rgb[2]), source[3]]
}

/** Non-compatibility HSV/chroma adjustment, with float32 source arithmetic and
 * a byte store BEFORE mask/material/composite stages. Hue/saturation/value are
 * signed controls, not already normalized curves; alpha is preserved even at0.
 * This is the sibling model selected by native ordinary brush HSV options.
 */
export function adjustHsvChromaRgba8(source: Rgba8, hue: number, saturation: number, value: number): Rgba8 {
  validateRgba8Pixel(source)
  for (const v of [hue, saturation, value]) if (!Number.isFinite(v) || v < -1 || v > 1) throw new RangeError('Invalid signed HSV control')
  const dh = f(hue), ds = f(saturation), dv = f(value)
  const r = f(source[0] / 255), g = f(source[1] / 255), b = f(source[2] / 255)
  let maximum = Math.max(r, g, b), chroma = f(maximum - Math.min(r, g, b)), h = 0
  const epsilon = f(1e-9)
  if (maximum <= epsilon) {
    chroma = 0
    maximum = dv < 0 ? f(maximum * f(dv + 1)) : f(maximum + f(dv * f(1 - maximum)))
  } else {
    if (chroma > epsilon) {
      h = r === maximum ? f(f(g - b) / chroma)
        : g === maximum ? f(2 + f(f(b - r) / chroma)) : f(4 + f(f(r - g) / chroma))
      h = f(h * 60)
      h = f(h + f(dh * 180))
      if (h < 0) h = f(360 + h % 360)
      if (h >= 360) h = f(h % 360)
      chroma = ds > 0 ? Math.min(1, f(chroma * f(f(1 + ds) + f(2 * f(ds * ds))))) : f(chroma * f(ds + 1))
    }
    const movement = Math.abs(dv)
    maximum = f(maximum + f(movement * f((dv > 0 ? 1 : 0) - maximum)))
    chroma = f(chroma + f(movement * -chroma))
    maximum = clamp(maximum)
    chroma = Math.min(maximum, chroma)
  }
  if (maximum <= epsilon) return [0, 0, 0, source[3]]
  h = f(h / 60)
  const sextant = Math.trunc(h), fraction = f(h - sextant)
  const x = sextant & 1 ? f(chroma - f(chroma * fraction)) : f(chroma * fraction)
  const minimum = f(maximum - chroma), other = f(x + minimum)
  const rgb = sextant === 0 ? [maximum, other, minimum] : sextant === 1 ? [other, maximum, minimum]
    : sextant === 2 ? [minimum, maximum, other] : sextant === 3 ? [minimum, other, maximum]
      : sextant === 4 ? [other, minimum, maximum] : [maximum, minimum, other]
  return [floatByte(rgb[0]), floatByte(rgb[1]), floatByte(rgb[2]), source[3]]
}

/** Generic SC integer source law, separate from optimized F32 Over/AlphaDarken. */
export const SOURCE_RGBA8_GENERIC_SC_PROFILE = 'krita-generic-sc-u8-bd6e8d0-v1' as const
export type SourceRgba8SeparableMode = 'multiply' | 'lighten' | 'colorDodge' | 'overlay'
interface Rgba8CompositeParameters {
  readonly opacity: number
  readonly mask?: number
  readonly flow?: number
  readonly averageOpacity?: number
}
export type Rgba8CompositeControl = Rgba8CompositeParameters & (
  { readonly mode: 'over' | 'add' | 'alphaDarken'; readonly profile?: never } |
  { readonly mode: SourceRgba8SeparableMode; readonly profile: typeof SOURCE_RGBA8_GENERIC_SC_PROFILE }
)
export const SOURCE_RGBA8_COMPOSITE_MODES = ['over', 'add', 'alphaDarken', 'multiply', 'lighten', 'colorDodge', 'overlay'] as const
export function sourceRgba8CompositeModeId(mode: Rgba8CompositeControl['mode']): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const index = SOURCE_RGBA8_COMPOSITE_MODES.indexOf(mode)
  if (index < 0) throw new RangeError('Unknown RGBA8 composite mode')
  return index as 0 | 1 | 2 | 3 | 4 | 5 | 6
}
const separableModes: readonly string[] = ['multiply', 'lighten', 'colorDodge', 'overlay']
/** Closed byte-channel functions from the pinned generic SC functors. */
export function sourceRgba8SeparableChannel(mode: SourceRgba8SeparableMode, source: number, destination: number): number {
  if (!Number.isInteger(source) || source < 0 || source > 255 || !Number.isInteger(destination) || destination < 0 || destination > 255)
    throw new RangeError('Invalid separable byte channel')
  return separableChannel(mode, source, destination)
}
function separableChannel(mode: SourceRgba8SeparableMode, source: number, destination: number): number {
  if (mode === 'multiply') return multiply(source, destination)
  if (mode === 'lighten') return Math.max(source, destination)
  if (mode === 'colorDodge') return source === 255 ? destination === 0 ? 0 : 255 : Math.min(255, divide(destination, 255 - source))
  if (mode !== 'overlay') throw new RangeError('Unknown separable byte operation')
  if (destination === 127) return source
  if (destination < 127) return multiply(destination * 2, source)
  const doubled = destination * 2 - 255
  return doubled + source - multiply(doubled, source)
}
/** Same generic-SC branch/narrowing body used by addition and separable ops. */
function genericScChannel(source: number, destination: number, sa: number, da: number, alpha: number, cf: number): number {
  if (!da) return source
  if (da === 255) return blend(cf, destination, sa)
  if (sa === 255) return blend(cf, source, da)
  const premul = (multiply3(255 - sa, da, destination) + multiply3(255 - da, sa, source) + multiply3(da, sa, cf)) & 255
  return divide(premul, alpha) & 255
}
/** Validate the complete control before a caller allocates/writes surfaces. */
export function validateRgba8CompositeControl(control: Rgba8CompositeControl): void {
  if (!control || !['over', 'add', 'alphaDarken', ...separableModes].includes(control.mode)) throw new RangeError('Unknown composite mode')
  if (separableModes.includes(control.mode) && control.profile !== SOURCE_RGBA8_GENERIC_SC_PROFILE) throw new RangeError('Missing generic SC U8 profile')
  unit(control.opacity)
  if (control.mask !== undefined && (!Number.isInteger(control.mask) || control.mask < 0 || control.mask > 255)) throw new RangeError('Invalid mask byte')
  unit(control.flow ?? 1)
  unit(control.averageOpacity ?? control.opacity)
}
/** Material alpha is stored in U8 before painter opacity. RGB stays straight,
 * including hidden colour at alpha0. This is not a composite-mask parameter. */
export function applyRgba8AlphaMask(source: Rgba8, mask: number): Rgba8 {
  validateRgba8Pixel(source)
  if (!Number.isInteger(mask) || mask < 0 || mask > 255) throw new RangeError('Invalid mask byte')
  return [source[0], source[1], source[2], multiply(source[3], mask)]
}
/** Scalar byte composite, source/destination straight RGBA, all channels enabled.
 * A missing mask preserves the source's distinct two-factor Over path.
 * Alpha-darken uses the creamy policy; averageOpacity is explicit caller state.
 */
export function compositeRgba8(source: Rgba8, destination: Rgba8, control: Rgba8CompositeControl): Rgba8 {
  validateRgba8Pixel(source); validateRgba8Pixel(destination); validateRgba8CompositeControl(control)
  const flow = control.flow ?? 1, average = control.averageOpacity ?? control.opacity
  unit(flow); unit(average)
  const mask = control.mask ?? 255, opacity = opacityByte(control.opacity), da = destination[3]
  if (control.mode === 'over') {
    const sa = control.mask === undefined ? multiply(source[3], opacity) : multiply3(mask, source[3], opacity)
    if (!sa) return [...destination]
    const a = da + multiply(255 - da, sa)
    const factor = da === 255 ? sa : da === 0 ? 255 : divide(sa, a)
    return [blend(source[0], destination[0], factor), blend(source[1], destination[1], factor), blend(source[2], destination[2], factor), a]
  }
  if (control.mode === 'alphaDarken') {
    const masked = control.mask === undefined ? source[3] : multiply(mask, source[3])
    const sa = multiply(masked, opacity), av = opacityByte(average)
    const full = av > opacity ? av > da ? blend(av, sa, divide(da, av)) : da : opacity > da ? blend(opacity, da, masked) : da
    const a = f(flow) === 1 ? full : blend(full, da, opacityByte(flow))
    return [da ? blend(source[0], destination[0], sa) : source[0], da ? blend(source[1], destination[1], sa) : source[1], da ? blend(source[2], destination[2], sa) : source[2], a]
  }
  const sa = multiply3(source[3], mask, opacity)
  if (!sa) return [...destination]
  const a = sa + da - multiply(sa, da)
  const channel = (i: 0 | 1 | 2): number => genericScChannel(source[i], destination[i], sa, da, a,
    control.mode === 'add' ? Math.min(255, source[i] + destination[i]) : separableChannel(control.mode, source[i], destination[i]))
  return [channel(0), channel(1), channel(2), a]
}

export interface Rgba8GroupParticle {
  readonly color: Rgba8
  readonly opacity: number
  readonly mask?: number
}
/** One transient group is built with local Over, then transferred exactly once.
 * Source masks/coverage must already be supplied by the rasterizer. This function
 * neither invents Qt ellipse coverage nor substitutes a brush's noise source.
 */
export function compositeRgba8Group(destination: Rgba8, particles: readonly Rgba8GroupParticle[], outer: Rgba8CompositeControl): { group: Rgba8; output: Rgba8 } {
  if (particles.length > 65535) throw new RangeError('RGBA8 group budget exceeded')
  let group: Rgba8 = [0, 0, 0, 0]
  for (const p of particles) group = compositeRgba8(p.color, group, { mode: 'over', opacity: p.opacity, mask: p.mask })
  return { group, output: compositeRgba8(group, destination, outer) }
}
