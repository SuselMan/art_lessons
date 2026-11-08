import{it,expect,vi}from'vitest'
import{RequestWashBatch}from'./RequestWashBatch'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
it('actual common kernel sets optional patch coordinates then explicitly resets legacy uniform',()=>{
 const uniform1f=vi.fn(),viewport=vi.fn(),uniform2f=vi.fn(),drawArrays=vi.fn()
 const gl={getAttribLocation:()=>0,getUniformLocation:(_p:unknown,name:string)=>name,viewport,uniform1f,uniform2f,drawArrays,bindBuffer(){},useProgram(){},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(){},activeTexture(){},bindTexture(){},uniform1i(){},uniform4f(){},ARRAY_BUFFER:1,FLOAT:2,TEXTURE0:100,TEXTURE1:101,TEXTURE_2D:3,TRIANGLES:4}as unknown as WebGLRenderingContext
 const kernel=new RequestWashBatch(gl);Reflect.set(kernel,'program',{});Reflect.set(kernel,'buffer',{})
 const buffer=(width:number,height:number)=>({width,height,texture:{},beginReplaceDraw:vi.fn(),endDraw:vi.fn()})as unknown as AccumulationBuffer
 const source=buffer(512,512),previous=buffer(512,512),target=buffer(1024,768),region={x:512,y:256,width:128,height:64}
 kernel.transfer(source,previous,target,region,1,1,undefined,true)
 expect(viewport).toHaveBeenLastCalledWith(512,448,128,64)
 expect(uniform1f).toHaveBeenCalledWith('u_previousRegion',1)
 expect(uniform2f).toHaveBeenCalledWith('u_extent',128,64)
 kernel.transfer(source,buffer(1024,768),target,region,1,1)
 expect(uniform1f.mock.calls.filter(c=>c[0]==='u_previousRegion')).toEqual([['u_previousRegion',1],['u_previousRegion',0]])
 expect(drawArrays).toHaveBeenCalledTimes(2)
 const before=target.beginReplaceDraw as ReturnType<typeof vi.fn>;before.mockClear()
 expect(()=>kernel.transfer(source,buffer(128,512),target,region,1,1,undefined,true)).toThrow('dimensions')
 expect(before).not.toHaveBeenCalled()
})
