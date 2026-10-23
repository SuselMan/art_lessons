import { constants } from 'node:fs'
import { open, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, parse } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { isBrushLibrary, type BrushLibrary } from '@grafetto/shared'
import { apiRoute } from '../http/apiRoute.js'

const HASH = /^[a-f0-9]{64}$/
const MAX_MANIFEST = 2 * 1024 * 1024
const MAX_ASSETS = 256 * 1024 * 1024
const empty = (): BrushLibrary => ({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })
function fail(): never { throw new Error('Invalid brush library') }

/** Reject symlinks in every directory component, including the configured root. */
async function checkDirectory(directory: string): Promise<void> {
  const absolute = resolve(directory)
  let cursor = parse(absolute).root
  for (const part of absolute.slice(cursor.length).split('/').filter(Boolean)) {
    cursor = join(cursor, part)
    const stat = await lstat(cursor)
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail()
  }
}
async function readFile(path: string, limit: number): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > limit) fail()
    const bytes = await handle.readFile()
    if (bytes.length !== stat.size || bytes.length > limit) fail()
    return bytes
  } finally { await handle.close() }
}

/** An operator-provisioned catalog, never an upload directory. All bytes are verified
 * once before registration and retained so later filesystem edits cannot change them. */
export async function loadBrushLibrary(directory?: string): Promise<{ manifest: BrushLibrary; assets: Map<string, Buffer> }> {
  if (!directory) return { manifest: empty(), assets: new Map() }
  await checkDirectory(directory)
  const value: unknown = JSON.parse((await readFile(join(directory, 'manifest.json'), MAX_MANIFEST)).toString('utf8'))
  if (!isBrushLibrary(value)) fail()
  const assets = new Map<string, Buffer>()
  const manifest: BrushLibrary = empty()
  let total = 0
  for (const asset of value.assets) {
    const hash = asset.id.slice(6)
    // A single basename prevents traversal and avoids exposing private source paths.
    if (asset.file !== `${hash}.bin` || assets.has(hash)) fail()
    total += asset.size * asset.size
    if (total > MAX_ASSETS) fail()
    const bytes = await readFile(join(directory, asset.file), asset.size * asset.size)
    if (bytes.length !== asset.size * asset.size || createHash('sha256').update(bytes).digest('hex') !== hash) fail()
    assets.set(hash, bytes)
    manifest.assets.push({ id: `asset:${hash}`, size: asset.size, file: `${hash}.bin` })
  }
  for (const brush of value.brushes) {
    // Only a format or filename is public metadata, never a local source path.
    if (brush.source.includes('/') || brush.source.includes('\\') || brush.source.includes('..')) fail()
    manifest.brushes.push(brush)
  }
  manifest.skipped = value.skipped
  return { manifest, assets }
}

export async function registerBrushLibraryRoutes(app: FastifyInstance, directory = process.env.GRAFETTO_BRUSH_LIBRARY_DIR): Promise<void> {
  const { manifest, assets } = await loadBrushLibrary(directory)
  apiRoute(app, 'GET /api/brush-library', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-cache')
    return manifest
  })
  apiRoute(app, 'GET /api/brush-library/assets/:hash', async (request, reply) => {
    const bytes = HASH.test(request.params.hash) ? assets.get(request.params.hash) : undefined
    if (!bytes) return reply.code(404).send({ error: 'Brush asset not found' })
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('application/octet-stream').send(bytes)
  })
}
