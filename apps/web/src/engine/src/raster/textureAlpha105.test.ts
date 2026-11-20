import {expect,it} from 'vitest'
import {textureAlphaApplicationCode,textureAlphaExtended,TEXTURE_ALPHA_EXTENDED_GLSL} from './textureAlphaModes'
import {createBrushStampFragment,BRUSH_TEXTURE_APPLICATION_GLSL} from './brushBehaviorShaders'
import {wetTransferFragment,colorSmudgeTextureFragment} from './wetMixShaders'
const modes=['colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'] as const
it('appends codes7..10 without moving any existing texture application',()=>{
 for(const[i,m]of ['multiply','subtract','darken','overlay','linearDodge','linearBurn',...modes].entries())expect(textureAlphaApplicationCode(m)).toBe(i+1)
 for(const m of modes)for(const soft of[false,true])for(const t of[0,.25,1])for(const q of[0,.25,1])expect(textureAlphaExtended(m,0,t,q,soft)).toBe(0)
})
it('keeps native alpha singular endpoints and soft strength roles including PS second union',()=>{
 expect(textureAlphaExtended('colorDodge',0,1,1,false)).toBe(0)
 expect(textureAlphaExtended('colorDodge',.5,1,1,false)).toBe(1)
 expect(textureAlphaExtended('colorBurn',1,0,1,false)).toBe(1)
 expect(textureAlphaExtended('colorBurn',.5,0,1,false)).toBe(0)
 expect(textureAlphaExtended('hardMixPhotoshop',.75,.5,.5,true)).toBe(.875)
 expect(textureAlphaExtended('hardMixPhotoshop',.5,.5,1,true)).toBe(0)
 expect(textureAlphaExtended('hardMixSofterPhotoshop',.75,1,0,true)).toBe(.25)
 for(const a of[0,.125,.75,1])for(const t of[0,.5,1]){
  for(const m of ['colorDodge','colorBurn','hardMixPhotoshop'] as const)expect(textureAlphaExtended(m,a,t,0,true)).toBeCloseTo(a,14)
  for(const m of modes)expect(textureAlphaExtended(m,a,t,0,false)).toBe(0)
 }
})
it('uses the same actual Pixel and modern MASK helper, without changing legacy program inputs or samplers',()=>{
 const pixel=createBrushStampFragment(true,true,true,true),wet=colorSmudgeTextureFragment(),legacy=wetTransferFragment(true,true,true,true)
 expect(pixel).toContain(TEXTURE_ALPHA_EXTENDED_GLSL);expect(wet).toContain(TEXTURE_ALPHA_EXTENDED_GLSL)
 expect(createBrushStampFragment()).not.toContain(TEXTURE_ALPHA_EXTENDED_GLSL);expect(legacy).not.toContain(TEXTURE_ALPHA_EXTENDED_GLSL)
 expect(TEXTURE_ALPHA_EXTENDED_GLSL).not.toMatch(/sampler|uniform|texture2D/)
 expect(TEXTURE_ALPHA_EXTENDED_GLSL.indexOf('if(mode>6.5)')).toBeLessThan(TEXTURE_ALPHA_EXTENDED_GLSL.indexOf('if(mode<5.5'))
 expect(TEXTURE_ALPHA_EXTENDED_GLSL).toContain('(x+a>1.0?1.0:0.0)*(a+s-a*s)')
 expect(TEXTURE_ALPHA_EXTENDED_GLSL).toContain('soft?3.0*a-2.0*(1.0-t*s)')
 const replacement=TEXTURE_ALPHA_EXTENDED_GLSL+BRUSH_TEXTURE_APPLICATION_GLSL.replace(' if(application.x<1.5)',' if(application.x>2.5)return brushTextureAlphaExtended(a,t,s,application);\n if(application.x<1.5)')
 expect(wet.replace(replacement,BRUSH_TEXTURE_APPLICATION_GLSL)).toBe(legacy)
})
