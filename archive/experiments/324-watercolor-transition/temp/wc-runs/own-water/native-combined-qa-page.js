async function(test) {
  const {PencilEngine}=await import('/src/engine/index.ts')
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=600
  const gl=canvas.getContext('webgl',{premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false})
  const shaderSource=gl.shaderSource.bind(gl), link=gl.linkProgram.bind(gl)
  const salt='// unified-water-cold-'+Date.now()+'\n'
  let linked=0,failed=0
  gl.shaderSource=(shader,source)=>shaderSource(shader,salt+source)
  gl.linkProgram=program=>{link(program);linked++;if(!gl.getProgramParameter(program,gl.LINK_STATUS))failed++}
  const e=new PencilEngine(canvas,{pageWidth:2000,pageHeight:1200,paper:'medium',userId:'unified-water-qa'})
  try {
    await e.paperReady()
    const flags=Object.fromEntries(Object.entries(e._ribbonPainter).filter(([k])=>k.startsWith("diagnostic") && k!=="diagnosticTrace")); if(flags.diagnosticWaterPolicy!=="bottomless"||!flags.diagnosticSolventField||!flags.diagnosticCanonicalSettleRadius||!flags.diagnosticForeignSolvent)throw Error("Native DEV review flags missing")
    const ids=['native'];e.initLayer('native');e.setActiveLayer('native');e.setCompositeOrder([{id:'native',opacity:1}]);e.setTool('watercolor');e.setSize(40);e.setViewport(450,300,.4,0);e.setColor([.22,0,.6]);e.setPencil('normal:100:15:PB29:round');
    const idle=async()=>{const t=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(performance.now()-t>60000)throw Error('idle timeout');await new Promise(r=>setTimeout(r,16))}}
    const sample=i=>({x:100+i*12,y:150,pressure:.7,tiltX:0,tiltY:0,speed:.5,pointerType:'pen',timeStamp:performance.now()});e._onStart(sample(0));for(let i=1;i<=15;i++){e._onMove(sample(i));await new Promise(r=>requestAnimationFrame(r))}e._onEnd(sample(15));await idle();e.watercolorDryAll();await idle();const glBefore=gl.getError();const revealBefore=e._washReveals.size;e._display();const frameA=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,frameA);const nativeBytes=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer());const revealAfter=e._washReveals.size;await new Promise(r=>setTimeout(r,150));e._display();const frameB=new Uint8Array(frameA.length);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,frameB);let frameChanged=0;for(let i=0;i<frameA.length;i+=4)if(frameA[i]!==frameB[i]||frameA[i+1]!==frameB[i+1]||frameA[i+2]!==frameB[i+2])frameChanged++;let nativePng='';for(let i=0;i<nativeBytes.length;i+=8192)nativePng+=String.fromCharCode(...nativeBytes.subarray(i,i+8192));const undo=e.undo();await idle();await new Promise(r=>setTimeout(r,100));const glUndo=gl.getError();const redo=e.redo();await idle();await new Promise(r=>setTimeout(r,100));const glRedo=gl.getError();e.watercolorDryAll();await idle();
    const first=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer())
    for(const id of ids)e._rebuildLayer(id)
    await idle();e.watercolorDryAll();await idle()
    const bytes=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer())
    let png='';for(let i=0;i<bytes.length;i+=8192)png+=String.fromCharCode(...bytes.subarray(i,i+8192))
    return {nativePng:btoa(nativePng),revealBefore,revealAfter,frameChanged,glBefore,glUndo,glRedo,undo:!!undo,redo:!!redo,flags,png:btoa(png),same:first.length===bytes.length&&first.every((v,i)=>v===bytes[i]),gl:gl.getError(),lost:gl.isContextLost(),linked,failed,userLost:window.__engine?.gl.isContextLost()}
  } finally {e.destroy()}
}
