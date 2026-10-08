import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {CanonicalRoomTileBridge,canonicalTopRowsToGlRows} from './roomTileBridge'
import type {CanonicalGpuField} from './types'

/** Actual two-API transfer fixture. Not watercolor, Room, GPU timestamp or a
 * zero-copy proof. Same synthetic Q8 premultiplied tile across both paths. */
export async function runCanonicalRoomTileBridgeDiagnostic(size=1024) {
 if(!navigator.gpu)throw new Error('WebGPU unavailable; no WebGL model fallback')
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('WebGPU adapter unavailable')
 const device=await adapter.requestDevice(),errors:string[]=[]
 device.addEventListener('uncapturederror',e=>errors.push(e.error.message))
 const gpuCanvas=document.createElement('canvas'),glCanvas=document.createElement('canvas')
 glCanvas.width=size;glCanvas.height=size
 const gl=glCanvas.getContext('webgl',{premultipliedAlpha:true,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL unavailable')
 const target=new AccumulationBuffer(gl,size,size),bridge=new CanonicalRoomTileBridge(device,gpuCanvas,size,size)
 const texture=device.createTexture({size:[size,size],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC})
 const field:CanonicalGpuField={texture,view:texture.createView(),width:size,height:size,format:'rgba8unorm',filter:'nearest',label:'Room bridge immutable Q8 fixture'}
 const raw=new Uint8Array(size*size*4)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const n=(y*size+x)*4,a=(x*19+y*31)%256;raw[n]=Math.floor(a*((x%31)/30));raw[n+1]=Math.floor(a*((y%47)/46));raw[n+2]=Math.floor(a*.47);raw[n+3]=a}
 device.queue.writeTexture({texture},raw,{bytesPerRow:size*4},[size,size])
 const expected=canonicalTopRowsToGlRows(raw,size,size)
 const read=async()=>{const stride=Math.ceil(size*4/256)*256,b=device.createBuffer({size:stride*size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{const e=device.createCommandEncoder();e.copyTextureToBuffer({texture},{buffer:b,bytesPerRow:stride},[size,size]);device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const mapped=new Uint8Array(b.getMappedRange()),a=new Uint8Array(raw.length);for(let y=0;y<size;y++)a.set(mapped.subarray(y*stride,y*stride+size*4),y*size*4);return a}finally{b.destroy()}}
 const compare=()=>{const a=new Uint8Array(raw.length);gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);let different=0,max=0,alphaDifferent=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-expected[i]);if(d){different++;if(i%4===3)alphaDifferent++;max=Math.max(max,d)}}return {different,max,alphaDifferent}}
 const samples:{mode:string;wallMs:number;comparison:ReturnType<typeof compare>}[]=[]
 try{
  for(const mode of ['readback','canvas','canvas','readback','readback','canvas']){
   const at=performance.now();if(mode==='canvas')await bridge.copyByCanvas(field,target);else await bridge.copyByReadback(field,target,read)
   const wallMs=performance.now()-at;samples.push({mode,wallMs,comparison:compare()})
  }
  const stateBefore={flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),conversion:gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL)}
  return {size,bytes:raw.length,samples,stateBefore,errors,glError:gl.getError(),lost:gl.isContextLost(),scope:'raw premultiplied Q8 transfer to actual Room AccumulationBuffer; no watercolor/Room or first-visible proof; wall transfer incl queue wait, not GPU timestamp',limits:['Valid premultiplied fixture only; alpha-zero hidden RGB not tested by canvas path.','No first-source/progressive/final actual watercolor owner integration.','Browser may copy/convert across APIs; zero-copy unknown.']}
 }finally{bridge.destroy();target.destroy();texture.destroy();device.destroy()}
}
