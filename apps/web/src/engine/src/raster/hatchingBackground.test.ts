import {expect,it} from 'vitest'
import {HATCHING_BACKGROUND_GLSL,hatchingBackgroundRequest,hatchingLineUnion,type HatchingRgba} from './hatchingBackground'
const red:HatchingRgba=[1,0,0,1],blue:HatchingRgba=[0,0,1,1]
it('requires an explicit background and retains its custom colour between hatch lines',()=>{
 expect(hatchingBackgroundRequest(red,[.2,.4,.6,1],0,1,1)).toEqual([.2,.4,.6,1])
 expect(hatchingBackgroundRequest(red,blue,1,1,1)).toEqual(red)
 // No opaque-white fallback when no colour was captured.
 expect(()=>Reflect.apply(hatchingBackgroundRequest,undefined,[red,undefined,0,1,1])).toThrow('Explicit hatching RGBA')
})
it('composes straight partial-alpha colours before one mask/request-opacity multiplication',()=>{
 const result=hatchingBackgroundRequest([1,0,0,.5],[0,0,1,.25],.5,.5,.4)
 // Independent source-over: lineA=1/4, remaining backgroundA=3/16,
 // requestA=7/16. Final mask/opacity=1/5, not a second composition alpha.
 const expected=[1/20,0,3/80,7/80]
 result.forEach((value,i)=>expect(value).toBeCloseTo(expected[i],14))
})
it('transparent background does not inject hidden RGB or force opaque gaps',()=>{
 expect(hatchingBackgroundRequest(red,[.7,.3,.9,0],0,1,1)).toEqual([0,0,0,0])
 expect(hatchingBackgroundRequest(red,[.7,.3,.9,0],.5,1,1)).toEqual([.5,0,0,.5])
 expect(hatchingBackgroundRequest([1,0,0,0],blue,1,1,1)).toEqual(blue)
})
it('combines crosshatch coverage within one request, leaving background and opacity single',()=>{
 const union=hatchingLineUnion(.5,.25,.5)
 expect(union).toBe(.8125)
 expect(hatchingBackgroundRequest(red,blue,union,.5,.5)).toEqual([.203125,0,.046875,.25])
 expect(hatchingLineUnion(0,0,0)).toBe(0)
 expect(hatchingLineUnion(.5,1,.25)).toBe(1)
})
it('masks shape edges and applies request opacity once even to opaque background',()=>{
 expect(hatchingBackgroundRequest(red,blue,0,.5,.5)).toEqual([0,0,.25,.25])
 for(const coverage of [0,.3,1]){
  expect(hatchingBackgroundRequest(red,blue,coverage,0,1)).toEqual([0,0,0,0])
  expect(hatchingBackgroundRequest(red,blue,coverage,1,0)).toEqual([0,0,0,0])
 }
})
it('rejects missing/nonfinite/out-of-range input without a silent colour or alpha substitute',()=>{
 for(const value of [-.1,1.1,NaN,Infinity]){
  expect(()=>hatchingBackgroundRequest(red,blue,value,1,1)).toThrow(RangeError)
  expect(()=>hatchingBackgroundRequest(red,blue,1,value,1)).toThrow(RangeError)
  expect(()=>hatchingBackgroundRequest(red,[0,0,1,value],1,1,1)).toThrow(RangeError)
 }
})
it('keeps the future GLSL interface resource-free and its final multiplication outside composition',()=>{
 expect(HATCHING_BACKGROUND_GLSL).toContain('float sourceAlpha=line.a*lineCoverage;')
 expect(HATCHING_BACKGROUND_GLSL).toContain('float backgroundAlpha=background.a*(1.0-sourceAlpha);')
 expect(HATCHING_BACKGROUND_GLSL).toContain('line.rgb*sourceAlpha+background.rgb*backgroundAlpha,sourceAlpha+backgroundAlpha')
 expect(HATCHING_BACKGROUND_GLSL).toContain('return request*(shape*requestOpacity);')
 expect(HATCHING_BACKGROUND_GLSL).not.toMatch(/uniform|sampler|texture2D/)
})

import {captureHatchingBackground,hatchingBackgroundUniform,DEFAULT_HATCHING_BACKGROUND} from './hatchingBackground'
import {copyBrushSourceContext,brushSourceKey,makeBrushGradient} from '@grafetto/shared'
it('captures explicit Grafetto white default and copies custom source independently of future setter mutation',()=>{
 expect(captureHatchingBackground()).toEqual([255,255,255,255])
 expect(Object.isFrozen(DEFAULT_HATCHING_BACKGROUND)).toBe(true)
 const custom:[number,number,number,number]=[16,80,200,128],captured=captureHatchingBackground(custom)
 custom[0]=255;expect(captured).toEqual([16,80,200,128]);expect(Object.isFrozen(captured)).toBe(true)
 expect(()=>captureHatchingBackground([0,0,0,.5])).toThrow('RGBA8')
})
it('binds only recorded background and distinguishes compound gradient/projection context integrity',()=>{
 const first=copyBrushSourceContext({version:1,background:[16,80,200,128],gradient:makeBrushGradient([1,0,0,1],[0,0,1,1]),projection:[{id:'lower',opacity:.5}]})
 const restored=copyBrushSourceContext(JSON.parse(JSON.stringify(first)))
 expect(brushSourceKey(restored)).toBe(brushSourceKey(first))
 expect(hatchingBackgroundUniform({opaqueBackground:true},restored)).toEqual([16/255,80/255,200/255,128/255])
 expect(hatchingBackgroundUniform({},restored)).toEqual([0,0,0,-1])
 expect(()=>hatchingBackgroundUniform({opaqueBackground:true})).toThrow('captured background')
 expect(brushSourceKey(copyBrushSourceContext({...first,background:[17,80,200,128]}))).not.toBe(brushSourceKey(first))
})
