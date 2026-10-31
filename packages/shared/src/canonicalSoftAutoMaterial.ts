import type { BrushDescriptor } from './brushes.js'
import { extractSoftAutoSourceDataCapability, hasCanonicalOverComposition } from './canonicalBrushCapability.js'
import type { SourceSoftAutoData, SourceStampCompiledCurve } from './sourceStampData.js'
import { isSourceStampCurveData, SOURCE_STAMP_MAPPED_COMPILER_PROFILE } from './sourceStampData.js'
import { sourceAutoGeometry } from './sourceAutoGeometry.js'
import type { CanonicalDefaultAutoRecipe } from './canonicalDefaultAutoMaterial.js'

/** Data contract only. A trusted caller still owns descriptor verification and
 * execution authorization; a pin never enables soft rendering. */
export interface CanonicalSoftAutoSource {
  readonly kind:'softAuto'; readonly sourceSlot:0|1
  readonly descriptorId:string; readonly descriptorVersion:number; readonly descriptorSha256:string
  readonly source:SourceSoftAutoData
  readonly brushScale:number; readonly brushAngle:number
  readonly coverageProfile:'scalar-f64-fma-v1'|'neon64-f32-fma-v1'
  readonly reader:'krita-bd6e8d0-v1'
  readonly compilerProfile:typeof SOURCE_STAMP_MAPPED_COMPILER_PROFILE
  readonly buildId:string
  readonly radialCurve:SourceStampCompiledCurve
}
export interface CanonicalSoftAutoRecipe extends Omit<CanonicalDefaultAutoRecipe,'kind'|'source'> {
  readonly kind:'softAuto'; readonly sourceSlot:0|1
  readonly source:SourceSoftAutoData
}
const fail=():never=>{throw new TypeError('Invalid trusted soft-auto source or recipe')}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)
const zero=(n:number)=>n===0?0:n
function closed(v:object,fields:readonly string[]):boolean {
  return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k))
}
/** Exact immutable data equality, including coefficient and signed-zero bits.
 * Callers validate/pin inputs first. This recursive comparator is neither an
 * input validator nor a hash/compiler attestation. */
export function canonicalSoftAutoDataEqual(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
  const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>,keys=Object.keys(aa)
  return keys.length===Object.keys(bb).length&&keys.every(k=>Object.hasOwn(bb,k)&&canonicalSoftAutoDataEqual(aa[k],bb[k]))
}
function curveCopy(c:SourceSoftAutoData['softnessCurve']) {
  return Object.freeze({text:c.text,points:Object.freeze(c.points.map(p=>Object.freeze({...p})))})
}
export function canonicalSoftAutoStatic(source:SourceSoftAutoData,brushScale:number,brushAngle:number) {
  if(!closed(source,['kind','generator','shape','diameter','ratio','horizontalFade','verticalFade','antialias','spikes','randomness','density','softnessCurve'])
    ||source.kind!=='softAuto'||source.generator!=='soft'||source.shape!=='circle'||source.spikes!==2||source.randomness!==0||source.density!==1||source.antialias!==false
    ||![source.diameter,source.ratio,source.horizontalFade,source.verticalFade,brushScale,brushAngle].every(finite)
    ||source.diameter<=0||source.ratio<=0||source.ratio>1||brushScale<0||source.horizontalFade<0||source.horizontalFade>1||source.verticalFade<0||source.verticalFade>1
    ||!isSourceStampCurveData(source.softnessCurve)||source.softnessCurve.points.length<2||source.softnessCurve.points.length>9
    ||source.softnessCurve.points[0].corner||source.softnessCurve.points[source.softnessCurve.points.length-1].corner)fail()
  const resolution=Math.floor(source.diameter*4+.5)
  if(!Number.isSafeInteger(resolution)||resolution+2>16384)fail()
  return {source:Object.freeze({...source,diameter:zero(source.diameter),ratio:zero(source.ratio),horizontalFade:zero(source.horizontalFade),verticalFade:zero(source.verticalFade),randomness:0,softnessCurve:curveCopy(source.softnessCurve)}),brushScale:zero(brushScale),brushAngle:zero(brushAngle)}
}
export function canonicalSoftAutoSourcePin(pin:CanonicalSoftAutoSource):CanonicalSoftAutoSource {
  if(!closed(pin,['kind','sourceSlot','descriptorId','descriptorVersion','descriptorSha256','source','brushScale','brushAngle','coverageProfile','reader','compilerProfile','buildId','radialCurve'])
    ||pin.kind!=='softAuto'||![0,1].includes(pin.sourceSlot)||typeof pin.descriptorId!=='string'||!pin.descriptorId||pin.descriptorId.length>256||pin.descriptorId.includes('\0')
    ||!Number.isSafeInteger(pin.descriptorVersion)||pin.descriptorVersion<1||typeof pin.descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(pin.descriptorSha256)
    ||pin.reader!=='krita-bd6e8d0-v1'||pin.compilerProfile!==SOURCE_STAMP_MAPPED_COMPILER_PROFILE||typeof pin.buildId!=='string'||!/^[a-f0-9]{64}$/.test(pin.buildId)
    ||!['scalar-f64-fma-v1','neon64-f32-fma-v1'].includes(pin.coverageProfile))fail()
  const normalized=canonicalSoftAutoStatic(pin.source,pin.brushScale,pin.brushAngle),radial=pin.radialCurve
  if(!closed(radial,['source','coefficients'])||!isSourceStampCurveData(radial.source)||!canonicalSoftAutoDataEqual(radial.source,pin.source.softnessCurve)
    ||!Array.isArray(radial.coefficients)||radial.coefficients.length!==Math.max(1,radial.source.points.length-1)
    ||radial.coefficients.some(c=>!Array.isArray(c)||c.length!==4||!c.every(finite)))fail()
  return Object.freeze({...pin,...normalized,sourceSlot:pin.sourceSlot===0?0:1,radialCurve:Object.freeze({source:curveCopy(radial.source),coefficients:Object.freeze(radial.coefficients.map(c=>Object.freeze([c[0],c[1],c[2],c[3]] as const)))})})
}
export function canonicalSoftAutoCost(recipe:CanonicalSoftAutoRecipe,trusted:CanonicalSoftAutoSource):{workUnits:number;outputBytes:number} {
  const pin=canonicalSoftAutoSourcePin(trusted)
  if(recipe.kind!=='softAuto'||recipe.sourceSlot!==pin.sourceSlot||recipe.coverageProfile!==pin.coverageProfile)fail()
  const actual=canonicalSoftAutoStatic(recipe.source,recipe.brushScale,recipe.brushAngle)
  if(!canonicalSoftAutoDataEqual(actual.source,recipe.source)||!canonicalSoftAutoDataEqual(actual.source,pin.source)
    ||!Object.is(recipe.brushScale,actual.brushScale)||!Object.is(recipe.brushAngle,actual.brushAngle)
    ||!Object.is(actual.brushScale,pin.brushScale)||!Object.is(actual.brushAngle,pin.brushAngle))fail()
  if(![recipe.scale,recipe.ratio,recipe.rotation,recipe.subX,recipe.subY].every(finite)||recipe.scale<=0||recipe.scale>1e6||recipe.ratio<=0||recipe.ratio>100
    ||recipe.subX<0||recipe.subX>=1||recipe.subY<0||recipe.subY>=1||Math.abs(recipe.rotation)>1e6||Math.abs(recipe.brushAngle)>1e6)fail()
  const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:actual.source.diameter,ratio:actual.source.ratio,spikes:2,scale:actual.brushScale,angle:actual.brushAngle},
    {scale:recipe.scale,ratio:recipe.ratio,rotation:recipe.rotation},recipe.subX,recipe.subY)
  if(geometry.maskSize[0]!==recipe.width||geometry.maskSize[1]!==recipe.height||recipe.width<1||recipe.height<1||recipe.width>4096||recipe.height>4096||recipe.width*recipe.height>1048576)fail()
  return {workUnits:recipe.width*recipe.height,outputBytes:recipe.width*recipe.height*4}
}

/** Structural binding from an already verified descriptor. Data readiness is
 * not execution authorization or native compiler/raster attestation. */
export function canonicalSoftAutoSourceBinding(descriptor:BrushDescriptor,descriptorSha256:string,
  coverageProfile:CanonicalSoftAutoSource['coverageProfile'],sourceSlot:0|1=0):CanonicalSoftAutoSource {
  // Reject unsupported policy before inspecting the descriptor or its programs.
  if(sourceSlot!==0||typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256)
    ||!['scalar-f64-fma-v1','neon64-f32-fma-v1'].includes(coverageProfile))throw new TypeError('Soft-auto source capability unavailable')
  if(!hasCanonicalOverComposition(descriptor))throw new TypeError('Soft-auto outer composition unavailable')
  const result=extractSoftAutoSourceDataCapability(descriptor)
  if(!result.supported)throw new TypeError('Soft-auto source capability unavailable')
  const {data}=result,compiled=data.compiled
  if(compiled?.version!==2||!compiled.radialCurve)throw new TypeError('Soft-auto mapped radial program unavailable')
  return canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot,descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256,
    source:data.source,brushScale:data.brush.scale,brushAngle:data.brush.angle,coverageProfile,reader:data.reader,
    compilerProfile:compiled.profile,buildId:compiled.buildId,radialCurve:compiled.radialCurve})
}
