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

// `.paper`, not `.gz` — see bakePaperTextures.ts's own comment on why the
// extension is deliberately unrecognizable to any static file server's
// Content-Encoding auto-tagging. The hash sits before that extension for the
// same reason.
async function paperAssetURL(type: PaperGrainType, kind: 'texture' | 'preview'): Promise<string> {
  const manifest = await getPaperManifest()
  return `${PAPER_DIR}/${manifest.assets[type][kind]}`
}

// Distinguished from every other fetch failure because it is the one with a
// known cure: a name the manifest gave us that the server does not have can
// only mean the manifest is stale, and re-reading it fixes that. A connection
// blip, by contrast, must not spend a second request on the same 7.4 MB.
class PaperAssetGoneError extends Error {}

async function fetchBytesFromUrl(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    const message = `Failed to fetch paper texture '${url}': HTTP ${res.status}`
    throw res.status === 404 ? new PaperAssetGoneError(message) : new Error(message)
  }
  const decompressed = res.body.pipeThrough(new DecompressionStream('gzip'))
  const buf = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buf)
}

/** Resolves `type`'s hashed filename through the manifest and fetches it,
 *  re-reading the manifest once if the name it gave has gone missing (a
 *  deploy landing under an open tab — see invalidatePaperManifest). Retries
 *  exactly once: if the freshly-fetched manifest still names something absent,
 *  the server is genuinely inconsistent and looping would only turn that into
 *  a request storm against a 7.4 MB asset. */
async function fetchPaperAsset(type: PaperGrainType, kind: 'texture' | 'preview'): Promise<Uint8Array> {
  try {
    return await fetchBytesFromUrl(await paperAssetURL(type, kind))
  } catch (err) {
    if (!(err instanceof PaperAssetGoneError)) throw err
    invalidatePaperManifest()
    return fetchBytesFromUrl(await paperAssetURL(type, kind))
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

type PaperBytesLoader = (type: PaperType) => Promise<Uint8Array>

// (#300) `flat` has no asset and never will — a texture with no grain is
// two constant bytes, so it's synthesised here rather than costing a ~7 MB
// download. Height 255 is the paper's own colour untouched (see
// DISPLAY_FRAG's paperTone) and catch 128 is the neutral mid the dab shader
// reads when there's no tooth to bias deposit either way. Sized 2x2 rather
// than 1x1 only because WebGL1 REPEAT wrapping wants a power-of-two texture
// and 1x1 trips some drivers' mipmap completeness checks.
const FLAT_PAPER_BYTES = new Uint8Array(2 * 2 * 2).fill(0).map((_, i) => (i % 2 === 0 ? 255 : 128))
export const FLAT_PAPER_RESOLUTION = 2

async function fetchPaperBytes(type: PaperType): Promise<Uint8Array> {
  // Before the manifest, not after: `flat` has no asset, so a manifest
  // failure must not be able to break a room that was never going to fetch
  // anything. It also keeps the flat path synchronous-in-spirit — one
  // already-resolved promise, no network at all.
  if (type === 'flat') return FLAT_PAPER_BYTES
  return fetchPaperAsset(type, 'texture')
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

export function getPaperBytes(type: PaperType): Promise<Uint8Array> {
  return cacheEvictingRejection(byteCache, type, () => loadPaperBytesImpl(type))
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
}
