/** Research-only observer. Does not submit, wait, wake or schedule GPU work. */
export function createBoundedSchedulingObserver(maxRows=2048, clock=()=>performance.now()) {
  if(!Number.isInteger(maxRows)||maxRows<1||maxRows>8192)throw new Error('Invalid observer row bound')
  const rows=[];let dropped=0,errors=0,closed=false
  const append=(kind,passport,extra)=>{
    if(closed)return
    try {
      if(rows.length>=maxRows){dropped++;return}
      rows.push(Object.freeze({kind,...passport,...extra,at:clock()}))
    } catch {errors++} // Diagnostics must not interrupt the owner.
  }
  const passport=input=>{
    for(const key of ['fifoEpoch','requestId','ownerEpoch'])if(!Number.isSafeInteger(input[key])||input[key]<0)throw new Error('Invalid request provenance')
    if(!['source','material'].includes(input.requestKind))throw new Error('Invalid request kind')
    return Object.freeze({fifoEpoch:input.fifoEpoch,requestId:input.requestId,ownerEpoch:input.ownerEpoch,requestKind:input.requestKind})
  }
  return {
    bindRequest(input){
      const origin=passport(input);let cancelled=false
      return Object.freeze({
        cancel(){cancelled=true},
        resume(queued){append('schedulerResume',origin,{queued,cancelled})},
        /** Capture at encode, call only from original cleanup/ACK callback.
         * Late ACK remains evidence; it never wakes the cancelled request. */
        bindRelease(quantumId){
          if(!Number.isSafeInteger(quantumId)||quantumId<0)throw new Error('Invalid quantum provenance')
          let released=false
          return (outcome,pendingBefore,pendingAfter,live)=>{
            if(released)return;released=true
            append('scopeRelease',origin,{quantumId,outcome,pendingBefore,pendingAfter,live,cancelled})
          }
        }
      })
    },
    snapshot(){return {rows:rows.slice(),dropped,observerErrors:errors,closed,maxRows}},
    close(){closed=true}
  }
}
/** Safe integration wrapper: observer exceptions cannot affect original callback. */
export function observeAfterOriginal(original, observer) {
  let completed=false
  return (...args)=>{
    if(completed)return;completed=true
    const result=original(...args)
    try {observer?.(...args)}catch{/* observation only */}
    return result
  }
}
