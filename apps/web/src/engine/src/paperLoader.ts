import type { PaperGrainType, PaperType } from '@grafetto/shared'

import { PAPER_MANIFEST_FILENAME, parsePaperManifest, type PaperManifest } from './paperManifest'


// Loads the offline-baked paper-grain textures (see
// ../../../scripts/bakePaperTextures.ts) as raw interleaved LUMINANCE_ALPHA
// bytes (R=height, A=precomputed graphite-catch — see
// ../../../scripts/bakePaperTextures.ts) and uploads them straight into a WebGL texture via
// texImage2D(TypedArray) — deliberately never through an <img>/
// createImageBitmap decode step, since that browser-owned image pipeline
// can apply its own color-space conversion inconsistently across platforms
// (the suspected, never-fixed cause of #165's cross-device drift). A
// raw-byte fetch + gunzip has no image codec in the loop at all, so
// there's nothing left to diverge.

// (#322) Filenames are content-hashed, so they cannot be built from the type
// alone any more — the manifest written by the bake is what maps one to the
// other. See paperManifest.ts for why the map is fetched rather than bundled.
const PAPER_DIR = '/paper'
const PAPER_MANIFEST_URL = `${PAPER_DIR}/${PAPER_MANIFEST_FILENAME}`

// One shared, module-level promise rather than one per paper type: the room's
// texture and the picker's previews are all named by the same document, and
// caching per-type would fire a second request the moment someone opened the
// paper picker while a room was still loading.
//
// A *rejection* is deliberately not memoized (the catch nulls it back out).
// The manifest is now the first hop on the critical path to any paper at all,
// so a single transient blip — a flaky connection during a reconnect, a
// deploy landing mid-fetch — must not poison every later attempt for the
// lifetime of the tab.
//
// That is only half of it, and on its own it was worth nothing: the callers
// below sit behind their own caches, so if those memoize the rejection then
// nothing ever re-enters this function to benefit from the reset. Both ends
// have to evict — see cacheEvictingRejection.
let manifestPromise: Promise<PaperManifest> | null = null

function getPaperManifest(): Promise<PaperManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      // Both failure branches below name the file and the fix on purpose.
      // The overwhelmingly common way to reach either is a fresh checkout
      // running `npm run dev`, which does not run `prebuild` and so has no
      // public/paper/ at all; a bare "HTTP 404" or "Unexpected token <"
      // would send someone hunting a network bug instead of running one
      // command.
      const missing = 'Run `npm run bake:paper` in apps/web (the bake is a prebuild step and its output is not committed).'
      const res = await fetch(PAPER_MANIFEST_URL)
      if (!res.ok) {
        throw new Error(`Failed to fetch paper manifest '${PAPER_MANIFEST_URL}': HTTP ${res.status}. ${missing}`)
      }
      let json: unknown
      try {
        json = await res.json()
      } catch {
        // Not a redundant guard on top of res.ok: an SPA fallback answers a
        // missing file with index.html and a *200*, so on the Vite dev
        // server (and anywhere else `try_files ... /index.html` is in play)
        // the unbaked case never reaches the branch above at all — it
        // arrives here as HTML being parsed as JSON. Production nginx
        // deliberately 404s instead (there is no try_files under /paper/,
        // see deploy/nginx.conf), which is why both paths need covering.
        throw new Error(`Paper manifest '${PAPER_MANIFEST_URL}' did not return JSON — a dev server's SPA fallback answers a missing file with index.html and a 200. ${missing}`)
      }
      return parsePaperManifest(json, PAPER_MANIFEST_URL)
    })().catch(err => {
      manifestPromise = null
      throw err
    })
  }
  return manifestPromise
}

// Drops the memoized manifest so the next read re-fetches it. Called when an
// asset the manifest named turns out not to exist (see fetchPaperAsset): that
// is the signature of a deploy having landed under a long-lived tab. `main`
// auto-deploys on every push, so a teacher's room open across a lesson can
// outlive the bake it was told about — the old hashed files are gone from the
// server (deploy.sh rsyncs with --delete) and every later fetch for them 404s.
// Before #322 the filenames were fixed, so a long-lived tab survived any
// number of deploys; re-reading the document is what buys that back.
function invalidatePaperManifest(): void {
  manifestPromise = null
}

// URL shape note, kept here because it is the reason the manifest can name
// files at all: `.paper`, not `.gz` — see bakePaperTextures.ts's own comment
// on why the extension is deliberately unrecognizable to any static file
// server's Content-Encoding auto-tagging. The hash sits before that extension
// for the same reason. fetchPaperAsset builds the URL inline, since it needs
// the manifest *entry* (for the byte count a progress bar counts against),
// not just the name.

// Distinguished from every other fetch failure because it is the one with a
// known cure: a name the manifest gave us that the server does not have can
// only mean the manifest is stale, and re-reading it fixes that. A connection
// blip, by contrast, must not spend a second request on the same 7.4 MB.
class PaperAssetGoneError extends Error {}

interface FetchOptions {
  signal?: AbortSignal
  /** Called with bytes received so far, on the **compressed** stream. */
  onProgress?: (loaded: number) => void
}

async function fetchBytesFromUrl(url: string, opts: FetchOptions = {}): Promise<Uint8Array> {
  const res = await fetch(url, { signal: opts.signal })
  if (!res.ok || !res.body) {
    const message = `Failed to fetch paper texture '${url}': HTTP ${res.status}`
    throw res.status === 404 ? new PaperAssetGoneError(message) : new Error(message)
  }

  // The counter goes *before* the decompressor, not after. Content-Length —
  // and the manifest's recorded `*Bytes` — describe the gzip stream on the
  // wire, which is what a download is actually spending time on; counting the
  // inflated side would report 8 MB against a 7.4 MB total and race ahead of
  // the network. This is only measurable at all because #342 stopped nginx
  // re-compressing these: a response compressed on the fly is chunked and
  // carries no length to count against.
  //
  // Both sides pinned to `Uint8Array<ArrayBuffer>` — the element type
  // `res.body` actually carries. Leaving the generics off makes the counter's
  // output widen to `ArrayBufferLike`, which DecompressionStream's own
  // readable side then refuses to line up with.
  let loaded = 0
  const counter = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
    transform(chunk, controller) {
      loaded += chunk.byteLength
      opts.onProgress?.(loaded)
      controller.enqueue(chunk)
    },
  })

  // Annotated as res.body's own type so the DecompressionStream hop below is
  // the exact expression it was before the counter existed — inferring it
  // instead narrows the chunk type and stops DecompressionStream matching.
  const counted: typeof res.body = res.body.pipeThrough(counter)
  const decompressed = counted.pipeThrough(new DecompressionStream('gzip'))
  const buf = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buf)
}

/** How far the current paper texture download has got. `total` comes from the
 *  manifest rather than from Content-Length: it is known before the request is
 *  even made, so the bar can start at a real denominator instead of jumping
 *  once the first response header lands, and it is one fewer thing to be
 *  missing on a server we do not control. */
export interface PaperLoadProgress {
  type: PaperGrainType
  loaded: number
  total: number
  done: boolean
}

const progressListeners = new Set<(p: PaperLoadProgress) => void>()

/** Subscribe to texture-download progress; returns an unsubscribe.
 *
 *  Previews are deliberately not reported. They are ~60 KB against the
 *  texture's 7.4 MB, so a bar for them would flash to 100% and mean nothing,
 *  and the picker fetches several of them at once — which would make a single
 *  global "loaded/total" a lie about all of them. */
export function subscribePaperLoadProgress(cb: (p: PaperLoadProgress) => void): () => void {
  progressListeners.add(cb)
  return () => { progressListeners.delete(cb) }
}

function emitProgress(p: PaperLoadProgress): void {
  for (const cb of progressListeners) cb(p)
}

/** Resolves `type`'s hashed filename through the manifest and fetches it,
 *  re-reading the manifest once if the name it gave has gone missing (a
 *  deploy landing under an open tab — see invalidatePaperManifest). Retries
 *  exactly once: if the freshly-fetched manifest still names something absent,
 *  the server is genuinely inconsistent and looping would only turn that into
 *  a request storm against a 7.4 MB asset. */
async function fetchPaperAsset(
  type: PaperGrainType, kind: 'texture' | 'preview', signal?: AbortSignal,
): Promise<Uint8Array> {
  const attempt = async (): Promise<Uint8Array> => {
    const manifest = await getPaperManifest()
    const entry = manifest.assets[type]
    const url = `${PAPER_DIR}/${entry[kind]}`
    if (kind !== 'texture') return fetchBytesFromUrl(url, { signal })

    const total = entry.textureBytes
    emitProgress({ type, loaded: 0, total, done: false })
    const bytes = await fetchBytesFromUrl(url, {
      signal,
      onProgress: loaded => emitProgress({ type, loaded, total, done: false }),
    })
    // Reached only on success, and that is deliberate: nothing emits `done` on
    // a failure. A listener reasonably treats done as "the bar can go away",
    // and letting a failed download say that would clear the overlay on a room
    // that has not loaded at all. The failure travels by the rejected promise
    // instead, which is the path that already has somewhere to report it.
    emitProgress({ type, loaded: total, total, done: true })
    return bytes
  }

  try {
    return await attempt()
  } catch (err) {
    if (!(err instanceof PaperAssetGoneError)) throw err
    invalidatePaperManifest()
    return attempt()
  }
}

/** Memoizes the in-flight/fulfilled promise but evicts a rejected one, so a
 *  single transient failure does not permanently disable paper for the tab.
 *
 *  This is the half that getPaperManifest's own un-memoized rejection could
 *  not deliver on its own: nothing ever re-entered it, because both callers
 *  below sat behind caches that had already stored the rejection. Without
 *  this, one failed fetch left `_paperTexLoaded` false forever, and
 *  engine/index.ts's paint guard turns that into a room that silently refuses
 *  to draw with nothing on screen to say why. */
function cacheEvictingRejection<K>(
  cache: Map<K, Promise<Uint8Array>>, key: K, start: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const cached = cache.get(key)
  if (cached) return cached
  const pending: Promise<Uint8Array> = start().catch(err => {
    // Only evict our own entry: a later call may already have replaced it
    // with a fresh attempt, and deleting that would lose an in-flight fetch.
    if (cache.get(key) === pending) cache.delete(key)
    throw err
  })
  cache.set(key, pending)
  return pending
}

type PaperBytesLoader = (type: PaperType, signal?: AbortSignal) => Promise<Uint8Array>

// (#300) `flat` has no asset and never will — a texture with no grain is
// two constant bytes, so it's synthesised here rather than costing a ~7 MB
// download. Height 255 is the paper's own colour untouched (see
// DISPLAY_FRAG's paperTone) and catch 128 is the neutral mid the dab shader
// reads when there's no tooth to bias deposit either way. Sized 2x2 rather
// than 1x1 only because WebGL1 REPEAT wrapping wants a power-of-two texture
// and 1x1 trips some drivers' mipmap completeness checks.
const FLAT_PAPER_BYTES = new Uint8Array(2 * 2 * 2).fill(0).map((_, i) => (i % 2 === 0 ? 255 : 128))
export const FLAT_PAPER_RESOLUTION = 2

async function fetchPaperBytes(type: PaperType, signal?: AbortSignal): Promise<Uint8Array> {
  // Before the manifest, not after: `flat` has no asset, so a manifest
  // failure must not be able to break a room that was never going to fetch
  // anything. It also keeps the flat path synchronous-in-spirit — one
  // already-resolved promise, no network at all.
  if (type === 'flat') return FLAT_PAPER_BYTES
  return fetchPaperAsset(type, 'texture', signal)
}

/** Decoded preview bytes — one byte per pixel, PAPER_PREVIEW_RESOLUTION
 *  square. Cached like the real textures, since the picker re-renders on
 *  every colour change. */
export const PAPER_PREVIEW_RESOLUTION = 256

const previewCache = new Map<PaperType, Promise<Uint8Array>>()

/** The paper picker's miniature for `type` — a ~60 KB height-only downsample
 *  of the same bake (see bakePaperTextures.ts's downsampleToPreview). `flat`
 *  has no file: there is nothing to show, so it is synthesised.
 *
 *  (#322) There used to be an exported `paperPreviewURL` alongside this; with
 *  hashed names a URL can only be produced asynchronously, and nothing
 *  outside this file ever wanted the URL rather than the bytes, so it folded
 *  in here instead of growing an awaited signature for one caller. */
export function getPaperPreviewBytes(type: PaperType): Promise<Uint8Array> {
  return cacheEvictingRejection(previewCache, type, () => (
    type === 'flat'
      // 128 is the neutral mid — flat paper must render as exactly its own
      // colour, and 255 would push it a sixth of the way to white.
      ? Promise.resolve(new Uint8Array(PAPER_PREVIEW_RESOLUTION * PAPER_PREVIEW_RESOLUTION).fill(128))
      : fetchPaperAsset(type, 'preview')
  ))
}

let loadPaperBytesImpl: PaperBytesLoader = fetchPaperBytes

// Cached by PaperType, not by gl context — a WebGLTexture is tied to one gl
// context, but the decoded bytes behind it are the same for every engine
// instance and survive a WebGL context loss (see engine/index.ts's
// context-restore handler, which re-uploads from this cache instead of
// re-fetching).
const byteCache = new Map<PaperType, Promise<Uint8Array>>()

// (#345) The speculative download started at app launch, if one is still in
// flight and still speculative. Held so it can be *cancelled*: that is the
// whole difference between this being a win and being a regression.
//
// byteCache already makes a correct guess free — a room asking for the type
// being prefetched just awaits the same promise. A wrong guess is the
// dangerous case: without cancellation the room's real 7.4 MB download would
// share the connection with 7.4 MB nobody asked for, and the room would open
// *slower* than with no prefetch at all.
let speculative: { type: PaperGrainType; abort: AbortController } | null = null

/** Called by every non-speculative read. Either the guess was right — in which
 *  case the download stops being speculative and must never be cancelled from
 *  under its real consumer — or it was wrong and dies now. Both end with
 *  `speculative` cleared, which is what makes a later call for a third type
 *  unable to abort a load-bearing fetch. */
function claimSpeculative(type: PaperType): void {
  if (!speculative) return
  if (speculative.type !== type) speculative.abort.abort(new Error('paper prefetch superseded'))
  speculative = null
}

/** Starts downloading `type` in the background, off any critical path.
 *
 *  Fire-and-forget by design: a failure here is not the user's problem, it is
 *  a guess that did not pay off, and the real load will report its own errors
 *  when it happens. Deliberately a no-op when the type is already cached or
 *  in flight, so calling it more than once costs nothing. */
export function prefetchPaper(type: PaperType): void {
  if (type === 'flat' || byteCache.has(type) || speculative) return
  const abort = new AbortController()
  speculative = { type, abort }
  const started: Promise<Uint8Array> = cacheEvictingRejection(
    byteCache, type, () => loadPaperBytesImpl(type, abort.signal),
  )
  void started.catch(() => {
    // Swallowed, and only here: the same promise handed to a real caller
    // rejects for them too, so nothing is being hidden — this only stops an
    // unhandled rejection from a download nobody is waiting on yet.
    if (speculative?.abort === abort) speculative = null
  })
}

export function getPaperBytes(type: PaperType): Promise<Uint8Array> {
  claimSpeculative(type)
  return cacheEvictingRejection(byteCache, type, () => loadPaperBytesImpl(type))
}

/** (#365) Builds a mip chain for the paper texture currently bound to
 *  TEXTURE_2D, reporting whether it worked. Callers must leave the min filter
 *  at LINEAR (setPaperTextureParams does) and only switch to a mip filter
 *  where this returned true — a texture asking for levels it lacks is
 *  incomplete and samples as opaque black.
 *
 *  The paper texture is baked offline and uploaded once, so unlike a tile
 *  this chain can never go stale: generated here, at load, and never again.
 *
 *  Verified through getError rather than by checking the format up front,
 *  which is unusual in this codebase and deliberate. WebGL1's paper texture
 *  is LUMINANCE_ALPHA, and whether generateMipmap accepts that is exactly the
 *  kind of thing implementations disagree on: GLES 2.0 rejects only
 *  compressed and non-power-of-two level-0 arrays, while the stricter GLES
 *  3.0 rule (color-renderable AND texture-filterable, which LUMINANCE_ALPHA
 *  is not) is what some drivers actually enforce. Guessing which applies on a
 *  given device would be wrong somewhere; asking costs one synchronous
 *  getError, once per paper load, on a path that already awaits a network
 *  fetch. A device that refuses simply keeps today's unfiltered sampling
 *  rather than rendering a black sheet.
 *
 *  Clears any error already pending first, so this reports on its own call
 *  rather than inheriting one from unrelated earlier GL work. */
export function generatePaperMipmaps(gl: WebGLRenderingContext, tex: WebGLTexture): boolean {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
  gl.generateMipmap(gl.TEXTURE_2D)
  return gl.getError() === gl.NO_ERROR
}

function setPaperTextureParams(gl: WebGLRenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
}

// A flat mid-gray/mid-catch 1x1 texture bound the instant an engine is
// constructed, before any real paper bytes have loaded — so every paint
// call in the gap between construction and load-completion still binds a
// valid texture. 1x1 is a legal WebGL1 REPEAT target (power-of-two).
export function createPlaceholderPaperTexture(gl: WebGLRenderingContext): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, 1, 1, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128]))
  setPaperTextureParams(gl)
  return tex
}

// bytes must be PAPER_BAKE_RESOLUTION*PAPER_BAKE_RESOLUTION interleaved
// LUMINANCE_ALPHA pairs (i.e. exactly what getPaperBytes() resolves to —
// see bakePaperTextures.ts's own byte layout comment).
export function uploadPaperTexture(gl: WebGLRenderingContext, bytes: Uint8Array): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  // (#300) Derived from the payload rather than assumed to be
  // PAPER_BAKE_RESOLUTION: `flat` ships a 2x2 constant instead of a ~7 MB
  // baked tile (see FLAT_PAPER_BYTES), and passing the wrong dimensions for
  // the byte count is a GL error, not a stretch.
  const res = Math.sqrt(bytes.length / 2)
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA,
    res, res, 0,
    gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, bytes,
  )
  setPaperTextureParams(gl)
  return tex
}

// The manifest fetch lives *below* this seam, inside fetchPaperBytes — never
// in front of getPaperBytes. engineTestUtils.ts replaces loadPaperBytesImpl
// process-wide precisely because vitest's 'node' environment has no fetch()
// and no DecompressionStream; hoisting the manifest above the seam would put
// a real network call back into every one of the ~200 engine tests.
export function __setPaperLoaderForTesting(fn: PaperBytesLoader): void {
  loadPaperBytesImpl = fn
  clearPaperCachesForTesting()
}

export function __resetPaperLoaderForTesting(): void {
  loadPaperBytesImpl = fetchPaperBytes
  clearPaperCachesForTesting()
}

// previewCache and the manifest promise are cleared alongside byteCache, not
// just byteCache: all three are module-level and therefore shared by every
// test *file* in a worker. A manifest promise left resolved (or rejected)
// from one file silently decides what the next file's previews resolve to.
function clearPaperCachesForTesting(): void {
  byteCache.clear()
  previewCache.clear()
  manifestPromise = null
  // Aborted, not just dropped: a prefetch left running would resolve into a
  // byteCache the next test has already cleared, and its abort controller
  // would outlive the state it belongs to.
  speculative?.abort.abort(new Error('paper loader reset for testing'))
  speculative = null
  progressListeners.clear()
}
