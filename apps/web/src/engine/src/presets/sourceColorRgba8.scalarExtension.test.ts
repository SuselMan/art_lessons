import {it,expect} from 'vitest'
import {compositeRgba8,sourceRgba8SeparableChannel as channel,sourceRgba8CompositeModeId,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1} from '../raster/sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL as es3} from '../raster/sourceRgba8CompositeShader'
const modes=['gammaDark', 'gammaLight', 'gammaIllumination', 'easyDodge', 'easyBurn', 'pNormA', 'pNormB', 'superLight', 'softLightIfs', 'softLightPegtop', 'tintIfs', 'shadeIfs', 'fogLightenIfs', 'fogDarkenIfs', 'modulo', 'moduloContinuous', 'divisiveModulo', 'divisiveModuloContinuous', 'moduloShift', 'moduloShiftContinuous', 'hardOverlay', 'interpolation', 'interpolation2x'] as const
it('appends scalar23 IDs92..114 with actual ES1 and ES3 implementations',()=>{
 for(const [i,mode]of modes.entries()){
  expect(sourceRgba8CompositeModeId(mode)).toBe(92+i)
  for(const body of [es1,es3])expect(body).toMatch(new RegExp('mode\\s*==\\s*'+(92+i)+'(?:u|\\.0)'))
 }
})
const known=[['gammaDark',255,64,64],['gammaDark',0,255,255],['gammaDark',0,1,0],['gammaLight',0,1,255],['gammaLight',0,0,0],['gammaIllumination',255,254,255],['easyDodge',255,0,255],['easyBurn',255,0,0],['easyBurn',255,255,255],['pNormA',1,1,1],['pNormB',1,1,1],['pNormA',255,255,255],['superLight',0,128,0],['superLight',255,128,255],['softLightIfs',0,64,16],['softLightIfs',255,64,128],['softLightPegtop',0,64,16],['softLightPegtop',255,64,112],['tintIfs',0,64,128],['shadeIfs',0,64,0],['fogLightenIfs',0,64,64],['fogDarkenIfs',255,64,64],['hardOverlay',255,0,0],['hardOverlay',127,255,254],['hardOverlay',128,255,255],['interpolation',0,0,0],['interpolation',255,255,255],['interpolation2x',0,0,0],['interpolation2x',255,255,255]] as const
it('retains native endpoint ordering, staging, hardOverlay half127 and truncating raw-byte PNorm',()=>{for(const [mode,s,d,expected]of known)expect({mode,s,d,value:channel(mode,s,d)}).toEqual({mode,s,d,value:expected})})
it('defines rational modulo endpoints without pretending GPU double epsilon',()=>{
 for(const [s,d]of [[0,0],[0,255],[255,0],[255,255],[127,128],[1,254]]as const){expect(channel('modulo',s,d)).toBe(d%(s+1))}
 expect(channel('moduloShift',127,128)).toBe(255);expect(channel('moduloShift',255,255)).toBe(255)
 expect(channel('moduloShift',255,0)).toBe(0);expect(channel('moduloShiftContinuous',255,0)).toBe(255)
 expect(channel('moduloShiftContinuous',255,255)).toBe(0)
 expect(channel('divisiveModulo',0,255)).toBe(255);expect(channel('divisiveModuloContinuous',0,255)).toBe(0)
 expect(channel('divisiveModulo',64,128)).toBe(255);expect(channel('divisiveModuloContinuous',64,128)).toBe(0)
 expect(channel('divisiveModuloContinuous',64,192)).toBe(255)
 expect(channel('divisiveModuloContinuous',2,3)).toBe(128) // half complement is Q(1,2)=128, not255-Q(1,2)=127
 expect(channel('moduloContinuous',64,192)).toBe(64)
})
it('all23 reuse existing GenericSC alpha/opacity controls',()=>{
 for(const mode of modes){
  expect(compositeRgba8([1,254,127,255],[40,180,90,160],{mode,profile,opacity:0})).toEqual([40,180,90,160])
  expect(compositeRgba8([1,254,127,0],[40,180,90,160],{mode,profile,opacity:1})).toEqual([40,180,90,160])
  expect(compositeRgba8([1,254,127,255],[40,180,90,0],{mode,profile,opacity:1,mask:128})).toEqual([1,254,127,128])
 }
})
it('integer hardOverlay preserves independently reduced half-mask and partial-alpha controls',()=>{
 expect(compositeRgba8([127,127,127,255],[255,255,255,255],{mode:'hardOverlay',profile,opacity:1,mask:128})).toEqual([255,255,255,255])
 // Independent staged U8: contributions64+32+64=160; Q(160,192)=213.
 expect(compositeRgba8([127,127,127,128],[255,255,255,128],{mode:'hardOverlay',profile,opacity:1})).toEqual([213,213,213,192])
})

it('every scalar remains callable through scalar API and opaque composite rather than vector fallback',()=>{
 const expected=[0,0,0,255,0,255,255,255,0,0,255,0,255,0,0,0,0,0,0,255,0,128,128] as const
 for(const [i,mode]of modes.entries()){
  const cf=expected[i];expect(cf).toBeDefined()
  expect(channel(mode,255,0)).toBe(cf)
  expect(compositeRgba8([255,255,255,255],[0,0,0,255],{mode,profile,opacity:1})).toEqual([cf,cf,cf,255])
 }
 // Overlay fallback would return128 here, whereas gammaDark identity at S255 is64.
 expect(channel('gammaDark',255,64)).toBe(64)
 expect(compositeRgba8([255,255,255,255],[64,64,64,255],{mode:'gammaDark',profile,opacity:1})).toEqual([64,64,64,255])
})
