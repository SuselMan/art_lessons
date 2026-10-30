import { sourceOptionComponents, sourceSizeLike, type SourceOption, type SourceOptionContext } from './sourceOption'
import { sourceAutoGeometry } from './sourceAutoGeometry'
import { isSourceStampCurveData, type SourceSoftAutoData, type SourceDefaultAutoData, type SourceGaussianAutoData } from '@grafetto/shared'
import { sourcePngCharacteristicSize, sourcePngHotSpot, sourcePngMaskExtent, sourceQRound, type SourceDabShape, type SourcePngBrush } from './sourcePngGeometry'
/** Pure data only; never contains callbacks, pixels, a CAS stand-in or RNG. */
export interface SourceDabBrushMetrics { readonly width: number; readonly height: number; readonly scale: number; readonly angle: number }
export type SourceDabGeometry = { readonly kind: 'image' } | {
  readonly kind: 'defaultAuto'; readonly source: SourceDefaultAutoData
  readonly coverageProfile: 'scalar-f64-fma-v1' | 'neon64-f32-fma-v1'
} | {
  readonly kind: 'gaussianAuto'; readonly source: SourceGaussianAutoData
  readonly coverageProfile: 'scalar-bionic-f64-fma-v1' | 'neon64-f32-fma-v1'
} | {
  readonly kind: 'softAuto'; readonly source: SourceSoftAutoData
  readonly coverageProfile: 'scalar-f64-fma-v1' | 'neon64-f32-fma-v1'
}
function autoGeometry(brush: SourceDabBrushMetrics, geometry: Exclude<SourceDabGeometry, {kind:'image'}>, shape: SourceDabShape, subX=0, subY=0) {
  const s=geometry.source
  if (!s || (geometry.kind==='defaultAuto' ? s.kind!=='defaultAuto' || s.generator!=='default' || !['circle','rect'].includes(s.shape)
      : geometry.kind==='gaussianAuto' ? s.kind!=='gaussianAuto' || s.generator!=='gauss' || s.shape!=='circle' || s.ratio>1
      : s.kind!=='softAuto' || s.generator!=='soft' || s.shape!=='circle' || s.ratio>1 || s.antialias!==false || !isSourceStampCurveData(s.softnessCurve))
    || s.spikes!==2 || s.randomness!==0 || s.density!==1 || typeof s.antialias!=='boolean'
    || ![s.horizontalFade,s.verticalFade].every(v=>Number.isFinite(v)&&v>=0&&v<=1)
    || !(geometry.kind!=='gaussianAuto'?['scalar-f64-fma-v1','neon64-f32-fma-v1']:['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1']).includes(geometry.coverageProfile)) throw new RangeError('Unsupported source auto geometry')
  const result=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:s.diameter,ratio:s.ratio,spikes:2,scale:brush.scale,angle:brush.angle},shape,subX,subY)
  if(result.brushSize[0]!==brush.width || result.brushSize[1]!==brush.height)throw new RangeError('Source auto brush metrics differ from generator')
  return result
}
export function sourceDabCharacteristicSize(brush:SourceDabBrushMetrics,shape:SourceDabShape,geometry?:SourceDabGeometry):readonly[number,number] {
  if((geometry?.kind==='defaultAuto'||geometry?.kind==='gaussianAuto'||geometry?.kind==='softAuto'))return autoGeometry(brush,geometry,shape).characteristicSize
  if(geometry && geometry.kind!=='image')throw new RangeError('Unknown source geometry')
  return sourcePngCharacteristicSize(brush,shape)
}
export function sourceDabHotSpot(brush:SourceDabBrushMetrics,shape:SourceDabShape,geometry?:SourceDabGeometry):readonly[number,number] {
  if(geometry && !['image','defaultAuto','gaussianAuto','softAuto'].includes(geometry.kind))throw new RangeError('Unknown source geometry')
  return (geometry?.kind==='defaultAuto'||geometry?.kind==='gaussianAuto'||geometry?.kind==='softAuto')?autoGeometry(brush,geometry,shape).hotSpot:sourcePngHotSpot(brush,shape)
}
export function sourceDabMaskExtent(brush:SourceDabBrushMetrics,shape:SourceDabShape,subX=0,subY=0,geometry?:SourceDabGeometry):readonly[number,number] {
  if(geometry && !['image','defaultAuto','gaussianAuto','softAuto'].includes(geometry.kind))throw new RangeError('Unknown source geometry')
  return (geometry?.kind==='defaultAuto'||geometry?.kind==='gaussianAuto'||geometry?.kind==='softAuto')?autoGeometry(brush,geometry,shape,subX,subY).maskSize:sourcePngMaskExtent(brush,shape,subX,subY)
}
export function sourceDabGeometryEqual(a:SourceDabGeometry|undefined,b:SourceDabGeometry|undefined):boolean {
  if((a?.kind??'image')!==(b?.kind??'image'))return false
  if(!a || a.kind==='image')return true
  if(!b || b.kind==='image'||a.coverageProfile!==b.coverageProfile)return false
  if(a.kind==='softAuto'||b.kind==='softAuto') {
    if(a.kind!=='softAuto'||b.kind!=='softAuto')return false
    const ac=a.source.softnessCurve,bc=b.source.softnessCurve
    if(!isSourceStampCurveData(ac)||!isSourceStampCurveData(bc)||ac.text!==bc.text || ac.points.some((p,i)=>!Object.is(p.x,bc.points[i].x)||!Object.is(p.y,bc.points[i].y)||p.corner!==bc.points[i].corner))return false
  }
  return Object.keys(a.source).length===Object.keys(b.source).length && Object.keys(a.source).every(k=>k==='softnessCurve'||Object.is(a.source[k as keyof SourceDefaultAutoData],b.source[k as keyof SourceDefaultAutoData]))
}
function freezeAutoGeometry(g:Exclude<SourceDabGeometry,{kind:'image'}>):SourceDabGeometry {
  if(g.kind==='softAuto')return Object.freeze({...g,source:Object.freeze({...g.source,softnessCurve:Object.freeze({text:g.source.softnessCurve.text,
    points:Object.freeze(g.source.softnessCurve.points.map(p=>Object.freeze({...p})))})})})
  if(g.kind==='defaultAuto')return Object.freeze({...g,source:Object.freeze({...g.source})})
  return Object.freeze({...g,source:Object.freeze({...g.source})})
}
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
  readonly brush: SourceDabBrushMetrics
  readonly geometry?: SourceDabGeometry
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
/** Common bounded material planner. Mirror is evaluated BEFORE hit testing;
 * hits retain the last generated bitmap/key instead of drifting the cache. */
export function planSourceDab(brush: SourceDabBrushMetrics, request: SourceDabCacheRequest, state: SourceDabCacheState,
  mirrorOption: SourceOption, context: SourceOptionContext, mirrorInput: SourceMirrorInput, geometry?: SourceDabGeometry): SourceDabCacheResult {
  if (!Number.isSafeInteger(state.nextSequence) || state.nextSequence < 0 || state.nextSequence >= Number.MAX_SAFE_INTEGER) throw new RangeError('Invalid source cache sequence')
  if (typeof request.brushIdentity !== 'string' || !request.brushIdentity.length) throw new RangeError('Missing native brush identity')
  if (!Number.isInteger(request.precisionLevel) || request.precisionLevel < 1 || request.precisionLevel > 5
    || ![request.x, request.y, request.softness, request.lightness].every(Number.isFinite)
    || (request.sharpnessChecked && (request.sharpness === undefined || !Number.isFinite(request.sharpness) || typeof request.sharpnessAlign !== 'boolean' || request.sharpnessStrength === undefined || !Number.isFinite(request.sharpnessStrength)))) throw new RangeError('Invalid source material request')
  if((geometry?.kind==='defaultAuto'||geometry?.kind==='gaussianAuto'||geometry?.kind==='softAuto'))sourceDabCharacteristicSize(brush,{scale:1,ratio:1,rotation:0},geometry)
  else if(geometry && geometry.kind!=='image')throw new RangeError('Unknown source geometry')
  let mirrorValue: number | undefined
  const mirror = sourceMirror(mirrorOption, context, mirrorInput, value => { mirrorValue = value })
  const shape = mirror.coordinateSystemFlipped ? { ...request.shape, rotation: 2 * Math.PI - request.shape.rotation } : request.shape
  const [hotX, hotY] = sourceDabHotSpot(brush, shape, geometry)
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
  let [width, height] = sourceDabMaskExtent(brush, shape, subX, subY, geometry)
  if (mirror.horizontal) {
    subX = fraction(-(request.x + hotX))
    width = sourceDabMaskExtent(brush, shape, subX, subY, geometry)[0]
    x = sourceQRound(request.x + subX + hotX) - width
  }
  if (mirror.vertical) {
    subY = fraction(-(request.y + hotY))
    height = sourceDabMaskExtent(brush, shape, subX, subY, geometry)[1]
    y = sourceQRound(request.y + subY + hotY) - height
  }
  const extent = sourceDabMaskExtent(brush, shape, subX, subY, geometry)
  const key: SourceDabCacheKey = { color: request.color, angle: shape.rotation, width: extent[0], height: extent[1], subPixelX: subX, subPixelY: subY,
    softness: request.softness, lightness: request.lightness, ratio: shape.ratio, index: 0, mirrorH: mirror.horizontal, mirrorV: mirror.vertical }
  const effectivePrecision = request.autoPrecision ? Math.min(key.width, key.height) < 30 || !request.imprecisePosition ? 5 : 3 : request.precisionLevel
  const saved = state.saved
  const hit = !!saved && sourceDabGeometryEqual(geometry,saved.geometry) && saved.brushIdentity === request.brushIdentity && request.supportsCaching && request.solidColor && sourceDabKeysEqual(key, saved.key, effectivePrecision)
  const requestedRect = { x, y, width, height }
  const resolvedSource: SourceDabMaterialSpec = hit ? saved : Object.freeze({
    ...((geometry?.kind==='defaultAuto'||geometry?.kind==='gaussianAuto'||geometry?.kind==='softAuto')?{geometry:freezeAutoGeometry(geometry)}:{}),
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

/** Existing image-only API. Legacy fixtures and consumers remain byte-for-byte unchanged. */
export function planSourcePngDab(brush:SourcePngBrush,request:SourceDabCacheRequest,state:SourceDabCacheState,
  mirrorOption:SourceOption,context:SourceOptionContext,mirrorInput:SourceMirrorInput):SourceDabCacheResult {
  return planSourceDab(brush,request,state,mirrorOption,context,mirrorInput)
}
