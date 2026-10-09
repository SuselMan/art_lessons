import { afterEach, expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd, makeStroke, dab, readLayerPixels } from './testing/engineTestUtils'
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

it('constructor snapshot lease is DEV opt-in only and defaults OFF', () => {
  try {
    for (const dev of [false, true]) {
      vi.stubEnv('DEV', dev)
      for (const request of [undefined, false, true]) {
        const { engine } = createTestEngine({ joinedTouchSnapshotLease: request })
        engines.push(engine)
        expect(engine['_wcJoinedTouchSnapshotLease']).toBe(dev && request === true)
      }
    }
  } finally { vi.unstubAllEnvs() }
})

it('Dry during mixed owned input clears the lease and leaves the next gesture usable', async () => {
  const e = await setup(true, false, 'normal:100:0:PB29:round', true)
  e.setPencil('normal:100:100:PB29:round')
  simulateStrokeStart(e, 24, 32)
  const oldJob = e['_settle']!
  expect(e['_wcJoinedTouchLease']).toBe(oldJob)
  const oldWash = e['_washId']
  expect(e['_paperWet'].countWet('L', performance.now(), .001)).toBeGreaterThan(0)
  e.watercolorDryAll()
  expect(e['_paperWet'].countWet('L', performance.now(), .001)).toBe(0)
  expect(e['_dryAtPenUp']).toBe(true)
  simulateStrokeEnd(e, 40, 32)
  e['_completeSettle']()
  expect(e['_wcJoinedTouchLease']).toBeNull()
  const before = e.getOperations().filter(op => op.type === 'stroke').length
  simulateStroke(e, [{ x: 8, y: 48 }, { x: 24, y: 48 }, { x: 40, y: 48 }])
  e['_completeSettle']()
  expect(e.getOperations().filter(op => op.type === 'stroke')).toHaveLength(before + 1)
  expect(e['_washId']).not.toBe(oldWash)
  expect(e['_wcJoinedTouchLease']).toBeNull()
})

it('mixed owned loss discards captured commands and cannot replay a stale job on destruction', async () => {
  const e = await setup(true, false, 'normal:100:0:PB29:round', true)
  e.setPencil('normal:100:100:PB29:round')
  simulateStrokeStart(e, 24, 32)
  const oldJob = e['_settle']!
  const commands = e['_ribbonStrokeScratch']!.runningSourceCommands.map(c => vi.fn(c))
  expect(commands.length).toBeGreaterThan(0)
  e['_ribbonStrokeScratch']!.runningSourceCommands = commands
  e['_handleContextLost']({ preventDefault() {} } as Event)
  expect(e['_wcJoinedTouchLease']).toBeNull()
  expect(e['_settleQueue'].current).not.toBe(oldJob)
  expect(e['_contextLost']).toBe(true)
  e.destroy()
  for (const command of commands) expect(command).not.toHaveBeenCalled()
})

it('peer Undo and Redo queued during mixed input keep their exact target and FIFO application', async () => {
  const e = await setup(true, false, 'normal:100:0:PB29:round', true)
  const raf = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame
  const frames: FrameRequestCallback[] = []
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length }
  globalThis.cancelAnimationFrame = () => {}
  try {
    e.setPencil('normal:100:100:PB29:round'); simulateStrokeStart(e, 24, 32)
    expect(e['_wcJoinedTouchLease']).not.toBeNull()
    const peer = makeStroke('peer', 'L', [dab(12, 12)])
    const undo = { id: 'peer-undo-lease', type: 'operation_undo' as const, userId: 'peer', timestamp: 1, targetOpId: peer.id }
    const redo = { id: 'peer-redo-lease', type: 'operation_redo' as const, userId: 'peer', timestamp: 2, targetOpId: peer.id }
    const applied: string[] = []; e['_onQueuedOperationApplied'] = op => applied.push(op.id)
    for (const op of [peer, undo, redo]) e.appendOperation(op, 'remote')
    expect(e['_opQueue'].map(q => q.op.id)).toEqual([peer.id, undo.id, redo.id])
    // Accepted history can already be reflected while pixel application is queued.
    expect(applied).toEqual([])
    simulateStrokeEnd(e, 40, 32); e['_completeSettle']()
    let n = 0; while (e['_opQueue'].length && n++ < 100) frames.shift()?.(performance.now())
    expect(n).toBeLessThan(100)
    expect(applied).toEqual([peer.id, undo.id, redo.id])
    expect(e['_log'].entries.find(entry => entry.op.id === peer.id)?.state).toBe('done')
    const controls = e.getOperations().filter(op => op.id === undo.id || op.id === redo.id)
    expect(controls.map(op => 'targetOpId' in op ? op.targetOpId : null)).toEqual([peer.id, peer.id])
    expect(e['_wcJoinedTouchLease']).toBeNull()
  } finally { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = cancel }
})

it('ordinary sender start after an unfinished remote water op must drain its predecessor', async () => {
  const e = await setup(true, false, 'normal:100:100:PB29:round', false)
  e['_completeSettle'](); e['_clearWash'](false)
  e['_sliceLimits'].budgetMs = 0 // Force a pending live peer slice; not a timing measurement.
  const remote = makeStroke('peer', 'L', [dab(24, 32, { size: 8 }), dab(32, 32, { size: 8 })], { strokeId: 'PeerWater0', tool: 'watercolor', preset: 'normal:100:0:PB29:round', color: [.3, .15, .55] })
  e.appendOperation(remote, 'remote')
  expect(e['_settle']).not.toBeNull()
  const drain = vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle')
  simulateStrokeStart(e, 24, 32)
  expect(drain).toHaveBeenCalled()
  expect(e['_wcJoinedTouchLease']).toBeNull()
  simulateStrokeEnd(e, 40, 32)
  e['_completeSettle']()
  expect(e.getOperations().filter(op => op.type === 'stroke').some(op => op.id === remote.id)).toBe(true)
})
it('ordinary undo completes pending material before network emission; failing drain has not emitted', async () => {
  const e = await setup(false)
  const target = e.getOperations().filter(op => op.type === 'stroke').at(-1)!
  expect(e.peekUndo()).toBeNull()
  const order: string[] = []
  const drain = e['_completeSettle'].bind(e), history = e['_applyHistoryChange'].bind(e)
  vi.spyOn(e as unknown as { _completeSettle(): void }, '_completeSettle').mockImplementation(() => { order.push('drain:begin'); drain(); order.push('drain:end') })
  vi.spyOn(e as unknown as { _applyHistoryChange(op: typeof target): void }, '_applyHistoryChange').mockImplementation(op => { order.push('history:begin'); history(op); order.push('history:end') })
  e['_onLocalOperation'] = op => { if (op.type === 'operation_undo') { expect(op.targetOpId).toBe(target.id); order.push('network:undo') } }
  expect(e.undo()?.id).toBe(target.id)
  expect(order.indexOf('drain:end')).toBeGreaterThan(-1)
  expect(order.indexOf('drain:end')).toBeLessThan(order.indexOf('history:begin'))
  expect(order.indexOf('history:end')).toBeLessThan(order.indexOf('network:undo'))
  const f = await setup(false), emit = vi.fn(); f['_onLocalOperation'] = emit
  vi.spyOn(f as unknown as { _completeSettle(): void }, '_completeSettle').mockImplementation(() => { throw Error('CPU drain sentinel') })
  expect(() => f.undo()).toThrow('CPU drain sentinel'); expect(emit).not.toHaveBeenCalled()
  expect(f.getOperations().some(op => op.type === 'operation_undo')).toBe(false)
})
it('DEV queued history retains exact identity, rejects repeated controls/source, gates export, and emits only after FIFO apply', async () => {
  const e = await setup(false), target=e.getOperations().filter(op=>op.type==='stroke').at(-1)!, emitted: string[]=[]
  e['_queuedLocalHistoryDev']=true; e['_onLocalOperation']=op=>emitted.push(op.id)
  const drain=vi.spyOn(e as unknown as { _completeSettle():void },'_completeSettle'),forget=vi.spyOn(e['_paperWet'],'forgetLayer')
  expect(e.undo()?.id).toBe(target.id); expect(drain).not.toHaveBeenCalled()
  const intent=e['_opQueue'][0].op
  expect(intent.type).toBe('operation_undo'); expect('targetOpId' in intent&&intent.targetOpId).toBe(target.id)
  expect(e.undo()).toBeNull(); expect(e.redo()).toBeNull(); expect(e['_opQueue']).toHaveLength(1); expect(e.getOperations().some(op=>op.id===intent.id)).toBe(false)
  simulateStrokeStart(e,24,32); expect(e['_strokeLayerId']).toBeNull(); expect(drain).not.toHaveBeenCalled()
  expect(await e.exportPNG(true)).toBeNull(); expect(e.bakeNetworkSnapshot('L')).toBeNull();expect(forget).not.toHaveBeenCalled(); expect(emitted).toEqual([])
  e['_completeSettle'](); const queued=e['_opQueue'].shift()!; e['_applyQueuedOperation'](queued.op,queued.source)
  expect(emitted).toEqual([intent.id]);expect(forget).toHaveBeenCalledWith('L'); expect(e['_pendingLocalHistoryId']).toBeNull()
  expect(e.getOperations().some(op=>op.id===target.id)).toBe(false)
  expect(e.redo()?.id).toBe(target.id); expect(e.getOperations().some(op=>op.id===target.id)).toBe(true)
})
it('context loss and destroy cancel only unaccepted local history intent, preserving source journal', async()=>{
  for(const kind of ['loss','destroy']){const e=await setup(false);e['_queuedLocalHistoryDev']=true;const target=e.getOperations().filter(op=>op.type==='stroke').at(-1)!, emit=vi.fn();e['_onLocalOperation']=emit;e.undo();const intent=e['_pendingLocalHistoryId'];expect(intent).toBeTruthy();if(kind==='loss')e['_handleContextLost']({preventDefault(){}} as Event);else e.destroy();expect(e['_pendingLocalHistoryId']).toBeNull();expect(e['_opQueue'].some(q=>q.op.id===intent)).toBe(false);expect(emit).not.toHaveBeenCalled();expect(e.getOperations().some(op=>op.id===target.id)).toBe(true);if(kind==='loss'){e['_handleContextRestored']();expect(e.getOperations().some(op=>op.id===target.id)).toBe(true);expect(e.getOperations().some(op=>op.id===intent)).toBe(false)}}})

it('DEV FIFO undo retains later peer identity and converges material with ordinary history after natural boundary', async()=>{
 const off=await setup(false),on=await setup(false);on['_queuedLocalHistoryDev']=true
 const peer=makeStroke('peer','L',[dab(10,10),dab(20,10)],{tool:'pencil',preset:'HB'})
 const undo=on.undo()!,id=on['_pendingLocalHistoryId']!;on.appendOperation(peer,'remote')
 expect(on['_opQueue'].map(q=>q.op.id)).toEqual([id,peer.id]);expect(on['_log'].entries.some(entry=>entry.op.id===peer.id)).toBe(false)
 off.undo();off.appendOperation(peer,'remote');off['_completeSettle']();off['_flushOpQueue']()
 on['_completeSettle']();while(on['_opQueue'].length){const q=on['_opQueue'].shift()!;on['_applyQueuedOperation'](q.op,q.source)}
 expect(on['_log'].entries.find(entry=>entry.op.id===undo.id)?.state).toBe('undone')
 expect(on.getOperations().some(op=>op.id===peer.id)).toBe(true)
 expect(readLayerPixels(on,'L')).toEqual(readLayerPixels(off,'L'))
 on.redo();off.redo();expect(readLayerPixels(on,'L')).toEqual(readLayerPixels(off,'L'))
})
it('queued history failure is explicit, blocks stale publication, and restores unemitted exact target', async()=>{
 const e=await setup(false);e['_queuedLocalHistoryDev']=true;const target=e.undo()!,intent=e['_pendingLocalHistoryId']!,emit=vi.fn();e['_onLocalOperation']=emit
 expect(()=>e.suspendDisplay()).toThrow('busy');expect(e['_displaySuspendDepth']).toBe(0)
 e['_completeSettle']();const q=e['_opQueue'].shift()!;vi.spyOn(e as unknown as {_applyHistoryChange(op:typeof target):void},'_applyHistoryChange').mockImplementation(()=>{throw Error('history repair sentinel')})
 expect(()=>e['_applyQueuedOperation'](q.op,q.source)).toThrow('history repair sentinel');expect(emit).not.toHaveBeenCalled();expect(e['_localHistoryOutcome']).toMatchObject({id:intent,state:'failed'});expect(e.getOperations().some(op=>op.id===target.id)).toBe(true);expect(e.getOperations().some(op=>op.id===intent)).toBe(false);expect(await e.exportPNG(true)).toBeNull();expect(e.undo()).toBeNull()
})
it('queued history callback failure never rolls back accepted control; unrelated queued peer remains',async()=>{
 const e=await setup(false);e['_queuedLocalHistoryDev']=true;const target=e.undo()!,intent=e['_pendingLocalHistoryId']!;const peer=makeStroke('peer','L',[dab(5,5)],{tool:'pencil',preset:'HB'});e.appendOperation(peer,'remote');const callback=vi.fn(()=>{throw Error('accepted callback sentinel')});e['_onLocalOperation']=callback;e['_completeSettle']();const q=e['_opQueue'].shift()!
 expect(()=>e['_applyQueuedOperation'](q.op,q.source)).toThrow('accepted callback sentinel');expect(callback).toHaveBeenCalledOnce();expect(e['_onLocalOperation']).toBe(callback);expect(e['_log'].entries.find(x=>x.op.id===target.id)?.state).toBe('undone');expect(e['_log'].entries.find(x=>x.op.id===intent)?.state).toBe('done');expect(e['_opQueue'].map(x=>x.op.id)).toEqual([peer.id]);expect(e.getQueuedHistoryStatus()).toMatchObject({id:intent,state:'failed'});expect(await e.exportPNG(true)).toBeNull()
})
it('queued local history uses existing rAF drain without forcing pending settle',async()=>{
 const e=await setup(false),frames=new Map<number,FrameRequestCallback>();let id=0;vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id});vi.stubGlobal('cancelAnimationFrame',()=>{})
 try{e['_queuedLocalHistoryDev']=true;const emit=vi.fn();e['_onLocalOperation']=emit;e.undo();const intent=e['_pendingLocalHistoryId'];const drain=vi.spyOn(e as unknown as {_completeSettle():void},'_completeSettle');frames.get(e['_opDrainRaf'])!(performance.now());expect(drain).not.toHaveBeenCalled();expect(emit).not.toHaveBeenCalled();expect(e['_pendingLocalHistoryId']).toBe(intent);e['_completeSettle']();frames.get(e['_opDrainRaf'])!(performance.now());expect(emit).toHaveBeenCalledOnce();expect(emit.mock.calls[0][0].id).toBe(intent);expect(e.getQueuedHistoryStatus()?.state).toBe('accepted')}finally{vi.unstubAllGlobals()}
})

it('queued history constructor remains default OFF and enables only explicit ordinary DEV arm',()=>{
 const off=createTestEngine(),on=createTestEngine({diagnosticQueuedHistory:true});engines.push(off.engine,on.engine);expect(off.engine['_queuedLocalHistoryDev']).toBe(false);expect(on.engine['_queuedLocalHistoryDev']).toBe(true);expect(on.engine.getQueuedHistoryStatus()).toBeNull()
})
it('explicit no-context-loss recovery repairs canonical journal before remote FIFO resumes',async()=>{
 const e=await setup(false);e['_queuedLocalHistoryDev']=true;const source=e.undo()!,emit=vi.fn();e['_onLocalOperation']=emit;e['_completeSettle']();const q=e['_opQueue'].shift()!,failure=vi.spyOn(e as unknown as {_applyHistoryChange(op:typeof source):void},'_applyHistoryChange').mockImplementation(()=>{throw Error('repair failed')});expect(()=>e['_applyQueuedOperation'](q.op,q.source)).toThrow();failure.mockRestore()
 const peer=makeStroke('peer','L',[dab(4,4)],{tool:'pencil',preset:'HB'});e.appendOperation(peer,'remote');expect(e['_opDrainRaf']).toBe(0);expect(await e.exportPNG(true)).toBeNull();expect(await e.recoverQueuedHistoryMaterial()).toBe(true);e['_flushOpQueue']();expect(e.getOperations().some(o=>o.id===source.id)).toBe(true);expect(e.getOperations().filter(o=>o.id===peer.id)).toHaveLength(1);expect(emit).not.toHaveBeenCalled();expect(e['_localHistoryFailure']).toBeNull()
})
it('queued history reports acceptance separately from unfinished material repair',async()=>{
 const e=await setup(false);e['_queuedLocalHistoryDev']=true;e.undo();e['_completeSettle']();const q=e['_opQueue'].shift()!,original=e['_applyHistoryChange'].bind(e)
 vi.spyOn(e as unknown as {_applyHistoryChange(op:Parameters<typeof original>[0]):void},'_applyHistoryChange').mockImplementation(op=>{original(op);e['_rebuildJobs'].set('publication-witness',{} as never)})
 try{e['_applyQueuedOperation'](q.op,q.source);expect(e.getQueuedHistoryStatus()).toMatchObject({state:'accepted',materialIdle:false})}finally{e['_rebuildJobs'].delete('publication-witness')}
 expect(e.getQueuedHistoryStatus()).toMatchObject({state:'accepted',materialIdle:true})
})
it('owned async history repair failure preserves accepted control, stops drain and explicitly recovers peer FIFO',async()=>{
 const e=await setup(false);e['_completeSettle']();const pencil=makeStroke('a','L',[dab(12,12)],{tool:'pencil',preset:'HB'});e.appendOperation(pencil);e['_clearWash'](false);e['_sliceLimits'].budgetMs=0;const wet=makeStroke('peer','L',[dab(24,32,{size:8}),dab(32,32,{size:8})],{strokeId:'PeerAsync0',tool:'watercolor',preset:'normal:100:0:PB29:round',color:[.3,.15,.55]});e.appendOperation(wet,'remote');expect(e['_settle']).not.toBeNull();e['_queuedLocalHistoryDev']=true;const emit=vi.fn();e['_onLocalOperation']=emit;expect(e.undo()?.id).toBe(pencil.id);const intent=e['_pendingLocalHistoryId'];e['_completeSettle']();const q=e['_opQueue'].shift()!;e['_applyQueuedOperation'](q.op,q.source);expect(emit).toHaveBeenCalledOnce();const job=e['_rebuildJobs'].get('L')!;expect(job).toBeTruthy();expect(e.getQueuedHistoryStatus()).toMatchObject({state:'accepted',materialIdle:false});expect(await e.exportPNG(true)).toBeNull()
 const failed=vi.spyOn(e as unknown as {_stepRebuildJobNow(work:typeof job):void},'_stepRebuildJobNow').mockImplementation(()=>{throw Error('async repair sentinel')});e['_queuedLocalHistoryDev']=false;expect(()=>e['_stepRebuildJob'](job)).toThrow('async repair sentinel');expect(e['_rebuildJobs'].get('L')).toBe(job);expect(e.getQueuedHistoryStatus()?.state).toBe('accepted');e['_queuedLocalHistoryDev']=true;e['_stepRebuildJob'](job);failed.mockRestore();expect(e['_rebuildJobs'].has('L')).toBe(false);expect(e['_opDrainRaf']).toBe(0);expect(e.getQueuedHistoryStatus()).toMatchObject({id:intent,state:'failed',materialIdle:false});expect(e['_log'].entries.find(x=>x.op.id===pencil.id)?.state).toBe('undone');expect(e['_log'].entries.find(x=>x.op.id===intent)?.state).toBe('done');const peer=makeStroke('later','L',[dab(5,5)],{tool:'pencil',preset:'HB'});e.appendOperation(peer,'remote');expect(e['_opQueue'].map(x=>x.op.id)).toEqual([peer.id]);expect(await e.recoverQueuedHistoryMaterial()).toBe(true);e['_flushOpQueue']();expect(e.getOperations().filter(x=>x.id===peer.id)).toHaveLength(1);expect(emit).toHaveBeenCalledOnce();expect(e['_localHistoryFailure']).toBeNull()
})
it('loss and destroy release owned async repair lifecycle without undoing accepted history',async()=>{
 for(const kind of ['loss','destroy']){const e=await setup(false);e['_queuedLocalHistoryDev']=true;const target=e.undo()!,intent=e['_pendingLocalHistoryId'],emit=vi.fn();e['_onLocalOperation']=emit;e['_completeSettle']();vi.spyOn(e as unknown as {_rebuildWantsSlicing(layer:string,ops:unknown[]):boolean},'_rebuildWantsSlicing').mockReturnValue(true);const q=e['_opQueue'].shift()!;e['_applyQueuedOperation'](q.op,q.source);expect(e['_rebuildJobs'].size).toBeGreaterThan(0);expect(emit).toHaveBeenCalledOnce();if(kind==='loss')e['_handleContextLost']({preventDefault(){}} as Event);else e.destroy();expect(e['_queuedHistoryRepairOwners'].size).toBe(0);expect(e['_log'].entries.find(x=>x.op.id===target.id)?.state).toBe('undone');expect(e['_log'].entries.find(x=>x.op.id===intent)?.state).toBe('done');expect(e.getQueuedHistoryStatus()?.materialIdle).toBe(false);expect(emit).toHaveBeenCalledOnce()}
})
it('remote stroke and structural delete remain FIFO between owned repair slices; restart and cancellation release exact owner',async()=>{
 const e=await setup(false);e['_completeSettle']();const pencil=makeStroke('a','L',[dab(12,12)],{tool:'pencil',preset:'HB'});e.appendOperation(pencil);e['_clearWash'](false);e['_sliceLimits'].budgetMs=0;e.appendOperation(makeStroke('peer','L',[dab(24,32,{size:8}),dab(32,32,{size:8})],{strokeId:'PeerQueue0',tool:'watercolor',preset:'normal:100:0:PB29:round',color:[.3,.15,.55]}),'remote');e['_queuedLocalHistoryDev']=true;e.undo();e['_completeSettle']();const q=e['_opQueue'].shift()!;e['_applyQueuedOperation'](q.op,q.source);const job=e['_rebuildJobs'].get('L')!;let clock=performance.now();const timing=vi.spyOn(performance,'now').mockImplementation(()=>clock+=20);try{e['_stepRebuildJob'](job)}finally{timing.mockRestore()}expect(e['_rebuildJobs'].get('L')).toBe(job)
 const peer=makeStroke('later','L',[dab(5,5)],{tool:'pencil',preset:'HB'}),deletion={id:'delete-peer',type:'layer_delete' as const,userId:'later',timestamp:1,layerIds:['L']};e.appendOperation(peer,'remote');e.appendOperation(deletion,'remote');e['_flushOpQueue']();expect(e['_opQueue'].map(x=>x.op.id)).toEqual([peer.id,deletion.id]);expect(e['_layers'].has('L')).toBe(true);expect(e.getQueuedHistoryStatus()?.materialIdle).toBe(false)
 const owner=e['_queuedHistoryRepairOwners'].get('L');e['_startRebuildJob']('L');const replacement=e['_rebuildJobs'].get('L');expect(replacement).not.toBe(job);expect(e['_queuedHistoryRepairOwners'].get('L')).toBe(owner);e['_stepRebuildJob'](job);expect(e['_rebuildJobs'].get('L')).toBe(replacement);e['_cancelRebuildJob']('L');expect(e['_queuedHistoryRepairOwners'].has('L')).toBe(false);const applied:string[]=[];e['_onQueuedOperationApplied']=op=>applied.push(op.id);e['_flushOpQueue']();expect(applied).toEqual([peer.id,deletion.id]);expect(e['_layers'].has('L')).toBe(false)
})
