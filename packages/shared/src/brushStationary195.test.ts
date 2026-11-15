import { hasValidRecordedPenOperation, packDabs } from './dabCodec.js'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isBrushBehavior } from './brushBehavior.js'
import { isBrushLibrary, hasBrushSourceInputs, stationary195RateInputRequirements, resolveStationary195Role, hasStationary195Scope, isStationary195Component, type BrushDescriptor, type BrushLibrary } from './brushes.js'
import { library133 } from './sprayWash133.testFixture.js'
import { library137 } from './gridWash137.testFixture.js'
import { library160, dab160 } from './deformTimer160.testFixture.js'
import { library136 } from './tangentWash136.testFixture.js'
import { library154 } from './legacyOverlay154.testFixture.js'
import { library174 } from './sketchGih174.testFixture.js'
import { library177 } from './mypaintTimer177.testFixture.js'
import { library167 } from './curveHostTimer167.testFixture.js'
import { library135 } from './bristleWash135.testFixture.js'
import { library158 } from './experimentPattern158.testFixture.js'
import { filterLibrary147 } from './filterSmudge147.testFixture.js'
import { library157 } from './particleTimer157.testFixture.js'

const timing = () => ({ version: 2 as const, rate: 20, hostRate: 1, updateSpacingBetweenDabs: false, ignoreDistanceSpacing: false })
function pixel(): BrushDescriptor {
  const d = library133().brushes[0].descriptor
  delete d.spray
  d.version = 195
  d.tip = { kind: 'round', hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 }
  d.behavior!.timing = timing()
  return d
}
const library = (d: BrushDescriptor): BrushLibrary => ({ schemaVersion: 1, assets: [], skipped: [], brushes: [{ name: 'Authored195', source: 'own.kpp', warnings: [], descriptor: d }] })

describe('whole root Stationary195 admission', () => {
  it('admits a real full Pixel and preserves its literal identity', () => {
    const d = pixel(), before = JSON.stringify(d)
    expect(resolveStationary195Role(d)).toEqual({ family: 'pixel', callback: 'effective' })
    expect(isBrushLibrary(library(d))).toBe(true)
    expect(JSON.stringify(d)).toBe(before)
    d.version = 194
    expect(hasStationary195Scope(d)).toBe(false)
    expect(isBrushLibrary(library(d))).toBe(false)
  })
  it('routes existing full Spray, Grid and Particle payloads without timer-fixture projection', () => {
    for (const [factory, family, callback] of [[library133, 'spray', 'effective'], [library137, 'grid', 'refreshOnly'], [library157, 'particle', 'movingBypass']] as const) {
      const l = factory(), d = l.brushes[0].descriptor
      d.version = 195
      if (d.spray) d.spray.composite = 'normal'
      d.behavior!.timing = timing()
      expect(resolveStationary195Role(d), family).toEqual({ family, callback })
      expect(isBrushLibrary(l), family).toBe(true)
    }
  })
  it('admits only the actual190/191 child under the root and rejects nested195', () => {
    const root = pixel(), child = pixel()
    child.id = 'imported-195195195195195195195190'
    child.version = 190
    delete child.behavior!.timing
    root.behavior!.dual = { brush: child, sampling: 'independent', blendMode: 'multiply' }
    expect(isStationary195Component(root, child)).toBe(true)
    expect(isStationary195Component(root, structuredClone(child))).toBe(false)
    expect(isBrushLibrary(library(root))).toBe(true)
    expect(isBrushLibrary(library(child))).toBe(false)
    child.version = 195
    expect(isBrushLibrary(library(root))).toBe(false)
  })
  it('retains existing full structural payloads across the remaining family cores', () => {
    const cases = [
      [library160(), 'deform', 'effective'], [library136(), 'tangentNormal', 'effective'],
      [library154(), 'smudge', 'effective'], [library174(), 'sketch', 'movingBypass'],
      [library177(), 'mypaint', 'effective'], [library167(), 'curve', 'lineCallback'],
      [library135(), 'bristle', 'lineCallback'], [library158(), 'experiment', 'lineCallback'],
      [filterLibrary147(), 'filter', 'refreshOnly'],
    ] as const
    for (const [l, family, callback] of cases) {
      const d = l.brushes[0].descriptor
      d.version = 195
      d.behavior!.timing = timing()
      if (d.tangentNormal) d.tangentNormal.sharpnessChecked = false
      expect(resolveStationary195Role(d), family).toMatchObject({ family, callback })
      expect(isBrushLibrary(l), family).toBe(true)
    }
  })
  it('admits the existing Clone and Hatching payloads with refresh-only callbacks', () => {
    const clone = pixel(), hatch = pixel()
    clone.behavior!.rendering!.accumulation = 'directOver'
    hatch.behavior!.rendering!.accumulation = 'directOver'
    clone.clone = { version: 1, moveSourcePoint: true }
    hatch.hatching = { version: 1, angle: 10, separation: 3, thickness: 1, origin: [0, 0], style: 'moire', intervals: 3, antialias: true, subpixel: true }
    for (const [d, family] of [[clone, 'clone'], [hatch, 'hatching']] as const) {
      expect(resolveStationary195Role(d)).toEqual({ family, callback: 'refreshOnly' })
      expect(isBrushLibrary(library(d))).toBe(true)
    }
  })
  it('retains native checked Sharpness only on195 TangentNormal and never guesses1x1 allocation', () => {
    const l = library136(), d = l.brushes[0].descriptor
    expect(isBrushLibrary(l)).toBe(true)
    d.version = 195
    d.behavior!.timing = timing()
    expect(hasStationary195Scope(d)).toBe(false)
    d.tangentNormal!.sharpnessChecked = true
    expect(resolveStationary195Role(d)).toEqual({ family: 'tangentNormal', callback: 'effective' })
    expect(isBrushLibrary(l)).toBe(true)
    d.version = 136
    delete d.behavior!.timing
    expect(isBrushLibrary(l)).toBe(false)
  })
  it('RoundMarker remains refresh-only and MyPaint never acquires Rate dynamics', () => {
    const d = pixel()
    d.tip = { ...d.tip, kind: 'procedural', profile: { kind: 'circleBand', antialias: true } }
    d.behavior!.rendering!.accumulation = 'maxAlpha'
    expect(resolveStationary195Role(d)).toEqual({ family: 'pixel', callback: 'refreshOnly', variant: 'roundMarker' })
    expect(isBrushLibrary(library(d))).toBe(true)
    d.behavior!.timing!.rateDynamics = [{ control: 'pressure', minimum: 0, jitter: 0 }]
    expect(hasStationary195Scope(d)).toBe(false)
    const my = library177().brushes[0].descriptor
    my.version = 195
    my.behavior!.timing = { ...timing(), rateDynamics: [{ control: 'pressure', minimum: 0, jitter: 0 }] }
    expect(hasStationary195Scope(my)).toBe(false)
  })
  it('requires the canonical host timing rather than silently granting untimed195', () => {
    const d = pixel()
    delete d.behavior!.timing
    expect(hasStationary195Scope(d)).toBe(false)
    expect(isBrushLibrary(library(d))).toBe(false)
  })
  it('rejects competing payloads and never treats unknown timing fields as policy', () => {
    const d = pixel()
    Reflect.set(d.behavior!.timing!, 'callback', 'effective')
    expect(hasStationary195Scope(d)).toBe(false)
    d.behavior!.timing = timing()
    Reflect.set(d, 'grid', library137().brushes[0].descriptor.grid)
    Reflect.set(d, 'spray', library133().brushes[0].descriptor.spray)
    expect(hasStationary195Scope(d)).toBe(false)
  })
})

describe('native timing2 strict numeric and control contract', () => {
  it('keeps independent host and engine rates, zero sentinel, and strict booleans', () => {
    const b = pixel().behavior!
    expect(isBrushBehavior(b)).toBe(true)
    b.timing!.rate = 0
    expect(isBrushBehavior(b)).toBe(true)
    for (const [key, value] of [['hostRate', 500 / 2147483648], ['rate', 1000 / 2147483648], ['hostRate', Infinity], ['updateSpacingBetweenDabs', 0], ['ignoreDistanceSpacing', 'false']] as const) {
      b.timing = timing()
      Reflect.set(b.timing, key, value)
      expect(isBrushBehavior(b), key).toBe(false)
    }
    b.timing = timing()
    Reflect.deleteProperty(b.timing, 'updateSpacingBetweenDabs')
    expect(isBrushBehavior(b)).toBe(false)
  })
  it('requires recorded Rate speed and angle channels for every dab and endpoint', () => {
    const d = library160().brushes[0].descriptor
    d.version = 195
    d.behavior!.timing = { ...timing(), rateDynamics: [{ control: 'speed', minimum: 0, jitter: 0 }] }
    const dab = dab160()
    expect(stationary195RateInputRequirements(d)).toEqual({ normalizedSpeed: true, sourceAngle: false })
    expect(hasBrushSourceInputs(d, [dab])).toBe(false)
    expect(hasBrushSourceInputs(d, [{ ...dab, normalizedSpeed: .3 }])).toBe(true)
    expect(hasBrushSourceInputs(d, [{ ...dab, normalizedSpeed: .3 }], dab)).toBe(false)
    d.behavior!.timing.rateDynamics = [{ control: 'initialDirection', minimum: 0, jitter: 0 }]
    expect(hasBrushSourceInputs(d, [dab])).toBe(false)
    expect(hasBrushSourceInputs(d, [{ ...dab, sourceAngle: -.7 }])).toBe(true)
    d.behavior!.timing.rateDynamics = [{ control: 'perspective', minimum: 0, jitter: 0 }]
    expect(stationary195RateInputRequirements(d)).toEqual({ normalizedSpeed: false, sourceAngle: false })
    expect(hasBrushSourceInputs(d, [dab])).toBe(true)
  })
  it('Sketch/Spray use the native float allocation law, other families retain their own law', () => {
    const complete = { ...dab160(), sourceSize: Math.fround(3.4), sourceScale: Math.fround(.8), sourceAngle: .4 }
    for (const l of [library133(), library174()]) {
      const d = l.brushes[0].descriptor
      d.version = 195
      d.behavior!.timing = timing()
      expect(hasBrushSourceInputs(d, [dab160()])).toBe(false)
      expect(hasBrushSourceInputs(d, [complete])).toBe(true)
      expect(hasBrushSourceInputs(d, [complete], dab160())).toBe(false)
    }
    const curve = library167().brushes[0].descriptor
    curve.version = 195
    curve.behavior!.timing = timing()
    expect(hasBrushSourceInputs(curve, [dab160()])).toBe(true)
  })
  it('operation ABI requires canonical pen channels and clock without imposing every family allocation', () => {
    const d = { ...dab160(), sourceTwist: 0, sourceTangentialPressure: 0 }
    const op = { type: 'stroke', preset: 'brush:imported-195195195195195195195195@195', dabs: [d] }
    expect(hasValidRecordedPenOperation(op)).toBe(true)
    expect(hasValidRecordedPenOperation({ ...op, dabs: [{ ...d, sourceTime: undefined }] })).toBe(false)
    expect(hasValidRecordedPenOperation({ ...op, dabs: [{ ...d, sourceTwist: undefined }] })).toBe(false)
    expect(hasValidRecordedPenOperation({ ...op, dabs: undefined, dabsPacked: packDabs([d]) })).toBe(true)
    expect(hasValidRecordedPenOperation({ ...op, strokeEndSample: { ...d, sourceTangentialPressure: undefined } })).toBe(false)
    expect(hasValidRecordedPenOperation({ ...op, preset: op.preset.replace('@195', '@187'), dabs: [dab160()] })).toBe(true)
  })
  it('supports generic recorded Rate controls only in timing2 and leaves timing1 history closed', () => {
    const b = pixel().behavior!
    b.timing!.rateDynamics = [{ control: 'time', minimum: 0, jitter: 0, period: 1000, periodic: false, curve: [[0, 0], [1, 1]] }]
    expect(isBrushBehavior(b)).toBe(true)
    b.timing = { version: 1, rate: 20, ignoreDistanceSpacing: false, rateDynamics: b.timing!.rateDynamics }
    expect(isBrushBehavior(b)).toBe(false)
  })
})


describe.skipIf(!process.env.NATIVE195_LIBRARY)('actual native195 corpus', () => {
  it('admits each whole record and reports the exact derived role', () => {
    const l = JSON.parse(readFileSync(process.env.NATIVE195_LIBRARY!, 'utf8')) as BrushLibrary
    const failures = l.brushes.flatMap(b => {
      const one = { ...l, brushes: [b] }
      const role = resolveStationary195Role(b.descriptor)
      return isBrushLibrary(one) ? [] : [{ name: b.name, role }]
    })
    expect(failures).toEqual([])
    expect(isBrushLibrary(l)).toBe(true)
  })
})
