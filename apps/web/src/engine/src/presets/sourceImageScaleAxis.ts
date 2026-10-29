/** Scalar fixed-point resize tables, independently expressed from the Qt 5.15.7
 * source arithmetic. These tables alone do not implement Qt's pixel kernels.
 * Bounds avoid the native signed-int overflow domain and bound allocation. */
export function sourceImageScaleAxis(sourceSize: number, signedTargetSize: number): {
  readonly up: boolean; readonly positions: readonly number[]; readonly weights: readonly number[]
} {
  const target = Math.abs(signedTargetSize)
  if (!Number.isInteger(sourceSize) || sourceSize < 1 || sourceSize > 65535
    || !Number.isInteger(signedTargetSize) || target < 1 || target > 524280) throw new RangeError('Invalid resize axis')
  const up = target >= sourceSize, increment = Math.floor(sourceSize * 65536 / target)
  const positions: number[] = [], weights: number[] = []
  let value = up ? Math.floor(32768 * sourceSize / target) - 32768 : 0
  const coverage = Math.floor((target * 16384 + sourceSize - 1) / sourceSize)
  for (let i = 0; i < target; i++) {
    const position = Math.floor(value / 65536)
    positions.push(Math.max(0, position))
    if (up) {
      const fraction = Math.floor(value / 256)
      weights.push(position < 0 || position >= sourceSize - 1 ? 0 : fraction - Math.floor(fraction / 256) * 256)
    } else {
      const fraction = value - Math.floor(value / 65536) * 65536
      weights.push(Math.floor((65536 - fraction) * coverage / 65536) + coverage * 65536)
    }
    value += increment
  }
  if (signedTargetSize < 0) { positions.reverse(); weights.reverse() }
  return Object.freeze({ up, positions: Object.freeze(positions), weights: Object.freeze(weights) })
}
