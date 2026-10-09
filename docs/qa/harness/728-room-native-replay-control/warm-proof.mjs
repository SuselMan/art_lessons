/** QA proof from bounded init markers. No device calls or inference about GPU
 * duration; a missing/error completion never becomes a successful warm gate. */
export function assertRawWarmProof({enabled,markers,readyAt,firstDownAt}){
 const completed=markers.filter(m=>m.stage==='raw-warm:completed')
 if(!enabled){if(completed.length)throw Error('OFF raw warm unexpectedly ran');return {enabled:false}}
 if(completed.length!==1)throw Error('Expected exactly one raw warm completion')
 const value=completed[0].value
 if(!value||value.peakBytes!==4194304||value.scope!=='raw canvas only'||value.sourceWarmed!==false||value.pressureWarmed!==false||value.compositeWarmed!==false)throw Error('Raw warm resource/scope proof mismatch')
 if(![value.completedAt,value.wallMs,readyAt,firstDownAt].every(Number.isFinite)||value.wallMs<0||value.completedAt>readyAt||readyAt>firstDownAt)throw Error('Raw warm must complete before readiness and DOWN')
 return {enabled:true,wallMs:value.wallMs,completedAt:value.completedAt,readyAt,firstDownAt,peakBytes:value.peakBytes,scope:value.scope}
}

/** Separate first-LIVE arm; it must never be reported as the raw-only proof. */
export function assertFirstLiveWarmProof({enabled,markers,readyAt,firstDownAt}){
 const completed=markers.filter(m=>m.stage==='first-live-warm:completed')
 if(!enabled){if(completed.length)throw Error('OFF first-live warm unexpectedly ran');return {enabled:false}}
 if(completed.length!==1)throw Error('Expected one first-live warm completion')
 const v=completed[0].value
 if(!v||v.scope!=='prepared source + live composite + raw canvas'||v.plannerWarmed!==false||v.pressureDispatched!==false||v.brushPipelinesConstructed!==true||v.liveCompositeWarmed!==true||v.rawCanvasWarmed!==true||v.glPublished!==false||!/^[a-f0-9]{64}$/.test(v.sourceSha256??'')||!Number.isFinite(v.peakBytes)||v.peakBytes>96*1024*1024||v.peakBytes<4*1024*1024||!Number.isFinite(v.transientBufferBytes)||v.transientBufferBytes>262144||![0,4].includes(v.sharedResourceDeltaBytes))throw Error('First-live warm scope/resource proof mismatch')
 if(![v.completedAt,v.wallMs,readyAt,firstDownAt].every(Number.isFinite)||v.wallMs<0||v.completedAt>readyAt||readyAt>firstDownAt)throw Error('First-live warm must complete before readiness and DOWN')
 return {enabled:true,wallMs:v.wallMs,completedAt:v.completedAt,readyAt,firstDownAt,peakBytes:v.peakBytes,transientBufferBytes:v.transientBufferBytes,sourceSha256:v.sourceSha256,scope:v.scope}
}
