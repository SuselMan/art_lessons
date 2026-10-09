import {expect,it} from 'vitest'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {assertBrushMrtBuffers} from './brushMrtGuards'
const gl={} as WebGLRenderingContext
function buffer(){return {gl,width:32,height:24,storageWidth:32,storageHeight:24,texture:{}} as AccumulationBuffer}
function fixture(){const [p,c,w,op,oc]=Array.from({length:5},buffer),flow={} as WebGLTexture;return {p,c,w,op,oc,flow,run(){assertBrushMrtBuffers(gl,{w:32,h:24,coverage:w},p,op,c,oc,flow)}}}
it('admits distinct owned input/output storage without altering records',()=>{const f=fixture(),before=f.p.texture;expect(f.run).not.toThrow();expect(f.p.texture).toBe(before)})
it('rejects distinct wrappers sharing output or any source texture',()=>{
 for(const role of ['p','c','w','oc'] as const){const f=fixture();Object.defineProperty(f.op,'texture',{value:f[role].texture});expect(f.run).toThrow('alias')}
 const f=fixture();Object.defineProperty(f.op,'texture',{value:f.flow});expect(f.run).toThrow('alias')
})
it('rejects cross-context and logical/physical extent mismatch on every record',()=>{
 for(const role of ['p','c','w','op','oc'] as const)for(const key of ['gl','width','height','storageWidth','storageHeight']){
  const f=fixture();Object.defineProperty(f[role],key,{value:key==='gl'?{}:8});expect(f.run).toThrow('owner/storage')
 }
})

import {vi} from 'vitest'
import {adaptDiagnosticWebgl2} from './diagnosticWebgl2'
import {WatercolorPasses, type WatercolorPassesContext} from './WatercolorPasses'
it('revalidates changed actual MRT attachments while preserving same-pair fast path and detaches on failure',()=>{
 const status=vi.fn(()=>1),isTexture=vi.fn(()=>true),attach=vi.fn(),draw=vi.fn()
 const raw=new Proxy({canvas:{addEventListener:()=>{}},FRAMEBUFFER_COMPLETE:1,checkFramebufferStatus:status,isTexture,framebufferTexture2D:attach,drawArrays:draw} as unknown as WebGL2RenderingContext,{get(target,key){const v=Reflect.get(target,key);return v??(typeof key==='string'&&key===key.toUpperCase()?1:()=>{})}})
 const owner=adaptDiagnosticWebgl2(raw)
 const passes=new WatercolorPasses({gl:()=>owner,screenBuf:()=>({})} as WatercolorPassesContext)
 const state={program:{},fbo:{},checked:false,uniforms:{},position:0}
 Object.assign(passes,{diagnosticBrushMrt:true,_brushMrt:state,warmBrushMrt:()=>true})
 const make=()=>({gl:owner,width:32,height:24,storageWidth:32,storageHeight:24,texture:{},beginReplaceDraw:vi.fn(),endDraw:vi.fn()}) as unknown as AccumulationBuffer
 const p=make(),c=make(),w=make(),op=make(),oc=make(),flow={} as WebGLTexture
 const run=(dest=op)=>passes.brushPair({w:32,h:24,coverage:w},flow,4,1,p,dest,c,oc,[0,0,1,1],[0,0,32,24],.1)
 expect(run()).toBe(true);expect(run()).toBe(true);expect(status).toHaveBeenCalledTimes(1);expect(isTexture).toHaveBeenCalledTimes(1)
 expect(run(make())).toBe(true);expect(status).toHaveBeenCalledTimes(2)
 status.mockReturnValue(0);expect(()=>run(make())).toThrow('incomplete');expect(draw).toHaveBeenCalledTimes(3)
 expect(attach.mock.calls.slice(-2).every(args=>args[3]===null)).toBe(true)
 isTexture.mockReturnValue(false)
 expect(()=>passes.brushPair({w:32,h:24,coverage:w},{} as WebGLTexture,4,1,p,op,c,oc,[0,0,1,1],[0,0,32,24],.1)).toThrow('foreign or dead')
 expect(draw).toHaveBeenCalledTimes(3)
})
