import { isBrushLibrary, type BrushLibrary } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels, importedBrushAssets, isBrushAssetReady } from '../../engine/brushLibrary'
import { apiResponse, apiPath } from './api'

let library: BrushLibrary | null = null
const pending = new Map<string, Promise<void>>()

/** Only metadata at boot. Original-resolution pixels are downloaded for a
 * selected brush or an arriving operation, never for the entire collection. */
export async function loadBrushLibrary(): Promise<void> {
  let data: unknown
  const cacheKey = 'grafetto:brush-library:v1'
  try {
    const response = await apiResponse('GET /api/brush-library', {}, { signal: AbortSignal.timeout(30_000) })
    data = await response.json()
  } catch (error) {
    // Preserve the existing offline app shell. A missing imported token still
    // fails explicitly before rendering; built-in tools do not need a server catalog.
    if (!(error instanceof TypeError) && !(error instanceof Error && ['AbortError','TimeoutError'].includes(error.name))) throw error
    try { data = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') } catch { /* unavailable storage */ }
    if (!isBrushLibrary(data)) data = { schemaVersion: 1, brushes: [], assets: [], skipped: [] }
  }
  if (!isBrushLibrary(data)) throw new Error('Invalid brush library')
  try { localStorage.setItem(cacheKey, JSON.stringify(data)) } catch { /* quota/private mode */ }
  installBrushLibrary(data)
  library = data
}

async function fetchAsset(id: string): Promise<void> {
  if (isBrushAssetReady(id)) return
  const existing = pending.get(id)
  if (existing) return existing
  const work = (async () => {
    const asset = library?.assets.find(a => a.id === id)
    if (!asset) throw new Error(`Unknown brush asset: ${id}`)
    const hash = id.slice(6)
    const response = await fetch(apiPath('GET /api/brush-library/assets/:hash', { params: { hash } }), { credentials: 'include', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error('Brush asset download failed')
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.length !== asset.size * asset.size) throw new Error('Brush asset size mismatch')
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
    const actual = [...digest].map(v => v.toString(16).padStart(2, '0')).join('')
    if (actual !== hash) throw new Error('Brush asset checksum mismatch')
    installBrushPixels(id, data)
  })().finally(() => pending.delete(id))
  pending.set(id, work)
  return work
}

/** Synchronous fast path preserves the existing event order for built-ins.
 * A cold imported resource creates a gate, awaited before any rendering. */
export function prepareBrushPresets(presets: readonly (string | undefined)[]): Promise<void> | null {
  const needed = new Set(presets.flatMap(p => importedBrushAssets(p)).filter(id => !isBrushAssetReady(id)))
  if (!needed.size) return null
  return (async () => {
    // Sequential within a brush keeps peak copies bounded on mobile.
    for (const id of needed) await fetchAsset(id)
  })()
}
