import { applyMatrix, IDENTITY_MATRIX } from './transformMath'
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
  /** (#394) Camera zoom and rotation. This svg hangs off the ancestor that
   *  carries the viewport transform, so without counter-transforming, every
   *  size below would be in *canvas* units and the handles would shrink as
   *  you zoom out — 3 screen px at 25%, which is not a hit target. */
  zoom: number
  angleRad: number
  onHandleDown: (handle: TransformHandleKind, e: React.PointerEvent<SVGElement>) => void
  onCenterDown: (e: React.PointerEvent<SVGElement>) => void
  onCenterDoubleClick: () => void
}

// (#394) All in *screen* px — see `place()` for the transform that makes that
// true at any zoom.
//
// The grab square is bigger than the drawn one on purpose: the drawn size is
// how much of the drawing it is allowed to cover, the grab size is how hard it
// is to hit, and they were the same number only because nothing had separated
// them. The rotate ring is the whole hit target for rotation, so it stays
// generous — same "just outside the corner turns it" affordance as Adobe
// Animate's Free Transform corners.
//
// Sized for a pen or a mouse rather than the 40-48px this codebase asks of
// touch targets, because touch never reaches this gizmo at all: both
// handleTransformHandleDown and handleTransformCenterDown return on
// `pointerType === 'touch'`, leaving the finger to pan the viewport (#120's
// deliberate pen-only rule, same as the drawing tools).
const SCALE_HANDLE_SIZE = 12
const SCALE_HIT_SIZE = 32
const ROTATE_ZONE_SIZE = 80
const CENTER_HANDLE_RADIUS = 6
const CENTER_HIT_RADIUS = 16
// No hit target may eat more than this share of the frame's shorter side. On a
// small selection four 32px corner zones plus four edge ones would otherwise
// cover it completely, and only whichever rendered last would ever be
// grabbable — a worse failure than a handle being small.
const HIT_BUDGET_FRACTION = 0.4

const CORNERS: Array<{ kind: 'tl' | 'tr' | 'bl' | 'br'; rotateKind: TransformHandleKind; cursor: string }> = [
  { kind: 'tl', rotateKind: 'rotate-tl', cursor: 'nwse-resize' },
  { kind: 'tr', rotateKind: 'rotate-tr', cursor: 'nesw-resize' },
  { kind: 'bl', rotateKind: 'rotate-bl', cursor: 'nesw-resize' },
  { kind: 'br', rotateKind: 'rotate-br', cursor: 'nwse-resize' },
]

/** Layer transform tool (#120): move/scale/rotate gizmo hugging the
 *  target layer(s)' actual painted content (`bounds` — see
 *  engine.getContentBounds, canvas-pixel space for bounded rooms, genuine
 *  world space for infinite rooms — #143), not the whole canvas; single-
 *  and multi-layer selections both just union their content bounds in
 *  Room, so this component only ever deals with one rect.
 *
 *  Purely presentational: drag capture, viewport math, and the actual
 *  engine preview/commit calls all live in Room/index.tsx, same division
 *  of responsibility as RulerOverlay/handleRulerPlaceDown. `matrix` is the
 *  one exception carried in from there — without it the handles stayed at
 *  the pre-drag bounds while only the WebGL preview underneath moved,
 *  which read as broken (the thing you're dragging visually detaches from
 *  what you're dragging). SVG's own `matrix(a,b,c,d,e,f)` transform
 *  function uses the exact same convention as LayerTransformOperation's
 *  matrix, so the whole gizmo can ride along with one <g transform>.
 *
 *  Placement: a sibling of `<canvas>` inside `canvasWrap` for bounded
 *  rooms (its own CSS transform does the pan/zoom/rotate), or inside
 *  Room's `.worldOverlayWrap` for infinite rooms (#143 — the equivalent
 *  camera transform applied to a separate sibling instead — see
 *  PeerCursors' own docstring for the full reasoning). Either way this
 *  component itself is unchanged: `bounds`/`center`/`matrix` are just
 *  numbers in whatever space the transformed ancestor expects. */
export function TransformGizmo({
  bounds, center, matrix, zoom, angleRad, onHandleDown, onCenterDown, onCenterDoubleClick,
}: TransformGizmoProps) {
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

  // (#399) Only the outline rides the matrix. The handles are placed by
  // mapping their anchor point through it and then drawn square, outside the
  // transformed group — inside it they inherited the whole thing, so a
  // session that squashed one axis squashed the grab squares along with the
  // content, and a rotation turned them on their corners. Their size is the
  // hit target; it has no business tracking the content's shape.
  const at = (p: Point) => applyMatrix(matrix ?? IDENTITY_MATRIX, p.x, p.y)
  const centerAt = at(center)
  const tl = at(cornerPos.tl)

  // (#394) Undoes the camera for one handle: everything drawn inside is in
  // screen px, centred on the origin, whatever the zoom and however the canvas
  // is turned. Same counter-transform PeerCursors applies to its dots and for
  // the same reason — the difference being that a cursor that shrinks is
  // merely hard to read, while a handle that shrinks is impossible to grab.
  const place = (p: Point) =>
    `translate(${p.x} ${p.y}) rotate(${-angleRad * 180 / Math.PI}) scale(${1 / (zoom || 1)})`

  // On-screen size of the frame, used only to keep the hit targets from
  // swallowing a small selection whole (see HIT_BUDGET_FRACTION).
  const tr = at(cornerPos.tr), bl = at(cornerPos.bl)
  const frameShorterSide = Math.min(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
  ) * zoom
  const hitBudget = Math.max(SCALE_HANDLE_SIZE, frameShorterSide * HIT_BUDGET_FRACTION)
  const scaleHit = Math.min(SCALE_HIT_SIZE, hitBudget)
  const rotateHit = Math.min(ROTATE_ZONE_SIZE, Math.max(scaleHit, frameShorterSide))
  const centerHit = Math.min(CENTER_HIT_RADIUS, Math.max(CENTER_HANDLE_RADIUS, hitBudget / 2))

  /** A drawn square with a bigger invisible one under it, both centred on the
   *  origin — the caller positions them with `place()`. */
  const handle = (kind: TransformHandleKind, cursor: string) => (
    <>
      <rect
        x={-scaleHit / 2} y={-scaleHit / 2} width={scaleHit} height={scaleHit}
        className={styles.transformHandleHit} style={{ cursor }}
        onPointerDown={e => onHandleDown(kind, e)}
      />
      <rect
        x={-SCALE_HANDLE_SIZE / 2} y={-SCALE_HANDLE_SIZE / 2}
        width={SCALE_HANDLE_SIZE} height={SCALE_HANDLE_SIZE}
        className={styles.transformHandle} style={{ cursor, pointerEvents: 'none' }}
      />
    </>
  )

  return (
    <svg className={styles.transformSvg}>
      <g transform={groupTransform}>
        <rect
          x={x} y={y} width={width} height={height}
          className={styles.transformBody}
          onPointerDown={e => onHandleDown('body', e)}
        />
      </g>

      {CORNERS.map(({ kind, rotateKind, cursor }) => (
        <g key={kind} transform={place(at(cornerPos[kind]))}>
          <rect
            x={-rotateHit / 2} y={-rotateHit / 2} width={rotateHit} height={rotateHit}
            className={styles.transformRotateZone}
            onPointerDown={e => onHandleDown(rotateKind, e)}
          />
          {handle(kind, cursor)}
        </g>
      ))}

      {edges.map(({ kind, pos, cursor }) => (
        <g key={kind} transform={place(at(pos))}>{handle(kind, cursor)}</g>
      ))}

      <g transform={place(centerAt)}>
        <circle
          r={centerHit}
          className={styles.transformCenterHit} style={{ cursor: 'move' }}
          onPointerDown={onCenterDown}
          onDoubleClick={onCenterDoubleClick}
        />
        <circle
          r={CENTER_HANDLE_RADIUS}
          className={styles.transformCenterHandle} style={{ cursor: 'move', pointerEvents: 'none' }}
        />
      </g>
    </svg>
  )
}
