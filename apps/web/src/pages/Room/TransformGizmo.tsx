import styles from './Room.module.css'

export type TransformHandleKind =
  | 'body'
  | 'tl' | 'tr' | 'bl' | 'br'
  | 't' | 'b' | 'l' | 'r'
  | 'rotate-tl' | 'rotate-tr' | 'rotate-bl' | 'rotate-br'

export interface TransformBounds { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }

interface TransformGizmoProps {
  bounds: TransformBounds
  center: Point
  // Live matrix during a drag (see Room's handleTransformHandleDown) — the
  // whole gizmo rides along with it via a single SVG `matrix()` transform,
  // so handles stay attached to the content instead of the pre-drag bounds.
  matrix?: [number, number, number, number, number, number]
  onHandleDown: (handle: TransformHandleKind, e: React.PointerEvent<SVGElement>) => void
  onCenterDown: (e: React.PointerEvent<SVGElement>) => void
  onCenterDoubleClick: () => void
}

const SCALE_HANDLE_SIZE = 12
// Bigger than the scale handle and centered on the same corner — the ring
// left over once the scale handle (rendered after, so it wins hit-testing)
// covers the middle is what gives the "just outside the corner = rotate"
// affordance, same idea as Adobe Animate's Free Transform corners.
const ROTATE_ZONE_SIZE = 30
const CENTER_HANDLE_RADIUS = 6

const CORNERS: Array<{ kind: 'tl' | 'tr' | 'bl' | 'br'; rotateKind: TransformHandleKind; cursor: string }> = [
  { kind: 'tl', rotateKind: 'rotate-tl', cursor: 'nwse-resize' },
  { kind: 'tr', rotateKind: 'rotate-tr', cursor: 'nesw-resize' },
  { kind: 'bl', rotateKind: 'rotate-bl', cursor: 'nesw-resize' },
  { kind: 'br', rotateKind: 'rotate-br', cursor: 'nwse-resize' },
]

/** Layer transform tool (#120): move/scale/rotate gizmo hugging the
 *  target layer(s)' actual painted content (`bounds` — see
 *  engine.getContentBounds), not the whole canvas; single- and multi-layer
 *  selections both just union their content bounds in Room, so this
 *  component only ever deals with one rect.
 *
 *  Purely presentational: drag capture, viewport math, and the actual
 *  engine preview/commit calls all live in Room/index.tsx, same division
 *  of responsibility as MeasureOverlay/handleMeasureDown. `matrix` is the
 *  one exception carried in from there — without it the handles stayed at
 *  the pre-drag bounds while only the WebGL preview underneath moved,
 *  which read as broken (the thing you're dragging visually detaches from
 *  what you're dragging). SVG's own `matrix(a,b,c,d,e,f)` transform
 *  function uses the exact same convention as LayerTransformOperation's
 *  matrix, so the whole gizmo can ride along with one <g transform>. */
export function TransformGizmo({ bounds, center, matrix, onHandleDown, onCenterDown, onCenterDoubleClick }: TransformGizmoProps) {
  const { x, y, width, height } = bounds
  const right = x + width
  const bottom = y + height
  const midX = x + width / 2
  const midY = y + height / 2
  const groupTransform = matrix ? `matrix(${matrix.join(',')})` : undefined

  const cornerPos: Record<'tl' | 'tr' | 'bl' | 'br', Point> = {
    tl: { x, y }, tr: { x: right, y }, bl: { x, y: bottom }, br: { x: right, y: bottom },
  }
  const edges: Array<{ kind: 't' | 'b' | 'l' | 'r'; pos: Point; cursor: string }> = [
    { kind: 't', pos: { x: midX, y }, cursor: 'ns-resize' },
    { kind: 'b', pos: { x: midX, y: bottom }, cursor: 'ns-resize' },
    { kind: 'l', pos: { x, y: midY }, cursor: 'ew-resize' },
    { kind: 'r', pos: { x: right, y: midY }, cursor: 'ew-resize' },
  ]

  const rh = ROTATE_ZONE_SIZE / 2
  const sh = SCALE_HANDLE_SIZE / 2

  return (
    <svg className={styles.transformSvg}>
      <g transform={groupTransform}>
        <rect
          x={x} y={y} width={width} height={height}
          className={styles.transformBody}
          onPointerDown={e => onHandleDown('body', e)}
        />

        {CORNERS.map(({ kind, rotateKind, cursor }) => {
          const p = cornerPos[kind]
          return (
            <g key={kind}>
              <rect
                x={p.x - rh} y={p.y - rh} width={ROTATE_ZONE_SIZE} height={ROTATE_ZONE_SIZE}
                className={styles.transformRotateZone} style={{ cursor: 'grab' }}
                onPointerDown={e => onHandleDown(rotateKind, e)}
              />
              <rect
                x={p.x - sh} y={p.y - sh} width={SCALE_HANDLE_SIZE} height={SCALE_HANDLE_SIZE}
                className={styles.transformHandle} style={{ cursor }}
                onPointerDown={e => onHandleDown(kind, e)}
              />
            </g>
          )
        })}

        {edges.map(({ kind, pos, cursor }) => (
          <rect
            key={kind}
            x={pos.x - sh} y={pos.y - sh} width={SCALE_HANDLE_SIZE} height={SCALE_HANDLE_SIZE}
            className={styles.transformHandle} style={{ cursor }}
            onPointerDown={e => onHandleDown(kind, e)}
          />
        ))}

        <circle
          cx={center.x} cy={center.y} r={CENTER_HANDLE_RADIUS}
          className={styles.transformCenterHandle} style={{ cursor: 'move' }}
          onPointerDown={onCenterDown}
          onDoubleClick={onCenterDoubleClick}
        />
      </g>
    </svg>
  )
}
