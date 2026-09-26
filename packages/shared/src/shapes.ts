import type { OperationBase } from './operationBase.js'

// ── Shapes (#525, epic) ───────────────────────────────────────────────────
//
// A shape is a rectangle, ellipse, star or line laid down in one gesture: the
// tool that draws a frame around a thumbnail sketch, and the one that puts
// masses on the sheet for a composition exercise. It paints into a layer like
// every other mark — it is part of the drawing, not an overlay over it (that
// is what an annotation is, see annotations.ts).
//
// **The recipe, not the result** — the opposite call from `area_fill` next
// door, and for the opposite reason. A fill records its pixels because the
// region it covers was derived from *this* device's GPU output and no other
// participant can reproduce it (see AreaFillOperation's docstring). A shape
// is derived from nothing: a rectangle is four numbers and a corner radius,
// and every client can draw it from those. Recording a raster instead would
// put a base64 PNG the size of the shape into a log that is permanent and
// kept as a dataset (#375), and would pin the shape to the resolution it was
// drawn at.
//
// What that buys, and what it costs, are both worth stating. It buys size,
// fidelity at any zoom, and a record that says what the user actually did.
// It costs the guarantee `area_fill` bought: every client rasterizes these
// numbers itself, so the rasterizer *is* part of the contract and falls under
// the cross-device determinism rule in `.claude/rules.md` — see #527 for the
// side-by-side check that must pass and the CPU fallback if it does not.
//
// Colour is `[r, g, b]` floats, like a stroke's and unlike an annotation's hex
// string: these pixels are handed to WebGL, so they are written the way their
// renderer takes them. There is no alpha — deliberately, until the app has one
// coherent notion of transparency (Ilya, 05.09; today "colour alpha" and
// "pencil opacity" are two different stories).

export const SHAPE_KINDS = ['rectangle', 'ellipse', 'polystar', 'line'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

/** Where a stroke of finite width sits relative to the contour it follows.
 *  Not cosmetic: a 400×300 frame stroked 10 wide is 400×300 only with
 *  `inside`, and drawing a frame of an exact size is half of why the tool
 *  exists. */
export const SHAPE_STROKE_ALIGNS = ['inside', 'center', 'outside'] as const
export type ShapeStrokeAlign = (typeof SHAPE_STROKE_ALIGNS)[number]

/** How a stroke turns a corner. Distinct from a shape's own `cornerRadius`,
 *  which changes the *contour*: a mitre on a rounded rectangle is a
 *  contradiction in terms, a round join on a sharp one is not.
 *
 *  Two, not the usual three: `bevel` is absent because the rasterizer draws a
 *  stroke as the region between two contours (#527), and a bevel is the one
 *  join that is neither of them — it needs the corner cut by a chord, which is
 *  a third contour construction for a rarely-used join. Adding it later widens
 *  this union without touching anything already recorded, since nothing can
 *  have written a value that did not exist. */
export const SHAPE_STROKE_JOINS = ['miter', 'round'] as const
export type ShapeStrokeJoin = (typeof SHAPE_STROKE_JOINS)[number]

/** How a stroke ends where the contour does — lines only; every other shape
 *  here is a closed contour with no ends to cap. */
export const SHAPE_STROKE_CAPS = ['butt', 'round', 'square'] as const
export type ShapeStrokeCap = (typeof SHAPE_STROKE_CAPS)[number]

/** Ceiling on a star's vertex count. Enforced where the operation is built,
 *  never on replay — an operation already in the log must keep replaying
 *  whatever it says, so a limit that rejected on replay would be a way to make
 *  an old room stop loading (same rule as MAX_ANNOTATION_INK_POINTS). */
export const MIN_POLYSTAR_POINTS = 3
export const MAX_POLYSTAR_POINTS = 60

/** What the shape *is*, in the frame's own normalized space — everything here
 *  is independent of where the shape was put and how big it is, which is what
 *  lets `ShapeFrame` carry placement alone and lets an annotation reuse this
 *  type later without inheriting a layer-space rectangle.
 *
 *  Angles are radians, measured from +X and increasing clockwise on screen
 *  (layer space has Y pointing down, so clockwise is what a positive angle
 *  looks like). The UI shows degrees; the wire keeps radians, like every other
 *  angle in the protocol. */
export type ShapeGeometry =
  /** `cornerRadius` in layer units, clamped by the rasterizer to half the
   *  shorter side — a radius larger than the shape is not an error, it is a
   *  stadium, and clamping is how it gets there. */
  | { kind: 'rectangle'; cornerRadius: number }
  /** The Oval of Adobe Animate, which is why there is no separate "oval" tool:
   *  the difference that would have justified one is these parameters.
   *
   *  `startAngle`/`endAngle` cut a sector; equal values (or a full turn apart)
   *  mean the whole ellipse. `innerRadius` is a fraction 0..1 of the way from
   *  the centre to the edge, so 0 is solid and 0.5 is a ring half as thick as
   *  the radius. `closePath` decides whether a *sector's* stroke closes across
   *  its open side; the fill is always the closed region, because a fill of an
   *  open contour has no meaning anyone would predict. */
  | {
      kind: 'ellipse'
      startAngle: number
      endAngle: number
      innerRadius: number
      closePath: boolean
    }
  /** Regular polygon and star in one, as in Animate and Lottie.
   *
   *  `innerRadius` is a fraction of the outer radius, and it is a *geometric*
   *  parameter rather than the "starness" slider the UI shows: alternate
   *  vertices sit at `innerRadius` of the way out, so `cos(PI / points)` —
   *  where those vertices land exactly on the edges between the outer ones —
   *  is a regular polygon, and everything below it is a star of increasing
   *  sharpness. Saying "0 means polygon" instead would have made the parameter
   *  discontinuous at its own zero: 0.001 is a needle-thin star and 0 would be
   *  a hexagon. The UI maps its slider onto this (see #529), which is where a
   *  convenience like that belongs.
   *
   *  `rotation` turns the vertices inside the frame, which is not what
   *  `ShapeFrame.angle` does — that turns the frame itself, and on a
   *  non-square frame the two produce different shapes.
   *
   *  No corner radius here, unlike the rectangle: rounding a star's vertices
   *  and stroking it with a mitre are two different offsets of the same
   *  contour, and doing both at once is a construction the first version does
   *  not need (#527). The field can be added later without reinterpreting
   *  anything already in the log. */
  | {
      kind: 'polystar'
      points: number
      innerRadius: number
      rotation: number
    }
  /** A line runs corner to corner of its frame — see ShapeFrame on why the
   *  frame's width and height are signed. */
  | { kind: 'line'; cap: ShapeStrokeCap }

/** Where the shape sits, in the same layer space as `Dab.x/y` and
 *  `AreaFillOperation`'s rect (canvas coordinates in a bounded room, world
 *  coordinates in an infinite one).
 *
 *  `width`/`height` are **signed**, and that is not sloppiness left over from
 *  a drag: a line from the top-left corner to the bottom-right one and a line
 *  from the top-right to the bottom-left occupy the same rectangle, and the
 *  sign is the only thing that tells them apart. Shapes that are symmetric
 *  about both axes simply ignore it.
 *
 *  `angle` rotates the frame about its own centre. Rotation only — no skew and
 *  no projective term, unlike `LayerTransformMatrix`: a sheared frame has no
 *  single stroke width, and shearing a shape after the fact is what the
 *  transform tool is for. */
// (`type`, not `interface`, for this and the two below — deliberately. An
// operation is written to a Prisma JSON column, and Prisma's InputJsonValue is
// an index-signature type: TypeScript gives type aliases an implicit index
// signature and interfaces none, so an interface here fails to typecheck at
// persistOperation with an error that names Prisma and says nothing about
// shapes.)
export type ShapeFrame = {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

/** `null` on the operation means "no stroke" — the explicit absence the UI
 *  shows as a crossed-out swatch, not a zero width. Width is in layer units,
 *  like everything else here. */
export type ShapeStroke = {
  color: [number, number, number]
  width: number
  align: ShapeStrokeAlign
  join: ShapeStrokeJoin
}

/** `null` means "no fill". Its own type rather than a bare colour so that a
 *  fill can gain properties (a texture, a gradient) without every shape
 *  operation ever recorded having to be reinterpreted. */
export type ShapeFill = {
  color: [number, number, number]
}

/** One shape, laid down in one gesture, into one layer.
 *
 *  A pure single-layer pixel operation like the four `area_*` ops (areaOperations.ts), so a
 *  layer snapshot can stand in for it (`COVERABLE_OP_TYPES` on the server).
 *
 *  One operation for the whole gesture, including everything that happened
 *  after the pen came up: a shape stays editable until it is confirmed (Enter,
 *  a click past it, or switching tools — the transform tool's contract, see
 *  #528), and only the confirmed result is recorded. Nothing about that
 *  editing session reaches the log, which is why one shape is one undo.
 *
 *  A shape with neither stroke nor fill is not emitted at all — it would be an
 *  operation that provably paints nothing, and the log is permanent. */
export type ShapeOperation = OperationBase & {
  type: 'shape'
  layerId: string
  geometry: ShapeGeometry
  frame: ShapeFrame
  stroke: ShapeStroke | null
  fill: ShapeFill | null
}

/** The world rect a shape's pixels can reach: its frame, rotated, grown by
 *  whatever the stroke puts outside the contour, plus a pixel of margin for
 *  the antialiased rim.
 *
 *  Lives here rather than in the engine because both sides need the same
 *  answer and they must not drift: the engine resolves which tiles to paint
 *  from it, and the UI hit-tests and frames the gizmo against it. An
 *  underestimate is a shape clipped at a tile boundary — the kind of bug that
 *  shows up only on the second tile, i.e. only on a big shape. */
export function shapeWorldBounds(
  geometry: ShapeGeometry, frame: ShapeFrame, stroke: ShapeStroke | null,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const halfW = Math.abs(frame.width) / 2
  const halfH = Math.abs(frame.height) / 2
  const cx = frame.x + frame.width / 2
  const cy = frame.y + frame.height / 2

  // How far past the contour the stroke reaches. `outside` puts all of it
  // there, `center` half; a mitre can reach further still at a sharp corner,
  // and a square cap pushes half a width past each end of a line.
  let outset = 0
  if (stroke) {
    if (stroke.align === 'outside') outset = stroke.width
    else if (stroke.align === 'center') outset = stroke.width / 2
    if (stroke.join === 'miter') outset += stroke.width
    if (geometry.kind === 'line' && geometry.cap !== 'butt') outset += stroke.width
  }
  // The stroke's reach is measured in the frame's own space (it follows the
  // contour, so it turns with it) and the antialiasing margin in world space,
  // added after the rotation — a margin rotated along with the frame would be
  // sqrt(2) times itself at 45 degrees, which is harmless but says something
  // untrue about what the rim costs.
  const c = Math.abs(Math.cos(frame.angle))
  const s = Math.abs(Math.sin(frame.angle))
  const ext = halfW + outset
  const eyt = halfH + outset
  const rx = ext * c + eyt * s + 1
  const ry = ext * s + eyt * c + 1

  return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry }
}
