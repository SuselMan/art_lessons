import { visibleWorldRect } from './cameraMath'
import type { Viewport } from './useViewport'
import styles from './Room.module.css'

const COLUMNS = 8 // square cells sized off this, not a fixed row/col count — see doc comment

interface GridOverlayProps {
  width: number
  height: number
}

/** Toggleable proportion/construction grid (#89) — square cells, sized so
 *  exactly `COLUMNS` fit across the canvas width, with as many rows of that
 *  same size as fit the height (the last row is typically partial). Square
 *  cells make it a general proportion-checking aid regardless of canvas
 *  aspect ratio, unlike a fixed rows×cols subdivision (e.g. rule-of-thirds),
 *  which would stretch on a non-square canvas.
 *
 *  Same placement convention as PeerCursors/RulerOverlay: a sibling of
 *  `<canvas>` inside `canvasWrap`, which already carries the viewport's CSS
 *  transform, so this is drawn once in canvas-pixel space and automatically
 *  pans/zooms/rotates with the paper — a construction grid needs to stay
 *  aligned to the paper, not float in screen space. Unlike those two,
 *  purely visual and never intercepts pointer events (see .gridOverlay's
 *  pointer-events: none) — it's a passive toggle, not a tool you activate
 *  before an interaction; drawing works normally right through it.
 *
 *  Bounded rooms only — see InfiniteGridOverlay below for infinite rooms'
 *  own variant (#143), which this fixed-canvas-size design has no direct
 *  equivalent for. */
export function GridOverlay({ width, height }: GridOverlayProps) {
  const cellSize = width / COLUMNS
  const cols = Math.ceil(width / cellSize)
  const rows = Math.ceil(height / cellSize)

  return (
    <svg className={styles.gridOverlay} width={width} height={height}>
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`v${i}`} x1={i * cellSize} y1={0} x2={i * cellSize} y2={height} className={styles.gridLine} />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * cellSize} x2={width} y2={i * cellSize} className={styles.gridLine} />
      ))}
    </svg>
  )
}

// Target on-screen size (CSS px) of one grid cell, at any zoom level — see
// niceWorldStep's doc comment for why this is only a *target*, not the
// actual rendered size.
const TARGET_SCREEN_CELL_PX = 96

// Defensive cap on how many lines a single axis ever renders — the
// adaptive step below (see niceWorldStep) already keeps the *count* of
// visible lines roughly constant regardless of zoom (that's the whole
// point of snapping the step to zoom), so this should never actually bind
// in practice; it's just cheap insurance against a runaway line count if
// some future change breaks that invariant (e.g. a bad zoom clamp).
const MAX_INFINITE_GRID_LINES = 500

/** Snaps a "desired" world-space cell size (`TARGET_SCREEN_CELL_PX / zoom`
 *  — however many world units currently render as that many screen px) to
 *  the nearest power of 2. This is what makes the grid feel *fixed to the
 *  world* rather than to the screen (see InfiniteGridOverlay's own doc
 *  comment for why that's the right model for an infinite room): panning
 *  never changes the step, and zooming only changes it in discrete
 *  octave jumps — exactly the doubling/halving a real sheet of graph paper
 *  would appear to do as you moved a magnifying glass over it, and the
 *  same "grid/graticule" convention design tools like Figma/Illustrator use
 *  for their own infinite canvases. A power of 2 (rather than a decimal
 *  1-2-5 sequence, the other common convention) was picked only because
 *  it's simpler to compute (no lookup table) — either would satisfy the
 *  same goal here. */
function niceWorldStep(desiredWorldSize: number): number {
  const exp = Math.round(Math.log2(desiredWorldSize))
  return 2 ** exp
}

interface InfiniteGridOverlayProps {
  vp: Viewport
  viewportWidth: number
  viewportHeight: number
}

/** Infinite-room counterpart of GridOverlay (#143). Bounded's "exactly
 *  COLUMNS cells across the fixed canvas width" design has no equivalent
 *  here — there is no canvas width, the world has no edges — so this is a
 *  genuinely different design, not just a camera-aware port of the same
 *  one:
 *
 *  A construction grid's whole purpose is proportion-checking against the
 *  *content*, so it has to be fixed to the world (pan/zoom/rotate with it,
 *  like GridOverlay already is relative to the paper) rather than fixed to
 *  the screen (which would make it useless as a proportion guide — cells
 *  would stay the same apparent size no matter how far you zoom out, so
 *  they'd stop corresponding to any consistent amount of *content*). Given
 *  that, the only real design question is what determines the cell size,
 *  since there's no finite canvas width to divide by COLUMNS:
 *  niceWorldStep above picks a world-space step that keeps cells roughly
 *  TARGET_SCREEN_CELL_PX on screen at the current zoom, snapped to a power
 *  of 2 so it reads as "the grid" rather than continuously resizing.
 *
 *  Rendered as plain world-space geometry (no per-line worldToScreen call)
 *  — the caller wraps this in the same camera-transform div as the other
 *  four overlays (see Room's `.worldOverlayWrap` / cameraTransformCss), so
 *  pan/zoom/rotate (including the grid rotating with the camera, matching
 *  "fixed to the world") comes for free from that ancestor, exactly like
 *  GridOverlay gets it for free from canvasWrap's CSS transform in bounded
 *  rooms. Lines only need to span visibleWorldRect (padded, see its own
 *  doc comment) — recomputed on every render, cheap relative to a repaint
 *  since it's just a handful of arithmetic ops, not a re-render trigger of
 *  its own. */
export function InfiniteGridOverlay({ vp, viewportWidth, viewportHeight }: InfiniteGridOverlayProps) {
  const { minX, minY, maxX, maxY } = visibleWorldRect(vp, viewportWidth, viewportHeight)
  const step = niceWorldStep(TARGET_SCREEN_CELL_PX / vp.zoom)

  const startCol = Math.floor(minX / step)
  const endCol   = Math.min(Math.ceil(maxX / step), startCol + MAX_INFINITE_GRID_LINES)
  const startRow = Math.floor(minY / step)
  const endRow   = Math.min(Math.ceil(maxY / step), startRow + MAX_INFINITE_GRID_LINES)

  const left = startCol * step, right = endCol * step
  const top  = startRow * step, bottom = endRow * step

  const verticals: number[] = []
  for (let i = startCol; i <= endCol; i++) verticals.push(i * step)
  const horizontals: number[] = []
  for (let i = startRow; i <= endRow; i++) horizontals.push(i * step)

  return (
    <svg className={styles.gridOverlayInfinite}>
      {verticals.map(x => (
        <line key={`v${x}`} x1={x} y1={top} x2={x} y2={bottom} className={styles.gridLine} />
      ))}
      {horizontals.map(y => (
        <line key={`h${y}`} x1={left} y1={y} x2={right} y2={y} className={styles.gridLine} />
      ))}
    </svg>
  )
}
