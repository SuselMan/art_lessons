import{it,expect,vi,afterEach}from'vitest'
import{compactHistoricalLayer}from'./src/buffers/HistoricalProjectionSource'
import type{HistoricalProjectionSource}from'./src/buffers/HistoricalProjectionSource'
import{createTestEngine,paperReady,makeLayerAdd,makeStroke,dab}from'./testing/engineTestUtils'
vi.mock('./src/buffers/HistoricalProjectionSource',()=>({compactHistoricalLayer:vi.fn()}))
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks()})
const copy=()=>({resolveVisible:vi.fn(()=>[]),allResident:vi.fn(()=>[]),destroy:vi.fn()})
async function setup(){
 const{engine}=createTestEngine({userId:'A'},{width:64,height:64});await paperReady(engine)
 engine.appendOperation(makeLayerAdd('A','L'),'remote')
 for(const x of[10,20,30])engine.appendOperation(makeStroke('A','L',[dab(x,20,{size:6})]),'remote')
 engine['_rebuildLayer']('L')
 const current=engine['_layers'].get('L')!,ops=engine['_log'].layerPixelOps('L')
 const store={cache:new Map<string,{buffer:HistoricalProjectionSource;bytes:number}>(),bytes:0}
 return{engine,current,ops,scope:{beforeSeq:10000,target:current,layerId:'target',store}}
}
it('trusted completed rebuild is copied independently without full replay; cached copy never destroys current',async()=>{
 const s=await setup(),c=copy();vi.mocked(compactHistoricalLayer).mockReturnValue({buffer:c,bytes:16})
 const replay=vi.spyOn(s.engine as unknown as {_replayInto():void},'_replayInto'),destroy=vi.spyOn(s.current,'destroy')
 try{expect(s.engine['_historicalProjectionLayer'](s.scope,'L')).toBe(c);expect(replay).not.toHaveBeenCalled();expect(destroy).not.toHaveBeenCalled();s.engine['_releaseProjectionScope'](s.scope);expect(c.destroy).toHaveBeenCalledTimes(1);expect(destroy).not.toHaveBeenCalled()}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('no-gain source is not borrowed: retains ordinary historical replay fallback',async()=>{
 const s=await setup();vi.mocked(compactHistoricalLayer).mockReturnValue(null);const replay=vi.spyOn(s.engine as unknown as {_replayInto():void},'_replayInto')
 try{expect(s.engine['_historicalProjectionLayer'](s.scope,'L')).not.toBe(s.current);expect(replay).toHaveBeenCalledTimes(1);s.engine['_releaseProjectionScope'](s.scope)}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('missing proof, future prefix or changed middle identity rejects reuse',async()=>{
 const s=await setup();try{
  expect(s.engine['_copyRebuiltProjection']('L',s.ops.slice(0,-1))).toBeUndefined()
  const changed=s.ops.map((op,i)=>i===1?{...op,id:'different-middle'}:op)
  expect(s.engine['_copyRebuiltProjection']('L',changed)).toBeUndefined()
  s.engine['_rebuiltProjectionProofs'].delete(s.current)
  expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();expect(compactHistoricalLayer).not.toHaveBeenCalled()
 }finally{s.engine.destroy()}
})
it('an unrecorded real tile write invalidates provenance even with unchanged operation IDs',async()=>{
 const s=await setup();try{const tile=s.current.allResident()[0];tile.buffer.beginDraw();tile.buffer.endDraw();expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();expect(compactHistoricalLayer).not.toHaveBeenCalled()}finally{s.engine.destroy()}
})
it('support metadata changes reject unchanged buffer/revision; dependency-unsettled rejects before copy',async()=>{
 const s=await setup();try{s.current.markContentPainted({minX:0,minY:0,maxX:64,maxY:64});expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();s.engine['_unsettledLayers'].add('L');expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();expect(compactHistoricalLayer).not.toHaveBeenCalled()}finally{s.engine.destroy()}
})
it('pending, live, repair, nested-isolation and settled-ambiguity guards forbid reuse',async()=>{
 const s=await setup();try{
  s.engine['_pendingRebuilds'].add('L');expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();s.engine['_pendingRebuilds'].delete('L')
  s.engine['_strokeLayerId']='L';expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();s.engine['_strokeLayerId']=null
  s.engine['_snapshotDependentLayers'].set('L',new Set());expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();s.engine['_snapshotDependentLayers'].delete('L')
  s.engine['_historicalSourceDepth']=1;expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();s.engine['_historicalSourceDepth']=0
  const pending=vi.spyOn(s.engine['_snapshotIO'],'hasAmbiguousPending').mockReturnValue(true);expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();pending.mockRestore()
  expect(compactHistoricalLayer).not.toHaveBeenCalled()
 }finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('known missing snapshot coverage never mints a completed-rebuild proof',async()=>{
 const s=await setup();try{s.engine['_rebuiltProjectionProofs'].delete(s.current);vi.spyOn(s.engine['_snapshots'],'hasCoverage').mockReturnValue(true);vi.spyOn(s.engine['_checkpoints'],'hasSnapshotFor').mockReturnValue(false);s.engine['_rememberRebuiltProjection']('L',s.ops);expect(s.engine['_rebuiltProjectionProofs'].has(s.current)).toBe(false)}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('copy failure preserves undefined and never retires borrowed current',async()=>{
 const s=await setup(),destroy=vi.spyOn(s.current,'destroy');vi.mocked(compactHistoricalLayer).mockImplementation(()=>{throw undefined});let caught=false
 try{try{s.engine['_copyRebuiltProjection']('L',s.ops)}catch(error){caught=true;expect(error).toBeUndefined()}expect(caught).toBe(true);expect(destroy).not.toHaveBeenCalled()}finally{vi.restoreAllMocks();s.engine.destroy()}
})
it('post-copy source mutation discards independent copy and falls back, never publishes stale bytes',async()=>{
 const s=await setup(),c=copy();vi.mocked(compactHistoricalLayer).mockImplementation(()=>{s.current.allResident()[0].buffer.clear();return{buffer:c,bytes:16}})
 try{expect(s.engine['_copyRebuiltProjection']('L',s.ops)).toBeUndefined();expect(c.destroy).toHaveBeenCalledTimes(1);expect(s.scope.store.cache.size).toBe(0)}finally{s.engine.destroy()}
})
it('validated swap ops cannot silently become a different full prefix at proof publication',async()=>{
 const s=await setup();try{s.engine['_rebuiltProjectionProofs'].delete(s.current);s.engine['_rememberRebuiltProjection']('L',s.ops.slice(0,-1));expect(s.engine['_rebuiltProjectionProofs'].has(s.current)).toBe(false)}finally{s.engine.destroy()}
})

it('normal suspended dependency-history rebuild can issue proof before a later root projection query',async()=>{
 const s=await setup(),c=copy();vi.mocked(compactHistoricalLayer).mockReturnValue({buffer:c,bytes:16})
 try{
  s.engine['_rebuiltProjectionProofs'].delete(s.current)
  s.engine.suspendDisplay()
  try{await s.engine.restoreHistoricalOperations(s.ops)}finally{s.engine.resumeDisplay()}
  expect(s.engine['_opQueue']).toHaveLength(0);expect(s.engine['_historicalSourceDepth']).toBe(0)
  expect(s.engine['_rebuiltProjectionProofs'].has(s.current)).toBe(true)
  const replay=vi.spyOn(s.engine as unknown as {_replayInto():void},'_replayInto')
  expect(s.engine['_historicalProjectionLayer'](s.scope,'L')).toBe(c);expect(replay).not.toHaveBeenCalled()
  s.engine['_releaseProjectionScope'](s.scope)
 }finally{vi.restoreAllMocks();s.engine.destroy()}
})
