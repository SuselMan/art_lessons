/** Serialized into the owned browser page. Readbacks are diagnostics, not timing. */
export async function installMomentStageProbe(){
 const {WetBrushMomentSourceSeam}=await import('/src/engine/src/experiments/wetBrushMomentSourceSeam.ts')
 const {CanonicalRoomWatercolorExecutor}=await import('/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts')
 const seam=WetBrushMomentSourceSeam.prototype,executor=CanonicalRoomWatercolorExecutor.prototype,oldEncode=seam.encodeAfterLanding,oldPublish=executor.publishCurrentToGl
 const pending=[],results=window.__momentStageResults=[]
 seam.encodeAfterLanding=function(encoder,input,enabled){
  if(!enabled)return oldEncode.call(this,encoder,input,enabled)
  const [x,yGl,width,height]=input.segment.rect,y=input.tile.height-yGl-height,w=Math.min(96,width),h=Math.min(96,height),capture={x:Math.max(0,Math.min(width-w,450-48-x)),y:Math.max(0,Math.min(height-h,400-48-y)),width:w,height:h}
  const lease=oldEncode.call(this,encoder,{...input,diagnosticStages:capture},enabled)
  const observers=new Set((lease.stages??[]).map(s=>s.buffer));lease.buffers=lease.buffers.filter(b=>!observers.has(b))
  pending.push({stages:lease.stages??[],recipe:{...input.recipe},operatorRect:{x,y,width,height},capture})
  return lease
 }
 executor.publishCurrentToGl=async function(...args){
  try{return await oldPublish.apply(this,args)}finally{
   while(pending.length){const item=pending.shift(),record={recipe:item.recipe,operatorRect:item.operatorRect,capture:item.capture,stages:[]};try{
    for(const stage of item.stages){await stage.buffer.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(stage.buffer.getMappedRange().slice(0));stage.buffer.unmap();const stride=stage.bytesPerRow??stage.width*stage.bytesPerRecord,tight=new Uint8Array(stage.width*stage.height*stage.bytesPerRecord);for(let row=0;row<stage.height;row++)tight.set(bytes.subarray(row*stride,row*stride+stage.width*stage.bytesPerRecord),row*stage.width*stage.bytesPerRecord);const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',tight)),x=>x.toString(16).padStart(2,'0')).join('');record.stages.push({stage:stage.stage,sha,width:stage.width,height:stage.height,bytesPerRecord:stage.bytesPerRecord,data:Array.from(tight),scope:'Actual bounded stage bytes; observer, not performance'})}
    const e=window.__engine,roi=window.__wetmixRoi;if(e&&roi){e._display();const pixels=new Uint8Array(roi.w*roi.h*4);e.gl.readPixels(roi.x,roi.y,roi.w,roi.h,e.gl.RGBA,e.gl.UNSIGNED_BYTE,pixels);const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),x=>x.toString(16).padStart(2,'0')).join('');record.stages.push({stage:'presentation-after-sourcepublish',sha,width:roi.w,height:roi.h,bytesPerRecord:4,data:Array.from(pixels),glError:e.gl.getError(),scope:'GL default framebuffer diagnostic observer, not timing'})}
    results.push(record)
   }finally{for(const stage of item.stages)stage.buffer.destroy()}}
  }
 }
 window.__restoreMomentStageProbe=()=>{seam.encodeAfterLanding=oldEncode;executor.publishCurrentToGl=oldPublish;for(const item of pending)for(const stage of item.stages)stage.buffer.destroy();pending.length=0}
}
