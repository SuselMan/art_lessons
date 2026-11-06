import { brushUsesGradient,isBrushSourceContext,copyBrushSourceContext,brushSourceKey,type BrushSourceContext, isBrushRandomSeeds, brushRequiresRandomContext, hasBrushSourceInputs, type BrushDescriptor, type BrushRandomSeeds, type Dab } from '@grafetto/shared'

/** Plain gesture-owned data: safe across structuredClone, previews and queues. */
export interface BrushExecutionContext {
  readonly brushRandom?: BrushRandomSeeds
  readonly brushSource?:BrushSourceContext
}
export function brushExecutionContext(seeds?: BrushRandomSeeds,source?:BrushSourceContext): BrushExecutionContext | undefined {
  if(seeds === undefined && source===undefined) return undefined
  if(seeds!==undefined && !isBrushRandomSeeds(seeds)) throw Error('Invalid brush execution seeds')
  return {...(seeds ? {brushRandom:{...seeds}} : {}),...(source ? {brushSource:copyBrushSourceContext(source)} : {})}
}

const requiresContext = new WeakMap<BrushDescriptor, boolean>()
export function requiresBrushExecutionContext(brush: BrushDescriptor): boolean {
  const known = requiresContext.get(brush)
  if(known !== undefined) return known
  const result = brushRequiresRandomContext(brush)||brush.mixer?.source==='projectionCanvas'||brushUsesGradient(brush)
  requiresContext.set(brush, result)
  return result
}
export function assertBrushExecutionContext(brush: BrushDescriptor, context?: BrushExecutionContext): void {
  if(context?.brushRandom !== undefined && !isBrushRandomSeeds(context.brushRandom)) throw Error('Invalid brush execution seeds')
  if(brushRequiresRandomContext(brush) && !context?.brushRandom) throw Error('Keyed brush source requires an explicit gesture context')
  if(context?.brushSource!==undefined && !isBrushSourceContext(context.brushSource))throw Error('Invalid brush source context')
  if(brush.mixer?.source==='projectionCanvas' && !context?.brushSource?.projection)throw Error('Merged brush requires recorded projection sources')
  if(brushUsesGradient(brush)&&!context?.brushSource?.gradient)throw Error('Brush requires a captured canvas gradient')
}
export function assertSameBrushExecutionContext(previous: BrushExecutionContext | undefined, incoming: BrushExecutionContext | undefined): void {
  const a = previous?.brushRandom, b = incoming?.brushRandom
  if(a && (!b || a.version !== b.version || a.strokeSeed !== b.strokeSeed || a.sequentialSeed !== b.sequentialSeed)) throw Error('Brush execution context changed during a gesture')
  const x=previous?.brushSource,y=incoming?.brushSource
  if(!!x!==!!y || x&&y&&brushSourceKey(x)!==brushSourceKey(y))throw Error('Brush paint sources changed during a gesture')
}

/** Validate the entire logical batch before state, queue, log or GL effects. */
export function assertBrushSourceInputs(brush: BrushDescriptor, dabs: readonly Dab[], endpoint?: Dab): void {
  if (!hasBrushSourceInputs(brush,dabs,endpoint))
    throw Error('Brush requires canonical sourceSize and sourceScale or sourceAngle for its active policy')
}
