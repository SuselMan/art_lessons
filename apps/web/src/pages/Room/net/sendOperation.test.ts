import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Operation, SendResult } from '@grafetto/shared'

import { sendOperationWithTimeout, type OperationEmitter } from './sendOperation'

const op: Operation = { id: 'op-1', type: 'layer_add', userId: 'me', timestamp: 0, layerId: 'L1', name: 'Layer' }

function emitter(answer?: SendResult): OperationEmitter & { sent: Operation[] } {
  const sent: Operation[] = []
  return {
    sent,
    emit: (_event, sentOp, ack) => {
      sent.push(sentOp)
      if (answer) ack(answer)
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
