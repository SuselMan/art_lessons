/// <reference types="@webgpu/types" />
import {WC_FIELD_OP_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {CANONICAL_FIELD_OPS_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/passes/fieldOps'
import type {CanonicalGpuField} from '../../../../apps/web/src/engine/src/webgpuCanonical/types'
import {buildRimHashCornerTable} from './rimHashCornerTable'
import {FIRST_BAND_RECIPE} from './firstBandInputContract'
export const RIM_CORNER_QA_SEED=728
export function rimCornerQaRecipe(){return buildRimHashCornerTable({width:1536,height:1536,world:[0,-1576,1]},RIM_CORNER_QA_SEED)}
/** QA ONLY: identical seeded Float32 lattice corners, unchanged noise interpolation,
 * two-octave frequencies and thresholds. Spatial pattern differs from polynomial. */
export function rimCornerQaShaders(table:ReturnType<typeof rimCornerQaRecipe>){
 const expected=rimCornerQaRecipe()
 if(table.seed!==RIM_CORNER_QA_SEED||table.width!==expected.width||table.height!==expected.height||table.origin[0]!==expected.origin[0]||table.origin[1]!==expected.origin[1]||JSON.stringify(table.domain)!==JSON.stringify(expected.domain)||table.values.length!==expected.values.length||table.values.some((value,i)=>value!==expected.values[i]))throw Error('Shared seeded QA corner table required')
 const gs=WC_FIELD_OP_FRAG.indexOf('  float wcRimHash(vec2 p)'),ge=WC_FIELD_OP_FRAG.indexOf('  float wcRimNoise(',gs),ws=CANONICAL_FIELD_OPS_WGSL.indexOf('fn rimHash('),we=CANONICAL_FIELD_OPS_WGSL.indexOf('fn rimNoise(',ws)
 if(gs<0||ge<gs||ws<0||we<ws)throw Error('Original rim hash anchors required')
 const [x,y]=table.origin
 const gl=WC_FIELD_OP_FRAG.slice(0,gs)+`uniform sampler2D u_qaRimCorners;\nfloat wcRimHash(vec2 p){return texture2D(u_qaRimCorners,(p-vec2(${x}.0,${y}.0)+.5)/vec2(${table.width}.0,${table.height}.0)).r;}\n`+WC_FIELD_OP_FRAG.slice(ge)
 const native=CANONICAL_FIELD_OPS_WGSL.slice(0,ws)+`@group(0) @binding(9) var qaRimCorners:texture_2d<f32>;\nfn rimHash(p:vec2f)->f32{return textureLoad(qaRimCorners,vec2i(p)-vec2i(${x},${y}),0).r;}\n`+CANONICAL_FIELD_OPS_WGSL.slice(we)
 return {gl,native}
}
export function uploadGlRimCorners(gl:WebGLRenderingContext,table:ReturnType<typeof rimCornerQaRecipe>){
 rimCornerQaShaders(table)
 if(!gl.getExtension('OES_texture_float'))throw Error('Explicit unsupported float corner texture')
 const texture=gl.createTexture();if(!texture)throw Error('QA corner texture allocation')
 gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,table.width,table.height,0,gl.LUMINANCE,gl.FLOAT,table.values)
 for(const k of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST)
 for(const k of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE)
 if(gl.getError()){gl.deleteTexture(texture);throw Error('QA corner float upload unsupported')}
 return texture
}
export function encodeRimCornerQa(device:GPUDevice,encoder:GPUCommandEncoder,fields:{pressure:CanonicalGpuField;inward:CanonicalGpuField;coverage:CanonicalGpuField;extension:CanonicalGpuField;band:CanonicalGpuField},table:ReturnType<typeof rimCornerQaRecipe>){
 if(Object.values(fields).some(f=>f.width!==1536||f.height!==1536)||fields.pressure.filter!=='linear'||fields.inward.filter!=='linear'||fields.coverage.filter!=='nearest')throw Error('Actual mode6 field/filter contract')
 const texture=device.createTexture({size:[table.width,table.height],format:'r32float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});device.queue.writeTexture({texture},table.values,{bytesPerRow:table.width*4},{width:table.width,height:table.height})
 const uniform=device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
 try{
 const r=FIRST_BAND_RECIPE.mode6,values=new Float32Array(32);values.set([1536,1536,1/1536,1/1536,0,0,0,0,1,6,0,0,0,0,1536,1536,1,1,...r.size,...r.band,0,-1576,1,0,13,0]);new Uint32Array(values.buffer).set([0,0,1536,1536],28);device.queue.writeBuffer(uniform,0,values)
 const layout=device.createBindGroupLayout({entries:[...Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'float' as const}})),{binding:7,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba8unorm'}},{binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:128}},{binding:9,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'unfilterable-float'}}]})
 const pipeline=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module:device.createShaderModule({code:rimCornerQaShaders(table).native}),entryPoint:'main'}})
 const ff=[fields.pressure,fields.extension,fields.inward,fields.pressure,fields.coverage,fields.coverage,fields.coverage],entries:GPUBindGroupEntry[]=ff.map((f,binding)=>({binding,resource:f.view}));entries.push({binding:7,resource:fields.band.view},{binding:8,resource:{buffer:uniform}},{binding:9,resource:texture.createView()});const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout,entries}));pass.dispatchWorkgroups(192,192);pass.end()
 return {texture,uniform}
 }catch(error){uniform.destroy();texture.destroy();throw error}
}

/** Compact diagnostic G-channel image, not paper-composed artwork. */
export function rimBandGImage(bytes:Uint8Array){
 if(bytes.length!==1536*1536*4)throw Error('Actual band image dimensions')
 const canvas=document.createElement('canvas');canvas.width=canvas.height=384
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Band visual canvas unsupported')
 const image=ctx.createImageData(384,384)
 for(let y=0;y<384;y++)for(let x=0;x<384;x++){const v=bytes[((y*4)*1536+x*4)*4+1],i=(y*384+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255}
 ctx.putImageData(image,0,0);return canvas.toDataURL('image/png')
}
