import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceDefaultAutoWholePath/whole.native.json'
import { sourceAutoGeometry } from './sourceAutoGeometry'
import { sourceDefaultAutoMaskReference } from './sourceDefaultAutoMaskReference'

/** Independent whole-wrapper fixture: no caller-supplied raster geometry was
 * passed to the original mask applicator. Source framing is not GUI dispatch. */
describe('default auto raw request to whole coverage', () => {
  it('preserves original geometry, raw coverage angle and shape-only generator scale', () => {
    expect(native.cases).toHaveLength(56)
    for (const row of native.cases) {
      const geometry = sourceAutoGeometry({ kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1',
        diameter: Number(row.generator.diameter), ratio: Number(row.generator.ratio), spikes: 2,
        scale: row.storedScale, angle: row.storedAngle }, row.shape, row.subpixelX, row.subpixelY)
      expect(geometry.maskSize, `${row.index}/${row.variant}/${row.mode}`).toEqual([row.width, row.height])
      expect(row.processing.slice(0, 2)).toEqual([0, 1])
      expect(row.processing.slice(2, 4)).toEqual([geometry.hotSpot[0] - .5 + row.subpixelX, geometry.hotSpot[1] - .5 + row.subpixelY])
      const angle = row.shape.rotation + row.storedAngle
      expect(row.processing.slice(4)).toEqual([Math.cos(angle), Math.sin(angle)])
      expect(row.generatorScale).toEqual([row.shape.scale, row.shape.scale * row.shape.ratio])
      const actual = sourceDefaultAutoMaskReference({ tip: { kind: 'auto', generator: 'default',
        shape: row.generator.type === 'rect' ? 'rect' : 'circle', diameter: Number(row.generator.diameter),
        ratio: Number(row.generator.ratio), horizontalFade: Number(row.generator.hfade),
        verticalFade: Number(row.generator.vfade), antialias: row.generator.antialiasEdges !== '0',
        spikes: 2, softness: 1, randomness: 0, density: 1 },
      profile: row.mode === 'scalar-common' ? 'scalar-f64-fma-v1' : 'neon64-f32-fma-v1',
      scaleX: row.shape.scale, scaleY: row.shape.scale * row.shape.ratio,
      cos: Math.cos(angle), sin: Math.sin(angle), centerX: geometry.hotSpot[0] - .5 + row.subpixelX,
      centerY: geometry.hotSpot[1] - .5 + row.subpixelY, width: geometry.maskSize[0], height: geometry.maskSize[1],
      maxPixels: 16384, maxWorkSamples: 16384 * 36 })
      expect(Buffer.from(actual.mask).toString('base64'), `${row.index}/${row.variant}/${row.mode}`).toBe(row.coverageBase64)
      expect(actual.route === 'neon64-vector').toBe(row.vectorBranch)
    }
  })
})
