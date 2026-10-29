import type { BrushDescriptor } from './brushes.js'
import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'
import { isSourceStampData, sourceStampRequiredCurves, type SourceStampData } from './sourceStampData.js'

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
  const action = data.settings.PaintOpAction
  const indirect = action !== undefined && Number(action) !== 1
  if (action !== undefined && (!/^[+-]?\d+$/.test(action) || !Number.isSafeInteger(Number(action)))
    || indirect !== data.flags.indirectPainting) return reject('inconsistent-source-painting-mode')
  const rect = sampling.sourceRect
  return { supported: true, capability: Object.freeze({ kind: 'single-inverse-gray-png-v1', brushId: descriptor.id,
    brushVersion: descriptor.version, brushScale: data.brush.scale, brushAngle: data.brush.angle, asset: Object.freeze({ id: asset.id, size: asset.size, ...rect }), mode: indirect ? 'wash' : 'buildup' }) }
}

/** Local callers may supply a curve compiler. A server binding cannot, and
 * therefore admits only identity curves or the already schema-checked retained
 * coefficient dictionary. No second option compiler is implemented here. */
export function hasCanonicalSourceCurvePrograms(data: SourceStampData): boolean {
  return sourceStampRequiredCurves(data.options).length === 0 || data.compiled !== undefined
}
