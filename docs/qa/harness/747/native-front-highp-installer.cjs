// QA-only replacement of native front program; prefix build/jump imports untouched.
module.exports=()=>{globalThis.__qa748NativeFrontHighp=async(gl,passes,injected,options={})=>{
 const highpSamplers=options.highpSamplers!==false,roundR=options.roundR===true;if(!highpSamplers&&!roundR)throw Error('No native front QA variant selected');
 const deps=injected||Object.assign({},await import('/src/engine/src/raster/utils.ts'),await import('/src/engine/src/raster/shaders.ts'));
 const keys=['_waterFrontProg','_waterFrontUni','_waterFrontPosLoc'],original=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(passes,k)]));
 if(keys.some(k=>!original[k])||!gl.isProgram(passes._waterFrontProg)||!passes._waterFrontUni)throw Error('Native front program not initialized');
 const fragment=deps.WC_WATER_FRONT_FRAG,vertex=deps.DISPLAY_VERT,pattern=/\buniform\s+sampler2D\b/g,samplerCount=[...fragment.matchAll(pattern)].length;
 if(!samplerCount)throw Error('Native front sampler anchor absent');
 const attached=gl.getAttachedShaders(passes._waterFrontProg)||[],actualFragment=attached.find(s=>gl.getShaderParameter(s,gl.SHADER_TYPE)===gl.FRAGMENT_SHADER),actualVertex=attached.find(s=>gl.getShaderParameter(s,gl.SHADER_TYPE)===gl.VERTEX_SHADER);
 if(!actualFragment||!actualVertex||gl.getShaderSource(actualFragment)!==fragment||gl.getShaderSource(actualVertex)!==vertex)throw Error('Actual native front shader/export mismatch');
 const outputAnchor='min(best, u_costMax) / u_costMax',outputAnchorCount=fragment.split(outputAnchor).length-1;
 let patched=highpSamplers?fragment.replace(pattern,'uniform highp sampler2D'):fragment;
 if(roundR){if(outputAnchorCount!==1)throw Error('Native front R output anchor not unique');patched=patched.replace(outputAnchor,'floor((min(best, u_costMax) / u_costMax) * 255.0 + 0.5) / 255.0')}
 const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
 const metadata={requested:true,highpSamplers,roundR,outputAnchorCount,samplerCount,samplersChanged:highpSamplers?samplerCount:0,originalFragmentSHA:await hash(fragment),patchedFragmentSHA:await hash(patched),vertexSHA:await hash(vertex),uniformKeys:Object.keys(passes._waterFrontUni),modifiedProperties:keys,qualification:'Only owned native water-front program replaced (optional sampler precision / R output quantization). Exported shader strings and prefix build/jump programs unchanged. QA control, not product fix.',restoration:{restored:false,ownershipExact:false,deletedOwnedProgram:false}};
 let program,uniforms,position,restored=false;
 try{program=deps.createProgram(gl,vertex,patched);uniforms=deps.getUniforms(gl,program,metadata.uniformKeys);position=gl.getAttribLocation(program,'a_position');if(position<0)throw Error('Native front attribute absent');passes._waterFrontProg=program;passes._waterFrontUni=uniforms;passes._waterFrontPosLoc=position}
 catch(error){for(const key of keys)Object.defineProperty(passes,key,original[key]);if(program)gl.deleteProgram(program);throw error}
 return{summary(){if(passes._waterFrontProg!==program||passes._waterFrontUni!==uniforms||passes._waterFrontPosLoc!==position)throw Error('Native front override changed');return metadata},restore(){if(restored)return;restored=true;const exact=passes._waterFrontProg===program&&passes._waterFrontUni===uniforms&&passes._waterFrontPosLoc===position;for(const key of keys)Object.defineProperty(passes,key,original[key]);if(gl.getParameter(gl.CURRENT_PROGRAM)===program)gl.useProgram(original._waterFrontProg.value);gl.deleteProgram(program);metadata.restoration.restored=true;metadata.restoration.ownershipExact=exact;metadata.restoration.deletedOwnedProgram=!gl.isProgram(program);if(!exact)throw Error('Native front override ownership mismatch')}}
}}
