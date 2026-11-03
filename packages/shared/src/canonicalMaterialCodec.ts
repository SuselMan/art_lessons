import {canonicalMaskingBlendModes,isCanonicalMaskingBlendMode,type CanonicalMaskingBlendMode} from './canonicalMaskingBlend.js'
import {CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE} from './canonicalStrokeFrame.js'
import { canonicalSoftAutoSourcePin, canonicalSoftAutoStatic, canonicalSoftAutoCost, type CanonicalSoftAutoSource, type CanonicalSoftAutoRecipe } from './canonicalSoftAutoMaterial.js'
import { canonicalAutoCost, canonicalDefaultAutoStatic, canonicalDefaultAutoSourcePin, canonicalGaussianAutoStatic, canonicalGaussianAutoSourcePin, type CanonicalAutoRecipe, type CanonicalAutoSource } from './canonicalDefaultAutoMaterial.js'
import { canonicalPixelPrimaryTexturePin, type CanonicalPixelPrimaryTexturePin, canonicalMultiplyPrimaryTexturePin, type CanonicalMultiplyPrimaryTexturePin, canonicalRecordedPrimaryTexturePin, type CanonicalRecordedPrimaryTexturePin, canonicalPrimaryTexturePin, canonicalFixedPrimaryTexturePin, canonicalPressureCurvePrimaryTexturePin, type CanonicalPressureCurvePrimaryTexturePin, type CanonicalPrimaryTexturePin, type CanonicalFixedPrimaryTexturePin } from './canonicalPrimaryTexture.js'
import { canonicalMaterialGeometryCost } from './canonicalMaterialGeometry.js'
/** Pure, opt-in source-material transport. Not imported by the operation/wire API.
 * Fences are source INPUT framing, never native composite/reset commands.
 * No image pixels, option programs, RNG, GL state or query transcript is encoded.
 * v1: prefix1| + canonical base64; LE header24, asset40, recipe64, draw32,
 * fence16 bytes. Header holds CMAT, profile1, entry phase, asset/masked flags,
 * counts, zero reserved and safe-integer group F64. Asset hash binds the
 * original source rectangle W/H/X/Y inside trusted CAS-square metadata. F64 render values preserve
 * signed zero exactly; integer channels/group zero canonicalize to positive0.
 * Phase'mask' means AFTER PRIMARY framing even for a primary-only empty tail;
 * it never grants masked execution or implies native composite/reset behavior.
 */
export const CANONICAL_MATERIAL_PROFILE = 'qt5157-neon4-summed-u64-gray-v1' as const
export const CANONICAL_MATERIAL_LIMITS = Object.freeze({ draws:800, rawBytes:192*1024, textBytes:256*1024, pixels:1048576, dimension:4096, workUnits:64*1024*1024, outputBytes:16*1024*1024, drawPixels:16*1024*1024 })
export interface CanonicalMaterialAsset { readonly id:string; readonly size:number; readonly x:number; readonly y:number; readonly width:number; readonly height:number }
export interface CanonicalMaterialParameters {readonly softness:number;readonly lightnessStrength:number;readonly sharpnessAlignValue:number;readonly sharpnessThreshold:number;readonly sharpnessSoftness:number;readonly sharpnessChecked:boolean;readonly sharpnessAlign:boolean}
export interface CanonicalMaterialRecipe {
  readonly imageFrameIndex?:number
  readonly sourceSlot?:0|1
  readonly materialParams?:CanonicalMaterialParameters
  readonly asset:string
  readonly brushScale:number; readonly brushAngle:number
  readonly scale:number; readonly ratio:number; readonly rotation:number
  readonly subX:number; readonly subY:number
  readonly width:number; readonly height:number
  readonly mirrorH:boolean; readonly mirrorV:boolean
}
export type CanonicalSourceColorParameters='source-pigment-rgb8-v1'|'source-pigment-rgba8-v1'
export interface CanonicalMaterialDraw {
  readonly sourcePigmentRGBA?:readonly[number,number,number,number]
  readonly sourcePigmentRGB?:readonly[number,number,number]
  readonly definition:number; readonly role:'primary'|'mask'
  readonly x:number; readonly y:number; readonly opacity:number; readonly flow:number
}
export type CanonicalMaterialEntry = {readonly phase:'between'} | {readonly phase:'primary'|'mask';readonly group:number}
export type CanonicalMaterialFence = {readonly at:number;readonly kind:'segmentBegin'|'primaryEnd'|'segmentEnd';readonly group:number} | {readonly at:number;readonly kind:'gestureEnd'}
export interface CanonicalMaterialFrame {
  readonly profile:typeof CANONICAL_MATERIAL_PROFILE
  readonly masked:boolean
  readonly entry:CanonicalMaterialEntry
  readonly definitions:readonly CanonicalMaterialRecipe[]
  readonly draws:readonly CanonicalMaterialDraw[]
  readonly fences:readonly CanonicalMaterialFence[]
}
/** Conservative per-occurrence lookup/subtract work, not GPU-cycle timing. */
export function canonicalPrimaryTextureDrawWork(width:number,height:number):number {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>4096||height>4096||width*height>1048576)throw new RangeError('Invalid primary texture draw dimensions')
  return width*height
}
export interface CanonicalMaterialCost { readonly workUnits:number; readonly outputBytes:number }
export interface CanonicalMaterialContext {
  /** Trusted room-pinned CAS metadata; never a client URI. Role identities are
   * bound by the caller to the operation's immutable admitted descriptor. */
  readonly assets:readonly CanonicalMaterialAsset[]
  readonly primaryAsset:string; readonly maskAsset?:string
  /** Explicit ordered frame identities from the pinned incremental image pipe.
   * Ordinary static contexts omit this; available assets alone never grant a role. */
  readonly primaryImageFrames?:readonly string[]
  /** REQUIRED trusted metadata-only estimator. No image allocation, span
   * enumeration, RNG, asset fetch or GPU work. The engine adapter will reuse
   * common matrix/extent metadata, reject recipe allocation/domain mismatches,
   * and build detailed plans AFTER aggregate acceptance. */
  readonly preflightDefinition:(recipe:CanonicalMaterialRecipe,asset:CanonicalMaterialAsset)=>CanonicalMaterialCost
  /** Lower trusted limits only; independent sums must be nonnegative safe ints. */
  readonly budget:CanonicalMaterialCost & {readonly drawPixels:number}
  readonly expectedDrawCount?:number
  readonly expectedStrokeEnd?:boolean
}
export interface CanonicalMaterialBuildInput {
  readonly masked:boolean; readonly entry:CanonicalMaterialEntry
  readonly draws:readonly (Omit<CanonicalMaterialDraw,'definition'>&{readonly recipe:CanonicalMaterialRecipe})[]
  readonly fences:readonly CanonicalMaterialFence[]
}
/** v1 image DTOs remain source-compatible. NEW wire2 definitions are tagged. */
export const CANONICAL_SOURCE_MATERIAL_PROFILE = 'canonical-source-material-v2' as const
export type CanonicalSourceMaterialRecipe = ((CanonicalMaterialRecipe & { readonly kind:'image' }) | CanonicalAutoRecipe | CanonicalSoftAutoRecipe)&{readonly materialParams?:CanonicalMaterialParameters}
export interface CanonicalMaterialContextV2 {
  readonly version:2
  readonly materialParams?:'source-material-parameters-v1'
  readonly colorParams?:CanonicalSourceColorParameters
  readonly imageFrameIndices?:'source-image-pipe-frame-v1'
  readonly scaledSource?:'source-scale-v1'
  readonly assets:readonly CanonicalMaterialAsset[]
  readonly primarySource:CanonicalMaterialImageSource | CanonicalAutoSource | CanonicalSoftAutoSource
  readonly maskSource?:CanonicalMaterialImageSource | CanonicalAutoSource | CanonicalSoftAutoSource
  /** Original descriptor-bound masking law, never inferred from frame fences. */
  readonly maskingBlend?:CanonicalMaskingBlendMode
  readonly budget:CanonicalMaterialCost & {readonly drawPixels:number}
  readonly expectedDrawCount?:number
  readonly expectedStrokeEnd?:boolean
}
export interface CanonicalMaterialImageSource {
  readonly kind:'image'; readonly asset:string
  readonly frames?:readonly string[]
  /** Static original lightness-map parameters; never inferred from alpha CAS. */
  readonly imageMaterial?:Readonly<{kind:'lightness-map-v1';grayAsset:string;grayFrames?:readonly string[];strength:number;foregroundAlpha:number}>|Readonly<{kind:'color-stamp-v1';channels:readonly[string,string,string];frames?:readonly (readonly[string,string,string])[];foregroundOpacity:number}>
  readonly brushScale:number; readonly brushAngle:number
}
export interface CanonicalMaterialFrameV2 extends Omit<CanonicalMaterialFrame,'profile'|'definitions'> {
  readonly profile:typeof CANONICAL_SOURCE_MATERIAL_PROFILE
  readonly definitions:readonly CanonicalSourceMaterialRecipe[]
}
export interface CanonicalMaterialBuildInputV2 extends Omit<CanonicalMaterialBuildInput,'draws'> {
  readonly draws:readonly (Omit<CanonicalMaterialDraw,'definition'>&{readonly recipe:CanonicalSourceMaterialRecipe})[]
}
/** Staged parse-only material3. Not included in the existing Any unions. */
export const CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE = 'canonical-primary-texture-material-v3' as const
export interface CanonicalMaterialContextV3 {
  readonly version:3
  readonly assets:readonly CanonicalMaterialAsset[]
  readonly primarySource:Omit<CanonicalMaterialImageSource,'frames'>
  readonly primaryTexture:CanonicalPrimaryTexturePin
  readonly budget:CanonicalMaterialCost & {readonly drawPixels:number}
  readonly expectedDrawCount?:number
  readonly expectedStrokeEnd?:boolean
}
export interface CanonicalMaterialDrawV3 extends Omit<CanonicalMaterialDraw,'role'> {
  readonly role:'primary'; readonly grainDepth:number
}
export interface CanonicalMaterialFrameV3 extends Omit<CanonicalMaterialFrame,'profile'|'definitions'|'draws'> {
  readonly profile:typeof CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE
  readonly masked:false
  readonly definitions:readonly (CanonicalMaterialRecipe & {readonly kind:'image'})[]
  readonly draws:readonly CanonicalMaterialDrawV3[]
}
export interface CanonicalMaterialBuildInputV3 extends Omit<CanonicalMaterialBuildInput,'masked'|'draws'> {
  readonly masked:false
  readonly draws:readonly (Omit<CanonicalMaterialDrawV3,'definition'>&{readonly recipe:CanonicalMaterialRecipe & {readonly kind:'image'}})[]
}
/** Parse-only material4. Not an execution grant or active operation union.
 * One textured-source binary family. The FIRST accepted subset will be
 * DefaultAuto + fixed-one-v1; unknown source/strength discriminants fail closed.
 * Requires unit1 CanonicalFixedPrimaryTexturePin; never widens pressure pin3. */
export const CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE = 'canonical-textured-source-material-v4' as const
export interface CanonicalMaterialContextV4 {
  readonly version:4
  /** Exactly one genuine pattern asset, including an empty probe/frame. */
  readonly assets:readonly CanonicalMaterialAsset[]
  readonly primarySource:Extract<CanonicalAutoSource,{readonly kind:'defaultAuto'}>
  readonly primaryTexture:CanonicalFixedPrimaryTexturePin
  readonly budget:CanonicalMaterialCost & {readonly drawPixels:number}
  readonly expectedDrawCount?:number
  readonly expectedStrokeEnd?:boolean
}
export interface CanonicalMaterialDrawV4 extends Omit<CanonicalMaterialDraw,'role'> {
  readonly role:'primary'
  /** Wire F64 slot is future-compatible; first fixed-only subset accepts +1 ONLY. */
  readonly grainDepth:1
}
export interface CanonicalMaterialFrameV4 extends Omit<CanonicalMaterialFrame,'profile'|'definitions'|'draws'|'masked'> {
  readonly profile:typeof CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE
  readonly masked:false
  readonly definitions:readonly Extract<CanonicalAutoRecipe,{readonly kind:'defaultAuto'}>[]
  readonly draws:readonly CanonicalMaterialDrawV4[]
}
export interface CanonicalMaterialBuildInputV4 extends Omit<CanonicalMaterialBuildInput,'masked'|'draws'> {
  readonly masked:false
  readonly draws:readonly (Omit<CanonicalMaterialDrawV4,'definition'>&{
    readonly recipe:Extract<CanonicalAutoRecipe,{readonly kind:'defaultAuto'}>})[]
}
export const CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE = 'canonical-pressure-textured-source-material-v5' as const
export interface CanonicalMaterialContextV5 {
  readonly version: 5;
  readonly assets: readonly CanonicalMaterialAsset[];
  readonly primarySource: Extract<CanonicalAutoSource, {
    readonly kind: "defaultAuto";
  }>;
  readonly primaryTexture: CanonicalPressureCurvePrimaryTexturePin;
  readonly budget: CanonicalMaterialCost & {
    readonly drawPixels: number;
  };
  readonly expectedDrawCount?: number;
  readonly expectedStrokeEnd?: boolean;
}
export interface CanonicalMaterialDrawV5 extends Omit<CanonicalMaterialDraw, "role"> {
  readonly role: "primary";
  readonly grainDepth: number;
}
export interface CanonicalMaterialFrameV5 extends Omit<CanonicalMaterialFrame, "profile" | "definitions" | "draws" | "masked"> {
  readonly profile: typeof CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE;
  readonly masked: false;
  readonly definitions: readonly Extract<CanonicalAutoRecipe, {
    readonly kind: "defaultAuto";
  }>[];
  readonly draws: readonly CanonicalMaterialDrawV5[];
}
export interface CanonicalMaterialBuildInputV5 extends Omit<CanonicalMaterialBuildInput, "masked" | "draws"> {
  readonly masked: false;
  readonly draws: readonly (Omit<CanonicalMaterialDrawV5, "definition"> & {
    readonly recipe: Extract<CanonicalAutoRecipe, {
      readonly kind: "defaultAuto";
    }>;
  })[];
}
/** Standalone Soft6 metadata, not in Any or operation/read unions. */
export const CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE='canonical-pressure-textured-source-material-v6' as const
export interface CanonicalMaterialContextV6 extends Omit<CanonicalMaterialContextV5,'version'|'primarySource'>{readonly version:6;readonly primarySource:CanonicalSoftAutoSource}
export interface CanonicalMaterialDrawV6 extends CanonicalMaterialDrawV5{}
export interface CanonicalMaterialFrameV6 extends Omit<CanonicalMaterialFrameV5,'profile'|'definitions'>{readonly profile:typeof CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE;readonly definitions:readonly CanonicalSoftAutoRecipe[]}
export interface CanonicalMaterialBuildInputV6 extends Omit<CanonicalMaterialBuildInputV5,'draws'>{readonly draws:readonly(Omit<CanonicalMaterialDrawV6,'definition'>&{readonly recipe:CanonicalSoftAutoRecipe})[]}
/** Standalone generic textured-Auto DATA. Never an execution/read grant. */
export const CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE='canonical-textured-auto-material-v7' as const
export type CanonicalTexturedAutoSource=CanonicalAutoSource|CanonicalSoftAutoSource
export type CanonicalTexturedAutoRecipe=CanonicalAutoRecipe|CanonicalSoftAutoRecipe
export interface CanonicalMaterialContextV7 {
 readonly version:7
 readonly assets:readonly CanonicalMaterialAsset[]
 readonly primarySource:CanonicalTexturedAutoSource
 readonly primaryTexture:CanonicalRecordedPrimaryTexturePin
 readonly budget:CanonicalMaterialCost & {readonly drawPixels:number}
 readonly expectedDrawCount?:number
 readonly expectedStrokeEnd?:boolean
}
export interface CanonicalMaterialDrawV7 extends CanonicalMaterialDrawV5{}
export interface CanonicalMaterialFrameV7 extends Omit<CanonicalMaterialFrameV5,'profile'|'definitions'>{readonly profile:typeof CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE;readonly definitions:readonly CanonicalTexturedAutoRecipe[]}
export interface CanonicalMaterialBuildInputV7 extends Omit<CanonicalMaterialBuildInputV5,'draws'>{readonly draws:readonly(Omit<CanonicalMaterialDrawV7,'definition'>&{readonly recipe:CanonicalTexturedAutoRecipe})[]}
/** Standalone primary-grain8 image DATA, never a source or execution grant. */
export const CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE='canonical-primary-grain-material-v8' as const
export interface CanonicalPrimaryGrainImageSource extends CanonicalMaterialImageSource {
 readonly descriptorId:string;readonly descriptorVersion:number;readonly descriptorSha256:string
}
export interface CanonicalMaterialContextV8 {
 readonly version:8;readonly assets:readonly CanonicalMaterialAsset[]
 readonly primarySource:CanonicalPrimaryGrainImageSource|CanonicalTexturedAutoSource;readonly primaryTexture:CanonicalMultiplyPrimaryTexturePin|CanonicalPixelPrimaryTexturePin
 readonly materialParams?:'source-material-parameters-v1';readonly colorParams?:CanonicalSourceColorParameters;readonly imageFrameIndices?:'source-image-pipe-frame-v1'
  readonly scaledSource?:'source-scale-v1'
 readonly budget:CanonicalMaterialCost&{readonly drawPixels:number}
 readonly expectedDrawCount?:number;readonly expectedStrokeEnd?:boolean
}
export interface CanonicalMaterialDrawV8 extends Omit<CanonicalMaterialDraw,'role'> {readonly role:'primary';readonly grainStrengthU8:number}
export interface CanonicalMaterialFrameV8 extends Omit<CanonicalMaterialFrameV3,'profile'|'draws'|'definitions'> {
 readonly profile:typeof CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE;readonly definitions:readonly AnyCanonicalMaterialRecipe[];readonly draws:readonly CanonicalMaterialDrawV8[]
}
export interface CanonicalMaterialBuildInputV8 extends Omit<CanonicalMaterialBuildInputV3,'draws'> {
 readonly draws:readonly(Omit<CanonicalMaterialDrawV8,'definition'>&{readonly recipe:AnyCanonicalMaterialRecipe})[]
}
export type AnyCanonicalMaterialContext = CanonicalMaterialContext | CanonicalMaterialContextV2
export type AnyCanonicalMaterialFrame = CanonicalMaterialFrame | CanonicalMaterialFrameV2
export type AnyCanonicalMaterialRecipe = (CanonicalMaterialRecipe | CanonicalSourceMaterialRecipe)&{readonly materialParams?:CanonicalMaterialParameters}
type CodecContext=AnyCanonicalMaterialContext|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5|CanonicalMaterialContextV6|CanonicalMaterialContextV7|CanonicalMaterialContextV8
type CodecFrame=AnyCanonicalMaterialFrame|CanonicalMaterialFrameV3|CanonicalMaterialFrameV4|CanonicalMaterialFrameV5|CanonicalMaterialFrameV6|CanonicalMaterialFrameV7|CanonicalMaterialFrameV8
type CodecDraw=CanonicalMaterialDraw|CanonicalMaterialDrawV3|CanonicalMaterialDrawV4|CanonicalMaterialDrawV5|CanonicalMaterialDrawV6|CanonicalMaterialDrawV7|CanonicalMaterialDrawV8
type CodecInput=CanonicalMaterialBuildInput|CanonicalMaterialBuildInputV2|CanonicalMaterialBuildInputV3|CanonicalMaterialBuildInputV4|CanonicalMaterialBuildInputV5|CanonicalMaterialBuildInputV6|CanonicalMaterialBuildInputV7|CanonicalMaterialBuildInputV8
type LegacyCodecContext=Exclude<CodecContext,CanonicalMaterialContextV7|CanonicalMaterialContextV8>
type LegacyCodecFrame=Exclude<CodecFrame,CanonicalMaterialFrameV7|CanonicalMaterialFrameV8>
type LegacyCodecInput=Exclude<CodecInput,CanonicalMaterialBuildInputV7|CanonicalMaterialBuildInputV8>
function rejectStandaloneContext(c:LegacyCodecContext):void{if(c&&Object.getOwnPropertyDescriptor(c,'version')?.value===7||c&&Object.getOwnPropertyDescriptor(c,'version')?.value===8)return fail()}
const isV8=(c:CodecContext):c is CanonicalMaterialContextV8=>'version'in c&&c.version===8
const isV7=(c:CodecContext):c is CanonicalMaterialContextV7=>'version'in c&&c.version===7
const isV3=(c:CodecContext):c is CanonicalMaterialContextV3=>'version'in c&&c.version===3
const isV4=(c:CodecContext):c is CanonicalMaterialContextV4=>'version'in c&&c.version===4
const isV5=(c:CodecContext):c is CanonicalMaterialContextV5=>'version'in c&&c.version===5
const isV6=(c:CodecContext):c is CanonicalMaterialContextV6=>'version'in c&&c.version===6
const textured=(c:CodecContext):c is CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5|CanonicalMaterialContextV6|CanonicalMaterialContextV7|CanonicalMaterialContextV8=>isV3(c)||isV4(c)||isV5(c)||isV6(c)||isV7(c)||isV8(c)
const versioned=(c:CodecContext):c is CanonicalMaterialContextV2|CanonicalMaterialContextV3|CanonicalMaterialContextV4|CanonicalMaterialContextV5|CanonicalMaterialContextV6|CanonicalMaterialContextV7|CanonicalMaterialContextV8=>isV2(c)||textured(c)
const contextVersion=(c:CodecContext):1|2|3|4|5|6|7|8=>isV8(c)?8:isV7(c)?7:isV6(c)?6:isV5(c)?5:isV4(c)?4:isV3(c)?3:isV2(c)?2:1
const frameProfile=(version:1|2|3|4|5|6|7|8)=>version===8?CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE:version===7?CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE:version===6?CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE:version===1?CANONICAL_MATERIAL_PROFILE:version===2?CANONICAL_SOURCE_MATERIAL_PROFILE:version===3?CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE:version===4?CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE:CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE
const isV2 = (c:CodecContext):c is CanonicalMaterialContextV2 => 'version' in c && c.version===2
const auto = (r:AnyCanonicalMaterialRecipe):r is CanonicalAutoRecipe | CanonicalSoftAutoRecipe => 'kind' in r && (r.kind==='defaultAuto'||r.kind==='gaussianAuto'||r.kind==='softAuto')
function normalized(r:AnyCanonicalMaterialRecipe):AnyCanonicalMaterialRecipe {
  if (r && 'kind' in r && r.kind==='defaultAuto') return {...r,...canonicalDefaultAutoStatic(r.source,r.brushScale,r.brushAngle,r.coverageProfile)}
  if (r && 'kind' in r && r.kind==='gaussianAuto') return {...r,...canonicalGaussianAutoStatic(r.source,r.brushScale,r.brushAngle,r.coverageProfile)}
  if (r && 'kind' in r && r.kind==='softAuto') return {...r,...canonicalSoftAutoStatic(r.source,r.brushScale,r.brushAngle,r.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE)}
  return r
}
const localTexture8=(c:CodecContext):boolean=>isV8(c)&&c.primaryTexture.law==='pixel-texture-u8-v1'
const rgbaColor=(c:CodecContext):boolean=>(isV2(c)||isV8(c))&&c.colorParams==='source-pigment-rgba8-v1'
const colorField=(c:CodecContext):'sourcePigmentRGB'|'sourcePigmentRGBA'|undefined=>(isV2(c)||isV8(c))&&c.colorParams?(rgbaColor(c)?'sourcePigmentRGBA':'sourcePigmentRGB'):undefined
const colorFields=(c:CodecContext):readonly string[]=>{const field=colorField(c);return field?[field]:[]}
function recordedColor(d:Pick<CanonicalMaterialDraw,'sourcePigmentRGB'|'sourcePigmentRGBA'>,c:CodecContext):Pick<CanonicalMaterialDraw,'sourcePigmentRGB'|'sourcePigmentRGBA'>{return rgbaColor(c)?{sourcePigmentRGBA:d.sourcePigmentRGBA}:colorField(c)?{sourcePigmentRGB:d.sourcePigmentRGB}:{}}
const scaledContext=(c:CodecContext):boolean=>(isV2(c)||isV8(c))&&c.scaledSource==='source-scale-v1'
const indexedImages=(c:CodecContext):boolean=>(isV2(c)||isV8(c))&&c.imageFrameIndices==='source-image-pipe-frame-v1'
const seededContext=(c:CodecContext):boolean=>(isV2(c)||isV8(c))&&((c.primarySource.kind!=='image'&&c.primarySource.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE)||(isV2(c)&&!!c.maskSource&&c.maskSource.kind!=='image'&&c.maskSource.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE))
const HEADER=24, ASSET=40, DEFINITION=64, DEFINITION2=96, DRAW=32, DRAW3=40, FENCE=16
const FLOATS=['brushScale','brushAngle','scale','ratio','rotation','subX','subY'] as const
const KINDS=['segmentBegin','primaryEnd','segmentEnd','gestureEnd'] as const
const fail=():never=>{throw new Error('canonical material: invalid or unsupported frame')}
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max
const assetId=(v:unknown):v is string=>typeof v==='string'&&/^asset:[0-9a-f]{64}$/.test(v)
function keys(v:unknown,allowed:readonly string[]):void {if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail()}
/** V3 captures own data; historical1/2 numeric/layout rules stay unchanged.
 * A present context version must now be own data (never an inherited getter). */
function ownRecord(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))return fail()
  const prototype=Object.getPrototypeOf(value)
  if(prototype!==Object.prototype&&prototype!==null)return fail()
  const fields=Reflect.ownKeys(value)
  if(fields.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k)))return fail()
  const out:Record<string,unknown>=Object.create(null)
  for(const field of [...required,...optional]){
    const d=Object.getOwnPropertyDescriptor(value,field)
    if(!d){if(required.includes(field))return fail();continue}
    if(!Object.hasOwn(d,'value'))return fail()
    out[field]=d.value
  }
  return out
}
function ownArray(value:unknown,max:number,read:(value:unknown)=>unknown):unknown[]{
  if(!Array.isArray(value)||value.length>max||Object.getPrototypeOf(value)!==Array.prototype)return fail()
  const fields=Reflect.ownKeys(value)
  if(fields.length!==value.length+1||fields.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)))return fail()
  const out:unknown[]=[]
  for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))return fail();out.push(read(d.value))}
  return out
}
function captureCanonicalImageMaterial(value:unknown):NonNullable<CanonicalMaterialImageSource['imageMaterial']>{
 const kind=Object.getOwnPropertyDescriptor(value??{},'kind');if(!kind||!Object.hasOwn(kind,'value'))return fail()
 const readId=(id:unknown):string=>{if(typeof id!=='string'||!assetId(id))return fail();return id}
 const triple=(value:unknown):readonly[string,string,string]=>{const ids=ownArray(value,3,v=>v).map(readId);if(ids.length!==3)return fail();return Object.freeze([ids[0],ids[1],ids[2]])}
 if(kind.value==='lightness-map-v1'){
  const m=ownRecord(value,['kind','grayAsset','strength','foregroundAlpha'],['grayFrames'])
  if(!number(m.strength,0,1)||!number(m.foregroundAlpha,0,1))return fail()
  return Object.freeze({kind:'lightness-map-v1',grayAsset:readId(m.grayAsset),strength:m.strength,foregroundAlpha:m.foregroundAlpha,...m.grayFrames!==undefined?{grayFrames:Object.freeze(ownArray(m.grayFrames,256,v=>v).map(readId))}:{}})
 }
 const m=ownRecord(value,['kind','channels','foregroundOpacity'],['frames']);if(m.kind!=='color-stamp-v1'||!number(m.foregroundOpacity,0,1))return fail()
 return Object.freeze({kind:'color-stamp-v1',channels:triple(m.channels),foregroundOpacity:m.foregroundOpacity,...m.frames!==undefined?{frames:Object.freeze(ownArray(m.frames,256,v=>v).map(triple))}:{}})
}

function captureContext(c:CodecContext):CodecContext{
  if(!c||typeof c!=='object')return c
  const v=Object.getOwnPropertyDescriptor(c,'version')
  if(!v&&'version'in c)return fail()
  if(v&&!Object.hasOwn(v,'value'))return fail()
  if(v?.value===8)return canonicalPrimaryGrainMaterialContext(c)
  if(v?.value===7)return canonicalTexturedAutoMaterialContext(c)
  if(v?.value===6)return canonicalSoftNativeDefaultTexturedSourceMaterialContext(c)
  if(v?.value===5)return canonicalPressureTexturedSourceMaterialContext(c)
  if(v?.value===4)return canonicalTexturedSourceMaterialContext(c)
  if(!v||v.value!==3)return c
  return canonicalPrimaryTextureMaterialContext(c)
}
/** Independently captured, closed V3 parser metadata; not an execution grant. */
export function canonicalPrimaryTextureMaterialContext(value:unknown):CanonicalMaterialContextV3 {
  const p=ownRecord(value,['version','assets','primarySource','primaryTexture','budget'],['expectedDrawCount','expectedStrokeEnd'])
  if(p.version!==3)return fail()
  const assets=ownArray(p.assets,2,a=>ownRecord(a,['id','size','x','y','width','height'])) as unknown as CanonicalMaterialAsset[]
  if(assets.length!==2)return fail()
  const primarySource=ownRecord(p.primarySource,['kind','asset','brushScale','brushAngle'])
  const budget=ownRecord(p.budget,['workUnits','outputBytes','drawPixels'])
  const captured={...p,assets,primarySource,primaryTexture:canonicalPrimaryTexturePin(p.primaryTexture,assets[1]),budget} as unknown as CanonicalMaterialContextV3
  context(captured)
  for(const asset of assets)Object.freeze(asset)
  Object.freeze(assets);Object.freeze(primarySource);Object.freeze(budget)
  return Object.freeze(captured)
}
const autoSourceFields=['kind','generator','shape','diameter','ratio','horizontalFade','verticalFade','antialias','spikes','randomness','density'] as const
const autoPinFields=['kind','descriptorId','descriptorVersion','descriptorSha256','source','brushScale','brushAngle','coverageProfile'] as const
function capturedDefaultAuto(value:unknown){
  const p=ownRecord(value,autoPinFields),source=ownRecord(p.source,autoSourceFields)
  // The existing pure pin owns static-domain normalization. Raw objects never
  // reach it until all fields have been captured without invoking accessors.
  const pin=canonicalDefaultAutoSourcePin({...p,source} as unknown as Extract<CanonicalAutoSource,{kind:'defaultAuto'}>)
  if(pin.coverageProfile!== 'scalar-f64-fma-v1'&&pin.coverageProfile!=='neon64-f32-fma-v1'&&pin.coverageProfile!==CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE)return fail()
  return pin
}
function capturedSoftCurve(value:unknown){
 const p=ownRecord(value,['text','points'])
 return Object.freeze({...p,points:Object.freeze(ownArray(p.points,9,x=>Object.freeze(ownRecord(x,['x','y','corner']))))})
}
function capturedSoftAuto(value:unknown,sourceSlot:0|1=0):CanonicalSoftAutoSource {
 const p=ownRecord(value,['kind','sourceSlot','descriptorId','descriptorVersion','descriptorSha256','source','brushScale','brushAngle','coverageProfile','reader','compilerProfile','buildId','radialCurve'])
 const source=ownRecord(p.source,[...autoSourceFields,'softnessCurve']),radial=ownRecord(p.radialCurve,['source','coefficients'])
 const pin=canonicalSoftAutoSourcePin({...p,source:{...source,softnessCurve:capturedSoftCurve(source.softnessCurve)},radialCurve:{source:capturedSoftCurve(radial.source),coefficients:ownArray(radial.coefficients,8,row=>ownArray(row,4,x=>x))}} as unknown as CanonicalSoftAutoSource)
 if(pin.sourceSlot!==sourceSlot)return fail()
 return pin
}
/** Closed, independent parser metadata. No grant, source evaluation or CAS fetch. */
export function canonicalTexturedSourceMaterialContext(value:unknown):CanonicalMaterialContextV4 {
  const p=ownRecord(value,['version','assets','primarySource','primaryTexture','budget'],['expectedDrawCount','expectedStrokeEnd'])
  if(p.version!==4)return fail()
  const assets=ownArray(p.assets,1,a=>ownRecord(a,['id','size','x','y','width','height'])) as unknown as CanonicalMaterialAsset[]
  if(assets.length!==1)return fail()
  const primarySource=capturedDefaultAuto(p.primarySource),budget=ownRecord(p.budget,['workUnits','outputBytes','drawPixels'])
  const primaryTexture=canonicalFixedPrimaryTexturePin(p.primaryTexture,assets[0])
  const captured={...p,assets,primarySource,primaryTexture,budget} as unknown as CanonicalMaterialContextV4
  context(captured)
  Object.freeze(assets[0]);Object.freeze(assets);Object.freeze(budget)
  return Object.freeze(captured)
}
/** One capture skeleton, explicit closed source/version wrappers. */
function capturePressureSourceContext(value:unknown,version:5):CanonicalMaterialContextV5
function capturePressureSourceContext(value:unknown,version:6):CanonicalMaterialContextV6
function capturePressureSourceContext(value:unknown,version:5|6):CanonicalMaterialContextV5|CanonicalMaterialContextV6 {
 const p=ownRecord(value,['version','assets','primarySource','primaryTexture','budget'],['expectedDrawCount','expectedStrokeEnd'])
 if(p.version!==version)return fail()
 const assets=ownArray(p.assets,1,a=>ownRecord(a,['id','size','x','y','width','height'])) as unknown as CanonicalMaterialAsset[]
 if(assets.length!==1)return fail()
 const budget=ownRecord(p.budget,['workUnits','outputBytes','drawPixels']) as unknown as CanonicalMaterialContextV5['budget']
 const primaryTexture=canonicalPressureCurvePrimaryTexturePin(p.primaryTexture,assets)
 const captured=version===6?{...p,version:6 as const,assets,budget,primaryTexture,primarySource:capturedSoftAuto(p.primarySource)}:{...p,version:5 as const,assets,budget,primaryTexture,primarySource:capturedDefaultAuto(p.primarySource)}
 context(captured)
 Object.freeze(assets[0]);Object.freeze(assets);Object.freeze(budget)
 return Object.freeze(captured)
}
export function canonicalPressureTexturedSourceMaterialContext(value:unknown):CanonicalMaterialContextV5{return capturePressureSourceContext(value,5)}
export function canonicalSoftNativeDefaultTexturedSourceMaterialContext(value:unknown):CanonicalMaterialContextV6{return capturePressureSourceContext(value,6)}
function capturedTexturedAuto(value:unknown):CanonicalTexturedAutoSource {
 const kind=Object.getOwnPropertyDescriptor(value??{},'kind')
 if(!kind||!Object.hasOwn(kind,'value'))return fail()
 if(kind.value==='softAuto')return capturedSoftAuto(value)
 if(kind.value==='defaultAuto')return capturedDefaultAuto(value)
 if(kind.value!=='gaussianAuto')return fail()
 const p=ownRecord(value,autoPinFields),source=ownRecord(p.source,autoSourceFields)
 return canonicalGaussianAutoSourcePin({...p,source} as unknown as Extract<CanonicalAutoSource,{kind:'gaussianAuto'}>)
}
export function canonicalTexturedAutoMaterialContext(value:unknown):CanonicalMaterialContextV7 {
 const p=ownRecord(value,['version','assets','primarySource','primaryTexture','budget'],['expectedDrawCount','expectedStrokeEnd'])
 if(p.version!==7)return fail()
 const assets=ownArray(p.assets,1,a=>ownRecord(a,['id','size','x','y','width','height'])) as unknown as CanonicalMaterialAsset[]
 if(assets.length!==1)return fail()
 const primarySource=capturedTexturedAuto(p.primarySource),a=assets[0]
 const primaryTexture=canonicalRecordedPrimaryTexturePin(p.primaryTexture,a)
 const budget=ownRecord(p.budget,['workUnits','outputBytes','drawPixels']) as unknown as CanonicalMaterialContextV7['budget']
 const captured={...p,version:7 as const,assets,primarySource,primaryTexture,budget}
 context(captured)
 Object.freeze(a);Object.freeze(assets);Object.freeze(budget)
 return Object.freeze(captured)
}
export function canonicalPrimaryGrainMaterialContext(value:unknown):CanonicalMaterialContextV8 {
 const p=ownRecord(value,['version','assets','primarySource','primaryTexture','budget'],['materialParams','colorParams','imageFrameIndices','scaledSource','expectedDrawCount','expectedStrokeEnd'])
 if(p.version!==8||p.materialParams!==undefined&&p.materialParams!=='source-material-parameters-v1'||p.colorParams!==undefined&&p.colorParams!=='source-pigment-rgb8-v1'&&p.colorParams!=='source-pigment-rgba8-v1')return fail()
 const assets=ownArray(p.assets,2048,a=>Object.freeze(ownRecord(a,['id','size','x','y','width','height']))) as unknown as CanonicalMaterialAsset[]
 if(!assets.length)return fail()
 const kind=Object.getOwnPropertyDescriptor(p.primarySource??{},'kind');if(!kind||!Object.hasOwn(kind,'value'))return fail()
 let primarySource:CanonicalMaterialContextV8['primarySource']
 if(kind.value==='image'){
  const source=ownRecord(p.primarySource,['kind','asset','brushScale','brushAngle','descriptorId','descriptorVersion','descriptorSha256'],['frames','imageMaterial'])
  const image=captureSourceSlot({kind:source.kind,asset:source.asset,brushScale:source.brushScale,brushAngle:source.brushAngle,...source.frames!==undefined?{frames:source.frames}:{},...source.imageMaterial!==undefined?{imageMaterial:source.imageMaterial}:{}},0)
  if(image.kind!=='image')return fail()
  primarySource=Object.freeze({...image,descriptorId:source.descriptorId,descriptorVersion:source.descriptorVersion,descriptorSha256:source.descriptorSha256}) as CanonicalPrimaryGrainImageSource
 }else primarySource=capturedTexturedAuto(p.primarySource)
 const law=Object.getOwnPropertyDescriptor(p.primaryTexture??{},'law');if(!law||!Object.hasOwn(law,'value'))return fail()
 const primaryTexture=law.value==='pixel-texture-u8-v1'?canonicalPixelPrimaryTexturePin(p.primaryTexture,assets[assets.length-1]):canonicalMultiplyPrimaryTexturePin(p.primaryTexture,assets[assets.length-1])
 const budget=Object.freeze(ownRecord(p.budget,['workUnits','outputBytes','drawPixels'])) as unknown as CanonicalMaterialContextV8['budget']
 for(const a of assets)if([a.size,a.x,a.y,a.width,a.height].some(v=>Object.is(v,-0)))return fail()
 if(primarySource.kind==='image'&&[primarySource.brushScale,primarySource.brushAngle,primarySource.descriptorVersion].some(v=>Object.is(v,-0)))return fail()
 const captured={...p,version:8 as const,assets:Object.freeze(assets),primarySource,primaryTexture,budget} as CanonicalMaterialContextV8
 context(captured);return Object.freeze(captured)
}
function captureTexturedAutoRecipe(value:unknown):Record<string,unknown>{
 const k=Object.getOwnPropertyDescriptor(value??{},'kind')
 if(!k||!Object.hasOwn(k,'value')||!['defaultAuto','gaussianAuto','softAuto'].includes(k.value))return fail()
 if(k.value==='softAuto')return captureAutoRecipe(value,true)
 const p=ownRecord(value,['kind','source','coverageProfile',...FLOATS,'width','height','mirrorH','mirrorV'])
 return {...p,source:Object.freeze(ownRecord(p.source,autoSourceFields))}
}
const imageFields=['kind','asset',...FLOATS,'width','height','mirrorH','mirrorV'] as const
function captureTextureInput(value:unknown,framed:boolean,version:3|4|5|6|7|8=3,c?:CanonicalMaterialContextV8):Record<string,unknown>{
  const p=ownRecord(value,framed?['profile','masked','entry','definitions','draws','fences']:['masked','entry','draws','fences'])
  const draws=ownArray(p.draws,800,d=>{
    const a=ownRecord(d,framed?['definition','role','x','y','opacity','flow',...(version===8?['grainStrengthU8',...c?colorFields(c):[]]:['grainDepth'])]:['recipe','role','x','y','opacity','flow',...(version===8?['grainStrengthU8',...c?colorFields(c):[]]:['grainDepth'])])
    if(version===8?!integer(a.grainStrengthU8,0,255)||Object.is(a.grainStrengthU8,-0):version===4?a.grainDepth!==1:!number(a.grainDepth,0,1))return fail()
    if(version===8&&c&&colorField(c)){const field=colorField(c)!,n=rgbaColor(c)?4:3,rgb=ownArray(a[field],n,v=>v);if(rgb.length!==n)return fail();a[field]=Object.freeze(rgb)}
    return framed?a:{...a,recipe:version===8?capturePixelRecipe(a.recipe,c):version===7?captureTexturedAutoRecipe(a.recipe):version>=4?captureAutoRecipe(a.recipe,version===6):ownRecord(a.recipe,imageFields)}
  })
  const fences=ownArray(p.fences,3*(draws.length+1)+1,f=>ownRecord(f,['at','kind'],['group']))
  const entry=ownRecord(p.entry,['phase'],['group'])
  return {...p,entry,draws,fences,...framed?{definitions:ownArray(p.definitions,draws.length,d=>version===8?capturePixelRecipe(d,c):version===7?captureTexturedAutoRecipe(d):version>=4?captureAutoRecipe(d,version===6):ownRecord(d,imageFields))}:{}}
}
function capturePixelRecipe(value:unknown,c?:CanonicalMaterialContextV8):Record<string,unknown>{
 const kind=Object.getOwnPropertyDescriptor(value??{},'kind');if(!kind||!Object.hasOwn(kind,'value'))return fail()
 const fields=kind.value==='image'?[...imageFields]:['kind','source','coverageProfile',...kind.value==='softAuto'?['sourceSlot']:[],...FLOATS,'width','height','mirrorH','mirrorV']
 const p=ownRecord(value,fields,[...c?.imageFrameIndices&&kind.value==='image'?['imageFrameIndex','sourceSlot']:[],...c?.materialParams?['materialParams']:[],...kind.value!=='image'?['maskSeed',...kind.value!=='softAuto'?['sourceSlot']:[]]:[]])
 const params=p.materialParams===undefined?undefined:Object.freeze(ownRecord(p.materialParams,['softness','lightnessStrength','sharpnessAlignValue','sharpnessThreshold','sharpnessSoftness','sharpnessChecked','sharpnessAlign']))
 if(kind.value==='image')return {...p,...params?{materialParams:params}:{}}
 const source=ownRecord(p.source,kind.value==='softAuto'?[...autoSourceFields,'softnessCurve']:autoSourceFields)
 return {...p,source:Object.freeze(kind.value==='softAuto'?{...source,softnessCurve:capturedSoftCurve(source.softnessCurve)}:source),...params?{materialParams:params}:{}}
}
function captureAutoRecipe(value:unknown,soft=false):Record<string,unknown>{
  const r=ownRecord(value,['kind','source','coverageProfile',...(soft?['sourceSlot']:[]),...FLOATS,'width','height','mirrorH','mirrorV'])
  if(r.kind!==(soft?'softAuto':'defaultAuto'))return fail()
  const source=ownRecord(r.source,soft?[...autoSourceFields,'softnessCurve']:autoSourceFields)
  return {...r,source:Object.freeze(soft?{...source,softnessCurve:capturedSoftCurve(source.softnessCurve)}:source)}
}
/** Closed own-data ordered identities; availability alone is never a role grant. */
export function canonicalImageFrameIds(value:unknown,primary:string,ids:ReadonlySet<string>):readonly string[] {
  if(!Array.isArray(value)||value.length<2||value.length>256)return fail()
  const fields=Reflect.ownKeys(value)
  if(fields.length!==value.length+1||fields.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)))fail()
  const result:string[]=[]
  for(let i=0;i<value.length;i++){
    const d=Object.getOwnPropertyDescriptor(value,String(i))
    if(!d||!Object.hasOwn(d,'value')||!assetId(d.value)||!ids.has(d.value))return fail()
    result.push(d.value)
  }
  if(result[0]!==primary||new Set(result).size!==ids.size)fail()
  return Object.freeze(result)
}
function validateImageMaterialFrames(source:CanonicalMaterialImageSource,c:CodecContext):readonly string[]{
 const m=captureCanonicalImageMaterial(source.imageMaterial),frames=source.frames??[source.asset]
 const rows=m.kind==='lightness-map-v1'?(m.grayFrames??[m.grayAsset]).map(id=>[id]):m.frames??[m.channels]
 if(rows.length!==1&&!indexedImages(c)||rows.length!==(m.kind==='lightness-map-v1'&&m.grayFrames||m.kind==='color-stamp-v1'&&m.frames?frames.length:1))return fail()
 if(m.kind==='lightness-map-v1'&&rows[0]?.[0]!==m.grayAsset||m.kind==='color-stamp-v1'&&rows[0]?.some((id,i)=>id!==m.channels[i]))return fail()
 const ids:string[]=[]
 for(let i=0;i<rows.length;i++){const alpha=asset(c,frames[rows.length===1?0:i]);for(const id of rows[i]){const plane=asset(c,id);if(['size','x','y','width','height'].some(k=>Reflect.get(alpha,k)!==Reflect.get(plane,k)))return fail();ids.push(id)}}
 return ids
}
function context(c:CodecContext):void {
  if(!c||!Array.isArray(c.assets)||c.assets.length>2048||(!versioned(c)&&(!assetId(c.primaryAsset)||c.maskAsset!==undefined&&!assetId(c.maskAsset)||typeof c.preflightDefinition!=='function'))
    ||!c.budget||!integer(c.budget.workUnits,0,CANONICAL_MATERIAL_LIMITS.workUnits)||!integer(c.budget.outputBytes,0,CANONICAL_MATERIAL_LIMITS.outputBytes)||!integer(c.budget.drawPixels,0,CANONICAL_MATERIAL_LIMITS.drawPixels)
    ||c.expectedDrawCount!==undefined&&!integer(c.expectedDrawCount,0,800)||c.expectedStrokeEnd!==undefined&&typeof c.expectedStrokeEnd!=='boolean')fail()
  if((isV2(c)||isV8(c))&&c.imageFrameIndices!==undefined&&c.imageFrameIndices!=='source-image-pipe-frame-v1')return fail()
  if((isV2(c)||isV8(c))&&c.scaledSource!==undefined&&c.scaledSource!=='source-scale-v1')return fail()
  const ids=new Set<string>()
  for(const a of c.assets){keys(a,['id','size','x','y','width','height']);if(!assetId(a.id)||!integer(a.size,1,4096)||!integer(a.width,1,4096)||!integer(a.height,1,4096)||a.width*a.height>1048576||!integer(a.x,0,a.size-a.width)||!integer(a.y,0,a.size-a.height)||ids.has(a.id))fail();ids.add(a.id)}
  if(isV8(c)){
    const p=c.primarySource
    if(c.primaryTexture.asset!==c.assets[c.assets.length-1]?.id||c.materialParams!==undefined&&c.materialParams!=='source-material-parameters-v1'||c.colorParams!==undefined&&c.colorParams!=='source-pigment-rgb8-v1'&&c.colorParams!=='source-pigment-rgba8-v1')return fail()
    if(p.kind!=='image'){if(c.assets.length!==1||c.primaryTexture.law!=='pixel-texture-u8-v1')return fail();capturedTexturedAuto(p);return}
    if(p.asset!==c.assets[0]?.id||!number(p.brushScale,Number.MIN_VALUE,1e6)||!number(p.brushAngle,-1e6,1e6)
      ||typeof p.descriptorId!=='string'||!p.descriptorId.length||p.descriptorId.length>256||p.descriptorId.includes('\0')
      ||!integer(p.descriptorVersion,1,Number.MAX_SAFE_INTEGER)||typeof p.descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.descriptorSha256))return fail()
    const required=new Set([p.asset,c.primaryTexture.asset])
    for(const id of p.frames??[])required.add(id)
    if(p.imageMaterial)for(const id of validateImageMaterialFrames(p,c)){required.add(id)}
    if(required.size!==ids.size||[...required].some(id=>!ids.has(id)))return fail()
    if(c.primaryTexture.law==='hard-multiply-u8-native-v1'&&(c.assets.length!==2||p.imageMaterial||p.frames||c.materialParams||c.colorParams||c.imageFrameIndices||c.scaledSource))return fail()
    return
  }
  if(isV7(c)){
    if(c.assets.length!==1||c.primaryTexture.asset!==c.assets[0].id||c.primaryTexture.strength!=='recorded-grain-v1')return fail()
    capturedTexturedAuto(c.primarySource);return
  }
  if(isV6(c)){
    if(c.assets.length!==1||c.primarySource.kind!=='softAuto'||c.primarySource.sourceSlot!==0||c.primaryTexture.asset!==c.assets[0].id||c.primaryTexture.strength!=='source-pressure-curve-v1')return fail()
    capturedSoftAuto(c.primarySource);return
  }
  if(isV4(c)||isV5(c)){
    if(c.assets.length!==1||c.primarySource.kind!=='defaultAuto'||c.primaryTexture.asset!==c.assets[0].id||c.primaryTexture.strength!==(isV5(c)?'source-pressure-curve-v1':'fixed-one-v1'))fail()
    capturedDefaultAuto(c.primarySource)
    return
  }
  if(isV3(c)){
    if(c.assets.length!==2||c.primarySource.kind!=='image'||c.primarySource.asset!==c.assets[0].id||c.primaryTexture.asset!==c.assets[1].id
      ||!number(c.primarySource.brushScale,Number.MIN_VALUE,1e6)||!number(c.primarySource.brushAngle,-1e6,1e6))fail()
    return
  }
  if(!isV2(c)){
    if(!ids.has(c.primaryAsset)||c.maskAsset!==undefined&&!ids.has(c.maskAsset))fail()
    const frames=c.primaryImageFrames
    if(frames!==undefined&&(!Array.isArray(frames)||frames.length<2||frames.length>256
      ||frames[0]!==c.primaryAsset||frames.some(id=>!assetId(id)||!ids.has(id))))fail()
  }
  else {
    keys(c,['version','assets','primarySource','maskSource','maskingBlend','materialParams','colorParams','imageFrameIndices','scaledSource','budget','expectedDrawCount','expectedStrokeEnd'])
    if(c.colorParams!==undefined&&c.colorParams!=='source-pigment-rgb8-v1'&&c.colorParams!=='source-pigment-rgba8-v1')fail()
    if(c.materialParams!==undefined&&c.materialParams!=='source-material-parameters-v1')fail()
    if(c.maskingBlend!==undefined&&(!c.maskSource||(!isCanonicalMaskingBlendMode(c.maskingBlend)||canonicalMaskingBlendModes.indexOf(c.maskingBlend)>=10)))fail()
    for(const [sourceSlot,source] of [c.primarySource,c.maskSource].entries()) {
      if(source===undefined){if(sourceSlot===0)fail();continue}
      if(source.kind==='image') {
        keys(source,['kind','asset','brushScale','brushAngle','frames','imageMaterial'])
        if(source.imageMaterial!==undefined)validateImageMaterialFrames(source,c)
        const frameField=Object.getOwnPropertyDescriptor(source,'frames')
        if('frames' in source&&!frameField)fail()
        if(frameField){if(sourceSlot!==0&&!indexedImages(c)||!Object.hasOwn(frameField,'value'))fail();const roleIds=new Set((source.frames??[]).filter(id=>ids.has(id)));if(indexedImages(c)){if(!source.frames?.length||source.frames.length>256||source.frames[0]!==source.asset)return fail();for(const id of source.frames)if(!ids.has(id))return fail()}else canonicalImageFrameIds(frameField.value,source.asset,roleIds)}
        if(!ids.has(source.asset)||!number(source.brushScale,Number.MIN_VALUE,1e6)||!number(source.brushAngle,-1e6,1e6))fail()
      } else if(source.kind==='defaultAuto') {
        canonicalDefaultAutoSourcePin(source)
        if(source.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE&&(sourceSlot!==0||c.maskSource!==undefined))fail()
      } else if(source.kind==='gaussianAuto') {
        canonicalGaussianAutoSourcePin(source)
      } else if(source.kind==='softAuto') {
        canonicalSoftAutoSourcePin(source)
        if(source.sourceSlot!==sourceSlot)fail()
      } else fail()
    }
  }
}
function asset(c:CodecContext,id:string):CanonicalMaterialAsset {const a=c.assets.find(a=>a.id===id);if(!a)return fail();return a}
function recipe(r:AnyCanonicalMaterialRecipe,c:CodecContext):CanonicalMaterialCost {
  if((isV2(c)||isV8(c))&&c.materialParams){const p=ownRecord(r.materialParams,['softness','lightnessStrength','sharpnessAlignValue','sharpnessThreshold','sharpnessSoftness','sharpnessChecked','sharpnessAlign']);if(!['softness','lightnessStrength','sharpnessAlignValue','sharpnessThreshold'].every(k=>number(p[k],0,1))||!integer(p.sharpnessSoftness,0,100)||typeof p.sharpnessChecked!=='boolean'||typeof p.sharpnessAlign!=='boolean')fail()}else if(r.materialParams!==undefined)fail()
  if(!auto(r)){if(indexedImages(c)){if(!integer(r.imageFrameIndex,0,255)||Object.is(r.imageFrameIndex,-0)||!integer(r.sourceSlot,0,1)||Object.is(r.sourceSlot,-0)||isV8(c)&&r.sourceSlot!==0)return fail();const p=isV2(c)?r.sourceSlot===0?c.primarySource:c.maskSource:isV8(c)?c.primarySource:undefined;if(p?.kind!=='image'||(p.frames??[p.asset])[r.imageFrameIndex!]!==r.asset)return fail()}else if(r.imageFrameIndex!==undefined||r.sourceSlot!==undefined)return fail()}
  if(auto(r)&&r.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE){if(!seededContext(c)||!integer(r.maskSeed,0,0xffffffff)||Object.is(r.maskSeed,-0)||!integer(r.sourceSlot,0,1)||(isV8(c)&&r.sourceSlot!==0))fail()}else if(auto(r)&&r.maskSeed!==undefined)fail()
  keys(r,auto(r)?['kind','source','coverageProfile',...(r.kind==='softAuto'||r.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE?['sourceSlot']:[]),...r.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE?['maskSeed']:[],...FLOATS,'width','height','mirrorH','mirrorV',...((isV2(c)||isV8(c))&&c.materialParams?['materialParams']:[])]:
    [...(versioned(c)?['kind']:[]),'asset',...indexedImages(c)?['imageFrameIndex','sourceSlot']:[],...FLOATS,'width','height','mirrorH','mirrorV',...((isV2(c)||isV8(c))&&c.materialParams?['materialParams']:[])])
  if(!integer(r.width,1,4096)||!integer(r.height,1,4096)||r.width*r.height>1048576
    ||!number(r.scale,Number.MIN_VALUE,1e6)||!number(r.ratio,Number.MIN_VALUE,100)
    ||!number(r.brushAngle,-1e6,1e6)||!number(r.rotation,-1e6,1e6)||!number(r.subX,0,1)||r.subX===1||!number(r.subY,0,1)||r.subY===1
    ||typeof r.mirrorH!=='boolean'||typeof r.mirrorV!=='boolean')fail()
  let cost:CanonicalMaterialCost
  if(isV8(c)){
    const pin=c.primarySource
    if(pin.kind==='image'){
      if(auto(r)||!('kind'in r)||r.kind!=='image'||!(pin.frames??[pin.asset]).includes(r.asset)||!Object.is(r.brushScale,pin.brushScale)||!Object.is(r.brushAngle,pin.brushAngle))return fail()
      if(c.primaryTexture.law==='hard-multiply-u8-native-v1'&&(r.scale>1||r.ratio!==1||r.mirrorH||r.mirrorV))return fail()
      cost=canonicalMaterialGeometryCost(r,asset(c,r.asset))
      if(pin.imageMaterial){const planes=pin.imageMaterial.kind==='lightness-map-v1'?2:4;cost={workUnits:cost.workUnits*planes,outputBytes:cost.outputBytes*planes}}
    }else{
      if(!auto(r)||r.kind!==pin.kind)return fail()
      if(r.kind==='softAuto'){if(pin.kind!=='softAuto'||r.sourceSlot!==0)return fail();cost=canonicalSoftAutoCost(r,pin)}
      else {if(pin.kind==='softAuto')return fail();cost=canonicalAutoCost(r,pin)}
    }
  } else if(isV7(c)){
    if(!auto(r)||r.kind!==c.primarySource.kind)return fail()
    if(r.kind==='softAuto'){if(c.primarySource.kind!=='softAuto'||r.sourceSlot!==0)return fail();cost=canonicalSoftAutoCost(r,c.primarySource)}
    else {if(c.primarySource.kind==='softAuto')return fail();cost=canonicalAutoCost(r,c.primarySource)}
  } else if(isV6(c)){
    if(!auto(r)||r.kind!=='softAuto')return fail()
    cost=canonicalSoftAutoCost(r,c.primarySource)
  } else if(isV4(c)||isV5(c)) {
    if(!auto(r)||r.kind!=='defaultAuto')return fail()
    cost=canonicalAutoCost(r,c.primarySource)
  } else if(auto(r)) {
    if(!isV2(c))return fail()
    if(r.kind==='softAuto') {
      const source=r.sourceSlot===0?c.primarySource:r.sourceSlot===1?c.maskSource:undefined
      if(source?.kind!=='softAuto')return fail()
      cost=canonicalSoftAutoCost(r,source)
    } else {
      if(r.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE) {
        const primary=c.primarySource
        if(r.kind!=='defaultAuto'||primary.kind!=='defaultAuto'||primary.coverageProfile!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||c.maskSource!==undefined)return fail()
        cost=canonicalAutoCost(r,primary)
      } else {
      let found:CanonicalMaterialCost|undefined
      for(const source of [c.primarySource,c.maskSource])if(source?.kind==='defaultAuto'||source?.kind==='gaussianAuto') {
        try { found=canonicalAutoCost(r,source);break } catch { /* another role may own this exact static definition */ }
      }
      if(!found)return fail();cost=found
      }
    }
  } else {
    if(!assetId(r.asset)||!number(r.brushScale,Number.MIN_VALUE,1e6)||versioned(c)&&(!('kind' in r)||r.kind!=='image'))fail()
    cost=versioned(c)?canonicalMaterialGeometryCost(r,asset(c,r.asset)):c.preflightDefinition(r,asset(c,r.asset))
    if(isV2(c)){const pin=[c.primarySource,c.maskSource].find(source=>source?.kind==='image'&&source.asset===r.asset);if(pin?.kind==='image'&&pin.imageMaterial){const planes=pin.imageMaterial.kind==='lightness-map-v1'?2:4;cost={workUnits:cost.workUnits*planes,outputBytes:cost.outputBytes*planes}}}
  }
  if(((isV2(c)||isV8(c))&&c.materialParams)||seededContext(c))cost={...cost,outputBytes:cost.outputBytes+48}
  if(!cost||!integer(cost.workUnits,0,CANONICAL_MATERIAL_LIMITS.workUnits)||!integer(cost.outputBytes,r.width*r.height,CANONICAL_MATERIAL_LIMITS.outputBytes))fail()
  return cost
}
function roleMatches(r:AnyCanonicalMaterialRecipe,role:'primary'|'mask',c:CodecContext):boolean {
  if(auto(r)&&r.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE&&r.sourceSlot!==(role==='primary'?0:1))return false
  if(isV8(c)){if(role!=='primary')return false;try{recipe(r,c);return true}catch{return false}}
  if(isV7(c)){if(role!=='primary'||!auto(r)||r.kind!==c.primarySource.kind)return false;try{recipe(r,c);return true}catch{return false}}
  if(isV6(c)){if(role!=='primary'||!auto(r)||r.kind!=='softAuto'||r.sourceSlot!==0)return false;try{canonicalSoftAutoCost(r,c.primarySource);return true}catch{return false}}
  if(isV4(c)||isV5(c)){if(role!=='primary'||!auto(r)||r.kind!=='defaultAuto')return false;try{canonicalAutoCost(r,c.primarySource);return true}catch{return false}}
  if(isV3(c))return role==='primary'&&!auto(r)&&r.asset===c.primarySource.asset&&Object.is(r.brushScale,c.primarySource.brushScale)&&Object.is(r.brushAngle,c.primarySource.brushAngle)
  if(!isV2(c))return !auto(r)&&(role==='primary'
    ?c.primaryImageFrames?c.primaryImageFrames.includes(r.asset):r.asset===c.primaryAsset
    :r.asset===c.maskAsset)
  const source=role==='primary'?c.primarySource:c.maskSource
  if(!source)return false
  if(r && 'kind' in r && r.kind==='softAuto') {
    if(source.kind!=='softAuto'||r.sourceSlot!==(role==='primary'?0:1))return false
    try {canonicalSoftAutoCost(r,source);return true}catch{return false}
  }
  if(auto(r)) {if(source.kind!=='defaultAuto'&&source.kind!=='gaussianAuto')return false;try {canonicalAutoCost(r,source);return true}catch{return false}}
  return source.kind==='image'&&(!indexedImages(c)||(r.sourceSlot===(role==='primary'?0:1)&&(source.frames??[source.asset])[r.imageFrameIndex!]===r.asset))&&(source.frames?Array.prototype.includes.call(source.frames,r.asset):r.asset===source.asset)&&Object.is(r.brushScale,source.brushScale)&&Object.is(r.brushAngle,source.brushAngle)
}

function checkedCounts(definitions:number,draws:number,fences:number):void {
  if(!integer(draws,0,800)||!integer(definitions,0,draws)||!integer(fences,0,3*(draws+1)+1))fail()
}
function entry(e:CanonicalMaterialEntry):void {
  if(e?.phase==='between')keys(e,['phase'])
  else{keys(e,['phase','group']);if(!['primary','mask'].includes(e.phase)||!integer(e.group,0,Number.MAX_SAFE_INTEGER))fail()}
}
/** F64 bits, including signed zero, define dictionary identity. Integer fields
 * deliberately canonicalize -0 to +0 through integer wire encoding. */
function recipeKey(r:AnyCanonicalMaterialRecipe):string {
  const view=new DataView(new ArrayBuffer(8))
  const identity=auto(r)?(r.kind==='softAuto'?'slot'+r.sourceSlot+':':'')+r.kind+':'+r.coverageProfile+':'+r.source.shape+':spikes'+r.source.spikes+':'+Number(r.source.antialias)+':'+[r.source.diameter,r.source.ratio,r.source.horizontalFade,r.source.verticalFade].map(n=>{view.setFloat64(0,n,true);return view.getBigUint64(0,true).toString(16)}).join(':'):r.asset+(r.imageFrameIndex!==undefined?':frame'+r.imageFrameIndex+':slot'+r.sourceSlot:'')
  const material=r.materialParams?':params'+[r.materialParams.softness,r.materialParams.lightnessStrength,r.materialParams.sharpnessAlignValue,r.materialParams.sharpnessThreshold,r.materialParams.sharpnessSoftness].map(n=>{view.setFloat64(0,n,true);return view.getBigUint64(0,true).toString(16)}).join(':')+':'+Number(r.materialParams.sharpnessChecked)+Number(r.materialParams.sharpnessAlign):''
  return identity+material+(auto(r)&&r.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE?':seed'+r.maskSeed+':slot'+r.sourceSlot+':random'+r.source.randomness+':density'+r.source.density:'')+(auto(r)&&r.kind==='defaultAuto'&&r.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE?':density'+r.source.density:'')+':'+r.width+':'+r.height+':'+Number(r.mirrorH)+Number(r.mirrorV)+':'+FLOATS.map(k=>{view.setFloat64(0,r[k],true);return view.getUint32(0,true).toString(16).padStart(8,'0')+view.getUint32(4,true).toString(16).padStart(8,'0')}).join('')
}
interface FrameReader {
  readonly version:1|2|3|4|5|6|7|8
  readonly masked:boolean; readonly entry:CanonicalMaterialEntry; readonly definitions:number;readonly draws:number;readonly fences:number
  definition(index:number):AnyCanonicalMaterialRecipe
  draw(index:number):CodecDraw
  fence(index:number):CanonicalMaterialFence
}
/** First pass holds only bounded metadata/keys; no decoded image/draw/fence arrays
 * are allocated until all costs and framing have passed. */
function preflight(r:FrameReader,c:CodecContext):void {
  context(c);if(r.version!==contextVersion(c))fail();checkedCounts(r.definitions,r.draws,r.fences);entry(r.entry)
  if(typeof r.masked!=='boolean'||r.masked&&(textured(c)|| (isV2(c)?c.maskSource===undefined:c.maskAsset===undefined))||c.expectedDrawCount!==undefined&&r.draws!==c.expectedDrawCount)fail()
  const densityContext=isV2(c)&&c.primarySource.kind==='defaultAuto'&&c.primarySource.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
  if(densityContext&&r.masked)fail()
  let work=0,output=0,drawPixels=0,nextDefinition=0
  const identities=new Set<string>()
  for(let i=0;i<r.definitions;i++){
    const d=r.definition(i),cost=recipe(d,c),key=recipeKey(d)
    if(identities.has(key))fail();identities.add(key)
    if(!(auto(d)&&d.kind==='defaultAuto'&&d.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)){work+=cost.workUnits;output+=cost.outputBytes}
    if(!Number.isSafeInteger(work)||!Number.isSafeInteger(output)||work>c.budget.workUnits||output>c.budget.outputBytes)fail()
  }
  let phase=r.entry.phase,group=r.entry.phase==='between'?-1:r.entry.group,lastGroup=group,fi=0,ended=false
  for(let at=0;at<=r.draws;at++){
    while(fi<r.fences){
      const f=r.fence(fi)
      keys(f,f.kind==='gestureEnd'?['at','kind']:['at','kind','group'])
      if(!integer(f.at,0,r.draws)||!KINDS.includes(f.kind)||f.at<at)fail()
      if(f.at!==at)break
      if(ended)fail()
      if(f.kind==='gestureEnd'){
        if(phase!=='between'||at!==r.draws||fi!==r.fences-1)fail();ended=true
      }else{
        if(!integer(f.group,0,Number.MAX_SAFE_INTEGER))fail()
        if(f.kind==='segmentBegin'){
          if(phase!=='between'||f.group<=lastGroup)fail();phase='primary';group=lastGroup=f.group
        }else if(f.kind==='primaryEnd'){
          if(phase!=='primary'||f.group!==group)fail();phase='mask'
        }else{
          if(phase!=='mask'||f.group!==group)fail();phase='between'
        }
      }
      fi++
    }
    if(at===r.draws)break
    const d=r.draw(at);keys(d,['definition','role','x','y','opacity','flow',...colorFields(c),...r.version===8?['grainStrengthU8']:r.version>=3?['grainDepth']:[]])
    if(colorField(c)){const n=rgbaColor(c)?4:3,rgb=ownArray(d[colorField(c)!],n,v=>{if(!integer(v,0,255)||Object.is(v,-0))return fail();return v});if(rgb.length!==n)fail()}else if(d.sourcePigmentRGB!==undefined||d.sourcePigmentRGBA!==undefined)fail()
    if(r.version===8&&(d.role!=='primary'||!('grainStrengthU8'in d)||!integer(d.grainStrengthU8,0,255)||Object.is(d.grainStrengthU8,-0)))fail()
    if(r.version>=3&&r.version!==8&&(d.role!=='primary'||!('grainDepth'in d)||(r.version===4?d.grainDepth!==1:!number(d.grainDepth,0,1))))fail()
    if(densityContext&&d.role!=='primary')fail()
    if(!integer(d.definition,0,r.definitions-1)||!['primary','mask'].includes(d.role)||d.role!==phase||d.role==='mask'&&!r.masked
      ||!integer(d.x,-1e8,1e8)||!integer(d.y,-1e8,1e8)||!number(d.opacity,0,1)||!number(d.flow,0,1))fail()
    if(d.definition>nextDefinition)fail();if(d.definition===nextDefinition)nextDefinition++
    const def=r.definition(d.definition)
    if(!roleMatches(def,d.role,c)||!integer(d.x+def.width,-1e8,1e8)||!integer(d.y+def.height,-1e8,1e8))fail()
    if(auto(def)&&def.kind==='defaultAuto'&&def.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE){
      const cost=recipe(def,c);work+=cost.workUnits;output+=cost.outputBytes
      if(!Number.isSafeInteger(work)||!Number.isSafeInteger(output)||work>c.budget.workUnits||output>c.budget.outputBytes)fail()
    }
    // Per-occurrence grain sample/coverage pixel work, including copy hits.
    // A bounded pixel scheduling weight, not arithmetic instructions or GPU timing.
    if(r.version>=3){work+=canonicalPrimaryTextureDrawWork(def.width,def.height);if(!Number.isSafeInteger(work)||work>c.budget.workUnits)fail()}
    drawPixels+=def.width*def.height
    if(!Number.isSafeInteger(drawPixels)||drawPixels>c.budget.drawPixels)fail()
  }
  if(fi!==r.fences||nextDefinition!==r.definitions||c.expectedStrokeEnd!==undefined&&ended!==c.expectedStrokeEnd)fail()
}
function localReader(f:CodecFrame):FrameReader {
  keys(f,['profile','masked','entry','definitions','draws','fences'])
  if(![CANONICAL_MATERIAL_PROFILE,CANONICAL_SOURCE_MATERIAL_PROFILE,CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE,CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE,CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE,CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE,CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE,CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE].includes(f.profile)||!Array.isArray(f.definitions)||!Array.isArray(f.draws)||!Array.isArray(f.fences))fail()
  return{version:f.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE?8:f.profile===CANONICAL_MATERIAL_PROFILE?1:f.profile===CANONICAL_SOURCE_MATERIAL_PROFILE?2:f.profile===CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE?3:f.profile===CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE?4:f.profile===CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE?5:f.profile===CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE?6:7,masked:f.masked,entry:f.entry,definitions:f.definitions.length,draws:f.draws.length,fences:f.fences.length,definition:i=>f.definitions[i],draw:i=>f.draws[i],fence:i=>f.fences[i]}
}
/** Independent closed V3 DTO capture for actual prepared consumers. No packing,
 * source grant, pixel work or cross-version projection. */
export function captureCanonicalPrimaryTextureFrame(value:unknown,context:CanonicalMaterialContextV3):CanonicalMaterialFrameV3 {
  const c=canonicalPrimaryTextureMaterialContext(context)
  const f=captureTextureInput(value,true) as unknown as CanonicalMaterialFrameV3
  preflight(localReader(f),c)
  Object.freeze(f.entry)
  for(const records of [f.definitions,f.draws,f.fences])for(const record of records)Object.freeze(record)
  Object.freeze(f.definitions);Object.freeze(f.draws);Object.freeze(f.fences)
  return Object.freeze(f)
}
/** Independent bounded own-data frame capture; no repacking or grant. */
export function captureCanonicalTexturedSourceFrame(value:unknown,context:CanonicalMaterialContextV4):CanonicalMaterialFrameV4 {
  const c=canonicalTexturedSourceMaterialContext(context)
  const f=captureTextureInput(value,true,4) as unknown as CanonicalMaterialFrameV4
  preflight(localReader(f),c)
  Object.freeze(f.entry)
  for(const records of [f.definitions,f.draws,f.fences])for(const record of records)Object.freeze(record)
  Object.freeze(f.definitions);Object.freeze(f.draws);Object.freeze(f.fences)
  return Object.freeze(f)
}
export function captureCanonicalPressureTexturedSourceFrame(value: unknown, context: CanonicalMaterialContextV5): CanonicalMaterialFrameV5 {
  const c = canonicalPressureTexturedSourceMaterialContext(context);
  const f = captureTextureInput(value, true, 5) as unknown as CanonicalMaterialFrameV5;
  preflight(localReader(f), c);
  Object.freeze(f.entry);
  for (const records of [f.definitions, f.draws, f.fences])
    for (const record of records)
      Object.freeze(record);
  Object.freeze(f.definitions);
  Object.freeze(f.draws);
  Object.freeze(f.fences);
  return Object.freeze(f);
}
function base64(bytes:Uint8Array):string {let text='';for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(text)}

/** Encode after trusted preflight; caller must use the DECODED frame locally. */
export function packCanonicalMaterial(f:CanonicalMaterialFrame,c:CanonicalMaterialContext):string
export function packCanonicalMaterial(f:CanonicalMaterialFrameV2,c:CanonicalMaterialContextV2):string
export function packCanonicalMaterial(f:AnyCanonicalMaterialFrame,c:AnyCanonicalMaterialContext):string
export function packCanonicalMaterial(f:CanonicalMaterialFrameV3,c:CanonicalMaterialContextV3):string
export function packCanonicalMaterial(f:CanonicalMaterialFrameV4,c:CanonicalMaterialContextV4):string
export function packCanonicalMaterial(f:CanonicalMaterialFrameV5,c:CanonicalMaterialContextV5):string
export function packCanonicalMaterial(f:CanonicalMaterialFrameV6,c:CanonicalMaterialContextV6):string
export function packCanonicalMaterial(f:LegacyCodecFrame,c:LegacyCodecContext):string { rejectStandaloneContext(c);return packMaterialCore(f,c) }
function packMaterialCore(f:CodecFrame,c:CodecContext):string {
  c=captureContext(c)
  if(textured(c))f=captureTextureInput(f,true,isV8(c)?8:isV7(c)?7:isV6(c)?6:isV5(c)?5:isV4(c)?4:3,isV8(c)?c:undefined) as unknown as CanonicalMaterialFrameV3|CanonicalMaterialFrameV4|CanonicalMaterialFrameV5|CanonicalMaterialFrameV6|CanonicalMaterialFrameV7|CanonicalMaterialFrameV8
  const r=localReader(f);preflight(r,c)
  const ids:string[]=textured(c)&&!localTexture8(c)?c.assets.map(a=>a.id):[]
  for(const d of f.definitions)if(!auto(d)&&!ids.includes(d.asset))ids.push(d.asset)
  if(localTexture8(c)&&isV8(c))ids.push(c.primaryTexture.asset)
  if(ids.length>(isV2(c)&&indexedImages(c)||localTexture8(c)?255:2))fail()
  const parameterized=(isV2(c)||isV8(c))&&c.materialParams!==undefined,definitionBytes=r.version===1?DEFINITION:(parameterized||seededContext(c))?144:DEFINITION2,drawBytes=r.version>=3?DRAW3:DRAW
  const length=HEADER+ids.length*ASSET+r.definitions*definitionBytes+r.draws*drawBytes+r.fences*FENCE
  if(length>CANONICAL_MATERIAL_LIMITS.rawBytes)fail()
  const bytes=new Uint8Array(length),v=new DataView(bytes.buffer)
  bytes.set([67,77,65,84,r.version,f.entry.phase==='between'?0:f.entry.phase==='primary'?1:2,ids.length,Number(f.masked)])
  v.setUint16(8,r.definitions,true);v.setUint16(10,r.draws,true);v.setUint16(12,r.fences,true);v.setFloat64(16,f.entry.phase==='between'?0:f.entry.group===0?0:f.entry.group,true)
  v.setUint16(14,Number(parameterized)|((isV2(c)||isV8(c))&&c.colorParams?2:0)|(seededContext(c)?4:0)|(indexedImages(c)?8:0)|(scaledContext(c)?16:0)|(localTexture8(c)?32:0)|(rgbaColor(c)?64:0),true)
  let offset=HEADER
  for(const id of ids){const a=asset(c,id);for(let j=0;j<32;j++)bytes[offset+j]=parseInt(id.slice(6+j*2,8+j*2),16);v.setUint16(offset+32,a.width,true);v.setUint16(offset+34,a.height,true);v.setUint16(offset+36,a.x,true);v.setUint16(offset+38,a.y,true);offset+=ASSET}
  for(const d of f.definitions){
    v.setUint16(offset+4,d.width,true);v.setUint16(offset+6,d.height,true)
    if(r.version===1) {
      if(auto(d))return fail()
      bytes[offset]=ids.indexOf(d.asset);bytes[offset+1]=Number(d.mirrorH)|Number(d.mirrorV)<<1
      FLOATS.forEach((k,j)=>v.setFloat64(offset+8+j*8,d[k],true))
    } else {
      bytes[offset]=auto(d)?(d.kind==='softAuto'?4:d.kind==='gaussianAuto'?3:d.source.shape==='circle'?1:2):0
      bytes[offset+1]=auto(d)?(d.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE?5:d.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE?4:d.coverageProfile===CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE?3:d.coverageProfile==='neon64-f32-fma-v1'?2:1):0
      bytes[offset+2]=Number(d.mirrorH)|Number(d.mirrorV)<<1|(auto(d)&&d.source.antialias?4:0)
      bytes[offset+3]=auto(d)?(d.kind==='softAuto'||d.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE?d.sourceSlot!:0):ids.indexOf(d.asset)
      const values=auto(d)?[d.source.diameter,d.source.ratio,d.source.horizontalFade,d.source.verticalFade,...FLOATS.map(k=>d[k])]:FLOATS.map(k=>d[k])
      values.forEach((n,j)=>v.setFloat64(offset+8+j*8,n,true))
    }
    if(!auto(d)&&indexedImages(c)){v.setFloat64(offset+64,d.imageFrameIndex!,true);v.setFloat64(offset+72,d.sourceSlot!,true)}
    if(parameterized){const p='materialParams'in d?d.materialParams:undefined;if(!p)return fail();[p.softness,p.lightnessStrength,p.sharpnessAlignValue,p.sharpnessThreshold,p.sharpnessSoftness].forEach((n,j)=>v.setFloat64(offset+96+j*8,n,true));bytes[offset+136]=Number(p.sharpnessChecked)|Number(p.sharpnessAlign)<<1}
    if(auto(d)&&d.coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE)v.setUint32(offset+137,d.maskSeed!,true)
    offset+=definitionBytes
  }
  for(const d of f.draws){v.setUint16(offset,d.definition,true);bytes[offset+2]=Number(d.role==='mask');v.setInt32(offset+4,d.x,true);v.setInt32(offset+8,d.y,true);v.setFloat64(offset+12,d.opacity,true);v.setFloat64(offset+20,d.flow,true);if(colorField(c)){const rgb=rgbaColor(c)?d.sourcePigmentRGBA:d.sourcePigmentRGB;if(!rgb)return fail();bytes[offset+28]=rgb[0];bytes[offset+29]=rgb[1];bytes[offset+30]=rgb[2];if(rgbaColor(c))bytes[offset+31]=rgb[3]!}if(r.version===8){if(!('grainStrengthU8'in d))return fail();v.setFloat64(offset+32,d.grainStrengthU8,true)}else if(r.version>=3){if(!('grainDepth'in d))return fail();v.setFloat64(offset+32,d.grainDepth,true)}offset+=drawBytes}
  for(const fence of f.fences){v.setUint16(offset,fence.at,true);bytes[offset+2]=KINDS.indexOf(fence.kind);v.setFloat64(offset+4,fence.kind==='gestureEnd'?0:fence.group===0?0:fence.group,true);offset+=FENCE}
  return r.version+'|'+base64(bytes)
}

/** Strict bounded binary first pass precedes DTO-array allocation. Base64 has a
 * canonical spelling (including pad bits); reserved bits/bytes must be zero. */
export function unpackCanonicalMaterial(text:string,c:CanonicalMaterialContext):CanonicalMaterialFrame
export function unpackCanonicalMaterial(text:string,c:CanonicalMaterialContextV2):CanonicalMaterialFrameV2
export function unpackCanonicalMaterial(text:string,c:AnyCanonicalMaterialContext):AnyCanonicalMaterialFrame
export function unpackCanonicalMaterial(text:string,c:CanonicalMaterialContextV3):CanonicalMaterialFrameV3
export function unpackCanonicalMaterial(text:string,c:CanonicalMaterialContextV4):CanonicalMaterialFrameV4
export function unpackCanonicalMaterial(text:string,c:CanonicalMaterialContextV5):CanonicalMaterialFrameV5
export function unpackCanonicalMaterial(text:string,c:CanonicalMaterialContextV6):CanonicalMaterialFrameV6
export function unpackCanonicalMaterial(text:string,c:LegacyCodecContext):LegacyCodecFrame { rejectStandaloneContext(c);const f=unpackMaterialCore(text,c);if(f.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE||f.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE)return fail();return f }
function unpackMaterialCore(text:string,c:CodecContext):CodecFrame {
  c=captureContext(c)
  context(c)
  if(typeof text!=='string'||text.length>CANONICAL_MATERIAL_LIMITS.textBytes||!/^([12345678])\|/.test(text))fail()
  const b64=text.slice(2)
  if(!b64.length||b64.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64))fail()
  const raw=atob(b64)
  if(raw.length<HEADER||raw.length>CANONICAL_MATERIAL_LIMITS.rawBytes||btoa(raw)!==b64)fail()
  const u8=(i:number)=>raw.charCodeAt(i),u16=(i:number)=>u8(i)+u8(i+1)*256
  if(raw.slice(0,4)!=='CMAT'||(u8(4)!==1&&u8(4)!==2&&u8(4)!==3&&u8(4)!==4&&u8(4)!==5&&u8(4)!==6&&u8(4)!==7&&u8(4)!==8)||String(u8(4))!==text[0]||u8(5)>2||u8(6)>(isV2(c)&&indexedImages(c)||localTexture8(c)?255:2)||u8(7)>1||u16(14)!==(((isV2(c)||isV8(c))&&c.materialParams?1:0)|((isV2(c)||isV8(c))&&c.colorParams?2:0)|(seededContext(c)?4:0)|(indexedImages(c)?8:0)|(scaledContext(c)?16:0)|(localTexture8(c)?32:0)|(rgbaColor(c)?64:0)))fail()
  const parameterized=(isV2(c)||isV8(c))&&c.materialParams!==undefined,version=u8(4) as 1|2|3|4|5|6|7|8,definitionBytes=version===1?DEFINITION:(parameterized||seededContext(c))?144:DEFINITION2,drawBytes=version>=3?DRAW3:DRAW
  if(version!==contextVersion(c)||version===3&&(u8(6)!==2||u8(7)!==0)||version===8&&(!localTexture8(c)&&u8(6)!==c.assets.length||u8(7)!==0)||(version===4||version===5||version===6||version===7)&&(u8(6)!==1||u8(7)!==0))fail()
  const ac=u8(6),dc=u16(8),rc=u16(10),fc=u16(12)
  checkedCounts(dc,rc,fc)
  if(raw.length!==HEADER+ac*ASSET+dc*definitionBytes+rc*drawBytes+fc*FENCE)fail()
  const bytes=Uint8Array.from(raw,x=>x.charCodeAt(0)),v=new DataView(bytes.buffer)
  const assetOffset=HEADER,defOffset=assetOffset+ac*ASSET,drawOffset=defOffset+dc*definitionBytes,fenceOffset=drawOffset+rc*drawBytes
  const id=(i:number):string=>{if(!integer(i,0,ac-1))fail();let out='asset:';for(let j=0;j<32;j++)out+=bytes[assetOffset+i*ASSET+j].toString(16).padStart(2,'0');return out}
  // A masked frame may contain both roles. Its header marks the frame, not
  // an individual definition. Recover source statics from the recorded DRAW
  // referencing each definition; the usual role/cost checks still validate it.
  const definitionRoles=new Int8Array(dc).fill(-1)
  for(let i=0;i<rc;i++){
    const o=drawOffset+i*drawBytes,index=u16(o),role=u8(o+2)
    if(index>=dc||role>1)return fail()
    if(definitionRoles[index]===-1)definitionRoles[index]=role
  }
  const seenAssets=new Set<string>()
  for(let i=0;i<ac;i++){const o=assetOffset+i*ASSET,a=asset(c,id(i));if(seenAssets.has(a.id)||v.getUint16(o+32,true)!==a.width||v.getUint16(o+34,true)!==a.height||v.getUint16(o+36,true)!==a.x||v.getUint16(o+38,true)!==a.y)fail();if(textured(c)&&!localTexture8(c)&&a.id!==c.assets[i].id)fail();seenAssets.add(a.id)}
  if(localTexture8(c)&&isV8(c)&&(ac<1||id(ac-1)!==c.primaryTexture.asset))return fail()
  const entryGroup=v.getFloat64(16,true)
  if(u8(5)===0&&(entryGroup!==0||Object.is(entryGroup,-0))||u8(5)!==0&&(!integer(entryGroup,0,Number.MAX_SAFE_INTEGER)||Object.is(entryGroup,-0)))fail()
  const e:CanonicalMaterialEntry=u8(5)===0?{phase:'between'}:{phase:u8(5)===1?'primary':'mask',group:entryGroup}
  let nextAsset=0
  for(let i=0;i<dc;i++){
    const o=defOffset+i*definitionBytes,tag=version===1?0:u8(o)
    if(version===3&&(tag!==0||u8(o+1)!==0||u8(o+2)>3||u8(o+3)!==0))fail()
    if(version===8&&(tag>4||u8(o+1)>(tag?5:0)||tag&&u8(o+1)===0||u8(o+2)>(tag&&tag!==4?7:3)||(u8(o+1)===5?u8(o+3)>0:u8(o+3)!==0)))fail()
    if(version===7&&(![1,2,3,4].includes(tag)||![1,2,3].includes(u8(o+1))||u8(o+2)>(tag===4?3:7)||u8(o+3)!==0))fail()
    if(version===6&&(tag!==4||![1,2,3].includes(u8(o+1))||u8(o+2)>3||u8(o+3)!==0))fail()
    if((version===4||version===5)&&((tag!==1&&tag!==2)||(u8(o+1)!==1&&u8(o+1)!==2&&u8(o+1)!==3)||u8(o+2)>7||u8(o+3)!==0))fail()
    if(version===2&&(tag>4||u8(o+1)>(tag?5:0)||tag&&u8(o+1)===0||u8(o+2)>(tag&&tag!==4?7:3)))fail()
    if(version===1&& (u8(o+1)>3||u16(o+2)!==0))fail()
    if(version===2&&u8(o+1)===4&&(!isV2(c)||c.primarySource.kind!=='defaultAuto'||c.primarySource.coverageProfile!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||c.maskSource!==undefined||u8(7)!==0))fail()
    if(tag) {if(tag===4||u8(o+1)===5?u8(o+3)>1:u8(o+3)!==0)fail();if(u8(o+1)===5&&!seededContext(c)||version===8&&u8(o+1)===4)fail()}
    else {const ai=version===1?u8(o):u8(o+3);if(ai>nextAsset||ai>=ac)fail();if(ai===nextAsset)nextAsset++}
    if(version!==1&&!tag)for(let j=indexedImages(c)?80:64;j<96;j++)if(u8(o+j))fail()
    if(parameterized&&u8(o+136)>3)fail();if(seededContext(c)||parameterized){if(!parameterized)for(let j=96;j<=136;j++)if(u8(o+j))fail();for(let j=u8(o+1)===5?141:137;j<144;j++)if(u8(o+j))fail()}
  }
  if(localTexture8(c)&&nextAsset!==ac-1)return fail()
  if(version!==3&&version!==4&&version!==5&&version!==6&&version!==7&&version!==8&&nextAsset!==ac)fail()
  const readDefinition=(i:number):AnyCanonicalMaterialRecipe=>{
    const o=defOffset+i*definitionBytes,tag=version===1?0:u8(o),flags=u8(o+(version===1?1:2))
    const common={...parameterized?{materialParams:{softness:v.getFloat64(o+96,true),lightnessStrength:v.getFloat64(o+104,true),sharpnessAlignValue:v.getFloat64(o+112,true),sharpnessThreshold:v.getFloat64(o+120,true),sharpnessSoftness:v.getFloat64(o+128,true),sharpnessChecked:!!(u8(o+136)&1),sharpnessAlign:!!(u8(o+136)&2)}}:{},width:u16(o+4),height:u16(o+6),mirrorH:!!(flags&1),mirrorV:!!(flags&2)}
    if(tag) {
      const values={...common,brushScale:v.getFloat64(o+40,true),brushAngle:v.getFloat64(o+48,true),scale:v.getFloat64(o+56,true),ratio:v.getFloat64(o+64,true),rotation:v.getFloat64(o+72,true),subX:v.getFloat64(o+80,true),subY:v.getFloat64(o+88,true)}
      const source={diameter:v.getFloat64(o+8,true),ratio:v.getFloat64(o+16,true),horizontalFade:v.getFloat64(o+24,true),verticalFade:v.getFloat64(o+32,true),antialias:!!(flags&4),spikes:2,randomness:0,density:1}
      if(u8(o+1)===5){
        if(!isV2(c)&&!isV8(c))return fail()
        const slot=u8(o+3),pin=slot===0?c.primarySource:isV2(c)?c.maskSource:undefined
        if(!pin||pin.kind==='image'||pin.coverageProfile!==CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE||pin.kind!==(tag===4?'softAuto':tag===3?'gaussianAuto':'defaultAuto'))return fail()
        const seeded={...values,sourceSlot:slot as 0|1,maskSeed:v.getUint32(o+137,true),coverageProfile:CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE}
        if(pin.kind==='softAuto')return {...seeded,kind:'softAuto',sourceSlot:pin.sourceSlot,source:{...pin.source,...source,spikes:pin.source.spikes,randomness:pin.source.randomness,density:pin.source.density,kind:'softAuto',generator:'soft',shape:'circle',antialias:false}}
        if(pin.kind==='gaussianAuto')return {...seeded,kind:'gaussianAuto',source:{...source,spikes:pin.source.spikes,randomness:pin.source.randomness,density:pin.source.density,kind:'gaussianAuto',generator:'gauss',shape:'circle'}}
        return {...seeded,kind:'defaultAuto',source:{...source,spikes:pin.source.spikes,randomness:pin.source.randomness,density:pin.source.density,kind:'defaultAuto',generator:'default',shape:tag===1?'circle':'rect'}}
      }
      // Tag4 carries only a trusted role slot. Curves/program provenance
      // never come from the packet or a geometry-based source search.
      if(tag===4) {
        if(!isV2(c)&&!isV6(c)&&!isV7(c)&&!isV8(c))return fail()
        const sourceSlot=u8(o+3),pin=sourceSlot===0?c.primarySource:isV2(c)?c.maskSource:undefined
        if(pin?.kind!=='softAuto'||pin.sourceSlot!==sourceSlot)return fail()
        const trusted=canonicalSoftAutoSourcePin(pin)
        return {...values,kind:'softAuto',sourceSlot:trusted.sourceSlot,coverageProfile:u8(o+1)===3?CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE:u8(o+1)===1?'scalar-f64-fma-v1':'neon64-f32-fma-v1',
          source:{...trusted.source,...source,spikes:trusted.source.spikes,kind:'softAuto',generator:'soft',shape:'circle',antialias:false}}
      }
      if(u8(o+1)===4){
        if(!isV2(c)||c.primarySource.kind!=='defaultAuto'||c.primarySource.coverageProfile!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||c.maskSource!==undefined)return fail()
        const pin=canonicalDefaultAutoSourcePin(c.primarySource)
        return {...values,kind:'defaultAuto',coverageProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,source:{...source,kind:'defaultAuto',generator:'default',shape:tag===1?'circle':'rect',density:pin.source.density}}
      }
      // Static spike count belongs to the original role source.
      if(isV2(c)||isV7(c)||isV8(c)){const pin=isV2(c)&&definitionRoles[i]===1?c.maskSource:c.primarySource;if(pin&&pin.kind!=='image')source.spikes=pin.source.spikes}
      return tag===3 ? {...values,kind:'gaussianAuto',coverageProfile:u8(o+1)===3?CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE:u8(o+1)===1?'scalar-bionic-f64-fma-v1':'neon64-f32-fma-v1',source:{...source,kind:'gaussianAuto',generator:'gauss',shape:'circle'}}
        : {...values,kind:'defaultAuto',coverageProfile:u8(o+1)===3?CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE:u8(o+1)===1?'scalar-f64-fma-v1':'neon64-f32-fma-v1',source:{...source,kind:'defaultAuto',generator:'default',shape:tag===1?'circle':'rect'}}
    }
    const image={asset:id(u8(o+(version===1?0:3))),...indexedImages(c)?{imageFrameIndex:v.getFloat64(o+64,true),sourceSlot:v.getFloat64(o+72,true) as 0|1}:{},...common,brushScale:v.getFloat64(o+8,true),brushAngle:v.getFloat64(o+16,true),scale:v.getFloat64(o+24,true),ratio:v.getFloat64(o+32,true),rotation:v.getFloat64(o+40,true),subX:v.getFloat64(o+48,true),subY:v.getFloat64(o+56,true)}
    return version===1?image:{...image,kind:'image'}
  }

  const readDraw=(i:number):CodecDraw=>{const o=drawOffset+i*drawBytes;if(u8(o+2)>1||u8(o+3)||(rgbaColor(c)?0:colorField(c)?u8(o+31):v.getUint32(o+28,true)))fail();return{definition:u16(o),role:u8(o+2)?'mask':'primary',x:v.getInt32(o+4,true),y:v.getInt32(o+8,true),opacity:v.getFloat64(o+12,true),flow:v.getFloat64(o+20,true),...rgbaColor(c)?{sourcePigmentRGBA:Object.freeze([u8(o+28),u8(o+29),u8(o+30),u8(o+31)] as const)}:colorField(c)?{sourcePigmentRGB:Object.freeze([u8(o+28),u8(o+29),u8(o+30)] as const)}:{},...version===8?{grainStrengthU8:v.getFloat64(o+32,true)}:version>=3?{grainDepth:v.getFloat64(o+32,true)}:{}}}
  const readFence=(i:number):CanonicalMaterialFence=>{const o=fenceOffset+i*FENCE,tag=u8(o+2),group=v.getFloat64(o+4,true);if(tag>3||u8(o+3)||v.getUint32(o+12,true)||Object.is(group,-0))fail();if(tag===3){if(group!==0)fail();return{at:u16(o),kind:'gestureEnd'}}return{at:u16(o),kind:KINDS[tag] as 'segmentBegin'|'primaryEnd'|'segmentEnd',group}}
  preflight({version,masked:!!u8(7),entry:e,definitions:dc,draws:rc,fences:fc,definition:readDefinition,draw:readDraw,fence:readFence},c)
  return{profile:frameProfile(version),masked:!!u8(7),entry:e,definitions:Array.from({length:dc},(_,i)=>readDefinition(i)),draws:Array.from({length:rc},(_,i)=>readDraw(i)),fences:Array.from({length:fc},(_,i)=>readFence(i))} as CodecFrame
}

/** Syntax can describe two-role framing; execution is OFF unless this explicit
 * initial single-primary capability check succeeds. No masked reset semantics. */
export function assertPrimaryCanonicalMaterial(f:CanonicalMaterialFrame,c:CanonicalMaterialContext):void {
  if(f?.profile!==CANONICAL_MATERIAL_PROFILE)fail()
  preflight(localReader(f),c)
  if(f.masked||f.draws.some(d=>d.role!=='primary'))fail()
}

/** Typed author-local builder: deduplicate saved recipes by exact binary bits,
 * first-use ordering, then return canonical DECODED bytes for future local paint.
 * It never evaluates source options or derives cache hits from current geometry. */
export function buildCanonicalMaterial(input:CanonicalMaterialBuildInput,c:CanonicalMaterialContext):{packed:string;frame:CanonicalMaterialFrame}
export function buildCanonicalMaterial(input:CanonicalMaterialBuildInputV2,c:CanonicalMaterialContextV2):{packed:string;frame:CanonicalMaterialFrameV2}
export function buildCanonicalMaterial(input:CanonicalMaterialBuildInput|CanonicalMaterialBuildInputV2,c:AnyCanonicalMaterialContext):{packed:string;frame:AnyCanonicalMaterialFrame}
export function buildCanonicalMaterial(input:CanonicalMaterialBuildInputV3,c:CanonicalMaterialContextV3):{packed:string;frame:CanonicalMaterialFrameV3}
export function buildCanonicalMaterial(input:CanonicalMaterialBuildInputV4,c:CanonicalMaterialContextV4):{packed:string;frame:CanonicalMaterialFrameV4}
export function buildCanonicalMaterial(input:CanonicalMaterialBuildInputV5,c:CanonicalMaterialContextV5):{packed:string;frame:CanonicalMaterialFrameV5}
export function buildCanonicalMaterial(input:CanonicalMaterialBuildInputV6,c:CanonicalMaterialContextV6):{packed:string;frame:CanonicalMaterialFrameV6}
export function buildCanonicalMaterial(input:LegacyCodecInput,c:LegacyCodecContext):{packed:string;frame:LegacyCodecFrame} { rejectStandaloneContext(c);const result=buildMaterialCore(input,c);if(result.frame.profile===CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE||result.frame.profile===CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE)return fail();return {packed:result.packed,frame:result.frame} }
function buildMaterialCore(input:CodecInput,c:CodecContext):{packed:string;frame:CodecFrame} {
  c=captureContext(c)
  if(textured(c))input=captureTextureInput(input,false,isV8(c)?8:isV7(c)?7:isV6(c)?6:isV5(c)?5:isV4(c)?4:3,isV8(c)?c:undefined) as unknown as CanonicalMaterialBuildInputV3|CanonicalMaterialBuildInputV4|CanonicalMaterialBuildInputV5|CanonicalMaterialBuildInputV6|CanonicalMaterialBuildInputV7|CanonicalMaterialBuildInputV8
  keys(input,['masked','entry','draws','fences'])
  if(!input||!Array.isArray(input.draws)||!Array.isArray(input.fences))fail()
  checkedCounts(0,input.draws.length,input.fences.length);context(c)
  // Validate every input recipe and costs BEFORE allocating dictionary/record arrays.
  let work=0,output=0,drawPixels=0
  const known=new Set<string>()
  for(const d of input.draws){keys(d,['recipe','role','x','y','opacity','flow',...colorFields(c),...isV8(c)?['grainStrengthU8']:textured(c)?['grainDepth']:[]]);const saved=normalized(d.recipe),cost=recipe(saved,c),key=recipeKey(saved);if(!known.has(key)||auto(saved)&&saved.kind==='defaultAuto'&&saved.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE){known.add(key);work+=cost.workUnits;output+=cost.outputBytes}if(textured(c))work+=canonicalPrimaryTextureDrawWork(saved.width,saved.height);drawPixels+=d.recipe.width*d.recipe.height;if(!Number.isSafeInteger(work)||!Number.isSafeInteger(output)||!Number.isSafeInteger(drawPixels)||work>c.budget.workUnits||output>c.budget.outputBytes||drawPixels>c.budget.drawPixels)fail()}
  const definitions:AnyCanonicalMaterialRecipe[]=[],draws:CodecDraw[]=[],index=new Map<string,number>()
  for(const d of input.draws){const saved=normalized(d.recipe),key=recipeKey(saved);let i=index.get(key);if(i===undefined){i=definitions.length;index.set(key,i);definitions.push({...saved})}draws.push({definition:i,role:d.role,x:d.x,y:d.y,opacity:d.opacity,flow:d.flow,...recordedColor(d,c),...isV8(c)&&'grainStrengthU8'in d?{grainStrengthU8:d.grainStrengthU8}:textured(c)&&'grainDepth'in d?{grainDepth:d.grainDepth}:{}})}
  const frame={profile:frameProfile(contextVersion(c)),masked:input.masked,entry:input.entry,definitions,draws,fences:input.fences} as CodecFrame
  if(isV8(c)||isV7(c)){const packed=packMaterialCore(frame,c);return{packed,frame:unpackMaterialCore(packed,c)}}
  if(isV6(c)){
    if(frame.profile!==CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE)return fail()
    const packed=packMaterialCore(frame,c);return{packed,frame:unpackMaterialCore(packed,c)}
  }
  if(isV5(c)){
    if(frame.profile!==CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE)return fail()
    const packed=packMaterialCore(frame,c)
    return{packed,frame:unpackMaterialCore(packed,c)}
  }
  if(isV4(c)){
    if(frame.profile!==CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE)return fail()
    const packed=packMaterialCore(frame,c)
    return{packed,frame:unpackMaterialCore(packed,c)}
  }
  if(isV3(c)){
    if(frame.profile!==CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE)return fail()
    const packed=packMaterialCore(frame,c)
    return{packed,frame:unpackMaterialCore(packed,c)}
  }
  if(frame.profile===CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE||frame.profile===CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE||frame.profile===CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE||frame.profile===CANONICAL_SOFT_NATIVE_DEFAULT_TEXTURED_SOURCE_MATERIAL_PROFILE)return fail()
  const packed=packMaterialCore(frame,c)
  return{packed,frame:unpackMaterialCore(packed,c)}
}

export function captureCanonicalSoftNativeDefaultTexturedSourceFrame(value:unknown,context:CanonicalMaterialContextV6):CanonicalMaterialFrameV6{
 const c=canonicalSoftNativeDefaultTexturedSourceMaterialContext(context),f=captureTextureInput(value,true,6) as unknown as CanonicalMaterialFrameV6
 preflight(localReader(f),c);Object.freeze(f.entry)
 for(const records of[f.definitions,f.draws,f.fences]){for(const record of records)Object.freeze(record);Object.freeze(records)}
 return Object.freeze(f)
}

export function captureCanonicalTexturedAutoFrame(value:unknown,context:CanonicalMaterialContextV7):CanonicalMaterialFrameV7{
 const c=canonicalTexturedAutoMaterialContext(context),f=captureTextureInput(value,true,7) as unknown as CanonicalMaterialFrameV7
 preflight(localReader(f),c);Object.freeze(f.entry)
 for(const records of[f.definitions,f.draws,f.fences]){for(const record of records)Object.freeze(record);Object.freeze(records)}
 return Object.freeze(f)
}
export function packCanonicalTexturedAutoMaterial(frame:CanonicalMaterialFrameV7,context:CanonicalMaterialContextV7):string{return packMaterialCore(frame,canonicalTexturedAutoMaterialContext(context))}
export function unpackCanonicalTexturedAutoMaterial(text:string,context:CanonicalMaterialContextV7):CanonicalMaterialFrameV7{const frame=unpackMaterialCore(text,canonicalTexturedAutoMaterialContext(context));if(frame.profile!==CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)return fail();return frame}
export function buildCanonicalTexturedAutoMaterial(input:CanonicalMaterialBuildInputV7,context:CanonicalMaterialContextV7):{packed:string;frame:CanonicalMaterialFrameV7}{const result=buildMaterialCore(input,canonicalTexturedAutoMaterialContext(context));if(result.frame.profile!==CANONICAL_TEXTURED_AUTO_MATERIAL_PROFILE)return fail();return{packed:result.packed,frame:result.frame}}

export function captureCanonicalPrimaryGrainFrame(value:unknown,context:CanonicalMaterialContextV8):CanonicalMaterialFrameV8 {
 const c=canonicalPrimaryGrainMaterialContext(context),f=captureTextureInput(value,true,8,c) as unknown as CanonicalMaterialFrameV8
 preflight(localReader(f),c);Object.freeze(f.entry)
 for(const rows of[f.definitions,f.draws,f.fences]){for(const row of rows)Object.freeze(row);Object.freeze(rows)}
 return Object.freeze(f)
}
export function packCanonicalPrimaryGrainMaterial(frame:CanonicalMaterialFrameV8,context:CanonicalMaterialContextV8):string{return packMaterialCore(frame,canonicalPrimaryGrainMaterialContext(context))}
export function unpackCanonicalPrimaryGrainMaterial(text:string,context:CanonicalMaterialContextV8):CanonicalMaterialFrameV8{const f=unpackMaterialCore(text,canonicalPrimaryGrainMaterialContext(context));if(f.profile!==CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE)return fail();return f}
export function buildCanonicalPrimaryGrainMaterial(input:CanonicalMaterialBuildInputV8,context:CanonicalMaterialContextV8):{packed:string;frame:CanonicalMaterialFrameV8}{const r=buildMaterialCore(input,canonicalPrimaryGrainMaterialContext(context));if(r.frame.profile!==CANONICAL_PRIMARY_GRAIN_MATERIAL_PROFILE)return fail();return{packed:r.packed,frame:r.frame}}

function captureSourceSlot(value:unknown,slot:0|1):CanonicalMaterialContextV2['primarySource']{
  const k=Object.getOwnPropertyDescriptor(value??{},'kind');if(!k||!Object.hasOwn(k,'value'))return fail()
  if(k.value==='softAuto')return capturedSoftAuto(value,slot)
  if(k.value==='defaultAuto')return capturedDefaultAuto(value)
  if(k.value==='gaussianAuto'){const a=ownRecord(value,autoPinFields),source=ownRecord(a.source,autoSourceFields);return canonicalGaussianAutoSourcePin({...a,source} as unknown as Extract<CanonicalAutoSource,{kind:'gaussianAuto'}>)}
  const a=ownRecord(value,['kind','asset','brushScale','brushAngle'],['frames','imageMaterial']);if(a.kind!=='image'||typeof a.asset!=='string'||typeof a.brushScale!=='number'||typeof a.brushAngle!=='number')return fail()
  const frames=a.frames===undefined?undefined:Object.freeze(ownArray(a.frames,256,v=>v).map(v=>{if(typeof v!=='string')return fail();return v}))
  let imageMaterial:CanonicalMaterialImageSource['imageMaterial']
  if(a.imageMaterial!==undefined)imageMaterial=captureCanonicalImageMaterial(a.imageMaterial)
  return Object.freeze({kind:'image',asset:a.asset,brushScale:a.brushScale,brushAngle:a.brushAngle,...frames?{frames}:{},...imageMaterial?{imageMaterial}:{}})
 }
/** Own-DATA capture for the shared source2 executor, including optional mask.
 * It does not attest an original descriptor, room or execution permission. */
export function canonicalSourceMaterialContext(value:unknown):CanonicalMaterialContextV2 {
 const p=ownRecord(value,['version','assets','primarySource','budget'],['maskSource','maskingBlend','materialParams','colorParams','imageFrameIndices','scaledSource','expectedDrawCount','expectedStrokeEnd'])
 if(p.version!==2||p.materialParams!==undefined&&p.materialParams!=='source-material-parameters-v1'||p.colorParams!==undefined&&p.colorParams!=='source-pigment-rgb8-v1'&&p.colorParams!=='source-pigment-rgba8-v1')return fail()
 let maskingBlend:CanonicalMaskingBlendMode|undefined
 if(p.maskingBlend!==undefined){if(!isCanonicalMaskingBlendMode(p.maskingBlend)||canonicalMaskingBlendModes.indexOf(p.maskingBlend)>=10||p.maskSource===undefined)return fail();maskingBlend=p.maskingBlend}

 const assets=ownArray(p.assets,2048,a=>Object.freeze(ownRecord(a,['id','size','x','y','width','height']))) as unknown as CanonicalMaterialAsset[]
 const budget=ownRecord(p.budget,['workUnits','outputBytes','drawPixels']) as unknown as CanonicalMaterialContextV2['budget']
 const captured={...p,...p.materialParams!==undefined?{materialParams:'source-material-parameters-v1' as const}:{},...p.colorParams==='source-pigment-rgba8-v1'?{colorParams:'source-pigment-rgba8-v1' as const}:p.colorParams==='source-pigment-rgb8-v1'?{colorParams:'source-pigment-rgb8-v1' as const}:{},version:2 as const,assets:Object.freeze(assets),primarySource:captureSourceSlot(p.primarySource,0),...p.maskSource!==undefined?{maskSource:captureSourceSlot(p.maskSource,1)}:{},...maskingBlend?{maskingBlend}:{},budget:Object.freeze(budget)}
 context(captured)
 return Object.freeze(captured)
}
/** Executable masking always requires an explicitly recorded composition. */
export function canonicalMaskedSourceMaterialContext(value:unknown):CanonicalMaterialContextV2 & {readonly maskSource:NonNullable<CanonicalMaterialContextV2['maskSource']>;readonly maskingBlend:CanonicalMaskingBlendMode} {
 const captured=canonicalSourceMaterialContext(value)
 if(!captured.maskSource||!captured.maskingBlend)return fail()
 return Object.freeze({...captured,maskSource:captured.maskSource,maskingBlend:captured.maskingBlend})
}
