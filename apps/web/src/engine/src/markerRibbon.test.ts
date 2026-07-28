import { describe, expect, it } from 'vitest'

import type { Dab } from '@grafetto/shared'

import { buildRibbonBands, nibSupport, nibGeometry, poseSubdivisions, RIBBON_FLOATS_PER_VERTEX } from './markerRibbon'

function dab(x: number, y: number, opts: Partial<Dab> = {}): Dab {
  return { x, y, pressure: 1, tiltX: 0, tiltY: 0, size: 20, aspectRatio: 1, angle: 0, opacity: 1, t: 0, ...opts }
}

/** Is a world point inside this dab's nib ellipse? Mirrors DAB_FRAG's own
 *  geometry (length(v_localUV) <= 1 over the aspect-stretched quad). */
function insideNib(d: Dab, px: number, py: number, sizeMultiplier = 1): boolean {
  const g = nibGeometry(d, sizeMultiplier)
  const c = Math.cos(-g.angle), s = Math.sin(-g.angle)
  const dx = px - d.x, dy = py - d.y
  const lx = dx * c - dy * s, ly = dx * s + dy * c
  return (lx / g.semiMajor) ** 2 + (ly / g.semiMinor) ** 2 <= 1 + 1e-9
}

function vertices(data: Float32Array): Array<{ x: number; y: number; edge: number }> {
  const out = []
  for (let i = 0; i < data.length; i += RIBBON_FLOATS_PER_VERTEX) {
    out.push({ x: data[i], y: data[i + 1], edge: data[i + 2] })
  }
  return out
}

describe('nibSupport', () => {
  it('gives the semi-minor axis as the support value across a circle-like nib', () => {
    const g = nibGeometry(dab(0, 0, { size: 20 }), 1) // semiMajor = semiMinor = 10
    const up = nibSupport(g, 0, -1)
    expect(up.value).toBeCloseTo(10, 6)
    expect(up.x).toBeCloseTo(0, 6)
    expect(up.y).toBeCloseTo(-10, 6)
  })

  // The whole construction rests on this: the support value is the distance
  // from the centre to the tangent line with that normal, so a 5:1 nib probed
  // along its own long axis must report the long semi-axis, not the short one.
  it('gives the semi-major axis when probed along an unrotated chisel nib', () => {
    const g = nibGeometry(dab(0, 0, { size: 20, aspectRatio: 5 }), 1) // 50 x 10
    expect(nibSupport(g, 1, 0).value).toBeCloseTo(50, 6)
    expect(nibSupport(g, 0, 1).value).toBeCloseTo(10, 6)
  })

  it('rotates with the nib', () => {
    const g = nibGeometry(dab(0, 0, { size: 20, aspectRatio: 5, angle: Math.PI / 2 }), 1)
    // Long axis now points along world Y.
    expect(nibSupport(g, 0, 1).value).toBeCloseTo(50, 6)
    expect(nibSupport(g, 1, 0).value).toBeCloseTo(10, 6)
  })

  it('returns a point that actually lies on the nib boundary', () => {
    const d = dab(0, 0, { size: 30, aspectRatio: 4, angle: 0.7 })
    const g = nibGeometry(d, 1)
    for (const [nx, ny] of [[1, 0], [0, 1], [0.6, 0.8], [-0.3, 0.95]]) {
      const len = Math.hypot(nx, ny)
      const p = nibSupport(g, nx / len, ny / len)
      expect(insideNib(d, p.x, p.y)).toBe(true)                      // on/inside
      expect(insideNib(d, p.x * 1.02, p.y * 1.02)).toBe(false)       // just outside
    }
  })
})

describe('nibSupport, rounded box (#330 stage 3 — the chisel nib)', () => {
  // A rounded box is the box shrunk by r and grown back by a disc of radius r,
  // and support functions add over a Minkowski sum — so probing straight along
  // an axis must give back the full half-extent, corner radius included.
  it('reports the full half-extent along each axis', () => {
    const g = nibGeometry(dab(0, 0, { size: 20, aspectRatio: 5 }), 1, 'roundedBox', 0.3) // 50 x 10, r = 3
    expect(nibSupport(g, 1, 0).value).toBeCloseTo(50, 6)
    expect(nibSupport(g, 0, 1).value).toBeCloseTo(10, 6)
  })

  // The difference that matters against an ellipse: a box keeps its full width
  // out to the corner instead of tapering the whole way along, which is what a
  // flat felt tip actually does.
  it('stays wider than the ellipse it replaces away from the centre', () => {
    const d = dab(0, 0, { size: 20, aspectRatio: 5 })
    const box = nibSupport(nibGeometry(d, 1, 'roundedBox', 0.3), 0.6, 0.8)
    const ellipse = nibSupport(nibGeometry(d, 1, 'ellipse'), 0.6, 0.8)
    expect(box.value).toBeGreaterThan(ellipse.value)
  })

  it('degenerates to the plain box when the corner radius is zero', () => {
    const g = nibGeometry(dab(0, 0, { size: 20, aspectRatio: 5 }), 1, 'roundedBox', 0)
    const s = nibSupport(g, Math.SQRT1_2, Math.SQRT1_2)
    expect(s.value).toBeCloseTo((50 + 10) * Math.SQRT1_2, 6) // hx|ux| + hy|uy|
    expect(s.x).toBeCloseTo(50, 6)
    expect(s.y).toBeCloseTo(10, 6)
  })

  it('never lets the corner radius exceed the nib itself', () => {
    const g = nibGeometry(dab(0, 0, { size: 20 }), 1, 'roundedBox', 5) // r would be 50 vs a 10px nib
    expect(nibSupport(g, 1, 0).value).toBeCloseTo(10, 6)
  })
})

describe('buildRibbonBands', () => {
  it('emits nothing for a single dab (the nib stamp alone covers it)', () => {
    expect(buildRibbonBands([dab(0, 0)], 1).length).toBe(0)
  })

  it('skips a zero-length step instead of emitting a degenerate band', () => {
    expect(buildRibbonBands([dab(5, 5), dab(5, 5)], 1).length).toBe(0)
  })

  it('connects the previous dab to the batch, so consecutive paint calls leave no gap', () => {
    const withoutPrev = buildRibbonBands([dab(20, 0)], 1)
    const withPrev = buildRibbonBands([dab(20, 0)], 1, dab(0, 0))
    expect(withoutPrev.length).toBe(0)
    expect(withPrev.length).toBeGreaterThan(0)
  })

  // Coverage is read straight off this attribute, so a vertex sitting on the
  // outer boundary must carry exactly 0 or the mark's edge lands in the wrong
  // place — and the centre-line vertices must carry the nib's own half-width.
  it('puts edge=0 on the tangent vertices and the support value on the centre line', () => {
    const bands = vertices(buildRibbonBands([dab(0, 0), dab(40, 0)], 1, undefined))
    const edges = [...new Set(bands.map(v => Number(v.edge.toFixed(6))))].sort((a, b) => a - b)
    expect(edges).toEqual([0, 10]) // semiMinor of a size-20 round nib
    for (const v of bands.filter(v => v.edge === 0)) expect(Math.abs(Math.abs(v.y) - 10)).toBeLessThan(1e-6)
    for (const v of bands.filter(v => v.edge > 0)) expect(v.y).toBeCloseTo(0, 6)
  })

  // The convex-hull property this module relies on: every band vertex is on or
  // inside one of the two nibs it connects, so the band can never paint outside
  // the true swept figure.
  it('never reaches outside the two nibs it connects, for a rotated chisel', () => {
    const d0 = dab(0, 0, { size: 24, aspectRatio: 5, angle: Math.PI / 4 })
    const d1 = dab(37, 11, { size: 24, aspectRatio: 5, angle: Math.PI / 4 })
    for (const v of vertices(buildRibbonBands([d0, d1], 1))) {
      expect(insideNib(d0, v.x, v.y) || insideNib(d1, v.x, v.y)).toBe(true)
    }
  })

  // The point of the whole exercise: the band must actually fill the gap the
  // stamps left. Sample the midpoint between two chisel nibs far enough apart
  // that neither stamp reaches it.
  it('covers the gap between two stamps that do not overlap there', () => {
    const angle = Math.PI / 4
    const d0 = dab(0, 0, { size: 24, aspectRatio: 5, angle })
    const d1 = dab(0, 40, { size: 24, aspectRatio: 5, angle }) // travel across the nib's short axis
    const midX = 0, midY = 20
    expect(insideNib(d0, midX, midY)).toBe(false)
    expect(insideNib(d1, midX, midY)).toBe(false)

    // The midpoint must be inside the band: check it is on the interior side of
    // both tangent edges, which for a straight band means between the two
    // tangent lines and between the two nib centres.
    const bands = vertices(buildRibbonBands([d0, d1], 1))
    const xs = bands.map(v => v.x)
    expect(Math.min(...xs)).toBeLessThan(midX)
    expect(Math.max(...xs)).toBeGreaterThan(midX)
    const ys = bands.map(v => v.y)
    expect(Math.min(...ys)).toBeLessThanOrEqual(midY)
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(midY)
  })

  it('emits 12 vertices per band', () => {
    const three = buildRibbonBands([dab(0, 0), dab(10, 0), dab(20, 0)], 1)
    expect(three.length / RIBBON_FLOATS_PER_VERTEX).toBe(24)
  })
})

// #330 follow-up: the rounded notches that survived the first two fixes.
describe('pose subdivision (#330 — rotating and growing nibs)', () => {
  const g = (angle: number, size = 24, aspect = 5) =>
    nibGeometry(dab(0, 0, { size, aspectRatio: aspect, angle }), 1, 'roundedBox', 0.28)

  it('does not subdivide a pure translation', () => {
    expect(poseSubdivisions(g(0.4), g(0.4))).toBe(1)
  })

  // "Band plus two nibs is the exact swept figure" is only true for translation.
  // Once the nib turns, the poses in between bulge outside the hull of the two
  // ends, and the wider the nib the further that bulge reaches.
  it('subdivides more the further the nib reaches, for the same turn', () => {
    const narrow = poseSubdivisions(g(0, 24, 1), g(0.05, 24, 1))
    const wide = poseSubdivisions(g(0, 24, 5), g(0.05, 24, 5))
    expect(wide).toBeGreaterThan(narrow)
  })

  it('subdivides for a size change even with the angle held fixed', () => {
    expect(poseSubdivisions(g(0.4, 24), g(0.4, 40))).toBeGreaterThan(1)
  })

  it('takes the short way round rather than spinning through a full turn', () => {
    const justBelowPi = poseSubdivisions(g(Math.PI - 0.01), g(-Math.PI + 0.01))
    const wholeTurn = poseSubdivisions(g(0), g(Math.PI - 0.02))
    expect(justBelowPi).toBeLessThan(wholeTurn)
  })

  it('stays bounded however wild the pose change', () => {
    expect(poseSubdivisions(g(0, 200, 5), g(3, 400, 5))).toBeLessThanOrEqual(12)
  })

  // Ink rides the same vertices as the silhouette now — that is the whole point
  // of the fix, so a band must actually carry a nonzero deposit.
  it('carries an ink deposit on every band vertex', () => {
    const data = buildRibbonBands([dab(0, 0), dab(40, 0)], 1, undefined, 'ellipse', 0, 1)
    expect(data.length).toBeGreaterThan(0)
    for (let i = 0; i < data.length; i += RIBBON_FLOATS_PER_VERTEX) {
      expect(data[i + 3]).toBeGreaterThan(0)
    }
  })

  it('scales that deposit with distance travelled, not with dab count', () => {
    const short = buildRibbonBands([dab(0, 0), dab(10, 0)], 1, undefined, 'ellipse', 0, 1)
    const long = buildRibbonBands([dab(0, 0), dab(40, 0)], 1, undefined, 'ellipse', 0, 1)
    expect(long[3] / short[3]).toBeCloseTo(4, 5)
  })

  it('emits extra geometry for a turning nib and none for a straight one', () => {
    const straight = buildRibbonBands([dab(0, 0, { aspectRatio: 5 }), dab(40, 0, { aspectRatio: 5 })], 1, undefined, 'roundedBox', 0.28, 1)
    const turning = buildRibbonBands(
      [dab(0, 0, { aspectRatio: 5, angle: 0 }), dab(40, 0, { aspectRatio: 5, angle: 0.3 })],
      1, undefined, 'roundedBox', 0.28, 1,
    )
    expect(turning.length).toBeGreaterThan(straight.length * 3)
  })
})
