import styles from './Room.module.css'

export interface MeasurePoint {
  x: number // canvas physical-pixel space — same coordinate system as `Dab.x/y`
  y: number
}

interface MeasureOverlayProps {
  a: MeasurePoint
  b: MeasurePoint
  zoom: number
  angle: number
}

/** Renders the measure tool's (#119) transient line + distance label between
 *  two canvas-pixel points.
 *
 *  Same placement/coordinate convention as PeerCursors: a sibling of the
 *  `<canvas>` inside `canvasWrap`, which already carries the full viewport
 *  CSS transform, so drawing at raw canvas-pixel coordinates automatically
 *  tracks pan/zoom/rotation with no inverse-transform math here. The line
 *  is genuine canvas-space geometry (it scales with zoom, like a stroke
 *  would); only the distance label counter-scales/rotates, same trick as
 *  PeerCursors' name tags, so the number stays upright and a constant
 *  screen size regardless of the viewer's zoom/rotation. */
export function MeasureOverlay({ a, b, zoom, angle }: MeasureOverlayProps) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const counterScale = 1 / (zoom || 1)

  return (
    <div className={styles.measureLayer}>
      <svg className={styles.measureSvg}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.measureLine} />
        <circle cx={a.x} cy={a.y} r={4} className={styles.measureEndpoint} />
        <circle cx={b.x} cy={b.y} r={4} className={styles.measureEndpoint} />
      </svg>
      <div
        className={styles.measureLabel}
        // trailing translate(-50%,-150%) runs first (CSS composes right to
        // left), in the label's own unscaled box — so it's a fixed
        // screen-space "float above the midpoint" offset, not squashed or
        // rotated away by the counter-scale/rotate that follow it.
        style={{ transform: `translate(${midX}px, ${midY}px) scale(${counterScale}) rotate(${-angle}rad) translate(-50%, -150%)` }}
      >
        {Math.round(distance)} px
      </div>
    </div>
  )
}
