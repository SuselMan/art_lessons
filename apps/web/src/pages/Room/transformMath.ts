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
