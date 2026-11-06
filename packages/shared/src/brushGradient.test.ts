import {expect,it} from 'vitest'
import {makeBrushGradient,sampleBrushGradient,isBrushGradient} from './brushGradient'
import {copyBrushSourceContext} from './brushSource'

it('captures straight RGBA and interpolates color independently of alpha',()=>{
 const lut=makeBrushGradient([1,0,0,0],[0,0,1,1]),source=copyBrushSourceContext({version:1,gradient:lut})
 expect(isBrushGradient(lut)).toBe(true)
 expect(sampleBrushGradient(source,0)).toEqual({color:[1,0,0],alpha:0})
 expect(sampleBrushGradient(source,1)).toEqual({color:[0,0,1],alpha:1})
 const midpoint=sampleBrushGradient(source,.5)
 expect(midpoint.color[0]).toBeCloseTo(.5);expect(midpoint.color[2]).toBeCloseTo(.5);expect(midpoint.alpha).toBeCloseTo(.5)
})
it('bounds lookup, rejects invalid resources and never memoizes mutable external data',()=>{
 const source={version:1 as const,gradient:makeBrushGradient([0,0,0,1],[1,1,1,1])}
 expect(sampleBrushGradient(source,-1).color).toEqual([0,0,0])
 source.gradient=makeBrushGradient([1,0,0,1],[1,0,0,1])
 expect(sampleBrushGradient(source,0).color).toEqual([1,0,0])
 expect(()=>sampleBrushGradient(source,NaN)).toThrow()
 expect(()=>sampleBrushGradient({version:1},0)).toThrow()
 expect(()=>makeBrushGradient([2,0,0,1],[0,0,0,1])).toThrow()
})
