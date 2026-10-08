/** Serialized into the owned browser page. Readbacks are diagnostics, not timing. */
export async function installMomentStageProbe(){
 const {WetBrushMomentSourceSeam}=await import('/src/engine/src/experiments/wetBrushMomentSourceSeam.ts')
 const {CanonicalRoomWatercolorExecutor}=await import('/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts')
 const seam=WetBrushMomentSourceSeam.prototype,executor=CanonicalRoomWatercolorExecutor.prototype,oldEncode=seam.encodeAfterLanding,oldPublish=executor.publishCurrentToGl
 const active=new Set(),pending=[],results=window.__momentStageResults=[],payloads=window.__momentStagePayloads=new Map();let nextPayload=0,residentChars=0
 const retain=bytes=>{const encoded=base64(bytes);if((residentChars+encoded.length)*2>32*1024*1024)throw Error('Stage JS string retention budget exceeded');const payloadId=nextPayload++;payloads.set(payloadId,encoded);residentChars+=encoded.length;return{payloadId,encodedLength:encoded.length}}
 const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)}
 seam.encodeAfterLanding=function(encoder,input,enabled){
  if(!enabled)return oldEncode.call(this,encoder,input,enabled)
  const [x,yGl,width,height]=input.segment.rect,y=input.tile.height-yGl-height,w=Math.min(96,width),h=Math.min(96,height),capture={x:Math.max(0,Math.min(width-w,450-48-x)),y:Math.max(0,Math.min(height-h,400-48-y)),width:w,height:h}
  const lease=oldEncode.call(this,encoder,{...input,diagnosticStages:capture},enabled)
  const observers=new Set((lease.stages??[]).map(s=>s.buffer));lease.buffers=lease.buffers.filter(b=>!observers.has(b))
  pending.push({stages:lease.stages??[],recipe:{...input.recipe},operatorRect:{x,y,width,height},capture})
  return lease
 }
 executor.publishCurrentToGl=async function(...args){
  let published=false
  try{const value=await oldPublish.apply(this,args);published=true;return value}finally{
   while(pending.length){const item=pending.shift();for(const stage of item.stages)active.add(stage.buffer);const record={recipe:item.recipe,operatorRect:item.operatorRect,capture:item.capture,published,stages:[]};try{
    for(const stage of item.stages){await stage.buffer.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(stage.buffer.getMappedRange().slice(0));stage.buffer.unmap();const stride=stage.bytesPerRow??stage.width*stage.bytesPerRecord,tight=new Uint8Array(stage.width*stage.height*stage.bytesPerRecord);for(let row=0;row<stage.height;row++)tight.set(bytes.subarray(row*stride,row*stride+stage.width*stage.bytesPerRecord),row*stage.width*stage.bytesPerRecord);const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',tight)),x=>x.toString(16).padStart(2,'0')).join('');record.stages.push({stage:stage.stage,sha,width:stage.width,height:stage.height,bytesPerRecord:stage.bytesPerRecord,byteLength:tight.length,...retain(tight),scope:'Actual bounded stage bytes; observer, not performance'})}
    const e=window.__engine;if(e&&published){e._display();const m=e._camera.screenToWorldMatrix(),dx=450-m[6],dy=400-m[7],det=m[0]*m[4]-m[3]*m[1],cx=(m[4]*dx-m[3]*dy)/det,cy=(-m[1]*dx+m[0]*dy)/det,w=Math.min(96,e.canvas.width),h=Math.min(96,e.canvas.height),roi={x:Math.max(0,Math.min(e.canvas.width-w,Math.floor(cx-w/2))),y:Math.max(0,Math.min(e.canvas.height-h,Math.floor(e.canvas.height-cy-h/2))),w,h};const pixels=new Uint8Array(w*h*4);e.gl.readPixels(roi.x,roi.y,w,h,e.gl.RGBA,e.gl.UNSIGNED_BYTE,pixels);const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),x=>x.toString(16).padStart(2,'0')).join('');record.stages.push({stage:'presentation-after-sourcepublish',sha,width:roi.w,height:roi.h,bytesPerRecord:4,byteLength:pixels.length,...retain(pixels),glError:e.gl.getError(),scope:'GL default framebuffer diagnostic observer, not timing'})}
    results.push(record)
   }catch(error){record.observerError=String(error);if(!results.includes(record))results.push(record)}finally{for(const stage of item.stages){stage.buffer.destroy();active.delete(stage.buffer)}}}
  }
 }
 window.__restoreMomentStageProbe=()=>{seam.encodeAfterLanding=oldEncode;executor.publishCurrentToGl=oldPublish;for(const item of pending)for(const stage of item.stages)stage.buffer.destroy();pending.length=0;for(const buffer of active)buffer.destroy();active.clear();payloads.clear()}
}
