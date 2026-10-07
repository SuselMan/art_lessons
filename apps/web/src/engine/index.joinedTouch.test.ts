import { afterEach, expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd } from './testing/engineTestUtils'
import type { PencilEngine } from './index'
const engines: PencilEngine[] = []
afterEach(() => { for (const e of engines.splice(0)) if (!e['_destroyed']) e.destroy() })
async function setup(enabled: boolean, mixed = false, preset = 'normal:100:100:PB29:round') {
  const { engine: e } = createTestEngine({ userId: 'a' }, { width: 64, height: 64 })
  engines.push(e)
  e.appendOperation(makeLayerAdd('a', 'L'))
  e.setCompositeOrder([{ id: 'L', opacity: 1 }]); e.setActiveLayer('L')
  await paperReady(e)
  e.setTool('watercolor'); e.setPencil(preset); e.setSize(8)
  e['_wcJoinedTouch'] = enabled
  e['_wcJoinedTouchMixed'] = mixed
  simulateStroke(e, [{ x: 8, y: 32 }, { x: 24, y: 32 }, { x: 40, y: 32 }])
  expect(e['_settle']).not.toBeNull()
  return e
}
it('OFF drains the previous solver; ON deposits genuine source into the same scratch without penDOWN drain', async () => {
  for (const enabled of [false, true]) {
    const e = await setup(enabled)
    const job = e['_settle']!
    const scratch = job.scratch
    const drain = vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
    simulateStrokeStart(e, 24, 32)
    expect(drain.mock.calls.length > 0).toBe(!enabled)
    expect(e['_ribbonStrokeScratch']).toBe(scratch)
    if (enabled) {
      expect(e['_settle']).toBe(job)
      expect(scratch.trackRunningSource).toBe(true)
      expect(scratch.runningSourceCommands.length).toBeGreaterThan(0)
      expect(e['_wcJoinedTouchLease']).toBe(job)
      const checkpoint = vi.spyOn(e['_layers'].get('L')!, 'allResident')
      e['_checkpointBeforeWash']('L', e['_washId']!, 'a', Date.now())
      expect(checkpoint).not.toHaveBeenCalled()
    }
    simulateStrokeEnd(e, 40, 32)
    if (enabled) expect(drain).toHaveBeenCalled() // Barrier is deferred to UP, not removed.
  }
})
it('different colour and split presentation preserve the original drain', async () => {
  for (const kind of ['colour', 'split']) {
    const e = await setup(true)
    if (kind === 'colour') e.setColor([1, 0, 0])
    else e['_settlePlan'].splitQuanta = true
    const drain = vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
    simulateStrokeStart(e, 24, 32)
    expect(drain).toHaveBeenCalled()
    expect(e['_wcJoinedTouchLease']).toBeNull()
    simulateStrokeEnd(e, 40, 32)
  }
})
it('recorded native nib commands own scalar/array inputs and replay them in their original order', async () => {
  const e = await setup(true, true, 'normal:100:0:PB29:round')
  e.setPencil('normal:100:100:PB29:round'); e.setColor([1, 0, 0])
  const nib = vi.spyOn(e as unknown as { _drawRibbonNibPass: typeof e['_drawRibbonNibPass'] }, '_drawRibbonNibPass')
  const bands = vi.spyOn(e as unknown as { _drawRibbonBands: typeof e['_drawRibbonBands'] }, '_drawRibbonBands')
  simulateStrokeStart(e, 24, 32)
  simulateStrokeMove(e, 40, 32)
  const scratch = e['_ribbonStrokeScratch']!
  const originals = nib.mock.calls.map(args => args.map((v: unknown) => {
    if (Array.isArray(v)) return v.slice()
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return { ...v }
    return v
  }))
  expect(originals.length).toBeGreaterThan(0)
  const originalBands = bands.mock.calls.map(args => args.map(v => v instanceof Float32Array ? v.slice() : Array.isArray(v) ? v.slice() : v))
  expect(originalBands.length).toBeGreaterThan(0)
  for (const args of bands.mock.calls) for (const v of args) if (v instanceof Float32Array) v.fill(999)
  // The source recorder must own values, not a future mutable nib/seed array.
  for (const args of nib.mock.calls) for (const v of args as unknown[]) {
    if (Array.isArray(v)) v.fill(999)
    else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && 'x' in v) v.x = 999
  }
  nib.mockClear(); bands.mockClear()
  for (const command of scratch.runningSourceCommands) command()
  expect(nib.mock.calls).toEqual(originals)
  expect(bands.mock.calls).toEqual(originalBands)
})
it('a second admission cannot reuse a leased old film and cancellation retires the lease', async () => {
  const e = await setup(true)
  simulateStrokeStart(e, 24, 32)
  expect(e['_wcJoinedTouchLease']).not.toBeNull()
  // Admission boundary re-entry must drain rather than recycle another film.
  const drain = vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
  simulateStrokeStart(e, 32, 32)
  expect(drain).toHaveBeenCalled()
  expect(e['_wcJoinedTouchLease']).toBeNull()
  e['_cancelSettle']()
  expect(e['_wcJoinedTouchLease']).toBeNull()
})

it('overlap refuses exported/checkpoint prefixes and loss forgets the lease without source replay', async () => {
  const e = await setup(true, true)
  simulateStrokeStart(e, 24, 32)
  expect(await e.exportPNG(true)).toBeNull()
  expect(await e.exportReviewImage()).toBeNull()
  expect(await e.bakePreview()).toBeNull()
  expect(e.bakeNetworkSnapshot('L')).toBeNull()
  expect(e.bakeLayerByFullReplay('L')).toBeNull()
  const commands = e['_ribbonStrokeScratch']!.runningSourceCommands.map(c => vi.fn(c))
  e['_ribbonStrokeScratch']!.runningSourceCommands = commands
  e['_handleContextLost']({ preventDefault() {} } as Event)
  expect(e['_wcJoinedTouchLease']).toBeNull()
  for (const command of commands) expect(command).not.toHaveBeenCalled()
})

it('natural completion replays the one next film and releases its old-job lease while input remains active', async () => {
  const e = await setup(true)
  const nib = vi.spyOn(e as unknown as { _drawRibbonNibPass: typeof e['_drawRibbonNibPass'] }, '_drawRibbonNibPass')
  simulateStrokeStart(e, 24, 32)
  const sourceCalls = nib.mock.calls.slice()
  expect(sourceCalls.length).toBeGreaterThan(0)
  const old = e['_settle']!
  expect(old).not.toBeNull()
  let steps = 0
  while (e['_settleQueue'].current === old && steps++ < 10000) e['_settleQueue'].advance()
  expect(steps).toBeLessThan(10000)
  expect(e['_wcJoinedTouchLease']).toBeNull()
  expect(e['_strokeLayerId']).toBe('L')
  expect(e['_ribbonStrokeScratch']!.trackRunningSource).toBe(false)
  expect(e['_ribbonStrokeScratch']!.runningSourceCommands).toEqual([])
  expect(nib.mock.calls.slice(sourceCalls.length)).toEqual(sourceCalls)
  simulateStrokeEnd(e, 40, 32)
})
it('in-place colour mutation and another preset also reject the same-wash admission', async () => {
  for (const kind of ['in-place colour', 'preset']) {
    const e = await setup(true)
    if (kind === 'preset') e.setPencil('normal:100:80:PB29:round')
    else e['_opts'].graphiteColor[0] = 0.92
    const drain = vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
    simulateStrokeStart(e, 24, 32)
    expect(drain).toHaveBeenCalled()
    simulateStrokeEnd(e, 40, 32)
  }
})
it('destroy forgets the joined lease and does not resume its next-film source commands', async () => {
  const e = await setup(true)
  simulateStrokeStart(e, 24, 32)
  const commands=e['_ribbonStrokeScratch']!.runningSourceCommands.map(c=>vi.fn(c))
  e['_ribbonStrokeScratch']!.runningSourceCommands=commands
  e.destroy()
  expect(e['_wcJoinedTouchLease']).toBeNull()
  for(const command of commands)expect(command).not.toHaveBeenCalled()
})

it('enabling after an uncaptured predecessor conservatively uses the original drain', async () => {
  const e=await setup(false)
  e['_wcJoinedTouch']=true
  const drain=vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
  simulateStrokeStart(e,24,32)
  expect(drain).toHaveBeenCalled()
  expect(e['_wcJoinedTouchLease']).toBeNull()
  simulateStrokeEnd(e,40,32)
})

it('mixed diagnostic owns predecessor finish before new RGB/preset mutates its scratch', async () => {
  for (const first of ['normal:100:0:PB29:round', 'normal:100:100:PB29:round']) {
    const e = await setup(true, true, first)
    const job = e['_settle']!
    const old = e['_wcJoinedTouchInputs'].get(job)!.finish!
    expect(old).toBeDefined()
    const color = [...old.finish!.color]
    const paints = [...old.paints]
    const gesture = old.gesture
    e.setPencil('normal:100:100:PB29:round'); e.setColor([1, 0, 0])
    const drain = vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
    simulateStrokeStart(e, 24, 32)
    simulateStrokeMove(e, 40, 32)
    expect(drain).not.toHaveBeenCalled()
    expect(e['_wcJoinedTouchLease']).toBe(job)
    expect(old.finish!.color).toEqual(color)
    expect([...old.paints]).toEqual(paints)
    expect(old.gesture).toBe(gesture)
    expect(job.scratch.gesture).toBeGreaterThan(gesture)
    expect(job.scratch.runningSourceCommands.length).toBeGreaterThan(0)
    simulateStrokeEnd(e, 40, 32)
    expect(drain).toHaveBeenCalled()
  }
})
