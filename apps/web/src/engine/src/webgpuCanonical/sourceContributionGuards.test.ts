import {describe,it,expect} from 'vitest'
import {validateCoverageSubstitutions} from '../../../../../../docs/qa/harness/728-native-end-to-end/sourceContributionGuards'
describe('source-only faithful coverage admission',()=>{
 it('allows unchanged full sequence and bounded existing substitutions',()=>{
  expect(()=>validateCoverageSubstitutions(undefined,145,true)).not.toThrow()
  expect(()=>validateCoverageSubstitutions([],145,false)).not.toThrow()
  expect(()=>validateCoverageSubstitutions([37,44],145,false)).not.toThrow()
 })
 it('rejects ambiguous/different-input diagnostic before resource creation',()=>{
  for(const indices of [[37,37],[-1],[145],[.5]])expect(()=>validateCoverageSubstitutions(indices,145,false)).toThrow()
  expect(()=>validateCoverageSubstitutions([44],145,true)).toThrow()
 })
})
