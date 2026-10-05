import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'

type Probe = {
  _ribbonScratchPool: RibbonScratchPool
  _watercolorPasses: WatercolorPasses
  _settlePlan: WatercolorSettlePlan
  _wcAb: { opDry: boolean }
}

// MockGL verifies resources and execution order, not GLSL pixels. In
// particular this catches colour mobility accidentally reading its own
// absorption alpha, and writing over density before the pigment draw.
describe('coupled pigment and absorption diffusion', () => {
  for (const opDry of [false, true]) for (const wetPeak of [0, 1]) {
    it(`reads one pre-step pigment for both records (opDry=${opDry}, wet=${wetPeak})`, () => {
      const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
      const probe = engine as unknown as Probe
      probe._wcAb.opDry = opDry
      const tile = probe._ribbonScratchPool.acquire(64, 64)
      const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
      scratch.getOrCreate(tile)
      scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
      const calls: Array<{ src: AccumulationBuffer; dst: AccumulationBuffer; gate: AccumulationBuffer; density: AccumulationBuffer }> = []
      const original = probe._watercolorPasses.diffuseStep.bind(probe._watercolorPasses)
      const spy = vi.spyOn(probe._watercolorPasses, 'diffuseStep').mockImplementation((...args) => {
        calls.push({ src: args[6], dst: args[7], gate: args[10], density: args[11] ?? args[6] })
        original(...args)
      })
      try {
        const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.2, 8, 1, wetPeak, 1, wetPeak)
        expect(plan).not.toBeNull()
        for (const op of plan!.ops) op()
        plan!.finish()
        expect(calls.length).toBeGreaterThan(0)
        expect(calls.length % 2).toBe(0)
        for (let i = 0; i < calls.length; i += 2) {
          const colour = calls[i], pigment = calls[i + 1]
          expect(colour.density).toBe(pigment.src)
          expect(pigment.density).toBe(pigment.src)
          expect(colour.src).not.toBe(pigment.src)
          expect(colour.dst).not.toBe(colour.density)
          expect(pigment.dst).not.toBe(pigment.density)
          expect(colour.gate).toBe(pigment.gate)
        }
      } finally {
        spy.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
      }
    })
  }
})

for (const radius of [8, 200]) it(`keeps paired brush state and executes every pulse (radius=${radius})`, () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe
  probe._wcAb.opDry = true
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  scratch.brushTravel.push({ x: 32, y: 32, radius, aspect: 1, angle: 0, dx: radius * 4, dy: 0, water: 1 })
  const remob = vi.spyOn(probe._watercolorPasses, 'fieldOp')
  const brush = vi.spyOn(probe._watercolorPasses, 'brushPass')
  try {
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.4, radius, 1, 1, 1, 1)
    expect(plan).not.toBeNull()
    const multiplicities = new Map<() => void, number>()
    for (const op of plan!.ops) multiplicities.set(op, (multiplicities.get(op) ?? 0) + 1)
    const repeatedPulses = Math.max(...multiplicities.values())
    if (radius === 200) expect(repeatedPulses).toBeGreaterThan(64)
    for (const op of plan!.ops) op()
    const calls = brush.mock.calls
    expect(calls).toHaveLength(repeatedPulses * 2)
    expect(calls.length).toBeGreaterThan(2)
    expect(calls.length % 2).toBe(0)
    for (let i = 0; i < calls.length; i += 2) {
      const colour = calls[i], pigment = calls[i + 1]
      expect(colour[6]).toBe(pigment[4])
      expect(pigment[6]).toBe(pigment[4])
      expect(colour[9]).toBe(colour[4])
      expect(pigment[9]).toBe(colour[4])
      expect(colour[5]).not.toBe(pigment[5])
      expect(colour[8]).toEqual(pigment[8])
      expect(colour[10]).toBe(pigment[10])
      expect(colour[2]).toBe(4 * colour[3])
    }
    const wet = remob.mock.calls.filter(call => call[3] === 18)
    expect(wet).toHaveLength(2)
    const colourWet = wet[0], pigmentWet = wet[1]
    expect(colourWet[5]?.origin?.[1]).toBe(1)
    expect(colourWet[5]?.c).toBe(pigmentWet[1])
    expect(colourWet[5]?.e).toBe(pigmentWet[2])
    expect(pigmentWet[5]?.origin?.[1]).toBe(0)
    expect(colourWet[5]?.origin?.[0]).toBe(pigmentWet[5]?.origin?.[0])
  } finally {
    remob.mockRestore(); brush.mockRestore()
    scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
  }
})

it('uses the same transport schedule for equal water from the brush or the paper', () => {
  const schedules = [0, 1].map(paperWet => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile)
    scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
    const diffusion = vi.spyOn(probe._watercolorPasses, 'diffuseStep')
    const fields = vi.spyOn(probe._watercolorPasses, 'fieldOp')
    try {
      const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0, 8, 1, paperWet, 1, paperWet)!
      for (const op of plan.ops) op()
      plan.finish()
      return {
        diffusion: diffusion.mock.calls.map(call => [call[8], call[9]]),
        fields: fields.mock.calls.map(call => [call[3], call[4], call[5]?.band, call[5]?.origin]),
      }
    } finally {
      diffusion.mockRestore(); fields.mockRestore()
      scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
    }
  })
  expect(schedules[0]).toEqual(schedules[1])
})

it('keeps interior supply coupled to the pre-step pigment without aliasing either output', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 256, height: 256 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(256, 256)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  const fields = vi.spyOn(probe._watercolorPasses, 'fieldOp')
  try {
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 40, minY: 40, maxX: 216, maxY: 216 }, 0, 65, 1, 1, 1, 1)!
    for (const op of plan.ops) op()
    const supply = fields.mock.calls.filter(call => call[5]?.band?.[1] === 1 && (call[3] === 15 || call[3] === 16))
    expect(supply.length).toBeGreaterThan(0)
    expect(supply.length % 2).toBe(0)
    for (let i = 0; i < supply.length; i += 2) {
      const colour = supply[i], pigment = supply[i + 1]
      expect(colour[3]).toBe(16)
      expect(pigment[3]).toBe(15)
      expect(colour[5]?.c).toBe(pigment[1])
      expect(colour[0]).not.toBe(pigment[1])
      expect(pigment[0]).not.toBe(pigment[1])
      expect(colour[0]).not.toBe(colour[1])
      expect(colour[4]).toBe(pigment[4])
      expect(colour[5]?.dir).toEqual(pigment[5]?.dir)
      expect(colour[5]?.d).toBe(pigment[5]?.d)
    }
  } finally {
    fields.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
  }
})

it('keeps topology markers outside pigment outputs and returns both temporary buffers', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 256, height: 256 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(256, 256)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  const markers = vi.spyOn(probe._watercolorPasses, 'interiorMarker')
  const fields = vi.spyOn(probe._watercolorPasses, 'fieldOp')
  const release = vi.spyOn(probe._ribbonScratchPool, 'release')
  try {
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 40, minY: 40, maxX: 216, maxY: 216 }, 0, 65, 1, 1, 1, 1)!
    for (const op of plan.ops) op()
    expect(markers.mock.calls).toHaveLength(2)
    const blocked = markers.mock.calls[0][0], marker = markers.mock.calls[1][0]
    expect(marker).not.toBe(blocked)
    expect(markers.mock.calls[1][2]).toBe(blocked)
    const resweep = fields.mock.calls.filter(c => c[5]?.band?.[1] === 2)
    expect(resweep.length).toBeGreaterThan(0)
    for (const call of resweep) {
      expect(call[5]?.e).toBe(marker)
      expect(call[0]).not.toBe(marker)
      expect(call[0]).not.toBe(blocked)
    }
    plan.finish()
    expect(release.mock.calls.filter(c => c[0] === marker)).toHaveLength(1)
    expect(release.mock.calls.filter(c => c[0] === blocked)).toHaveLength(1)
  } finally {
    markers.mockRestore(); fields.mockRestore(); release.mockRestore()
    scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
  }
})

it('disposes marker buffers if a prepared settle is abandoned before its first GPU step', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 256, height: 256 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(256, 256)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  const planOwner = probe._settlePlan as unknown as { _pendingInteriorMarkers: Set<AccumulationBuffer> }
  probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
    { minX: 40, minY: 40, maxX: 216, maxY: 216 }, 0, 65, 1, 1, 1, 1)
  const markers = [...planOwner._pendingInteriorMarkers]
  expect(markers).toHaveLength(2)
  const destroys = markers.map(marker => vi.spyOn(marker, 'destroy'))
  scratch.destroy(); probe._ribbonScratchPool.release(tile)
  engine.destroy()
  for (const spy of destroys) { expect(spy).toHaveBeenCalledTimes(1); spy.mockRestore() }
  expect(planOwner._pendingInteriorMarkers.size).toBe(0)
})

it('returns the first marker when the second allocation fails', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 256, height: 256 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(256, 256)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  const owner = probe._settlePlan as unknown as { _pendingInteriorMarkers: Set<AccumulationBuffer> }
  const original = probe._ribbonScratchPool.acquire.bind(probe._ribbonScratchPool)
  let first: AccumulationBuffer | undefined
  const acquire = vi.spyOn(probe._ribbonScratchPool, 'acquire').mockImplementation((w, h) => {
    if (owner._pendingInteriorMarkers.size === 1) {
      first = [...owner._pendingInteriorMarkers][0]
      throw new Error('marker allocation failure')
    }
    return original(w, h)
  })
  const release = vi.spyOn(probe._ribbonScratchPool, 'release')
  try {
    expect(() => probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 40, minY: 40, maxX: 216, maxY: 216 }, 0, 65, 1, 1, 1, 1)).toThrow('marker allocation failure')
    expect(first).toBeDefined()
    expect(release.mock.calls.filter(call => call[0] === first)).toHaveLength(1)
    expect(owner._pendingInteriorMarkers.size).toBe(0)
  } finally {
    acquire.mockRestore(); release.mockRestore()
    scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
  }
})
