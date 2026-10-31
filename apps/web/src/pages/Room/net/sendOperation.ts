import {parseCanonicalStrokeCloseRequest,type CanonicalStrokeCloseRequest,type Operation,type SendResult} from '@grafetto/shared'

/** The one socket call the outbox makes. Structural, so a test can hand in a
 *  plain object; the room's typed socket satisfies it as is. */
export interface OperationEmitter {
  emit(...args:['operation',Operation,(result:SendResult)=>void]|['canonical_stroke_close',CanonicalStrokeCloseRequest,(result:SendResult)=>void]):unknown
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
    let timer:ReturnType<typeof setTimeout>|undefined
    try{
      const type=Object.getOwnPropertyDescriptor(op,'type')
      if(!type||!Object.hasOwn(type,'value'))throw TypeError('Operation type must be own data')
      let close:Readonly<CanonicalStrokeCloseRequest>|undefined
      if(type.value==='canonical_stroke_close'){
        const field=(name:string):unknown=>{const d=Object.getOwnPropertyDescriptor(op,name);if(!d||!Object.hasOwn(d,'value'))throw TypeError('Close request must be own data');return d.value}
        close=parseCanonicalStrokeCloseRequest({operationId:field('id'),layerId:field('layerId'),targetUserId:field('targetUserId'),strokeId:field('strokeId'),disposition:field('disposition'),expectedRecordedNext:field('recordedNext'),expectedLastFrameOpId:field('lastFrameOpId')})
      }
      timer=setTimeout(()=>reject(new Error('operation send timed out')),timeoutMs)
      const ack=(result:SendResult)=>{clearTimeout(timer);resolve(result)}
      if(close)socket.emit('canonical_stroke_close',close,ack)
      else socket.emit('operation',op,ack)
    }catch(error){clearTimeout(timer);reject(error)}
  })
}
