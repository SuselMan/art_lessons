export function install(engine){
 const gl=engine.gl,original=new Map(),last=new Map(),uniforms=new Map(),textureBindings=new Map(),buffers=new Map(),capabilities=new Map(),stats={calls:0,skipped:0,byMethod:{}};
 let active=gl.getParameter(gl.ACTIVE_TEXTURE);
 const equal=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const wrap=(key,fn)=>{const orig=gl[key];original.set(key,orig);gl[key]=function(...a){stats.calls++;return fn(orig,a)}};
 const skip=key=>{stats.skipped++;stats.byMethod[key]=(stats.byMethod[key]||0)+1};
 const scalar=['useProgram','viewport','scissor','clearColor'];
 for(const key of scalar)wrap(key,(orig,a)=>{if(equal(last.get(key),a)){skip(key);return}orig.apply(gl,a);last.set(key,a)});
 wrap('activeTexture',(orig,a)=>{if(active===a[0]){skip('activeTexture');return}orig.apply(gl,a);active=a[0]});
 wrap('bindTexture',(orig,a)=>{const key=active+':'+a[0];if(textureBindings.has(key)&&textureBindings.get(key)===a[1]){skip('bindTexture');return}orig.apply(gl,a);textureBindings.set(key,a[1])});
 for(const key of ['bindFramebuffer','bindBuffer'])wrap(key,(orig,a)=>{const name=key+':'+a[0];if(buffers.has(name)&&buffers.get(name)===a[1]){skip(key);return}orig.apply(gl,a);buffers.set(name,a[1])});
 for(const key of ['enable','disable'])wrap(key,(orig,a)=>{const value=key==='enable';if(capabilities.get(a[0])===value){skip(key);return}orig.apply(gl,a);capabilities.set(a[0],value)});
 for(const key of ['uniform1f','uniform2f','uniform3f','uniform4f','uniform1i','uniform2i','uniform3i','uniform4i','uniform4fv','uniform3fv','uniform2fv'])wrap(key,(orig,a)=>{
  let map=uniforms.get(a[0]);if(!map){map=new Map();uniforms.set(a[0],map)}const value=a.slice(1).flatMap(v=>ArrayBuffer.isView(v)||Array.isArray(v)?Array.from(v):[v]);
  if(equal(map.get(key),value)){skip(key);return}orig.apply(gl,a);map.set(key,value)
 });
 const reset=()=>{last.clear();uniforms.clear();textureBindings.clear();buffers.clear();capabilities.clear();active=gl.getParameter(gl.ACTIVE_TEXTURE)};
 for(const key of ['deleteTexture','deleteFramebuffer','deleteBuffer','deleteProgram'])wrap(key,(orig,a)=>{const result=orig.apply(gl,a);reset();return result});
 engine.canvas?.addEventListener('webglcontextrestored',reset);
 return {stats:()=>stats,dispose(){engine.canvas?.removeEventListener('webglcontextrestored',reset);for(const [k,v]of original)gl[k]=v}};
}
