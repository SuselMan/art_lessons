/** Verified content-addressed bytes; optional bounded disk cache for offline replay. */
const NAME = 'grafetto-brush-assets-v1'
const LIMIT = 192 * 1024 * 1024
const key = (hash: string): string => `${location.origin}/__brush_asset_cache/${hash}`
let writing = false
/** Resource-only body assembly. Metadata size and SHA remain caller-owned;
 * browser/stream chunks may already be allocated outside this exact output. */
export async function readExactBrushAssetBody(response:Response,expectedBytes:number):Promise<Uint8Array> {
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes<4||expectedBytes>2048*2048)throw new RangeError('Invalid brush asset body size')
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,data:Uint8Array|undefined
  let failed=false,primary:unknown
  try {
    reader=response.body?.getReader()
    if(!reader)throw new Error('Brush asset body unavailable')
    data=new Uint8Array(expectedBytes)
    let offset=0
    for(;;){
      const {done,value}=await reader.read()
      if(done){if(offset!==expectedBytes)throw new Error('Brush asset size mismatch');break}
      if(!(value instanceof Uint8Array))throw new TypeError('Invalid brush asset body chunk')
      if(value.byteLength>expectedBytes-offset)throw new Error('Brush asset size mismatch')
      data.set(value,offset);offset+=value.byteLength
    }
  } catch(error) {failed=true;primary=error}
  finally {
    if(reader){
      // Observe cancel rejection, but attempt release BEFORE awaiting it. A
      // slow/rejected cancellation must not keep our reader lock alive.
      let cancelled:Promise<void>|undefined
      if(failed)try{cancelled=reader.cancel(primary)}catch{/* Preserve body failure. */}
      try{reader.releaseLock()}catch(error){if(!failed){failed=true;primary=error}}
      if(cancelled)try{await cancelled}catch{/* Preserve body failure. */}
    }
  }
  if(failed)throw primary
  if(!data)throw new Error('Brush asset body unavailable')
  return data
}
export async function cachedBrushAsset(hash: string, expectedBytes: number): Promise<Uint8Array | null> {
  if (typeof caches === 'undefined' || typeof location === 'undefined') return null
  try {
    const cache = await caches.open(NAME)
    const response = await cache.match(key(hash))
    if (!response) return null
    const data = await readExactBrushAssetBody(response,expectedBytes)
    // Hash verification remains the caller’s responsibility.
    return data
  } catch { return null }
}
export function cacheBrushAsset(hash: string, data: Uint8Array): Promise<void> {
  if (typeof caches === 'undefined' || typeof location === 'undefined' || writing) return Promise.resolve()
  // Persistence is optional: admit one writer before retaining a snapshot.
  // Busy callers skip rather than queue copies behind a storage operation.
  writing = true
  return (async () => {
    const copy = data.slice()
    const cache = await caches.open(NAME)
    const url = key(hash)
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
  })().catch(() => { /* Disk cache is optional, including quota/private mode. */ })
    .finally(() => { writing = false })
}
