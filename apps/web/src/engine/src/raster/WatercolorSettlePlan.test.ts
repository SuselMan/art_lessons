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

for (const flow of [false, true]) for (const foreign of [false, true]) {
  it(`captures the old film in the first queue entry despite uploads (flow=${flow}, foreign=${foreign})`, () => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.filmBuffers(tile)
    const entry = scratch.peek(tile)!
    const capturedGesture = scratch.gesture
    scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
    if (flow) scratch.brushTravel.push({ x: 32, y: 32, radius: 8, aspect: 1, angle: 0, dx: 32, dy: 0, water: 1 })
    if (foreign) {
      const footprint = { x: 32, y: 32, radius: 8, aspect: 1, angle: 0 }
      scratch.foreignSources = [{ gesture: 'earlier-water', footprints: [footprint] }]
      scratch.wetContacts = [footprint]
    }
    const pigment = vi.spyOn(entry.inkLoad!, 'copyRegionInto')
    const base = vi.spyOn(entry.inkBase!, 'copyRegionInto')
    const transport = vi.spyOn(probe._watercolorPasses, 'diffuseStep')
    try {
      const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.2, 8, 1, 1, 1, 1)!
      expect(pigment).not.toHaveBeenCalled()
      expect(base).not.toHaveBeenCalled()
      // Queue.start runs only this entry before yielding to the next film.
      plan.ops[0]()
      expect(pigment).toHaveBeenCalled()
      expect(base).toHaveBeenCalled()
      expect(entry.filmGesture).toBe(capturedGesture)
      expect(transport).not.toHaveBeenCalled()
      scratch.newFilm()
      scratch.filmBuffers(tile)
      expect(entry.filmGesture).not.toBe(capturedGesture)
      for (const op of plan.ops.slice(1)) op()
      plan.finish()
      expect(transport).toHaveBeenCalled()
    } finally {
      pigment.mockRestore(); base.mockRestore(); transport.mockRestore()
      scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
    }
  })
}

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

it('owns a solvent field until finish or pending-plan destruction, never both', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.solventFilm(tile)
  const owned = (probe._settlePlan as unknown as { _ownedInputs: Set<AccumulationBuffer> })._ownedInputs
  const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 20, minY: 20, maxX: 44, maxY: 44 })!
  expect(owned.size).toBe(1)
  const field = [...owned][0]
  const destroy = vi.spyOn(field, 'destroy')
  const release = vi.spyOn(probe._ribbonScratchPool, 'release')
  try {
    probe._settlePlan.destroyTextures()
    expect(destroy).toHaveBeenCalledOnce()
    expect(owned.size).toBe(0)
    const land = vi.spyOn(probe._watercolorPasses, 'fieldOp')
    // The queue abort closes the plan after its outer owner forgets/destroys inputs.
    plan.dispose(); plan.finish(); plan.dispose()
    expect(land).not.toHaveBeenCalled()
    expect(release.mock.calls.some(([buffer]) => buffer === field)).toBe(false)
  } finally {
    release.mockRestore(); destroy.mockRestore()
    scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
  }
})

it('retains independent solvent when a film ends and when a wash is parked', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  try {
    const film = scratch.solventFilm(tile)
    expect(scratch.spill(() => ({ originX: 0, originY: 0 }))).toBeNull()
    scratch.releaseFilm()
    expect(scratch.peek(tile)?.solventLoad).toBe(film.load)
    expect(scratch.peek(tile)?.strokeSolvent).toBeNull()
    const parked = scratch.spill(() => ({ originX: 0, originY: 0 }))
    expect(parked).not.toBeNull()
    expect(parked!.tiles[0].bufs.solventLoad).toBeDefined()
    parked!.dispose()
  } finally { scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy() }
})

it('returns this job write domain independently of an old wash storage union', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile)
  scratch.noteStorageBounds({ minX: -500, minY: -500, maxX: 500, maxY: 500 })
  const source = { minX: 20, minY: 20, maxX: 44, maxY: 44 }
  try {
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], source, 0.2, 8, 1, 1, 1, 1)
    expect(plan?.compositeDomain).toEqual({ minX: 0, minY: 0, maxX: 64, maxY: 64 })
    expect(source).toEqual({ minX: 20, minY: 20, maxX: 44, maxY: 44 })
  } finally { scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy() }
})
