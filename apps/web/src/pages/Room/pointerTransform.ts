// Maps a client-space point (e.g. from a raw DOM PointerEvent) into canvas
// physical-pixel space — the same coordinate space `Dab.x/y` and the engine's
// 'pointer' event use.
//
// Why this duplicates rather than reuses engine logic: the engine already
// does this exact analytic transform in `PencilEngine.setViewport()` (see
// engine/index.ts), but only to feed its *own* internal PointerInput, whose
// 'move'/'pointer' events are gated by `_active` (true only while a stroke's
// pointer button is held — see engine/src/PointerInput.ts). #37 needs the
// local cursor position while just hovering too, so Room listens to the raw
// DOM pointermove itself and needs this transform independently rather than
// widening PointerInput's gating (a broader engine behavior change than this
// task calls for).

export interface ViewportTransform { cx: number; cy: number; zoom: number; angle: number }
export interface CanvasSize { width: number; height: number }

export function clientToCanvas(
  clientX: number, clientY: number,
  viewport: ViewportTransform, canvas: CanvasSize,
): { x: number; y: number } {
  const { cx, cy, zoom, angle } = viewport
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  const dx = clientX - cx
  const dy = clientY - cy
  const rx = dx * cos - dy * sin
  const ry = dx * sin + dy * cos
  return { x: rx / zoom + canvas.width / 2, y: ry / zoom + canvas.height / 2 }
}
