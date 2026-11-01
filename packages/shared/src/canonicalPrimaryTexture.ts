import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'

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
  const p = capture(input, fields), a = capture(trustedAsset, assetFields)
  if (p.kind !== 'canvasTexture' || p.law !== 'subtract-u8-v1' || p.strength !== 'pressure-identity-v1'
    || !cas(p.asset) || p.asset !== a.id || !cas(a.id)
    || !dimension(p.width) || !dimension(p.height) || p.width * p.height > 1048576
    || !dimension(a.size) || a.x !== 0 || Object.is(a.x, -0) || a.y !== 0 || Object.is(a.y, -0)
    || a.width !== p.width || a.height !== p.height || p.width > a.size || p.height > a.size
    || typeof p.periodX !== 'number' || !Number.isFinite(p.periodX) || p.periodX <= 0 || p.periodX > 1e6 || p.periodX !== p.width
    || typeof p.periodY !== 'number' || !Number.isFinite(p.periodY) || p.periodY <= 0 || p.periodY > 1e6 || p.periodY !== p.height
    || !integer(p.offsetX, 0, p.width - 1) || !integer(p.offsetY, 0, p.height - 1)) return fail()
  return Object.freeze({ kind: 'canvasTexture', asset: p.asset, law: 'subtract-u8-v1', width: p.width, height: p.height,
    periodX: p.periodX, periodY: p.periodY, offsetX: p.offsetX, offsetY: p.offsetY, strength: 'pressure-identity-v1' })
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
