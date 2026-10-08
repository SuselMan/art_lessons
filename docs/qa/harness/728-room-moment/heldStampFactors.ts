import { CANONICAL_STAMP_WGSL } from '../../../../apps/web/src/engine/src/webgpuCanonical/stamp'
import type { CanonicalStamp } from '../../../../apps/web/src/engine/src/webgpuCanonical/types'

export type HeldStampFactorGroup = 'contact' | 'modulation' | 'amount' | 'no-tip-counterfactual' | 'coverage'
const anchor = 'var o:InkOut;o.pigment=vec4f(amount*u.paint.x,amount*wet,amount*u.paint.z,amount);o.color=vec4f(amount*u.paint.z*u.tau.xyz/4.0,amount*u.paint.z);return o;'
const tipAnchor = 'amount*=wcTipContact(a,u.combs,world,wcTipPressure(u.contact.z,u.pose.z));'

/** Diagnostic output substitution only. Native geometry, noise and uniforms remain literal. */
export function heldStampFactorShader(group: HeldStampFactorGroup): string {
  if (CANONICAL_STAMP_WGSL.split(anchor).length !== 2 || CANONICAL_STAMP_WGSL.split(tipAnchor).length !== 2) {
    throw new Error('Held stamp diagnostic anchor changed')
  }
  if(group === 'coverage')return CANONICAL_STAMP_WGSL
  let expression: string
  switch (group) {
    case 'contact': expression = 'vec4f(cov,wcHairField(a,u.combs,world),wcTipContact(a,u.combs,world,wcTipPressure(u.contact.z,u.pose.z)),depth)'; break
    case 'modulation': expression = 'vec4f(wcCloud(world,u.seed,u.cloud)*.5,wcSettling(world,u.seed,u.gran)*.5,wcFilmBlot(world,u.seed,u.clip.y,wet,u.blot,u.paint.x,step(5e-7,abs(u.paint.z)))*.5,wet)'; break
    case 'amount':
    case 'no-tip-counterfactual': expression = 'vec4f(amount*u.paint.x,amount*wet,amount*u.paint.z,amount)'; break
  }
  const shader = CANONICAL_STAMP_WGSL.replace(anchor, `var o:InkOut;o.pigment=${expression};o.color=vec4f(0);return o;`)
  return group === 'no-tip-counterfactual' ? shader.replace(tipAnchor, 'amount*=1.0; // diagnostic counterfactual: tipContact only') : shader
}

/** Frozen actual queued first-purple stamp. No identity, URL or source-field fixture is embedded. */
export const ACTUAL_FIRST_PURPLE_STAMP: CanonicalStamp = {
  center: [350.0000305175781, 400.00006103515625], radius: 119.43336486816406,
  aspect: 1, angle: 0, pressure: 0.699999988079071, opacity: 0.3593669231992319,
  nibShape: 'ellipse', cornerRadius: 0, inkEdge: 0, inkWater: 1, paperWet: 1,
  inkStrength: 1, puddle: 0, pigmentPool: 0, acrossLocal: [0, 1], inkClip: 2, inkBlend: 'max',
  uniforms: { aaPx: 3, washWater: 1, waterRetain: 1, bristleCombs: 50, bristleInk: 0,
    tau: [0, 0, 0], worldOrigin: [0, 0], mottleSeed: [76.17525773195877, 164.67415730337078],
    cloudDeposit: 0.19, granDeposit: 0.1375, poolBlot: 1, useAvailableWater: true },
}
export const HELD_FACTOR_CHANNELS = {
  contact: ['nibCoverage', 'hair', 'tipContact', 'depth'],
  modulation: ['cloud/2', 'settling/2', 'filmBlot/2', 'availableWet'],
  amount: ['P.water', 'P.wet', 'P.pigment', 'P.amount'],
  'no-tip-counterfactual': ['P.water', 'P.wet', 'P.pigment', 'P.amount'],
  coverage: ['acrossCoverage', 'pool', 'standingWater', 'contactCoverage'],
} as const

/** One 96² readback at a time; caller supplies owned production-size fields/noise.
 * Neither this helper nor its counterfactual mutates source P/C or runs a settle. */
export async function captureHeldStampFactors(
  device: GPUDevice, noise: GPUTextureView, availableCoverage: GPUTextureView,
  output: GPUTexture, stamp: CanonicalStamp = ACTUAL_FIRST_PURPLE_STAMP,
  diagnostic: { transform?: (shader: string) => string; groups?: readonly HeldStampFactorGroup[] } = {},
) {
  const v = stamp.uniforms
  const uniform = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const staging = device.createBuffer({ size: 512 * 96, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
  const errors: string[] = []
  const results: { group: HeldStampFactorGroup; channels: readonly string[]; pixels: Uint8Array }[] = []
  device.pushErrorScope('validation')
  try {
    device.queue.writeBuffer(uniform, 0, new Float32Array([1024,1024,...v.worldOrigin,...v.mottleSeed,v.aaPx,v.washWater,v.waterRetain,v.bristleCombs,v.bristleInk,v.cloudDeposit,v.granDeposit,v.poolBlot,+v.useAvailableWater,0,...v.tau,0,...stamp.center,stamp.radius,stamp.aspect,stamp.angle,+(stamp.nibShape==='roundedBox'),stamp.cornerRadius,stamp.opacity,stamp.inkWater,stamp.paperWet,stamp.inkStrength,stamp.puddle,...stamp.acrossLocal,stamp.pressure,stamp.inkEdge,stamp.inkClip,stamp.pigmentPool,0,0]))
    const layout = device.createBindGroupLayout({ entries: [
      {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
      {binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
      {binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
    ] })
    const pipelineLayout = device.createPipelineLayout({bindGroupLayouts:[layout]})
    const bind = device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:availableCoverage},{binding:2,resource:noise}]})
    for (const group of diagnostic.groups ?? ['amount','contact','modulation','no-tip-counterfactual'] as const) {
      const module = device.createShaderModule({code:(diagnostic.transform ?? (s=>s))(heldStampFactorShader(group))})
      const pipeline = device.createRenderPipeline({layout:pipelineLayout,vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:group==='coverage'?'coverage':'pigmentOnly',targets:[{format:'rgba8unorm'}]}})
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]})
      pass.setPipeline(pipeline); pass.setBindGroup(0,bind); pass.setScissorRect(384,352,96,96); pass.draw(6); pass.end()
      encoder.copyTextureToBuffer({texture:output,origin:[384,352]},{buffer:staging,bytesPerRow:512},[96,96])
      device.queue.submit([encoder.finish()])
      await staging.mapAsync(GPUMapMode.READ)
      try {
        const mapped = new Uint8Array(staging.getMappedRange()), pixels = new Uint8Array(96*96*4)
        for(let y=0;y<96;y++)pixels.set(mapped.subarray(y*512,y*512+384),y*384)
        results.push({group,channels:HELD_FACTOR_CHANNELS[group],pixels})
      } finally { staging.unmap() }
    }
  } finally {
    try {
      const error = await device.popErrorScope()
      if(error)errors.push(error.message)
    } finally { uniform.destroy(); staging.destroy() }
  }
  return {roi:{x:384,yTop:352,w:96,h:96},results,errors,
    scope:'Isolated captured stamp; output substitution Q8 diagnostics. Counterfactual excludes tipContact only, not a proposed default. Not whole Room quality or float equivalence.'}
}
