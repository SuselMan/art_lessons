import { useEffect, useRef } from 'react'
import type { PaperType } from '@art-lessons/shared'

interface Props {
  type: PaperType
  width?: number
  height?: number
  className?: string
}

const CONFIGS = {
  rough:   { bg: [236, 232, 224] as const, coarse: 0.22, fine: 0.10 },
  smooth:  { bg: [242, 242, 238] as const, coarse: 0.07, fine: 0.04 },
  bristol: { bg: [249, 249, 248] as const, coarse: 0.02, fine: 0.01 },
}

function drawNoise(canvas: HTMLCanvasElement, type: PaperType) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const cfg = CONFIGS[type]

  ctx.fillStyle = `rgb(${cfg.bg[0]},${cfg.bg[1]},${cfg.bg[2]})`
  ctx.fillRect(0, 0, w, h)

  // coarse grain
  const coarse = ctx.createImageData(w, h)
  for (let i = 0; i < coarse.data.length; i += 4) {
    const v = Math.random() > 0.5 ? 255 : 0
    coarse.data[i]   = v
    coarse.data[i+1] = v
    coarse.data[i+2] = v
    coarse.data[i+3] = Math.random() * cfg.coarse * 255
  }
  ctx.putImageData(coarse, 0, 0)

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

export function PaperPreview({ type, width = 200, height = 150, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (ref.current) drawNoise(ref.current, type)
  }, [type])

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
