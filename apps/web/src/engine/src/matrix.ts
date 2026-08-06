// 2x3 affine matrix [a, b, c, d, tx, ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty
// Same tuple shape as LayerTransformOperation.transforms[].matrix (#120) —
// engine and shared package intentionally share the flat-array convention
// rather than each wrapping it in its own object type.
export type AffineMatrix = [number, number, number, number, number, number]

export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0]

/** Matrix inverse — TRANSFORM_BLIT_FRAG samples backward (destination pixel
 *  -> source pixel), so every transform is inverted once before it reaches
 *  the shader. A degenerate (zero-scale) matrix has no inverse; callers are
 *  expected to keep scale away from zero (see the gizmo's own minimum-scale
 *  guard) — this falls back to identity rather than dividing by zero, so a
 *  corrupt op replays as a no-op instead of corrupting the buffer. */
export function invertAffine([a, b, c, d, tx, ty]: AffineMatrix): AffineMatrix {
  const det = a * d - b * c
  if (Math.abs(det) < 1e-9) return IDENTITY_MATRIX
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det
  return [ia, ib, ic, id, -(ia * tx + ic * ty), -(ib * tx + id * ty)]
}

/** Applies the affine transform to a single point. */
export function applyAffine([a, b, c, d, tx, ty]: AffineMatrix, x: number, y: number): [number, number] {
  return [a * x + c * y + tx, b * x + d * y + ty]
}

/** Composes two affine transforms: composeAffine(A, B)(p) === A(B(p)) — B is
 *  applied first, then A. Used by the infinite-canvas tile-aware transform
 *  bake (#133) to fold a source/destination tile's world-space origin
 *  translation into the same matrix the shader already expects, without any
 *  shader change: TRANSFORM_BLIT_FRAG only ever sees one composed
 *  buffer-local-to-buffer-local matrix, same shape as the bounded-canvas
 *  case, it's just no longer always identity-translated. */
export function composeAffine(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  const [aA, bA, cA, dA, txA, tyA] = a
  const [aB, bB, cB, dB, txB, tyB] = b
  return [
    aA * aB + cA * bB, bA * aB + dA * bB,
    aA * cB + cA * dB, bA * cB + dA * dB,
    aA * txB + cA * tyB + txA, bA * txB + dA * tyB + tyA,
  ]
}

/** Pure translation as an affine matrix. */
export function translationMatrix(tx: number, ty: number): AffineMatrix {
  return [1, 0, 0, 1, tx, ty]
}

/** Pure (non-uniform) scale about the origin, no rotation/translation. */
export function scaleMatrix(sx: number, sy: number): AffineMatrix {
  return [sx, 0, 0, sy, 0, 0]
}

/** Uniform scale + rotation about the origin, no translation — the linear
 *  part of the infinite-canvas camera transform (world -> screen). */
export function scaleRotateMatrix(scale: number, angle: number): AffineMatrix {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return [scale * cos, scale * sin, -scale * sin, scale * cos, 0, 0]
}

/** Column-major 3x3, embedding the 2x3 affine as a homogeneous transform
 *  ([a c tx; b d ty; 0 0 1] in row-major math notation) for
 *  gl.uniformMatrix3fv — WebGL1 requires transpose=false, so the layout has
 *  to already be column-major going in. */
export function toMat3([a, b, c, d, tx, ty]: AffineMatrix): Float32Array {
  return new Float32Array([a, b, 0, c, d, 0, tx, ty, 1])
}
