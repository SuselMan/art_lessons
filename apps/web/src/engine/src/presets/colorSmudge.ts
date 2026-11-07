/** Independent rate model for Krita's mask Color Smudge strategy.
 * Reference: KDE/krita bd6e8d0, KisColorSmudgeStrategyBase/MaskLegacy.
 * Legacy descriptors keep their existing composition and byte rounding. */
export function colorSmudgeRates(opacity: number, pickup: number, color: number, dulling: boolean) {
  const unit = (n: number): number => Math.max(0, Math.min(1, n))
  return {
    smear: unit(opacity * pickup * (dulling ? .8 : 1)),
    color: unit(color * color * opacity),
  }
}

/** Combined option responses are normalized by their original constant inside
 * brushDynamicValue: clamp(C * response) / C. Keep factors above one here:
 * multiplying C back before the modern square recovers native size-like order.
 * Do not clamp each factor or square C and the response separately. Historical
 * product-only rates use exactly their previous multiplication order.
 */
export function resolveColorSmudgeRate<T>(rate:number,dynamics:readonly T[]|undefined,evaluate:(control:T,index:number)=>number):number {
  return rate * (dynamics ?? []).reduce((value,control,index)=>value*evaluate(control,index),1)
}

/** Foreground-only functional U8 projection of native CFHardMixPhotoshop.
 * Arguments are straight encoded channels; alpha composition stays in the
 * existing modern Color Smudge shell, not this per-channel decision.
 */
export function colorSmudgeHardMixPhotoshop(destination:number,source:number):0|1 {
  const byte=(value:number)=>Math.floor(Math.max(0,Math.min(1,value))*255+.5)
  return byte(source)+byte(destination)>255?1:0
}
