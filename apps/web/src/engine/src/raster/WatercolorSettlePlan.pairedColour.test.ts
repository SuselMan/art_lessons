import { expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from '../dabs/ribbonProfile'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'

type Finish = NonNullable<RibbonStrokeScratch['finishContext']>
for (const [paired, preserveField, hasTravel] of [[false, false, true], [true, false, true], [true, true, false], [true, false, false]] as const) it(`single-paint field opt-ins latch: paired=${paired}, detail=${preserveField}, travel=${hasTravel}`, () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 1024, height: 1024 })
  const p = engine as unknown as { _ribbonScratchPool: RibbonScratchPool; _watercolorPasses: WatercolorPasses; _settlePlan: WatercolorSettlePlan; _layers: Map<string, Finish['target']>; _resolvePreset(tool: 'watercolor', preset: string): Finish['preset'] }
  engine.initLayer('paired-opt-in')
  const tile = p._ribbonScratchPool.acquire(1024, 1024), scratch = new RibbonStrokeScratch(p._ribbonScratchPool, true, true)
  scratch.filmBuffers(tile); scratch.paints.add('1,0,0'); scratch.pigmentInputsKnownZero = false
  scratch.brushTravel = [{ x: 512, y: 512, radius: 128, aspect: 1, angle: 0, dx: 180, dy: 0, water: 1 }]
  if (!hasTravel) scratch.brushTravel = []
  const preset = 'normal:100:69:PB15:round:wc@front8-detail-flow-v4', bounds = { minX: 100, minY: 200, maxX: 900, maxY: 800 }
  scratch.noteFinish({ target: p._layers.get('paired-opt-in')!, preset: p._resolvePreset('watercolor', preset), profile: ribbonProfileFor('watercolor', preset)!, color: [1, 0, 0], opacity: 1, bounds, fieldSeed: [0, 0], landedWet: 1, wetPeak: 1, radiusPx: 128, dwellMs: 0 })
  p._settlePlan.diagnosticSkipBrushContacts = true
  p._settlePlan.diagnosticAlwaysPairedColour = paired
  p._settlePlan.diagnosticPreserveBrushField = preserveField
  const detail = vi.spyOn(p._watercolorPasses.materialReconstruction(), 'pigment')
  const colorize = vi.spyOn(p._watercolorPasses, 'pigmentColor')
  const plan = p._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], bounds, .2, 128, 1, 1, 1, 1)!
  p._settlePlan.diagnosticAlwaysPairedColour = !paired
  p._settlePlan.diagnosticPreserveBrushField = !preserveField
  try {
    for (let i = 0; i < plan.ops.length; i++) plan.ops[i]()
    plan.finish()
    // Paired transport keeps the existing optical record; the default still rebuilds one paint.
    if (paired) expect(colorize).not.toHaveBeenCalled()
    else expect(colorize).toHaveBeenCalled()
    expect(detail.mock.calls.some(([request]) => request.preserveBrush)).toBe(preserveField || hasTravel)
    expect(scratch.paints.size).toBe(1)
    expect(scratch.pigmentInputsKnownZero).toBe(false)
  } finally {
    plan.dispose(); colorize.mockRestore(); detail.mockRestore(); scratch.destroy(); p._ribbonScratchPool.release(tile); engine.destroy()
  }
})
