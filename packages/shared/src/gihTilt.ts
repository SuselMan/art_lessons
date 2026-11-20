/** Captured F32 tilt, Qt5 half-up selector, and native signed-int intermediates.
 * Pointer interpolation may overshoot browser event bounds: no degree clamp is valid here.
 */
export function gihTiltIndex(axis:number|undefined,rank:number|undefined,stride=1):number|undefined {
  if(typeof axis!=='number'||rank===undefined||!Number.isInteger(rank)||rank<2||rank>256||!Number.isInteger(stride)||stride<1||stride>256)return undefined
  const value=Math.fround(axis),scaled=value/2*rank,min=-2147483648,max=2147483647
  // Qt5 negative qRound also casts d-1 internally: reject the unsafe endpoints.
  if(!Number.isFinite(value)||!(scaled>min&&scaled<max))return undefined
  const q=Math.floor(scaled+.5),index=q+Math.trunc(rank/2),product=index*stride
  return q>=min&&q<=max&&index>=min&&index<=max&&product>=min&&product<=max?index:undefined
}
