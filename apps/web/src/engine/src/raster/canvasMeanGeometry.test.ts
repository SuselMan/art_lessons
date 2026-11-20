import {expect,it} from 'vitest'
import {canvasMeanDabRect,canvasMeanPlacedCenter,canvasMeanSourceRect} from './canvasMeanGeometry'

it('preserves subpixel phase and actual half-pixel placed centres for even/odd and pressure-sized masks',()=>{
 expect(canvasMeanDabRect(40,64,48,48)).toEqual({minX:16,minY:40,maxX:64,maxY:88})
 const fractional=canvasMeanDabRect(40.25,64.25,48,48)
 expect(fractional).toEqual({minX:16,minY:40,maxX:65,maxY:89})
 expect(canvasMeanPlacedCenter(fractional)).toEqual({x:40.5,y:64.5})
 expect(canvasMeanDabRect(40,64,47,47)).toEqual({minX:16,minY:40,maxX:64,maxY:88})
 const current=canvasMeanDabRect(80.25,64.25,48,48)
 expect(canvasMeanSourceRect(canvasMeanPlacedCenter(fractional),current,.0041)).toEqual({minX:40,minY:64,maxX:41,maxY:65})
 expect(canvasMeanSourceRect({x:40,y:64},canvasMeanDabRect(80,64,47,47),.0041)).toEqual({minX:39,minY:63,maxX:41,maxY:65})
})
it('handles signed integer centres and half-away translation rather than JavaScript rounding',()=>{
 expect(canvasMeanSourceRect({x:-40,y:-64},canvasMeanDabRect(-80,-64,48,48),0)).toEqual({minX:-40,minY:-64,maxX:-39,maxY:-63})
 const current=canvasMeanDabRect(80.25,64.25,48,48)
 expect(canvasMeanSourceRect({x:40,y:64},current,0)).toEqual({minX:39,minY:63,maxX:40,maxY:64})
})
it('keeps world/tile phase independent of tile origins and repairs near-integer mask dimensions',()=>{
 const base=canvasMeanDabRect(255.25,255.25,48,48)
 const shifted=canvasMeanDabRect(511.25,511.25,48,48)
 expect(shifted).toEqual(Object.fromEntries(Object.entries(base).map(([k,v])=>[k,v+256])))
 expect(canvasMeanDabRect(40,64,48+1e-8,48+1e-8)).toEqual({minX:15,minY:39,maxX:64,maxY:88})
})
