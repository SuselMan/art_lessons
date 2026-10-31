import { sourceFmaF64 } from './sourceFmaF64'
import { sourceGaussianBionicErf, sourceGaussianBrowserErf } from './sourceGaussianBionicErf'
import type { SourceGaussianResolvedCoefficients } from './sourceGaussianResolvedMaskReference'

/** Isolated installed ARM64 coefficient law; no descriptor or renderer admission. */
export interface SourceGaussianCoefficientInput {
  diameter: number
  ratio: number
  horizontalFade: number
  verticalFade: number
  scaleX: number
  scaleY: number
}
export function sourceGaussianCoefficients(input: SourceGaussianCoefficientInput, arithmetic:'native'|'browser-number'='native'): {
  coefficients: SourceGaussianResolvedCoefficients
  effectiveWidth: number
  effectiveHeight: number
} {
  if(arithmetic!=='native'&&arithmetic!=='browser-number')throw new RangeError('Unknown Gaussian coefficient arithmetic')
  const mulAdd=arithmetic==='browser-number'?(a:number,b:number,c:number)=>a*b+c:sourceFmaF64
  const erf=arithmetic==='browser-number'?sourceGaussianBrowserErf:sourceGaussianBionicErf
  const { diameter, ratio, horizontalFade: fh, verticalFade: fv, scaleX, scaleY } = input
  if (![diameter, ratio, fh, fv, scaleX, scaleY].every(Number.isFinite)
    || diameter <= 0 || ratio <= 0 || ratio > 1 || scaleX <= 0 || scaleY <= 0
    || fh < 0 || fh > 1 || fv < 0 || fv > 1) throw new RangeError('Unsupported Gaussian coefficient inputs')
  let fade = 1 - (fh + fv) / 2
  if (fade === 0) fade = 1e-6
  else if (fade === 1) fade = 1 - 1e-6
  const center = (mulAdd(fade, 6761, -10000) * 2.5) / (fade * (Math.SQRT2 * 6761))
  const alphafactor = 255 / (2 * erf(center))
  const effectiveWidth = diameter * scaleX
  const effectiveHeight = (diameter * ratio) * scaleY
  const ycoef = scaleX / (scaleY * ratio)
  const distfactor = (Math.SQRT2 * 12500) / (((6761 * fade) * effectiveWidth) * .5)
  const radius = .5 * effectiveWidth
  const fadeStart = Math.max(0, radius - 1)
  const dist = fadeStart * distfactor
  const raw = alphafactor * (erf(dist + center) - erf(dist - center))
  const fadeStartValue = 255 - (Math.trunc(raw) & 255)
  const fadeCoeff = Math.max(0, 255 - fadeStartValue) / (radius - fadeStart)
  const coefficients = { ycoef, center, distfactor, alphafactor, radius, fadeStartValue, fadeStart, fadeCoeff }
  if (![effectiveWidth, effectiveHeight, ...Object.values(coefficients)].every(Number.isFinite)
    || effectiveWidth <= 0 || effectiveHeight <= 0 || radius <= fadeStart) throw new RangeError('Gaussian coefficient intermediate outside finite domain')
  return { coefficients, effectiveWidth, effectiveHeight }
}
