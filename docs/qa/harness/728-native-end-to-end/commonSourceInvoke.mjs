/** Self-contained CDP serialization: every dependency is a supplied argument or window export. */
export async function invokeCommonSurface({mode,operation,packed,chunks,code}){
 if(mode==='producer'){const c=await window.prepareCommonSourceCheckpoint({operation,timeoutMs:90000});if(c.code!==code)throw Error('Producer code guard');return window.persistCommonSourceCheckpoint(c,window.__writeCommonChunk)}
 const c=await window.restoreCommonSourceCheckpoint(packed,async name=>Uint8Array.from(atob(chunks[name]),x=>x.charCodeAt(0)))
 return window.runCommonSourceSolver({operation,checkpoint:c,commonSource:mode==='common',producerCode:packed.code})
}
