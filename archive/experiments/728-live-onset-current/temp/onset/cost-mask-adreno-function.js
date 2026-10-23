(async function(input) {
 window.__costMaskPhase={phase:'module-import'};
 const shaders=await import('/src/engine/src/raster/shaders.ts');
 const {WatercolorPasses}=await import('/src/engine/src/raster/WatercolorPasses.ts');
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;document.body.append(canvas);
 const gl=canvas.getContext('webgl',{antialias:false}),out={source:input.source,net:input.net,units:[],cold:[],scope:'1536 mask primitive/whole salted compile only; no Plan/material/fullsolver/nativeFPS'};
 const owned=[];let passes,screen;
 try {
  if(!gl)throw Error('No WebGL');const ext=gl.getExtension('WEBGL_debug_renderer_info');out.renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);if(!/Adreno/.test(out.renderer))throw Error('Actual Adreno passport');
  screen=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,screen);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  passes=new WatercolorPasses({gl:()=>gl,screenBuf:()=>screen});
  window.__costMaskPhase={phase:'allocate1536'};
  const w=1536,rect=[0,0,w,w],make=()=>{const b=new AccumulationBuffer(gl,w,w,'linear');owned.push(b);return b};const cost=make(),a=make(),b=make();cost.clear();
  out.maskTextureBytes=3*w*w*4;out.productionAdditionalTextures=0;
  const sync=buffer=>{gl.bindFramebuffer(gl.FRAMEBUFFER,buffer.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.bindFramebuffer(gl.FRAMEBUFFER,null)};
  const unitSamples=Array.from({length:7},()=>[]),aggregate=[];
  window.__costMaskPhase={phase:'unitcost1536'};
  for(let iteration=0;iteration<8;iteration++) {
   let src=a,dst=b;let started=performance.now();passes.costDomainStep(a,cost,rect,.8,0);sync(a);if(iteration>=3)unitSamples[0].push(performance.now()-started);
   let unit=1;for(let distance=1;distance<64;distance*=2){started=performance.now();passes.costDomainStep(dst,src,rect,.8,distance);sync(dst);if(iteration>=3)unitSamples[unit].push(performance.now()-started);unit++;const t=src;src=dst;dst=t;}
  }
  for(let iteration=0;iteration<8;iteration++) {
   const started=performance.now();passes.costDomainStep(a,cost,rect,.8,0);let src=a,dst=b;
   for(let distance=1;distance<64;distance*=2){passes.costDomainStep(dst,src,rect,.8,distance);const t=src;src=dst;dst=t;}sync(src);if(iteration>=3)aggregate.push(performance.now()-started);
  }
  out.units=unitSamples.map((samples,i)=>({kind:i?'dyadic':'seed',distance:i?2**(i-1):0,samples,median:[...samples].sort((a,b)=>a-b)[2]}));out.aggregateSevenDrawsOneSync=aggregate;out.maxUnitMs=Math.max(...unitSamples.flat());out.unitBudgetMs=8;out.unitBudgetPassed=out.maxUnitMs<=8;
  out.costImmutable=true;const raw=new Uint8Array(w*w*4);gl.bindFramebuffer(gl.FRAMEBUFFER,cost.fbo);gl.readPixels(0,0,w,w,gl.RGBA,gl.UNSIGNED_BYTE,raw);if(raw.some(v=>v!==0))throw Error('Immutable cost modified');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  for(let salt=0;salt<3;salt++)for(const [name,frag] of [['LOW',shaders.WC_FIELD_OP_FRAG],['HIGH',shaders.WC_FIELD_OP_HIGH_FRAG],['CARRY',shaders.WC_FIELD_OP_CARRY_FRAG],['COLOUR',shaders.WC_FIELD_OP_CARRY_COLOUR_FRAG],['MASK',shaders.WC_COST_DOMAIN_FRAG]]) {
   window.__costMaskPhase={phase:'salted-compile',salt,name};
   const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source+`\n// own-cost-domain-${input.nonce}-${salt}-${name}\n`);gl.compileShader(s);return s;};
   const vert=compile(gl.VERTEX_SHADER,shaders.DISPLAY_VERT),fragment=compile(gl.FRAGMENT_SHADER,frag),program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,fragment);gl.linkProgram(program);
   const row={name,salt,bytes:frag.length,vertOK:gl.getShaderParameter(vert,gl.COMPILE_STATUS),fragOK:gl.getShaderParameter(fragment,gl.COMPILE_STATUS),linkOK:gl.getProgramParameter(program,gl.LINK_STATUS),log:gl.getProgramInfoLog(program),fragLog:gl.getShaderInfoLog(fragment)};out.cold.push(row);
   gl.deleteProgram(program);gl.deleteShader(vert);gl.deleteShader(fragment);if(!row.vertOK||!row.fragOK||!row.linkOK)throw Error('Salted whole compile failed '+name);
  }
  out.gl=gl.getError();out.lost=gl.isContextLost();out.completed=true;
 }catch(error){out.error=String(error)}finally{for(const b of owned.reverse())b.destroy();if(passes)passes.releaseCostDomain();if(screen)gl.deleteBuffer(screen);canvas.remove();out.closed=true}
 return out;
})
