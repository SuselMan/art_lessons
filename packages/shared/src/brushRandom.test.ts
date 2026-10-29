import { expect, it } from 'vitest'
import { hasValidBrushRandomContext, isBrushRandomSeeds } from './brushRandom.js'
const seeds = { version: 1, sequentialSeed: 0, strokeSeed: 0xffffffff }
const context = { tool: 'digitalBrush', strokeId: 'gesture', brushRandom: seeds }
it('accepts both uint32 endpoints and the same context on live and final chunks', () => {
  expect(isBrushRandomSeeds(seeds)).toBe(true)
  expect(isBrushRandomSeeds({ ...seeds, sequentialSeed: 0xffffffff, strokeSeed: 0 })).toBe(true)
  expect(hasValidBrushRandomContext(context)).toBe(true)
  expect(hasValidBrushRandomContext({ ...context, type: 'stroke', strokeEnd: true, dabsPacked: '' })).toBe(true)
  expect(hasValidBrushRandomContext({ type: 'stroke', tool: 'pencil' })).toBe(true)
  expect(hasValidBrushRandomContext({ type: 'layer_clear' })).toBe(true)
  expect(hasValidBrushRandomContext({ ...context, brushRandom: undefined })).toBe(true)
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
