import { isBrushRandomSeeds, brushRequiresRandomContext, hasBrushSourceInputs, type BrushDescriptor, type BrushRandomSeeds, type Dab } from '@grafetto/shared'

/** Plain gesture-owned data: safe across structuredClone, previews and queues. */
export interface BrushExecutionContext {
  readonly brushRandom?: BrushRandomSeeds
}
export function brushExecutionContext(seeds?: BrushRandomSeeds): BrushExecutionContext | undefined {
  if(seeds === undefined) return undefined
  if(!isBrushRandomSeeds(seeds)) throw Error('Invalid brush execution seeds')
  return { brushRandom: { ...seeds } }
}

const requiresContext = new WeakMap<BrushDescriptor, boolean>()
export function requiresBrushExecutionContext(brush: BrushDescriptor): boolean {
  const known = requiresContext.get(brush)
  if(known !== undefined) return known
  const result = brushRequiresRandomContext(brush)
  requiresContext.set(brush, result)
  return result
}
export function assertBrushExecutionContext(brush: BrushDescriptor, context?: BrushExecutionContext): void {
  if(context?.brushRandom !== undefined && !isBrushRandomSeeds(context.brushRandom)) throw Error('Invalid brush execution seeds')
  if(requiresBrushExecutionContext(brush) && !context?.brushRandom) throw Error('Keyed brush source requires an explicit gesture context')
}
export function assertSameBrushExecutionContext(previous: BrushExecutionContext | undefined, incoming: BrushExecutionContext | undefined): void {
  const a = previous?.brushRandom, b = incoming?.brushRandom
  if(a && (!b || a.version !== b.version || a.strokeSeed !== b.strokeSeed || a.sequentialSeed !== b.sequentialSeed)) throw Error('Brush execution context changed during a gesture')
}

/** Validate the entire logical batch before state, queue, log or GL effects. */
export function assertBrushSourceInputs(brush: BrushDescriptor, dabs: readonly Dab[], endpoint?: Dab): void {
  if (!hasBrushSourceInputs(brush,dabs,endpoint))
    throw Error('Sequential brush requires canonical sourceSize and sourceScale')
}
