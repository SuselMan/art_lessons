import styles from './Room.module.css'

export interface RulerPoint {
  // Canvas physical-pixel space for bounded rooms (same coordinate system
  // as Dab.x/y); genuine world space for infinite rooms (#143) — matches
  // what engine.setRuler's snapping compares real stroke dabs against
  // there. Produced by Room's ruler drag handlers via `clientToRoomPoint`
  // either way.
  x: number
  y: number
}

export type RulerHandleKind = 'a' | 'b' | 'body'

interface RulerOverlayProps {
  a: RulerPoint
  b: RulerPoint
  onHandleDown: (kind: RulerHandleKind, e: React.PointerEvent<SVGElement>) => void
  /** Drives the distance label's counter-scale/rotate so it stays upright
   *  and a constant screen size regardless of the viewer's zoom/rotation —
   *  same trick as the old MeasureOverlay's label used (#195: Measure was
   *  deleted, its distance-bubble display absorbed into Ruler here, since
   *  the two tools were redundant with each other — see #170). */
  zoom: number
  angle: number
}

const ENDPOINT_RADIUS = 7

/** Ruler tool (#89): a persistent, draggable straight-edge guide — a
 *  pencil stroke drawn near it snaps to its line (see engine.setRuler /
 *  engine/src/rulerSnap.ts for the actual snapping math, applied in the
 *  pointer pipeline before dabs are generated, not here). Purely
 *  presentational, same division of responsibility as TransformGizmo:
 *  drag capture and viewport math live in Room/index.tsx
 *  (handleRulerHandleDown), this component only renders the line, its two
 *  draggable endpoints, and the distance label, and reports which handle
 *  was grabbed.
 *
 *  Same placement convention as PeerCursors/GridOverlay, for both
 *  bounded rooms (a sibling of `<canvas>` inside `canvasWrap`, which
 *  carries the viewport's own CSS transform) and infinite rooms (#143 — a
 *  sibling inside Room's `.worldOverlayWrap`, carrying the equivalent
 *  camera transform instead — see PeerCursors' own docstring for the full
 *  reasoning) — either way, drawing at raw (a, b) coordinates inside that
 *  transformed ancestor automatically tracks pan/zoom/rotation with no
 *  inverse-transform math here.
 *
 *  Unlike TransformGizmo's rect body, the ruler's own visible line is only
 *  2px wide — far too thin to reliably grab — so a separate, wide,
 *  invisible `.rulerHitLine` sits underneath it for the "drag the whole
 *  ruler" gesture (translate both endpoints together), the same "fat
 *  invisible hit area under a thin visible shape" trick as TransformGizmo's
 *  rotate-zone ring around its (also small) scale handles. */
export function RulerOverlay({ a, b, onHandleDown, zoom, angle }: RulerOverlayProps) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const counterScale = 1 / (zoom || 1)

  return (
    <div className={styles.rulerLayer}>
      <svg className={styles.rulerSvg}>
        <line
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          className={styles.rulerHitLine}
          onPointerDown={e => onHandleDown('body', e)}
        />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.rulerLine} />
        <circle
          cx={a.x} cy={a.y} r={ENDPOINT_RADIUS}
          className={styles.rulerEndpoint}
          onPointerDown={e => onHandleDown('a', e)}
        />
        <circle
          cx={b.x} cy={b.y} r={ENDPOINT_RADIUS}
          className={styles.rulerEndpoint}
          onPointerDown={e => onHandleDown('b', e)}
        />
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
