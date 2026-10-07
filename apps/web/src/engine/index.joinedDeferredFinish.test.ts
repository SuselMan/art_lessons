import { afterEach, expect, it, vi } from 'vitest'
import type { PencilEngine } from './index'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd } from './testing/engineTestUtils'
const engines: PencilEngine[]=[]
afterEach(()=>{for(const e of engines.splice(0)) if(!e['_destroyed'])e.destroy()})
async function setup(enabled=true){
 const {engine:e}=createTestEngine({userId:'deferred'}, {width:64,height:64});engines.push(e)
 e.appendOperation(makeLayerAdd('deferred','L'));e.setCompositeOrder([{id:'L',opacity:1}]);e.setActiveLayer('L');await paperReady(e)
 e.setTool('watercolor');e.setPencil('normal:100:100:PB29:round');e.setSize(8)
 e['_wcJoinedTouch']=true;e['_wcJoinedFinishDeferred']=enabled
 simulateStroke(e,[{x:8,y:32},{x:24,y:32},{x:40,y:32}]);expect(e['_settle']).not.toBeNull()
 const job=e['_settle']!;simulateStrokeStart(e,24,32);simulateStrokeMove(e,48,32)
 expect(e['_settle']).toBe(job)
 return {e,job}
}
it('OFF keeps the UP barrier; diagnostic ON captures one immutable finish and does not drain OLD at UP',async()=>{
 for(const enabled of [false,true]){
 const {e,job}=await setup(enabled),drain=vi.spyOn(e as unknown as {_completeSettle():void},'_completeSettle')
 simulateStrokeEnd(e,48,32)
 expect(drain.mock.calls.length>0).toBe(!enabled)
 if(enabled){expect(e['_settle']).toBe(job);expect(e['_wcJoinedDeferred']?.job).toBe(job);expect(e['_wcAsyncOwners'].get(job.scratch)).toBe(1);expect(e['_wcAsyncFinish']).toBe(false);expect(e['_wcMaterialPresentation']).toBe(false)}
 }
})
it('natural old completion/source rebase precedes owned future prepare exactly once and keeps captured preset/color immutable',async()=>{
 const {e,job}=await setup(),scratch=job.scratch
 simulateStrokeEnd(e,48,32);const held=e['_wcJoinedDeferred']!;expect(held).not.toBeNull()
 const savedColor=[...held.finish.finish!.color],savedBounds={...held.finish.finish!.bounds}
 e.setColor([1,0,0]);e['_strokeColor'].fill(0); // Settings are later UI state, not physical finish metadata.
 const finish=vi.spyOn(e as unknown as {_finishRibbonStroke:typeof e['_finishRibbonStroke']},'_finishRibbonStroke')
 const drain=vi.spyOn(e as unknown as {_completeSettle():void},'_completeSettle')
 let advances=0;while(e['_settle']===job && advances++<20000)e['_advanceSettle']()
 expect(advances).toBeGreaterThan(1);expect(advances).toBeLessThan(20000);expect(drain).not.toHaveBeenCalled()
 expect(finish).toHaveBeenCalledExactlyOnceWith(scratch,true,true,false,held.finish)
 expect(e['_settle']).not.toBe(job);expect(e['_settle']?.scratch).toBe(scratch);expect(e['_wcJoinedDeferred']).toBeNull()
 expect(held.finish.finish!.color).toEqual(savedColor);expect(held.finish.finish!.bounds).toEqual(savedBounds)
 expect(scratch.trackRunningSource).toBe(false);expect(e['_wcAsyncOwners'].has(scratch)).toBe(false)
 e['_resumeJoinedDeferred'](job);expect(finish).toHaveBeenCalledOnce()
 e['_completeSettle']()
})
it('pending future blocks every publication, while explicit complete/third touch drains the ordered successor',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32)
 expect(await e.exportPNG(true)).toBeNull();expect(await e.exportReviewImage()).toBeNull();expect(await e.bakePreview()).toBeNull();expect(e.bakeLayerByFullReplay('L')).toBeNull()
 const cp=vi.spyOn(e['_layers'].get('L')!,'allResident');e['_takeCheckpoint']('L');expect(cp).not.toHaveBeenCalled()
 const drain=vi.spyOn(e as unknown as {_completeSettle():void},'_completeSettle')
 simulateStrokeStart(e,48,32);expect(drain).toHaveBeenCalled();expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_settle']).not.toBe(job)
 simulateStrokeEnd(e,56,32);e['_completeSettle']()
})
it('cancel retires future owner once, marks accepted layer for journal recovery, and stale old callback cannot prepare future',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);const scratch=job.scratch
 const accepted=e.getOperations().map(op=>op.id),finish=vi.spyOn(e as unknown as {_finishRibbonStroke:typeof e['_finishRibbonStroke']},'_finishRibbonStroke')
 e['_cancelSettle']();expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_unsettledLayers'].has('L')).toBe(true);expect(e['_wcAsyncOwners'].has(scratch)).toBe(false)
 const composite=vi.spyOn(e as unknown as {_drawRibbonCompositeRect:typeof e['_drawRibbonCompositeRect']},'_drawRibbonCompositeRect');job.complete();e['_resumeJoinedDeferred'](job);expect(composite).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();expect(e.getOperations().map(op=>op.id)).toEqual(accepted)
})

it('ordered UI paper_dry drains predecessor and owned future before closing the wash, without async mode',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);const accepted=e.getOperations().filter(op=>op.type==='stroke').map(op=>op.id)
 expect(accepted).toHaveLength(2);e.appendOperation({type:'paper_dry',id:'ordered-dry',userId:'deferred',timestamp:Date.now()},'local')
 expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_settle']).toBeNull();expect(e['_wash']?.endedAt).toBe(-Infinity)
 expect(e.getOperations().filter(op=>op.type==='stroke').map(op=>op.id)).toEqual(accepted);expect(e.getOperations().at(-1)?.type).toBe('paper_dry');expect(e['_wcAsyncOwners'].has(job.scratch)).toBe(false)
})

it('old completion error releases held finish and blocks all publication until actual authoritative replay',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);const scratch=job.scratch
 const prepare=vi.spyOn(e as unknown as {_resumeJoinedDeferred:typeof e['_resumeJoinedDeferred']},'_resumeJoinedDeferred')
 // Throw from a real old complete's canonical composite, before successor resume.
 const composite=vi.spyOn(e as unknown as {_drawRibbonCompositeRect:typeof e['_drawRibbonCompositeRect']},'_drawRibbonCompositeRect').mockImplementationOnce(()=>{throw Error('old composite failure')})
 expect(()=>e['_completeSettle']()).toThrow(/old composite failure/);expect(prepare).not.toHaveBeenCalled();expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_wcAsyncOwners'].has(scratch)).toBe(false)
 expect(e['_wcJoinedDeferredError']).toBeInstanceOf(Error);expect(e['_wcJoinedRecoveryLayers'].has('L')).toBe(true)
 expect(await e.exportPNG(true)).toBeNull();expect(await e.exportReviewImage()).toBeNull();expect(await e.bakePreview()).toBeNull();expect(e.bakeNetworkSnapshot('L')).toBeNull();expect(e.bakeLayerByFullReplay('L')).toBeNull()
 composite.mockRestore();e['_rebuildLayer']('L');let steps=0;while(e['_rebuildJobs'].has('L') && steps++<2000){const r=e['_rebuildJobs'].get('L')!;clearTimeout(r.timer);e['_stepRebuildJob'](r)};expect(steps).toBeLessThan(2000);expect(e['_wcJoinedRecoveryLayers'].has('L')).toBe(false);expect(e['_wcJoinedDeferredError']).toBeNull()
})

it('solver unit throw before complete aborts held finish, retires its owner, and blocks publication',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);job.ops[job.next]=()=>{throw Error('solver unit failure')}
 expect(()=>e['_advanceSettle']()).toThrow(/solver unit failure/);expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_wcAsyncOwners'].has(job.scratch)).toBe(false);expect(e['_wcJoinedDeferredError']).toBeInstanceOf(Error)
 expect(await e.exportPNG(true)).toBeNull();expect(e.bakeNetworkSnapshot('L')).toBeNull();expect(e['_unsettledLayers'].has('L')).toBe(true)
})

it('owned future prepare consumes the newly folded cumulative dryCtx, not the old captured bounds',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);const held=e['_wcJoinedDeferred']!
 const previousDry={...held.finish.dryCtx!.bounds},prepare=vi.spyOn(e['_settlePlan'],'prepare')
 let n=0;while(e['_settle']===job && n++<20000)e['_advanceSettle']()
 expect(prepare).toHaveBeenCalledOnce();const args=prepare.mock.calls[0],metadata=args[12]!
 expect(metadata.dryCtx).not.toBe(job.scratch.dryCtx);expect(metadata.dryCtx!.target).toBe(job.scratch.dryCtx!.target)
 expect(metadata.dryCtx!.bounds).toEqual(job.scratch.dryCtx!.bounds);expect(metadata.dryCtx!.radiusPx).toBe(job.scratch.dryCtx!.radiusPx);expect(metadata.dryCtx!.standing).toBe(job.scratch.dryCtx!.standing)
 expect(held.finish.dryCtx!.bounds).toEqual(previousDry);expect(metadata.finish!.bounds).toEqual(held.finish.finish!.bounds);e['_completeSettle']()
})

it('actual context-loss callback retires held finish without replaying it and retains accepted operation IDs',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);const ids=e.getOperations().map(op=>op.id)
 const finish=vi.spyOn(e as unknown as {_finishRibbonStroke:typeof e['_finishRibbonStroke']},'_finishRibbonStroke'),composite=vi.spyOn(e as unknown as {_drawRibbonCompositeRect:typeof e['_drawRibbonCompositeRect']},'_drawRibbonCompositeRect')
 e['_handleContextLost']({preventDefault:vi.fn()} as unknown as Event);expect(e['_contextLost']).toBe(true);expect(e['_wcJoinedDeferred']).toBeNull();expect(e['_wcAsyncOwners'].has(job.scratch)).toBe(false)
 job.complete();expect(finish).not.toHaveBeenCalled();expect(composite).not.toHaveBeenCalled();expect(e.getOperations().map(op=>op.id)).toEqual(ids)
})

it('invalid future target blocks publication, checkpoint and cached bake until actual layer replay',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);const old=e['_layers'].get('L')!;e['_layers'].set('L',e['_makeLayerBuffer']('L'))
 try{let n=0;while(e['_settle']===job && n++<20000)e['_advanceSettle']();expect(e['_wcJoinedRecoveryLayers'].has('L')).toBe(true)
 expect(await e.exportPNG(true)).toBeNull();expect(await e.bakePreview()).toBeNull();expect(e.bakeNetworkSnapshot('L')).toBeNull();const tiles=vi.spyOn(e['_layers'].get('L')!,'allResident');e['_takeCheckpoint']('L');expect(tiles).not.toHaveBeenCalled()
 }finally{old.destroy()}
})
it('thrown null still marks recovery and cannot publish pending material',async()=>{
 const {e,job}=await setup();simulateStrokeEnd(e,48,32);job.ops[job.next]=()=>{throw null}
 try{e['_advanceSettle']();expect.fail('must throw')}catch(error){expect(error).toBeNull()}
 expect(e['_wcJoinedRecoveryLayers'].has('L')).toBe(true);expect(await e.exportPNG(true)).toBeNull();expect(e.bakeNetworkSnapshot('L')).toBeNull()
})
it('typed constructor option defaults OFF and cannot enable joined admission, async or provisional material by itself',()=>{
 for(const enabled of [undefined,true]){const {engine:e}=createTestEngine({joinedFinishDeferred:enabled},{width:64,height:64});engines.push(e)
 expect(e['_wcJoinedFinishDeferred']).toBe(enabled??false);expect(e['_wcJoinedTouch']).toBe(false);expect(e['_wcAsyncFinish']).toBe(false);expect(e['_wcMaterialPresentation']).toBe(false)}
})
