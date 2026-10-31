import { expect, it, vi } from 'vitest'
import { recordingGL } from '../../testing/brushPassTestUtils'
import { ownedBrushFixture } from '../../testing/ownedBrushFixture'
import type { TransformedMaskView } from './TransformedMaskPrepass'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'
import { CanonicalRgba8CompositePass, canonicalRgba8CompositeBudget, type CanonicalOwnedRgba8Target } from './CanonicalRgba8CompositePass'
import { SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE, SOURCE_RGBA8_COLOR_HSY_PROFILE, SOURCE_RGBA8_GENERIC_SC_PROFILE } from '../presets/sourceColorRgba8'
const control = { mode:'colorHsy',profile:SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE,opacity:248/255 } as const
function setup(){
 const {gl,snapshot}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache()
 Object.assign(gl,{TEXTURE1:gl.TEXTURE0+1,STATIC_DRAW:9001,FRAMEBUFFER_ATTACHMENT_OBJECT_NAME:9002,LINEAR:9010,REPEAT:9011,
  copyTexSubImage2D:vi.fn(),uniform3f:vi.fn(),uniform4f:vi.fn(),getAttribLocation:()=>0,isContextLost:()=>false,getTexParameter:()=>9010})
 const mask=ownedBrushFixture(gl,1024);cache.protect(['mask']);cache.putOwned('mask',mask)
 const view:TransformedMaskView={key:'mask',texture:mask.texture,rect:{x:0,y:0,width:16,height:16},bounds:{x:0,y:0,width:1,height:1},mirror:{horizontal:false,vertical:false},channel:'r' as const}
 let active=0;const release=vi.fn(()=>{active--}),lease=vi.fn(()=>{active++;return release})
 const target:CanonicalOwnedRgba8Target={brand:'canonical-straight-rgba8-v1',texture:gl.createTexture(),framebuffer:gl.createFramebuffer(),width:16,height:16,originX:0,originY:0,lifetime:{kind:'external',owner:{},lease}}
 gl.getFramebufferAttachmentParameter=()=>target.texture
 const pass=new CanonicalRgba8CompositePass(gl,cache,cpu,'hsy-test'),companions=[{key:'mask',bytes:1024}]
 const request={source:{kind:'maskRgb' as const,view,rgb:[130,191,28] as const},target,operation:{kind:'colorHsyInstalled' as const,control}}
 return {gl,snapshot,cache,cpu,pass,companions,request,lease,release,active:()=>active}
}
it('prepares only explicit HSY and uploads the fixed graph once per draw without hot compilation',()=>{
 const s=setup(),before=s.snapshot(),baseline=s.cpu.reservedBytes
 try{
  s.pass.prepare({width:16,height:16,operations:['colorHsyInstalled']},s.companions)
  expect(s.pass.supportsOperations(['colorHsyInstalled'])).toBe(true);expect(s.pass.supportsOperations(['genericSCU8'])).toBe(false)
  expect(s.gl.shaderSource.mock.calls.some((r:unknown[])=>String(r[1]).includes('sourceCompositeInstalledHsyRgba8(source,destination'))).toBe(true)
  const compile=s.gl.compileShader.mock.calls.length,policy=vi.spyOn(s.gl,'uniform2f'),uniform=vi.spyOn(s.gl,'uniform1i')
  expect(s.pass.drawSource(s.request)).toBe('painted')
  expect(s.gl.compileShader.mock.calls.length).toBe(compile);expect(s.gl.uniform4f).toHaveBeenCalledWith(expect.objectContaining({name:'controls'}),248,248,255,255)
  expect(policy).toHaveBeenCalledWith(expect.objectContaining({name:'policy'}),7,0)
  expect(uniform).toHaveBeenCalledWith(expect.objectContaining({name:'sourceHsyStageLimit'}),12)
  expect(s.lease).toHaveBeenCalledTimes(1);expect(s.release).toHaveBeenCalledTimes(1);expect(s.active()).toBe(0);expect(s.snapshot()).toEqual(before)
  expect(s.cpu.reservedBytes-baseline).toBe(canonicalRgba8CompositeBudget({width:16,height:16,operations:['colorHsyInstalled']}).cpuBytes)
 }finally{s.pass.reset();s.cache.clear()}
 expect(s.cpu.reservedBytes).toBe(baseline);expect(s.cache.bytes).toBe(0)
})
it('keeps generic SC compilation lightweight and refuses implicit HSY preparation',()=>{
 const s=setup()
 try{
  s.pass.prepare({width:16,height:16,operations:['genericSCU8']},s.companions)
  expect(s.gl.shaderSource.mock.calls.every((r:unknown[])=>!String(r[1]).includes('sourceHsyFma'))).toBe(true)
  expect(()=>s.pass.drawSource(s.request)).toThrow('not prepared');expect(s.lease).not.toHaveBeenCalled();expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled()
 }finally{s.pass.reset();s.cache.clear()}
})
it('rejects separate/unknown profiles and cross-kind Color before acquiring resources',()=>{
 const s=setup();s.pass.prepare({width:16,height:16,operations:['colorHsyInstalled']},s.companions)
 try{
  for(const profile of [SOURCE_RGBA8_COLOR_HSY_PROFILE,SOURCE_RGBA8_GENERIC_SC_PROFILE,'unknown'])expect(()=>s.pass.drawSource({...s.request,operation:{kind:'colorHsyInstalled',control:{...control,profile} as never}})).toThrow()
  expect(()=>s.pass.drawSource({...s.request,operation:{kind:'genericSCU8',control:control as never}})).toThrow('GenericSC')
  expect(s.lease).not.toHaveBeenCalled();expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled()
 }finally{s.pass.reset();s.cache.clear()}
})
it('rolls back failed HSY shader preparation through existing shared owners',()=>{
 const s=setup(),before=s.snapshot(),baseline=s.cpu.reservedBytes
 vi.spyOn(s.gl,'getShaderParameter').mockReturnValue(false)
 expect(()=>s.pass.prepare({width:16,height:16,operations:['colorHsyInstalled']},s.companions)).toThrow('compile')
 expect(s.pass.isReady()).toBe(false);expect(s.cpu.reservedBytes).toBe(baseline);expect(s.cache.resourceBytes(s.pass.key)).toBeUndefined();expect(s.snapshot()).toEqual(before)
 s.pass.reset();s.cache.clear();expect(s.cache.bytes).toBe(0)
})
