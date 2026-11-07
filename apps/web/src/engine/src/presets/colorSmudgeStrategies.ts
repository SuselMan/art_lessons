/** Opt-in strategy references; not renderer admission. Native source:
 * Krita bd6e8d0, KoCompositeOpFunctions + MaskLegacy. Encoded U8 channels,
 * with the native biased half (127). No colour-profile identity claim. */
export type ColorSmudgeForegroundMode = 'grainMerge' | 'grainExtract' | 'negation'
export function colorSmudgeForegroundChannel(mode:ColorSmudgeForegroundMode,source:number,destination:number):number {
  if(!Number.isInteger(source)||source<0||source>255||!Number.isInteger(destination)||destination<0||destination>255)throw new RangeError('Color Smudge requires U8 channels')
  switch(mode){
    case 'grainMerge':return Math.min(255,Math.max(0,destination+source-127))
    case 'grainExtract':return Math.min(255,Math.max(0,destination-source+127))
    case 'negation':return 255-Math.abs(255-source-destination)
    default:throw new RangeError('Unknown Color Smudge foreground mode')
  }
}
/** Inputs are resolved native option values, before legacy compensation.
 * In particular maxPickup is the original maximum, not current sensor pickup.
 * Dulling and smearing both copy the sampled background at full strength. */
export function colorSmudgeLegacyStages(opacity:number,pickup:number,colorRate:number,maxPickup:number){
  for(const value of [opacity,pickup,colorRate,maxPickup])if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('Color Smudge option outside 0..1')
  return{background:1,foreground:Math.min(1,Math.max(1-maxPickup,.2)*colorRate*opacity),final:pickup*opacity}
}
