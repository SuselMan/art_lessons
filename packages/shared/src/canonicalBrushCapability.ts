import type { BrushDescriptor } from './brushes.js'
import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'
import { isSourceStampData, sourceStampSourceKind, sourceStampRequiredCurves, type SourceStampData } from './sourceStampData.js'

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
  const reject = (reason: string): CanonicalSinglePngResult => ({ supported: false, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (data === undefined) return reject('legacy-descriptor-no-source-data')
  if (!isSourceStampData(data)) return reject('invalid-source-data')
  if (sourceStampSourceKind(data) !== 'image') return reject('source-material-is-not-image')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'bitmap' || descriptor.tip.animation || descriptor.tip.material) return reject('unsupported-source-material')
  const sampling = descriptor.tip.imageSampling
  if (!sampling || sampling.kind !== 'integer-pyramid' || sampling.signal !== 'inverse-gray' || descriptor.tip.mask !== asset.id
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
