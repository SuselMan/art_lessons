export function install(e){const gl=e.gl,saved=[],textures=new Map(),buffers=new Map(),unknown={},stats={calls:0,skipped:0,byMethod:{}};let active=gl.getParameter(gl.ACTIVE_TEXTURE),program=unknown;
function wrap(name,fn){const orig=gl[name];saved.push([name,orig]);gl[name]=function(...a){stats.calls++;return fn(orig,a)}}
function skip(name){stats.skipped++;stats.byMethod[name]=(stats.byMethod[name]??0)+1}
wrap('activeTexture',(orig,[unit])=>{if(active===unit)return skip('activeTexture');orig.call(gl,unit);active=unit});
wrap('bindTexture',(orig,[target,value])=>{if(target!==gl.TEXTURE_2D)return orig.call(gl,target,value);if(textures.has(active)&&textures.get(active)===value)return skip('bindTexture');orig.call(gl,target,value);textures.set(active,value)});
wrap('deleteTexture',(orig,[value])=>{orig.call(gl,value);for(const[k,v]of textures)if(v===value)textures.delete(k)});
wrap('useProgram',(orig,[value])=>{if(program===value)return skip('useProgram');orig.call(gl,value);program=value});
wrap('deleteProgram',(orig,[value])=>{orig.call(gl,value);program=unknown});
wrap('bindBuffer',(orig,[target,value])=>{if(buffers.has(target)&&buffers.get(target)===value)return skip('bindBuffer');orig.call(gl,target,value);buffers.set(target,value)});
wrap('deleteBuffer',(orig,[value])=>{orig.call(gl,value);for(const[k,v]of buffers)if(v===value)buffers.delete(k)});
return{stats:()=>stats,dispose(){for(const[name,orig]of saved)gl[name]=orig}}}
