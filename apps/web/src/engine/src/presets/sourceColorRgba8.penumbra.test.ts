import {it,expect} from 'vitest'
import {compositeRgba8,sourceRgba8SeparableChannel,sourceRgba8CompositeModeId,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL} from '../raster/sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL} from '../raster/sourceRgba8CompositeShader'
// Literal native reductions S64,D192. C/D angle examples are functional byte-angle law.
const cases=[['hardMixSofterPhotoshop',194,193,150],['penumbraA',128,160,128],['penumbraB',130,161,129],['penumbraC',128,160,128],['penumbraD',129,160,129],['flatLight',130,161,129]] as const
it('appends six registered scalar mode IDs47..52 with actual ES1 and ES3 implementations',()=>{
 for(const [i,[mode]]of cases.entries()){
  expect(sourceRgba8CompositeModeId(mode)).toBe(47+i)
  expect(SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL).toMatch(new RegExp('mode\\s*==\\s*'+(47+i)+'\\.0'))
  expect(SOURCE_RGBA8_COMPOSITE_GLSL).toMatch(new RegExp('mode\\s*==\\s*'+(47+i)+'u'))
 }
})
for(const [mode,opaque,masked,partial]of cases)it(mode+' preserves independently reduced native channel and GenericSC shell',()=>{
 expect(sourceRgba8SeparableChannel(mode,64,192)).toBe(opaque)
 expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:1})).toEqual([opaque,opaque,opaque,255])
 expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:1,mask:128})).toEqual([masked,masked,masked,255])
 expect(compositeRgba8([64,64,64,128],[192,192,192,128],{mode,profile,opacity:1})).toEqual([partial,partial,partial,192])
 expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:0})).toEqual([192,192,192,255])
 expect(compositeRgba8([64,64,64,0],[192,192,192,97],{mode,profile,opacity:1})).toEqual([192,192,192,97])
 expect(compositeRgba8([64,64,64,255],[192,192,192,0],{mode,profile,opacity:1,mask:128})).toEqual([64,64,64,128])
})
it('keeps Penumbra endpoint precedence, integer half before clamp, complete swaps and flatLight selector',()=>{
 expect(sourceRgba8SeparableChannel('penumbraB',0,255)).toBe(255)
 expect(sourceRgba8SeparableChannel('penumbraA',255,0)).toBe(255)
 expect(sourceRgba8SeparableChannel('penumbraB',1,254)).toBe(128)
 expect(sourceRgba8SeparableChannel('penumbraB',0,254)).toBe(0)
 expect(sourceRgba8SeparableChannel('penumbraD',0,255)).toBe(255)
 expect(sourceRgba8SeparableChannel('penumbraC',255,0)).toBe(255)
 expect(sourceRgba8SeparableChannel('penumbraD',255,0)).toBe(128)
 expect(sourceRgba8SeparableChannel('flatLight',0,255)).toBe(0)
 expect(sourceRgba8SeparableChannel('flatLight',64,192)).toBe(130)
 expect(sourceRgba8SeparableChannel('flatLight',192,64)).toBe(130)
 expect(sourceRgba8SeparableChannel('hardMixSofterPhotoshop',0,170)).toBe(0)
 expect(sourceRgba8SeparableChannel('hardMixSofterPhotoshop',255,85)).toBe(255)
})
