import {PAPER_COMPOSE_FRAG,DISPLAY_VERT} from '../../../../apps/web/src/engine/src/raster/shaders'
import {CanonicalWatercolorWebGpu} from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import {CanonicalPaperPresentation} from '../../../../apps/web/src/engine/src/webgpuCanonical/paperPresentation'
import {getPaperBytes} from '../../../../apps/web/src/engine/src/paper/paperLoader'
export interface WetPresentationSnapshot{operationId:string;origin:readonly[number,number];width:number;height:number;layerRgbaB64:string;coverageRgbaB64:string;wet:{w:number;h:number;rect:readonly[number,number,number,number];rgbaB64:string}|null;clock:number}
const sha=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer))].map(x=>x.toString(16).padStart(2,'0')).join('')
const decode=(s:string)=>Uint8Array.from(atob(s),v=>v.charCodeAt(0))
function flip(a:Uint8Array,w:number,h:number){const b=new Uint8Array(a.length);for(let y=0;y<h;y++)b.set(a.subarray(y*w*4,(y+1)*w*4),(h-y-1)*w*4);return b}
function png(a:Uint8Array,w:number,h:number){const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(a),w,h),0,0);return c.toDataURL()}
function compare(a:Uint8Array,b:Uint8Array){let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=+(d>0);max=Math.max(max,d)}return{changed,max}}
/** Renderer-only test. The captured material and actual CPU overlay are immutable;
 * no watercolor physical pass or clock is run here. All output is opaque RGBA8. */
export async function runWetPresentationSnapshot(snapshot:WetPresentationSnapshot){
 const {width:w,height:h,origin}=snapshot;if(w>128||h>128||w<=0||h<=0)throw new Error('Wet gate is bounded to128px')
 const layer=decode(snapshot.layerRgbaB64),coverage=decode(snapshot.coverageRgbaB64);if(layer.length!==w*h*4||coverage.length!==layer.length)throw new Error('Invalid snapshot extent')
 const la=await getPaperBytes('fine'),side=Math.sqrt(la.length/2),paper=new Uint8Array(side*side*4);for(let i=0;i<la.length/2;i++)paper.set([la[i*2],la[i*2],la[i*2],la[i*2+1]],i*4)
 const wetBytes=snapshot.wet?decode(snapshot.wet.rgbaB64):new Uint8Array(4),wetDims=snapshot.wet?[snapshot.wet.w,snapshot.wet.h]:[1,1]
 const canvas=document.createElement('canvas'),owner=await CanonicalWatercolorWebGpu.create({canvas,width:w,height:h,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}}),errors:string[]=[]
 owner.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));const outputs:Uint8Array[]=[]
 try{
  owner.upload(owner.fields.pigment,layer);const wetField=owner.createField('captured immutable wet map',wetDims[0],wetDims[1],'linear');owner.upload(wetField,wetBytes)
  const renderer=new CanonicalPaperPresentation(owner),target=owner.createField('tiny paper output',w,h)
  for(const wet of [false,true]){const encoder=owner.device.createCommandEncoder(),buffers=renderer.encodeField(encoder,owner.fields.pigment,origin,[1,1,1],target.view,[w,h],'rgba8unorm',wet&&snapshot.wet?{field:wetField,rect:snapshot.wet.rect,kind:'production-overlay'}:undefined);owner.device.queue.submit([encoder.finish()]);await owner.whenIdle();buffers.forEach(b=>b.destroy());outputs.push(await owner.readField(target))}
 }finally{owner.destroy()}
 const glCanvas=document.createElement('canvas');glCanvas.width=w;glCanvas.height=h;const gl=glCanvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:false})!;if(!gl)throw new Error('Actual GL renderer unavailable')
 const textures:WebGLTexture[]=[];let program:WebGLProgram|null=null,vertex:WebGLBuffer|null=null;const glOutputs:Uint8Array[]=[];let glError=0
 try{
  const compile=(type:number,code:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)??'GL compile');return shader}
  const vs=compile(gl.VERTEX_SHADER,DISPLAY_VERT),fs=compile(gl.FRAGMENT_SHADER,PAPER_COMPOSE_FRAG);program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)??'GL link');gl.useProgram(program)
  vertex=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,vertex);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0)
  const texture=(unit:number,name:string,bytes:Uint8Array,tw:number,th:number,repeat=false)=>{const t=gl.createTexture()!;textures.push(t);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,tw,th,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.uniform1i(gl.getUniformLocation(program!,name),unit)}
  texture(0,'u_accumulation',flip(layer,w,h),w,h);texture(1,'u_paperMap',paper,side,side,true);texture(2,'u_wetMap',wetBytes,wetDims[0],wetDims[1])
  const u=(name:string)=>gl.getUniformLocation(program!,name);gl.uniform3f(u('u_paperColor'),1,1,1);gl.uniform2f(u('u_paperScale'),1,1);gl.uniform2f(u('u_paperTexSize'),1024,1024);gl.uniform2f(u('u_dstSize'),w,h);gl.uniform2f(u('u_srcSize'),w,h);gl.uniform1f(u('u_sharpResample'),0);gl.uniform4f(u('u_pageRect'),0,0,0,0);gl.uniform3f(u('u_deskColor'),1,1,1);gl.uniform1f(u('u_wetPeak'),1);gl.uniformMatrix3fv(u('u_matrixInv'),false,new Float32Array([1,0,0,0,1,0,0,0,1]));gl.uniformMatrix3fv(u('u_screenToWorld'),false,new Float32Array([1,0,0,0,1,0,...origin,1]));gl.viewport(0,0,w,h);gl.disable(gl.BLEND)
  for(const wet of [false,true]){gl.uniform4fv(u('u_wetRect'),new Float32Array(wet&&snapshot.wet?snapshot.wet.rect:[0,0,-1,-1]));gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);glOutputs.push(flip(bytes,w,h))}glError=gl.getError()
 }finally{textures.forEach(t=>gl.deleteTexture(t));if(vertex)gl.deleteBuffer(vertex);if(program)gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext()}
 const images:Record<string,string>={nativeDry:png(outputs[0],w,h),nativeWet:png(outputs[1],w,h),glDry:png(glOutputs[0],w,h),glWet:png(glOutputs[1],w,h)}
 for(let c=0;c<4;c++){const channel=new Uint8Array(coverage.length);for(let i=0;i<channel.length;i+=4){channel[i]=channel[i+1]=channel[i+2]=coverage[i+c];channel[i+3]=255}images['coverage'+['R','G','B','A'][c]]=png(channel,w,h)}
 const materialAlpha=new Uint8Array(layer.length);for(let i=0;i<layer.length;i+=4){materialAlpha[i]=materialAlpha[i+1]=materialAlpha[i+2]=layer[i+3];materialAlpha[i+3]=255}images.materialAlpha=png(materialAlpha,w,h)
 if(snapshot.wet)for(const c of [0,1,3]){const channel=new Uint8Array(wetBytes.length);for(let i=0;i<channel.length;i+=4){channel[i]=channel[i+1]=channel[i+2]=wetBytes[i+c];channel[i+3]=255}images['wetOverlay'+['R','G','B','A'][c]]=png(channel,wetDims[0],wetDims[1])}
 return{operationId:snapshot.operationId,origin,width:w,height:h,clock:snapshot.clock,dry:compare(outputs[0],glOutputs[0]),wet:compare(outputs[1],glOutputs[1]),nativeWetEffect:compare(outputs[0],outputs[1]),glWetEffect:compare(glOutputs[0],glOutputs[1]),images,errors,glError,metadata:{materialSha256:await sha(layer),coverageSha256:await sha(coverage),wetSha256:await sha(wetBytes),paperSha256:await sha(la),material:'premultRGBA8 topdown, GL upload flipped',coverage:'actual solver coverage channels, no presentation substitution',paper:'actual Fine raw asset rows LINEAR_REPEAT period1024 scale1',wet:'actual CPU overlay raw rows LINEAR_CLAMP',wetRect:snapshot.wet?.rect??null,wetDims,noise:'unused by PAPER_COMPOSE; no invented noise',camera:'identity unrotated, no sharp resample, no page boundary'}}
}
Object.assign(window,{runWetPresentationSnapshot})
