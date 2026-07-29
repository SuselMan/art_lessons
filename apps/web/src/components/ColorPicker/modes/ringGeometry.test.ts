import { describe, expect, it } from 'vitest'

import { hueFromPoint, inscribedSquareSide, isInRing, pointForHue } from './ringGeometry'

const center = { x: 100, y: 100 }

describe('hueFromPoint', () => {
  it('puts red at 12 o clock and runs clockwise, like conic-gradient', () => {
    expect(hueFromPoint(center, { x: 100, y: 0 })).toBeCloseTo(0)    // up
    expect(hueFromPoint(center, { x: 200, y: 100 })).toBeCloseTo(90)  // right
    expect(hueFromPoint(center, { x: 100, y: 200 })).toBeCloseTo(180) // down
    expect(hueFromPoint(center, { x: 0, y: 100 })).toBeCloseTo(270)   // left
  })

  it('stays in [0, 360) rather than going negative just left of red', () => {
    const h = hueFromPoint(center, { x: 99, y: 0 })
    expect(h).toBeGreaterThan(350)
    expect(h).toBeLessThan(360)
  })

  it('ignores distance, so a drag that leaves the band still steers', () => {
    expect(hueFromPoint(center, { x: 100, y: 99 })).toBeCloseTo(0)
    expect(hueFromPoint(center, { x: 100, y: -900 })).toBeCloseTo(0)
  })
})

describe('pointForHue', () => {
  it('is the inverse of hueFromPoint', () => {
    for (const hue of [0, 37, 90, 180, 275, 359]) {
      const p = pointForHue(center, 80, hue)
      expect(hueFromPoint(center, p)).toBeCloseTo(hue)
    }
  })

  it('places the thumb on the circle of the radius it was given', () => {
    const p = pointForHue(center, 80, 123)
    expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(80)
  })
})

describe('inscribedSquareSide', () => {
  it('is radius times root two — corners on the circle', () => {
    expect(inscribedSquareSide(100)).toBeCloseTo(141.42, 2)
    const half = inscribedSquareSide(100) / 2
    expect(Math.hypot(half, half)).toBeCloseTo(100)
  })
})

describe('isInRing', () => {
  it('accepts the band and rejects the hole and the outside', () => {
    expect(isInRing(center, { x: 190, y: 100 }, 80, 100)).toBe(true)
    expect(isInRing(center, { x: 140, y: 100 }, 80, 100)).toBe(false) // hole
    expect(isInRing(center, { x: 220, y: 100 }, 80, 100)).toBe(false) // outside
  })

  it('counts both edges as inside, so a pointer on the rim is not dead', () => {
    expect(isInRing(center, { x: 180, y: 100 }, 80, 100)).toBe(true)
    expect(isInRing(center, { x: 200, y: 100 }, 80, 100)).toBe(true)
  })
})
