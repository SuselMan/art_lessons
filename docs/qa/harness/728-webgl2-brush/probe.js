(async function(input){
 const output={sourceShadersSHA:input.sourceShadersSHA,variantSHA:input.variantSHA,cases:[],errors:[],scope:'owned primitive contexts; readback correctness, not native FPS or production shader migration'};
 const contexts=[];
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const compare=(a,b)=>{let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)changed++;max=Math.max(max,d)}return{changed,max}};
 function create(kind){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;document.body.append(canvas);
  const gl=canvas.getContext(kind,{alpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
  if(!gl){canvas.remove();throw Error(kind+' unsupported')}
  const owned={gl,canvas,textures:[],fbos:[],programs:[],buffers:[]};contexts.push(owned);
  owned.precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);
  if(!owned.precision?.precision)throw Error(kind+' fragment highp unavailable');
  if(kind==='webgl2'&&(gl.getParameter(gl.MAX_DRAW_BUFFERS)<2||gl.getParameter(gl.MAX_COLOR_ATTACHMENTS)<2))throw Error('MRT2 unavailable');
  return owned;
 }
 function program(owner,vs,fs){const gl=owner.gl,shaders=[];let p;try{
  for(const [type,source]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Compile '+gl.getShaderInfoLog(s))}
  p=gl.createProgram();owner.programs.push(p);shaders.forEach(s=>gl.attachShader(p,s));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Link '+gl.getProgramInfoLog(p));return p
 }finally{shaders.forEach(s=>gl.deleteShader(s))}}
 function texture(owner,n,bytes,linear=false){const gl=owner.gl,t=gl.createTexture();owner.textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,typeof gl.drawBuffers==='function'?gl.RGBA8:gl.RGBA,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return t}
 function fixture(c){const n=c.size,p=new Uint8Array(n*n*4),color=new Uint8Array(p.length),flow=new Uint8Array(p.length),water=new Uint8Array(p.length);let seed=728;for(let i=0;i<p.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const alpha=(seed>>>24);p.set([alpha>>2,alpha>>1,alpha,alpha],i);color.set([alpha,255-alpha,alpha>>1,alpha],i);flow.set([128+(seed%93),128-((seed>>>8)%71),c.zero?0:64+(seed%191),255],i);water.set([0,0,0,(i/4)%7?255:0],i)}return{p,color,flow,water}}
 async function run(owner,c,f,mode){const gl=owner.gl,n=c.size,v=input.variants,p=program(owner,mode==='gl1'?v.vertex100:v.vertex300,mode==='gl1'?v.fragment100:mode==='mrt'?v.mrt300:v.single300);
  const bank=[[texture(owner,n,f.p),texture(owner,n,f.color)],[texture(owner,n,f.p),texture(owner,n,f.color)]],flow=texture(owner,n,f.flow,true),water=texture(owner,n,f.water),fb=gl.createFramebuffer();owner.fbos.push(fb);const buf=gl.createBuffer();owner.buffers.push(buf);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.useProgram(p);const loc=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.viewport(0,0,n,n);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  const u=name=>gl.getUniformLocation(p,name);gl.uniform2f(u('u_step'),(c.step??2)/n,(c.step??2)/n);gl.uniform2f(u('u_texel'),1/n,1/n);gl.uniform4f(u('u_flowRect'),0,0,1,1);gl.uniform1f(u('u_contactGain'),.84);
  const bind=(name,unit,t)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(u(name),unit)};
  let current=0,draws=0;for(let pulse=0;pulse<c.pulses;pulse++){
   const src=bank[current],dst=bank[1-current];bind('u_flow',1,flow);bind('u_water',2,water);bind('u_pigment',3,src[0]);bind('u_color',4,src[1]);
   if(c.partial){gl.enable(gl.SCISSOR_TEST);gl.scissor(n/4,n/4,n/2,n/2)}else gl.disable(gl.SCISSOR_TEST);
   if(mode==='mrt'){bind('u_paint',0,src[0]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,dst[0],0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,dst[1],0);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('MRT framebuffer');gl.drawArrays(gl.TRIANGLES,0,6);draws++}
   else for(const role of [1,0]){bind('u_paint',0,src[role]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,dst[role],0);if(typeof gl.drawBuffers==='function')gl.drawBuffers([gl.COLOR_ATTACHMENT0]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Single framebuffer');gl.drawArrays(gl.TRIANGLES,0,6);draws++}
   current=1-current;
  }
  gl.disable(gl.SCISSOR_TEST);const bytes=[];for(const role of [0,1]){if(mode==='mrt')gl.readBuffer(gl.COLOR_ATTACHMENT0+role);else {if(typeof gl.readBuffer==='function')gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,bank[current][role],0);}const a=new Uint8Array(n*n*4);gl.readPixels(0,0,n,n,gl.RGBA,gl.UNSIGNED_BYTE,a);bytes.push(a)}
  const error=gl.getError(),lost=gl.isContextLost();if(error||lost)throw Error(mode+' GL '+error+' lost '+lost);return{bytes,summary:{mode,draws,GL:error,lost,hash:await Promise.all(bytes.map(hash)),nonzero:bytes.map(b=>b.reduce((s,v)=>s+(v!==0),0))}};
 }
 try{const gl1=create('webgl'),gl2=create('webgl2');output.precision=[gl1.precision,gl2.precision].map(p=>({precision:p.precision,rangeMin:p.rangeMin,rangeMax:p.rangeMax}));for(const c of input.cases){const f=fixture(c),a=await run(gl1,c,f,'gl1'),b=await run(gl2,c,f,'gl2'),m=await run(gl2,c,f,'mrt');const row={fixture:c,inputHashes:await Promise.all([f.p,f.color,f.flow,f.water].map(hash)),paths:[a.summary,b.summary,m.summary],gl1VsGl2:a.bytes.map((x,i)=>compare(x,b.bytes[i])),gl2VsMrt:b.bytes.map((x,i)=>compare(x,m.bytes[i])),inputVsOutput:a.bytes.map((x,i)=>compare(i===0?f.p:f.color,x))};output.cases.push(row);if(c.zero&&row.inputVsOutput.some(x=>x.changed))throw Error('zero flow identity failed');if(!c.zero&&!row.inputVsOutput.some(x=>x.changed))throw Error('nonzero contact not exercised');if([...row.gl1VsGl2,...row.gl2VsMrt].some(x=>x.changed))throw Error('Q8 output mismatch '+c.name)}output.pass=true}catch(error){output.errors.push(String(error));output.pass=false}finally{for(const o of contexts){const gl=o.gl;o.programs.forEach(p=>gl.deleteProgram(p));o.buffers.forEach(b=>gl.deleteBuffer(b));o.fbos.forEach(f=>gl.deleteFramebuffer(f));o.textures.forEach(t=>gl.deleteTexture(t));o.canvas.remove()}output.ownedContextsClosed=true}return output;
})
