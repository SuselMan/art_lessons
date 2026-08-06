// Gizmo-drag -> affine-matrix math for the layer transform tool (#120).
// Same tuple convention as the engine's own AffineMatrix (see
// engine/src/affine.ts) and LayerTransformOperation.matrix in
// packages/shared — kept as a separate, UI-local module rather than
// importing the engine's copy, matching this codebase's existing precedent
// (see pointerTransform.ts's docstring on why it duplicates clientToCanvas
// instead of reaching into engine internals): this file is about turning a
// *gesture* into a matrix, which is a UI concern the engine has no reason to
// know about, while the engine's affine.ts is about rendering one.
export type AffineMatrix = [number, number, number, number, number, number]

export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0]

export function translateMatrix(dx: number, dy: number): AffineMatrix {
  return [1, 0, 0, 1, dx, dy]
}

/** Independent X/Y scale about a fixed pivot (the opposite corner/edge from
 *  whichever handle is being dragged) — p' = pivot + scale*(p - pivot) per
 *  axis. Corner handles call this with scaleX === scaleY while the tool's
 *  "keep proportions" toggle is on and with two independently measured
 *  factors when it is off (#391 — that toggle is the tablet-friendly
 *  replacement for Shift-to-constrain, #132); edge handles always call it
 *  with one axis fixed at 1, whatever that toggle says, because single-axis
 *  stretch is the entire job of an edge handle. */
export function scaleAxisMatrix(scaleX: number, scaleY: number, pivotX: number, pivotY: number): AffineMatrix {
  return [scaleX, 0, 0, scaleY, pivotX * (1 - scaleX), pivotY * (1 - scaleY)]
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
export function skewAxisMatrix(shearX: number, shearY: number, fixedX: number, fixedY: number): AffineMatrix {
  return [1, shearY, shearX, 1, -shearX * fixedY, -shearY * fixedX]
}

/** Rotation about a fixed center — p' = R*(p - center) + center. */
export function rotateAboutMatrix(angleRad: number, centerX: number, centerY: number): AffineMatrix {
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad)
  return [
    cos, sin, -sin, cos,
    centerX - centerX * cos + centerY * sin,
    centerY - centerX * sin - centerY * cos,
  ]
}

// ── Session composition (#399) ────────────────────────────────────────────────
// A transform *session* accumulates gestures instead of committing one
// layer_transform per drag (see #399 for why: the frame stopped following the
// content on release, the custom pivot reset every drag, and each drag paid
// its own resample of the layer's pixels). The three helpers below are what
// that accumulation needs and what the per-drag model never did.

/** `outer ∘ inner` — the matrix that applies `inner` first, then `outer`.
 *  Same convention as SVG's own `matrix()` and DOMMatrix.multiply, which is
 *  what lets the accumulated session matrix be handed straight to
 *  TransformGizmo's `<g transform>` and to previewLayerTransform alike. */
export function composeMatrix(outer: AffineMatrix, inner: AffineMatrix): AffineMatrix {
  const [a, b, c, d, e, f] = outer
  const [A, B, C, D, E, F] = inner
  return [
    a * A + c * B,
    b * A + d * B,
    a * C + c * D,
    b * C + d * D,
    a * E + c * F + e,
    b * E + d * F + f,
  ]
}

/** Inverse of an affine matrix, or null if it isn't invertible (a degenerate
 *  scale collapsed an axis). Callers treat null as "skip this gesture" rather
 *  than throwing: the scale handles clamp well away from zero, so a singular
 *  matrix here means something else is already wrong and dropping one
 *  pointermove is the mildest possible response. */
export function invertMatrix(m: AffineMatrix): AffineMatrix | null {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ]
}

/** Maps a point through an affine matrix. */
export function applyMatrix(m: AffineMatrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

/** Whether a session ever actually moved anything. Committing an identity
 *  layer_transform would put a real entry on the undo stack for nothing —
 *  the same reason isNegligibleTransform exists for a single drag, applied to
 *  the accumulated result instead. The linear part is compared against a
 *  tighter epsilon than the translation because a rotation of 0.001 rad still
 *  visibly smears a large layer, while a 0.001 px shift cannot. */
export function isIdentityMatrix(m: AffineMatrix): boolean {
  const [a, b, c, d, e, f] = m
  return Math.abs(a - 1) < 1e-4 && Math.abs(b) < 1e-4
    && Math.abs(c) < 1e-4 && Math.abs(d - 1) < 1e-4
    && Math.abs(e) < 0.5 && Math.abs(f) < 0.5
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

/** Transform tool modes (#391), stored as the tool's own `mode` setting (see
 *  toolSchemas). A mode reinterprets the four *edge* handles and nothing else:
 *  corners scale and the rotate rings turn in both, exactly as Adobe's own
 *  Rotate & Skew does — so the gizmo grows no new handles, and a mode switch
 *  never moves anything on screen.
 *
 *  There is deliberately no third entry for Distort (#392): a distort is a
 *  homography, not an affine map, so it cannot be an AffineMatrix or ride the
 *  existing layer_transform operation at all. It needs its own protocol, not
 *  a third option here. */
export const TRANSFORM_MODES = ['free', 'rotateSkew'] as const
export type TransformMode = (typeof TRANSFORM_MODES)[number]

/** What a drag actually does, once handle and mode are both known — the one
 *  place those two combine. Both the matrix a pointermove builds and the
 *  "was that just a click?" test below read this instead of re-deriving the
 *  meaning of an edge handle per mode. Note 'scale' covers every scale the
 *  handles can produce (uniform, single-axis, or two independent axes); what
 *  distinguishes those is which factors the caller measures, not what the
 *  gesture *is*. */
export type TransformGestureKind = 'move' | 'rotate' | 'scale' | 'skewX' | 'skewY'

export function transformGestureKind(handle: TransformHandleKind, mode: TransformMode): TransformGestureKind {
  if (handle === 'body') return 'move'
  if (handle.startsWith('rotate')) return 'rotate'
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
 *  made. */
export function isNegligibleTransform(kind: TransformGestureKind, m: AffineMatrix): boolean {
  if (kind === 'move') return Math.hypot(m[4], m[5]) < 0.5
  if (kind === 'rotate') return Math.abs(Math.atan2(m[1], m[0])) < 0.001
  if (kind === 'skewX') return Math.abs(m[2]) < 0.001
  if (kind === 'skewY') return Math.abs(m[1]) < 0.001
  // Both terms have to be still: a Free-transform corner drag scales the two
  // axes independently, so a purely vertical one leaves scaleX at 1 while
  // genuinely resizing the layer.
  return Math.abs(m[0] - 1) < 0.001 && Math.abs(m[3] - 1) < 0.001
}
