import { expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, CANONICAL_PRIMARY_TEXTURE_MATERIAL_PROFILE, packCanonicalMaterial, type CanonicalMaterialContext, type CanonicalMaterialContextV3 } from './canonicalMaterialCodec.js'
import { CANONICAL_STROKE_RASTER_PROFILE, decodeCanonicalStrokeFrame, type CanonicalStrokeFrameContext, type CanonicalStrokeFrameEnvelope } from './canonicalStrokeFrame.js'

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
