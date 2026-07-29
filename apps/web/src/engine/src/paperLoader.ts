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
let manifestPromise: Promise<PaperManifest> | null = null

function getPaperManifest(): Promise<PaperManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const res = await fetch(PAPER_MANIFEST_URL)
      if (!res.ok) {
        // Names the file and the fix on purpose. The overwhelmingly common
        // way to see this is a fresh checkout running `npm run dev`, which
        // does not run `prebuild` and therefore has no public/paper/ at all;
        // a bare "HTTP 404" would send someone hunting a network bug instead
        // of running one command.
        throw new Error(
          `Failed to fetch paper manifest '${PAPER_MANIFEST_URL}': HTTP ${res.status}. `
          + 'Run `npm run bake:paper` in apps/web (the bake is a prebuild step and its output is not committed).',
        )
      }
      return parsePaperManifest(await res.json(), PAPER_MANIFEST_URL)
    })().catch(err => {
      manifestPromise = null
      throw err
    })
  }
  return manifestPromise
}

// `.paper`, not `.gz` — see bakePaperTextures.ts's own comment on why the
// extension is deliberately unrecognizable to any static file server's
// Content-Encoding auto-tagging. The hash sits before that extension for the
// same reason.
async function paperAssetURL(type: PaperGrainType, kind: 'texture' | 'preview'): Promise<string> {
  const manifest = await getPaperManifest()
  return `${PAPER_DIR}/${manifest.assets[type][kind]}`
}

async function fetchBytesFromUrl(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch paper texture '${url}': HTTP ${res.status}`)
  }
  const decompressed = res.body.pipeThrough(new DecompressionStream('gzip'))
  const buf = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buf)
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
  return fetchBytesFromUrl(await paperAssetURL(type, 'texture'))
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
  let cached = previewCache.get(type)
  if (!cached) {
    cached = type === 'flat'
      // 128 is the neutral mid — flat paper must render as exactly its own
      // colour, and 255 would push it a sixth of the way to white.
      ? Promise.resolve(new Uint8Array(PAPER_PREVIEW_RESOLUTION * PAPER_PREVIEW_RESOLUTION).fill(128))
      : (async () => fetchBytesFromUrl(await paperAssetURL(type, 'preview')))()
    previewCache.set(type, cached)
  }
  return cached
}

let loadPaperBytesImpl: PaperBytesLoader = fetchPaperBytes

// Cached by PaperType, not by gl context — a WebGLTexture is tied to one gl
// context, but the decoded bytes behind it are the same for every engine
// instance and survive a WebGL context loss (see engine/index.ts's
// context-restore handler, which re-uploads from this cache instead of
// re-fetching).
const byteCache = new Map<PaperType, Promise<Uint8Array>>()

export function getPaperBytes(type: PaperType): Promise<Uint8Array> {
  let cached = byteCache.get(type)
  if (!cached) {
    cached = loadPaperBytesImpl(type)
    byteCache.set(type, cached)
  }
  return cached
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
