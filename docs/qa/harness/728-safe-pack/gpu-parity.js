(async function(tape){
 const {AccumulationBuffer:B}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');const gl=__engine.gl;const tests=[];
 for(const filter of ['linear','nearest'])for(const [w,h]of [[16,16],[13,7]]){
  const s=new B(gl,w,h,filter),d=new B(gl,w,h,filter),old=new B(gl,w,h,filter);try{
   const a=Uint8Array.from({length:w*h*4},(_,i)=>(i*37+Math.floor(i/4)*11)%256);s.restorePixels(a);d.restorePixels(new Uint8Array(a.length).fill(199));
   s.copyTo(d);gl.bindFramebuffer(gl.FRAMEBUFFER,s._fbo);gl.bindTexture(gl.TEXTURE_2D,old._texture);gl.copyTexImage2D(gl.TEXTURE_2D,0,gl.RGBA,0,0,w,h,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   const expected=old.readPixels(),actual=d.readPixels();if(actual.some((v,i)=>v!==expected[i])||actual.some((v,i)=>v!==a[i]))throw Error('RGBA copy mismatch');
   gl.bindTexture(gl.TEXTURE_2D,old._texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,a);d.restorePixels(a);const restored=old.readPixels();if(d.readPixels().some((v,i)=>v!==restored[i]))throw Error('RGBA restore mismatch');
   tests.push({w,h,filter,equal:true});
  }finally{s.destroy();d.destroy();old.destroy()}
 }
 const bufferGl=gl.getError();if(bufferGl)throw Error('buffer parity GL '+bufferGl);const opts=__engine._opts;const {PencilEngine}=await import('/src/engine/index.ts');__engine.destroy();const c=document.createElement('canvas');c.width=640;c.height=480;document.body.append(c);const e=new PencilEngine(c,{pageWidth:1754,pageHeight:2480,paper:opts.paper,paperScale:opts.paperScale,gradientFibres:true,userId:'safe-pack-replay',joinedTouch:true});
 const idle=async()=>{let until=performance.now()+90000;while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size||e._washReveals.size){if(performance.now()>until)throw Error('replay idle timeout');await new Promise(r=>setTimeout(r,30))}};
 const shot=async()=>{await idle();const b=await e.exportPNG(true);if(!b)throw Error('missing export');const i=await createImageBitmap(b),cc=document.createElement('canvas');cc.width=i.width;cc.height=i.height;const g=cc.getContext('2d');g.drawImage(i,0,0);i.close();const a=g.getImageData(0,0,cc.width,cc.height).data;let visible=0;for(let k=3;k<a.length;k+=4)visible+=a[k]>0;return{sha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',a))].map(x=>x.toString(16).padStart(2,'0')).join(''),visible,size:[cc.width,cc.height]}};
 try{await e.paperReady();for(const layerId of new Set(tape.map(o=>o.layerId))){e.appendOperation({id:'safe-layer-'+layerId,type:'layer_add',userId:'safe-pack-replay',timestamp:1,layerId,name:'A/B'},'remote')};e.setCompositeOrder([...new Set(tape.map(o=>o.layerId))].map(id=>({id,opacity:1})));
 for(const o of tape){e.appendOperation(o,'remote');await idle()};e.watercolorDryAll();const dry=await shot();if(!dry.visible)throw Error('empty replay');return{tests,replay:dry,gl:bufferGl,replayGl:e.gl.getError(),lost:e.gl.isContextLost()};}finally{e.destroy();c.remove()}
})
