import { describe, expect, it } from 'vitest'
import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { DabSystem } from './DabSystem'
import { digitalBrushFromPreset } from '../presets/digitalBrushPresets'
import { PENCIL_DAB_SHAPING } from '../presets/dabShaping'

function system(coefficient = .4, aspect = 1, angle = 0): DabSystem {
  const brush: BrushDescriptor = {
    ...digitalBrushFromPreset('hard-round'),
    tip: { kind: 'round', hardness: 1, aspect, angle, rotation: 'fixed' },
    behavior: { version: 2 }, scatter: undefined,
  }
  const sys = new DabSystem({ spacingFactor: .00001, shaping: { ...PENCIL_DAB_SHAPING, size: pressure => pressure, aspect: () => aspect, angle: () => angle, pressureSmoothingPx: undefined, tiltSmoothingPx: undefined } })
  sys.autoSpacing = { coefficient, brush, sizeMultiplier: 1 / Math.max(aspect, 1) }
  // These ordinary mark-density restrictions must not override source spacing.
  sys.footprint = { sizeScale: .1, hardness: 1, spacingStrength: 1 }
  sys.curvatureTolerancePx = .000001
  return sys
}

function line(sys: DabSystem, size: number, pressure = 1, vertical = false): Dab[] {
  const dabs = sys.startStroke(0, 0, pressure, 0, 0, size, 1)
  for (let i = 1; i <= 10; i++) dabs.push(...sys.continueStroke(vertical ? 0 : i * 10, vertical ? i * 10 : 0, pressure, 0, 0, size, 1))
  dabs.push(...sys.endStroke(size, 1))
  return dabs
}

function expectGap(dabs: Dab[], expected: number) {
  expect(dabs.length).toBeGreaterThan(3)
  for (let i = 1; i < dabs.length; i++) expect(Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y)).toBeCloseTo(expected, 5)
}

describe('Krita auto spacing in the live dab sampler', () => {
  it('uses actual pressure diameter and square-root spacing without nominal caps', () => {
    expectGap(line(system(), 100), 4)
    expectGap(line(system(), 100, .25), 2)
  })

  it('retains the linear branch above Krita’s native .5px distance floor', () => {
    expectGap(line(system(.8), .81), .648)
    expectGap(line(system(.5), .25), .5)
    expectGap(line(system(.001), 0), .5)
  })

  it('uses ellipse axes in brush coordinates, including rotation', () => {
    // Normalization makes the actual100px tip dimensions100×25.
    expectGap(line(system(.4, 4), 100), 4)
    expectGap(line(system(.4, 4), 100, 1, true), 2)
    expectGap(line(system(.4, 4, Math.PI / 2), 100), 2)
  })

  it('keeps source dab density through bends instead of applying ribbon curvature caps', () => {
    const sys = system(2)
    const dabs = sys.startStroke(0, 0, 1, 0, 0, 100, 1)
    for (const [x, y] of [[30, 0], [30, 30], [60, 30], [60, 60]]) dabs.push(...sys.continueStroke(x, y, 1, 0, 0, 100, 1))
    dabs.push(...sys.endStroke(100, 1))
    expect(dabs.length).toBeGreaterThan(4)
    expect(dabs.length).toBeLessThan(12)
  })

  it('applies dynamic size before evaluating the spacing law', () => {
    const sys = system()
    sys.autoSpacing!.brush = { ...sys.autoSpacing!.brush, behavior: { version: 2, dynamics: { size: { control: 'pressure', minimum: 0, jitter: 0 } } } }
    expectGap(line(sys, 100, .25), 1)
  })

  it('forks source configuration and gesture state without advancing the real sampler', () => {
    const real = system(), control = system()
    for (const sys of [real, control]) {
      sys.startStroke(0, 0, 1, 0, 0, 100, 1)
      sys.continueStroke(10, 0, .7, 0, 0, 100, 1)
      sys.continueStroke(20, 0, .4, 0, 0, 100, 1)
    }
    const fork = real.forkForPreview()
    expect(fork.autoSpacing).not.toBe(real.autoSpacing)
    fork.autoSpacing!.coefficient = 2
    fork.continueStroke(50, 0, .1, 0, 0, 100, 1)
    real.peekTipDabs(100)
    real.peekTipDabs(100)
    expect(real.continueStroke(30, 0, .2, 0, 0, 100, 1)).toEqual(control.continueStroke(30, 0, .2, 0, 0, 100, 1))
    expect(real.endStroke(100, 1)).toEqual(control.endStroke(100, 1))
  })

  it('resets auto-spacing state on a new gesture and permits switching back to legacy spacing', () => {
    const sys = system()
    line(sys, 100, .25)
    expect(line(sys, 100)).toEqual(line(system(), 100))
    sys.autoSpacing = null
    const legacy = new DabSystem({ spacingFactor: sys.spacingFactor, shaping: { ...PENCIL_DAB_SHAPING, size: pressure => pressure, aspect: () => 1, angle: () => 0, pressureSmoothingPx: undefined, tiltSmoothingPx: undefined } })
    legacy.footprint = sys.footprint
    legacy.curvatureTolerancePx = sys.curvatureTolerancePx
    expect(line(sys, 100)).toEqual(line(legacy, 100))
  })
})
