/** Recorded once per gesture and repeated unchanged on every operation/live chunk.
 * Source consumption belongs to the versioned brush policy; these are independent
 * initial states, never a request to infer new seeds while replaying old strokes. */
export interface BrushRandomSeeds {
  version: 1
  sequentialSeed: number
  strokeSeed: number
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

/** Shared by the original live payload and the final operation gate. Absence is
 * the historical format. Seed presence alone must not select a brush policy. */
export function hasValidBrushRandomContext(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const packet = value as Record<string, unknown>
  if (packet.brushRandom === undefined) return true
  return (packet.type === undefined || packet.type === 'stroke') && packet.tool === 'digitalBrush'
    && typeof packet.strokeId === 'string' && packet.strokeId.length > 0 && packet.strokeId.length <= 200
    && isBrushRandomSeeds(packet.brushRandom)
}
