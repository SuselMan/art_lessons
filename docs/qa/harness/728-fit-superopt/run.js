const expressions={baseline:'max(1.0,max(max(v.r,v.g),max(v.b,v.a)))',enumeratedBalanced:'max(1.0,max(max(v.r,v.b),max(v.g,v.a)))',enumeratedChain:'max(1.0,max(v.r,max(v.g,max(v.b,v.a))))'};
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x)),b=>b.toString(16).padStart(2,'0')).join('');
const difference=(a,b)=>{let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=+(d>0);max=Math.max(max,d)}return{changed,max}};
function code(expression){return `struct U {dims:vec2u,loops:u32,pad:u32}
@group(0) @binding(0) var input:texture_2d<f32>;
@group(0) @binding(1) var output:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(2) var<uniform> u:U;
fn fit(v:vec4f)->vec4f{return v/${expression};}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) q:vec3u){if(any(q.xy>=u.dims)){return;}let a=textureLoad(input,vec2i(q.xy),0);var v=a;for(var i=0u;i<u.loops;i++){v=fit(v+a*.375);}textureStore(output,vec2i(q.xy),v);}`}
/** Local pure-kernel throughput. NEVER a full watercolor speedup claim. */
export async function runFitSuperopt({width=256,height=256,loops=32,repeats=16,reverse=false}={}){
 if(width*height>1536*1536||loops>128||repeats>64)throw Error('bounded fixture exceeded');
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');const timestamp=adapter.features.has('timestamp-query'),device=await adapter.requestDevice({requiredFeatures:timestamp?['timestamp-query']:[]}),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));device.pushErrorScope('validation');
 const usage=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST,input=device.createTexture({size:[width,height],format:'rgba8unorm',usage}),output=device.createTexture({size:[width,height],format:'rgba8unorm',usage}),uniform=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const bytes=new Uint8Array(width*height*4);for(let i=0;i<bytes.length;i++)bytes[i]=(Math.imul(i+17,73)^Math.imul(i>>>4,31))&255;device.queue.writeTexture({texture:input},bytes,{bytesPerRow:width*4},[width,height]);device.queue.writeBuffer(uniform,0,new Uint32Array([width,height,loops,0]));
 const rows=[],captures={};const order=Object.keys(expressions);if(reverse)order.reverse();
 try{for(const name of order){
  const compileStart=performance.now(),pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:code(expressions[name])}),entryPoint:'main'}}),compileCpuWallMs=performance.now()-compileStart;
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:input.createView()},{binding:1,resource:output.createView()},{binding:2,resource:{buffer:uniform}}]});
  const dispatch=(encoder,writes)=>{const p=encoder.beginComputePass(writes?{timestampWrites:writes}:{});p.setPipeline(pipeline);p.setBindGroup(0,bind);p.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));p.end()};
  const warm=device.createCommandEncoder();dispatch(warm);device.queue.submit([warm.finish()]);await device.queue.onSubmittedWorkDone();
  const query=timestamp?device.createQuerySet({type:'timestamp',count:2}):null,resolve=timestamp?device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}):null,times=timestamp?device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}):null;
  const start=performance.now(),encoder=device.createCommandEncoder();
  // One pass, independent repeated dispatches; no solver/shader fusion claim.
  const pass=encoder.beginComputePass(query?{timestampWrites:{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);for(let i=0;i<repeats;i++)pass.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));pass.end();
  if(query){encoder.resolveQuerySet(query,0,2,resolve,0);encoder.copyBufferToBuffer(resolve,0,times,0,16)}device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();const wallMs=performance.now()-start;let gpuMs=null;
  if(times){await times.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(times.getMappedRange());gpuMs=Number(t[1]-t[0])/1e6;times.unmap()}
  const pitch=Math.ceil(width*4/256)*256,read=device.createBuffer({size:pitch*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),copy=device.createCommandEncoder();copy.copyTextureToBuffer({texture:output},{buffer:read,bytesPerRow:pitch},[width,height]);device.queue.submit([copy.finish()]);await read.mapAsync(GPUMapMode.READ);const source=new Uint8Array(read.getMappedRange()),raw=new Uint8Array(width*height*4);for(let y=0;y<height;y++)raw.set(source.subarray(y*pitch,y*pitch+width*4),y*width*4);read.unmap();read.destroy();captures[name]=raw;
  rows.push({name,expression:expressions[name],compileCpuWallMs,wallMs,gpuMs,sha256:await hash(raw.buffer)});query?.destroy();resolve?.destroy();times?.destroy();
 }
 const validation=await device.popErrorScope();if(validation)errors.push(validation.message);for(const r of rows)r.difference=difference(captures.baseline,captures[r.name]);return{width,height,loops,repeats,order,timestamp,rows,errors,exact:!errors.length&&rows.every(r=>r.difference.changed===0),limitations:['Synthetic LOCAL fit kernel, not full carry or watercolor','Tree max only; identical sums/division/Q8 writes','No whole speedup until independent whole pass measurements/Amdahl fraction']};
 }finally{input.destroy();output.destroy();uniform.destroy();device.destroy()}
}
Object.assign(window,{runFitSuperopt});
