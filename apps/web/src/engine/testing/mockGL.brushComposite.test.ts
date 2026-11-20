import { describe, expect, it } from 'vitest'
import { MockGL, type UniformValue } from './mockGL'

/** Geometry oracle uses the transformed quad's edge half-planes, separately
 * from the mock rasterizer's inverse transform and bounding-box iteration. */
describe('MockGL brush composite DAB_VERT geometry', () => {
  for (const angle of [0, Math.PI / 2, .37]) {
    it(`covers the complete oriented rectangular quad at angle ${angle}`, () => {
      const gl = new MockGL(), width = 48, height = 32
      const coverage = {}, original = {}, ceiling = {}
      const data = new Float32Array(width * height)
      const textureData = Reflect.get(gl, '_textureData') as Map<object, { width: number; height: number; data: Float32Array }>
      textureData.set(coverage, { width, height, data: new Float32Array(data.length).fill(1) })
      textureData.set(original, { width, height, data: new Float32Array(data.length) })
      textureData.set(ceiling, { width, height, data: new Float32Array(data.length).fill(1) })
      Reflect.set(gl, '_textureUnits', [original, coverage, ceiling])
      const quad = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, .5, .5, -.5, .5]), gl.STATIC_DRAW)
      const radius = 3, aspect = 5, cx = 24, cy = 16
      const uniforms = new Map<string, UniformValue>([
        ['u_dabCenter', [cx, cy]], ['u_dabRadius', radius], ['u_aspectRatio', aspect], ['u_angle', angle],
        ['u_strokeCoverage', 1], ['u_original', 0], ['u_ceiling', 2], ['u_opacity', 1],
      ])
      const raster = Reflect.get(gl, '_rasterBrushComposite') as (target: { width: number; height: number; data: Float32Array }, values: Map<string, UniformValue>) => void
      raster.call(gl, { width, height, data }, uniforms)
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
        x: cx + x * radius * aspect * Math.cos(angle) - y * radius * Math.sin(angle),
        y: cy + x * radius * aspect * Math.sin(angle) + y * radius * Math.cos(angle),
      }))
      let painted = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const inside = corners.every((a, i) => {
            const b = corners[(i + 1) % corners.length]
            return (b.x - a.x) * (y + .5 - a.y) - (b.y - a.y) * (x + .5 - a.x) >= -1e-9
          })
          expect(data[y * width + x], `pixel ${x},${y}`).toBe(inside ? 1 : 0)
          if (inside) painted++
        }
      }
      expect(painted).toBeGreaterThan(150)
      if (angle === 0) {
        expect(data[16 * width + 10]).toBe(1) // outside the former square approximation
        expect(data[10 * width + 24]).toBe(0) // outside the actual short side
      }
    })
  }
})
