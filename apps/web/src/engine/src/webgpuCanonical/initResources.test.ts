import {afterEach,expect,it,vi} from 'vitest'
import {CanonicalWatercolorWebGpu} from './backend'
import {CanonicalRibbonDeposit} from './deposit'
import {CanonicalStampDeposit} from './stamp'
import {expandCanonicalPaperLa} from './paperExpansion'
afterEach(()=>vi.unstubAllGlobals())
it('LA expansion matches old byte mapping for every luminance/alpha combination',()=>{
 const la=new Uint8Array(256*256*2);for(let i=0;i<65536;i++){la[i*2]=i&255;la[i*2+1]=i>>>8}
 const expected=new Uint8Array(la.length*2);for(let i=0;i<la.length/2;i++)expected.set([la[i*2],la[i*2],la[i*2],la[i*2+1]],i*4)
 expect(expandCanonicalPaperLa(la)).toEqual(expected);expect(()=>expandCanonicalPaperLa(new Uint8Array(1))).toThrow('LA')
})
it('lazy source owners compile only a requested pipeline, while eager defaults keep all seven',()=>{
 const created:GPURenderPipelineDescriptor[]=[],device={createShaderModule:()=>({}),createRenderPipeline:(d:GPURenderPipelineDescriptor)=>{created.push(d);return{}}} as unknown as GPUDevice
 for(const Owner of [CanonicalRibbonDeposit,CanonicalStampDeposit]){
  created.length=0;new Owner(device,{} as never);expect(created).toHaveLength(7)
  const eager=created.slice();created.length=0;const lazy=new Owner(device,{} as never,true)
  expect(created).toHaveLength(0)
  const invoke=lazy as unknown as {pipeline:(key:string)=>unknown}
  invoke.pipeline('pigmentOnlymax');invoke.pipeline('pigmentOnlymax')
  expect(created).toHaveLength(1);expect(created[0]).toEqual(eager[3])
  for(const [i,key] of ['coverage','inkmax','inkadd','pigmentOnlymax','pigmentOnlyadd','colorOnlymax','colorOnlyadd'].entries()){
   invoke.pipeline(key);expect(created.find(d=>d.fragment?.entryPoint===eager[i].fragment?.entryPoint&&JSON.stringify(d.fragment?.targets)===JSON.stringify(eager[i].fragment?.targets))).toEqual(eager[i])
  }
  expect(created).toHaveLength(7)
 }
})
it('Room init owns only paper/noise and clear pipeline: no standalone full fields or canvas configure',()=>{
 vi.stubGlobal('GPUTextureUsage',{TEXTURE_BINDING:1,STORAGE_BINDING:2,COPY_SRC:4,COPY_DST:8,RENDER_ATTACHMENT:16})
 vi.stubGlobal('navigator',{gpu:{getPreferredCanvasFormat:()=> 'rgba8unorm'}})
 const textures:GPUTextureDescriptor[]=[],render=vi.fn(),compute=vi.fn(()=>({})),getContext=vi.fn(),stages:string[]=[]
 const device={createTexture:(d:GPUTextureDescriptor)=>{textures.push(d);return{createView:()=>({}),destroy:vi.fn()}},createShaderModule:()=>({}),createComputePipeline:compute,createRenderPipeline:render,createSampler:()=>({}),queue:{writeTexture:vi.fn()}} as unknown as GPUDevice
 const backend=Reflect.construct(CanonicalWatercolorWebGpu,[device,{roomOwnedResources:true,canvas:{getContext},width:1024,height:1024,paper:{bytes:new Uint8Array(16),width:2,height:2,origin:[0,0],texSize:[2,2],scale:1},onInitStage:(s:string)=>stages.push(s)}]) as CanonicalWatercolorWebGpu
 expect(textures.map(t=>t.size)).toEqual([[2,2],[251,251]])
 expect(render).not.toHaveBeenCalled();expect(compute).toHaveBeenCalledOnce();expect(getContext).not.toHaveBeenCalled()
 expect(()=>backend.fields).toThrow('no standalone');expect(stages.at(-1)).toBe('backend:ready')
})
