import {extractGaussianAutoSourceDataCapability} from './canonicalBrushCapability.js'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import { describe, expect, it } from 'vitest'
import stock from './fixtures/sourceGaussianAutoData/stock.native.js'
import type { BrushDescriptor } from './brushes.js'
import { sourceAutoGeometry } from './sourceAutoGeometry.js'
import { canonicalGaussianAutoSourceBinding, canonicalGaussianAutoSourcePin, canonicalGaussianAutoCost, canonicalDefaultAutoSourcePin, type CanonicalGaussianAutoRecipe } from './canonicalDefaultAutoMaterial.js'
import { buildCanonicalMaterial, unpackCanonicalMaterial, packCanonicalMaterial, type CanonicalMaterialBuildInputV2, type CanonicalMaterialContextV2 } from './canonicalMaterialCodec.js'
import { decodeCanonicalStrokeFrame, CANONICAL_STROKE_RASTER_PROFILE } from './canonicalStrokeFrame.js'

function setup(index = 2, profile: 'scalar-bionic-f64-fma-v1'|'neon64-f32-fma-v1' = 'scalar-bionic-f64-fma-v1') {
  const row = stock.rows.find(r => r.index === index)!
  // Codec data-only fixture: a valid Gaussian source is not a paint grant.
  // Stock2 retains erase=true; its source bytes still roundtrip unchanged.
  const descriptor=row.descriptor as unknown as BrushDescriptor,result=extractGaussianAutoSourceDataCapability(descriptor)
  if(!result.supported)throw Error('Gaussian source data unavailable')
  const pin=canonicalGaussianAutoSourcePin({kind:'gaussianAuto',descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256:row.descriptorSHA256,source:result.data.source,brushScale:result.data.brush.scale,brushAngle:result.data.brush.angle,coverageProfile:profile})
  const geometry = sourceAutoGeometry({ kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle }, {scale:.2,ratio:1,rotation:-0}, -0, 0)
  const recipe: CanonicalGaussianAutoRecipe = {kind:'gaussianAuto',source:pin.source,coverageProfile:profile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:.2,ratio:1,rotation:-0,subX:-0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:true,mirrorV:false}
  const context: CanonicalMaterialContextV2 = {version:2,assets:[],primarySource:pin,budget:{workUnits:67108864,outputBytes:16777216,drawPixels:16777216}}
  const input: CanonicalMaterialBuildInputV2 = {masked:false,entry:{phase:'primary',group:1},draws:[{recipe,role:'primary',x:-7,y:13,opacity:.6,flow:.8}],fences:[]}
  return {pin,recipe,context,input}
}
function mutate(packed:string, edit:(v:DataView)=>void) {
  const b=Uint8Array.from(atob(packed.slice(2)),c=>c.charCodeAt(0));edit(new DataView(b.buffer))
  return '2|'+btoa(String.fromCharCode(...b))
}
describe('Gaussian material tag3, trusted source and common geometry costs', () => {
  it.each(['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const)('roundtrips seven actual retained sources under %s without CAS or F64 loss', profile => {
    for (const index of [2,5,6,7,10,11,22]) {
      const {pin,recipe,context,input}=setup(index,profile),built=buildCanonicalMaterial(input,context)
      const raw=atob(built.packed.slice(2))
      expect(raw.charCodeAt(6)).toBe(0);expect(raw.charCodeAt(24)).toBe(3)
      expect(raw.charCodeAt(25)).toBe(profile==='neon64-f32-fma-v1'?2:1)
      expect(unpackCanonicalMaterial(built.packed,context)).toEqual(built.frame)
      expect(packCanonicalMaterial(built.frame,context)).toBe(built.packed)
      const d=built.frame.definitions[0]
      expect(d.kind).toBe('gaussianAuto');expect(Object.is(d.rotation,-0)).toBe(true);expect(Object.is(d.subX,-0)).toBe(true)
      const cost=canonicalGaussianAutoCost(recipe,pin)
      expect(cost.outputBytes).toBe(recipe.width*recipe.height*4)
      expect(cost.workUnits).toBe(recipe.width*recipe.height*(pin.source.antialias?36:1))
      const composition={mode:'wash',alphaDarken:'creamy',outerResourceOpacity:.5,outerBlend:'over'} as const
      const envelope={version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:pin.descriptorId,strokeId:'s',frameOrdinal:0,pigmentRgb8:[1,2,3],composition,materialPacked:built.packed}
      const decoded=decodeCanonicalStrokeFrame(envelope,{brush:pin.descriptorId,strokeId:'s',frameOrdinal:0,pigmentRgb8:[1,2,3],composition,material:context})
      expect(Object.isFrozen(decoded.frame.definitions[0])).toBe(true)
      if(decoded.frame.definitions[0].kind==='gaussianAuto')expect(Object.isFrozen(decoded.frame.definitions[0].source)).toBe(true)
    }
  })
  it('keeps unsupported material/dual sources closed at descriptor binding', () => {
    for(const index of [12,38,39,40,68,70])expect(()=>setup(index)).toThrow()
  })
  it('rejects generator/profile/tag/geometry spoofing and exhausted budgets before build', () => {
    const {pin,recipe,context,input}=setup(),built=buildCanonicalMaterial(input,context)
    expect(()=>canonicalDefaultAutoSourcePin(pin as never)).toThrow()
    for(const changed of [{...pin,coverageProfile:'scalar-f64-fma-v1'}, {...pin,kind:'defaultAuto'}, {...pin,source:{...pin.source,generator:'default'}}, {...pin,source:{...pin.source,shape:'rect'}}, {...pin,source:{...pin.source,ratio:2}}])expect(()=>canonicalGaussianAutoSourcePin(changed as never)).toThrow()
    for(const edit of [(v:DataView)=>v.setUint8(24,1),(v:DataView)=>v.setUint8(24,2),(v:DataView)=>v.setUint8(24,4),(v:DataView)=>v.setUint8(25,3),(v:DataView)=>v.setUint8(27,1),(v:DataView)=>v.setUint16(28,recipe.width+1,true),(v:DataView)=>v.setFloat64(32,pin.source.diameter+1,true)])expect(()=>unpackCanonicalMaterial(mutate(built.packed,edit),context)).toThrow()
    expect(()=>buildCanonicalMaterial(input,{...context,budget:{...context.budget,workUnits:0}})).toThrow()
    expect(()=>canonicalGaussianAutoCost({...recipe,coverageProfile:'scalar-f64-fma-v1'} as never,pin)).toThrow()
    expect(()=>canonicalGaussianAutoCost({...recipe,source:{...recipe.source,density:.8}},pin)).toThrow()
  })
})

it('gates direct Gaussian bindings by the same native composition/profile law without altering coverage/source data',()=>{
 const base=structuredClone(stock.rows.find(r=>r.index===5)!.descriptor) as unknown as BrushDescriptor
 Object.assign(base.sourceStamp!.settings,{PaintOpAction:'2'});Object.assign(base.sourceStamp!.flags,{indirectPainting:true})
 const old=canonicalGaussianAutoSourceBinding(base,'a'.repeat(64),'scalar-bionic-f64-fma-v1')
 for(const blendMode of ['multiply','lighten','colorDodge','overlay'] as const){
  const d=structuredClone(base);Object.assign(d.behavior!.rendering!,{blendMode})
  expect(()=>canonicalGaussianAutoSourceBinding(d,'a'.repeat(64),'scalar-bionic-f64-fma-v1')).toThrow('outer composition')
  expect(canonicalGaussianAutoSourceBinding(d,'a'.repeat(64),'scalar-bionic-f64-fma-v1',CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toEqual(old)
  Object.assign(d.behavior!.rendering!,{wetEdges:.2});expect(()=>canonicalGaussianAutoSourceBinding(d,'a'.repeat(64),'scalar-bionic-f64-fma-v1',CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow()
 }
})

it('retains the original Gaussian eraser source data while refusing every paint binding profile',()=>{
 const row=stock.rows.find(r=>r.index===2)!,d=row.descriptor as unknown as BrushDescriptor
 expect(d.behavior?.erase).toBe(true);expect(extractGaussianAutoSourceDataCapability(d).supported).toBe(true)
 expect(()=>canonicalGaussianAutoSourceBinding(d,row.descriptorSHA256,'scalar-bionic-f64-fma-v1')).toThrow('outer composition')
 expect(()=>canonicalGaussianAutoSourceBinding(d,row.descriptorSHA256,'scalar-bionic-f64-fma-v1',CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow('outer composition')
})
