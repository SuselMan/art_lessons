import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {PrivatePublicationFactory} from './privatePublicationFactory'
import {canonicalTopRowsToGlRows} from './roomTileBridge'
import type {CanonicalGpuField} from './types'

/** Standalone QA output-copy probe. Not wired to a Room, FIFO or watercolor model.
 * Caller must own device/GL context and supply two exclusive detached canvases.
 * No device creation or real-device execution is performed by importing this file. */
export function privatePublicationPattern(version:1|2,width:number,height:number){
 const bytes=new Uint8Array(width*height*4)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;bytes[i]=(x*17+y*3+version*31)%256;bytes[i+1]=(y*11+x+version*7)%256;bytes[i+2]=(x*5+y*19+version*53)%256;bytes[i+3]=(x+y)%4===0?0:255
 }
 return bytes
}
export function publicationByteComparison(actual:Uint8Array,expected:Uint8Array){
 if(actual.length!==expected.length)throw Error('Private publication comparison length mismatch')
 let mismatchedBytes=0,hiddenRgbMismatches=0
 for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i]){mismatchedBytes++;if(i%4!==3&&expected[i-i%4+3]===0)hiddenRgbMismatches++}
 return{mismatchedBytes,hiddenRgbMismatches,exact:mismatchedBytes===0}
}
export async function runPrivatePublicationProbe(device:GPUDevice,gl:WebGLRenderingContext,canvasFactory:()=>HTMLCanvasElement,targetFactory:(gl:WebGLRenderingContext,w:number,h:number)=>AccumulationBuffer=(ctx,w,h)=>new AccumulationBuffer(ctx,w,h,'nearest')){
 if(!import.meta.env.DEV)throw Error('Private publication probe DEV only')
 const width=64,height=64,pool=new PrivatePublicationFactory(device,width,height,canvasFactory)
 const texture=device.createTexture({label:'QA standalone private publication source',size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST})
 const field:CanonicalGpuField={texture,view:texture.createView(),width,height,label:'QA standalone source',format:'rgba8unorm',filter:'nearest'}
 const targets:AccumulationBuffer[]=[],started:Promise<void>[]=[],leases:Array<ReturnType<PrivatePublicationFactory['acquire']>>=[]
 let primaryFailed=false
 try{
  targets.push(targetFactory(gl,width,height));targets.push(targetFactory(gl,width,height))
  const a=privatePublicationPattern(1,width,height),b=privatePublicationPattern(2,width,height)
  const first=pool.acquire();leases.push(first)
  const second=pool.acquire();leases.push(second)
  if(first.canvas===second.canvas)throw Error('Private publication destinations alias')
  device.queue.writeTexture({texture},a,{bytesPerRow:width*4},{width,height})
  const old=first.publish(field,targets[0],()=>true);started.push(old)
  // This write queues AFTER first publication render, BEFORE the second render.
  device.queue.writeTexture({texture},b,{bytesPerRow:width*4},{width,height})
  const next=second.publish(field,targets[1],()=>true);started.push(next)
  await Promise.all([old,next]) // Only ACKs already created by actual Bridge.submitCanvas.
  const oldBytes=targets[0].readPixels(),nextBytes=targets[1].readPixels()
  const expectedOld=canonicalTopRowsToGlRows(a,width,height),expectedNext=canonicalTopRowsToGlRows(b,width,height)
  const firstResult=publicationByteComparison(oldBytes,expectedOld),secondResult=publicationByteComparison(nextBytes,expectedNext)
  const different=publicationByteComparison(oldBytes,nextBytes).mismatchedBytes>0
  const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer))).map(x=>x.toString(16).padStart(2,'0')).join('')
  const firstSHA=await sha(oldBytes),secondSHA=await sha(nextBytes)
  return{schema:'native-private-publication-copy-v1',width,height,logicalCanvasMaxBytes:pool.logicalMaxBytes,physicalSwapchainBytes:null,
   commandOrder:['uploadA','firstRawCanvasRender','uploadB','secondRawCanvasRender'],existingAckCount:2,
   first:{...firstResult,sha256:firstSHA},second:{...secondResult,sha256:secondSHA},independentEndpoints:different,exact:firstResult.exact&&secondResult.exact&&different,
   scope:'Standalone output snapshots only; no watercolor parity, Room admission, physical memory or UX proof'}
 }catch(error){primaryFailed=true;throw error}
 finally{
  // Promise.all is fail-fast. Other started publications still own targets/source.
  await Promise.allSettled(started)
  let cleanupFailed=false,cleanupError:unknown
  for(const dispose of [...leases.map(lease=>()=>lease.abandon()),()=>pool.dispose(),...targets.map(target=>()=>target.destroy()),()=>texture.destroy()]){
   try{dispose()}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error}}
  }
  if(cleanupFailed&&!primaryFailed)throw cleanupError
 }
}
