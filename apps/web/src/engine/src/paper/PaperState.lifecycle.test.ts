import { afterEach, expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { PaperState } from './PaperState'
import { __resetPaperLoaderForTesting, __setPaperLoaderForTesting, createPlaceholderPaperTexture, generatePaperMipmaps, uploadPaperTexture } from './paperLoader'

const bytes = new Uint8Array(8).fill(128)
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(onLoaded = vi.fn()) {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const paper = new PaperState({ gl, infinite: false, type: 'coarse', scale: 1, fillThreshold: 0, fillCap: .35, canvas: { width: 8, height: 8 }, onLoaded })
  return { gl, paper, onLoaded }
}
function failure(work: () => unknown): unknown {
  try { work() } catch (error) { return error }
  throw new Error('Expected failure')
}
afterEach(() => { vi.restoreAllMocks(); __resetPaperLoaderForTesting() })

it.each(['placeholder', 'real'] as const)('%s texture rejects null without uploading', kind => {
  const { gl } = setup(), create = vi.fn<() => WebGLTexture | null>(() => null)
  Object.defineProperty(gl, 'createTexture', { value: create })
  const upload = vi.spyOn(gl, 'texImage2D')
  expect(() => kind === 'placeholder' ? createPlaceholderPaperTexture(gl) : uploadPaperTexture(gl, bytes)).toThrow('Paper texture allocation failed')
  expect(upload).not.toHaveBeenCalled()
})
it.each(['bindTexture', 'texImage2D', 'texParameteri', 'pixelStorei'] as const)('rolls back local texture after %s throw, preserving primary through deletion error', boundary => {
  const { gl } = setup(), created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture'), primary = new Error(boundary)
  vi.spyOn(gl, boundary).mockImplementationOnce(() => { throw primary })
  deleted.mockImplementationOnce(() => { throw new Error('secondary delete') })
  expect(failure(() => uploadPaperTexture(gl, bytes))).toBe(primary)
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(created.mock.results[0]?.value)
})
it.each([0, 1, 6, 12, 18])('rejects invalid LA payload length %i before allocating', length => {
  const { gl } = setup(), created = vi.spyOn(gl, 'createTexture')
  expect(() => uploadPaperTexture(gl, new Uint8Array(length))).toThrow('Invalid paper texture dimensions')
  expect(created).not.toHaveBeenCalled()
})
it('reports a prior GL error once before allocation or mip mutation, without draining', () => {
  const { gl } = setup(), create = vi.spyOn(gl, 'createTexture'), bind = vi.spyOn(gl, 'bindTexture'), mip = vi.spyOn(gl, 'generateMipmap')
  const prior = vi.spyOn(gl, 'getError').mockReturnValue(0x505)
  expect(() => uploadPaperTexture(gl, bytes)).toThrow('prior GL error')
  expect(prior).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled()
  prior.mockReset().mockImplementation(() => { if (prior.mock.calls.length > 2) throw new Error('unbounded drain trap'); return 0x505 })
  expect(() => generatePaperMipmaps(gl, {})).toThrow('prior GL error')
  expect(prior).toHaveBeenCalledOnce(); expect(bind).not.toHaveBeenCalled(); expect(mip).not.toHaveBeenCalled()
})
it('rejects own void upload error and deletes only its local texture', () => {
  const { gl } = setup(), foreign = gl.createTexture()
  const created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture')
  let error = 0
  vi.spyOn(gl, 'getError').mockImplementation(() => { const result = error; error = 0; return result })
  vi.spyOn(gl, 'texImage2D').mockImplementation(() => { error = 0x505 })
  expect(() => uploadPaperTexture(gl, bytes)).toThrow('Paper texture upload GL error')
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(created.mock.results[0]?.value)
  expect(deleted.mock.calls.some(([tex]) => tex === foreign)).toBe(false)
})
it('keeps a valid base texture with LINEAR when its own mip call is refused', () => {
  const { gl } = setup(), texture = uploadPaperTexture(gl, bytes)
  let error = 0
  vi.spyOn(gl, 'getError').mockImplementation(() => { const result = error; error = 0; return result })
  vi.spyOn(gl, 'generateMipmap').mockImplementationOnce(() => { error = 0x502 })
  expect(generatePaperMipmaps(gl, texture)).toBe(false)
  expect((gl as unknown as MockGL).getMinFilter(texture)).toBe(gl.LINEAR)
  gl.deleteTexture(texture)
})
it('owns a placeholder candidate through mip preparation and rolls it back on failure', () => {
  __setPaperLoaderForTesting(async () => bytes)
  const { gl, paper, onLoaded } = setup(), created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture'), primary = new Error('mip throw')
  vi.spyOn(gl, 'generateMipmap').mockImplementationOnce(() => { throw primary })
  expect(failure(() => paper.init())).toBe(primary)
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(created.mock.results[0]?.value)
  expect(paper.loaded).toBe(false); expect(onLoaded).not.toHaveBeenCalled()
  paper.destroy()
})
it('keeps the old valid texture when an unpublished real candidate mip stage fails', async () => {
  __setPaperLoaderForTesting(async () => bytes)
  const { gl, paper, onLoaded } = setup()
  paper.init(); await paper.ready()
  const old = paper.texture, primary = new Error('new mip')
  const created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture')
  vi.spyOn(gl, 'generateMipmap').mockImplementationOnce(() => { throw primary })
  paper.setType('medium')
  await expect(paper.ready()).rejects.toBe(primary)
  expect(paper.texture).toBe(old); expect(paper.loaded).toBe(true)
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(created.mock.results[0]?.value)
  expect(onLoaded).toHaveBeenCalledOnce(); paper.destroy()
})
it('publishes only the latest type attempt when A resolves after B', async () => {
  const a = deferred<Uint8Array>(), b = deferred<Uint8Array>()
  __setPaperLoaderForTesting(type => type === 'coarse' ? a.promise : b.promise)
  const { gl, paper, onLoaded } = setup()
  paper.init(); const oldReady = paper.ready(); paper.setType('medium')
  b.resolve(bytes); await paper.ready()
  const current = paper.texture, upload = vi.spyOn(gl, 'texImage2D'), deleted = vi.spyOn(gl, 'deleteTexture')
  a.resolve(bytes); await oldReady
  expect(upload).not.toHaveBeenCalled(); expect(deleted).not.toHaveBeenCalled()
  expect(paper.texture).toBe(current); expect(onLoaded).toHaveBeenCalledOnce(); paper.destroy()
})
it('guards A-B-A by request identity even when A reuses the same shared byte promise', async () => {
  const a = deferred<Uint8Array>(), b = deferred<Uint8Array>()
  __setPaperLoaderForTesting(type => type === 'coarse' ? a.promise : b.promise)
  const { gl, paper, onLoaded } = setup()
  paper.init(); const first = paper.ready(); paper.setType('medium'); const middle = paper.ready(); paper.setType('coarse')
  const upload = vi.spyOn(gl, 'texImage2D')
  a.resolve(bytes); await Promise.all([first, paper.ready()]); b.resolve(bytes); await middle
  expect(upload).toHaveBeenCalledOnce(); expect(onLoaded).toHaveBeenCalledOnce(); paper.destroy()
})
it('can retry a failed new type while the previous real type remains valid', async () => {
  let medium = 0
  __setPaperLoaderForTesting(async type => { if (type === 'medium' && medium++ === 0) throw new Error('fetch failed'); return bytes })
  const { paper, onLoaded } = setup()
  paper.init(); await paper.ready(); const old = paper.texture
  paper.setType('medium'); await expect(paper.ready()).rejects.toThrow('fetch failed')
  expect(paper.loaded).toBe(true); expect(paper.texture).toBe(old)
  await paper.retry()
  expect(paper.texture).not.toBe(old); expect(medium).toBe(2); expect(onLoaded).toHaveBeenCalledTimes(2)
  paper.destroy()
})
it('deactivation invalidates pending work but leaves current texture alive until late owned destroy', async () => {
  const pending = deferred<Uint8Array>()
  __setPaperLoaderForTesting(() => pending.promise)
  const { gl, paper, onLoaded } = setup()
  paper.init(); const texture = paper.texture, ready = paper.ready(), deleted = vi.spyOn(gl, 'deleteTexture'), upload = vi.spyOn(gl, 'texImage2D')
  paper.deactivate()
  expect(paper.texture).toBe(texture); expect(deleted).not.toHaveBeenCalled()
  pending.resolve(bytes); await ready
  expect(upload).not.toHaveBeenCalled(); expect(onLoaded).not.toHaveBeenCalled()
  paper.destroy(); paper.destroy()
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(texture)
  expect(() => paper.init()).toThrow('PaperState destroyed')
})
it('suppresses old-context completion before and after restoration without deleting restored texture', async () => {
  const pending = deferred<Uint8Array>()
  __setPaperLoaderForTesting(() => pending.promise)
  const { gl, paper, onLoaded } = setup()
  paper.init(); const oldReady = paper.ready(), old = paper.texture
  paper.contextLost()
  const upload = vi.spyOn(gl, 'texImage2D'), deleted = vi.spyOn(gl, 'deleteTexture')
  paper.init(); const placeholder = paper.texture
  expect(placeholder).not.toBe(old); expect(deleted).not.toHaveBeenCalled()
  upload.mockClear(); pending.resolve(bytes); await Promise.all([oldReady, paper.ready()])
  expect(upload).toHaveBeenCalledOnce(); expect(onLoaded).toHaveBeenCalledOnce()
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(placeholder); paper.destroy()
})
it('a lost owner cannot upload pending bytes before the restore event starts init', async () => {
  const pending = deferred<Uint8Array>()
  __setPaperLoaderForTesting(() => pending.promise)
  const { gl, paper, onLoaded } = setup()
  paper.init(); const ready = paper.ready(); paper.contextLost()
  const upload = vi.spyOn(gl, 'texImage2D'), deleted = vi.spyOn(gl, 'deleteTexture')
  pending.resolve(bytes); await ready
  expect(upload).not.toHaveBeenCalled(); expect(deleted).not.toHaveBeenCalled(); expect(onLoaded).not.toHaveBeenCalled()
  paper.destroy(); expect(deleted).not.toHaveBeenCalled()
})
it('two same-context owners share bytes but only the active owner publishes or deletes its own textures', async () => {
  const pending = deferred<Uint8Array>()
  __setPaperLoaderForTesting(() => pending.promise)
  const { gl, paper: first } = setup(), second = new PaperState({ gl, infinite: false, type: 'coarse', scale: 1, fillThreshold: 0, fillCap: .35, canvas: { width: 8, height: 8 }, onLoaded: vi.fn() })
  first.init(); second.init(); const ready = first.ready(), secondPlaceholder = second.texture
  first.destroy()
  const deleted = vi.spyOn(gl, 'deleteTexture')
  pending.resolve(bytes); await Promise.all([ready, second.ready()])
  expect(second.loaded).toBe(true)
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(secondPlaceholder)
  const current = second.texture; second.destroy()
  expect(deleted.mock.calls.some(([tex]) => tex === current)).toBe(true)
})
it('does not roll back a published new texture if old retirement or onLoaded throws', async () => {
  __setPaperLoaderForTesting(async () => bytes)
  const { gl, paper, onLoaded } = setup()
  paper.init(); await paper.ready(); const old = paper.texture, primary = new Error('old delete')
  const original = gl.deleteTexture.bind(gl), deleted = vi.spyOn(gl, 'deleteTexture').mockImplementation(texture => { if (texture === old) throw primary; original(texture) })
  paper.setType('medium'); await expect(paper.ready()).rejects.toBe(primary)
  const committed = paper.texture
  expect(committed).not.toBe(old); expect(deleted.mock.calls.some(([tex]) => tex === committed)).toBe(false); expect(onLoaded).toHaveBeenCalledOnce()
  onLoaded.mockImplementationOnce(() => { throw new Error('callback') })
  paper.setType('fine'); await expect(paper.ready()).rejects.toThrow('callback')
  const final = paper.texture
  expect(deleted.mock.calls.some(([tex]) => tex === final)).toBe(false)
  paper.destroy(); paper.destroy(); expect(deleted.mock.calls.filter(([tex]) => tex === final)).toHaveLength(1)
})


it.each([2, 3, 4])('rolls back the local texture at parameter setup #%i', ordinal => {
  const { gl } = setup(), original = gl.texParameteri.bind(gl), primary = new Error('parameter')
  const created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture')
  let n = 0
  vi.spyOn(gl, 'texParameteri').mockImplementation((...args) => { if (++n === ordinal) throw primary; original(...args) })
  expect(failure(() => uploadPaperTexture(gl, bytes))).toBe(primary)
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(created.mock.results[0]?.value)
})
it('uses the actual GL dimension limit before allocating a valid but too-large POT payload', () => {
  const { gl } = setup(), query = gl.getParameter.bind(gl), create = vi.spyOn(gl, 'createTexture')
  vi.spyOn(gl, 'getParameter').mockImplementation(name => name === gl.MAX_TEXTURE_SIZE ? 4 : query(name))
  expect(() => uploadPaperTexture(gl, new Uint8Array(8 * 8 * 2))).toThrow('Invalid paper texture dimensions')
  expect(create).not.toHaveBeenCalled()
})
it.each([1, 2])('preserves valid %ix%i LA bytes, repeat parameters and LINEAR base', res => {
  const { gl } = setup(), data = new Uint8Array(res * res * 2).fill(127), upload = vi.spyOn(gl, 'texImage2D')
  const texture = uploadPaperTexture(gl, data), mock = gl as unknown as MockGL
  // texImage2D has both six-argument image and nine-argument raw-byte overloads.
  const args: readonly unknown[] = upload.mock.calls[0] ?? []
  expect(args[3]).toBe(res); expect(args[4]).toBe(res)
  expect(args[8]).toBe(data)
  expect(mock.getTextureWrap(texture)).toEqual({ wrapS: gl.REPEAT, wrapT: gl.REPEAT })
  expect(mock.getMinFilter(texture)).toBe(gl.LINEAR); gl.deleteTexture(texture)
})
it('retains its prior valid texture when a healthy reinitialization candidate fails', async () => {
  __setPaperLoaderForTesting(async () => bytes)
  const { gl, paper } = setup()
  paper.init(); await paper.ready(); const old = paper.texture
  const created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture'), primary = new Error('reinit mip')
  vi.spyOn(gl, 'generateMipmap').mockImplementationOnce(() => { throw primary })
  expect(failure(() => paper.init())).toBe(primary)
  expect(paper.texture).toBe(old); expect(paper.loaded).toBe(true)
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(created.mock.results[0]?.value)
  paper.destroy()
})
it('healthy reinitialization and final destroy each retire only the names they replaced or still own', async () => {
  __setPaperLoaderForTesting(async () => bytes)
  const { gl, paper } = setup()
  paper.init(); await paper.ready(); const old = paper.texture, deleted = vi.spyOn(gl, 'deleteTexture')
  paper.init(); const placeholder = paper.texture
  expect(deleted.mock.calls.filter(([tex]) => tex === old)).toHaveLength(1)
  await paper.ready(); const current = paper.texture
  expect(deleted.mock.calls.filter(([tex]) => tex === placeholder)).toHaveLength(1)
  paper.destroy(); paper.destroy()
  expect(deleted.mock.calls.filter(([tex]) => tex === current)).toHaveLength(1)
})
it('does not retry deletion of an obsolete unpublished candidate when its one cleanup attempt throws', async () => {
  const fine = deferred<Uint8Array>()
  __setPaperLoaderForTesting(type => type === 'fine' ? fine.promise : Promise.resolve(bytes))
  const { gl, paper } = setup()
  paper.init(); await paper.ready()
  const created = vi.spyOn(gl, 'createTexture'), original = gl.deleteTexture.bind(gl), primary = new Error('obsolete delete')
  const deleted = vi.spyOn(gl, 'deleteTexture').mockImplementation(texture => {
    if (texture === created.mock.results[0]?.value) throw primary
    original(texture)
  })
  vi.spyOn(gl, 'generateMipmap').mockImplementationOnce(() => { paper.setType('fine') })
  paper.setType('medium'); const obsoleteReady = paper.ready()
  await expect(obsoleteReady).rejects.toBe(primary)
  const obsolete = created.mock.results[0]?.value
  expect(deleted.mock.calls.filter(([tex]) => tex === obsolete)).toHaveLength(1)
  fine.resolve(bytes); await paper.ready(); paper.destroy()
  expect(deleted.mock.calls.filter(([tex]) => tex === obsolete)).toHaveLength(1)
})
it('does not publish or delete a candidate if the actual context becomes lost during mip preparation', async () => {
  __setPaperLoaderForTesting(async () => bytes)
  const { gl, paper, onLoaded } = setup()
  paper.init(); await paper.ready()
  let lost = false
  vi.spyOn(gl, 'isContextLost').mockImplementation(() => lost)
  vi.spyOn(gl, 'generateMipmap').mockImplementationOnce(() => { lost = true })
  const deleted = vi.spyOn(gl, 'deleteTexture')
  paper.setType('medium'); await expect(paper.ready()).rejects.toThrow('Paper context lost')
  expect(paper.loaded).toBe(false); expect(onLoaded).toHaveBeenCalledOnce(); expect(deleted).not.toHaveBeenCalled()
  paper.destroy(); expect(deleted).not.toHaveBeenCalled()
})
it('detects actual GL loss after awaiting bytes even before a loss event reaches the owner', async () => {
  const pending = deferred<Uint8Array>()
  __setPaperLoaderForTesting(() => pending.promise)
  const { gl, paper, onLoaded } = setup()
  paper.init(); const ready = paper.ready()
  vi.spyOn(gl, 'isContextLost').mockReturnValue(true)
  const upload = vi.spyOn(gl, 'texImage2D'), deleted = vi.spyOn(gl, 'deleteTexture')
  pending.resolve(bytes); await ready
  expect(upload).not.toHaveBeenCalled(); expect(paper.loaded).toBe(false); expect(onLoaded).not.toHaveBeenCalled()
  paper.destroy(); expect(deleted).not.toHaveBeenCalled()
})
it('does not let an obsolete failed attempt replace current ready or texture', async () => {
  const a = deferred<Uint8Array>(), b = deferred<Uint8Array>(), primary = new Error('old fetch')
  __setPaperLoaderForTesting(type => type === 'coarse' ? a.promise : b.promise)
  const { paper, onLoaded } = setup()
  paper.init(); const oldReady = paper.ready(); paper.setType('medium'); const currentReady = paper.ready()
  b.resolve(bytes); await currentReady; const texture = paper.texture
  a.reject(primary); await expect(oldReady).rejects.toBe(primary)
  expect(paper.ready()).toBe(currentReady); expect(paper.texture).toBe(texture); expect(onLoaded).toHaveBeenCalledOnce()
  paper.destroy()
})
it('closed owners reject new work before any cache provider or texture allocation', async () => {
  const loader = vi.fn(async () => bytes)
  __setPaperLoaderForTesting(loader)
  const { gl, paper } = setup()
  paper.init(); await paper.ready(); paper.destroy()
  const created = vi.spyOn(gl, 'createTexture')
  expect(() => paper.retry()).toThrow('PaperState destroyed')
  expect(() => paper.setType('medium')).toThrow('PaperState destroyed')
  expect(() => paper.init()).toThrow('PaperState destroyed')
  expect(loader).toHaveBeenCalledOnce(); expect(created).not.toHaveBeenCalled()
})


it('still attempts the local texture delete when cleanup status query also throws', () => {
  const { gl } = setup(), primary = new Error('upload'), secondary = new Error('cleanup status')
  const created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture')
  vi.spyOn(gl, 'isContextLost').mockReturnValueOnce(false).mockImplementationOnce(() => { throw secondary })
  vi.spyOn(gl, 'texImage2D').mockImplementationOnce(() => { throw primary })
  expect(failure(() => uploadPaperTexture(gl, bytes))).toBe(primary)
  expect(deleted.mock.calls).toHaveLength(1); expect(deleted.mock.calls[0]?.[0]).toBe(created.mock.results[0]?.value)
})
