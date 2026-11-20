import {expect,it,vi} from 'vitest'
import {BristleRequestBatch} from './BristleRequestBatch'
import {ink} from '../presets/bristleSoak139TestFixture'
/** Program ownership test only: no software mock is claimed as GPU evidence. */
it('prepares only explicit139 variants even when frozen old72 profile hits its cached early return',()=>{
 const constants=new Map<string,number>();let next=1
 const ext={createVertexArrayOES:()=>({}),deleteVertexArrayOES:()=>{}}
 const api:Record<string,unknown>={createProgram:vi.fn(()=>({})),getExtension:(name:string)=>name==='OES_vertex_array_object'?ext:null,getShaderParameter:()=>true,getProgramParameter:()=>true,createShader:()=>({}),createBuffer:()=>({}),createTexture:()=>({})}
 const raw=new Proxy(api,{get:(object,key:string)=>{if(key in object)return object[key];if(/^[A-Z0-9_]+$/.test(key)){if(!constants.has(key))constants.set(key,next++);return constants.get(key)}return()=>{}}})
 const gl=raw as unknown as WebGLRenderingContext
 api.getParameter=(key:number)=>key===gl.MAX_VERTEX_ATTRIBS?8:key===gl.MAX_TEXTURE_SIZE?4096:0
 const settings=Object.freeze({...ink,depletion:Object.freeze([...ink.depletion])}),batch=new BristleRequestBatch(gl)
 batch.prepareInkProfile(settings,false)
 const before=vi.mocked(gl.createProgram).mock.calls.length
 expect(()=>batch.assertInkPrepared(settings,false,true)).toThrow('Soak variant')
 batch.prepareInkProfile(settings,false,true)
 expect(vi.mocked(gl.createProgram).mock.calls.length).toBe(before+1)
 expect(()=>batch.assertInkPrepared(settings,false,true)).not.toThrow()
 batch.prepareInkProfile(settings,false,true)
 expect(vi.mocked(gl.createProgram).mock.calls.length).toBe(before+1)
 batch.reset();expect(()=>batch.assertInkPrepared(settings,false,true)).toThrow('Soak variant')
})
