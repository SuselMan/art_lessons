import { expect, it } from 'vitest'
import { morphProgress } from './morph-clock'
it('moves visibly in the first second and keeps the original drying endpoint',()=>{
 for(const duration of [24000,120000]){
  expect(morphProgress(0,duration)).toBe(0)
  expect(morphProgress(duration,duration)).toBe(1)
  expect(morphProgress(1000,duration)).toBeGreaterThan(10*1000/duration)
  let previous=0
  for(let t=0;t<=duration;t+=100){const p=morphProgress(t,duration);expect(p).toBeGreaterThanOrEqual(previous);expect(p).toBeLessThanOrEqual(1);previous=p}
  const early=morphProgress(1000,duration),late=morphProgress(duration-1000,duration)
  expect(early).toBeGreaterThan(1-late)
 }
})
