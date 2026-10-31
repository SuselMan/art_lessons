(()=>{
const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;document.body.append(canvas);
const gl=canvas.getContext('webgl',{antialias:false,premultipliedAlpha:false});if(!gl)throw Error('WebGL1 missing');
const counters={uploads:0,draws:0,copies:0,bufferWrites:0};
for(const[name,key]of[['texImage2D','uploads'],['texSubImage2D','uploads'],['drawArrays','draws'],['copyTexSubImage2D','copies'],['bufferData','bufferWrites'],['bufferSubData','bufferWrites']]){const fn=gl[name].bind(gl);gl[name]=(...a)=>{counters[key]++;return fn(...a)}}
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),textures=new Set(),fbos=new Set();
const vaoExt=gl.getExtension('OES_vertex_array_object'),inst=gl.getExtension('ANGLE_instanced_arrays');
let cache,cpu,pass,sentinelBuffer,sentinelTexture,sentinelVao;
const result={trials:[],wrong:0,maxDelta:0,stateRestored:true,samplersRestored:true,leasesBalanced:true,hotNoUploads:true,GL:[],cleanup:{ok:false},scope:'Samsung actual GenericSC U8 CanonicalRgba8CompositePass, pinned source-law fixture; no ARM/GUI/room grant'};
function texture(w,h,data,awkward=false){const t=gl.createTexture();if(!t)throw Error('texture');textures.add(t);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,awkward?gl.LINEAR:gl.NEAREST);for(const p of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,awkward?gl.REPEAT:gl.CLAMP_TO_EDGE);return t}
function framebuffer(t){const f=gl.createFramebuffer();if(!f)throw Error('FBO');fbos.add(f);gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('FBO incomplete');return f}
function dropTexture(t){textures.delete(t);gl.deleteTexture(t)}
function dropFbo(f){fbos.delete(f);gl.deleteFramebuffer(f)}
const caps=[gl.BLEND,gl.SCISSOR_TEST,gl.DITHER,gl.CULL_FACE,gl.DEPTH_TEST,gl.STENCIL_TEST];
function sentinel(){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(2,3,17,19);gl.useProgram(null);if(vaoExt)vaoExt.bindVertexArrayOES(sentinelVao);gl.bindBuffer(gl.ARRAY_BUFFER,sentinelBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);inst?.vertexAttribDivisorANGLE(0,3);gl.colorMask(false,true,false,true);gl.clearColor(.125,.25,.375,.5);gl.pixelStorei(gl.UNPACK_ALIGNMENT,8);for(let i=0;i<caps.length;i++)(i%2?gl.disable:gl.enable).call(gl,caps[i]);for(const u of[0,1,3]){gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,sentinelTexture)}gl.activeTexture(gl.TEXTURE3)}
function snapshot(){const active=gl.getParameter(gl.ACTIVE_TEXTURE),ts=[];for(const u of[0,1,3]){gl.activeTexture(gl.TEXTURE0+u);ts.push(gl.getParameter(gl.TEXTURE_BINDING_2D))}gl.activeTexture(active);const attrs=[];for(let i=0;i<Math.min(4,gl.getParameter(gl.MAX_VERTEX_ATTRIBS));i++)attrs.push([gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_ENABLED),gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_SIZE),gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_TYPE),gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_NORMALIZED),gl.getVertexAttrib(i,gl.VERTEX_ATTRIB_ARRAY_STRIDE),gl.getVertexAttribOffset(i,gl.VERTEX_ATTRIB_ARRAY_POINTER),inst?gl.getVertexAttrib(i,inst.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE):0]);return{active,textures:ts,fbo:gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport:[...gl.getParameter(gl.VIEWPORT)],program:gl.getParameter(gl.CURRENT_PROGRAM),buffer:gl.getParameter(gl.ARRAY_BUFFER_BINDING),mask:[...gl.getParameter(gl.COLOR_WRITEMASK)],color:[...gl.getParameter(gl.COLOR_CLEAR_VALUE)],unpack:gl.getParameter(gl.UNPACK_ALIGNMENT),caps:caps.map(c=>gl.isEnabled(c)),vao:vaoExt?gl.getParameter(vaoExt.VERTEX_ARRAY_BINDING_OES):null,attrs}}
function equal(a,b){if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));return a===b}
function same(a,b){return Object.keys(a).every(k=>equal(a[k],b[k]))}
function sampling(t){const a=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);const bound=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.bindTexture(gl.TEXTURE_2D,t);const values=[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER,gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].map(p=>gl.getTexParameter(gl.TEXTURE_2D,p));gl.bindTexture(gl.TEXTURE_2D,bound);gl.activeTexture(a);return values}
try{
 const {W,H,SW,SH,MW,MH}=CONFIG;
 cache=new COMPOSITE_OVER.BrushTextureCache(gl);cpu=new COMPOSITE_OVER.BrushMipCache();pass=new COMPOSITE_OVER.CanonicalRgba8CompositePass(gl,cache,cpu,'over-proof');
 pass.prepare({width:W,height:H,operations:['genericSCU8']},[]);
 sentinelBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,sentinelBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(32),gl.STATIC_DRAW);sentinelTexture=texture(1,1,new Uint8Array([1,2,3,4]));sentinelVao=vaoExt?.createVertexArrayOES();
 for(const c of CONFIG.trials){
  let acquired=0,released=0,active=0;
  const lifetime=()=>({kind:'external',owner:{},lease:()=>{acquired++;active++;let done=false;return()=>{if(done)throw Error('double external release');done=true;active--;released++}}});
  let src=texture(SW,SH,decode(c.source),true);const output=texture(W,H,decode(c.initial)),base=c.preview?texture(W,H,decode(c.initial)):output;
  const outputFbo=framebuffer(output),baseFbo=c.preview?framebuffer(base):outputFbo;
  const target={brand:'canonical-straight-rgba8-v1',texture:output,framebuffer:outputFbo,width:W,height:H,originX:c.origin.x,originY:c.origin.y,lifetime:lifetime()};
  const readDestination=c.preview?{...target,texture:base,framebuffer:baseFbo,lifetime:lifetime()}:undefined;
  const rect={x:c.x,y:c.y,width:MW,height:MH},bounds={x:0,y:0,width:MW/SW,height:MH/SH},mirror={horizontal:!!(c.mirror&1),vertical:!!(c.mirror&2)};
  let source,key;
  if(c.kind==='maskRgb'){
   key='mask-'+c.index;cache.protect([key,...pass.preparedResources().map(r=>r.key)]);const owned=COMPOSITE_OVER.allocateOwnedBrushTexture(gl,SW*SH*4,(allocated,mark)=>{gl.bindTexture(gl.TEXTURE_2D,allocated);mark(SW*SH*4);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,SW,SH,0,gl.RGBA,gl.UNSIGNED_BYTE,decode(c.source));for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);for(const p of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.REPEAT)});cache.putOwned(key,owned);dropTexture(src);src=owned.texture;
   source={kind:'maskRgb',rgb:c.rgb,view:{texture:src,key,rect,bounds,mirror,channel:'r'}};
  }else source={kind:'straightRgba8',view:{brand:'canonical-straight-rgba8-view-v1',texture:src,textureWidth:SW,textureHeight:SH,rect,bounds,mirror,rowOrder:c.rowOrder,residency:lifetime()}};
  const originalSampler=sampling(src),before={...counters},steps=[];
  for(const s of c.steps){
   sentinel();const state=snapshot(),counts={...counters};
   const status=pass.drawSource({source,target,operation:{kind:'genericSCU8',control:s.control},readDestination,writeBounds:c.writeBounds});
   result.stateRestored&&=same(state,snapshot());result.samplersRestored&&=equal(originalSampler,sampling(src));
   result.hotNoUploads&&=counters.uploads===counts.uploads&&counters.bufferWrites===counts.bufferWrites;
   result.leasesBalanced&&=active===0&&acquired===released;
   gl.bindFramebuffer(gl.FRAMEBUFFER,outputFbo);const pixels=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   const expected=decode(s.expected);let wrong=0,maxDelta=0;const examples=[];
   for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-expected[i]);if(d){wrong++;if(examples.length<6)examples.push({at:i,actual:pixels[i],expected:expected[i]})}maxDelta=Math.max(maxDelta,d)}
   result.wrong+=wrong;result.maxDelta=Math.max(result.maxDelta,maxDelta);steps.push({status,wrong,maxDelta,examples});
  }
  const expectedLeases=c.paints?c.steps.length*(1+(c.preview?1:0)+(c.kind==='straightRgba8'?1:0)):0;result.leasesBalanced&&=acquired===expectedLeases&&released===expectedLeases;
  result.trials.push({index:c.index,profile:c.profile,kind:c.kind,rowOrder:c.rowOrder,mirror:c.mirror,preview:c.preview,steps,acquired,released,expectedLeases,uploads:counters.uploads-before.uploads,draws:counters.draws-before.draws,copies:counters.copies-before.copies});
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(key)cache.discard(key);else dropTexture(src);dropFbo(outputFbo);dropTexture(output);if(c.preview){dropFbo(baseFbo);dropTexture(base)}
 }
 const debug=gl.getExtension('WEBGL_debug_renderer_info');result.device={ua:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 result.highp=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT).precision;result.gpuBytes=cache.bytes;result.cpuReserved=cpu.reservedBytes;
 let e;while((e=gl.getError())!==gl.NO_ERROR)result.GL.push(e);
}finally{
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);pass?.reset(false);cache?.clear();cpu?.clear();for(const f of fbos)gl.deleteFramebuffer(f);for(const t of textures)gl.deleteTexture(t);if(sentinelBuffer)gl.deleteBuffer(sentinelBuffer);if(sentinelVao)vaoExt?.deleteVertexArrayOES(sentinelVao);
 result.cleanup={ok:(!cache||cache.bytes===0)&&(!cpu||cpu.reservedBytes===0),gpuBytes:cache?.bytes??0,cpuReserved:cpu?.reservedBytes??0};let e;while((e=gl.getError())!==gl.NO_ERROR)result.GL.push(e);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.remove();
}
return result;
})()
