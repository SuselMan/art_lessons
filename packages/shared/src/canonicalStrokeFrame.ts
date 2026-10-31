import { unpackCanonicalMaterial, type CanonicalMaterialContext, type CanonicalMaterialFrame, type CanonicalMaterialContextV2, type CanonicalMaterialFrameV2, type AnyCanonicalMaterialContext } from './canonicalMaterialCodec.js'

/** Stroke resource policy; frame fences never reset this state. */
export interface CanonicalStrokeComposition {
  readonly mode: 'wash' | 'buildup'
  readonly alphaDarken: 'creamy' | 'hard'
  readonly outerResourceOpacity: number
  readonly outerBlend: 'over'
}
export const CANONICAL_STROKE_RASTER_PROFILE = 'installed-arm64-scalar-fused-fpcr0-v1' as const
export interface CanonicalStrokeFrameEnvelope {
  readonly version: 1
  readonly rasterProfile: typeof CANONICAL_STROKE_RASTER_PROFILE
  readonly brush: string
  readonly strokeId: string
  readonly frameOrdinal: number
  readonly pigmentRgb8: readonly [number, number, number]
  readonly composition: CanonicalStrokeComposition
  readonly materialPacked: string
}
/** Caller supplies server/room-pinned brush capability and immutable gesture
 * context. None of these values may be inferred from an untrusted envelope.
 * Material authority includes trusted CAS rectangles, budgets and preflight. */
export interface CanonicalStrokeFrameContext {
  readonly brush: string
  readonly strokeId: string
  readonly frameOrdinal: number
  readonly pigmentRgb8: readonly [number, number, number]
  readonly composition: CanonicalStrokeComposition
  readonly material: CanonicalMaterialContext
}
export interface CanonicalStrokeFrameContextV2 extends Omit<CanonicalStrokeFrameContext,'material'> {
  readonly material:CanonicalMaterialContextV2
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0')
const ordinal = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER
const rgb = (value: unknown): value is readonly [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
const fields = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name))
function composition(value: unknown): value is CanonicalStrokeComposition {
  return record(value) && fields(value, ['mode', 'alphaDarken', 'outerResourceOpacity', 'outerBlend'])
    && (value.mode === 'wash' || value.mode === 'buildup') && (value.alphaDarken === 'creamy' || value.alphaDarken === 'hard')
    && typeof value.outerResourceOpacity === 'number' && Number.isFinite(value.outerResourceOpacity) && value.outerResourceOpacity >= 0 && value.outerResourceOpacity <= 1
    && value.outerBlend === 'over'
}
/** Shared admission building block, not an Operation/Socket activation.
 * Descriptor capability and contiguous gesture/group ownership still belong to
 * the caller. Profile names alone never attest compatibility. No dabs/options,
 * author inputs, random journal or second colour authority can accompany it. */
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContextV2): {readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrameV2}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContext): {readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrame}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContext|CanonicalStrokeFrameContextV2): {
  readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrame|CanonicalMaterialFrameV2
} {
  if (!trusted || !text(trusted.brush) || !text(trusted.strokeId) || !ordinal(trusted.frameOrdinal) || !rgb(trusted.pigmentRgb8) || !composition(trusted.composition))
    throw new TypeError('Invalid trusted canonical stroke context')
  if (!record(value) || !fields(value, ['version', 'rasterProfile', 'brush', 'strokeId', 'frameOrdinal', 'pigmentRgb8', 'composition', 'materialPacked'])
    || value.version !== 1 || value.rasterProfile !== CANONICAL_STROKE_RASTER_PROFILE || !text(value.brush) || !text(value.strokeId)
    || !ordinal(value.frameOrdinal) || !rgb(value.pigmentRgb8) || !composition(value.composition) || typeof value.materialPacked !== 'string')
    throw new TypeError('Invalid canonical stroke frame envelope')
  const c = value.composition, expected = trusted.composition
  if (value.brush !== trusted.brush || value.strokeId !== trusted.strokeId || value.frameOrdinal !== trusted.frameOrdinal
    || value.pigmentRgb8.some((n, i) => n !== trusted.pigmentRgb8[i]) || c.mode !== expected.mode || c.alphaDarken !== expected.alphaDarken
    || c.outerResourceOpacity !== expected.outerResourceOpacity || c.outerBlend !== expected.outerBlend)
    throw new TypeError('Canonical stroke frame does not match the pinned gesture')
  const frame = unpackCanonicalMaterial(value.materialPacked, trusted.material as AnyCanonicalMaterialContext)
  Object.freeze(frame.entry)
  // Soft curves arrive as independent deep-frozen trusted-pin snapshots.
  for (const item of frame.definitions) { if ('kind' in item && (item.kind==='defaultAuto'||item.kind==='gaussianAuto'||item.kind==='softAuto')) Object.freeze(item.source); Object.freeze(item) }
  for (const item of [...frame.draws, ...frame.fences]) Object.freeze(item)
  Object.freeze(frame.definitions); Object.freeze(frame.draws); Object.freeze(frame.fences); Object.freeze(frame)
  const envelope: CanonicalStrokeFrameEnvelope = Object.freeze({ version: 1, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
    brush: value.brush, strokeId: value.strokeId, frameOrdinal: value.frameOrdinal,
    pigmentRgb8: Object.freeze([value.pigmentRgb8[0], value.pigmentRgb8[1], value.pigmentRgb8[2]] as const),
    composition: Object.freeze({ mode: c.mode, alphaDarken: c.alphaDarken, outerResourceOpacity: c.outerResourceOpacity, outerBlend: c.outerBlend }),
    materialPacked: value.materialPacked })
  return Object.freeze({ envelope, frame })
}
