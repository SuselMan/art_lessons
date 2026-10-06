import { describe, expect, it, vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { PencilPreset } from '../presets/pencilPresets'
import { ribbonProfileFor } from './ribbonProfile'
import type { WatercolorSettleQueue } from '../watercolor/WatercolorSettleQueue'
import type { RibbonStrokePainter, RibbonStrokePainterContext } from './RibbonStrokePainter'

type Probe = { gl: WebGLRenderingContext; _settleQueue: WatercolorSettleQueue; _handleContextLost(e: Event): void; _ribbonPainter: RibbonStrokePainter; _ribbonScratchPool: RibbonScratchPool; _layers: Map<string, ILayerBuffer>; _resolvePreset(tool: string, preset: string): PencilPreset }
const presetName = 'normal:100:15:PB29:round'
const dabs: Dab[] = [0, 1, 2].map(i => ({ x: 20 + i * 6, y: 32, pressure: 0.7, tiltX: 0, tiltY: 0, size: 12, aspectRatio: 1, angle: 0, opacity: 1, t: i * 20 }))

describe('auxiliary water source execution', () => {
  it('retains source profile and emits no pigment, composite or finish', () => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('source')
    const probe = engine as unknown as Probe, painter = probe._ribbonPainter
    painter.diagnosticSegmentDelivery = 'combined'; painter.diagnosticSolventField = true
    const ctx = (painter as unknown as { ctx: RibbonStrokePainterContext }).ctx
    const nib = vi.spyOn(ctx, 'drawRibbonNibPass'), composite = vi.spyOn(ctx, 'drawRibbonCompositeRect'), live = vi.spyOn(ctx, 'setLiveComposite')
    const target = probe._layers.get('source')!, mark = vi.spyOn(target, 'markContentPainted')
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, false, false)
    const preset = probe._resolvePreset('watercolor', presetName), profile = ribbonProfileFor('watercolor', presetName, 0)
    try {
      for (const _ of painter.paintWaterSource(target, dabs, preset, presetName, profile, [0.2, 0, 0.6], scratch, undefined, '000', [1, 2])) void _
      expect(profile.pigmentStrength).toBeGreaterThan(0)
      expect(nib.mock.calls.some(call => call[5] === 7)).toBe(true)
      // Mode7 auxiliary nib writes solvent, never the original pigment load.
      for (const call of nib.mock.calls.filter(call => call[5] === 7)) expect(call[11]).toBe(0)
      expect(composite).not.toHaveBeenCalled(); expect(live).not.toHaveBeenCalled(); expect(mark).not.toHaveBeenCalled()
      expect(scratch.finishContext).toBeNull(); expect(scratch.diffusePending).toBe(false)
      for (const [, tile] of scratch.tileEntries()) { expect(tile.inkLoad).toBeNull(); expect(tile.inkColor).toBeNull(); expect(tile.solventLoad).toBeTruthy() }
    } finally { nib.mockRestore(); composite.mockRestore(); live.mockRestore(); mark.mockRestore(); scratch.destroy(); engine.destroy() }
  })

  it.each([false, true])('pausing auxiliary water cannot suppress another pigment invocation (closed=%s)', closed => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('source')
    const probe = engine as unknown as Probe, painter = probe._ribbonPainter
    painter.diagnosticSegmentDelivery = 'combined'; painter.diagnosticSolventField = true
    const target = probe._layers.get('source')!, preset = probe._resolvePreset('watercolor', presetName)
    const aux = new RibbonStrokeScratch(probe._ribbonScratchPool, false, false)
    const pigment = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    const ctx = (painter as unknown as { ctx: RibbonStrokePainterContext }).ctx
    const nib = vi.spyOn(ctx, 'drawRibbonNibPass'), composite = vi.spyOn(ctx, 'drawRibbonCompositeRect')
    const work = painter.paintWaterSource(target, dabs, preset, presetName, ribbonProfileFor('watercolor', presetName, 0), [0.2, 0, 0.6], aux, undefined, '000', [1, 2], false, 256)
    try {
      expect(work.next().done).toBe(false)
      if (closed) work.return()
      nib.mockClear(); composite.mockClear()
      for (const _ of painter.paint(target, dabs, preset, presetName, ribbonProfileFor('watercolor', presetName, 0), [0.2, 0, 0.6], pigment, undefined, '000', [1, 2])) void _
      expect(nib.mock.calls.some(call => call[5] === 7 && (call[11] ?? 0) > 0)).toBe(true)
      expect(composite).toHaveBeenCalled()
      expect(pigment.finishContext).not.toBeNull()
      expect(pigment.diffusePending).toBe(true)
      // Resuming the original auxiliary invocation still never emits pigment.
      nib.mockClear(); composite.mockClear()
      for (const _ of work) void _
      for (const call of nib.mock.calls.filter(call => call[5] === 7)) expect(call[11]).toBe(0)
      expect(composite).not.toHaveBeenCalled(); expect(aux.finishContext).toBeNull()
    } finally { work.return(); nib.mockRestore(); composite.mockRestore(); aux.destroy(); pigment.destroy(); engine.destroy() }
  })

  it.each(['destroy', 'context-loss'] as const)('closes a queued auxiliary source before %s teardown', teardown => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('source')
    const probe = engine as unknown as Probe, painter = probe._ribbonPainter
    painter.diagnosticSegmentDelivery = 'combined'; painter.diagnosticSolventField = true; painter.diagnosticForeignSolvent = true
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    scratch.foreignSources = [{ gesture: 'donor', footprints: [{ x: 20, y: 32, radius: 20, aspect: 1, angle: 0 }], chunks: [{ id: 'donor-op', preset: presetName, color: [0.2, 0, 0.6], dabs, wet: '000', seed: [1, 2] }] }]
    const work = painter.paint(probe._layers.get('source')!, dabs, probe._resolvePreset('watercolor', presetName), presetName, ribbonProfileFor('watercolor', presetName, 1), [0.2, 0, 0.6], scratch, undefined, 'fff', [1, 2], false, 256)
    work.next()
    const owned = (painter as unknown as { auxiliaryWater: Set<RibbonStrokeScratch> }).auxiliaryWater
    expect(owned.size).toBe(1)
    const aux = [...owned][0]
    expect(aux.live).toBe(true)
    const abort = vi.fn(() => { work.return() })
    probe._settleQueue.start(scratch, [() => {}, () => work.next()], () => {}, { isAlive: () => true, abort })
    if (teardown === 'destroy') engine.destroy()
    else probe._handleContextLost(new Event('webglcontextlost', { cancelable: true }))
    expect(abort).toHaveBeenCalledTimes(1)
    expect(probe._settleQueue.current).toBeNull()
    expect(owned.size).toBe(0); expect(aux.live).toBe(false)
    expect(work.next().done).toBe(true)
    scratch.destroy(); if (teardown === 'context-loss') engine.destroy()
  })

})

it('tracks exact cleared pigment provenance and rejects restored or legacy sources', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  engine.initLayer('source')
  const probe = engine as unknown as Probe, painter = probe._ribbonPainter, target = probe._layers.get('source')!
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  try {
    const paint = (name: string) => { for (const _ of painter.paint(target, dabs, probe._resolvePreset('watercolor', name), name, ribbonProfileFor('watercolor', name), [0.2,0,0.6], scratch, undefined)) void _ }
    paint('normal:100:0:PB29:round')
    expect(scratch.pigmentInputsKnownZero).toBe(true)
    const snap = scratch.snapshot(probe.gl, () => ({ originX: 0, originY: 0 }))!
    const restored = RibbonStrokeScratch.restore(probe._ribbonScratchPool, snap, target)
    expect(restored.pigmentInputsKnownZero).toBe(false)
    restored.destroy()
    const legacy = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
    painter.diagnosticPigmentRecord = false
    for (const _ of painter.paint(target, dabs, probe._resolvePreset('watercolor', 'normal:100:0:PB29:round'), 'normal:100:0:PB29:round', ribbonProfileFor('watercolor', 'normal:100:0:PB29:round'), [0.2,0,0.6], legacy, undefined)) void _
    expect(legacy.pigmentInputsKnownZero).toBe(false)
    legacy.destroy()
    painter.diagnosticPigmentRecord = true
    for (const t of snap.tiles) for (const b of Object.values(t.bufs)) b?.destroy()
    paint(presetName)
    expect(scratch.pigmentInputsKnownZero).toBe(false)
    paint('normal:100:0:PB29:round')
    expect(scratch.pigmentInputsKnownZero).toBe(false)
  } finally { scratch.destroy(); engine.destroy() }
})
