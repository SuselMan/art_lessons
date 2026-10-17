import {BUFFER,buffer,integerOption,packedRGBA,pipeline,validateInput,validateSize,type Candidate,type Input} from './contract'
import {WGSL_DIRECT} from './diffusion'
const TEXTURE={COPY_SRC:1,COPY_DST:2,TEXTURE_BINDING:4,STORAGE_BINDING:8} as const
/** Reuse the exact matched integer arithmetic. Only pigment access changes. */
function textureShader(){
 let source=WGSL_DIRECT
 const replace=(from:string,to:string)=>{if(source.split(from).length!==2)throw Error('805 texture shader anchor changed');source=source.replace(from,to)}
 replace('@group(0) @binding(0) var<storage,read> src:array<u32>;','@group(0) @binding(0) var src:texture_2d<u32>;')
 replace('@group(0) @binding(1) var<storage,read_write> dst:array<u32>;','@group(0) @binding(1) var dst:texture_storage_2d<r32uint,write>;')
 replace('@compute @workgroup_size(16,16)',`fn sampleState(pos:vec2i)->u32{return textureLoad(src,clamp(pos,vec2i(0),vec2i(i32(params.size)-1)),0).r;}
@compute @workgroup_size(16,16)`)
 replace('dst[i]=mixPixel(src[i],src[l],src[r],src[u],src[d],','textureStore(dst,vec2i(gid.xy),vec4u(mixPixel(sampleState(vec2i(gid.xy)),sampleState(vec2i(gid.xy)+vec2i(-1,0)),sampleState(vec2i(gid.xy)+vec2i(1,0)),sampleState(vec2i(gid.xy)+vec2i(0,-1)),sampleState(vec2i(gid.xy)+vec2i(0,1)),')
 replace('weight(water[i],water[d],paper[i],paper[d]));','weight(water[i],water[d],paper[i],paper[d])),0u,0u,0u));')
 return source
}
export const WGSL_TEXTURE=textureShader()
export async function create(device:GPUDevice,size:number,config:{iterations?:number;rate?:number}={}):Promise<Candidate>{
 validateSize(size);const iterations=integerOption(config.iterations??32,1,256,'iterations'),rate=integerOption(config.rate??24,0,32,'rate'),bytes=size*size*4
 if(device.limits.maxTextureDimension2D<size||device.limits.maxComputeInvocationsPerWorkgroup<256||device.limits.maxComputeWorkgroupSizeX<16||device.limits.maxComputeWorkgroupSizeY<16||device.limits.maxSampledTexturesPerShaderStage<1||device.limits.maxStorageTexturesPerShaderStage<1||device.limits.maxStorageBufferBindingSize<bytes)throw Error('R32Uint texture variant device limits insufficient')
 const pl=await pipeline(device,WGSL_TEXTURE,'805-integer-diffusion-texture')
 const states=[0,1].map(i=>device.createTexture({label:'packed-rgba-state-'+i,size:{width:size,height:size},format:'r32uint',usage:TEXTURE.COPY_SRC|TEXTURE.COPY_DST|TEXTURE.TEXTURE_BINDING|TEXTURE.STORAGE_BINDING})),views=states.map(t=>t.createView())
 const water=buffer(device,bytes,BUFFER.STORAGE|BUFFER.COPY_DST,'water'),paper=buffer(device,bytes,BUFFER.STORAGE|BUFFER.COPY_DST,'paper'),params=buffer(device,16,BUFFER.UNIFORM|BUFFER.COPY_DST,'params'),staging=buffer(device,bytes,BUFFER.MAP_READ|BUFFER.COPY_DST,'readback')
 const groups=[0,1].map(i=>device.createBindGroup({layout:pl.getBindGroupLayout(0),entries:[{binding:0,resource:views[i]},{binding:1,resource:views[1-i]},...[water,paper,params].map((b,k)=>({binding:k+2,resource:{buffer:b}}))]}))
 let uploaded=false,hasOutput=false,destroyed=false,last=0
 return {metadata:Object.freeze({algorithm:'integer-local-diffusion',variant:'R32Uint sampled+storage textures; water/paper stayu32buffers',size,iterations,rate,stateTextureBytes:bytes*2,staticBufferBytes:bytes*2+16,stagingBytes:bytes,workgroup:'16x16',copyAfterTiming:true,seedUsed:false,featuresRequired:[]}),async upload(input:Input){if(destroyed)throw Error('Candidate destroyed');validateInput(input,size);device.queue.writeTexture({texture:states[0]},packedRGBA(input.rgba),{bytesPerRow:size*4,rowsPerImage:size},{width:size,height:size});device.queue.writeBuffer(water,0,Uint32Array.from(input.water));device.queue.writeBuffer(paper,0,Uint32Array.from(input.paper));device.queue.writeBuffer(params,0,new Uint32Array([size,rate,0,0]));await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false;last=0},run(){if(destroyed||!uploaded)throw Error('Fresh upload required before every run');uploaded=false;last=0;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pl);for(let i=0;i<iterations;i++){pass.setBindGroup(0,groups[last]);pass.dispatchWorkgroups(Math.ceil(size/16),Math.ceil(size/16));last=1-last}pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{texture:states[last],width:size,height:size,bytesPerRow:size*4}},async readback(){if(destroyed||!hasOutput)throw Error('No output');const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture:states[last]},{buffer:staging,bytesPerRow:size*4,rowsPerImage:size},{width:size,height:size});device.queue.submit([encoder.finish()]);await staging.mapAsync(1);try{return new Uint8Array(staging.getMappedRange()).slice()}finally{staging.unmap()}},destroy(){if(destroyed)return;destroyed=true;for(const t of states)t.destroy();for(const b of [water,paper,params,staging])b.destroy()}}
}
