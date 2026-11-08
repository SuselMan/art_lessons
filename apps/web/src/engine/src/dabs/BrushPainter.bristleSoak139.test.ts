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
function fixture(selected=brush,first=dab){
 const target={} as ILayerBuffer,view={binding:runtime.binding,tiles:[],assertCurrent:vi.fn(),release:vi.fn()}
 const ctx={openCanonicalBegin:vi.fn(()=>({kind:'ready' as const,view})),acquireSprayScratch:vi.fn()} as unknown as BrushContext
 const gather=Object.create(BristleSoakGather139.prototype) as BristleSoakGather139
 vi.spyOn(gather,'assertPrepared').mockImplementation(()=>{});vi.spyOn(gather,'gather').mockReturnValue(soak().rgba)
 const painter=Object.assign(Object.create(BrushPainter.prototype),{ctx,soakGather:gather,behavior:{assertBristleSoakPrepared139:vi.fn()}}) as BrushPainter
 const scratch={} as BehaviorScratch
 const prepare=(r=runtime)=>painter.prepareBristleSoakGesture(target,{previous:first,current:{...first,x:3}},r.binding.userId,r.binding.strokeId,{brush:selected,pressure:{size:true,opacity:true}},execution,r,scratch)
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
const resizedBrush=()=>{const d=structuredClone(brush);d.version=140;if(d.bristle?.version!==2)throw Error('fixture');d.bristle.hairs=[[0,0,1]];d.bristle.soak={sourcePolicy:'canonical-begin-v1',initialSide:1,resizePolicy:'mask-population-v1'};return d}
it('publishes resized population, matching ink state and sampled palette only after source release',()=>{
 const first={...dab,sourceSize:4,sourceScale:1},f=fixture(resizedBrush(),first)
 vi.mocked(f.gather.gather).mockReturnValue(new Uint8Array(16*4))
 f.view.release.mockImplementation(()=>expect(f.scratch.brushBehavior).toBeUndefined())
 expect(f.prepare()).toEqual({kind:'ready'})
 const bristle=f.scratch.brushBehavior!.bristle!;expect(bristle.initialization!.side).toBe(4);expect(bristle.initialization!.hairs).toHaveLength(16);expect(bristle.ink!.hairs).toHaveLength(16);expect(bristle.soak!.rgba).toHaveLength(64);expect(bristle.ordinal).toBe(0)
 expect(vi.mocked(f.gather.gather).mock.calls[0][1]).toHaveLength(16)
 const before=structuredClone(f.scratch.brushBehavior)
 expect(()=>f.painter.prepareBristleSoakGesture(f.target,{previous:{...first,sourceSize:8},current:{...first,x:3,sourceSize:8}},runtime.binding.userId,runtime.binding.strokeId,{brush:resizedBrush(),pressure:{size:true,opacity:true}},execution,runtime,f.scratch)).toThrow('size changed')
 expect(f.scratch.brushBehavior).toEqual(before);expect(f.gather.gather).toHaveBeenCalledOnce()
})
it('failed resized capture leaves the accepted anchor and all prior state intact',()=>{
 const f=fixture(resizedBrush(),{...dab,sourceSize:4,sourceScale:1}),prior=beginBrushBehavior(dab,execution);prior.bristle={ordinal:0,oldPressure:1,previous:{x:dab.x,y:dab.y},ends:[]};f.scratch.brushBehavior=prior
 vi.mocked(f.gather.gather).mockReturnValue(new Uint8Array(64));f.view.release.mockImplementation(()=>{throw undefined});const before=structuredClone(prior)
 let caught=false;try{f.prepare()}catch(error){caught=true;expect(error).toBeUndefined()}
 expect(caught).toBe(true);expect(f.scratch.brushBehavior).toBe(prior);expect(prior).toEqual(before);expect(prior.bristle.initialization).toBeUndefined()
})
it('keeps a truly empty resized mask as no-paint without a fake gather or ink population',()=>{
 const d=resizedBrush();if(d.bristle?.version!==2)throw Error('fixture');d.bristle.soak!.initialSide=4;d.bristle.hairs=[[-.5,-.5,1]]
 const f=fixture(d,{...dab,sourceSize:1,sourceScale:1});expect(f.prepare()).toEqual({kind:'ready'});expect(f.gather.gather).not.toHaveBeenCalled();expect(f.view.release).toHaveBeenCalledOnce()
 expect(f.scratch.brushBehavior!.bristle!.initialization!.hairs).toEqual([]);expect(f.scratch.brushBehavior!.bristle!.soak!.rgba).toHaveLength(0);expect(f.scratch.brushBehavior!.bristle!.ink).toBeUndefined()
})
it('rejects source size changes between the prior anchor packet and first capture without a partial initializer',()=>{
 const f=fixture(resizedBrush(),{...dab,sourceSize:8,sourceScale:1}),prior=beginBrushBehavior(dab,execution)
 prior.previous={...dab,sourceSize:4,sourceScale:1};prior.bristle={ordinal:0,oldPressure:1,previous:{x:dab.x,y:dab.y},ends:[]};f.scratch.brushBehavior=prior
 const before=structuredClone(prior);expect(()=>f.prepare()).toThrow('size changed');expect(prior).toEqual(before);expect(f.ctx.openCanonicalBegin).not.toHaveBeenCalled();expect(f.gather.gather).not.toHaveBeenCalled()
})
it('ordinary141 preflights complete captured size identity before the existing behavior painter',()=>{
 const selected=resizedBrush();if(selected.bristle?.version!==2)throw Error('fixture')
 const{ink:_ink,soak:_soak,saturationLookup:_lookup,...geometry}=selected.bristle
 selected.version=141;selected.bristle={...geometry,version:1,initialization:{sourceSide:1,resizePolicy:'mask-population-v1'}}
 const paint=vi.fn(),painter=Object.assign(Object.create(BrushPainter.prototype),{behavior:{paint}})as BrushPainter,scratch={}as BehaviorScratch,target={}as ILayerBuffer,preset={sizeMultiplier:1}as PencilPreset,stamp={brush:selected,pressure:{size:true,opacity:true}}
 expect(()=>painter.paint(target,[dab],preset,stamp,[1,0,0],scratch,undefined)).toThrow();expect(paint).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBeUndefined()
 const first={...dab,sourceSize:4,sourceScale:1},prior=beginBrushBehavior(first);prior.previous=first;prior.bristle={ordinal:0,oldPressure:1,ends:[]};scratch.brushBehavior=prior;const before=structuredClone(prior)
 expect(()=>painter.paint(target,[{...first,sourceSize:8}],preset,stamp,[1,0,0],scratch,undefined)).toThrow('size changed');expect(paint).not.toHaveBeenCalled();expect(prior).toEqual(before)
 painter.paint(target,[first],preset,stamp,[1,0,0],scratch,undefined);expect(paint).toHaveBeenCalledOnce()
})
