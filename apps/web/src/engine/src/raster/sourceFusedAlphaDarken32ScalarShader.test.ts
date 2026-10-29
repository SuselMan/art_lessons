import tiny from './fixtures/sourceFusedAlphaDarken32Scalar/tiny.native.json'
import {compositeSourceFused32} from '../presets/sourceFused32'
import {expect,it}from'vitest'
import {prepareSourceFusedAlphaDarken32ScalarControls as prepare}from'./sourceFusedAlphaDarken32ScalarShader'
it('aliases the native F32 average before folding hard flow once and preserves folded subnormal components',()=>{
 const raw={opacity:.4,averageOpacity:.400001,flow:.4},q=prepare('hard',raw,0),f=Math.fround
 expect(q.averageAliased).toBe(true);expect(q.values).toEqual([f(f(.4)*f(.4)),f(f(.4)*f(.4)),f(.4),0]);expect(q.selection).toEqual([1,1])
 const tiny=prepare('hard',{opacity:2**-126,averageOpacity:1,flow:.5});expect(tiny.values[0]).toBe(2**-127);expect(tiny.opacityParts).toEqual([0,4194304,-149])
})
it('keeps creamy opacity independent of tiny flow and distinguishes absent selection',()=>{
 const q=prepare('creamy',{opacity:.5,averageOpacity:.8,flow:2**-149});expect(q.values[0]).toBe(.5);expect(q.flowParts).toEqual([0,1,-149]);expect(q.selection).toEqual([0,0])
})
it('rejects invalid controls/variant before GPU upload',()=>{
 expect(()=>prepare('bad'as never,{opacity:1,averageOpacity:1,flow:1})).toThrow();expect(()=>prepare('hard',{opacity:NaN,averageOpacity:1,flow:1})).toThrow();expect(()=>prepare('creamy',{opacity:1,averageOpacity:1,flow:1},.5)).toThrow()
})

it('matches original installed scalar tiny-control outputs, including zero-mask/source and hidden D0 RGB',()=>{
 expect(tiny.cases).toHaveLength(200)
 let creamyTinyFlowRGB=0,hardFoldSubnormal=0
 for(const {input:q,pixels}of tiny.cases){
  const variant=q.op===1?'creamy':'hard',upload=prepare(variant,{opacity:q.opacity,averageOpacity:q.averageOpacity,flow:q.flow},q.mask===null?undefined:q.mask[0])
  const actual=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:variant==='creamy'?'alphaDarkenCreamy':'alphaDarkenHard',source:new Uint8Array(q.src),destination:new Uint8Array(q.dst),mask:q.mask===null?undefined:new Uint8Array(q.mask),cols:1,rows:1,sourceStride:8,destinationStride:8,maskStride:1,sourceAlignment:0,destinationAlignment:0,opacity:q.opacity,averageOpacity:q.averageOpacity,flow:q.flow}).pixels
  expect([...actual]).toEqual(pixels)
  if(variant==='creamy'&&q.opacity>.1&&q.flow>0&&q.flow<2**-126&&actual[0]!==q.dst[0])creamyTinyFlowRGB++
  if(variant==='hard'&&upload.values[0]>0&&upload.values[0]<2**-126)hardFoldSubnormal++
  if(q.dst[3]===0)expect([...actual.slice(0,3)]).toEqual(q.src.slice(0,3))
 }
 expect(creamyTinyFlowRGB).toBeGreaterThan(0);expect(hardFoldSubnormal).toBeGreaterThan(0)
})
