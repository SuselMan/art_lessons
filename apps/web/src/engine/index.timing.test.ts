import { afterEach, expect, it } from 'vitest'
import { BoundedGlTiming } from './src/diagnostics/BoundedGlTiming'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke, simulateStrokeStart, simulateStrokeEnd } from './testing/engineTestUtils'
import type { PencilEngine } from './index'
const engines: PencilEngine[] = []
afterEach(() => { for (const e of engines.splice(0)) if (!e['_destroyed']) e.destroy() })
it('bounded observations preserve original results/errors and own exported records', () => {
  let tick = 0
  const timer = new BoundedGlTiming(() => ++tick, 2)
  timer.beginInput()
  expect(timer.measure('ok', () => 17)).toBe(17)
  const sentinel = Error('material failure')
  expect(() => timer.measure('failed', () => { throw sentinel })).toThrow(sentinel)
  timer.firstPigment(); timer.firstPigment()
  const records = timer.export()
  expect(records.map(x => x.phase)).toEqual(['failed', 'first-pigment-submit'])
  ;(records[0] as { phase: string }).phase = 'mutated'
  expect(timer.export()[0].phase).toBe('failed')
  const broken = new BoundedGlTiming(() => { throw Error('observer clock') })
  expect(broken.measure('ok', () => 19)).toBe(19)
  expect(() => broken.measure('bad', () => { throw sentinel })).toThrow(sentinel)
  expect(broken.export()).toEqual([])
})
async function setup(enabled: boolean) {
  const { engine: e } = createTestEngine({ userId: 'a', diagnosticGlTiming: enabled }, { width: 64, height: 64 })
  engines.push(e)
  e.appendOperation(makeLayerAdd('a', 'L'))
  e.setCompositeOrder([{ id: 'L', opacity: 1 }]); e.setActiveLayer('L')
  await paperReady(e)
  e.setTool('watercolor'); e.setPencil('normal:100:100:PB29:round'); e.setSize(8)
  return e
}
it('actual pointer route observes source before display, retains pending lifecycle and OFF has no observer', async () => {
  const off = await setup(false)
  simulateStroke(off, [{ x: 24, y: 32 }, { x: 40, y: 32 }])
  expect(off.getDiagnosticGlTiming()).toBeNull()
  expect(off['_ribbonPainter'].diagnosticTiming).toBeNull()
  const e = await setup(true)
  simulateStroke(e, [{ x: 24, y: 32 }, { x: 40, y: 32 }])
  const pending = e['_settle']
  expect(pending).not.toBeNull()
  simulateStrokeStart(e, 24, 32)
  const rows = e.getDiagnosticGlTiming()!
  const phases = rows.filter(x => x.input === 2).map(x => x.phase)
  expect(phases).toContain('admission-complete-settle')
  expect(phases).toContain('scratch-first-touch')
  const scratch = e['_ribbonStrokeScratch']!
  const tile = scratch.tileEntries().next().value![0]
  scratch.filmBuffers(tile)
  expect(e.getDiagnosticGlTiming()!.map(x => x.phase)).toContain('scratch-film-base-copy')
  expect(phases).toContain('live-generator-exhaust')
  expect(phases.indexOf('first-pigment-submit')).toBeLessThan(phases.indexOf('display-submit'))
  expect(phases).toContain('input-down-through-display')
  simulateStrokeEnd(e, 40, 32)
  expect(e['_wcJoinedTouchLease']).toBeNull()
})

it('observer clock failure cannot stop an actual stroke or destroy cleanup', async () => {
  const e = await setup(true)
  const broken = new BoundedGlTiming(() => { throw Error('clock unavailable') })
  e['_glTiming'] = broken
  e['_ribbonPainter'].diagnosticTiming = broken
  simulateStroke(e, [{ x: 24, y: 32 }, { x: 40, y: 32 }])
  expect(e.getOperations().some(op => op.type === 'stroke')).toBe(true)
  expect(e.getDiagnosticGlTiming()).toEqual([])
  e.destroy()
  expect(e['_destroyed']).toBe(true)
})
