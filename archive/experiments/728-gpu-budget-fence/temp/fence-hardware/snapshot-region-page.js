(async()=>{
 const {AccumulationBuffer}=await import('/snapshot-region-AccumulationBuffer728.ts');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=16;document.body.append(canvas);
 const gl=canvas.getContext('webgl');if(!gl)throw Error('GL absent');const ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);if(!String(renderer).includes('Adreno'))throw Error('actual device mismatch');
 const source=Uint8Array.from({length:1024*1024*4},(_,i)=>(i*73+(i>>>5))&255),buffer=new AccumulationBuffer(gl,1024,1024),restored=new AccumulationBuffer(gl,1024,1024);const results=[];
 try{buffer.restorePixels(source);const full=buffer.readPixels();if(full.some((b,i)=>b!==source[i]))throw Error('source upload/read mismatch');
 for(const[w,h]of[[1024,1024],[730,1024],[1024,432],[730,432],[731,431],[0,432]]){
  const expected=new Uint8Array(w*h*4);for(let y=0;y<h;y++)expected.set(full.subarray(((1024-h+y)*1024)*4,((1024-h+y)*1024+w)*4),y*w*4);
  gl.pixelStorei(gl.PACK_ALIGNMENT,8);const start=performance.now(),region=buffer.readPixelsRegion(0,1024-h,w,h),end=performance.now();const pack=gl.getParameter(gl.PACK_ALIGNMENT);let changed=0;for(let i=0;i<expected.length;i++)changed+=expected[i]!==region[i];if(changed||pack!==8)throw Error('region mismatch/alignment '+w+'x'+h);
  let restoreChanged=0;if(w&&h){restored.restorePixelsRect(w,h,region);const again=restored.readPixelsRegion(0,1024-h,w,h);for(let i=0;i<region.length;i++)restoreChanged+=region[i]!==again[i];if(restoreChanged)throw Error('restore mismatch')}
  results.push({w,h,bytes:region.length,changed,restoreChanged,pack,ms:end-start});
 }
 const error=gl.getError(),lost=gl.isContextLost();if(error||lost)throw Error('GL/lost '+error);return{renderer,sourceNonzero:full.some(b=>b!==0),results,error,lost};
 }finally{buffer.destroy();restored.destroy();canvas.remove()}
})()
