import {expect,it,vi} from 'vitest'
import {BristleSoakGather139} from './BristleSoakGather139'
import type {CanonicalBeginResult} from '../dabs/CanonicalBeginRuntime'
import type {SprayScratchLease} from '../dabs/SprayRequestPainter'
function fixture(){
 const constants=new Map<string,number>(),state=new Map<number,unknown>(),textures=new Map<number,unknown>(),enabled=new Set<number>();let next=1,active=0,vao:unknown={},drawThrow=false,readThrow=false
 const api:Record<string,unknown>={}
 const raw=new Proxy(api,{get:(object,key:string)=>{if(key in object)return object[key];if(/^[A-Z0-9_]+$/.test(key)){if(!constants.has(key))constants.set(key,next++);return constants.get(key)}return()=>{}}})
 const gl=raw as unknown as WebGLRenderingContext
 active=gl.TEXTURE0+3;textures.set(gl.TEXTURE0,{old:'zero'});textures.set(active,{old:'active'})
 const ext={VERTEX_ARRAY_BINDING_OES:999,createVertexArrayOES:()=>({}),bindVertexArrayOES:(v:unknown)=>{vao=v},deleteVertexArrayOES:()=>{}}
 for(const[key,value]of[[gl.FRAMEBUFFER_BINDING,{}],[gl.PACK_ALIGNMENT,8],[gl.VIEWPORT,[3,4,5,6]],[gl.CURRENT_PROGRAM,{}],[gl.ARRAY_BUFFER_BINDING,{}],[gl.COLOR_WRITEMASK,[false,true,false,true]],[gl.COLOR_CLEAR_VALUE,[.1,.2,.3,.4]]]as const)state.set(key,value)
 Object.assign(api,{
  getExtension:()=>ext,getParameter:(key:number)=>key===gl.MAX_TEXTURE_SIZE?4096:key===999?vao:key===gl.ACTIVE_TEXTURE?active:key===gl.TEXTURE_BINDING_2D?textures.get(active):state.get(key),
  createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,
  activeTexture:(v:number)=>{active=v},bindTexture:(_k:number,v:unknown)=>textures.set(active,v),bindFramebuffer:(_k:number,v:unknown)=>state.set(gl.FRAMEBUFFER_BINDING,v),bindBuffer:(_k:number,v:unknown)=>state.set(gl.ARRAY_BUFFER_BINDING,v),useProgram:(v:unknown)=>state.set(gl.CURRENT_PROGRAM,v),pixelStorei:(k:number,v:number)=>state.set(k,v),viewport:(...v:number[])=>state.set(gl.VIEWPORT,v),colorMask:(...v:boolean[])=>state.set(gl.COLOR_WRITEMASK,v),clearColor:(...v:number[])=>state.set(gl.COLOR_CLEAR_VALUE,v),
  isEnabled:(v:number)=>enabled.has(v),enable:(v:number)=>enabled.add(v),disable:(v:number)=>enabled.delete(v),getAttribLocation:(_p:unknown,n:string)=>n==='a_atlas'?0:1,getUniformLocation:()=>({}),checkFramebufferStatus:()=>gl.FRAMEBUFFER_COMPLETE,
  drawArrays:vi.fn(()=>{if(drawThrow)throw undefined}),readPixels:vi.fn((_x:number,_y:number,_w:number,_h:number,_f:number,_t:number,bytes:Uint8Array)=>{if(readThrow)throw undefined;bytes.set([64,32,0,128])}),getError:()=>gl.NO_ERROR,isContextLost:()=>false,
 })
 const gather=new BristleSoakGather139(gl);gather.prepare()
 const view={binding:{layerId:'L',userId:'U',strokeId:'S',targetGeneration:1,prefixKey:'P',begin:{kind:'optimistic' as const,logRevision:1}},tiles:[{originX:0,originY:0,buffer:{width:8,height:8,texture:{}},contentRect:null}],assertCurrent:vi.fn(),release:vi.fn()} as unknown as Extract<CanonicalBeginResult,{kind:'ready'}>['view']
 const lease={buffer:{width:64,height:64,texture:{},fbo:{}},assertCurrent:vi.fn(),release:vi.fn()} as unknown as SprayScratchLease
 const snapshot=()=>({active,vao,state:[...state],textures:[...textures],enabled:[...enabled]})
 return{gather,gl,api,view,lease,snapshot,failDraw:()=>{drawThrow=true},failRead:()=>{readThrow=true}}
}
it('gathers4096 hairs with one tile draw and one readback and restores FBO/PACK/texture state',()=>{
 const f=fixture(),before=f.snapshot(),rgba=f.gather.gather(f.view,Array.from({length:4096},()=>({x:1,y:1})),()=>f.lease)
 expect(rgba.length).toBe(16384);expect([...rgba.slice(0,4)]).toEqual([128,64,0,128]);expect(f.api.drawArrays).toHaveBeenCalledTimes(1);expect(f.api.readPixels).toHaveBeenCalledTimes(1);expect(f.snapshot()).toEqual(before);expect(f.lease.release).toHaveBeenCalledTimes(1)
})
it('restores unit0 even when pool acquisition mutates it then throws undefined',()=>{
 const f=fixture(),before=f.snapshot();let caught=false,value:unknown='not-thrown'
 try{f.gather.gather(f.view,[{x:1,y:1}],()=>{f.gl.activeTexture(f.gl.TEXTURE0);f.gl.bindTexture(f.gl.TEXTURE_2D,{} as WebGLTexture);f.gl.bindFramebuffer(f.gl.FRAMEBUFFER,{} as WebGLFramebuffer);f.gl.pixelStorei(f.gl.PACK_ALIGNMENT,1);throw undefined})}catch(error){caught=true;value=error}
 expect(caught).toBe(true);expect(value).toBeUndefined();expect(f.snapshot()).toEqual(before)
})
for(const mode of['draw','read']as const)it('restores and releases after '+mode+' throws undefined',()=>{
 const f=fixture(),before=f.snapshot();if(mode==='draw')f.failDraw();else f.failRead();let caught=false,value:unknown='not-thrown'
 try{f.gather.gather(f.view,[{x:1,y:1}],()=>f.lease)}catch(error){caught=true;value=error}
 expect(caught).toBe(true);expect(value).toBeUndefined();expect(f.snapshot()).toEqual(before);expect(f.lease.release).toHaveBeenCalledTimes(1)
})
it('rejects overlapping membership before atlas allocation',()=>{
 const f=fixture(),acquire=vi.fn(()=>f.lease);const view={...f.view,tiles:[f.view.tiles[0],f.view.tiles[0]]}
 expect(()=>f.gather.gather(view,[{x:1,y:1}],acquire)).toThrow('Overlapping');expect(acquire).not.toHaveBeenCalled()
})
