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

it('prepares current image resources at the SAME queue head after legacy work, before any later apply',async()=>{
 const legacy=deferred(),image=deferred(),events:string[]=[],resource=vi.fn(()=>{events.push('resource');return image.promise})
 const gate=createOrderedBrushGate(vi.fn().mockReturnValueOnce(legacy.promise).mockReturnValue(null),vi.fn())
 gate.dispatch([],()=>events.push('first'),()=>true,resource)
 gate.dispatch([],()=>events.push('later'))
 expect(resource).not.toHaveBeenCalled();legacy.resolve();await legacy.promise
 expect(events).toEqual(['resource']);image.resolve();await image.promise
 expect(events).toEqual(['resource','first','later'])
})
it.each(['legacy','image'] as const)('drops stale %s rejection without failing or applying the newer room',async stage=>{
 const load=deferred(),fail=vi.fn(),old=vi.fn(),next=vi.fn(),resource=vi.fn(()=>stage==='image'?load.promise:null)
 let current=true
 const gate=createOrderedBrushGate(()=>stage==='legacy'&&current?load.promise:null,fail)
 gate.dispatch([],old,()=>current,resource);gate.dispatch([],next)
 current=false;load.reject(new Error('old owner expired'));await load.promise.catch(()=>{})
 expect(fail).not.toHaveBeenCalled();expect(old).not.toHaveBeenCalled();expect(next).toHaveBeenCalledOnce()
})
it('does not start a stale resource getter after a legacy await, and current resource failure still closes once',async()=>{
 const load=deferred(),resource=vi.fn(()=>null),fail=vi.fn();let current=true
 const gate=createOrderedBrushGate(vi.fn().mockReturnValueOnce(load.promise).mockReturnValue(null),fail)
 gate.dispatch([],vi.fn(),()=>current,resource);current=false;load.resolve();await load.promise
 expect(resource).not.toHaveBeenCalled()
 const failure=new Error('missing actual CAS'),apply=vi.fn()
 gate.dispatch([],apply,()=>true,()=>{throw failure});expect(fail).toHaveBeenCalledExactlyOnceWith(failure);expect(apply).not.toHaveBeenCalled()
})
it('does not apply after resource getter reentry invalidates its lifetime',()=>{
 let current=true;const apply=vi.fn(),next=vi.fn(),fail=vi.fn(),gate=createOrderedBrushGate(()=>null,fail)
 gate.dispatch([],apply,()=>current,()=>{current=false;return null});gate.dispatch([],next)
 expect(apply).not.toHaveBeenCalled();expect(next).toHaveBeenCalledOnce();expect(fail).not.toHaveBeenCalled()
})
it.each(['legacy','image'] as const)('observes a %s Promise rejected after its getter synchronously expires the item',async stage=>{
 const load=deferred(),fail=vi.fn(),apply=vi.fn(),next=vi.fn();let current=true
 const expire=()=>{current=false;return load.promise}
 const gate=createOrderedBrushGate(()=>stage==='legacy'&&current?expire():null,fail)
 gate.dispatch([],apply,()=>current,()=>stage==='image'?expire():null);gate.dispatch([],next)
 load.reject(new Error('stale getter'));await load.promise.catch(()=>{})
 expect(fail).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();expect(next).toHaveBeenCalledOnce()
})
