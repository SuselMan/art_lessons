import { describe, expect, it, vi } from 'vitest'
import { WatercolorPasses } from './WatercolorPasses'
import { RibbonPasses } from './RibbonPasses'
import { ShapePass } from './ShapePass'
import { Exporter } from '../export/Exporter'
import { SmudgePainter } from '../dabs/SmudgePainter'
import { ScratchFreeList, ScratchSlot } from '../buffers/scratchPools'

function driver(lost = false) {
  return { isContextLost: vi.fn(() => lost), deleteProgram: vi.fn<(program: unknown) => void>(), deleteBuffer: vi.fn<(buffer: unknown) => void>(),
    isBuffer: vi.fn(() => true), getParameter: vi.fn((): unknown => null), useProgram: vi.fn(), isProgram: vi.fn(() => true), CURRENT_PROGRAM: 1 }
}
const fixtures = [
  { name: 'watercolor', prototype: WatercolorPasses.prototype, programs: ['_fieldOpProg', '_fieldOpHighProg', '_fieldOpCarryProg', '_fieldOpCarryColourProg', '_resampleProg', '_diffuseProg', '_brushDragProg', '_waterFrontProg'] },
  { name: 'ribbon', prototype: RibbonPasses.prototype, programs: ['_ribbonProg'], buffers: ['_ribbonBuf'] },
  { name: 'shape', prototype: ShapePass.prototype, programs: ['prog'] },
  { name: 'exporter', prototype: Exporter.prototype, programs: ['transparentProg', 'downsampleProg'] },
]
function ownerFixture(spec: typeof fixtures[number], lost = false) {
  const gl = driver(lost), owner = Object.create(spec.prototype) as { destroy(): void }
  if (spec.name === 'watercolor' || spec.name === 'ribbon') Reflect.set(owner, 'ctx', { gl: () => gl })
  else Reflect.set(owner, 'gl', gl)
  const programs = spec.programs.map(key => { const name = { key }; Reflect.set(owner, key, name); return name })
  const buffers = (spec.buffers ?? []).map(key => { const name = { key }; Reflect.set(owner, key, name); return name })
  if (spec.name === 'watercolor') {
    for (const key of ['_gradientField', '_costDomain']) {
      const program = { key }; programs.push(program); Reflect.set(owner, key, { program })
    }
    const program = { key: 'additive' }; programs.push(program)
    Reflect.set(owner, '_additiveZeroFaceCarry', new Map([[15, { program }]]))
  }
  return { gl, owner, programs, buffers }
}
for (const spec of fixtures) describe(`${spec.name} owner cleanup`, () => {
  it('attempts every owned name once, preserves first failure and tolerates reentrancy', () => {
    const f = ownerFixture(spec), failure = new Error('first delete')
    f.gl.deleteProgram.mockImplementationOnce(() => { f.owner.destroy(); throw failure })
    expect(() => f.owner.destroy()).toThrow(failure)
    expect(f.gl.deleteProgram.mock.calls.map(call => call[0])).toEqual(f.programs)
    expect(f.gl.deleteBuffer.mock.calls.map(call => call[0])).toEqual(f.buffers)
    f.owner.destroy()
    expect(f.gl.deleteProgram).toHaveBeenCalledTimes(f.programs.length)
    expect(f.gl.deleteBuffer).toHaveBeenCalledTimes(f.buffers.length)
  })
  it('attempts all deletes and preserves a context-status query failure', () => {
    const f = ownerFixture(spec), failure = new Error('context status')
    f.gl.isContextLost.mockImplementationOnce(() => { throw failure })
    expect(() => f.owner.destroy()).toThrow(failure)
    expect(f.gl.deleteProgram).toHaveBeenCalledTimes(f.programs.length)
    expect(f.gl.deleteBuffer).toHaveBeenCalledTimes(f.buffers.length)
    f.owner.destroy()
    expect(f.gl.deleteProgram).toHaveBeenCalledTimes(f.programs.length)
  })
  it('unbinds an owned active program and leaves foreign bindings alone', () => {
    const f = ownerFixture(spec)
    f.gl.getParameter.mockReturnValue(f.programs[0])
    f.owner.destroy()
    expect(f.gl.useProgram).toHaveBeenCalledExactlyOnceWith(null)
    const foreign = ownerFixture(spec)
    foreign.gl.getParameter.mockReturnValue({ foreign: true })
    foreign.owner.destroy()
    expect(foreign.gl.useProgram).not.toHaveBeenCalled()
  })
  it('forgets stale names after physical restoration without deleting them in the new context', () => {
    const f=ownerFixture(spec)
    f.gl.isProgram.mockReturnValue(false);f.gl.isBuffer.mockReturnValue(false)
    f.owner.destroy()
    expect(f.gl.deleteProgram).not.toHaveBeenCalled();expect(f.gl.deleteBuffer).not.toHaveBeenCalled()
    f.gl.isProgram.mockReturnValue(true);f.gl.isBuffer.mockReturnValue(true);f.owner.destroy()
    expect(f.gl.deleteProgram).not.toHaveBeenCalled();expect(f.gl.deleteBuffer).not.toHaveBeenCalled()
  })
  it('retires handles on lost context without querying, unbinding or deleting', () => {
    const f = ownerFixture(spec, true)
    f.owner.destroy()
    expect(f.gl.getParameter).not.toHaveBeenCalled()
    f.gl.isContextLost.mockReturnValue(false)
    f.owner.destroy()
    expect(f.gl.deleteProgram).not.toHaveBeenCalled()
    expect(f.gl.deleteBuffer).not.toHaveBeenCalled()
    // A later empty teardown may query binding, but the lost teardown must not.
    expect(f.gl.useProgram).not.toHaveBeenCalled()
  })
})
it('watercolor binding query failure does not strand programs; foreign binding is preserved', () => {
  const f = ownerFixture(fixtures[0]), failure = new Error('query')
  f.gl.getParameter.mockImplementationOnce(() => { throw failure })
  expect(() => f.owner.destroy()).toThrow(failure)
  expect(f.gl.deleteProgram).toHaveBeenCalledTimes(f.programs.length)
  const g = ownerFixture(fixtures[0])
  g.gl.getParameter.mockReturnValue({ foreign: true })
  g.owner.destroy()
  expect(g.gl.useProgram).not.toHaveBeenCalled()
})

it('scratch free list detaches before callbacks and attempts every buffer even if two throw', () => {
  const first = new Error('first'), later = new Error('later')
  const pool = new ScratchFreeList(() => ({ width: 1, height: 1, destroy: vi.fn() }))
  const buffers = [pool.acquire(1, 1), pool.acquire(1, 1), pool.acquire(1, 1)]
  for (const buffer of buffers) pool.release(buffer)
  buffers[0].destroy.mockImplementation(() => { pool.destroy(); throw first })
  buffers[1].destroy.mockImplementation(() => { throw later })
  expect(() => pool.destroy()).toThrow(first)
  expect(pool.idleCount()).toBe(0); expect(pool.idleBytes()).toBe(0)
  pool.destroy()
  for (const buffer of buffers) expect(buffer.destroy).toHaveBeenCalledTimes(1)
})
it('scratch slot retires before a throwing child and permits subsequent acquisition', () => {
  const child = { width: 1, height: 1, destroy: vi.fn(() => { throw new Error('child') }) }
  const make = vi.fn(() => child), slot = new ScratchSlot(make)
  slot.acquire(1, 1)
  expect(() => slot.destroy()).toThrow('child')
  slot.destroy()
  expect(child.destroy).toHaveBeenCalledTimes(1)
  slot.acquire(1, 1)
  expect(make).toHaveBeenCalledTimes(2)
})

function smudgeFixture(lost = false, ownsMipCache = false) {
  const painter = Object.create(SmudgePainter.prototype) as SmudgePainter, gl = driver(lost)
  Reflect.set(painter, 'gl', gl)
  const resource = () => ({ destroy: vi.fn(), forget: vi.fn() })
  const pool = resource(), reservoir = resource(), secondary = resource()
  const textures = { clear: vi.fn() }, mips = { clear: vi.fn() }
  const imprints = new Map([['owner', { buf: reservoir }]]), gestures = new Map([['owner', { secondary }]])
  for (const [key, value] of Object.entries({ scratchPool: pool, wetTextures: textures, imageMips: mips, ownsMipCache,
    imprints, wetGestures: gestures, replayChunks: new Map([['owner', {}]]) })) Reflect.set(painter, key, value)
  const programs = ['transferProg', 'pickupProg', 'meanProg'].map(key => { const p = { key }; Reflect.set(painter, key, p); return p })
  for (const key of ['curveTransfer', 'imageTransfer', 'proceduralTransfer']) { const program = { key }; programs.push(program); Reflect.set(painter, key, { program }) }
  return { painter, gl, pool, reservoir, secondary, textures, mips, programs, imprints, gestures }
}
it('smudge continues after child and driver failures, retires checked-out resources, preserves borrowed mip cache', () => {
  const f = smudgeFixture(), failure = new Error('pool')
  f.pool.destroy.mockImplementationOnce(() => { throw failure })
  f.gl.deleteProgram.mockImplementationOnce(() => { throw new Error('program') })
  expect(() => f.painter.destroy()).toThrow(failure)
  expect(f.reservoir.destroy).toHaveBeenCalledTimes(1)
  expect(f.secondary.destroy).toHaveBeenCalledTimes(1)
  expect(f.gl.deleteProgram).toHaveBeenCalledTimes(6)
  expect(f.textures.clear).toHaveBeenCalledWith(false)
  expect(f.mips.clear).not.toHaveBeenCalled()
  expect(f.imprints.size + f.gestures.size).toBe(0)
  f.painter.destroy()
  expect(f.reservoir.destroy).toHaveBeenCalledTimes(1)
  expect(f.secondary.destroy).toHaveBeenCalledTimes(1)
  expect(f.gl.deleteProgram).toHaveBeenCalledTimes(6)
})
it('smudge forgets children on context loss and clears only its owned CPU cache', () => {
  const f = smudgeFixture(true, true)
  f.painter.destroy()
  expect(f.pool.forget).toHaveBeenCalledTimes(1)
  expect(f.secondary.forget).toHaveBeenCalledTimes(1)
  expect(f.pool.destroy).not.toHaveBeenCalled(); expect(f.reservoir.destroy).not.toHaveBeenCalled()
  expect(f.secondary.destroy).not.toHaveBeenCalled(); expect(f.gl.deleteProgram).not.toHaveBeenCalled()
  expect(f.textures.clear).toHaveBeenCalledWith(true)
  expect(f.mips.clear).toHaveBeenCalledTimes(1)
})

it('optional watercolor release retires its cache before throwing driver callbacks', () => {
  const f = ownerFixture(fixtures[0]), failure = new Error('optional')
  const program = Reflect.get(f.owner, '_gradientField').program
  f.gl.deleteProgram.mockImplementationOnce(() => { throw failure })
  const release = Reflect.get(f.owner, 'releaseGradientField') as () => void
  expect(() => release.call(f.owner)).toThrow(failure)
  expect(Reflect.get(f.owner, '_gradientField')).toBeNull()
  f.owner.destroy()
  expect(f.gl.deleteProgram.mock.calls.filter(call => call[0] === program)).toHaveLength(1)
})

it('smudge continues every child cleanup if the context-status query throws', () => {
  const f = smudgeFixture(), failure = new Error('context status')
  f.gl.isContextLost.mockImplementationOnce(() => { throw failure })
  expect(() => f.painter.destroy()).toThrow(failure)
  expect(f.pool.destroy).toHaveBeenCalledTimes(1)
  expect(f.reservoir.destroy).toHaveBeenCalledTimes(1)
  expect(f.secondary.destroy).toHaveBeenCalledTimes(1)
  expect(f.textures.clear).toHaveBeenCalledWith(false)
  expect(f.gl.deleteProgram).toHaveBeenCalledTimes(6)
})
