import { useEffect, useRef } from 'react'
import type { PaperType } from '@art-lessons/shared'

import { getPaperPreviewBytes, PAPER_PREVIEW_RESOLUTION } from '../../engine/src/paperLoader'
import { PAPER_TONE_AMPLITUDE_VALUE } from '../../engine/src/shaders'

interface Props {
  type: PaperType
  className?: string
  // The paper colour this room will actually use — hex, e.g. "#f5f0e6".
  bgColorHex: string
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Paints the baked height map tinted exactly the way the canvas will tint
 *  it — the same headroom-relative offset paperToneGLSL applies, reading the
 *  same constant, so a card cannot drift from the thing it previews.
 *
 *  (#300) Painted at the card's own pixel size, sampling the 256px tile 1:1
 *  and wrapping (it's seamless). Drawing a fixed 256px canvas and letting CSS
 *  scale it down was the earlier approach, and it reproduced the exact
 *  problem this whole preview exists to avoid: an ~85px card downscaled the
 *  tile ~3x, the browser's filter averaged the grain away, and dark papers
 *  came back looking blank. The bigger cards in the texture modal were fine,
 *  which is what gave it away — same image, same colours, different size.
 *
 *  It also used to be `Math.random()` white noise with three hand-tuned
 *  opacity values per paper name: a texture that did not exist and had no
 *  relationship to the one the room would get. */
function paint(canvas: HTMLCanvasElement, height: Uint8Array, bgColorHex: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  const src = PAPER_PREVIEW_RESOLUTION
  const [r, g, b] = hexToRgb(bgColorHex)
  const image = ctx.createImageData(w, h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const value = height[(y % src) * src + (x % src)]
      // Fixed absolute swing around a midpoint clamped away from the ends —
      // the same shape paperToneGLSL applies, and the only one that reads
      // identically on a white, coloured or near-black paper.
      const signed = (value / 255) * 2 - 1
      const amp = PAPER_TONE_AMPLITUDE_VALUE * 255
      const shift = (channel: number) =>
        Math.round(Math.min(Math.max(channel, amp), 255 - amp) + amp * signed)
      const i = (y * w + x) * 4
      image.data[i]     = shift(r)
      image.data[i + 1] = shift(g)
      image.data[i + 2] = shift(b)
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function PaperPreview({ type, className, bgColorHex }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let cancelled = false

    const render = (height: Uint8Array) => {
      if (cancelled) return
      // Backing store matched to the element's real box, so nothing is
      // resampled on the way to the screen. devicePixelRatio included: on a
      // 2x display a CSS-pixel-sized buffer would be upscaled and blurred.
      const dpr = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height2 = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height2) {
        canvas.width = width
        canvas.height = height2
      }
      paint(canvas, height, bgColorHex)
    }

    let bytes: Uint8Array | null = null
    // Re-paint on resize: the card is grid-sized, so its width depends on the
    // viewport, and a stale backing store would be scaled again.
    const observer = new ResizeObserver(() => { if (bytes) render(bytes) })
    observer.observe(canvas)

    void getPaperPreviewBytes(type)
      .then(loaded => { bytes = loaded; render(loaded) })
      .catch(err => {
        // A missing preview is cosmetic, never blocking — the card just
        // stays the flat paper colour.
        console.error('paper preview failed to load', type, err)
        if (cancelled) return
        const ctx = canvas.getContext('2d')
        if (ctx) { ctx.fillStyle = bgColorHex; ctx.fillRect(0, 0, canvas.width, canvas.height) }
      })

    return () => { cancelled = true; observer.disconnect() }
  }, [type, bgColorHex])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
