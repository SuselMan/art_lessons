import { previewDabShape } from '../../engine'

// Drawing side of the calibration UI (#475): the recorded strokes have to be
// visible, both while they're being made and afterwards in the before/after
// comparison, and neither can use the real engine — a second WebGL context,
// paper bake and layer stack for a 200px preview would cost more than the
// whole feature.
//
// Width comes from `previewDabShape`, the same pure query the brush cursor
// uses, so the pressure→width response shown here is graphite's actual one
// rather than a curve invented for the preview. Darkness is an approximation
// (the real thing lives in the dab shader, on top of paper grain), which is
// why the comparison is deliberately *two renderings of the same recording*:
// whatever the approximation gets wrong, it gets wrong identically on both
// sides, so the difference between them is honest even where the absolute
// look isn't.

export interface TracePoint {
  x: number
  y: number
  /** Raw, exactly as the pen reported it. Everything that maps it is passed in
   *  separately, so one recording can be redrawn under any calibration. */
  pressure: number
}

/** Nominal brush size for the preview, in CSS px. Roughly a mid-size pencil at
 *  100% zoom — big enough that a change in the response is visible in a strip
 *  a couple of hundred pixels tall. */
const PREVIEW_BASE_SIZE = 22

/** Distance between preview dabs, CSS px. Same idea as the engine's own dab
 *  spacing: close enough that the stroke reads as continuous, far enough that
 *  a long trace stays cheap to redraw on every pointer move. */
const DAB_SPACING = 1.2

export function sizeCanvasToBox(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  const dpr = window.devicePixelRatio || 1
  const width = Math.round(rect.width * dpr)
  const height = Math.round(rect.height * dpr)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

/** Shifts a recorded trace so its middle sits in the middle of `canvas`,
 *  without scaling it. Deliberately a translation and nothing else: dab width
 *  is in real CSS px (previewDabShape), so scaling the path while leaving the
 *  dabs alone would make the same stroke look thicker relative to its length
 *  in the preview than it does on paper. The comparison canvases are therefore
 *  laid out at the same width as the strip the stroke was recorded on. */
export function centreOffset(canvas: HTMLCanvasElement, points: TracePoint[]): { dx: number; dy: number } {
  if (points.length === 0) return { dx: 0, dy: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const rect = canvas.getBoundingClientRect()
  return {
    dx: rect.width / 2 - (minX + maxX) / 2,
    dy: rect.height / 2 - (minY + maxY) / 2,
  }
}

export function clearTrace(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
}

/** Paints one recorded trace, with `map` deciding what each raw pressure
 *  becomes — the identity while recording (so the strip shows what the pen
 *  reports, which is the diagnostic), and a candidate calibration in the
 *  comparison afterwards. */
export function drawTrace(
  ctx: CanvasRenderingContext2D,
  points: TracePoint[],
  map: (raw: number) => number,
  offset: { dx: number; dy: number } = { dx: 0, dy: 0 },
): void {
  if (points.length < 2) return
  ctx.save()
  // Taken from the element's own computed `color` rather than passed in as a
  // literal: canvas has no access to CSS custom properties, and this app has
  // two themes. The stylesheet sets `color` on the canvas, so graphite stays
  // readable on both without either side hardcoding a hex.
  ctx.fillStyle = getComputedStyle(ctx.canvas).color
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / DAB_SPACING))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const pressure = map(a.pressure + (b.pressure - a.pressure) * t)
      const { size } = previewDabShape('pencil', 'HB', PREVIEW_BASE_SIZE, pressure, 0, 0)
      ctx.globalAlpha = 0.05 + 0.3 * pressure
      ctx.beginPath()
      ctx.arc(a.x + (b.x - a.x) * t + offset.dx, a.y + (b.y - a.y) * t + offset.dy, size / 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}
