import styles from './Room.module.css'

export interface RulerPoint {
  x: number // canvas physical-pixel space — same coordinate system as Dab.x/y
  y: number
}

export type RulerHandleKind = 'a' | 'b' | 'body'

interface RulerOverlayProps {
  a: RulerPoint
  b: RulerPoint
  onHandleDown: (kind: RulerHandleKind, e: React.PointerEvent<SVGElement>) => void
}

const ENDPOINT_RADIUS = 7

/** Ruler tool (#89): a persistent, draggable straight-edge guide — a
 *  pencil stroke drawn near it snaps to its line (see engine.setRuler /
 *  engine/src/rulerSnap.ts for the actual snapping math, applied in the
 *  pointer pipeline before dabs are generated, not here). Purely
 *  presentational, same division of responsibility as TransformGizmo/
 *  MeasureOverlay: drag capture and viewport math live in Room/index.tsx
 *  (handleRulerHandleDown), this component only renders the line and its
 *  two draggable endpoints and reports which handle was grabbed.
 *
 *  Same placement convention as MeasureOverlay/GridOverlay: a sibling of
 *  `<canvas>` inside `canvasWrap`, which already carries the viewport's CSS
 *  transform, so drawing at raw canvas-pixel coordinates automatically
 *  tracks pan/zoom/rotation with no inverse-transform math here.
 *
 *  Unlike TransformGizmo's rect body, the ruler's own visible line is only
 *  2px wide — far too thin to reliably grab — so a separate, wide,
 *  invisible `.rulerHitLine` sits underneath it for the "drag the whole
 *  ruler" gesture (translate both endpoints together), the same "fat
 *  invisible hit area under a thin visible shape" trick as TransformGizmo's
 *  rotate-zone ring around its (also small) scale handles. */
export function RulerOverlay({ a, b, onHandleDown }: RulerOverlayProps) {
  return (
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
  )
}
