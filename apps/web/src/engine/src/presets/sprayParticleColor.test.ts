import{it,expect}from'vitest'
import{sprayParticleColorControls,sprayParticleRgba8,type SprayParticleColorControl}from'./sprayParticleColor'
const settings={perParticle:false,hue:.7,saturation:-.3,value:.2,randomOpacity:true}
const neutral:SprayParticleColorControl={sourceIndex:0,hsv:[0,0,0],randomAlpha:undefined}
it('uses first source and identical controls for request colour, separate controls for per-particle colour',()=>{
 expect(sprayParticleColorControls(settings,9,2,0)).toEqual(sprayParticleColorControls(settings,9,2,1023))
 expect(sprayParticleColorControls({...settings,perParticle:true},9,2,0)).not.toEqual(sprayParticleColorControls({...settings,perParticle:true},9,2,1))
 expect(sprayParticleColorControls(settings,9,2,0)).not.toEqual(sprayParticleColorControls(settings,9,3,0))
 expect(()=>sprayParticleColorControls(settings,9,2,4096)).toThrow('identity')
})
it('samples before alpha-aware truncated pressure mixing and applies HSV afterward',()=>{
 expect(sprayParticleRgba8('painted-shape',[0,255,0,255],neutral,{sampleInput:true,mixBackground:true},[255,0,0,255],[0,0,255,255],.5)).toEqual([128,0,128,254])
 expect(sprayParticleRgba8('painted-shape',[0,255,0,255],{...neutral,hsv:[0,0,-1]},{sampleInput:true},[255,0,0,128])).toEqual([0,0,0,128])
 expect(()=>sprayParticleRgba8('painted-shape',[0,0,0,255],neutral,{sampleInput:true})).toThrow('original source')
 expect(()=>sprayParticleRgba8('painted-shape',[0,0,0,255],neutral,{mixBackground:true})).toThrow('captured background')
})
it('never replaces an image RGB/alpha with source ink, while HSV and painter opacity still affect it',()=>{
 const control={...neutral,randomAlpha:.5}
 expect(sprayParticleRgba8('image',[255,0,0,128],control,{sampleInput:true,mixBackground:true},[0,255,0,255],[0,0,255,255],.5)).toEqual([255,0,0,64])
 expect(sprayParticleRgba8('image',[255,0,0,255],{...control,hsv:[2/3,0,0]})).toEqual([0,255,0,128])
 expect(sprayParticleRgba8('painted-shape',[255,0,0,128],control)).toEqual([255,0,0,64])
 expect(sprayParticleRgba8('direct-pixel',[255,0,0,128],control)).toEqual([255,0,0,128])
})
it('owns the returned colour, accepts transparent samples, and rejects malformed controls',()=>{
 const source:[number,number,number,number]=[10,20,30,0],result=sprayParticleRgba8('image',source,neutral);expect(result).not.toBe(source);expect(result).toEqual(source)
 expect(()=>sprayParticleRgba8('image',[0,0,0,256],neutral)).toThrow('RGBA8')
 expect(()=>sprayParticleRgba8('image',source,{...neutral,hsv:[NaN,0,0]})).toThrow('controls')
})
