import { describe, expect, it } from 'vitest'

import {
  barycentric,
  clampToTriangle,
  pointForSv,
  svFromWeights,
  triangleCorners,
} from './triangleGeometry'

const center = { x: 100, y: 100 }
const corners = triangleCorners(center, 80)

describe('triangleCorners', () => {
  it('points down: white upper left, hue upper right, black at the bottom', () => {
    expect(corners.white.x).toBeLessThan(center.x)
    expect(corners.white.y).toBeLessThan(center.y)
    expect(corners.hue.x).toBeGreaterThan(center.x)
    expect(corners.hue.y).toBeLessThan(center.y)
    expect(corners.black.y).toBeGreaterThan(center.y)
    expect(corners.black.x).toBeCloseTo(center.x)
  })

  it('puts every corner on the circle it was given', () => {
    for (const p of [corners.hue, corners.white, corners.black]) {
      expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(80)
    }
  })
})

describe('barycentric', () => {
  it('gives a corner all the weight', () => {
    expect(barycentric(corners.hue, corners)[0]).toBeCloseTo(1)
    expect(barycentric(corners.white, corners)[1]).toBeCloseTo(1)
    expect(barycentric(corners.black, corners)[2]).toBeCloseTo(1)
  })

  it('always sums to one, inside or out', () => {
    for (const p of [center, corners.hue, { x: -500, y: 900 }, { x: 101, y: 99 }]) {
      const [a, b, c] = barycentric(p, corners)
      expect(a + b + c).toBeCloseTo(1)
    }
  })

  it('goes negative exactly when the point is outside', () => {
    expect(barycentric(center, corners).some(w => w < 0)).toBe(false)
    expect(barycentric({ x: 100, y: -50 }, corners).some(w => w < 0)).toBe(true)
  })
})

describe('svFromWeights', () => {
  it('reads the corners as the colors they are', () => {
    expect(svFromWeights([1, 0, 0])).toEqual({ s: 1, v: 1 })       // pure hue
    expect(svFromWeights([0, 1, 0])).toEqual({ s: 0, v: 1 })       // white
    expect(svFromWeights([0, 0, 1])).toEqual({ s: 0, v: 0 })       // black
  })

  it('reports no saturation at black rather than dividing by zero', () => {
    expect(svFromWeights([0, 0, 1]).s).toBe(0)
  })
})

describe('pointForSv', () => {
  it('round-trips through barycentric + svFromWeights', () => {
    for (const [s, v] of [[0, 0], [1, 1], [0, 1], [0.3, 0.7], [0.9, 0.2], [0.5, 0.5]]) {
      const p = pointForSv(s, v, corners)
      const back = svFromWeights(barycentric(p, corners))
      expect(back.s).toBeCloseTo(s)
      expect(back.v).toBeCloseTo(v)
    }
  })

  it('lands on the corners for the corner colors', () => {
    const hue = pointForSv(1, 1, corners)
    expect(hue.x).toBeCloseTo(corners.hue.x)
    expect(hue.y).toBeCloseTo(corners.hue.y)
    const black = pointForSv(0, 0, corners)
    expect(black.x).toBeCloseTo(corners.black.x)
    expect(black.y).toBeCloseTo(corners.black.y)
  })
})

describe('clampToTriangle', () => {
  it('leaves an inside point alone', () => {
    expect(clampToTriangle(center, corners)).toBe(center)
  })

  it('brings an outside point back onto the shape', () => {
    const clamped = clampToTriangle({ x: 100, y: -400 }, corners)
    const [a, b, c] = barycentric(clamped, corners)
    expect(a).toBeGreaterThanOrEqual(-1e-9)
    expect(b).toBeGreaterThanOrEqual(-1e-9)
    expect(c).toBeGreaterThanOrEqual(-1e-9)
  })

  it('slides along the near edge instead of snapping to one corner', () => {
    // Two points that both overshoot the top edge, at different places along
    // it, must come back to different spots — that is the difference between
    // sliding and snapping.
    const left = clampToTriangle({ x: 60, y: -200 }, corners)
    const right = clampToTriangle({ x: 140, y: -200 }, corners)
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(1)
  })

  it('picks the nearest edge, not the first one', () => {
    // Far below the shape: the answer is the bottom corner region, not the
    // top edge.
    const below = clampToTriangle({ x: 100, y: 500 }, corners)
    expect(below.y).toBeGreaterThan(center.y)
  })
})
