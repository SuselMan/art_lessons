import { describe, expect, it } from 'vitest'
import { WC_BRUSH_DRAG_FRAG } from '../raster/shaders'
import { WC_BRUSH_DRAG_EARLY_ZERO_FRAG } from './brushDragEarlyZero'

// Finite-domain oracle for the exact factors being skipped, not a substitute
// for paired GLSL P/C pixel gates and an Adreno cold compile.
function raw(donor: number, neighbour: number, velocity: number, gain: number, dose: number, contact: number) {
  const mix = 0.02 * Math.max(donor - neighbour, 0) / Math.max(donor, 5e-5)
  const clock = -Math.log(Math.max(1 - Math.max(0, Math.min(1, dose)), 1 / 255))
  return (0.3535533905932738 * gain * Math.abs(velocity) * clock + mix * dose) * contact
}

describe('brush contact early-zero finite proof', () => {
  it('changes only cached flow and early-zero checks; all nonzero arithmetic stays identical', () => {
    const restored = WC_BRUSH_DRAG_EARLY_ZERO_FRAG
      .replace('    vec3 targetFlow = flowAt(to);\n    float doseB = min(flow.b, targetFlow.b);\n    if (doseB <= 0.0) return 0.0;\n', '')
      .replace('    if (contact <= 0.0) return 0.0;\n', '')
      .replace('    float contactClock =', '    float doseB = min(flow.b, flowAt(to).b);\n    float contactClock =')
      .replace('(targetFlow.rg * 2.0 - 1.0)', '(flowAt(to).rg * 2.0 - 1.0)')
    expect(restored).toBe(WC_BRUSH_DRAG_FRAG)
  })
  it('zero dose and zero contact are exact zero even with maximum concentration gradients', () => {
    for (const donor of [0, 1 / 255, 0.5, 1]) for (const neighbour of [0, 1 / 255, 1])
      for (const velocity of [-1, -1 / 255, 0, 1 / 255, 1]) for (const gain of [0, 0.2, 3]) {
        expect(raw(donor, neighbour, velocity, gain, 0, 1)).toBe(0)
        for (let byte = 0; byte < 256; byte++) {
          expect(raw(donor, neighbour, velocity, gain, byte / 255, 0)).toBe(0)
        }
      }
  })
  it('retains diffusion with zero velocity and nonzero wet exposure', () => {
    expect(raw(1, 0, 0, 1, 0.5, 1)).toBeGreaterThan(0)
    expect(raw(0, 1, 1, 1, 0.5, 1)).toBeGreaterThan(0)
    expect(raw(1, 0, 1, 1, 1, 1)).toBeGreaterThan(0)
  })
})
