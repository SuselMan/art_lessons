/// <reference types="@webgpu/types" />
import {DISPLAY_VERT,WC_BRUSH_DRAG_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {decodePreBrush68Checkpoint} from './preBrush68Codec'
import {BRUSH68_ROI as R,BRUSH68_SCISSOR,BRUSH68_FLOW_RECT} from './preBrush68Checkpoint'
import {runPreBrush68NativeGate} from './preBrush68NativeGate'
import chronology from './brush14Chronology.fixture.json'
const sha=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b.slice().buffer)),x=>x.toString(16).padStart(2,'0')).join('')
/** Extracted actual operations68..81: C/P reads same OLD pair, then both copies.
 * No intervening upload/field operation, no generated arbitrary repetitions. */
export function validateBrush14Chronology(){
 if(chronology.ops.length!==14)throw Error('Original contact count')
 const events=chronology.ops[0].events as any[],c=events[0],p=events[1]
 for(const pass of[c,p])if(pass[1].w!==1536||pass[1].h!==1536||pass[3]!==4||pass[4]!==1||pass[11]!==.6437950134277344||JSON.stringify(pass[8])!==JSON.stringify(BRUSH68_FLOW_RECT)||JSON.stringify(pass[9])!==JSON.stringify(BRUSH68_SCISSOR))throw Error('Original contact parameters differ')
 if(c[5].buffer!==c[10].buffer||p[5].buffer!==p[7].buffer||c[7].buffer!==p[7].buffer||c[10].buffer!==p[10].buffer||events[2][1].buffer!==p[6].buffer||events[2][2].buffer!==p[5].buffer||events[3][1].buffer!==c[6].buffer||events[3][2].buffer!==c[5].buffer)throw Error('Original pair/copy order differs')
 const first=JSON.stringify(chronology.ops[0].events)
 for(const[o,i]of chronology.ops.map((o,i)=>[o,i] as const)){
  if(o.index!==68+i||JSON.stringify(o.events)!==first||o.events.map(e=>e[0]).join(',')!=='brush,brush,region,region')throw Error('Original contact chronology changed')
 }
 return {ops:[68,81],contacts:14,sourcePacketSha256:chronology.packetSha256,plannerSha256:chronology.plannerSha256,flowUploadsWithinChain:0}
}
export async function runBrush14Chain(packet:unknown){
 const recipe=validateBrush14Chronology(),input=await decodePreBrush68Checkpoint(packet),canvas=document.createElement('canvas');canvas.width=canvas.height=1536
 const gl=canvas.getContext('webgl',{premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('Brush chain GL unavailable')
 const textures:WebGLTexture[]=[],shaders:WebGLShader[]=[];let program:WebGLProgram|null=null,fb:WebGLFramebuffer|null=null,buffer:WebGLBuffer|null=null
 let final:Uint8Array[]=[];const checkpoints:unknown[]=[]
 const flip=(b:Uint8Array)=>{const a=new Uint8Array(b.length);for(let y=0;y<R.height;y++)a.set(b.subarray(y*R.width*4,(y+1)*R.width*4),(R.height-1-y)*R.width*4);return a}
 try{
  program=gl.createProgram()!;for(const[type,code]of [[gl.VERTEX_SHADER,DISPLAY_VERT],[gl.FRAGMENT_SHADER,WC_BRUSH_DRAG_FRAG]]as const){const s=gl.createShader(type)!;shaders.push(s);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)??'Brush chain compile');gl.attachShader(program,s)}gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)??'Brush chain link');gl.useProgram(program)
  const field=(bytes:Uint8Array)=>{const t=gl.createTexture()!;textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1536,1536,0,gl.RGBA,gl.UNSIGNED_BYTE,null);for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);gl.texSubImage2D(gl.TEXTURE_2D,0,R.x,1536-R.y-R.height,R.width,R.height,gl.RGBA,gl.UNSIGNED_BYTE,flip(bytes));return t}
  let oldP=field(input.rows[0].bytes),oldC=field(input.rows[1].bytes),nextP=field(input.rows[0].bytes),nextC=field(input.rows[1].bytes);const water=field(input.rows[2].bytes),flow=gl.createTexture()!;textures.push(flow);gl.bindTexture(gl.TEXTURE_2D,flow);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,31,26,0,gl.RGBA,gl.UNSIGNED_BYTE,input.flow);for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);for(const p of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE)
  buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.viewport(0,0,1536,1536);gl.disable(gl.BLEND);gl.enable(gl.SCISSOR_TEST);gl.scissor(...BRUSH68_SCISSOR);gl.uniform2f(gl.getUniformLocation(program,'u_step'),1/1536,1/1536);gl.uniform2f(gl.getUniformLocation(program,'u_texel'),1/1536,1/1536);gl.uniform1f(gl.getUniformLocation(program,'u_contactGain'),.6437950134277344);gl.uniform4fv(gl.getUniformLocation(program,'u_flowRect'),BRUSH68_FLOW_RECT);fb=gl.createFramebuffer()!;gl.bindFramebuffer(gl.FRAMEBUFFER,fb)
  const draw=(source:WebGLTexture,out:WebGLTexture)=>{gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,out,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Brush chain target');[source,flow,water,oldP,oldC].forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(program!,['u_paint','u_flow','u_water','u_pigment','u_color'][i]),i)});gl.drawArrays(gl.TRIANGLES,0,6)}
  const read=(t:WebGLTexture)=>{gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);const b=new Uint8Array(R.width*R.height*4);gl.readPixels(R.x,1536-R.y-R.height,R.width,R.height,gl.RGBA,gl.UNSIGNED_BYTE,b);return flip(b)}
  for(let n=1;n<=14;n++){draw(oldC,nextC);draw(oldP,nextP);[oldP,nextP]=[nextP,oldP];[oldC,nextC]=[nextC,oldC];if([1,4,14].includes(n)){final=[read(oldP),read(oldC)];const hashes=await Promise.all(final.map(sha));if(n===1){const expected=await Promise.all(input.rows.slice(3,5).map(r=>sha(r.bytes)));if(hashes.some((h,i)=>h!==expected[i]))throw Error('Original first GL contact SHA changed before native allocation')}checkpoints.push({pulse:n,sha256:hashes})}}
  if(gl.getError()||gl.isContextLost())throw Error('Brush chain GL error/lost')
 }finally{textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.deleteBuffer(buffer);gl.deleteFramebuffer(fb);gl.getExtension('WEBGL_lose_context')?.loseContext()}
 const native=await runPreBrush68NativeGate(packet,false,{pulses:14,expected:final})
 return {code:'__SOURCE_CODE__',recipe,checkpoints,native,glOwnerRetired:true,noPerContactReset:true,scope:'Original14 contacts68..81 only. Each API propagates its own P/C Q8 pair; fixed actual coverage/flow. GL first contact must match durable same-device SHA before native allocation. Small ROI+2px halo/full1536UV; not full463-contact phase, whole solver, Room or speed.'}
}
