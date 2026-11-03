import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'
import { isCanonicalMaskingBlendMode, type CanonicalMaskingBlendMode } from './canonicalMaskingBlend.js'

/** Pure material metadata, not a descriptor/CAS attestation or execution grant. */
export interface CanonicalPrimaryTexturePin {
  readonly kind: 'canvasTexture'
  readonly asset: string
  readonly law: 'subtract-u8-v1'
  readonly width: number
  readonly height: number
  readonly periodX: number
  readonly periodY: number
  readonly offsetX: number
  readonly offsetY: number
  readonly strength: 'pressure-identity-v1'
}

/** Distinct fixed-strength metadata; pressure pins never accept this token. */
export interface CanonicalFixedPrimaryTexturePin extends Omit<CanonicalPrimaryTexturePin, 'strength'> {
  readonly strength: 'fixed-one-v1'
}

/** Pressure-curve law DATA, distinct from identity3 and fixed4. */
export interface CanonicalPressureCurvePrimaryTexturePin extends Omit<CanonicalPrimaryTexturePin, "strength"> {
  readonly strength: "source-pressure-curve-v1";
}
export function canonicalPressureCurvePrimaryTexturePin(value: unknown, assets: readonly CanonicalMaterialAsset[]): Readonly<CanonicalPressureCurvePrimaryTexturePin> {
  if (!Array.isArray(assets) || assets.length !== 1)
    return fail();
  const descriptor = Object.getOwnPropertyDescriptor(assets, "0");
  if (!descriptor || !Object.hasOwn(descriptor, "value"))
    return fail();
  return capturePrimaryTexturePin(value, descriptor.value, "source-pressure-curve-v1");
}

const fail = (): never => { throw new TypeError('Invalid canonical primary texture') }
const fields = ['kind', 'asset', 'law', 'width', 'height', 'periodX', 'periodY', 'offsetX', 'offsetY', 'strength'] as const
const assetFields = ['id', 'size', 'x', 'y', 'width', 'height'] as const

/** Read descriptors before values: an accessor must never execute at this boundary.
 * Proxies are not sandboxed; callers retain responsibility for trusted objects. */
function capture(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return fail()
  const keys = Reflect.ownKeys(value)
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) return fail()
  const copy: Record<string, unknown> = Object.create(null)
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return fail()
    copy[name] = descriptor.value
  }
  return copy
}

const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max
const dimension = (value: unknown): value is number => integer(value, 1, 4096)
const cas = (value: unknown): value is string => typeof value === 'string' && /^asset:[a-f0-9]{64}$/.test(value)

/** Capture a closed immutable pin against authoritative CAS rectangle metadata.
 * Padding outside the rectangle is allowed, but never belongs to the period. */
export function canonicalPrimaryTexturePin(input: unknown, trustedAsset: CanonicalMaterialAsset): Readonly<CanonicalPrimaryTexturePin> {
  return capturePrimaryTexturePin(input, trustedAsset, 'pressure-identity-v1')
}

/** Closed fixed-one pin only. Same geometry validation, a different strength law.
 * No source-data attestation, CAS-content validation or execution permission. */
export function canonicalFixedPrimaryTexturePin(input: unknown, trustedAsset: CanonicalMaterialAsset): Readonly<CanonicalFixedPrimaryTexturePin> {
  return capturePrimaryTexturePin(input, trustedAsset, 'fixed-one-v1')
}

function capturePrimaryTexturePin<S extends CanonicalPrimaryTexturePin['strength'] | CanonicalFixedPrimaryTexturePin['strength'] | CanonicalPressureCurvePrimaryTexturePin['strength']>(
  input: unknown, trustedAsset: CanonicalMaterialAsset, strength: S,
): Readonly<Omit<CanonicalPrimaryTexturePin, 'strength'> & { readonly strength: S }> {
  const p = capture(input, fields), a = capture(trustedAsset, assetFields)
  if (p.kind !== 'canvasTexture' || p.law !== 'subtract-u8-v1' || p.strength !== strength
    || !cas(p.asset) || p.asset !== a.id || !cas(a.id)
    || !dimension(p.width) || !dimension(p.height) || p.width * p.height > 1048576
    || !dimension(a.size) || a.x !== 0 || Object.is(a.x, -0) || a.y !== 0 || Object.is(a.y, -0)
    || a.width !== p.width || a.height !== p.height || p.width > a.size || p.height > a.size
    || typeof p.periodX !== 'number' || !Number.isFinite(p.periodX) || p.periodX <= 0 || p.periodX > 1e6 || p.periodX !== p.width
    || typeof p.periodY !== 'number' || !Number.isFinite(p.periodY) || p.periodY <= 0 || p.periodY > 1e6 || p.periodY !== p.height
    || !integer(p.offsetX, 0, p.width - 1) || !integer(p.offsetY, 0, p.height - 1)) return fail()
  return Object.freeze({ kind: 'canvasTexture', asset: p.asset, law: 'subtract-u8-v1', width: p.width, height: p.height,
    periodX: p.periodX, periodY: p.periodY, offsetX: p.offsetX, offsetY: p.offsetY, strength })
}

/** Binary64 multiplication by255, then nearest integer, ties to even; no epsilon.
 * Does not rewrite the caller's input; both signed zeros produce U8 positive0. */
export function canonicalPrimaryTextureStrengthU8(strength: number): number {
  if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 1) return fail()
  const scaled = strength * 255, floor = Math.floor(scaled), fraction = scaled - floor
  return (fraction > .5 || fraction === .5 && floor % 2 === 1 ? floor + 1 : floor) || 0
}

/** M,T,S are U8 integers. S is already quantized strength, not a [0,1] scalar.
 * Subtract precedes source compositing; zero strength is NOT texture bypass. */
export function canonicalPrimaryTextureSubtractU8(mask: number, texture: number, strengthU8: number): number {
  if (!integer(mask, 0, 255) || !integer(texture, 0, 255) || !integer(strengthU8, 0, 255)) return fail()
  return Math.max(0, mask - texture - (255 - strengthU8))
}

/** One top-left world-pixel axis. Call separately for X/Y; no implicit Y flip.
 * Reduce before adding offset so even MAX_SAFE_INTEGER inputs cannot overflow. */
export function canonicalPrimaryTextureCell(world: number, size: number, offset: number): number {
  if (typeof world !== 'number' || !Number.isSafeInteger(world) || !dimension(size) || !integer(offset, 0, size - 1)) return fail()
  const remainder = world % size
  const reduced = remainder < 0 ? remainder + size : remainder
  return (reduced + offset) % size || 0
}

/** Resolved canonical PLUS-coordinate phase DATA, not a source/stroke grant. */
export interface CanonicalResolvedTexturePhase {
  readonly kind: 'resolved-stroke-phase-v1'
  readonly x: number
  readonly y: number
}

/** Capture saved phase against the actual sampled rectangle, never CAS padding. */
export function canonicalResolvedTexturePhase(value: unknown, width: number, height: number): Readonly<CanonicalResolvedTexturePhase> {
  phaseDimensions(width, height)
  const p = capture(value, ['kind', 'x', 'y'])
  if (p.kind !== 'resolved-stroke-phase-v1' || !integer(p.x, 0, width - 1) || !integer(p.y, 0, height - 1)) return fail()
  return Object.freeze({ kind: 'resolved-stroke-phase-v1', x: p.x, y: p.y })
}

export type CanonicalTexturePhaseRandomKey = 'texture_offset_x' | 'texture_offset_y'

/** Pure candidate invocation. The caller owns candidate lifetime/retry caching.
 * Random replaces the original fixed axis. No RNG or stroke cache lives here.
 * All input is captured/validated before invoking either external resolver. */
export function resolveCanonicalTexturePhase(
  value: unknown,
  resolveRandom: (key: CanonicalTexturePhaseRandomKey, exclusiveUpper: number) => number,
): Readonly<CanonicalResolvedTexturePhase> {
  const p = capture(value, ['width', 'height', 'offsetX', 'offsetY', 'randomX', 'randomY'])
  if (typeof p.width !== 'number' || typeof p.height !== 'number') return fail()
  const width = p.width, height = p.height
  phaseDimensions(width, height)
  if (!signedOffset(p.offsetX) || !signedOffset(p.offsetY) || typeof p.randomX !== 'boolean' || typeof p.randomY !== 'boolean'
    || typeof resolveRandom !== 'function') return fail()
  const x = p.randomX ? resolveRandom('texture_offset_x', width) : p.offsetX
  if (p.randomX && !integer(x, 0, width - 1)) return fail()
  const y = p.randomY ? resolveRandom('texture_offset_y', height) : p.offsetY
  if (p.randomY && !integer(y, 0, height - 1)) return fail()
  return Object.freeze({ kind: 'resolved-stroke-phase-v1', x: negativeOffset(x, width), y: negativeOffset(y, height) })
}

function signedOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)
}
function phaseDimensions(width: number, height: number): void {
  if (!dimension(width) || !dimension(height) || width * height > 1048576) return fail()
}
function negativeOffset(offset: number, period: number): number {
  const remainder = offset % period
  return (remainder === 0 ? 0 : remainder > 0 ? period - remainder : -remainder)
}

/** Recorded grain is renderer DATA, independent of source option evaluation. */
export interface CanonicalRecordedPrimaryTexturePin extends Omit<CanonicalPrimaryTexturePin,'strength'|'offsetX'|'offsetY'> {
 readonly strength:'recorded-grain-v1'
 readonly phase:CanonicalResolvedTexturePhase
}
/** SAME closed geometry as historical pins; new token/phase never project into them. */
export function canonicalRecordedPrimaryTexturePin(input:unknown,trustedAsset:CanonicalMaterialAsset):Readonly<CanonicalRecordedPrimaryTexturePin>{
 return captureRecordedPrimaryTexturePin(input,trustedAsset,'subtract-u8-v1')
}

/** New standalone material DATA; never accepted by historical subtract pins. */
export interface CanonicalMultiplyPrimaryTexturePin extends Omit<CanonicalRecordedPrimaryTexturePin,'law'> {
 readonly law:'hard-multiply-u8-native-v1'
}
export function canonicalMultiplyPrimaryTexturePin(input:unknown,trustedAsset:CanonicalMaterialAsset):Readonly<CanonicalMultiplyPrimaryTexturePin>{
 return captureRecordedPrimaryTexturePin(input,trustedAsset,'hard-multiply-u8-native-v1')
}
/** Unified Pixel texture DATA. Historical subtract and multiply pins stay closed. */
export interface CanonicalPixelPrimaryTexturePin extends Omit<CanonicalRecordedPrimaryTexturePin,'law'> {
 readonly law:'pixel-texture-u8-v1'
 readonly mode:CanonicalMaskingBlendMode
 readonly soft:boolean
}
export function canonicalPixelPrimaryTexturePin(input:unknown,trustedAsset:CanonicalMaterialAsset):Readonly<CanonicalPixelPrimaryTexturePin>{
 const p=capture(input,['kind','asset','law','width','height','periodX','periodY','phase','strength','mode','soft'])
 if(!isCanonicalMaskingBlendMode(p.mode)||typeof p.soft!=='boolean')return fail()
 const geometry=captureRecordedPrimaryTexturePin(input,trustedAsset,'pixel-texture-u8-v1')
 return Object.freeze({...geometry,mode:p.mode,soft:p.soft})
}
/** Original captured texture-gradient resource, never an application fallback. */
export interface CanonicalTextureGradientRGBA {readonly kind:'captured-texture-gradient-rgba8-v1';readonly rgba:readonly number[]}
export function canonicalTextureGradientRGBA(value:unknown):Readonly<CanonicalTextureGradientRGBA>{
 const p=capture(value,['kind','rgba'])
 if(p.kind!=='captured-texture-gradient-rgba8-v1'||!Array.isArray(p.rgba)||Object.getPrototypeOf(p.rgba)!==Array.prototype||p.rgba.length!==1024||Reflect.ownKeys(p.rgba).length!==1025)return fail()
 const rgba:number[]=[]
 for(let i=0;i<1024;i++){const d=Object.getOwnPropertyDescriptor(p.rgba,String(i));if(!d||!Object.hasOwn(d,'value')||!integer(d.value,0,255)||Object.is(d.value,-0))return fail();rgba.push(d.value)}
 return Object.freeze({kind:'captured-texture-gradient-rgba8-v1',rgba:Object.freeze(rgba)})
}
export interface CanonicalPixelColorTexturePin extends Omit<CanonicalRecordedPrimaryTexturePin,'law'>{
 readonly law:'pixel-color-texture-v1';readonly mode:'lightness'|'gradient';readonly alphaAsset:string;readonly gradient?:CanonicalTextureGradientRGBA
}
export function canonicalPixelColorTexturePin(input:unknown,trustedGray:CanonicalMaterialAsset,trustedAlpha:CanonicalMaterialAsset):Readonly<CanonicalPixelColorTexturePin>{
 const mode=Object.getOwnPropertyDescriptor(input??{},'mode')
 if(!mode||!Object.hasOwn(mode,'value')||mode.value!=='lightness'&&mode.value!=='gradient')return fail()
 const p=capture(input,['kind','asset','law','width','height','periodX','periodY','phase','strength','mode','alphaAsset',...mode.value==='gradient'?['gradient']:[]])
 const alpha=capture(trustedAlpha,assetFields),gray=capture(trustedGray,assetFields)
 if(!cas(p.alphaAsset)||p.alphaAsset!==alpha.id||!cas(alpha.id))return fail()
 for(const k of ['size','x','y','width','height'])if(!Object.is(alpha[k],gray[k]))return fail()
 // Reuse the closed recorded geometry validator without inventing a source pin.
 const geometry=captureRecordedPrimaryTexturePin(input,trustedGray,'pixel-color-texture-v1')
 return Object.freeze({...geometry,mode:mode.value,alphaAsset:p.alphaAsset,...mode.value==='gradient'?{gradient:canonicalTextureGradientRGBA(p.gradient)}:{}})
}
function captureRecordedPrimaryTexturePin<L extends CanonicalRecordedPrimaryTexturePin['law']|CanonicalMultiplyPrimaryTexturePin['law']|CanonicalPixelPrimaryTexturePin['law']|CanonicalPixelColorTexturePin['law']>(input:unknown,trustedAsset:CanonicalMaterialAsset,law:L):Readonly<Omit<CanonicalRecordedPrimaryTexturePin,'law'>&{readonly law:L}>{
 const fields=['kind','asset','law','width','height','periodX','periodY','phase','strength']
 if(law==='pixel-texture-u8-v1')fields.push('mode','soft')
 if(law==='pixel-color-texture-v1'){fields.push('mode','alphaAsset');const m=Object.getOwnPropertyDescriptor(input??{},'mode');if(m&&Object.hasOwn(m,'value')&&m.value==='gradient')fields.push('gradient')}
 const p=capture(input,fields),a=capture(trustedAsset,assetFields)
 if(p.kind!=='canvasTexture'||p.law!==law||p.strength!=='recorded-grain-v1'
  ||!cas(p.asset)||p.asset!==a.id||!cas(a.id)||!dimension(p.width)||!dimension(p.height)||p.width*p.height>1048576
  ||!dimension(a.size)||a.x!==0||Object.is(a.x,-0)||a.y!==0||Object.is(a.y,-0)||a.width!==p.width||a.height!==p.height||p.width>a.size||p.height>a.size
  ||p.periodX!==p.width||p.periodY!==p.height)return fail()
 const phase=canonicalResolvedTexturePhase(p.phase,p.width,p.height)
 return Object.freeze({kind:'canvasTexture',asset:p.asset,law,width:p.width,height:p.height,periodX:p.width,periodY:p.height,phase,strength:'recorded-grain-v1'})
}

/** Native nonsoft grain strength: binary64 scale, add half, then truncate.
 * Separate from the historical ties-even subtract convention. */
export function canonicalMultiplyTextureStrengthU8(strength:number):number {
 if(typeof strength!=='number'||!Number.isFinite(strength)||strength<0||strength>1)return fail()
 return Math.floor(strength*255+.5)||0
}
/** One triple product with the native U8 bias, not two rounded pair products.
 * Every intermediate is an exact integer below 2^24; strength0 gives alpha0. */
export function canonicalPrimaryTextureMultiplyU8(mask:number,texture:number,strengthU8:number):number {
 if(!integer(mask,0,255)||!integer(texture,0,255)||!integer(strengthU8,0,255))return fail()
 const biased=mask*texture*strengthU8+32603
 return Math.floor((biased+Math.floor(biased/128))/65536)
}

/** Named Pixel pins own their native origin-zero crop. A context asset row is
 * unique CAS storage DATA and may also serve a different image/spatial crop.
 * This projection validates storage bounds, never grants source authority. */
export function canonicalPixelTextureAsset(input:unknown,assets:readonly CanonicalMaterialAsset[],plane:'gray'|'alpha'='gray'):Readonly<CanonicalMaterialAsset>{
 if(plane!=='gray'&&plane!=='alpha'||!Array.isArray(assets)||assets.length>2048)return fail();
 const field=(key:string):unknown=>{const d=Object.getOwnPropertyDescriptor(input??{},key);if(!d||!Object.hasOwn(d,'value'))return fail();return d.value};
 const law=field('law'),id=field(plane==='alpha'?'alphaAsset':'asset'),width=field('width'),height=field('height');
 if(law!=='pixel-texture-u8-v1'&&law!=='pixel-color-texture-v1'||plane==='alpha'&&law!=='pixel-color-texture-v1'||!cas(id)||!dimension(width)||!dimension(height)||width*height>1048576)return fail();
 let found:Record<string,unknown>|undefined;
 for(let i=0;i<assets.length;i++){const d=Object.getOwnPropertyDescriptor(assets,String(i));if(!d||!Object.hasOwn(d,'value'))return fail();const a=capture(d.value,assetFields);if(a.id===id){if(found)return fail();found=a}}
 if(!found||!dimension(found.size)||width>found.size||height>found.size)return fail();
 return Object.freeze({id,size:found.size,x:0,y:0,width,height});
}
