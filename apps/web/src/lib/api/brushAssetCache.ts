/** Verified content-addressed bytes; optional bounded disk cache for offline replay. */
const NAME = 'grafetto-brush-assets-v1'
const LIMIT = 192 * 1024 * 1024
const key = (hash: string): string => `${location.origin}/__brush_asset_cache/${hash}`
let writes: Promise<void> = Promise.resolve()
export async function cachedBrushAsset(hash: string): Promise<Uint8Array | null> {
  if (typeof caches === 'undefined' || typeof location === 'undefined') return null
  try {
    const cache = await caches.open(NAME)
    const response = await cache.match(key(hash))
    if (!response) return null
    const data = new Uint8Array(await response.arrayBuffer())
    // Refresh LRU only after the caller verifies the hash.
    return data
  } catch { return null }
}
export function cacheBrushAsset(hash: string, data: Uint8Array): Promise<void> {
  if (typeof caches === 'undefined' || typeof location === 'undefined') return Promise.resolve()
  const copy = data.slice()
  const work = writes.catch(() => {}).then(async () => {
    const cache = await caches.open(NAME)
    const url = key(hash)
    await cache.delete(url)
    await cache.put(url, new Response(copy, { headers: { 'Content-Length': String(copy.length), 'Content-Type': 'application/octet-stream' } }))
    const entries = await cache.keys()
    let total = 0
    const sizes: { request: Request; size: number }[] = []
    for (const request of entries) {
      const response = await cache.match(request)
      const size = Number(response?.headers.get('Content-Length') ?? 0)
      total += size
      sizes.push({ request, size })
    }
    for (const { request, size } of sizes) {
      if (total <= LIMIT) break
      await cache.delete(request)
      total -= size
    }
  }).catch(() => { /* Disk cache is optional, including quota/private mode. */ })
  writes = work
  return work
}
