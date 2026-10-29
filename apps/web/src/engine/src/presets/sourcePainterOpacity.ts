export interface SourcePainterOpacityInput {
  readonly opacity:number
  readonly averageOpacity:number
  readonly flow:number
}
export interface SourcePainterOpacity {
  readonly opacity:number
  /** Effective *lastOpacity, not the raw qreal running average. */
  readonly averageOpacity:number
  readonly flow:number
  readonly averageAliased:boolean
}

/** ParameterInfo::setOpacityAndAverage(float,float), Qt5.15.7 float comparator.
 * qreal callers narrow BEFORE the comparison. Every subtraction/product has the
 * native F32 boundary; this is not an epsilon/max-relative approximation.
 * No history update, flow folding, compositor call or active pipeline hook.
 * Signed-zero controls retain their Float32 bits; alias adopts OPACITY's zero.
 */
export function normalizeSourcePainterOpacity(input:SourcePainterOpacityInput):SourcePainterOpacity {
  if(!input||![input.opacity,input.averageOpacity,input.flow].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))throw new RangeError('Invalid source painter opacity controls')
  const opacity=Math.fround(input.opacity),average=Math.fround(input.averageOpacity),flow=Math.fround(input.flow)
  const difference=Math.fround(opacity-average)
  // Actual qAbs template returns -0 unchanged, unlike Math.abs; qMin returns
  // its second operand on equality. Preserve that order even though signed
  // zero never changes this <= decision.
  const abs=(v:number)=>v>=0?v:-v
  const a=abs(opacity),b=abs(average)
  const averageAliased=Math.fround(abs(difference)*100000)<=(a<b?a:b)
  return{opacity,averageOpacity:averageAliased?opacity:average,flow,averageAliased}
}
