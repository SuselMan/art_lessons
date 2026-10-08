import {afterEach,expect,it,vi} from 'vitest'
import type {PencilEngine} from '../../../../apps/web/src/engine'
import {createTestEngine,makeLayerAdd,paperReady,simulateStroke,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from '../../../../apps/web/src/engine/testing/engineTestUtils'
const engines:PencilEngine[]=[]
afterEach(()=>{for(const e of engines.splice(0))if(!e['_destroyed'])e.destroy()})
async function setup(deferred:boolean){
 const {engine:e}=createTestEngine({userId:'mixed-deferred'},{width:64,height:64});engines.push(e)
 e.appendOperation(makeLayerAdd('mixed-deferred','L'));e.setCompositeOrder([{id:'L',opacity:1}]);e.setActiveLayer('L');await paperReady(e)
 e.setTool('watercolor');e.setSize(8);e.setPencil('normal:100:0:PB29:round');e['_wcJoinedTouch']=true;e['_wcJoinedTouchMixed']=true;e['_wcJoinedFinishDeferred']=deferred;e['_settleQueue'].diagnosticSolverBatchEnabled=true
 simulateStroke(e,[{x:8,y:32},{x:24,y:32},{x:40,y:32}]);const old=e['_settle']!;expect(old).not.toBeNull()
 e.setPencil('normal:100:100:PB29:round');e.setColor([.22,0,.6]);simulateStrokeStart(e,24,32);simulateStrokeMove(e,48,32)
 expect(e['_settle']).toBe(old);expect(e['_wcJoinedTouchLease']).toBe(old)
 return{e,old}
}
it('mixed water→pigment OFF drains UP; ON freezes pigment finish and retains old-water owner',async()=>{
 for(const enabled of [false,true]){const{e,old}=await setup(enabled);const drain=vi.spyOn(e as unknown as {_completeSettle():void},'_completeSettle');simulateStrokeEnd(e,48,32)
 expect(drain.mock.calls.length>0).toBe(!enabled)
 if(enabled){const held=e['_wcJoinedDeferred']!;expect(held.job).toBe(old);expect(held.finish.finish!.preset).toEqual({opacity:.99,hardness:.88,sizeMultiplier:1});expect(held.finish.finish!.profile.pigmentLevel).toBeGreaterThan(0);expect(e['_wcJoinedTouchInputs'].get(old)!.preset).toBe('normal:100:0:PB29:round');expect(e['_wcAsyncOwners'].get(old.scratch)).toBe(1);expect(e['_wcAsyncFinish']).toBe(false);expect(e['_wcMaterialPresentation']).toBe(false)}
 }
})
it('mixed natural completion prepares the captured successor once after later tool changes',async()=>{
 const{e,old}=await setup(true);simulateStrokeEnd(e,48,32);const held=e['_wcJoinedDeferred']!,saved=[...held.finish.finish!.color]
 e.setPencil('normal:20:5:PB29:round');e.setColor([1,0,0]);const finish=vi.spyOn(e as unknown as {_finishRibbonStroke:typeof e['_finishRibbonStroke']},'_finishRibbonStroke');let n=0;while(e['_settle']===old&&n++<20000)e['_advanceSettle']()
 expect(n).toBeLessThan(20000);expect(finish).toHaveBeenCalledExactlyOnceWith(old.scratch,true,true,false,held.finish);expect(held.finish.finish!.color).toEqual(saved);expect(held.finish.finish!.preset).toEqual({opacity:.99,hardness:.88,sizeMultiplier:1});expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_wcAsyncOwners'].has(old.scratch)).toBe(false);e['_completeSettle']()
})
it('mixed Dry drains both accepted strokes in order and releases held owner',async()=>{
 const{e,old}=await setup(true);simulateStrokeEnd(e,48,32);expect(await e.exportPNG(true)).toBeNull();const ids=e.getOperations().filter(o=>o.type==='stroke').map(o=>o.id)
 e.appendOperation({type:'paper_dry',id:'mixed-dry',userId:'mixed-deferred',timestamp:Date.now()},'local')
 expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_settle']).toBeNull();expect(e['_wcAsyncOwners'].has(old.scratch)).toBe(false);expect(e.getOperations().filter(o=>o.type==='stroke').map(o=>o.id)).toEqual(ids);expect(e.getOperations().at(-1)?.type).toBe('paper_dry')
})
it('mixed pending Undo releases future without accepting a stale completion',async()=>{
 const{e,old}=await setup(true);simulateStrokeEnd(e,48,32);const undo=e.undo();expect(undo).not.toBeNull();expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_wcAsyncOwners'].has(old.scratch)).toBe(false)
 const finish=vi.spyOn(e as unknown as {_finishRibbonStroke:typeof e['_finishRibbonStroke']},'_finishRibbonStroke');e['_resumeJoinedDeferred'](old);expect(finish).not.toHaveBeenCalled();expect(e.getOperations().some(o=>o.type==='operation_undo')).toBe(true)
})
