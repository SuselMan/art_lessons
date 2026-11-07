import {expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {SmudgePainter} from './SmudgePainter'
import {digitalBrushFromPreset,type MixerPaint} from '../presets/digitalBrushPresets'
import {brushExecutionContext} from '../presets/brushExecutionContext'
import type {ILayerBuffer} from '../buffers/ILayerBuffer'
import type {Dab} from '@grafetto/shared'
import * as preparation from './BrushPreparation'
import type {BrushTextureCache} from './BrushTextureCache'
function fixture(){
 const gl=new MockGL(),order:string[]=[],close=vi.fn(()=>{order.push('read')}),open=vi.fn(()=>({layers:[],release:close}))
 const painter=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext,openProjection:open,createBrushScratch(){throw Error('Unexpected scratch allocation')},paintBrushMask(){throw Error('Unexpected mask painting')},quadBuf:()=>gl.createBuffer()!,screenBuf:()=>gl.createBuffer()!,paper:{texture:gl.createTexture()!,scale:1,fillThreshold:0,fillCap:0,worldSize:()=>({w:64,h:64})}})
 const b=structuredClone(digitalBrushFromPreset('hard-round'));b.model='mixer';b.tip={kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0};b.behavior={version:2}
 b.mixer={source:'projectionCanvas',load:0,initialLoad:0,pickup:.6,strength:1,smearAlpha:true}
 const target={resolveForPaint:()=>[],resolveVisible:()=>[],markContentPainted:vi.fn()}as unknown as ILayerBuffer
 const context=brushExecutionContext(undefined,{version:1,projection:[{id:'recorded-source',opacity:.5}]})
 const d:Dab={x:10,y:10,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 const paint:MixerPaint={brush:b,color:[.8,.2,.6],load:0,pickup:.6,strength:.5,pressure:false,sizeMultiplier:1,curve:[[0,1],[1,1]]}
 const body=vi.fn(),cache=Reflect.get(painter,'wetTextures')as BrushTextureCache
 Reflect.set(painter,'paintBehaviorDab',body)
 const run=()=>painter.paint(target,[d],'actor',undefined,'gesture',paint,context)
 return{painter,run,order,close,open,cache,body}
}
function caught(run:()=>void):unknown {let threw=false,value:unknown;try{run()}catch(error){threw=true;value=error}expect(threw).toBe(true);return value}
it('closes projection when actual brushPreparationResources throws before a texture lease exists',()=>{
 const f=fixture(),error=new Error('real preparation failure'),lease=vi.spyOn(f.cache,'lease')
 const prepare=vi.spyOn(preparation,'brushPreparationResources').mockImplementationOnce(()=>{throw error})
 try{expect(caught(f.run)).toBe(error);expect(f.open).toHaveBeenCalledOnce();expect(lease).not.toHaveBeenCalled();expect(f.body).not.toHaveBeenCalled();expect(f.close).toHaveBeenCalledOnce()}
 finally{prepare.mockRestore();f.painter.destroy()}
})
it('closes projection after lease acquisition failure without releasing an unacquired lease',()=>{
 const f=fixture(),error=new Error('lease acquire failed')
 vi.spyOn(f.cache,'lease').mockImplementationOnce(()=>{throw error})
 expect(caught(f.run)).toBe(error);expect(f.close).toHaveBeenCalledOnce();expect(f.body).not.toHaveBeenCalled();f.painter.destroy()
})
it('releases texture then read once on success, without changing paint callbacks',()=>{
 const f=fixture(),release=vi.fn(()=>{f.order.push('texture')})
 vi.spyOn(f.cache,'lease').mockReturnValueOnce(release);f.run()
 expect(f.body).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();expect(f.order).toEqual(['texture','read']);f.painter.destroy()
})
it('preserves primary thrown undefined even if BOTH acquired cleanups fail',()=>{
 const f=fixture(),release=vi.fn(()=>{f.order.push('texture');throw new Error('cleanup texture')})
 vi.spyOn(f.cache,'lease').mockReturnValueOnce(release);f.body.mockImplementationOnce(()=>{throw undefined})
 f.close.mockImplementationOnce(()=>{f.order.push('read');throw new Error('cleanup read')})
 expect(caught(f.run)).toBeUndefined();expect(release).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();expect(f.order).toEqual(['texture','read']);f.painter.destroy()
})
it('preserves first cleanup thrown undefined on successful work while still closing projection',()=>{
 const f=fixture();vi.spyOn(f.cache,'lease').mockReturnValueOnce(()=>{f.order.push('texture');throw undefined})
 f.close.mockImplementationOnce(()=>{f.order.push('read');throw new Error('later cleanup')})
 expect(caught(f.run)).toBeUndefined();expect(f.body).toHaveBeenCalledOnce();expect(f.order).toEqual(['texture','read']);f.painter.destroy()
})
