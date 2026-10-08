import {describe,it,expect} from 'vitest'
import {CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/brush'
import {rawFlowControlShader} from './brushRawFlowControl'
describe('OFF raw flow orientation control',()=>{
 it('changes exactly the flow sample, keeps raw/fraction/floor/capacity/store intact',()=>{const old='return sampled(flow,local,true).rgb;',next='return textureSampleLevel(flow,linearClamp,local,0).rgb;';expect(rawFlowControlShader().replace(next,old)).toBe(CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL);expect(rawFlowControlShader()).toContain('P-=floor(ownP*give)');expect(rawFlowControlShader()).toContain('return amount*limit;')})
 it('mirrored rows/UV have same ideal interpolation for exact binary fractions',()=>{const raw=Array.from({length:26},(_,i)=>i*7+3),flipped=raw.slice().reverse(),sample=(a:number[],u:number)=>{const p=u*26-.5,k=Math.floor(p),t=p-k;return a[Math.min(25,Math.max(0,k))]*(1-t)+a[Math.min(25,Math.max(0,k+1))]*t};for(const u of [0,.125,.25,.5,.75,.875,1])expect(sample(raw,u)).toBe(sample(flipped,1-u))})
})
