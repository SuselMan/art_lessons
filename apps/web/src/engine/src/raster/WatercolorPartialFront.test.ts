import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { SettleField } from '../buffers/SettleField'

type Probe = { _ribbonScratchPool: RibbonScratchPool; _watercolorPasses: WatercolorPasses; _settlePlan: WatercolorSettlePlan; _fieldCache: SettleField[] }
function fixture(enabled = true, split = false, side = 64, paints = 1, ox = 0, oy = 0, edge = false, narrow = false, owner = true) {
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
  const plan = p._settlePlan.prepare(scratch, [{ buffer: tile, originX: ox, originY: oy, contentRect: null }],
    { minX: ox + (edge ? 0 : narrow ? side / 2 - 12 : 20), minY: oy + (narrow ? side / 2 - 12 : 20), maxX: ox + (narrow ? side / 2 + 12 : 44), maxY: oy + (narrow ? side / 2 + 12 : 44) }, 0, narrow ? 1 : 8, narrow ? 0 : 1, narrow ? 0 : 1, narrow ? 0 : 1, narrow ? 0 : 1, 0, preview, false, undefined, owner)!
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

  it('copies a translated subrectangle as absolute bytes and preserves nonzero tile background outside it', () => {
    const f = fixture(true, false, 512, 1, 400, 300, false, true)
    try {
      f.plan.ops[0](); f.plan.ops[1]()
      const crop = [...f.owned].find(b => b.width < 512 && b.width !== 1536)!
      expect(crop).toBeDefined(); expect(crop.width).toBeLessThan(512)
      const spies = [...f.owned].filter(b => b.width === crop.width).map(b => vi.spyOn(b, 'copyRegionInto'))
      try {
        for (const op of f.plan.ops.slice(2)) op()
        const calls = spies.flatMap(s => s.mock.calls).filter(c => c[0].width === 512)
        expect(calls.length).toBeGreaterThan(0)
        for (const [, sx, sy, dx, dy, w, h] of calls) {
          expect([sx, sy, w, h]).toEqual([0, 0, crop.width, crop.height])
          expect(dx).toBeGreaterThan(0); expect(dy).toBeGreaterThan(0)
          // copyTexSubImage2D copies absolute bytes. Exercise actual observed
          // source/destination coordinates with nonuniform RGBA source and
          // nonzero existing tile, independently of shader transport.
          const tile = new Uint8Array(512 * 512 * 4).fill(19), before = tile.slice()
          let copiedSum = 0, expectedSum = 0
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let ch = 0; ch < 4; ch++) {
            const value = (x * 3 + y * 5 + ch * 11) % 127 + 20
            const target = ((dy + y) * 512 + dx + x) * 4 + ch
            tile[target] = value; copiedSum += tile[target]; expectedSum += value
          }
          expect(copiedSum).toBe(expectedSum)
          let outsideChanged = 0
          for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
            if (x >= dx && x < dx + w && y >= dy && y < dy + h) continue
            const i = (y * 512 + x) * 4
            for (let ch = 0; ch < 4; ch++) if (tile[i + ch] !== before[i + ch]) outsideChanged++
          }
          expect(outsideChanged).toBe(0)
        }
      } finally { for (const spy of spies) spy.mockRestore() }
    } finally { f.cleanup() }
  })

  it('requires immutable presentation owner even when splitQuanta is off', () => {
    const f = fixture(true, false, 64, 1, 0, 0, false, false, false)
    try { f.plan.ops[0](); f.plan.ops[1](); expect(f.owned.size).toBe(1) }
    finally { f.cleanup() }
  })

  it('rejects a source envelope at the crop edge and bounds unit transport before the guard ring', () => {
    const edge = fixture(true, false, 64, 1, 400, 300, true)
    try { edge.plan.ops[0](); edge.plan.ops[1](); expect(edge.owned.size).toBe(1) }
    finally { edge.cleanup() }
    const f = fixture(true, true)
    try {
      for (const op of f.plan.ops) op()
      const unitP = f.fieldOp.mock.calls.filter(c => c[0].width === 64 && c[3] === 15)
      expect(unitP.length).toBeGreaterThan(0); expect(unitP.length).toBeLessThanOrEqual(20 - 5)
    } finally { f.cleanup() }
  })

  it('preserves absolute S1 records at nonzero world origin without adding the background twice', () => {
    const f = fixture(true, false, 64, 1, 400, 300)
    const fieldCopy = vi.spyOn(f.field.c, 'copyRegionInto')
    const entry = f.scratch.peek(f.tile)!
    const base = entry.inkLoad!, baseCopy = vi.spyOn(base, 'copyTo')
    try {
      f.plan.ops[0](); f.plan.ops[1]()
      const crops = [...f.owned].filter(b => b.width === 64)
      const spies = crops.map(b => vi.spyOn(b, 'copyRegionInto'))
      try {
        for (const op of f.plan.ops.slice(2)) op()
        expect(fieldCopy.mock.calls[0].slice(1)).toEqual([0, 1472, 0, 0, 64, 64])
        // Present first copies the existing whole tile, then overwrites the
        // overlap with the absolute reconstructed field, exactly as S1
        // fromField. The base is not an arithmetic operand of reconstruction.
        expect(baseCopy).toHaveBeenCalled()
        const writes = spies.flatMap(s => s.mock.calls)
        expect(writes.length).toBeGreaterThan(0)
        for (const call of writes) expect(call.slice(1)).toEqual([0, 0, 0, 0, 64, 64])
        const rebuilt = f.fieldOp.mock.calls.filter(c => c[0].width === 64 && c[3] === 1 && c[4] === 1)
        expect(rebuilt.length).toBeGreaterThan(0)
        for (const call of rebuilt) expect(call[1]).not.toBe(base)
      } finally { for (const spy of spies) spy.mockRestore() }
    } finally { fieldCopy.mockRestore(); baseCopy.mockRestore(); f.cleanup() }
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
