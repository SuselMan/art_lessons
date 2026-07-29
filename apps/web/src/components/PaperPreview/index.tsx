import { useEffect, useRef, useState } from 'react'
import type { PaperType } from '@grafetto/shared'

import { useT } from '../../i18n'
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

/** (#346) What a card shows when its preview could not be fetched.
 *
 *  It used to be a flat fill in the paper's own colour, described as "cosmetic,
 *  never blocking". The cosmetic part is true and the harmless part is not: a
 *  flat fill in the paper colour is *exactly* what the `flat` card legitimately
 *  looks like, so a failed Coarse card doesn't read as broken, it reads as a
 *  paper with no tooth. The picker then quietly misrepresents the one choice
 *  the room can never change afterwards.
 *
 *  Diagonal hatching over a dimmed fill is the smallest thing that cannot be
 *  mistaken for any real paper — no layout, no new element, nothing for a
 *  caller's grid to accommodate. The accessible name below carries the words. */
function paintUnavailable(canvas: HTMLCanvasElement, bgColorHex: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas
  ctx.fillStyle = bgColorHex
  ctx.fillRect(0, 0, w, h)
  // Dimmed so the hatching reads on a light and a near-black paper alike.
  ctx.fillStyle = 'rgba(128, 128, 128, 0.35)'
  ctx.fillRect(0, 0, w, h)

  const step = Math.max(6, Math.round(Math.min(w, h) / 8))
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.9)'
  ctx.lineWidth = Math.max(1, Math.round(step / 6))
  ctx.beginPath()
  for (let x = -h; x < w; x += step) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x + h, h)
  }
  ctx.stroke()
}

export function PaperPreview({ type, className, bgColorHex }: Props) {
  const t = useT()
  const ref = useRef<HTMLCanvasElement>(null)
  // (#346) Two copies of the same fact on purpose: the state drives the
  // accessible name, the ref is what the ResizeObserver closure reads — it is
  // created once per effect run and would otherwise capture `false` forever.
  const [failed, setFailed] = useState(false)
  const failedRef = useRef(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let cancelled = false

    // Null height = the preview could not be fetched (#346).
    const render = (height: Uint8Array | null) => {
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
      if (height) paint(canvas, height, bgColorHex)
      else paintUnavailable(canvas, bgColorHex)
    }

    let bytes: Uint8Array | null = null
    // Re-paint on resize: the card is grid-sized, so its width depends on the
    // viewport, and a stale backing store would be scaled again. (#346) The
    // unavailable state resizes with it too — it is painted into the same
    // backing store, so without this it would stretch like any stale bitmap.
    const observer = new ResizeObserver(() => {
      if (bytes) render(bytes)
      else if (failedRef.current) render(null)
    })
    observer.observe(canvas)

    void getPaperPreviewBytes(type)
      .then(loaded => { bytes = loaded; render(loaded) })
      .catch(err => {
        // Still never blocking — a picker that cannot draw its thumbnails is
        // no reason to stop someone creating a room. But no longer silent
        // either: see paintUnavailable on why a flat fill was the one wrong
        // way to say this.
        console.error('paper preview failed to load', type, err)
        if (cancelled) return
        failedRef.current = true
        setFailed(true)
        render(null)
      })

    return () => { cancelled = true; observer.disconnect() }
  }, [type, bgColorHex])

  return (
    <canvas
      ref={ref}
      className={className}
      // (#346) Silent for a working preview — it is decoration next to a card
      // that already names the paper — and named only when it is reporting a
      // failure, which the hatching alone cannot spell out.
      role={failed ? 'img' : undefined}
      aria-label={failed ? t('paper.previewUnavailable') : undefined}
      title={failed ? t('paper.previewUnavailable') : undefined}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
