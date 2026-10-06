import { afterEach, expect, it, vi } from 'vitest'
import type { PencilEngine } from './index'
import { createTestEngine, paperReady } from './testing/engineTestUtils'
const engines:PencilEngine[]=[]
afterEach(()=>{for(const e of engines.splice(0))e.destroy();vi.restoreAllMocks()})
async function setup(preserved:boolean|null,enabled=true){
  const {engine:e}=createTestEngine({}, {width:64,height:64});engines.push(e);await paperReady(e)
  e['_diagnosticBlitScissor']=enabled
  const gl=e['gl'];Object.defineProperty(gl,'getContextAttributes',{configurable:true,value:()=>preserved===null?null:{preserveDrawingBuffer:preserved}})
  const rect:[number,number,number,number]=[2,3,20,24]
  vi.spyOn(e as unknown as {_damageScreenRect(...args:unknown[]):typeof rect},'_damageScreenRect').mockReturnValue(rect)
  let framebuffer:WebGLFramebuffer|null=null,scissor=false,box:number[]=[]
  const draws:Array<{framebuffer:WebGLFramebuffer|null;scissor:boolean;box:number[]}>=[]
  const bind=gl.bindFramebuffer.bind(gl),enable=gl.enable.bind(gl),disable=gl.disable.bind(gl),clip=gl.scissor.bind(gl),draw=gl.drawArrays.bind(gl)
  vi.spyOn(gl,'bindFramebuffer').mockImplementation((target,fbo)=>{framebuffer=fbo;bind(target,fbo)})
  vi.spyOn(gl,'enable').mockImplementation(cap=>{if(cap===gl.SCISSOR_TEST)scissor=true;enable(cap)})
  vi.spyOn(gl,'disable').mockImplementation(cap=>{if(cap===gl.SCISSOR_TEST)scissor=false;disable(cap)})
  vi.spyOn(gl,'scissor').mockImplementation((...args)=>{box=args;clip(...args)})
  vi.spyOn(gl,'drawArrays').mockImplementation((...args)=>{draws.push({framebuffer,scissor,box:[...box]});draw(...args)})
  return{e,gl,rect,draws,scissorEnabled:()=>scissor}
}
it('clips the actual default-framebuffer draw to the same partial cache rectangle and leaves scissor disabled',async()=>{
  const{e,rect,draws,scissorEnabled}=await setup(true)
  e['_composePaperToScreen']({minX:0,minY:0,maxX:64,maxY:64})
  const defaultDraws=draws.filter(x=>x.framebuffer===null)
  expect(defaultDraws).toHaveLength(1);expect(defaultDraws[0]).toMatchObject({scissor:true,box:rect})
  expect(draws.some(x=>x.framebuffer!==null&&x.scissor&&JSON.stringify(x.box)===JSON.stringify(rect))).toBe(true)
  expect(scissorEnabled()).toBe(false)
})
it.each([false,null])('copies the entire canvas when drawing-buffer preservation is %s',async preserved=>{
  const{e,draws}=await setup(preserved)
  e['_composePaperToScreen']({minX:0,minY:0,maxX:64,maxY:64})
  expect(draws.filter(x=>x.framebuffer===null)).toEqual([expect.objectContaining({scissor:false})])
})
it('full invalidation stays a full default-framebuffer draw even when the diagnostic is enabled',async()=>{
  const{e,draws}=await setup(true)
  e['_composePaperToScreen'](null)
  expect(draws.filter(x=>x.framebuffer===null)).toEqual([expect.objectContaining({scissor:false})])
})
it('default OFF preserves full copy behavior for partial cache changes',async()=>{
  const{e,draws}=await setup(true,false)
  e['_composePaperToScreen']({minX:0,minY:0,maxX:64,maxY:64})
  expect(draws.filter(x=>x.framebuffer===null)).toEqual([expect.objectContaining({scissor:false})])
})
