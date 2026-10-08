import { CanonicalFieldOps } from '../../../../apps/web/src/engine/src/webgpuCanonical/passes/fieldOps'
import { DISPLAY_VERT, WC_FIELD_OP_HIGH_FRAG } from '../../../../apps/web/src/engine/src/raster/shaders'

/** Identical immutable inputs. Synthetic sampler diagnostic, not artistic/model parity. */
export async function runLinearMode11() {
 const adapter=await navigator.gpu.requestAdapter(); if(!adapter) throw Error('WebGPU unavailable')
 const device=await adapter.requestDevice(); const errors:string[]=[]
 device.addEventListener('uncapturederror',e=>errors.push(e.error.message))
 const rows=[]
 for(const [w,h,dw,dh] of [[32,8,32,8],[1536,8,1536,8],[1536,8,511,7]]) {
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h
  const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true})!;gl.disable(gl.DITHER)
  const program=gl.createProgram()!
  for(const [kind,source] of [[gl.VERTEX_SHADER,DISPLAY_VERT],[gl.FRAGMENT_SHADER,WC_FIELD_OP_HIGH_FRAG]] as const){const s=gl.createShader(kind)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)!);gl.attachShader(program,s)}
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)!);gl.useProgram(program)
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
  const pos=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0)
  function field(width:number,height:number,pressure:boolean){const bytes=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)bytes.set(pressure?[(x*73+y*29)%256,0,0,255]:[128,0,255,0],(y*width+x)*4)
   const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,pressure?gl.LINEAR:gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE)
   const texture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});const flipped=new Uint8Array(bytes.length);for(let y=0;y<height;y++)flipped.set(bytes.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);device.queue.writeTexture({texture},flipped,{bytesPerRow:width*4},[width,height]);return{texture,view:texture.createView(),width,height,format:'rgba8unorm' as const,filter:pressure?'linear' as const:'nearest' as const,label:'fixture',gl:t}
  }
  const a=field(w,h,false),d=field(dw,dh,true),out=field(w,h,false)
  for(let i=0;i<6;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,i===3?d.gl:a.gl);gl.uniform1i(gl.getUniformLocation(program,['u_a','u_b','u_c','u_d','u_e','u_path'][i]),i)}
  gl.uniform1f(gl.getUniformLocation(program,'u_mode'),11);gl.uniform1f(gl.getUniformLocation(program,'u_k'),.7);gl.uniform2fv(gl.getUniformLocation(program,'u_band'),[.5,0]);gl.uniform2fv(gl.getUniformLocation(program,'u_size'),[1/255,1]);gl.drawArrays(gl.TRIANGLES,0,6)
  const expected=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,expected)
  const ops=new CanonicalFieldOps(device),results=[]
  for(const hardware of [false,true]){device.pushErrorScope('validation');const encoder=device.createCommandEncoder();const uniform=ops.run({device,encoder,nearest:device.createSampler(),linear:device.createSampler({minFilter:'linear',magFilter:'linear'})},{a,b:a,c:a,coverage:a,paper:{field:a,origin:[0,0],texSize:[w,h],scale:1},out,world:{x:0,y:0,width:w,height:h}},11,.7,{d,band:[.5,0],size:[1/255,1],diagnosticHardwareLinearInputs:hardware})
   const stride=Math.ceil(w*4/256)*256;const read=device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});encoder.copyTextureToBuffer({texture:out.texture},{buffer:read,bytesPerRow:stride},[w,h]);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(read.getMappedRange());let different=0,max=0;for(let y=0;y<h;y++)for(let x=0;x<w*4;x++){const v=Math.abs(raw[y*stride+x]-expected[(h-1-y)*w*4+x]);different+=Number(v!==0);max=Math.max(max,v)}read.unmap();read.destroy();uniform.destroy();results.push({hardware,different,max,validation:(await device.popErrorScope())?.message??null})
  }
  rows.push({w,h,dw,dh,productionDimensions:dw===w&&dh===h,results,glError:gl.getError()});for(const f of [a,d,out])f.texture.destroy();gl.getExtension('WEBGL_lose_context')?.loseContext()
 }
 device.destroy();return{rows,errors,interpretation:'Same-input mode11 only; improvement is evidence for sampling sensitivity, not proof of the whole-engine cause.'}
}
Object.assign(window,{runLinearMode11})
