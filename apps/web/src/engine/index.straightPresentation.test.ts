import {afterEach,expect,it,vi} from 'vitest'
import {createTestEngine} from './testing/engineTestUtils'
import {TiledLayerBuffer} from './src/buffers/TiledLayerBuffer'
import {exactFrame} from './src/raster/cameraFrame'

// Exercise the actual engine-owned compositor context; straight admission stays
// closed. Only this private harness inserts a straight tile into the layer map.
afterEach(()=>vi.restoreAllMocks())
const box={minX:0,minY:0,maxX:8,maxY:8}
function setup(){
 const result=createTestEngine({}, {width:8,height:8}),gl=result.engine['gl'],get=gl.getParameter.bind(gl)
 // The shared legacy mock lacks the state-capsule observation methods. Supply
 // them locally; the engine, pool, passes and compositor remain real instances.
 Object.assign(gl,{VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,
  getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},
  getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 return result
}
function insert(engine:ReturnType<typeof createTestEngine>['engine'],encoding:'straight-rgba8'|'premultiplied-rgba8'='straight-rgba8'){
 const layer=new TiledLayerBuffer(engine['gl'],8,8,undefined,undefined,undefined,encoding)
 const target=layer.resolveForPaint(box)[0];layer.markContentPainted(box)
 engine['_layers'].set('test',layer)
 return {layer,buffer:target.buffer}
}
function draw(engine:ReturnType<typeof createTestEngine>['engine']){
 engine['_drawCompositeItem'](exactFrame({x:0,y:0,width:8,height:8}),'test',1,engine['_assemblyFBO'].fbo,8,8)
}
it('routes an actual engine straight layer through its same pool and current passes before the PM composite draw',()=>{
 const {engine}=setup(),source=insert(engine)
 const reserve=vi.spyOn(engine['_ribbonScratchPool'],'prepareAcquisition'),transform=vi.spyOn(engine['_passes'],'transform')
 const visible=vi.spyOn(engine['_compositor'],'drawTileComposite')
 try{
  draw(engine)
  expect(reserve).toHaveBeenCalledWith([{width:8,height:8,pixelEncoding:'premultiplied-rgba8',filter:'linear'}])
  expect(transform).toHaveBeenCalledOnce();expect(transform.mock.calls[0][0]).toBe(source.buffer)
  expect(visible).toHaveBeenCalledOnce();expect(visible.mock.calls[0][1]).not.toBe(source.buffer.texture)
  expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy()}
})
it.each(['transform','display'] as const)('preserves the exact %s failure and retires the real engine presentation borrow',phase=>{
 const {engine}=setup();insert(engine)
 const error=new Error(phase),pool=engine['_ribbonScratchPool'],close=vi.fn(),prepare=pool.prepareAcquisition.bind(pool)
 vi.spyOn(pool,'prepareAcquisition').mockImplementation(requests=>{const plan=prepare(requests);return {...plan,close:()=>{plan.close();close()}}})
 if(phase==='transform')vi.spyOn(engine['_passes'],'transform').mockImplementation(()=>{throw error})
 else vi.spyOn(engine['_compositor'],'drawTileComposite').mockImplementation(()=>{throw error})
 try{expect(()=>draw(engine)).toThrow(error);expect(pool.bytes.live).toBe(0);expect(close).toHaveBeenCalledOnce()}
 finally{engine.destroy()}
})
it('leaves the actual PM engine path on its original direct composite route',()=>{
 const {engine}=setup(),source=insert(engine,'premultiplied-rgba8')
 const reserve=vi.spyOn(engine['_ribbonScratchPool'],'prepareAcquisition'),transform=vi.spyOn(engine['_passes'],'transform'),visible=vi.spyOn(engine['_compositor'],'drawTileComposite')
 try{draw(engine);expect(reserve).not.toHaveBeenCalled();expect(transform).not.toHaveBeenCalled();expect(visible.mock.calls[0][1]).toBe(source.buffer.texture)}
 finally{engine.destroy()}
})
it('uses newly restored passes with the same engine pool after actual context restore',()=>{
 const {engine}=setup(),pool=engine['_ribbonScratchPool'],old=engine['_passes']
 const previous=vi.spyOn(old,'transform')
 try{
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  expect(engine['_passes']).not.toBe(old);expect(engine['_ribbonScratchPool']).toBe(pool)
  insert(engine);const current=vi.spyOn(engine['_passes'],'transform'),reserve=vi.spyOn(pool,'prepareAcquisition')
  draw(engine);expect(current).toHaveBeenCalledOnce();expect(previous).not.toHaveBeenCalled();expect(reserve).toHaveBeenCalledOnce();expect(pool.bytes.live).toBe(0)
 }finally{engine.destroy()}
})

it('refuses the actual straight compositor route during context loss before any pool borrow',()=>{
 const {engine}=setup();insert(engine)
 const reserve=vi.spyOn(engine['_ribbonScratchPool'],'prepareAcquisition')
 try{
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  expect(()=>draw(engine)).toThrow('Straight layer requires');expect(reserve).not.toHaveBeenCalled()
 }finally{engine.destroy()}
})
it('does not expose a stale presentation after failed actual context reinitialization',()=>{
 const {engine}=setup(),old=engine['_passes'],primary=new Error('restored framebuffer allocation failed')
 const previous=vi.spyOn(old,'transform')
 try{
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  vi.spyOn(engine['gl'],'createFramebuffer').mockImplementationOnce(()=>{throw primary})
  expect(()=>engine['_handleContextRestored']()).toThrow(primary)
  insert(engine);const reserve=vi.spyOn(engine['_ribbonScratchPool'],'prepareAcquisition')
  expect(()=>draw(engine)).toThrow('Straight layer requires');expect(reserve).not.toHaveBeenCalled();expect(previous).not.toHaveBeenCalled()
 }finally{engine.destroy()}
})
it('removes presentation access from the actual compositor when its engine is destroyed',()=>{
 const {engine}=setup(),compositor=engine['_compositor'],reserve=vi.spyOn(engine['_ribbonScratchPool'],'prepareAcquisition')
 expect(compositor['ctx'].straightPresentation).toBeDefined()
 engine.destroy()
 expect(compositor['ctx'].straightPresentation).toBeUndefined();expect(reserve).not.toHaveBeenCalled()
})
