import { isAffineHomography, type HomographyMatrixTuple } from '@grafetto/shared'

// Gizmo-drag -> matrix math for the layer transform tool (#120). Kept as a
// separate, UI-local module rather than importing the engine's own matrix.ts,
// matching this codebase's existing precedent (see pointerTransform.ts's
// docstring on why it duplicates clientToCanvas instead of reaching into
// engine internals): this file is about turning a *gesture* into a matrix,
// which is a UI concern the engine has no reason to know about, while the
// engine's matrix.ts is about rendering one.
//
// (#392) Everything here works in 3x3 projective matrices, not the 2x3 affine
// tuples this module used to carry. That is the rule the protocol itself
// states (see LayerTransformMatrix and toHomography in packages/shared):
// widen once at the boundary, work in 3x3 everywhere, narrow again only when
// emitting. An affine map *is* a homography with its bottom row [0 0 1], so
// move/scale/rotate/skew lose nothing by being expressed this way — while
// Distort, which is genuinely projective, gets to be the same kind of thing
// as every other gesture instead of a second code path through the session,
// the preview, the bake and undo.
export type TransformMatrix = HomographyMatrixTuple

/** The gizmo's frame: the target layer(s)' painted content bounds, in canvas
 *  space for bounded rooms and world space for infinite ones (#143). Declared
 *  here rather than on the gizmo component because the gesture math needs it
 *  too — the Distort solver maps this rectangle onto a quad, and the
 *  "did that drag do anything?" test measures against its corners. */
export interface TransformBounds { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

export const IDENTITY_MATRIX: TransformMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export function translateMatrix(dx: number, dy: number): TransformMatrix {
  return [1, 0, 0, 0, 1, 0, dx, dy, 1]
}

/** Independent X/Y scale about a fixed pivot (the opposite corner/edge from
 *  whichever handle is being dragged) — p' = pivot + scale*(p - pivot) per
 *  axis. Corner handles call this with scaleX === scaleY while the tool's
 *  "keep proportions" toggle is on and with two independently measured
 *  factors when it is off (#391 — that toggle is the tablet-friendly
 *  replacement for Shift-to-constrain, #132); edge handles always call it
 *  with one axis fixed at 1, whatever that toggle says, because single-axis
 *  stretch is the entire job of an edge handle. */
export function scaleAxisMatrix(scaleX: number, scaleY: number, pivotX: number, pivotY: number): TransformMatrix {
  return [scaleX, 0, 0, 0, scaleY, 0, pivotX * (1 - scaleX), pivotY * (1 - scaleY), 1]
}

/** (#391) Shear about a fixed line per axis — what Rotate & Skew's edge
 *  handles produce. `shearX` slides points along X in proportion to their
 *  distance from the horizontal line y = fixedY, and `shearY` does the same
 *  along Y about the vertical line x = fixedX:
 *
 *      x' = x + shearX * (y - fixedY)
 *      y' = y + shearY * (x - fixedX)
 *
 *  The fixed line is the edge *opposite* the handle, the same anchor a scale
 *  drag uses (TRANSFORM_PIVOT in Room), so the far edge stays put and the
 *  grabbed one slides — which is what makes the gesture read as pushing the
 *  shape over rather than moving it.
 *
 *  Two axes in one signature to mirror scaleAxisMatrix, though an edge handle
 *  only ever drives one of them (dragging the top edge sideways is shearX with
 *  shearY = 0). Worth knowing if that ever changes: the determinant is
 *  1 - shearX*shearY, so a single-axis shear preserves area exactly and is
 *  always invertible, while shearing both axes hard enough would collapse the
 *  layer — a scale's own degenerate case has a clamp for the same reason. */
export function skewAxisMatrix(shearX: number, shearY: number, fixedX: number, fixedY: number): TransformMatrix {
  return [1, shearY, 0, shearX, 1, 0, -shearX * fixedY, -shearY * fixedX, 1]
}

/** Rotation about a fixed center — p' = R*(p - center) + center. */
export function rotateAboutMatrix(angleRad: number, centerX: number, centerY: number): TransformMatrix {
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad)
  return [
    cos, sin, 0,
    -sin, cos, 0,
    centerX - centerX * cos + centerY * sin,
    centerY - centerX * sin - centerY * cos,
    1,
  ]
}

// ── Distort (#392) ───────────────────────────────────────────────────────────

/** The frame's four corners, always in this order — top-left, top-right,
 *  bottom-right, bottom-left, i.e. going round the rectangle rather than
 *  reading it like a book. Everything that talks about "the corners" (the
 *  Distort solver's target quad, the gizmo's outline polygon, the
 *  did-anything-move test) shares this one order, because a quad solver fed
 *  two corners in the wrong order produces a bow-tie, not an error. */
export function frameCorners(b: TransformBounds): [Point, Point, Point, Point] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ]
}

/** The frame's corners with the one that `handle` names replaced by `p` — the
 *  four-point correspondence a Distort drag describes, since the other three
 *  corners are exactly where they were. Null for a handle that names no corner
 *  at all, so a caller that mismatched mode and handle finds out here instead
 *  of silently distorting whichever corner happened to be first. */
export function distortQuad(b: TransformBounds, handle: TransformHandleKind, p: Point): [Point, Point, Point, Point] | null {
  const corners = frameCorners(b)
  if (handle === 'tl') corners[0] = p
  else if (handle === 'tr') corners[1] = p
  else if (handle === 'br') corners[2] = p
  else if (handle === 'bl') corners[3] = p
  else return null
  return corners
}

/** (#392) The homography carrying `bounds` onto `quad` — the four corners in
 *  frameCorners order — or null when the four target points do not describe a
 *  usable quadrilateral (three of them collinear, or two collapsed onto each
 *  other). This is Distort: the caller replaces exactly one corner with wherever
 *  the pointer is and asks for the map that puts the layer there.
 *
 *  Solved as unit-square -> quad composed with rect -> unit-square, rather
 *  than by setting up the general 8x8 linear system for four point
 *  correspondences. The two are the same map; the reason to prefer this shape
 *  here is that our source is *always* an axis-aligned rectangle (the content
 *  bounds), so rect -> unit square is a two-number affine and the remaining
 *  half has Heckbert's closed form — no elimination, no pivoting, no
 *  conditioning question, and the degenerate case is one explicit determinant
 *  test instead of a rank check on an 8x8. An 8x8 solver would be strictly
 *  more code for strictly more ways to be subtly wrong at exactly the moment
 *  it matters (a nearly-degenerate quad, which is precisely what a user
 *  dragging a corner across the frame produces).
 *
 *  The parallelogram case is short-circuited on purpose rather than left to
 *  fall out of the general branch: it yields exact zeros in the projective
 *  row, which is what lets a Distort that happens to stay affine narrow back
 *  to six numbers on the wire (toWireMatrix) instead of writing nine because
 *  of float dust. */
export function solveQuadMatrix(bounds: TransformBounds, quad: [Point, Point, Point, Point]): TransformMatrix | null {
  if (!(bounds.width > 0) || !(bounds.height > 0)) return null
  const [p0, p1, p2, p3] = quad
  if (![p0, p1, p2, p3].every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return null

  const dx1 = p1.x - p2.x, dy1 = p1.y - p2.y
  const dx2 = p3.x - p2.x, dy2 = p3.y - p2.y
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy3 = p0.y - p1.y + p2.y - p3.y

  // x' = (a*u + b*v + c) / (g*u + h*v + 1), y' = (d*u + e*v + f) / (same),
  // over the unit square (0,0)->p0, (1,0)->p1, (1,1)->p2, (0,1)->p3.
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number
  if (dx3 === 0 && dy3 === 0) {
    // Opposite sides still parallel: the map is affine and g = h = 0 exactly.
    a = p1.x - p0.x; b = p2.x - p1.x; c = p0.x
    d = p1.y - p0.y; e = p2.y - p1.y; f = p0.y
    g = 0; h = 0
    // Zero area (the quad collapsed to a line or a point) has no inverse and
    // nothing sensible to preview — same "skip the gesture" answer as below.
    if (!isSignificant(a * e - b * d, Math.hypot(a, d) * Math.hypot(b, e))) return null
  } else {
    const den = dx1 * dy2 - dy1 * dx2
    // Relative, not absolute: `den` is an area in destination pixels, so a
    // fixed epsilon would mean something different for a 40px thumbnail and a
    // 4000px canvas. Zero here means three of the four corners are collinear.
    if (!isSignificant(den, Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2))) return null
    g = (dx3 * dy2 - dy3 * dx2) / den
    h = (dx1 * dy3 - dy1 * dx3) / den
    a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + h * p3.x; c = p0.x
    d = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + h * p3.y; f = p0.y
  }
  const unitToQuad: TransformMatrix = [a, d, g, b, e, h, c, f, 1]

  // rect -> unit square: u = (x - bx)/bw, v = (y - by)/bh. Affine, so it adds
  // nothing to the projective row and cannot flip the sign of w.
  const rectToUnit: TransformMatrix = [
    1 / bounds.width, 0, 0,
    0, 1 / bounds.height, 0,
    -bounds.x / bounds.width, -bounds.y / bounds.height, 1,
  ]
  const m = composeMatrix(unitToQuad, rectToUnit)

  // The solver checks its own answer, and this is not belt-and-braces: the
  // determinant tests above catch a quad that is *flat*, but not one that is
  // impossible. A homography is a bijection of the projective plane, so it
  // preserves non-collinearity — no homography can carry three corners of a
  // rectangle onto three points that lie on one line. Drag a corner across its
  // two neighbours' line and that is exactly what is being asked for; the
  // closed form still produces numbers, they just don't put the corners where
  // they were asked. Mapping them and looking is both the cheapest and the
  // most direct way to find out, and it covers every degenerate configuration
  // at once rather than one named test per shape.
  const scale = Math.max(
    Math.hypot(p2.x - p0.x, p2.y - p0.y), Math.hypot(p3.x - p1.x, p3.y - p1.y), 1,
  )
  const placed = frameCorners(bounds).map(src => applyMatrix(m, src.x, src.y))
  if (!placed.every((q, i) => Math.hypot(q.x - quad[i].x, q.y - quad[i].y) < 1e-6 * scale)) return null
  return m
}

/** Is `value` distinguishable from zero at the scale the quantities that
 *  produced it live on? Used for the solver's determinants, which are areas:
 *  `scale` is the product of the two edge lengths they came from. */
function isSignificant(value: number, scale: number): boolean {
  return Number.isFinite(value) && Math.abs(value) > 1e-9 * Math.max(scale, 1e-6)
}

/** (#392) Whether the whole frame still maps to points *in front of* the
 *  projection — w > 0 across `bounds`.
 *
 *  A homography's denominator w = g*x + h*y + i is zero along a line (the
 *  vanishing line) and negative beyond it, where points come back mirrored
 *  through the origin. Push a Distort corner far enough and that line crosses
 *  the layer: half the content would render as a reflected ghost. The shader
 *  discards w <= 0 fragments, so it renders as a hole rather than garbage, but
 *  a hole is not something to hand the user either — Room refuses the gesture
 *  instead and the frame simply stops following the pointer.
 *
 *  Four corners is an exhaustive test, not a sample: w is affine in (x, y), so
 *  over a rectangle its minimum is always at a vertex. Affine matrices give
 *  w = 1 everywhere and pass unconditionally, so nothing that existed before
 *  Distort can be refused by this. */
export function isFrameInFront(m: TransformMatrix, bounds: TransformBounds): boolean {
  const ws = frameCorners(bounds).map(p => m[2] * p.x + m[5] * p.y + m[8])
  if (!ws.every(Number.isFinite)) return false
  const largest = Math.max(...ws.map(Math.abs))
  return ws.every(w => w > 1e-6 * largest)
}

// ── Session composition (#399) ────────────────────────────────────────────────
// A transform *session* accumulates gestures instead of committing one
// layer_transform per drag (see #399 for why: the frame stopped following the
// content on release, the custom pivot reset every drag, and each drag paid
// its own resample of the layer's pixels). The three helpers below are what
// that accumulation needs and what the per-drag model never did.

/** `outer ∘ inner` — the matrix that applies `inner` first, then `outer`.
 *  Plain 3x3 matrix multiplication, which is all "accumulate a session" ever
 *  was; composing a projective gesture into the session needs no special case
 *  precisely because the session is a homography too (#392). */
export function composeMatrix(outer: TransformMatrix, inner: TransformMatrix): TransformMatrix {
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = outer
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8] = inner
  return [
    a0 * b0 + a3 * b1 + a6 * b2, a1 * b0 + a4 * b1 + a7 * b2, a2 * b0 + a5 * b1 + a8 * b2,
    a0 * b3 + a3 * b4 + a6 * b5, a1 * b3 + a4 * b4 + a7 * b5, a2 * b3 + a5 * b4 + a8 * b5,
    a0 * b6 + a3 * b7 + a6 * b8, a1 * b6 + a4 * b7 + a7 * b8, a2 * b6 + a5 * b7 + a8 * b8,
  ]
}

/** Inverse, or null if the matrix isn't invertible (a degenerate scale
 *  collapsed an axis, or a solved quad turned out flat). Callers treat null as
 *  "skip this gesture" rather than throwing: the scale handles clamp well away
 *  from zero, so a singular matrix here means something else is already wrong
 *  and dropping one pointermove is the mildest possible response.
 *
 *  Divides by the determinant instead of returning the bare adjugate, and that
 *  is load-bearing rather than tidiness: the two differ by a factor of det,
 *  which for det < 0 flips the sign of w everywhere — and the whole
 *  in-front-of-the-projection test (isFrameInFront, and the shader's own
 *  w <= 0 discard) reads that sign. An adjugate would have every pixel of a
 *  mirrored layer decide it was behind the camera. */
export function invertMatrix(m: TransformMatrix): TransformMatrix | null {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = m
  const c00 = m4 * m8 - m7 * m5
  const c10 = m7 * m2 - m1 * m8
  const c20 = m1 * m5 - m4 * m2
  const det = m0 * c00 + m3 * c10 + m6 * c20
  // Absolute rather than relative (unlike the solver's own tests): by the time
  // a matrix reaches here it is a full transform, and every one this app
  // builds keeps its scale within a couple of orders of magnitude of 1.
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  return [
    c00 / det, c10 / det, c20 / det,
    (m6 * m5 - m3 * m8) / det, (m0 * m8 - m6 * m2) / det, (m3 * m2 - m0 * m5) / det,
    (m3 * m7 - m6 * m4) / det, (m6 * m1 - m0 * m7) / det, (m0 * m4 - m3 * m1) / det,
  ]
}

/** Maps a point through a matrix, dividing through by w. For an affine matrix
 *  w is exactly 1 and this is the plain 2x3 multiply it always was; the divide
 *  is what makes a Distort a Distort. A point on the vanishing line (w = 0)
 *  comes back as Infinity — callers keep the frame away from that line with
 *  isFrameInFront rather than each guarding here. */
export function applyMatrix(m: TransformMatrix, x: number, y: number): Point {
  const w = m[2] * x + m[5] * y + m[8]
  return { x: (m[0] * x + m[3] * y + m[6]) / w, y: (m[1] * x + m[4] * y + m[7]) / w }
}

/** Whether a session ever actually moved anything. Committing an identity
 *  layer_transform would put a real entry on the undo stack for nothing —
 *  the same reason isNegligibleTransform exists for a single drag, applied to
 *  the accumulated result instead. The linear part is compared against a
 *  tighter epsilon than the translation because a rotation of 0.001 rad still
 *  visibly smears a large layer, while a 0.001 px shift cannot.
 *
 *  Any projective part at all disqualifies it (isAffineHomography's own
 *  1e-12), and that asymmetry is deliberate: composing affine matrices leaves
 *  the bottom row exactly [0 0 1] — exact zeros times anything are still exact
 *  zeros — so a non-zero g or h cannot be accumulated float dust. It can only
 *  come from a real Distort, and a real Distort that isn't baked leaves the
 *  preview and the layer disagreeing. */
export function isIdentityMatrix(m: TransformMatrix): boolean {
  if (!isAffineHomography(m)) return false
  return Math.abs(m[0] - 1) < 1e-4 && Math.abs(m[1]) < 1e-4
    && Math.abs(m[3]) < 1e-4 && Math.abs(m[4] - 1) < 1e-4
    && Math.abs(m[6]) < 0.5 && Math.abs(m[7]) < 0.5
}

// ── What a handle means (#391) ───────────────────────────────────────────────

/** Which gizmo handle a drag started on. Defined here rather than on the
 *  gizmo component because it is what the gesture math dispatches on — the
 *  component only reports which handle was grabbed, it has no opinion on what
 *  grabbing it does. */
export type TransformHandleKind =
  | 'body'
  | 'tl' | 'tr' | 'bl' | 'br'
  | 't' | 'b' | 'l' | 'r'
  | 'rotate-tl' | 'rotate-tr' | 'rotate-bl' | 'rotate-br'

/** Transform tool modes (#391, #392), stored as the tool's own `mode` setting
 *  (see toolSchemas). Each mode reinterprets exactly one family of handles and
 *  leaves the rest alone, so the gizmo grows no new handles and a mode switch
 *  never moves anything on screen:
 *
 *  - free        — corners scale, edges stretch one axis.
 *  - rotateSkew  — the four *edge* handles shear instead of stretching;
 *                  corners are untouched, exactly as Adobe's own Rotate & Skew.
 *  - distort     — the four *corner* handles each go wherever they are
 *                  dragged, independently (a homography, #392); edges and
 *                  rotate rings keep their Free-transform meaning.
 *
 *  Distort's edges are the deliberate mirror of Rotate & Skew's corners: a
 *  mode redefines one family and borrows the rest from Free, so there is
 *  always exactly one thing to learn about a mode. Giving Distort's edges some
 *  third meaning (a two-corner drag, say) would have been a second thing, and
 *  a stretch is not wrong there — it is just not what the mode is for. The
 *  rotate rings turn the frame in all three: rotation composes outside the
 *  session (#399) and is independent of whatever shape is inside it. */
export const TRANSFORM_MODES = ['free', 'rotateSkew', 'distort'] as const
export type TransformMode = (typeof TRANSFORM_MODES)[number]

/** What a drag actually does, once handle and mode are both known — the one
 *  place those two combine. Both the matrix a pointermove builds and the
 *  "was that just a click?" test below read this instead of re-deriving the
 *  meaning of an edge handle per mode. Note 'scale' covers every scale the
 *  handles can produce (uniform, single-axis, or two independent axes); what
 *  distinguishes those is which factors the caller measures, not what the
 *  gesture *is*. */
export type TransformGestureKind = 'move' | 'rotate' | 'scale' | 'skewX' | 'skewY' | 'distort'

export function transformGestureKind(handle: TransformHandleKind, mode: TransformMode): TransformGestureKind {
  if (handle === 'body') return 'move'
  if (handle.startsWith('rotate')) return 'rotate'
  const isCorner = handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br'
  if (mode === 'distort' && isCorner) return 'distort'
  if (mode === 'rotateSkew') {
    // The edge slides *along itself*: the top/bottom edges are horizontal, so
    // dragging one shears X; the left/right ones shear Y.
    if (handle === 't' || handle === 'b') return 'skewX'
    if (handle === 'l' || handle === 'r') return 'skewY'
  }
  return 'scale'
}

/** Whether a single drag ended essentially where it started (a click, or
 *  barely-moved pen jitter) and so should be dropped rather than folded into
 *  the session — the per-gesture counterpart of isIdentityMatrix's same
 *  question about the accumulated result.
 *
 *  Which part of the matrix answers it depends on what the gesture was, which
 *  is why this takes the kind rather than the handle: a shear leaves both
 *  scale terms at exactly 1, so the scale test — the one an edge handle used
 *  to get unconditionally — would have silently swallowed every skew ever
 *  made.
 *
 *  Distort is the one kind that cannot be read off the coefficients at all
 *  (#392): its projective terms are in units of 1/px, so the same g means "a
 *  hair" on a 4000px layer and "folded in half" on a 40px one. It gets the
 *  honest test instead — how far the matrix actually moves the frame's
 *  corners, in px — which is why every caller passes the frame. */
export function isNegligibleTransform(kind: TransformGestureKind, m: TransformMatrix, frame: TransformBounds): boolean {
  if (kind === 'move') return Math.hypot(m[6], m[7]) < 0.5
  if (kind === 'rotate') return Math.abs(Math.atan2(m[1], m[0])) < 0.001
  if (kind === 'skewX') return Math.abs(m[3]) < 0.001
  if (kind === 'skewY') return Math.abs(m[1]) < 0.001
  if (kind === 'distort') {
    return frameCorners(frame).every(p => {
      const q = applyMatrix(m, p.x, p.y)
      return Math.hypot(q.x - p.x, q.y - p.y) < 0.5
    })
  }
  // Both terms have to be still: a Free-transform corner drag scales the two
  // axes independently, so a purely vertical one leaves scaleX at 1 while
  // genuinely resizing the layer.
  return Math.abs(m[0] - 1) < 0.001 && Math.abs(m[4] - 1) < 0.001
}
