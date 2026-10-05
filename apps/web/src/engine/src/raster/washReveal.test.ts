import { describe, expect, it } from 'vitest'
import { washRevealHold } from './washReveal'

describe('wet-to-dry presentation clock', () => {
  it('holds the wet image throughout a calculation longer than the transition', () => {
    expect(washRevealHold(null, 16_814, 1500)).toBe(1)
    expect(washRevealHold(16_814, 16_814, 1500)).toBe(1)
    expect(washRevealHold(16_814, 17_564, 1500)).toBe(.25)
    expect(washRevealHold(16_814, 18_314, 1500)).toBe(0)
  })

  it('clamps elapsed time at both ends', () => {
    expect(washRevealHold(100, 50, 1500)).toBe(1)
    expect(washRevealHold(100, 50_000, 1500)).toBe(0)
  })
})
