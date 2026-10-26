import type { BrushBehavior } from '@grafetto/shared'

/** Capture the scalar once, before geometry. Historical profiles deliberately
 * return undefined: replay must keep their original distance/time semantics.
 * The 30ms EMA is Grafetto input smoothing, not a claim of native Qt filtering. */
export function normalizedBrushSpeed(input:{viewSpeed?:number;normalizedSpeed?:number},profile:BrushBehavior['speedInput']):number|undefined {
  if(!profile)return undefined
  const value=input.normalizedSpeed ?? (input.viewSpeed ?? 0)/profile.maximum
  if(!Number.isFinite(value))throw new Error('Non-finite brush speed input')
  return Math.fround(Math.max(0,Math.min(1,value)))
}
