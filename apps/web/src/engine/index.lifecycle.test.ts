import { afterEach, expect, it, vi } from 'vitest'
import { PencilEngine } from './index'
import { AccumulationBuffer } from './src/buffers/AccumulationBuffer'
import { snapshotAccumStorage } from './src/buffers/ContextStorageOwner'
import { createTestEngine } from './testing/engineTestUtils'
import { MockGL } from './testing/mockGL'
import { LayerCompositor } from './src/raster/LayerCompositor'
import { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'
import { TiledLayerBuffer } from './src/buffers/TiledLayerBuffer'

afterEach(() => { vi.restoreAllMocks() })

it('retires all real initialized programs once, including compositor and presentation programs', () => {
  const created = vi.spyOn(MockGL.prototype, 'createProgram')
  const deleted = vi.spyOn(MockGL.prototype, 'deleteProgram')
  const { engine } = createTestEngine({ paper: 'flat' })
  const owned = created.mock.results.map(result => result.value)
  const gl = engine['gl'], foreign = gl.createProgram()
  gl.useProgram(foreign)
  engine.destroy()
  engine.destroy()
  expect(owned.length).toBeGreaterThan(4)
  for (const program of owned) expect(deleted.mock.calls.filter(([p]) => p === program)).toHaveLength(1)
  expect(deleted.mock.calls.some(([p]) => p === foreign)).toBe(false)
})

it('attempts later owners after an early cleanup failure and preserves the first error', () => {
  const { engine, canvas } = createTestEngine({ paper: 'flat' })
  const gl = engine['gl'], foreign = new AccumulationBuffer(gl, 3, 2)
  const primary = new Error('listener cleanup failed'), secondary = new Error('painter cleanup failed')
  const remove = vi.spyOn(canvas, 'removeEventListener').mockImplementationOnce(() => { throw primary })
  const brushDestroy = vi.spyOn(engine['_brush'], 'destroy')
  const stampDestroy = vi.spyOn(engine['_stamps'], 'destroy').mockImplementationOnce(() => { throw secondary })
  const poolDestroy = vi.spyOn(engine['_ribbonScratchPool'], 'destroy')
  const deleteBuffer = vi.spyOn(gl, 'deleteBuffer')
  const quad = engine['_quadBuf'], screen = engine['_screenBuf']
  try {
    let failure: unknown
    try { engine.destroy() } catch (error) { failure = error }
    expect(failure).toBe(primary)
    expect(remove).toHaveBeenCalledTimes(7) // two canvas + five pointer subscriptions
    expect(stampDestroy).toHaveBeenCalledOnce()
    expect(brushDestroy).toHaveBeenCalledOnce()
    expect(poolDestroy).toHaveBeenCalledOnce()
    expect(deleteBuffer.mock.calls.filter(([p]) => p === quad)).toHaveLength(1)
    expect(deleteBuffer.mock.calls.filter(([p]) => p === screen)).toHaveLength(1)
    expect(snapshotAccumStorage(gl).residentBytes).toBe(24)
    expect(() => engine.destroy()).not.toThrow()
  } finally { foreign.destroy(); engine.destroy() }
})

it('stale display and context callbacks cannot change another engine in the same context', () => {
  const { engine: first, canvas } = createTestEngine({ paper: 'flat' })
  const second = new PencilEngine(canvas as unknown as HTMLCanvasElement, { paper: 'flat' })
  const gl = first['gl']
  try {
    first.destroy()
    const before = snapshotAccumStorage(gl)
    const create = vi.spyOn(gl, 'createTexture'), draw = vi.spyOn(gl, 'drawArrays')
    const lost = vi.spyOn(gl, 'isContextLost')
    first['_display']()
    first['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    first['_handleContextRestored']()
    expect(create).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled()
    expect(lost).not.toHaveBeenCalled()
    expect(snapshotAccumStorage(gl)).toEqual(before)
  } finally { first.destroy(); second.destroy() }
})


it('compositor unbinds only its own active program and always attempts deletion', () => {
  const { engine } = createTestEngine({ paper: 'flat' })
  const gl = engine['gl'], foreign = gl.createProgram()
  // MockGL's raster emulator does not expose CURRENT_PROGRAM. Track that
  // driver query locally using the real handles and actual useProgram calls.
  Object.defineProperty(gl, 'CURRENT_PROGRAM', { configurable: true, value: 0x8b8d })
  let current: WebGLProgram | null = null
  const getParameter = gl.getParameter.bind(gl), useProgram = gl.useProgram.bind(gl)
  vi.spyOn(gl, 'getParameter').mockImplementation(pname => pname === gl.CURRENT_PROGRAM ? current : getParameter(pname))
  const use = vi.spyOn(gl, 'useProgram').mockImplementation(program => { current = program; useProgram(program) })
  const own = new LayerCompositor(engine['_compositor']['ctx'])
  own.initProgram()
  const program = own['_compositeProg']
  const deleted = vi.spyOn(gl, 'deleteProgram')
  gl.useProgram(foreign)
  own.destroy()
  own.destroy()
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(foreign)
  expect(deleted.mock.calls.filter(([p]) => p === program)).toHaveLength(1)
  const active = new LayerCompositor(engine['_compositor']['ctx'])
  active.initProgram()
  gl.useProgram(active['_compositeProg'])
  active.destroy()
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBeNull()
  const faulty = new LayerCompositor(engine['_compositor']['ctx'])
  faulty.initProgram()
  const faultProgram = faulty['_compositeProg'], primary = new Error('unbind')
  gl.useProgram(faultProgram)
  use.mockImplementationOnce(() => { throw primary })
  expect(() => faulty.destroy()).toThrow(primary)
  expect(deleted.mock.calls.filter(([p]) => p === faultProgram)).toHaveLength(1)
  engine.destroy()
})

it('continues retiring later layers and releases borrowers before the ribbon pool', () => {
  const { engine } = createTestEngine({ paper: 'flat' })
  const gl = engine['gl'], a = new TiledLayerBuffer(gl, 2, 2), b = new TiledLayerBuffer(gl, 3, 2)
  a.resolveForPaint({ minX: 0, minY: 0, maxX: 2, maxY: 2 })
  const target = b.resolveForPaint({ minX: 0, minY: 0, maxX: 3, maxY: 2 })[0]!
  const primary = new Error('layer cleanup failed')
  engine['_layers'].set('a', a)
  engine['_layers'].set('b', b)
  const destroyA = vi.spyOn(a, 'destroy').mockImplementationOnce(() => { throw primary })
  const destroyB = vi.spyOn(b, 'destroy')
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], false)
  scratch.getOrCreate(target.buffer)
  engine['_ribbonStrokeScratch'] = scratch
  const scratchDestroy = vi.spyOn(scratch, 'destroy')
  const poolDestroy = vi.spyOn(engine['_ribbonScratchPool'], 'destroy')
  const releaseSources = vi.spyOn(engine['_ribbonPainter'], 'releaseWaterSources')
  try {
    expect(() => engine.destroy()).toThrow(primary)
    expect(destroyA).toHaveBeenCalledOnce()
    expect(destroyB).toHaveBeenCalledOnce()
    expect(scratchDestroy.mock.invocationCallOrder[0]).toBeLessThan(poolDestroy.mock.invocationCallOrder[0]!)
    expect(releaseSources.mock.invocationCallOrder[0]).toBeLessThan(poolDestroy.mock.invocationCallOrder[0]!)
    expect(snapshotAccumStorage(gl).residentBytes).toBe(16) // failing nested owner is NOT claimed freed
  } finally { destroyA.mockRestore(); a.destroy(); engine.destroy() }
})

it('program deletion failure preserves the primary error and still retires later programs and VBOs', () => {
  const { engine } = createTestEngine({ paper: 'flat' })
  const gl = engine['gl'], primary = new Error('program deletion'), before = engine['_revealProg']
  const originalDelete = gl.deleteProgram.bind(gl)
  const deleted = vi.spyOn(gl, 'deleteProgram').mockImplementation(program => {
    if (program === before) throw primary
    originalDelete(program)
  })
  const buffers = vi.spyOn(gl, 'deleteBuffer'), quad = engine['_quadBuf'], screen = engine['_screenBuf']
  expect(() => engine.destroy()).toThrow(primary)
  expect(deleted.mock.calls.filter(([p]) => p === before)).toHaveLength(1)
  expect(deleted.mock.calls.some(([p]) => p === engine['_screenBlitProg'])).toBe(true)
  expect(deleted.mock.calls.some(([p]) => p === engine['_paperComposeProg'])).toBe(true)
  expect(buffers.mock.calls.some(([p]) => p === quad)).toBe(true)
  expect(buffers.mock.calls.some(([p]) => p === screen)).toBe(true)
  engine.destroy()
  expect(deleted.mock.calls.filter(([p]) => p === before)).toHaveLength(1)
})


it('forgets the four dead-generation programs without deleting them after context loss', () => {
  const { engine } = createTestEngine({ paper: 'flat' })
  const gl = engine['gl'], programs = [engine['_compositor']['_compositeProg'], engine['_revealProg'], engine['_screenBlitProg'], engine['_paperComposeProg']]
  engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
  const deleted = vi.spyOn(gl, 'deleteProgram')
  engine.destroy()
  for (const program of programs) expect(deleted.mock.calls.some(([p]) => p === program)).toBe(false)
  expect(engine['_compositor']['_compositeProg']).toBeNull()
  expect(snapshotAccumStorage(gl).residentBytes).toBe(0)
})

it('preserves conservative orphan storage and does not refund a failed texture deletion', () => {
  const { engine } = createTestEngine({ paper: 'flat' })
  const gl = engine['gl'], buffer = engine['_compositeFBO'], texture = buffer.texture
  const primary = new Error('texture release failed'), original = gl.deleteTexture.bind(gl)
  vi.spyOn(gl, 'deleteTexture').mockImplementation(value => {
    if (value === texture) throw primary
    original(value)
  })
  const bytes = buffer.storageByteLength
  expect(() => engine.destroy()).toThrow(primary)
  expect(snapshotAccumStorage(gl)).toMatchObject({ residentBytes: bytes, orphanBytes: bytes })
  // A failed nested owner remains fault evidence, never a fake global reset.
  // End the test's synthetic context generation without claiming deletion.
  AccumulationBuffer.forgetContextStorage(gl)
})
