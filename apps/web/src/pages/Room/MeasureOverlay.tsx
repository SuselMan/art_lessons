import styles from './Room.module.css'

export interface MeasurePoint {
  // Canvas physical-pixel space for bounded rooms (same coordinate system
  // as `Dab.x/y`); genuine world space for infinite rooms (#143), produced
  // by Room's handleMeasureDown via `clientToRoomPoint` either way.
  x: number
  y: number
}

interface MeasureOverlayProps {
  a: MeasurePoint
  b: MeasurePoint
  zoom: number
  angle: number
}

/** Renders the measure tool's (#119) transient line + distance label between
 *  two points.
 *
 *  Same placement/coordinate convention as PeerCursors, for both bounded
 *  rooms (a sibling of `<canvas>` inside `canvasWrap`, which carries the
 *  viewport's own CSS transform) and infinite rooms (#143 — a sibling
 *  inside Room's `.worldOverlayWrap`, carrying the equivalent camera
 *  transform instead — see PeerCursors' own docstring) — either way,
 *  drawing at raw (a, b) coordinates inside that transformed ancestor
 *  automatically tracks pan/zoom/rotation with no inverse-transform math
 *  here. The line is genuine canvas-/world-space geometry (it scales with
 *  zoom, like a stroke would); only the distance label counter-scales/
 *  rotates, same trick as PeerCursors' name tags, so the number stays
 *  upright and a constant screen size regardless of the viewer's zoom/
 *  rotation. */
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
