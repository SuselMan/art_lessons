import { expect, it, vi } from 'vitest'
import { createTestEngine, simulateStroke } from './testing/engineTestUtils'

it('uses real ribbon primitives for queued pigment and reuses a single material owner across gestures', async () => {
  const { engine } = createTestEngine({ asyncFinish: true, materialPresentation: true }, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor')
  engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  expect(engine['_wcMaterialPresentation']).toBe(true)
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
