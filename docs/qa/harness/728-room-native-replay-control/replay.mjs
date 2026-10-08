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
/** Endpoint-only comparison. PNG is the engine export, not camera/UI screenshot. */
export async function compareGlMaterialEndpoint(nativePngBase64) {
 if(typeof nativePngBase64!=='string'||nativePngBase64.length>2796204)throw Error('Bounded native material PNG required')
 const e=window.__engine;if(!e||e._wcNativeEnabled)throw Error('Original GL endpoint required')
 const glBlob=await e.exportPNG(true);if(!glBlob)throw Error('GL material export absent')
 const raw=atob(nativePngBase64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i)
 const native=await createImageBitmap(new Blob([bytes],{type:'image/png'})),gl=await createImageBitmap(glBlob)
 try {
  if(native.width!==gl.width||native.height!==gl.height)throw Error('Material export dimensions differ')
  const read=bitmap=>{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data}
  const a=read(native),b=read(gl),channels=Array.from({length:4},()=>({changed:0,max:0,sum:0}));let pixels=0
  for(let i=0;i<a.length;i+=4){let changed=false;for(let c=0;c<4;c++){const d=Math.abs(a[i+c]-b[i+c]);if(d){changed=true;channels[c].changed++;channels[c].max=Math.max(channels[c].max,d);channels[c].sum+=d}}pixels+=changed}
  const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('')
  return {width:gl.width,height:gl.height,pixels,channels,nativeSha:await hash(a),glSha:await hash(b),scope:'Decoded original engine material exports, same endpoint; browser PNG unpremultiplication can hide low-alpha stored RGB differences; no framebuffer/physics exactness claim'}
 }finally{native.close();gl.close()}
}
