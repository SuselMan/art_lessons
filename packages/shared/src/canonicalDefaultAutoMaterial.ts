import {canonicalStrokeRasterContract,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE,canonicalStrokeCoverageMatches,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import type { BrushDescriptor } from './brushes.js'
import { extractCanonicalDefaultAutoPressureTextureProgramData, extractCanonicalDefaultAutoFixedTextureCapability, extractDefaultAutoSourceDataCapability, extractSeededDensityDefaultAutoSourceDataCapability, extractGaussianAutoSourceDataCapability, canonicalSourceComposition } from './canonicalBrushCapability.js'
import type { SourceDefaultAutoData, SourceGaussianAutoData } from './sourceStampData.js'
import { sourceAutoGeometry } from './sourceAutoGeometry.js'

export type CanonicalAutoCoverageProfile = 'scalar-f64-fma-v1' | 'neon64-f32-fma-v1' | typeof CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE | typeof CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE | typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
export interface CanonicalDefaultAutoRecipe {
  readonly kind: 'defaultAuto'
  readonly maskSeed?:number
  readonly sourceSlot?:0|1
  readonly source: SourceDefaultAutoData
  readonly coverageProfile: CanonicalAutoCoverageProfile
  readonly brushScale: number; readonly brushAngle: number
  readonly scale: number; readonly ratio: number; readonly rotation: number
  readonly subX: number; readonly subY: number
  readonly width: number; readonly height: number
  readonly mirrorH: boolean; readonly mirrorV: boolean
}
/** Trusted caller binds VERIFIED descriptor identity; this DTO is not permission. */
export interface CanonicalDefaultAutoSource {
  readonly kind: 'defaultAuto'
  readonly descriptorId: string; readonly descriptorVersion: number; readonly descriptorSha256: string
  readonly source: SourceDefaultAutoData
  readonly brushScale: number; readonly brushAngle: number
  readonly coverageProfile: CanonicalAutoCoverageProfile
}
export type CanonicalGaussianCoverageProfile = 'scalar-bionic-f64-fma-v1' | 'neon64-f32-fma-v1' | typeof CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE | typeof CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE
export interface CanonicalGaussianAutoRecipe extends Omit<CanonicalDefaultAutoRecipe, 'kind'|'source'|'coverageProfile'> {
  readonly kind: 'gaussianAuto'
  readonly source: SourceGaussianAutoData
  readonly coverageProfile: CanonicalGaussianCoverageProfile
}
export interface CanonicalGaussianAutoSource extends Omit<CanonicalDefaultAutoSource, 'kind'|'source'|'coverageProfile'> {
  readonly kind: 'gaussianAuto'
  readonly source: SourceGaussianAutoData
  readonly coverageProfile: CanonicalGaussianCoverageProfile
}
export type CanonicalAutoRecipe = CanonicalDefaultAutoRecipe | CanonicalGaussianAutoRecipe
export type CanonicalAutoSource = CanonicalDefaultAutoSource | CanonicalGaussianAutoSource
const fields = ['kind','generator','shape','diameter','ratio','horizontalFade','verticalFade','antialias','spikes','randomness','density'] as const
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const zero = (n: number) => n === 0 ? 0 : n
/** Explicit static-only zero policy: descriptor JSON need not preserve -0.
 * Dynamic saved shape/subpixel channels NEVER pass through this helper. */
function autoStatic<S extends SourceDefaultAutoData | SourceGaussianAutoData>(source: S, brushScale: number, brushAngle: number, seededDensity = false, seededMask = false, browserShapes = false): {
  source: S; brushScale: number; brushAngle: number
} {
  if (!source || Object.keys(source).length !== fields.length || !fields.every(k => Object.hasOwn(source, k))
    || !(source.kind === 'defaultAuto' && source.generator === 'default' && ['circle','rect'].includes(source.shape)
      || source.kind === 'gaussianAuto' && source.generator === 'gauss' && (source.shape === 'circle'||browserShapes&&source.shape==='rect') && source.ratio <= 1)
    || ![source.diameter,source.ratio,source.horizontalFade,source.verticalFade,brushScale,brushAngle].every(finite)
    || source.diameter <= 0 || source.ratio <= 0 || (!Number.isSafeInteger(source.spikes)||source.spikes<2||source.spikes>64) || (!seededMask&&source.randomness !== 0)||!finite(source.randomness)||source.randomness<0||source.randomness>1 || !finite(source.density) || source.density < 0 || source.density > 1 || (!seededDensity&&!seededMask && source.density !== 1) || (seededDensity && source.kind !== 'defaultAuto')
    || source.horizontalFade < 0 || source.horizontalFade > 1 || source.verticalFade < 0 || source.verticalFade > 1
    || typeof source.antialias !== 'boolean' || brushScale < 0) throw new TypeError('Invalid default-auto static source')
  return { source: Object.freeze<S>({ ...source, diameter: zero(source.diameter), ratio: zero(source.ratio),
    horizontalFade: zero(source.horizontalFade), verticalFade: zero(source.verticalFade), randomness: zero(source.randomness), density: zero(source.density) }),
    brushScale: zero(brushScale), brushAngle: zero(brushAngle) }
}
/** Closed trusted-data validation and static normalization, reused by context,
 * recipe checks and verified-descriptor extraction. Does not grant execution. */
function autoSourcePin<T extends CanonicalAutoSource>(trusted: T): T {
  const allowed=['kind','descriptorId','descriptorVersion','descriptorSha256','source','brushScale','brushAngle','coverageProfile']
  if (!trusted || Object.keys(trusted).length!==allowed.length || !allowed.every(k=>Object.hasOwn(trusted,k))
    || !['defaultAuto','gaussianAuto'].includes(trusted.kind) || trusted.source?.kind !== trusted.kind || typeof trusted.descriptorId!=='string' || !trusted.descriptorId || trusted.descriptorId.length > 256
    || trusted.descriptorId.includes('\0') || !Number.isSafeInteger(trusted.descriptorVersion) || trusted.descriptorVersion < 1
    || typeof trusted.descriptorSha256!=='string' || !/^[a-f0-9]{64}$/.test(trusted.descriptorSha256)
    || !(trusted.kind === 'defaultAuto' ? ['scalar-f64-fma-v1','neon64-f32-fma-v1',CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE] : ['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1',CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE]).includes(trusted.coverageProfile)) throw new TypeError('Invalid trusted auto source')
  return Object.freeze<T>({...trusted,...autoStatic(trusted.source,trusted.brushScale,trusted.brushAngle,trusted.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,trusted.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE,trusted.coverageProfile===CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE||trusted.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE)})
}
export function canonicalAutoCost(recipe: CanonicalAutoRecipe, trusted: CanonicalAutoSource, coverageScaleFactor?:number): { workUnits: number; outputBytes: number } {
  if(recipe.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE?(!Number.isInteger(recipe.maskSeed)||recipe.maskSeed!<0||recipe.maskSeed!>0xffffffff||Object.is(recipe.maskSeed,-0)):recipe.maskSeed!==undefined)throw new TypeError('Invalid recorded mask seed')
  if(coverageScaleFactor!==undefined&&(!Number.isFinite(coverageScaleFactor)||coverageScaleFactor<=0||coverageScaleFactor!==1&&recipe.coverageProfile!==CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE&&recipe.coverageProfile!==CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE))throw new TypeError('Invalid browser auto coverage scale')
  const pin = autoSourcePin(trusted)
  if (recipe.kind !== pin.kind || recipe.source?.kind !== recipe.kind) throw new TypeError('Auto generator mismatch')
  const actual = autoStatic(recipe.source, recipe.brushScale, recipe.brushAngle,recipe.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,recipe.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE,recipe.coverageProfile===CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE||recipe.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE)
  // Raw static -0 is not a canonical wire spelling. Trusted input is normalized
  // independently; no descriptor JSON hash is claimed to attest float bits.
  for (const k of ['diameter','ratio','horizontalFade','verticalFade','spikes','randomness','density'] as const)
    if (!Object.is(recipe.source[k], actual.source[k]) || !Object.is(actual.source[k], pin.source[k])) throw new TypeError('Auto source static mismatch')
  if (!Object.is(recipe.brushScale,actual.brushScale) || !Object.is(recipe.brushAngle,actual.brushAngle)
    || !Object.is(actual.brushScale,pin.brushScale) || !Object.is(actual.brushAngle,pin.brushAngle)
    || fields.some(k => typeof actual.source[k] !== 'number' && actual.source[k] !== pin.source[k])
    || recipe.coverageProfile !== trusted.coverageProfile) throw new TypeError('Auto source policy mismatch')
  const geometry = sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:actual.source.diameter,
    ratio:actual.source.ratio,spikes:actual.source.spikes,scale:actual.brushScale,angle:actual.brushAngle},
  {scale:recipe.scale,ratio:recipe.ratio,rotation:recipe.rotation},recipe.subX,recipe.subY)
  if (recipe.scale <= 0 || recipe.ratio <= 0 || geometry.maskSize[0] !== recipe.width || geometry.maskSize[1] !== recipe.height
    || recipe.width > 4096 || recipe.height > 4096 || recipe.width * recipe.height > 1048576) throw new RangeError('Auto allocation mismatch')
  // RGBA8 service output, not the smaller A8 reference array. Conservative 6x6
  // AA work until common exact sample scheduling becomes a separate capability.
  const minimum=Math.min(actual.source.diameter*recipe.scale*(coverageScaleFactor??1),actual.source.diameter*actual.source.ratio*recipe.scale*recipe.ratio*(coverageScaleFactor??1)),grid=actual.source.antialias&&minimum<10?minimum<1?6:3:1
  const sampleCount=coverageScaleFactor===undefined?(actual.source.antialias?36:1):grid*grid
  const workUnits=recipe.width * recipe.height * (sampleCount + (recipe.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE?Number(actual.source.randomness!==0)+Number(actual.source.density!==1):recipe.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE && actual.source.density<1 ? 1 : 0))
  if(workUnits>16*1024*1024)throw new RangeError('Auto recipe exceeds source evaluator work capacity')
  return { workUnits, outputBytes: recipe.width * recipe.height * 4 }
}

/** Structural extraction from an already verified descriptor; caller still
 * owns authentication, descriptor SHA verification and execution policy. */
export function canonicalDefaultAutoSourceBinding(descriptor: BrushDescriptor, descriptorSha256: string,
  coverageProfile: CanonicalAutoCoverageProfile,rasterProfile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE): CanonicalDefaultAutoSource {
  // Historical direct source binding never grants erase; named Pixel source2
  // factories bind their own extended composition to the same typed source pin.
  const composition=canonicalStrokeCoverageMatches(rasterProfile,coverageProfile)?canonicalSourceComposition(descriptor,rasterProfile):undefined
  if(!composition||composition.outerBlend==='erase')throw new TypeError('Default-auto outer composition unavailable')
  const result = coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE ? extractSeededDensityDefaultAutoSourceDataCapability(descriptor) : extractDefaultAutoSourceDataCapability(descriptor)
  if (!result.supported || !/^[a-f0-9]{64}$/.test(descriptorSha256)
    || !['scalar-f64-fma-v1','neon64-f32-fma-v1',CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE].includes(coverageProfile)) throw new TypeError('Default-auto source capability unavailable')
  const normalized = canonicalDefaultAutoStatic(result.data.source, result.data.brush.scale, result.data.brush.angle,coverageProfile)
  return canonicalDefaultAutoSourcePin({kind:'defaultAuto',descriptorId:descriptor.id,descriptorVersion:descriptor.version,
    descriptorSha256, ...normalized, coverageProfile})
}


/** Verified caller supplies exact descriptor SHA/CAS metadata. This binds only
 * original DefaultAuto geometry+coverage; no room/CAS-storage/execution grant.
 * Old texture-free binding above remains unchanged and refuses this descriptor. */
export function canonicalDefaultAutoFixedTextureSourceBinding(
  descriptor:BrushDescriptor,descriptorSha256:string,coverageProfile:CanonicalAutoCoverageProfile,
  pattern:Readonly<{id:string;size:number}>,rasterProfile:CanonicalStrokeRasterProfile,
):CanonicalDefaultAutoSource {
  if(coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||!canonicalStrokeRasterContract(rasterProfile).genericSC||!canonicalStrokeCoverageMatches(rasterProfile,coverageProfile)
    ||!canonicalSourceComposition(descriptor,rasterProfile))throw new TypeError('Fixed DefaultAuto texture outer composition unavailable')
  const result=extractCanonicalDefaultAutoFixedTextureCapability(descriptor,{pattern})
  if(!result.supported||typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256))throw new TypeError('Fixed DefaultAuto texture source capability unavailable')
  const normalized=canonicalDefaultAutoStatic(result.data.source,result.data.brush.scale,result.data.brush.angle,coverageProfile)
  return canonicalDefaultAutoSourcePin({kind:'defaultAuto',descriptorId:descriptor.id,descriptorVersion:descriptor.version,
    descriptorSha256,...normalized,coverageProfile})
}

/** Original descriptor SHA binds compiled3 material program; no execution grant. */
export function canonicalDefaultAutoPressureTextureSourceBinding(descriptor: BrushDescriptor, descriptorSha256: string, coverageProfile: CanonicalAutoCoverageProfile, pattern: Readonly<{
  id: string;
  size: number;
}>, rasterProfile: CanonicalStrokeRasterProfile): CanonicalDefaultAutoSource {
  if (coverageProfile === CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE || !canonicalStrokeRasterContract(rasterProfile).genericSC || !canonicalStrokeCoverageMatches(rasterProfile, coverageProfile) || !canonicalSourceComposition(descriptor, rasterProfile))
    throw new TypeError("Pressure DefaultAuto texture outer composition unavailable");
  const result = extractCanonicalDefaultAutoPressureTextureProgramData(descriptor, {
    pattern
  });
  if (!result.supported || result.data.source?.kind !== "defaultAuto" || typeof descriptorSha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptorSha256))
    throw new TypeError("Pressure DefaultAuto texture source capability unavailable");
  const normalized = canonicalDefaultAutoStatic(result.data.source, result.data.brush.scale, result.data.brush.angle, coverageProfile);
  return canonicalDefaultAutoSourcePin({
    kind: "defaultAuto",
    descriptorId: descriptor.id,
    descriptorVersion: descriptor.version,
    descriptorSha256,
    ...normalized,
    coverageProfile
  });
}


export function canonicalDefaultAutoStatic(source: SourceDefaultAutoData, brushScale: number, brushAngle: number, coverageProfile?: CanonicalAutoCoverageProfile) {
  if (source?.kind !== 'defaultAuto') throw new TypeError('Expected default auto')
  return autoStatic(source, brushScale, brushAngle,coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE)
}
export function canonicalGaussianAutoStatic(source: SourceGaussianAutoData, brushScale: number, brushAngle: number, coverageProfile?:CanonicalGaussianCoverageProfile) {
  if (source?.kind !== 'gaussianAuto') throw new TypeError('Expected Gaussian auto')
  return autoStatic(source, brushScale, brushAngle,false,coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE,coverageProfile===CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE||coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE)
}
export function canonicalDefaultAutoSourcePin(source: CanonicalDefaultAutoSource): CanonicalDefaultAutoSource {
  if (source?.kind !== 'defaultAuto') throw new TypeError('Expected default auto')
  return autoSourcePin(source)
}
export function canonicalGaussianAutoSourcePin(source: CanonicalGaussianAutoSource): CanonicalGaussianAutoSource {
  if (source?.kind !== 'gaussianAuto') throw new TypeError('Expected Gaussian auto')
  return autoSourcePin(source)
}
export function canonicalDefaultAutoCost(recipe: CanonicalDefaultAutoRecipe, source: CanonicalDefaultAutoSource) {
  if (recipe?.kind !== 'defaultAuto' || source?.kind !== 'defaultAuto') throw new TypeError('Expected default auto')
  return canonicalAutoCost(recipe, source)
}
export function canonicalGaussianAutoCost(recipe: CanonicalGaussianAutoRecipe, source: CanonicalGaussianAutoSource) {
  if (recipe?.kind !== 'gaussianAuto' || source?.kind !== 'gaussianAuto') throw new TypeError('Expected Gaussian auto')
  return canonicalAutoCost(recipe, source)
}
export function canonicalGaussianAutoSourceBinding(descriptor: BrushDescriptor, descriptorSha256: string,
  coverageProfile: CanonicalGaussianCoverageProfile,rasterProfile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE): CanonicalGaussianAutoSource {
  // Historical direct source binding never grants erase; named Pixel source2
  // factories bind their own extended composition to the same typed source pin.
  const composition=canonicalStrokeCoverageMatches(rasterProfile,coverageProfile)?canonicalSourceComposition(descriptor,rasterProfile):undefined
  if(!composition||composition.outerBlend==='erase')throw new TypeError('Gaussian outer composition unavailable')
  const result = extractGaussianAutoSourceDataCapability(descriptor)
  if (!result.supported) throw new TypeError('Gaussian source capability unavailable')
  return canonicalGaussianAutoSourcePin({kind:'gaussianAuto',descriptorId:descriptor.id,descriptorVersion:descriptor.version,
    descriptorSha256,...canonicalGaussianAutoStatic(result.data.source,result.data.brush.scale,result.data.brush.angle),coverageProfile})
}
