import { describe, expect, it } from 'vitest'
import { RibbonStrokeScratch } from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
describe('readonly production wash spacing provenance',()=>{
 it('second gesture inherits first-water spacing even for a single or smaller pigment dab',()=>{
  // No fields acquired; only the actual production scalar lifecycle is exercised.
  const scratch=new RibbonStrokeScratch({} as ConstructorParameters<typeof RibbonStrokeScratch>[0],true,true)
  scratch.beginStroke();expect(scratch.noteDabSpacing(88)).toBe(88)
  scratch.beginStroke();expect(scratch.noteDabSpacing(0)).toBe(88)
  expect(scratch.noteDabSpacing(15.4)).toBe(88)
 })
})
