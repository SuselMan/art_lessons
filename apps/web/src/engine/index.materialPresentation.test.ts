import { expect, it, vi } from 'vitest'
import { createTestEngine, simulateStroke } from './testing/engineTestUtils'

for (const review of [false, true]) it(`review=${review}: uses real ribbon primitives for queued pigment and reuses a single material owner across gestures`, async () => {
  const { engine } = createTestEngine({ asyncFinish: true, materialPresentation: true, watercolorReview: review, watercolorCoarseTransport: review, gradientFibres: review }, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor')
  engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  expect(engine['_wcMaterialPresentation']).toBe(true)
  expect(engine['_settleQueue'].diagnosticSolverBatchMax).toBe(review ? 1 : 4)
  expect(engine['_settlePlan'].splitQuanta).toBe(review)
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  const stamps = vi.spyOn(engine['_stamps'], 'paint')
  const ribbon = vi.spyOn(engine as unknown as { _drawRibbonNibPass(...args: unknown[]): void }, '_drawRibbonNibPass')
  const complete = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle')
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 24, y: 20 }, { x: 40, y: 20 }])
    const owner = engine['_wcMaterialOwners'].layers.get('L')!
    expect(owner).toBeDefined()
    expect(owner.pending.size).toBeGreaterThan(0)
    expect(engine['_wcCanonical'].pending).toBe(true)
    expect(ribbon).toHaveBeenCalled()
    expect(stamps).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    engine.setColor([1, 1, 0])
    simulateStroke(engine, [{ x: 12, y: 40 }, { x: 24, y: 40 }, { x: 40, y: 40 }])
    expect(engine['_wcMaterialOwners'].layers.get('L')).toBe(owner)
    const first = [...engine['_wcMaterialKeys'].values()][0]
    const pendingBefore = owner.pending.size
    engine['_releaseAsyncPresentation'](first.scratch, first.gesture, false)
    expect(engine['_wcMaterialOwners'].layers.get('L')).toBe(owner)
    expect(owner.pending.size).toBeGreaterThan(0)
    expect(owner.pending.size).toBeLessThan(pendingBefore)
    expect(engine['_wcAsyncPresentations'].size).toBe(0)
    expect(engine['_wcMaterialOwners'].bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
    const allocated = owner.material.pool.bytes
    expect(allocated.live + allocated.free + owner.material.buffer.width * owner.material.buffer.height * 4)
      .toBeLessThanOrEqual(engine['_wcMaterialOwners'].bytes)
    expect(owner.material.raster.paperWet.peak(performance.now())).toBeGreaterThan(0)
    expect(engine['_materialPresentationLayers']().get('L')?.buffer).toBe(owner.material.buffer)
    expect(engine['_log'].entries.filter(e => e.op.type === 'stroke')).toHaveLength(2)
    const draw = vi.spyOn(engine['gl'], 'drawArrays'), remove = vi.spyOn(engine['gl'], 'deleteTexture')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(engine['_wcMaterialOwners'].layers.size).toBe(0)
    expect(engine['_wcMaterialKeys'].size).toBe(0)
    expect(draw).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
    draw.mockRestore(); remove.mockRestore()
  } finally { stamps.mockRestore(); ribbon.mockRestore(); complete.mockRestore(); engine.destroy() }
})

it('hands the layer back while canonical reveal is still animating, after all input was materialized', async () => {
  const { engine } = createTestEngine({ asyncFinish: true, materialPresentation: true }, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor')
  engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 24, y: 20 }, { x: 40, y: 20 }])
    const owner = engine['_wcMaterialOwners'].layers.get('L')!
    // Pending accepted input must keep the provisional layer.
    expect(engine['_materialPresentationLayers']().has('L')).toBe(true)
    for (const key of [...owner.pending]) engine['_wcMaterialOwners'].retire(owner, key)
    owner.material.scratches.clear()
    // Only the layer id is consulted here: create a reveal identity without
    // a fake material texture or depending on solver progress in this test.
    const reveals = engine['_washReveals'] as unknown as Map<object, { layerId: string }>
    const identity = {}; reveals.set(identity, { layerId: 'L' })
    try {
      expect(engine['_materialPresentationLayers']().has('L')).toBe(false)
      expect(reveals.has(identity)).toBe(true)
    } finally { reveals.delete(identity) }
  } finally { engine.destroy() }
})
