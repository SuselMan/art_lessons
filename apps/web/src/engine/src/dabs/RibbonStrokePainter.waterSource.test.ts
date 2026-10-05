import { describe, expect, it, vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { PencilPreset } from '../presets/pencilPresets'
import { ribbonProfileFor } from './ribbonProfile'
import type { RibbonStrokePainter, RibbonStrokePainterContext } from './RibbonStrokePainter'

type Probe = { _ribbonPainter: RibbonStrokePainter; _ribbonScratchPool: RibbonScratchPool; _layers: Map<string, ILayerBuffer>; _resolvePreset(tool: string, preset: string): PencilPreset }
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

  it('resets the execution guard when a sliced generator is cancelled', () => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    engine.initLayer('source')
    const probe = engine as unknown as Probe, painter = probe._ribbonPainter
    painter.diagnosticSegmentDelivery = 'combined'; painter.diagnosticSolventField = true
    const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, false, false)
    ;(painter as unknown as { diagnosticDepth: number }).diagnosticDepth = 1
    const work = painter.paintWaterSource(probe._layers.get('source')!, dabs, probe._resolvePreset('watercolor', presetName), presetName, ribbonProfileFor('watercolor', presetName, 0), [0.2, 0, 0.6], scratch, undefined, '000', [1, 2], false, 256)
    try { work.next(); work.return(); expect((painter as unknown as { waterOnlyDepth: number }).waterOnlyDepth).toBe(0); expect((painter as unknown as { diagnosticDepth: number }).diagnosticDepth).toBe(1) }
    finally { scratch.destroy(); engine.destroy() }
  })
})
