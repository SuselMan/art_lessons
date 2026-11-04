import {sourceRgba8QuantizedAtan} from '../raster/sourceRgba8QuantizedAtan'
import { sourceFmaF32 } from './sourceFmaF32'
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
export const SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE = 'krita-installed-arm64-generic-hsy-u8-fused-fpcr0-v1' as const
/** Functional browser arithmetic; no installed/FMA pixel identity. */
export const SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE='browser-hsy-rgba8-functional-v1' as const
export const SOURCE_RGBA8_COLOR_HSY_PROFILE = 'krita-generic-hsy-u8-separate-f32-bd6e8d0-v1' as const
export const SOURCE_RGBA8_GENERIC_SC_PROFILE = 'krita-generic-sc-u8-bd6e8d0-v1' as const
export type SourceRgba8SeparableMode = 'multiply' | 'lighten' | 'colorDodge' | 'overlay' | 'darken' | 'screen' | 'colorBurn' | 'linearBurn' | 'subtract' | 'difference' | 'exclusion' | 'softLight' | 'hardLight' | 'divide' | 'linearLight' | 'vividLight' | 'pinLight' | 'hardMix' | 'hardMixPhotoshop' | 'softLightSvg' | 'darkerColor' | 'lighterColor' | 'hue' | 'saturation' | 'luminosity' | 'equivalence' | 'additiveSubtractive' | 'arcTangent' | 'negation' | 'inverseSubtract' | 'grainMerge' | 'grainExtract' | 'allanon' | 'geometricMean' | 'parallel' | 'reflect' | 'glow' | 'freeze' | 'heat' | 'glowHeat' | 'heatGlow' | 'reflectFreeze' | 'freezeReflect' | 'heatGlowFreezeReflectHybrid' | 'hardMixSofterPhotoshop' | 'penumbraA' | 'penumbraB' | 'penumbraC' | 'penumbraD' | 'flatLight' | 'binaryXor' | 'binaryOr' | 'binaryAnd' | 'binaryNand' | 'binaryNor' | 'binaryXnor' | 'binaryImplication' | 'binaryNotImplication' | 'binaryConverse' | 'binaryNotConverse' | 'tint' | 'increaseSaturation' | 'decreaseSaturation' | 'increaseLuminosity' | 'decreaseLuminosity' | 'colorHsl' | 'hueHsl' | 'saturationHsl' | 'increaseSaturationHsl' | 'decreaseSaturationHsl' | 'lightnessHsl' | 'increaseLightnessHsl' | 'decreaseLightnessHsl' | 'colorHsv' | 'hueHsv' | 'saturationHsv' | 'increaseSaturationHsv' | 'decreaseSaturationHsv' | 'valueHsv' | 'increaseValueHsv' | 'decreaseValueHsv' | 'colorHsi' | 'hueHsi' | 'saturationHsi' | 'increaseSaturationHsi' | 'decreaseSaturationHsi' | 'intensityHsi' | 'increaseIntensityHsi' | 'decreaseIntensityHsi' | 'gammaDark' | 'gammaLight' | 'gammaIllumination' | 'easyDodge' | 'easyBurn' | 'pNormA' | 'pNormB' | 'superLight' | 'softLightIfs' | 'softLightPegtop' | 'tintIfs' | 'shadeIfs' | 'fogLightenIfs' | 'fogDarkenIfs' | 'modulo' | 'moduloContinuous' | 'divisiveModulo' | 'divisiveModuloContinuous' | 'moduloShift' | 'moduloShiftContinuous' | 'hardOverlay' | 'interpolation' | 'interpolation2x' | 'lambertLighting' | 'lambertLightingGamma22' | 'combineNormal' | 'tangentNormalmap' | 'copyRed' | 'copyGreen' | 'copyBlue' | 'behind' | 'luminositySai' | 'greater'
interface Rgba8CompositeParameters {
  readonly opacity: number
  readonly mask?: number
  readonly flow?: number
  readonly averageOpacity?: number
}
export type Rgba8CompositeControl = Rgba8CompositeParameters & (
  { readonly mode: 'over' | 'add' | 'alphaDarken'; readonly profile?: never } |
  { readonly mode: SourceRgba8SeparableMode | 'add'; readonly profile: typeof SOURCE_RGBA8_GENERIC_SC_PROFILE } |
  { readonly mode: 'colorHsy'; readonly profile: typeof SOURCE_RGBA8_COLOR_HSY_PROFILE | typeof SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE | typeof SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE }
)
export const SOURCE_RGBA8_COMPOSITE_MODES = ['over', 'add', 'alphaDarken', 'multiply', 'lighten', 'colorDodge', 'overlay', 'darken', 'screen', 'colorBurn', 'linearBurn', 'subtract', 'difference', 'exclusion', 'softLight', 'hardLight', 'divide', 'linearLight', 'vividLight', 'pinLight', 'hardMix', 'darkerColor', 'lighterColor', 'hue', 'saturation', 'luminosity', 'hardMixPhotoshop', 'softLightSvg', 'equivalence', 'additiveSubtractive', 'arcTangent', 'negation', 'inverseSubtract', 'grainMerge', 'grainExtract', 'allanon', 'geometricMean', 'parallel', 'reflect', 'glow', 'freeze', 'heat', 'glowHeat', 'heatGlow', 'reflectFreeze', 'freezeReflect', 'heatGlowFreezeReflectHybrid', 'hardMixSofterPhotoshop', 'penumbraA', 'penumbraB', 'penumbraC', 'penumbraD', 'flatLight', 'binaryXor', 'binaryOr', 'binaryAnd', 'binaryNand', 'binaryNor', 'binaryXnor', 'binaryImplication', 'binaryNotImplication', 'binaryConverse', 'binaryNotConverse', 'tint', 'increaseSaturation', 'decreaseSaturation', 'increaseLuminosity', 'decreaseLuminosity', 'colorHsl', 'hueHsl', 'saturationHsl', 'increaseSaturationHsl', 'decreaseSaturationHsl', 'lightnessHsl', 'increaseLightnessHsl', 'decreaseLightnessHsl', 'colorHsv', 'hueHsv', 'saturationHsv', 'increaseSaturationHsv', 'decreaseSaturationHsv', 'valueHsv', 'increaseValueHsv', 'decreaseValueHsv', 'colorHsi', 'hueHsi', 'saturationHsi', 'increaseSaturationHsi', 'decreaseSaturationHsi', 'intensityHsi', 'increaseIntensityHsi', 'decreaseIntensityHsi', 'gammaDark', 'gammaLight', 'gammaIllumination', 'easyDodge', 'easyBurn', 'pNormA', 'pNormB', 'superLight', 'softLightIfs', 'softLightPegtop', 'tintIfs', 'shadeIfs', 'fogLightenIfs', 'fogDarkenIfs', 'modulo', 'moduloContinuous', 'divisiveModulo', 'divisiveModuloContinuous', 'moduloShift', 'moduloShiftContinuous', 'hardOverlay', 'interpolation', 'interpolation2x','lambertLighting','lambertLightingGamma22','combineNormal','tangentNormalmap', 'copyRed', 'copyGreen', 'copyBlue', 'behind', 'luminositySai', 'greater'] as const
export function sourceRgba8CompositeModeId(mode: Rgba8CompositeControl['mode']): number {
  const index = SOURCE_RGBA8_COMPOSITE_MODES.findIndex(candidate => candidate === mode)
  if (index < 0) throw new RangeError('Unknown RGBA8 composite mode')
  return index
}
const separableModes: readonly string[] = ['multiply', 'lighten', 'colorDodge', 'overlay', 'darken', 'screen', 'colorBurn', 'linearBurn', 'subtract', 'difference', 'exclusion', 'softLight', 'hardLight', 'divide', 'linearLight', 'vividLight', 'pinLight', 'hardMix', 'darkerColor', 'lighterColor', 'hue', 'saturation', 'luminosity', 'hardMixPhotoshop', 'softLightSvg', 'equivalence', 'additiveSubtractive', 'arcTangent', 'negation', 'inverseSubtract', 'grainMerge', 'grainExtract', 'allanon', 'geometricMean', 'parallel', 'reflect', 'glow', 'freeze', 'heat', 'glowHeat', 'heatGlow', 'reflectFreeze', 'freezeReflect', 'heatGlowFreezeReflectHybrid', 'hardMixSofterPhotoshop', 'penumbraA', 'penumbraB', 'penumbraC', 'penumbraD', 'flatLight', 'binaryXor', 'binaryOr', 'binaryAnd', 'binaryNand', 'binaryNor', 'binaryXnor', 'binaryImplication', 'binaryNotImplication', 'binaryConverse', 'binaryNotConverse', 'tint', 'increaseSaturation', 'decreaseSaturation', 'increaseLuminosity', 'decreaseLuminosity', 'colorHsl', 'hueHsl', 'saturationHsl', 'increaseSaturationHsl', 'decreaseSaturationHsl', 'lightnessHsl', 'increaseLightnessHsl', 'decreaseLightnessHsl', 'colorHsv', 'hueHsv', 'saturationHsv', 'increaseSaturationHsv', 'decreaseSaturationHsv', 'valueHsv', 'increaseValueHsv', 'decreaseValueHsv', 'colorHsi', 'hueHsi', 'saturationHsi', 'increaseSaturationHsi', 'decreaseSaturationHsi', 'intensityHsi', 'increaseIntensityHsi', 'decreaseIntensityHsi', 'gammaDark', 'gammaLight', 'gammaIllumination', 'easyDodge', 'easyBurn', 'pNormA', 'pNormB', 'superLight', 'softLightIfs', 'softLightPegtop', 'tintIfs', 'shadeIfs', 'fogLightenIfs', 'fogDarkenIfs', 'modulo', 'moduloContinuous', 'divisiveModulo', 'divisiveModuloContinuous', 'moduloShift', 'moduloShiftContinuous', 'hardOverlay', 'interpolation', 'interpolation2x','lambertLighting','lambertLightingGamma22','combineNormal','tangentNormalmap', 'copyRed', 'copyGreen', 'copyBlue', 'behind', 'luminositySai', 'greater']
export const SOURCE_RGBA8_GENERIC_SC_MODES:readonly (SourceRgba8SeparableMode|'add')[]=[...SOURCE_RGBA8_COMPOSITE_MODES.filter((mode):mode is SourceRgba8SeparableMode=>mode!=='over'&&mode!=='add'&&mode!=='alphaDarken'),'add']
/** Closed channel functors. Whole-RGB modes require compositeRgba8, which
 * supplies all three channels and preserves the generic HSL alpha shell. */
export function sourceRgba8SeparableChannel(mode: SourceRgba8SeparableMode, source: number, destination: number): number {
  if (!Number.isInteger(source) || source < 0 || source > 255 || !Number.isInteger(destination) || destination < 0 || destination > 255)
    throw new RangeError('Invalid separable byte channel')
  const hsxId=sourceRgba8CompositeModeId(mode);if(hsxId>=119&&hsxId<=124)throw new RangeError('Custom composite mode requires RGBA channels');if(hsxId>=115&&hsxId<=118)throw new RangeError('Normal vector mode requires RGB channels');if(hsxId>=63&&hsxId<=91)throw new RangeError('HSX vector mode requires RGB channels')
  return separableChannel(mode, source, destination)
}
// Pinned Quadratic U8: materialize biased M before rounded Q; never divide at endpoints.
function quadraticGlow(source:number,destination:number):number{return destination===255?255:Math.min(255,divide(multiply(source,source),255-destination))}
function quadraticHeat(source:number,destination:number):number{return source===255?255:destination===0?0:255-Math.min(255,divide(multiply(255-source,255-source),destination))}
function quadraticHeatGlow(source:number,destination:number):number{return source+destination>255?quadraticHeat(source,destination):source===0?0:quadraticGlow(source,destination)}
function quadraticFreezeReflect(source:number,destination:number):number{return source+destination>255?quadraticHeat(destination,source):destination===0?0:quadraticGlow(destination,source)}
function quadraticGlowHeat(source:number,destination:number):number{return destination===255?255:source+destination>255?quadraticGlow(source,destination):quadraticHeat(source,destination)}
// Native CFPenumbraB<quint8>: swapped SDR dodge is narrowed BEFORE /2;
// opposite branch halves qint32 quotient BEFORE clamp/narrow. D255 precedes every division.
function penumbraB(source:number,destination:number):number{
 if(destination===255)return 255
 if(source+destination<255)return Math.trunc(Math.min(255,divide(source,255-destination))/2)
 if(source===0)return 0
 return 255-Math.min(255,Math.trunc(divide(255-destination,source)/2))
}
function penumbraD(source:number,destination:number):number{return destination===255?255:sourceRgba8QuantizedAtan(source,255-destination)}
// Scalar23 preserves native staging; five epsilon modes explicitly use a defined rational-U8 law.
function rationalModuloContinuous(source:number,destination:number):number{
 if(destination===0||source===0)return 0
 const remainder=(destination-1)%source+1,odd=Math.floor((destination+source-1)/source)%2===1
 return divide(odd?remainder:source-remainder,source)
}
function scalar23Round(value:number):number{return Math.trunc(clamp(value)*255+.5)}
function scalar23GammaDark(source:number,destination:number):number{
 if(destination===0)return 0;if(destination===255)return 255;if(source===0)return 0
 return scalar23Round(Math.pow(Math.fround(destination/255),1/Math.fround(source/255)))
}
function scalar23Interpolation(source:number,destination:number):number{
 if(source===0&&destination===0)return 0
 return scalar23Round(.5-.25*Math.cos(Math.PI*Math.fround(source/255))-.25*Math.cos(Math.PI*Math.fround(destination/255)))
}
function scalar23Channel(mode:SourceRgba8SeparableMode,source:number,destination:number):number{
 if(mode==='modulo')return destination%(source+1)
 if(mode==='moduloContinuous')return multiply(rationalModuloContinuous(source,destination),source)
 if(mode==='divisiveModulo'){if(destination===0)return 0;if(source===0)return destination;return divide((destination-1)%source+1,source)}
 if(mode==='divisiveModuloContinuous')return rationalModuloContinuous(source,destination)
 if(mode==='moduloShift'){if(source===255&&destination===0)return 0;const sum=source+destination;return sum===0?0:(sum-1)%255+1}
 if(mode==='moduloShiftContinuous'){const sum=source+destination;return sum<=255?sum:510-sum}
 if(mode==='hardOverlay'){if(destination===0)return 0;if(source===255)return 255;return Math.min(255,source>=127?Math.floor(destination*255/(2*(255-source))):Math.floor(destination*2*source/255))}
 if(mode==='softLightPegtop')return Math.min(255,multiply(destination,source+destination-multiply(source,destination))+multiply(multiply(source,destination),255-destination))
 if(mode==='gammaDark')return scalar23GammaDark(source,destination)
 if(mode==='gammaIllumination')return 255-scalar23GammaDark(255-source,255-destination)
 if(mode==='interpolation')return scalar23Interpolation(source,destination)
 if(mode==='interpolation2x'){const inner=scalar23Interpolation(source,destination);return scalar23Interpolation(inner,inner)}
 // Native normalized qreal modes start from float-LUT values promoted to double.
 const x=Math.fround(source/255),y=Math.fround(destination/255)
 if(mode==='gammaLight')return destination===0?0:destination===255?255:scalar23Round(Math.pow(y,x))
 if(mode==='easyDodge')return source===255?255:destination===0?0:scalar23Round(Math.pow(y,(1-x)*1.039999999))
 if(mode==='easyBurn')return destination===0?0:scalar23Round(1-Math.pow(source===255?1-.999999999999:1-x,y*1.039999999))
 // clamp<quint8> takes qint32: truncate real result BEFORE clamp, no half-up.
 if(mode==='pNormA')return Math.max(0,Math.min(255,Math.trunc(Math.pow(Math.pow(destination,2.3333333333333333)+Math.pow(source,2.3333333333333333),.428571428571434))))
 if(mode==='pNormB')return Math.max(0,Math.min(255,Math.trunc(Math.pow(Math.pow(destination,4)+Math.pow(source,4),.25))))
 if(mode==='superLight')return scalar23Round(x<.5?1-Math.pow(Math.pow(1-y,2.875)+Math.pow(1-2*x,2.875),1/2.875):Math.pow(Math.pow(y,2.875)+Math.pow(2*x-1,2.875),1/2.875))
 if(mode==='softLightIfs')return scalar23Round(Math.pow(y,Math.pow(2,2*(.5-x))))
 if(mode==='tintIfs')return scalar23Round(x*(1-y)+Math.sqrt(y))
 if(mode==='shadeIfs')return scalar23Round(1-((1-y)*x+Math.sqrt(1-x)))
 if(mode==='fogLightenIfs')return scalar23Round(x<.5?1-(1-x)*x-(1-y)*(1-x):x-(1-y)*(1-x)+Math.pow(1-x,2))
 if(mode==='fogDarkenIfs')return scalar23Round(x<.5?(1-x)*x+x*y:x*y+x-Math.pow(x,2))
 throw new RangeError('Unknown scalar23 mode')
}
function separableChannel(mode: SourceRgba8SeparableMode, source: number, destination: number): number {
  switch(mode){
   case 'gammaDark':
   case 'gammaLight':
   case 'gammaIllumination':
   case 'easyDodge':
   case 'easyBurn':
   case 'pNormA':
   case 'pNormB':
   case 'superLight':
   case 'softLightIfs':
   case 'softLightPegtop':
   case 'tintIfs':
   case 'shadeIfs':
   case 'fogLightenIfs':
   case 'fogDarkenIfs':
   case 'modulo':
   case 'moduloContinuous':
   case 'divisiveModulo':
   case 'divisiveModuloContinuous':
   case 'moduloShift':
   case 'moduloShiftContinuous':
   case 'hardOverlay':
   case 'interpolation':
   case 'interpolation2x':
    return scalar23Channel(mode,source,destination)
  }
  // Explicit defined-uint32-wrap-u8-v1 functional interpretation; no native UB/ISA identity.
  if(mode==='binaryXor')return source^destination
  if(mode==='binaryOr')return source|destination
  if(mode==='binaryAnd')return source&destination
  if(mode==='binaryNand')return 255^(source&destination)
  if(mode==='binaryNor')return 255^(source|destination)
  if(mode==='binaryXnor')return 255^(source^destination)
  if(mode==='binaryImplication')return source|(255^destination)
  if(mode==='binaryNotImplication')return (255^source)&destination
  if(mode==='binaryConverse')return (255^source)|destination
  if(mode==='binaryNotConverse')return source&(255^destination)

  if(mode==='hardMixSofterPhotoshop')return Math.max(0,Math.min(255,3*destination-2*(255-source)))
  if(mode==='penumbraA')return penumbraB(destination,source)
  if(mode==='penumbraB')return penumbraB(source,destination)
  if(mode==='penumbraC')return penumbraD(destination,source)
  if(mode==='penumbraD')return penumbraD(source,destination)
  if(mode==='flatLight')return source===0?0:destination>source?penumbraB(source,destination):penumbraB(destination,source)

  if(mode==='reflect')return quadraticGlow(destination,source)
  if(mode==='glow')return quadraticGlow(source,destination)
  if(mode==='freeze')return quadraticHeat(destination,source)
  if(mode==='heat')return quadraticHeat(source,destination)
  if(mode==='glowHeat')return quadraticGlowHeat(source,destination)
  if(mode==='heatGlow')return quadraticHeatGlow(source,destination)
  if(mode==='reflectFreeze')return quadraticGlowHeat(destination,source)
  if(mode==='freezeReflect')return quadraticFreezeReflect(source,destination)
  if(mode==='heatGlowFreezeReflectHybrid')return Math.trunc((quadraticFreezeReflect(source,destination)+quadraticHeatGlow(source,destination))*127/255)

  // Pinned U8 functors: halfValue=127, Allanon truncates, Parallel retains
  // integer reciprocal division. Not textbook normalized-float substitutions.
  if(mode==='additiveSubtractive')return Math.trunc(255*Math.abs(Math.sqrt(destination/255)-Math.sqrt(source/255))+.5)
  if(mode==='arcTangent')return sourceRgba8QuantizedAtan(source,destination)
  if(mode==='negation')return 255-Math.abs(255-source-destination)
  if(mode==='grainMerge')return Math.max(0,Math.min(255,source+destination-127))
  if(mode==='grainExtract')return Math.max(0,Math.min(255,destination-source+127))
  if(mode==='allanon')return Math.trunc((source+destination)*127/255)
  if(mode==='geometricMean')return source===255&&destination===255?255:Math.trunc(255*Math.sqrt((source/255)*(destination/255))+.5)
  if(mode==='parallel')return !source||!destination?0:Math.min(255,Math.trunc(130050/(divide(255,source)+divide(255,destination))))
  if (mode === 'multiply') return multiply(source, destination)
  if (mode === 'lighten') return Math.max(source, destination)
  if (mode === 'colorDodge') return source === 255 ? destination === 0 ? 0 : 255 : Math.min(255, divide(destination, 255 - source))
  if (mode === 'darken') return Math.min(source,destination)
  if (mode === 'screen') return source+destination-multiply(source,destination)
  if (mode === 'colorBurn') return destination===255?255:source===0?0:255-Math.min(255,divide(255-destination,source))
  if (mode === 'linearBurn'||mode==='inverseSubtract') return Math.max(0,source+destination-255)
  if (mode === 'subtract') return Math.max(0,destination-source)
  if (mode === 'difference'||mode==='equivalence') return Math.abs(destination-source)
  if (mode === 'exclusion') return Math.max(0,Math.min(255,source+destination-2*multiply(source,destination)))
  if (mode === 'divide') return destination===0?0:source===0?255:Math.min(255,divide(destination,source))
  if (mode === 'linearLight') return Math.max(0,Math.min(255,2*source+destination-255))
  if (mode === 'pinLight') return Math.max(2*source-255,Math.min(destination,2*source))
  if (mode === 'hardMix') return separableChannel(destination>127?'colorDodge':'colorBurn',source,destination)
  if (mode === 'hardMixPhotoshop') return source+destination>255?255:0
  if (mode === 'vividLight') return source<127
    ?source===0?(destination===255?255:0):Math.max(0,255-divide(255-destination,2*source))
    :source===255?(destination===0?0:255):Math.min(255,divide(destination,2*(255-source)))
  if (mode === 'softLight'||mode==='softLightSvg') {
    const x=source/255,y=destination/255
    return Math.trunc(255*(x>.5?y+(2*x-1)*((mode==='softLightSvg'&&y<=.25?((16*y-12)*y+4)*y:Math.sqrt(y))-y):y-(1-2*x)*y*(1-y))+.5)
  }
  if (mode === 'hardLight') return separableChannel('overlay',destination,source)
  if (mode !== 'overlay') throw new RangeError('Vector RGB operation needs complete pixels')
  if (destination === 127) return source
  if (destination < 127) return multiply(destination * 2, source)
  const doubled = destination * 2 - 255
  return doubled + source - multiply(doubled, source)
}
/** Pinned HSY graph with explicit separate or installed ARM64 contraction.
 * Installed luminance has G*MUL then R/B FMADD; tone-map product is rounded
 * before reciprocal FMADD. Keep original ToneMapping l/n/x across both passes. */
function colorHsyChannels(source: Rgba8, destination: Rgba8, fused = false): [number, number, number] {
  const lum = (r: number, g: number, b: number) => fused ? sourceFmaF32(b, f(.114), sourceFmaF32(r, f(.299), f(g * f(.587)))) : f(f(f(f(.299) * r) + f(f(.587) * g)) + f(f(.114) * b))
  const src = [f(source[0] / 255), f(source[1] / 255), f(source[2] / 255)]
  const light = lum(f(destination[0] / 255), f(destination[1] / 255), f(destination[2] / 255))
  const delta = f(light - lum(src[0], src[1], src[2]))
  let r = f(src[0] + delta), g = f(src[1] + delta), b = f(src[2] + delta)
  const l = lum(r, g, b), n = Math.min(r, g, b), x = Math.max(r, g, b)
  if (n < 0) {
    const stretch = f(l - n)
    if (l <= f(.00001) || stretch < 2 ** -23) r = g = b = 0
    else {
      const iln = f(1 / stretch)
      r = fused ? sourceFmaF32(f(f(r - l) * l), iln, l) : f(l + f(f(f(r - l) * l) * iln))
      g = fused ? sourceFmaF32(f(f(g - l) * l), iln, l) : f(l + f(f(f(g - l) * l) * iln))
      b = fused ? sourceFmaF32(f(f(b - l) * l), iln, l) : f(l + f(f(f(b - l) * l) * iln))
    }
  }
  if (x > 1) {
    const stretch = f(x - l)
    if (l > 1 || stretch < 2 ** -23) r = g = b = 1
    else {
      const il = f(1 - l), ixl = f(1 / stretch)
      r = fused ? sourceFmaF32(f(f(r - l) * il), ixl, l) : f(l + f(f(f(r - l) * il) * ixl))
      g = fused ? sourceFmaF32(f(f(g - l) * il), ixl, l) : f(l + f(f(f(g - l) * il) * ixl))
      b = fused ? sourceFmaF32(f(f(b - l) * il), ixl, l) : f(l + f(f(f(b - l) * il) * ixl))
    }
  }
  // possiblyFixNegativeValuesNearZeroPoint<quint8> is deliberately a no-op.
  return [r, g, b]
}
export function sourceRgba8ColorHsyChannels(source: Rgba8, destination: Rgba8, profile: typeof SOURCE_RGBA8_COLOR_HSY_PROFILE | typeof SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE | typeof SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE = SOURCE_RGBA8_COLOR_HSY_PROFILE): readonly [number, number, number] {
  validateRgba8Pixel(source); validateRgba8Pixel(destination)
  if (profile !== SOURCE_RGBA8_COLOR_HSY_PROFILE && profile !== SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE && profile !== SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE) throw new RangeError('Unknown HSY profile')
  return colorHsyChannels(source, destination, profile === SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE)
}
/** Functional sRGB/HSY vector functors; whole-RGB selection is intentional.
 * These browser modes do not claim native ICC/ISA pixel identity. */
type SourceRgba8VectorMode=Extract<SourceRgba8SeparableMode,'darkerColor'|'lighterColor'|'hue'|'saturation'|'luminosity'|'tint'|'increaseSaturation'|'decreaseSaturation'|'increaseLuminosity'|'decreaseLuminosity'|'colorHsl'|'hueHsl'|'saturationHsl'|'increaseSaturationHsl'|'decreaseSaturationHsl'|'lightnessHsl'|'increaseLightnessHsl'|'decreaseLightnessHsl'|'colorHsv'|'hueHsv'|'saturationHsv'|'increaseSaturationHsv'|'decreaseSaturationHsv'|'valueHsv'|'increaseValueHsv'|'decreaseValueHsv'|'colorHsi'|'hueHsi'|'saturationHsi'|'increaseSaturationHsi'|'decreaseSaturationHsi'|'intensityHsi'|'increaseIntensityHsi'|'decreaseIntensityHsi'|'lambertLighting'|'lambertLightingGamma22'|'combineNormal'|'tangentNormalmap'>
const vectorModes:readonly SourceRgba8VectorMode[]=['darkerColor','lighterColor','hue','saturation','luminosity','tint','increaseSaturation','decreaseSaturation','increaseLuminosity','decreaseLuminosity', 'colorHsl', 'hueHsl', 'saturationHsl', 'increaseSaturationHsl', 'decreaseSaturationHsl', 'lightnessHsl', 'increaseLightnessHsl', 'decreaseLightnessHsl', 'colorHsv', 'hueHsv', 'saturationHsv', 'increaseSaturationHsv', 'decreaseSaturationHsv', 'valueHsv', 'increaseValueHsv', 'decreaseValueHsv', 'colorHsi', 'hueHsi', 'saturationHsi', 'increaseSaturationHsi', 'decreaseSaturationHsi', 'intensityHsi', 'increaseIntensityHsi', 'decreaseIntensityHsi','lambertLighting','lambertLightingGamma22','combineNormal','tangentNormalmap']
function isVectorMode(mode:SourceRgba8SeparableMode|'add'):mode is SourceRgba8VectorMode{return vectorModes.some(candidate=>candidate===mode)}
// Unshipped IDs63..91 only: deterministic browser HSX Q65535 staged integer law.
// Exact input byte*257; positive ratios round nearest ties up, signed ratios ties away.
// CPU products <=3*65535^2 (<2^34) are exact Number integers. GLSL uses exact limb products.
const HSX_Q=65535
function hsxRoundRatio(n:number,d:number):number{
 const magnitude=Math.abs(n),q=Math.floor(magnitude/d),r=magnitude-q*d
 return Math.sign(n)*(q+(r*2>=d?1:0))
}
function hsxQuantizedVector(id:number,source:Rgba8,destination:Rgba8):number[]{
 const Q=HSX_Q,model=id<68?0:1+Math.floor((id-68)/8),op=id<68?[-1,3,4,6,7][id-63]:(id-68)%8
 const a=source.slice(0,3).map(v=>v*257),b=destination.slice(0,3).map(v=>v*257)
 const light=(c:readonly number[])=>{
  const lo=Math.min(...c),hi=Math.max(...c)
  if(model===0)return lo+hsxRoundRatio((c[0]-lo)*299+(c[1]-lo)*587+(c[2]-lo)*114,1000)
  if(model===1)return hsxRoundRatio(hi+lo,2)
  if(model===2)return hi
  return hsxRoundRatio(c[0]+c[1]+c[2],3)
 }
 const sat=(c:readonly number[])=>{
  const hi=Math.max(...c),lo=Math.min(...c),chroma=hi-lo
  if(model===0)return chroma
  if(model===1){const d=Q-Math.abs(hi+lo-Q);return d>0?hsxRoundRatio(chroma*Q,d):0}
  if(model===2)return hi>0?hsxRoundRatio(chroma*Q,hi):0
  return chroma>0?Q-hsxRoundRatio(3*lo*Q,c[0]+c[1]+c[2]):0
 }
 const la=light(a),lb=light(b)
 const bytes=(c:readonly number[])=>c.map(v=>hsxRoundRatio(Math.max(0,Math.min(Q,v))*255,Q))
 if(op===-1)return bytes(a.map(v=>lb+hsxRoundRatio(v*(Q-lb),Q)))
 let c=op===0||op===1?[...a]:[...b]
 if(op>=1&&op<=4){
  const sa=sat(a),sd=sat(b),target=op===1?sd:op===2?sa:op===3?sd+hsxRoundRatio((Q-sd)*sa,Q):hsxRoundRatio(sd*sa,Q)
  const lo=Math.min(...c),chroma=Math.max(...c)-lo
  c=chroma>0?c.map(v=>hsxRoundRatio((v-lo)*target,chroma)):[0,0,0]
 }
 const delta=op<=4?lb-light(c):op===5?la-lb:op===6?la:la-Q
 c=c.map(v=>v+delta)
 // Snapshot pre-ToneMapping extrema. Positive grid step exceeds native fuzzy1e-5.
 const l=light(c),n=Math.min(...c),x=Math.max(...c)
 if(n<0)c=l<=0||l-n<=0?[0,0,0]:c.map(v=>l+hsxRoundRatio((v-l)*l,l-n))
 if(x>Q)c=l>Q||x-l<=0?(model===2?c.map(v=>Math.min(v,Q)):[Q,Q,Q]):c.map(v=>l+hsxRoundRatio((v-l)*(Q-l),x-l))
 return bytes(c)
}
// IDs115..118 functional Q65535 normal/lighting vector graph; no native byte/ISA claim.
function normal4Isqrt(n:number):number{
 let q=Math.floor(Math.sqrt(n))
 if(q*q>n)q--;else if((q+1)*(q+1)<=n)q++
 return q
}
function normal4Vector(id:number,source:Rgba8,destination:Rgba8):number[]{
 const Q=HSX_Q,a=source.slice(0,3).map(v=>v*257),b=destination.slice(0,3).map(v=>v*257)
 const bytes=(c:readonly number[],scale=Q)=>c.map(v=>hsxRoundRatio(Math.max(0,Math.min(scale,v))*255,scale))
 if(id===118)return bytes([2*(a[0]+b[0])-Q,2*(a[1]+b[1])-Q,2*(a[2]+b[2]-Q)],2*Q)
 if(id===117){
  if(a[2]===0)return destination.slice(0,3)
  const t=[2*a[0]-Q,2*a[1]-Q,2*a[2]],u=[Q-2*b[0],Q-2*b[1],2*b[2]-Q]
  const dot=t.reduce((sum,v,i)=>sum+hsxRoundRatio(v*u[i],Q),0)
  let h=t.map((v,i)=>hsxRoundRatio(v*dot,Q)-hsxRoundRatio(u[i]*t[2],Q))
  const largest=Math.max(...h.map(Math.abs));if(largest===0)return destination.slice(0,3)
  h=h.map(v=>hsxRoundRatio(v*Q,largest));const length=normal4Isqrt(h.reduce((sum,v)=>sum+v*v,0))
  return bytes(h.map(v=>hsxRoundRatio(v*Q,length)+Q),2*Q)
 }
 let c=a.map((v,i)=>{const product=hsxRoundRatio(v*b[i],Q),tr=id===115?hsxRoundRatio(product*500000,107843):product*2;if(tr<=Q)return tr;const square=hsxRoundRatio((tr-Q)*(tr-Q),Q);return Q+(id===115?hsxRoundRatio(square*1925,100000):hsxRoundRatio(square*2,5))})
 const light=(v:readonly number[])=>hsxRoundRatio(v[0]+v[1]+v[2],3),l=light(c),lo=Math.min(...c),hi=Math.max(...c)
 if(lo<0)c=l<=0||l-lo<=0?[0,0,0]:c.map(v=>l+hsxRoundRatio((v-l)*l,l-lo))
 if(hi>Q)c=l>Q||hi-l<=0?[Q,Q,Q]:c.map(v=>l+hsxRoundRatio((v-l)*(Q-l),hi-l))
 return bytes(c)
}
function vectorBlend(mode:SourceRgba8SeparableMode,source:Rgba8,destination:Rgba8):number[]{
 const hsxId=sourceRgba8CompositeModeId(mode);if(hsxId>=115&&hsxId<=118)return normal4Vector(hsxId,source,destination);if(hsxId>=63&&hsxId<=91)return hsxQuantizedVector(hsxId,source,destination)
 const a=source.slice(0,3).map(x=>x/255),b=destination.slice(0,3).map(x=>x/255)
 const lum=(c:readonly number[])=>.299*c[0]+.587*c[1]+.114*c[2]
 if(mode==='darkerColor'||mode==='lighterColor')return ((mode==='darkerColor'?lum(a)<lum(b):lum(a)>lum(b))?a:b).map(x=>Math.trunc(x*255+.5))
 let c=mode==='hue'?[...a]:[...b]
 if(mode!=='luminosity'){
  const sat=Math.max(...(mode==='hue'?b:a))-Math.min(...(mode==='hue'?b:a)),lo=Math.min(...c),hi=Math.max(...c)
  c=hi-lo>2**-23?c.map(x=>(x-lo)*sat/(hi-lo)):[0,0,0]
 }
 const target=lum(mode==='luminosity'?a:b),delta=target-lum(c);c=c.map(x=>x+delta)
 const l=lum(c),n=Math.min(...c),x=Math.max(...c)
 if(n<0)c=l<=.00001||l-n<2**-23?[0,0,0]:c.map(v=>l+(v-l)*l/(l-n))
 if(x>1)c=l>1||x-l<2**-23?[1,1,1]:c.map(v=>l+(v-l)*(1-l)/(x-l))
 return c.map(v=>Math.trunc(clamp(v)*255+.5))
}
// Custom nondestructive RGBA shells119..124; no genericSC CF/unmultiply shortcut.
const GREATER_Q_WEIGHTS=Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5, 5, 6, 7, 9, 10, 12, 14, 16, 19, 22, 26, 30, 35, 41, 48, 56, 66, 77, 90, 105, 123, 144, 169, 197, 230, 269, 315, 368, 430, 503, 587, 686, 801, 935, 1091, 1273, 1484, 1730, 2015, 2344, 2726, 3167, 3674, 4258, 4927, 5691, 6560, 7546, 8658, 9907, 11299, 12842, 14539, 16391, 18393, 20538, 22812, 25197, 27669, 30203, 32768, 35332, 37866, 40338, 42723, 44997, 47142, 49144, 50996, 52693, 54236, 55628, 56877, 57989, 58975, 59844, 60608, 61277, 61861, 62368, 62809, 63191, 63520, 63805, 64051, 64262, 64444, 64600, 64734, 64849, 64948, 65032, 65105, 65167, 65220, 65266, 65305, 65338, 65366, 65391, 65412, 65430, 65445, 65458, 65469, 65479, 65487, 65494, 65500, 65505, 65509, 65513, 65516, 65519, 65521, 65523, 65525, 65526, 65528, 65529, 65530, 65530, 65531, 65532, 65532, 65533, 65533, 65533, 65533, 65534, 65534, 65534, 65534, 65534, 65534, 65534, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535])
function custom6Rgba(mode:SourceRgba8SeparableMode,source:Rgba8,destination:Rgba8,opacity:number,mask:number):Rgba8{
 const da=destination[3],sa=multiply3(source[3],mask,opacity)
 if(mode==='copyRed'||mode==='copyGreen'||mode==='copyBlue'){
  const index=mode==='copyRed'?0:mode==='copyGreen'?1:2,t=multiply(source[3],multiply(opacity,mask)),rgb=[...destination]as[number,number,number,number]
  rgb[index]=blend(source[index],destination[index],t);return rgb
 }
 if(sa===0)return[...destination]
 if(mode==='luminositySai'){const a=sa+da-multiply(sa,da);return[Math.min(255,destination[0]+multiply(source[0],sa)),Math.min(255,destination[1]+multiply(source[1],sa)),Math.min(255,destination[2]+multiply(source[2],sa)),a]}
 if(da===255)return[...destination]
 if(mode==='behind'){
  const a=sa+da-multiply(sa,da);if(da===0)return[source[0],source[1],source[2],a]
  const channel=(i:0|1|2)=>Math.min(255,divide(blend(destination[i],multiply(source[i],sa),da),a))
  return[channel(0),channel(1),channel(2),a]
 }
 const Q=65535,dq=da*257,sq=sa*257,w=GREATER_Q_WEIGHTS[da-sa+255]
 const aq=Math.max(dq,hsxRoundRatio(dq*w+sq*(Q-w),Q)),a=hsxRoundRatio(aq*255,Q)
 if(a===0)return[destination[0],destination[1],destination[2],0]
 if(da===0)return[source[0],source[1],source[2],a]
 const fake=hsxRoundRatio((aq-dq)*255,Q-dq),channel=(i:0|1|2)=>Math.min(255,divide(blend(source[i],multiply(destination[i],da),fake),a))
 return[channel(0),channel(1),channel(2),a]
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
  if (!control || !['over', 'add', 'alphaDarken', 'colorHsy', ...separableModes].includes(control.mode)) throw new RangeError('Unknown composite mode')
  if ((separableModes.includes(control.mode)||control.mode==='add'&&control.profile!==undefined) && control.profile !== SOURCE_RGBA8_GENERIC_SC_PROFILE) throw new RangeError('Missing generic SC U8 profile')
  if (control.mode === 'colorHsy' && control.profile !== SOURCE_RGBA8_COLOR_HSY_PROFILE && control.profile !== SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE && control.profile !== SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE) throw new RangeError('Missing explicit HSY profile')
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
  if(control.mode==='copyRed'||control.mode==='copyGreen'||control.mode==='copyBlue'||control.mode==='behind'||control.mode==='luminositySai'||control.mode==='greater')return custom6Rgba(control.mode,source,destination,opacity,mask)
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
  if (control.mode === 'colorHsy') {
    const sa = multiply3(source[3], mask, opacity), alpha = sa + da - multiply(sa, da)
    if (alpha === 0) return [destination[0], destination[1], destination[2], alpha]
    const cf = colorHsyChannels(source, destination, control.profile === SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE).map(floatByte)
    const channel = (i: 0 | 1 | 2) => divide((multiply3(255 - sa, da, destination[i])
      + multiply3(255 - da, sa, source[i]) + multiply3(da, sa, cf[i])) & 255, alpha) & 255
    // GenericHSLFunctor has NONE of GenericSC's source/full/empty-alpha shortcuts.
    return [channel(0), channel(1), channel(2), alpha]
  }
  const sa = multiply3(source[3], mask, opacity)
  if (!sa) return [...destination]
  const a = sa + da - multiply(sa, da)
  const mode = control.mode
  if(isVectorMode(mode)){
    const cf=vectorBlend(mode,source,destination)
    const channel=(i:0|1|2)=>divide((multiply3(255-sa,da,destination[i])+multiply3(255-da,sa,source[i])+multiply3(da,sa,cf[i]))&255,a)&255
    return[channel(0),channel(1),channel(2),a]
  }
  const channel = (i: 0 | 1 | 2): number => genericScChannel(source[i], destination[i], sa, da, a,
    mode === 'add' ? Math.min(255, source[i] + destination[i]) : separableChannel(mode, source[i], destination[i]))
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

/** Native Darken's actual QColor RGB stage, using the explicit sRGB functional
 * profile. Native ICC/Lab roundtrip rounding is deliberately not reproduced. */
export function darkenSourceRgba8(source:Rgba8,sizeLike:number):Rgba8{
 validateRgba8Pixel(source);unit(sizeLike)
 const shade=Math.trunc(255-255*sizeLike)
 return[Math.trunc(source[0]*shade/255),Math.trunc(source[1]*shade/255),Math.trunc(source[2]*shade/255),source[3]]
}
