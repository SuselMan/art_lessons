import { describe, expect, it } from 'vitest'
import { brushFootprintBounds } from './brushFootprint'

describe('brushFootprintBounds', () => {
  it('covers square corners at 45 degrees beyond one radius', () => {
    const b = brushFootprintBounds(100, 200, 10, 1, Math.PI / 4)!
    expect(b.minX).toBeCloseTo(100 - Math.SQRT2 * 10)
    expect(b.maxY).toBeCloseTo(200 + Math.SQRT2 * 10)
    // A center 12 px from a tile seam still touches its neighboring tile.
    expect(brushFootprintBounds(1012, 500, 10, 1, Math.PI / 4)!.maxX).toBeGreaterThan(1024)
  })

  it('rotates a noncircular footprint and adds world-space padding afterwards', () => {
    expect(brushFootprintBounds(5, -7, 2, 3, 0, 1)).toEqual({ minX: -2, minY: -10, maxX: 12, maxY: -4 })
    const b = brushFootprintBounds(5, -7, 2, 3, Math.PI / 2, 1)!
    expect(b.minX).toBeCloseTo(2)
    expect(b.maxY).toBeCloseTo(0)
    expect(b.maxX).toBeCloseTo(8)
    expect(b.minY).toBeCloseTo(-14)
  })

  it('contains every transformed quad corner and ellipse point over rotations and aspect ratios', () => {
    for (const aspect of [0.05, 0.5, 1, 3, 20]) {
      for (const angle of [-Math.PI, -1.2, 0, 0.4, Math.PI / 4, Math.PI / 2, Math.PI]) {
        const x = -1010.25, y = 1020.75, radius = 17
        const b = brushFootprintBounds(x, y, radius, aspect, angle)!
        const contains = (localX: number, localY: number): void => {
          const px = x + localX * Math.cos(angle) - localY * Math.sin(angle)
          const py = y + localX * Math.sin(angle) + localY * Math.cos(angle)
          expect(px).toBeGreaterThanOrEqual(b.minX - 1e-10)
          expect(px).toBeLessThanOrEqual(b.maxX + 1e-10)
          expect(py).toBeGreaterThanOrEqual(b.minY - 1e-10)
          expect(py).toBeLessThanOrEqual(b.maxY + 1e-10)
        }
        for (const sx of [-1, 1])
          for (const sy of [-1, 1]) contains(sx * radius * aspect, sy * radius)
        for (let i = 0; i < 32; i++)
          contains(Math.cos(i * Math.PI / 16) * radius * aspect, Math.sin(i * Math.PI / 16) * radius)
      }
    }
  })

  it('rejects empty, nonfinite and overflowing geometry', () => {
    expect(brushFootprintBounds(0, 0, 0, 1, 0)).toBeNull()
    expect(brushFootprintBounds(0, 0, -1, 1, 0)).toBeNull()
    expect(brushFootprintBounds(0, 0, 1, 0, 0)).toBeNull()
    expect(brushFootprintBounds(0, 0, 1, -1, 0)).toBeNull()
    expect(brushFootprintBounds(0, 0, 1, 1, 0, -1)).toBeNull()
    for (let i = 0; i < 6; i++) {
      for (const value of [NaN, Infinity, -Infinity]) {
        const args: [number, number, number, number, number, number] = [0, 0, 1, 1, 0, 0]
        args[i] = value
        expect(brushFootprintBounds(...args)).toBeNull()
      }
    }
    expect(brushFootprintBounds(0, 0, Number.MAX_VALUE, 20, 0)).toBeNull()
    expect(brushFootprintBounds(Number.MAX_VALUE, 0, Number.MAX_VALUE, 1, 0)).toBeNull()
  })
})
