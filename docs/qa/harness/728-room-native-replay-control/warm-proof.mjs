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
