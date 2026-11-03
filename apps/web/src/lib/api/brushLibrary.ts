import {canonicalSourcePatternResource,type BrushPattern,type CanonicalSourcePatternResource} from '@grafetto/shared'
import { CANONICAL_RECORDED_ATTACHMENT_LIMITS, isBrushLibrary, type CanonicalMaterialAsset, type BrushLibrary, type BrushImportJob } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels, retainImportedBrushResources, importedBrushAssets, isBrushAssetReady } from '../../engine/brushLibrary'
import { apiResponse, apiPath, api } from './api'
import { cachedBrushAsset, cacheBrushAsset, readExactBrushAssetBody } from './brushAssetCache'

let library: BrushLibrary | null = null
let roomScope: string | undefined
const metadataWork = new Map<string | undefined, Promise<void>>()
const pending = new Map<string, Promise<void>>()
const pinned = new Set<string>()
const listeners = new Set<() => void>()
const scopedLibraries = new Map<string | undefined, BrushLibrary>()
const engines = new Map<string, number>()
export function subscribeBrushLibrary(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }

/** Declared current-room paint patterns; no implicit selection or paint grant. */
export function brushPatterns():readonly BrushPattern[]{return library?.patterns??[]}
async function captureCatalogPatterns(data:BrushLibrary):Promise<readonly BrushPattern[]>{
 const patterns=data.patterns??[],result:BrushPattern[]=[]
 for(const pattern of patterns){
  const resource=canonicalSourcePatternResource(pattern.resource)
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(resource,Object.keys(resource).sort())))
  const id='pattern:'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
  if(id!==pattern.id)throw new Error('Brush pattern catalog identity differs')
  result.push(Object.freeze({id,name:pattern.name,resource}))
 }
 return Object.freeze(result)
}

/** App selection seam. The caller owns its selection/engine lifetime and must
 * install the returned resource explicitly; this never chooses a default. */
export async function prepareBrushPattern(roomId:string,id:string,assertCurrent:()=>void):Promise<Readonly<CanonicalSourcePatternResource>>{
 if(typeof id!=='string'||!/^pattern:[a-f0-9]{64}$/.test(id)||typeof assertCurrent!=='function')throw new TypeError('Invalid selected brush pattern')
 const current=()=>{if(roomScope!==roomId)throw new DOMException('Pattern room changed','AbortError');assertCurrent();if(roomScope!==roomId)throw new DOMException('Pattern room changed','AbortError')}
 current();if(!scopedLibraries.has(roomId)){await (metadataWork.get(roomId)??loadBrushLibrary());current()}
 const pattern=scopedLibraries.get(roomId)?.patterns?.find(pattern=>pattern.id===id)
 if(!pattern)throw new Error('Selected brush pattern unavailable')
 const resource=canonicalSourcePatternResource(pattern.resource)
 const assets=[...new Set([...resource.channels,resource.alphaAsset])].map(id=>({id,size:resource.size}))
 await prepareCanonicalImageAssets(roomId,assets,current);current()
 const now=scopedLibraries.get(roomId)?.patterns?.find(pattern=>pattern.id===id)
 if(!now||JSON.stringify(now.resource,Object.keys(now.resource).sort())!==JSON.stringify(resource,Object.keys(resource).sort()))throw new Error('Selected brush pattern changed')
 return resource
}

function pruneResources(): void {
  for (const scope of scopedLibraries.keys()) {
    if (scope !== roomScope && (!scope || !engines.has(scope))) scopedLibraries.delete(scope)
  }
  retainImportedBrushResources([...scopedLibraries.values()])
}

/** The lease ends after destroy, including the final asynchronous thumbnail. */
export function retainBrushRoomResources(boardId: string): () => void {
  engines.set(boardId, (engines.get(boardId) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const count = (engines.get(boardId) ?? 1) - 1
    if (count) engines.set(boardId, count)
    else engines.delete(boardId)
    pruneResources()
  }
}

export function setBrushRoomScope(roomId: string | undefined): void {
  if (roomScope === roomId) return
  roomScope = roomId
  library = scopedLibraries.get(roomId) ?? null
  pruneResources()
}

/** Install metadata only. Resource bytes are loaded for selection/history. */
export function loadBrushLibrary(): Promise<void> {
  const scope = roomScope
  const existing = metadataWork.get(scope)
  if (existing) return existing
  const work = loadMetadata(scope).finally(() => {
    if (metadataWork.get(scope) === work) metadataWork.delete(scope)
  })
  metadataWork.set(scope, work)
  return work
}

async function loadMetadata(scope: string | undefined): Promise<void> {
  const cacheKey = `grafetto:brush-library:v1:${scope ?? 'personal'}`
  let data: unknown
  try {
    const response = await apiResponse('GET /api/brush-library', { query: { roomId: scope } }, { signal: AbortSignal.timeout(30_000) })
    data = await response.json()
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof Error && ['AbortError','TimeoutError'].includes(error.name))) throw error
    // A transport failure says nothing about which immutable room versions
    // exist. Never replace a successful in-memory manifest with stale/empty
    // offline metadata: pruning would make already loaded history unreadable.
    if (scopedLibraries.has(scope)) return
    try { data = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') } catch { /* unavailable storage */ }
    if (!isBrushLibrary(data, { maxBytes: 512 * 1024 * 1024, maxBrushes: 1024, maxAssets: 2048 })) throw error
  }
  if (!isBrushLibrary(data, { maxBytes: 512 * 1024 * 1024, maxBrushes: 1024, maxAssets: 2048 })) throw new Error('Invalid brush library')
  const patterns=await captureCatalogPatterns(data)
  const captured:BrushLibrary=data.patterns===undefined?data:{...data,patterns}
  if (scope !== roomScope) return
  try { localStorage.setItem(cacheKey, JSON.stringify(captured)) } catch { /* quota/private mode */ }
  installBrushLibrary(captured)
  library = captured
  scopedLibraries.set(scope, captured)
  pruneResources()
  for (const listener of listeners) listener()
}

async function verified(id: string, data: Uint8Array, size: number): Promise<boolean> {
  if (data.length !== size * size) return false
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice()))
  return [...digest].map(v => v.toString(16).padStart(2, '0')).join('') === id.slice(6)
}
async function fetchAsset(id: string): Promise<void> {
  if (isBrushAssetReady(id)) return
  const scope = roomScope
  const key = `${scope ?? 'personal'}:${id}`
  const existing = pending.get(key)
  if (existing) return existing
  const work = (async () => {
    const asset = library?.assets.find(a => a.id === id)
    if (!asset) throw new Error(`Unknown brush asset: ${id}`)
    const hash = id.slice(6)
    const expectedBytes = asset.size * asset.size
    let data = await cachedBrushAsset(hash, expectedBytes)
    if (!data || !await verified(id, data, asset.size)) {
      const response = await fetch(apiPath('GET /api/brush-library/assets/:hash', { params: { hash }, query: { roomId: scope } }), { credentials: 'include', signal: AbortSignal.timeout(30_000) })
      if (!response.ok) {
        try { await response.body?.cancel() } catch { /* Preserve the HTTP download failure. */ }
        throw new Error('Brush asset download failed')
      }
      // Content-Length is transport metadata, not decoded body-size authority.
      data = await readExactBrushAssetBody(response, expectedBytes)
      if (!await verified(id, data, asset.size)) throw new Error('Brush asset checksum mismatch')
    }
    if (scopedLibraries.get(scope)?.assets.some(a => a.id === id)) installBrushPixels(id, data)
    void cacheBrushAsset(hash, data)
  })().finally(() => pending.delete(key))
  pending.set(key, work)
  return work
}

/** Prepare availability only. The caller must close assertCurrent over the
 * original read and exact captured scope; this function creates no read grant. */
export async function prepareCanonicalImageAssets(
  roomId: string,
  assets: readonly Pick<CanonicalMaterialAsset, 'id' | 'size'>[],
  assertCurrent: () => void,
): Promise<void> {
  if (typeof roomId !== 'string' || !roomId || roomId.length > 256 || typeof assertCurrent !== 'function' ||
      !Array.isArray(assets) || assets.length > CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities) throw new TypeError('Invalid canonical image resources')
  const selectors = new Map<string, number>()
  for (let i = 0; i < assets.length; i++) {
    const item = Object.getOwnPropertyDescriptor(assets, String(i))
    if (!item || !('value' in item) || !item.value || typeof item.value !== 'object') throw new TypeError('Invalid canonical image resource')
    const idField = Object.getOwnPropertyDescriptor(item.value, 'id'), sideField = Object.getOwnPropertyDescriptor(item.value, 'size')
    if (!idField || !('value' in idField) || !sideField || !('value' in sideField)) throw new TypeError('Invalid canonical image resource')
    const id: unknown = idField.value, side: unknown = sideField.value
    if (typeof id !== 'string' || !/^asset:[a-f0-9]{64}$/.test(id) || typeof side !== 'number' ||
        !Number.isInteger(side) || side < 2 || side > 2048 || (side & (side - 1)) !== 0) throw new TypeError('Invalid canonical image resource')
    const previous = selectors.get(id)
    if (previous !== undefined && previous !== side) throw new TypeError('Conflicting canonical image resource side')
    selectors.set(id, side)
  }
  const checkCurrent = () => {
    if (roomScope !== roomId) throw new DOMException('Brush room changed during preparation', 'AbortError')
    assertCurrent()
    if (roomScope !== roomId) throw new DOMException('Brush room changed during preparation', 'AbortError')
  }
  const available = () => {
    const catalog = scopedLibraries.get(roomId)
    for (const [id, side] of selectors) if (!catalog?.assets.some(a => a.id === id && a.size === side)) return false
    return true
  }
  checkCurrent()
  if (selectors.size && !available()) {
    const existing = metadataWork.get(roomId)
    await (existing ?? loadBrushLibrary())
    checkCurrent()
    if (existing && !available()) {
      await loadBrushLibrary()
      checkCurrent()
    }
  }
  if (!available()) throw new Error('Canonical image resource unavailable')
  for (const [id, side] of selectors) {
    checkCurrent()
    if (!available()) throw new Error('Canonical image resource unavailable')
    if (isBrushAssetReady(id) && !isBrushAssetReady(id, side)) throw new Error('Canonical image resource side mismatch')
    await fetchAsset(id)
    checkCurrent()
    if (!available() || !isBrushAssetReady(id, side)) throw new Error('Canonical image resource unavailable')
  }
  checkCurrent()
  if (!available()) throw new Error('Canonical image resource unavailable')
  for (const [id, side] of selectors) if (!isBrushAssetReady(id, side)) throw new Error('Canonical image resource unavailable')
}

/** Built-ins keep their synchronous event path. Unknown imported versions first
 * refresh the current room manifest; cold peers need no manual library reload. */
export function prepareBrushPresets(presets: readonly (string | undefined)[]): Promise<void> | null {
  const imported = presets.filter((p): p is string => !!p && (p.startsWith('brush:imported-') || p.startsWith('imported-')))
  let needed: Set<string>
  try { needed = new Set(presets.flatMap(p => importedBrushAssets(p)).filter(id => !isBrushAssetReady(id))) }
  catch {
    if (!imported.length) throw new Error('Invalid brush preset')
    const scope = roomScope
    const existing = metadataWork.get(scope)
    return (async () => {
      await (existing ?? loadBrushLibrary())
      const checkScope = () => {
        if (scope !== roomScope) throw new DOMException('Brush room changed during preparation', 'AbortError')
      }
      checkScope()
      if (existing) {
        // An older in-flight response may predate the peer's newly pinned
        // version. Only callers that joined such a request get one fresh
        // refresh; a fresh response missing the version remains an error.
        let missing = false
        try { for (const preset of presets) importedBrushAssets(preset) } catch { missing = true }
        if (missing) {
          await loadBrushLibrary()
          checkScope()
        }
      }
      const work = prepareBrushPresetsKnown(presets)
      if (work) await work
    })()
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
