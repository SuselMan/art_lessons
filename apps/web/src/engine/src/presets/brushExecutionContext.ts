import { mask190RootExecution, mask190Role, type MaskRole190 } from './independentMask190'
import{assertRecordedPen188Inputs}from './recordedPen188'
import { hasExperimentCurrentPattern158Scope,hasTimeControl132,isPrimaryClockRead132Marker,isIndependentChildClock132Pair,isIndependentDrawingAnglePair,brushUsesGradient,isBrushSourceContext,copyBrushSourceContext,brushSourceKey,type BrushSourceContext, isBrushRandomSeeds, brushRequiresRandomContext, hasBrushSourceInputs, type BrushDescriptor, type BrushRandomSeeds, type Dab } from '@grafetto/shared'

/** Plain gesture-owned data: safe across structuredClone, previews and queues. */
export interface BrushExecutionContext {
  readonly maskRole190?: MaskRole190
  readonly brushRandom?: BrushRandomSeeds
  readonly brushSource?:BrushSourceContext
}
export function brushExecutionContext(seeds?: BrushRandomSeeds,source?:BrushSourceContext,maskRole190?:MaskRole190): BrushExecutionContext | undefined {
  if(seeds === undefined && source===undefined && maskRole190===undefined) return undefined
  if(seeds!==undefined && !isBrushRandomSeeds(seeds)) throw Error('Invalid brush execution seeds')
  return {...(maskRole190?{maskRole190:{...maskRole190}}:{}),...(seeds ? {brushRandom:{...seeds}} : {}),...(source ? {brushSource:copyBrushSourceContext(source)} : {})}
}

const requiresContext = new WeakMap<BrushDescriptor, boolean>()
export function requiresBrushExecutionContext(brush: BrushDescriptor): boolean {
  const known = requiresContext.get(brush)
  if(known !== undefined) return known
  const result = brushRequiresRandomContext(brush)||brush.mixer?.source==='projectionCanvas'||brushUsesGradient(brush)||!!brush.clone||!!brush.tangentNormal||!!brush.hatching?.opaqueBackground||!!brush.grid?.fillBackground||!!brush.grid?.mixBackground||!!brush.spray?.color.mixBackground||!!brush.spray?.color.fillBackground||hasExperimentCurrentPattern158Scope(brush)
  requiresContext.set(brush, result)
  return result
}
export function assertBrushExecutionContext(brush: BrushDescriptor, context?: BrushExecutionContext): void {
  context=mask190RootExecution(brush,context)
  const mask190=mask190Role(brush,context)!==undefined
  if(mask190){
    const role=context!.maskRole190!
    if(context?.brushRandom!==undefined&&!isBrushRandomSeeds(context.brushRandom))throw Error('Invalid Mask190 execution seeds')
    if(role.needRandom&&!context?.brushRandom)throw Error('Mask190 requires an explicit gesture random context')
    if(role.needGradient&&!context?.brushSource?.gradient)throw Error('Mask190 requires captured gradient source')
    if(brush.version===191&&brush.mixer){if(context?.brushSource!==undefined&&!isBrushSourceContext(context.brushSource))throw Error('Invalid captured Texture191 source');if(brush.mixer.source==='projectionCanvas'&&!context?.brushSource?.projection)throw Error('Merged Texture191 brush requires recorded projection sources')}
    return
  }
  if(brush.behavior?.clockRead!==undefined&&(!isPrimaryClockRead132Marker(brush.behavior.clockRead)||brush.version<132))throw Error('Invalid child clock132 marker')
  if(brush.behavior?.dual&&(brush.behavior.dual.brush.behavior?.clockRead!==undefined||brush.behavior.dual.brush.version>=132&&hasTimeControl132(brush.behavior.dual.brush.behavior))&&!mask190&&!isIndependentChildClock132Pair(brush))throw Error('Child clock132 requires a matching primary timer pair')
  if(brush.behavior?.dual?.brush.behavior?.strokeInput&&!mask190&&!isIndependentDrawingAnglePair(brush))throw Error('Independent DrawingAngle requires matching120 root/child policies')
  if(context?.brushRandom !== undefined && !isBrushRandomSeeds(context.brushRandom)) throw Error('Invalid brush execution seeds')
  if(brushRequiresRandomContext(brush) && !context?.brushRandom) throw Error('Keyed brush source requires an explicit gesture context')
  if(context?.brushSource!==undefined && !isBrushSourceContext(context.brushSource))throw Error('Invalid brush source context')
  if(brush.mixer?.source==='projectionCanvas' && !context?.brushSource?.projection)throw Error('Merged brush requires recorded projection sources')
  if(brush.tangentNormal&&context?.brushSource?.normalRotation===undefined)throw Error('Normal brush requires recorded viewport rotation')
  if(brush.clone&&!context?.brushSource?.clone)throw Error('Clone requires a recorded source')
  if(brush.clone?.source==='projectionCanvas'&&!context?.brushSource?.projection)throw Error('Merged Clone149 requires recorded projection sources')
  if(context?.brushSource?.pattern!==undefined&&!hasExperimentCurrentPattern158Scope(brush))throw Error('Captured pattern requires Experiment158')
  if(hasExperimentCurrentPattern158Scope(brush)&&context?.brushSource?.pattern===undefined)throw Error('Experiment158 requires captured canvas pattern or explicit none')
  if(brushUsesGradient(brush)&&!context?.brushSource?.gradient)throw Error('Brush requires a captured canvas gradient')
  if(brush.hatching?.opaqueBackground&&!context?.brushSource?.background)throw Error('Hatching requires a captured background')
  if((brush.grid?.fillBackground||brush.grid?.mixBackground)&&!context?.brushSource?.background)throw Error('Grid requires a captured background')
  if((brush.spray?.color.fillBackground||brush.spray?.color.mixBackground)&&!context?.brushSource?.background)throw Error('Spray requires a captured background')
}
export function assertSameBrushExecutionContext(previous: BrushExecutionContext | undefined, incoming: BrushExecutionContext | undefined): void {
  const previousRole=previous?.maskRole190,nextRole=incoming?.maskRole190
  if((previousRole?.version??190)!==(nextRole?.version??190)||previousRole?.rootId!==nextRole?.rootId||previousRole?.childId!==nextRole?.childId||previousRole?.role!==nextRole?.role||previousRole?.needTime!==nextRole?.needTime||previousRole?.needSpeed!==nextRole?.needSpeed||previousRole?.needRandom!==nextRole?.needRandom||previousRole?.needGradient!==nextRole?.needGradient)throw Error('Mask190 execution role changed during a gesture')
  const a = previous?.brushRandom, b = incoming?.brushRandom
  if(a && (!b || a.version !== b.version || a.strokeSeed !== b.strokeSeed || a.sequentialSeed !== b.sequentialSeed)) throw Error('Brush execution context changed during a gesture')
  const x=previous?.brushSource,y=incoming?.brushSource
  if(!!x!==!!y || x&&y&&brushSourceKey(x)!==brushSourceKey(y))throw Error('Brush paint sources changed during a gesture')
}

/** Validate the entire logical batch before state, queue, log or GL effects. */
export function assertBrushSourceInputs(brush: BrushDescriptor, dabs: readonly Dab[], endpoint?: Dab, execution?:BrushExecutionContext): void {
  execution=mask190RootExecution(brush,execution)
  const role=mask190Role(brush,execution)
  assertRecordedPen188Inputs(brush,dabs,endpoint,role!==undefined)
  if(role!==undefined){
    const policy=execution!.maskRole190!
    const valid=(d:Dab):boolean=>typeof d.sourceSize==='number'&&Number.isFinite(d.sourceSize)&&d.sourceSize>0&&d.sourceSize<=100000&&Math.fround(d.sourceSize)===d.sourceSize
      &&typeof d.sourceScale==='number'&&Number.isFinite(d.sourceScale)&&d.sourceScale>=0&&d.sourceScale<=(execution?.maskRole190?.role==='child'?8:1)&&Math.fround(d.sourceScale)===d.sourceScale
      &&typeof d.sourceAngle==='number'&&Number.isFinite(d.sourceAngle)
      &&(!policy.needTime||typeof d.sourceTime==='number'&&Number.isFinite(d.sourceTime)&&d.sourceTime>=0&&d.sourceTime<=Number.MAX_SAFE_INTEGER)
      &&(!policy.needSpeed||typeof d.normalizedSpeed==='number'&&Number.isFinite(d.normalizedSpeed)&&d.normalizedSpeed>=0&&d.normalizedSpeed<=1)
    if(!dabs.every(valid)||endpoint&&!valid(endpoint))throw Error('Mask190 requires canonical captured source inputs')
    return
  }
  if (!hasBrushSourceInputs(brush,dabs,endpoint))
    throw Error('Brush requires canonical sourceSize and sourceScale or sourceAngle for its active policy')
}
