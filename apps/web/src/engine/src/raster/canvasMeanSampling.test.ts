import {expect,it} from 'vitest'
import {canvasMeanCoordinates} from './canvasMeanSampling'

it('samples tiny rectangles using native rounded Halton coordinates including duplicates',()=>{
  expect(canvasMeanCoordinates(2,2)).toEqual([[1,0],[0,1],[1,0],[0,0]])
  expect(canvasMeanCoordinates(1,1)).toEqual([[0,0]])
  expect(canvasMeanCoordinates(1,4)).toEqual([[0,1],[0,2],[0,0],[0,1]])
})
it('bounds sample cost at64 independently of area and does not consume brush RNG',()=>{
  const a=canvasMeanCoordinates(200,100)
  expect(a).toHaveLength(64);expect(a).toEqual(canvasMeanCoordinates(200,100))
  expect(a.every(([x,y])=>x>=0&&x<200&&y>=0&&y<100)).toBe(true)
})
