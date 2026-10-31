import { CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE } from '@grafetto/shared'
import { KritaRandomSource, qt5QStringHash } from './nativeRandom'

/** Identity behavior helper; never grants execution authorization. */
const DOMAIN = CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
export const MAX_SOURCE_DENSITY_GESTURE_ID = 8192
export interface SourceDefaultAutoDensityIdentity {
  readonly gestureId: string
  readonly descriptorSha256: string
  readonly role: 'primary'
  /** Cumulative accepted material draw ordinal, before clipping. */
  readonly drawOrdinal: number
}
/** Original-stream identity must be supplied by its trusted owner. Validation
 * bounds hashing; it neither authenticates this identity nor grants execution.
 * 8192 UTF16 units covers the escaped bounded room/user/stroke identity tuple. */
export function sourceDefaultAutoDensitySeed(input: unknown): number {
  if (!input || typeof input !== 'object') throw new TypeError('Invalid density identity')
  const value = input as Partial<SourceDefaultAutoDensityIdentity>
  if (Object.keys(value).length !== 4 || !['gestureId','descriptorSha256','role','drawOrdinal'].every(k=>Object.hasOwn(value,k))
    || typeof value.gestureId !== 'string' || !value.gestureId.length || value.gestureId.length > MAX_SOURCE_DENSITY_GESTURE_ID || value.gestureId.includes('\0')
    || typeof value.descriptorSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.descriptorSha256)
    || value.role !== 'primary' || !Number.isSafeInteger(value.drawOrdinal) || value.drawOrdinal! < 0) {
    throw new TypeError('Invalid density identity')
  }
  return qt5QStringHash(JSON.stringify([DOMAIN,value.gestureId,value.descriptorSha256,value.role,value.drawOrdinal]))
}
/** Fresh request-local state; never shares or consumes the author option RNG.
 * Existing Taus88 seed normalization includes seed0; output range is [0,1]. */
export function createSourceDefaultAutoDensityRandom(input: unknown): KritaRandomSource {
  return new KritaRandomSource(sourceDefaultAutoDensitySeed(input))
}

/** Brush data identity, not a room/read lifetime or execution grant. */
export interface SourceDefaultAutoDensityStrokeIdentity { readonly strokeId: string }
export function captureSourceDefaultAutoDensityStrokeIdentity(input: unknown): Readonly<SourceDefaultAutoDensityStrokeIdentity> {
  if (!input || typeof input !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) throw new TypeError('Invalid density stroke identity')
  const keys=Reflect.ownKeys(input), property=Object.getOwnPropertyDescriptor(input,'strokeId')
  if(keys.length!==1 || keys[0]!=='strokeId' || !property || !Object.hasOwn(property,'value')
    || typeof property.value!=='string' || !property.value.length || property.value.length>256 || property.value.includes('\0')) throw new TypeError('Invalid density stroke identity')
  return Object.freeze({strokeId:property.value})
}
