import { afterEach, expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd, makeStroke, dab } from './testing/engineTestUtils'
import type { PencilEngine } from './index'
const engines: PencilEngine[] = []
afterEach(() => { for (const e of engines.splice(0)) if (!e['_destroyed']) e.destroy() })
async function setup(enabled: boolean, mixed = false, preset = 'normal:100:100:PB29:round', snapshotLease = false) {
  const { engine: e } = createTestEngine({ userId: 'a' }, { width: 64, height: 64 })
  engines.push(e)
  e.appendOperation(makeLayerAdd('a', 'L'))
  e.setCompositeOrder([{ id: 'L', opacity: 1 }]); e.setActiveLayer('L')
  await paperReady(e)
  e.setTool('watercolor'); e.setPencil(preset); e.setSize(8)
  e['_wcJoinedTouch'] = enabled
  e['_wcJoinedTouchMixed'] = mixed
  e['_wcJoinedTouchSnapshotLease'] = snapshotLease
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

it('mixed capture without overlap preserves legacy prepare scalars and folded dry domain', async () => {
  const observations: unknown[] = []
  for (const mixed of [false, true]) {
    const e = await setup(true, mixed)
    e['_completeSettle']()
    const prepare = vi.spyOn(e['_settlePlan'], 'prepare')
    simulateStroke(e, [{ x: 16, y: 32 }, { x: 32, y: 32 }, { x: 48, y: 32 }])
    expect(prepare).toHaveBeenCalledTimes(1)
    const args = prepare.mock.calls[0]
    const metadata = args[12]
    const dry = metadata?.dryCtx ?? args[0].dryCtx
    expect(dry).not.toBeNull()
    observations.push({
      scalars: args.slice(2, 10),
      dry: dry && { bounds: dry.bounds, radiusPx: dry.radiusPx, standing: dry.standing },
      spacing: args[0].noteDabSpacing(0), direction: args[0].noteDirection(0, 0),
      diffusePending: args[0].diffusePending,
    })
    if (mixed) {
      expect(metadata).toBeDefined()
      expect(metadata!.dryCtx).not.toBe(args[0].dryCtx)
      expect(metadata!.dryCtx?.target).toBe(args[0].dryCtx?.target)
    }
    e['_completeSettle']()
    expect(e['_wcJoinedTouchLease']).toBeNull()
  }
  expect(observations[1]).toEqual(observations[0])
})

it('product joinedTouch drains water-to-pigment before the first new source draw', async () => {
  const e = await setup(true, false, 'normal:100:0:PB29:round')
  const previous = e['_settle']!
  e.setPencil('normal:100:100:PB29:round')
  const order: string[] = []
  const complete = e['_completeSettle'].bind(e)
  const draw = e['_drawRibbonNibPass'].bind(e)
  vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle').mockImplementation(() => {
    order.push('complete'); complete()
  })
  vi.spyOn(e as unknown as { _drawRibbonNibPass: typeof e['_drawRibbonNibPass'] }, '_drawRibbonNibPass').mockImplementation((...args) => {
    order.push('source'); return draw(...args)
  })
  simulateStrokeStart(e, 24, 32)
  expect(order.indexOf('complete')).toBeGreaterThanOrEqual(0)
  expect(order.indexOf('source')).toBeGreaterThan(order.indexOf('complete'))
  expect(e['_settle']).not.toBe(previous)
  expect(e['_wcJoinedTouchLease']).toBeNull()
  simulateStrokeEnd(e, 40, 32)
})


it('snapshot candidate requires frozen predecessor finish and avoids only valid mixed DOWN drain', async () => {
  for (const corrupt of ['none', 'gesture', 'target', 'color alias', 'uncaptured'] as const) {
    const e = await setup(true, false, 'normal:100:0:PB29:round', corrupt !== 'uncaptured')
    if (corrupt === 'uncaptured') e['_wcJoinedTouchSnapshotLease'] = true
    const job = e['_settle']!
    const input = e['_wcJoinedTouchInputs'].get(job)!
    const old = input.finish
    const previousPreset = structuredClone(old?.finish?.preset)
    if (old && corrupt === 'gesture') Object.assign(old, { gesture: old.gesture + 1 })
    if (old?.finish && corrupt === 'target') Object.assign(old.finish, { target: {} })
    if (old?.finish && corrupt === 'color alias') Object.assign(old.finish, { color: e['_opts'].graphiteColor })
    e.setPencil('normal:100:100:PB29:round')
    const drain = vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
    const before = job.next
    simulateStrokeStart(e, 24, 32)
    if (corrupt === 'none') {
      expect(drain).not.toHaveBeenCalled()
      expect(e['_wcJoinedTouchMixed']).toBe(false)
      expect(e['_wcJoinedTouchLease']).toBe(job)
      expect(job.next).toBe(before)
      expect(job.scratch.runningSourceCommands.length).toBeGreaterThan(0)
      expect(old!.finish!.preset).toEqual(previousPreset)
      expect(old!.gesture).toBe(input.gesture)
    } else {
      expect(drain).toHaveBeenCalled()
      expect(e['_wcJoinedTouchLease']).toBeNull()
    }
    simulateStrokeEnd(e, 40, 32)
    if (corrupt === 'none') expect(drain).toHaveBeenCalled()
  }
})

it('same input overlapping mixed harness admits ON only and preserves packed history', async () => {
  // Browser and CPU fixture share the actual pointer pipeline driver.
  // @ts-expect-error QA JavaScript helper intentionally has no app declaration.
  const { driveMixedLeaseInput, normalizedMixedHistory } = await import('../../../../docs/qa/harness/728-room-moment/MixedLeaseInput.mjs')
  // @ts-expect-error QA JavaScript clock helper.
  const { withControlledInputClock } = await import('../../../../docs/qa/harness/728-room-moment/ControlledInputClock.mjs')
  const histories: unknown[] = []
  for (const enabled of [false, true]) {
    const { engine: e } = createTestEngine({ userId: 'a' }, { width: 128, height: 128 })
    engines.push(e); e.appendOperation(makeLayerAdd('a', 'L'))
    e.setCompositeOrder([{ id: 'L', opacity: 1 }]); e.setActiveLayer('L'); await paperReady(e)
    e['_wcJoinedTouch'] = true
    const { result: proof } = withControlledInputClock(e, ({ clock, timeOrigin }: { clock: (at: number) => void; timeOrigin: number }) => driveMixedLeaseInput(e, { enabled, clock, timeOrigin }))
      expect(proof.predecessorPending).toBe(true)
      expect(proof.leaseAdmissions).toBe(enabled ? 1 : 0)
      expect(proof.downDrains > 0).toBe(!enabled)
      e['_completeSettle']()
      const ops = e.getOperations().filter(op => op.type === 'stroke')
      expect(ops).toHaveLength(2)
      expect(ops[1].wet).toBeTruthy()
      expect(ops.map(op => op.strokeId)).toEqual(['QAwater001', 'QApigmt002'])
      const { mottleSeedFromStrokeId } = await import('./src/presets/watercolorPresets')
      expect(mottleSeedFromStrokeId('QAwater001')).not.toEqual(mottleSeedFromStrokeId('QApigmt002'))
      for (const source of proof.sourceInputs) expect(source.seed).toEqual(mottleSeedFromStrokeId(source.strokeId))
      expect(proof.sourceInputs).toHaveLength(6)
      expect(ops.map(op => op.preset)).toEqual(['normal:100:0:PB29:round', 'normal:100:100:PB29:round'])
      histories.push({ history: normalizedMixedHistory(ops), sourceInputs: proof.sourceInputs })
  }
  expect(histories[1]).toEqual(histories[0])
})

it('seeded input harness restores field descriptor and paint wrapper after pointer failure', async () => {
  // @ts-expect-error Standalone QA JavaScript fixture.
  const { driveMixedLeaseInput } = await import('../../../../docs/qa/harness/728-room-moment/MixedLeaseInput.mjs')
  // @ts-expect-error Standalone QA JavaScript model-clock fixture.
  const { withControlledInputClock } = await import('../../../../docs/qa/harness/728-room-moment/ControlledInputClock.mjs')
  const { engine: e } = createTestEngine({ userId: 'a' }, { width: 128, height: 128 })
  engines.push(e); e.appendOperation(makeLayerAdd('a', 'L')); e.setActiveLayer('L'); e.setCompositeOrder([{ id: 'L', opacity: 1 }]); await paperReady(e)
  e['_wcJoinedTouch'] = true
  const paint = e['_paintDabs'], complete = e['_completeSettle'], descriptor = Object.getOwnPropertyDescriptor(e, '_strokeId')!
  expect(() => withControlledInputClock(e, ({ clock, timeOrigin }: { clock: (at: number) => void; timeOrigin: number }) => driveMixedLeaseInput(e, { enabled: true, clock, timeOrigin, afterSecondDown: () => { throw Error('intentional pointer failure') } }))).toThrow('intentional pointer failure')
  const restored = Object.getOwnPropertyDescriptor(e, '_strokeId')!
  expect(restored.configurable).toBe(descriptor.configurable); expect(restored.writable).toBe(descriptor.writable); expect(restored.enumerable).toBe(descriptor.enumerable)
  expect(restored.get).toBeUndefined(); expect(restored.set).toBeUndefined(); expect(restored.value).toBe('QApigmt002')
  expect(e['_paintDabs']).toBe(paint); expect(e['_completeSettle']).toBe(complete)
})

it('snapshot mixed lease blocks incomplete exports until UP and restores delegation', async () => {
  const e = await setup(true, false, 'normal:100:0:PB29:round', true)
  e.setPencil('normal:100:100:PB29:round')
  const png = vi.spyOn(e['_exporter'], 'exportPNG').mockResolvedValue(new Blob(['material']))
  const review = vi.spyOn(e['_exporter'], 'exportReviewImage').mockResolvedValue(null)
  const preview = vi.spyOn(e['_exporter'], 'bakePreview').mockResolvedValue(new Blob(['preview']))
  simulateStrokeStart(e, 24, 32)
  expect(e['_wcJoinedTouchLease']).not.toBeNull()
  expect(await e.exportPNG(true)).toBeNull()
  expect(await e.exportReviewImage()).toBeNull()
  expect(await e.bakePreview()).toBeNull()
  expect(e.bakeNetworkSnapshot('L')).toBeNull()
  expect(e.bakeLayerByFullReplay('L')).toBeNull()
  expect(png).not.toHaveBeenCalled(); expect(review).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled()
  simulateStrokeEnd(e, 40, 32)
  expect(e['_wcJoinedTouchLease']).toBeNull()
  await e.exportPNG(true); await e.exportReviewImage(); await e.bakePreview()
  expect(png).toHaveBeenCalledOnce(); expect(review).toHaveBeenCalledOnce(); expect(preview).toHaveBeenCalledOnce()
})

it('undo during snapshot mixed input retires the lease and allows subsequent redo', async () => {
  const e = await setup(true, false, 'normal:100:0:PB29:round', true)
  const first = e.getOperations().find(op => op.type === 'stroke')!
  e.setPencil('normal:100:100:PB29:round')
  simulateStrokeStart(e, 24, 32)
  expect(e['_wcJoinedTouchLease']).not.toBeNull()
  const undone = e.undo()
  expect(undone?.id).toBe(first.id)
  const redone = e.redo()
  expect(redone?.id).toBe(first.id)
  simulateStrokeEnd(e, 40, 32)
  e['_completeSettle']()
  expect(e['_wcJoinedTouchLease']).toBeNull()
  expect(e.getOperations().filter(op => op.type === 'operation_undo').length).toBe(1)
  expect(e.getOperations().filter(op => op.type === 'operation_redo').length).toBe(1)
})


it('mixed lease queues two peer strokes and preserves application order after UP', async () => {
  const e = await setup(true, false, 'normal:100:0:PB29:round', true)
  const raf = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame
  const callbacks: FrameRequestCallback[] = []
  globalThis.requestAnimationFrame = fn => { callbacks.push(fn); return callbacks.length }
  globalThis.cancelAnimationFrame = () => {}
  try {
    e.setPencil('normal:100:100:PB29:round'); simulateStrokeStart(e, 24, 32)
    expect(e['_wcJoinedTouchLease']).not.toBeNull()
    const first = makeStroke('peer', 'L', [dab(12, 12)]), second = makeStroke('peer', 'L', [dab(20, 20)])
    const applied: string[] = []; e['_onQueuedOperationApplied'] = op => applied.push(op.id)
    e.appendOperation(first, 'remote'); e.appendOperation(second, 'remote')
    expect(e['_opQueue'].map(q => q.op.id)).toEqual([first.id, second.id]); expect(applied).toEqual([])
    simulateStrokeEnd(e, 40, 32); e['_completeSettle']()
    let frames = 0; while (e['_opQueue'].length && frames++ < 100) callbacks.shift()?.(performance.now())
    expect(frames).toBeLessThan(100); expect(applied).toEqual([first.id, second.id]); expect(e['_opQueue']).toEqual([])
    expect(e['_wcJoinedTouchLease']).toBeNull()
  } finally { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = cancel }
})
