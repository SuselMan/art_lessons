import { expect, it, vi } from 'vitest'
import { createTestEngine, dab } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { ribbonProfileFor } from './ribbonProfile'
import type { PreparedRibbonMaterial } from './RibbonStrokePainter'

it('prepares water metadata without allocating or drawing GPU material', () => {
  const { engine } = createTestEngine()
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const presetName = 'normal:100:100:PB29:round'
  const preset = engine['_resolvePreset']('watercolor', presetName)
  const profile = ribbonProfileFor('watercolor', presetName)
  const draw = vi.spyOn(engine['gl'], 'drawArrays')
  const allocate = vi.spyOn(engine['_ribbonScratchPool'], 'acquire')
  const dabs = [dab(16, 16, { size: 32, t: 0 }), dab(24, 16, { size: 32, t: 16 })]
  try {
    const prepared = engine['_ribbonPainter']['prepareDelivery'](
      dabs, undefined, preset, profile, scratch, () => 0, 0, 'combined', false, true,
    )
    expect(draw).not.toHaveBeenCalled()
    expect(allocate).not.toHaveBeenCalled()
    expect([...scratch.tileEntries()]).toHaveLength(0)
    expect(scratch.standing.size).toBe(2)
    expect(prepared.waterByDab.size).toBe(2)
    expect(prepared.deposits.every(x => x > 0)).toBe(true)
    expect(scratch.waterUsed).toBeGreaterThan(0)
    expect(scratch.brushTravel).toHaveLength(1)
    const firstWater = [...prepared.waterByDab.values()]
    const later = dab(36, 16, { size: 32, t: 32 })
    engine['_ribbonPainter']['prepareDelivery'](
      [later], dabs[1], preset, profile, scratch, () => 1, 0, 'combined', false, true,
    )
    expect([...prepared.waterByDab.values()]).toEqual(firstWater)
    expect(prepared.waterByDab.has(later)).toBe(false)
  } finally {
    draw.mockRestore(); allocate.mockRestore(); scratch.destroy(); engine.destroy()
  }
})

it('prepares a queued material with original standing keys and no source draws, and cancellation prevents execution', () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  engine.initLayer('L')
  const target = engine['_layers'].get('L')!
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const name = 'normal:100:100:PB29:round'
  const preset = engine['_resolvePreset']('watercolor', name)
  const profile = ribbonProfileFor('watercolor', name)
  const source = [dab(16, 16, { size: 16, t: 0 }), dab(32, 16, { size: 16, t: 16 })]
  const requests: PreparedRibbonMaterial[] = []
  const draw = vi.spyOn(engine['_ribbonPainter']['ctx'], 'drawRibbonNibPass')
  try {
    const preparation = engine['_ribbonPainter'].paint(target, source, preset, name, profile,
      [0.2, 0, 0.6], scratch, undefined, '00', [0.2, 0.3], false, 0,
      { waterOnly: false, segmented: false, deferMaterial: r => requests.push(r) })
    for (const _cost of preparation) void _cost
    expect(draw).not.toHaveBeenCalled()
    expect(requests).toHaveLength(2)
    expect(scratch.standing.has(source[0])).toBe(true)
    expect(scratch.standing.has(source[1])).toBe(true)
    source[0].x = 999
    expect(requests[0].metadata.finish?.bounds.maxX).toBeLessThan(999)
    requests[0].cancel()
    for (const _cost of requests[0].execute()) void _cost
    expect(draw).not.toHaveBeenCalled()
    for (const _cost of requests[1].execute()) void _cost
    expect(draw).toHaveBeenCalled()
    expect(() => requests[1].execute().next()).toThrow(/single-use/)
  } finally {
    draw.mockRestore(); scratch.destroy(); engine.destroy()
  }
})

it('keeps the physical film until its queued material owner advances and rejects premature snapshots', () => {
  const { engine } = createTestEngine()
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const tile = new AccumulationBuffer(engine['gl'], 16, 16)
  try {
    scratch.activateMaterialFilm(0)
    const first = scratch.filmBuffers(tile)!
    const pixels = new Uint8Array(16 * 16 * 4).fill(81)
    first.strokeInk.restorePixels(pixels)
    scratch.newFilm()
    expect(scratch.gesture).toBe(1)
    expect(scratch.materialGesture).toBe(0)
    expect(scratch.filmBuffers(tile)!.strokeInk.readPixels()).toEqual(pixels)
    expect(scratch.snapshot(engine['gl'], () => ({ originX: 0, originY: 0 }))).toBeNull()
    expect(scratch.spill(() => ({ originX: 0, originY: 0 }))).toBeNull()
    scratch.activateMaterialFilm(1)
    expect(scratch.filmBuffers(tile)!.strokeInk.readPixels()).toEqual(new Uint8Array(pixels.length))
    expect(() => scratch.activateMaterialFilm(0)).toThrow(/chronological/)
    expect(() => scratch.activateMaterialFilm(2)).toThrow(/chronological/)
  } finally {
    scratch.destroy(); tile.destroy(); engine.destroy()
  }
})

it('captures historical finish lists without sharing the next film or allocating textures', () => {
  const { engine } = createTestEngine()
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const footprint = { x: 10, y: 20, radius: 4, aspect: 1, angle: 0 }
  const d = dab(10, 20, { size: 8 })
  scratch.gesture = 2
  scratch.paints.add('PB29')
  scratch.wetContacts = [{ ...footprint }]
  scratch.foreignSources = [{ gesture: 'water-before', footprints: [{ ...footprint }], chunks: [{
    id: 'chunk-before', preset: 'normal:100:0:PB29:round', color: [0, 0, 1],
    seed: [0.2, 0.3], wet: '0', dabs: [d],
  }] }]
  const acquire = vi.spyOn(engine['_ribbonScratchPool'], 'acquire')
  try {
    const held = scratch.captureFinishMetadata()
    scratch.newFilm()
    scratch.paints.add('PY154')
    scratch.wetContacts[0].x = 999
    scratch.foreignSources[0].footprints[0].radius = 999
    scratch.foreignSources[0].chunks![0].dabs[0].x = 999
    scratch.foreignSources[0].chunks![0].color[0] = 1
    expect(held.gesture).toBe(2)
    expect([...held.paints]).toEqual(['PB29'])
    expect(held.wetContacts[0].x).toBe(10)
    expect(held.foreignSources![0].footprints[0].radius).toBe(4)
    expect(held.foreignSources![0].chunks![0].dabs[0].x).toBe(10)
    expect(held.foreignSources![0].chunks![0].color).toEqual([0, 0, 1])
    expect(acquire).not.toHaveBeenCalled()
  } finally {
    acquire.mockRestore(); scratch.destroy(); engine.destroy()
  }
})

for (const contextLost of [false, true]) {
  it(`closes a paused foreign-water owner on cancellation (lost=${contextLost})`, () => {
    const { engine } = createTestEngine({}, { width: 64, height: 64 })
    engine.initLayer('L')
    const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
    const water = Array.from({ length: 300 }, (_, i) => dab(20 + i % 3, 20, { size: 8, t: i }))
    scratch.foreignSources = [{ gesture: 'donor', footprints: [{ x: 20, y: 20, radius: 12, aspect: 1, angle: 0 }], chunks: [{
      id: 'water', preset: 'normal:100:0:PB29:round', color: [0, 0, 1], seed: [0.2, 0.3], wet: 'f'.repeat(300), dabs: water,
    }] }]
    const requests: PreparedRibbonMaterial[] = []
    try {
      const painter = engine['_ribbonPainter']
      const name = 'normal:100:100:PB29:round'
      for (const cost of painter.paint(engine['_layers'].get('L')!, [dab(20, 20, { size: 16 })],
        engine['_resolvePreset']('watercolor', name), name, ribbonProfileFor('watercolor', name),
        [0.2, 0, 0.6], scratch, undefined, 'f', [0.2, 0.3], false, 0,
        { waterOnly: false, segmented: true, deferMaterial: r => requests.push(r) })) void cost
      expect(requests).toHaveLength(1)
      const execution = requests[0].execute()
      expect(execution.next().done).toBe(false)
      const aux = [...painter['auxiliaryWater']][0]
      expect(aux).toBeDefined()
      const forget = vi.spyOn(aux, 'forget')
      const destroy = vi.spyOn(aux, 'destroy')
      requests[0].cancel(contextLost)
      expect(painter['auxiliaryWater'].size).toBe(0)
      expect(contextLost ? forget : destroy).toHaveBeenCalledOnce()
      expect(contextLost ? destroy : forget).not.toHaveBeenCalled()
      expect(execution.next().done).toBe(true)
    } finally { scratch.destroy(); engine.destroy() }
  })
}
