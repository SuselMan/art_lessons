import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBrushLibrary } from './brushLibrary.js'
import { registerBrushLibraryRoutes } from './routes.js'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))) })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'grafetto-brush-library-'))
  directories.push(directory)
  const bytes = Buffer.from([0, 64, 128, 255])
  const hash = createHash('sha256').update(bytes).digest('hex')
  const manifest = { schemaVersion: 1, brushes: [], assets: [{ id: `asset:${hash}`, size: 2, file: `${hash}.bin` }], skipped: [] }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  await writeFile(join(directory, `${hash}.bin`), bytes)
  return { directory, bytes, hash, manifest }
}

describe('read-only brush library', () => {
  it('returns an empty catalog when no directory is configured', async () => {
    const app = Fastify()
    app.addHook('onRequest', async request => { request.userId = 'test-user' })
    try {
      await registerBrushLibraryRoutes(app, '')
      expect((await app.inject('/api/brush-library')).json()).toEqual({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })
      expect((await app.inject('/api/brush-library/assets/' + 'a'.repeat(64))).statusCode).toBe(404)
    } finally { await app.close() }
  })
  it('serves verified immutable binary assets and does not reread changed files', async () => {
    const f = await fixture()
    const app = Fastify()
    app.addHook('onRequest', async request => { request.userId = 'test-user' })
    try {
      await registerBrushLibraryRoutes(app, f.directory)
      expect((await app.inject('/api/brush-library')).json()).toEqual(f.manifest)
      await writeFile(join(f.directory, `${f.hash}.bin`), 'changed')
      const response = await app.inject(`/api/brush-library/assets/${f.hash}`)
      expect(response.rawPayload).toEqual(f.bytes)
      expect(response.headers['cache-control']).toContain('immutable')
      expect(response.headers['content-type']).toBe('application/octet-stream')
      expect((await app.inject('/api/brush-library/assets/nope')).statusCode).toBe(404)
    } finally { await app.close() }
  })
  it('rejects corrupt bytes', async () => {
    const f = await fixture()
    await writeFile(join(f.directory, `${f.hash}.bin`), Buffer.alloc(4))
    await expect(loadBrushLibrary(f.directory)).rejects.toThrow()
  })
  it('rejects path traversal and non-power-of-two sizes', async () => {
    const f = await fixture()
    f.manifest.assets[0].file = '../private.bin'
    await writeFile(join(f.directory, 'manifest.json'), JSON.stringify(f.manifest))
    await expect(loadBrushLibrary(f.directory)).rejects.toThrow()
    f.manifest.assets[0].file = `${f.hash}.bin`
    f.manifest.assets[0].size = 3
    await writeFile(join(f.directory, 'manifest.json'), JSON.stringify(f.manifest))
    await expect(loadBrushLibrary(f.directory)).rejects.toThrow()
  })
  it('rejects symlink files and configured directories', async () => {
    const f = await fixture()
    await rm(join(f.directory, `${f.hash}.bin`))
    await symlink('manifest.json', join(f.directory, `${f.hash}.bin`))
    await expect(loadBrushLibrary(f.directory)).rejects.toThrow()
    const alias = `${f.directory}-alias`
    directories.push(alias)
    await symlink(f.directory, alias)
    await expect(loadBrushLibrary(alias)).rejects.toThrow()
  })
  it('rejects missing descriptor asset references and excessive texture totals', async () => {
    const f = await fixture()
    const descriptor = {
      id: 'imported-' + 'a'.repeat(16), version: 1, model: 'stamp', category: 'paint',
      tip: { kind: 'bitmap', mask: 'asset:' + 'b'.repeat(64), hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
      paperInteraction: 0, spacing: 0.1, flow: 1, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
    }
    await writeFile(join(f.directory, 'manifest.json'), JSON.stringify({ ...f.manifest, brushes: [{ name: 'test', source: 'abr', warnings: [], descriptor }] }))
    await expect(loadBrushLibrary(f.directory)).rejects.toThrow('Invalid brush library')
    const assets = Array.from({ length: 65 }, (_, i) => {
      const hash = i.toString(16).padStart(64, '0')
      return { id: `asset:${hash}`, size: 2048, file: `${hash}.bin` }
    })
    await writeFile(join(f.directory, 'manifest.json'), JSON.stringify({ ...f.manifest, assets }))
    await expect(loadBrushLibrary(f.directory)).rejects.toThrow('Invalid brush library')
  })
  it('rejects oversized manifest before reading it', async () => {
    const f = await fixture()
    await writeFile(join(f.directory, 'manifest.json'), Buffer.alloc(4 * 1024 * 1024 + 1))
    await expect(loadBrushLibrary(f.directory)).rejects.toThrow()
  })
})
