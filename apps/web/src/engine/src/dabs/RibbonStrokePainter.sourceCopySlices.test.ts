import { describe, expect, it, vi } from 'vitest'
import { createTestEngine, dab } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from './ribbonProfile'
import type { RibbonStrokePainterContext } from './RibbonStrokePainter'

describe('source copy sliced scheduling (#728)', () => {
  function run(enabled: boolean, pieceTris: number, defer: boolean) {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('L')
    const painter = engine['_ribbonPainter']
    painter.diagnosticSegmentDelivery = 'combined'
    painter.diagnosticSolventField = true
    painter.diagnosticSourceCopySlices = enabled
    const ctx = (painter as unknown as { ctx: RibbonStrokePainterContext }).ctx
    const events: string[] = [], units: string[][] = []
    const methods = ['fieldOp', 'drawRibbonNibPass', 'drawRibbonBands', 'drawRibbonCompositeRect', 'setLiveComposite', 'markPaperDamage'] as const
    const spies = methods.map(name => {
      const original = ctx[name].bind(ctx)
      return vi.spyOn(ctx, name).mockImplementation(((...args: unknown[]) => {
        events.push(name === 'fieldOp' ? `field:${args[3]}:${JSON.stringify((args[5] as { scissor?: unknown })?.scissor)}` : name)
        return (original as (...a: unknown[]) => unknown)(...args)
      }) as never)
    })
    const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
    const presetName = 'normal:100:100:PB29:round'
    const work = painter.paint(engine['_layers'].get('L')!, [dab(20, 24, {size: 12}), dab(28, 28, {size:12})], engine['_resolvePreset']('watercolor', presetName), presetName, ribbonProfileFor('watercolor', presetName, 0), [0.2, 0, 0.6], scratch, undefined, '00', [1, 2], defer, pieceTris)
    try {
      let cursor = 0
      for (;;) {
        const step = work.next()
        units.push(events.slice(cursor)); cursor = events.length
        // The captured scheduling choice survives a later flag change.
        painter.diagnosticSourceCopySlices = !enabled
        if (step.done) break
      }
      return { events, units }
    } finally { work.return(); spies.forEach(s => s.mockRestore()); scratch.destroy(); engine.destroy() }
  }
  it.each([false, true])('preserves material/composite command order (deferred=%s)', defer => {
    const old = run(false, 256, defer), split = run(true, 256, defer)
    expect(split.events).toEqual(old.events)
    expect(split.units.length).toBeGreaterThan(old.units.length)
    const copies = split.units.filter(u => u.some(e => e.startsWith('field:1:')))
    expect(copies.length).toBeGreaterThan(0)
    // Each copy-containing quantum has V alone or the complete adjacent P/C pair.
    for (const unit of copies) {
      const fields = unit.filter(e => e.startsWith('field:1:'))
      expect([1, 2]).toContain(fields.length)
      if (fields.length === 2) expect(unit.indexOf(fields[1])).toBe(unit.indexOf(fields[0]) + 1)
    }
  })
  it('does not change unsliced native scheduling', () => {
    expect(run(true, 0, false)).toEqual(run(false, 0, false))
  })
})
