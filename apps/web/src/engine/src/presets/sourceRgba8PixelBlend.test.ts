import {describe,expect,it} from 'vitest'
import {compositeRgba8,SOURCE_RGBA8_GENERIC_SC_MODES,SOURCE_RGBA8_GENERIC_SC_PROFILE,type SourceRgba8SeparableMode} from './sourceColorRgba8'
import type {Rgba8} from './mixWeightedRgba8'

const opaque=(mode:SourceRgba8SeparableMode,source:Rgba8,destination:Rgba8)=>compositeRgba8(source,destination,{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:1})

describe('functional Pixel blend functors, independent fixed byte examples',()=>{
 it('distinguishes native Dodge/Burn HardMix from Photoshop threshold',()=>{
  // Native hard mix selects Burn below destination midpoint; 255-round(155*255/200)=57.
  // Photoshop tests the sum:200+100>255. They cannot share one imported mode.
  expect(opaque('hardMix',[200,200,200,255],[100,100,100,255])).toEqual([57,57,57,255])
  expect(opaque('hardMixPhotoshop',[200,200,200,255],[100,100,100,255])).toEqual([255,255,255,255])
  expect(opaque('hardMix',[50,50,50,255],[200,200,200,255])).toEqual([249,249,249,255])
  expect(opaque('hardMixPhotoshop',[50,50,50,255],[200,200,200,255])).toEqual([0,0,0,255])
 })
 it('keeps Photoshop square-root and SVG cubic soft-light distinct below quarter-gray',()=>{
  expect(opaque('softLight',[255,255,255,255],[16,16,16,255])).toEqual([64,64,64,255])
  expect(opaque('softLightSvg',[255,255,255,255],[16,16,16,255])).toEqual([53,53,53,255])
 })
 it('selects a whole RGB triplet for darker/lighter, rather than black/yellow channel extrema',()=>{
  const red:Rgba8=[255,0,0,255],green:Rgba8=[0,255,0,255]
  expect(opaque('darkerColor',red,green)).toEqual(red)
  expect(opaque('lighterColor',red,green)).toEqual(green)
  expect(opaque('darken',red,green)).toEqual([0,0,0,255])
  expect(opaque('lighten',red,green)).toEqual([255,255,0,255])
 })
 it('uses HSY brightness and chroma rather than substituting HSV channels',()=>{
  // Achromatic source has no hue; destination red brightness .299 gives gray76.
  expect(opaque('hue',[128,128,128,255],[255,0,0,255])).toEqual([76,76,76,255])
  expect(opaque('saturation',[255,255,255,255],[255,0,0,255])).toEqual([76,76,76,255])
  // Red hue at green brightness .587 requires gamut compression, not pure red.
  expect(opaque('hue',[255,0,0,255],[0,255,0,255])).toEqual([255,105,105,255])
  expect(opaque('luminosity',[0,255,0,255],[255,0,0,255])).toEqual([255,105,105,255])
  expect(opaque('luminosity',[0,0,0,255],[123,211,47,255])).toEqual([0,0,0,255])
 })
 it.each([
  ['colorBurn',4],['linearBurn',1],['subtract',128],['difference',128],['exclusion',160],
  ['hardLight',96],['divide',255],['linearLight',65],['vividLight',129],['pinLight',128],
 ] as const)('retains fixed midrange %s byte arithmetic',(mode,value)=>{
  expect(opaque(mode,[64,64,64,255],[192,192,192,255])).toEqual([value,value,value,255])
 })
 it.each(SOURCE_RGBA8_GENERIC_SC_MODES.filter(mode=>!new Set<string>(['copyRed','copyGreen','copyBlue','behind','luminositySai','greater']).has(mode)))('preserves alpha endpoints and hidden destination RGB for %s',mode=>{
  const source:Rgba8=[211,17,83,255],destination:Rgba8=[29,193,7,157]
  const control={mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:1} as const
  expect(compositeRgba8(source,destination,{...control,opacity:0})).toEqual(destination)
  expect(compositeRgba8(source,destination,{...control,mask:0})).toEqual(destination)
  expect(compositeRgba8([211,17,83,0],destination,control)).toEqual(destination)
  expect(compositeRgba8(source,[8,9,10,0],control)).toEqual(source)
  expect(compositeRgba8([211,17,83,0],[8,9,10,0],control)).toEqual([8,9,10,0])
 })
 it.each([['add',[199,107,70,172]],['darken',[178,92,43,172]],['screen',[194,102,68,172]]] as const)('keeps partial alpha/opacity/mask rounding for %s',(mode,expected)=>{
  expect(compositeRgba8([80,130,240,128],[200,90,30,160],{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:128/255,mask:127})).toEqual(expected)
 })
})

// Exact new RGBA shells intentionally differ from scalarSC empty-destination rules.
it.each([['copyRed',[211,9,10,0]],['copyGreen',[8,17,10,0]],['copyBlue',[8,9,83,0]],['behind',[211,17,83,255]],['luminositySai',[219,26,93,255]],['greater',[211,17,83,255]]]as const)('retains explicit custom-shell empty-destination law for %s',(mode,expected)=>{
 const control={mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:1}as const
 expect(compositeRgba8([211,17,83,255],[8,9,10,0],control)).toEqual(expected)
 expect(compositeRgba8([211,17,83,0],[8,9,10,0],control)).toEqual([8,9,10,0])
 expect(compositeRgba8([211,17,83,255],[29,193,7,157],{...control,opacity:0})).toEqual([29,193,7,157])
 expect(compositeRgba8([211,17,83,255],[29,193,7,157],{...control,mask:0})).toEqual([29,193,7,157])
})
