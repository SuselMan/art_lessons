import {describe,expect,it} from 'vitest'
import {bristleSaturationProfileBytes} from './bristleSaturationProfile.js'
import type {BrushBristleInk} from './brushBristle.js'
const profile:BrushBristleInk={depletion:[0,.5,1],useOpacity:true,useSaturation:true,useWeights:false,pressureWeight:.25,bristleLengthWeight:.5,bristleInkAmountWeight:1,inkDepletionWeight:100}
describe('immutable Bristle compiler profile bytes',()=>{
 it('has an explicit versioned little-endian layout',()=>{
  const bytes=bristleSaturationProfileBytes(profile),v=new DataView(bytes.buffer)
  expect(Array.from(bytes.slice(0,4))).toEqual([66,82,80,49])
  expect([v.getUint32(4,true),v.getUint32(8,true),v.getUint32(12,true)]).toEqual([1,3,3])
  expect([16,24,32,40].map(at=>v.getFloat64(at,true))).toEqual([.25,.5,1,100])
  expect([48,52,56].map(at=>v.getFloat32(at,true))).toEqual([0,.5,1])
  expect(bytes.byteLength).toBe(60)
 })
 it('preserves weight changes that float32 would erase',()=>{
  const weight=.25+2**-40
  expect(Math.fround(weight)).toBe(.25)
  expect(bristleSaturationProfileBytes({...profile,pressureWeight:weight})).not.toEqual(bristleSaturationProfileBytes(profile))
 })
 it('canonicalizes only depletion to the renderer float32 profile',()=>{
  expect(bristleSaturationProfileBytes({...profile,depletion:[0,.5+2**-40,1]})).toEqual(bristleSaturationProfileBytes(profile))
  for(const key of ['useOpacity','useSaturation','useWeights'] as const)
   expect(bristleSaturationProfileBytes({...profile,[key]:!profile[key]})).not.toEqual(bristleSaturationProfileBytes(profile))
 })
 it('returns owned bytes without retaining mutable caller arrays',()=>{
  const depletion=[0,.5,1],a=bristleSaturationProfileBytes({...profile,depletion})
  depletion[1]=1
  expect(new DataView(a.buffer).getFloat32(52,true)).toBe(.5)
  a.fill(0)
  expect(bristleSaturationProfileBytes(profile)[0]).toBe(66)
 })
 it('rejects invalid input and bounds the maximum allocation',()=>{
  for(const depletion of [[],[NaN],[Infinity],[-1],[2],Array(65537).fill(0)])
   expect(()=>bristleSaturationProfileBytes({...profile,depletion})).toThrow(RangeError)
  expect(()=>bristleSaturationProfileBytes({...profile,pressureWeight:NaN})).toThrow(RangeError)
  expect(bristleSaturationProfileBytes({...profile,depletion:Array(65536).fill(.5)}).byteLength).toBe(262192)
 })
})
