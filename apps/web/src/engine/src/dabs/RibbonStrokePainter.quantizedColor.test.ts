import { expect, it, vi } from 'vitest'
import { createTestEngine, dab } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from './ribbonProfile'
import type { RibbonStrokePainterContext } from './RibbonStrokePainter'

function render(model: 'front8-detail-flow-v2' | 'front8-detail-flow-v3') {
  // An ordinary receiver must decode the recorded operation's model, regardless
  // of which version it would use to author its own next stroke.
  const { engine } = createTestEngine({ paper: 'flat', watercolorModel: 'front8-fine-v1' }, { width: 64, height: 64 })
  engine.initLayer('L')
  engine['_minmaxExt'] = { MAX_EXT: 0x8008 }
  const painter = engine['_ribbonPainter']
  painter.diagnosticSourceCopySlices = true
  const ctx = (painter as unknown as { ctx: RibbonStrokePainterContext }).ctx
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const preset = `normal:100:100:PB29:round:wc@${model}`
  const fields = vi.spyOn(ctx, 'fieldOp'), nibs = vi.spyOn(ctx, 'drawRibbonNibPass')
  const units: Array<Parameters<RibbonStrokePainterContext['fieldOp']>[]> = []
  const work = painter.paint(engine['_layers'].get('L')!, [dab(20, 24, { size: 12 }), dab(28, 28, { size: 12 })],
    engine['_resolvePreset']('watercolor', preset), preset, ribbonProfileFor('watercolor', preset), [.2, 0, .6], scratch, undefined, '00', [1, 2], true, 256)
  try {
    for (let n = 0; n < 200; n++) {
      const at = fields.mock.calls.length, step = work.next()
      units.push(fields.mock.calls.slice(at))
      if (step.done) break
      if (n === 199) throw Error('Material did not finish')
    }
    return { units, colorNibs: nibs.mock.calls.filter(c => c[5] === 7 && c[16]).length,
      massNibs: nibs.mock.calls.filter(c => c[5] === 7 && !c[16]).map(c => [c[2].x, c[2].y, c[2].size, c[6], c[11]]) }
  } finally { work.return(); fields.mockRestore(); nibs.mockRestore(); scratch.destroy(); engine.destroy() }
}

it('v3 retains pigment geometry and completes derived colour with its P/C publication before yielding', () => {
  const native = render('front8-detail-flow-v2'), derived = render('front8-detail-flow-v3')
  expect(native.colorNibs).toBeGreaterThan(0)
  expect(derived.colorNibs).toBe(0)
  expect(derived.massNibs).toEqual(native.massNibs)
  const publications = derived.units.filter(unit => unit.some(c => c[3] === 2 && c[5]?.tau))
  expect(publications.length).toBeGreaterThan(0)
  for (const unit of publications) {
    const index = unit.findIndex(c => c[3] === 2 && c[5]?.tau)
    const color = unit[index], pigmentMerge = unit[index + 1], colorMerge = unit[index + 2]
    expect(color[1]).toBe(color[2])
    expect(pigmentMerge[3]).toBe(1); expect(colorMerge[3]).toBe(1)
    expect(colorMerge[2]).toBe(color[0])
    expect(pigmentMerge[5]?.scissor).toEqual(color[5]?.scissor)
    expect(colorMerge[5]?.scissor).toEqual(color[5]?.scissor)
  }
})
