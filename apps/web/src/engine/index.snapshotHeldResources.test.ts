import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
for(const tool of ['marker','smudge'] as const)it(`snapshot replacement during held ${tool} never binds a deleted tile framebuffer`,async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 const state=engine as unknown as {gl:WebGLRenderingContext;_flushLiveComposite():void}
 const gl=state.gl,deleted=new Set<WebGLFramebuffer>()
 const remove=gl.deleteFramebuffer.bind(gl),bind=gl.bindFramebuffer.bind(gl)
 const deletion=vi.spyOn(gl,'deleteFramebuffer').mockImplementation(fbo=>{if(fbo)deleted.add(fbo);remove(fbo)})
 const binding=vi.spyOn(gl,'bindFramebuffer').mockImplementation((target,fbo)=>{if(fbo && deleted.has(fbo))throw new Error('binding retired snapshot framebuffer');bind(target,fbo)})
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  engine.setActiveLayer('L');engine.setTool(tool);engine.setSize(6)
  simulateStrokeStart(engine,5,5);simulateStrokeMove(engine,10,5)
  const pixels=new Uint8Array(32*32*4);pixels[3]=255
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels}],1)
  expect(deleted.size).toBeGreaterThan(0)
  expect(()=>{state._flushLiveComposite();simulateStrokeMove(engine,15,8);state._flushLiveComposite();simulateStrokeEnd(engine,20,8)}).not.toThrow()
 }finally{binding.mockRestore();deletion.mockRestore();engine.destroy()}
})
