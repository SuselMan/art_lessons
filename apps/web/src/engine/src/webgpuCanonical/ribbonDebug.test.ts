import {describe,it,expect} from 'vitest'
import {ribbonDebugShaders} from '../../../../../../docs/qa/harness/728-native-end-to-end/ribbonDebug'
describe('ribbon interpolation diagnostic',()=>{
 it('changes only diagnostic coverage return, preserving original varying layout and geometry',()=>{
  for(let i=0;i<4;i++){const s=ribbonDebugShaders(i);expect(s.native).toContain('let p=floor(v.position*64.0+0.5)/64.0');expect(s.native).toContain('o.strength=v.strength;o.contact=v.contact');expect(s.native).toContain('let debugValue=floor');expect(s.gl).toContain('v_across');expect(s.gl).toContain('16777215.0')}
 })
 it('rejects unsupported diagnostic group',()=>expect(()=>ribbonDebugShaders(4)).toThrow())
})
