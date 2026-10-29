import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceGaussianWholePath/whole.native.json'
import { sourceAutoGeometry } from './sourceAutoGeometry'
import { sourceFmaF64 } from './sourceFmaF64'
import { gaussianSampleCount, gaussianTransparency } from '../raster/gaussianTip'

/** Sampled independent original-ISA oracle; this does not qualify AS-erf for
 * arbitrary binary64 inputs, nor select the installed GUI's vector factory. */
describe('Gaussian stock whole-path source evidence', () => {
  it('matches all104 original allocation/MP/scale/coefficient paths', () => {
    expect(native.cases).toHaveLength(104)
    expect(new Set(native.cases.map(row => row.index)).size).toBe(13)
    for (const row of native.cases) {
      const diameter = Number(row.generator.diameter), ratio = Number(row.generator.ratio)
      const geometry = sourceAutoGeometry({ kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1',
        diameter, ratio, spikes: 2, scale: row.storedScale, angle: row.storedAngle }, row.shape, row.subpixelX, row.subpixelY)
      expect(geometry.maskSize).toEqual([row.width, row.height])
      const angle = row.shape.rotation + row.storedAngle
      expect(row.processing).toEqual([0, 1, geometry.hotSpot[0] - .5 + row.subpixelX,
        geometry.hotSpot[1] - .5 + row.subpixelY, Math.cos(angle), Math.sin(angle)])
      const sx = row.shape.scale, sy = sx * row.shape.ratio
      expect(row.generatorScale).toEqual([sx, sy])
      let fade = 1 - (Number(row.generator.hfade) + Number(row.generator.vfade)) / 2
      fade = fade === 0 ? 1e-6 : fade === 1 ? 1 - 1e-6 : fade
      const center = (sourceFmaF64(6761, fade, -10000) * 2.5) / (fade * (Math.SQRT2 * 6761))
      const factor = (Math.SQRT2 * 12500) / (((6761 * fade) * (diameter * sx)) / 2)
      expect(row.constructorCoefficients.slice(0, 4)).toEqual([1 / ratio, fade, center, 0])
      expect(row.scaleCoefficients.slice(0, 4)).toEqual([sx / (sy * ratio), fade, center, factor])
      expect(row.scaleCoefficients[4]).toBe(row.constructorCoefficients[4])
    }
  })

  it('matches every scalar coverage byte on the52 retained requests without claiming universal erf identity', () => {
    let pixels = 0
    for (const row of native.cases.filter(row => row.mode === 'scalar-common')) {
      const diameter = Number(row.generator.diameter), ratio = Number(row.generator.ratio)
      const aa = row.generator.antialiasEdges !== '0', sx = row.shape.scale, sy = sx * row.shape.ratio
      const n = gaussianSampleCount(Math.min(diameter * sx, diameter * ratio * sy), aa)
      const [, , cx, cy, cos, sin] = row.processing, radius = diameter * sx * .5, ycoef = sx / (sy * ratio)
      const actual = new Uint8Array(row.width * row.height)
      for (let y = 0; y < row.height; y++) for (let x = 0; x < row.width; x++) {
        let sum = 0
        for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
          const px = sourceFmaF64(u, 1 / n, x) - cx, py = sourceFmaF64(v, 1 / n, y) - cy
          const rx = sourceFmaF64(cos, px, -(sin * py)), ry = sourceFmaF64(sin, px, cos * py)
          sum += gaussianTransparency(rx, ry * ycoef, radius, row.constructorCoefficients[1], aa)
        }
        actual[y * row.width + x] = 255 - Math.trunc(sum / (n * n))
      }
      expect(Buffer.from(actual).toString('base64'), `${row.index}/${row.variant}`).toBe(row.coverageBase64)
      pixels += actual.length
    }
    expect(pixels).toBe(14549)
  })

  it('keeps the independent NEON output distinct from scalar truncation', () => {
    let differences = 0, max = 0
    for (let i = 0; i < native.cases.length; i += 2) {
      const a = Buffer.from(native.cases[i].coverageBase64, 'base64')
      const b = Buffer.from(native.cases[i + 1].coverageBase64, 'base64')
      expect(a.length).toBe(b.length)
      for (let p = 0; p < a.length; p++) {
        differences += +(a[p] !== b[p]); max = Math.max(max, Math.abs(a[p] - b[p]))
      }
    }
    expect(native.cases.filter(row => row.vectorBranch)).toHaveLength(51)
    expect(differences).toBe(4548)
    expect(max).toBe(1)
  })
})
