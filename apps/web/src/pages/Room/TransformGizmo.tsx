import { transformHandleCursor, TRANSFORM_PIVOT_CURSOR } from './cursorController'
import {
  applyMatrix, frameCorners, IDENTITY_MATRIX,
  type Point, type TransformBounds, type TransformHandleKind, type TransformMatrix, type TransformMode,
} from './transformMath'
import styles from './Room.module.css'

interface TransformGizmoProps {
  bounds: TransformBounds
  center: Point
  // Live matrix during a drag (see Room's handleTransformHandleDown) — every
  // point the gizmo draws is mapped through it, so the handles stay attached
  // to the content instead of the pre-drag bounds.
  matrix?: TransformMatrix
  /** (#394) Camera zoom and rotation. This svg hangs off the ancestor that
   *  carries the viewport transform, so without counter-transforming, every
   *  size below would be in *canvas* units and the handles would shrink as
   *  you zoom out — 3 screen px at 25%, which is not a hit target. */
  zoom: number
  angleRad: number
  /** (#391/#392) Only the handles' cursors read this — a mode changes what
   *  dragging a handle *does*, and with it which direction the drag runs, so
   *  a resize arrow pointing across the gesture would be a lie. Nothing else
   *  about the gizmo differs between modes: same handles, same hit areas,
   *  same places. */
  mode: TransformMode
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

type CornerKind = 'tl' | 'tr' | 'br' | 'bl'

// Same order as frameCorners — round the rectangle, not left-to-right — so the
// outline polygon can be drawn straight from the mapped points.
//
// (#393) Which cursor each of these hands the pointer is not decided here —
// see transformHandleCursor in cursorController.ts, the one place that answers
// that for the whole editor.
const CORNERS: Array<{ kind: CornerKind; rotateKind: TransformHandleKind }> = [
  { kind: 'tl', rotateKind: 'rotate-tl' },
  { kind: 'tr', rotateKind: 'rotate-tr' },
  { kind: 'br', rotateKind: 'rotate-br' },
  { kind: 'bl', rotateKind: 'rotate-bl' },
]

/** Layer transform tool (#120): move/scale/rotate/skew/distort gizmo hugging
 *  the target layer(s)' actual painted content (`bounds` — see
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
 *  what you're dragging).
 *
 *  (#392) Every point is mapped through that matrix here, in JS, and the
 *  outline is a polygon through the four mapped corners. It used to be a
 *  `<rect>` inside a single `<g transform="matrix(a,b,c,d,e,f)">`, which was
 *  neat while every transform was affine and is simply not expressible once
 *  Distort is in play: SVG's transform list has no projective entry, so a
 *  homography has nowhere to go. Done for all three modes rather than
 *  branching on whether the current matrix happens to be affine — one drawing
 *  path that is always right beats two that agree most of the time, and the
 *  handles were already being placed this way (see `at`) since #399.
 *
 *  Placement: a sibling of `<canvas>` inside `canvasWrap` for bounded
 *  rooms (its own CSS transform does the pan/zoom/rotate), or inside
 *  Room's `.worldOverlayWrap` for infinite rooms (#143 — the equivalent
 *  camera transform applied to a separate sibling instead — see
 *  PeerCursors' own docstring for the full reasoning). Either way this
 *  component itself is unchanged: `bounds`/`center`/`matrix` are just
 *  numbers in whatever space the transformed ancestor expects. */
export function TransformGizmo({
  bounds, center, matrix, zoom, angleRad, mode, onHandleDown, onCenterDown, onCenterDoubleClick,
}: TransformGizmoProps) {
  const { x, y, width, height } = bounds
  const right = x + width
  const bottom = y + height
  const midX = x + width / 2
  const midY = y + height / 2

  const cornerPos: Record<CornerKind, Point> = {
    tl: { x, y }, tr: { x: right, y }, br: { x: right, y: bottom }, bl: { x, y: bottom },
  }
  const edges: Array<{ kind: 't' | 'b' | 'l' | 'r'; pos: Point }> = [
    { kind: 't', pos: { x: midX, y } },
    { kind: 'b', pos: { x: midX, y: bottom } },
    { kind: 'l', pos: { x, y: midY } },
    { kind: 'r', pos: { x: right, y: midY } },
  ]

  // (#399) Only the outline follows the content's shape. The handles are
  // placed by mapping their anchor point through the matrix and then drawn
  // square: their size is the hit target, and it has no business tracking the
  // content's shape — riding the matrix squashed the grab squares along with a
  // squashed axis and turned them on their corners under a rotation.
  const at = (p: Point) => applyMatrix(matrix ?? IDENTITY_MATRIX, p.x, p.y)
  const centerAt = at(center)
  const outline = frameCorners(bounds).map(at)
  const [tl, tr, , bl] = outline

  // (#394) Undoes the camera for one handle: everything drawn inside is in
  // screen px, centred on the origin, whatever the zoom and however the canvas
  // is turned. Same counter-transform PeerCursors applies to its dots and for
  // the same reason — a cursor that shrinks is merely hard to read, while a
  // handle that shrinks is impossible to grab.
  const place = (p: Point) =>
    `translate(${p.x} ${p.y}) rotate(${-angleRad * 180 / Math.PI}) scale(${1 / (zoom || 1)})`

  // On-screen size of the frame, used only to keep the hit targets from
  // swallowing a small selection whole (see HIT_BUDGET_FRACTION). The two
  // sides measured are the ones meeting at the top-left corner; under a
  // Distort the opposite sides can be a different length, but this is a budget
  // for how big a grab square may get, not a measurement anything is drawn
  // from.
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
  const handle = (kind: TransformHandleKind) => {
    const cursor = transformHandleCursor(kind, mode)
    return (
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
  }

  return (
    <svg className={styles.transformSvg}>
      <polygon
        points={outline.map(p => `${p.x},${p.y}`).join(' ')}
        className={styles.transformBody}
        style={{ cursor: transformHandleCursor('body', mode) }}
        onPointerDown={e => onHandleDown('body', e)}
      />

      {CORNERS.map(({ kind, rotateKind }) => (
        <g key={kind} transform={place(at(cornerPos[kind]))}>
          <rect
            x={-rotateHit / 2} y={-rotateHit / 2} width={rotateHit} height={rotateHit}
            className={styles.transformRotateZone}
            style={{ cursor: transformHandleCursor(rotateKind, mode) }}
            onPointerDown={e => onHandleDown(rotateKind, e)}
          />
          {handle(kind)}
        </g>
      ))}

      {edges.map(({ kind, pos }) => (
        <g key={kind} transform={place(at(pos))}>{handle(kind)}</g>
      ))}

      <g transform={place(centerAt)}>
        <circle
          r={centerHit}
          className={styles.transformCenterHit} style={{ cursor: TRANSFORM_PIVOT_CURSOR }}
          onPointerDown={onCenterDown}
          onDoubleClick={onCenterDoubleClick}
        />
        <circle
          r={CENTER_HANDLE_RADIUS}
          className={styles.transformCenterHandle}
          style={{ cursor: TRANSFORM_PIVOT_CURSOR, pointerEvents: 'none' }}
        />
      </g>
    </svg>
  )
}
