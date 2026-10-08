import {allocatePreviewPairs,FLOAT_PREVIEW_POOL_BYTES} from '../728-room-moment/PreviewPairedFloatAllocator.mjs';
export async function runFloatCapability(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
 const gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:false});if(!gl)return{valid:false,supported:false,reason:'WebGL1 unavailable'};
 const ext={texture:!!gl.getExtension('OES_texture_float'),color:!!gl.getExtension('WEBGL_color_buffer_float')};
 const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision??0;
 if(!ext.texture||!ext.color||precision<23)return{valid:false,supported:false,extensions:ext,precision,reason:'Float32 preview unsupported; Q8reference stays'};
 let pairs,program,vertex,fragment,buffer;const samples=[];const errors=[];
 try{
  pairs=allocatePreviewPairs(gl,{enabled:true,budgetBytes:FLOAT_PREVIEW_POOL_BYTES,createQ8(){throw Error('Float candidate rejected; no fallback hidden in gate')}});
  const compile=(type,text)=>{const shader=gl.createShader(type);gl.shaderSource(shader,text);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error)}return shader};
  vertex=compile(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}');
  fragment=compile(gl.FRAGMENT_SHADER,'precision highp float;void main(){gl_FragColor=vec4(0.123456,0.000001,0.875,0.5);}');
  program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);const loc=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  for(const[role,field]of Object.entries(pairs.fields)){
   field.beginReplaceDraw();gl.drawArrays(gl.TRIANGLES,0,6);const rgba=new Float32Array(4);gl.readPixels(64,64,1,1,gl.RGBA,gl.FLOAT,rgba);field.endDraw();
   samples.push({role,rgba:[...rgba],finite:[...rgba].every(Number.isFinite),maxError:Math.max(...rgba.map((v,i)=>Math.abs(v-[.123456,.000001,.875,.5][i])))});
   const error=gl.getError();if(error!==gl.NO_ERROR)errors.push(error);
  }
  const identities=new Set(Object.values(pairs.fields).map(f=>f.texture));
  return{valid:errors.length===0&&!gl.isContextLost()&&samples.every(s=>s.finite&&s.maxError<.000001)&&identities.size===4,supported:true,format:pairs.format,extensions:ext,precision,pairBytes:pairs.bytes,totalThreeSlotBudget:FLOAT_PREVIEW_POOL_BYTES,samples,readbackBytes:64,errors,lost:gl.isContextLost(),limitations:['Tiny Float32 write/read only; no actualdiffusion/mass/colour/UX/performance claim','Own128 context; noRoom/noinput/nohardwaretime']};
 }catch(error){return{valid:false,supported:true,error:String(error),samples,errors,lost:gl.isContextLost()}}
 finally{if(pairs)pairs.destroyAfterKnownIdle();if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment);gl.getExtension('WEBGL_lose_context')?.loseContext()}
}
window.runFloatCapability=runFloatCapability;
