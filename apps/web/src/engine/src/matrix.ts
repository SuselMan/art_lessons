import { toHomography, type HomographyMatrixTuple, type LayerTransformMatrix } from '@grafetto/shared'

/** Every matrix the engine multiplies a point by: 3x3 projective,
 *  column-major, i.e. `[a, b, g, c, d, h, tx, ty, i]` meaning
 *
 *      x' = (a*x + c*y + tx) / (g*x + h*y + i)
 *      y' = (b*x + d*y + ty) / (g*x + h*y + i)
 *
 *  Deliberately the same tuple `@grafetto/shared` defines for the wire
 *  (HomographyMatrixTuple, see its own docstring) rather than a parallel local
 *  type — a matrix arriving in a layer_transform op needs no reshuffling to be
 *  used here, and `gl.uniformMatrix3fv` wants exactly this layout with
 *  transpose=false, which WebGL1 requires anyway.
 *
 *  (#392) This module was `affine.ts` and carried a 2x3 tuple until Distort
 *  arrived. It is one module in 3x3 rather than an affine one plus a
 *  projective one, because the transform bake would otherwise run through two
 *  parallel compose/invert/apply implementations and only the projective half
 *  would ever be exercised by a Distort — the exact arrangement where the
 *  rarely-used path rots. An affine map is a homography whose bottom row is
 *  [0 0 1]; the camera matrices below simply carry three constants they always
 *  had implicitly. */
export type Matrix3 = HomographyMatrixTuple

export const IDENTITY_MATRIX: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/** Matrix inverse — TRANSFORM_BLIT_FRAG samples backward (destination pixel
 *  -> source pixel), so every transform is inverted once before it reaches
 *  the shader. A degenerate (zero-scale) matrix has no inverse; callers are
 *  expected to keep scale away from zero (see the gizmo's own minimum-scale
 *  guard) — this falls back to identity rather than dividing by zero, so a
 *  corrupt op replays as a no-op instead of corrupting the buffer.
 *
 *  (#392) Divides through by the determinant rather than returning the bare
 *  adjugate, and that matters beyond scale: the two differ by a factor of det,
 *  whose sign flips w everywhere when det < 0 — and TRANSFORM_BLIT_FRAG reads
 *  that sign to decide which fragments are behind the projection and must be
 *  discarded. With an adjugate, a mirrored layer would come out entirely
 *  blank. */
export function invertMatrix(m: Matrix3): Matrix3 {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = m
  const c00 = m4 * m8 - m7 * m5
  const c10 = m7 * m2 - m1 * m8
  const c20 = m1 * m5 - m4 * m2
  const det = m0 * c00 + m3 * c10 + m6 * c20
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return IDENTITY_MATRIX
  return [
    c00 / det, c10 / det, c20 / det,
    (m6 * m5 - m3 * m8) / det, (m0 * m8 - m6 * m2) / det, (m3 * m2 - m0 * m5) / det,
    (m3 * m7 - m6 * m4) / det, (m6 * m1 - m0 * m7) / det, (m0 * m4 - m3 * m1) / det,
  ]
}

/** Applies the transform to a single point, dividing through by w. For an
 *  affine matrix w is exactly 1 and this is the plain multiply it always was.
 *  A point on the vanishing line (w = 0) comes back as Infinity — the gesture
 *  side keeps the frame off that line (see isFrameInFront in Room's
 *  transformMath), which is the only place a projective matrix is authored. */
export function applyMatrix(m: Matrix3, x: number, y: number): [number, number] {
  const w = m[2] * x + m[5] * y + m[8]
  return [(m[0] * x + m[3] * y + m[6]) / w, (m[1] * x + m[4] * y + m[7]) / w]
}

/** Composes two transforms: composeMatrix(A, B)(p) === A(B(p)) — B is
 *  applied first, then A. Used by the infinite-canvas tile-aware transform
 *  bake (#133) to fold a source/destination tile's world-space origin
 *  translation into the same matrix the shader already expects, without any
 *  shader change: TRANSFORM_BLIT_FRAG only ever sees one composed
 *  buffer-local-to-buffer-local matrix, same shape as the bounded-canvas
 *  case, it's just no longer always identity-translated.
 *
 *  (#392) Plain 3x3 multiplication now, and the tile-translation folding is
 *  unaffected: a translation has bottom row [0 0 1], so composing one onto
 *  either side of a homography leaves its projective row scaled but never
 *  mixed with the tile offsets — the same matrix, addressed from a different
 *  origin, which is precisely what that composition means. */
export function composeMatrix(a: Matrix3, b: Matrix3): Matrix3 {
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = a
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8] = b
  return [
    a0 * b0 + a3 * b1 + a6 * b2, a1 * b0 + a4 * b1 + a7 * b2, a2 * b0 + a5 * b1 + a8 * b2,
    a0 * b3 + a3 * b4 + a6 * b5, a1 * b3 + a4 * b4 + a7 * b5, a2 * b3 + a5 * b4 + a8 * b5,
    a0 * b6 + a3 * b7 + a6 * b8, a1 * b6 + a4 * b7 + a7 * b8, a2 * b6 + a5 * b7 + a8 * b8,
  ]
}

/** Pure translation. */
export function translationMatrix(tx: number, ty: number): Matrix3 {
  return [1, 0, 0, 0, 1, 0, tx, ty, 1]
}

/** Pure (non-uniform) scale about the origin, no rotation/translation. */
export function scaleMatrix(sx: number, sy: number): Matrix3 {
  return [sx, 0, 0, 0, sy, 0, 0, 0, 1]
}

/** Uniform scale + rotation about the origin, no translation — the linear
 *  part of the infinite-canvas camera transform (world -> screen). */
export function scaleRotateMatrix(scale: number, angle: number): Matrix3 {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return [scale * cos, scale * sin, 0, -scale * sin, scale * cos, 0, 0, 0, 1]
}

/** Column-major 3x3 for gl.uniformMatrix3fv — WebGL1 requires
 *  transpose=false, so the layout has to already be column-major going in,
 *  which Matrix3 is. Takes the wire union (#392) as well, so an operation's
 *  own matrix — six numbers for an ordinary affine drag, nine for a Distort —
 *  can go straight to a uniform: the widening is `toHomography`, the one
 *  boundary conversion the protocol asks consumers to make, and never a
 *  branch on the length at the call site. */
export function toMat3(m: LayerTransformMatrix): Float32Array {
  return new Float32Array(toHomography(m))
}
