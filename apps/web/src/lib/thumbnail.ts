// #210: client-side downscale for the room-list preview thumbnail.
//
// engine.exportPNG() (see engine/index.ts) returns the room composite at
// full resolution — exactly right for the "export PNG" button, far more
// than a small grid card in MyLessons ever needs. This downscales that
// already-rasterized export with plain Canvas 2D APIs rather than adding a
// scale parameter to the engine itself — PencilEngineAPI's public surface
// stays untouched (discussed and rejected in #210's own thread).
//
// Deliberately NOT covered by a pixel-content unit test here, for the same
// reason MockGL-based engine tests never assert on real rasterized pixels:
// vitest's `node` test environment (see vitest.config.ts) has no canvas/
// image-decode implementation to rasterize against. snapshotSync.test.ts
// covers the call shape (this module mocked) instead; manual verification
// against a running dev server covers the real pixel path.

/** Longer-side cap, in px, for an uploaded room thumbnail. Picked to comfortably
 *  exceed the rendered size of a MyLessons grid card (see .cardThumbnail in
 *  MyLessons.module.css) even at a high-DPI viewport, while staying far
 *  smaller than a typical full-room export. */
export const THUMBNAIL_MAX_SIDE = 480

type DecodedImage = ImageBitmap | HTMLImageElement

function intrinsicSize(image: DecodedImage): { width: number; height: number } {
  return 'naturalWidth' in image
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height }
}

async function decodeToImage(source: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source)
    } catch {
      return null
    }
  }
  // Fallback for environments without createImageBitmap (older Safari).
  return new Promise(resolve => {
    const url = URL.createObjectURL(source)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

/** Downscales `source` (a full-resolution PNG blob, as produced by
 *  engine.exportPNG()) so its longer side is at most THUMBNAIL_MAX_SIDE,
 *  preserving aspect ratio, and re-encodes as PNG. Never upscales — a room
 *  already smaller than the cap is re-encoded at its own size unchanged.
 *
 *  Returns null (never throws) on any decode/encode failure — callers treat
 *  that exactly like a dropped upload (this whole path is best-effort, see
 *  snapshotSync.ts's uploadThumbnail). */
export async function downscaleForThumbnail(source: Blob): Promise<Blob | null> {
  const image = await decodeToImage(source)
  if (!image) return null
  try {
    const { width, height } = intrinsicSize(image)
    if (!width || !height) return null
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(width, height))
    const outW = Math.max(1, Math.round(width * scale))
    const outH = Math.max(1, Math.round(height * scale))

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(outW, outH)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(image, 0, 0, outW, outH)
      return await canvas.convertToBlob({ type: 'image/png' })
    }

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, outW, outH)
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  } finally {
    if ('close' in image) image.close()
  }
}
