import { hasValidBrushRandomContext,hasValidBrushSourceContext,copyBrushSourceContext,type BrushSourceContext, type BrushRandomSeeds, type ToolType } from '@grafetto/shared'

/** Author-owned immutable-by-copy gesture metadata, never renderer RNG state. */
export function createBrushRandomContext(tool: ToolType): BrushRandomSeeds | undefined {
  if (tool !== 'digitalBrush') return undefined
  const words = crypto.getRandomValues(new Uint32Array(2))
  return { version: 1, sequentialSeed: words[0], strokeSeed: words[1] }
}

export function brushRandomMetadata(seeds: BrushRandomSeeds | undefined,source?:BrushSourceContext): { brushRandom?: BrushRandomSeeds;brushSource?:BrushSourceContext } {
  return {...(seeds ? {brushRandom:{...seeds}} : {}),...(source ? {brushSource:copyBrushSourceContext(source)} : {})}
}

/** Canonical gesture IDs bind both seed words; no mutable receiver ledger. */
export function assertBrushRandomContext(packet: unknown): void {
  if (!hasValidBrushRandomContext(packet)||!hasValidBrushSourceContext(packet)) throw new Error('Invalid brush random context')
}
