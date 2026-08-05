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
 *  axis. Corner handles currently always call this with scaleX === scaleY
 *  (uniform-only for now — no Shift-to-constrain on tablets, see #120's
 *  follow-up issue on tablet-friendly modifier alternatives); edge handles
 *  use it with one axis fixed at 1 for single-axis stretch. */
export function scaleAxisMatrix(scaleX: number, scaleY: number, pivotX: number, pivotY: number): AffineMatrix {
  return [scaleX, 0, 0, scaleY, pivotX * (1 - scaleX), pivotY * (1 - scaleY)]
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
