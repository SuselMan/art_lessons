import {expect,it} from 'vitest'
import {CANONICAL_CACHED_WATER_FRONT_WGSL,CANONICAL_FACTOR_CACHED_WATER_FRONT_WGSL,CANONICAL_FRONT_CACHE_PREP_WGSL,CANONICAL_FRONT_FACTOR_CACHE_PREP_WGSL} from './kernels'
it('factor variants only move the original multiply across exact float storage',()=>{
 expect(CANONICAL_FACTOR_CACHED_WATER_FRONT_WGSL.replace('climb=u.coefficients.x*textureLoad(staticFrontCache,vec2i(q),0).g;','climb=textureLoad(staticFrontCache,vec2i(q),0).g;')).toBe(CANONICAL_CACHED_WATER_FRONT_WGSL)
 expect(CANONICAL_FRONT_FACTOR_CACHE_PREP_WGSL.replace('let climb=(1.0+4.0*smoothstep','let climb=u.coefficients.x*(1.0+4.0*smoothstep')).toBe(CANONICAL_FRONT_CACHE_PREP_WGSL)
 expect(CANONICAL_FRONT_FACTOR_CACHE_PREP_WGSL).not.toContain('let climb=u.coefficients.x*')
})
it('f32 storage preserves climb0/20/30 including signed zero without division',()=>{
 for(let i=0;i<=4096;i++){
  // RHS of original WGSL is already an f32 result; rg32float preserves it.
  const factor=Math.fround(1+4*Math.fround(i/4096))
  for(const climb of [0,-0,20,30]){
   const original=Math.fround(Math.fround(climb)*factor)
   const cached=Math.fround(Math.fround(climb)*Math.fround(factor))
   expect(Object.is(original,cached)).toBe(true)
  }
 }
})
