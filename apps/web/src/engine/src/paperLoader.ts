import type { PaperType } from '@art-lessons/shared'


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
  if (type === 'flat') return FLAT_PAPER_BYTES
  return fetchBytesFromUrl(paperAssetURL(type))
}

/** Where the paper picker's miniature for `type` lives — a ~25 KB
 *  height-only downsample of the same bake (see bakePaperTextures.ts's
 *  downsampleToPreview). `flat` has none: there is nothing to show. */
export function paperPreviewURL(type: PaperType): string | null {
  return type === 'flat' ? null : `/paper/${type}.preview`
}

/** Decoded preview bytes — one byte per pixel, PAPER_PREVIEW_RESOLUTION
 *  square. Cached like the real textures, since the picker re-renders on
 *  every colour change. */
export const PAPER_PREVIEW_RESOLUTION = 256

const previewCache = new Map<PaperType, Promise<Uint8Array>>()

export function getPaperPreviewBytes(type: PaperType): Promise<Uint8Array> {
  let cached = previewCache.get(type)
  if (!cached) {
    const url = paperPreviewURL(type)
    cached = url
      ? fetchBytesFromUrl(url)
      : // 128 is the neutral mid — flat paper must render as exactly its own
        // colour, and 255 would push it a sixth of the way to white.
        Promise.resolve(new Uint8Array(PAPER_PREVIEW_RESOLUTION * PAPER_PREVIEW_RESOLUTION).fill(128))
    previewCache.set(type, cached)
  }
  return cached
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

export function __setPaperLoaderForTesting(fn: PaperBytesLoader): void {
  loadPaperBytesImpl = fn
  byteCache.clear()
}

export function __resetPaperLoaderForTesting(): void {
  loadPaperBytesImpl = fetchPaperBytes
  byteCache.clear()
}
