import {describe,it,expect} from 'vitest'
import {WC_DIFFUSE_FRAG,WC_WATER_FRONT_FRAG} from './shaders'
import {WC_STATIC_DIFFUSE_FRAG,WC_STATIC_FRONT_FRAG,WC_STATIC_PAPER_PREP_FRAG} from './staticPaperCache'
describe('diagnostic static paper shader derivation',()=>{
 it('substitutes height in both original operators without retaining paper sampling',()=>{
  for(const shader of [WC_STATIC_DIFFUSE_FRAG,WC_STATIC_FRONT_FRAG]){
   expect(shader).toContain('return texture2D(u_staticPaper, px / u_resolution).r;')
   expect(shader).not.toContain('return texture2D(u_paperHeightMap, paperUV).r;')
  }
  expect(WC_DIFFUSE_FRAG).toContain('return texture2D(u_paperHeightMap, paperUV).r;')
  expect(WC_WATER_FRONT_FRAG).toContain('return texture2D(u_paperHeightMap, paperUV).r;')
 })
 it('prepares the original front height and climb expressions and reads cached climb',()=>{
  expect(WC_STATIC_PAPER_PREP_FRAG).toContain('float hj=wcFrontHeightAt(px)')
  expect(WC_STATIC_PAPER_PREP_FRAG).toContain('float climb = u_climb * (1.0 + WC_FRONT_FEATHER')
  expect(WC_STATIC_FRONT_FRAG).toContain('float climb = texture2D(u_staticPaper, v_uv).g;')
  expect(WC_STATIC_FRONT_FRAG).not.toContain('float climb = u_climb *')
 })
})
