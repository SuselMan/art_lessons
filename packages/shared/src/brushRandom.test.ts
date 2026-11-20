import { expect, it } from 'vitest'
import { createBrushRandomStrokeId, hasValidBrushRandomContext, isBrushRandomSeeds } from './brushRandom.js'
const seeds = { version: 1 as const, sequentialSeed: 0, strokeSeed: 0xffffffff }
const context = { tool: 'digitalBrush', strokeId: createBrushRandomStrokeId('nonce_12345', seeds), brushRandom: seeds }
it('accepts both uint32 endpoints and the same context on live and final chunks', () => {
  expect(isBrushRandomSeeds(seeds)).toBe(true)
  expect(isBrushRandomSeeds({ ...seeds, sequentialSeed: 0xffffffff, strokeSeed: 0 })).toBe(true)
  expect(hasValidBrushRandomContext(context)).toBe(true)
  expect(hasValidBrushRandomContext({ ...context, type: 'stroke', strokeEnd: true, dabsPacked: '' })).toBe(true)
  expect(hasValidBrushRandomContext({ type: 'stroke', tool: 'pencil' })).toBe(true)
  expect(hasValidBrushRandomContext({ type: 'layer_clear' })).toBe(true)
  expect(hasValidBrushRandomContext({ ...context, brushRandom: undefined })).toBe(false)
})
it('rejects malformed, ambiguous and noninteger source states', () => {
  for (const value of [null, [], false, 0, 'seed', {}, { ...seeds, extra: 0 }, { ...seeds, version: 2 },
    ...[NaN, Infinity, -1, .1, 0x100000000, true, '0', null, undefined].flatMap(word => [
      { ...seeds, sequentialSeed: word }, { ...seeds, strokeSeed: word },
    ]), Object.assign(Object.create({ inherited: true }), seeds)]) expect(isBrushRandomSeeds(value)).toBe(false)
  expect(isBrushRandomSeeds(Object.assign(Object.create(null), seeds))).toBe(true)
})
it('validates original live metadata and final metadata before permission shortcuts', () => {
  for (const patch of [{ tool: 'pencil' }, { tool: undefined }, { strokeId: '' }, { strokeId: 'a'.repeat(201) },
    { strokeId: null }, { strokeId: 1 }, { type: 'layer_clear' }, { brushRandom: {} }]) {
    expect(hasValidBrushRandomContext({ ...context, ...patch })).toBe(false)
  }
  for (const value of [null, false, [], undefined]) expect(hasValidBrushRandomContext(value)).toBe(false)
})

it('binds explicit source bits to identity across chunks, layers and JSON roundtrips without a cache', () => {
  expect(context.strokeId).toBe('br1.nonce_12345.00000000.ffffffff')
  expect(hasValidBrushRandomContext(JSON.parse(JSON.stringify({ ...context, packetSeq: 8, layerId: 'other' })))).toBe(true)
  for (const brushRandom of [{ ...seeds, sequentialSeed: 1 }, { ...seeds, strokeSeed: 0 }, undefined]) {
    expect(hasValidBrushRandomContext({ ...context, brushRandom })).toBe(false)
  }
  for (const strokeId of ['legacy_nanoid', 'br1.nonce_12345.00000000.FFFFFFFF', 'br2.nonce_12345.00000000.ffffffff', 'br1.bad.00000000.ffffffff']) {
    expect(hasValidBrushRandomContext({ ...context, strokeId })).toBe(false)
  }
  expect(hasValidBrushRandomContext({ strokeId: 'legacy_nanoid', tool: 'digitalBrush' })).toBe(true)
  expect(hasValidBrushRandomContext({ strokeId: 'br2.nonce_12345.00000000.ffffffff', tool: 'digitalBrush' })).toBe(false)
  expect(() => createBrushRandomStrokeId('short', seeds)).toThrow(RangeError)
  expect(() => createBrushRandomStrokeId('nonce_12345', { ...seeds, sequentialSeed: -1 })).toThrow(RangeError)
})
