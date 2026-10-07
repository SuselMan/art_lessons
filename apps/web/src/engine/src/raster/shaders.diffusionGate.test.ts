import { describe, expect, it } from 'vitest'
import { WC_DIFFUSE_FRAG } from './shaders'

// Evaluate the actual emitted gate expression, not a second implementation.
// 8f's max-density denominator fails this suspension-domain invariant.
function emittedGate(wi: number, wj: number, density: number): number {
  const expression = WC_DIFFUSE_FRAG.match(/float gate = ([^;]+);/)?.[1]
  if (!expression) throw new Error('diffusion gate not found')
  const evaluate = new Function('min', 'wi', 'wj', 'density', `return ${expression}`)
  return evaluate(Math.min, wi, wj, density) as number
}

describe('diffusion suspension domain (#728 ring regression)', () => {
  it('does not close a wet face when pigment or absorption amplitude changes', () => {
    for (const [wi, wj] of [[1, 1], [0.1, 1], [1, 0.25]]) {
      const reference = emittedGate(wi, wj, 0)
      for (const density of [0.1, 0.5, 1, 4, 1000]) {
        expect(emittedGate(wi, wj, density)).toBe(reference)
      }
    }
  })

  it('keeps dry faces closed and opposite directions identical', () => {
    for (const density of [0, 1, 1000]) {
      expect(emittedGate(0, 1, density)).toBe(0)
      expect(emittedGate(1, 0, density)).toBe(0)
      expect(emittedGate(0.25, 0.75, density)).toBe(emittedGate(0.75, 0.25, density))
    }
  })
})
