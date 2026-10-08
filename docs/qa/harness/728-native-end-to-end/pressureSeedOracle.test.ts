import {describe,it,expect} from 'vitest'
import {reconstructPressureCoverage,runPressureSeedOracle} from './pressureSeedOracle'
describe('captured pressure input guards',()=>{
 it('copies the actual bottom-up rectangle exactly into cleared world-top field',()=>{
  const source=new Uint8Array(1024*1024*4);source.set([17,243,1,255],40*1024*4);source.set([3,4,5,6],(40*1024+969)*4);const out=reconstructPressureCoverage(source,[0,158,0,710,969,826]);expect(Array.from(out.subarray(0,4))).toEqual([17,243,1,255]);expect(Array.from(out.subarray(969*4,970*4))).toEqual([0,0,0,0]);expect(out.slice(826*1536*4).some(Boolean)).toBe(false)
  expect(()=>reconstructPressureCoverage(source,[0,158,0,710,969,827])).toThrow('bound')
 })
 it('rejects absent producer identity before requesting any GPU/context',async()=>{
  await expect(runPressureSeedOracle({producerCode:'wrong'} as never)).rejects.toThrow('passport')
 })
})
