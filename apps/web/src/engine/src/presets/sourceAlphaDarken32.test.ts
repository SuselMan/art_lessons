import { describe,expect,it } from 'vitest'
import fixture from './fixtures/sourceAlphaDarken32/scalar.native.json'
import { compositeSourceAlphaDarken32,type SourceAlphaDarken32Control } from './sourceAlphaDarken32'
import type { Rgba8 } from './mixWeightedRgba8'
const profile='optimized32-scalar-f32-rne-v1' as const
const control=(c:typeof fixture.cases[number]):SourceAlphaDarken32Control=>({profile,variant:c.variant as 'creamy'|'hard',opacity:c.opacity,averageOpacity:c.averageOpacity,flow:c.flow,...(c.mask===-1?{}:{mask:c.mask})})
const pixel=(p:readonly number[])=>p as Rgba8
describe('source optimized32 scalar AlphaDarken, not generic integer or SIMD',()=>{
 it('matches1280 actual unchanged native scalar calls, with source/destination/control inputs retained',()=>{
  expect(fixture.mxcsr).toBe(0x1f80);expect(fixture.cases).toHaveLength(1280)
  for(const [i,c] of fixture.cases.entries()){
   const source=[...c.src],destination=[...c.dst]
   expect(compositeSourceAlphaDarken32(pixel(c.src),pixel(c.dst),control(c)),`native scalar${i}`).toEqual(c.expected)
   expect(c.src).toEqual(source);expect(c.dst).toEqual(destination)
  }
 })
 it('matches each ordered overlap step at constant/falling/rising opacity and flow0/.4/1',()=>{
  expect(fixture.overlaps).toHaveLength(54)
  for(const series of fixture.overlaps){let destination=pixel(series.steps[0]!.dst)
   for(const [i,c] of series.steps.entries()){
    expect(destination,`${series.label} prior${i}`).toEqual(c.dst)
    destination=compositeSourceAlphaDarken32(pixel(c.src),destination,control(c))
    expect(destination,`${series.variant}/${series.label} step${i}`).toEqual(c.expected)
   }
  }
 })
 it('retains scalar transparent-destination hidden RGB even at zero source contribution',()=>{
  const src:Rgba8=[231,17,99,0],dst:Rgba8=[7,111,203,0]
  for(const variant of ['creamy','hard']as const)expect(compositeSourceAlphaDarken32(src,dst,{profile,variant,opacity:0,averageOpacity:0,flow:0})).toEqual([231,17,99,0])
 })
 it('uses native nearest-even RGB ties, without generic round-half-up',()=>{
  for(const [src,expected]of [[1,0],[3,2],[5,2],[7,4]]as const)expect(compositeSourceAlphaDarken32([src,src,src,255],[0,0,0,255],{profile,variant:'creamy',opacity:.5,averageOpacity:.5,flow:1})).toEqual([expected,expected,expected,255])
 })
 it('keeps creamy/hard flow ownership and source alpha separate from per-dab controls',()=>{
  const src:Rgba8=[223,47,109,128],dst:Rgba8=[17,129,243,64],base={profile,opacity:.8,averageOpacity:.9,flow:.4}
  expect(compositeSourceAlphaDarken32(src,dst,{...base,variant:'creamy'})).not.toEqual(compositeSourceAlphaDarken32(src,dst,{...base,variant:'hard'}))
  expect(compositeSourceAlphaDarken32(src,dst,{...base,variant:'creamy',flow:1})).not.toEqual(compositeSourceAlphaDarken32(src,dst,{...base,variant:'creamy'}))
 })
 it('distinguishes absent selection from a supplied byte and never normalizes coverage in place',()=>{
  const c=fixture.cases.find(c=>c.mask===0&&c.src[3]>0&&c.dst[3]>0)!
  expect(compositeSourceAlphaDarken32(pixel(c.src),pixel(c.dst),control(c))).toEqual(c.expected)
  expect(compositeSourceAlphaDarken32(pixel(c.src),pixel(c.dst),{...control(c),mask:undefined})).not.toEqual(c.expected)
  expect(fixture.cases.some(c=>c.mask===255)).toBe(true)
 })
 it('rejects malformed pixels, unknown profile/variant and nonfinite or out-of-range controls',()=>{
  const src:Rgba8=[1,2,3,4],dst:Rgba8=[4,3,2,1],base:SourceAlphaDarken32Control={profile,variant:'creamy',opacity:1,averageOpacity:1,flow:1}
  for(const key of ['opacity','averageOpacity','flow']as const)for(const value of [NaN,Infinity,-1,1.0001])expect(()=>compositeSourceAlphaDarken32(src,dst,{...base,[key]:value})).toThrow()
  for(const mask of [-1,.5,256,NaN])expect(()=>compositeSourceAlphaDarken32(src,dst,{...base,mask})).toThrow()
  expect(()=>compositeSourceAlphaDarken32(src,dst,{...base,profile:'auto' as typeof profile})).toThrow()
  expect(()=>compositeSourceAlphaDarken32(src,dst,{...base,variant:'default' as 'creamy'})).toThrow()
  expect(()=>compositeSourceAlphaDarken32([0,0,0,256],dst,base)).toThrow()
 })
})
