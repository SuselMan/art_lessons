import {expect,it} from 'vitest'
import {canvasMeanCoordinates,canvasMeanRect} from './canvasMeanSampling'

it('keeps native integer radius parity and central pixel rather than a broad saved-percent radius',()=>{
  expect(canvasMeanRect({x:100,y:100},48,48,.0041)).toEqual({minX:99,minY:99,maxX:101,maxY:101})
  expect(canvasMeanRect({x:100,y:100},47,47,.005)).toEqual({minX:100,minY:100,maxX:101,maxY:101})
  expect(canvasMeanRect({x:100,y:100},48,48,0)).toEqual({minX:99,minY:99,maxX:100,maxY:100})
  expect(canvasMeanRect({x:-100,y:-100},48,48,2)).toEqual({minX:-148,minY:-148,maxX:-52,maxY:-52})
})
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
