import {CANONICAL_RIBBON_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/deposit'
import {RIBBON_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {ribbonGlOracle} from '../../../../apps/web/src/engine/src/webgpuCanonical/ribbonOracle'
import type {CanonicalRibbonBatch} from '../../../../apps/web/src/engine/src/webgpuCanonical/types'
import type {CanonicalWatercolorWebGpu} from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import type {CanonicalFieldBuffer} from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
const nativeReturn='return vec4f((v.across*.5+.5)*amount,amount*wcPoolness(v.contact.x,wet,u.blot)*step(0.0,v.strength),amount*standing,amount);'
const glReturn=': vec4(acrossEncoded * amount, amount * wcPoolness(v_puddle, bandWet, u_poolBlot) * step(0.0, v_inkStrength), amount * max(bandWet, u_washWater * mix(u_waterRetain, 1.0, bandWet) * wcStandingGate(bandWater, u_washWater)), amount);'
/** Only diagnostic output is replaced. Alpha=1 makes existing OVER a replacement. */
export function ribbonDebugShaders(group:number){
 const n=['clamp(v.across*10000.0+5366.5,0,1)','clamp(v.edge/3.0,0,1)','wcTipContact(v.across,u.combs,wp,v.contact.y)','amount'][group]
 const g=['clamp(v_across*10000.0+5366.5,0.0,1.0)','clamp(v_edge/3.0,0.0,1.0)','tip','amount'][group]
 if(!n||!g||!CANONICAL_RIBBON_WGSL.includes(nativeReturn)||!RIBBON_FRAG.includes(glReturn))throw Error('Ribbon diagnostic anchors missing')
 const np=`let debugValue=floor(clamp(${n},0,1)*16777215.0);return vec4f(floor(debugValue/65536.0)/255.0,(floor(debugValue/256.0)%256.0)/255.0,(debugValue%256.0)/255.0,1);`
 const gp=`: vec4(floor(floor(clamp(${g},0.0,1.0)*16777215.0)/65536.0)/255.0,mod(floor(floor(clamp(${g},0.0,1.0)*16777215.0)/256.0),256.0)/255.0,mod(floor(clamp(${g},0.0,1.0)*16777215.0),256.0)/255.0,1.0);`
 return{native:CANONICAL_RIBBON_WGSL.replace(nativeReturn,np),gl:RIBBON_FRAG.replace(glReturn,gp)}
}
const layout:GPUVertexBufferLayout={arrayStride:44,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},...Array.from({length:6},(_,k):GPUVertexAttribute=>({shaderLocation:k+1,offset:8+k*4,format:'float32'})),{shaderLocation:7,offset:32,format:'float32x3'}]}
export async function ribbonDebug(owner:CanonicalWatercolorWebGpu,out:CanonicalFieldBuffer,empty:CanonicalFieldBuffer,batch:CanonicalRibbonBatch,points:readonly {x:number;yTop:number}[],triangles:readonly number[]){
 if(triangles.length>12||triangles.some(i=>!Number.isInteger(i)||i<0||(i+1)*33>batch.vertices.length))throw Error('Bounded triangle indices required')
 const device=owner.device,v=batch.uniforms,u=device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(u,0,new Float32Array([1024,1024,...v.worldOrigin,...v.mottleSeed,v.aaPx,v.washWater,v.waterRetain,v.bristleCombs,v.bristleInk,v.cloudDeposit,v.granDeposit,v.poolBlot,+v.useAvailableWater,0,...v.tau,0]));const rows=[]
 try{for(const triangle of triangles){const local=batch.vertices.slice(triangle*33,(triangle+1)*33);for(let i=0;i<local.length;i+=11){local[i]-=v.worldOrigin[0];local[i+1]+=v.worldOrigin[1]}const vb=device.createBuffer({size:local.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(vb,0,local)
 try{for(let group=0;group<4;group++){
 const shaders=ribbonDebugShaders(group),module=device.createShaderModule({code:shaders.native}),pipeline=device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs',buffers:[layout]},fragment:{module,entryPoint:'coverage',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}})
 const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:empty.field.view},{binding:2,resource:owner.noise.view}]});const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:out.field.view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.setVertexBuffer(0,vb);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);const bytes=await out.readBytes(),gl=ribbonGlOracle({...batch,vertices:batch.vertices.slice(triangle*33,(triangle+1)*33)},1024,1024,false,undefined,true,shaders.gl).coverage
 const decode=(a:Uint8Array,i:number)=>(a[i]*65536+a[i+1]*256+a[i+2])/16777215
 rows.push({triangle,group,quantity:['amplifiedAcross','edge/3','tip','amount'][group],points:points.map(p=>{const i=(p.yTop*1024+p.x)*4;return{...p,native:decode(bytes,i),gl:decode(gl,i),nativeBytes:Array.from(bytes.subarray(i,i+4)),glBytes:Array.from(gl.subarray(i,i+4))}})})
 }}finally{vb.destroy()}}
 }finally{u.destroy()}
 return{rows,scope:'Single actual triangles; unchanged inputs/functions/varyings; diagnostic24-bit RGB quantization, alpha1 replacement, not exact float readback or production blend'}
}
