(async () => {
  const e=__engine,gl=e.gl,passes=e._watercolorPasses,pool=e._ribbonScratchPool;
  const {WC_BRUSH_DRAG_BASELINE_FRAG:WC_BRUSH_DRAG_FRAG,WC_BRUSH_DRAG_FRAG:WC_BRUSH_DRAG_EARLY_ZERO_FRAG,DISPLAY_VERT}=await import('/src/engine/src/raster/shaders.ts');
  const {createProgram,getUniforms}=await import('/src/engine/src/raster/utils.ts');
  const keys=Object.keys(passes._brushDragUni),old={prog:passes._brushDragProg,uni:passes._brushDragUni,pos:passes._brushDragPosLoc};
  const nonce=Date.now(),programs=[WC_BRUSH_DRAG_FRAG,WC_BRUSH_DRAG_EARLY_ZERO_FRAG].map((source,i)=>{
    const prog=createProgram(gl,DISPLAY_VERT+'\n// owned brush cold '+nonce+' '+i,source+'\n// owned brush cold '+nonce+' '+i);
    return {prog,uni:getUniforms(gl,prog,keys),pos:gl.getAttribLocation(prog,'a_position'),linked:gl.getProgramParameter(prog,gl.LINK_STATUS),chars:source.length};
  });
  const rows=[];
  const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const read=buf=>{const data=new Uint8Array(buf.width*buf.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,buf.fbo);gl.readPixels(0,0,buf.width,buf.height,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return data};
  const upload=(buf,data)=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,buf.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,buf.width,buf.height,gl.RGBA,gl.UNSIGNED_BYTE,data)};
  try {
    for(const size of [128,256,512])for(const kind of ['wet-ellipse','dry-hole','zero-dose','dry-water','capacity']) {
      const p=pool.acquire(size,size),c=pool.acquire(size,size),v=pool.acquire(size,size),outP=pool.acquire(size,size),outC=pool.acquire(size,size);
      const P=new Uint8Array(size*size*4),C=new Uint8Array(P.length),V=new Uint8Array(P.length),F=new Uint8Array(P.length);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const j=(y*size+x)*4,d=kind==='capacity'?(x<size/2?252:3):60+((x*7+y*11)%100);
        P.set([Math.floor(d*.7),Math.floor(d*.8),d,d],j);C.set([Math.floor(d*.25),Math.floor(d*.5),Math.floor(d*.75),d],j);
        const wet=kind==='dry-water'?0:kind==='dry-hole'&&x%13<4?0:190;V.set([0,0,wet,wet],j);
        const dx=(x-size/2)/(size*.48),dy=(y-size/2)/(size*.48),exposure=kind==='zero-dose'?0:Math.max(0,Math.round(210*(1-dx*dx-dy*dy)));
        F.set([x%17<8?170:86,y%19<9?165:91,exposure,255],j);
      }
      const flow=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,flow);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,F);
      const outputs=[];
      try {
        upload(p,P);upload(c,C);upload(v,V);
        const field={w:size,h:size,coverage:v},rect=[.2,.2,.6,.6],scissor=[0,0,size,size];
        for(let arm=0;arm<2;arm++){
          Object.assign(passes,{_brushDragProg:programs[arm].prog,_brushDragUni:programs[arm].uni,_brushDragPosLoc:programs[arm].pos});
          const result={arm,timings:{},hashes:{},nonzero:{},changed:{}};
          const armBytes={};
          for(const [name,source,out,input] of [['P',p,outP,P],['C',c,outC,C]]){
            const draw=()=>passes.brushPass(field,flow,4,1,source,out,p,rect,scissor,c,.15);
            const pixel=new Uint8Array(4),sync=()=>{gl.bindFramebuffer(gl.FRAMEBUFFER,out.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);gl.bindFramebuffer(gl.FRAMEBUFFER,null)};
            for(let i=0;i<3;i++){draw();sync()}
            const times=[];for(let i=0;i<5;i++){const t=performance.now();draw();sync();times.push(performance.now()-t)}
            const data=read(out);armBytes[name]=data;result.timings[name]=times;result.hashes[name]=await hash(data);result.nonzero[name]=data.some(x=>x!==0);let changed=0;for(let i=0;i<data.length;i+=4)if(data[i]!==input[i]||data[i+1]!==input[i+1]||data[i+2]!==input[i+2]||data[i+3]!==input[i+3])changed++;result.changed[name]=changed;
          }
          outputs.push({result,bytes:armBytes});
        }
        const differences={};for(const name of ['P','C']){let pixels=0,max=0,a=outputs[0].bytes[name],b=outputs[1].bytes[name];for(let i=0;i<a.length;i+=4){let differs=false;for(let j=0;j<4;j++){differs||=a[i+j]!==b[i+j];max=Math.max(max,Math.abs(a[i+j]-b[i+j]))}if(differs)pixels++}differences[name]={pixels,max}}
        rows.push({size,kind,outputs:outputs.map(x=>x.result),differences,gl:gl.getError(),lost:gl.isContextLost()});
      } finally {gl.deleteTexture(flow);for(const buf of [p,c,v,outP,outC])pool.release(buf)}
    }
    return {programs:programs.map(x=>({linked:x.linked,chars:x.chars})),rows,gl:gl.getError(),lost:gl.isContextLost()};
  } finally {Object.assign(passes,{_brushDragProg:old.prog,_brushDragUni:old.uni,_brushDragPosLoc:old.pos});for(const x of programs)gl.deleteProgram(x.prog)}
})()
