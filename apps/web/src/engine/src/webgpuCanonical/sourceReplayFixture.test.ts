import {expect,it} from 'vitest'
import fixture from '../../../../../../docs/qa/harness/728-native-end-to-end/sourceReplay.fixture.json'
import {replaySourceCoverage} from '../../../../../../docs/qa/harness/728-native-end-to-end/sourceReplay'
import type {StrokeOperation} from '@grafetto/shared'
const options={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
it('reconstructs original145 source commands and actual Surface captured9 uniforms exactly',()=>{
 const commands=replaySourceCoverage(fixture.operation as StrokeOperation,options)
 expect(commands).toHaveLength(145)
 expect(commands[9].kind).toBe('stamp')
 expect(commands[9].kind==='stamp'&&commands[9].stamp).toEqual(fixture.actualCaptured9)
})
it('rejects wet or other input rather than claiming general full-model replay',()=>{
 expect(()=>replaySourceCoverage({...fixture.operation,wet:'f'} as StrokeOperation,options)).toThrow(/dry-landing/)
 expect(()=>replaySourceCoverage({...fixture.operation,preset:'other'} as StrokeOperation,options)).toThrow(/fixture/)
})
