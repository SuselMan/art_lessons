import{it,expect}from'vitest'
import{compositeRgba8,sourceRgba8SeparableChannel,sourceRgba8CompositeModeId,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile,SOURCE_RGBA8_COLOR_HSY_PROFILE,SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE,SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE}from'./sourceColorRgba8'
import{SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1}from'../raster/sourceRgba8CompositeWebGL1'
import{SOURCE_RGBA8_COMPOSITE_GLSL as es3}from'../raster/sourceRgba8CompositeShader'
const modes=['copyRed','copyGreen','copyBlue','behind','luminositySai','greater']as const
it('appends customRGBA119..124 without accepting scalar CF aliases',()=>{
 for(const[i,mode]of modes.entries()){
  expect(sourceRgba8CompositeModeId(mode)).toBe(119+i)
  expect(()=>sourceRgba8SeparableChannel(mode,64,192)).toThrow(RangeError)
  expect(()=>sourceRgba8SeparableChannel(mode,64,192)).toThrow('Custom composite mode requires RGBA channels')
 }
 for(const shader of[es1,es3]){expect(shader).toContain('sourceCustom6');expect(shader).toContain('sourceGreaterWeight');expect(shader).toContain('119');expect(shader).toContain('124')}
})
it('channel copy changes only selected straightRGB, keeps alpha and hidden other channels',()=>{
 const source=[200,100,50,128]as const,dest=[40,60,80,160]as const
 expect(compositeRgba8(source,dest,{mode:'copyRed',profile,opacity:1})).toEqual([120,60,80,160])
 expect(compositeRgba8(source,dest,{mode:'copyGreen',profile,opacity:1})).toEqual([40,80,80,160])
 expect(compositeRgba8(source,dest,{mode:'copyBlue',profile,opacity:1})).toEqual([40,60,65,160])
 expect(compositeRgba8([200,100,50,255],[40,60,80,0],{mode:'copyRed',profile,opacity:1})).toEqual([200,60,80,0])
})
it('Behind uses native under-alpha order instead of OVER or scalar CF',()=>{
 expect(compositeRgba8([255,0,0,128],[0,0,255,128],{mode:'behind',profile,opacity:1})).toEqual([85,0,170,192])
 expect(compositeRgba8([255,0,0,255],[0,0,255,255],{mode:'behind',profile,opacity:1})).toEqual([0,0,255,255])
 expect(compositeRgba8([200,100,50,128],[40,60,80,0],{mode:'behind',profile,opacity:1})).toEqual([200,100,50,128])
})
it('SAI retains direct additive source-alpha channels, hidden destinationRGB and separate alpha union',()=>{
 expect(compositeRgba8([100,200,255,128],[40,50,60,128],{mode:'luminositySai',profile,opacity:1})).toEqual([90,150,188,192])
 expect(compositeRgba8([100,200,255,128],[40,50,60,0],{mode:'luminositySai',profile,opacity:1})).toEqual([90,150,188,128])
})
it('Greater has its own sigmoid alpha/fakeopacity shell and opaque-destination guard',()=>{
 expect(compositeRgba8([255,255,255,128],[0,0,0,127],{mode:'greater',profile,opacity:1})).toEqual([2,2,2,128])
 expect(compositeRgba8([255,255,255,255],[40,50,60,255],{mode:'greater',profile,opacity:1})).toEqual([40,50,60,255])
 expect(compositeRgba8([100,200,50,128],[1,2,3,0],{mode:'greater',profile,opacity:1})).toEqual([100,200,50,128])
})
it('all6 preserve zero-source and zero-opacity without opening generic alpha-union fallback',()=>{
 for(const mode of modes){
  expect(compositeRgba8([93,17,211,0],[40,60,80,127],{mode,profile,opacity:1})).toEqual([40,60,80,127])
  expect(compositeRgba8([93,17,211,255],[40,60,80,127],{mode,profile,opacity:0})).toEqual([40,60,80,127])
  expect(compositeRgba8([93,17,211,255],[40,60,80,127],{mode,profile,opacity:1,mask:0})).toEqual([40,60,80,127])
 }
})

it('preserves all historical colorHsy profiles outside the indexed GenericSC mode table',()=>{
 for(const oldProfile of[SOURCE_RGBA8_COLOR_HSY_PROFILE,SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE,SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE]){
  expect(compositeRgba8([128,128,128,255],[128,128,128,255],{mode:'colorHsy',profile:oldProfile,opacity:1})).toEqual([128,128,128,255])
 }
})
