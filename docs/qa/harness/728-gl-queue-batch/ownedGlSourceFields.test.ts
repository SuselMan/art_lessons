import{expect,it,vi}from'vitest'
const state=vi.hoisted(()=>({events:[]as string[],next:0}))
vi.mock('../../../../apps/web/src/engine/src/buffers/AccumulationBuffer',()=>({AccumulationBuffer:class{
 width=1024;height=1024;texture={id:++state.next}
 constructor(_gl:unknown,_w:number,_h:number,filter:string){state.events.push('allocate:'+filter)}
 clear(){state.events.push('clear:'+this.texture.id)}
 copyTo(out:{texture:{id:number}}){state.events.push('copy:'+this.texture.id+'>'+out.texture.id)}
 destroy(){state.events.push('destroy:'+this.texture.id)}
}}))
import{createOwnedGlSourceFields,retireGlSourceFieldsAfterFence,type OwnedGlRole}from'./OwnedGlSourceFields'
import type{AccumulationBuffer}from'../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
const empty=()=>Object.fromEntries(['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm'].map(role=>[role,null]))as Record<OwnedGlRole,AccumulationBuffer|null>
it('owns all thirteen physical fields and fences idempotent retirement',()=>{
 state.events=[];const finish=vi.fn(()=>state.events.push('fence'));const gl={isContextLost:()=>false,finish}as unknown as WebGLRenderingContext
 const owner=createOwnedGlSourceFields(gl,empty(),fields=>retireGlSourceFieldsAfterFence(gl,fields))
 expect(owner.bytes).toBe(52*1024*1024);expect(new Set(owner.resources.map(r=>r.identity)).size).toBe(13)
 expect(state.events.filter(e=>e.startsWith('clear:'))).toHaveLength(13);expect(state.events[0]).toBe('allocate:linear')
 owner.release();owner.release();expect(finish).toHaveBeenCalledTimes(1);expect(state.events.slice(-14)[0]).toBe('fence');expect(state.events.filter(e=>e.startsWith('destroy:'))).toHaveLength(13)
})
it('initializes only explicitly supplied roles, never promotes prior presentation to canonical base',()=>{
 state.events=[];const input=empty();const borrowed={width:1024,height:1024,texture:{},copyTo:vi.fn()}as unknown as AccumulationBuffer;input.presentation=borrowed
 const retire=vi.fn();const owner=createOwnedGlSourceFields({}as WebGLRenderingContext,input,retire)
 expect(borrowed.copyTo).toHaveBeenCalledTimes(1);expect(borrowed.copyTo).toHaveBeenCalledWith(owner.fields.presentation);expect(state.events.filter(e=>e.startsWith('clear:'))).toHaveLength(12)
 owner.release();expect(retire).toHaveBeenCalledWith(Object.values(owner.fields));expect(retire.mock.calls[0][0]).not.toContain(borrowed)
})

import{PrewarmedGlOwnerPool}from'./PrewarmedGlOwnerPool'
it('prewarms all 156MiB before admission and allocates nothing on three DOWN leases',()=>{
 state.events=[];const pool=new PrewarmedGlOwnerPool({}as WebGLRenderingContext,3,156*1024*1024)
 expect(pool.bytes).toBe(156*1024*1024);expect(state.events.filter(e=>e.startsWith('allocate:'))).toHaveLength(39)
 state.events=[];const a=pool.take(empty())!,b=pool.take(empty())!,c=pool.take(empty())!;expect(pool.take(empty())).toBeNull();expect(state.events.filter(e=>e.startsWith('allocate:'))).toEqual([])
 expect(()=>pool.disposeAfterFence()).toThrow('active owner');a.release();a.release();expect(pool.free).toBe(1);const next=pool.take(empty())!;expect(next.fields).toBe(a.fields);expect(new Set([...b.resources,...c.resources,...next.resources].map(r=>r.identity)).size).toBe(39)
 b.release();c.release();next.release();pool.disposeAfterFence();expect(state.events.filter(e=>e.startsWith('destroy:'))).toHaveLength(39)
})
