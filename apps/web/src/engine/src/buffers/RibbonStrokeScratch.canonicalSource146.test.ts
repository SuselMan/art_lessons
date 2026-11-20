import{it,expect,vi}from'vitest'
import{RibbonStrokeScratch,freeScratchSnapshot}from'./RibbonStrokeScratch'
import{RibbonScratchPool}from'./RibbonScratchPool'
import{MockGL}from'../../testing/mockGL'
import type{CanonicalBeginSource}from'../dabs/CanonicalBeginSource'
import type{ILayerBuffer}from'./ILayerBuffer'
it('snapshot/restore and parked clones retain immutable source handles, releasing each owner exactly once',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,pool=new RibbonScratchPool(gl),scratch=new RibbonStrokeScratch(pool,false,false);let refs=0
 const make=():CanonicalBeginSource=>{refs++;let live=true;return{retain:vi.fn(()=>{if(!live)throw Error('dead');return make()}),release:vi.fn(()=>{if(live){live=false;refs--}})}as unknown as CanonicalBeginSource}
 scratch.canonicalSource=make();const snap=scratch.snapshot(gl,()=>null)!;expect(refs).toBe(2)
 const restored=RibbonStrokeScratch.restore(pool,snap,{}as ILayerBuffer);expect(refs).toBe(3);freeScratchSnapshot(snap);expect(refs).toBe(2)
 const parked=scratch.spill(()=>null)!;expect(refs).toBe(3);scratch.destroy();expect(refs).toBe(2)
 const unparked=RibbonStrokeScratch.unspill(pool,parked,{}as ILayerBuffer)!;expect(refs).toBe(2);restored.forget();expect(refs).toBe(1);unparked.destroy();expect(refs).toBe(0);scratch.destroy();expect(refs).toBe(0);pool.destroy()
})
it('source release throw undefined does not strand owned snapshot buffers',()=>{
 const destroy=vi.fn(),release=vi.fn(()=>{throw undefined}),snap={canonicalSource:{release},tiles:[{bufs:{original:{destroy}}}]}as unknown as Parameters<typeof freeScratchSnapshot>[0]
 let caught=false;try{freeScratchSnapshot(snap)}catch(error){caught=true;expect(error).toBeUndefined()}
 expect(caught).toBe(true);expect(destroy).toHaveBeenCalledTimes(1);expect(snap.canonicalSource).toBeUndefined()
})
