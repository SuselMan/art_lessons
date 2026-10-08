import {expect,it,vi} from 'vitest'
import {createTestEngine} from '../../testing/engineTestUtils'
import {configureWatercolorDiagnosticOwners,validateWatercolorDiagnosticBackend} from './watercolorDiagnosticOwners'
it('OFF defaults do not warm or mutate diagnostic owners',()=>{
 const passes={warmBrushMrt:vi.fn(),diagnosticBrushMrt:false},queue={frontBatchEnabled:false}
 configureWatercolorDiagnosticOwners({},passes,queue);expect(passes.warmBrushMrt).not.toHaveBeenCalled();expect(queue.frontBatchEnabled).toBe(false);expect(passes.diagnosticBrushMrt).toBe(false)
})
it('MRT requires WebGL2 and successful capability warm; no silent front fallback',()=>{
 expect(()=>validateWatercolorDiagnosticBackend({diagnosticBrushMrt:true})).toThrow('requires WebGL2')
 const passes={warmBrushMrt:vi.fn(()=>false),diagnosticBrushMrt:false},queue={frontBatchEnabled:false}
 expect(()=>configureWatercolorDiagnosticOwners({diagnosticWebgl2:true,diagnosticBrushMrt:true,diagnosticFrontBatch:true},passes,queue)).toThrow('unavailable')
 expect(passes.diagnosticBrushMrt).toBe(false);expect(queue.frontBatchEnabled).toBe(false)
 passes.warmBrushMrt.mockReturnValue(true);configureWatercolorDiagnosticOwners({diagnosticWebgl2:true,diagnosticBrushMrt:true,diagnosticFrontBatch:true},passes,queue)
 expect(passes.diagnosticBrushMrt).toBe(true);expect(queue.frontBatchEnabled).toBe(true)
})

it('actual engine constructor wires front only and rejects MRT without GL2',()=>{
 const plain=createTestEngine(),batched=createTestEngine({diagnosticFrontBatch:true})
 try{
  const flags=(engine:unknown)=>(engine as {_settleQueue:{frontBatchEnabled:boolean;presentationBatchEnabled:boolean;contactBatchEnabled:boolean}})._settleQueue
  expect(flags(plain.engine).frontBatchEnabled).toBe(false);expect(flags(batched.engine).frontBatchEnabled).toBe(true)
  expect(flags(batched.engine).presentationBatchEnabled).toBe(false);expect(flags(batched.engine).contactBatchEnabled).toBe(false)
  expect(()=>createTestEngine({diagnosticBrushMrt:true})).toThrow('requires WebGL2')
 }finally{plain.engine.destroy();batched.engine.destroy()}
})
