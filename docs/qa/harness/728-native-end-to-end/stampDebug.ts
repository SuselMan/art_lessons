import { CANONICAL_STAMP_WGSL } from '../../../../apps/web/src/engine/src/webgpuCanonical/stamp'
import { DAB_FRAG } from '../../../../apps/web/src/engine/src/raster/shaders'
import { stampGlOracle } from '../../../../apps/web/src/engine/src/webgpuCanonical/ribbonOracle'
import type { CanonicalStamp } from '../../../../apps/web/src/engine/src/webgpuCanonical/types'
import type { CanonicalWatercolorWebGpu } from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import type { CanonicalFieldBuffer } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
const nativeReturn='return vec4f((a*.5+.5)*cov,cov*wcPoolness(u.paint.w,u.paint.y,u.blot),cov*max(u.paint.y,u.wash*mix(u.retain,1.0,u.paint.y)*wcStandingGate(u.paint.x,u.wash)),cov);'
const glReturn='gl_FragColor = vec4((acrossN * 0.5 + 0.5) * cov, cov * wcPoolness(u_puddle, u_paperWet, u_poolBlot), cov * max(u_paperWet, u_washWater * mix(u_waterRetain, 1.0, u_paperWet) * wcStandingGate(u_inkWater, u_washWater)), cov);'
export function stampDebugShaders(group:number){
 const native=[
  'vec4f(a*.5+.5,wcHairField(a,u.combs,wp(v)),smoothstep(.55,.72,wcNoise(wp(v)*.009+vec2f(37,91))),wcTipContact(a,u.combs,wp(v),wcTipPressure(u.contact.z,u.pose.z)))',
  'vec4f(clamp(-nibDistance(v)/u.aa,0,1),wcTipPressure(u.contact.z,u.pose.z),wp(v)/1024.0)',
  'vec4f(v.local*.5+.5,wcNoise(wp(v)*.009+vec2f(37,91)),wcFbm(wp(v)*.0012+vec2f(71,13)))'
 ][group]
 const gl=[
  'vec4(acrossN*.5+.5,wcHairField(acrossN,u_bristleCombs,gl_FragCoord.xy+u_paperOrigin),smoothstep(.55,.72,wcNoise((gl_FragCoord.xy+u_paperOrigin)*.009+vec2(37,91))),wcTipContact(acrossN,u_bristleCombs,gl_FragCoord.xy+u_paperOrigin,wcTipPressure(v_pressure,v_radius)))',
  'vec4(clamp(-markerNibDistPx()/u_aaPx,0.0,1.0),wcTipPressure(v_pressure,v_radius),(gl_FragCoord.xy+u_paperOrigin)/1024.0)',
  'vec4(v_localUV*.5+.5,wcNoise((gl_FragCoord.xy+u_paperOrigin)*.009+vec2(37,91)),wcFbm((gl_FragCoord.xy+u_paperOrigin)*.0012+vec2(71,13)))'
 ][group]
 if(!native||!gl||!CANONICAL_STAMP_WGSL.includes(nativeReturn)||!DAB_FRAG.includes(glReturn))throw new Error('Stamp debug shader anchor missing')
 return{native:CANONICAL_STAMP_WGSL.replace(nativeReturn,'return '+native+';'),gl:DAB_FRAG.replace(glReturn,'gl_FragColor = '+gl+';')}
}
export async function stampDebug(owner:CanonicalWatercolorWebGpu,out:CanonicalFieldBuffer,stamp:CanonicalStamp,points:readonly {x:number;yTop:number}[]){
 const v=stamp.uniforms,u=owner.device.createBuffer({size:160,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
 owner.device.queue.writeBuffer(u,0,new Float32Array([1024,1024,...v.worldOrigin,...v.mottleSeed,v.aaPx,v.washWater,v.waterRetain,v.bristleCombs,v.bristleInk,v.cloudDeposit,v.granDeposit,v.poolBlot,+v.useAvailableWater,0,...v.tau,0,...stamp.center,stamp.radius,stamp.aspect,stamp.angle,+(stamp.nibShape==='roundedBox'),stamp.cornerRadius,stamp.opacity,stamp.inkWater,stamp.paperWet,stamp.inkStrength,stamp.puddle,...stamp.acrossLocal,stamp.pressure,stamp.inkEdge,stamp.inkClip,stamp.pigmentPool,0,0]))
 const groups=[],layout=owner.device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}}]}),pipelineLayout=owner.device.createPipelineLayout({bindGroupLayouts:[layout]})
 try{for(let group=0;group<3;group++){
  const shaders=stampDebugShaders(group),module=owner.device.createShaderModule({code:shaders.native}),pipeline=owner.device.createRenderPipeline({layout:pipelineLayout,vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'coverage',targets:[{format:'rgba8unorm'}]}})
  const bind=owner.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}},{binding:2,resource:owner.noise.view}]})
  const encoder=owner.device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:out.field.view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.draw(6);pass.end();owner.device.queue.submit([encoder.finish()])
  const bytes=await out.readBytes(),expected=stampGlOracle(stamp,1024,1024,false,undefined,true,shaders.gl).coverage
  groups.push({group,channels:[['acrossEncoded','hair','opening','tipContact'],['nibCoverage','tipPressure','worldX/1024','worldY/1024'],['localXEncoded','localYEncoded','openingNoise','hairDrift']][group],points:points.map(p=>{const i=(p.yTop*1024+p.x)*4;return{...p,native:Array.from(bytes.subarray(i,i+4)),gl:Array.from(expected.subarray(i,i+4))}})})
 }}finally{u.destroy()}
 return{groups,scope:'RGBA8 encoded diagnostic intermediates; production shader output only replaced, geometry/uniforms/functions unchanged. Q8 observations cannot prove sub-byte float equivalence.'}
}
