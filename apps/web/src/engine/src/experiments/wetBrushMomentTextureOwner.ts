import {WetBrushMomentGpu} from './wetBrushMomentGpu'
import type {MomentContactRecipe} from './wetBrushMomentRecipe'
const PACK=`struct U{x:u32,y:u32,w:u32,h:u32};
@group(0) @binding(0)var p:texture_2d<f32>;
@group(0) @binding(1)var c:texture_2d<f32>;
@group(0) @binding(2)var wet:texture_2d<f32>;
@group(0) @binding(3)var contact:texture_2d<f32>;
@group(0) @binding(4)var<storage,read_write> records:array<u32>;
@group(0) @binding(5)var<storage,read_write> invalid:atomic<u32>;
@group(0) @binding(6)var<uniform> u:U;
@compute @workgroup_size(64)fn main(@builtin(global_invocation_id) g:vec3u){let i=g.x;if(i>=u.w*u.h){return;}let xy=vec2i(i32(u.x+i%u.w),i32(u.y+i/u.w));let pp=vec4u(round(textureLoad(p,xy,0)*255.0));let cc=vec4u(round(textureLoad(c,xy,0)*255.0));let vv=textureLoad(wet,xy,0);let w=u32(round(clamp(vv.b/max(vv.a,0.002),0.0,1.0)*255.0));let touch=u32(round(clamp(textureLoad(contact,xy,0).a,0.0,1.0)*255.0));let j=i*10u;for(var k=0u;k<4u;k++){records[j+k]=pp[k];records[j+4u+k]=cc[k];if(cc[k]>pp.b){atomicAdd(&invalid,1u);}}records[j+8u]=w;records[j+9u]=touch;}`
const UNPACK=`struct U{x:u32,y:u32,w:u32,h:u32};
@group(0) @binding(0)var<storage,read> records:array<u32>;
@group(0) @binding(1)var p:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(2)var c:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(3)var<uniform> u:U;
@compute @workgroup_size(64)fn main(@builtin(global_invocation_id) g:vec3u){let i=g.x;if(i>=u.w*u.h){return;}let j=i*10u;let xy=vec2i(i32(u.x+i%u.w),i32(u.y+i/u.w));textureStore(p,xy,vec4f(f32(records[j]),f32(records[j+1u]),f32(records[j+2u]),f32(records[j+3u]))/255.0);textureStore(c,xy,vec4f(f32(records[j+4u]),f32(records[j+5u]),f32(records[j+6u]),f32(records[j+7u]))/255.0);}`
export interface MomentTextureInputs {
 /** Actual inkLoad/inkColor, or explicitly agreed running-film pair. */
 pigment:GPUTexture;color:GPUTexture
 /** Production availability B/A and CURRENT canonical brush footprint A. */
 availableWater:GPUTexture;contact:GPUTexture
 outputPigment:GPUTexture;outputColor:GPUTexture
 rect:{x:number;y:number;width:number;height:number}
 recipe:MomentContactRecipe
 /** OFF-default candidate: pack completes before original textures become storage outputs. */
 diagnosticInPlace?:boolean
}
/** DEV owner seam. Caller inserts after source landing BEFORE settle, once per
 * retained contact (not repeated CPU delivery). Isolated bounded rectangle only.
 * Returned invalid counter MUST be checked before accepting experimental output.
 * Invalid records globally disable transport; unchanged pack/unpack still needs
 * a byte-fidelity GPU gate. OFF creates no resources or commands. */
export class WetBrushMomentTextureOwner {
 private readonly device:GPUDevice
 private readonly operator:WetBrushMomentGpu
 private pack:GPUComputePipeline|null=null
 private unpack:GPUComputePipeline|null=null
 private readonly diagnosticVector:boolean
 constructor(device:GPUDevice,diagnosticVector=false){this.device=device;this.diagnosticVector=diagnosticVector;this.operator=new WetBrushMomentGpu(device,diagnosticVector)}
 encode(encoder:GPUCommandEncoder,input:MomentTextureInputs,enabled=false):{buffers:GPUBuffer[];invalid:GPUBuffer|null;pairPasses:number} {
  if(!enabled)return{buffers:[],invalid:null,pairPasses:0}
  const {pigment,color,availableWater,contact,outputPigment,outputColor,rect,recipe}=input
  const textures=[pigment,color,availableWater,contact,outputPigment,outputColor]
  const inPlace=input.diagnosticInPlace===true
  const aliasValid=inPlace?outputPigment===pigment&&outputColor===color:!textures.slice(0,4).includes(outputPigment)&&!textures.slice(0,4).includes(outputColor)
  if(textures.some(t=>t.format!=='rgba8unorm'||t.width!==pigment.width||t.height!==pigment.height)||pigment===color||!aliasValid||outputPigment===outputColor)throw Error('Distinct matched canonical RGBA8 inputs/outputs required')
  if(inPlace&&(availableWater===pigment||availableWater===color||contact===pigment||contact===color||[pigment,color].some(t=>(t.usage&(GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING))!==(GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING))))throw Error('In-place moment requires separate water/contact and sampled/storage material usage')
  const {x,y,width,height}=rect
  if(![x,y,width,height].every(Number.isInteger)||x<0||y<0||width<1||height<1||x+width>pigment.width||y+height>pigment.height||width*height>512*512)throw Error('Bounded <=512-square moment ROI required')
  if(![recipe.mixRate,recipe.advectionRate,recipe.directionX,recipe.directionY].every(Number.isInteger)||recipe.mixRate<0||recipe.mixRate>255||recipe.advectionRate<0||recipe.advectionRate>255||Math.abs(recipe.directionX)>256||Math.abs(recipe.directionY)>256)throw Error('Prepared bounded contact recipe required')
  const d=this.device,buffers:GPUBuffer[]=[],make=(size:number,usage:GPUBufferUsageFlags)=>{const b=d.createBuffer({size,usage});buffers.push(b);return b}
  const a=make(width*height*40,GPUBufferUsage.STORAGE),b=make(width*height*40,GPUBufferUsage.STORAGE),invalid=make(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),u=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST)
  d.queue.writeBuffer(u,0,new Uint32Array([x,y,width,height]));encoder.clearBuffer(invalid)
  this.pack??=d.createComputePipeline({layout:'auto',compute:{module:d.createShaderModule({code:this.diagnosticVector?PACK.replace('if(cc[k]>pp.b){atomicAdd(&invalid,1u);}',''):PACK}),entryPoint:'main'}})
  this.unpack??=d.createComputePipeline({layout:'auto',compute:{module:d.createShaderModule({code:UNPACK}),entryPoint:'main'}})
  const execute=(pipeline:GPUComputePipeline,entries:GPUBindGroupEntry[])=>{const cp=encoder.beginComputePass();cp.setPipeline(pipeline);cp.setBindGroup(0,d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries}));cp.dispatchWorkgroups(Math.ceil(width*height/64));cp.end()}
  execute(this.pack,[...textures.slice(0,4).map((t,binding)=>({binding,resource:t.createView()})),{binding:4,resource:{buffer:a}},{binding:5,resource:{buffer:invalid}},{binding:6,resource:{buffer:u}}])
  let source=a,target=b
  for(const axis of [0,1] as const)for(const parity of [0,1] as const){buffers.push(...this.operator.encode(encoder,source,target,invalid,{width,height,axis,parity,mixRate:recipe.mixRate,advectionRate:recipe.advectionRate,direction:axis===0?recipe.directionX:recipe.directionY},true));[source,target]=[target,source]}
  // Original full texture copy preserves all pixels outside bounded ROI.
  if(!inPlace){encoder.copyTextureToTexture({texture:pigment},{texture:outputPigment},[pigment.width,pigment.height]);encoder.copyTextureToTexture({texture:color},{texture:outputColor},[color.width,color.height])}
  execute(this.unpack,[{binding:0,resource:{buffer:source}},{binding:1,resource:outputPigment.createView()},{binding:2,resource:outputColor.createView()},{binding:3,resource:{buffer:u}}])
  return{buffers,invalid,pairPasses:4}
 }
}
