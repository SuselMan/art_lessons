/** Browser callable in a NEW ordinary Room, after the shared HTTP/paper passport controller.
 * Diagnostic only: no pointer/performance claim and no native source re-preparation. */
export async function replayOriginalGlControl({tape, targetLayerId, expectedBoard, expectedPaperSha, actualPaperSha, timeoutMs=60000}) {
 const e=window.__engine
 if(!e||e._wcNativeEnabled||e.getWatercolorNativeDiagnostics?.()?.enabled)throw Error('Original GL control requires native OFF')
 if(!Array.isArray(tape)||tape.length!==4||tape.some(o=>o.type!=='stroke'))throw Error('Exactly original four stroke operations required')
 if(new Set(tape.map(o=>o.layerId)).size!==1||!e._layers.has(targetLayerId))throw Error('Single layer replay mapping required')
 if(e._log.entries.some(x=>x.op.type==='stroke'))throw Error('Fresh Room without prior strokes required')
 if(!expectedPaperSha||actualPaperSha!==expectedPaperSha)throw Error('Same decoded Fine LA checksum required')
 const board=e._pageSize();if(board.w!==expectedBoard.width||board.h!==expectedBoard.height)throw Error('Same original A4 board required')
 const mapped=tape.map(o=>({...structuredClone(o),layerId:targetLayerId}))
 // Only the logical single-layer ID changes. Packed dabs/wet/seeds/preset/time/color stay literal.
 for(let i=0;i<mapped.length;i++){
  const original={...tape[i],layerId:targetLayerId}
  if(JSON.stringify(mapped[i])!==JSON.stringify(original))throw Error('Replay changes beyond explicit logical layer mapping')
 }
 for(const op of mapped){e.appendOperation(op,'remote');const end=performance.now()+timeoutMs;while(e._settle||e._settleQueue?.length||e._wcCanonical?.pending){if(e._wcAsyncError)throw e._wcAsyncError;if(performance.now()>end)throw Error('Original GL replay drain timeout');await new Promise(r=>setTimeout(r,25))}}
 return {mapped,scope:'Same packed inputs; explicit layer-ID mapping; separate endpoint diagnostic, not timing comparison'}
}
