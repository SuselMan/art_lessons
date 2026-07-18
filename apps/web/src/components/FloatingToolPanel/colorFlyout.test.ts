import { describe, expect, it } from 'vitest'

import { computeRayAngles, computeRayCount, maxRingsForRay, assignRingsRoundRobin, layoutFlyoutItems } from './colorFlyout'

describe('computeRayCount', () => {
  it('grows with baseRadius (bigger ring-1 circumference fits more rays)', () => {
    expect(computeRayCount(200, 46)).toBeGreaterThan(computeRayCount(50, 46))
  })

  it('never drops below the minimum even for a tiny radius', () => {
    expect(computeRayCount(1, 46)).toBeGreaterThanOrEqual(4)
  })
})

describe('computeRayAngles', () => {
  it('starts straight up and spaces rays evenly around the full circle', () => {
    const angles = computeRayAngles(4)
    expect(angles).toEqual([90, 0, -90, -180])
  })
})

describe('maxRingsForRay', () => {
  const config = { baseRadius: 40, ringSpacing: 46, swatchRadius: 20 }
  const container = { width: 500, height: 500 }

  it('stacks many rings along a ray pointing into open space', () => {
    const panelCenter = { x: 250, y: 250 }
    expect(maxRingsForRay(90, panelCenter, container, config)).toBeGreaterThan(3)
  })

  it('stops quickly along a ray pointing toward a nearby edge (only ring 1 fits)', () => {
    const panelCenter = { x: 250, y: 65 } // close enough to the top edge that ring 2 already crosses it
    expect(maxRingsForRay(90, panelCenter, container, config)).toBe(1)
  })

  it('returns 0 when even the first ring would cross the bounds', () => {
    const panelCenter = { x: 250, y: 5 }
    expect(maxRingsForRay(90, panelCenter, container, config)).toBe(0)
  })
})

describe('assignRingsRoundRobin', () => {
  it('fills ring 1 across every ray before any ray gets ring 2', () => {
    const slots = assignRingsRoundRobin(5, 3, [3, 3, 3])
    expect(slots).toEqual([
      { ray: 0, ring: 1 }, { ray: 1, ring: 1 }, { ray: 2, ring: 1 },
      { ray: 0, ring: 2 }, { ray: 1, ring: 2 },
    ])
  })

  it('skips a ray once it runs out of rings, without stalling the others', () => {
    const slots = assignRingsRoundRobin(4, 2, [1, 3])
    expect(slots).toEqual([
      { ray: 0, ring: 1 }, { ray: 1, ring: 1 },
      { ray: 1, ring: 2 }, { ray: 1, ring: 3 },
    ])
  })

  it('stops early (fewer slots than requested) once every ray is exhausted', () => {
    const slots = assignRingsRoundRobin(10, 2, [1, 1])
    expect(slots).toHaveLength(2)
  })
})

describe('layoutFlyoutItems', () => {
  const config = { baseRadius: 40, ringSpacing: 46, raySpacing: 46, swatchRadius: 20 }

  it('returns nothing for zero items', () => {
    expect(layoutFlyoutItems(0, { x: 250, y: 250 }, { width: 500, height: 500 }, config)).toEqual([])
  })

  it('places every item within the container bounds even hard against a corner', () => {
    const panelCenter = { x: 20, y: 20 }
    const container = { width: 500, height: 500 }
    const positions = layoutFlyoutItems(12, panelCenter, container, config)
    for (const { x, y } of positions) {
      const cx = panelCenter.x + x, cy = panelCenter.y + y
      expect(cx - config.swatchRadius).toBeGreaterThanOrEqual(-0.001)
      expect(cy - config.swatchRadius).toBeGreaterThanOrEqual(-0.001)
      expect(cx + config.swatchRadius).toBeLessThanOrEqual(container.width + 0.001)
      expect(cy + config.swatchRadius).toBeLessThanOrEqual(container.height + 0.001)
    }
  })

  it('places the first item straight up at baseRadius when centered in a big container', () => {
    const [pos] = layoutFlyoutItems(1, { x: 250, y: 250 }, { width: 500, height: 500 }, config)
    expect(pos.x).toBeCloseTo(0)
    expect(pos.y).toBeCloseTo(-config.baseRadius)
  })
})
