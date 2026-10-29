import { describe, expect, it } from 'vitest'
import native from './fixtures/sourcePngPyramid.native.json'
import { sourcePngLevelShape, sourcePngPyramid, sourcePngSelectLevel } from './sourcePngPyramid'

describe('native PNG pyramid metadata', () => {
  it('matches actual compiled constructor, border and level selector', () => {
    for (const c of native.cases) {
      const p = sourcePngPyramid(c.width, c.height, c.smooth)
      const originalIndex = c.levels.findIndex(l => l.filter === 'original')
      expect(p.levels).toEqual(c.levels.map((l, i) => ({ width: l.width, height: l.height,
        storedWidth: l.storedWidth, storedHeight: l.storedHeight, filter: l.filter, scale: 2 ** (originalIndex - i) })))
      for (const q of c.queries) {
        const index = sourcePngSelectLevel(p, q.scale)
        expect(index).toBe(q.index)
        expect(p.levels[index]!.scale).toBe(q.baseScale)
      }
      // The native image shim records each resampling source, catching recursive mip generation.
      for (const l of c.levels) expect(l.resamples).toBe(l.filter === 'original' ? 0 : 1)
    }
  })
  it('preserves odd dimensions, one-pixel levels and the native OR threshold', () => {
    expect(sourcePngPyramid(105, 108).levels.map(l => l.width)).toEqual([420, 210, 105, 53, 26, 13, 7, 3, 2, 1])
    expect(sourcePngPyramid(1, 1).levels.map(l => l.width)).toEqual([8, 4, 2, 1, 1])
    expect(sourcePngPyramid(65, 1025).levels[0]!.width).toBe(260)
    expect(sourcePngPyramid(65, 1025).levels[0]!.height).toBe(4100)
  })
  it('uses actual rounded level axes rather than nominal scale and retains raw negative rotation', () => {
    const p = sourcePngPyramid(105, 108)
    const adjusted = sourcePngLevelShape(p, { scale: .5, ratio: .7, rotation: -Math.PI / 3 })
    expect(adjusted.index).toBe(3)
    expect(adjusted.shape).toEqual({ scale: .5 / (53 / 105), ratio: ((.5 * .7) / (54 / 108)) / (.5 / (53 / 105)), rotation: -Math.PI / 3 })
    expect(adjusted.shape.scale).not.toBe(1)
  })
  it('fails closed for invalid geometry and sampling through a zero-scale shape', () => {
    for (const n of [0, -1, .5, NaN, Infinity, 100001]) expect(() => sourcePngPyramid(n, 1)).toThrow()
    const p = sourcePngPyramid(1, 1)
    for (const n of [-1, NaN, Infinity]) expect(() => sourcePngSelectLevel(p, n)).toThrow()
    expect(() => sourcePngLevelShape(p, { scale: 0, ratio: 1, rotation: 0 })).toThrow()
    expect(Object.isFrozen(p.levels[0])).toBe(true)
  })
})
