import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Operation, SendResult } from '@grafetto/shared'

import { sendOperationWithTimeout, type OperationEmitter } from './sendOperation'

const op: Operation = { id: 'op-1', type: 'layer_add', userId: 'me', timestamp: 0, layerId: 'L1', name: 'Layer' }

function emitter(answer?: SendResult): OperationEmitter & { sent: Operation[] } {
  const sent: Operation[] = []
  return {
    sent,
    emit: (...args) => {
      if(args[0]==='operation')sent.push(args[1])
      if(answer)args[2](answer)
    },
  }
}

describe('sendOperationWithTimeout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('resolves with the server verdict', async () => {
    const socket = emitter({ ok: true, seq: 7 })
    await expect(sendOperationWithTimeout(socket, op)).resolves.toEqual({ ok: true, seq: 7 })
    expect(socket.sent).toEqual([op])
  })

  it('rejects without a socket, so the outbox retries later', async () => {
    await expect(sendOperationWithTimeout(null, op)).rejects.toThrow('no active socket')
  })

  it('rejects when the ack never comes back', async () => {
    const pending = sendOperationWithTimeout(emitter(), op, 5000)
    const verdict = expect(pending).rejects.toThrow('timed out')
    vi.advanceTimersByTime(5000)
    await verdict
  })
})

it('maps an outbox close to the existing typed request without client placement or first-frame authority',async()=>{
 const close:Extract<Operation,{type:'canonical_stroke_close'}>={type:'canonical_stroke_close',id:'close',userId:'author',timestamp:99,seq:123,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:2,firstFrameOpId:'client-first',lastFrameOpId:'last'}
 const emit=vi.fn((...args:Parameters<OperationEmitter['emit']>)=>{args[2]({ok:true,seq:8})})
 await expect(sendOperationWithTimeout({emit},close)).resolves.toEqual({ok:true,seq:8})
 expect(emit).toHaveBeenCalledWith('canonical_stroke_close',{operationId:'close',layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',expectedRecordedNext:2,expectedLastFrameOpId:'last'},expect.any(Function))
 expect(close.seq).toBe(123);expect(close.firstFrameOpId).toBe('client-first')
})
it('does not invoke close ordering accessors or emit a malformed typed request',async()=>{
 const close:Extract<Operation,{type:'canonical_stroke_close'}>={type:'canonical_stroke_close',id:'close',userId:'author',timestamp:0,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:2,firstFrameOpId:'first',lastFrameOpId:'last'}
 const get=vi.fn(()=>2),emit=vi.fn()
 Object.defineProperty(close,'recordedNext',{get})
 await expect(sendOperationWithTimeout({emit},close,10)).rejects.toThrow()
 expect(get).not.toHaveBeenCalled();expect(emit).not.toHaveBeenCalled()
})
it('clears its timeout when the captured emitter throws synchronously',async()=>{
 vi.useFakeTimers()
 try{
  await expect(sendOperationWithTimeout({emit:()=>{throw Error('emit failed')}},op)).rejects.toThrow('emit failed')
  expect(vi.getTimerCount()).toBe(0)
 }finally{vi.useRealTimers()}
})

it('reports actual emission after the socket call and never reports a throwing emit',async()=>{
 const order:string[]=[],emitted=vi.fn(()=>order.push('emitted'))
 const pending=sendOperationWithTimeout({emit:(...args)=>{order.push('emit');args[2]({ok:true,seq:1});order.push('returned')}},op,100,emitted)
 expect(order).toEqual(['emit','returned','emitted']);await expect(pending).resolves.toMatchObject({ok:true})
 await expect(sendOperationWithTimeout({emit:()=>{throw Error('failed emit')}},op,100,emitted)).rejects.toThrow('failed emit');expect(emitted).toHaveBeenCalledOnce()
})
