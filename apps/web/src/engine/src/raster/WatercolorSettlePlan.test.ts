import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { WatercolorSettleQueue } from '../watercolor/WatercolorSettleQueue'
import type { SettleField } from '../buffers/SettleField'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { WC_BLOOM_WET_LO, WC_BLOOM_WET_HI, WC_CARRY_RATE, WC_CARRY_TRAVEL } from '../presets/watercolorPresets'

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
  function run(split: boolean, abortPreview = false, abortBeforeTile = false, ownerLocked = true, scheduler: 'iterate' | 'advance' | 'complete' = 'iterate', cancelInPreview = false, lazy = false, contacts = false, cancelDuringCpu = false, loseDuringCpu = false) {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    probe._settlePlan.splitQuanta = split
    probe._settlePlan.lazyContacts = lazy
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile)
    scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
    if (contacts) scratch.brushTravel = Array.from({ length: 8 }, (_, i) => ({ x: 22 + i * 2, y: 28 + i % 2 * 6, radius: 8, aspect: 1.5, angle: i * .21, dx: i % 2 ? -5 : 5, dy: 1, water: 1 }))
    const commands: string[] = []
    const ids = new WeakMap<object, number>()
    let nextId = 0
    const argument = (value: unknown): unknown => {
      if (value && typeof value === 'object') {
        if (ArrayBuffer.isView(value)) return { pixels: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] }
        if ('copyRegionInto' in value && 'width' in value && 'height' in value) {
          if (!ids.has(value)) ids.set(value, ++nextId)
          return { buffer: ids.get(value), width: value.width, height: value.height }
        }
        if (Array.isArray(value)) return value.map(argument)
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, argument(item)]))
      }
      return value
    }
    const spies = ['fieldOp', 'waterFrontStep', 'diffuseStep', 'pigmentColor', 'wcResample', 'brushPass'].map(name => {
      const key = name as 'fieldOp'
      const original = probe._watercolorPasses[key].bind(probe._watercolorPasses)
      return vi.spyOn(probe._watercolorPasses, key).mockImplementation((...args) => {
        commands.push(name + ':' + JSON.stringify(args.map(argument)))
        return original(...args)
      })
    })
    const gl = (engine as unknown as { gl: WebGLRenderingContext }).gl
    const upload = gl.texImage2D.bind(gl)
    const uploadSpy = vi.spyOn(gl, 'texImage2D').mockImplementation((...args: unknown[]) => {
      commands.push('upload:' + JSON.stringify(args.map(argument)))
      return (upload as (...args: unknown[]) => void)(...args)
    })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    let previewCount = 0
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.2, 8, 1, 1, 1, 1, 0,
      () => { commands.push('preview'); previewCount++; if (cancelInPreview) plan.dispose(); if (abortPreview) throw new Error('preview abort') }, false, undefined, ownerLocked)!
    const initialOps = plan.ops.length
    let cpuCancelled = false
    const realExp = Math.exp
    const expSpy = cancelDuringCpu || loseDuringCpu ? vi.spyOn(Math, 'exp').mockImplementation(value => {
      if (!cpuCancelled) { cpuCancelled = true; if (cancelDuringCpu) plan.dispose() }
      return realExp(value)
    }) : null
    try {
      if (loseDuringCpu) {
        probe._settleQueue.start(scratch, plan.ops, plan.finish, { isAlive: () => scratch.live && !cpuCancelled, abort: plan.dispose })
        while (probe._settleQueue.current) probe._settleQueue.advance()
        expect(cpuCancelled).toBe(true)
        const count = commands.length
        for (const op of plan.ops) op()
        expect(commands.length).toBe(count)
      } else if (cancelDuringCpu) {
        for (let i = 0; i < plan.ops.length && !cpuCancelled; i++) plan.ops[i]()
        expect(cpuCancelled).toBe(true)
        const count = commands.length
        plan.dispose()
        for (const op of plan.ops) op()
        expect(commands.length).toBe(count)
      } else if (abortBeforeTile) {
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
      plan.dispose(); expSpy?.mockRestore(); clock.mockRestore(); uploadSpy.mockRestore(); spies.forEach(spy => spy.mockRestore())
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
  it('supports synchronous cancellation from inside a running preview callback', () => {
    expect(run(true, false, false, true, 'iterate', true).previewCount).toBe(1)
  })
  it('releases held presentation snapshots on preview failure and idempotent abort', () => {
    expect(run(true, true).previewCount).toBe(1)
  })
  for (const scheduler of ['iterate', 'advance', 'complete'] as const) it(`retains lazy field upload/pulse/material order through ${scheduler}`, () => {
    const eager = run(true, false, false, true, scheduler, false, false, true)
    const lazy = run(true, false, false, true, scheduler, false, true, true)
    expect(lazy.commands).toEqual(eager.commands)
    expect(lazy.initialOps).toBeLessThan(eager.initialOps)
    expect(lazy.finalOps).toBeGreaterThan(lazy.initialOps)
  })
  it('cancels reentrantly inside a running CPU field without resuming material writes', () => {
    run(true, false, false, true, 'iterate', false, true, true, true)
  })
  it('aborts actual Queue after owner loss inside a CPU continuation', () => {
    run(true, false, false, true, 'advance', false, true, true, false, true)
  })
  it('retains eager contact fields without the canonical lock', () => {
    const eager = run(false, false, false, false, 'iterate', false, false, true)
    const unsafe = run(false, false, false, false, 'iterate', false, true, true)
    expect(unsafe.commands).toEqual(eager.commands)
    expect(unsafe.initialOps).toBe(eager.initialOps)
  })
  it('disposes suspended CPU field owners when cancelling before contact work', () => {
    expect(run(true, false, true, true, 'iterate', false, true, true).previewCount).toBe(0)
  })

})


describe('diagnostic single-paint cost-domain paths', () => {
  for (const enabled of [false, true]) for (const owner of [false, true]) for (const mixed of [false, true]) {
    it(`preserves ownership and schedules masks before carry (enabled=${enabled}, owner=${owner}, mixed=${mixed})`, () => {
      const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
      const probe = engine as unknown as Probe
      const tile = probe._ribbonScratchPool.acquire(64, 64)
      const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
      scratch.getOrCreate(tile); scratch.paints.add('1,0,0')
      if (mixed) scratch.paints.add('0,0,1')
      probe._settlePlan.diagnosticCostDomainPaths = enabled
      const calls: string[] = []
      const masks: AccumulationBuffer[] = []
      let expectedMasks = 0
      vi.spyOn(probe._watercolorPasses, 'costDomainStep').mockImplementation((out, source, _rect, _band, stride) => {
        expect(out).not.toBe(source); masks.push(out); calls.push(`mask:${stride}`)
      })
      const field = probe._watercolorPasses.fieldOp.bind(probe._watercolorPasses)
      vi.spyOn(probe._watercolorPasses, 'fieldOp').mockImplementation((...args) => {
        if (args[3] === 15) {
          calls.push('carry')
          expect(args[4]).toBe(WC_CARRY_RATE)
          expect(args[5]?.origin?.[1]).toBe(WC_CARRY_TRAVEL)
          expectedMasks += 1 + Math.log2(args[5]?.origin?.[0] ?? 1)
          if (enabled && !mixed) { expect(args[5]?.path).toBe(masks[masks.length - 1]); expect(calls[calls.length - 2]).toMatch(/^mask:/) }
          else expect(args[5]?.path).toBeUndefined()
        }
        field(...args)
      })
      try {
        const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
          { minX: 20, minY: 20, maxX: 44, maxY: 44 }, .2, 8, 1, 1, 1, 1, 0, undefined, false, undefined, owner)!
        for (const op of plan.ops) {
          const before = calls.length
          op()
          if (enabled && !mixed) {
            const commands = calls.slice(before)
            expect(commands.length).toBeLessThanOrEqual(1)
          }
        }
        expect(calls).toContain('carry')
        expect(masks.length > 0).toBe(enabled && !mixed)
        if (enabled && !mixed) expect(masks.length).toBe(expectedMasks)
        expect(new Set(masks).size).toBe(enabled && !mixed ? 2 : 0)
        plan.dispose(); plan.dispose()
      } finally { scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy(); vi.restoreAllMocks() }
    })
  }

  function execution(enabled: boolean | undefined, owner: boolean, pureWater = false, packed = false) {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile)
    if (!pureWater) scratch.paints.add('1,0,0')
    if (enabled !== undefined) probe._settlePlan.diagnosticCostDomainPaths = enabled
    probe._settlePlan.diagnosticPackedCostPaths = packed
    const calls: unknown[][] = []
    const identities = new Map<AccumulationBuffer, number>()
    const id = (buffer: AccumulationBuffer | undefined) => {
      if (!buffer) return null
      if (!identities.has(buffer)) identities.set(buffer, identities.size + 1)
      return identities.get(buffer)
    }
    let field: SettleField | undefined
    const front = probe._watercolorPasses.waterFrontStep.bind(probe._watercolorPasses)
    vi.spyOn(probe._watercolorPasses, 'waterFrontStep').mockImplementation((...args) => {
      field = args[0] as SettleField
      return front(...args)
    })
    vi.spyOn(probe._watercolorPasses, 'costDomainStep').mockImplementation((out, source, rect, band, stride) => {
      expect(field).toBeDefined()
      expect([field!.ca, field!.cc]).toContain(out)
      expect(out).not.toBe(field!.cb)
      calls.push(['mask', stride, id(out), id(source), rect, band])
    })
    const physical = probe._watercolorPasses.fieldOp.bind(probe._watercolorPasses)
    vi.spyOn(probe._watercolorPasses, 'fieldOp').mockImplementation((...args) => {
      const options = args[5]
      calls.push(['field', args[3], id(args[0]), id(args[1]), id(args[2]), args[4],
        options?.origin, options?.band, id(options?.path)])
      return physical(...args)
    })
    const color = probe._watercolorPasses.pigmentColor.bind(probe._watercolorPasses)
    vi.spyOn(probe._watercolorPasses, 'pigmentColor').mockImplementation((...args) => {
      if (args[0] === field?.cc && enabled && !pureWater) {
        // Borrowing ends before the numerical colour record is reconstructed.
        expect(calls.filter(call => call[0] === 'mask')).toHaveLength(packed ? 7 : 56)
        expect(calls.filter(call => call[0] === 'field' && call[1] === 15)).toHaveLength(14)
      }
      calls.push(['color', id(args[0]), id(args[1]), args[2]])
      return color(...args)
    })
    try {
      const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 20, minY: 20, maxX: 44, maxY: 44 }, .2, 8, 1, 1, 1, 1, 0, undefined, false, undefined, owner)!
      const entries = plan.ops.length
      for (const op of plan.ops) op()
      plan.finish(); plan.dispose()
      return { entries, calls }
    } finally { scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy(); vi.restoreAllMocks() }
  }

  it('packs seven levels before all fourteen carries and retains one immutable mask', () => {
    const historical = execution(true, false, false, true)
    expect(historical).toEqual(execution(true, true, false, true))
    const masks = historical.calls.filter(call => call[0] === 'mask')
    expect(masks.map(call => call[1])).toEqual([0, 1, 2, 4, 8, 16, 32])
    const carries = historical.calls.filter(call => call[0] === 'field' && call[1] === 15)
    expect(carries).toHaveLength(14)
    expect(new Set(carries.map(call => call[8])).size).toBe(1)
    expect(historical.calls.indexOf(masks[6])).toBeLessThan(historical.calls.indexOf(carries[0]))
    expect(execution(false, false, false, true)).toEqual(execution(false, false))
  })

  it('executes identical physical inputs and colour reconstruction on owned and historical routes', () => {
    const historical = execution(true, false)
    const owned = execution(true, true)
    expect(historical).toEqual(owned)
    expect(historical.calls.filter(call => call[0] === 'mask')).toHaveLength(56)
    expect(historical.calls.filter(call => call[0] === 'field' && call[1] === 15)).toHaveLength(14)
  })

  for (const owner of [false, true]) it(`preserves the original default schedule with the diagnostic off (owner=${owner})`, () => {
    expect(execution(false, owner)).toEqual(execution(undefined, owner))
    expect(execution(false, owner).calls.some(call => call[0] === 'mask')).toBe(false)
  })

  it('does not borrow colour buffers for a pure-water record', () => {
    expect(execution(true, false, true)).toEqual(execution(false, false, true))
  })
})

it('cost mask primitive balances draw ownership and retires its program without allocating textures', () => {
  const { engine, canvas } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe
  const a = probe._ribbonScratchPool.acquire(8, 8), b = probe._ribbonScratchPool.acquire(8, 8)
  const gl = canvas.getContext('webgl')!
  const textures = vi.spyOn(gl, 'createTexture'), end = vi.spyOn(a, 'endDraw')
  const destroy = vi.spyOn(gl, 'deleteProgram')
  try {
    probe._watercolorPasses.costDomainStep(a, b, [1, 1, 7, 7], .8, 0)
    probe._watercolorPasses.costDomainStep(a, b, [1, 1, 7, 7], .8, 4)
    expect(textures).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledTimes(2)
    // Context recreation drops the dead cached mask program before its next use.
    probe._watercolorPasses.initFieldPrograms(); probe._watercolorPasses.initFieldUniforms(); probe._watercolorPasses.initFieldAttributes()
    probe._watercolorPasses.costDomainStep(a, b, [1, 1, 7, 7], .8, 0)
    expect(end).toHaveBeenCalledTimes(3)
    probe._watercolorPasses.destroy()
    expect(destroy.mock.calls.length).toBeGreaterThan(0)
  } finally { probe._ribbonScratchPool.release(a); probe._ribbonScratchPool.release(b); engine.destroy(); vi.restoreAllMocks() }
})

for (const packed of [false, true]) for (const owner of [false, true]) for (const lost of [false, true]) it(`retires borrowed mask state on plan abort (owner=${owner}, contextLost=${lost}, packed=${packed})`, () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile); scratch.paints.add('1,0,0')
  probe._settlePlan.diagnosticCostDomainPaths = true
  probe._settlePlan.diagnosticPackedCostPaths = packed
  let count = 0
  vi.spyOn(probe._watercolorPasses, 'costDomainStep').mockImplementation(() => { count++ })
  try {
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 20, minY: 20, maxX: 44, maxY: 44 }, .2, 8, 1, 1, 1, 1, 0, undefined, false, undefined, owner)!
    let next = 0
    while (!count && next < plan.ops.length) plan.ops[next++]()
    expect(count).toBeGreaterThan(0)
    const completed = count
    const land = vi.spyOn(probe._watercolorPasses, 'fieldOp')
    if (lost) probe._settlePlan.forgetTextures()
    plan.dispose(); plan.dispose(); plan.finish()
    for (; next < plan.ops.length; next++) plan.ops[next]()
    expect(count).toBe(completed)
    expect(land).not.toHaveBeenCalled()
  } finally { scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy(); vi.restoreAllMocks() }
})

// Diagnostic numerical change: capture the flag at prepare, never mid-job.
for (const enabled of [false, true]) for (const wet of [0, 1]) {
  it(`captures additive zero faces without changing path eligibility (${enabled}/${wet})`, () => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile); scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
    if (wet > 0) scratch.solventFilm(tile)
    const passes = vi.spyOn(probe._watercolorPasses, 'fieldOp')
    try {
      probe._settlePlan.diagnosticAdditiveZeroFaces = enabled
      probe._settlePlan.diagnosticPlateauPhase = wet > 0
      const job = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 20, minY: 20, maxX: 44, maxY: 44 }, .2, 8, 1, wet, 1, wet)!
      probe._settlePlan.diagnosticAdditiveZeroFaces = !enabled
      for (const op of job.ops) op()
      const carry = passes.mock.calls.filter(c => c[3] === 15 || c[3] === 16)
      expect(carry.length).toBeGreaterThan(0)
      expect(carry.some(c => c[3] === 16)).toBe(true)
      for (const call of carry) expect(call[5]?.additiveZeroFaces).toBe(enabled && wet > 0)
      job.dispose()
    } finally { scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy(); vi.restoreAllMocks() }
  })
}

describe('diagnostic pure-water plan', () => {
  function run(enabled: boolean, proof: boolean, knownZero: boolean, opDry = false, mixed = false) {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    probe._wcAb.opDry = opDry
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.filmBuffers(tile); scratch.solventFilm(tile)
    scratch.paints.add('1,0,0')
    if (mixed) scratch.paints.add('0,0,1')
    scratch.pigmentInputsKnownZero = knownZero
    scratch.brushTravel = [{ x: 32, y: 32, radius: 20, aspect: 1, angle: 0, dx: 15, dy: 0, water: 1 }]
    const passes = probe._watercolorPasses
    const modes: number[] = [], water: Array<unknown[]> = []
    const field = vi.spyOn(passes, 'fieldOp'), diffuse = vi.spyOn(passes, 'diffuseStep')
    const pigment = vi.spyOn(passes, 'pigmentColor'), contacts = vi.spyOn(passes, 'brushPass')
    const front = vi.spyOn(passes, 'waterFrontStep')
    const tide = vi.spyOn(probe._settlePlan, 'groupTideOps')
    probe._settlePlan.diagnosticPureWaterPlan = enabled
    try {
      const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 12, minY: 12, maxX: 52, maxY: 52 }, .2, 20, 1, 1, 1, 1, 0, undefined, proof)!
      expect(plan).not.toBeNull()
      for (const op of plan.ops) op()
      plan.finish()
      for (const call of field.mock.calls) modes.push(call[3])
      // Water-front scalar/geometry order is invariant; buffer identities differ per engine.
      for (const call of front.mock.calls) water.push([call[1], call[2], call[3], ...call.slice(6)])
      return { modes, water, diffuse: diffuse.mock.calls.length, pigment: pigment.mock.calls.length,
        contacts: contacts.mock.calls.length, tide: tide.mock.calls.length, domain: plan.compositeDomain }
    } finally {
      vi.restoreAllMocks(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
    }
  }
  for (const opDry of [false, true]) for (const mixed of [false, true]) {
    it(`keeps all water/front steps without pigment transport (${opDry}/${mixed})`, () => {
      const off = run(false, true, true, opDry, mixed), on = run(true, true, true, opDry, mixed)
      expect(on.water).toEqual(off.water)
      expect(on.water.length).toBeGreaterThan(0)
      expect(on.domain).toEqual(off.domain)
      expect(off.diffuse).toBeGreaterThan(0)
      expect(off.modes).toContain(15)
      expect(on.diffuse).toBe(0); expect(on.pigment).toBe(0)
      expect(on.contacts).toBe(0); expect(on.tide).toBe(opDry ? 0 : 1)
      expect(on.modes).not.toContain(15); expect(on.modes).not.toContain(16)
      expect(on.modes).not.toContain(18)
      expect(on.modes).toContain(10); expect(on.modes).toContain(11); expect(on.modes).toContain(20)
    })
  }
  for (const [proof, known] of [[false, true], [true, false], [false, false]]) {
    it(`retains ordinary command order when proof is missing (${proof}/${known})`, () => {
      expect(run(true, proof, known, false, true)).toEqual(run(false, proof, known, false, true))
    })
  }
  it('retires COST alias and stale colour before zero landing; following paint takes ordinary path', () => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const probe = engine as unknown as Probe
    const tile = probe._ribbonScratchPool.acquire(64, 64)
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.filmBuffers(tile); scratch.solventFilm(tile); scratch.paints.add('1,0,0')
    const ctx = (probe._settlePlan as unknown as { ctx: { fieldFor(w: number, h: number): SettleField } }).ctx
    const field = ctx.fieldFor(64, 64)
    const acquire = vi.spyOn(ctx, 'fieldFor').mockReturnValue(field)
    const resetA = vi.spyOn(field.a, 'clear'), resetC = vi.spyOn(field.c, 'clear'), resetColour = vi.spyOn(field.cc, 'clear')
    const front = vi.spyOn(probe._watercolorPasses, 'waterFrontStep')
    const diffuse = vi.spyOn(probe._watercolorPasses, 'diffuseStep')
    const writes = vi.spyOn(probe._watercolorPasses, 'fieldOp')
    probe._settlePlan.diagnosticPureWaterPlan = true
    try {
      const targets = [{ buffer: tile, originX: 0, originY: 0, contentRect: null }]
      const bounds = { minX: 12, minY: 12, maxX: 52, maxY: 52 }
      const zero = probe._settlePlan.prepare(scratch, targets, bounds, 0, 20, 1, 0, 1, 0, 0, undefined, true)!
      zero.ops.forEach(op => op()); zero.finish()
      const lastFront = Math.max(...front.mock.invocationCallOrder)
      expect(resetA.mock.invocationCallOrder.at(-1)).toBeGreaterThan(lastFront)
      expect(resetC.mock.invocationCallOrder.at(-1)).toBeGreaterThan(front.mock.invocationCallOrder[0])
      expect(resetColour.mock.invocationCallOrder.at(-1)).toBeGreaterThan(front.mock.invocationCallOrder[0])
      // Group tide's inward geometry runs later but must never overwrite either wet P/C result.
      for (let i = 0; i < writes.mock.calls.length; i++) {
        if (writes.mock.calls[i][0] === field.c) expect(writes.mock.invocationCallOrder[i]).toBeLessThan(resetC.mock.invocationCallOrder.at(-1)!)
        if (writes.mock.calls[i][0] === field.cc) expect(writes.mock.invocationCallOrder[i]).toBeLessThan(resetColour.mock.invocationCallOrder.at(-1)!)
      }
      expect(diffuse).not.toHaveBeenCalled()
      scratch.pigmentInputsKnownZero = false
      scratch.newFilm(); scratch.filmBuffers(tile)
      const paint = probe._settlePlan.prepare(scratch, targets, bounds, 0, 20, 1, 0, 1, 0, 0, undefined, false)!
      paint.ops.forEach(op => op()); paint.finish()
      expect(diffuse).toHaveBeenCalled()
    } finally {
      acquire.mockRestore(); vi.restoreAllMocks(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
    }
  })
})

it('captures pure-water permission at prepare and forgets owned inputs without dead-context release', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as Probe
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.filmBuffers(tile); scratch.solventFilm(tile); scratch.paints.add('1,0,0')
  const passes = vi.spyOn(probe._watercolorPasses, 'fieldOp')
  const diffuse = vi.spyOn(probe._watercolorPasses, 'diffuseStep')
  try {
    probe._settlePlan.diagnosticPureWaterPlan = true
    const job = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 12, minY: 12, maxX: 52, maxY: 52 }, 0, 20, 1, 0, 1, 0, 0, undefined, true)!
    job.ops[0]()
    // Later UI/gesture state cannot change a captured canonical permission.
    probe._settlePlan.diagnosticPureWaterPlan = false
    scratch.pigmentInputsKnownZero = false
    job.ops.slice(1).forEach(op => op())
    expect(diffuse).not.toHaveBeenCalled()
    expect(passes.mock.calls.some(call => call[3] === 15 || call[3] === 16)).toBe(false)
    const release = vi.spyOn(probe._ribbonScratchPool, 'release')
    probe._settlePlan.forgetTextures()
    release.mockClear()
    job.dispose(); job.dispose(); job.finish()
    expect(release).not.toHaveBeenCalled()
  } finally { vi.restoreAllMocks(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy() }
})
