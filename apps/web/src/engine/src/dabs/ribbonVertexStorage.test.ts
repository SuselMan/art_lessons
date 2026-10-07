import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import golden from './ribbonVertexGolden.json'
import { buildRibbonBands, type NibShape } from './markerRibbon'

describe('typed ribbon vertex storage: frozen pre-optimization bytes', () => {
  for (const fixture of golden.cases) {
    it(`preserves bitwise baseline ${fixture.shape}/${fixture.film}/${fixture.scale}`, () => {
      const material = (_a: typeof golden.dabs[number], d: typeof golden.dabs[number], travel: number) => ({
        ink: d.opacity * travel * .137, water: .713, paperWet: d.pressure * .27,
        strength: -.923, puddle: .67, pigmentPool: .49,
      })
      const actual = buildRibbonBands(golden.dabs, fixture.scale, undefined, fixture.shape as NibShape,
        .23, .71, material, fixture.film)
      expect(actual.length).toBe(fixture.length)
      expect(actual.byteOffset).toBe(0)
      expect(actual.byteLength).toBe(actual.buffer.byteLength)
      expect(createHash('sha256').update(new Uint8Array(actual.buffer)).digest('hex')).toBe(fixture.sha256)
    })
  }
})
