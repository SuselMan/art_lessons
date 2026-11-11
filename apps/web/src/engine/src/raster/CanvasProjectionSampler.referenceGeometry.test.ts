import{it,expect,vi}from'vitest'
import{CanvasProjectionSampler}from'./CanvasProjectionSampler'
import{createProgram}from'./utils'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{PaintTarget}from'../buffers/ILayerBuffer'
vi.mock('./utils',()=>({createProgram:vi.fn(()=>({})),getUniforms:(_gl:unknown,_p:unknown,names:string[])=>Object.fromEntries(names.map(n=>[n,n]))}))
function setup(){
 const gl={ARRAY_BUFFER:34962,FLOAT:5126,TRIANGLES:4,TEXTURE0:33984,TEXTURE_2D:3553,getAttribLocation:vi.fn(()=>0),viewport:vi.fn(),useProgram:vi.fn(),activeTexture:vi.fn(),bindTexture:vi.fn(),uniform1i:vi.fn(),uniform1f:vi.fn(),uniform4f:vi.fn(),bindBuffer:vi.fn(),enableVertexAttribArray:vi.fn(),vertexAttribPointer:vi.fn(),drawArrays:vi.fn(),deleteProgram:vi.fn()}
 const sampler=new CanvasProjectionSampler(gl as unknown as WebGLRenderingContext,()=>({})as WebGLBuffer),patch={width:32,height:32,clear:vi.fn(),beginDraw:vi.fn(),endDraw:vi.fn()}as unknown as AccumulationBuffer
 return{gl,sampler,patch}
}
function target(x:number,y:number,w:number,h:number,source?:PaintTarget['projectionSourceRect']):PaintTarget{return{buffer:{width:w,height:h,texture:{},setPointSampling:vi.fn()}as unknown as AccumulationBuffer,originX:x,originY:y,contentRect:{minX:x,minY:y,maxX:x+w,maxY:y+h},...(source?{projectionSourceRect:Object.freeze({...source})}:{})}}
const rect={minX:.5,minY:.5,maxX:47.5,maxY:47.5}
it('default full target retains old geometry, zero optional mode and a single prepared program',()=>{
 const f=setup(),before=vi.mocked(createProgram).mock.calls.length,t=target(0,0,512,512)
 f.sampler.prepare();f.sampler.prepare();f.sampler.gather(f.patch,rect,[{opacity:.75,buffer:{resolveVisible:()=>[t]}}])
 expect(vi.mocked(createProgram).mock.calls.length-before).toBe(1);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_tileRect',-.5,-.5,512,512);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_sourceCrop',0,0,0,0);expect(f.gl.viewport).toHaveBeenCalledWith(0,0,32,32);expect(f.gl.uniform1f).toHaveBeenCalledWith('u_opacity',.75);expect(t.buffer.setPointSampling).toHaveBeenNthCalledWith(1,true);expect(t.buffer.setPointSampling).toHaveBeenNthCalledWith(2,false);f.sampler.destroy()
})
it('cropped7x5 target uses ORIGINAL512 viewport/normalization and lower-left crop offset for half-pixel request',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:512,maxY:512});f.sampler.gather(f.patch,rect,[{opacity:.5,buffer:{resolveVisible:()=>[t]}}]);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_tileRect',-.5,-.5,512,512);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_sourceCrop',2,504,7,5);expect(f.gl.viewport).toHaveBeenCalledWith(0,0,32,32);expect(f.gl.drawArrays).toHaveBeenCalledOnce();f.sampler.destroy()
})
it('original NPOT800x600 metadata preserves negative million origin and Yflip independent of crop dimensions',()=>{
 const f=setup(),ox=-1048576,oy=-2048,t=target(ox+23,oy+41,7,5,{minX:ox,minY:oy,maxX:ox+800,maxY:oy+600}),query={minX:ox+.5,minY:oy+.5,maxX:ox+47.5,maxY:oy+47.5};f.sampler.gather(f.patch,query,[{opacity:1,buffer:{resolveVisible:()=>[t]}}]);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_tileRect',-.5,-.5,800,600);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_sourceCrop',23,554,7,5);expect(f.gl.viewport).toHaveBeenCalledWith(0,0,32,32);f.sampler.destroy()
})
it('each following full tile resets crop mode and preserves layer order/opacity',()=>{
 const f=setup(),first=target(2,3,7,5,{minX:0,minY:0,maxX:512,maxY:512}),second=target(10,10,8,8);f.sampler.gather(f.patch,rect,[{opacity:.25,buffer:{resolveVisible:()=>[first]}},{opacity:.75,buffer:{resolveVisible:()=>[second]}}]);expect(f.gl.uniform4f.mock.calls.filter(x=>x[0]==='u_sourceCrop')).toEqual([['u_sourceCrop',2,504,7,5],['u_sourceCrop',0,0,0,0]]);expect(f.gl.uniform1f.mock.calls).toEqual([['u_opacity',.25],['u_opacity',.75]]);expect(f.gl.drawArrays).toHaveBeenCalledTimes(2);f.sampler.destroy()
})
it('null content stays empty and metadata never substitutes unknown/full content',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:512,maxY:512});t.contentRect=null;f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}]);expect(f.gl.drawArrays).not.toHaveBeenCalled();f.sampler.destroy()
})
it('invalid internal original geometry fails before draw and closes the patch pass',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:3,minY:0,maxX:512,maxY:512});expect(()=>f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}])).toThrow('source geometry');expect(f.gl.drawArrays).not.toHaveBeenCalled();expect(f.patch.endDraw).toHaveBeenCalledOnce();f.sampler.destroy()
})
it('resolver state changes are followed by complete patch rebind; draw error still resets point sampling and closes pass',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:512,maxY:512}),events:string[]=[];vi.mocked(f.patch.beginDraw).mockImplementation(()=>{events.push('patch')});f.gl.drawArrays.mockImplementation(()=>{events.push('draw');throw Error('draw')});expect(()=>f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>{events.push('resolve');return[t]}}}])).toThrow('draw');expect(events).toEqual(['patch','resolve','patch','draw']);expect(t.buffer.setPointSampling).toHaveBeenLastCalledWith(false);expect(f.patch.endDraw).toHaveBeenCalledOnce();f.sampler.destroy()
})
