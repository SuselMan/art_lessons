import{it,expect,vi}from'vitest'
import{CanvasProjectionSampler}from'./CanvasProjectionSampler'
import{createProgram}from'./utils'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{PaintTarget}from'../buffers/ILayerBuffer'
vi.mock('./utils',()=>({createProgram:vi.fn(()=>({})),getUniforms:(_gl:unknown,_p:unknown,names:string[])=>Object.fromEntries(names.map(n=>[n,n]))}))
function setup(){
 const gl={ARRAY_BUFFER:34962,FLOAT:5126,TRIANGLES:4,TEXTURE0:33984,TEXTURE_2D:3553,TEXTURE_BINDING_2D:32873,getParameter:vi.fn((_pname:number)=>null as WebGLTexture|null),RGBA:6408,UNSIGNED_BYTE:5121,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,NEAREST:9728,CLAMP_TO_EDGE:33071,createTexture:vi.fn(()=>({})),texImage2D:vi.fn(),texParameteri:vi.fn(),deleteTexture:vi.fn(),getAttribLocation:vi.fn(()=>0),viewport:vi.fn(),useProgram:vi.fn(),activeTexture:vi.fn(),bindTexture:vi.fn(),uniform1i:vi.fn(),uniform1f:vi.fn(),uniform4f:vi.fn(),bindBuffer:vi.fn(),enableVertexAttribArray:vi.fn(),vertexAttribPointer:vi.fn(),drawArrays:vi.fn(),deleteProgram:vi.fn()}
 const sampler=new CanvasProjectionSampler(gl as unknown as WebGLRenderingContext,()=>({})as WebGLBuffer),patch={width:32,height:32,clear:vi.fn(),beginDraw:vi.fn(),endDraw:vi.fn()}as unknown as AccumulationBuffer
 return{gl,sampler,patch}
}
function target(x:number,y:number,w:number,h:number,source?:PaintTarget['projectionSourceRect']):PaintTarget{return{buffer:{width:w,height:h,texture:{},setPointSampling:vi.fn()}as unknown as AccumulationBuffer,originX:x,originY:y,contentRect:{minX:x,minY:y,maxX:x+w,maxY:y+h},...(source?{projectionSourceRect:Object.freeze({...source})}:{})}}
const rect={minX:.5,minY:.5,maxX:47.5,maxY:47.5}
it('default full target retains old geometry, zero optional mode and a single prepared program',()=>{
 const f=setup(),before=vi.mocked(createProgram).mock.calls.length,t=target(0,0,512,512)
 f.sampler.prepare();f.sampler.prepare();f.sampler.gather(f.patch,rect,[{opacity:.75,buffer:{resolveVisible:()=>[t]}}])
 expect(vi.mocked(createProgram).mock.calls.length-before).toBe(1);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_tileRect',-.5,-.5,512,512);expect(f.gl.uniform4f).toHaveBeenCalledWith('u_sourceCrop',0,0,0,0);expect(f.gl.viewport).toHaveBeenCalledWith(0,0,32,32);expect(f.gl.uniform1i).toHaveBeenCalledWith('u_addressX',0);expect(f.gl.uniform1i).toHaveBeenCalledWith('u_addressY',0);expect(f.gl.createTexture).not.toHaveBeenCalled();expect(f.gl.getParameter).not.toHaveBeenCalled();expect(f.gl.uniform1f).toHaveBeenCalledWith('u_opacity',.75);expect(t.buffer.setPointSampling).toHaveBeenNthCalledWith(1,true);expect(t.buffer.setPointSampling).toHaveBeenNthCalledWith(2,false);f.sampler.destroy()
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

it('uploads separate original X800x1 and Y1x600 exact RG8 indices, NEAREST/CLAMP and restores active0 before source filters',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600});let unit=0;f.gl.activeTexture.mockImplementation(u=>{unit=u});vi.mocked(t.buffer.setPointSampling).mockImplementation(()=>{expect(unit).toBe(f.gl.TEXTURE0)})
 f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}]);const calls=f.gl.texImage2D.mock.calls as unknown as Array<[number,number,number,number,number,number,number,number,Uint8Array]>
 expect(calls.map(a=>[a[3],a[4]])).toEqual([[800,1],[1,600]])
 for(const [axis,count]of[[0,800],[1,600]])for(const i of[0,1,255,256,count-1])expect(Array.from(calls[axis][8].slice(i*4,i*4+4))).toEqual([i%256,Math.floor(i/256),0,255])
 expect(f.gl.texParameteri.mock.calls.filter(c=>c[1]===f.gl.TEXTURE_MIN_FILTER||c[1]===f.gl.TEXTURE_MAG_FILTER)).toEqual(Array.from({length:2},()=>[[f.gl.TEXTURE_2D,f.gl.TEXTURE_MIN_FILTER,f.gl.NEAREST],[f.gl.TEXTURE_2D,f.gl.TEXTURE_MAG_FILTER,f.gl.NEAREST]]).flat())
 expect(f.gl.texParameteri.mock.calls.filter(c=>c[1]===f.gl.TEXTURE_WRAP_S||c[1]===f.gl.TEXTURE_WRAP_T)).toEqual(Array.from({length:2},()=>[[f.gl.TEXTURE_2D,f.gl.TEXTURE_WRAP_S,f.gl.CLAMP_TO_EDGE],[f.gl.TEXTURE_2D,f.gl.TEXTURE_WRAP_T,f.gl.CLAMP_TO_EDGE]]).flat())
 expect(f.gl.uniform1i).toHaveBeenCalledWith('u_addressX',1);expect(f.gl.uniform1i).toHaveBeenCalledWith('u_addressY',2);expect(unit).toBe(f.gl.TEXTURE0);f.sampler.destroy()
})
it('keeps only two dimension pairs, reuses hits and evicts the least recent pair independently',()=>{
 const f=setup(),draw=(w:number,h:number)=>f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[target(2,3,7,5,{minX:0,minY:0,maxX:w,maxY:h})]}}])
 draw(512,512);draw(800,600);draw(512,512);expect(f.gl.texImage2D).toHaveBeenCalledTimes(4);draw(1024,768);expect(f.gl.deleteTexture).toHaveBeenCalledTimes(2);draw(800,600);expect(f.gl.texImage2D).toHaveBeenCalledTimes(8);expect(f.gl.deleteTexture).toHaveBeenCalledTimes(4);f.sampler.destroy();expect(f.gl.deleteTexture).toHaveBeenCalledTimes(8)
})
it('partial second texture upload failure preserves undefined and cleans BOTH allocations despite cleanup errors',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600});let calls=0;f.gl.texImage2D.mockImplementation(()=>{if(calls++)throw undefined});f.gl.deleteTexture.mockImplementation(()=>{throw Error('cleanup')});let failed=false,value:unknown=1
 try{f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}])}catch(e){failed=true;value=e}
 expect(failed).toBe(true);expect(value).toBeUndefined();expect(f.gl.createTexture).toHaveBeenCalledTimes(2);expect(f.gl.deleteTexture).toHaveBeenCalledTimes(2);expect(f.gl.drawArrays).not.toHaveBeenCalled();expect(f.patch.endDraw).toHaveBeenCalledOnce();f.gl.deleteTexture.mockImplementation(()=>{});f.sampler.destroy();expect(f.gl.deleteTexture).toHaveBeenCalledTimes(2)
})
it('destroy retires program and both LUTs independently, preserves first undefined and is idempotent',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:512,maxY:512});f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}]);f.gl.deleteProgram.mockImplementation(()=>{throw undefined});f.gl.deleteTexture.mockImplementation(()=>{throw Error('texturecleanup')});let failed=false,value:unknown=1;try{f.sampler.destroy()}catch(e){failed=true;value=e}expect(failed).toBe(true);expect(value).toBeUndefined();expect(f.gl.deleteTexture).toHaveBeenCalledTimes(2);f.sampler.destroy();expect(f.gl.deleteTexture).toHaveBeenCalledTimes(2);expect(f.gl.deleteProgram).toHaveBeenCalledOnce()
})
it('forget clears only lost-context handles; a subsequent prepare/gather creates fresh addresses',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600}),before=vi.mocked(createProgram).mock.calls.length;f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}]);f.sampler.forget();expect(f.gl.deleteTexture).not.toHaveBeenCalled();expect(f.gl.deleteProgram).not.toHaveBeenCalled();f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}]);expect(f.gl.createTexture).toHaveBeenCalledTimes(4);expect(vi.mocked(createProgram).mock.calls.length-before).toBe(2);f.sampler.destroy();expect(f.gl.deleteTexture).toHaveBeenCalledTimes(2)
})
it('rejects unencodable internal dimensions before allocating addresses or drawing',()=>{
 const f=setup(),t=target(2,3,7,5,{minX:0,minY:0,maxX:65537,maxY:600});expect(()=>f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}])).toThrow('address dimensions');expect(f.gl.createTexture).not.toHaveBeenCalled();expect(f.gl.drawArrays).not.toHaveBeenCalled();f.sampler.destroy()
})

function foreignState(f:ReturnType<typeof setup>){
 const x={}as WebGLTexture,y={}as WebGLTexture,bindings=new Map<number,WebGLTexture|null>([[f.gl.TEXTURE0+1,x],[f.gl.TEXTURE0+2,y]]);let active=f.gl.TEXTURE0
 f.gl.activeTexture.mockImplementation(u=>{active=u});f.gl.bindTexture.mockImplementation((_target,texture)=>{bindings.set(active,texture)});f.gl.getParameter.mockImplementation(()=>bindings.get(active)??null)
 return{x,y,bindings,active:()=>active}
}
it('captures foreign unit1/2 bindings only once per gather and independently restores them after multiple cropped layers',()=>{
 const f=setup(),state=foreignState(f),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600});f.sampler.gather(f.patch,rect,[{opacity:.5,buffer:{resolveVisible:()=>[t]}},{opacity:1,buffer:{resolveVisible:()=>[t]}}]);expect(f.gl.getParameter).toHaveBeenCalledTimes(2);expect(f.gl.getParameter.mock.calls.every(c=>c[0]===f.gl.TEXTURE_BINDING_2D)).toBe(true);expect(state.bindings.get(f.gl.TEXTURE0+1)).toBe(state.x);expect(state.bindings.get(f.gl.TEXTURE0+2)).toBe(state.y);expect(state.active()).toBe(f.gl.TEXTURE0);f.sampler.destroy()
})
it('upload throwing undefined still restores foreign address units, closes pass and preserves primary',()=>{
 const f=setup(),state=foreignState(f),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600});f.gl.texImage2D.mockImplementation(()=>{throw undefined});let failed=false,value:unknown=1;try{f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}])}catch(e){failed=true;value=e}expect(failed).toBe(true);expect(value).toBeUndefined();expect(state.bindings.get(f.gl.TEXTURE0+1)).toBe(state.x);expect(state.bindings.get(f.gl.TEXTURE0+2)).toBe(state.y);expect(state.active()).toBe(f.gl.TEXTURE0);expect(f.patch.endDraw).toHaveBeenCalledOnce();expect(f.gl.deleteTexture).toHaveBeenCalledOnce();f.sampler.destroy()
})
it('draw throwing undefined remains primary even if restoring unit1 throws; unit2/active0/pass cleanup still run',()=>{
 const f=setup(),state=foreignState(f),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600});f.gl.bindTexture.mockImplementation((_target,texture)=>{state.bindings.set(state.active(),texture);if(texture===state.x)throw Error('restore1')});f.gl.drawArrays.mockImplementation(()=>{throw undefined});let failed=false,value:unknown=1;try{f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}])}catch(e){failed=true;value=e}expect(failed).toBe(true);expect(value).toBeUndefined();expect(state.bindings.get(f.gl.TEXTURE0+2)).toBe(state.y);expect(state.active()).toBe(f.gl.TEXTURE0);expect(f.patch.endDraw).toHaveBeenCalledOnce();expect(t.buffer.setPointSampling).toHaveBeenLastCalledWith(false);f.sampler.destroy()
})

it('same-sampler reentrancy with three nested dimension pairs never saves or restores an evicted LUT as foreign',()=>{
 const f=setup(),state=foreignState(f),deleted=new Set<WebGLTexture>(),retiredBindings:WebGLTexture[]=[],resolverForeign:boolean[]=[]
 f.gl.deleteTexture.mockImplementation(t=>{deleted.add(t)})
 f.gl.bindTexture.mockImplementation((_target,texture)=>{if(texture&&deleted.has(texture)){retiredBindings.push(texture);throw Error('binding retired address')}state.bindings.set(state.active(),texture)})
 const first=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600}),nestedPatch={width:32,height:32,clear:vi.fn(),beginDraw:vi.fn(),endDraw:vi.fn()}as unknown as AccumulationBuffer
 f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[first]}},{opacity:.5,buffer:{resolveVisible:()=>{
  resolverForeign.push(state.bindings.get(f.gl.TEXTURE0+1)===state.x&&state.bindings.get(f.gl.TEXTURE0+2)===state.y)
  f.sampler.gather(nestedPatch,rect,[[512,512],[1024,768],[2048,1024]].map(([w,h])=>({opacity:1,buffer:{resolveVisible:()=>[target(2,3,7,5,{minX:0,minY:0,maxX:w,maxY:h})]}})))
  return[first]
 }}}])
 expect(resolverForeign).toEqual([true]);expect(retiredBindings).toEqual([]);expect(f.gl.getParameter).toHaveBeenCalledTimes(4);expect(f.gl.texImage2D).toHaveBeenCalledTimes(10);expect(f.gl.deleteTexture).toHaveBeenCalledTimes(6);expect(f.gl.drawArrays).toHaveBeenCalledTimes(5);expect(state.bindings.get(f.gl.TEXTURE0+1)).toBe(state.x);expect(state.bindings.get(f.gl.TEXTURE0+2)).toBe(state.y);expect(state.active()).toBe(f.gl.TEXTURE0);expect(nestedPatch.endDraw).toHaveBeenCalledOnce();f.sampler.destroy();expect(f.gl.deleteTexture).toHaveBeenCalledTimes(10)
})
it('inner draw primary undefined survives point-mode cleanup failure while both foreign units and pass still retire',()=>{
 const f=setup(),state=foreignState(f),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600});vi.mocked(t.buffer.setPointSampling).mockImplementation(enabled=>{if(!enabled)throw Error('pointcleanup')});f.gl.drawArrays.mockImplementation(()=>{throw undefined});let failed=false,value:unknown=1
 try{f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}])}catch(e){failed=true;value=e}
 expect(failed).toBe(true);expect(value).toBeUndefined();expect(state.bindings.get(f.gl.TEXTURE0+1)).toBe(state.x);expect(state.bindings.get(f.gl.TEXTURE0+2)).toBe(state.y);expect(state.active()).toBe(f.gl.TEXTURE0);expect(f.patch.endDraw).toHaveBeenCalledOnce();f.sampler.destroy()
})
it('point-mode setup undefined also preserves primary, attempts false cleanup and restores address units without drawing',()=>{
 const f=setup(),state=foreignState(f),t=target(2,3,7,5,{minX:0,minY:0,maxX:800,maxY:600});vi.mocked(t.buffer.setPointSampling).mockImplementation(enabled=>{if(enabled)throw undefined;throw Error('falsecleanup')});let failed=false,value:unknown=1
 try{f.sampler.gather(f.patch,rect,[{opacity:1,buffer:{resolveVisible:()=>[t]}}])}catch(e){failed=true;value=e}
 expect(failed).toBe(true);expect(value).toBeUndefined();expect(t.buffer.setPointSampling).toHaveBeenLastCalledWith(false);expect(f.gl.drawArrays).not.toHaveBeenCalled();expect(state.bindings.get(f.gl.TEXTURE0+1)).toBe(state.x);expect(state.bindings.get(f.gl.TEXTURE0+2)).toBe(state.y);expect(state.active()).toBe(f.gl.TEXTURE0);expect(f.patch.endDraw).toHaveBeenCalledOnce();f.sampler.destroy()
})
