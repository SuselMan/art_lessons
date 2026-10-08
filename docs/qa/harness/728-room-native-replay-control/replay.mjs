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
 for(const op of mapped){e.appendOperation(op,'remote');const end=performance.now()+timeoutMs;while(e._settle||e._settleQueue?.length||e._opQueue?.length||e._wcCanonical?.pending){if(e._wcAsyncError)throw e._wcAsyncError;if(performance.now()>end)throw Error('Original GL replay drain timeout');await new Promise(r=>setTimeout(r,25))}}
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
  const a=read(native),b=read(gl),channels=Array.from({length:4},()=>({changed:0,max:0,sum:0})),premultiplied=Array.from({length:3},()=>({changed:0,max:0,sum:0})),whiteComposite=Array.from({length:3},()=>({changed:0,max:0,sum:0})),alphaBins={};let pixels=0,supportNative=0,supportGl=0,supportXor=0;const update=(stat,d)=>{if(d>0){stat.changed++;stat.max=Math.max(stat.max,d);stat.sum+=d}}
  for(let i=0;i<a.length;i+=4){let changed=false;supportNative+=a[i+3]>0;supportGl+=b[i+3]>0;supportXor+=(a[i+3]>0)!==(b[i+3]>0);const alpha=Math.max(a[i+3],b[i+3]),key=alpha===0?'zero':alpha<=8?'1..8':alpha<=32?'9..32':alpha<=128?'33..128':'129..255',bin=alphaBins[key]??(alphaBins[key]={pixels:0,rgbaSum:0,premultipliedSum:0});bin.pixels++;for(let c=0;c<4;c++){const d=Math.abs(a[i+c]-b[i+c]);changed||=d>0;update(channels[c],d);bin.rgbaSum+=d;if(c<3){const ap=a[i+c]*a[i+3]/255,bp=b[i+c]*b[i+3]/255,dp=Math.abs(ap-bp);update(premultiplied[c],dp);bin.premultipliedSum+=dp;update(whiteComposite[c],Math.abs((ap+255-a[i+3])-(bp+255-b[i+3])))}}pixels+=changed}
  const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('')
  const glBinary=await glBlob.arrayBuffer();let glPng=null;if(glBinary.byteLength<=2097152){const bytes=new Uint8Array(glBinary);let text='';for(let start=0;start<bytes.length;start+=8192){let chunk='';for(let i=start;i<Math.min(start+8192,bytes.length);i++)chunk+=String.fromCharCode(bytes[i]);text+=chunk}glPng=btoa(text)}return {width:gl.width,height:gl.height,pixels,channels,premultiplied,whiteComposite,alphaBins,supportNative,supportGl,supportXor,glPng,glPngBytes:glBinary.byteLength,glPngOmitted:glPng?null:'Compressed GL material exceeds2MiB cap',nativeSha:await hash(a),glSha:await hash(b),scope:'Decoded original engine material exports, same endpoint; browser PNG unpremultiplication can hide low-alpha stored RGB differences; no framebuffer/physics exactness claim'}
 }finally{native.close();gl.close()}
}
