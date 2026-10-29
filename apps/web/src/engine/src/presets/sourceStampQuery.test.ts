import { describe, expect, it } from 'vitest'
import oracle from './fixtures/sourceStampQuery.native.json'
import { KritaPerStrokeRandomSource, KritaRandomSource } from './nativeRandom'
import { type SourceOption } from './sourceOption'
import { SourceStampQueryExecutor, type SourceStampBoundary, type SourceStampOptionId, type SourceStampOptions } from './sourceStampQuery'
const ids: SourceStampOptionId[] = ['Size', 'Rotation', 'Ratio', 'Scatter', 'Opacity', 'Flow', 'Mirror', 'Spacing', 'Rate']
const options = (): SourceStampOptions => Object.fromEntries(ids.map(id => [id, {
  id, checked: true, useCurve: true, curveMode: 0, strength: 1, min: 0, max: 1,
  sensors: [{ id: 'fuzzyPerDab', kind: 'additive' }],
} satisfies SourceOption])) as unknown as SourceStampOptions
const info = { x: 13, y: 17, drawingAngle: .3, canvasRotation: 0, mirroredH: false, mirroredV: false }
const boundary: SourceStampBoundary = { canPaint: true, lodScale: 1, scatterX: true, scatterY: true, mirrorX: true, mirrorY: true, indirectPainting: false, checkSizeTooSmall: () => false, maskExtent: () => [24, 27] }
const context = () => ({ random: new KritaRandomSource(4321), perStroke: new KritaPerStrokeRandomSource(7654), hover: false })
describe('isolated stamp source query ordering', () => {
  it('matches compiled actual native paintAt call order and both early returns', () => {
    const executor = new SourceStampQueryExecutor(options(), context())
    const filter = (row: string[]) => row.filter(id => !['Softness', 'Lightness', 'material'].includes(id))
    expect(executor.execute('paint', info, boundary).events.map(v => v.option)).toEqual(filter(oracle.cases[0]))
    expect(executor.execute('paint', info, { ...boundary, canPaint: false }).events.map(v => v.option)).toEqual(filter(oracle.cases[1]))
    expect(executor.execute('paint', info, { ...boundary, checkSizeTooSmall: () => true }).events.map(v => v.option)).toEqual(filter(oracle.cases[2]))
  })
  it('refresh queries advance the SAME source used by the next paint, including Mirror', () => {
    const ctx = context(), executor = new SourceStampQueryExecutor(options(), ctx)
    const refresh = executor.execute('spacing', info, boundary)
    expect(refresh.events.map(v => v.option)).toEqual(['Size', 'Rotation', 'Mirror', 'Spacing'])
    expect(ctx.random.snapshot().draws).toBe(4)
    const paint = executor.execute('paint', info, boundary)
    expect(paint.events.map(v => v.option)).toEqual(['Size', 'Rotation', 'Ratio', 'Scatter', 'Opacity', 'Flow', 'Mirror', 'Spacing', 'Rate'])
    // Nine option queries plus two geometric XY draws, not nine hash samples.
    expect(ctx.random.snapshot().draws).toBe(15)
    expect(paint.events[0].drawsBefore).toBe(4)
    expect(paint.events[4].drawsBefore).toBe(10)
  })
  it('matches compiled actual native Mirror axis short-circuit including both axes enabled', () => {
    for (const row of oracle.mirror.cases) {
      const base = options(), o = { ...base, Mirror: { ...base.Mirror, checked: !!row.checked } }
      const result = new SourceStampQueryExecutor(o, context()).execute('spacing', info, { ...boundary, mirrorX: !!row.x, mirrorY: !!row.y })
      expect(result.events.filter(v => v.option === 'Mirror').length).toBe(row.queries)
    }
  })
  it('preserves early-return consumption and still evaluates wrapper timing', () => {
    const ctx = context(), executor = new SourceStampQueryExecutor(options(), ctx)
    expect(executor.execute('paint', info, { ...boundary, canPaint: false }).events.map(v => v.option)).toEqual(['Rate'])
    expect(executor.execute('paint', info, { ...boundary, checkSizeTooSmall: () => true }).events.map(v => v.option)).toEqual(['Size', 'Rate'])
    expect(executor.execute('timing', info, boundary).events.map(v => v.option)).toEqual(['Rate'])
    expect(ctx.random.snapshot().draws).toBe(4)
  })
  it('zero effective Scatter still consumes both geometry draws; disabled axes consume none', () => {
    const base = options(), o = { ...base, Scatter: { ...base.Scatter, useCurve: false, strength: 0 } }
    const ctx = context(), executor = new SourceStampQueryExecutor(o, ctx)
    const paint = executor.execute('paint', info, boundary)
    expect([paint.x, paint.y]).toEqual([info.x, info.y])
    expect(ctx.random.snapshot().draws).toBe(10)
    const noAxes = context()
    new SourceStampQueryExecutor(o, noAxes).execute('paint', info, { ...boundary, scatterX: false, scatterY: false, mirrorX: false, mirrorY: false })
    expect(noAxes.random.snapshot().draws).toBe(7)
  })
  it('shared parent/child ownership and checkpoint restoration do not invent a second source', () => {
    const ctx = context(), parent = new SourceStampQueryExecutor(options(), ctx), child = new SourceStampQueryExecutor(options(), ctx)
    parent.execute('spacing', info, boundary)
    const checkpoint = { random: ctx.random.snapshot(), keyed: ctx.perStroke.snapshot() }
    const expected = child.execute('paint', info, boundary)
    const restored = { random: KritaRandomSource.restore(checkpoint.random), perStroke: KritaPerStrokeRandomSource.restore(checkpoint.keyed), hover: false }
    expect(new SourceStampQueryExecutor(options(), restored).execute('paint', info, boundary)).toEqual(expected)
    expect(restored.random.snapshot()).toEqual(ctx.random.snapshot())
  })
  it('executes actual PNG cache planning and both Mirror stages on the same source even on a hit', () => {
    const base = options()
    const o = Object.fromEntries(ids.map(id => [id, { ...base[id], checked: id !== 'Rotation', useCurve: false }])) as unknown as SourceStampOptions
    const mirror = { ...o.Mirror, strength: 0, useCurve: true, sensors: [{ id: 'fuzzyPerDab' as const, kind: 'additive' as const }] }
    const ctx = context(), executor = new SourceStampQueryExecutor({ ...o, Mirror: mirror }, ctx)
    const request = { brushIdentity: 'fixture-png-100x80', color: 'native-black', softness: 1, lightness: 1, precisionLevel: 1, autoPrecision: false, imprecisePosition: true,
      disableSubpixel: false, supportsCaching: true, solidColor: true, textureEnabled: false, sharpnessChecked: false }
    const brush = { width: 100, height: 80, scale: 1, angle: 0 }
    const configured = { ...boundary, scatterX: false, scatterY: false,
      checkSizeTooSmall: () => { throw new Error('External size callback must not replace PNG source law') },
      maskExtent: () => { throw new Error('External geometry callback must not replace PNG source law') },
      sourceCache: { brush, state: { nextSequence: 0 }, request } }
    const first = executor.execute('paint', info, configured)
    expect(first.events.filter(v => v.option === 'Mirror').map(v => v.stage)).toEqual(['material', 'spacing'])
    expect(first.material?.type).toBe('Dab')
    const next = executor.execute('paint', info, { ...configured, sourceCache: { brush, state: first.material!.state, request } })
    expect(next.material?.type).toBe('Copy')
    expect(next.material?.sourceSequence).toBe(0)
    expect(ctx.random.snapshot().draws).toBe(4)
    expect(next.events.filter(v => v.option === 'Mirror').map(v => [v.stage, v.drawsBefore, v.drawsAfter])).toEqual([['material', 2, 3], ['spacing', 3, 4]])
    expect(() => executor.execute('paint', info, { ...configured, material: () => {} })).toThrow('Ambiguous')
  })
  it('material boundary consumes before Mirror/Spacing and wrapper Rate', () => {
    const ctx = context(), executor = new SourceStampQueryExecutor(options(), ctx)
    const result = executor.execute('paint', info, { ...boundary, material: source => { source.random.generateNormalized() } })
    expect(result.events.find(v => v.option === 'Mirror')?.drawsBefore).toBe(9)
    expect(ctx.random.snapshot().draws).toBe(12)
  })
})
