import{it,expect}from'vitest'
import{CANONICAL_RIBBON_WGSL}from'./deposit'
import{ribbonOctaveFmaShader}from'./ribbonOctaveFma'
it('OFF is original source exactly; ON replaces one octave expression only',()=>{
 expect(ribbonOctaveFmaShader(CANONICAL_RIBBON_WGSL)).toBe(CANONICAL_RIBBON_WGSL)
 expect(ribbonOctaveFmaShader(CANONICAL_RIBBON_WGSL,true)).toBe(CANONICAL_RIBBON_WGSL.replace('wcNoise(p * 2.7 + vec2f(31.4, 17.9))','wcNoise(fma(p, vec2f(2.7), vec2f(31.4, 17.9)))'))
 expect(()=>ribbonOctaveFmaShader('missing',true)).toThrow()
})
