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
    Object.assign(e._ribbonPainter,{diagnosticSegmentDelivery:"combined",diagnosticPigmentRecord:true,diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticSolventField:true,diagnosticLandingPolicy:"fluid"})
    const ids=[...new Set(test.ops.map(o=>o.layerId))]
    for(const id of ids)e.initLayer(id)
    e.setCompositeOrder(ids.map(id=>({id,opacity:1})))
    const idle=async()=>{const t=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(gl.isContextLost())throw Error('QA context lost');if(performance.now()-t>60000)throw Error('QA idle timeout');await new Promise(r=>setTimeout(r,20))}}
    for(const op of test.ops){e.appendOperation(op,'remote');await idle()}
    e.watercolorDryAll();await idle()
    const first=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer())
    for(const id of ids)e._rebuildLayer(id)
    await idle();e.watercolorDryAll();await idle()
    const bytes=new Uint8Array(await(await e.exportPNG(false)).arrayBuffer())
    let png='';for(let i=0;i<bytes.length;i+=8192)png+=String.fromCharCode(...bytes.subarray(i,i+8192))
    return {png:btoa(png),same:first.length===bytes.length&&first.every((v,i)=>v===bytes[i]),gl:gl.getError(),lost:gl.isContextLost(),linked,failed,userLost:window.__engine?.gl.isContextLost()}
  } finally {e.destroy()}
}
