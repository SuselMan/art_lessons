// Post-timing/read-only raster oracle. Never install inside native frame loop.
window.__scissorPixels = async function(label){
 const e=__engine,g=e.gl,w=e.canvas.width,h=e.canvas.height
 if(g.isContextLost()||!e._screenCache)throw Error('Healthy current screen cache required')
 const expected=e._screenCache.readPixels(),actual=new Uint8Array(w*h*4)
 g.bindFramebuffer(g.FRAMEBUFFER,null);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,actual)
 let pixels=0,max=0,sum=0,cacheMinAlpha=255,screenMinAlpha=255
 for(let i=0;i<actual.length;i+=4){cacheMinAlpha=Math.min(cacheMinAlpha,expected[i+3]);screenMinAlpha=Math.min(screenMinAlpha,actual[i+3]);let differs=false;for(let c=0;c<4;c++){const d=Math.abs(actual[i+c]-expected[i+c]);differs||=d>0;max=Math.max(max,d);sum+=d}if(differs)pixels++}
 // Baseline full copy from the SAME cache: mediump sampling may differ
 // from raw cache texels at very large canvases, so raw-cache mismatch alone
 // must not be labelled a scissor regression.
 g.disable(g.SCISSOR_TEST);g.viewport(0,0,w,h);g.useProgram(e._screenBlitProg)
 g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,e._screenCache.texture);g.uniform1i(e._screenBlitTexLoc,0)
 g.bindBuffer(g.ARRAY_BUFFER,e._screenBuf);g.enableVertexAttribArray(e._screenBlitPosLoc);g.vertexAttribPointer(e._screenBlitPosLoc,2,g.FLOAT,false,0,0)
 g.drawArrays(g.TRIANGLES,0,6)
 const full=new Uint8Array(actual.length);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,full)
 let fullPixels=0,fullMax=0
 for(let i=0;i<full.length;i+=4){let differs=false;for(let c=0;c<4;c++){const d=Math.abs(actual[i+c]-full[i+c]);differs||=d>0;fullMax=Math.max(fullMax,d)}if(differs)fullPixels++}
 const attrs=g.getContextAttributes(),gl=g.getError()
 return{cacheMinAlpha,screenMinAlpha,label,w,h,pixels,max,sum,fullPixels,fullMax,attrs,gl,limitation:'Current screen cache vs defaultFB same-task byte comparison; canonical unaffected. Readback only after timing.'}
}
