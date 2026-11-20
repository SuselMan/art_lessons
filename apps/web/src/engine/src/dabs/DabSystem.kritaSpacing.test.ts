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

  it('uses dynamic local axes: ratio compresses Y spacing but leaves X spacing intact', () => {
    const make=()=>{const sys=system(.2);sys.autoSpacing!.mode='diameter';sys.autoSpacing!.brush.behavior={version:2,dynamics:{roundness:{control:'off',minimum:0,jitter:0,curve:[[0,.25],[1,.25]]}}};return sys}
    expectGap(line(make(),100),20)
    expectGap(line(make(),100,1,true),5)
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

describe('explicit diameter source spacing and independent spacing controls',()=>{
  const pressureSpacing={control:'pressure' as const,jitter:0,minimum:0,curve:[[0,1],[1,0]] as const}
  it('uses diameter times coefficient times pressure-spacing, with the native half-pixel floor last',()=>{
    const make=()=>{const sys=system(.2);sys.autoSpacing!.mode='diameter';sys.autoSpacing!.dynamics=[pressureSpacing];return sys}
    expectGap(line(make(),100,.5),5)
    expectGap(line(make(),100,.25),3.75)
    expectGap(line(make(),100,1),.5)
    expectGap(line(make(),100,0),.5)
  })
  it('modulates auto-spacing after the square root rather than shrinking its input diameter',()=>{
    const sys=system(.4);sys.autoSpacing!.dynamics=[pressureSpacing]
    expectGap(line(sys,100,.5),Math.sqrt(50)*.4*.5)
  })
  it('keeps anisotropic axes and rotation, or explicitly chooses a rotation-independent max axis',()=>{
    const make=(angle=0,iso=false)=>{const sys=system(.2,4,angle);sys.autoSpacing!.mode='diameter';sys.autoSpacing!.isotropic=iso;return sys}
    expectGap(line(make(),100),20)
    expectGap(line(make(),100,1,true),5)
    expectGap(line(make(Math.PI/2),100),5)
    expectGap(line(make(0,true),100,1,true),20)
    expectGap(line(make(Math.PI/2,true),100),20)
  })
  it('deep-copies control lists/curves for preview and resets gesture state without changing real gaps',()=>{
    const make=()=>{const sys=system(.2);sys.autoSpacing!.mode='diameter';sys.autoSpacing!.dynamics=[structuredClone(pressureSpacing)];return sys}
    const real=make(),control=make()
    for(const sys of [real,control]){sys.startStroke(0,0,.5,0,0,100,1);sys.continueStroke(10,0,.5,0,0,100,1);sys.continueStroke(20,0,.5,0,0,100,1)}
    const fork=real.forkForPreview();fork.autoSpacing!.dynamics![0].curve=[[0,0],[1,0]]
    fork.continueStroke(80,0,1,0,0,100,1);real.peekTipDabs(100);real.peekTipDabs(100)
    expect(real.autoSpacing!.dynamics![0].curve).toEqual([[0,1],[1,0]])
    expect(real.continueStroke(30,0,.5,0,0,100,1)).toEqual(control.continueStroke(30,0,.5,0,0,100,1))
    expect(real.endStroke(100,1)).toEqual(control.endStroke(100,1))
    expect(line(real,100,.5)).toEqual(line(make(),100,.5))
  })
  it('evaluates fade from pre-advance spacing state rather than the current travelled distance',()=>{
    const sys=system(.2);sys.autoSpacing!.mode='diameter';sys.autoSpacing!.dynamics=[{control:'fade',fade:1,minimum:0,jitter:0}]
    const positions=line(sys,100).slice(0,4).map(d=>d.x)
    expect(positions[0]).toBe(0);expect(positions[1]).toBeCloseTo(20,5);expect(positions[2]).toBeCloseTo(40,5);expect(positions[3]).toBeCloseTo(56,5)
  })
  it('keeps old auto-spacing exact when new fields are absent',()=>{
    const old=system(),explicit=system();explicit.autoSpacing!.mode='kritaAuto';explicit.autoSpacing!.dynamics=[];explicit.autoSpacing!.isotropic=false
    expect(line(old,100,.25)).toEqual(line(explicit,100,.25))
  })
})

describe('padded bitmap characteristic spacing lifecycle',()=>{
  function narrow():DabSystem {
    const sys=system(.14)
    sys.autoSpacing={...sys.autoSpacing!,mode:'diameter',axisScale:{x:7/32,y:1},angleOffset:0}
    return sys
  }
  it('passes native axis metrics through the live primary sampler',()=>{
    expectGap(line(narrow(),48),1.47)
    expectGap(line(narrow(),48,1,true),6.72)
  })
  it('copies source axes for prediction and preserves actual gesture phase',()=>{
    const real=narrow(),control=narrow()
    real.startStroke(0,0,1,0,0,48,1);control.startStroke(0,0,1,0,0,48,1)
    expect(real.continueStroke(30,0,1,0,0,48,1)).toEqual(control.continueStroke(30,0,1,0,0,48,1))
    const fork=real.forkForPreview()
    expect(fork.autoSpacing!.axisScale).not.toBe(real.autoSpacing!.axisScale)
    fork.autoSpacing!.axisScale!.x=1;fork.autoSpacing!.angleOffset=Math.PI/2
    fork.continueStroke(100,100,1,0,0,48,1)
    real.peekTipDabs(48)
    expect(real.continueStroke(80,0,1,0,0,48,1)).toEqual(control.continueStroke(80,0,1,0,0,48,1))
    expectGap(line(real,48),1.47)
  })
})
