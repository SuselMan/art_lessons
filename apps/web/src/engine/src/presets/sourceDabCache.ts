import { sourceOptionComponents, sourceSizeLike, type SourceOption, type SourceOptionContext } from './sourceOption'
import { sourcePngHotSpot, sourcePngMaskExtent, sourceQRound, type SourceDabShape, type SourcePngBrush } from './sourcePngGeometry'
export interface SourceMirrorBits { readonly horizontal: boolean; readonly vertical: boolean; readonly coordinateSystemFlipped: boolean }
export interface SourceMirrorInput { readonly canvasH: boolean; readonly canvasV: boolean; readonly enableH: boolean; readonly enableV: boolean }
export function sourceMirror(option: SourceOption, context: SourceOptionContext, input: SourceMirrorInput, onValue?: (value: number) => void): SourceMirrorBits {
  let result = false
  if (option.checked && (input.enableH || input.enableV)) {
    const value = sourceSizeLike(sourceOptionComponents(option, context))
    onValue?.(value)
    result = value >= .5
  }
  return { horizontal: input.canvasH !== (result && input.enableH), vertical: input.canvasV !== (result && input.enableV), coordinateSystemFlipped: result && (input.enableH !== input.enableV) }
}
export interface SourceDabRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface SourceDabCacheKey {
  /** Exact native KoColor+color-space identity; not an approximate RGB key. */
  readonly color: string
  readonly angle: number
  readonly width: number
  readonly height: number
  readonly subPixelX: number
  readonly subPixelY: number
  readonly softness: number
  readonly lightness: number
  readonly ratio: number
  readonly index: number
  readonly mirrorH: boolean
  readonly mirrorV: boolean
}
const precision = [
  [Math.PI / 180, .05, 1, .01, .01, .05],
  [Math.PI / 180, .01, 1, .01, .01, .01],
  [Math.PI / 180, 0, 1, .01, .01, 1e-6],
  [Math.PI / 180, 0, .5, .01, .01, 1e-6],
  [1e-6, 0, 1e-6, 1e-6, 1e-6, 1e-6],
] as const
/** Asymmetric native comparison: tolerated size delta uses CURRENT size. */
export function sourceDabKeysEqual(current: SourceDabCacheKey, saved: SourceDabCacheKey, level: number): boolean {
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new RangeError('Invalid native precision level')
  const [angle, size, sub, softness, lightness, ratio] = precision[level - 1]
  return current.color === saved.color && Math.abs(current.angle - saved.angle) <= angle
    && Math.abs(current.width - saved.width) <= Math.trunc(size * current.width)
    && Math.abs(current.height - saved.height) <= Math.trunc(size * current.height)
    && Math.abs(current.subPixelX - saved.subPixelX) <= sub && Math.abs(current.subPixelY - saved.subPixelY) <= sub
    && Math.abs(current.softness - saved.softness) <= softness && Math.abs(current.lightness - saved.lightness) <= lightness
    && Math.abs(current.ratio - saved.ratio) <= ratio && current.index === saved.index
    && current.mirrorH === saved.mirrorH && current.mirrorV === saved.mirrorV
}
export interface SourceDabCacheRequest {
  readonly brushIdentity: string
  readonly x: number
  readonly y: number
  readonly shape: SourceDabShape
  readonly color: string
  readonly softness: number
  readonly lightness: number
  readonly precisionLevel: number
  readonly autoPrecision: boolean
  readonly imprecisePosition: boolean
  readonly disableSubpixel: boolean
  readonly supportsCaching: boolean
  readonly solidColor: boolean
  readonly textureEnabled: boolean
  readonly sharpnessChecked: boolean
  /** Resolved native sharpness sizeLike value, when enabled. */
  readonly sharpness?: number
  readonly sharpnessAlign?: boolean
  readonly sharpnessStrength?: number
}
export interface SourceDabMaterialSpec {
  readonly sequence: number
  readonly brushIdentity: string
  readonly brush: SourcePngBrush
  readonly shape: SourceDabShape
  readonly key: SourceDabCacheKey
  readonly width: number
  readonly height: number
  readonly mirror: SourceMirrorBits
  /** Generation provenance only; current placement is resolvedRect. */
  readonly position: { readonly x: number; readonly y: number }
}
export interface SourceDabCacheState {
  readonly nextSequence: number
  readonly saved?: SourceDabMaterialSpec
}
export interface SourceDabCacheResult {
  readonly state: SourceDabCacheState
  readonly mirror: SourceMirrorBits
  readonly mirrorValue?: number
  readonly shape: SourceDabShape
  readonly resolvedShape: SourceDabShape
  readonly resolvedSource: SourceDabMaterialSpec
  readonly requestedRect: SourceDabRect
  readonly resolvedRect: SourceDabRect
  readonly key: SourceDabCacheKey
  readonly sourceSequence: number
  readonly type: 'Dab' | 'Postprocess' | 'Copy'
}
const fraction = (x: number): number => x - Math.floor(x)
/** Bounded PNG-only material planner. Mirror is evaluated BEFORE hit testing;
 * hits retain the last generated bitmap/key instead of drifting the cache. */
export function planSourcePngDab(brush: SourcePngBrush, request: SourceDabCacheRequest, state: SourceDabCacheState,
  mirrorOption: SourceOption, context: SourceOptionContext, mirrorInput: SourceMirrorInput): SourceDabCacheResult {
  if (!Number.isSafeInteger(state.nextSequence) || state.nextSequence < 0 || state.nextSequence >= Number.MAX_SAFE_INTEGER) throw new RangeError('Invalid source cache sequence')
  if (typeof request.brushIdentity !== 'string' || !request.brushIdentity.length) throw new RangeError('Missing native brush identity')
  if (!Number.isInteger(request.precisionLevel) || request.precisionLevel < 1 || request.precisionLevel > 5
    || ![request.x, request.y, request.softness, request.lightness].every(Number.isFinite)
    || (request.sharpnessChecked && (request.sharpness === undefined || !Number.isFinite(request.sharpness) || typeof request.sharpnessAlign !== 'boolean' || request.sharpnessStrength === undefined || !Number.isFinite(request.sharpnessStrength)))) throw new RangeError('Invalid source material request')
  let mirrorValue: number | undefined
  const mirror = sourceMirror(mirrorOption, context, mirrorInput, value => { mirrorValue = value })
  const shape = mirror.coordinateSystemFlipped ? { ...request.shape, rotation: 2 * Math.PI - request.shape.rotation } : request.shape
  const [hotX, hotY] = sourcePngHotSpot(brush, shape)
  let px = request.x - hotX, py = request.y - hotY
  if (request.sharpnessChecked && request.sharpnessAlign && request.sharpnessStrength! > 0) {
    const sharpness = request.sharpness!
    if (Math.abs(sharpness - 1) * 1e12 <= Math.min(Math.abs(sharpness), 1)) {
      px = sourceQRound(px); py = sourceQRound(py)
    } else {
      px = sharpness * sourceQRound(px) + (1 - sharpness) * px
      py = sharpness * sourceQRound(py) + (1 - sharpness) * py
    }
  }
  let x = Math.floor(px), y = Math.floor(py), subX = fraction(px), subY = fraction(py)
  if (request.disableSubpixel) { subX = 0; subY = 0 }
  let [width, height] = sourcePngMaskExtent(brush, shape, subX, subY)
  if (mirror.horizontal) {
    subX = fraction(-(request.x + hotX))
    width = sourcePngMaskExtent(brush, shape, subX, subY)[0]
    x = sourceQRound(request.x + subX + hotX) - width
  }
  if (mirror.vertical) {
    subY = fraction(-(request.y + hotY))
    height = sourcePngMaskExtent(brush, shape, subX, subY)[1]
    y = sourceQRound(request.y + subY + hotY) - height
  }
  const extent = sourcePngMaskExtent(brush, shape, subX, subY)
  const key: SourceDabCacheKey = { color: request.color, angle: shape.rotation, width: extent[0], height: extent[1], subPixelX: subX, subPixelY: subY,
    softness: request.softness, lightness: request.lightness, ratio: shape.ratio, index: 0, mirrorH: mirror.horizontal, mirrorV: mirror.vertical }
  const effectivePrecision = request.autoPrecision ? Math.min(key.width, key.height) < 30 || !request.imprecisePosition ? 5 : 3 : request.precisionLevel
  const saved = state.saved
  const hit = !!saved && saved.brushIdentity === request.brushIdentity && request.supportsCaching && request.solidColor && sourceDabKeysEqual(key, saved.key, effectivePrecision)
  const requestedRect = { x, y, width, height }
  const resolvedSource: SourceDabMaterialSpec = hit ? saved : Object.freeze({
    sequence: state.nextSequence, brushIdentity: request.brushIdentity, brush: Object.freeze({ ...brush }),
    shape: Object.freeze({ ...shape }), key: Object.freeze({ ...key }), width: key.width, height: key.height,
    mirror: Object.freeze({ ...mirror }), position: Object.freeze({ x: request.x, y: request.y }),
  })
  const resolvedRect = hit ? { x: x - Math.trunc((saved.width - width) / 2), y: y - Math.trunc((saved.height - height) / 2), width: saved.width, height: saved.height } : requestedRect
  return { mirror, mirrorValue, shape, resolvedShape: resolvedSource.shape, resolvedSource, key, requestedRect, resolvedRect, sourceSequence: resolvedSource.sequence,
    type: !hit ? 'Dab' : request.textureEnabled || request.sharpnessChecked ? 'Postprocess' : 'Copy',
    state: Object.freeze({ nextSequence: state.nextSequence + 1, saved: resolvedSource }),
  }
}
