import { useEffect, useRef } from 'react'
import type { PaperType } from '@art-lessons/shared'

interface Props {
  type: PaperType
  width?: number
  height?: number
  className?: string
  // Overrides this texture's own default background (see CONFIGS.bg) — hex,
  // e.g. "#f5f0e6" — so CreateRoom's paper-color picker can preview the
  // creator's actual pick instead of the fixed per-texture default.
  bgColorHex?: string
}

const CONFIGS = {
  rough:   { bg: [236, 232, 224] as const, coarse: 0.22, fine: 0.10 },
  smooth:  { bg: [242, 242, 238] as const, coarse: 0.07, fine: 0.04 },
  bristol: { bg: [249, 249, 248] as const, coarse: 0.02, fine: 0.01 },
}

function drawNoise(canvas: HTMLCanvasElement, type: PaperType, bgColorHex?: string) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const cfg = CONFIGS[type]

  ctx.fillStyle = bgColorHex ?? `rgb(${cfg.bg[0]},${cfg.bg[1]},${cfg.bg[2]})`
  ctx.fillRect(0, 0, w, h)

  // coarse grain — built on its own offscreen canvas and composited in via
  // drawImage rather than ctx.putImageData(coarse, 0, 0) directly: putImageData
  // writes raw pixels straight into the canvas buffer, bypassing alpha
  // compositing entirely, so it was overwriting the fillRect background above
  // with this layer's own (mostly near-transparent) pixels instead of blending
  // over it — the background color barely showed through, easy to miss since
  // stray specks still visually read as "grain" either way. drawImage (used by
  // the fine layer just below already) composites normally.
  const coarseSrc = document.createElement('canvas')
  coarseSrc.width  = w
  coarseSrc.height = h
  const coarseCtx = coarseSrc.getContext('2d')!
  const coarse = coarseCtx.createImageData(w, h)
  for (let i = 0; i < coarse.data.length; i += 4) {
    const v = Math.random() > 0.5 ? 255 : 0
    coarse.data[i]   = v
    coarse.data[i+1] = v
    coarse.data[i+2] = v
    coarse.data[i+3] = Math.random() * cfg.coarse * 255
  }
  coarseCtx.putImageData(coarse, 0, 0)
  ctx.drawImage(coarseSrc, 0, 0)

  // fine grain at half resolution, scaled up (softer)
  const fw = Math.ceil(w / 2)
  const fh = Math.ceil(h / 2)
  const fine = ctx.createImageData(fw, fh)
  for (let i = 0; i < fine.data.length; i += 4) {
    const v = Math.random() > 0.5 ? 255 : 0
    fine.data[i]   = v
    fine.data[i+1] = v
    fine.data[i+2] = v
    fine.data[i+3] = Math.random() * cfg.fine * 255
  }
  const tmp = document.createElement('canvas')
  tmp.width  = fw
  tmp.height = fh
  tmp.getContext('2d')!.putImageData(fine, 0, 0)
  ctx.drawImage(tmp, 0, 0, w, h)
}

export function PaperPreview({ type, width = 200, height = 150, className, bgColorHex }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (ref.current) drawNoise(ref.current, type, bgColorHex)
  }, [type, bgColorHex])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
