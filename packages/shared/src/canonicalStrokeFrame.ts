import { unpackCanonicalMaterial, type CanonicalMaterialContext, type CanonicalMaterialFrame, type CanonicalMaterialContextV2, type CanonicalMaterialFrameV2, type AnyCanonicalMaterialContext } from './canonicalMaterialCodec.js'

/** Stroke resource policy; frame fences never reset this state. */
export interface CanonicalStrokeComposition {
  readonly mode: 'wash' | 'buildup'
  readonly alphaDarken: 'creamy' | 'hard'
  readonly outerResourceOpacity: number
  readonly outerBlend: 'over' | 'multiply' | 'lighten' | 'colorDodge' | 'overlay'
}
export const CANONICAL_STROKE_RASTER_PROFILE = 'installed-arm64-scalar-fused-fpcr0-v1' as const
/** Whole-pipeline identity: existing fused local deposition plus explicit U8
 * GenericSC outer composition. Material version is independent of this version. */
export const CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE = 'installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2' as const
/** Browser arithmetic identity only; not native/FMA attestation or execution permission. */
export const CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE = 'browser-highp-rgba8-v1' as const
export const CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE = 'neon64-f32-fma-seeded-density-v1' as const
export const CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE = 'browser-number-coverage-v1' as const
const nativeCoverage = Object.freeze(['scalar-f64-fma-v1','scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const)
/** ONE closed structural mapping. Runtime execution policies still opt in separately. */
export const CANONICAL_STROKE_RASTER_CONTRACTS = Object.freeze([
  Object.freeze({profile:CANONICAL_STROKE_RASTER_PROFILE,envelopeVersion:1,coverageProfiles:nativeCoverage,genericSC:false} as const),
  Object.freeze({profile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,envelopeVersion:2,coverageProfiles:Object.freeze([...nativeCoverage,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE] as const),genericSC:true} as const),
  Object.freeze({profile:CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,envelopeVersion:2,coverageProfiles:Object.freeze([CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE] as const),genericSC:true} as const),
] as const)
export type CanonicalStrokeRasterProfile = typeof CANONICAL_STROKE_RASTER_CONTRACTS[number]['profile']
export function canonicalStrokeRasterContract(profile:unknown) {
  const contract=CANONICAL_STROKE_RASTER_CONTRACTS.find(value=>value.profile===profile)
  if(!contract)throw new TypeError('Unknown canonical raster profile')
  return contract
}
export function canonicalStrokeCoverageMatches(profile:unknown,coverage:unknown):boolean {
  return canonicalStrokeRasterContract(profile).coverageProfiles.some(value=>value===coverage)
}
interface CanonicalStrokeFrameData {
  readonly brush: string
  readonly strokeId: string
  readonly frameOrdinal: number
  readonly pigmentRgb8: readonly [number, number, number]
  readonly composition: CanonicalStrokeComposition
  readonly materialPacked: string
}
export type CanonicalStrokeFrameEnvelope = CanonicalStrokeFrameData & (
  | { readonly version: 1; readonly rasterProfile: typeof CANONICAL_STROKE_RASTER_PROFILE }
  | { readonly version: 2; readonly rasterProfile: typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE | typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE }
)
/** Caller supplies server/room-pinned brush capability and immutable gesture
 * context. None of these values may be inferred from an untrusted envelope.
 * Material authority includes trusted CAS rectangles, budgets and preflight. */
export interface CanonicalStrokeFrameContext {
  /** Omission preserves the historical Over-only policy. New execution requires
   * an explicit trusted pin; the received envelope cannot select this policy. */
  readonly rasterProfile?: CanonicalStrokeRasterProfile
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
/** Closed composition law for an already selected trusted raster profile.
 * This validates policy, never grants descriptor/room execution capability. */
export function isCanonicalStrokeComposition(value: unknown, rasterProfile: CanonicalStrokeRasterProfile): value is CanonicalStrokeComposition {
  let contract:ReturnType<typeof canonicalStrokeRasterContract>
  try{contract=canonicalStrokeRasterContract(rasterProfile)}catch{return false}
  return record(value) && fields(value, ['mode', 'alphaDarken', 'outerResourceOpacity', 'outerBlend'])
    && (value.mode === 'wash' || value.mode === 'buildup') && (value.alphaDarken === 'creamy' || value.alphaDarken === 'hard')
    && typeof value.outerResourceOpacity === 'number' && Number.isFinite(value.outerResourceOpacity) && value.outerResourceOpacity >= 0 && value.outerResourceOpacity <= 1
    && (!contract.genericSC ? value.outerBlend === 'over'
      : (value.outerBlend === 'over' || value.mode === 'wash' && typeof value.outerBlend === 'string' && ['multiply','lighten','colorDodge','overlay'].includes(value.outerBlend)))
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
  const rasterProfile = trusted?.rasterProfile === undefined ? CANONICAL_STROKE_RASTER_PROFILE : trusted.rasterProfile
  const contract=canonicalStrokeRasterContract(rasterProfile)
  if (!trusted || !text(trusted.brush) || !text(trusted.strokeId) || !ordinal(trusted.frameOrdinal) || !rgb(trusted.pigmentRgb8) || !isCanonicalStrokeComposition(trusted.composition, rasterProfile))
    throw new TypeError('Invalid trusted canonical stroke context')
  if (!record(value) || !fields(value, ['version', 'rasterProfile', 'brush', 'strokeId', 'frameOrdinal', 'pigmentRgb8', 'composition', 'materialPacked'])
    || value.version !== contract.envelopeVersion || value.rasterProfile !== rasterProfile || !text(value.brush) || !text(value.strokeId)
    || !ordinal(value.frameOrdinal) || !rgb(value.pigmentRgb8) || !isCanonicalStrokeComposition(value.composition, rasterProfile) || typeof value.materialPacked !== 'string')
    throw new TypeError('Invalid canonical stroke frame envelope')
  const c = value.composition, expected = trusted.composition
  if (value.brush !== trusted.brush || value.strokeId !== trusted.strokeId || value.frameOrdinal !== trusted.frameOrdinal
    || value.pigmentRgb8.some((n, i) => n !== trusted.pigmentRgb8[i]) || c.mode !== expected.mode || c.alphaDarken !== expected.alphaDarken
    || c.outerResourceOpacity !== expected.outerResourceOpacity || c.outerBlend !== expected.outerBlend)
    throw new TypeError('Canonical stroke frame does not match the pinned gesture')
  if('version'in trusted.material&&trusted.material.version===2){
    for(const source of [trusted.material.primarySource,trusted.material.maskSource])
      if(source&&source.kind!=='image'&&!canonicalStrokeCoverageMatches(rasterProfile,source.coverageProfile))throw new TypeError('Canonical raster/coverage profile mismatch')
  }
  const frame = unpackCanonicalMaterial(value.materialPacked, trusted.material as AnyCanonicalMaterialContext)
  Object.freeze(frame.entry)
  // Soft curves arrive as independent deep-frozen trusted-pin snapshots.
  for (const item of frame.definitions) { if ('kind' in item && (item.kind==='defaultAuto'||item.kind==='gaussianAuto'||item.kind==='softAuto')) Object.freeze(item.source); Object.freeze(item) }
  for (const item of [...frame.draws, ...frame.fences]) Object.freeze(item)
  Object.freeze(frame.definitions); Object.freeze(frame.draws); Object.freeze(frame.fences); Object.freeze(frame)
  const data = {
    brush: value.brush, strokeId: value.strokeId, frameOrdinal: value.frameOrdinal,
    pigmentRgb8: Object.freeze([value.pigmentRgb8[0], value.pigmentRgb8[1], value.pigmentRgb8[2]] as const),
    composition: Object.freeze({ mode: c.mode, alphaDarken: c.alphaDarken, outerResourceOpacity: c.outerResourceOpacity, outerBlend: c.outerBlend }),
    materialPacked: value.materialPacked }
  const envelope: CanonicalStrokeFrameEnvelope = Object.freeze(contract.envelopeVersion === 1
    ? { version: 1, rasterProfile:contract.profile, ...data } : { version: 2, rasterProfile:contract.profile, ...data })
  return Object.freeze({ envelope, frame })
}
