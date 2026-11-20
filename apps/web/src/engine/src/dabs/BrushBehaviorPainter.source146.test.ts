import{it,expect,vi}from'vitest'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import{spray133,dab133}from'../../../../../../packages/shared/src/sprayWash133.testFixture'
import type{CanonicalBeginRuntime}from'./CanonicalBeginRuntime'
import type{PencilPreset}from'../presets/pencilPresets'
it('direct consumer rejects missing source, wrong prefix and effective erase before scratch/state/GL access',()=>{
 const b=spray133();b.version=146;b.behavior!.rendering!.accumulation='directOver';Object.assign(b.spray!.color,{sampleInput:true,sourcePolicy:'canonical-begin-v1'})
 const painter=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter,target={resolveForPaint:vi.fn(()=>{throw Error('target accessed')}),markContentPainted:vi.fn()},scratch={getOrCreate:vi.fn(()=>{throw Error('scratch accessed')})}as unknown as BehaviorScratch
 const binding={layerId:'l',userId:'u',strokeId:'s',targetGeneration:1,prefixKey:'p',begin:{kind:'canonical' as const,firstOpId:'first',seq:1}},runtime={capability:'spray146',binding}as CanonicalBeginRuntime
 const paint=(erase=false,r=runtime)=>painter.paint(target,[dab133()],{sizeMultiplier:1}as PencilPreset,b,{size:false,opacity:false},[1,0,0],scratch,false,undefined,undefined,erase,r)
 expect(()=>paint()).toThrow('canonical BEGIN source')
 scratch.canonicalSource={target,capability:'spray146',binding:{...binding,prefixKey:'wrong'},assertCurrent:vi.fn()}as unknown as NonNullable<BehaviorScratch['canonicalSource']>
 expect(()=>paint()).toThrow('canonical BEGIN source')
 expect(()=>paint(true)).toThrow('canonical BEGIN source');expect(scratch.getOrCreate).not.toHaveBeenCalled();expect(target.resolveForPaint).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBeUndefined()
})
