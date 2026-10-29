import { describe, expect, it } from 'vitest'
import geometry from './fixtures/sourceDabGeometry.native.json'
import cacheOracle from './fixtures/sourceDabCache.native.json'
import { KritaPerStrokeRandomSource, KritaRandomSource } from './nativeRandom'
import { type SourceOption } from './sourceOption'
import { planSourcePngDab, sourceDabKeysEqual, sourceMirror, type SourceDabCacheRequest } from './sourceDabCache'
import { sourcePngHotSpot, sourceQRound } from './sourcePngGeometry'
const context = () => ({ random: new KritaRandomSource(4321), perStroke: new KritaPerStrokeRandomSource(7654), hover: false })
const mirror: SourceOption = { id: 'Mirror', checked: true, useCurve: false, curveMode: 0, strength: 1, min: 0, max: 1, sensors: [] }
const base = { brushIdentity: 'fixture-png', color: 'native-rgba8-black@srgb', softness: 1, lightness: 1, precisionLevel: 1, autoPrecision: false, imprecisePosition: true, disableSubpixel: false, supportsCaching: true, solidColor: true, textureEnabled: false, sharpnessChecked: false }
describe('bounded native PNG material/cache planner', () => {
  it('uses pinned Qt5 negative-half rounding instead of Math.round signed-zero or C round-away', () => {
    expect([-2.5, -1.5, -.5, 0, .5, 1.5].map(sourceQRound)).toEqual([-2, -1, 0, 0, 1, 2])
    expect(Object.is(sourceQRound(-.5), -0)).toBe(false)
  })
  it('matches640 actual native calculateDabRect/pyramid/hotSpot method cases exactly', () => {
    for (const row of geometry.cases) {
      const m = row.mirror
      const mirrorInput = m.coordinateSystemFlipped
        ? { canvasH: !m.horizontal, canvasV: m.vertical, enableH: true, enableV: false }
        : { canvasH: m.horizontal, canvasV: m.vertical, enableH: false, enableV: false }
      const result = planSourcePngDab(row.brush, { ...base, x: row.x, y: row.y, shape: row.shape }, { nextSequence: 0 }, mirror, context(), mirrorInput)
      expect([result.requestedRect.x, result.requestedRect.y, result.requestedRect.width, result.requestedRect.height,
        result.key.subPixelX, result.key.subPixelY, result.shape.rotation, ...sourcePngHotSpot(row.brush, row.shape)], JSON.stringify(row)).toEqual(row.output)
    }
  })
  it('matches56 actual native fetchDabGenerationInfo/cache transitions including both Mirror calls', () => {
    const brush = { width: 100, height: 80, scale: 1, angle: 0 }
    const flags = { canvasH: false, canvasV: false, enableH: true, enableV: true }
    const randomMirror = { ...mirror, strength: 0, useCurve: true, sensors: [{ id: 'fuzzyPerDab' as const, kind: 'additive' as const }] }
    for (const trace of cacheOracle.traces) {
      const ctx = context()
      let state: import('./sourceDabCache').SourceDabCacheState = { nextSequence: 0 }
      trace.requests.forEach((request, i) => {
        const result = planSourcePngDab(brush, { ...request, brushIdentity: 'fixture-png-100x80' }, state, randomMirror, ctx, flags)
        const afterMaterial = ctx.random.snapshot().draws
        sourceMirror(randomMirror, ctx, flags) // Native effectiveSpacing applies it again.
        const output = [result.type !== 'Dab' ? 1 : 0, request.textureEnabled ? 1 : 0,
          result.sourceSequence, result.resolvedRect.x, result.resolvedRect.y, result.resolvedRect.width, result.resolvedRect.height,
          result.state.saved!.key.width, result.state.saved!.key.height, afterMaterial, ctx.random.snapshot().draws]
        expect(output, JSON.stringify({ request, i })).toEqual(trace.outputs[i])
        state = result.state
      })
    }
  })
  it('draws Mirror once even on a hit, retaining the last generated key/bitmap', () => {
    const brush = { width: 100, height: 100, scale: 1, angle: 0 }
    const request: SourceDabCacheRequest = { ...base, x: 0, y: 0, shape: { scale: 1, ratio: 1, rotation: 0 } }
    const ctx = context(), randomMirror = { ...mirror, strength: 0, useCurve: true, sensors: [{ id: 'fuzzyPerDab' as const, kind: 'additive' as const }] }
    const flags = { canvasH: false, canvasV: false, enableH: true, enableV: true }
    const first = planSourcePngDab(brush, request, { nextSequence: 0 }, randomMirror, ctx, flags)
    const hit = planSourcePngDab(brush, { ...request, shape: { ...request.shape, scale: 1.01 } }, first.state, randomMirror, ctx, flags)
    expect(ctx.random.snapshot().draws).toBe(2)
    expect(hit.type).toBe('Copy')
    expect(hit.state.saved).toBe(first.state.saved)
    expect(hit.sourceSequence).toBe(0)
    expect(hit.requestedRect.width).toBe(102)
    expect(hit.resolvedRect.width).toBe(100)
    expect(hit.key.width).toBe(102)
    expect(hit.shape.scale).toBe(1.01)
    expect(hit.resolvedShape.scale).toBe(1)
    const miss = planSourcePngDab(brush, { ...request, color: 'different-native-color' }, hit.state, randomMirror, ctx, flags)
    expect(miss.type).toBe('Dab')
    expect(miss.sourceSequence).toBe(2)
  })
  it('returns an immutable self-contained original material when different scales quantize to the same extent', () => {
    const brush = { width: 100, height: 100, scale: 1, angle: 0 }
    const request: SourceDabCacheRequest = { ...base, x: .1, y: .1, shape: { scale: 1, ratio: 1, rotation: 0 } }
    const flags = { canvasH: false, canvasV: false, enableH: false, enableV: false }
    const first = planSourcePngDab(brush, request, { nextSequence: 0 }, mirror, context(), flags)
    const next = planSourcePngDab(brush, { ...request, shape: { ...request.shape, scale: 1.001 } }, first.state, mirror, context(), flags)
    expect(next.key.width).toBe(first.key.width)
    expect(next.type).toBe('Copy')
    expect(next.shape.scale).toBe(1.001)
    expect(next.resolvedSource).toBe(first.resolvedSource)
    expect(next.resolvedSource.shape.scale).toBe(1)
    expect(next.resolvedSource.key.subPixelX).toBe(first.key.subPixelX)
    expect(next.resolvedSource.brushIdentity).toBe('fixture-png')
    expect(next.resolvedSource.brush).toEqual(brush)
    expect(next.resolvedSource.position).toEqual({ x: .1, y: .1 })
    expect(Object.isFrozen(next.resolvedSource)).toBe(true)
    expect(Object.isFrozen(next.resolvedSource.shape)).toBe(true)
    expect(Object.isFrozen(next.resolvedSource.key)).toBe(true)
    const cold = structuredClone(next.resolvedSource)
    expect(cold.shape.scale).toBe(1) // No previous-request or seq lookup required.
    const changedBrush = planSourcePngDab(brush, { ...request, brushIdentity: 'different-asset' }, next.state, mirror, context(), flags)
    expect(changedBrush.type).toBe('Dab')
  })
  it('separates canvas mirrors from coordinateSystemFlipped and preserves both-axis consumption', () => {
    const ctx = context(), randomMirror = { ...mirror, useCurve: true, sensors: [{ id: 'fuzzyPerDab' as const, kind: 'additive' as const }] }
    const out = sourceMirror(randomMirror, ctx, { canvasH: true, canvasV: false, enableH: true, enableV: true })
    expect(out.coordinateSystemFlipped).toBe(false)
    expect(ctx.random.snapshot().draws).toBe(1)
    sourceMirror(randomMirror, ctx, { canvasH: false, canvasV: false, enableH: false, enableV: false })
    expect(ctx.random.snapshot().draws).toBe(1)
  })
  it('uses asymmetric current-size precision and separate texture postprocess cache hits', () => {
    const brush = { width: 100, height: 100, scale: 1, angle: 0 }
    const request: SourceDabCacheRequest = { ...base, x: 0, y: 0, shape: { scale: 1, ratio: 1, rotation: 0 } }
    const flags = { canvasH: false, canvasV: false, enableH: false, enableV: false }
    const first = planSourcePngDab(brush, request, { nextSequence: 0 }, mirror, context(), flags)
    expect(sourceDabKeysEqual({ ...first.key, width: 105 }, first.key, 1)).toBe(true)
    expect(sourceDabKeysEqual({ ...first.key, width: 106 }, first.key, 1)).toBe(false)
    const post = planSourcePngDab(brush, { ...request, textureEnabled: true }, first.state, mirror, context(), flags)
    expect(post.type).toBe('Postprocess')
    const sharp = planSourcePngDab(brush, { ...request, softness: .9 }, first.state, mirror, context(), flags)
    expect(sharp.type).toBe('Dab')
  })
})
