import {expect,it} from 'vitest'
import {canonicalPixelSourceOuterCompositionLaw} from './canonicalBrushCapability.js'
import {buildCanonicalMaterial,unpackCanonicalMaterial,type CanonicalMaterialContextV2} from './canonicalMaterialCodec.js'
import {CANONICAL_PIXEL_EXTENDED_OUTER_BLENDS,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as generic,CANONICAL_STROKE_RASTER_PROFILE as native,canonicalStrokeCompositionExtensions,isCanonicalStrokeComposition,decodeCanonicalStrokeFrame,type CanonicalStrokeComposition,type CanonicalStrokeOuterCompositionLaw} from './canonicalStrokeFrame.js'

const composition=(mode:'wash'|'buildup',outerBlend:CanonicalStrokeComposition['outerBlend']):CanonicalStrokeComposition=>({mode,outerBlend,alphaDarken:'creamy',outerResourceOpacity:.6})
it('requires a captured extension for every extended WASH and keeps legacy profiles closed',()=>{
 for(const blend of CANONICAL_PIXEL_EXTENDED_OUTER_BLENDS){
  const c=composition('wash',blend),law=canonicalPixelSourceOuterCompositionLaw(c)
  expect(law).toBe('generic-separable-u8-v1')
  expect(isCanonicalStrokeComposition(c,browser)).toBe(false)
  expect(isCanonicalStrokeComposition(c,generic,true)).toBe(false)
  expect(isCanonicalStrokeComposition(c,generic,canonicalStrokeCompositionExtensions(law))).toBe(true)
  expect(isCanonicalStrokeComposition(c,native,canonicalStrokeCompositionExtensions(law))).toBe(false)
 }
})
it('selects incremental per-dab law independently of the WASH law and rejects native execution',()=>{
 for(const blend of [...CANONICAL_PIXEL_EXTENDED_OUTER_BLENDS,'multiply','overlay','colorHsyBrowser'] as const){
  const c=composition('buildup',blend),law=canonicalPixelSourceOuterCompositionLaw(c)
  expect(law).toBe('pixel-direct-composite-browser-v1')
  expect(isCanonicalStrokeComposition(c,browser,canonicalStrokeCompositionExtensions(law))).toBe(true)
  for(const profile of [generic,native])expect(isCanonicalStrokeComposition(c,profile,canonicalStrokeCompositionExtensions(law))).toBe(false)
  expect(isCanonicalStrokeComposition(c,browser,{browserHsy:true,separableOuter:true})).toBe(false)
 }
 for(const mode of ['wash','buildup'] as const)for(const blend of ['over','erase'] as const)expect(canonicalPixelSourceOuterCompositionLaw(composition(mode,blend))).toBeUndefined()
})
function context(law:CanonicalStrokeOuterCompositionLaw):CanonicalMaterialContextV2{
 const asset={id:'asset:'+'1'.repeat(64),size:2,x:0,y:0,width:2,height:2}
 return {version:2,assets:[asset],primarySource:{kind:'image',asset:asset.id,brushScale:1,brushAngle:0},outerCompositionLaw:law,budget:{workUnits:10000,outputBytes:10000,drawPixels:10000}}
}
it('pins different binary headers and rejects a mode/marker substitution before accepting a stroke',()=>{
 const laws=['browser-hsy-rgba8-functional-v1','generic-separable-u8-v1','pixel-direct-composite-browser-v1'] as const
 const packed=laws.map(law=>buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},context(law)).packed)
 for(let i=0;i<laws.length;i++)for(let j=0;j<laws.length;j++){
  if(i===j)expect(()=>unpackCanonicalMaterial(packed[i],context(laws[j]))).not.toThrow()
  else expect(()=>unpackCanonicalMaterial(packed[i],context(laws[j]))).toThrow()
 }
 const c=composition('buildup','screen'),material=context(laws[2])
 const trusted={materialVersion:2 as const,rasterProfile:browser,material,brush:'brush:test@1',strokeId:'test',frameOrdinal:0,pigmentRgb8:[1,2,3] as const,composition:c}
 const envelope={version:2,rasterProfile:browser,brush:trusted.brush,strokeId:trusted.strokeId,frameOrdinal:0,pigmentRgb8:[1,2,3],composition:c,materialPacked:packed[2]}
 expect(()=>decodeCanonicalStrokeFrame(envelope,trusted)).not.toThrow()
 expect(()=>decodeCanonicalStrokeFrame({...envelope,composition:composition('wash','screen')},{...trusted,composition:composition('wash','screen')})).toThrow('law differs')
 expect(()=>decodeCanonicalStrokeFrame(envelope,{...trusted,rasterProfile:generic})).toThrow()
})
