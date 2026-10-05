import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'

describe('default-off solvent carry replacement', () => {
  for (const [enabled, colors, gestures, clearWater] of [[false, 1, 1, true], [true, 1, 1, true], [true, 2, 1, true], [true, 1, 2, true], [true, 1, -1, true], [true, 1, 1, false]] as const) {
    it(`uses one immutable P/V state and excludes legacy carry (enabled=${enabled}, colors=${colors}, gestures=${gestures})`, () => {
      const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
      const probe = engine as unknown as {
        _ribbonScratchPool: RibbonScratchPool; _watercolorPasses: WatercolorPasses
        _settlePlan: Pick<WatercolorSettlePlan, 'prepare'> & { _ownedSolvent: Set<unknown> }
        _wcAb: { solventFlux: boolean }
      }
      probe._wcAb.solventFlux = enabled
      const tile = probe._ribbonScratchPool.acquire(64, 64)
      const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
      scratch.getOrCreate(tile); scratch.solventFilm(tile); scratch.paints.add('1,0,0')
      scratch.solventPigmentGestures = gestures
      scratch.solventInitialClearWater = clearWater
      if (colors === 2) scratch.paints.add('0,0,1')
      const flux = vi.spyOn(probe._watercolorPasses, 'solventFlux')
      const fieldOp = vi.spyOn(probe._watercolorPasses, 'fieldOp')
      try {
        const plan = probe._settlePlan.prepare(scratch,
          [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
          { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.4, 8, 1, 1, 1, 1)
        expect(plan).not.toBeNull()
        const active = enabled && colors === 1 && gestures === 1 && clearWater
        expect(probe._settlePlan._ownedSolvent.size).toBe(active ? 3 : 1)
        for (const op of plan!.ops) op()
        expect(flux.mock.calls).toHaveLength(active ? 24 : 0)
        const legacyCarry = fieldOp.mock.calls.filter(c => c[3] === 15)
        if (active) expect(legacyCarry).toHaveLength(0)
        else expect(legacyCarry.length).toBeGreaterThan(0)
        for (let i = 0; i < flux.mock.calls.length; i += 2) {
          const pigment = flux.mock.calls[i], volume = flux.mock.calls[i + 1]
          expect(pigment[1]).toBe(volume[1]); expect(pigment[2]).toBe(volume[2])
          expect(pigment[0]).not.toBe(pigment[1]); expect(volume[0]).not.toBe(volume[2])
          expect(pigment[7]).toBe(false); expect(volume[7]).toBe(true)
        }
        plan!.finish()
        expect(probe._settlePlan._ownedSolvent.size).toBe(0)
      } finally {
        flux.mockRestore(); fieldOp.mockRestore(); scratch.destroy()
        probe._ribbonScratchPool.release(tile); engine.destroy()
      }
    })
  }
})

it('returns both solvent allocations when the second extra buffer fails', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as {
    _ribbonScratchPool: RibbonScratchPool
    _settlePlan: Pick<WatercolorSettlePlan, 'prepare'> & { _ownedSolvent: Set<unknown> }
    _wcAb: { solventFlux: boolean }
  }
  probe._wcAb.solventFlux = true
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile); scratch.solventFilm(tile); scratch.paints.add('1,0,0')
  scratch.solventPigmentGestures = 1
  scratch.solventInitialClearWater = true
  const acquire = probe._ribbonScratchPool.acquire.bind(probe._ribbonScratchPool)
  const spy = vi.spyOn(probe._ribbonScratchPool, 'acquire').mockImplementation((...args) => {
    if (probe._settlePlan._ownedSolvent.size === 2) throw Error('forced second extra allocation failure')
    return acquire(...args)
  })
  try {
    expect(() => probe._settlePlan.prepare(scratch,
      [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.4, 8, 1, 1, 1, 1)).toThrow('forced second extra')
    expect(probe._settlePlan._ownedSolvent.size).toBe(0)
  } finally {
    spy.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
  }
})

it('keeps physical stroke purity across chunks and snapshot restore', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  engine.initLayer('purity')
  const probe = engine as unknown as { _ribbonScratchPool: RibbonScratchPool; _layers: Map<string, ILayerBuffer>; gl: WebGLRenderingContext }
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  try {
    scratch.beginStroke(); scratch.solventInitialClearWater = true
    scratch.beginStroke(); scratch.solventPigmentGestures = 1; scratch.solventPigmentStroke = scratch.solventStrokeSerial
    const serial = scratch.solventStrokeSerial
    scratch.newFilm(); scratch.newFilm()
    expect(scratch.solventStrokeSerial).toBe(serial)
    const snap = scratch.snapshot(probe.gl, () => null)!
    const restored = RibbonStrokeScratch.restore(probe._ribbonScratchPool, snap, probe._layers.get('purity')!)
    expect(restored.solventStrokeSerial).toBe(serial)
    expect(restored.solventPigmentStroke).toBe(serial)
    expect(restored.solventInitialClearWater).toBe(true)
    expect(restored.solventPigmentGestures).toBe(1)
    restored.destroy()
    delete snap.solventStrokeSerial; delete snap.solventPigmentStroke
    delete snap.solventInitialClearWater; delete snap.solventPigmentGestures
    const unknown = RibbonStrokeScratch.restore(probe._ribbonScratchPool, snap, probe._layers.get('purity')!)
    expect(unknown.solventPigmentGestures).toBe(-1)
    expect(unknown.solventInitialClearWater).toBe(false)
    unknown.destroy()
  } finally { scratch.destroy(); engine.destroy() }
})
