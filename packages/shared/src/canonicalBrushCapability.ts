import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalStrokeRasterProfile,type CanonicalStrokeComposition} from './canonicalStrokeFrame.js'
import type { BrushDescriptor } from './brushes.js'
import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'
import { isSourceStampData, sourceStampSourceKind, sourceStampRequiredCurves, type SourceStampData } from './sourceStampData.js'

/** Only the native outer law representable by canonical over32 today.
 * This checks composition of an already verified descriptor, not source-data
 * readiness, descriptor schema, alphaDarken mode or other execution policy. */
function nativeOuterBlend(descriptor:BrushDescriptor):CanonicalStrokeComposition['outerBlend']|undefined {
  const behavior=descriptor.behavior,rendering=behavior?.rendering
  if(behavior?.erase===true||(rendering?.wetEdges??0)!==0||(rendering?.burntEdges??0)!==0)return
  switch(rendering?.blendMode??'normal'){
    case 'normal':return 'over'
    case 'multiply':return 'multiply'
    case 'lighten':return 'lighten'
    case 'colorDodge':return 'colorDodge'
    case 'overlay':return 'overlay'
  }
}
export function hasCanonicalOverComposition(descriptor:BrushDescriptor):boolean {
  return nativeOuterBlend(descriptor)==='over'
}
/** Pure source-composition selection from an already verified descriptor.
 * This is neither source-data readiness nor room/server execution permission.
 * Other material/effect gates remain with source extractors and the resolver. */
export function canonicalSourceComposition(descriptor:BrushDescriptor,rasterProfile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE):Readonly<{mode:'wash'|'buildup';outerBlend:CanonicalStrokeComposition['outerBlend']}>|undefined {
  if(rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE&&rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)return
  const outerBlend=nativeOuterBlend(descriptor)
  if(!outerBlend)return
  const data=descriptor.sourceStamp
  if(!isSourceStampData(data))return
  const mode=sourceStampPaintingMode(data)
  if(!mode||outerBlend!=='over'&&(rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||mode!=='wash'))return
  return Object.freeze({mode,outerBlend})
}

/** Saved reader law shared by image/auto capability binding. Undefined action
 * means incremental; conflicting or malformed retained flags fail closed. */
export function sourceStampPaintingMode(data: SourceStampData): 'wash'|'buildup'|undefined {
  const action=data.settings.PaintOpAction
  const indirect=action!==undefined && Number(action)!==1
  if(action!==undefined && (!/^[+-]?\d+$/.test(action)||!Number.isSafeInteger(Number(action)))
    ||indirect!==data.flags.indirectPainting)return undefined
  return indirect?'wash':'buildup'
}

/** A semantic material class, not permission, CAS verification, a compiler, or
 * an assertion that retained settings originated in an installed native app. */
export interface CanonicalSinglePngCapability {
  readonly kind: 'single-inverse-gray-png-v1'
  readonly brushId: string
  readonly brushVersion: number
  readonly asset: CanonicalMaterialAsset
  readonly mode: 'wash' | 'buildup'
  readonly brushScale: number
  readonly brushAngle: number
}
export type CanonicalSinglePngResult = { readonly supported: true; readonly capability: CanonicalSinglePngCapability }
  | { readonly supported: false; readonly reasons: readonly string[] }

/** Shared structural boundary used BEFORE local option compilation and server
 * capability binding. Inputs must have passed the BrushLibrary schema. This
 * does not evaluate sensors/curves/RNG or trust a caller's raster profile. */
export function extractCanonicalSinglePngCapability(
  descriptor: BrushDescriptor, asset: { readonly id: string; readonly size: number },
): CanonicalSinglePngResult {
  return extractImageFrameCapability(descriptor,asset)
}

function extractImageFrameCapability(
  descriptor:BrushDescriptor,asset:{readonly id:string;readonly size:number},
  animation?:NonNullable<BrushDescriptor['tip']['animation']>,
):CanonicalSinglePngResult {
  const reject = (reason: string): CanonicalSinglePngResult => ({ supported: false, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (data === undefined) return reject('legacy-descriptor-no-source-data')
  if (!isSourceStampData(data)) return reject('invalid-source-data')
  if (sourceStampSourceKind(data) !== 'image') return reject('source-material-is-not-image')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'bitmap' || descriptor.tip.animation !== animation || descriptor.tip.material) return reject('unsupported-source-material')
  const sampling = descriptor.tip.imageSampling
  if (!sampling || sampling.kind !== 'integer-pyramid' || sampling.signal !== 'inverse-gray' || descriptor.tip.mask !== (animation?.frames[0] ?? asset.id)
    || !/^asset:[a-f0-9]{64}$/.test(asset.id) || !Number.isInteger(asset.size) || asset.size < 2 || asset.size > 2048
    || !Object.values(sampling.sourceRect).every(v => Number.isInteger(v) && v >= 0)
    || sampling.sourceRect.width !== data.brush.width || sampling.sourceRect.height !== data.brush.height
    || sampling.sourceRect.x + data.brush.width > asset.size || sampling.sourceRect.y + data.brush.height > asset.size) return reject('native-cas-source-grid-unavailable')
  if (!data.flags.materialFixed1 || data.flags.textureEnabled || descriptor.behavior?.colorAdjustment) return reject('unsupported-material-consumer')
  if (data.options.length !== 9) return reject('native-option-program-unavailable')
  const rotation = data.options.find(o => o.id === 'Rotation')!
  const fan = rotation.checked && rotation.useCurve ? rotation.sensors.find(s => s.id === 'drawingAngle' && s.fanCorners) : undefined
  if (fan && (fan.fanStep! < 5 || fan.fanStep! > 90)) return reject('unsupported-source-fan-step')
  // This is the retained source reader's mode, not descriptor rendering or the
  // opacity option. Missing PaintOpAction is incremental in brush settings.
  const mode=sourceStampPaintingMode(data)
  if(!mode)return reject('inconsistent-source-painting-mode')
  const rect = sampling.sourceRect
  return { supported: true, capability: Object.freeze({ kind: 'single-inverse-gray-png-v1', brushId: descriptor.id,
    brushVersion: descriptor.version, brushScale: data.brush.scale, brushAngle: data.brush.angle, asset: Object.freeze({ id: asset.id, size: asset.size, ...rect }), mode }) }
}

/** Ordered image frames share the existing image recipe and asset bank.
 * Selection belongs to the author; recorded replay never selects a frame.
 * Structural material support only, not room execution permission. */
export interface CanonicalIncrementalImagePipeCapability {
  readonly kind:'incremental-inverse-gray-pipe-v1'
  readonly brushId:string
  readonly brushVersion:number
  readonly assets:readonly CanonicalMaterialAsset[]
  readonly mode:'wash'|'buildup'
  readonly brushScale:number
  readonly brushAngle:number
}
export type CanonicalIncrementalImagePipeResult=
  {readonly supported:true;readonly capability:CanonicalIncrementalImagePipeCapability}|
  {readonly supported:false;readonly reasons:readonly string[]}
export type CanonicalRandomImagePipeCapability=Omit<CanonicalIncrementalImagePipeCapability,'kind'>&{
  readonly kind:'random-inverse-gray-pipe-v1'
}
export type CanonicalRandomImagePipeResult=
  {readonly supported:true;readonly capability:CanonicalRandomImagePipeCapability}|
  {readonly supported:false;readonly reasons:readonly string[]}
export function extractCanonicalRandomImagePipeCapability(
  descriptor:BrushDescriptor,available:readonly {readonly id:string;readonly size:number}[],
):CanonicalRandomImagePipeResult {
  const result=extractImagePipeCapability(descriptor,available,'random')
  return result.supported?{supported:true,capability:Object.freeze({...result.capability,kind:'random-inverse-gray-pipe-v1'})}:result
}
export function extractCanonicalIncrementalImagePipeCapability(
  descriptor:BrushDescriptor,available:readonly {readonly id:string;readonly size:number}[],
):CanonicalIncrementalImagePipeResult {
  return extractImagePipeCapability(descriptor,available,'incremental')
}
function extractImagePipeCapability(
  descriptor:BrushDescriptor,available:readonly {readonly id:string;readonly size:number}[],mode:'incremental'|'random',
):CanonicalIncrementalImagePipeResult {
  const reject=(reason:string):CanonicalIncrementalImagePipeResult=>({supported:false,reasons:[reason]})
  const animation=descriptor.tip.animation
  if(descriptor.tip.kind!=='bitmap'||!animation||animation.mode!==mode
    ||animation.frames.length<2||animation.frames.length>256)return reject('unsupported-image-pipe-selection')
  const metadata=new Map<string,{readonly id:string;readonly size:number}>()
  for(const asset of available){if(metadata.has(asset.id))return reject('ambiguous-image-pipe-asset');metadata.set(asset.id,asset)}
  const frames:CanonicalMaterialAsset[]=[]
  let first:CanonicalSinglePngCapability|undefined
  for(const id of animation.frames){
    const asset=metadata.get(id)
    if(!asset)return reject('image-pipe-frame-unavailable')
    const frame=extractImageFrameCapability(descriptor,asset,animation)
    if(!frame.supported)return frame
    if(first&&first.asset.size!==asset.size)return reject('image-pipe-frame-grid-mismatch')
    first??=frame.capability;frames.push(frame.capability.asset)
  }
  return {supported:true,capability:Object.freeze({kind:'incremental-inverse-gray-pipe-v1',brushId:descriptor.id,
    brushVersion:descriptor.version,assets:Object.freeze(frames),mode:first!.mode,
    brushScale:first!.brushScale,brushAngle:first!.brushAngle})}
}

/** Local callers may supply a curve compiler. A server binding cannot, and
 * therefore admits only identity curves or the already schema-checked retained
 * coefficient dictionary. No second option compiler is implemented here. */
export function hasCanonicalSourceCurvePrograms(data: SourceStampData): boolean {
  return sourceStampRequiredCurves(data.options).length === 0 || data.compiled !== undefined
}

/** Source DATA/compiler capability only. No auto author, material codec or
 * executor is admitted by this result, even when every curve is compiled. */
export function extractDefaultAutoSourceDataCapability(descriptor: BrushDescriptor):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceDefaultAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'defaultAuto') return reject('source-material-is-not-default-auto')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'procedural' || descriptor.tip.profile?.kind !== 'standard'
    || descriptor.tip.mask || descriptor.tip.animation || descriptor.tip.imageSampling || descriptor.tip.material) return reject('inconsistent-default-auto-descriptor')
  const source = data.source
  if (source.spikes !== 2 || source.randomness !== 0 || source.density !== 1 || !data.flags.materialFixed1 || data.flags.textureEnabled
    || descriptor.behavior?.colorAdjustment) return reject('unsupported-default-auto-material-consumer')
  const p = descriptor.tip.profile
  if (p.shape !== (source.shape === 'circle' ? 'ellipse' : 'rectangle') || p.horizontalFade !== source.horizontalFade
    || p.verticalFade !== source.verticalFade || p.antialias !== source.antialias) return reject('inconsistent-default-auto-profile')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !hasCanonicalSourceCurvePrograms(data)) return reject('native-option-program-unavailable')
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceDefaultAutoData } }
}

/** Gaussian raw-source retention/compiler capability. Existing round/bitmap
 * tips are legacy approximations; this result grants neither their execution
 * nor a Gaussian author/material/wire path. */
export function extractGaussianAutoSourceDataCapability(descriptor: BrushDescriptor):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceGaussianAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'gaussianAuto') return reject('source-material-is-not-gaussian-auto')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp') return reject('inconsistent-gaussian-auto-descriptor')
  const source = data.source
  if (source.shape !== 'circle' || source.ratio > 1 || source.spikes !== 2 || source.randomness !== 0 || source.density !== 1
    || !data.flags.materialFixed1 || data.flags.textureEnabled || descriptor.behavior?.colorAdjustment) return reject('unsupported-gaussian-auto-material-consumer')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !hasCanonicalSourceCurvePrograms(data)) return reject('native-option-program-unavailable')
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceGaussianAutoData } }
}

/** Soft data readiness only. Schema validation binds the mapped radial entry
 * to the retained raw curve; it does not attest the compiler or admit pixels. */
export function extractSoftAutoSourceDataCapability(descriptor: BrushDescriptor):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceSoftAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'softAuto') return reject('source-material-is-not-soft-auto')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp') return reject('inconsistent-soft-auto-descriptor')
  const source = data.source
  if (source.ratio > 1 || source.spikes !== 2 || source.antialias || source.randomness !== 0 || source.density !== 1
    || !data.flags.materialFixed1 || data.flags.textureEnabled || descriptor.behavior?.colorAdjustment) return reject('unsupported-soft-auto-material-consumer')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !hasCanonicalSourceCurvePrograms(data)) return reject('native-option-program-unavailable')
  if (data.compiled?.version !== 2 || !data.compiled.radialCurve) return reject('native-radial-program-unavailable')
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceSoftAutoData } }
}

/** Composition belongs to the explicit trusted raster profile. Retaining a
 * source mask or author program cannot grant unsupported destination/effect law. */
export function canonicalSourceEffectReject(descriptor: BrushDescriptor,profile:CanonicalStrokeRasterProfile): string | undefined {
  const behavior = descriptor.behavior, rendering = behavior?.rendering
  if (!canonicalSourceComposition(descriptor,profile)) return 'outer-composition'
  if (rendering && (rendering.mode !== 'buildUp' || rendering.opacityCeiling === 'shape' || rendering.accumulation === 'maxAlpha')) return 'stroke-rendering-mode'
  if (rendering?.gammaCorrect || rendering?.luminance) return 'color-effect'
  if (descriptor.tip.alphaThreshold) return 'mask-threshold'
  if (behavior?.wetMix || behavior?.edgeBleed || behavior?.grain || behavior?.taper) return 'brush-effect'
  return undefined
}
