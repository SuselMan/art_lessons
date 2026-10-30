import { expect, it, vi } from 'vitest'
import { PointerInput } from './PointerInput'

type Listener = (event: PointerEvent | TouchEvent) => void
interface Subscription { type: string; listener: Listener; capture: boolean }
function canvasRig() {
  const subscriptions: Subscription[] = [], adds: Subscription[] = [], removals: Subscription[] = []
  const style = { touchAction: 'pan-y' }
  const canvas = {
    width: 100, height: 100, style,
    addEventListener: vi.fn((type: string, listener: Listener, options?: boolean | AddEventListenerOptions) => {
      const entry = { type, listener, capture: typeof options === 'boolean' ? options : options?.capture ?? false }
      subscriptions.push(entry); adds.push(entry)
    }),
    removeEventListener: vi.fn((type: string, listener: Listener, options?: boolean | EventListenerOptions) => {
      const capture = typeof options === 'boolean' ? options : options?.capture ?? false
      removals.push({ type, listener, capture })
      const index = subscriptions.findIndex(s => s.type === type && s.listener === listener && s.capture === capture)
      if (index !== -1) subscriptions.splice(index, 1)
    }),
    setPointerCapture: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 100, height: 100 })),
  }
  const dispatch = (type: string, overrides: Partial<PointerEvent> = {}) => {
    const event = {
      type, button: 0, buttons: 1, pointerId: 7, pointerType: 'pen', pressure: .7,
      clientX: 10, clientY: 20, timeStamp: 10, tiltX: 0, tiltY: 0, preventDefault: vi.fn(), ...overrides,
    } as unknown as PointerEvent
    for (const { listener } of [...subscriptions].filter(s => s.type === type)) listener(event)
    return event
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, raw: canvas, subscriptions, adds, removals, dispatch }
}
function failure(work: () => unknown): unknown {
  try { work() } catch (error) { return error }
  throw new Error('Expected injected failure')
}

it.each([1, 2, 3, 4, 5])('rolls back exactly successful listener registrations when add #%i throws', ordinal => {
  const r = canvasRig(), primary = new Error('registration failed'), original = r.raw.addEventListener.getMockImplementation()!
  const foreign = vi.fn()
  r.canvas.addEventListener('pointermove', foreign, true)
  r.adds.length = 0
  let n = 0
  r.raw.addEventListener.mockImplementation((...args) => { if (++n === ordinal) throw primary; original(...args) })
  expect(failure(() => new PointerInput(r.canvas))).toBe(primary)
  expect(r.removals).toEqual([...r.adds].reverse())
  expect(r.subscriptions).toEqual([{ type: 'pointermove', listener: foreign, capture: true }])
  expect(r.raw.style.touchAction).toBe('pan-y')
  r.dispatch('pointermove')
  expect(foreign).toHaveBeenCalledOnce()
})
it('preserves registration failure through rollback removal errors and leaves stale callbacks inert', () => {
  const r = canvasRig(), primary = new Error('touch add failed'), secondary = new Error('remove failed')
  const add = r.raw.addEventListener.getMockImplementation()!, remove = r.raw.removeEventListener.getMockImplementation()!
  const log = vi.fn()
  r.raw.addEventListener.mockImplementation((...args) => { if (args[0] === 'touchstart') throw primary; add(...args) })
  r.raw.removeEventListener.mockImplementation((...args) => { if (args[0] === 'pointercancel') throw secondary; remove(...args) })
  expect(failure(() => new PointerInput(r.canvas, log))).toBe(primary)
  expect(r.raw.removeEventListener).toHaveBeenCalledTimes(4)
  expect(r.removals).toHaveLength(3)
  expect(r.subscriptions.map(s => s.type)).toEqual(['pointercancel'])
  expect(r.raw.style.touchAction).toBe('pan-y')
  // Retain the exact callbacks, as a browser could when removal fails.
  for (const { type, listener } of r.adds) listener({ type, button: 0, pointerType: 'pen' } as PointerEvent)
  expect(log).not.toHaveBeenCalled(); expect(r.raw.setPointerCapture).not.toHaveBeenCalled()
})
it('does not overwrite a foreign touchAction change made before failed touch registration', () => {
  const r = canvasRig(), primary = new Error('touch add failed'), add = r.raw.addEventListener.getMockImplementation()!
  r.raw.addEventListener.mockImplementation((...args) => {
    if (args[0] === 'touchstart') { r.raw.style.touchAction = 'pan-x'; throw primary }
    add(...args)
  })
  expect(failure(() => new PointerInput(r.canvas))).toBe(primary)
  expect(r.raw.style.touchAction).toBe('pan-x')
  expect(r.subscriptions).toHaveLength(0)
})
it('restores only its attempted CSS mutation when the setter throws after applying it', () => {
  const r = canvasRig(), primary = new Error('style setter'), writes: string[] = []
  let value = 'pan-y'
  Object.defineProperty(r.raw.style, 'touchAction', {
    get: () => value,
    set: (next: string) => { value = next; writes.push(next); if (next === 'none') throw primary },
  })
  expect(failure(() => new PointerInput(r.canvas))).toBe(primary)
  expect(writes).toEqual(['none', 'pan-y'])
  expect(r.subscriptions).toHaveLength(0)
})
it('attempts every owned listener removal once, preserves first error and leaves normal destroy CSS unchanged', () => {
  const r = canvasRig(), foreign = vi.fn()
  r.canvas.addEventListener('pointermove', foreign, true)
  r.adds.length = 0
  const input = new PointerInput(r.canvas), primary = new Error('down remove'), later = new Error('up remove')
  const remove = r.raw.removeEventListener.getMockImplementation()!
  r.raw.removeEventListener.mockImplementation((...args) => {
    if (args[0] === 'pointerdown') throw primary
    if (args[0] === 'pointerup') throw later
    remove(...args)
  })
  expect(failure(() => input.destroy())).toBe(primary)
  expect(r.raw.removeEventListener.mock.calls).toHaveLength(5)
  const count = r.raw.removeEventListener.mock.calls.length
  input.destroy()
  expect(r.raw.removeEventListener.mock.calls).toHaveLength(count)
  expect(r.raw.style.touchAction).toBe('none')
  expect(r.subscriptions.some(s => s.listener === foreign)).toBe(true)
})
it('all retained DOM callbacks are inert after destroy, including active coalesced input and touch default', () => {
  const r = canvasRig(), log = vi.fn(), input = new PointerInput(r.canvas, log)
  const start = vi.fn(), move = vi.fn(), end = vi.fn(), cursor = vi.fn(), predicted = vi.fn(), pressure = vi.fn((p: number) => p)
  input.on('start', start).on('move', move).on('end', end).onCursor(cursor).onPredict(predicted)
  input.setPressureMap(pressure)
  r.dispatch('pointerdown')
  r.raw.removeEventListener.mockImplementation(() => { throw new Error('remove failure') })
  expect(() => input.destroy()).toThrow('remove failure')
  for (const spy of [start, move, end, cursor, predicted, pressure, log, r.raw.setPointerCapture, r.raw.getBoundingClientRect]) spy.mockClear()
  const coalesced = vi.fn(() => []), prediction = vi.fn(() => [])
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    r.dispatch(type, { getCoalescedEvents: coalesced, getPredictedEvents: prediction })
  }
  const touch = r.dispatch('touchstart')
  for (const spy of [start, move, end, cursor, predicted, pressure, log, r.raw.setPointerCapture, r.raw.getBoundingClientRect, coalesced, prediction]) expect(spy).not.toHaveBeenCalled()
  expect(touch.preventDefault).not.toHaveBeenCalled()
})
it('stops remaining coalesced samples and prediction when a move consumer destroys input', () => {
  const r = canvasRig(), input = new PointerInput(r.canvas), moves = vi.fn(() => input.destroy()), predicted = vi.fn()
  input.on('move', moves).onPredict(predicted)
  r.dispatch('pointerdown')
  const prediction = vi.fn(() => [])
  const samples = [20, 30].map(timeStamp => ({ pointerId: 7, pointerType: 'pen', buttons: 1, pressure: .5, clientX: timeStamp, clientY: 0, timeStamp }) as PointerEvent)
  r.dispatch('pointermove', { getCoalescedEvents: () => samples, getPredictedEvents: prediction })
  expect(moves).toHaveBeenCalledOnce()
  expect(prediction).not.toHaveBeenCalled(); expect(predicted).not.toHaveBeenCalled()
})


it('does not perform a rollback CSS write when its requested value was already installed', () => {
  const r = canvasRig(), writes: string[] = [], primary = new Error('touch add')
  let value = 'none'
  Object.defineProperty(r.raw.style, 'touchAction', { get: () => value, set: (next: string) => { value = next; writes.push(next) } })
  const add = r.raw.addEventListener.getMockImplementation()!
  r.raw.addEventListener.mockImplementation((...args) => { if (args[0] === 'touchstart') throw primary; add(...args) })
  expect(failure(() => new PointerInput(r.canvas))).toBe(primary)
  expect(writes).toEqual(['none'])
  expect(value).toBe('none'); expect(r.subscriptions).toHaveLength(0)
})
it('preserves registration error if restoring its own CSS also fails', () => {
  const r = canvasRig(), primary = new Error('touch add'), writes: string[] = []
  let value = 'pan-y'
  Object.defineProperty(r.raw.style, 'touchAction', {
    get: () => value,
    set: (next: string) => { writes.push(next); value = next; if (next === 'pan-y') throw new Error('CSS restore') },
  })
  const add = r.raw.addEventListener.getMockImplementation()!
  r.raw.addEventListener.mockImplementation((...args) => { if (args[0] === 'touchstart') throw primary; add(...args) })
  expect(failure(() => new PointerInput(r.canvas))).toBe(primary)
  expect(writes).toEqual(['none', 'pan-y']); expect(r.subscriptions).toHaveLength(0)
})
it('cursor destruction prevents that sample from becoming paint or predicted input', () => {
  const r = canvasRig(), input = new PointerInput(r.canvas), move = vi.fn(), pressure = vi.fn((p: number) => p)
  input.setPressureMap(pressure)
  input.on('move', move).onCursor(() => input.destroy())
  r.dispatch('pointerdown'); pressure.mockClear()
  const prediction = vi.fn(() => [])
  r.dispatch('pointermove', { getPredictedEvents: prediction })
  expect(move).not.toHaveBeenCalled(); expect(pressure).not.toHaveBeenCalled(); expect(prediction).not.toHaveBeenCalled()
})
it('a transform that retires input cannot invoke a previously captured cursor observer', () => {
  const r = canvasRig(), input = new PointerInput(r.canvas), cursor = vi.fn()
  input.onCursor(cursor)
  input.setTransform(() => { input.destroy(); return { x: 1, y: 2 } })
  r.dispatch('pointermove', { buttons: 0 })
  expect(cursor).not.toHaveBeenCalled()
})
it('pressure-triggered destruction during prediction stops remaining samples and the saved prediction handler', () => {
  const r = canvasRig(), input = new PointerInput(r.canvas), predicted = vi.fn()
  let count = 0
  input.setPressureMap(p => { if (++count === 3) input.destroy(); return p })
  input.onPredict(predicted)
  r.dispatch('pointerdown')
  const samples = [20, 30].map(timeStamp => ({ pointerId: 7, pointerType: 'pen', buttons: 1, pressure: .5, clientX: timeStamp, clientY: 0, timeStamp }) as PointerEvent)
  r.dispatch('pointermove', { getPredictedEvents: () => samples })
  expect(count).toBe(3); expect(predicted).not.toHaveBeenCalled()
})
