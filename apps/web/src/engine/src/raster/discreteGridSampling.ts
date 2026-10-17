import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'

/** M70 S1 only. External paper/noise textures deliberately keep their filters. */
export function withDiscreteGrid<T>(out: AccumulationBuffer, inputs: readonly AccumulationBuffer[], draw: () => T, scale = 1, dir?: readonly number[]): T {
  const unique = [...new Set(inputs)]
  if (scale !== 1 || (dir && dir.some(v => !Number.isInteger(v)))) throw new Error('M70 discrete grid requires S1 and integer offsets')
  for (const input of unique) {
    if (input === out || input.width !== out.width || input.height !== out.height) throw new Error('M70 discrete grid input/output mismatch')
  }
  const visit = (index: number): T => {
    if (index === unique.length) return draw()
    const input = unique[index], previous = input.pointSampling
    try {
      input.setPointSampling(true)
      return visit(index + 1)
    } finally {
      // Avoid hydration of an unchanged sampler, including a failed initial hydration.
      if (input.pointSampling !== previous) input.setPointSampling(previous)
    }
  }
  return visit(0)
}
