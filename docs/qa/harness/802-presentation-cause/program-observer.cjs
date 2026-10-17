// Diagnostic metadata only. Original draw calls and operation identities stay intact.
function installProgramObserver(){
 const g=globalThis,originalGetContext=OffscreenCanvas.prototype.getContext,now=()=>performance.timeOrigin+performance.now(),shaders=new WeakMap(),programs=new WeakMap(),locations=new WeakMap(),rows=[],draws=[],restores=[];
 let active=false,current=null,nextProgram=0;
 OffscreenCanvas.prototype.getContext=function(...a){const gl=originalGetContext.apply(this,a);if(!gl||!['webgl','experimental-webgl'].includes(a[0])||restores.length)return gl;
  function wrap(name,fn){const original=gl[name];gl[name]=function(...args){return fn.call(this,original,args)};restores.push(()=>gl[name]=original)}
  wrap('createShader',function(fn,a){const shader=fn.apply(this,a);if(shader)shaders.set(shader,{type:a[0],source:''});return shader});
  wrap('shaderSource',function(fn,a){const result=fn.apply(this,a),meta=shaders.get(a[0]);if(meta)meta.source=a[1];return result});
  wrap('attachShader',function(fn,a){const result=fn.apply(this,a);let meta=programs.get(a[0]);if(!meta){meta={id:++nextProgram,attached:[],values:{},uniforms:[]};programs.set(a[0],meta);rows.push(meta)}meta.attached.push(a[1]);return result});
  wrap('linkProgram',function(fn,a){const result=fn.apply(this,a),meta=programs.get(a[0]);if(meta){meta.vertex=meta.attached.map(s=>shaders.get(s)).find(s=>s?.type===gl.VERTEX_SHADER)?.source||'';meta.fragment=meta.attached.map(s=>shaders.get(s)).find(s=>s?.type===gl.FRAGMENT_SHADER)?.source||''}return result});
  wrap('useProgram',function(fn,a){const result=fn.apply(this,a);current=a[0]?programs.get(a[0])||null:null;return result});
  wrap('getUniformLocation',function(fn,a){const result=fn.apply(this,a),meta=programs.get(a[0]);if(result&&meta){locations.set(result,{meta,name:a[1]});if(!meta.uniforms.includes(a[1]))meta.uniforms.push(a[1])}return result});
  for(const name of ['uniform1f','uniform1i'])wrap(name,function(fn,a){const result=fn.apply(this,a),where=locations.get(a[0]);if(where&&/mode|stride|radius|knight|standing|cost|dry|size/i.test(where.name)&&!/^u_(?:source|paper|texture)/.test(where.name))where.meta.values[where.name]=a[1];return result});
  wrap('drawArrays',function(fn,a){const start=now(),result=fn.apply(this,a);if(active&&draws.length<4000)draws.push({sequence:draws.length+1,start,end:now(),program:current?.id||null,parameters:current?{...current.values}:{},mode:a[0],count:a[2]});return result});
  return gl;
 };
 g.__qa802GLProfile={setActive(value){active=value},get sequence(){return draws.length},async finish(){active=false;for(const restore of restores.reverse())restore();OffscreenCanvas.prototype.getContext=originalGetContext;const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');const metadata=[];for(const row of rows)metadata.push({id:row.id,vertexSHA:await sha(row.vertex||''),fragmentSHA:await sha(row.fragment||''),fragmentChars:row.fragment?.length||0,uniforms:row.uniforms,shaderFunctions:[...new Set([...((row.fragment||'').matchAll(/\b(?:float|vec[234])\s+(wc\w+)\s*\(/g))].map(x=>x[1]))]});delete g.__qa802GLProfile;return{programs:metadata,draws,qualification:'Draw metadata is submission order, not individual GPU duration. Per-operation readbacks add resolving/IPC overhead.'}}};
}
module.exports={installProgramObserver};
