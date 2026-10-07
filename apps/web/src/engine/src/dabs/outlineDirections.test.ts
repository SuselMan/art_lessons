import { describe, expect, it } from 'vitest'
import { outlinePoints, type NibGeometry } from './markerRibbon'

// Pre-optimization double-precision outline; cache admission compares every
// emitted coordinate including signed zero rather than a raster tolerance.
function reference(nib: NibGeometry, inset: number, segments: number) {
  const a = Math.max(nib.semiMajor - inset, 1e-3)
  const b = Math.max(nib.semiMinor - inset, 1e-3)
  const c = Math.cos(nib.angle), s = Math.sin(nib.angle)
  return Array.from({ length: segments }, (_, i) => {
    const phi = (i / segments) * Math.PI * 2
    let lx: number, ly: number
    if (nib.shape === 'roundedBox') {
      const r = Math.min(Math.max(nib.cornerRadius - inset, 0), a, b)
      const ux = Math.cos(phi), uy = Math.sin(phi)
      const m = Math.max(Math.abs(ux) / (a - r || 1e-3), Math.abs(uy) / (b - r || 1e-3))
      lx = ux / m + r * ux; ly = uy / m + r * uy
    } else {
      lx = a * Math.cos(phi); ly = b * Math.sin(phi)
    }
    return { x: lx * c - ly * s, y: lx * s + ly * c }
  })
}
function doubles(points: Array<{ x: number; y: number }>) {
  return Buffer.from(Float64Array.from(points.flatMap(p => [p.x, p.y])).buffer)
}

describe('ribbon outline direction reuse', () => {
  for (const shape of ['ellipse', 'roundedBox'] as const) for (const segments of [1, 4, 16, 32]) {
    it(`preserves all double bits ${shape}/${segments}`, () => {
      let seed = 517
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
      for (let i = 0; i < 100; i++) {
        const nib = { shape, semiMajor: random() * 800, semiMinor: random() * 400,
          cornerRadius: random() * 500, angle: (random() - .5) * Math.PI * 8 }
        const inset = random() * 300
        expect(doubles(outlinePoints(nib, inset, segments))).toEqual(doubles(reference(nib, inset, segments)))
      }
      for (const angle of [0, -0, Math.PI, -Math.PI]) {
        const nib = { shape, semiMajor: 0, semiMinor: 0, cornerRadius: 0, angle }
        expect(doubles(outlinePoints(nib, 0, segments))).toEqual(doubles(reference(nib, 0, segments)))
      }
    })
  }
})
