import tiny from './fixtures/sourceFusedOver32Scalar/tiny.native.json'
import {compositeSourceFused32} from '../presets/sourceFused32'
import {expect,it} from 'vitest'
import {prepareSourceFusedOver32ScalarControls as controls} from './sourceFusedOver32ScalarShader'
it('latches one binary32 opacity for both numeric and lossless component carriers',()=>{
 expect(controls(.4)).toEqual({values:[Math.fround(.4),0],hasMask:0,opacityParts:[0,13421773,-25]})
 expect(controls(2**-149,0)).toEqual({values:[2**-149,0],hasMask:1,opacityParts:[0,1,-149]})
 expect(controls(2**-100,255).opacityParts).toEqual([0,8388608,-123])
 expect(controls(2**-150).opacityParts).toEqual([0,0,-149])
 const negative=controls(-0);expect(Object.is(negative.values[0],-0)).toBe(true);expect(negative.opacityParts).toEqual([1,0,-149])
})
it('rejects malformed controls before GPU upload and distinguishes absent/zero selection',()=>{
 for(const bad of [NaN,Infinity,-1,1.001,'0'])expect(()=>controls(bad as number)).toThrow()
 for(const bad of [-1,256,.5,NaN])expect(()=>controls(.5,bad)).toThrow()
 expect(controls(.5).hasMask).toBe(0);expect(controls(.5,0).hasMask).toBe(1)
})

it('checks hiddenRGBA tiny-source branches against independent original installed ISA outputs',()=>{
 expect(tiny.cases).toHaveLength(200)
 let copied=0,unchanged=0
 for(const {input:q,pixels}of tiny.cases){
  const upload=controls(q.opacity,q.mask===null?undefined:q.mask[0])
  const actual=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:'over',source:new Uint8Array(q.src),destination:new Uint8Array(q.dst),mask:q.mask===null?undefined:new Uint8Array(q.mask),cols:1,rows:1,sourceStride:8,destinationStride:8,maskStride:1,sourceAlignment:0,destinationAlignment:0,opacity:upload.values[0],averageOpacity:q.averageOpacity,flow:q.flow}).pixels
  expect([...actual]).toEqual(pixels)
  if(q.dst[3]===0){if(actual[0]===q.src[0])copied++;if(actual[0]===q.dst[0])unchanged++}
 }
 expect(copied).toBeGreaterThan(0);expect(unchanged).toBeGreaterThan(0)
})
