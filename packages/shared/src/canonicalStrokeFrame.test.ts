import { expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, packCanonicalMaterial, type CanonicalMaterialContext } from './canonicalMaterialCodec.js'
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
