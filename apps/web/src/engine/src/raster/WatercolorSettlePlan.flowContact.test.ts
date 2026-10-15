import { expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from '../dabs/ribbonProfile'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'

type Finish = NonNullable<RibbonStrokeScratch['finishContext']>
type Probe = {
  _ribbonScratchPool: RibbonScratchPool
  _watercolorPasses: WatercolorPasses
  _settlePlan: WatercolorSettlePlan
  _layers: Map<string, Finish['target']>
  _resolvePreset(tool: 'watercolor', preset: string): Finish['preset']
}

// Resource/coupling contract only. Actual shader pixels and history are
// checked separately on AMD and Adreno; MockGL cannot prove those.
for (const model of ['front8-detail-flow-v1', 'front8-detail-flow-v3'] as const)
for (const completion of ['finish', 'abort', 'context-loss'] as const) it(`${model}: owns one contact field across groups and retires it on ${completion}`, () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 1024, height: 1024 })
  const p = engine as unknown as Probe
  engine.initLayer('flow-test')
  const tile = p._ribbonScratchPool.acquire(1024, 1024)
  const scratch = new RibbonStrokeScratch(p._ribbonScratchPool, true, true)
  scratch.filmBuffers(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  scratch.brushTravel = [20, 128, 128].map((radius, i) => ({ x: 300 + i * 120, y: 512, radius, aspect: 1, angle: 0, dx: 120, dy: 0, water: 1 }))
  const preset = `normal:100:69:PB15:round:wc@${model}`
  const contactSize = model === 'front8-detail-flow-v1' ? 384 : 256
  const bounds = { minX: 100, minY: 200, maxX: 900, maxY: 800 }
  scratch.noteFinish({ target: p._layers.get('flow-test')!, preset: p._resolvePreset('watercolor', preset), profile: ribbonProfileFor('watercolor', preset)!, color: [1, 0, 0], opacity: 1, bounds, fieldSeed: [0, 0], landedWet: 1, wetPeak: 1, radiusPx: 128, dwellMs: 0 })
  const brush = vi.spyOn(p._watercolorPasses, 'brushPass')
  const acquire = vi.spyOn(p._ribbonScratchPool, 'acquire')
  const release = vi.spyOn(p._ribbonScratchPool, 'release')
  const plan = p._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], bounds, .2, 128, 1, 1, 1, 1)!
  const owned = () => (p._settlePlan as unknown as { _ownedInputs: Set<AccumulationBuffer> })._ownedInputs
  try {
    let i = 0
    while (i < plan.ops.length && !brush.mock.calls.length) plan.ops[i++]()
    expect(brush).toHaveBeenCalled()
    const live = [...owned()]
    expect(live.filter(b => b.width === contactSize && b.height === contactSize)).toHaveLength(7)
    if (completion === 'finish') {
      for (; i < plan.ops.length; i++) plan.ops[i]()
      expect(acquire.mock.calls.filter(([w, h]) => w === contactSize && h === contactSize)).toHaveLength(7)
      const fields = new Set(brush.mock.calls.map(a => a[0]))
      expect(fields.size).toBe(1)
      for (let k = 0; k < brush.mock.calls.length; k += 2) {
        const color = brush.mock.calls[k], pigment = brush.mock.calls[k + 1]
        expect(color[2]).toBe(16); expect(color[3]).toBe(4)
        expect(color[6]).toBe(pigment[4])
        expect(pigment[6]).toBe(pigment[4])
        expect(color[5]).not.toBe(color[6])
      }
      plan.finish()
    } else {
      if (completion === 'context-loss') p._settlePlan.forgetTextures()
      release.mockClear()
      plan.dispose(); plan.dispose(); plan.finish()
      if (completion === 'context-loss') expect(release).not.toHaveBeenCalled()
      else for (const buffer of live) expect(release.mock.calls.filter(([b]) => b === buffer)).toHaveLength(1)
    }
    expect(owned().size).toBe(0)
  } finally {
    plan.dispose(); brush.mockRestore(); acquire.mockRestore(); release.mockRestore()
    scratch.destroy(); p._ribbonScratchPool.release(tile); engine.destroy()
  }
})
