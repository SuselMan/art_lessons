/** Recorded once per gesture and repeated unchanged on every operation/live chunk.
 * Source consumption belongs to the versioned brush policy; these are independent
 * initial states, never a request to infer new seeds while replaying old strokes. */
export type BrushRandomSeeds = {
  readonly version: 1
  readonly sequentialSeed: number
  readonly strokeSeed: number
}

export function isBrushRandomSeeds(value: unknown): value is BrushRandomSeeds {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  const seeds = value as Record<string, unknown>
  if (Object.keys(seeds).length !== 3 || !Object.keys(seeds).every(key => ['version', 'sequentialSeed', 'strokeSeed'].includes(key))) return false
  const uint32 = (word: unknown): boolean => typeof word === 'number' && Number.isInteger(word) && word >= 0 && word <= 0xffffffff
  return seeds.version === 1 && uint32(seeds.sequentialSeed) && uint32(seeds.strokeSeed)
}

const seededGesture = /^br1\.([A-Za-z0-9_-]{10,64})\.([0-9a-f]{8})\.([0-9a-f]{8})$/
const seedWord = (word: number): string => word.toString(16).padStart(8, '0')

/** Generate the seeds independently FIRST, then bind them to the gesture's
 * nonce. Same identity cannot silently change seeds across live/final chunks.
 * No seed is generated, hashed or inferred from pointer coordinates or IDs. */
export function createBrushRandomStrokeId(nonce: string, seeds: BrushRandomSeeds): string {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(nonce) || !isBrushRandomSeeds(seeds)) throw new RangeError('Invalid seeded gesture identity')
  return `br1.${nonce}.${seedWord(seeds.sequentialSeed)}.${seedWord(seeds.strokeSeed)}`
}

/** Shared by original live payload and final operation gate. New seeds require
 * the canonical bound identity; historical nanoid gestures carry no seed pair.
 * A missing pair on a versioned identity is rejected rather than downgraded.
 * This stateless invariant survives reconnects, forks and history eviction. */
export function hasValidBrushRandomContext(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const packet = value as Record<string, unknown>
  if (packet.brushRandom === undefined) return typeof packet.strokeId !== 'string' || !/^br[0-9]+\./.test(packet.strokeId)
  if ((packet.type !== undefined && packet.type !== 'stroke') || packet.tool !== 'digitalBrush'
    || typeof packet.strokeId !== 'string' || packet.strokeId.length > 200 || !isBrushRandomSeeds(packet.brushRandom)) return false
  const match = seededGesture.exec(packet.strokeId)
  return match !== null && match[2] === seedWord(packet.brushRandom.sequentialSeed) && match[3] === seedWord(packet.brushRandom.strokeSeed)
}
