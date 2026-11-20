import {expect,it} from 'vitest'
import {makeBrushGradient} from '@grafetto/shared'
import {bindBrushGradient,brushTextureResourceKey,type BrushPreparationResource} from './BrushPreparation'

it('binds palette-specific derivatives without changing ordinary texture keys',()=>{
 const ordinary:BrushPreparationResource={painter:'wet',id:'asset:0123456789abcdef',grain:false}
 const gradient:BrushPreparationResource={...ordinary,colorPlanes:['gray','gray','gray'],gradientMap:true}
 const a=makeBrushGradient([0,0,0,1],[1,1,1,1]),b=makeBrushGradient([1,0,0,1],[0,0,1,0])
 expect(()=>bindBrushGradient([gradient],undefined)).toThrow()
 const bound=bindBrushGradient([ordinary,gradient],a)
 expect(bound[0]).toBe(ordinary)
 expect(brushTextureResourceKey(bound[0])).toBe(brushTextureResourceKey(ordinary))
 expect(brushTextureResourceKey(bound[1])).not.toBe(brushTextureResourceKey(bindBrushGradient([gradient],b)[0]))
 expect(bound[1].colorPlanes).toBe(gradient.colorPlanes)
})
