import {it,expect} from 'vitest'
import {compositeRgba8,sourceRgba8CompositeModeId,sourceRgba8SeparableChannel,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1} from '../raster/sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL as es3} from '../raster/sourceRgba8CompositeShader'
const modes=['tint','increaseSaturation','decreaseSaturation','increaseLuminosity','decreaseLuminosity','colorHsl','hueHsl','saturationHsl','increaseSaturationHsl','decreaseSaturationHsl','lightnessHsl','increaseLightnessHsl','decreaseLightnessHsl','colorHsv','hueHsv','saturationHsv','increaseSaturationHsv','decreaseSaturationHsv','valueHsv','increaseValueHsv','decreaseValueHsv','colorHsi','hueHsi','saturationHsi','increaseSaturationHsi','decreaseSaturationHsi','intensityHsi','increaseIntensityHsi','decreaseIntensityHsi'] as const
it('appends HSX29 vector IDs63..91 and routes actual ES1/ES3 vector alpha shells',()=>{
 for(const [i,mode]of modes.entries()){
  expect(sourceRgba8CompositeModeId(mode)).toBe(63+i)
  for(const body of [es1,es3])expect(body).toMatch(new RegExp('mode\\s*==\\s*'+(63+i)+'\\.0'))
  expect(()=>sourceRgba8SeparableChannel(mode,64,192)).toThrow('RGB channels')
 }
 expect(es1).toContain('control.mode>=63.0&&control.mode<=91.0')
 expect(es3).toContain('control.mode>=63u&&control.mode<=91u')
})
const vectors=[
 ['tint',[0,0,255,255],[255,0,0,255],[76,76,255,255]],
 ['tint',[255,0,0,255],[0,255,0,255],[255,150,150,255]],
 ['increaseSaturation',[128,128,128,255],[255,0,0,255],[255,0,0,255]],
 ['increaseSaturation',[255,0,0,255],[128,64,64,255],[255,10,10,255]],
 ['decreaseSaturation',[128,128,128,255],[255,0,0,255],[76,76,76,255]],
 ['decreaseSaturation',[255,0,0,255],[128,64,64,255],[128,64,64,255]],
 ['increaseLuminosity',[64,64,64,255],[128,128,128,255],[192,192,192,255]],
 ['decreaseLuminosity',[128,128,128,255],[192,192,192,255],[65,65,65,255]],
 ['decreaseLuminosity',[255,255,255,255],[128,64,64,255],[128,64,64,255]],
 ['increaseLuminosity',[255,255,255,255],[128,64,64,255],[255,255,255,255]],
 ['decreaseLuminosity',[0,0,0,255],[128,64,64,255],[0,0,0,255]],
] as const
for(const [i,[mode,source,destination,expected]]of vectors.entries())it('HSY native graph analytic vector '+i+' '+mode,()=>{
 expect(compositeRgba8(source,destination,{mode,profile,opacity:1})).toEqual(expected)
 expect(compositeRgba8(source,destination,{mode,profile,opacity:0})).toEqual(destination)
 expect(compositeRgba8([source[0],source[1],source[2],0],destination,{mode,profile,opacity:1})).toEqual(destination)
 expect(compositeRgba8(source,[destination[0],destination[1],destination[2],0],{mode,profile,opacity:1,mask:128})).toEqual([source[0],source[1],source[2],128])
})
it('retains vector alpha shell for partial source/destination and recorded mask',()=>{
 expect(compositeRgba8([0,0,255,128],[255,0,0,128],{mode:'tint',profile,opacity:1})).toEqual([110,25,170,192])
 expect(compositeRgba8([0,0,255,255],[255,0,0,255],{mode:'tint',profile,opacity:1,mask:128})).toEqual([165,38,128,255])
})
it('keeps neutral gray hue and gray-source saturation endpoint direction',()=>{
 for(const mode of ['increaseSaturation','decreaseSaturation']as const)expect(compositeRgba8([255,0,0,255],[128,128,128,255],{mode,profile,opacity:1})).toEqual([128,128,128,255])
})

// Model-dependent literal examples from pinned getLightness/setSaturation/ToneMapping graph.
const modelVectors=[
 ['colorHsl',[255,0,0,255],[129,129,129,255],[255,3,3,255]],
 ['colorHsv',[255,0,0,255],[129,129,129,255],[129,0,0,255]],
 ['colorHsi',[255,0,0,255],[129,129,129,255],[255,66,66,255]],
 ['hueHsl',[128,128,128,255],[255,0,0,255],[128,128,128,255]],
 ['hueHsv',[128,128,128,255],[255,0,0,255],[255,255,255,255]],
 ['hueHsi',[128,128,128,255],[255,0,0,255],[85,85,85,255]],
 ['saturationHsl',[128,128,128,255],[255,0,0,255],[128,128,128,255]],
 ['saturationHsv',[128,128,128,255],[255,0,0,255],[255,255,255,255]],
 ['saturationHsi',[128,128,128,255],[255,0,0,255],[85,85,85,255]],
 ['lightnessHsl',[255,0,0,255],[128,128,128,255],[128,128,128,255]],
 ['valueHsv',[255,0,0,255],[128,128,128,255],[255,255,255,255]],
 ['intensityHsi',[255,0,0,255],[128,128,128,255],[85,85,85,255]],
 ['increaseValueHsv',[64,64,64,255],[255,0,0,255],[255,64,64,255]],
 ['decreaseValueHsv',[255,0,0,255],[255,0,0,255],[255,0,0,255]],
 ['decreaseLightnessHsl',[255,0,0,255],[255,0,0,255],[0,0,0,255]],
 ['decreaseIntensityHsi',[255,0,0,255],[255,0,0,255],[0,0,0,255]],
] as const
for(const [i,[mode,source,destination,expected]]of modelVectors.entries())it('HSX model-specific analytic vector '+i+' '+mode,()=>{
 expect(compositeRgba8(source,destination,{mode,profile,opacity:1})).toEqual(expected)
 expect(compositeRgba8(source,destination,{mode,profile,opacity:0})).toEqual(destination)
 expect(compositeRgba8([source[0],source[1],source[2],0],destination,{mode,profile,opacity:1})).toEqual(destination)
})
it('all24 native templates keep gray endpoints and exact operation orientation',()=>{
 for(const pair of [['increaseSaturationHsl','decreaseSaturationHsl'],['increaseSaturationHsv','decreaseSaturationHsv'],['increaseSaturationHsi','decreaseSaturationHsi']]as const)for(const mode of pair)expect(compositeRgba8([255,0,0,255],[128,128,128,255],{mode,profile,opacity:1})).toEqual([128,128,128,255])
 for(const mode of ['increaseLightnessHsl','increaseValueHsv','increaseIntensityHsi']as const)expect(compositeRgba8([64,64,64,255],[128,128,128,255],{mode,profile,opacity:1})).toEqual([192,192,192,255])
 for(const mode of ['decreaseLightnessHsl','decreaseValueHsv','decreaseIntensityHsi']as const)expect(compositeRgba8([128,128,128,255],[192,192,192,255],{mode,profile,opacity:1})).toEqual([65,65,65,255])
})
it('model-specific vector CF is consumed before common partial-alpha and mask shell',()=>{
 expect(compositeRgba8([255,0,0,128],[128,128,128,128],{mode:'colorHsv',profile,opacity:1})).toEqual([170,43,43,192])
 expect(compositeRgba8([255,0,0,255],[128,128,128,255],{mode:'colorHsv',profile,opacity:1,mask:128})).toEqual([128,64,64,255])
})

it('every new HSX template retains common opacity/transparent/empty-destination controls',()=>{
 for(const mode of modes){
  expect(compositeRgba8([1,254,127,255],[40,180,90,160],{mode,profile,opacity:0})).toEqual([40,180,90,160])
  expect(compositeRgba8([1,254,127,0],[40,180,90,160],{mode,profile,opacity:1})).toEqual([40,180,90,160])
  expect(compositeRgba8([1,254,127,255],[40,180,90,0],{mode,profile,opacity:1,mask:128})).toEqual([2,253,128,128])
 }
})

it('preserves existing vector-shell staged U8 behavior at empty destination rather than scalar source shortcut',()=>{
 // sa=128, da=0: Q(M3(255,128,C),128), not C directly.
 // C1: M3=1,Q=2; C254: M3=127,Q=253; C127: M3=64,Q=128.
 for(const mode of ['hue','saturation','luminosity']as const)expect(compositeRgba8([1,254,127,255],[40,180,90,0],{mode,profile,opacity:1,mask:128})).toEqual([2,253,128,128])
})
