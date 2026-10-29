import type { RasterPixelEncoding } from '@grafetto/shared'
import { expect,it,vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { LayerCompositor,type LayerCompositorContext } from './LayerCompositor'
import { exactFrame,type CameraFrame } from './cameraFrame'
function fixture(filter:'linear'|'nearest'='linear',encoding:RasterPixelEncoding='premultiplied-rgba8'){
 const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext
 const buffer=new AccumulationBuffer(gl,16,16,filter,encoding),tile={originX:0,originY:0,buffer}
 const previews={tiles:new Map(),areaLayers:new Set<string>()},materials=new Map()
 const layer={resolveVisible:vi.fn(()=>[tile]),resolveCoarse:vi.fn(()=>[] as typeof tile[]),coarseWorldSize:()=>({w:32,h:32})}
 const ctx={gl,previews:()=>previews,materialPresentations:()=>materials,layers:()=>new Map([['ink',layer]]),reveals:()=>new Map()} as unknown as LayerCompositorContext
 const compositor=new LayerCompositor(ctx),during:number[]=[]
 compositor.drawTileComposite=vi.fn(()=>{during.push(mock.getMinFilter(buffer.texture)!);})
 return {mock,buffer,tile,previews,materials,layer,compositor,during}
}
const frame=()=>exactFrame({x:0,y:0,width:16,height:16})
const fbo={} as WebGLFramebuffer
function draw(f:ReturnType<typeof fixture>,camera=frame()) {f.compositor.drawCompositeItem(camera,'ink',1,fbo,32,32)}
it('uses a scoped physical copy in all five owned-buffer branches',()=>{
 for(const branch of ['material','preview','area','coarse','fine']){
  const f=fixture();let camera=frame()
  try{
   if(branch==='material')f.materials.set('ink',{...f.tile,worldWidth:16,worldHeight:16})
   if(branch==='preview')f.previews.tiles.set('ink',[f.tile])
   if(branch==='area'){f.previews.tiles.set('ink',[]);f.previews.areaLayers.add('ink')}
   if(branch==='coarse'){f.layer.resolveCoarse.mockReturnValue([f.tile]);camera={...exactFrame({x:0,y:0,width:32,height:32}),scale:.5}}
   draw(f,camera)
   expect(f.during,branch).toEqual([f.mock.NEAREST])
   expect(f.mock.getMinFilter(f.buffer.texture),branch).toBe(f.mock.LINEAR)
  }finally{f.buffer.destroy()}
 }
})
it('restores the source base filter even when the draw throws',()=>{
 const f=fixture(),parameters=vi.spyOn(f.mock,'texParameteri')
 try{
  f.compositor.drawTileComposite=()=>{expect(f.mock.getMinFilter(f.buffer.texture)).toBe(f.mock.NEAREST);throw Error('authored draw failure')}
  expect(()=>draw(f)).toThrow('authored draw failure')
  expect(f.mock.getMinFilter(f.buffer.texture)).toBe(f.mock.LINEAR)
  expect(parameters).toHaveBeenLastCalledWith(f.mock.TEXTURE_2D,f.mock.TEXTURE_MIN_FILTER,f.mock.LINEAR)
  expect(parameters).toHaveBeenCalledWith(f.mock.TEXTURE_2D,f.mock.TEXTURE_MAG_FILTER,f.mock.LINEAR)
 }finally{f.buffer.destroy()}
})
it('restores an existing mip filter and a nearest base without inventing a linear default',()=>{
 for(const base of ['linear','nearest'] as const){
  const f=fixture(base)
  try{
   f.buffer.setMipSampling(f.buffer.ensureMipmaps())
   expect(f.mock.getMinFilter(f.buffer.texture)).toBe(f.mock.LINEAR_MIPMAP_LINEAR)
   f.compositor['drawBufferComposite'](frame(),f.buffer,0,0,16,16,1,fbo,16,16)
   expect(f.during).toEqual([f.mock.NEAREST])
   expect(f.mock.getMinFilter(f.buffer.texture)).toBe(f.mock.LINEAR_MIPMAP_LINEAR)
   f.buffer.setMipSampling(false)
   // Existing setMipSampling(false) deliberately selects LINEAR. Point restore
   // still restores the actual constructor base when asked to scope a copy.
   f.compositor['drawBufferComposite'](frame(),f.buffer,0,0,16,16,1,fbo,16,16)
   expect(f.mock.getMinFilter(f.buffer.texture)).toBe(base==='nearest'?f.mock.NEAREST:f.mock.LINEAR)
  }finally{f.buffer.destroy()}
 }
})
it('keeps linear upsampling and coarse reduction; genuine minification retains its mip chain',()=>{
 for(const branch of ['materialUpscale','coarseReduction','fineMinify']){
  const f=fixture(),point=vi.spyOn(f.buffer,'setPointSampling');let camera:CameraFrame=frame()
  try{
   if(branch==='materialUpscale')f.materials.set('ink',{...f.tile,worldWidth:32,worldHeight:32})
   if(branch==='coarseReduction'){f.layer.resolveCoarse.mockReturnValue([f.tile]);camera={...frame(),scale:.4}}
   if(branch==='fineMinify')camera={...frame(),scale:.75}
   draw(f,camera)
   expect(point,branch).not.toHaveBeenCalled()
   expect(f.during,branch).toEqual([branch==='fineMinify'?f.mock.LINEAR_MIPMAP_LINEAR:f.mock.LINEAR])
  }finally{f.buffer.destroy()}
 }
})

it('rejects raw straight storage in every owned display branch instead of silently using PM blending',()=>{
 for(const branch of ['material','preview','area','coarse','fine']){
  const f=fixture('nearest','straight-rgba8');let camera=frame()
  try{
   if(branch==='material')f.materials.set('ink',{...f.tile,worldWidth:16,worldHeight:16})
   if(branch==='preview')f.previews.tiles.set('ink',[f.tile])
   if(branch==='area'){f.previews.tiles.set('ink',[]);f.previews.areaLayers.add('ink')}
   if(branch==='coarse'){f.layer.resolveCoarse.mockReturnValue([f.tile]);camera={...frame(),scale:.5}}
   expect(()=>draw(f,camera),branch).toThrow('premultiplied presentation')
   expect(f.compositor.drawTileComposite,branch).not.toHaveBeenCalled()
   expect(f.mock.getMinFilter(f.buffer.texture),branch).toBe(f.mock.NEAREST)
  }finally{f.buffer.destroy()}
 }
})
it('rejects straight coarse inputs and outputs before changing GL state or generating mipmaps',()=>{
 const f=fixture(),gl=f.mock as unknown as WebGLRenderingContext,straight=new AccumulationBuffer(gl,16,16,'nearest','straight-rgba8')
 const binds=vi.spyOn(f.mock,'bindFramebuffer'),mips=vi.spyOn(f.mock,'generateMipmap')
 try{
  expect(()=>f.compositor.downsampleTileInto(straight,f.buffer,0,0,8,8)).toThrow('premultiplied source and destination')
  expect(()=>f.compositor.downsampleTileInto(f.buffer,straight,0,0,8,8)).toThrow('premultiplied source and destination')
  expect(binds).not.toHaveBeenCalled();expect(mips).not.toHaveBeenCalled()
 }finally{straight.destroy();f.buffer.destroy()}
})
