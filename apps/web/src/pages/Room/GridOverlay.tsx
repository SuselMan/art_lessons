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
 *  Same placement convention as PeerCursors/MeasureOverlay: a sibling of
 *  `<canvas>` inside `canvasWrap`, which already carries the viewport's CSS
 *  transform, so this is drawn once in canvas-pixel space and automatically
 *  pans/zooms/rotates with the paper — a construction grid needs to stay
 *  aligned to the paper, not float in screen space. Unlike those two,
 *  purely visual and never intercepts pointer events (see .gridOverlay's
 *  pointer-events: none) — it's a passive toggle, not a tool you activate
 *  before an interaction; drawing works normally right through it. */
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
