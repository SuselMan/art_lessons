import {canonicalResolvedTexturePhase,type CanonicalResolvedTexturePhase} from './canonicalPrimaryTexture.js'
import {canonicalTexturedAutoMaterialContext,unpackCanonicalTexturedAutoMaterial,CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE,type CanonicalMaterialContextV7,type CanonicalMaterialFrameV7} from './canonicalMaterialCodec.js'
import { canonicalPrimaryTextureMaterialContext, canonicalTexturedSourceMaterialContext, canonicalPressureTexturedSourceMaterialContext,canonicalSoftNativeDefaultTexturedSourceMaterialContext, unpackCanonicalMaterial, type CanonicalMaterialContext, type CanonicalMaterialFrame, type CanonicalMaterialContextV2, type CanonicalMaterialFrameV2, type CanonicalMaterialContextV3, type CanonicalMaterialFrameV3, type CanonicalMaterialContextV4, type CanonicalMaterialFrameV4, type CanonicalMaterialContextV5, type CanonicalMaterialFrameV5,type CanonicalMaterialContextV6,type CanonicalMaterialFrameV6 } from './canonicalMaterialCodec.js'

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
  /** Mandatory only for named material7; old decoders reject this field. */
  readonly texturePhase?:CanonicalResolvedTexturePhase
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
  readonly materialVersion?: 2
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
/** Explicit parse-only awareness, not a grant or renderer capability. */
export interface CanonicalStrokeFrameContextV3 extends Omit<CanonicalStrokeFrameContext,'material'|'materialVersion'|'rasterProfile'> {
  readonly materialVersion:3
  readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE
  readonly material:CanonicalMaterialContextV3
}
/** Explicit parse-only material4 awareness, not an execution grant. */
export interface CanonicalStrokeFrameContextV4 extends Omit<CanonicalStrokeFrameContext,'material'|'materialVersion'|'rasterProfile'> {
  readonly materialVersion:4
  readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE|typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE
  readonly material:CanonicalMaterialContextV4
}export interface CanonicalStrokeFrameContextV5 extends Omit<CanonicalStrokeFrameContext, "material" | "materialVersion" | "rasterProfile"> {
  readonly materialVersion: 5;
  readonly rasterProfile: typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE | typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE;
  readonly material: CanonicalMaterialContextV5;
}
export interface CanonicalStrokeFrameContextV6 extends Omit<CanonicalStrokeFrameContextV5,'materialVersion'|'material'>{readonly materialVersion:6;readonly material:CanonicalMaterialContextV6}
export interface CanonicalStrokeFrameContextV7 extends Omit<CanonicalStrokeFrameContextV6,'materialVersion'|'material'>{readonly materialVersion:7;readonly material:CanonicalMaterialContextV7}
function selectedMaterial(trusted:CanonicalStrokeFrameContext|CanonicalStrokeFrameContextV2|CanonicalStrokeFrameContextV3|CanonicalStrokeFrameContextV4|CanonicalStrokeFrameContextV5|CanonicalStrokeFrameContextV6|CanonicalStrokeFrameContextV7):2|3|4|5|6 {
  if(!trusted||typeof trusted!=='object')return 2
  const selector=Object.getOwnPropertyDescriptor(trusted,'materialVersion')
  if('materialVersion'in trusted&&(!selector||!Object.hasOwn(selector,'value')||selector.value!==2&&selector.value!==3&&selector.value!==4&&selector.value!==5&&selector.value!==6))
    throw new TypeError('Unsupported canonical stroke material selector')
  return selector?.value===6?6:selector?.value===5?5:selector?.value===4?4:selector?.value===3?3:2
}
/** Recheck the selected legacy context immediately before its overload call.
 * Own-data version2 is established before reading the discriminant for TS;
 * malformed/accessor/inherited3/4 metadata cannot enter the legacy overload. */
function legacyMaterial(material:CanonicalMaterialContext|CanonicalMaterialContextV2|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5|CanonicalMaterialContextV6|CanonicalMaterialContextV7):CanonicalMaterialContext|CanonicalMaterialContextV2 {
  const version=Object.getOwnPropertyDescriptor(material,'version')
  if('version'in material){
    if(!version||!Object.hasOwn(version,'value')||version.value!==2||material.version!==2)
      throw new TypeError('Unsupported canonical stroke material version')
    return material
  }
  return material
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
export function decodeCanonicalStrokeFrame(value:unknown,trusted:CanonicalStrokeFrameContextV6):{readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrameV6}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContextV5): {readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrameV5}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContextV4): {readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrameV4}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContextV3): {readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrameV3}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContextV2): {readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrameV2}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContext): {readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrame}
export function decodeCanonicalStrokeFrame(value: unknown, trusted: CanonicalStrokeFrameContext|CanonicalStrokeFrameContextV2|CanonicalStrokeFrameContextV3|CanonicalStrokeFrameContextV4|CanonicalStrokeFrameContextV5|CanonicalStrokeFrameContextV6): {
  readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrame|CanonicalMaterialFrameV2|CanonicalMaterialFrameV3|CanonicalMaterialFrameV4|CanonicalMaterialFrameV5|CanonicalMaterialFrameV6
} {
  const result=decodeFrameCore(value,trusted,false)
  if(result.frame.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)throw new TypeError('Unsupported legacy material')
  return {envelope:result.envelope,frame:result.frame}
}
export function decodeCanonicalTexturedAutoStrokeFrame(value:unknown,trusted:CanonicalStrokeFrameContextV7):{readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrameV7}{
 const d=Object.getOwnPropertyDescriptor(trusted??{},'materialVersion')
 if(!d||!Object.hasOwn(d,'value')||d.value!==7)throw new TypeError('Invalid standalone material selector')
 const result=decodeFrameCore(value,trusted,true)
 if(result.frame.profile!==CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)throw new TypeError('Invalid standalone material')
 return Object.freeze({envelope:result.envelope,frame:result.frame})
}
function captureEnvelope7(value:unknown,material:CanonicalMaterialContextV7):Record<string,unknown> {
 const own=(v:unknown,keys:readonly string[]):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)throw new TypeError('Invalid material7 envelope DATA');const out:Record<string,unknown>=Object.create(null);for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid material7 envelope accessor');out[k]=d.value}return out}
 const v=own(value,['version','rasterProfile','brush','strokeId','frameOrdinal','pigmentRgb8','composition','materialPacked','texturePhase']),rgb=v.pigmentRgb8
 if(!Array.isArray(rgb)||Object.getPrototypeOf(rgb)!==Array.prototype||Reflect.ownKeys(rgb).length!==4||rgb.length!==3)throw new TypeError('Invalid material7 pigment DATA')
 v.pigmentRgb8=Object.freeze([0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(rgb,String(i));if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid material7 pigment accessor');return d.value}))
 v.composition=Object.freeze(own(v.composition,['mode','alphaDarken','outerResourceOpacity','outerBlend']))
 const expected=material.primaryTexture.phase,phase=canonicalResolvedTexturePhase(v.texturePhase,material.primaryTexture.width,material.primaryTexture.height)
 if(phase.x!==expected.x||phase.y!==expected.y)throw new TypeError('Material7 phase differs from pinned gesture')
 v.texturePhase=phase;return Object.freeze(v)
}
function decodeFrameCore(value:unknown,trusted:CanonicalStrokeFrameContext|CanonicalStrokeFrameContextV2|CanonicalStrokeFrameContextV3|CanonicalStrokeFrameContextV4|CanonicalStrokeFrameContextV5|CanonicalStrokeFrameContextV6|CanonicalStrokeFrameContextV7,standalone7:boolean):{readonly envelope:CanonicalStrokeFrameEnvelope;readonly frame:CanonicalMaterialFrame|CanonicalMaterialFrameV2|CanonicalMaterialFrameV3|CanonicalMaterialFrameV4|CanonicalMaterialFrameV5|CanonicalMaterialFrameV6|CanonicalMaterialFrameV7}{
  const selector=standalone7?7:selectedMaterial(trusted),aware3=selector===3,aware4=selector===4,aware5=selector===5,aware6=selector===6,aware7=selector===7
  // Material4 context is independently immutable BEFORE ANY envelope/trusted
  // composition callback. Old selected2/3 validation ordering is unchanged.
  const earlyField=aware4||aware5||aware6||aware7?Object.getOwnPropertyDescriptor(trusted,'material'):undefined
  if((aware4||aware5||aware6||aware7)&&(!earlyField||!Object.hasOwn(earlyField,'value')))throw new TypeError('Invalid explicit canonical material context')
  const early7=aware7?canonicalTexturedAutoMaterialContext(earlyField!.value):undefined
  const early4=aware4?canonicalTexturedSourceMaterialContext(earlyField!.value):undefined
  const early6=aware6?canonicalSoftNativeDefaultTexturedSourceMaterialContext(earlyField!.value):undefined
  const early5=aware5?canonicalPressureTexturedSourceMaterialContext(earlyField!.value):undefined
  const rasterProfile = trusted?.rasterProfile === undefined ? CANONICAL_STROKE_RASTER_PROFILE : trusted.rasterProfile
  const contract=canonicalStrokeRasterContract(rasterProfile)
  if (!trusted || !text(trusted.brush) || !text(trusted.strokeId) || !ordinal(trusted.frameOrdinal) || !rgb(trusted.pigmentRgb8) || !isCanonicalStrokeComposition(trusted.composition, rasterProfile))
    throw new TypeError('Invalid trusted canonical stroke context')
  const field=Object.getOwnPropertyDescriptor(trusted,'material')
  if((aware3||aware4||aware5||aware6||aware7)&&(!field||!Object.hasOwn(field,'value')))throw new TypeError('Invalid explicit canonical material context')
  const captured=early7 ? {kind:7 as const,material:early7} : early6 ? {kind:6 as const,material:early6} : early5 ? {kind:5 as const,material:early5} : early4 ? {kind:4 as const,material:early4} : aware3 ? {kind:3 as const,material:canonicalPrimaryTextureMaterialContext(field!.value)} : {kind:2 as const,material:trusted.material}
  const material=captured.material
  if(!material||typeof material!=='object'||Array.isArray(material))throw new TypeError('Invalid trusted canonical stroke context')
  const version=Object.getOwnPropertyDescriptor(material,'version')
  if(aware3||aware4||aware5||aware6||aware7?(!version||!Object.hasOwn(version,'value')||version.value!==selector):('version'in material&&(!version||!Object.hasOwn(version,'value')||version.value!==2)))
    throw new TypeError('Unsupported canonical stroke material version')
  if(aware3&&rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||(aware4||aware5||aware6||aware7)&&!contract.genericSC)throw new TypeError('Unsupported explicit texture raster profile')
  if(early7)value=captureEnvelope7(value,early7)
  if (!record(value) || !fields(value, ['version', 'rasterProfile', 'brush', 'strokeId', 'frameOrdinal', 'pigmentRgb8', 'composition', 'materialPacked',...(aware7?['texturePhase']:[])])
    || value.version !== contract.envelopeVersion || value.rasterProfile !== rasterProfile || !text(value.brush) || !text(value.strokeId)
    || !ordinal(value.frameOrdinal) || !rgb(value.pigmentRgb8) || !isCanonicalStrokeComposition(value.composition, rasterProfile) || typeof value.materialPacked !== 'string')
    throw new TypeError('Invalid canonical stroke frame envelope')
  const materialPacked=value.materialPacked
  if(typeof materialPacked!=='string'||!(aware7?/^7\|/:aware6?/^6\|/:aware5?/^5\|/:aware4?/^4\|/:aware3?/^3\|/:/^[12]\|/).test(materialPacked))throw new TypeError('Unsupported selected canonical stroke material')
  const c = value.composition, expected = trusted.composition
  if (value.brush !== trusted.brush || value.strokeId !== trusted.strokeId || value.frameOrdinal !== trusted.frameOrdinal
    || value.pigmentRgb8.some((n, i) => n !== trusted.pigmentRgb8[i]) || c.mode !== expected.mode || c.alphaDarken !== expected.alphaDarken
    || c.outerResourceOpacity !== expected.outerResourceOpacity || c.outerBlend !== expected.outerBlend)
    throw new TypeError('Canonical stroke frame does not match the pinned gesture')
  if('version'in material&&(material.version===2||material.version===4||material.version===5||material.version===6||material.version===7)){
    for(const source of (material.version===4||material.version===5||material.version===6||material.version===7)?[material.primarySource]:[material.primarySource,material.maskSource])
      if(source&&source.kind!=='image'&&!canonicalStrokeCoverageMatches(rasterProfile,source.coverageProfile))throw new TypeError('Canonical raster/coverage profile mismatch')
  }
  // Discriminated capture selects the overload; both branches use ONE codec.
  const frame = captured.kind===7 ? unpackCanonicalTexturedAutoMaterial(materialPacked,captured.material) : captured.kind===6 ? unpackCanonicalMaterial(materialPacked,captured.material) : captured.kind===5 ? unpackCanonicalMaterial(materialPacked,captured.material) : captured.kind===4 ? unpackCanonicalMaterial(materialPacked,captured.material) : captured.kind===3 ? unpackCanonicalMaterial(materialPacked,captured.material) : unpackCanonicalMaterial(materialPacked,legacyMaterial(captured.material))
  Object.freeze(frame.entry)
  // Soft curves arrive as independent deep-frozen trusted-pin snapshots.
  for (const item of frame.definitions) { if ('kind' in item && (item.kind==='defaultAuto'||item.kind==='gaussianAuto'||item.kind==='softAuto')) Object.freeze(item.source); Object.freeze(item) }
  for (const item of [...frame.draws, ...frame.fences]) Object.freeze(item)
  Object.freeze(frame.definitions); Object.freeze(frame.draws); Object.freeze(frame.fences); Object.freeze(frame)
  const data = {
    brush: value.brush, strokeId: value.strokeId, frameOrdinal: value.frameOrdinal,
    pigmentRgb8: Object.freeze([value.pigmentRgb8[0], value.pigmentRgb8[1], value.pigmentRgb8[2]] as const),
    composition: Object.freeze({ mode: c.mode, alphaDarken: c.alphaDarken, outerResourceOpacity: c.outerResourceOpacity, outerBlend: c.outerBlend }),
    materialPacked,...(early7?{texturePhase:early7.primaryTexture.phase}:{}) }
  const envelope: CanonicalStrokeFrameEnvelope = Object.freeze(contract.envelopeVersion === 1
    ? { version: 1, rasterProfile:contract.profile, ...data } : { version: 2, rasterProfile:contract.profile, ...data })
  return Object.freeze({ envelope, frame })
}
