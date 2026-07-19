import type { PaperType } from '@art-lessons/shared'

import { PAPER_BAKE_RESOLUTION } from './paperNoise'

// Loads the offline-baked paper-grain textures (see
// ../../../scripts/bakePaperTextures.ts) as raw interleaved LUMINANCE_ALPHA
// bytes (R=height, A=precomputed graphite-catch — see paperNoise.ts's
// paperCatchValue) and uploads them straight into a WebGL texture via
// texImage2D(TypedArray) — deliberately never through an <img>/
// createImageBitmap decode step, since that browser-owned image pipeline
// can apply its own color-space conversion inconsistently across platforms
// (the suspected, never-fixed cause of #165's cross-device drift). A
// raw-byte fetch + gunzip has no image codec in the loop at all, so
// there's nothing left to diverge.

const PAPER_TYPES: PaperType[] = ['rough', 'smooth', 'bristol']

// `.paper`, not `.gz` — see bakePaperTextures.ts's own comment on why the
// extension is deliberately unrecognizable to any static file server's
// Content-Encoding auto-tagging.
function paperAssetURL(type: PaperType): string {
  return `/paper/${type}.paper`
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

async function fetchPaperBytes(type: PaperType): Promise<Uint8Array> {
  return fetchBytesFromUrl(paperAssetURL(type))
}

let loadPaperBytesImpl: PaperBytesLoader = fetchPaperBytes

// Dev-only rough-variant comparison path (see bakeRoughVariantTextures.ts /
// SettingsPanel's "Paper grain variant" control) — same byte format and
// upload path as a real PaperType's bytes, just fetched from a different,
// disposable /paper-variants/ URL instead of the committed /paper/ one.
// Cached separately by URL so switching variants doesn't collide with (or
// evict) the real byteCache below.
const variantByteCache = new Map<string, Promise<Uint8Array>>()

export function getPaperBytesFromUrl(url: string): Promise<Uint8Array> {
  let cached = variantByteCache.get(url)
  if (!cached) {
    cached = fetchBytesFromUrl(url)
    variantByteCache.set(url, cached)
  }
  return cached
}

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

// Fire-and-forget warm-up for the 2 paper types the room *isn't* currently
// using (there are only 3 total, and each compressed asset is several MB —
// see bakePaperTextures.ts's own size log) — makes setPaper() feel instant
// if the user switches paper type later, without making every room join pay
// for all 3 (~20MB) up front. The active type doesn't need warming here:
// whatever _initPaper() call already triggers its own getPaperBytes(),
// which populates the exact same cache this reads from.
//
// Scheduled via schedulePrefetch (idle time in real browsers) rather than
// fired immediately, so these non-essential fetches don't compete for the
// browser's limited concurrent connections against the active paper type
// (or the page's own JS/CSS) during the critical early-load window.
// Failures surface later, when whatever setPaper() call actually needs
// the bytes awaits this same cached promise and rejects.
export function prefetchAllPaperTypes(activeType: PaperType): void {
  for (const type of PAPER_TYPES) {
    if (type === activeType) continue
    schedulePrefetch(() => { getPaperBytes(type).catch(() => {}) })
  }
}

type PrefetchScheduler = (fn: () => void) => void

const defaultSchedulePrefetch: PrefetchScheduler = fn => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn())
  else setTimeout(fn, 0)
}

let schedulePrefetch: PrefetchScheduler = defaultSchedulePrefetch

export function __setPrefetchSchedulerForTesting(fn: PrefetchScheduler): void {
  schedulePrefetch = fn
}

export function __resetPrefetchSchedulerForTesting(): void {
  schedulePrefetch = defaultSchedulePrefetch
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
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA,
    PAPER_BAKE_RESOLUTION, PAPER_BAKE_RESOLUTION, 0,
    gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, bytes,
  )
  setPaperTextureParams(gl)
  return tex
}

export function __setPaperLoaderForTesting(fn: PaperBytesLoader): void {
  loadPaperBytesImpl = fn
  byteCache.clear()
}

export function __resetPaperLoaderForTesting(): void {
  loadPaperBytesImpl = fetchPaperBytes
  byteCache.clear()
}
