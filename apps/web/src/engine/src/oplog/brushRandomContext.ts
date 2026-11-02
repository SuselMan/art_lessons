import { resolveCanonicalTexturePhase, type CanonicalResolvedTexturePhase, hasValidBrushRandomContext, type BrushRandomSeeds, type ToolType } from '@grafetto/shared'

/** Author-owned immutable-by-copy gesture metadata, never renderer RNG state. */
export function createBrushRandomContext(tool: ToolType): BrushRandomSeeds | undefined {
  if (tool !== 'digitalBrush') return undefined
  const words = crypto.getRandomValues(new Uint32Array(2))
  return { version: 1, sequentialSeed: words[0], strokeSeed: words[1] }
}

export function brushRandomMetadata(seeds: BrushRandomSeeds | undefined): { brushRandom?: BrushRandomSeeds } {
  return seeds ? { brushRandom: { ...seeds } } : {}
}

/** Canonical gesture IDs bind both seed words; no mutable receiver ledger. */
export function assertBrushRandomContext(packet: unknown): void {
  if (!hasValidBrushRandomContext(packet)) throw new Error('Invalid brush random context')
}

/** phase-entropy-v1: separate two Uint32 words, lazy once per invocation.
 * Modulo32 is deliberate (not uniform/native Qt RNG). Caller owns stroke caching. */
export function createCanonicalTexturePhaseCandidate(input: unknown): Readonly<CanonicalResolvedTexturePhase> {
  let words: Uint32Array | undefined
  return resolveCanonicalTexturePhase(input, (key, exclusiveUpper) => {
    words ??= crypto.getRandomValues(new Uint32Array(2))
    return words[key === 'texture_offset_x' ? 0 : 1] % exclusiveUpper
  })
}
