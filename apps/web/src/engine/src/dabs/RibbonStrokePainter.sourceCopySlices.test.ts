import { describe, expect, it, vi } from 'vitest'
import { createTestEngine, dab, makeStroke } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from './ribbonProfile'
import type { RibbonStrokePainterContext } from './RibbonStrokePainter'

describe('source copy sliced scheduling (#728)', () => {
  function run(enabled: boolean, pieceTris: number, defer: boolean) {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('L')
    engine['_minmaxExt'] = { MAX_EXT: 0x8008 }
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
      if (fields.length === 2) {
        const indices = unit.flatMap((event, index) => event.startsWith('field:1:') ? [index] : [])
        expect(indices[1]).toBe(indices[0] + 1)
      }
    }
  })
  it('does not change unsliced native scheduling', () => {
    expect(run(true, 0, false)).toEqual(run(false, 0, false))
  })
})

describe('source copy boundary lifetime (#728)', () => {
  it.each([['V', 'return'], ['PC', 'return'], ['V', 'context-loss'], ['PC', 'context-loss']] as const)('closes after %s with %s without late writes', (boundary, teardown) => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('L')
    engine['_minmaxExt'] = { MAX_EXT: 0x8008 }
    const painter = engine['_ribbonPainter']
    painter.diagnosticSegmentDelivery = 'combined'
    painter.diagnosticSolventField = true
    painter.diagnosticSourceCopySlices = true
    const ctx = (painter as unknown as { ctx: RibbonStrokePainterContext }).ctx
    engine['_minmaxExt'] = { MAX_EXT: 0x8008 }
    const minmax = vi.spyOn(ctx, 'minmaxExt').mockReturnValue({ MAX_EXT: 0x8008 })
    const field = vi.spyOn(ctx, 'fieldOp'), composite = vi.spyOn(ctx, 'drawRibbonCompositeRect')
    const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
    const presetName = 'normal:100:100:PB29:round'
    const work = painter.paint(engine['_layers'].get('L')!, [dab(20, 24, { size: 12 })], engine['_resolvePreset']('watercolor', presetName), presetName, ribbonProfileFor('watercolor', presetName, 0), [0.2, 0, 0.6], scratch, undefined, '0', [1, 2], false, 256)
    let reached = false, visited = 0
    try {
      for (let step = 0; step < 100; step++) {
        const before = field.mock.calls.length
        const next = work.next()
        const copies = field.mock.calls.slice(before).filter(c => c[3] === 1 && c[4] === 1 && c[5]?.scissor)
        if (copies.length) {
          visited++
          if ((boundary === 'V' && copies.length === 1) || (boundary === 'PC' && copies.length === 2)) {
            expect(next.done).toBe(false)
            expect(next.value).toBe(copies.reduce((sum, c) => sum + c[5]!.scissor![2] * c[5]!.scissor![3], 0))
            if (boundary === 'PC') expect(copies[0][5]!.scissor).toEqual(copies[1][5]!.scissor)
            reached = true
            break
          }
        }
        if (next.done) break
      }
      expect(reached).toBe(true)
      expect(visited).toBeGreaterThan(0)
      expect(composite).not.toHaveBeenCalled()
      const writes = field.mock.calls.length
      const destroy = vi.spyOn(scratch, 'destroy')
      const abort = vi.fn(() => { work.return(); scratch.destroy() })
      const complete = vi.fn()
      const queue = engine['_settleQueue']
      queue.start(scratch, [() => {}, () => { work.next() }], complete, { isAlive: () => scratch.live, abort })
      if (teardown === 'context-loss') engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
      else queue.cancel()
      // Returning the stopped generator and advancing the old queue cannot resume writes.
      work.return(); expect(work.next().done).toBe(true)
      queue.advance(); queue.complete(); queue.cancel()
      expect(field.mock.calls.length).toBe(writes)
      expect(composite).not.toHaveBeenCalled()
      expect(abort).toHaveBeenCalledOnce()
      expect(destroy).toHaveBeenCalledOnce()
      expect(scratch.live).toBe(false)
      expect(complete).not.toHaveBeenCalled()
      expect(queue.current).toBeNull()
      if (teardown === 'return') {
        const successor = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
        const nextWork = vi.fn(), done = vi.fn()
        queue.start(successor, [() => {}, nextWork], done, { isAlive: () => true, abort: () => successor.destroy() })
        queue.advance()
        expect(nextWork).toHaveBeenCalledOnce(); expect(done).toHaveBeenCalledOnce()
        successor.destroy()
      }
    } finally { work.return(); minmax.mockRestore(); field.mockRestore(); composite.mockRestore(); if (scratch.live) scratch.destroy(); engine.destroy() }
  })
})

describe('actual Engine sliced-job source boundary cancellation (#728)', () => {
  it.each([['V', 'cancel'], ['PC', 'cancel'], ['V', 'context-loss'], ['PC', 'context-loss']] as const)('aborts registered Engine job after %s via %s', (boundary, teardown) => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('L')
    engine['_minmaxExt'] = { MAX_EXT: 0x8008 }
    engine['_sliceLimits'].budgetMs = 0
    engine['_sliceLimits'].size = 1
    const painter = engine['_ribbonPainter']
    painter.diagnosticSegmentDelivery = 'combined'
    painter.diagnosticSolventField = true
    painter.diagnosticSourceCopySlices = true
    const ctx = (painter as unknown as { ctx: RibbonStrokePainterContext }).ctx
    const field = vi.spyOn(ctx, 'fieldOp'), composite = vi.spyOn(ctx, 'drawRibbonCompositeRect')
    const work = engine['_ribbonDabsWork'].bind(engine)
    const returns: ReturnType<typeof vi.fn>[] = []
    const factory = vi.spyOn(engine as unknown as { _ribbonDabsWork: typeof work }, '_ribbonDabsWork').mockImplementation((...args) => {
      const generator = work(...args)
      returns.push(vi.spyOn(generator, 'return'))
      return generator
    })
    try {
      const op = makeStroke('remote', 'L', [dab(20, 24, { size: 12 })], { tool: 'watercolor', preset: 'normal:100:100:PB29:round', strokeId: 'boundary', washId: 'boundary', wet: '0' })
      engine['_paintOpOverFrames'](engine['_layers'].get('L')!, op, op.dabs!)
      let reached = false
      for (let step = 0; step < 100 && engine['_settle']; step++) {
        const before = field.mock.calls.length
        engine['_settleQueue'].advance()
        const copies = field.mock.calls.slice(before).filter(c => c[3] === 1 && c[4] === 1 && c[5]?.scissor)
        if ((boundary === 'V' && copies.length === 1) || (boundary === 'PC' && copies.length === 2)) { reached = true; break }
      }
      expect(reached).toBe(true)
      expect(engine['_settle']).not.toBeNull()
      const scratch = engine['_settle']!.scratch
      expect(scratch.live).toBe(true)
      const writes = field.mock.calls.length, composites = composite.mock.calls.length
      if (teardown === 'context-loss') engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
      else engine['_cancelSettle']()
      engine['_settleQueue'].advance(); engine['_settleQueue'].complete(); engine['_cancelSettle']()
      expect(field.mock.calls.length).toBe(writes)
      expect(composite.mock.calls.length).toBe(composites)
      expect(returns).toHaveLength(1)
      expect(returns[0]).toHaveBeenCalledOnce()
      expect(engine['_settle']).toBeNull()
      // Loss closes the coroutine immediately; old replay handles are forgotten
      // by the existing restoration owner, not by cancellation itself.
      expect(scratch.live).toBe(true)
      if (teardown === 'context-loss') {
        engine['_handleContextRestored']()
        expect(scratch.live).toBe(false)
        expect(engine['_replayRibbonChunks'].size).toBe(0)
        engine['_settleQueue'].advance()
        expect(returns[0]).toHaveBeenCalledOnce()
      }
    } finally { factory.mockRestore(); field.mockRestore(); composite.mockRestore(); engine.destroy() }
  })
})
