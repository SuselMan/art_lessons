import {createHash} from 'node:crypto'
import {WET_TRANSFER_FRAG} from './wetMixShaders'
import {expect,it} from 'vitest'
import {BRUSH_TEXTURE_APPLICATION_GLSL,createBrushStampFragment} from './brushBehaviorShaders'
import {TEXTURE_ALPHA_EXTENDED_GLSL} from './textureAlphaModes'
it('integrates the exact alpha operator into actual primary and child shader paths without another sampler',()=>{
 expect(BRUSH_TEXTURE_APPLICATION_GLSL).not.toContain(TEXTURE_ALPHA_EXTENDED_GLSL)
 expect(createBrushStampFragment(true,true,true)).not.toContain('float brushTextureAlphaExtended(')
 const source=createBrushStampFragment(true,true,true,true)
 expect(source).toContain('if(application.x>2.5)return brushTextureAlphaExtended(a,t,s,application);')
 expect(source.match(/float brushTextureAlphaExtended\(/g)).toHaveLength(1)
 expect(source).toContain('secondary=brushTextureAlpha(secondary,brushTextureGrid(u_dualTexture')
 expect(source).toContain('shape=brushTextureAlpha(shape,brushTextureGrid(u_texture')
 expect(TEXTURE_ALPHA_EXTENDED_GLSL).not.toMatch(/uniform|sampler2D|texture2D/)
})
it('preserves the historical multiply and subtract branch bodies',()=>{
 expect(BRUSH_TEXTURE_APPLICATION_GLSL).toContain('if(application.x<1.5) return application.y>0.5 ? a*(1.0-s+s*t) : a*t*s;')
 expect(BRUSH_TEXTURE_APPLICATION_GLSL).toContain('return application.y>0.5 ? max(0.0,a-t*s) : max(0.0,a-t-(1.0-s));')
})

it('keeps default and wet compiler inputs free of the extended private effects capability',()=>{
 expect(createBrushStampFragment()).not.toContain('float brushTextureAlphaExtended(')
 expect(WET_TRANSFER_FRAG).not.toContain('float brushTextureAlphaExtended(')
 expect(createHash('sha256').update(WET_TRANSFER_FRAG).digest('hex')).toBe('8e2762ab38881dc6d04c06ef53cc4edf1c7723ea2be6b0962fe574f758c36de6')
})
