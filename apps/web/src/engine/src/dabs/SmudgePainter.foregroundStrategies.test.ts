import {expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {SmudgePainter,type SmudgeContext} from './SmudgePainter'
import {digitalBrushFromPreset} from '../presets/digitalBrushPresets'
import {brushPreparationPlan} from './BrushPreparation'
function fixture(){
 const gl=new MockGL(),painter=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext}as SmudgeContext)
 const texture=gl.createTexture()
 Reflect.set(painter,'ctx',{paper:{texture,worldSize:()=>({w:64,h:64}),scale:1,fillThreshold:0,fillCap:0},quadBuf:()=>gl.createBuffer()})
 painter.initGL()
 const buffer={width:64,height:64,beginReplaceDraw:vi.fn(),endDraw:vi.fn()}
 const draw=Reflect.get(painter,'drawTransferDab') as (...args:unknown[])=>void
 return{gl,painter,buffer,texture,draw}
}
function brush(mode:string,modern=true){
 const b=structuredClone(digitalBrushFromPreset('hard-round'))
 b.model='mixer';b.mixer={source:'previousCanvas',load:0,pickup:.6,strength:1,initialLoad:0,smearAlpha:true,foreground:{rate:modern ? .8 : .16},...(modern?{algorithm:'krita-mask' as const}:{})}
 Reflect.set(b.mixer,'colorRateComposite',mode)
 b.behavior={...b.behavior,version:2,rendering:{mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}
 return b
}
function paint(f:ReturnType<typeof fixture>,b:ReturnType<typeof brush>,rate:number){
 const wet={stamp:{aspect:1,angle:0,edgeSoftness:0,opacityScale:1,color:[.2,.5,.8]},paint:{brush:b,strength:.5},seed:1,step:{pickup:.6},foregroundRate:rate}
 f.draw.call(f.painter,{buffer:f.buffer,originX:0,originY:0},{x:10,y:10,pressure:1,opacity:1},4,{texture:f.texture},0,0,16,'lay',1,wet,{texture:f.texture})
}
function uniforms(p:SmudgePainter,name:string){
 return(Reflect.get(p,name)as{program:{uniforms:Map<string,unknown>}}).program.uniforms
}
it('prewarms one modern3 program and sends per-draw foreground selector with independent feedback rates',()=>{
 const f=fixture(),compile=vi.spyOn(f.gl,'createProgram')
 f.painter.prepareColorSmudgeForeground();const warmed=compile.mock.calls.length
 for(const[mode,code]of [['grainMerge',1],['grainExtract',2],['negation',3]]as const){
  const b=brush(mode);expect(brushPreparationPlan(b).capabilities).toContain('colorSmudgeForeground')
  paint(f,b,.8);const u=uniforms(f.painter,'colorSmudgeForegroundTransfer')
  expect(u.get('u_colorSmudgeComposite')).toBe(code)
  expect(u.get('u_colorSmudge')).toEqual([1,.3,0,0])
  expect(u.get('u_previousCanvasForeground')).toEqual([.2,.5,.8,.32000000000000006])
  expect(u.get('u_wetBlend')).toBe(0)
 }
 expect(compile.mock.calls.length).toBe(warmed)
 const destroy=vi.spyOn(f.gl,'deleteProgram'),program=Reflect.get(f.painter,'colorSmudgeForegroundTransfer')as{program:WebGLProgram}
 f.painter.destroy();expect(destroy).toHaveBeenCalledWith(program.program)
})
it('legacy multiply/screen keeps compensated colour linear and pickup in final transfer only',()=>{
 const f=fixture();f.painter.prepareColorSmudgeLegacy()
 for(const[mode,code]of [['multiply',4],['screen',5]]as const){
  const b=brush(mode,false);expect(brushPreparationPlan(b).capabilities).toContain('colorSmudgeLegacy')
  paint(f,b,.16);const u=uniforms(f.painter,'colorSmudgeLegacyTransfer')
  expect(u.get('u_colorSmudgeComposite')).toBe(code)
  expect(u.get('u_previousCanvasForeground')).toEqual([.2,.5,.8,.08])
  expect(u.get('u_strength')).toBe(1) // drawTransfer consumes the already calculated final strength argument.
  expect(u.get('u_previousCanvas')).toBe(1)
 }
 f.painter.destroy()
})
it('zero foreground remains zero and context loss drops only its own programs',()=>{
 const f=fixture();f.painter.prepareColorSmudgeForeground();paint(f,brush('negation'),0)
 expect(uniforms(f.painter,'colorSmudgeForegroundTransfer').get('u_previousCanvasForeground')).toEqual([.2,.5,.8,0])
 f.painter.forget();expect(Reflect.get(f.painter,'colorSmudgeForegroundTransfer')).toBeUndefined()
 expect(Reflect.get(f.painter,'colorSmudgeLegacyTransfer')).toBeUndefined()
 f.painter.destroy()
})
it('actual previousCanvas transfer applies pickup only at legacy final strength and never at modern final mask',()=>{
 for(const modern of [false,true]){
  const f=fixture(),b=brush(modern?'grainMerge':'multiply',modern),release=vi.fn(),mark=vi.fn()
  Reflect.set(f.painter,'acquireScratch',()=>({texture:f.texture}))
  Reflect.set(f.painter,'releaseScratch',release)
  Reflect.set(f.painter,'gatherPatch',vi.fn())
  const targets=[{buffer:f.buffer,originX:0,originY:0,contentRect:null}]
  const target={resolveForPaint:()=>targets,markContentPainted:mark}
  const wet={stamp:{aspect:1,angle:0,edgeSoftness:0,opacityScale:1,color:[.2,.5,.8]},paint:{brush:b,strength:.5},seed:1,step:{pickup:.6},foregroundRate:modern ? .8 : .16}
  const transfer=Reflect.get(f.painter,'paintPreviousCanvas')as(...args:unknown[])=>void
  transfer.call(f.painter,target,{x:10,y:10,pressure:1,opacity:1},4,{minX:0,minY:0,maxX:16,maxY:16},{minX:0,minY:0,maxX:16,maxY:16},16,16,{x:8,y:8},wet.paint,wet)
  const u=uniforms(f.painter,modern?'colorSmudgeForegroundTransfer':'colorSmudgeLegacyTransfer')
  expect(u.get('u_strength')).toBe(modern ? .5 : .3)
  expect(mark).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledTimes(2)
  f.painter.destroy()
 }
})
it('refuses legacy projection or modern pairing before framebuffer mutation',()=>{
 const f=fixture(),b=brush('multiply',false)
 b.mixer!.source='projectionCanvas'
 expect(()=>paint(f,b,.16)).toThrow('Legacy Color Smudge requires its own canvas strategy')
 expect(f.buffer.beginReplaceDraw).not.toHaveBeenCalled()
 b.mixer!.source='previousCanvas';b.mixer!.algorithm='krita-mask'
 expect(()=>paint(f,b,.16)).toThrow('Legacy Color Smudge requires its own canvas strategy')
 expect(f.buffer.beginReplaceDraw).not.toHaveBeenCalled()
 f.painter.destroy()
})
