import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { WatercolorSettleQueue } from '../watercolor/WatercolorSettleQueue'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { WC_BLOOM_WET_LO, WC_BLOOM_WET_HI } from '../presets/watercolorPresets'

type Probe = {
  _ribbonScratchPool: RibbonScratchPool
  _watercolorPasses: WatercolorPasses
  _settlePlan: WatercolorSettlePlan
  _settleQueue: WatercolorSettleQueue
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

it('omits invisible intermediate preview during a drain while preserving the solver passes', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe & { _settleQueue: import('../watercolor/WatercolorSettleQueue').WatercolorSettleQueue }
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile); scratch.paints.add('1,0,0')
  const preview = vi.fn(), passes = vi.spyOn(probe._watercolorPasses, 'diffuseStep')
  let clock = performance.now()
  const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 200))
  try {
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.2, 8, 1, 1, 1, 1, 0, preview)
    expect(plan).not.toBeNull()
    probe._settleQueue.suppressDrainPreview = true
    probe._settleQueue.start(scratch, plan!.ops, () => plan!.finish(), { isAlive: () => true, abort: plan!.dispose })
    probe._settleQueue.complete()
    expect(passes).toHaveBeenCalled()
    expect(preview).not.toHaveBeenCalled()
    expect(probe._settleQueue.allowProgressPreview).toBe(true)
  } finally { now.mockRestore(); passes.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy() }
})

it('uses the same active-stroke rejection as the downstream reveal callback', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe & { _strokeLayerId: string | null; _settleQueue: import('../watercolor/WatercolorSettleQueue').WatercolorSettleQueue }
  const ctx = (probe._settlePlan as unknown as { ctx: { shouldPreview(): boolean } }).ctx
  try {
    probe._strokeLayerId = 'layer-1'
    expect(ctx.shouldPreview()).toBe(true)
    probe._settleQueue.suppressActivePreview = true
    expect(ctx.shouldPreview()).toBe(false)
    probe._strokeLayerId = null
    expect(ctx.shouldPreview()).toBe(true)
    probe._strokeLayerId = 'layer-1'
    expect(ctx.shouldPreview()).toBe(false)
  } finally { probe._strokeLayerId = null; engine.destroy() }
})

it('restores nonactive preview after a reentrant drain throws', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe & { _strokeLayerId: string | null; _settleQueue: import('../watercolor/WatercolorSettleQueue').WatercolorSettleQueue }
  const ctx = (probe._settlePlan as unknown as { ctx: { shouldPreview(): boolean } }).ctx
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  const q = probe._settleQueue, states: boolean[] = []
  q.suppressDrainPreview = q.suppressActivePreview = true
  try {
    q.start(scratch, [() => {}, () => states.push(ctx.shouldPreview())], () => {
      probe._strokeLayerId = 'layer-1'
      q.start(scratch, [() => states.push(ctx.shouldPreview()), () => { throw Error('nested failure') }], () => {}, { isAlive: () => true, abort() {} })
    }, { isAlive: () => true, abort() {} })
    expect(() => q.complete()).toThrow('nested failure')
    expect(states).toEqual([false, false])
    expect(ctx.shouldPreview()).toBe(false)
    probe._strokeLayerId = null
    expect(ctx.shouldPreview()).toBe(true)
  } finally { probe._strokeLayerId = null; scratch.destroy(); engine.destroy() }
})

it('opt-in zero contact path keeps front and landing but omits pigment exchanges', () => {
  const counts: Array<{ brush: number; front: number }> = []
  for (const skip of [false, true]) {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile)
    scratch.brushTravel = [{ x: 32, y: 32, radius: 20, aspect: 1, angle: 0, dx: 15, dy: 0, water: 1 }]
    const brush = vi.spyOn(probe._watercolorPasses, 'brushPass'), front = vi.spyOn(probe._watercolorPasses, 'waterFrontStep')
    try {
      const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 12, minY: 12, maxX: 52, maxY: 52 }, 0, 20, 1, 0, 1, 0, 0, undefined, skip)!
      for (const op of plan.ops) op()
      plan.finish()
      counts.push({ brush: brush.mock.calls.length, front: front.mock.calls.length })
    } finally { brush.mockRestore(); front.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy() }
  }
  expect(counts[0].brush).toBeGreaterThan(0)
  expect(counts[1].brush).toBe(0)
  expect(counts[1].front).toBe(counts[0].front)
  expect(counts[1].front).toBeGreaterThan(0)
})

for (const input of [
  { name: 'dry', landed: 0, standing: 0, peak: 0, expected: 0 },
  { name: 'own standing water', landed: 0, standing: 1, peak: 0, expected: 1 },
  { name: 'prior water', landed: 1, standing: 0, peak: 0, expected: 1 },
  { name: 'later wet contact', landed: 0, standing: 0, peak: 0.75, expected: 0.75 },
]) {
  it(`supplies the carry's wet plateau gate from ${input.name}`, () => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile)
    scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
    const spy = vi.spyOn(probe._watercolorPasses, 'fieldOp')
    try {
      const plan = probe._settlePlan.prepare(scratch,
        [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 20, minY: 20, maxX: 44, maxY: 44 },
        0, 8, 0, input.landed, input.standing, input.peak)!
      for (const op of plan.ops) op()
      plan.finish()
      const carry = spy.mock.calls.filter(call => call[3] === 15 || call[3] === 16)
      expect(carry.length).toBeGreaterThan(0)
      for (const call of carry) expect(call[5]?.band?.[1]).toBe(input.expected)
    } finally {
      spy.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
    }
  })
}

for (const enabled of [false, true]) for (const hasSolvent of [false, true]) {
  it(`captures the diagnostic plateau switch and solvent input (enabled=${enabled}, solvent=${hasSolvent})`, () => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile)
    if (hasSolvent) scratch.solventFilm(tile)
    expect(probe._settlePlan.diagnosticPlateauPhase).toBe(false)
    probe._settlePlan.diagnosticPlateauPhase = enabled
    const spy = vi.spyOn(probe._watercolorPasses, 'fieldOp')
    try {
      const plan = probe._settlePlan.prepare(scratch,
        [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0, 8, 1, 1, 1, 1)!
      // A subsequent diagnostic setting must not change an already-created job.
      probe._settlePlan.diagnosticPlateauPhase = !enabled
      for (const op of plan.ops) op()
      const carry = spy.mock.calls.filter(call => call[3] === 15 || call[3] === 16)
      expect(carry.length).toBeGreaterThan(0)
      for (const call of carry) {
        expect(call[5]?.tau).toEqual([WC_BLOOM_WET_LO, WC_BLOOM_WET_HI, enabled && hasSolvent ? 1 : 0])
        if (enabled && hasSolvent) {
          expect(call[5]?.e).toBeDefined()
          expect(call[5]?.e).not.toBe(call[0])
          expect(call[5]?.e).not.toBe(scratch.peek(tile)?.solventLoad)
        } else expect(call[5]?.e).toBeUndefined()
      }
      plan.finish()
    } finally {
      spy.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
    }
  })
}

describe('opt-in split continuation quanta', () => {
  function run(split: boolean, abortPreview = false, abortBeforeTile = false, ownerLocked = true, scheduler: 'iterate' | 'advance' | 'complete' = 'iterate') {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    probe._settlePlan.splitQuanta = split
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile)
    scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
    const commands: string[] = []
    const spies = ['fieldOp', 'waterFrontStep', 'diffuseStep', 'pigmentColor', 'wcResample'].map(name => {
      const key = name as 'fieldOp'
      const original = probe._watercolorPasses[key].bind(probe._watercolorPasses)
      return vi.spyOn(probe._watercolorPasses, key).mockImplementation((...args) => {
        commands.push(name === 'fieldOp' ? `${name}:${args[3]}:${args[4]}` : name)
        return original(...args)
      })
    })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    let previewCount = 0
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.2, 8, 1, 1, 1, 1, 0,
      () => { commands.push('preview'); previewCount++; if (abortPreview) throw new Error('preview abort') }, false, ownerLocked)!
    const initialOps = plan.ops.length
    try {
      if (abortBeforeTile) {
        let i = 0
        while (plan.ops.length === initialOps && i < plan.ops.length) plan.ops[i++]()
        expect(plan.ops.length).toBeGreaterThan(initialOps)
        expect(previewCount).toBe(0)
        expect((probe._settlePlan as unknown as { _ownedInputs: Set<unknown> })._ownedInputs.size).toBeGreaterThan(0)
        plan.dispose(); plan.dispose()
        const count = commands.length
        for (; i < plan.ops.length; i++) plan.ops[i]()
        expect(commands.length).toBe(count)
      } else if (abortPreview) {
        expect(() => { for (let i = 0; i < plan.ops.length; i++) plan.ops[i]() }).toThrow('preview abort')
        plan.dispose(); plan.dispose()
      } else if (scheduler !== 'iterate') {
        probe._settleQueue.start(scratch, plan.ops, plan.finish, { isAlive: () => scratch.live, abort: plan.dispose })
        if (scheduler === 'complete') probe._settleQueue.complete()
        else while (probe._settleQueue.current) probe._settleQueue.advance()
      } else {
        // Same mutable-index iteration used by Queue.complete; inserted tile
        // continuations must run before the next original physical closure.
        for (let i = 0; i < plan.ops.length; i++) plan.ops[i]()
        plan.finish()
      }
      expect((probe._settlePlan as unknown as { _ownedInputs: Set<unknown> })._ownedInputs.size).toBe(0)
      return { commands, previewCount, initialOps, finalOps: plan.ops.length }
    } finally {
      plan.dispose(); clock.mockRestore(); spies.forEach(spy => spy.mockRestore())
      scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
    }
  }
  it('retains all ordered physical and presentation draws with more scheduling boundaries', () => {
    const off = run(false), on = run(true)
    expect(on.commands).toEqual(off.commands)
    expect(on.previewCount).toBeGreaterThan(0)
    expect(on.previewCount).toBe(off.previewCount)
    expect(on.initialOps).toBeGreaterThan(off.initialOps)
    expect(on.finalOps).toBeGreaterThan(on.initialOps)
  })
  for (const scheduler of ['advance', 'complete'] as const) it(`preserves actual Queue.${scheduler} dynamic-insertion command order`, () => {
    const off = run(false), on = run(true, false, false, true, scheduler)
    expect(on.commands).toEqual(off.commands)
    expect(on.previewCount).toBe(off.previewCount)
  })
  it('retains the unsplit schedule without an explicit canonical-owner lock', () => {
    const off = run(false), unsafe = run(true, false, false, false)
    expect(unsafe.commands).toEqual(off.commands)
    expect(unsafe.initialOps).toBe(off.initialOps)
    expect(unsafe.finalOps).toBe(off.finalOps)
  })
  it('aborts between snapshot and tile without running later material or preview commands', () => {
    expect(run(true, false, true).previewCount).toBe(0)
  })
  it('releases held presentation snapshots on preview failure and idempotent abort', () => {
    expect(run(true, true).previewCount).toBe(1)
  })
})
