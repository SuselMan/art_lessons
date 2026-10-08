import {describe,it,expect} from 'vitest'
import {validateBrush14Chronology} from './brush14Chain'
import chronology from './brush14Chronology.fixture.json'
describe('actual brush contact chronology',()=>{
 it('uses original fourteen paired contacts without uploads/other passes',()=>{
  expect(validateBrush14Chronology()).toMatchObject({ops:[68,81],contacts:14,flowUploadsWithinChain:0})
  for(const op of chronology.ops){const [c,p,copyP,copyC]=op.events as any[]
   expect(c[5].buffer).toBe(c[10].buffer);expect(p[5].buffer).toBe(p[7].buffer)
   expect(c[7].buffer).toBe(p[7].buffer);expect(c[10].buffer).toBe(p[10].buffer)
   expect(copyP[1].buffer).toBe(p[6].buffer);expect(copyP[2].buffer).toBe(p[5].buffer)
   expect(copyC[1].buffer).toBe(c[6].buffer);expect(copyC[2].buffer).toBe(c[5].buffer)
  }
 })
})
