import { isBrushLibrary, type BrushLibrary, type BrushImportJob } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels, importedBrushAssets, isBrushAssetReady } from '../../engine/brushLibrary'
import { apiResponse, apiPath, api } from './api'
import { cachedBrushAsset, cacheBrushAsset } from './brushAssetCache'

let library: BrushLibrary | null = null
let roomScope: string | undefined
let metadataWork: Promise<void> | null = null
let metadataScope: string | undefined
const pending = new Map<string, Promise<void>>()
const pinned = new Set<string>()
const listeners = new Set<() => void>()
export function subscribeBrushLibrary(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }

export function setBrushRoomScope(roomId: string | undefined): void {
  roomScope = roomId
}

/** Install metadata only. Resource bytes are loaded for selection/history. */
export async function loadBrushLibrary(): Promise<void> {
  const scope = roomScope
  const cacheKey = `grafetto:brush-library:v1:${scope ?? 'personal'}`
  let data: unknown
  try {
    const response = await apiResponse('GET /api/brush-library', { query: { roomId: scope } }, { signal: AbortSignal.timeout(30_000) })
    data = await response.json()
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof Error && ['AbortError','TimeoutError'].includes(error.name))) throw error
    try { data = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') } catch { /* unavailable storage */ }
    if (!isBrushLibrary(data, { maxBytes: 512 * 1024 * 1024, maxBrushes: 1024, maxAssets: 2048 })) data = { schemaVersion: 1, brushes: [], assets: [], skipped: [] }
  }
  if (!isBrushLibrary(data, { maxBytes: 512 * 1024 * 1024, maxBrushes: 1024, maxAssets: 2048 })) throw new Error('Invalid brush library')
  if (scope !== roomScope) return
  try { localStorage.setItem(cacheKey, JSON.stringify(data)) } catch { /* quota/private mode */ }
  installBrushLibrary(data)
  library = data
  for (const listener of listeners) listener()
}

function refreshMetadata(): Promise<void> {
  if (metadataWork && metadataScope === roomScope) return metadataWork
  metadataScope = roomScope
  const work = loadBrushLibrary().finally(() => { if (metadataWork === work) metadataWork = null })
  metadataWork = work
  return work
}
async function verified(id: string, data: Uint8Array, size: number): Promise<boolean> {
  if (data.length !== size * size) return false
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice()))
  return [...digest].map(v => v.toString(16).padStart(2, '0')).join('') === id.slice(6)
}
async function fetchAsset(id: string): Promise<void> {
  if (isBrushAssetReady(id)) return
  const existing = pending.get(id)
  if (existing) return existing
  const scope = roomScope
  const work = (async () => {
    const asset = library?.assets.find(a => a.id === id)
    if (!asset) throw new Error(`Unknown brush asset: ${id}`)
    const hash = id.slice(6)
    let data = await cachedBrushAsset(hash)
    if (!data || !await verified(id, data, asset.size)) {
      const response = await fetch(apiPath('GET /api/brush-library/assets/:hash', { params: { hash }, query: { roomId: scope } }), { credentials: 'include', signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error('Brush asset download failed')
      const length = Number(response.headers.get('Content-Length'))
      if (length && length !== asset.size * asset.size) throw new Error('Brush asset size mismatch')
      data = new Uint8Array(await response.arrayBuffer())
      if (data.length !== asset.size * asset.size) throw new Error('Brush asset size mismatch')
      if (!await verified(id, data, asset.size)) throw new Error('Brush asset checksum mismatch')
    }
    installBrushPixels(id, data)
    void cacheBrushAsset(hash, data)
  })().finally(() => pending.delete(id))
  pending.set(id, work)
  return work
}

/** Built-ins keep their synchronous event path. Unknown imported versions first
 * refresh the current room manifest; cold peers need no manual library reload. */
export function prepareBrushPresets(presets: readonly (string | undefined)[]): Promise<void> | null {
  const imported = presets.filter((p): p is string => !!p && (p.startsWith('brush:imported-') || p.startsWith('imported-')))
  let needed: Set<string>
  try { needed = new Set(presets.flatMap(p => importedBrushAssets(p)).filter(id => !isBrushAssetReady(id))) }
  catch {
    if (!imported.length) throw new Error('Invalid brush preset')
    return refreshMetadata().then(async () => { const work = prepareBrushPresetsKnown(presets); if (work) await work })
  }
  if (!needed.size) return null
  return (async () => { for (const id of needed) await fetchAsset(id) })()
}
function prepareBrushPresetsKnown(presets: readonly (string | undefined)[]): Promise<void> | null {
  const needed = new Set(presets.flatMap(p => importedBrushAssets(p)).filter(id => !isBrushAssetReady(id)))
  return needed.size ? (async () => { for (const id of needed) await fetchAsset(id) })() : null
}

/** Bind before a local stroke can be streamed. Read-only restore never needs a
 * write request; the server pins references again when accepting operations. */
export async function publishBrushPresets(roomId: string, presets: string[]): Promise<void> {
  const fresh = presets.filter(p => !pinned.has(`${roomId}:${p}`))
  if (!fresh.length) return
  await api('POST /api/rooms/:id/brush-library', { params: { id: roomId }, body: { presets: fresh } })
  for (const p of fresh) pinned.add(`${roomId}:${p}`)
}

export async function importBrushFile(file: File, progress: (value: number) => void, signal: AbortSignal): Promise<BrushImportJob> {
  if (file.size > 512 * 1024 * 1024) throw new Error('brushLibrary.tooLarge')
  const job = await new Promise<BrushImportJob>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    signal.addEventListener('abort', abort, { once: true })
    xhr.open('POST', apiPath('POST /api/brush-library/imports'))
    xhr.withCredentials = true
    xhr.timeout = 5 * 60_000
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-Brush-Filename', encodeURIComponent(file.name))
    xhr.upload.onprogress = e => { if (e.lengthComputable) progress(e.loaded / e.total) }
    xhr.onloadend = () => signal.removeEventListener('abort', abort)
    xhr.onerror = () => reject(new Error('brushLibrary.uploadFailed'))
    xhr.ontimeout = () => reject(new Error('brushLibrary.uploadFailed'))
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'))
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText)
        if (xhr.status < 200 || xhr.status >= 300) throw new Error(typeof result.error === 'string' ? result.error : 'brushLibrary.uploadFailed')
        if (!result.id || !result.status) throw new Error('brushLibrary.uploadFailed')
        resolve(result)
      } catch (e) { reject(e) }
    }
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
    xhr.send(file)
  })
  let result = job
  const deadline = Date.now() + 10 * 60_000
  while (result.status === 'running' || result.status === 'queued') {
    if (Date.now() > deadline) throw new Error('brushLibrary.importTimeout')
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, 1000)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
    result = await (await apiResponse('GET /api/brush-library/imports/:id', { params: { id: job.id } }, { signal })).json()
  }
  if (result.status === 'failed') throw new Error(result.error ?? 'brushLibrary.importFailed')
  return result
}
