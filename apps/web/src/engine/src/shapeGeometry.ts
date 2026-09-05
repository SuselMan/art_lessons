import {
  MIN_POLYSTAR_POINTS, MAX_POLYSTAR_POINTS,
  type ShapeFrame, type ShapeGeometry, type ShapeStroke,
} from '@grafetto/shared'

// (#527) Everything about drawing a shape that is arithmetic rather than GL:
// the frame-space contour parameters the fragment shader is handed, and the
// two offset contours a mitred stroke is drawn between.
//
// Split out for the reason rulerSnap.ts and selectionMask.ts are: this is the
// part that can be tested without a canvas, and it is also the part where
// being wrong is invisible — a stroke half a pixel off reads as "the shape
// tool looks a bit soft", not as a bug.
//
// **Why the shader takes contours and not a stroke width.** A stroke is drawn
// as the region between an outer and an inner contour, not as a band around a
// distance field, and the difference is the corner. Offsetting a signed
// distance rounds every corner it meets — that is what a distance field *is* —
// so a mitred rectangle cannot come out of one. Two contours can: a rectangle
// grown by the stroke's outer reach, minus one shrunk by its inner reach, has
// exactly the sharp corner a mitre means.
//
// **Why only the rectangle is mitred.** The offset contour has to be the same
// kind of shape, expressible in the same parameters, or the shader cannot draw
// it. A rectangle's is (grow the half-extents, move the corner radius with
// them). A star's is not: its frame is not necessarily square, so a uniform
// offset in layer units is a non-uniform one in the normalized space its
// vertices are defined in, and the result is no longer a star. Since the
// rectangle is also the shape whose corners a mitre is actually *for* — the
// frame around a thumbnail sketch, #525's first scenario — the others take the
// band and round their joins.

/** How wide the antialiased rim is, in layer units. One, because one layer
 *  unit is one pixel of a tile buffer (see tileWorldRect and the buffers
 *  allocated against it) — the shader never asks the GPU for a derivative to
 *  find this out, which keeps the whole rasterizer free of the fwidth/dFdx
 *  family the cross-device determinism rule warns about. */
export const SHAPE_AA_WIDTH = 1

export type ShapeKindCode = 0 | 1 | 2 | 3

/** Contour parameters in the shape's own frame space, packed the way the
 *  shader reads them:
 *
 *  - rectangle: `[halfWidth, halfHeight, cornerRadius]`
 *  - ellipse:   `[semiAxisX, semiAxisY, 0]`
 *  - polystar:  `[outerRadius, innerRadius, 0]` — in the normalized space
 *               where the frame is a unit circle, so the outer radius is 1
 *  - line:      `[halfLength, 0, 0]`
 */
export type ContourParams = [number, number, number]

export interface ShapeDrawParams {
  kind: ShapeKindCode
  /** Frame centre in layer space. */
  centerX: number
  centerY: number
  /** cos/sin of the frame's own rotation — the shader turns a world point into
   *  frame space with these, so no trigonometry runs on the GPU for placement. */
  cos: number
  sin: number
  /** Frame half-extents, which the polystar needs on their own: its contour
   *  lives in a normalized space and the shader converts distances back
   *  through these. */
  halfX: number
  halfY: number
  base: ContourParams
  /** Outer and inner contours of a mitred stroke; meaningless when
   *  `strokeMode` is 'band'. */
  outer: ContourParams
  inner: ContourParams
  /** False when the inner contour has collapsed — a stroke wider than the
   *  shape, where "between the contours" means the whole interior. */
  hasInner: boolean
  /** 'band' offsets the distance field (round joins, and every shape with no
   *  corners); 'contours' fills between `outer` and `inner` (mitre). */
  strokeMode: 'band' | 'contours'
  /** Centre and half-width of the band, in signed-distance units, for
   *  `strokeMode === 'band'`. Carries the stroke alignment: a centred stroke
   *  sits at 0, an inside one at -width/2, an outside one at +width/2. */
  bandCenter: number
  bandHalf: number
  /** Ellipse only: inner radius of a ring as a fraction of the outer, 0 for a
   *  solid ellipse. */
  ringRatio: number
  /** Ellipse only: whether an open sector's stroke closes across its straight
   *  sides. Governs the stroke alone — the fill is always the closed region. */
  closePath: boolean
  /** Ellipse sector, pre-resolved into a wedge test the shader can run without
   *  an atan: the bisector direction, the half aperture's cos/sin, and which
   *  of the three cases applies (0 = whole ellipse, 1 = wedge at or below half
   *  a turn — an intersection of two half-planes, 2 = reflex wedge — the
   *  complement of one). */
  sectorMode: 0 | 1 | 2
  sectorDirX: number
  sectorDirY: number
  sectorCos: number
  sectorSin: number
  /** Polystar only. */
  starPoints: number
  starRotCos: number
  starRotSin: number
  /** Line only: unit direction in frame space, half its length, and the cap
   *  (0 butt, 1 round, 2 square). */
  lineDirX: number
  lineDirY: number
  lineHalfLen: number
  lineCap: 0 | 1 | 2
}

/** How far a stroke reaches outside and inside the contour it follows. */
export function strokeReach(stroke: ShapeStroke): { outward: number; inward: number } {
  const w = Math.max(0, stroke.width)
  if (stroke.align === 'inside') return { outward: 0, inward: w }
  if (stroke.align === 'outside') return { outward: w, inward: 0 }
  return { outward: w / 2, inward: w / 2 }
}

export function clampPolystarPoints(n: number): number {
  if (!Number.isFinite(n)) return MIN_POLYSTAR_POINTS
  return Math.min(MAX_POLYSTAR_POINTS, Math.max(MIN_POLYSTAR_POINTS, Math.round(n)))
}

/** Turns one shape into everything the fragment shader needs. Pure arithmetic:
 *  no GL, no canvas, no engine state. */
export function shapeDrawParams(
  geometry: ShapeGeometry, frame: ShapeFrame, stroke: ShapeStroke | null,
): ShapeDrawParams {
  const halfX = Math.abs(frame.width) / 2
  const halfY = Math.abs(frame.height) / 2
  const reach = stroke ? strokeReach(stroke) : { outward: 0, inward: 0 }

  const params: ShapeDrawParams = {
    kind: 0,
    centerX: frame.x + frame.width / 2,
    centerY: frame.y + frame.height / 2,
    cos: Math.cos(frame.angle),
    sin: Math.sin(frame.angle),
    halfX,
    halfY,
    base: [halfX, halfY, 0],
    outer: [halfX, halfY, 0],
    inner: [halfX, halfY, 0],
    hasInner: true,
    strokeMode: 'band',
    bandCenter: 0,
    bandHalf: 0,
    ringRatio: 0,
    closePath: true,
    sectorMode: 0,
    sectorDirX: 1,
    sectorDirY: 0,
    sectorCos: 1,
    sectorSin: 0,
    starPoints: MIN_POLYSTAR_POINTS,
    starRotCos: 1,
    starRotSin: 0,
    lineDirX: 1,
    lineDirY: 0,
    lineHalfLen: 0,
    lineCap: 0,
  }

  if (stroke) {
    const w = Math.max(0, stroke.width)
    params.bandHalf = w / 2
    params.bandCenter = stroke.align === 'inside' ? -w / 2 : stroke.align === 'outside' ? w / 2 : 0
  }

  switch (geometry.kind) {
    case 'rectangle': {
      params.kind = 0
      const r = clampCornerRadius(geometry.cornerRadius, halfX, halfY)
      params.base = [halfX, halfY, r]
      if (stroke && stroke.join === 'miter') {
        params.strokeMode = 'contours'
        // A sharp corner stays sharp on both offset contours — that is what a
        // mitre is. A rounded one keeps its arcs, whose radius grows outward
        // and shrinks inward with the offset, which is also the only thing a
        // mitre could mean there: an arc has no corner to extend.
        const outR = r > 0 ? r + reach.outward : 0
        const inR = r > 0 ? Math.max(0, r - reach.inward) : 0
        params.outer = [halfX + reach.outward, halfY + reach.outward, outR]
        params.inner = [halfX - reach.inward, halfY - reach.inward, inR]
        params.hasInner = params.inner[0] > 0 && params.inner[1] > 0
      }
      break
    }
    case 'ellipse': {
      params.kind = 1
      params.base = [halfX, halfY, 0]
      params.ringRatio = Math.max(0, Math.min(0.999, geometry.innerRadius))
      params.closePath = geometry.closePath
      Object.assign(params, sectorParams(geometry.startAngle, geometry.endAngle))
      break
    }
    case 'polystar': {
      params.kind = 2
      params.starPoints = clampPolystarPoints(geometry.points)
      params.starRotCos = Math.cos(geometry.rotation)
      params.starRotSin = Math.sin(geometry.rotation)
      // Normalized space: the frame is a unit circle, so the outer radius is
      // always 1 and the inner one is the ratio itself.
      params.base = [1, Math.max(0, Math.min(1, geometry.innerRadius)), 0]
      break
    }
    case 'line': {
      params.kind = 3
      const len = Math.hypot(frame.width, frame.height)
      params.lineHalfLen = len / 2
      params.lineDirX = len === 0 ? 1 : frame.width / len
      params.lineDirY = len === 0 ? 0 : frame.height / len
      params.lineCap = geometry.cap === 'round' ? 1 : geometry.cap === 'square' ? 2 : 0
      params.base = [len / 2, 0, 0]
      break
    }
  }

  return params
}

/** A radius larger than the shape is not an error, it is a stadium — clamping
 *  is how it gets there. */
export function clampCornerRadius(radius: number, halfX: number, halfY: number): number {
  if (!Number.isFinite(radius)) return 0
  return Math.max(0, Math.min(radius, Math.min(halfX, halfY)))
}

/** Resolves a sector into the wedge test described on `ShapeDrawParams`.
 *
 *  A sector is an angular range, and testing one the obvious way costs an
 *  `atan` per pixel — a transcendental in a rasterizer whose output every
 *  participant has to agree on (see `.claude/rules.md`). It is also
 *  unnecessary: an angular range *is* an intersection of two half-planes at or
 *  below half a turn, and the complement of one above it, so the two normals
 *  can be worked out once, here, in JavaScript. */
export function sectorParams(startAngle: number, endAngle: number): {
  sectorMode: 0 | 1 | 2; sectorDirX: number; sectorDirY: number
  sectorCos: number; sectorSin: number
} {
  const TAU = Math.PI * 2
  const off = { sectorMode: 0 as const, sectorDirX: 1, sectorDirY: 0, sectorCos: 1, sectorSin: 0 }
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return off

  let sweep = ((endAngle - startAngle) % TAU + TAU) % TAU
  if (sweep === 0 || sweep >= TAU - 1e-9) return off

  const reflex = sweep > Math.PI
  // The reflex case is drawn as "not the opposite wedge": the same test, with
  // the bisector turned around, the aperture taken from the leftover sweep,
  // and the result negated in the shader.
  const mid = startAngle + sweep / 2 + (reflex ? Math.PI : 0)
  const halfAperture = (reflex ? TAU - sweep : sweep) / 2
  return {
    sectorMode: reflex ? 2 : 1,
    sectorDirX: Math.cos(mid),
    sectorDirY: Math.sin(mid),
    sectorCos: Math.cos(halfAperture),
    sectorSin: Math.sin(halfAperture),
  }
}
