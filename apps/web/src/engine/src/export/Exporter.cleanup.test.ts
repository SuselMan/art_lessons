import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Exporter, type ExporterContext } from './Exporter'

const state = vi.hoisted(() => ({ buffers: [] as Array<{destroy: ReturnType<typeof vi.fn>; width: number; height: number}>,
  constructorCalls: 0, failConstructor: 0, failRead: false, failDestroy: new Set<number>(), failure: new Error('primary') }))
vi.mock('../buffers/AccumulationBuffer', () => ({ AccumulationBuffer: class {
  texture = {}; fbo = {}; width: number; height: number
  destroy = vi.fn(() => { if (state.failDestroy.has(this.id)) throw state.failure })
  clear = vi.fn()
  readPixels = vi.fn(() => { if (state.failRead) throw state.failure; return new Uint8Array(4) })
  id: number
  constructor(_gl: unknown, width: number, height: number) {
    this.id = ++state.constructorCalls
    if (this.id === state.failConstructor) throw state.failure
    this.width = width; this.height = height; state.buffers.push(this)
  }
} }))
beforeEach(() => { state.buffers = []; state.constructorCalls = 0; state.failConstructor = 0; state.failRead = false; state.failDestroy.clear(); state.failure = new Error('primary') })
function fixture() {
  const composePaper = vi.fn(), drawLayer = vi.fn()
  const encode = vi.fn(async () => {
    for (const buffer of state.buffers) expect(buffer.destroy).toHaveBeenCalledTimes(1)
    return new Blob()
  })
  const exporter = new Exporter({ gl: {}, infinite: false, pageSize: () => ({w:512,h:512}),
    compositeOrder: () => [{id:'layer',opacity:1}], composePaper, drawLayer, encode } as unknown as ExporterContext)
  const downsample = vi.fn()
  Reflect.set(exporter, 'renderDownsampleInto', downsample)
  return { exporter, composePaper, drawLayer, encode, downsample }
}
const operations = [
  { name: 'PNG', call: (e: Exporter) => e.exportPNG(false) },
  { name: 'review', call: (e: Exporter) => e.exportReviewImage() },
  { name: 'preview', call: (e: Exporter) => e.bakePreview(128) },
]
function allRetired() { for (const buffer of state.buffers) expect(buffer.destroy).toHaveBeenCalledTimes(1) }
for (const op of operations) describe(`${op.name} temporary buffer ownership`, () => {
  it('releases the published composite when allocation of the finishing buffer fails', async () => {
    const f = fixture(); state.failConstructor = 2
    await expect(Promise.resolve().then<unknown>(() => op.call(f.exporter))).rejects.toBe(state.failure)
    expect(state.buffers).toHaveLength(1); allRetired(); expect(f.encode).not.toHaveBeenCalled()
  })
  it('cleans every temporary after a rendering failure, preserving it over cleanup failure', async () => {
    const f = fixture(), renderFailure = new Error('render')
    f.composePaper.mockImplementation(() => { throw renderFailure }); state.failDestroy.add(1)
    await expect(Promise.resolve().then<unknown>(() => op.call(f.exporter))).rejects.toBe(renderFailure)
    expect(state.buffers).toHaveLength(2); allRetired(); expect(f.encode).not.toHaveBeenCalled()
  })
  it('cleans every temporary after readback fails', async () => {
    const f = fixture(); state.failRead = true
    await expect(Promise.resolve().then<unknown>(() => op.call(f.exporter))).rejects.toBe(state.failure)
    allRetired(); expect(f.encode).not.toHaveBeenCalled()
  })
  it('attempts remaining cleanup if the first destruction throws', async () => {
    const f = fixture(); state.failDestroy.add(1)
    await expect(Promise.resolve().then<unknown>(() => op.call(f.exporter))).rejects.toBe(state.failure)
    allRetired(); expect(f.encode).not.toHaveBeenCalled()
  })
  it('releases all temporary buffers before encoding begins', async () => {
    const f = fixture()
    await op.call(f.exporter)
    allRetired(); expect(f.encode).toHaveBeenCalledTimes(1)
  })
})
it('unpublished composite is destroyed if drawLayer fails, preserving the rendering exception', () => {
  const f = fixture(), renderFailure = new Error('layer')
  f.drawLayer.mockImplementation(() => { throw renderFailure }); state.failDestroy.add(1)
  expect(() => f.exporter.buildContentComposite({x:0,y:0,width:10,height:10})).toThrow(renderFailure)
  expect(state.buffers).toHaveLength(1); allRetired()
})
it('preview downsample failure cleans both previous and new targets exactly once', async () => {
  const f = fixture(); f.downsample.mockImplementation(() => { throw state.failure })
  await expect(Promise.resolve().then(() => f.exporter.bakePreview(128))).rejects.toBe(state.failure)
  expect(state.buffers).toHaveLength(3); allRetired()
})
it('preview next allocation failure still cleans its current target', async () => {
  const f = fixture(); state.failConstructor = 3
  await expect(Promise.resolve().then(() => f.exporter.bakePreview(128))).rejects.toBe(state.failure)
  expect(state.buffers).toHaveLength(2); allRetired()
})
it('preview retirement failure after downsample retains cleanup ownership of the new target', async () => {
  const f = fixture(); state.failDestroy.add(2)
  await expect(Promise.resolve().then(() => f.exporter.bakePreview(128))).rejects.toBe(state.failure)
  expect(state.buffers).toHaveLength(3); allRetired()
})
