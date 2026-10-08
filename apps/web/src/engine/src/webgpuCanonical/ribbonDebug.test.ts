import {describe,it,expect} from 'vitest'
import {ribbonDebugShaders} from '../../../../../../docs/qa/harness/728-native-end-to-end/ribbonDebug'
describe('ribbon interpolation diagnostic',()=>{
 it('changes only diagnostic coverage return, preserving original varying layout and geometry',()=>{
  for(let i=0;i<8;i++){const s=ribbonDebugShaders(i);expect(s.native).toContain('let p=floor(v.position*64.0+0.5)/64.0');expect(s.native).toContain('o.strength=v.strength;o.contact=v.contact');expect(s.native).toContain('let debugValue=floor');expect(s.gl).toContain('v_across');expect(s.gl).toContain('16777215.0')}
 })
 it('rejects unsupported diagnostic group',()=>expect(()=>ribbonDebugShaders(8)).toThrow())
})

import {sourceBlendAmounts} from '../../../../../../docs/qa/harness/728-native-end-to-end/scalarBlendOracle'
it('supplies identical F32 amounts straddling the measured source half-byte, while ideal final OVER stays below6.5',()=>{
 const [native,gl]=sourceBlendAmounts.map(Math.fround)
 expect(native*255).toBeLessThan(.5);expect(gl*255).toBeGreaterThan(.5)
 expect(6+249*native).toBeLessThan(6.5);expect(6+249*gl).toBeLessThan(6.5)
})
import {noisePointShaders} from '../../../../../../docs/qa/harness/728-native-end-to-end/noisePointOracle'
it('supplied noise coordinate oracle has no interpolated varying and keeps literal lattice',()=>{
 for(let i=0;i<14;i++){const s=noisePointShaders(i);expect(s.native).toContain('var<uniform> point:vec4f');expect(s.native).toContain('textureLoad(noiseTex');expect(s.gl).toContain('uniform vec2 p');expect(s.gl).toContain('mod(p, 251.0)');expect(s.gl).not.toContain('varying')}
})

it('explicit FMA changes only diagnostic second-octave expression',()=>{expect(noisePointShaders(13).native).toContain('wcNoise(fma(point.xy,vec2f(2.7),vec2f(31.4,17.9)))');expect(noisePointShaders(13).gl).toContain('wcFbm(p)')})
