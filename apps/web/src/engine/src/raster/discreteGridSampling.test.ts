import {expect,it,vi} from 'vitest'
import {withDiscreteGrid} from './discreteGridSampling'
import {WatercolorPasses,type WatercolorPassesContext} from './WatercolorPasses'
import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {MockGL} from '../../testing/mockGL'
function fixture(){
 const gl=new MockGL() as unknown as WebGLRenderingContext
 const passes=new WatercolorPasses({gl:()=>gl,screenBuf:()=>gl.createBuffer()!,paperTex:()=>null,paperWorldSize:()=>({w:32,h:32}),paperScale:()=>1,stamps:()=>({bindNoise(){}})} as unknown as WatercolorPassesContext)
 passes.initFieldPrograms();passes.initSettlePrograms();passes.initFieldUniforms();passes.initFieldAttributes();passes.initDiffusionAttributes()
 const src=new AccumulationBuffer(gl,4,4),dst=new AccumulationBuffer(gl,4,4),gate=new AccumulationBuffer(gl,4,4)
 return {gl,passes,src,dst,gate,field:{w:4,h:4,coverage:gate},destroy(){src.destroy();dst.destroy();gate.destroy();passes.destroy()}}
}
it('deduplicates aliases, preserves preexisting point state and unwinds nested scopes on throw',()=>{
 const f=fixture();try{
 const set=vi.spyOn(f.src,'setPointSampling');f.gate.setPointSampling(true)
 expect(()=>withDiscreteGrid(f.dst,[f.src,f.src,f.gate],()=>{
 expect(f.src.pointSampling).toBe(true);expect(f.gate.pointSampling).toBe(true)
 withDiscreteGrid(f.dst,[f.src],()=>{expect(f.src.pointSampling).toBe(true)})
 throw Error('draw')
 })).toThrow('draw')
 expect(set.mock.calls.map(c=>c[0])).toEqual([true,true,false])
 expect(f.src.pointSampling).toBe(false);expect(f.gate.pointSampling).toBe(true)
 }finally{f.destroy()}
})
it('validates dimensions, output feedback, scale and integer offsets before changing samplers',()=>{
 const f=fixture(),other=new AccumulationBuffer(f.gl,2,4);try{
 const set=vi.spyOn(f.src,'setPointSampling'),draw=vi.fn()
 const cases: Parameters<typeof withDiscreteGrid>[] = [[f.dst,[f.src,other],draw],[f.dst,[f.dst],draw],[f.dst,[f.src],draw,2],[f.dst,[f.src],draw,1,[.5,1]]]
 for(const args of cases){
 expect(()=>withDiscreteGrid(...args)).toThrow('M70')
 }
 expect(set).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled()
 }finally{other.destroy();f.destroy()}
})
it('restores earlier inputs when a later input hydration fails',()=>{
 const f=fixture();try{
 vi.spyOn(f.gate,'setPointSampling').mockImplementation(()=>{throw Error('budget')})
 expect(()=>withDiscreteGrid(f.dst,[f.src,f.gate],()=>{})).toThrow('budget')
 expect(f.src.pointSampling).toBe(false)
 }finally{f.destroy()}
})
it('manual mode6 flag resets on the next legacy call; legacy does not change filters',()=>{
 const f=fixture();try{
 const flag=vi.spyOn(f.gl,'uniform1f'),draw=vi.spyOn(f.gl,'drawArrays').mockImplementation(()=>{expect(f.src.pointSampling).toBe(true)})
 f.passes.fieldOp(f.dst,f.src,f.src,6,0,{c:f.gate,d:f.src,dir:[1,1],discreteGrid:true})
 expect(flag.mock.calls.some(([u,v])=>String((u as unknown as {name?:string})?.name).includes('mode6DiscreteGrid')&&v===1)).toBe(true)
 expect(f.src.pointSampling).toBe(false)
 draw.mockImplementation(()=>{expect(f.src.pointSampling).toBe(false)})
 f.passes.fieldOp(f.dst,f.src,f.src,6,0,{c:f.gate,d:f.src,dir:[1,1]})
 const values=flag.mock.calls.filter(([u])=>String((u as unknown as {name?:string})?.name).includes('mode6DiscreteGrid')).map(([,v])=>v)
 expect(values).toEqual([1,0])
 }finally{f.destroy()}
})
it.each([1,6] as const)('field mode %s closes draw and restores all aliases after draw throw',mode=>{
 const f=fixture();try{
 const end=vi.spyOn(f.dst,'endDraw')
 vi.spyOn(f.gl,'drawArrays').mockImplementation(()=>{throw Error('draw')})
 expect(()=>f.passes.fieldOp(f.dst,f.src,f.src,mode,0,{c:f.gate,d:f.src,dir:[1,1],discreteGrid:true})).toThrow('draw')
 expect(end).toHaveBeenCalledTimes(1);expect(f.src.pointSampling).toBe(false);expect(f.gate.pointSampling).toBe(false)
 }finally{f.destroy()}
})
it('front and diffuse reject non-S1 without changing sampler state; legacy accepts old signatures',()=>{
 const f=fixture();try{
 const field=f.field as Parameters<typeof f.passes.diffuseStep>[0],set=vi.spyOn(f.src,'setPointSampling')
 expect(()=>f.passes.waterFrontStep(field,0,0,1,f.src,f.dst,8,1,1,1,2,null,true)).toThrow('S1')
 expect(()=>f.passes.diffuseStep(field,0,0,2,32,32,f.src,f.dst,8,false,f.gate,f.src,null,true)).toThrow('S1')
 expect(set).not.toHaveBeenCalled()
 f.passes.waterFrontStep(field,0,0,1,f.src,f.dst,8,1,1)
 f.passes.diffuseStep(field,0,0,2,32,32,f.src,f.dst,8,false,f.gate)
 expect(set).not.toHaveBeenCalled()
 }finally{f.destroy()}
})
it.each(['front','diffuse'] as const)('%s restores filters and closes draw when texture binding throws',kind=>{
 const f=fixture();try{
 const end=vi.spyOn(f.dst,'endDraw'),field=f.field as Parameters<typeof f.passes.diffuseStep>[0]
 f.src.setPointSampling(true)
 const bind=f.gl.bindTexture.bind(f.gl);vi.spyOn(f.gl,'bindTexture').mockImplementation((target,tex)=>{if(tex===f.src.texture)throw Error('bind');bind(target,tex)})
 const call=()=>kind==='front'?f.passes.waterFrontStep(field,0,0,1,f.src,f.dst,8,1,1,1,1,null,true):f.passes.diffuseStep(field,0,0,1,32,32,f.src,f.dst,8,false,f.gate,f.src,null,true)
 expect(call).toThrow('bind');expect(end).toHaveBeenCalledTimes(1);expect(f.src.pointSampling).toBe(true);expect(f.gate.pointSampling).toBe(false)
 }finally{vi.restoreAllMocks();f.destroy()}
})
