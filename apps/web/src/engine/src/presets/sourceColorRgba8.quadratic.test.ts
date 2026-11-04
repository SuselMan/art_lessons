import {describe,it,expect} from 'vitest'
import {compositeRgba8,sourceRgba8SeparableChannel,sourceRgba8CompositeModeId,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL} from '../raster/sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL} from '../raster/sourceRgba8CompositeShader'
// Independently reduced native U8 examples at S=64,D=192. Native oracle gate is separate.
const cases=[['reflect',194,193,150],['glow',65,128,106],['freeze',191,192,149],['heat',65,128,106],['glowHeat',65,128,106],['heatGlow',65,128,106],['reflectFreeze',194,193,150],['freezeReflect',191,192,149],['heatGlowFreezeReflectHybrid',127,159,128]] as const
describe('registered quadratic U8 family',()=>{
 it('appends IDs38..46 and implements the actual ES1 and ES3 channel bodies',()=>{
  for(const [i,[mode]]of cases.entries()){
   expect(sourceRgba8CompositeModeId(mode)).toBe(38+i)
   expect(SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL).toMatch(new RegExp('mode\\s*==\\s*'+(38+i)+'\\.0'))
   expect(SOURCE_RGBA8_COMPOSITE_GLSL).toMatch(new RegExp('mode\\s*==\\s*'+(38+i)+'u'))
  }
 })
 for(const [mode,expected,masked,partial]of cases)it(mode+' retains opaque channel and GenericSC transparent/opacity controls',()=>{
  expect(sourceRgba8SeparableChannel(mode,64,192)).toBe(expected)
  expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:1,mask:128})).toEqual([masked,masked,masked,255])
  expect(compositeRgba8([64,64,64,128],[192,192,192,128],{mode,profile,opacity:1})).toEqual([partial,partial,partial,192])
  expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:1})).toEqual([expected,expected,expected,255])
  expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:0})).toEqual([192,192,192,255])
  expect(compositeRgba8([64,64,64,0],[192,192,192,97],{mode,profile,opacity:1})).toEqual([192,192,192,97])
  expect(compositeRgba8([64,64,64,255],[192,192,192,0],{mode,profile,opacity:1,mask:128})).toEqual([64,64,64,128])
 })
 it('keeps endpoint precedence, complete swaps, strict selector and native half127',()=>{
  expect(sourceRgba8SeparableChannel('heat',255,0)).toBe(255)
  expect(sourceRgba8SeparableChannel('freeze',0,255)).toBe(255)
  expect(sourceRgba8SeparableChannel('glow',0,255)).toBe(255)
  expect(sourceRgba8SeparableChannel('reflect',255,0)).toBe(255)
  expect(sourceRgba8SeparableChannel('heatGlow',0,255)).toBe(0)
  expect(sourceRgba8SeparableChannel('freezeReflect',255,0)).toBe(0)
  expect(sourceRgba8SeparableChannel('glowHeat',0,255)).toBe(255)
  expect(sourceRgba8SeparableChannel('reflectFreeze',255,0)).toBe(255)
  expect(sourceRgba8SeparableChannel('heatGlowFreezeReflectHybrid',255,255)).toBe(254)
  // M(64,64)=16 before Q(16,63)=65: normalized quadratic would produce64.
  expect(sourceRgba8SeparableChannel('glow',64,192)).toBe(65)
 })
})
