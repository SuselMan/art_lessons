import { useEffect, useRef } from 'react'
import type { PaperType } from '@art-lessons/shared'

import { getPaperPreviewBytes, PAPER_PREVIEW_RESOLUTION } from '../../engine/src/paperLoader'
import { PAPER_TONE_RELIEF_VALUE } from '../../engine/src/shaders'

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
 *  it — same `paperColor * (base + gain * height)` the display shaders use,
 *  reading the same two constants, so the picker cannot drift from the
 *  thing it is previewing.
 *
 *  (#300) This used to be `Math.random()` white noise with three hand-tuned
 *  opacity values per paper name: it showed a texture that did not exist and
 *  had no relationship to the one the room would get. */
function paint(canvas: HTMLCanvasElement, height: Uint8Array, bgColorHex: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const res = PAPER_PREVIEW_RESOLUTION
  const [r, g, b] = hexToRgb(bgColorHex)
  const image = ctx.createImageData(res, res)

  for (let i = 0; i < height.length; i++) {
    // Same headroom-relative offset the display shaders apply (see
    // paperToneGLSL) — scaled per channel by whatever room is left in the
    // direction it's heading, so the grain reads on a black paper colour
    // exactly as it does on a white one.
    const signed = (height[i] / 255) * 2 - 1
    const shift = (channel: number) =>
      Math.round(channel + PAPER_TONE_RELIEF_VALUE * signed * (signed > 0 ? 255 - channel : channel))
    image.data[i * 4]     = shift(r)
    image.data[i * 4 + 1] = shift(g)
    image.data[i * 4 + 2] = shift(b)
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

export function PaperPreview({ type, className, bgColorHex }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    void getPaperPreviewBytes(type)
      .then(height => {
        if (cancelled || !ref.current) return
        paint(ref.current, height, bgColorHex)
      })
      .catch(err => {
        // A missing preview is a cosmetic failure, never a blocking one —
        // the card just stays the flat paper colour.
        console.error('paper preview failed to load', type, err)
        if (cancelled || !ref.current) return
        const ctx = ref.current.getContext('2d')
        if (ctx) { ctx.fillStyle = bgColorHex; ctx.fillRect(0, 0, PAPER_PREVIEW_RESOLUTION, PAPER_PREVIEW_RESOLUTION) }
      })
    return () => { cancelled = true }
  }, [type, bgColorHex])

  return (
    <canvas
      ref={ref}
      width={PAPER_PREVIEW_RESOLUTION}
      height={PAPER_PREVIEW_RESOLUTION}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
}
