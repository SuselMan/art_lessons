import { it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd } from './testing/engineTestUtils'
import { brushDragContacts } from './src/watercolor/brushDrag'
import type { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'
it('CPU captures native and packed replay travel before solver', async () => {
  const captures: unknown[] = []
  const make = async (label: string) => {
    const { engine } = createTestEngine({ userId: 'native-proof', pageWidth: 2000, pageHeight: 1200 }, { width: 800, height: 600 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('native-proof', 'native'))
    engine.setActiveLayer('native'); engine.setCompositeOrder([{ id: 'native', opacity: 1 }])
    const p = engine['_ribbonPainter']
    p.diagnosticSegmentDelivery = 'combined'; p.diagnosticPigmentRecord = true; p.diagnosticSharedFluid = true; p.diagnosticSolventField = true; p.diagnosticLandingReservoir = true; p.diagnosticLandingPolicy = 'fluid'; p.diagnosticWaterPolicy = 'bottomless'
    vi.spyOn(engine as unknown as { _finishRibbonStroke(s: RibbonStrokeScratch): void }, '_finishRibbonStroke').mockImplementation(scratch => {
      const ctx = scratch.finishContext
      const contacts = brushDragContacts(scratch.brushTravel, { x: 0, y: 0, w: 517, h: 387 })
      captures.push({ label, ctx: ctx ? { ...ctx, target: undefined } : null, travel: structuredClone(scratch.brushTravel), contacts: contacts.map(c => ({ rect: c.rect, radius: c.radius, pixels: [...c.field.pixels] })) })
    })
    return engine
  }
  const e = await make('native')
  e.setTool('watercolor'); e.setSize(40); e.setColor([.22, 0, .6]); e.setPencil('normal:100:15:PB29:round')
  simulateStrokeStart(e, 100, 150, { pressure: .7, speed: .5, timeStamp: 0 })
  for (let i = 1; i <= 15; i++) simulateStrokeMove(e, 100 + i * 12, 150, { pressure: .7, speed: .5, timeStamp: i * 16 })
  simulateStrokeEnd(e, 280, 150, { pressure: .7, speed: .5, timeStamp: 240 })
  const ops = e.getOperations()
  const replay = await make('append')
  for (const op of ops.filter(o => o.type === 'stroke')) replay.appendOperation(op, 'remote')
  const fs = await import('node:fs')
  fs.writeFileSync('temp/parity/cpu-probe.json', JSON.stringify(captures, null, 2))
  e.destroy(); replay.destroy()
})
