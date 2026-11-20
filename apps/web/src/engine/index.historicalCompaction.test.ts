import{it,expect,vi,afterEach}from'vitest'
import{compactHistoricalLayer}from'./src/buffers/HistoricalProjectionSource'
import type{ILayerBuffer}from'./src/buffers/ILayerBuffer'
import type{HistoricalProjectionSource}from'./src/buffers/HistoricalProjectionSource'
import{createTestEngine,paperReady}from'./testing/engineTestUtils'
vi.mock('./src/buffers/HistoricalProjectionSource',()=>({compactHistoricalLayer:vi.fn()}))
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks()})
async function setup(){
 const{engine}=createTestEngine({userId:'A'},{width:32,height:32});await paperReady(engine)
 const fresh=engine['_makeLayerBuffer'](),destroy=vi.spyOn(fresh,'destroy'),forget=vi.spyOn(engine as unknown as {_forgetWashesOf(target:ILayerBuffer):void},'_forgetWashesOf')
 vi.spyOn(engine as unknown as {_makeLayerBuffer():ILayerBuffer},'_makeLayerBuffer').mockReturnValue(fresh)
 vi.spyOn(engine as unknown as {_replayInto():void},'_replayInto').mockImplementation(()=>{})
 const store={cache:new Map<string,{buffer:HistoricalProjectionSource;bytes:number;replayTarget?:ILayerBuffer}>(),bytes:0,pinned:new Set<HistoricalProjectionSource>()}
 const scope={beforeSeq:100,target:fresh,layerId:'target',store}
 return{engine,fresh,destroy,forget,scope}
}
const copy=()=>({resolveVisible:vi.fn(()=>[]),allResident:vi.fn(()=>[]),destroy:vi.fn()})
it('retains original full identity when helper reports no gain; full cleanup forgets solver ownership',async()=>{
 const s=await setup();vi.mocked(compactHistoricalLayer).mockReturnValue(null)
 try{expect(s.engine['_historicalProjectionLayer'](s.scope,'L')).toBe(s.fresh);expect(s.destroy).not.toHaveBeenCalled();s.engine['_releaseProjectionScope'](s.scope);expect(s.forget).toHaveBeenCalledWith(s.fresh);expect(s.destroy).toHaveBeenCalledTimes(1)}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('publishes independent compact identity only after full retirement; cache hit does not replay or recopy',async()=>{
 const s=await setup(),c=copy();vi.mocked(compactHistoricalLayer).mockReturnValue({buffer:c,bytes:16})
 try{expect(s.engine['_historicalProjectionLayer'](s.scope,'L')).toBe(c);expect(s.destroy).toHaveBeenCalledTimes(1);expect(s.scope.store.bytes).toBe(16);expect(s.engine['_historicalProjectionLayer'](s.scope,'L')).toBe(c);expect(compactHistoricalLayer).toHaveBeenCalledTimes(1);s.forget.mockClear();s.engine['_releaseProjectionScope'](s.scope);expect(s.forget).not.toHaveBeenCalled();expect(c.destroy).toHaveBeenCalledTimes(1)}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('copy failure retires full fresh without publication and preserves thrown undefined',async()=>{
 const s=await setup();vi.mocked(compactHistoricalLayer).mockImplementation(()=>{throw undefined});let caught=false
 try{try{s.engine['_historicalProjectionLayer'](s.scope,'L')}catch(e){caught=true;expect(e).toBeUndefined()}expect(caught).toBe(true);expect(s.destroy).toHaveBeenCalledTimes(1);expect(s.scope.store.cache.size).toBe(0)}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('forget failure still destroys full and unpublished compact copy, preserving primary error',async()=>{
 const s=await setup(),c=copy(),error=Error('forget');vi.mocked(compactHistoricalLayer).mockReturnValue({buffer:c,bytes:16});s.forget.mockImplementation(()=>{throw error})
 try{expect(()=>s.engine['_historicalProjectionLayer'](s.scope,'L')).toThrow(error);expect(s.destroy).toHaveBeenCalledTimes(1);expect(c.destroy).toHaveBeenCalledTimes(1);expect(s.scope.store.bytes).toBe(0)}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('pinned compact source survives admission and overcapacity candidate is independently retired',async()=>{
 const s=await setup(),held=copy(),c=copy();s.scope.store.cache.set('held',{buffer:held,bytes:64*1024*1024});s.scope.store.bytes=64*1024*1024;s.scope.store.pinned.add(held);vi.mocked(compactHistoricalLayer).mockReturnValue({buffer:c,bytes:16})
 try{expect(()=>s.engine['_historicalProjectionLayer'](s.scope,'L')).toThrow();expect(held.destroy).not.toHaveBeenCalled();expect(c.destroy).toHaveBeenCalledTimes(1);expect(s.scope.store.cache.size).toBe(1);expect(s.scope.store.bytes).toBe(64*1024*1024)}finally{s.engine['_releaseProjectionScope'](s.scope);s.engine.destroy()}
})
it('isolated cleanup failure after copy retires unpublished candidate instead of publishing it',async()=>{
 const s=await setup(),c=copy(),error=Error('isolated cleanup');vi.mocked(compactHistoricalLayer).mockReturnValue({buffer:c,bytes:16});vi.spyOn(s.engine as unknown as {_withHistoricalSourceReplay<T>(work:()=>T):T},'_withHistoricalSourceReplay').mockImplementation(work=>{work();throw error})
 try{expect(()=>s.engine['_historicalProjectionLayer'](s.scope,'L')).toThrow(error);expect(c.destroy).toHaveBeenCalledTimes(1);expect(s.destroy).toHaveBeenCalledTimes(1);expect(s.scope.store.cache.size).toBe(0)}finally{vi.restoreAllMocks();s.engine.destroy()}
})

it('finite16MiB eviction removes entry/accounting before failing forget; destroys all owners and preserves undefined',async()=>{
 const s=await setup(),c=copy(),held=Object.create(s.fresh) as ILayerBuffer
 // Distinct full replay owner: cached target has no dependency on candidate fresh.
 const heldBuffer={resolveVisible:vi.fn(()=>[]),allResident:vi.fn(()=>[]),destroy:vi.fn()}
 const budget=16*1024*1024
 s.engine['_gpuBudget']=budget
 s.scope.store.cache.set('retired',{buffer:heldBuffer,bytes:budget,replayTarget:held})
 s.scope.store.bytes=budget
 vi.mocked(compactHistoricalLayer).mockReturnValue({buffer:c,bytes:16})
 s.forget.mockImplementation(target=>{if(target===held)throw undefined})
 let caught=false
 try{
  try{s.engine['_historicalProjectionLayer'](s.scope,'L')}catch(error){caught=true;expect(error).toBeUndefined()}
  expect(caught).toBe(true);expect(heldBuffer.destroy).toHaveBeenCalledTimes(1)
  expect(s.scope.store.cache.size).toBe(0);expect(s.scope.store.bytes).toBe(0)
  expect(c.destroy).toHaveBeenCalledTimes(1);expect(s.destroy).toHaveBeenCalledTimes(1)
 }finally{vi.restoreAllMocks();s.engine.destroy()}
})
