import type { BrushBehavior, BrushDescriptor } from '@grafetto/shared'

const normalized = new WeakMap<BrushDescriptor, BrushDescriptor & {behavior: BrushBehavior}>()
/** Old preset tokens are input data, not a reason to keep a second renderer.
 * All digital brushes enter the same stamp/mixer behavior contract here. */
export function normalizeBrush(brush: BrushDescriptor): BrushDescriptor & {behavior: BrushBehavior} {
  const cached=normalized.get(brush)
  if(cached)return cached
  const result={...brush,model:brush.model==='ribbon'?'stamp' as const:brush.model,behavior:brush.behavior??{
    version:2 as const,
    rendering:{mode:'buildUp' as const,blendMode:brush.wet?.glaze?'multiply' as const:'normal' as const,wetEdges:brush.wet?.edge??0,burntEdges:0,burntEdgesMode:'multiply' as const},
  }}
  normalized.set(brush,result)
  return result
}
