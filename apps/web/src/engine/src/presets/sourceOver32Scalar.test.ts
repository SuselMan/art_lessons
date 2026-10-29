import { createHash } from 'node:crypto'
import { expect,it } from 'vitest'
import native from './fixtures/sourceOverPortable/scalar-neon-semantic.native.json'
import sse from './fixtures/sourceOverPortable/scalar-sse.native.json'
import { compositeSourceOver32Scalar } from './sourceOver32Scalar'
import { compositePortableF32Over } from './sourceOverPortable'
import type { Rgba8 } from './mixWeightedRgba8'
const rgba=(v:readonly number[]):Rgba8=>[v[0],v[1],v[2],v[3]]
it('matches every unchanged ARM scalar body execution with explicit typed instruction semantic shims',()=>{
 expect(native.cases).toHaveLength(2048)
 for(const c of native.cases)expect(compositeSourceOver32Scalar(rgba(c.src),rgba(c.dst),{profile:'optimized32-neon64-scalar-frecpe-rne-v1',opacity:c.opacity,mask:c.mask<0?undefined:c.mask})).toEqual(c.expected)
})
it('preserves all old portable outputs through the common point evaluator',()=>{
 const residuals:number[]=[]
 const values:Rgba8[]=[]
 for(const [i,c]of sse.cases.entries()){
 const control={opacity:c.opacity,mask:c.mask<0?undefined:c.mask}
 const value=compositeSourceOver32Scalar(rgba(c.src),rgba(c.dst),{...control,profile:'portable-f32-division-rne-v1'})
 expect(value).toEqual(compositePortableF32Over(rgba(c.src),rgba(c.dst),{...control,profile:'portableF32'}))
 values.push(value)
 if(value.some((v,j)=>v!==c.expected[j]))residuals.push(i)
 }
 expect(residuals).toEqual([213,253])
 expect(createHash('sha256').update(JSON.stringify(values)).digest('hex')).toBe('6f0678bc1aab2b0efaf0b69c2a49e12ae26efdd6f16fc6aa8368d964ad00bf56')
})
it('rejects invalid profiles and invisible malformed pixels before evaluation',()=>{
 const p:Rgba8=[0,0,0,0]
 expect(()=>compositeSourceOver32Scalar(p,p,{profile:'unknown' as never,opacity:0})).toThrow()
 expect(()=>compositeSourceOver32Scalar([256,0,0,0],p,{profile:'optimized32-neon64-scalar-frecpe-rne-v1',opacity:0})).toThrow()
})
