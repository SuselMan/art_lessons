/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />
import noiseAsset from '../../../../apps/web/src/engine/src/raster/watercolorNoise.txt?raw'
import { captureHeldStampFactors } from './heldStampFactors'

export async function runHeldStampFactors() {
  if(!isSecureContext || !navigator.gpu)throw new Error('Secure WebGPU context required')
  const adapter = await navigator.gpu.requestAdapter()
  if(!adapter)throw new Error('No WebGPU adapter')
  const device = await adapter.requestDevice()
  const uncaptured: string[] = []
  device.addEventListener('uncapturederror',event=>uncaptured.push(event.error.message))
  const textures: GPUTexture[] = []
  try {
    const texture = (width:number,height:number) => {
      const t = device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC})
      textures.push(t); return t
    }
    const noise = texture(251,251), coverage = texture(1024,1024), output = texture(1024,1024)
    const lattice = Uint8Array.from(atob(noiseAsset),c=>c.charCodeAt(0)), rgba = new Uint8Array(lattice.length*4)
    for(let i=0;i<lattice.length;i++)rgba.set([lattice[i]!,lattice[i]!,lattice[i]!,255],i*4)
    device.queue.writeTexture({texture:noise},rgba,{bytesPerRow:251*4},[251,251])
    // Coverage is zero initialized. In this exact captured stamp inkClip=2
    // affects wet only; puddle=0 and PB output do not depend on that wet value.
    // This arm proves tip PB gaps, NOT actual P.G or arbitrary pooled stamps.
    const captured = await captureHeldStampFactors(device,noise.createView(),coverage.createView(),output)
    const groups=[]
    for(const result of captured.results) {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',result.pixels.buffer as ArrayBuffer)),x=>x.toString(16).padStart(2,'0')).join('')
      let binary=''; for(const byte of result.pixels)binary+=String.fromCharCode(byte)
      groups.push({group:result.group,channels:result.channels,byteLength:result.pixels.byteLength,sha256:digest,base64:btoa(binary)})
    }
    return {roi:captured.roi,groups,errors:[...captured.errors,...uncaptured],scope:captured.scope,
      inputScope:'Actual stamp uniform/noise; zero coverage substitutes available wet only. PB and contact factors valid for captured pool0/clip2; not a wet-channel/source composition oracle.'}
  } finally { for(const texture of textures)texture.destroy(); device.destroy() }
}
