import { it, expect, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { strokeDabs } from '@grafetto/shared'
import { createTestEngine } from '../../apps/web/src/engine/testing/engineTestUtils'
it('records real slice and source-field caller on the immutable hardware journal', () => {
 const op=JSON.parse(readFileSync('/home/suselman/projects/pencil-agents/728-plan-quantum/temp/contact-budget/surface-current-perf-loaded-journal.json','utf8'))[0]
 const {engine}=createTestEngine({paper:'flat',pageWidth:1754,pageHeight:2480},{width:512,height:512}),e=engine as any
 const frames:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.push(fn);return frames.length});vi.stubGlobal('cancelAnimationFrame',()=>{})
 let clock=1,currentAdvance=0;vi.spyOn(performance,'now').mockImplementation(()=>clock)
 vi.spyOn(e.gl,'finish').mockImplementation(()=>{clock+=5})
 e._sliceLimits.budgetMs=12;e._sliceLimits.size=1
 const records:any[]=[],slices:any[]=[]
 const oldField=e._watercolorPasses.fieldOp;e._watercolorPasses.fieldOp=function(...args:any[]){if(args[3]===1)records.push({advance:currentAdvance,mode:1,stack:new Error().stack});return oldField.apply(this,args)}
 const oldSlice=e._runSlice;e._runSlice=function(...args:any[]){const before=records.length;const result=oldSlice.apply(this,args);slices.push({advance:currentAdvance,mode1:records.length-before,result:{done:result.done,value:typeof result.value==='number'?result.value:null}});return result}
 try {
 e.setBaseLayers(['layer-1']);e.setActiveLayer('layer-1');e.setCompositeOrder([{id:'layer-1',opacity:1}]);e._wcSourceFilmRebase=true;e._settlePlan.lazyContacts=true;e._settlePlan.splitQuanta=true;e._ribbonPainter.diagnosticBandBatch=true
 e._paintOpOverFrames(e._layers.get('layer-1'),op,strokeDabs(op))
 const drawingOps=e._settleQueue.current?.ops;let steps=0;while(drawingOps&&e._settleQueue.current?.ops===drawingOps&&steps++<1500){currentAdvance++;e._settleQueue.advance()}
 expect(records.length).toBeGreaterThan(0);expect(slices.length).toBeGreaterThan(0);expect(records.every(r=>r.stack.includes('sourceField'))).toBe(true)
 writeFileSync('temp/presentation-batch/caller-oracle.json',JSON.stringify({scope:'CPU MockGL same immutable packed journal, forced short slices/flat paper; real source caller/order only, not GPU performance or same unit-boundary proof',steps,slices,records},null,2))
 }finally{engine.destroy();vi.restoreAllMocks();vi.unstubAllGlobals()}
})
