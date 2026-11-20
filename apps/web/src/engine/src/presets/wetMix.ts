import type { BrushBehavior, Dab } from '@grafetto/shared'
import { beginBrushBehavior, brushDynamicValue, type BrushBehaviorState } from './brushBehavior'
import { brushDabRandom, brushDabSeed } from './digitalBrushPresets'

export interface WetMixState { charge: number; behavior?: BrushBehaviorState }
export interface WetMixStep { load: number; pickup: number; strength: number; retention: number; blur: number }
const clamp = (n: number): number => Math.max(0, Math.min(1, n))
/** Distance-driven approximation of Brush Studio's charge/exhaustion and pull.
 * Source: https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings
 * It is carried pigment, not a physical fluid simulation or a wall-clock timer. */
export function wetMixStep(wet: NonNullable<BrushBehavior['wetMix']>, state: WetMixState, dab: Dab, travel: number, priming: boolean, logical?: BrushBehaviorState): WetMixStep {
  const random = (i: number): number => brushDabRandom(brushDabSeed(dab.x,dab.y,dab.pressure),i)
  const dynamic=(key:'dilution'|'attack'|'pull'|'blur'):number=>(wet.dynamics?.[key]??[]).reduce((n,d,i)=>n*brushDynamicValue(d,dab,logical??state.behavior??beginBrushBehavior(dab),random(90+i)),wet[key])
  const water = clamp(dynamic('dilution') + (random(81)*2-1)*wet.wetnessJitter)
  const retention=priming ? 1 : Math.exp(-Math.max(0,travel)*0.05)
  if (priming) state.charge = wet.charge
  else state.charge *= retention
  return {
    load: priming ? state.charge*(1-water*0.85) : 0,
    pickup: clamp(dynamic('pull')*(0.25+water*0.75)*Math.max(0,travel)),
    // Charge lives in carried alpha. Applying it to strength again squares it.
    strength: clamp((0.1+dynamic('attack')*0.9)*(1-water*0.75)),
    retention,
    blur: clamp(dynamic('blur')*(1-wet.blurJitter*random(82))),
  }
}
