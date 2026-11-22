import{expect,it}from'vitest'
import{alignPixelMask}from'./pixelAlignment'
it('aligns the transformed hotspot rather than rounding the centre',()=>{
 const a=alignPixelMask(10.2,-1.2,10,0,.5,{width:1,height:.5});expect(a.x).toBeCloseTo(10.1,12);expect(a.y).toBeCloseTo(-1.35,12)
 const rotated=alignPixelMask(10.2,-1.2,10,Math.PI/2,.5,{width:1,height:.5});expect(rotated.x).toBeCloseTo(10.35,12);expect(rotated.y).toBeCloseTo(-1.1,12)
 expect(alignPixelMask(0,0,1,0,1,{width:1,height:1})).toEqual({x:-.5,y:-.5})
})
