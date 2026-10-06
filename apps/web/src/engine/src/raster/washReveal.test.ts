import { describe, expect, it } from 'vitest'
import { washRevealHold, washRevealStep } from './washReveal'

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

describe('continuous intermediate presentation', () => {
  it('limits the first step after a delayed solver target or paused frame', () => {
    expect(washRevealStep(1500, null)).toBe(washRevealStep(40, null))
    expect(washRevealStep(1500, null)).toBeLessThan(.03)
    expect(washRevealStep(-20, null)).toBe(0)
  })
  it('follows a fixed target independently of frame subdivision', () => {
    const a = washRevealStep(16, null), b = washRevealStep(32, null)
    expect(1 - (1 - a) ** 2).toBeCloseTo(b, 12)
  })
  it('reaches the final target exactly without restarting the visible image', () => {
    expect(washRevealStep(16, 0)).toBe(1)
    expect(washRevealStep(16, 2000)).toBeLessThan(.03)
    expect(washRevealStep(16, 10)).toBe(1)
  })
})
