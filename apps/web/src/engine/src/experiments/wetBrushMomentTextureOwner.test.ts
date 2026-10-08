import {describe,it,expect} from 'vitest'
import {WetBrushMomentTextureOwner} from './wetBrushMomentTextureOwner'
describe('DEV native texture moment owner boundaries',()=>{
 it('OFF does not access GPU or even inspect an unsupported input',()=>{const device=new Proxy({},{get(){throw Error('GPU touched')}}) as GPUDevice;const owner=new WetBrushMomentTextureOwner(device);expect(owner.encode(null as unknown as GPUCommandEncoder,null as never,false)).toEqual({buffers:[],invalid:null,pairPasses:0})})
 it('rejects feedback before allocating GPU resources',()=>{const device=new Proxy({},{get(){throw Error('GPU touched')}}) as GPUDevice;const texture={format:'rgba8unorm',width:4,height:4} as GPUTexture,owner=new WetBrushMomentTextureOwner(device);expect(()=>owner.encode(null as unknown as GPUCommandEncoder,{pigment:texture,color:texture,availableWater:texture,contact:texture,outputPigment:texture,outputColor:texture,rect:{x:0,y:0,width:4,height:4},recipe:{} as never},true)).toThrow('Distinct matched')})
})

describe('in-place candidate pass boundary',()=>{
 it('packs before storage writes, retains four pair passes and makes no full texture copies',()=>{
  Object.assign(globalThis,{GPUBufferUsage:{STORAGE:1,COPY_SRC:2,COPY_DST:4,UNIFORM:8},GPUTextureUsage:{TEXTURE_BINDING:1,STORAGE_BINDING:2}})
  const trace:string[]=[]
  const device={queue:{writeBuffer(){}},createBuffer(){return{}},createShaderModule({code}:{code:string}){return{code}},createComputePipeline({compute}:{compute:{module:{code:string}}}){return{kind:compute.module.code.includes('textureLoad(p')?'pack':compute.module.code.includes('textureStore(p')?'unpack':'pair',getBindGroupLayout(){return{}}}},createBindGroup(){return{}}} as unknown as GPUDevice
  const encoder={clearBuffer(){},copyTextureToTexture(){trace.push('copy')},beginComputePass(){let kind='';return{setPipeline(p:{kind:string}){kind=p.kind},setBindGroup(){},dispatchWorkgroups(){trace.push(kind)},end(){}}}} as unknown as GPUCommandEncoder
  const texture=()=>({format:'rgba8unorm',width:4,height:4,usage:3,createView(){return{}}}) as GPUTexture
  const pigment=texture(),color=texture()
  const result=new WetBrushMomentTextureOwner(device).encode(encoder,{pigment,color,availableWater:texture(),contact:texture(),outputPigment:pigment,outputColor:color,diagnosticInPlace:true,rect:{x:1,y:1,width:2,height:2},recipe:{mixRate:16,advectionRate:8,directionX:256,directionY:0} as never},true)
  expect(trace).toEqual(['pack','pair','pair','pair','pair','unpack']);expect(result.pairPasses).toBe(4)
 })
 it('rejects missing storage usage before allocation',()=>{
  Object.assign(globalThis,{GPUTextureUsage:{TEXTURE_BINDING:1,STORAGE_BINDING:2}})
  const texture=()=>({format:'rgba8unorm',width:4,height:4,usage:1}) as GPUTexture
  const pigment=texture(),color=texture(),device=new Proxy({},{get(){throw Error('GPU touched')}}) as GPUDevice
  expect(()=>new WetBrushMomentTextureOwner(device).encode(null as never,{pigment,color,availableWater:texture(),contact:texture(),outputPigment:pigment,outputColor:color,diagnosticInPlace:true,rect:{x:0,y:0,width:2,height:2},recipe:{} as never},true)).toThrow('sampled/storage')
 })
})

describe('OFF-only bounded stage observer',()=>{
 it('copies cropped rows after pack and each pair without changing pass sequence',()=>{
  Object.assign(globalThis,{GPUBufferUsage:{STORAGE:1,COPY_SRC:2,COPY_DST:4,UNIFORM:8,MAP_READ:16},GPUTextureUsage:{TEXTURE_BINDING:1,STORAGE_BINDING:2}})
  const trace:string[]=[],copies:number[][]=[],usage:number[]=[]
  const device={queue:{writeBuffer(){}},createBuffer(d:{usage:number}){usage.push(d.usage);return{}},createShaderModule({code}:{code:string}){return{kind:code.includes('texture_storage')?'unpack':code.includes('var p:texture')?'pack':'pair'}},createComputePipeline({compute}:{compute:{module:{kind:string}}}){return{kind:compute.module.kind,getBindGroupLayout(){return{}}}},createBindGroup(){return{}}} as unknown as GPUDevice
  const encoder={clearBuffer(){},copyTextureToBuffer(){},copyBufferToBuffer(_s:GPUBuffer,from:number,_d:GPUBuffer,to:number,size:number){copies.push([from,to,size]);trace.push('observe')},beginComputePass(){let kind='';return{setPipeline(p:{kind:string}){kind=p.kind},setBindGroup(){},dispatchWorkgroups(){trace.push(kind)},end(){}}}} as unknown as GPUCommandEncoder
  const texture=()=>({format:'rgba8unorm',width:4,height:4,usage:3,createView(){return{}}}) as GPUTexture,pigment=texture(),color=texture()
  const result=new WetBrushMomentTextureOwner(device).encode(encoder,{pigment,color,availableWater:texture(),contact:texture(),outputPigment:pigment,outputColor:color,diagnosticInPlace:true,diagnosticStages:{x:1,y:1,width:2,height:2},rect:{x:0,y:0,width:4,height:4},recipe:{mixRate:16,advectionRate:8,directionX:0,directionY:0} as never},true)
  expect(trace.filter(x=>x!=='observe')).toEqual(['pack','pair','pair','pair','pair','unpack']);expect(result.stages?.map(x=>x.stage)).toEqual(['pack','pair-0-0','pair-0-1','pair-1-0','pair-1-1','unpack-P','unpack-C']);expect(copies).toEqual(Array.from({length:5},()=>[[200,0,80],[360,80,80]]).flat());expect(usage.slice(0,2)).toEqual([3,3])
 })
})
