import{it,expect,vi}from'vitest'
import{MockGL}from'../../testing/mockGL'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{SprayImageBatch,type SprayImageParticle}from'./SprayImageBatch'
import type{PreparedBrushImageView}from'./PreparedBrushImageView'
function fixture(){const gl=new MockGL()as unknown as WebGLRenderingContext,target=new AccumulationBuffer(gl,100,80),batch=new SprayImageBatch(gl),assertCurrent=vi.fn(),view:PreparedBrushImageView={texture:gl.createTexture()!,width:64,height:32,crop:{x:8,y:4,width:16,height:12},assertCurrent},particle:SprayImageParticle={x:30,y:20,width:16,height:12,angle:0,opacity:.5,hsv:[.2,-.1,.3]};return{gl,target,batch,view,particle,assertCurrent}}
it('uploads bounded ordered image triangles, exact crop orientation and image-only shader without tint',()=>{
 const f=fixture(),draw=vi.spyOn(f.gl,'drawArrays'),upload=vi.spyOn(f.gl,'bufferData'),shader=vi.spyOn(f.gl,'shaderSource'),disable=vi.spyOn(f.gl,'disableVertexAttribArray')
 try{f.batch.paint(Array.from({length:520},()=>f.particle),f.view,f.target,10,5)
 expect(draw.mock.calls.map(c=>c[2])).toEqual([512*6,8*6]);const first=upload.mock.calls.find(c=>c[1] instanceof Float32Array)?.[1];if(!(first instanceof Float32Array))throw Error('Expected actual vertex upload')
 expect(Array.from(first.slice(0,8))).toEqual([12,9,8/64,4/32,Math.fround(.2),Math.fround(-.1),Math.fround(.3),.5]);expect(disable).toHaveBeenCalledTimes(4)
 const fragment=shader.mock.calls.map(([,s])=>s).find(s=>s.includes('gl_FragColor=c*v_opacity'));expect(fragment).toContain('c.rgb=adjustHsv(straight,v_hsv)*c.a');expect(fragment).not.toContain('u_color');expect(f.assertCurrent).toHaveBeenCalledTimes(2)
 }finally{f.batch.destroy();f.target.destroy();f.gl.deleteTexture(f.view.texture)}
})
it('rejects invalid crops, feedback and excessive work before target acquisition',()=>{
 const f=fixture(),begin=vi.spyOn(f.target,'beginDraw')
 try{expect(()=>f.batch.paint([f.particle],{...f.view,crop:{x:60,y:0,width:8,height:1}},f.target,0,0)).toThrow('view');expect(()=>f.batch.paint([f.particle],{...f.view,texture:f.target.texture},f.target,0,0)).toThrow('view');expect(()=>f.batch.paint(Array.from({length:4097},()=>f.particle),f.view,f.target,0,0)).toThrow('work');expect(begin).not.toHaveBeenCalled()}
 finally{f.batch.destroy();f.target.destroy();f.gl.deleteTexture(f.view.texture)}
})
it('honours stale ownership before drawing and releases attributes/target when a draw throws undefined',()=>{
 const f=fixture(),end=vi.spyOn(f.target,'endDraw'),disable=vi.spyOn(f.gl,'disableVertexAttribArray')
 try{f.assertCurrent.mockImplementationOnce(()=>{throw Error('retired asset')});expect(()=>f.batch.paint([f.particle],f.view,f.target,0,0)).toThrow('retired asset');expect(end).not.toHaveBeenCalled()
 const draw=vi.spyOn(f.gl,'drawArrays').mockImplementation(()=>{throw undefined});let caught=false;try{f.batch.paint([f.particle],f.view,f.target,0,0)}catch(error){caught=true;expect(error).toBeUndefined()}expect(caught).toBe(true);expect(end).toHaveBeenCalledTimes(1);expect(disable).toHaveBeenCalledTimes(4);draw.mockRestore()
 }finally{f.batch.destroy();f.target.destroy();f.gl.deleteTexture(f.view.texture)}
})
