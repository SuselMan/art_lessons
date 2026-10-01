import { describe, expect, it } from 'vitest'
import { shapingForTool } from '../presets/dabShaping'
import { PRESSURE_RESPONSES } from '../presets/brushPenPresets'
import { createTipState, maxNibReach, tipFootprint } from './tipFootprint'

function footprint(tool: 'brushPen' | 'watercolor', response: string, baseSize: number, pressure: number) {
  const shaping = shapingForTool(tool, tool === 'watercolor' ? `${response}:0.7:0.7:0:flex` : response)
  return tipFootprint(shaping, {
    x: 0, y: 0, ds: 0, speed: 0, baseSize, pressure,
    tiltX: 0, tiltY: 0, pathAngle: 0, cameraAngle: 0,
  }, null)
}

describe('flexible nib hairlines', () => {
  for (const tool of ['brushPen', 'watercolor'] as const) {
    for (const response of PRESSURE_RESPONSES) {
      it(`${tool}/${response}: feather contact stays thin at every nominal size`, () => {
        for (const size of [2, 10, 40, 100, 500]) {
          for (const pressure of [0, 0.01, 0.05]) {
            expect(footprint(tool, response, size, pressure).size).toBeCloseTo(2)
          }
          expect(footprint(tool, response, size, 1).size).toBeCloseTo(size)
          let previous = 2
          for (let p = 0.05; p <= 1; p += 0.01) {
            const current = footprint(tool, response, size, p).size
            expect(current).toBeGreaterThanOrEqual(previous - 1e-10)
            expect(current).toBeLessThanOrEqual(size)
            previous = current
          }
        }
      })
    }
  }
  it('sampling reach follows the thin contact instead of the nominal brush', () => {
    const shaping = shapingForTool('brushPen', 'normal')
    expect(maxNibReach(shaping, 0.05, 0, 500)).toBeLessThan(1.1)
  })
  it('does not enlarge a subpixel nib', () => {
    expect(footprint('brushPen', 'normal', 0.4, 0.05).size).toBeCloseTo(0.4)
  })
})

it('pen and wet flexible nib share the same width response', () => {
  for (const response of PRESSURE_RESPONSES) {
    for (const size of [2, 40, 500]) {
      for (const pressure of [0.02, 0.1, 0.5, 0.9, 1]) {
        expect(footprint('watercolor', response, size, pressure).size)
          .toBeCloseTo(footprint('brushPen', response, size, pressure).size, 10)
      }
    }
  }
})

it('rigid watercolor nibs retain their original size response', () => {
  for (const nib of ['round', 'chisel']) {
    const shaping = shapingForTool('watercolor', `normal:0.7:0.7:0:${nib}`)
    const result = tipFootprint(shaping, {
      x: 0, y: 0, ds: 0, speed: 0, baseSize: 100, pressure: 0.02,
      tiltX: 0, tiltY: 0, pathAngle: 0, cameraAngle: 0,
    }, null)
    expect(result.size).toBeCloseTo(100 * shaping.size(0.02, 0), 10)
  }
})


it('speed cannot erase the point contact of a large flexible nib', () => {
  const shaping = shapingForTool('brushPen', 'normal')
  const state = createTipState()
  let size = 0
  for (let i = 1; i <= 100; i++) {
    size = tipFootprint(shaping, {
      x: i * 5, y: 0, ds: 5, speed: 10, baseSize: 500, pressure: 0.02,
      tiltX: 0, tiltY: 0, pathAngle: 0, cameraAngle: 0,
    }, state).size
  }
  expect(size).toBeCloseTo(2)
})
