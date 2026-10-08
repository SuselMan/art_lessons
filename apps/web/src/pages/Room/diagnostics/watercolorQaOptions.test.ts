import {expect,it} from 'vitest'
import {watercolorQaOptions} from './watercolorQaOptions'
it('solver batching is OFF unless exact explicit DEV query is enabled',()=>{
 for(const query of ['', '?qaSolverBatch=0','?qaSolverBatch=true','?qaBandBatch=1'])expect(watercolorQaOptions(true,undefined,undefined,query).diagnosticSolverBatch).toBe(false)
 expect(watercolorQaOptions(true,undefined,undefined,'?qaSolverBatch=1').diagnosticSolverBatch).toBe(true)
 expect(watercolorQaOptions(false,undefined,undefined,'?qaSolverBatch=1').diagnosticSolverBatch).toBe(false)
})
