import { expect, it, vi } from 'vitest'
import { createTestEngine, dab, makeStroke } from './testing/engineTestUtils'
import { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from './src/dabs/ribbonProfile'
import { pureWaterLayerProof } from './src/watercolor/pureWaterLayerProof'

const water = 'normal:100:0:PB29:round'
function probeLayer(engine: ReturnType<typeof createTestEngine>['engine'], layerId: string) {
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const target = engine['_layers'].get(layerId)!, preset = engine['_resolvePreset']('watercolor', water), profile = ribbonProfileFor('watercolor', water)
  for (const _ of engine['_ribbonPainter'].paint(target, [dab(12, 24, { size: 12 }), dab(40, 24, { size: 12 })], preset, water, profile, [.2, 0, .6], scratch, undefined)) void _
  expect(scratch.pigmentInputsKnownZero).toBe(true)
  expect(scratch.finishContext?.target).toBe(target)
  const prepare = vi.spyOn(engine['_settlePlan'], 'prepare').mockReturnValue(null)
  try {
    engine['_diffuseWashOps'](scratch, [], { minX: 8, minY: 8, maxX: 48, maxY: 48 })
    expect(prepare).toHaveBeenCalledOnce()
    return prepare.mock.calls[0][11]
  } finally { prepare.mockRestore(); scratch.destroy() }
}

it('rejects zero history during a real deferred Undo without blocking another layer', async () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  await engine.paperReady(); engine.setBaseLayers(['L', 'other']); engine['_wcZeroPigmentContacts'] = true
  const paint = makeStroke('a', 'L', [dab(20, 20)], { preset: 'HB', seq: 1 })
  engine.appendOperation(paint, 'remote')
  engine.suspendDisplay()
  try {
    engine.appendOperation({ id: 'undo', type: 'operation_undo', userId: 'a', timestamp: 2, targetOpId: paint.id, seq: 2 }, 'remote')
    expect(engine['_pendingRebuilds'].has('L')).toBe(true)
    expect(pureWaterLayerProof(engine['_log'].entries, 'L', false, false)).toBe(true)
    expect(probeLayer(engine, 'L')).toBe(false)
    expect(probeLayer(engine, 'other')).toBe(true)
  } finally { engine.resumeDisplay(); engine.destroy() }
})

it('rejects the old target while an actual sliced Undo rebuild remains registered', async () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  await engine.paperReady(); engine.setBaseLayers(['L', 'other']); engine['_wcZeroPigmentContacts'] = true
  const paint = makeStroke('a', 'L', [dab(20, 20)], { preset: 'HB', seq: 1 })
  const wet = makeStroke('b', 'L', Array.from({ length: 48 }, (_, i) => dab(8 + i, 28, { size: 12 })), { tool: 'watercolor', preset: water, strokeId: 'water', washId: 'water', wet: '0', seq: 2 })
  engine.appendOperation(paint, 'remote'); engine.appendOperation(wet, 'remote')
  engine['_sliceLimits'].size = 1; engine['_sliceLimits'].budgetMs = 0
  try {
    engine.appendOperation({ id: 'undo', type: 'operation_undo', userId: 'a', timestamp: 3, targetOpId: paint.id, seq: 3 }, 'remote')
    expect(engine['_rebuildJobs'].has('L')).toBe(true)
    expect(pureWaterLayerProof(engine['_log'].entries, 'L', false, false)).toBe(true)
    expect(probeLayer(engine, 'L')).toBe(false)
    expect(probeLayer(engine, 'other')).toBe(true)
  } finally { engine.destroy() }
})

it('rejects an incomplete restored prefix with actual covered Undo repair while unrelated layer stays eligible', async () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  await engine.paperReady(); engine.setBaseLayers(['L', 'other']); engine['_wcZeroPigmentContacts'] = true
  const wet = makeStroke('b', 'L', [dab(20, 20)], { tool: 'watercolor', preset: water, strokeId: 'covered-water', washId: 'covered-water', wet: '0', seq: 2 })
  try {
    engine.restoreLayerFromSnapshot('L', [{ originX: 0, originY: 0, width: 64, height: 64, pixels: new Uint8Array(64 * 64 * 4).fill(200) }], 2)
    await engine.restoreHistoricalOperations([wet])
    engine.appendOperation({ id: 'covered-undo', type: 'operation_undo', userId: 'b', timestamp: 3, targetOpId: wet.id, seq: 3 }, 'remote')
    expect(engine.pendingSnapshotHistoryRepairs()).toEqual([{ layerId: 'L', beforeSeq: 2 }])
    expect(engine.isSnapshotHistoryRepairPending('L')).toBe(true)
    expect(pureWaterLayerProof(engine['_log'].entries, 'L', false, false)).toBe(true)
    expect(probeLayer(engine, 'L')).toBe(false)
    expect(probeLayer(engine, 'other')).toBe(true)
  } finally { engine.destroy() }
})
