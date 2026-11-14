import{expect,it}from'vitest'
import{textureAlphaApplicationCode,textureAlphaExtended,TEXTURE_ALPHA_EXTENDED_GLSL}from'./textureAlphaModes'
// Independent numeric examples of pinned KisMaskingBrushCompositeOp Height
// laws (contract41bef33e; values are continuous normalized counterparts, not
// an assertion that U8 staging on every platform is byte-identical).
it('executes all four distinct native Height laws, with hard/soft strength roles',()=>{
 const vectors=[
  ['height',.5,.25,.5,false,.2350990099009901],
  ['height',.5,.25,.5,true,.8663490099009901],
  ['linearHeight',.5,.25,.5,false,.3638242574257426],
  ['linearHeight',.5,.25,.5,true,.8675742574257426],
  ['heightPhotoshop',.1,.15,.2,false,.05],
  ['heightPhotoshop',.1,.15,.2,true,.25],
  ['linearHeightPhotoshop',.1,.15,.2,false,.17],
  ['linearHeightPhotoshop',.1,.15,.2,true,.2716],
 ]as const
 for(const[m,a,t,s,soft,expected]of vectors)expect(textureAlphaExtended(m,a,t,s,soft)).toBeCloseTo(expected,12)
 expect(vectors.slice(0,4).map(([m])=>textureAlphaApplicationCode(m))).toEqual([11,11,12,12])
 expect(textureAlphaApplicationCode('heightPhotoshop')).toBe(13)
 expect(textureAlphaApplicationCode('linearHeightPhotoshop')).toBe(14)
 // Native hard Height strength0 is not an early-return/no-texture identity.
 expect(textureAlphaExtended('height',.75,.1,0,false)).toBe(0)
 expect(textureAlphaExtended('height',.75,.1,0,true)).toBe(.75)
 expect(textureAlphaExtended('heightPhotoshop',.75,.1,0,false)).toBe(0)
 expect(textureAlphaExtended('heightPhotoshop',.75,.1,0,true)).toBe(.75)
 expect(TEXTURE_ALPHA_EXTENDED_GLSL).toContain('mode>10.5')
})

import{createBrushStampFragment}from'./brushBehaviorShaders'
it('composes TIP and texture gradient with one shared current-gradient sampler only under the explicit191 feature',()=>{
 expect(()=>createBrushStampFragment(true,true,true,true,true,false,true)).toThrow()
 const shader=createBrushStampFragment(true,true,true,true,true,false,true,true)
 expect(shader.match(/uniform sampler2D u_gradientPalette;/g)).toHaveLength(1)
 expect(shader).toContain('u_textureMaterial');expect(shader).toContain('brushFilteredGradient')
})
