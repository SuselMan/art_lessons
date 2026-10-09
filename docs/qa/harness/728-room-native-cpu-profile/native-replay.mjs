/** Diagnostic SAME packed tape through ordinary Room appendOperation, never native-owned input. */
export async function replayNativePackedControl({tape,targetLayerId,expectedBoard,expectedPaperSha,actualPaperSha,expectedOperationCount=4,timeoutMs=60000}){
 const e=window.__engine
 if(!e?._wcNativeEnabled||!e._wcNative)throw Error('Ready ordinary Room native executor required')
 if(![2,4].includes(expectedOperationCount))throw Error('Explicit two/four operation corpus required')
 if(!Array.isArray(tape)||tape.length!==expectedOperationCount||tape.some(o=>o.type!=='stroke')||new Set(tape.map(o=>o.layerId)).size!==1)throw Error('Original single-layer exact-count stroke tape required')
 if(!e._layers.has(targetLayerId)||e._log.entries.some(x=>x.op.type==='stroke'))throw Error('Fresh actual target layer required')
 if(!expectedPaperSha||expectedPaperSha!==actualPaperSha)throw Error('Identical decoded paper passport required')
 const board=e._pageSize();if(board.w!==expectedBoard.width||board.h!==expectedBoard.height)throw Error('Actual original board dimensions required')
 const before=JSON.stringify(tape),mapped=tape.map(o=>({...structuredClone(o),layerId:targetLayerId}))
 for(let i=0;i<mapped.length;i++)if(JSON.stringify(mapped[i])!==JSON.stringify({...tape[i],layerId:targetLayerId}))throw Error('Unexpected packed input mutation')
 for(const op of mapped){e.appendOperation(op,'remote');const end=performance.now()+timeoutMs;while(e._settle||e._settleQueue?.length||e._opQueue?.length||e._wcCanonical?.pending){if(e._wcAsyncError)throw e._wcAsyncError;if(performance.now()>end)throw Error('Native packed replay timeout');await new Promise(r=>setTimeout(r,25))}if(e._wcAsyncError)throw e._wcAsyncError}
 if(JSON.stringify(tape)!==before)throw Error('Immutable original tape changed')
 return{mapped,scope:'Same packed tape through existing remote/replay Room executor; only explicit logical-layer mapping; no live pointer timing claim'}
}
