import {expect,it} from 'vitest'
import {CANONICAL_WATER_FRONT_WGSL} from './kernels'
import {frontSamplingShader} from './frontSampling'
it('keeps default bytes and changes only input sampling calls',()=>{
 expect(frontSamplingShader(CANONICAL_WATER_FRONT_WGSL)).toBe(CANONICAL_WATER_FRONT_WGSL)
 for(const kind of ['manual','hardware'] as const){
 const s=frontSamplingShader(CANONICAL_WATER_FRONT_WGSL,kind)
 expect(s).toContain('sourceAt(input,uv,u.wet.z)')
 expect(s).toContain('sourceAt(input,uvj,u.wet.z)')
 expect(s).toContain('let hj=heightAt(px);')
 expect(s).toContain('textureStore(output,vec2i(q),')
 expect(s.includes('@binding(8)')).toBe(kind==='hardware')
 }
})
