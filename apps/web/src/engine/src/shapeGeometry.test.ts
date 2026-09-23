import { describe, it, expect } from 'vitest'
import type { ShapeFrame, ShapeGeometry, ShapeStroke } from '@grafetto/shared'
import { shapeDrawParams, sectorParams, strokeReach, clampCornerRadius } from './shapeGeometry'

// (#527) The half of the rasterizer that is arithmetic. The other half is a
// fragment shader, which these tests deliberately do not try to stand in for —
// MockGL does not rasterize, so a pixel assertion here would measure the mock
// (see the `project_mockgl_no_marker` note). What can be pinned down without a
// GPU is exactly what is pinned down here: the contour parameters handed to the
// shader, and the sector arithmetic done on the CPU precisely so the shader
// never needs an atan.

const FRAME: ShapeFrame = { x: 100, y: 100, width: 400, height: 200, angle: 0 }

function stroke(over: Partial<ShapeStroke> = {}): ShapeStroke {
  return { color: [0, 0, 0], width: 20, align: 'center', join: 'round', ...over }
}

describe('strokeReach', () => {
  it('splits a centred stroke and puts an aligned one entirely on one side', () => {
    expect(strokeReach(stroke({ align: 'center' }))).toEqual({ outward: 10, inward: 10 })
    expect(strokeReach(stroke({ align: 'inside' }))).toEqual({ outward: 0, inward: 20 })
    expect(strokeReach(stroke({ align: 'outside' }))).toEqual({ outward: 20, inward: 0 })
  })
})

describe('clampCornerRadius', () => {
  it('caps a radius at half the shorter side rather than rejecting it', () => {
    expect(clampCornerRadius(1000, 200, 100)).toBe(100)
    expect(clampCornerRadius(30, 200, 100)).toBe(30)
    expect(clampCornerRadius(-5, 200, 100)).toBe(0)
  })
})

describe('shapeDrawParams', () => {
  const rect: ShapeGeometry = { kind: 'rectangle', cornerRadius: 0 }

  it('centres the shape on its frame, sign of the drag included', () => {
    const p = shapeDrawParams(rect, { x: 500, y: 300, width: -400, height: -200, angle: 0 }, null)
    expect(p.centerX).toBe(300)
    expect(p.centerY).toBe(200)
    expect(p.halfX).toBe(200)
    expect(p.halfY).toBe(100)
  })

  it('puts the stroke band where the alignment says', () => {
    expect(shapeDrawParams(rect, FRAME, stroke({ align: 'center' })).bandCenter).toBe(0)
    expect(shapeDrawParams(rect, FRAME, stroke({ align: 'inside' })).bandCenter).toBe(-10)
    expect(shapeDrawParams(rect, FRAME, stroke({ align: 'outside' })).bandCenter).toBe(10)
    expect(shapeDrawParams(rect, FRAME, stroke()).bandHalf).toBe(10)
  })

  it('draws a mitred rectangle between two contours, not as an offset band', () => {
    const p = shapeDrawParams(rect, FRAME, stroke({ join: 'miter', align: 'center' }))
    expect(p.strokeMode).toBe('contours')
    expect(p.outer).toEqual([210, 110, 0])
    expect(p.inner).toEqual([190, 90, 0])
    expect(p.hasInner).toBe(true)
  })

  it('moves a rounded rectangle corner radius with its contours', () => {
    const rounded: ShapeGeometry = { kind: 'rectangle', cornerRadius: 30 }
    const p = shapeDrawParams(rounded, FRAME, stroke({ join: 'miter', align: 'center' }))
    expect(p.base[2]).toBe(30)
    expect(p.outer[2]).toBe(40)
    expect(p.inner[2]).toBe(20)
  })

  it('reports a collapsed inner contour when the stroke is wider than the shape', () => {
    const p = shapeDrawParams(rect, FRAME, stroke({ join: 'miter', width: 400, align: 'inside' }))
    expect(p.hasInner).toBe(false)
  })

  it('leaves every other shape on the band, since their offsets are not the same shape', () => {
    const star: ShapeGeometry = { kind: 'polystar', points: 5, innerRadius: 0.5, rotation: 0 }
    const ellipse: ShapeGeometry = {
      kind: 'ellipse', startAngle: 0, endAngle: 0, innerRadius: 0, closePath: true,
    }
    expect(shapeDrawParams(star, FRAME, stroke({ join: 'miter' })).strokeMode).toBe('band')
    expect(shapeDrawParams(ellipse, FRAME, stroke({ join: 'miter' })).strokeMode).toBe('band')
  })

  it('normalizes a star onto a unit circle so a non-square frame still fits it', () => {
    const star: ShapeGeometry = { kind: 'polystar', points: 6, innerRadius: 0.4, rotation: 0 }
    const p = shapeDrawParams(star, FRAME, null)
    expect(p.base[0]).toBe(1)
    expect(p.base[1]).toBeCloseTo(0.4, 12)
    expect(p.halfX).toBe(200)
    expect(p.halfY).toBe(100)
  })

  it('clamps a star to a drawable vertex count', () => {
    const tooFew: ShapeGeometry = { kind: 'polystar', points: 1, innerRadius: 0, rotation: 0 }
    const tooMany: ShapeGeometry = { kind: 'polystar', points: 500, innerRadius: 0, rotation: 0 }
    expect(shapeDrawParams(tooFew, FRAME, null).starPoints).toBe(3)
    expect(shapeDrawParams(tooMany, FRAME, null).starPoints).toBe(60)
  })

  it('runs a line corner to corner of its frame, with the drag direction kept', () => {
    const line: ShapeGeometry = { kind: 'line', cap: 'round' }
    const p = shapeDrawParams(line, { x: 0, y: 0, width: 300, height: -400, angle: 0 }, stroke())
    expect(p.lineHalfLen).toBe(250)
    expect(p.lineDirX).toBeCloseTo(0.6, 12)
    expect(p.lineDirY).toBeCloseTo(-0.8, 12)
    expect(p.lineCap).toBe(1)
  })
})

// The wedge test the shader runs, reproduced here in the same arithmetic. It
// duplicates four lines of GLSL on purpose: what is being checked is that
// `sectorParams` hands those four lines the right bisector, aperture and mode,
// and a sign error there is otherwise only visible as "the sector is drawn
// inside out" on a screen.
function insideWedge(p: ReturnType<typeof sectorParams>, x: number, y: number): boolean {
  if (p.sectorMode === 0) return true
  const d = { x: p.sectorDirX, y: p.sectorDirY }
  const cs = p.sectorCos, sn = p.sectorSin
  const n1 = { x: d.x * sn + d.y * cs, y: d.y * sn - d.x * cs }
  const n2 = { x: d.x * sn - d.y * cs, y: d.y * sn + d.x * cs }
  const w = Math.max(-(x * n1.x + y * n1.y), -(x * n2.x + y * n2.y))
  return (p.sectorMode === 2 ? -w : w) < 0
}

function at(angle: number): [number, number] {
  return [Math.cos(angle) * 50, Math.sin(angle) * 50]
}

describe('sectorParams', () => {
  const TAU = Math.PI * 2

  it('turns the sector off for a full turn and for a zero sweep', () => {
    expect(sectorParams(0, 0).sectorMode).toBe(0)
    expect(sectorParams(1, 1 + TAU).sectorMode).toBe(0)
  })

  it('accepts a quarter turn as an intersection of two half-planes', () => {
    const p = sectorParams(0, Math.PI / 2)
    expect(p.sectorMode).toBe(1)
    expect(insideWedge(p, ...at(Math.PI / 4))).toBe(true)
    expect(insideWedge(p, ...at(0.05))).toBe(true)
    expect(insideWedge(p, ...at(Math.PI / 2 - 0.05))).toBe(true)
    expect(insideWedge(p, ...at(-0.2))).toBe(false)
    expect(insideWedge(p, ...at(Math.PI))).toBe(false)
  })

  it('accepts a three-quarter turn as the complement of the opposite wedge', () => {
    const p = sectorParams(0, (3 * Math.PI) / 2)
    expect(p.sectorMode).toBe(2)
    expect(insideWedge(p, ...at(Math.PI / 2))).toBe(true)
    expect(insideWedge(p, ...at(Math.PI))).toBe(true)
    expect(insideWedge(p, ...at((3 * Math.PI) / 2 - 0.05))).toBe(true)
    // The missing quarter, between 270 and 360 degrees.
    expect(insideWedge(p, ...at((7 * Math.PI) / 4))).toBe(false)
  })

  it('follows a sector that does not start at zero', () => {
    const p = sectorParams(Math.PI, Math.PI + Math.PI / 3)
    expect(insideWedge(p, ...at(Math.PI + 0.2))).toBe(true)
    expect(insideWedge(p, ...at(Math.PI - 0.2))).toBe(false)
    expect(insideWedge(p, ...at(0))).toBe(false)
  })

  it('reads a sector given the long way round the same as one given directly', () => {
    const direct = sectorParams(0, Math.PI / 2)
    const wrapped = sectorParams(TAU, TAU + Math.PI / 2)
    for (const a of [0.1, 0.7, 1.5, 3, 5]) {
      expect(insideWedge(wrapped, ...at(a))).toBe(insideWedge(direct, ...at(a)))
    }
  })
})
