/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />
import noiseAsset from '../../../../apps/web/src/engine/src/raster/watercolorNoise.txt?raw'
import { tipVariantShader } from './heldStampVariants'
import { ACTUAL_FIRST_PURPLE_STAMP, captureHeldStampFactors } from './heldStampFactors'

export async function runHeldStampVariants() {
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
    const arms=[]
    for(const pressure of [.7,.1,.02,0])for(const variant of ['literal','A','B'] as const) {
      const captured = await captureHeldStampFactors(device,noise.createView(),coverage.createView(),output,{...ACTUAL_FIRST_PURPLE_STAMP,pressure},{groups:['amount','coverage','contact'],transform:shader=>tipVariantShader(shader,variant)})
      if(captured.errors.length)throw new Error(captured.errors.join(';'))
      const groups=[]
      for(const result of captured.results) {
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',result.pixels.buffer as ArrayBuffer)),x=>x.toString(16).padStart(2,'0')).join('')
        let binary='';for(const byte of result.pixels)binary+=String.fromCharCode(byte)
        const sums=[0,0,0,0],max=[0,0,0,0];for(let i=0;i<result.pixels.length;i++){sums[i%4]!+=result.pixels[i]!;max[i%4]=Math.max(max[i%4]!,result.pixels[i]!)}
        groups.push({group:result.group,channels:result.channels,byteLength:result.pixels.byteLength,sha256:digest,base64:btoa(binary),sums,max})
      }
      arms.push({variant,pressure,groups,roi:captured.roi})
    }
    return {arms,errors:uncaptured,scope:'Controlled isolated source model specialization. Actual geometry retained across pressures; no low-pressure radius retuning, no whole Room quality/replay/timing claim.',inputScope:'Same literal noise; zero available coverage means P.G substituted. Compare shared P.R/P.B/contactCoverage and quantized dose growth.'}
  } finally { for(const texture of textures)texture.destroy(); device.destroy() }
}
