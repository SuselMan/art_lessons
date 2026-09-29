import type { Operation, SendResult } from '@grafetto/shared'

/** The one socket call the outbox makes. Structural, so a test can hand in a
 *  plain object; the room's typed socket satisfies it as is. */
export interface OperationEmitter {
  emit(event: 'operation', op: Operation, ack: (result: SendResult) => void): unknown
}

// (#289 epic, reliable history spec v0.2 §9) A bare socket.io ack has no
// timeout of its own — a dropped packet (either leg) would otherwise leave
// the Outbox waiting forever instead of ever retrying. `socket` is read at
// call time by the caller (never closed over stale), since Outbox.send is
// invoked long after the socket that existed when the Outbox itself was
// constructed may have been replaced by a reconnect.
export function sendOperationWithTimeout(
  socket: OperationEmitter | null, op: Operation, timeoutMs = 5000,
): Promise<SendResult> {
  return new Promise((resolve, reject) => {
    if (!socket) { reject(new Error('sendOperationWithTimeout: no active socket')); return }
    const timer = setTimeout(() => reject(new Error('operation send timed out')), timeoutMs)
    socket.emit('operation', op, result => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}
