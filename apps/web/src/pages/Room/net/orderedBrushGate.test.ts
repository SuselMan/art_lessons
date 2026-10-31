import { describe, expect, it, vi } from 'vitest'
import { createOrderedBrushGate } from './orderedBrushGate'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('ordered brush gate', () => {
  it('drops expired queued events before extracting presets and keeps the next event ordered', async () => {
    const load = deferred(), stalePresets = vi.fn(() => ['stale']), staleApply = vi.fn(), currentApply = vi.fn()
    let current = true
    const prepare = vi.fn(() => null as Promise<void> | null).mockReturnValueOnce(load.promise)
    const gate = createOrderedBrushGate(prepare, vi.fn())
    gate.dispatch(['blocking'], vi.fn())
    gate.dispatch(stalePresets, staleApply, () => current)
    gate.dispatch(['current'], currentApply)
    current = false
    load.resolve()
    await load.promise
    expect(stalePresets).not.toHaveBeenCalled()
    expect(staleApply).not.toHaveBeenCalled()
    expect(prepare.mock.calls).toEqual([[['blocking']], [['current']]])
    expect(currentApply).toHaveBeenCalledOnce()
  })
  it('rechecks lifetime after resource preparation without applying expired work', async () => {
    const load = deferred(), apply = vi.fn(), next = vi.fn()
    let current = true
    const gate = createOrderedBrushGate(vi.fn().mockReturnValueOnce(load.promise).mockReturnValue(null), vi.fn())
    gate.dispatch(() => ['imported'], apply, () => current)
    gate.dispatch([], next)
    current = false
    load.resolve()
    await load.promise
    expect(apply).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
  it('keeps ready events synchronous', () => {
    const apply = vi.fn()
    const gate = createOrderedBrushGate(() => null, vi.fn())
    gate.dispatch(['pencil'], apply)
    expect(apply).toHaveBeenCalledOnce()
  })
  it('does not let operations, board changes or stroke end overtake downloads', async () => {
    const load = deferred()
    const events: string[] = []
    const prepare = vi.fn((presets: (string | undefined)[]) => presets.includes('imported') ? load.promise : null)
    const gate = createOrderedBrushGate(prepare, vi.fn())
    gate.dispatch(['imported'], () => events.push('live'))
    gate.dispatch([], () => events.push('end'))
    gate.dispatch(['pencil'], () => events.push('operation'))
    gate.dispatch([], () => events.push('board'))
    expect(events).toEqual([])
    load.resolve()
    await load.promise
    expect(events).toEqual(['live', 'end', 'operation', 'board'])
    expect(prepare).toHaveBeenCalledTimes(4)
  })
  it('waits for a second resource without changing event order', async () => {
    const first = deferred(), second = deferred()
    const events: number[] = []
    const gate = createOrderedBrushGate(p => p[0] === 'a' ? first.promise : second.promise, vi.fn())
    gate.dispatch(['a'], () => events.push(1))
    gate.dispatch(['b'], () => events.push(2))
    first.resolve()
    await first.promise
    expect(events).toEqual([1])
    second.resolve()
    await second.promise
    expect(events).toEqual([1, 2])
  })
  it('cancels pending and future callbacks after teardown', async () => {
    const load = deferred(), apply = vi.fn(), fail = vi.fn()
    const gate = createOrderedBrushGate(() => load.promise, fail)
    gate.dispatch(['imported'], apply)
    gate.cancel()
    gate.dispatch([], apply)
    load.resolve()
    await load.promise
    expect(apply).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
  })
  it('fails once and drops queued and future events without resync', async () => {
    const load = deferred(), apply = vi.fn(), fail = vi.fn()
    const gate = createOrderedBrushGate(() => load.promise, fail)
    gate.dispatch(['imported'], apply)
    gate.dispatch([], apply)
    const error = new Error('download failed')
    load.reject(error)
    await load.promise.catch(() => {})
    gate.dispatch([], apply)
    expect(fail).toHaveBeenCalledExactlyOnceWith(error)
    expect(apply).not.toHaveBeenCalled()
  })
  it('bounds queued events when a resource download stalls', () => {
    const load = deferred(), fail = vi.fn(), apply = vi.fn()
    const gate = createOrderedBrushGate(() => load.promise, fail)
    for (let i = 0; i < 513; i++) gate.dispatch([], apply)
    expect(fail).toHaveBeenCalledOnce()
    expect(fail.mock.calls[0][0].message).toBe('Brush event queue overflow')
    expect(apply).not.toHaveBeenCalled()
  })
  it('reports synchronous and asynchronous callback failures', async () => {
    const syncError = new Error('apply failed'), syncFail = vi.fn()
    createOrderedBrushGate(() => null, syncFail).dispatch([], () => { throw syncError })
    expect(syncFail).toHaveBeenCalledExactlyOnceWith(syncError)
    const load = deferred(), asyncFail = vi.fn()
    createOrderedBrushGate(() => null, asyncFail).dispatch([], () => load.promise)
    const asyncError = new Error('async apply failed')
    load.reject(asyncError)
    await load.promise.catch(() => {})
    expect(asyncFail).toHaveBeenCalledExactlyOnceWith(asyncError)
  })
  it('handles synchronous preparation errors and ignores rejected downloads after cancellation', async () => {
    const fail = vi.fn()
    createOrderedBrushGate(() => { throw new Error('invalid preset') }, fail).dispatch([], vi.fn())
    expect(fail).toHaveBeenCalledOnce()
    const load = deferred()
    const gate = createOrderedBrushGate(() => load.promise, fail)
    gate.dispatch([], vi.fn())
    gate.cancel()
    load.reject(new Error('late failure'))
    await load.promise.catch(() => {})
    expect(fail).toHaveBeenCalledOnce()
  })
})
