import {expect,it,vi} from 'vitest'
import {WatercolorPasses,type WatercolorPassesContext} from './WatercolorPasses'
import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {MockGL} from '../../testing/mockGL'
function fixture(){
 const gl=new MockGL() as unknown as WebGLRenderingContext
 const passes=new WatercolorPasses({gl:()=>gl,screenBuf:()=>gl.createBuffer()!} as WatercolorPassesContext)
 const init=()=>{passes.initFieldPrograms();passes.initFieldUniforms();passes.initFieldAttributes()};init()
 const src=new AccumulationBuffer(gl,2,2),out=new AccumulationBuffer(gl,2,2)
 const create=vi.spyOn(gl,'createProgram'),remove=vi.spyOn(gl,'deleteProgram')
 const draw=(discreteGrid=false,mode:6|10=6)=>passes.fieldOp(out,src,src,mode,0,{discreteGrid,dir:[1,1]})
 return {gl,passes,src,out,create,remove,draw,init,destroy(){out.destroy();src.destroy();passes.destroy()}}
}
it('only M70 mode6 lazily creates/reuses the independent program, leaving legacy linked sources untouched',()=>{
 const f=fixture();try{
 f.draw();const legacy=f.gl.getParameter(f.gl.CURRENT_PROGRAM);f.draw(true,10);expect(f.create).not.toHaveBeenCalled()
 f.draw(true);const m70=f.gl.getParameter(f.gl.CURRENT_PROGRAM);expect(m70).not.toBe(legacy);expect(f.create).toHaveBeenCalledTimes(1)
 f.draw(true);expect(f.create).toHaveBeenCalledTimes(1)
 f.draw();expect(f.gl.getParameter(f.gl.CURRENT_PROGRAM)).toBe(legacy)
 f.passes.destroy();expect(f.remove.mock.calls.filter(([p])=>p===m70)).toHaveLength(1)
 }finally{f.destroy()}
})
it('forgets a stale context program without deleting it and recreates only upon the next M70 draw',()=>{
 const f=fixture();try{
 f.draw(true);const stale=f.gl.getParameter(f.gl.CURRENT_PROGRAM)
 Object.defineProperty(f.gl,'isProgram',{configurable:true,value:(p:WebGLProgram)=>p!==stale})
 f.init();expect(f.remove.mock.calls.some(([p])=>p===stale)).toBe(false)
 f.draw();const count=f.create.mock.calls.length;f.draw(true)
 expect(f.create.mock.calls.length).toBe(count+1);expect(f.gl.getParameter(f.gl.CURRENT_PROGRAM)).not.toBe(stale)
 }finally{f.destroy()}
})
it('closes draw, restores filters, and releases a partially initialized lazy program before retry',()=>{
 const f=fixture();try{
 const get=vi.spyOn(f.gl,'getUniformLocation').mockImplementationOnce(()=>{throw Error('uniform setup')})
 const end=vi.spyOn(f.out,'endDraw')
 expect(()=>f.draw(true)).toThrow('uniform setup')
 const partial=f.create.mock.results[0].value
 expect(f.remove.mock.calls.filter(([p])=>p===partial)).toHaveLength(1);expect(end).toHaveBeenCalledTimes(1);expect(f.src.pointSampling).toBe(false)
 get.mockRestore();f.draw(true)
 expect(f.create).toHaveBeenCalledTimes(2);expect(f.gl.getParameter(f.gl.CURRENT_PROGRAM)).not.toBe(partial)
 }finally{f.destroy()}
})
