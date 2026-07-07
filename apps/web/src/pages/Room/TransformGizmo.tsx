import styles from './Room.module.css'

export type TransformHandleKind = 'body' | 'tl' | 'tr' | 'bl' | 'br' | 'rotate'

interface TransformGizmoProps {
  canvasWidth: number
  canvasHeight: number
  onHandleDown: (handle: TransformHandleKind, e: React.PointerEvent<SVGElement>) => void
}

// Distance above the rect's top edge for the rotate handle, and the corner/
// rotate handle's own size — canvas-pixel space, same convention as
// MeasureOverlay's line/endpoints (scales with zoom like real content would;
// only text labels counter-scale in this codebase, and this overlay has none).
const ROTATE_OFFSET = 40
const HANDLE_SIZE = 14

/** Layer transform tool (#120): move/scale/rotate gizmo over the current
 *  transform target(s) — always the full canvas rect, never a tighter
 *  content bounding box, because every layer buffer already *is* exactly
 *  canvas-sized (see the #120 design discussion) — no content-bounds
 *  detection needed for single- or multi-layer selections alike.
 *
 *  Purely presentational: drag capture, viewport math, and the actual
 *  engine preview/commit calls all live in Room/index.tsx, same division
 *  of responsibility as MeasureOverlay/handleMeasureDown. The rect and
 *  handles stay glued to the original canvas bounds throughout a drag —
 *  they don't themselves track the live transform, only the WebGL preview
 *  underneath (engine.previewLayerTransform) does. */
export function TransformGizmo({ canvasWidth, canvasHeight, onHandleDown }: TransformGizmoProps) {
  const half = HANDLE_SIZE / 2
  const cx = canvasWidth / 2

  const corner = (x: number, y: number, handle: TransformHandleKind, cursor: string) => (
    <rect
      x={x - half} y={y - half} width={HANDLE_SIZE} height={HANDLE_SIZE}
      className={styles.transformHandle} style={{ cursor }}
      onPointerDown={e => onHandleDown(handle, e)}
    />
  )

  return (
    <svg className={styles.transformSvg}>
      <rect
        x={0} y={0} width={canvasWidth} height={canvasHeight}
        className={styles.transformBody}
        onPointerDown={e => onHandleDown('body', e)}
      />
      <line x1={cx} y1={0} x2={cx} y2={-ROTATE_OFFSET} className={styles.transformRotateLine} />
      <circle
        cx={cx} cy={-ROTATE_OFFSET} r={half}
        className={styles.transformHandle} style={{ cursor: 'grab' }}
        onPointerDown={e => onHandleDown('rotate', e)}
      />
      {corner(0, 0, 'tl', 'nwse-resize')}
      {corner(canvasWidth, 0, 'tr', 'nesw-resize')}
      {corner(0, canvasHeight, 'bl', 'nesw-resize')}
      {corner(canvasWidth, canvasHeight, 'br', 'nwse-resize')}
    </svg>
  )
}
