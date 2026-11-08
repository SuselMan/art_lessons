import {afterEach,expect,it,vi} from 'vitest'
import {BrushPainter,type BrushContext} from './BrushPainter'
import {BristleSoakGather139} from '../raster/BristleSoakGather139'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {PencilPreset} from '../presets/pencilPresets'
import {brush,dab,soak} from '../presets/bristleSoak139TestFixture'
import {beginBrushBehavior} from '../presets/brushBehavior'
import type {ILayerBuffer} from '../buffers/ILayerBuffer'
import type {CanonicalBeginResult,CanonicalBeginRuntime} from './CanonicalBeginRuntime'
const runtime:CanonicalBeginRuntime={capability:'bristleSoak139',binding:soak().binding}
const execution={brushRandom:{version:1 as const,strokeSeed:10,sequentialSeed:20}}
function fixture(){
 const target={} as ILayerBuffer,view={binding:runtime.binding,tiles:[],assertCurrent:vi.fn(),release:vi.fn()}
 const ctx={openCanonicalBegin:vi.fn(()=>({kind:'ready' as const,view})),acquireSprayScratch:vi.fn()} as unknown as BrushContext
 const gather=Object.create(BristleSoakGather139.prototype) as BristleSoakGather139
 vi.spyOn(gather,'assertPrepared').mockImplementation(()=>{});vi.spyOn(gather,'gather').mockReturnValue(soak().rgba)
 const painter=Object.assign(Object.create(BrushPainter.prototype),{ctx,soakGather:gather,behavior:{assertBristleSoakPrepared139:vi.fn()}}) as BrushPainter
 const scratch={} as BehaviorScratch
 const prepare=(r=runtime)=>painter.prepareBristleSoakGesture(target,{previous:dab,current:{...dab,x:3}},r.binding.userId,r.binding.strokeId,{brush,pressure:{size:true,opacity:true}},execution,r,scratch)
 return{painter,scratch,view,gather,ctx,target,prepare}
}
afterEach(()=>vi.restoreAllMocks())
it('publishes detached source only after full successful gather and source release; no geometry advance',()=>{
 const f=fixture();expect(f.prepare()).toEqual({kind:'ready'});expect(f.view.release).toHaveBeenCalledOnce()
 expect(f.scratch.brushBehavior?.bristle?.ordinal).toBe(0);expect(f.scratch.brushBehavior?.bristle?.previous).toBeUndefined()
 expect(f.painter.bristleSoakBinding(f.scratch)).toEqual(runtime.binding);expect(f.gather.gather).toHaveBeenCalledOnce()
 expect(f.prepare()).toEqual({kind:'ready'});expect(f.gather.gather).toHaveBeenCalledOnce()
})
it('preserves the prior anchor state when source release throws undefined after successful readback',()=>{
 const f=fixture(),prior=beginBrushBehavior(dab,execution);prior.bristle={ordinal:0,oldPressure:1,previous:{x:dab.x,y:dab.y},ends:[]};f.scratch.brushBehavior=prior
 const before=structuredClone(prior);f.view.release.mockImplementation(()=>{throw undefined});let caught=false,value:unknown='not-thrown'
 try{f.prepare()}catch(error){caught=true;value=error}
 expect(caught).toBe(true);expect(value).toBeUndefined();expect(f.scratch.brushBehavior).toBe(prior);expect(prior).toEqual(before)
})
it('rejects a new conflicting prefix without overwriting an accepted palette or gathering B',()=>{
 const f=fixture();f.prepare();const prior=f.scratch.brushBehavior,before=structuredClone(prior)
 expect(f.prepare({...runtime,binding:{...runtime.binding,prefixKey:'earlier-foreign-B'}})).toMatchObject({kind:'notReady',reason:'prefix'})
 expect(f.scratch.brushBehavior).toBe(prior);expect(prior).toEqual(before);expect(f.gather.gather).toHaveBeenCalledOnce()
})
it('leaves scratch untouched on real source notReady and missing capability before geometry',()=>{
 const f=fixture();vi.mocked(f.ctx.openCanonicalBegin!).mockReturnValue({kind:'notReady',reason:'history',retryKey:'full-BEGIN'} as CanonicalBeginResult)
 expect(f.prepare()).toMatchObject({kind:'notReady',reason:'history'});expect(f.scratch.brushBehavior).toBeUndefined();expect(f.gather.gather).not.toHaveBeenCalled()
 expect(()=>f.prepare({...runtime,capability:undefined})).toThrow('identity');expect(f.scratch.brushBehavior).toBeUndefined()
})
it('invalidates only a real139 owner, leaving ordinary existing behavior alone',()=>{
 const f=fixture(),ordinary=beginBrushBehavior(dab,execution);f.scratch.brushBehavior=ordinary;f.painter.invalidateBristleSoak(f.scratch);expect(f.scratch.brushBehavior).toBe(ordinary)
 f.prepare();f.painter.invalidateBristleSoak(f.scratch);expect(f.scratch.brushBehavior).toBeUndefined()
})

it('rejects actual BBP effectiveErase override before prewarm, scratch, leases or draw',()=>{
 const painter=Object.create(BrushBehaviorPainter.prototype) as BrushBehaviorPainter
 const prewarm=vi.spyOn(painter,'assertBristleSoakPrepared139')
 const resolveForPaint=vi.fn(()=>[]),markContentPainted=vi.fn(),scratch={} as BehaviorScratch
 expect(()=>painter.paint({resolveForPaint,markContentPainted},[dab],{sizeMultiplier:1} as PencilPreset,brush,{size:true,opacity:true},[1,0,0],scratch,false,undefined,execution,true)).toThrow('Bristle Soak139 erase override is not supported')
 expect(prewarm).not.toHaveBeenCalled();expect(resolveForPaint).not.toHaveBeenCalled();expect(markContentPainted).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBeUndefined()
})
