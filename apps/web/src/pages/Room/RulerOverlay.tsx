import styles from './Room.module.css'

export interface RulerPoint {
  // Canvas physical-pixel space for bounded rooms (same coordinate system
  // as Dab.x/y); genuine world space for infinite rooms (#143) — matches
  // what engine.setRuler's snapping compares real stroke dabs against
  // there. Produced by Room's ruler drag handler via `clientToRoomPoint`
  // either way.
  x: number
  y: number
}

interface RulerOverlayProps {
  a: RulerPoint
  b: RulerPoint
  /** Drives the distance label's counter-scale/rotate so it stays upright
   *  and a constant screen size regardless of the viewer's zoom/rotation —
   *  same trick as the old MeasureOverlay's label used (#195: Measure was
   *  deleted, its distance-bubble display absorbed into Ruler here, since
   *  the two tools were redundant with each other — see #170). */
  zoom: number
  angle: number
}

const ENDPOINT_RADIUS = 7

/** Ruler tool (#89): a persistent straight-edge guide — a pencil stroke drawn
 *  near it snaps to its line while snapping is on (see engine.setRuler /
 *  engine/src/rulerSnap.ts for the actual snapping math, applied in the
 *  pointer pipeline before dabs are generated, not here).
 *
 *  (#405) Purely presentational, and now *entirely* so: it used to own the
 *  drag surface for repositioning (fat invisible hit shapes reporting which
 *  handle was grabbed), which made the ruler draggable under any tool and left
 *  no way to lay a second line over an existing one. Both gestures moved to a
 *  single catcher in Room, present only while the ruler is the selected tool,
 *  which asks `rulerGestureAt` per press what it means. So this draws the
 *  line, its endpoints and the distance label, and nothing here takes a
 *  pointer event — including when a locked ruler (#445) is on screen under
 *  another tool, where a draggable one would be exactly what #405 removed.
 *
 *  Same placement convention as PeerCursors/GridOverlay, for both
 *  bounded rooms (a sibling of `<canvas>` inside `canvasWrap`, which
 *  carries the viewport's own CSS transform) and infinite rooms (#143 — a
 *  sibling inside Room's `.worldOverlayWrap`, carrying the equivalent
 *  camera transform instead — see PeerCursors' own docstring for the full
 *  reasoning) — either way, drawing at raw (a, b) coordinates inside that
 *  transformed ancestor automatically tracks pan/zoom/rotation with no
 *  inverse-transform math here. */
export function RulerOverlay({ a, b, zoom, angle }: RulerOverlayProps) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const counterScale = 1 / (zoom || 1)

  return (
    <div className={styles.rulerLayer}>
      <svg className={styles.rulerSvg}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.rulerLine} />
        <circle cx={a.x} cy={a.y} r={ENDPOINT_RADIUS} className={styles.rulerEndpoint} />
        <circle cx={b.x} cy={b.y} r={ENDPOINT_RADIUS} className={styles.rulerEndpoint} />
      </svg>
      <div
        className={styles.rulerDistanceLabel}
        style={{ transform: `translate(${midX}px, ${midY}px) scale(${counterScale}) rotate(${-angle}rad) translate(-50%, -150%)` }}
      >
        {Math.round(distance)} px
      </div>
    </div>
  )
}
