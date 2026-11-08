import{it,expect,vi}from'vitest'
import{SmudgePainter}from'./SmudgePainter'
import{brush131}from'../../../../../../packages/shared/src/smudgeTextureErase131.testFixture.js'
import{dab129}from'../../../../../../packages/shared/src/legacySmudgeTiming129.testFixture.js'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import type{MixerPaint}from'../presets/digitalBrushPresets'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
it('actual public paint rejects malformed131 before projection/lease/state/framebuffer access',()=>{const p=Object.create(SmudgePainter.prototype)as SmudgePainter,touch=vi.fn();Object.defineProperty(p,'ctx',{get(){touch();throw Error('late context')}});const target=new Proxy({},{get(){touch();throw Error('late target')}})as ILayerBuffer;for(const mutation of[(b:ReturnType<typeof brush131>)=>{b.version=130},(b:ReturnType<typeof brush131>)=>{b.mixer!.source='projectionCanvas'},(b:ReturnType<typeof brush131>)=>{Reflect.set(b.behavior!,'dual',null)}]){const brush=brush131();mutation(brush);const paint:MixerPaint={brush,color:[1,0,0],load:0,pickup:1,strength:1,pressure:false,sizeMultiplier:1,curve:[[0,1],[1,1]]};expect(()=>p.paint(target,[dab129(0)],'own',undefined,'own',paint,brushExecutionContext({version:1,sequentialSeed:17,strokeSeed:42}))).toThrow('source');expect(touch).not.toHaveBeenCalled()}})

import{MockGL}from'../../testing/mockGL'
import type{SmudgeContext}from'./SmudgePainter'
import{brushPreparationResources,brushTextureResourceKey}from'./BrushPreparation'
import{installBrushPixels}from'../presets/importedBrushes'
import{mask131,normal131,erase131}from'../../../../../../packages/shared/src/smudgeTextureErase131.testFixture.js'
function loaded131(){installBrushPixels(mask131,new Uint8Array(16).fill(255));installBrushPixels(normal131,new Uint8Array([102,102,102,0,102,102,102,0,0,0,0,0,0,0,0,0]));installBrushPixels(erase131,new Uint8Array([221,221,221,0,221,221,221,0,0,0,0,0,0,0,0,0]));return brush131()}
it('same existing wet owner plans/protects/binds only recorded erase pair, warm draws compile/upload zero',()=>{
 const b=loaded131(),gl=new MockGL(),p=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext}as SmudgeContext),texture=gl.createTexture()
 Reflect.set(p,'ctx',{paper:{texture,worldSize:()=>({w:64,h:64}),scale:1,fillThreshold:0,fillCap:0},quadBuf:()=>gl.createBuffer()});p.initGL();p.prepareColorSmudgeForeground()
 const group=brushPreparationResources(b);expect(group.some(r=>r.id===erase131&&r.grain)).toBe(true);expect(group.some(r=>r.id===normal131)).toBe(false)
 for(const resource of group)p.prepareTexture(group,resource)
 expect(group.every(r=>p.hasPreparedTexture(r))).toBe(true)
 const lookup=vi.spyOn(p as unknown as{wetTexture:(...args:unknown[])=>unknown},'wetTexture'),bank=Reflect.get(p,'wetTextures')as{protect:(keys:string[])=>void},protect=vi.spyOn(bank,'protect'),compile=vi.spyOn(gl,'createProgram'),upload=vi.spyOn(gl,'texImage2D')
 const buffer={width:64,height:64,beginReplaceDraw:vi.fn(),beginErase:vi.fn(),endDraw:vi.fn()},draw=Reflect.get(p,'drawTransferDab')as(...a:unknown[])=>void
 const wet={stamp:{mask:mask131,aspect:1,angle:.3,edgeSoftness:0,opacityScale:1,color:[.2,.5,.8]},paint:{brush:b,strength:.5},seed:1,step:{pickup:.6},foregroundRate:.7}
 for(const origin of[-64,0,64])draw.call(p,{buffer,originX:origin,originY:-64},{...dab129(0),x:origin+10,y:-54},4,{texture},0,0,16,'lay',1,wet,{texture})
 expect(lookup.mock.calls.some(a=>a[0]===erase131&&a[1]===true)).toBe(true);expect(lookup.mock.calls.some(a=>a[0]===normal131)).toBe(false)
 expect(protect.mock.calls.some(([keys])=>keys.includes(brushTextureResourceKey({id:erase131,grain:true,discrete:true})))).toBe(true)
 expect(compile).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(buffer.beginErase).not.toHaveBeenCalled();expect(buffer.beginReplaceDraw).toHaveBeenCalledTimes(3)
 p.forget();expect(group.some(resource=>!p.hasPreparedTexture(resource))).toBe(true);p.destroy()
})
it('existing preparation validates closed scope and loaded paired lengths before any GPU work',()=>{const b=loaded131();b.texture!.eraseId=('asset:'+'f131'.repeat(16))as`asset:${string}`;installBrushPixels(b.texture!.eraseId,new Uint8Array(64));expect(()=>brushPreparationResources(b)).toThrow('paired CAS');b.texture!.eraseId=erase131;Reflect.set(b.behavior!,'dual',null);expect(()=>brushPreparationResources(b)).toThrow('closed modern MASK131')})

it('loaded pair mismatch fails actual paint before resumeGesture or context access',()=>{const b=loaded131();b.texture!.eraseId=('asset:'+'f131'.repeat(16))as`asset:${string}`;installBrushPixels(b.texture!.eraseId,new Uint8Array(64));const p=Object.create(SmudgePainter.prototype)as SmudgePainter,touch=vi.fn();Object.defineProperty(p,'ctx',{get(){touch();throw Error('late context')}});const target=new Proxy({},{get(){touch();throw Error('late target')}})as ILayerBuffer,paint:MixerPaint={brush:b,color:[1,0,0],load:0,pickup:1,strength:1,pressure:false,sizeMultiplier:1,curve:[[0,1],[1,1]]};expect(()=>p.paint(target,[dab129(0)],'own',undefined,'own',paint,brushExecutionContext({version:1,sequentialSeed:17,strokeSeed:42}))).toThrow('paired CAS');expect(touch).not.toHaveBeenCalled()})
