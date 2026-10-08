import {describe,it,expect} from 'vitest'
import {canonicalTopRowsToGlRows} from './roomTileBridge'
describe('actual Room tile row contract',()=>{
 it('preserves every Q8 byte and hidden alpha-zero color with one orientation change',()=>{
  const a=new Uint8Array([255,3,17,0,11,20,9,32,1,2,3,255,7,8,9,128])
  expect([...canonicalTopRowsToGlRows(a,2,2)]).toEqual([...a.slice(8),...a.slice(0,8)])
  expect(canonicalTopRowsToGlRows(canonicalTopRowsToGlRows(a,2,2),2,2)).toEqual(a)
 })
 it('rejects partial or fractional tiles before changing a layer',()=>{
  expect(()=>canonicalTopRowsToGlRows(new Uint8Array(3),1,1)).toThrow()
  expect(()=>canonicalTopRowsToGlRows(new Uint8Array(4),.5,2)).toThrow()
 })
})
