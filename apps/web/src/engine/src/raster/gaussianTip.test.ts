import { expect,it } from 'vitest'
import { gaussianCoverage,gaussianMaskAlpha } from './gaussianTip'

it('retains the erf radial profile independently of scale and authored diameter',()=>{
  expect(gaussianCoverage(.5,.85)*255).toBeCloseTo(101.54082,4)
  for(const fade of [1e-6,.1,.5,.999999]) {
    let previous=1
    for(let i=0;i<=100;i++) {
      const value=gaussianCoverage(i/100,fade)
      expect(value).toBeLessThanOrEqual(previous+1e-6);previous=value
    }
  }
})
it('uses the actual one-pixel AA fringe and U8 transparency, not a scaled source fringe',()=>{
  expect(gaussianMaskAlpha(5.75,0,12,1e-6,true)).toBe(64)
  expect(gaussianMaskAlpha(5.75,0,12,1e-6,false)).toBe(255)
  expect(gaussianMaskAlpha(0,0,12,1e-6,true)).toBe(255)
  expect(gaussianMaskAlpha(6.1,0,12,1e-6,false)).toBe(0)
})
it('switches the scalar pixel-centre stencil at the native size boundaries',()=>{
  expect(gaussianMaskAlpha(1,0,4,1e-6,true)).toBe(154)
  expect(gaussianMaskAlpha(1.5,0,4,1e-6,true)).toBe(48)
  expect(gaussianMaskAlpha(0,0,.75,1e-6,true)).toBe(20)
  // AA disabled does not supersample, even below a pixel.
  expect(gaussianMaskAlpha(0,0,.75,1e-6,false)).toBe(255)
})
