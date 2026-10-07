import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { SettleField } from '../buffers/SettleField'

type Probe = { _ribbonScratchPool: RibbonScratchPool; _watercolorPasses: WatercolorPasses; _settlePlan: WatercolorSettlePlan; _fieldCache: SettleField[] }
function fixture(enabled = true, split = false, side = 64, paints = 1) {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: side, height: side })
  const p = engine as unknown as Probe, pool = p._ribbonScratchPool, tile = pool.acquire(side, side)
  const scratch = new RibbonStrokeScratch(pool, true, true)
  scratch.filmBuffers(tile); scratch.solventFilm(tile)
  if (paints > 0) scratch.paints.add('1,0,0')
  if (paints > 1) scratch.paints.add('0,0,1')
  p._settlePlan.diagnosticPartialFrontPreview = enabled
  p._settlePlan.diagnosticPlateauPhase = true
  p._settlePlan.splitQuanta = split
  const fieldOp = vi.spyOn(p._watercolorPasses, 'fieldOp')
  const preview = vi.fn()
  const plan = p._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
    { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0, 8, 1, 1, 1, 1, 0, preview, false, undefined, split)!
  const field = p._fieldCache[0], owned = (p._settlePlan as unknown as { _ownedInputs: Set<AccumulationBuffer> })._ownedInputs
  return { engine, p, pool, tile, scratch, fieldOp, preview, plan, field, owned,
    cleanup() { fieldOp.mockRestore(); plan.dispose(); scratch.destroy(); pool.release(tile); engine.destroy() } }
}

describe('cropped presentation-only partial front', () => {
  it('uses the real 1536 field with twelve bounded owned crops and bottom-up coordinates', () => {
    const f = fixture(); const source = vi.spyOn(f.field.c, 'copyRegionInto')
    try {
      expect(f.field.w).toBe(1536); expect(f.field.h).toBe(1536)
      f.plan.ops[0](); f.plan.ops[1]()
      const crops = [...f.owned].filter(b => b.width === 64 && b.height === 64)
      expect(crops).toHaveLength(12)
      expect(crops.reduce((n, b) => n + b.width * b.height * 4, 0)).toBe(12 * 64 * 64 * 4)
      expect(source.mock.calls[0].slice(1)).toEqual([0, 1536 - 64, 0, 0, 64, 64])
      expect(crops.filter(b => (b as unknown as { _baseFilter: string })._baseFilter === 'linear')).toHaveLength(1)
    } finally { source.mockRestore(); f.cleanup() }
  })

  it('maps a cropped bottom-up row into the same tile row without rescaling', () => {
    const f = fixture()
    try {
      f.plan.ops[0](); f.plan.ops[1]()
      const crops = [...f.owned].filter(b => b.width === 64)
      const spies = crops.map(b => vi.spyOn(b, 'copyRegionInto'))
      try {
        for (const op of f.plan.ops.slice(2)) op()
        const writes = spies.flatMap(s => s.mock.calls).filter(c => c[0].width === 64)
        expect(writes.length).toBeGreaterThan(0)
        for (const call of writes) expect(call.slice(1)).toEqual([0, 0, 0, 0, 64, 64])
      } finally { for (const spy of spies) spy.mockRestore() }
    } finally { f.cleanup() }
  })

  it('moves only private P/C with one pre-step pigment and leaves canonical draw sequence unchanged', () => {
    const schedules: unknown[][] = []
    for (const enabled of [false, true]) {
      const f = fixture(enabled)
      try {
        f.plan.ops[0](); f.plan.ops[1]()
        const source = vi.spyOn(f.field.c, 'copyRegionInto')
        for (const op of f.plan.ops.slice(2)) op()
        expect(source).not.toHaveBeenCalled() // Seed is copied once, never resampled from mutable canonical c.
        source.mockRestore()
        const fields = new Map(Object.entries(f.field).filter(([, b]) => typeof b === 'object').map(([k, b]) => [b, k]))
        schedules.push(f.fieldOp.mock.calls.filter(c => fields.has(c[0])).map(c => [fields.get(c[0]), fields.get(c[1]), fields.get(c[2]), c[3], c[4], c[5]?.band, c[5]?.dir]))
        const partial = f.fieldOp.mock.calls.filter(c => c[0].width === 64 && (c[3] === 15 || c[3] === 16))
        if (enabled) {
          expect(partial.length).toBeGreaterThan(0); expect(partial.length % 2).toBe(0)
          for (let i = 0; i < partial.length; i += 2) {
            const color = partial[i], pigment = partial[i + 1]
            expect(color[3]).toBe(16); expect(pigment[3]).toBe(15)
            expect(color[5]?.c).toBe(pigment[1]); expect(color[5]?.d).toBe(pigment[5]?.d)
            expect(color[5]?.e).toBe(pigment[5]?.e)
            expect(color[0]).not.toBe(pigment[1]); expect(pigment[0]).not.toBe(pigment[1])
            expect(pigment[0]).not.toBe(pigment[2]); expect(color[0].width).toBe(pigment[5]?.d?.width)
          }
          const partialFirst = f.fieldOp.mock.calls.findIndex(c => c[0].width === 64 && c[3] === 15)
          const canonicalFirst = f.fieldOp.mock.calls.findIndex(c => c[0].width === 1536 && c[3] === 15)
          expect(partialFirst).toBeLessThan(canonicalFirst)
          expect(f.preview).toHaveBeenCalled()
        } else expect(partial).toHaveLength(0)
      } finally { f.cleanup() }
    }
    expect(schedules[1]).toEqual(schedules[0])
  })

  for (const [side, paints] of [[64, 0], [64, 2], [513, 1]]) {
    it(`does not allocate partial crops outside the single small blot scope (${side}, ${paints})`, () => {
      const f = fixture(true, false, side, paints)
      try { f.plan.ops[0](); f.plan.ops[1](); expect(f.owned.size).toBe(1) }
      finally { f.cleanup() }
    })
  }

  for (const path of ['dispose', 'destroy', 'loss'] as const) {
    it(`retires each copied input once and keeps linear cost out of the NEAREST pool (${path})`, () => {
      const f = fixture(true, true)
      f.plan.ops[0](); f.plan.ops[1]()
      const copies = [...f.owned].filter(b => b.width === 64), linear = copies.find(b => (b as unknown as { _baseFilter: string })._baseFilter === 'linear')!
      const destroyed = vi.spyOn(linear, 'destroy'), release = vi.spyOn(f.pool, 'release')
      try {
        if (path === 'destroy') f.p._settlePlan.destroyTextures()
        if (path === 'loss') f.p._settlePlan.forgetTextures()
        f.plan.dispose(); f.plan.dispose()
        expect(f.owned.size).toBe(0)
        expect(release.mock.calls.filter(([b]) => b === linear)).toHaveLength(0)
        expect(destroyed).toHaveBeenCalledTimes(path === 'loss' ? 0 : 1)
        if (path === 'dispose') for (const copy of copies.filter(b => b !== linear)) expect(release.mock.calls.filter(([b]) => b === copy)).toHaveLength(1)
        if (path !== 'dispose') for (const copy of copies) expect(release.mock.calls.filter(([b]) => b === copy)).toHaveLength(0)
      } finally { destroyed.mockRestore(); release.mockRestore(); f.cleanup() }
    })
  }

  it('can cancel owner14 from the first partial callback without later presentation writes or orphaned generators', () => {
    const f = fixture(true, true)
    try {
      f.preview.mockImplementationOnce(() => f.plan.dispose())
      for (const op of f.plan.ops) { op(); if (f.preview.mock.calls.length) break }
      expect(f.preview).toHaveBeenCalledOnce(); expect(f.owned.size).toBe(0)
      const n = f.fieldOp.mock.calls.length
      for (const op of f.plan.ops) op()
      expect(f.fieldOp.mock.calls.length).toBe(n)
    } finally { f.cleanup() }
  })
})
