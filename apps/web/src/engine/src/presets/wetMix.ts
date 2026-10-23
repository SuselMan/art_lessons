import type { BrushBehavior, Dab } from '@grafetto/shared'
import { brushDabRandom, brushDabSeed } from './digitalBrushPresets'

export interface WetMixState { charge: number }
export interface WetMixStep { load: number; pickup: number; strength: number; blur: number }
const clamp = (n: number): number => Math.max(0, Math.min(1, n))
/** Distance-driven approximation of Brush Studio's charge/exhaustion and pull.
 * Source: https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings
 * It is carried pigment, not a physical fluid simulation or a wall-clock timer. */
export function wetMixStep(wet: NonNullable<BrushBehavior['wetMix']>, state: WetMixState, dab: Dab, travel: number, priming: boolean): WetMixStep {
  const random = (i: number): number => brushDabRandom(brushDabSeed(dab.x,dab.y,dab.pressure),i)
  const water = clamp(wet.dilution + (random(81)*2-1)*wet.wetnessJitter)
  if (priming) state.charge = wet.charge
  else state.charge *= Math.exp(-Math.max(0,travel)*(0.05+wet.grade*1.95))
  return {
    load: priming ? state.charge*(1-water*0.85) : 0,
    pickup: clamp(wet.pull*(0.25+water*0.75)*Math.max(0,travel)),
    strength: clamp((0.1+wet.attack*0.9)*(state.charge+wet.pull*(1-state.charge))*(1-water*0.75)),
    blur: clamp(wet.blur*(1-wet.blurJitter*random(82))),
  }
}
