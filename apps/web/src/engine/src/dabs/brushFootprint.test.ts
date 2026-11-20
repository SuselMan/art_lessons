import { describe, expect, it } from 'vitest'
import { brushFootprintBounds, brushFootprintCopyRect } from './brushFootprint'

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


describe('brushFootprintCopyRect', () => {
  it('converts top-down world bounds to matching bottom-up tile offsets', () => {
    expect(brushFootprintCopyRect(110, 220, 2, 1, 0, 100, 200, 64, 32)).toEqual({ x: 7, y: 9, width: 6, height: 6 })
    expect(brushFootprintCopyRect(100, 200, 2, 1, 0, 100, 200, 64, 32)).toEqual({ x: 0, y: 29, width: 3, height: 3 })
    expect(brushFootprintCopyRect(50, 50, 2, 1, 0, 100, 200, 64, 32)).toBeNull()
    expect(brushFootprintCopyRect(110, 220, 2, 1, 0, 100, 200, 0, 32)).toBeNull()
  })

  it('matches full-copy reads for overlapping, rotated, seam-crossing stamps despite stale pooled pixels', () => {
    const width = 64, height = 48, tileX = -64, tileY = 100
    const source = Float64Array.from({ length: width * height }, (_, i) => i + 1)
    const partial = new Float64Array(source.length).fill(-999)
    let copied = 0, reads = 0
    for (const [cx, cy, radius, aspect, angle] of [[-48.3, 112.8, 3, 1, 0], [-46, 114, 4, 2, .7], [-64, 123, 6, .5, -.8], [-1, 145, 5, 1, Math.PI / 4]]) {
      const rect = brushFootprintCopyRect(cx, cy, radius, aspect, angle, tileX, tileY, width, height)!
      for (let y = rect.y; y < rect.y + rect.height; y++)
        for (let x = rect.x; x < rect.x + rect.width; x++) partial[y * width + x] = source[y * width + x]
      copied += rect.width * rect.height
      const modified: number[] = []
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = tileX + x + .5 - cx, dy = tileY + height - y - .5 - cy
          const u = (dx * Math.cos(angle) + dy * Math.sin(angle)) / aspect
          const v = -dx * Math.sin(angle) + dy * Math.cos(angle)
          if (Math.abs(u) > radius || Math.abs(v) > radius) continue
          // All four possible LINEAR footprint texels must be fresh. Shader
          // actually samples exact centers; neighboring reads add a safety oracle.
          for (const sx of [x - 1, x, x + 1])
            for (const sy of [y - 1, y, y + 1])
              if (sx >= 0 && sx < width && sy >= 0 && sy < height) expect(partial[sy * width + sx]).toBe(source[sy * width + sx])
          modified.push(y * width + x)
          reads++
        }
      }
      for (const index of modified) source[index] += 10000 // next overlapping stamp sees the update
    }
    expect(reads).toBeGreaterThan(100)
    expect(copied).toBeLessThan(width * height)
  })
})
