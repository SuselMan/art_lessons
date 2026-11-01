import { expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE, packCanonicalMaterial, buildCanonicalMaterial, type CanonicalMaterialContext, type CanonicalMaterialContextV3 } from './canonicalMaterialCodec.js'
import { CANONICAL_STROKE_RASTER_PROFILE, decodeCanonicalStrokeFrame, type CanonicalStrokeFrameContext, type CanonicalStrokeFrameContextV3, type CanonicalStrokeFrameEnvelope } from './canonicalStrokeFrame.js'

function fixture() {
  const asset = { id: 'asset:' + '1'.repeat(64), size: 2, x: 0, y: 0, width: 2, height: 2 }
  const preflightDefinition = vi.fn(() => ({ workUnits: 100, outputBytes: 16 }))
  const material: CanonicalMaterialContext = { assets: [asset], primaryAsset: asset.id, budget: { workUnits: 1000, outputBytes: 1000, drawPixels: 1000 }, preflightDefinition }
  const packed = packCanonicalMaterial({ profile: CANONICAL_MATERIAL_PROFILE, masked: false, entry: { phase: 'between' },
    definitions: [{ asset: asset.id, brushScale: 1, brushAngle: 0, scale: 1, ratio: 1, rotation: -0, subX: 0, subY: 0, width: 2, height: 2, mirrorH: false, mirrorV: false }],
    draws: [{ definition: 0, role: 'primary', x: -3, y: 7, opacity: .7567890123456789, flow: .4 }],
    fences: [{ kind: 'segmentBegin', at: 0, group: 0 }, { kind: 'primaryEnd', at: 1, group: 0 }, { kind: 'segmentEnd', at: 1, group: 0 }, { kind: 'gestureEnd', at: 1 }] }, material)
  const trusted: CanonicalStrokeFrameContext = { brush: 'brush:imported-test@1', strokeId: 'gesture', frameOrdinal: 0, pigmentRgb8: [17, 29, 41],
    composition: { mode: 'wash', alphaDarken: 'hard', outerResourceOpacity: .8, outerBlend: 'over' }, material }
  const value: CanonicalStrokeFrameEnvelope = { version: 1, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE, brush: trusted.brush, strokeId: trusted.strokeId,
    frameOrdinal: 0, pigmentRgb8: [...trusted.pigmentRgb8], composition: { ...trusted.composition }, materialPacked: packed }
  preflightDefinition.mockClear()
  return { trusted, value, preflightDefinition }
}
it('admits JSON opaque material with immutable pinned context, retaining exact frame geometry', () => {
  const { trusted, value, preflightDefinition } = fixture()
  const input = JSON.parse(JSON.stringify(value)), accepted = decodeCanonicalStrokeFrame(input, trusted)
  expect(accepted.envelope).toEqual(value)
  expect(Object.is(accepted.frame.definitions[0].rotation, -0)).toBe(true)
  expect(accepted.frame.draws[0].opacity).toBe(.7567890123456789)
  expect(preflightDefinition).toHaveBeenCalled()
  input.pigmentRgb8[0] = 255; input.composition.mode = 'buildup'
  expect(accepted.envelope.pigmentRgb8).toEqual([17, 29, 41])
  expect(accepted.envelope.composition.mode).toBe('wash')
  expect(Object.isFrozen(accepted.envelope)).toBe(true)
  expect(Object.isFrozen(accepted.frame.definitions[0])).toBe(true)
})
it('rejects forged gesture context and mixed legacy dabs before material preflight', () => {
  const { trusted, value, preflightDefinition } = fixture()
  for (const patch of [{ brush: 'brush:other@1' }, { strokeId: 'other' }, { frameOrdinal: 1 }, { rasterProfile: 'unknown' },
    { pigmentRgb8: [18, 29, 41] }, { composition: { ...value.composition, outerResourceOpacity: .7 } },
    { dabsPacked: '1|AAAA' }, { dabs: [] }, { authorOptions: {} }, { frameOrdinal: NaN }]) {
    expect(() => decodeCanonicalStrokeFrame({ ...value, ...patch }, trusted)).toThrow()
  }
  expect(preflightDefinition).not.toHaveBeenCalled()
})
it('delegates trusted CAS, byte budgets and end fences to the shared material decoder', () => {
  const { trusted, value } = fixture()
  expect(() => decodeCanonicalStrokeFrame(value, { ...trusted, material: { ...trusted.material, assets: [] } })).toThrow()
  expect(() => decodeCanonicalStrokeFrame(value, { ...trusted, material: { ...trusted.material, budget: { workUnits: 0, outputBytes: 0, drawPixels: 0 } } })).toThrow()
  expect(() => decodeCanonicalStrokeFrame(value, { ...trusted, material: { ...trusted.material, expectedStrokeEnd: false } })).toThrow()
  expect(() => decodeCanonicalStrokeFrame({ ...value, materialPacked: value.materialPacked.slice(0, -1) }, trusted)).toThrow()
})

const genericProfile = 'installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2' as const
it('keeps material3 pure parsing separate from existing stroke admission even with a fabricated trusted context', () => {
  const { trusted, value } = fixture(), primary = trusted.material.assets[0]
  const pattern = { ...primary, id: 'asset:' + '2'.repeat(64) }
  const material: CanonicalMaterialContextV3 = { version: 3, assets: [primary, pattern],
    primarySource: { kind: 'image', asset: primary.id, brushScale: 1, brushAngle: 0 },
    primaryTexture: { kind: 'canvasTexture', asset: pattern.id, law: 'subtract-u8-v1', width: 2, height: 2,
      periodX: 2, periodY: 2, offsetX: 0, offsetY: 0, strength: 'pressure-identity-v1' }, budget: trusted.material.budget }
  const materialPacked = packCanonicalMaterial({ profile: CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE,
    masked: false, entry: { phase: 'between' }, definitions: [], draws: [], fences: [] }, material)
  const context = { ...trusted, rasterProfile: genericProfile }
  Reflect.set(context, 'material', material)
  const input = { ...value, version: 2, rasterProfile: genericProfile, materialPacked }
  expect(() => decodeCanonicalStrokeFrame(input, context)).toThrow('Unsupported canonical stroke material version')
  const getter = vi.fn(() => 3), accessor = { ...trusted.material }
  Object.defineProperty(accessor, 'version', { get: getter })
  Reflect.set(context, 'material', accessor)
  expect(() => decodeCanonicalStrokeFrame(input, context)).toThrow('Unsupported canonical stroke material version')
  expect(getter).not.toHaveBeenCalled()
  Reflect.set(context, 'material', Object.assign(Object.create({ version: 3 }), trusted.material))
  expect(() => decodeCanonicalStrokeFrame(input, context)).toThrow('Unsupported canonical stroke material version')
})
for (const outerBlend of ['over','multiply','lighten','colorDodge','overlay'] as const) it(`admits V2 ${outerBlend} only against an explicit trusted whole-pipeline profile`, () => {
  const { trusted, value } = fixture()
  const composition = { ...trusted.composition, outerBlend }
  const context = { ...trusted, rasterProfile: genericProfile, composition }
  const input = { ...value, version: 2, rasterProfile: genericProfile, composition }
  const accepted = decodeCanonicalStrokeFrame(input, context)
  expect(accepted.envelope).toEqual(input)
  expect(accepted.envelope.materialPacked).toBe(value.materialPacked)
  expect(Object.isFrozen(accepted.envelope.composition)).toBe(true)
  expect(() => decodeCanonicalStrokeFrame(input, { ...trusted, composition })).toThrow()
})
it('rejects cross-version/profile, forged trusted policy and non-over buildup before material work', () => {
  const { trusted, value, preflightDefinition } = fixture()
  const composition = { ...trusted.composition, outerBlend: 'multiply' as const }
  const context = { ...trusted, rasterProfile: genericProfile, composition }
  const input = { ...value, version: 2, rasterProfile: genericProfile, composition }
  for (const patch of [{version:1}, {rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}, {composition:{...composition,outerBlend:'screen'}},
    {composition:{...composition,mode:'buildup'}}]) expect(() => decodeCanonicalStrokeFrame({...input,...patch},context)).toThrow()
  expect(() => decodeCanonicalStrokeFrame({...value,composition}, {...trusted,composition})).toThrow()
  for(const rasterProfile of ['forged',null]){
    const forged={...context};Reflect.set(forged,'rasterProfile',rasterProfile)
    expect(() => decodeCanonicalStrokeFrame(input,forged)).toThrow()
  }
  const coercion=()=>{throw Error('mode coercion forbidden')}
  expect(()=>decodeCanonicalStrokeFrame({...input,composition:{...composition,outerBlend:{toString:coercion}}},context)).toThrow('Invalid canonical stroke frame envelope')
  expect(preflightDefinition).not.toHaveBeenCalled()
})
it('retains the exact legacy envelope serialization and optional old trusted profile', () => {
  const {trusted,value}=fixture(), bytes=JSON.stringify(value)
  expect(JSON.stringify(decodeCanonicalStrokeFrame(value,trusted).envelope)).toBe(bytes)
  expect(JSON.stringify(decodeCanonicalStrokeFrame(value,{...trusted,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}).envelope)).toBe(bytes)
})


function awareTextureFixture(){
 const primary='asset:'+'1'.repeat(64),pattern='asset:'+'2'.repeat(64)
 const material:CanonicalMaterialContextV3={version:3,assets:[{id:primary,size:2,x:0,y:0,width:2,height:2},{id:pattern,size:4,x:0,y:0,width:3,height:3}],primarySource:{kind:'image',asset:primary,brushScale:1,brushAngle:0},
 primaryTexture:{kind:'canvasTexture',asset:pattern,law:'subtract-u8-v1',width:3,height:3,periodX:3,periodY:3,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},budget:{workUnits:10000,outputBytes:10000,drawPixels:10000}}
 const trusted:CanonicalStrokeFrameContextV3={materialVersion:3,rasterProfile:genericProfile,brush:'brush:chalk@1',strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},material}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:0},draws:[{recipe:{kind:'image',asset:primary,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:2,height:2,mirrorH:false,mirrorV:false},role:'primary',x:0,y:0,opacity:1,flow:1,grainDepth:-0}],fences:[]},material).packed
 const value={version:2,rasterProfile:genericProfile,brush:trusted.brush,strokeId:trusted.strokeId,frameOrdinal:0,pigmentRgb8:trusted.pigmentRgb8,composition:trusted.composition,materialPacked:packed}
 return{trusted,value}
}
it('decodes explicit aware3 via the same envelope/freezing boundary and retains per-DRAW grain',()=>{
 const {trusted,value}=awareTextureFixture(),decoded=decodeCanonicalStrokeFrame(value,trusted)
 expect(decoded.frame.profile).toBe(CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE);expect(Object.is(decoded.frame.draws[0].grainDepth,-0)).toBe(true)
 expect(Object.isFrozen(decoded.frame)).toBe(true);expect(Object.isFrozen(decoded.frame.draws[0])).toBe(true);expect(Object.isFrozen(decoded.envelope.pigmentRgb8)).toBe(true)
 const empty=buildCanonicalMaterial({masked:false,entry:{phase:'mask',group:0},draws:[],fences:[{at:0,kind:'segmentEnd',group:0}]},trusted.material)
 expect(decodeCanonicalStrokeFrame({...value,materialPacked:empty.packed},trusted).frame.entry.phase).toBe('mask')
})
it('keeps top-less fabricated3 refused and requires own exact material selector, context version and genericSC profile',()=>{
 const {trusted,value}=awareTextureFixture(),{materialVersion:_selector,...bare}=trusted
 expect(()=>decodeCanonicalStrokeFrame(value,bare as unknown as CanonicalStrokeFrameContext)).toThrow()
 for(const selector of [undefined,0,1,2,4,'3'])expect(()=>decodeCanonicalStrokeFrame(value,{...trusted,materialVersion:selector} as unknown as CanonicalStrokeFrameContextV3)).toThrow()
 for(const version of [undefined,2,4])expect(()=>decodeCanonicalStrokeFrame(value,{...trusted,material:{...trusted.material,version}} as unknown as CanonicalStrokeFrameContextV3)).toThrow()
 for(const rasterProfile of [CANONICAL_STROKE_RASTER_PROFILE,'browser-highp-rgba8-v1'])expect(()=>decodeCanonicalStrokeFrame({...value,rasterProfile},{...trusted,rasterProfile} as unknown as CanonicalStrokeFrameContextV3)).toThrow()
 expect(()=>decodeCanonicalStrokeFrame({...value,version:1},trusted)).toThrow()
 const old=fixture();expect(()=>decodeCanonicalStrokeFrame(old.value,{...old.trusted,materialVersion:2})).not.toThrow()
})
it('rejects inherited/accessor top selectors and material versions without invoking getter payloads',()=>{
 const {trusted,value}=awareTextureFixture();let calls=0
 for(const prototype of [{materialVersion:3},Object.defineProperty({},'materialVersion',{get(){calls++;return 3}})]){
  const context=Object.create(prototype,Object.getOwnPropertyDescriptors(trusted));delete context.materialVersion
  Object.defineProperty(context,'material',{get(){calls++;return trusted.material}})
  expect(()=>decodeCanonicalStrokeFrame(value,context)).toThrow()
 }
 for(const field of ['materialVersion','material']){
  const context={...trusted},original=Reflect.get(context,field);Object.defineProperty(context,field,{get(){calls++;return original}})
  expect(()=>decodeCanonicalStrokeFrame(value,context)).toThrow()
 }
 const material={...trusted.material};Object.defineProperty(material,'version',{get(){calls++;return 3}})
 expect(()=>decodeCanonicalStrokeFrame(value,{...trusted,material})).toThrow();expect(calls).toBe(0)
})

it('uses captured material and packed bytes even when envelope getters replace caller properties',()=>{
 const f=awareTextureFixture(),original=f.trusted.material
 const trusted={...f.trusted}
 const envelope={...f.value};let packedReads=0
 Object.defineProperty(envelope,'materialPacked',{get(){packedReads++;return packedReads<=2?f.value.materialPacked:'invalid-late-read'}})
 Object.defineProperty(envelope,'composition',{get(){trusted.material={...original,budget:{workUnits:0,outputBytes:0,drawPixels:0}};return f.value.composition}})
 const decoded=decodeCanonicalStrokeFrame(envelope,trusted)
 expect(decoded.frame.draws[0].grainDepth).toBe(-0);expect(decoded.envelope.materialPacked).toBe(f.value.materialPacked);expect(packedReads).toBe(2)
 const old=fixture();let reads=0
 const changing:CanonicalStrokeFrameContext={rasterProfile:genericProfile,brush:f.trusted.brush,strokeId:f.trusted.strokeId,frameOrdinal:0,pigmentRgb8:f.trusted.pigmentRgb8,composition:f.trusted.composition,material:old.trusted.material}
 Object.defineProperty(changing,'material',{get(){reads++;return reads===1?old.trusted.material:original}})
 expect(()=>decodeCanonicalStrokeFrame(f.value,changing)).toThrow();expect(reads).toBe(1)
})

it('rejects an aware3 in-place context downgrade with genuine CMAT2 bytes',()=>{
 const f=awareTextureFixture(),m=f.trusted.material
 const c2={version:2 as const,assets:[m.assets[0]],primarySource:m.primarySource,budget:m.budget}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:0},draws:[],fences:[]},c2).packed
 const envelope={...f.value,materialPacked:packed}
 Object.defineProperty(envelope,'composition',{get(){Reflect.set(m,'version',2);Reflect.set(m,'assets',c2.assets);Reflect.deleteProperty(m,'primaryTexture');return f.value.composition}})
 expect(()=>decodeCanonicalStrokeFrame(envelope,f.trusted)).toThrow()
})
it('keeps admitted aware3 assets and budget independent of in-place envelope callback mutation',()=>{
 const f=awareTextureFixture(),m=f.trusted.material,envelope={...f.value}
 Object.defineProperty(envelope,'composition',{get(){Reflect.set(m.assets[0],'width',1);Reflect.set(m.budget,'drawPixels',0);return f.value.composition}})
 const decoded=decodeCanonicalStrokeFrame(envelope,f.trusted)
 expect(decoded.frame.profile).toBe(CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE)
 expect(Object.is(decoded.frame.draws[0].grainDepth,-0)).toBe(true)
 expect(m.assets[0].width).toBe(1);expect(m.budget.drawPixels).toBe(0)
})
